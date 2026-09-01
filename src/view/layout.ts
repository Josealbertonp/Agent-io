import { Agent } from '../contracts';
import { fallbackSlots, tileToPixelCenter } from './officeMap';

export interface LayoutPoint {
  x: number;
  y: number;
  usedFallback: boolean;
}

function posKey(x: number, y: number): string {
  return `${x},${y}`;
}

function isUnsetPosition(x: number, y: number): boolean {
  return x === 0 && y === 0;
}

/**
 * Posição visual derivada de Agent.position.
 *
 * Fonte real continua sendo Agent.position no ProjectedState.
 * Fallback determinístico (grade de estações, ordenada por id) quando:
 * - a posição é {0,0} (tratada como não atribuída);
 * - dois ou mais agentes compartilham a mesma position.
 */
export function resolveViewPositions(agents: readonly Agent[]): Map<string, LayoutPoint> {
  const sorted = [...agents].sort((a, b) => a.id.localeCompare(b.id));
  const groups = new Map<string, Agent[]>();

  for (const agent of sorted) {
    const key = posKey(agent.position.x, agent.position.y);
    const list = groups.get(key);
    if (list) list.push(agent);
    else groups.set(key, [agent]);
  }

  const result = new Map<string, LayoutPoint>();
  const slots = fallbackSlots();
  let nextSlot = 0;

  const takeSlot = (): { x: number; y: number } => {
    const slot = slots[nextSlot % slots.length];
    const extra = Math.floor(nextSlot / slots.length);
    nextSlot += 1;
    return tileToPixelCenter(slot.tileX + extra, slot.tileY);
  };

  for (const agent of sorted) {
    const key = posKey(agent.position.x, agent.position.y);
    const group = groups.get(key) ?? [];
    const collide = group.length > 1;
    const unset = isUnsetPosition(agent.position.x, agent.position.y);

    if (unset || collide) {
      const pixel = takeSlot();
      result.set(agent.id, { ...pixel, usedFallback: true });
    } else {
      result.set(agent.id, {
        ...tileToPixelCenter(agent.position.x, agent.position.y),
        usedFallback: false,
      });
    }
  }

  return result;
}
