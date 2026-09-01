import Phaser from 'phaser';
import { AgentView } from '../view/agentViewModel';
import { LABEL, formatNameLine } from '../view/labelLayout';

/**
 * Geometric placeholder marker (LimeZu pack has no character sprites).
 * Scene label is name + status dot only — detailed metadata lives in the side panel.
 */
export class AgentMarker {
  readonly id: string;
  readonly container: Phaser.GameObjects.Container;
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly body: Phaser.GameObjects.Arc;
  private readonly statusDot: Phaser.GameObjects.Arc;
  private readonly nameText: Phaser.GameObjects.Text;
  private bobTween: Phaser.Tweens.Tween | null = null;
  private selected = false;

  constructor(scene: Phaser.Scene, view: AgentView, onClick?: (id: string) => void) {
    this.id = view.id;

    this.ring = scene.add.circle(0, 0, 12, 0x000000, 0);
    this.ring.setStrokeStyle(2, 0xf5d76e, 0);

    this.body = scene.add.circle(0, 0, 7, view.statusVisual.color, 1);
    this.body.setStrokeStyle(1, 0xffffff, 0.55);

    this.statusDot = scene.add.circle(-18, LABEL.nameOffsetY - 4, 2.5, view.statusVisual.color, 1);

    this.nameText = scene.add.text(0, LABEL.nameOffsetY, '', {
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: `${LABEL.nameFontPx}px`,
      color: '#d4d4d8',
      stroke: '#0c0c10',
      strokeThickness: 2,
      align: 'center',
    });
    this.nameText.setOrigin(0.5, 1);

    this.container = scene.add.container(view.x, view.y, [
      this.ring,
      this.body,
      this.statusDot,
      this.nameText,
    ]);
    this.container.setDepth(20);
    this.container.setSize(28, 28);
    this.container.setInteractive(
      new Phaser.Geom.Circle(0, 0, 14),
      Phaser.Geom.Circle.Contains
    );
    this.container.input!.cursor = 'pointer';
    this.container.on('pointerdown', () => {
      onClick?.(this.id);
    });

    this.apply(view);
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.ring.setStrokeStyle(2, 0xf5d76e, selected ? 1 : 0);
    this.container.setScale(selected ? 1.08 : 1);
    this.nameText.setColor(selected ? '#fafafa' : '#d4d4d8');
  }

  isSelected(): boolean {
    return this.selected;
  }

  apply(view: AgentView): void {
    this.container.setPosition(view.x, view.y);
    this.body.setFillStyle(view.statusVisual.color, view.status === 'offline' ? 0.45 : 1);
    this.statusDot.setFillStyle(view.statusVisual.color, 1);
    this.nameText.setText(formatNameLine(view));
    this.syncMotion(view);
  }

  destroy(): void {
    this.bobTween?.stop();
    this.bobTween = null;
    this.container.destroy(true);
  }

  private syncMotion(view: AgentView): void {
    const scene = this.container.scene;
    const shouldBob = view.status === 'working' || view.status === 'planning';

    if (!shouldBob) {
      this.bobTween?.stop();
      this.bobTween = null;
      this.body.setY(0);
      return;
    }

    if (this.bobTween?.isPlaying()) return;

    this.bobTween = scene.tweens.add({
      targets: this.body,
      y: -2,
      duration: view.status === 'working' ? 280 : 420,
      yoyo: true,
      repeat: -1,
    });
  }
}
