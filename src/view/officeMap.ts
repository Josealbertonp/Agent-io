/**
 * Mapa estático do escritório (tiles LimeZu Room Builder + estações).
 * Índices referem-se a Room_Builder_Office_16x16.png (16 colunas).
 */

export const TILE_SIZE = 16;
export const MAP_WIDTH = 28;
export const MAP_HEIGHT = 18;
export const MAP_ZOOM = 2;

export const CANVAS_WIDTH = MAP_WIDTH * TILE_SIZE * MAP_ZOOM;
export const CANVAS_HEIGHT = MAP_HEIGHT * TILE_SIZE * MAP_ZOOM;

/**
 * Composed camera shot: crop the outer wall field so desks and zones fill the stage.
 * World size stays MAP_WIDTH × MAP_HEIGHT.
 */
export const OFFICE_VIEW = {
  scrollX: TILE_SIZE,
  scrollY: TILE_SIZE,
  width: (MAP_WIDTH - 2) * TILE_SIZE,
  height: (MAP_HEIGHT - 2) * TILE_SIZE,
} as const;

/** Índices no tileset room-builder (16x16, 16 colunas). */
export const ROOM_TILE = {
  EMPTY: -1,
  WALL_OUTLINE: 1,
  WALL_TOP: 10,
  /** Tan — contraste com o piso lilás (176). */
  WALL_SOLID: 144,
  WALL_FILL: 80,
  FLOOR: 176,
  FLOOR_ALT: 177,
  FLOOR_DARK: 122,
  FLOOR_LOUNGE: 186,
} as const;

export interface Workstation {
  id: string;
  tileX: number;
  tileY: number;
  kind: 'desk' | 'lounge';
}

/**
 * 3 estações por fileira, ~9 tiles de vão (~144px) para os rótulos caberem.
 * O agente senta um tile à frente da mesa (tileY + 1).
 */
export const WORKSTATIONS: readonly Workstation[] = [
  { id: 'desk-a', tileX: 5, tileY: 5, kind: 'desk' },
  { id: 'desk-b', tileX: 14, tileY: 5, kind: 'desk' },
  { id: 'desk-c', tileX: 23, tileY: 5, kind: 'desk' },
  { id: 'desk-d', tileX: 5, tileY: 11, kind: 'desk' },
  { id: 'desk-e', tileX: 14, tileY: 11, kind: 'desk' },
  { id: 'desk-f', tileX: 23, tileY: 11, kind: 'desk' },
];

export interface FurnitureProp {
  key: 'desk' | 'chair' | 'plant' | 'vending' | 'bookshelf' | 'conferenceTable' | 'loungeSofa';
  tileX: number;
  tileY: number;
}

export const FURNITURE: readonly FurnitureProp[] = [
  ...WORKSTATIONS.filter((s) => s.kind === 'desk').flatMap((s) => [
    { key: 'desk' as const, tileX: s.tileX, tileY: s.tileY },
    { key: 'chair' as const, tileX: s.tileX, tileY: s.tileY + 1 },
  ]),
  { key: 'plant', tileX: 9, tileY: 3 },
  { key: 'plant', tileX: 3, tileY: 14 },
  { key: 'plant', tileX: 8, tileY: 15 },
  { key: 'plant', tileX: 18, tileY: 14 },
  { key: 'bookshelf', tileX: 9, tileY: 4 },
  { key: 'chair', tileX: 20, tileY: 8 },
  { key: 'chair', tileX: 22, tileY: 8 },
  { key: 'conferenceTable', tileX: 21, tileY: 7 },
  { key: 'loungeSofa', tileX: 5, tileY: 14 },
  { key: 'vending', tileX: 24, tileY: 14 },
];

export type OfficeZoneId = 'work' | 'meeting' | 'lounge' | 'support';

export interface OfficeZone {
  id: OfficeZoneId;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Visual zones only. Agents stay at WORKSTATIONS (not relocated by status). */
export const OFFICE_ZONES: readonly OfficeZone[] = [
  { id: 'meeting', label: 'Meeting', x: 18, y: 6, w: 9, h: 6 },
  { id: 'lounge', label: 'Lounge', x: 1, y: 13, w: 17, h: 4 },
  { id: 'support', label: 'Support', x: 18, y: 13, w: 9, h: 4 },
  { id: 'work', label: 'Work', x: 1, y: 1, w: 26, h: 12 },
];

export function zoneAtTile(x: number, y: number): OfficeZone | undefined {
  return OFFICE_ZONES.find((z) => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h);
}

export function tileToPixelCenter(tileX: number, tileY: number): { x: number; y: number } {
  return {
    x: tileX * TILE_SIZE + TILE_SIZE / 2,
    y: tileY * TILE_SIZE + TILE_SIZE / 2,
  };
}

export function isRoomWallCell(x: number, y: number): boolean {
  return x === 0 || x === MAP_WIDTH - 1 || y === 0 || y === MAP_HEIGHT - 1;
}

export function buildFloorLayer(): number[][] {
  const data: number[][] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: number[] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (isRoomWallCell(x, y)) {
        row.push(ROOM_TILE.EMPTY);
      } else {
        const zone = zoneAtTile(x, y)?.id;
        if (zone === 'lounge') row.push(ROOM_TILE.FLOOR_LOUNGE);
        else if (zone === 'support') row.push(ROOM_TILE.FLOOR_DARK);
        else if (zone === 'meeting') row.push(ROOM_TILE.FLOOR_ALT);
        else row.push(ROOM_TILE.FLOOR);
      }
    }
    data.push(row);
  }
  return data;
}

export function buildWallLayer(): number[][] {
  const data: number[][] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: number[] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      row.push(isRoomWallCell(x, y) ? ROOM_TILE.WALL_SOLID : ROOM_TILE.EMPTY);
    }
    data.push(row);
  }
  return data;
}

/** Slots de fallback (em tiles) — grade estável alinhada às estações. */
export function fallbackSlots(): { tileX: number; tileY: number }[] {
  return WORKSTATIONS.map((s) => ({ tileX: s.tileX, tileY: s.tileY + 1 }));
}
