/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act, type ReactNode } from 'react';
import { AgentStatus } from '../contracts';
import { useProjectedStore } from '../domain';
import { AgentList } from './AgentList';
import { AgentPanel } from './AgentPanel';
import { ConnectionBanner } from './ConnectionBanner';
import { EventTimeline } from './EventTimeline';
import { StatusFilter } from './StatusFilter';
import { getPresentationEvents, resetEventLog } from './eventLog';
import { ingestAndRecord, startStoreFeeder, stopStoreFeeder, getActiveFeeder } from './feedProjectedStore';
import { resetSelectionStore, useSelectionStore } from './selectionStore';
import { displayProviderOrModel } from './displayLabels';
import { filterAgentsByStatus } from './filterAgents';

function connected(id: string, overrides: Record<string, unknown> = {}) {
  return {
    eventId: `evt-${id}`,
    version: 1 as const,
    type: 'agent.connected',
    occurredAt: '2026-08-31T12:00:00.000Z',
    workspaceId: 'ws-1',
    source: 'test',
    entityId: id,
    actorId: id,
    payload: {
      name: id,
      role: 'Dev',
      status: 'idle',
      provider: 'openai',
      model: 'gpt-4o',
      position: { x: 3, y: 5 },
      ...overrides,
    },
  };
}

async function render(node: ReactNode): Promise<{ host: HTMLDivElement; root: ReturnType<typeof createRoot> }> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
  return { host, root };
}

describe('Etapa 4 — interface operacional', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    useProjectedStore.getState().reset();
    resetEventLog();
    resetSelectionStore();
    stopStoreFeeder();
  });

  afterEach(async () => {
    stopStoreFeeder();
    useProjectedStore.getState().reset();
    resetEventLog();
    resetSelectionStore();
    document.body.innerHTML = '';
  });

  it('seleção via lista destaca o item e preenche o painel', async () => {
    ingestAndRecord(connected('agent-dev', { name: 'Developer', role: 'Implementador', status: 'working' }));
    const agents = useProjectedStore.getState().agents;
    const { host, root } = await render(
      <>
        <AgentList agents={agents} statusFilter="all" />
        <AgentPanel
          agents={agents}
          connectionStatus={useProjectedStore.getState().connectionStatus}
          events={getPresentationEvents()}
        />
      </>
    );

    await act(async () => {
      (host.querySelector('[data-testid="agent-list-item-agent-dev"]') as HTMLButtonElement).click();
    });

    expect(useSelectionStore.getState().selectedAgentId).toBe('agent-dev');
    expect(host.querySelector('[data-testid="agent-list-item-agent-dev"]')?.className).toContain(
      'is-selected'
    );
    expect(host.querySelector('[data-testid="panel-status"]')?.textContent).toContain('working');
    expect(host.textContent).toContain('Developer');
    expect(host.textContent).toContain('Implementador');

    await act(async () => {
      root.unmount();
    });
  });

  it('painel mostra fallback "-" / "sem dado" quando extras ausentes', async () => {
    ingestAndRecord(connected('agent-bare', { name: 'Bare' }));
    useSelectionStore.getState().select('agent-bare');
    const { host, root } = await render(
      <AgentPanel
        agents={useProjectedStore.getState().agents}
        connectionStatus="connected"
        events={getPresentationEvents()}
      />
    );

    expect(host.querySelector('[data-testid="panel-activity"]')?.textContent).toBe('sem dado');
    expect(host.querySelector('[data-testid="panel-confidence"]')?.textContent).toBe('sem dado');
    expect(host.querySelector('[data-testid="panel-evidence"]')?.textContent).toBe('sem dado');

    await act(async () => {
      root.unmount();
    });
  });

  it('painel mostra extras do payload (opção A) sem gravar no Agent', async () => {
    ingestAndRecord(
      connected('agent-dev', {
        name: 'Developer',
        status: 'working',
        statusConfidence: 'medium',
        statusEvidence: 'spinner',
        currentActivity: 'lendo arquivo',
      })
    );
    expect(useProjectedStore.getState().agents['agent-dev']).not.toHaveProperty('statusConfidence');
    useSelectionStore.getState().select('agent-dev');
    const { host, root } = await render(
      <AgentPanel
        agents={useProjectedStore.getState().agents}
        connectionStatus="connected"
        events={getPresentationEvents()}
      />
    );
    expect(host.querySelector('[data-testid="panel-confidence"]')?.textContent).toBe('medium');
    expect(host.querySelector('[data-testid="panel-evidence"]')?.textContent).toBe('spinner');
    expect(host.querySelector('[data-testid="panel-activity"]')?.textContent).toBe('lendo arquivo');

    await act(async () => {
      root.unmount();
    });
  });

  it('agente removido do Record limpa seleção e o painel some com aviso', async () => {
    ingestAndRecord(connected('agent-dev', { name: 'Developer' }));
    useSelectionStore.getState().select('agent-dev');
    const next = { ...useProjectedStore.getState() };
    next.agents = {};
    useProjectedStore.getState().loadState(next);
    useSelectionStore.getState().syncWithAgents(useProjectedStore.getState().agents);

    const { host, root } = await render(
      <AgentPanel
        agents={useProjectedStore.getState().agents}
        connectionStatus="connected"
        events={getPresentationEvents()}
      />
    );

    expect(useSelectionStore.getState().selectedAgentId).toBeNull();
    expect(host.querySelector('[data-testid="selection-notice"]')?.textContent).toMatch(/removido/);
    expect(host.querySelector('[data-testid="panel-status"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('agente desconectado limpa seleção e mostra aviso', async () => {
    ingestAndRecord(connected('agent-dev', { name: 'Developer' }));
    useSelectionStore.getState().select('agent-dev');
    ingestAndRecord({
      eventId: 'evt-dc',
      version: 1,
      type: 'agent.disconnected',
      occurredAt: '2026-08-31T12:05:00.000Z',
      workspaceId: 'ws-1',
      source: 'test',
      entityId: 'agent-dev',
      payload: { name: 'Developer' },
    });

    const { host, root } = await render(
      <AgentPanel
        agents={useProjectedStore.getState().agents}
        connectionStatus="connected"
        events={getPresentationEvents()}
      />
    );

    expect(useSelectionStore.getState().selectedAgentId).toBeNull();
    expect(host.querySelector('[data-testid="selection-notice"]')?.textContent).toMatch(/desconectado/);

    await act(async () => {
      root.unmount();
    });
  });

  it('lista vazia mostra mensagem clara', async () => {
    const { host, root } = await render(<AgentList agents={{}} statusFilter="all" />);
    expect(host.querySelector('[data-testid="empty-agents"]')?.textContent).toMatch(/Nenhum agente projetado/);
    await act(async () => {
      root.unmount();
    });
  });

  it('timeline lista campos, ordena por tempo e respeita o ring buffer', async () => {
    ingestAndRecord([
      {
        eventId: 'old',
        version: 1,
        type: 'agent.connected',
        occurredAt: '2026-08-31T12:00:00.000Z',
        workspaceId: 'ws-1',
        source: 'test',
        entityId: 'agent-dev',
        payload: { name: 'Developer', status: 'idle' },
      },
      {
        eventId: 'new',
        version: 1,
        type: 'agent.status_changed',
        occurredAt: '2026-08-31T12:10:00.000Z',
        workspaceId: 'ws-1',
        source: 'test',
        entityId: 'agent-dev',
        payload: { previousStatus: 'idle', currentStatus: 'working' },
      },
    ]);

    const { host, root } = await render(
      <EventTimeline
        events={getPresentationEvents()}
        agents={useProjectedStore.getState().agents}
        statusFilter="all"
      />
    );

    const items = [...host.querySelectorAll('.event-timeline__item')];
    expect(items[0].textContent).toContain('agent.status_changed');
    expect(items[0].textContent).toContain('status:');
    expect(items[0].textContent).toContain('working');
    expect(items[1].textContent).toContain('agent.connected');
    expect(host.querySelector('[data-testid="empty-timeline"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('timeline vazia mostra mensagem', async () => {
    const { host, root } = await render(
      <EventTimeline events={[]} agents={{}} statusFilter="all" />
    );
    expect(host.querySelector('[data-testid="empty-timeline"]')?.textContent).toMatch(/Nenhum evento/);
    await act(async () => {
      root.unmount();
    });
  });

  it('filtros: todos e cada status do contrato', () => {
    const statuses: AgentStatus[] = [
      'offline',
      'idle',
      'planning',
      'working',
      'waiting',
      'blocked',
      'reviewing',
      'done',
      'error',
    ];
    const agents = statuses.map((status, i) => ({
      id: `a-${status}`,
      status,
      name: `N${i}`,
    }));

    expect(filterAgentsByStatus(agents, 'all')).toHaveLength(9);
    for (const status of statuses) {
      const filtered = filterAgentsByStatus(agents, status);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].status).toBe(status);
    }
  });

  it('filtro na lista esconde os demais status', async () => {
    ingestAndRecord([
      connected('agent-idle', { name: 'Idle', status: 'idle' }),
      connected('agent-work', { name: 'Work', status: 'working' }),
    ]);
    const { host, root } = await render(
      <AgentList agents={useProjectedStore.getState().agents} statusFilter="working" />
    );
    expect(host.querySelector('[data-testid="agent-list-item-agent-work"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="agent-list-item-agent-idle"]')).toBeNull();
    await act(async () => {
      root.unmount();
    });
  });

  it('provider/model unknown são exibidos como desconhecido, não escondidos', async () => {
    expect(displayProviderOrModel('unknown')).toBe('desconhecido');
    ingestAndRecord(
      connected('agent-qa', { name: 'QA', provider: 'unknown', model: 'unknown', status: 'waiting' })
    );
    useSelectionStore.getState().select('agent-qa');
    const agents = useProjectedStore.getState().agents;
    const { host, root } = await render(
      <>
        <AgentList agents={agents} statusFilter="all" />
        <AgentPanel agents={agents} connectionStatus="connected" events={getPresentationEvents()} />
      </>
    );
    expect(host.querySelector('[data-testid="panel-provider"]')?.textContent).toBe('desconhecido');
    expect(host.querySelector('[data-testid="panel-model"]')?.textContent).toBe('desconhecido');
    expect(host.textContent).toContain('desconhecido');
    expect(host.textContent).not.toMatch(/unknown/);

    await act(async () => {
      root.unmount();
    });
  });

  it('banner de conexão offline/error', async () => {
    const offline = await render(<ConnectionBanner connectionStatus="disconnected" />);
    expect(offline.host.querySelector('[data-testid="connection-banner"]')?.textContent).toMatch(
      /desconectado/
    );
    await act(async () => {
      offline.root.unmount();
    });

    const error = await render(<ConnectionBanner connectionStatus="error" />);
    expect(error.host.querySelector('[data-testid="connection-banner"]')?.textContent).toMatch(/erro/);
    await act(async () => {
      error.root.unmount();
    });

    const ok = await render(<ConnectionBanner connectionStatus="connected" />);
    expect(ok.host.querySelector('[data-testid="connection-banner"]')).toBeNull();
    await act(async () => {
      ok.root.unmount();
    });
  });

  it('atualização de status reflete em lista + painel + timeline', async () => {
    ingestAndRecord(connected('agent-dev', { name: 'Developer', status: 'idle' }));
    useSelectionStore.getState().select('agent-dev');

    const first = await render(
      <>
        <AgentList agents={useProjectedStore.getState().agents} statusFilter="all" />
        <AgentPanel
          agents={useProjectedStore.getState().agents}
          connectionStatus="connected"
          events={getPresentationEvents()}
        />
        <EventTimeline
          events={getPresentationEvents()}
          agents={useProjectedStore.getState().agents}
          statusFilter="all"
        />
      </>
    );
    expect(first.host.querySelector('[data-testid="panel-status"]')?.textContent).toContain('idle');
    await act(async () => {
      first.root.unmount();
    });

    ingestAndRecord({
      eventId: 'evt-st',
      version: 1,
      type: 'agent.status_changed',
      occurredAt: '2026-08-31T12:20:00.000Z',
      workspaceId: 'ws-1',
      source: 'test',
      entityId: 'agent-dev',
      payload: { previousStatus: 'idle', currentStatus: 'blocked', statusConfidence: 'low' },
    });

    const { host, root } = await render(
      <>
        <AgentList agents={useProjectedStore.getState().agents} statusFilter="all" />
        <AgentPanel
          agents={useProjectedStore.getState().agents}
          connectionStatus="connected"
          events={getPresentationEvents()}
        />
        <EventTimeline
          events={getPresentationEvents()}
          agents={useProjectedStore.getState().agents}
          statusFilter="all"
        />
      </>
    );

    expect(useProjectedStore.getState().agents['agent-dev'].status).toBe('blocked');
    expect(host.querySelector('[data-testid="panel-status"]')?.textContent).toContain('blocked');
    expect(host.querySelector('[data-testid="agent-list-item-agent-dev"]')?.textContent).toContain(
      'blocked'
    );
    expect(host.textContent).toContain('agent.status_changed');
    expect(host.querySelector('[data-testid="panel-confidence"]')?.textContent).toBe('low');

    await act(async () => {
      root.unmount();
    });
  });

  it('atualização de atividade aparece no painel via eventLog', async () => {
    ingestAndRecord(connected('agent-dev', { name: 'Developer', status: 'working' }));
    useSelectionStore.getState().select('agent-dev');
    ingestAndRecord({
      eventId: 'evt-act',
      version: 1,
      type: 'activity.started',
      occurredAt: '2026-08-31T12:21:00.000Z',
      workspaceId: 'ws-1',
      source: 'test',
      actorId: 'agent-dev',
      entityId: 'act-1',
      payload: { agentId: 'agent-dev', type: 'escrevendo testes' },
    });

    const { host, root } = await render(
      <AgentPanel
        agents={useProjectedStore.getState().agents}
        connectionStatus="connected"
        events={getPresentationEvents()}
      />
    );
    expect(host.querySelector('[data-testid="panel-activity"]')?.textContent).toBe('escrevendo testes');

    await act(async () => {
      root.unmount();
    });
  });

  it('feeder fake anexa no eventLog e simula atividade/remoção', () => {
    startStoreFeeder({ mode: 'fake', sseUrl: '' });
    expect(getPresentationEvents().length).toBeGreaterThan(0);
    expect(useProjectedStore.getState().agents['agent-dev']).toBeDefined();

    useSelectionStore.getState().select('agent-qa');
    getActiveFeeder()?.simulateRemoveAgent('agent-qa');
    expect(useProjectedStore.getState().agents['agent-qa']?.status).toBe('offline');
    expect(useSelectionStore.getState().selectedAgentId).toBeNull();

    getActiveFeeder()?.simulateActivityChange('agent-dev', 'nova atividade');
    const extras = getPresentationEvents().some(
      (e) => e.type === 'activity.started' && e.payload.type === 'nova atividade'
    );
    expect(extras).toBe(true);
  });

  it('StatusFilter renderiza todos os status do contrato', async () => {
    const { host, root } = await render(
      <StatusFilter value="all" onChange={() => undefined} />
    );
    expect(host.querySelector('[data-testid="status-filter-all"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="status-filter-reviewing"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="status-filter-done"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="status-filter-error"]')).toBeTruthy();
    await act(async () => {
      root.unmount();
    });
  });
});
