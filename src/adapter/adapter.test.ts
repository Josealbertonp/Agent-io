import { describe, expect, it, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Event } from '../contracts';
import { applyEvents, createInitialState, projectEvent } from '../domain';
import {
  parseMaestriListOutput,
  inferAgentStatus,
  normalizeMaestriWorkspace,
  computeStableSnapshotHash,
  diffSnapshots,
  generateDeterministicEventId,
  MaestriPoller,
  FakeWorkspaceSource,
  WorkspaceSnapshot,
  NormalizedAgentState,
  createInitialCheckpoint,
  capEmittedEventIds,
  mergeEmittedEventId,
  parseCheckpoint,
  serializeCheckpoint,
  EMITTED_EVENT_IDS_CAP,
} from './index';
import { saveCheckpointToFile, loadCheckpointFromFile } from './checkpoint.fs';

function agent(partial: Partial<NormalizedAgentState> & Pick<NormalizedAgentState, 'id' | 'name'>): NormalizedAgentState {
  return {
    workspaceId: partial.workspaceId ?? 'ws-1',
    provider: 'unknown',
    model: 'unknown',
    providerKnown: false,
    role: 'Agent',
    status: 'idle',
    statusConfidence: 'high',
    statusEvidence: 'test',
    position: { x: 0, y: 0 },
    ...partial,
  };
}

function snap(overrides: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  const base: WorkspaceSnapshot = {
    workspaceId: 'ws-1',
    timestamp: '2026-08-31T12:00:00.000Z',
    connectionStatus: 'connected',
    agents: {},
    rawHash: 'hash-0',
    ...overrides,
  };
  return base;
}

describe('Maestri Adapter (Etapa 2.1)', () => {
  describe('Parser & Normalizer', () => {
    it('parseia maestri list com name-only e com role na mesma linha', () => {
      const sampleCliOutput = `
You:
  - name: "Developer", role: "Implementador"

Connected agents:
  - name: "Sextante", role: "Planejador"
  - name: "Architect Prime"

Notes:
  - name: "Architecture Decision Record"

Portals:
  - name: "Local Webview"
`;

      const raw = parseMaestriListOutput(sampleCliOutput, 'ws-test');
      expect(raw.workspaceId).toBe('ws-test');
      expect(raw.selfName).toBe('Developer');
      expect(raw.selfRole).toBe('Implementador');
      expect(raw.connectedAgents).toHaveLength(2);
      expect(raw.connectedAgents[0]).toMatchObject({ name: 'Sextante', role: 'Planejador' });
      expect(raw.connectedAgents[1]).toMatchObject({ name: 'Architect Prime', role: undefined });
      expect(raw.notes).toHaveLength(1);
      expect(raw.portals).toHaveLength(1);
    });

    it('inferAgentStatus: default idle; palavras genéricas não mudam status; só marcador forte', () => {
      expect(inferAgentStatus('').status).toBe('idle');
      expect(inferAgentStatus('').statusConfidence).toBe('high');

      expect(inferAgentStatus('Build failed with syntax error').status).toBe('idle');
      expect(inferAgentStatus('Aguardando parecer dos revisores').status).toBe('idle');
      expect(inferAgentStatus('Writing code to src/adapter/parser.ts').status).toBe('idle');
      expect(inferAgentStatus('implement this feature and review the error').status).toBe('idle');
      expect(inferAgentStatus('implement this feature and review the error').statusConfidence).toBe('low');

      const spinning = inferAgentStatus('⠋ executing tool Read');
      expect(spinning.status).toBe('working');
      expect(spinning.statusConfidence).toBe('medium');
      expect(spinning.statusEvidence.length).toBeGreaterThan(0);

      const explicit = inferAgentStatus('status: working — agent is running');
      expect(explicit.status).toBe('working');

      const crashed = inferAgentStatus('agent crashed after tool');
      expect(crashed.status).toBe('error');
      expect(crashed.statusConfidence).toBe('medium');
    });

    it('normaliza role da CLI, provider/model unknown, self idle sem inferir no list inteiro', () => {
      const raw = parseMaestriListOutput(
        `You:\n  - name: "Developer", role: "Implementador"\nConnected agents:\n  - name: "Sextante", role: "Planejador"`,
        'ws-1'
      );
      raw.rawOutput = 'this list mentions implement review error planning writing';
      const normalized = normalizeMaestriWorkspace(raw);

      expect(normalized.agents['agent-developer']).toBeDefined();
      expect(normalized.agents['agent-developer'].role).toBe('Implementador');
      expect(normalized.agents['agent-developer'].status).toBe('idle');
      expect(normalized.agents['agent-developer'].statusEvidence).toBe('self-default-idle');
      expect(normalized.agents['agent-developer'].provider).toBe('unknown');
      expect(normalized.agents['agent-developer'].model).toBe('unknown');
      expect(normalized.agents['agent-developer'].providerKnown).toBe(false);

      expect(normalized.agents['agent-sextante'].role).toBe('Planejador');
      expect(normalized.agents['agent-sextante'].provider).toBe('unknown');
      expect(normalized.agents['agent-sextante'].model).toBe('unknown');
      expect(normalized.agents['agent-sextante'].providerKnown).toBe(false);
    });

    it('self não pisca: rawOutputs diferentes com palavras genéricas mantêm self idle', () => {
      const base = `You:\n  - name: "You"\nConnected agents:\n  - name: "CTO"`;
      const a = normalizeMaestriWorkspace({
        ...parseMaestriListOutput(base, 'ws-1'),
        rawOutput: `${base}\nimplement review error`,
      });
      const b = normalizeMaestriWorkspace({
        ...parseMaestriListOutput(base, 'ws-1'),
        rawOutput: `${base}\nplanning writing done`,
        capturedAt: '2099-01-01T00:00:00.000Z',
      });

      expect(a.agents['agent-you'].status).toBe('idle');
      expect(b.agents['agent-you'].status).toBe('idle');
      expect(a.rawHash).toBe(b.rawHash);
    });

    it('role ausente na CLI cai no fallback Agent — não inventa CTO/Developer pelo nome', () => {
      const raw = parseMaestriListOutput(
        `You:\n  - name: "Developer"\nConnected agents:\n  - name: "CTO"`,
        'ws-1'
      );
      const normalized = normalizeMaestriWorkspace(raw);
      expect(normalized.agents['agent-developer'].role).toBe('Agent');
      expect(normalized.agents['agent-cto'].role).toBe('Agent');
    });

    it('rawHash estável: dois raws que diferem só em capturedAt/sample geram o mesmo hash', () => {
      const list = `You:\n  - name: "Dev"\nConnected agents:\n  - name: "Sextante", role: "Planejador"`;
      const rawA = parseMaestriListOutput(list, 'ws-1');
      rawA.capturedAt = '2026-08-31T12:00:00.000Z';
      rawA.connectedAgents[0].terminalOutputSample = 'sample-A';
      rawA.connectedAgents[0].lastCheckedAt = '2026-08-31T12:00:01.000Z';

      const rawB = parseMaestriListOutput(list, 'ws-1');
      rawB.capturedAt = '2026-08-31T12:05:00.000Z';
      rawB.connectedAgents[0].terminalOutputSample = 'sample-B completamente diferente';
      rawB.connectedAgents[0].lastCheckedAt = '2026-08-31T12:05:01.000Z';

      const snapA = normalizeMaestriWorkspace(rawA);
      const snapB = normalizeMaestriWorkspace(rawB);
      expect(snapA.rawHash).toBe(snapB.rawHash);
      expect(snapA.rawHash).toBe(computeStableSnapshotHash(snapA));
    });
  });

  describe('Differ & eventId estável', () => {
    it('diff sem alterações → 0 eventos', () => {
      const snapshot = snap({
        agents: { 'agent-1': agent({ id: 'agent-1', name: 'Agent 1' }) },
        rawHash: 'same',
      });
      const { events } = diffSnapshots(snapshot, snapshot, 1);
      expect(events).toHaveLength(0);
    });

    it('currentTaskId ausente não gera task.* (CLI não expõe tarefas)', () => {
      const prev = snap({
        agents: { 'agent-dev': agent({ id: 'agent-dev', name: 'Developer', status: 'idle' }) },
      });
      const curr = snap({
        timestamp: '2026-08-31T12:01:00.000Z',
        agents: { 'agent-dev': agent({ id: 'agent-dev', name: 'Developer', status: 'working' }) },
        rawHash: 'hash-1',
      });

      const { events } = diffSnapshots(prev, curr, 1);
      expect(events.every((e) => !e.type.startsWith('task.'))).toBe(true);
      expect(events.some((e) => e.type === 'agent.status_changed')).toBe(true);
    });

    it('emite agent.connected e activity.started quando um agente aparece com atividade', () => {
      const prev = snap();
      const curr = snap({
        timestamp: '2026-08-31T12:01:00.000Z',
        agents: {
          'agent-dev': agent({
            id: 'agent-dev',
            name: 'Developer',
            status: 'working',
            currentActivity: 'executing',
          }),
        },
        rawHash: 'hash-1',
      });

      const { events } = diffSnapshots(prev, curr, 1);
      expect(events.map((e) => e.type)).toEqual(['agent.connected', 'activity.started']);
      expect(events[0].payload.currentActivity).toBe('executing');
      expect(events[0].payload.statusConfidence).toBe('high');
      expect(events[0].payload).not.toHaveProperty('metadata');
    });

    it('não injeta metadata de inferência em agent.connected nem agent.status_changed', () => {
      const connected = diffSnapshots(
        snap(),
        snap({
          timestamp: '2026-08-31T12:01:00.000Z',
          agents: {
            'agent-dev': agent({
              id: 'agent-dev',
              name: 'Developer',
              status: 'working',
              statusConfidence: 'low',
              statusEvidence: 'heuristic-idle',
            }),
          },
          rawHash: 'hash-1',
        }),
        1
      ).events.find((e) => e.type === 'agent.connected');

      expect(connected).toBeDefined();
      expect(connected!.payload).not.toHaveProperty('metadata');
      expect(connected!.payload.statusConfidence).toBe('low');
      expect(connected!.payload.statusEvidence).toBe('heuristic-idle');

      const statusChanged = diffSnapshots(
        snap({
          agents: { 'agent-dev': agent({ id: 'agent-dev', name: 'Developer', status: 'idle' }) },
        }),
        snap({
          timestamp: '2026-08-31T12:01:00.000Z',
          agents: {
            'agent-dev': agent({
              id: 'agent-dev',
              name: 'Developer',
              status: 'working',
              statusConfidence: 'medium',
              statusEvidence: 'working-activity',
            }),
          },
          rawHash: 'hash-1',
        }),
        1
      ).events.find((e) => e.type === 'agent.status_changed');

      expect(statusChanged).toBeDefined();
      expect(statusChanged!.payload).not.toHaveProperty('metadata');
      expect(statusChanged!.payload.statusConfidence).toBe('medium');
      expect(statusChanged!.payload.statusEvidence).toBe('working-activity');
    });

    it('mesmo diff lógico em timestamps diferentes → MESMO eventId', () => {
      const prev = snap({
        agents: { 'agent-dev': agent({ id: 'agent-dev', name: 'Developer', status: 'idle' }) },
      });
      const currA = snap({
        timestamp: '2026-08-31T12:01:00.000Z',
        agents: { 'agent-dev': agent({ id: 'agent-dev', name: 'Developer', status: 'working' }) },
        rawHash: 'a',
      });
      const currB = snap({
        timestamp: '2026-08-31T18:00:00.000Z',
        agents: { 'agent-dev': agent({ id: 'agent-dev', name: 'Developer', status: 'working' }) },
        rawHash: 'b',
      });

      const idA = diffSnapshots(prev, currA, 1).events[0].eventId;
      const idB = diffSnapshots(prev, currB, 1).events[0].eventId;
      expect(idA).toBe(idB);
      expect(idA).toBe(
        generateDeterministicEventId('agent.status_changed', 'agent-dev', 'ws-1', 'idle->working')
      );
    });

    it('emite agent.disconnected quando um agente some', () => {
      const prev = snap({
        agents: { 'agent-old': agent({ id: 'agent-old', name: 'Old Agent' }) },
      });
      const curr = snap({ timestamp: '2026-08-31T12:01:00.000Z', rawHash: 'hash-1' });
      const { events } = diffSnapshots(prev, curr, 1);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('agent.disconnected');
    });
  });

  describe('Domínio: ordem e duplicatas (via eventos do adapter)', () => {
    it('eventos fora de ordem entregues ao domínio → estado final correto', () => {
      const initial = snap();
      const withAgent = snap({
        timestamp: '2026-08-31T12:01:00.000Z',
        agents: {
          'agent-dev': agent({ id: 'agent-dev', name: 'Developer', status: 'idle' }),
        },
        rawHash: '1',
      });
      const working = snap({
        timestamp: '2026-08-31T12:02:00.000Z',
        agents: {
          'agent-dev': agent({ id: 'agent-dev', name: 'Developer', status: 'working' }),
        },
        rawHash: '2',
      });

      const connected = diffSnapshots(initial, withAgent, 1).events;
      const changed = diffSnapshots(withAgent, working, 10).events;
      const shuffled = [...changed, ...connected];

      let state = createInitialState();
      for (const event of shuffled) {
        state = projectEvent(state, event);
      }
      expect(state.agents['agent-dev']).toBeDefined();
      expect(state.agents['agent-dev'].status).toBe('working');
    });

    it('duplicata: mesmo eventId aplicado 2x → domínio não aplica de novo', () => {
      const prev = snap();
      const curr = snap({
        agents: { 'agent-dev': agent({ id: 'agent-dev', name: 'Developer' }) },
        rawHash: '1',
      });
      const { events } = diffSnapshots(prev, curr, 1);
      const once = applyEvents(createInitialState(), events);
      const twice = applyEvents(once, events);
      expect(twice.agents['agent-dev']).toEqual(once.agents['agent-dev']);
      expect(twice.seenEventIds.size).toBe(once.seenEventIds.size);
    });
  });

  describe('Poller: resume, dedupe, backoff numérico', () => {
    it('fast-path: mesmo rawHash evita diff e não emite', async () => {
      const snapshot = snap({
        agents: { 'agent-1': agent({ id: 'agent-1', name: 'A' }) },
        rawHash: computeStableSnapshotHash({
          connectionStatus: 'connected',
          agents: { 'agent-1': agent({ id: 'agent-1', name: 'A' }) },
        }),
      });
      snapshot.rawHash = computeStableSnapshotHash(snapshot);

      const source = new FakeWorkspaceSource(snapshot);
      const emitted: Event[] = [];
      const poller = new MaestriPoller(source, { intervalMs: 100, onEvents: (e) => emitted.push(...e) });

      const first = await poller.pollOnce();
      expect(first.length).toBeGreaterThan(0);

      source.snapshotToReturn = { ...snapshot, timestamp: '2026-08-31T13:00:00.000Z' };
      const second = await poller.pollOnce();
      expect(second).toHaveLength(0);
      expect(emitted).toHaveLength(first.length);
      poller.stop();
    });

    it('mesmo diff lógico em 2 ciclos → mesmo eventId; ponte não reenvia (emittedEventIds)', async () => {
      const prev = snap({
        agents: { 'agent-dev': agent({ id: 'agent-dev', name: 'Dev', status: 'idle' }) },
      });
      const curr = snap({
        timestamp: '2026-08-31T12:01:00.000Z',
        agents: { 'agent-dev': agent({ id: 'agent-dev', name: 'Dev', status: 'working' }) },
        rawHash: 'changed',
      });

      const source = new FakeWorkspaceSource(curr);
      const emitted: Event[] = [];
      const poller = new MaestriPoller(source, {
        checkpoint: { ...createInitialCheckpoint(), lastSnapshot: prev },
        onEvents: (e) => emitted.push(...e),
      });

      const cycle1 = await poller.pollOnce();
      expect(cycle1.some((e) => e.type === 'agent.status_changed')).toBe(true);
      const eventId = cycle1.find((e) => e.type === 'agent.status_changed')?.eventId;
      expect(eventId).toBe(
        generateDeterministicEventId('agent.status_changed', 'agent-dev', 'ws-1', 'idle->working')
      );

      const replay = new MaestriPoller(source, {
        checkpoint: { ...poller.getCheckpoint(), lastSnapshot: prev },
        onEvents: (e) => emitted.push(...e),
      });
      const cycle2 = await replay.pollOnce();
      expect(cycle2).toHaveLength(0);
      expect(emitted).toHaveLength(cycle1.length);
      expect(poller.getCheckpoint().emittedEventIds).toContain(eventId);
      poller.stop();
      replay.stop();
    });

    it('reconexão/resume: reinstanciar poller com checkpoint salvo → 0 agent.connected', async () => {
      const snapshot = snap({
        agents: {
          'agent-dev': agent({ id: 'agent-dev', name: 'Developer' }),
          'agent-cto': agent({ id: 'agent-cto', name: 'CTO' }),
        },
        rawHash: 'live',
      });
      const source = new FakeWorkspaceSource(snapshot);
      const poller1 = new MaestriPoller(source, { intervalMs: 50 });
      const first = await poller1.pollOnce();
      expect(first.some((e) => e.type === 'agent.connected')).toBe(true);
      const checkpoint = poller1.getCheckpoint();
      expect(checkpoint.lastSnapshot).toBeDefined();
      poller1.stop();

      const poller2 = new MaestriPoller(source, { checkpoint });
      const resumed = await poller2.pollOnce();
      expect(resumed).toHaveLength(0);
      expect(resumed.some((e) => e.type === 'agent.connected')).toBe(false);
      poller2.stop();
    });

    it('diff sem mudanças após restart com snapshot restaurado → 0 eventos', async () => {
      const snapshot = snap({
        agents: { 'agent-1': agent({ id: 'agent-1', name: 'A' }) },
        rawHash: 'stable',
      });
      const source = new FakeWorkspaceSource(snapshot);
      const poller1 = new MaestriPoller(source);
      await poller1.pollOnce();
      const ckpt = poller1.getCheckpoint();
      poller1.stop();

      const poller2 = new MaestriPoller(source, { checkpoint: ckpt });
      expect(await poller2.pollOnce()).toHaveLength(0);
      poller2.stop();
    });

    it('Maestri indisponível: source lança → pollOnce não crasha; interval cresce, tem teto e reseta', async () => {
      const source = new FakeWorkspaceSource(snap());
      source.throwError = new Error('maestri unavailable');

      const poller = new MaestriPoller(source, {
        minIntervalMs: 1000,
        maxIntervalMs: 5000,
        backoffFactor: 2,
        jitterRatio: 0,
      });

      expect(await poller.pollOnce()).toHaveLength(0);
      const after1 = poller.getCurrentIntervalMs();
      expect(after1).toBe(2000);

      expect(await poller.pollOnce()).toHaveLength(0);
      const after2 = poller.getCurrentIntervalMs();
      expect(after2).toBe(4000);
      expect(after2).toBeGreaterThan(after1);

      expect(await poller.pollOnce()).toHaveLength(0);
      expect(poller.getCurrentIntervalMs()).toBe(5000);
      expect(await poller.pollOnce()).toHaveLength(0);
      expect(poller.getCurrentIntervalMs()).toBe(5000);

      source.throwError = null;
      source.snapshotToReturn = snap({
        agents: { 'agent-1': agent({ id: 'agent-1', name: 'A' }) },
        rawHash: 'ok',
      });
      const recovered = await poller.pollOnce();
      expect(recovered.length).toBeGreaterThan(0);
      expect(poller.getCurrentIntervalMs()).toBe(1000);
      expect(poller.getConsecutiveFailures()).toBe(0);
      poller.stop();
    });
  });

  describe('Checkpoint persistido', () => {
    const testCheckpointPath = '.agent-io/test-adapter-checkpoint.json';

    afterEach(async () => {
      try {
        await fs.unlink(path.resolve(testCheckpointPath));
      } catch {
        // ignora
      }
    });

    it('save → load → resume mantém lastSequence, emittedEventIds (com teto) e snapshot anterior', async () => {
      const lastSnapshot = snap({
        agents: { 'agent-1': agent({ id: 'agent-1', name: 'A' }) },
        rawHash: 'abc',
      });
      const overflow = Array.from({ length: EMITTED_EVENT_IDS_CAP + 25 }, (_, i) => `evt-${i}`);
      const checkpoint = {
        version: 2,
        lastSequence: 42,
        lastOccurredAt: '2026-08-31T12:00:00.000Z',
        lastSnapshotHash: 'abc',
        lastSnapshot,
        emittedEventIds: overflow,
        updatedAt: '2026-08-31T12:00:00.000Z',
      };

      await saveCheckpointToFile(checkpoint, testCheckpointPath);
      const loaded = await loadCheckpointFromFile(testCheckpointPath);

      expect(loaded.lastSequence).toBe(42);
      expect(loaded.lastSnapshotHash).toBe('abc');
      expect(loaded.lastSnapshot?.agents['agent-1'].name).toBe('A');
      expect(loaded.emittedEventIds).toHaveLength(EMITTED_EVENT_IDS_CAP);
      expect(loaded.emittedEventIds[0]).toBe('evt-25');
      expect(loaded.emittedEventIds.at(-1)).toBe(`evt-${EMITTED_EVENT_IDS_CAP + 24}`);

      const source = new FakeWorkspaceSource(lastSnapshot);
      const poller = new MaestriPoller(source, { checkpoint: loaded });
      expect(await poller.pollOnce()).toHaveLength(0);
      poller.stop();
    });

    it('helpers puros: cap FIFO e merge ignoram duplicata', () => {
      expect(capEmittedEventIds(['a', 'b', 'c'], 2)).toEqual(['b', 'c']);
      expect(mergeEmittedEventId(['a', 'b'], 'b', 10)).toEqual(['a', 'b']);
      expect(mergeEmittedEventId(['a', 'b'], 'c', 2)).toEqual(['b', 'c']);
    });

    it('parseCheckpoint hidrata v1 sem lastSnapshot e serializa v2', () => {
      const parsed = parseCheckpoint({
        version: 1,
        lastSequence: 3,
        emittedEventIds: ['evt-1'],
        updatedAt: '2026-08-31T12:00:00.000Z',
      });
      expect(parsed.lastSnapshot).toBeUndefined();
      expect(parsed.lastSequence).toBe(3);
      const json = JSON.parse(serializeCheckpoint(parsed));
      expect(json.version).toBe(2);
      expect(json.emittedEventIds).toEqual(['evt-1']);
    });
  });

  describe('Módulos browser-safe', () => {
    it('poller/checkpoint/index/parser/differ não importam node:fs, child_process ou http', async () => {
      const files = [
        'src/adapter/index.ts',
        'src/adapter/poller.ts',
        'src/adapter/checkpoint.ts',
        'src/adapter/parser.ts',
        'src/adapter/differ.ts',
        'src/adapter/fakeSource.ts',
        'src/adapter/types.ts',
        'src/bridge/client.ts',
      ];
      for (const file of files) {
        const src = await fs.readFile(path.resolve(file), 'utf-8');
        expect(src, file).not.toMatch(/node:(fs|child_process|http|path)/);
      }
    });
  });
});
