import { describe, expect, it } from 'vitest';
import { Agent } from '../contracts';
import { buildAgentViews } from './agentViewModel';
import { createOfficeDemoSnapshot } from './demoWorkspace';
import {
  boxesOverlap,
  overlappingLabelPairs,
  LABEL,
  LABEL_BOX_WIDTH,
  ellipsis,
} from './labelLayout';
import { buildWallLayer, isRoomWallCell, MAP_HEIGHT, MAP_WIDTH, ROOM_TILE } from './officeMap';

function asAgents(): Agent[] {
  return Object.values(createOfficeDemoSnapshot().agents).map((agent) => ({
    id: agent.id,
    workspaceId: agent.workspaceId,
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    role: agent.role,
    status: agent.status,
    position: agent.position,
  }));
}

describe('labelLayout — demo sem colisão', () => {
  it('ellipsis corta no limite', () => {
    expect(ellipsis('ok', 5)).toBe('ok');
    expect(ellipsis('Implementador', 11)).toBe('Implementa…');
  });

  it('demo agents have no intersecting name labels', () => {
    const views = buildAgentViews(asAgents());
    expect(views).toHaveLength(6);
    expect(overlappingLabelPairs(views)).toEqual([]);
  });

  it('name labels sit above the marker without a meta block', () => {
    const views = buildAgentViews(asAgents());
    for (const view of views) {
      const nameBottom = view.y + LABEL.nameOffsetY;
      const nameTop = nameBottom - LABEL.nameHeight;
      expect(nameTop).toBeLessThan(nameBottom);
      expect(nameBottom).toBeLessThan(view.y);
    }
  });

  it('boxesOverlap detecta interseção real', () => {
    const a = { id: 'a', kind: 'meta' as const, left: 0, top: 0, right: 10, bottom: 10 };
    const b = { id: 'b', kind: 'meta' as const, left: 9, top: 9, right: 20, bottom: 20 };
    const c = { id: 'c', kind: 'meta' as const, left: 40, top: 0, right: 50, bottom: 10 };
    expect(boxesOverlap(a, b)).toBe(true);
    expect(boxesOverlap(a, c)).toBe(false);
    expect(LABEL_BOX_WIDTH).toBeLessThan(64);
  });
});

describe('officeMap — contorno da sala', () => {
  it('parede contínua na borda (topo, laterais, base) e piso interno sem parede', () => {
    const walls = buildWallLayer();
    expect(walls).toHaveLength(MAP_HEIGHT);
    expect(walls[0]).toHaveLength(MAP_WIDTH);

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const expected = isRoomWallCell(x, y) ? ROOM_TILE.WALL_SOLID : ROOM_TILE.EMPTY;
        expect(walls[y][x]).toBe(expected);
      }
    }

    const top = walls[0].every((t) => t === ROOM_TILE.WALL_SOLID);
    const bottom = walls[MAP_HEIGHT - 1].every((t) => t === ROOM_TILE.WALL_SOLID);
    const sides = walls.every(
      (row) => row[0] === ROOM_TILE.WALL_SOLID && row[MAP_WIDTH - 1] === ROOM_TILE.WALL_SOLID
    );
    expect(top && bottom && sides).toBe(true);
    expect(walls[8][14]).toBe(ROOM_TILE.EMPTY);
  });
});
