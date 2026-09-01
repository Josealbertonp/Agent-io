import Phaser from 'phaser';
import { AgentView } from '../view/agentViewModel';
import { AgentEntityHost, syncAgentViews } from '../view/officeSync';
import {
  TILE_SIZE,
  buildFloorLayer,
  buildWallLayer,
  FURNITURE,
  OFFICE_ZONES,
} from '../view/officeMap';
import { OFFICE_ASSET_KEYS, OFFICE_ASSET_URLS } from './officeAssets';
import { AgentMarker } from './agentMarker';
import {
  CHARACTER_COUNT,
  CHARACTER_POSE_FRAMES,
  CHARACTER_SHEET,
  characterAssetKey,
  characterAssetUrl,
  poseAnimKey,
} from '../view/characterVisual';

export const OFFICE_SCENE_KEY = 'OfficeScene';
export const OFFICE_READY_EVENT = 'office-ready';

/**
 * Cena 2D do escritório. Lê apenas AgentView[] — sem estado canônico próprio.
 */
export class OfficeScene extends Phaser.Scene implements AgentEntityHost {
  private readonly markers = new Map<string, AgentMarker>();
  private ready = false;
  private pendingViews: AgentView[] | null = null;
  private selectedId: string | null = null;
  private onAgentClick: ((id: string) => void) | null = null;

  constructor() {
    super({ key: OFFICE_SCENE_KEY });
  }

  preload(): void {
    this.load.image(OFFICE_ASSET_KEYS.roomBuilder, OFFICE_ASSET_URLS.roomBuilder);
    this.load.image(OFFICE_ASSET_KEYS.modernOffice, OFFICE_ASSET_URLS.modernOffice);
    this.load.image(OFFICE_ASSET_KEYS.desk, OFFICE_ASSET_URLS.desk);
    this.load.image(OFFICE_ASSET_KEYS.chair, OFFICE_ASSET_URLS.chair);
    this.load.image(OFFICE_ASSET_KEYS.plant, OFFICE_ASSET_URLS.plant);
    this.load.image(OFFICE_ASSET_KEYS.vending, OFFICE_ASSET_URLS.vending);
    this.load.image(OFFICE_ASSET_KEYS.bookshelf, OFFICE_ASSET_URLS.bookshelf);
    this.load.image(OFFICE_ASSET_KEYS.conferenceTable, OFFICE_ASSET_URLS.conferenceTable);
    this.load.image(OFFICE_ASSET_KEYS.loungeSofa, OFFICE_ASSET_URLS.loungeSofa);
    for (let i = 0; i < CHARACTER_COUNT; i++) {
      this.load.spritesheet(characterAssetKey(i), characterAssetUrl(i), {
        frameWidth: CHARACTER_SHEET.frameWidth,
        frameHeight: CHARACTER_SHEET.frameHeight,
      });
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a1a22');
    this.registerCharacterAnims();
    this.buildTileLayers();
    this.placeFurniture();
    this.placeZoneLabels();
    this.ready = true;
    if (this.pendingViews) {
      this.applyViews(this.pendingViews);
      this.pendingViews = null;
    }
    this.events.emit(OFFICE_READY_EVENT);
  }

  isOfficeReady(): boolean {
    return this.ready;
  }

  applyViews(views: readonly AgentView[]): void {
    if (!this.ready) {
      this.pendingViews = [...views];
      return;
    }
    syncAgentViews(this, views);
    this.applySelectedHighlight();
  }

  /**
   * Recebe o id selecionado de fora (OfficeCanvas / selectionStore).
   * A cena não lê store de domínio.
   */
  setSelected(id: string | null): void {
    this.selectedId = id;
    if (!this.ready) return;
    this.applySelectedHighlight();
  }

  setOnAgentClick(handler: ((id: string) => void) | null): void {
    this.onAgentClick = handler;
  }

  upsertAgent(view: AgentView): void {
    const existing = this.markers.get(view.id);
    if (existing) {
      existing.apply(view);
      existing.setSelected(this.selectedId === view.id);
      return;
    }
    const marker = new AgentMarker(this, view, (id) => this.onAgentClick?.(id));
    marker.setSelected(this.selectedId === view.id);
    this.markers.set(view.id, marker);
  }

  private applySelectedHighlight(): void {
    for (const [id, marker] of this.markers) {
      marker.setSelected(id === this.selectedId);
    }
  }

  removeAgent(id: string): void {
    const marker = this.markers.get(id);
    if (!marker) return;
    marker.destroy();
    this.markers.delete(id);
  }

  getAgentIds(): string[] {
    return [...this.markers.keys()];
  }

  private buildTileLayers(): void {
    const floorMap = this.make.tilemap({
      data: buildFloorLayer(),
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const floorTiles = floorMap.addTilesetImage(
      OFFICE_ASSET_KEYS.roomBuilder,
      OFFICE_ASSET_KEYS.roomBuilder,
      TILE_SIZE,
      TILE_SIZE
    );
    if (floorTiles) {
      const floor = floorMap.createLayer(0, floorTiles, 0, 0);
      floor?.setDepth(0);
      floor?.setAlpha(0.55);
    }

    const wallMap = this.make.tilemap({
      data: buildWallLayer(),
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const wallTiles = wallMap.addTilesetImage(
      OFFICE_ASSET_KEYS.roomBuilder,
      OFFICE_ASSET_KEYS.roomBuilder,
      TILE_SIZE,
      TILE_SIZE
    );
    if (wallTiles) {
      const walls = wallMap.createLayer(0, wallTiles, 0, 0);
      walls?.setDepth(1);
    }
  }

  private placeFurniture(): void {
    for (const prop of FURNITURE) {
      const key =
        prop.key === 'desk'
          ? OFFICE_ASSET_KEYS.desk
          : prop.key === 'chair'
            ? OFFICE_ASSET_KEYS.chair
            : prop.key === 'plant'
              ? OFFICE_ASSET_KEYS.plant
              : prop.key === 'vending'
                ? OFFICE_ASSET_KEYS.vending
                : prop.key === 'conferenceTable'
                  ? OFFICE_ASSET_KEYS.conferenceTable
                  : prop.key === 'loungeSofa'
                    ? OFFICE_ASSET_KEYS.loungeSofa
                    : OFFICE_ASSET_KEYS.bookshelf;
      const sprite = this.add.image(prop.tileX * TILE_SIZE, prop.tileY * TILE_SIZE, key);
      sprite.setOrigin(0, 0);
      sprite.setDepth(prop.key === 'desk' || prop.key === 'chair' ? 5 : 4);
    }
  }

  private registerCharacterAnims(): void {
    for (let i = 0; i < CHARACTER_COUNT; i++) {
      for (const pose of Object.keys(CHARACTER_POSE_FRAMES) as Array<
        keyof typeof CHARACTER_POSE_FRAMES
      >) {
        const spec = CHARACTER_POSE_FRAMES[pose];
        const key = poseAnimKey(i, pose);
        if (this.anims.exists(key)) continue;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(characterAssetKey(i), {
            start: spec.start,
            end: spec.end,
          }),
          frameRate: spec.frameRate,
          repeat: spec.start === spec.end ? 0 : -1,
        });
      }
    }
  }

  private placeZoneLabels(): void {
    for (const zone of OFFICE_ZONES) {
      const x = (zone.x + zone.w / 2) * TILE_SIZE;
      const y = zone.y * TILE_SIZE + 6;
      const label = this.add.text(x, y, zone.label.toUpperCase(), {
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: '8px',
        color: '#a1a1aa',
        stroke: '#0c0c10',
        strokeThickness: 2,
      });
      label.setOrigin(0.5, 0);
      label.setDepth(3);
      label.setAlpha(0.85);
    }
  }
}
