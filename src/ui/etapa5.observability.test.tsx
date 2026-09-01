/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act, type ReactNode } from 'react';
import { Event } from '../contracts';
import { useProjectedStore } from '../domain';
import { SseEventClient } from '../bridge/client';
import { ConnectionBanner } from './ConnectionBanner';
import { EventTimeline } from './EventTimeline';
import { AgentList } from './AgentList';
import { AgentPanel } from './AgentPanel';
import { getPresentationEvents, resetEventLog } from './eventLog';
import {
  ingestAndRecord,
  startStoreFeeder,
  stopStoreFeeder,
} from './feedProjectedStore';
import { getFeedTransport, resetFeedTransport } from './feedTransport';
import { resetSelectionStore, useSelectionStore } from './selectionStore';

type PhaserSceneHost = {
  scene: { getScene(key: string): unknown };
};

function evt(partial: Partial<Event> & Pick<Event, 'eventId' | 'type'>): Event {
  return {
    version: 1,
    occurredAt: '2026-08-31T12:00:00.000Z',
    workspaceId: 'ws-1',
    source: 'maestri',
    payload: {},
    ...partial,
  };
}

async function render(node: ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
  return { host, root };
}

describe('Etapa 5 — observabilidade em tempo real', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    useProjectedStore.getState().reset();
    resetEventLog();
    resetSelectionStore();
    resetFeedTransport();
    stopStoreFeeder();
  });

  afterEach(() => {
    stopStoreFeeder();
    useProjectedStore.getState().reset();
    resetEventLog();
    resetSelectionStore();
    resetFeedTransport();
    document.body.innerHTML = '';
  });

  it('SSE real → projection via ingestAndRecord', () => {
    ingestAndRecord(
      evt({
        eventId: 'live-1',
        type: 'agent.connected',
        entityId: 'agent-live',
        actorId: 'agent-live',
        payload: {
          name: 'Live',
          status: 'working',
          statusConfidence: 'high',
          statusEvidence: 'cli',
          provider: 'unknown',
          model: 'unknown',
        },
      })
    );
    const agent = useProjectedStore.getState().agents['agent-live'];
    expect(agent?.status).toBe('working');
    expect(agent?.metadata?.statusConfidence).toBeUndefined();
    expect(getPresentationEvents().some((e) => e.eventId === 'live-1')).toBe(true);
  });

  it('evento chegando atualiza lista, painel e timeline', async () => {
    ingestAndRecord(
      evt({
        eventId: 'ui-1',
        type: 'agent.connected',
        entityId: 'agent-dev',
        actorId: 'agent-dev',
        payload: { name: 'Developer', status: 'idle' },
      })
    );
    useSelectionStore.getState().select('agent-dev');

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

    expect(host.textContent).toContain('Developer');
    expect(host.textContent).toContain('agent.connected');

    await act(async () => {
      ingestAndRecord(
        evt({
          eventId: 'ui-2',
          type: 'agent.status_changed',
          entityId: 'agent-dev',
          payload: { previousStatus: 'idle', currentStatus: 'working' },
        })
      );
      root.render(
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
    });

    expect(useProjectedStore.getState().agents['agent-dev'].status).toBe('working');
    expect(host.textContent).toContain('agent.status_changed');
    await act(async () => {
      root.unmount();
    });
  });

  it('agente entra e sai da projeção e da timeline', () => {
    ingestAndRecord(
      evt({
        eventId: 'in-1',
        type: 'agent.connected',
        entityId: 'agent-new',
        payload: { name: 'Novo', status: 'idle' },
      })
    );
    expect(useProjectedStore.getState().agents['agent-new']).toBeDefined();
    ingestAndRecord(
      evt({
        eventId: 'out-1',
        type: 'agent.disconnected',
        entityId: 'agent-new',
        payload: { name: 'Novo' },
      })
    );
    expect(useProjectedStore.getState().agents['agent-new']?.status).toBe('offline');
    expect(getPresentationEvents().map((e) => e.type)).toEqual([
      'agent.connected',
      'agent.disconnected',
    ]);
  });

  it('replay duplicado não duplica timeline nem agentes', () => {
    const connected = evt({
      eventId: 'rep-1',
      type: 'agent.connected',
      entityId: 'agent-rep',
      payload: { name: 'Rep', status: 'idle' },
    });
    ingestAndRecord(connected);
    ingestAndRecord(connected);
    expect(getPresentationEvents()).toHaveLength(1);
    expect(Object.keys(useProjectedStore.getState().agents)).toEqual(['agent-rep']);
  });

  it('Phaser recebe views após ingest (sync)', () => {
    const applyViews = vi.fn();
    const game: PhaserSceneHost = {
      scene: {
        getScene: () => ({ applyViews, isOfficeReady: () => true }),
      },
    };
    ingestAndRecord(
      evt({
        eventId: 'ph-1',
        type: 'agent.connected',
        entityId: 'agent-ph',
        payload: { name: 'Phaser', status: 'working', position: { x: 2, y: 2 } },
      })
    );
    const scene = game.scene.getScene('OfficeScene') as { applyViews?: (views: unknown) => void };
    scene.applyViews?.(
      Object.values(useProjectedStore.getState().agents).map((agent) => ({
        id: agent.id,
        status: agent.status,
      }))
    );
    expect(applyViews).toHaveBeenCalled();
    const views = applyViews.mock.calls[0][0] as Array<{ id: string }>;
    expect(views.some((v) => v.id === 'agent-ph')).toBe(true);
  });

  it('banner distingue demo, ao vivo, reconectando e erro', async () => {
    const demo = await render(
      <ConnectionBanner connectionStatus="connected" feedMode="fake" transportStatus="connected" />
    );
    expect(demo.host.textContent).toMatch(/Demo \(fake\)/);
    await act(async () => {
      demo.root.unmount();
    });

    const live = await render(
      <ConnectionBanner connectionStatus="connected" feedMode="sse" transportStatus="connected" />
    );
    expect(live.host.textContent).toMatch(/Ao vivo/);
    await act(async () => {
      live.root.unmount();
    });

    const recon = await render(
      <ConnectionBanner
        connectionStatus="connected"
        feedMode="sse"
        transportStatus="reconnecting"
        transportDetail="network down"
      />
    );
    expect(recon.host.textContent).toMatch(/reconectando/);
    expect(recon.host.querySelector('[data-testid="connection-banner"]')?.className).toContain(
      'connection-banner--warn'
    );
    await act(async () => {
      recon.root.unmount();
    });

    const down = await render(
      <ConnectionBanner connectionStatus="error" feedMode="sse" transportStatus="disconnected" />
    );
    expect(down.host.textContent).toMatch(/desconectado|erro/);
    await act(async () => {
      down.root.unmount();
    });
  });

  it('Maestri indisponível projeta connection error sem inventar agentes', () => {
    ingestAndRecord(
      evt({
        eventId: 'cx-err',
        type: 'connection.status_changed',
        payload: { status: 'error', previousStatus: 'connected' },
      })
    );
    expect(useProjectedStore.getState().connectionStatus).toBe('error');
    expect(Object.keys(useProjectedStore.getState().agents)).toHaveLength(0);
  });

  it('modo SSE conecta cliente e ingere frame (Last-Event-ID após primeiro evento)', async () => {
    const frame =
      'id: sse-live\nevent: agent.connected\ndata: ' +
      JSON.stringify(
        evt({
          eventId: 'sse-live',
          type: 'agent.connected',
          entityId: 'agent-sse',
          payload: { name: 'SSE', status: 'idle' },
        })
      ) +
      '\n\n';
    let headerSent: string | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      headerSent = (init?.headers as Record<string, string> | undefined)?.['Last-Event-ID'];
      return new Response(frame, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    };

    const received: Event[] = [];
    const client = new SseEventClient({
      url: 'http://127.0.0.1:3999/events',
      onEvent: (event) => {
        received.push(event);
        ingestAndRecord(event);
        client.close();
      },
      fetchImpl,
      jitterRatio: 0,
      reconnectIntervalMs: 5,
      sleepFn: async () => undefined,
    });
    client.connect();
    const deadline = Date.now() + 1500;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(received[0]?.eventId).toBe('sse-live');
    expect(useProjectedStore.getState().agents['agent-sse']?.name).toBe('SSE');
    expect(client.getLastEventId()).toBe('sse-live');
    expect(headerSent).toBeUndefined();
    client.close();
  });

  it('feeder SSE atualiza transporte para connecting', () => {
    startStoreFeeder({ mode: 'sse', sseUrl: 'http://127.0.0.1:1/events' });
    expect(getFeedTransport().status).toBe('connecting');
    stopStoreFeeder();
    expect(getFeedTransport().status).toBe('disconnected');
  });
});
