import * as THREE from 'three'
import { getGrenadeTexture } from './Structure'
import { nextActorId } from '../game/TurnTypes'

// A live grenade sitting on an empty cell. Two trigger modes:
//
//   'proximity' (Bomber)
//     Used by both the defender Bomber structure and the cyborg Bomber unit.
//     After arming, detonates the moment any ENEMY enters the aoeRadius.
//     A safety timer (proximityFuseTurns) force-detonates if the trap is
//     ignored — stops bombs from sitting forever as zone-of-denial cheese.
//
//   'timed' (Grenadier)
//     Throws a TIMED GRENADE, not a proximity mine. Detonates exactly
//     `timerTurns` reveals after arming, regardless of who's nearby.
//     Reverted from the previous proximity-bomb behavior at user
//     direction — grenadiers cook grenades, they don't lay mines.
//
// The owner ID gates one-bomb-per-thrower for both modes: a Bomber/Grenadier
// can't throw a new bomb while any PendingGrenade with their ownerId is
// still on the field.
export type GrenadeTriggerMode = 'proximity' | 'timed'

export class PendingGrenade {
  readonly id: string
  sprite: THREE.Sprite
  private pulseTime = 0
  private baseSize: number

  // armed=false: bomb just landed, can't trigger this turn (gives enemies
  // a planning window). RevealPhase.onComplete flips this to true at end
  // of turn. armed=true: live (proximity-checking OR ticking toward boom).
  armed = false
  // Reveals the bomb has spent in the armed state. Game.advanceTurn() bumps
  // this each end-of-reveal. RevealPhase force-detonates at turnsArmed
  // >= timerTurns for the configured mode.
  turnsArmed = 0
  // Proximity bombs sit on the field for up to 3 armed reveals before
  // force-detonating (the safety fuse). Timed bombs detonate at exactly
  // 1 armed reveal — they're cooked grenades, not traps.
  readonly timerTurns: number

  constructor(
    scene: THREE.Scene,
    public worldX: number,
    public worldY: number,
    public damage: number,
    public aoeRadius: number,
    public side: 'attacker' | 'defender',
    public ownerId: string,
    public triggerMode: GrenadeTriggerMode = 'proximity',
    baseSize = 16,
    // ownerType used by BattleStats so per-piece damage attribution
    // survives the thrower's death. Optional — default 'unknown' keeps
    // back-compat with any other constructor callers.
    public ownerType: string = 'unknown',
  ) {
    this.timerTurns = triggerMode === 'timed' ? 1 : 3
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
