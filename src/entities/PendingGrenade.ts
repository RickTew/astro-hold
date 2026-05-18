import * as THREE from 'three'
import { getGrenadeTexture } from './Structure'
import { nextActorId } from '../game/TurnTypes'

// A live proximity-trigger grenade sitting on an empty cell. Lobbed by a
// Bomber / Grenadier — the projectile lands here, the visual transitions to
// this pulsing sprite, and the bomb stays in place until any enemy enters
// the aoeRadius. Then it detonates (handled by RevealPhase). The owner ID
// gates one-bomb-per-thrower: a Bomber/Grenadier can't throw a new bomb
// while any PendingGrenade with their ownerId is still on the field.
export class PendingGrenade {
  readonly id: string
  sprite: THREE.Sprite
  private pulseTime = 0
  private baseSize: number

  // armed=false: bomb just landed, can't trigger this turn (gives enemies
  // a planning window). RevealPhase.onComplete flips this to true at end
  // of turn. armed=true: live proximity trigger.
  armed = false
  // Reveals the bomb has spent in the armed state. Game.advanceTurn() bumps
  // this each end-of-reveal. RevealPhase force-detonates at turnsArmed >=
  // ARMED_LIFETIME so bombs don't sit on the field forever as ignored traps.
  turnsArmed = 0

  constructor(
    scene: THREE.Scene,
    public worldX: number,
    public worldY: number,
    public damage: number,
    public aoeRadius: number,
    public side: 'attacker' | 'defender',
    public ownerId: string,
    baseSize = 16,
  ) {
    this.id = nextActorId('bomb')
    this.baseSize = baseSize
    const tex = getGrenadeTexture()
    const mat = new THREE.SpriteMaterial({
      map: tex ?? null,
      // Dim grey + low opacity while UNARMED so the player visually reads
      // "not yet live". Armed flips to bright white + full opacity in arm().
      color: tex ? 0x666666 : 0x999999,
      opacity: 0.55,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      alphaTest: 0.05,
    })
    this.sprite = new THREE.Sprite(mat)
    this.sprite.scale.set(baseSize, baseSize, 1)
    this.sprite.position.set(worldX, worldY, 1.4)
    this.sprite.renderOrder = 11
    scene.add(this.sprite)
  }

  // Called once at end-of-reveal to flip unarmed → armed. No-op on subsequent
  // calls (use advanceTurn to increment the armed-lifetime counter).
  arm() {
    if (this.armed) return
    this.armed = true
    this.sprite.material.color.setHex(0xff5544)   // hot-red glow = "live"
    this.sprite.material.opacity = 1
  }

  // End-of-reveal tick. Arms unarmed bombs, then bumps turnsArmed for the
  // already-armed ones. RevealPhase checks turnsArmed against ARMED_LIFETIME
  // at the start of the next reveal to force-detonate expired bombs.
  advanceTurn() {
    if (!this.armed) {
      this.arm()
      return
    }
    this.turnsArmed++
  }

  update(delta: number) {
    this.pulseTime += delta
    // Unarmed: gentle pulse. Armed: faster, slightly stronger pulse to read
    // as "live threat".
    const freq = this.armed ? 6 : 3
    const amp = this.armed ? 0.18 : 0.1
    const k = 1 + amp * Math.sin(this.pulseTime * Math.PI * freq)
    const s = this.baseSize * k
    this.sprite.scale.set(s, s, 1)
  }

  dispose() {
    this.sprite.removeFromParent()
    this.sprite.material.dispose()
  }
}
