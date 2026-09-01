import { describe, expect, it, beforeEach } from 'vitest';
import { resetSelectionStore, useSelectionStore } from './selectionStore';

describe('selectionStore', () => {
  beforeEach(() => {
    resetSelectionStore();
  });

  it('guarda só o id selecionado', () => {
    useSelectionStore.getState().select('agent-dev');
    expect(useSelectionStore.getState().selectedAgentId).toBe('agent-dev');
    expect(Object.keys(useSelectionStore.getState())).toEqual(
      expect.arrayContaining(['selectedAgentId', 'notice'])
    );
  });

  it('limpa a seleção quando o agente sai do Record projetado', () => {
    useSelectionStore.getState().select('agent-gone');
    useSelectionStore.getState().syncWithAgents({ 'agent-dev': {} });
    expect(useSelectionStore.getState().selectedAgentId).toBeNull();
    expect(useSelectionStore.getState().notice).toEqual({
      reason: 'removed',
      agentId: 'agent-gone',
    });
  });

  it('limpa a seleção quando o agente desconecta', () => {
    useSelectionStore.getState().select('agent-dev');
    useSelectionStore.getState().handleEvents([
      {
        eventId: 'evt-dc',
        version: 1,
        type: 'agent.disconnected',
        occurredAt: '2026-08-31T12:00:00.000Z',
        workspaceId: 'ws-1',
        source: 'test',
        entityId: 'agent-dev',
        payload: { name: 'Developer' },
      },
    ]);
    expect(useSelectionStore.getState().selectedAgentId).toBeNull();
    expect(useSelectionStore.getState().notice?.reason).toBe('disconnected');
  });

  it('mantém a seleção se o agente ainda está no Record', () => {
    useSelectionStore.getState().select('agent-dev');
    useSelectionStore.getState().syncWithAgents({ 'agent-dev': {} });
    expect(useSelectionStore.getState().selectedAgentId).toBe('agent-dev');
    expect(useSelectionStore.getState().notice).toBeNull();
  });
});
