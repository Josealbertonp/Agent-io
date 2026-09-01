import type { AgentView } from './agentViewModel';

/**
 * Métricas do rótulo no espaço de mundo (antes do zoom).
 * Phaser e os testes de colisão usam os mesmos números.
 */
export const LABEL = {
  maxWidth: 44,
  padX: 1,
  padY: 0,
  nameFontPx: 7,
  metaFontPx: 6,
  nameMaxChars: 12,
  statusMaxChars: 12,
  roleMaxChars: 13,
  badgeMaxChars: 13,
  nameOffsetY: -12,
  metaOffsetY: 9,
  nameHeight: 10,
  metaLineHeight: 8,
  metaLines: 3,
  staggerDy: 12,
} as const;

export const LABEL_BOX_WIDTH = LABEL.maxWidth + LABEL.padX * 2;
export const LABEL_META_HEIGHT = LABEL.metaLineHeight * LABEL.metaLines + LABEL.padY * 2;

export interface LabelBox {
  id: string;
  kind: 'name' | 'meta';
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function ellipsis(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return '…';
  return `${text.slice(0, maxChars - 1)}…`;
}

export function formatStatusLine(view: Pick<AgentView, 'statusVisual'>): string {
  return ellipsis(`${view.statusVisual.icon} ${view.statusVisual.label}`, LABEL.statusMaxChars);
}

export function formatRoleLine(view: Pick<AgentView, 'role'>): string {
  return ellipsis(view.role, LABEL.roleMaxChars);
}

export function formatBadgeLine(view: Pick<AgentView, 'providerBadge'>): string {
  return ellipsis(view.providerBadge, LABEL.badgeMaxChars);
}

export function formatNameLine(view: Pick<AgentView, 'label'>): string {
  return ellipsis(view.label, LABEL.nameMaxChars);
}

export function formatMetaBlock(view: Pick<AgentView, 'role' | 'statusVisual' | 'providerBadge'>): string {
  return [formatStatusLine(view), formatRoleLine(view), formatBadgeLine(view)].join('\n');
}

export function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function nameBox(id: string, x: number, y: number): LabelBox {
  const half = LABEL_BOX_WIDTH / 2;
  const bottom = y + LABEL.nameOffsetY;
  return {
    id: `${id}:name`,
    kind: 'name',
    left: x - half,
    right: x + half,
    top: bottom - LABEL.nameHeight,
    bottom,
  };
}

function metaBox(id: string, x: number, y: number, metaOffsetY: number): LabelBox {
  const half = LABEL_BOX_WIDTH / 2;
  const top = y + metaOffsetY;
  return {
    id: `${id}:meta`,
    kind: 'meta',
    left: x - half,
    right: x + half,
    top,
    bottom: top + LABEL_META_HEIGHT,
  };
}

/**
 * Resolve offset vertical do bloco inferior.
 * Se dois metas ainda colidirem no default, aplica stagger alternado (ímpar +dy).
 */
export function resolveMetaOffsets(views: readonly Pick<AgentView, 'id' | 'x' | 'y'>[]): Map<string, number> {
  const sorted = [...views].sort((a, b) => a.id.localeCompare(b.id));
  const offsets = new Map<string, number>();
  for (const view of sorted) {
    offsets.set(view.id, LABEL.metaOffsetY);
  }

  const metas = () =>
    sorted.map((view) => metaBox(view.id, view.x, view.y, offsets.get(view.id) ?? LABEL.metaOffsetY));

  const current = metas();
  let collided = false;
  for (let i = 0; i < current.length; i++) {
    for (let j = i + 1; j < current.length; j++) {
      if (boxesOverlap(current[i], current[j])) {
        collided = true;
        break;
      }
    }
    if (collided) break;
  }

  if (collided) {
    sorted.forEach((view, index) => {
      if (index % 2 === 1) {
        offsets.set(view.id, LABEL.metaOffsetY + LABEL.staggerDy);
      }
    });
  }

  return offsets;
}

export function agentLabelBoxes(views: readonly Pick<AgentView, 'id' | 'x' | 'y'>[]): LabelBox[] {
  return views.map((view) => nameBox(view.id, view.x, view.y));
}

export function overlappingLabelPairs(views: readonly Pick<AgentView, 'id' | 'x' | 'y'>[]): [LabelBox, LabelBox][] {
  const boxes = agentLabelBoxes(views);
  const pairs: [LabelBox, LabelBox][] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].id.split(':')[0] === boxes[j].id.split(':')[0]) continue;
      if (boxesOverlap(boxes[i], boxes[j])) {
        pairs.push([boxes[i], boxes[j]]);
      }
    }
  }
  return pairs;
}
