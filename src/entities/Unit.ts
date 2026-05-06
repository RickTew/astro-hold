import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { Config, UnitType } from '../game/GameConfig'

// Tweak if Meshy model comes in wrong size or orientation
// Cyborg GLB is 1.65 units tall — scale 25 → ~41 world units tall
const MODEL_SCALE = 25
const MODEL_TILT_X = 0   // model faces camera; 0 = upright, PI/2 = flat on ground

type AnimName = 'idle' | 'running' | 'dead'
type LoadedGLTF = { scene: THREE.Group; animations: THREE.AnimationClip[] }

const cache: Partial<Record<AnimName, LoadedGLTF>> = {}
const loader = new GLTFLoader()

// Angle that makes HP bar planes face the 45° top-down camera
const HP_BAR_TILT = -Math.PI / 4

export class Unit {
  readonly mesh: THREE.Group
  hp: number
  readonly maxHp: number
  readonly type: UnitType
  isDead = false

  private bodyGroup: THREE.Group | null = null
  private mixer: THREE.AnimationMixer | null = null
  private hpBarFill: THREE.Mesh
  private dyingTimer = 0
  private isDisposed = false

  // Logical position drives game logic; visual position lerps toward it
  private logicalX: number
  private logicalY: number
  private isMoving = false
  private readonly moveSpeedPS: number   // world units per second
  private currentAnim: AnimName = 'idle'

  static async preload(): Promise<void> {
    const anims: AnimName[] = ['idle', 'running', 'dead']
    await Promise.all(anims.map(name =>
      new Promise<void>(resolve => {
        loader.load(
          `/models/cyborg/${name}.glb`,
          gltf => { cache[name] = gltf as unknown as LoadedGLTF; resolve() },
          undefined,
          () => { console.warn(`cyborg/${name}.glb not found — using fallback`); resolve() }
        )
      })
    ))
  }

  constructor(scene: THREE.Scene, type: UnitType, spawnX: number) {
    this.type = type
    this.hp = this.maxHp = Config.UNITS[type].hp
    this.moveSpeedPS = Config.UNITS[type].speed / Config.TURN_INTERVAL

    const spread = Config.WORLD.TOP - Config.WORLD.BOTTOM - 40
    const spawnY = (Math.random() - 0.5) * spread

    this.logicalX = spawnX
    this.logicalY = spawnY

    this.mesh = new THREE.Group()
    this.mesh.position.set(spawnX, spawnY, 0)

    this.swapAnim('idle')
    this.hpBarFill = this.buildHpBar()
    scene.add(this.mesh)
  }

  // ── Public API for game logic ──────────────────────────────────────────────

  get worldX() { return this.logicalX }
  get worldY() { return this.logicalY }

  moveTo(x: number, y: number) {
    this.logicalX = x
    this.logicalY = y
    this.isMoving = true
    this.playAnim('running')
  }

  takeDamage(amount: number) {
    if (this.isDead) return
    this.hp = Math.max(0, this.hp - amount)
    if (this.hp <= 0) {
      this.kill()
    } else {
      this.flashHit()
      const ratio = this.hp / this.maxHp
      this.hpBarFill.scale.x = ratio
      this.hpBarFill.position.x = -(1 - ratio) * 15
      const mat = this.hpBarFill.material as THREE.MeshBasicMaterial
      mat.color.setHex(ratio > 0.5 ? 0x00cc44 : ratio > 0.25 ? 0xffaa00 : 0xff2200)
    }
  }

  kill() {
    if (this.isDead) return
    this.isDead = true
    this.dyingTimer = 1.5
    this.isMoving = false
    this.swapAnim('dead')
  }

  get speed()    { return Config.UNITS[this.type].speed }
  get damage()   { return Config.UNITS[this.type].damage }
  get isScout()  { return this.type === 'scout' }
  get isBomber() { return this.type === 'bomber' }

  // ── Update ─────────────────────────────────────────────────────────────────

  update(delta: number) {
    this.mixer?.update(delta)

    // Smooth visual movement toward logical position
    if (this.isMoving) {
      const dx = this.logicalX - this.mesh.position.x
      const dy = this.logicalY - this.mesh.position.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const step = this.moveSpeedPS * delta
      if (step >= dist) {
        this.mesh.position.x = this.logicalX
        this.mesh.position.y = this.logicalY
        this.isMoving = false
        if (!this.isDead) this.playAnim('idle')
      } else {
        this.mesh.position.x += (dx / dist) * step
        this.mesh.position.y += (dy / dist) * step
      }

      // Rotate model to face movement direction
      if (dist > 0.1 && this.bodyGroup) {
        const angle = Math.atan2(dy, dx)
        this.bodyGroup.rotation.y = angle + Math.PI / 2
      }
    }

    // Death cleanup timer
    if (this.isDead && !this.isDisposed) {
      this.dyingTimer -= delta
      if (this.dyingTimer <= 0) {
        this.mesh.removeFromParent()
        this.isDisposed = true
      }
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private playAnim(name: AnimName) {
    if (this.currentAnim === name) return
    this.currentAnim = name
    this.swapAnim(name)
  }

  private swapAnim(name: AnimName) {
    if (this.bodyGroup) {
      this.mesh.remove(this.bodyGroup)
      this.bodyGroup = null
    }
    this.mixer = null

    const gltf = cache[name]
    if (!gltf) { this.buildFallback(); return }

    const clone = skeletonClone(gltf.scene) as THREE.Group
    clone.scale.setScalar(MODEL_SCALE)
    clone.rotation.x = MODEL_TILT_X
    // Face toward negative-X (toward power core) by default
    clone.rotation.y = -Math.PI / 2

    const emissive = new THREE.Color(Config.UNITS[this.type].color)
    clone.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        const mat = (obj.material as THREE.MeshStandardMaterial).clone()
        mat.emissive = emissive.clone()
        mat.emissiveIntensity = 0.35
        obj.material = mat
      }
    })

    this.bodyGroup = clone
    this.mesh.add(clone)

    if (gltf.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(clone)
      const action = this.mixer.clipAction(gltf.animations[0])
      if (name === 'dead') {
        action.clampWhenFinished = true
        action.loop = THREE.LoopOnce
      }
      action.play()
    }
  }

  private buildFallback() {
    const geo = new THREE.BoxGeometry(20, 26, 14)
    const mat = new THREE.MeshBasicMaterial({ color: Config.UNITS[this.type].color })
    const group = new THREE.Group()
    group.add(new THREE.Mesh(geo, mat))
    this.bodyGroup = group
    this.mesh.add(group)
  }

  private buildHpBar(): THREE.Mesh {
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 4),
      new THREE.MeshBasicMaterial({ color: 0x222222 })
    )
    bg.position.set(0, 28, 0.1)
    bg.rotation.x = HP_BAR_TILT
    this.mesh.add(bg)

    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 4),
      new THREE.MeshBasicMaterial({ color: 0x00cc44 })
    )
    fill.position.set(0, 28, 0.2)
    fill.rotation.x = HP_BAR_TILT
    this.mesh.add(fill)
    return fill
  }

  private flashHit() {
    if (!this.bodyGroup) return
    this.bodyGroup.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return
      const mat = obj.material as THREE.MeshStandardMaterial
      if (!('emissive' in mat)) return
      const prev = mat.emissiveIntensity
      mat.emissive.setHex(0xff1100)
      mat.emissiveIntensity = 1.5
      setTimeout(() => {
        mat.emissive.setHex(new THREE.Color(Config.UNITS[this.type].color).getHex())
        mat.emissiveIntensity = prev
      }, 150)
    })
  }
}
