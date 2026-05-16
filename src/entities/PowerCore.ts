import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Config } from '../game/GameConfig'

// Power Core = the base the defender is protecting. Currently locked to the
// 'super' Meshy export (other variants kept on disk for repurposing).
//
// Procedural overlays kept minimal: point light + slow rotation + pulse on
// the asset's authored emissive. Orbiting particle motes were removed in
// session 10 — they crossed in front of the model body and read as visual
// obstructions ("blocking the base / top"). The super core's authored glow
// is rich enough that no halo effect is needed.

export type CoreVariant = 'plain' | 'textured' | 'super'

// Only `super` is preloaded for active gameplay. The other two GLBs stay on
// disk as future defense-tower / fallback assets — flip them back into this
// map if you need to compare again or repurpose.
const MODELS: Record<CoreVariant, string> = {
  super: '/models/powercore/super.glb',
  plain:    '',
  textured: '',
}

const TARGET_HEIGHT = 85
const ROTATION_RAD_PER_SEC = 0.18

const templates: Partial<Record<CoreVariant, { scene: THREE.Group; scale: number }>> = {}

export async function preloadPowerCore(): Promise<void> {
  const loader = new GLTFLoader()
  const active = (Object.keys(MODELS) as CoreVariant[]).filter(k => MODELS[k])
  await Promise.all(active.map(key =>
    new Promise<void>((resolve) => {
      loader.load(
        MODELS[key],
        gltf => {
          const bbox = new THREE.Box3().setFromObject(gltf.scene)
          const size = new THREE.Vector3(); bbox.getSize(size)
          const native = size.y || 1
          templates[key] = { scene: gltf.scene, scale: TARGET_HEIGHT / native }
          resolve()
        },
        undefined,
        err => { console.warn(`[PowerCore] ${key} failed to load`, err); resolve() }
      )
    })
  ))
}

type MaterialBaseline = {
  mat: THREE.MeshStandardMaterial
  emissiveHex: number
  emissiveIntensity: number
}

export class PowerCore {
  readonly mesh: THREE.Group
  readonly variant: CoreVariant
  hp: number
  readonly maxHp: number
  private hpBarGroup: THREE.Group
  private hpBar: THREE.Mesh
  private bodyGroup: THREE.Group | null = null
  private pointLight: THREE.PointLight
  private pulseTime = Math.random() * Math.PI * 2
  private baselines: MaterialBaseline[] = []

  constructor(scene: THREE.Scene, variant: CoreVariant, x: number, y: number) {
    this.variant = variant
    this.hp = this.maxHp = Config.POWER_CORE.HP
    this.mesh = new THREE.Group()
    this.mesh.position.set(x, y, 0)

    this.pointLight = new THREE.PointLight(0x00aaff, 3.2, 220)
    this.pointLight.position.set(0, TARGET_HEIGHT * 0.5, 0)
    this.mesh.add(this.pointLight)

    // HP bar sits well above the model. The earlier 1.12× placed the bar's
    // screen-Y range right where the back of the antenna spikes project under
    // a 45° camera, so each spike disappeared when it rotated to the back of
    // the core. 1.7× puts the bar above every spike projection regardless of
    // rotation.
    this.hpBarGroup = new THREE.Group()
    this.hpBarGroup.position.set(0, TARGET_HEIGHT * 1.7, 0)
    const bgBar = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 8),
      new THREE.MeshBasicMaterial({ color: 0xcc2222 })
    )
    bgBar.position.z = 0.1
    this.hpBarGroup.add(bgBar)
    this.hpBar = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 8),
      new THREE.MeshBasicMaterial({ color: 0x00ff88 })
    )
    this.hpBar.position.z = 0.2
    this.hpBarGroup.add(this.hpBar)
    this.mesh.add(this.hpBarGroup)

    this.installVariant()
    scene.add(this.mesh)
  }

  private installVariant() {
    const tpl = templates[this.variant]
    if (!tpl) { this.buildFallback(); return }

    const clone = tpl.scene.clone(true)
    clone.scale.setScalar(tpl.scale)

    // Capture per-material baselines so the pulse can multiply against the
    // variant's authored emissive, and so flashHit can restore exactly what
    // it changed. No material replacement — Meshy's output ships as-is.
    this.baselines = []
    clone.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return
      const mat = obj.material as THREE.MeshStandardMaterial
      if (!mat || !('emissive' in mat)) return
      this.baselines.push({
        mat,
        emissiveHex: mat.emissive.getHex(),
        emissiveIntensity: mat.emissiveIntensity ?? 1,
      })
    })

    this.bodyGroup = clone
    this.mesh.add(clone)
  }

  faceCamera(camera: THREE.Camera) {
    this.hpBarGroup.quaternion.copy(camera.quaternion)
  }

  takeDamage(amount: number) {
    this.hp = Math.max(0, this.hp - amount)
    const ratio = this.hp / this.maxHp
    this.hpBar.scale.x = ratio
    this.hpBar.position.x = -(1 - ratio) * 35
    const mat = this.hpBar.material as THREE.MeshBasicMaterial
    mat.color.setHex(ratio > 0.5 ? 0x00ff88 : ratio > 0.25 ? 0xffaa00 : 0xff2200)
    this.flashHit()
  }

  private flashHit() {
    this.pointLight.color.setHex(0xff2200)
    this.pointLight.intensity = 6
    for (const b of this.baselines) {
      b.mat.emissive.setHex(0xff2200)
      b.mat.emissiveIntensity = 2.5
    }
    setTimeout(() => {
      this.pointLight.color.setHex(0x00aaff)
      for (const b of this.baselines) {
        b.mat.emissive.setHex(b.emissiveHex)
        b.mat.emissiveIntensity = b.emissiveIntensity
      }
    }, 200)
  }

  private buildFallback() {
    const size = Config.POWER_CORE.RADIUS * 2.4
    const group = new THREE.Group()
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size * 0.75),
      new THREE.MeshStandardMaterial({ color: 0x335577, emissive: 0x00aaff, emissiveIntensity: 0.6 })
    )
    box.position.set(0, size / 2, 0)
    group.add(box)
    this.bodyGroup = group
    this.mesh.add(group)
  }

  get isDead() { return this.hp <= 0 }

  update(delta: number) {
    this.pulseTime += delta

    if (this.bodyGroup) this.bodyGroup.rotation.y += ROTATION_RAD_PER_SEC * delta

    // Pulse only multiplies baseline emissive. Plain export has 0 baseline →
    // no visible pulse on plain (honest output). Textured/super have authored
    // emissive → they breathe in their own colors.
    const pulse = 1 + Math.sin(this.pulseTime * 2.2) * 0.3
    for (const b of this.baselines) {
      b.mat.emissiveIntensity = b.emissiveIntensity * pulse
    }

    this.pointLight.intensity = 3.2 + Math.sin(this.pulseTime * 2.2) * 0.8
  }
}
