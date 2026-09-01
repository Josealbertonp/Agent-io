/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useProjectedStore } from '../domain';
import { resetSelectionStore, useSelectionStore } from './selectionStore';

const destroy = vi.fn();
const refresh = vi.fn();

const { applyViews, setSelected, setOnAgentClick, getScene } = vi.hoisted(() => {
  const applyViews = vi.fn();
  const setSelected = vi.fn();
  const setOnAgentClick = vi.fn();
  const getScene = vi.fn(() => ({
    applyViews,
    setSelected,
    setOnAgentClick,
    isOfficeReady: () => true,
    events: { once: vi.fn() },
  }));
  return { applyViews, setSelected, setOnAgentClick, getScene };
});

vi.mock('phaser', () => {
  class Scene {}
  const Game = vi.fn().mockImplementation((config: { callbacks?: { postBoot?: (game: unknown) => void } }) => {
    const instance = {
      destroy,
      scale: { refresh },
      scene: { getScene },
      events: { once: vi.fn() },
    };
    queueMicrotask(() => config.callbacks?.postBoot?.(instance));
    return instance;
  });
  return {
    default: {
      AUTO: 0,
      Scale: { FIT: 1, CENTER_BOTH: 2 },
      Game,
      Scene,
    },
    Scene,
  };
});

vi.mock('../scene/OfficeScene', () => ({
  OfficeScene: class {},
  OFFICE_SCENE_KEY: 'OfficeScene',
  OFFICE_READY_EVENT: 'office-ready',
}));

describe('OfficeCanvas (jsdom)', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    useProjectedStore.getState().reset();
    resetSelectionStore();
    applyViews.mockClear();
    setSelected.mockClear();
    setOnAgentClick.mockClear();
    getScene.mockClear();
    destroy.mockClear();
  });

  afterEach(() => {
    useProjectedStore.getState().reset();
    resetSelectionStore();
    document.body.innerHTML = '';
  });

  it('monta o host e destrói o Phaser.Game no unmount', async () => {
    const { OfficeCanvas } = await import('./OfficeCanvas');
    const Phaser = (await import('phaser')).default;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<OfficeCanvas />);
    });

    expect(document.querySelector('[data-testid="office-canvas"]')).toBeTruthy();
    expect(Phaser.Game).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    expect(destroy).toHaveBeenCalledWith(true);
  });

  it('subscribe da store chama applyViews na cena com as views novas', async () => {
    const { OfficeCanvas } = await import('./OfficeCanvas');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<OfficeCanvas />);
    });

    applyViews.mockClear();

    await act(async () => {
      useProjectedStore.getState().ingest({
        eventId: 'evt-canvas-sync',
        version: 1,
        type: 'agent.connected',
        occurredAt: '2026-08-31T12:00:00.000Z',
        workspaceId: 'ws-1',
        source: 'test',
        entityId: 'agent-sync',
        payload: {
          name: 'Sync Bot',
          role: 'Tester',
          status: 'working',
          provider: 'cursor',
          model: 'test',
          position: { x: 3, y: 5 },
        },
      });
    });

    expect(applyViews).toHaveBeenCalled();
    const views = applyViews.mock.calls.at(-1)?.[0] as Array<{ id: string; status: string; label: string }>;
    expect(views.some((v) => v.id === 'agent-sync' && v.status === 'working' && v.label === 'Sync Bot')).toBe(
      true
    );

    await act(async () => {
      root.unmount();
    });
  });

  it('pushViewsToScene empurra o view-model atual para a cena mockada', async () => {
    const { pushViewsToScene } = await import('./OfficeCanvas');
    useProjectedStore.getState().ingest({
      eventId: 'evt-push',
      version: 1,
      type: 'agent.connected',
      occurredAt: '2026-08-31T12:00:00.000Z',
      workspaceId: 'ws-1',
      source: 'test',
      entityId: 'agent-push',
      payload: {
        name: 'Push Agent',
        role: 'Dev',
        status: 'idle',
        provider: 'openai',
        model: 'gpt-4o',
        position: { x: 7, y: 5 },
      },
    });

    pushViewsToScene({ scene: { getScene } });

    expect(getScene).toHaveBeenCalledWith('OfficeScene');
    expect(applyViews).toHaveBeenCalled();
    const views = applyViews.mock.calls.at(-1)?.[0] as Array<{ id: string; status: string }>;
    expect(views).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'agent-push', status: 'idle' })])
    );
  });

  it('clique no marcador (pointer) seleciona o mesmo id no selectionStore', async () => {
    const { OfficeCanvas, bindSceneAgentClick } = await import('./OfficeCanvas');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<OfficeCanvas />);
    });

    expect(setOnAgentClick).toHaveBeenCalled();
    const handler = setOnAgentClick.mock.calls.at(-1)?.[0] as (id: string) => void;
    await act(async () => {
      handler('agent-phaser');
    });
    expect(useSelectionStore.getState().selectedAgentId).toBe('agent-phaser');

    bindSceneAgentClick({ scene: { getScene } }, (id) => useSelectionStore.getState().select(id));
    await act(async () => {
      const bound = setOnAgentClick.mock.calls.at(-1)?.[0] as (id: string) => void;
      bound('agent-bound');
    });
    expect(useSelectionStore.getState().selectedAgentId).toBe('agent-bound');

    await act(async () => {
      root.unmount();
    });
  });

  it('mudança no selectionStore empurra setSelected para a cena', async () => {
    const { OfficeCanvas, pushSelectionToScene } = await import('./OfficeCanvas');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<OfficeCanvas />);
    });

    setSelected.mockClear();
    await act(async () => {
      useSelectionStore.getState().select('agent-list');
    });
    expect(setSelected).toHaveBeenCalledWith('agent-list');

    pushSelectionToScene({ scene: { getScene } }, 'agent-focus');
    expect(setSelected).toHaveBeenCalledWith('agent-focus');

    await act(async () => {
      root.unmount();
    });
  });
});
