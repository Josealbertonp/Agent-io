import { describe, expect, it, beforeEach } from 'vitest';
import { Agent, AgentStatus } from '../contracts';
import {
  buildAgentViews,
  resetAgentViewCache,
  selectAgentViews,
  toAgentView,
} from './agentViewModel';
import { statusVisualFor, allStatusVisuals, NEUTRAL_STATUS_VISUAL } from './statusVisual';
import { tileToPixelCenter } from './officeMap';

function makeAgent(overrides: Partial<Agent> & Pick<Agent, 'id'>): Agent {
  return {
    workspaceId: 'ws-1',
    name: overrides.name ?? overrides.id,
    provider: 'openai',
    model: 'gpt-4o',
    role: 'Developer',
    status: 'idle',
    position: { x: 3, y: 5 },
    ...overrides,
  };
}

describe('statusVisual', () => {
  it('mapeia idle, working, offline, waiting e os demais com cor + ícone + rótulo', () => {
    const required: AgentStatus[] = [
      'idle',
      'working',
      'error',
      'offline',
      'waiting',
      'planning',
      'blocked',
      'reviewing',
      'done',
    ];
    const visuals = allStatusVisuals();
    expect(visuals).toHaveLength(required.length);

    for (const status of required) {
      const visual = statusVisualFor(status);
      expect(visual.key).toBe(status);
      expect(visual.color).toBeGreaterThan(0);
      expect(visual.icon.length).toBeGreaterThan(0);
      expect(visual.label).toBe(status);
      expect(visual.description.length).toBeGreaterThan(0);
    }
  });

  it('status desconhecido cai no visual neutro (débito)', () => {
    expect(statusVisualFor('mystery')).toEqual(NEUTRAL_STATUS_VISUAL);
  });
});

describe('agentViewModel', () => {
  beforeEach(() => {
    resetAgentViewCache();
  });

  it('agente idle carrega id, nome, role, status, position, provider e model', () => {
    const agent = makeAgent({
      id: 'agent-idle',
      name: 'Idle Bot',
      role: 'SRE',
      status: 'idle',
      position: { x: 4, y: 6 },
      provider: 'anthropic',
      model: 'claude',
    });
    const views = buildAgentViews([agent]);
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      id: 'agent-idle',
      label: 'Idle Bot',
      role: 'SRE',
      status: 'idle',
      provider: 'anthropic',
      model: 'claude',
      usedFallbackLayout: false,
    });
    expect(views[0].statusVisual.icon).toBe('○');
    expect(views[0].x).toBe(tileToPixelCenter(4, 6).x);
    expect(views[0].y).toBe(tileToPixelCenter(4, 6).y);
    expect(views[0].providerBadge).toContain('anthropic');
  });

  it('agente working usa visual dedicado (não só cor)', () => {
    const views = buildAgentViews([makeAgent({ id: 'w', status: 'working', position: { x: 3, y: 5 } })]);
    expect(views[0].statusVisual.icon).toBe('▶');
    expect(views[0].statusVisual.label).toBe('working');
    expect(views[0].statusVisual.hex).toMatch(/^#/);
  });

  it('agente offline/disconnected usa visual dedicado', () => {
    const views = buildAgentViews([makeAgent({ id: 'off', status: 'offline', position: { x: 2, y: 2 } })]);
    expect(views[0].statusVisual.key).toBe('offline');
    expect(views[0].statusVisual.icon).toBe('×');
    expect(views[0].statusVisual.label).toBe('offline');
  });

  it('múltiplos agentes com posições distintas mantêm a position do estado', () => {
    const views = buildAgentViews([
      makeAgent({ id: 'a', position: { x: 3, y: 5 } }),
      makeAgent({ id: 'b', position: { x: 7, y: 5 } }),
      makeAgent({ id: 'c', position: { x: 11, y: 5 } }),
    ]);
    expect(views.map((v) => v.id)).toEqual(['a', 'b', 'c']);
    expect(views[0].usedFallbackLayout).toBe(false);
    expect(views[1].usedFallbackLayout).toBe(false);
    expect(views[2].usedFallbackLayout).toBe(false);
    expect(new Set(views.map((v) => `${v.x},${v.y}`)).size).toBe(3);
  });

  it('mudança de status reflete no view-model', () => {
    const idle = makeAgent({ id: 'dev', status: 'idle', position: { x: 3, y: 5 } });
    const working = { ...idle, status: 'working' as const };
    expect(buildAgentViews([idle])[0].statusVisual.key).toBe('idle');
    expect(buildAgentViews([working])[0].statusVisual.key).toBe('working');
  });

  it('posição {0,0} ou colisão usa layout de fallback estável/determinístico', () => {
    const a = makeAgent({ id: 'zulu', position: { x: 0, y: 0 } });
    const b = makeAgent({ id: 'alpha', position: { x: 0, y: 0 } });
    const first = buildAgentViews([a, b]);
    const second = buildAgentViews([b, a]);
    expect(first.map((v) => v.id)).toEqual(['alpha', 'zulu']);
    expect(second.map((v) => v.id)).toEqual(['alpha', 'zulu']);
    expect(first[0].usedFallbackLayout).toBe(true);
    expect(first[1].usedFallbackLayout).toBe(true);
    expect(first[0].x).toBe(second[0].x);
    expect(first[0].y).toBe(second[0].y);
    expect(first[0].sourcePosition).toEqual({ x: 0, y: 0 });
    expect(`${first[0].x},${first[0].y}`).not.toBe(`${first[1].x},${first[1].y}`);
  });

  it('selectAgentViews memoiza pelo reference do Record de agents', () => {
    const agents = { a: makeAgent({ id: 'a', position: { x: 3, y: 5 } }) };
    const once = selectAgentViews(agents);
    const twice = selectAgentViews(agents);
    expect(once).toBe(twice);
    const next = selectAgentViews({ ...agents });
    expect(next).not.toBe(once);
  });

  it('toAgentView não muta o Agent de origem', () => {
    const agent = makeAgent({ id: 'src', position: { x: 8, y: 5 } });
    const frozen = structuredClone(agent);
    toAgentView(agent, { x: 10, y: 20, usedFallback: false });
    expect(agent).toEqual(frozen);
  });
});
