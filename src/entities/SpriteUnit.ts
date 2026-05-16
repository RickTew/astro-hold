import * as THREE from 'three'
import { Config, UnitType } from '../game/GameConfig'

// Pixel-sprite attacker unit. Same public shape as Unit (so BattlePhase + Game
// treat them interchangeably) but the body is an 8-direction sprite chosen by
// the unit's current facing angle. No 3D mesh, no animation mixer.

const DIRECTIONS = [
  'east', 'north-east', 'north', 'north-west',
  'west', 'south-west', 'south', 'south-east',
] as const
type Direction = (typeof DIRECTIONS)[number]

// Sprite world size — matches the 3D cyborg's perceived height (~50 units).
// Pixel art is 104–108 px square with the body filling most of the frame.
const SPRITE_SIZE = 60
// How far ahead of the unit a projectile should leave from. Tuned so shots
// emerge from the weapon hand, not the chest/stomach.
const MUZZLE_FORWARD = 26

type SpriteSet = { folder: string; textures: Map<Direction, THREE.Texture> }
const spriteSets: Map<UnitType, SpriteSet> = new Map()

export async function preloadSpriteUnit(type: UnitType, folder: string): Promise<void> {
  const loader = new THREE.TextureLoader()
  const textures = new Map<Direction, THREE.Texture>()
  await Promise.all(DIRECTIONS.map(dir =>
    new Promise<void>((resolve, reject) => {
      loader.load(
        `/sprites/${folder}/${dir}.png`,
        tex => {
          tex.magFilter = THREE.NearestFilter
          tex.minFilter = THREE.NearestFilter
          tex.colorSpace = THREE.SRGBColorSpace
          textures.set(dir, tex)
          resolve()
        },
        undefined,
        reject
      )
    })
  ))
  spriteSets.set(type, { folder, textures })
}

export class SpriteUnit {
  readonly mesh: THREE.Group
  hp: number
  readonly maxHp: number
  readonly type: UnitType
  isDead = false

  private sprite: THREE.Sprite
  private hpBarGroup: THREE.Group
  private hpBarFill: THREE.Mesh

  private logicalX: number
  private logicalY: number
  private isMoving = false
  private readonly moveSpeedPS: number

  // Initial facing: -X (toward power core), mirrors Unit's default. Stored as
  // the math angle of the facing direction in world XY (0 = +X, π/2 = +Y).
  private facingAngle = Math.PI
  private currentDir: Direction = 'west'

  constructor(scene: THREE.Scene, type: UnitType, spawnX: number, spawnY?: number) {
    this.type = type
    this.hp = this.maxHp = Config.UNITS[type].hp
    this.moveSpeedPS = Config.UNITS[type].speed / Config.TURN_INTERVAL

    const spread = Config.WORLD.TOP - Config.WORLD.BOTTOM - 40
    const y = spawnY ?? (Math.random() - 0.5) * spread

    this.logicalX = spawnX
    this.logicalY = y

    this.mesh = new THREE.Group()
    this.mesh.position.set(spawnX, y, 0)

    const set = spriteSets.get(type)
    // Sprite material flags mirror SphereDefender — depthTest off prevents the
    // billboard from being culled against the ground/fence depth buffer.
    const mat = new THREE.SpriteMaterial({
      map: set?.textures.get('west') ?? null,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      alphaTest: 0.1,
    })
    this.sprite = new THREE.Sprite(mat)
    this.sprite.scale.set(SPRITE_SIZE, SPRITE_SIZE, 1)
    // Feet roughly at the bottom of the sprite quad — lift center so feet land at y=0.
    this.sprite.position.set(0, SPRITE_SIZE * 0.35, 5)
    this.sprite.renderOrder = 10
    this.mesh.add(this.sprite)

    const { group, fill } = this.buildHpBar()
    this.hpBarGroup = group
    this.hpBarFill = fill

    // Lock initial sprite to whichever direction our bucket math says belongs
    // to the starting facingAngle — keeps the constructor consistent with
    // every later update() call.
    this.updateDirectionSprite()

    scene.add(this.mesh)
  }

  // ── Public API (matches Unit) ─────────────────────────────────────────────

  get worldX() { return this.logicalX }
  get worldY() { return this.logicalY }
  get speed()    { return Config.UNITS[this.type].speed }
  get damage()   { return Config.UNITS[this.type].damage }
  get range()    { return Config.UNITS[this.type].range }
  get isScout()  { return this.type === 'scout' }
  get isBomber() { return this.type === 'bomber' }

  moveTo(x: number, y: number) {
    this.logicalX = x
    this.logicalY = y
    this.isMoving = true
  }

  takeDamage(amount: number) {
    if (this.isDead) return
    this.hp = Math.max(0, this.hp - amount)
    const ratio = this.hp / this.maxHp
    this.hpBarFill.scale.x = ratio
    this.hpBarFill.position.x = -(1 - ratio) * 15
    const mat = this.hpBarFill.material as THREE.MeshBasicMaterial
    mat.color.setHex(ratio > 0.5 ? 0x00cc44 : ratio > 0.25 ? 0xffaa00 : 0xff2200)
    if (this.hp <= 0) this.kill()
  }

  kill() {
    if (this.isDead) return
    this.isDead = true
    this.isMoving = false
    // Fade the sprite — keeps the death position visible briefly.
    const m = this.sprite.material as THREE.SpriteMaterial
    m.opacity = 0.4
    m.color.setHex(0x444444)
  }

  faceTarget(x: number, y: number) {
    const dx = x - this.logicalX
    const dy = y - this.logicalY
    if (dx * dx + dy * dy < 0.01) return
    this.facingAngle = Math.atan2(dy, dx)
    this.updateDirectionSprite()
  }

  // Projectile spawn point — a short distance in front of the unit, lifted to
  // chest/weapon height so shots don't leave from the belly.
  getMuzzlePoint(): { x: number; y: number } {
    return {
      x: this.logicalX + Math.cos(this.facingAngle) * MUZZLE_FORWARD,
      y: this.logicalY + Math.sin(this.facingAngle) * MUZZLE_FORWARD,
    }
  }

  faceCamera(camera: THREE.Camera) {
    this.hpBarGroup.quaternion.copy(camera.quaternion)
  }

  update(delta: number) {
    if (this.isDead) return
    if (!this.isMoving) return

    const dx = this.logicalX - this.mesh.position.x
    const dy = this.logicalY - this.mesh.position.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const step = this.moveSpeedPS * delta

    if (step >= dist) {
      this.mesh.position.x = this.logicalX
      this.mesh.position.y = this.logicalY
      this.isMoving = false
    } else {
      this.mesh.position.x += (dx / dist) * step
      this.mesh.position.y += (dy / dist) * step
    }

    if (dist > 0.1) {
      this.facingAngle = Math.atan2(dy, dx)
      this.updateDirectionSprite()
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  // Pick one of the 8 directional sprites whose facing best matches the unit's
  // current facing angle. Buckets are π/4 wide and centered on each direction.
  // Offset must be an integer multiple of 8 so the modulo preserves the bucket
  // value — the earlier `+ TAU * 8` (= +16π ≈ +50.27) shifted every angle by a
  // non-integer amount and mapped facingAngle=π (west) onto 'south'.
  private updateDirectionSprite() {
    const norm = ((this.facingAngle / (Math.PI / 4)) + 16) % 8
    const idx = Math.round(norm) % 8
    const dir = DIRECTIONS[idx]
    if (dir === this.currentDir) return
    this.currentDir = dir
    const set = spriteSets.get(this.type)
    const tex = set?.textures.get(dir)
    if (!tex) return
    this.sprite.material.map = tex
    this.sprite.material.needsUpdate = true
  }

  private buildHpBar(): { group: THREE.Group; fill: THREE.Mesh } {
    const group = new THREE.Group()
    // Sprite is anchored low (feet at sprite.position.y - 0.5*size + lift),
    // so the head reads at roughly +SPRITE_SIZE world units up. 42 keeps the
    // bar just above the head with a small gap.
    group.position.set(0, 42, 0)

    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 4),
      new THREE.MeshBasicMaterial({ color: 0xcc2222 })
    )
    bg.position.z = 0.1
    group.add(bg)

    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 4),
      new THREE.MeshBasicMaterial({ color: 0x00cc44 })
    )
    fill.position.z = 0.2
    group.add(fill)

    this.mesh.add(group)
    return { group, fill }
  }
}
