import * as THREE from 'three'
import { getGrenadeTexture } from './Structure'

// A grenade that landed last turn and detonates at the start of the next reveal.
// Visible sprite on the target cell + ominous pulse so the player can read
// "this is about to blow." Held by Game across RevealPhase instances.
export class PendingGrenade {
  sprite: THREE.Sprite
  private pulseTime = 0
  private baseSize: number

  constructor(
    scene: THREE.Scene,
    public worldX: number,
    public worldY: number,
    public damage: number,
    public aoeRadius: number,
    public side: 'attacker' | 'defender',
    baseSize = 22,
  ) {
    this.baseSize = baseSize
    const tex = getGrenadeTexture()
    const mat = new THREE.SpriteMaterial({
      map: tex ?? null,
      color: tex ? 0xffffff : 0xff5500,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      alphaTest: 0.1,
    })
    this.sprite = new THREE.Sprite(mat)
    this.sprite.scale.set(baseSize, baseSize, 1)
    this.sprite.position.set(worldX, worldY, 1.4)
    this.sprite.renderOrder = 11
    scene.add(this.sprite)
  }

  update(delta: number) {
    this.pulseTime += delta
    // 2 Hz pulse ±15% to signal pending detonation.
    const k = 1 + 0.15 * Math.sin(this.pulseTime * Math.PI * 4)
    const s = this.baseSize * k
    this.sprite.scale.set(s, s, 1)
  }

  dispose() {
    this.sprite.removeFromParent()
    this.sprite.material.dispose()
  }
}
