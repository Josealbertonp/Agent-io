import Phaser from 'phaser';
import { AgentView } from '../view/agentViewModel';
import { formatNameLine } from '../view/labelLayout';
import {
  characterAssetKey,
  poseAnimKey,
  poseForStatus,
} from '../view/characterVisual';

/**
 * LimeZu 32×32 character at a workstation. Offline hides the sprite (empty station).
 */
export class AgentMarker {
  readonly id: string;
  readonly container: Phaser.GameObjects.Container;
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly statusDot: Phaser.GameObjects.Arc;
  private readonly nameText: Phaser.GameObjects.Text;
  private bobTween: Phaser.Tweens.Tween | null = null;
  private selected = false;
  private characterIndex = 0;

  constructor(scene: Phaser.Scene, view: AgentView, onClick?: (id: string) => void) {
    this.id = view.id;
    this.characterIndex = view.characterIndex;

    this.ring = scene.add.circle(0, 2, 12, 0x000000, 0);
    this.ring.setStrokeStyle(1, 0xf5d76e, 0);

    this.sprite = scene.add.sprite(0, 0, characterAssetKey(view.characterIndex), 0);
    this.sprite.setOrigin(0.5, 0.75);
    this.sprite.setScale(0.72);

    this.statusDot = scene.add.circle(-8, 11, 1.6, view.statusVisual.color, 1);

    this.nameText = scene.add.text(0, 13, '', {
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: '5px',
      color: '#a1a1aa',
      align: 'center',
    });
    this.nameText.setOrigin(0.5, 0);

    this.container = scene.add.container(view.x, view.y, [
      this.ring,
      this.sprite,
      this.statusDot,
      this.nameText,
    ]);
    this.container.setDepth(20);
    this.container.setSize(32, 32);
    this.container.setInteractive(new Phaser.Geom.Circle(0, 0, 16), Phaser.Geom.Circle.Contains);
    this.container.input!.cursor = 'pointer';
    this.container.on('pointerdown', () => {
      onClick?.(this.id);
    });

    this.apply(view);
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.ring.setStrokeStyle(1, 0xf5d76e, selected ? 0.9 : 0);
    this.sprite.setScale(selected ? 0.8 : 0.72);
    this.nameText.setColor(selected ? '#e4e4e7' : '#8b8b96');
    this.nameText.setAlpha(selected ? 1 : 0.62);
  }

  isSelected(): boolean {
    return this.selected;
  }

  apply(view: AgentView): void {
    this.characterIndex = view.characterIndex;
    this.container.setPosition(view.x, view.y);
    const occupied = view.status !== 'offline';
    this.sprite.setVisible(occupied);
    this.statusDot.setVisible(true);
    this.statusDot.setFillStyle(view.statusVisual.color, occupied ? 1 : 0.4);
    this.nameText.setText(formatNameLine(view));
    if (view.status === 'error') this.sprite.setTint(0xfca5a5);
    else if (view.status === 'blocked') this.sprite.setTint(0xa1a1aa);
    else this.sprite.clearTint();
    if (occupied) {
      this.playPose(view);
    } else {
      this.sprite.anims.stop();
    }
    this.syncMotion(view);
  }

  destroy(): void {
    this.bobTween?.stop();
    this.bobTween = null;
    this.container.destroy(true);
  }

  private playPose(view: AgentView): void {
    const pose = poseForStatus(view.status);
    const key = poseAnimKey(this.characterIndex, pose);
    if (this.sprite.anims.currentAnim?.key === key) return;
    if (this.container.scene.anims.exists(key)) {
      this.sprite.play(key);
    }
  }

  private syncMotion(view: AgentView): void {
    const scene = this.container.scene;
    const shouldBob = view.status === 'working' || view.status === 'planning';

    if (!shouldBob || view.status === 'offline') {
      this.bobTween?.stop();
      this.bobTween = null;
      this.sprite.setY(0);
      return;
    }

    if (this.bobTween?.isPlaying()) return;

    this.bobTween = scene.tweens.add({
      targets: this.sprite,
      y: -1.5,
      duration: view.status === 'working' ? 900 : 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
