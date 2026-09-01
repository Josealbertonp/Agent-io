import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { sampleEvents } from '../fixtures/events.sample';
import { Event } from '../contracts';
import {
  createInitialState,
  applyEvents,
  projectEvent,
  orderEvents,
  deduplicateEvents,
  serializeState,
  deserializeState,
  useProjectedStore,
} from './index';
import { saveSnapshotToFile, loadSnapshotFromFile } from './snapshot.node';
import { diffSnapshots } from '../adapter/differ';
import type { NormalizedAgentState, WorkspaceSnapshot } from '../adapter/types';

describe('Domain Projection Core (Etapa 1.1)', () => {
  beforeEach(() => {
    useProjectedStore.getState().reset();
  });

  describe('Ordering & Deduplication', () => {
    it('should sort events by sequence, then occurredAt, then eventId', () => {
      const e1: Event = {
        eventId: 'evt-b',
        version: 1,
        type: 'agent.connected',
        occurredAt: '2026-08-31T10:00:00.000Z',
        sequence: 2,
        workspaceId: 'ws-1',
        source: 'maestri',
        payload: {},
      };
      const e2: Event = {
        eventId: 'evt-a',
        version: 1,
        type: 'agent.connected',
        occurredAt: '2026-08-31T09:00:00.000Z',
        sequence: 1,
        workspaceId: 'ws-1',
        source: 'maestri',
        payload: {},
      };
      const e3: Event = {
        eventId: 'evt-c',
        version: 1,
        type: 'agent.connected',
        occurredAt: '2026-08-31T10:00:00.000Z',
        sequence: 2,
        workspaceId: 'ws-1',
        source: 'maestri',
        payload: {},
      };

      const sorted = orderEvents([e1, e2, e3]);
      expect(sorted[0].eventId).toBe('evt-a');
      expect(sorted[1].eventId).toBe('evt-b');
      expect(sorted[2].eventId).toBe('evt-c');
    });

    it('should deduplicate events within a batch and against seenIds', () => {
      const e1 = sampleEvents[0];
      const e2 = sampleEvents[1];
      const seen = new Set<string>([e1.eventId]);

      const deduplicated = deduplicateEvents([e1, e2, e2, e1], seen);
      expect(deduplicated).toEqual([e2]);
    });

    it('should handle invalid occurredAt timestamps deterministically without generating NaN or crashing', () => {
      const eValid: Event = {
        eventId: 'evt-valid',
        version: 1,
        type: 'agent.connected',
        occurredAt: '2026-08-31T10:00:00.000Z',
        workspaceId: 'ws-1',
        source: 'maestri',
        payload: { name: 'Valid Agent' },
      };
      const eInvalid1: Event = {
        eventId: 'evt-invalid-b',
        version: 1,
        type: 'agent.connected',
        occurredAt: 'totally-invalid-date-xyz',
        workspaceId: 'ws-1',
        source: 'maestri',
        payload: { name: 'Invalid Agent B' },
      };
      const eInvalid2: Event = {
        eventId: 'evt-invalid-a',
        version: 1,
        type: 'agent.connected',
        occurredAt: 'not-a-date',
        workspaceId: 'ws-1',
        source: 'maestri',
        payload: { name: 'Invalid Agent A' },
      };

      const sorted = orderEvents([eInvalid1, eValid, eInvalid2]);
      expect(sorted[0].eventId).toBe('evt-valid');
      expect(sorted[1].eventId).toBe('evt-invalid-a');
      expect(sorted[2].eventId).toBe('evt-invalid-b');

      // Aplicação não deve quebrar
      expect(() => applyEvents(createInitialState(), sorted)).not.toThrow();
    });
  });

  describe('Projection of Canonical Fixtures', () => {
    it('should project the 11 sample events into the expected domain state', () => {
      const state = applyEvents(createInitialState(), sampleEvents);

      // Connection status
      expect(state.connectionStatus).toBe('connected');

      // Agents
      expect(Object.keys(state.agents)).toHaveLength(2);
      const planner = state.agents['agent-planner-01'];
      expect(planner).toBeDefined();
      expect(planner.name).toBe('Architect Prime');
      expect(planner.status).toBe('offline'); // Event 11 disconnected
      expect(planner.position).toEqual({ x: 4, y: 3 });

      const dev = state.agents['agent-dev-01'];
      expect(dev).toBeDefined();
      expect(dev.name).toBe('Code Builder');
      expect(dev.status).toBe('working');
      expect(dev.currentTaskId).toBe('task-101');
      expect(dev.position).toEqual({ x: 8, y: 5 });

      // Tasks
      expect(Object.keys(state.tasks)).toHaveLength(1);
      const task = state.tasks['task-101'];
      expect(task).toBeDefined();
      expect(task.title).toBe('Configurar schemas Zod e contratos do Agent-IO');
      expect(task.status).toBe('done');
      expect(task.ownerAgentId).toBe('agent-dev-01');
      expect(task.participantAgentIds).toEqual(['agent-dev-01']);
      expect(task.startedAt).toBe('2026-08-31T12:01:40.000Z');
      expect(task.completedAt).toBe('2026-08-31T12:05:10.000Z');

      // Activities
      expect(Object.keys(state.activities)).toHaveLength(1);
      const activity = state.activities['act-501'];
      expect(activity).toBeDefined();
      expect(activity.agentId).toBe('agent-dev-01');
      expect(activity.type).toBe('code_generation');
      expect(activity.startedAt).toBe('2026-08-31T12:01:45.000Z');
      expect(activity.endedAt).toBe('2026-08-31T12:05:00.000Z');
      expect(activity.sourceEventId).toBe('evt-007');

      // Metadados de projeção
      expect(state.seenEventIds.size).toBe(11);
      expect(state.pendingOrphanEvents).toHaveLength(0);
      expect(state.lastSequence).toBe(11);
      expect(state.lastOccurredAt).toBe('2026-08-31T12:10:00.000Z');
      expect(state.ignoredEventsCount).toBe(0);
      expect(state.rejectedEventsCount).toBe(0);
      expect(state.invalidPayloadCount).toBe(0);
      expect(state.droppedOrphanEventsCount).toBe(0);
    });

    it('should guarantee idempotency when reapplying the same events', () => {
      const state1 = applyEvents(createInitialState(), sampleEvents);
      const state2 = applyEvents(state1, sampleEvents);

      expect(state2.agents).toEqual(state1.agents);
      expect(state2.tasks).toEqual(state1.tasks);
      expect(state2.activities).toEqual(state1.activities);
      expect(state2.seenEventIds.size).toBe(11);
      expect(state2.ignoredEventsCount).toBe(0);
      expect(state2.lastSequence).toBe(state1.lastSequence);
    });

    it('should produce the exact same state when events are shuffled out-of-order in batch', () => {
      const normalState = applyEvents(createInitialState(), sampleEvents);

      const shuffled = [...sampleEvents].reverse();
      const shuffledState = applyEvents(createInitialState(), shuffled);

      expect(shuffledState.agents).toEqual(normalState.agents);
      expect(shuffledState.tasks).toEqual(normalState.tasks);
      expect(shuffledState.activities).toEqual(normalState.activities);
      expect(shuffledState.connectionStatus).toBe(normalState.connectionStatus);
      expect(shuffledState.seenEventIds).toEqual(normalState.seenEventIds);
      expect(shuffledState.lastSequence).toBe(normalState.lastSequence);
    });
  });

  describe('Orphan Events & Out-of-Order Single Ingest', () => {
    it('should buffer an orphan event arriving before its entity and apply it when the entity is created (single ingest)', () => {
      let state = createInitialState();

      const statusChangedEvent: Event = {
        eventId: 'evt-orphan-status',
        version: 1,
        type: 'agent.status_changed',
        occurredAt: '2026-08-31T12:02:00.000Z',
        sequence: 2,
        workspaceId: 'ws-1',
        source: 'maestri',
        entityId: 'agent-late',
        payload: {
          currentStatus: 'working',
        },
      };

      // 1. Ingesta unitariamente o evento órfão (agente ainda não existe)
      state = projectEvent(state, statusChangedEvent);
      expect(state.agents['agent-late']).toBeUndefined();
      expect(state.seenEventIds.has('evt-orphan-status')).toBe(false);
      expect(state.pendingOrphanEvents).toHaveLength(1);

      // 2. Cria o agente posteriormente
      const connectedEvent: Event = {
        eventId: 'evt-create-agent',
        version: 1,
        type: 'agent.connected',
        occurredAt: '2026-08-31T12:01:00.000Z',
        sequence: 1,
        workspaceId: 'ws-1',
        source: 'maestri',
        entityId: 'agent-late',
        payload: {
          name: 'Late Agent',
          status: 'idle',
        },
      };

      state = projectEvent(state, connectedEvent);

      // O órfão deve ter sido drenado e aplicado com sucesso!
      expect(state.agents['agent-late']).toBeDefined();
      expect(state.agents['agent-late'].name).toBe('Late Agent');
      expect(state.agents['agent-late'].status).toBe('working');
      expect(state.seenEventIds.has('evt-create-agent')).toBe(true);
      expect(state.seenEventIds.has('evt-orphan-status')).toBe(true);
      expect(state.pendingOrphanEvents).toHaveLength(0);
    });

    it('should buffer task and activity orphan events and drain them when task/activity is created', () => {
      let state = createInitialState();

      const taskCompletedEvent: Event = {
        eventId: 'evt-orphan-task-done',
        version: 1,
        type: 'task.completed',
        occurredAt: '2026-08-31T12:05:00.000Z',
        sequence: 2,
        workspaceId: 'ws-1',
        source: 'maestri',
        entityId: 'task-late-1',
        payload: { completedAt: '2026-08-31T12:05:00.000Z' },
      };

      state = projectEvent(state, taskCompletedEvent);
      expect(state.tasks['task-late-1']).toBeUndefined();
      expect(state.pendingOrphanEvents).toHaveLength(1);

      const taskCreatedEvent: Event = {
        eventId: 'evt-create-task',
        version: 1,
        type: 'task.created',
        occurredAt: '2026-08-31T12:00:00.000Z',
        sequence: 1,
        workspaceId: 'ws-1',
        source: 'maestri',
        entityId: 'task-late-1',
        payload: { title: 'Late Task', status: 'in_progress' },
      };

      state = projectEvent(state, taskCreatedEvent);
      expect(state.tasks['task-late-1']).toBeDefined();
      expect(state.tasks['task-late-1'].status).toBe('done');
      expect(state.pendingOrphanEvents).toHaveLength(0);
    });

    it('should buffer activity.finished arriving before activity.started and drain it when activity is started', () => {
      let state = createInitialState();

      const activityFinishedEvent: Event = {
        eventId: 'evt-orphan-act-finish',
        version: 1,
        type: 'activity.finished',
        occurredAt: '2026-08-31T12:05:00.000Z',
        sequence: 2,
        workspaceId: 'ws-1',
        source: 'maestri',
        entityId: 'act-late-1',
        payload: { endedAt: '2026-08-31T12:05:00.000Z' },
      };

      state = projectEvent(state, activityFinishedEvent);
      expect(state.activities['act-late-1']).toBeUndefined();
      expect(state.pendingOrphanEvents).toHaveLength(1);
      expect(state.seenEventIds.has('evt-orphan-act-finish')).toBe(false);

      const activityStartedEvent: Event = {
        eventId: 'evt-start-act',
        version: 1,
        type: 'activity.started',
        occurredAt: '2026-08-31T12:00:00.000Z',
        sequence: 1,
        workspaceId: 'ws-1',
        source: 'maestri',
        entityId: 'act-late-1',
        payload: { agentId: 'agent-1', type: 'code_review', sourceEventId: 'evt-src-1' },
      };

      state = projectEvent(state, activityStartedEvent);
      expect(state.activities['act-late-1']).toBeDefined();
      expect(state.activities['act-late-1'].endedAt).toBe('2026-08-31T12:05:00.000Z');
      expect(state.seenEventIds.has('evt-start-act')).toBe(true);
      expect(state.seenEventIds.has('evt-orphan-act-finish')).toBe(true);
      expect(state.pendingOrphanEvents).toHaveLength(0);
    });

    it('should treat events without extractable target id as invalid (rejected), without polluting pendingOrphanEvents', () => {
      let state = createInitialState();

      const invalidEventNoId: Event = {
        eventId: 'evt-no-target-id',
        version: 1,
        type: 'agent.status_changed',
        occurredAt: '2026-08-31T12:00:00.000Z',
        workspaceId: 'ws-1',
        source: 'maestri',
        payload: { currentStatus: 'working' }, // sem entityId, sem actorId, sem payload.agentId
      };

      state = projectEvent(state, invalidEventNoId);
      expect(state.pendingOrphanEvents).toHaveLength(0);
      expect(state.seenEventIds.has('evt-no-target-id')).toBe(false);
      expect(state.rejectedEventsCount).toBe(1);
    });

    it('should enforce MAX_PENDING_ORPHAN_EVENTS ceiling with FIFO eviction and droppedOrphanEventsCount increment', () => {
      let state = createInitialState();

      // Ingesta 1005 eventos órfãos legítimos diferentes
      for (let i = 1; i <= 1005; i++) {
        state = projectEvent(state, {
          eventId: `evt-orphan-${i}`,
          version: 1,
          type: 'agent.status_changed',
          occurredAt: '2026-08-31T12:00:00.000Z',
          sequence: i,
          workspaceId: 'ws-1',
          source: 'maestri',
          entityId: `uncreated-agent-${i}`,
          payload: { currentStatus: 'working' },
        });
      }

      expect(state.pendingOrphanEvents.length).toBe(1000);
      expect(state.droppedOrphanEventsCount).toBe(5);
      // Os 5 primeiros órfãos (1 a 5) foram descartados via FIFO
      expect(state.pendingOrphanEvents[0].eventId).toBe('evt-orphan-6');
      expect(state.pendingOrphanEvents[999].eventId).toBe('evt-orphan-1005');
    });
  });

  describe('Monotonic Cursors (lastSequence / lastOccurredAt)', () => {
    it('should never regress lastSequence and lastOccurredAt when out-of-order events arrive unitarily', () => {
      let state = createInitialState();

      const newerEvent: Event = {
        eventId: 'evt-newer',
        version: 1,
        type: 'agent.connected',
        occurredAt: '2026-08-31T12:00:00.000Z',
        sequence: 50,
        workspaceId: 'ws-1',
        source: 'maestri',
        payload: { id: 'agent-1', name: 'Agent 1' },
      };

      state = projectEvent(state, newerEvent);
      expect(state.lastSequence).toBe(50);
      expect(state.lastOccurredAt).toBe('2026-08-31T12:00:00.000Z');

      const olderEvent: Event = {
        eventId: 'evt-older',
        version: 1,
        type: 'agent.connected',
        occurredAt: '2026-08-31T10:00:00.000Z',
        sequence: 10,
        workspaceId: 'ws-1',
        source: 'maestri',
        payload: { id: 'agent-2', name: 'Agent 2' },
      };

      state = projectEvent(state, olderEvent);
      // Os cursores NÃO podem regredir para 10 nem para as 10:00:00
      expect(state.lastSequence).toBe(50);
      expect(state.lastOccurredAt).toBe('2026-08-31T12:00:00.000Z');
    });
  });

  describe('Payload and Schema Validations', () => {
    it('should reject invalid status values in agent.status_changed, preserving previous status and incrementing invalidPayloadCount', () => {
      let state = applyEvents(createInitialState(), [
        {
          eventId: 'evt-agent-init',
          version: 1,
          type: 'agent.connected',
          occurredAt: '2026-08-31T12:00:00.000Z',
          workspaceId: 'ws-1',
          source: 'maestri',
          entityId: 'agent-test',
          payload: { status: 'idle', name: 'Agent Test' },
        },
      ]);

      expect(state.agents['agent-test'].status).toBe('idle');

      const invalidStatusEvent: Event = {
        eventId: 'evt-invalid-status',
        version: 1,
        type: 'agent.status_changed',
        occurredAt: '2026-08-31T12:01:00.000Z',
        workspaceId: 'ws-1',
        source: 'maestri',
        entityId: 'agent-test',
        payload: { currentStatus: 'banana' },
      };

      state = projectEvent(state, invalidStatusEvent);
      expect(state.agents['agent-test'].status).toBe('idle'); // Status anterior preservado
      expect(state.invalidPayloadCount).toBe(1);
      expect(state.seenEventIds.has('evt-invalid-status')).toBe(true);
    });

    it('should reject invalid status in task.status_changed and connection.status_changed', () => {
      let state = applyEvents(createInitialState(), [
        {
          eventId: 'evt-task-init',
          version: 1,
          type: 'task.created',
          occurredAt: '2026-08-31T12:00:00.000Z',
          workspaceId: 'ws-1',
          source: 'maestri',
          entityId: 'task-test',
          payload: { title: 'Task Test', status: 'in_progress' },
        },
      ]);

      state = projectEvent(state, {
        eventId: 'evt-task-bad-status',
        version: 1,
        type: 'task.status_changed',
        occurredAt: '2026-08-31T12:01:00.000Z',
        workspaceId: 'ws-1',
        source: 'maestri',
        entityId: 'task-test',
        payload: { currentStatus: 'non_existent_status' },
      });

      expect(state.tasks['task-test'].status).toBe('in_progress');
      expect(state.invalidPayloadCount).toBe(1);

      state = projectEvent(state, {
        eventId: 'evt-conn-bad-status',
        version: 1,
        type: 'connection.status_changed',
        occurredAt: '2026-08-31T12:02:00.000Z',
        workspaceId: 'ws-1',
        source: 'maestri',
        payload: { status: 'flying' },
      });

      expect(state.connectionStatus).toBe('disconnected');
      expect(state.invalidPayloadCount).toBe(2);
    });

    it('should reject events with version != 1, incrementing rejectedEventsCount without modifying state, while accepting omitted/null version as default 1', () => {
      const state = createInitialState();

      const badVersionEvent: Event = {
        eventId: 'evt-bad-v2',
        version: 2,
        type: 'agent.connected',
        occurredAt: '2026-08-31T12:00:00.000Z',
        workspaceId: 'ws-1',
        source: 'maestri',
        payload: { id: 'agent-v2', name: 'Agent V2' },
      };

      const result = projectEvent(state, badVersionEvent);
      expect(result.rejectedEventsCount).toBe(1);
      expect(result.seenEventIds.has('evt-bad-v2')).toBe(false);
      expect(result.agents['agent-v2']).toBeUndefined();

      // Versão omitida/undefined deve ser aceita como 1
      const omittedVersionEvent = {
        eventId: 'evt-omitted-v',
        type: 'agent.connected',
        occurredAt: '2026-08-31T12:00:00.000Z',
        workspaceId: 'ws-1',
        source: 'maestri',
        payload: { id: 'agent-default-v', name: 'Agent Default V' },
      } as unknown as Event;

      const result2 = projectEvent(state, omittedVersionEvent);
      expect(result2.rejectedEventsCount).toBe(0);
      expect(result2.seenEventIds.has('evt-omitted-v')).toBe(true);
      expect(result2.agents['agent-default-v']).toBeDefined();
    });
  });

  describe('Unknown Events', () => {
    it('should safely ignore unknown event types, incrementing ignoredEventsCount without crashing', () => {
      const initial = createInitialState();
      const unknownEvent: Event = {
        eventId: 'evt-unk-01',
        version: 1,
        type: 'quantum_module.telemetry_ping',
        occurredAt: '2026-08-31T12:00:00.000Z',
        workspaceId: 'ws-main',
        source: 'future_plugin',
        payload: { arbitrary: 123 },
      };

      const projected = projectEvent(initial, unknownEvent);
      expect(projected.ignoredEventsCount).toBe(1);
      expect(projected.seenEventIds.has('evt-unk-01')).toBe(true);
      expect(projected.agents).toEqual({});
      expect(projected.tasks).toEqual({});
      expect(projected.activities).toEqual({});
    });
  });

  describe('Snapshot Serialization & File Persistence (Etapa 1.1)', () => {
    const testSnapshotPath = '.agent-io/test-snapshot.json';

    afterEach(async () => {
      try {
        await fs.unlink(path.resolve(testSnapshotPath));
      } catch {
        // Ignora se o arquivo não existir
      }
    });

    it('should serialize and deserialize state maintaining all properties, Set types, and orphan queues (round-trip)', () => {
      let original = applyEvents(createInitialState(), sampleEvents);
      // Adiciona um evento órfão ao estado
      original = projectEvent(original, {
        eventId: 'orphan-1',
        version: 1,
        type: 'agent.status_changed',
        occurredAt: '2026-08-31T13:00:00.000Z',
        workspaceId: 'ws-1',
        source: 'maestri',
        entityId: 'uncreated-agent',
        payload: { status: 'idle' },
      });

      const json = serializeState(original);
      const restored = deserializeState(json);

      expect(restored.agents).toEqual(original.agents);
      expect(restored.tasks).toEqual(original.tasks);
      expect(restored.activities).toEqual(original.activities);
      expect(restored.connectionStatus).toBe(original.connectionStatus);
      expect(restored.seenEventIds).toEqual(original.seenEventIds);
      expect(restored.pendingOrphanEvents).toEqual(original.pendingOrphanEvents);
      expect(restored.lastSequence).toBe(original.lastSequence);
      expect(restored.lastOccurredAt).toBe(original.lastOccurredAt);
      expect(restored.ignoredEventsCount).toBe(original.ignoredEventsCount);
      expect(restored.rejectedEventsCount).toBe(original.rejectedEventsCount);
      expect(restored.invalidPayloadCount).toBe(original.invalidPayloadCount);
      expect(restored.droppedOrphanEventsCount).toBe(original.droppedOrphanEventsCount);
    });

    it('should throw an explicit error when attempting to deserialize a snapshot with unsupported version', () => {
      const invalidVersionSnapshot = JSON.stringify({
        version: 99,
        timestamp: new Date().toISOString(),
        state: createInitialState(),
      });

      expect(() => deserializeState(invalidVersionSnapshot)).toThrow(
        /Snapshot version mismatch/
      );
    });

    it('should save and load snapshot from local file system via snapshot.node.ts', async () => {
      const original = applyEvents(createInitialState(), sampleEvents);
      await saveSnapshotToFile(original, testSnapshotPath);

      const loaded = await loadSnapshotFromFile(testSnapshotPath);
      expect(loaded.agents).toEqual(original.agents);
      expect(loaded.tasks).toEqual(original.tasks);
      expect(loaded.seenEventIds).toEqual(original.seenEventIds);
    });

    it('should preserve and drain previously orphan events after restoring a snapshot', () => {
      let state = createInitialState();

      // Envia evento órfão
      state = projectEvent(state, {
        eventId: 'orphan-evt',
        version: 1,
        type: 'agent.status_changed',
        occurredAt: '2026-08-31T12:02:00.000Z',
        workspaceId: 'ws-1',
        source: 'maestri',
        entityId: 'agent-snap-target',
        payload: { currentStatus: 'working' },
      });

      // Cria snapshot com o órfão pendente
      const snapshotJson = serializeState(state);

      // Restaura o snapshot
      let restoredState = deserializeState(snapshotJson);
      expect(restoredState.pendingOrphanEvents).toHaveLength(1);

      // Envia evento de criação do agente
      restoredState = projectEvent(restoredState, {
        eventId: 'create-snap-target',
        version: 1,
        type: 'agent.connected',
        occurredAt: '2026-08-31T12:01:00.000Z',
        workspaceId: 'ws-1',
        source: 'maestri',
        entityId: 'agent-snap-target',
        payload: { name: 'Snap Agent', status: 'idle' },
      });

      expect(restoredState.agents['agent-snap-target'].status).toBe('working');
      expect(restoredState.pendingOrphanEvents).toHaveLength(0);
      expect(restoredState.seenEventIds.has('orphan-evt')).toBe(true);
    });
  });

  describe('Zustand Store Integration', () => {
    it('should deduplicate events in the pipeline when ingested multiple times', () => {
      const store = useProjectedStore.getState();
      expect(store.connectionStatus).toBe('disconnected');

      // Ingestão 1
      store.ingest(sampleEvents);
      expect(useProjectedStore.getState().seenEventIds.size).toBe(11);

      // Ingestão 2 (mesmo lote)
      store.ingest(sampleEvents);
      expect(useProjectedStore.getState().seenEventIds.size).toBe(11);

      const stateAfter = useProjectedStore.getState();
      expect(stateAfter.connectionStatus).toBe('connected');
      expect(stateAfter.agents['agent-dev-01']).toBeDefined();
      expect(stateAfter.tasks['task-101']?.status).toBe('done');
    });

    it('should allow string snapshot restoration and state reset in store', () => {
      const store = useProjectedStore.getState();
      store.ingest(sampleEvents);

      const snapshotString = store.getSnapshot();
      store.reset();
      expect(useProjectedStore.getState().seenEventIds.size).toBe(0);

      store.restoreSnapshotString(snapshotString);
      expect(useProjectedStore.getState().seenEventIds.size).toBe(11);
      expect(useProjectedStore.getState().agents['agent-planner-01']).toBeDefined();
    });
  });

  describe('Opção A: inferência não entra em Agent.metadata', () => {
    it('após agent.connected vindo do differ, metadata não contém statusConfidence/statusEvidence', () => {
      const agentState: NormalizedAgentState = {
        id: 'agent-dev',
        workspaceId: 'ws-1',
        name: 'Developer',
        provider: 'unknown',
        model: 'unknown',
        providerKnown: false,
        role: 'Agent',
        status: 'working',
        statusConfidence: 'low',
        statusEvidence: 'heuristic-idle',
        position: { x: 0, y: 0 },
      };
      const prev: WorkspaceSnapshot = {
        workspaceId: 'ws-1',
        timestamp: '2026-08-31T12:00:00.000Z',
        connectionStatus: 'connected',
        agents: {},
        rawHash: 'hash-0',
      };
      const curr: WorkspaceSnapshot = {
        ...prev,
        timestamp: '2026-08-31T12:01:00.000Z',
        agents: { 'agent-dev': agentState },
        rawHash: 'hash-1',
      };

      const { events } = diffSnapshots(prev, curr, 1);
      const connected = events.find((e) => e.type === 'agent.connected');
      expect(connected).toBeDefined();

      const state = applyEvents(createInitialState(), [connected!]);
      const metadata = state.agents['agent-dev']?.metadata;
      expect(metadata?.statusConfidence).toBeUndefined();
      expect(metadata?.statusEvidence).toBeUndefined();
      expect(metadata?.statusInference).toBeUndefined();
    });
  });
});
