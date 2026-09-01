import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { useProjectedStore } from '../domain';
import { resetAgentViewCache, selectAgentViews } from '../view/agentViewModel';
import { OFFICE_VIEW } from '../view/officeMap';
import { OfficeScene, OFFICE_READY_EVENT, OFFICE_SCENE_KEY } from '../scene/OfficeScene';
import { useSelectionStore } from './selectionStore';

export interface PhaserSceneHost {
  scene: { getScene(key: string): unknown };
}

export type OfficeSceneHandle = {
  applyViews?: OfficeScene['applyViews'];
  setSelected?: OfficeScene['setSelected'];
  setOnAgentClick?: OfficeScene['setOnAgentClick'];
  isOfficeReady?: () => boolean;
  events?: { once: (event: string, fn: () => void) => void };
};

export function getOfficeScene(game: PhaserSceneHost): OfficeSceneHandle | undefined {
  return game.scene.getScene(OFFICE_SCENE_KEY) as OfficeSceneHandle | undefined;
}

export function pushViewsToScene(game: PhaserSceneHost): void {
  const scene = getOfficeScene(game);
  if (!scene?.applyViews) return;
  scene.applyViews(selectAgentViews(useProjectedStore.getState().agents));
}

export function pushSelectionToScene(game: PhaserSceneHost, selectedId: string | null): void {
  const scene = getOfficeScene(game);
  scene?.setSelected?.(selectedId);
}

export function bindSceneAgentClick(game: PhaserSceneHost, onSelect: (id: string) => void): void {
  const scene = getOfficeScene(game);
  scene?.setOnAgentClick?.(onSelect);
}

function attachSceneSync(game: Phaser.Game): void {
  const scene = getOfficeScene(game);
  if (!scene) return;
  scene.events?.once(OFFICE_READY_EVENT, () => {
    pushViewsToScene(game);
    pushSelectionToScene(game, useSelectionStore.getState().selectedAgentId);
    bindSceneAgentClick(game, (id) => useSelectionStore.getState().select(id));
  });
  if (scene.isOfficeReady?.()) {
    pushViewsToScene(game);
    pushSelectionToScene(game, useSelectionStore.getState().selectedAgentId);
    bindSceneAgentClick(game, (id) => useSelectionStore.getState().select(id));
  }
}

/**
 * React dono do ciclo de vida; Phaser dono da cena 2D.
 * Assina o ProjectedStore (views) e o selectionStore (highlight). Sem estado canônico na cena.
 */
export function OfficeCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;

    let cancelled = false;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: OFFICE_VIEW.width,
      height: OFFICE_VIEW.height,
      backgroundColor: '#121218',
      pixelArt: true,
      antialias: false,
      scene: [OfficeScene],
      scale: {
        mode: Phaser.Scale.ENVELOP,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        zoom: 1,
      },
      callbacks: {
        postBoot: (booted) => {
          if (cancelled) return;
          attachSceneSync(booted);
        },
      },
    });
    gameRef.current = game;

    const unsubAgents = useProjectedStore.subscribe((state, previous) => {
      if (cancelled) return;
      if (state.agents === previous.agents) return;
      pushViewsToScene(game);
    });

    const unsubSelection = useSelectionStore.subscribe((state, previous) => {
      if (cancelled) return;
      if (state.selectedAgentId === previous.selectedAgentId) return;
      pushSelectionToScene(game, state.selectedAgentId);
    });

    const onResize = () => {
      game.scale.refresh();
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      unsubAgents();
      unsubSelection();
      resetAgentViewCache();
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      ref={hostRef}
      data-testid="office-canvas"
      className="office-canvas-host"
      style={{ width: '100%', height: '100%', minHeight: 0, overflow: 'hidden' }}
    />
  );
}
