import { describe, expect, it, beforeEach } from 'vitest';
import { Agent } from '../contracts';
import { useProjectedStore } from '../domain';
import { buildAgentViews } from './agentViewModel';
import { createMemoryHost, syncAgentViews } from './officeSync';

function agent(id: string, status: Agent['status'] = 'idle', x = 3, y = 5): Agent {
  return {
    id,
    workspaceId: 'ws-1',
    name: id,
    provider: 'unknown',
    model: 'unknown',
    role: 'agent',
    status,
    position: { x, y },
  };
}

describe('officeSync store → cena', () => {
  beforeEach(() => {
    useProjectedStore.getState().reset();
  });

  it('agente idle da store vira entidade no host', () => {
    useProjectedStore.getState().ingest({
      eventId: 'e1',
      version: 1,
      type: 'agent.connected',
      occurredAt: '2026-08-31T12:00:00.000Z',
      workspaceId: 'ws-1',
      source: 'test',
      entityId: 'idle-1',
      payload: { name: 'Idle', role: 'Dev', status: 'idle', position: { x: 3, y: 5 } },
    });

    const host = createMemoryHost();
    const views = buildAgentViews(Object.values(useProjectedStore.getState().agents));
    syncAgentViews(host, views);

    expect(host.getAgentIds()).toEqual(['idle-1']);
    expect(host.entities.get('idle-1')?.status).toBe('idle');
    expect(host.entities.get('idle-1')?.statusVisual.icon).toBe('○');
  });

  it('agente working reflete status no host', () => {
    const host = createMemoryHost();
    syncAgentViews(host, buildAgentViews([agent('w1', 'working', 7, 5)]));
    expect(host.entities.get('w1')?.statusVisual.key).toBe('working');
  });

  it('agente disconnected/offline reflete no host', () => {
    const host = createMemoryHost();
    syncAgentViews(host, buildAgentViews([agent('off-1', 'offline', 2, 2)]));
    expect(host.entities.get('off-1')?.status).toBe('offline');
    expect(host.entities.get('off-1')?.statusVisual.icon).toBe('×');
  });

  it('múltiplos agentes montam entidades distintas', () => {
    const host = createMemoryHost();
    const views = buildAgentViews([
      agent('a', 'idle', 3, 5),
      agent('b', 'working', 7, 5),
      agent('c', 'waiting', 11, 5),
    ]);
    const result = syncAgentViews(host, views);
    expect(result.upserted.sort()).toEqual(['a', 'b', 'c']);
    expect(host.getAgentIds().sort()).toEqual(['a', 'b', 'c']);
  });

  it('mudança de status na store atualiza a entidade existente', () => {
    const host = createMemoryHost();
    syncAgentViews(host, buildAgentViews([agent('dev', 'idle', 3, 5)]));
    expect(host.entities.get('dev')?.status).toBe('idle');

    syncAgentViews(host, buildAgentViews([agent('dev', 'error', 3, 5)]));
    expect(host.getAgentIds()).toEqual(['dev']);
    expect(host.entities.get('dev')?.status).toBe('error');
    expect(host.entities.get('dev')?.statusVisual.icon).toBe('!');
  });

  it('agente adicionado e removido monta/desmonta a entidade', () => {
    const host = createMemoryHost();
    syncAgentViews(host, buildAgentViews([agent('keep', 'idle', 3, 5), agent('gone', 'idle', 7, 5)]));
    expect(host.getAgentIds().sort()).toEqual(['gone', 'keep']);

    const result = syncAgentViews(host, buildAgentViews([agent('keep', 'idle', 3, 5)]));
    expect(result.removed).toEqual(['gone']);
    expect(host.getAgentIds()).toEqual(['keep']);
    expect(host.entities.has('gone')).toBe(false);
  });
});
