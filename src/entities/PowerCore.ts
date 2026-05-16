import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Config } from '../game/GameConfig'

// Power Core = the base the defender is protecting. The body is a Meshy GLB.
// Both a textured and a plain (geometry-only) variant are loaded so the user
// can hot-swap with the 'T' key during testing to compare them.

export type CoreVariant = 'plain' | 'textured'

const MODELS: Record<CoreVariant, string> = {
  plain:    '/models/powercore/plain.glb',
  textured: '/models/powercore/textured.glb',
}

// Target visible height in world units. Both variants are auto-scaled to this
// regardless of their native model size, so swapping doesn't change footprint.
const TARGET_HEIGHT = 85

// Module-level cache populated by preloadPowerCore(). Each entry is the raw
// gltf.scene from the loader — we clone it per PowerCore instance.
const templates: Partial<Record<CoreVariant, { scene: THREE.Group; scale: number }>> = {}

export async function preloadPowerCore(): Promise<void> {
  const loader = new GLTFLoader()
  await Promise.all((Object.keys(MODELS) as CoreVariant[]).map(key =>
    new Promise<void>((resolve, reject) => {
      loader.load(
        MODELS[key],
        gltf => {
          const bbox = new THREE.Box3().setFromObject(gltf.scene)
          const size = new THREE.Vector3(); bbox.getSize(size)
          // Meshy export height is on the Y axis (Origin: Bottom, +Y up).
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

export class PowerCore {
  readonly mesh: THREE.Group
  hp: number
  readonly maxHp: number
  private hpBarGroup: THREE.Group
  private hpBar: THREE.Mesh
  private bodyGroup: THREE.Group | null = null
  private pointLight: THREE.PointLight
  private pulseTime = 0
  private currentVariant: CoreVariant = 'plain'

  constructor(scene: THREE.Scene) {
    this.hp = this.maxHp = Config.POWER_CORE.HP
    this.mesh = new THREE.Group()
    this.mesh.position.set(Config.POWER_CORE.X, Config.POWER_CORE.Y, 0)

    // Cyan ambient glow contributed by the Power Core itself. Animated in
    // update() to add a subtle pulse independent of the model's materials —
    // works whether the GLB has emissive maps or is a plain-geometry export.
    this.pointLight = new THREE.PointLight(0x00aaff, 3.5, 220)
    this.pointLight.position.set(0, TARGET_HEIGHT * 0.5, 0)
    this.mesh.add(this.pointLight)

    // HP bar — billboarded to face camera each frame.
    this.hpBarGroup = new THREE.Group()
    this.hpBarGroup.position.set(0, TARGET_HEIGHT * 1.12, 0)
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

    this.setVariant('plain')
    scene.add(this.mesh)
  }

  // Swap between 'plain' and 'textured' Meshy exports without rebuilding the
  // scene. HP bar, light, and damage state are preserved.
  setVariant(variant: CoreVariant) {
    if (this.bodyGroup) {
      this.mesh.remove(this.bodyGroup)
      this.bodyGroup = null
    }
    const tpl = templates[variant]
    if (!tpl) { this.buildFallback(); return }

    const clone = tpl.scene.clone(true)
    clone.scale.setScalar(tpl.scale)

    // The plain export has no emissive maps and ships as flat gray geometry,
    // which reads as a featureless silhouette against the brown terrain.
    // Replace its materials with a darker base + cyan emissive so the core
    // glows on its own merits and team-reads as the defender's centerpiece.
    if (variant === 'plain') {
      clone.traverse(obj => {
        if (!(obj instanceof THREE.Mesh)) return
        const baseMat = obj.material as THREE.MeshStandardMaterial
        // Clone-and-replace rather than mutate so shared materials don't bleed.
        const tinted = new THREE.MeshStandardMaterial({
          color: 0x2a3a4a,
          emissive: new THREE.Color(0x00aaff),
          emissiveIntensity: 0.9,
          metalness: 0.55,
          roughness: 0.45,
        })
        // Preserve the original normal/AO maps if Meshy included any geometry-
        // only normal information (most plain exports do not).
        if (baseMat && 'normalMap' in baseMat && baseMat.normalMap) {
          tinted.normalMap = baseMat.normalMap
        }
        obj.material = tinted
      })
    }

    this.bodyGroup = clone
    this.mesh.add(clone)
    this.currentVariant = variant
  }

  toggleVariant(): CoreVariant {
    const next: CoreVariant = this.currentVariant === 'plain' ? 'textured' : 'plain'
    this.setVariant(next)
    return next
  }

  get variant(): CoreVariant { return this.currentVariant }

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

  // Briefly tint emissive red on every mesh in the loaded body, and boost
  // the point light, so the hit reads at any distance regardless of material.
  private flashHit() {
    const prevIntensity = this.pointLight.intensity
    this.pointLight.color.setHex(0xff2200)
    this.pointLight.intensity = 6
    const restored: Array<() => void> = []
    this.bodyGroup?.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return
      const mat = obj.material as THREE.MeshStandardMaterial
      if (!('emissive' in mat)) return
      const savedHex = mat.emissive.getHex()
      const savedI = mat.emissiveIntensity ?? 1
      mat.emissive.setHex(0xff2200)
      mat.emissiveIntensity = 2.5
      restored.push(() => { mat.emissive.setHex(savedHex); mat.emissiveIntensity = savedI })
    })
    setTimeout(() => {
      this.pointLight.color.setHex(0x00aaff)
      this.pointLight.intensity = prevIntensity
      for (const r of restored) r()
    }, 200)
  }

  // Visible-from-far fallback used only if both GLBs fail to load.
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
    // Gentle 0.35-Hz pulse on the ambient light — keeps the core feeling
    // alive without poking into model materials.
    this.pointLight.intensity = 3.5 + Math.sin(this.pulseTime * 2.2) * 0.7
  }
}
