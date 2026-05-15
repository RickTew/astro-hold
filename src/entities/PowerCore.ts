import * as THREE from 'three'
import { Config } from '../game/GameConfig'

// Power Core = the base the defender is protecting. Visually a chunky angular
// bunker (box) so it can never be mistaken for a placeable sphere defender.
export class PowerCore {
  readonly mesh: THREE.Group
  hp: number
  readonly maxHp: number
  private hpBarGroup: THREE.Group
  private hpBar: THREE.Mesh
  private body: THREE.Mesh
  private antenna: THREE.Mesh
  private pulseTime = 0

  constructor(scene: THREE.Scene) {
    this.hp = this.maxHp = Config.POWER_CORE.HP
    this.mesh = new THREE.Group()
    this.mesh.position.set(Config.POWER_CORE.X, Config.POWER_CORE.Y, 0)

    const size = Config.POWER_CORE.RADIUS * 2.4  // square footprint, slightly larger

    // Main body — flat-roofed box, emissive cyan edge glow
    const bodyGeo = new THREE.BoxGeometry(size, size, size * 0.75)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x335577,
      emissive: new THREE.Color(0x0a2233),
      emissiveIntensity: 0.6,
      metalness: 0.5,
      roughness: 0.55,
    })
    this.body = new THREE.Mesh(bodyGeo, bodyMat)
    this.mesh.add(this.body)

    // Edge wire — emissive outline so the cube reads clearly from a distance
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(bodyGeo),
      new THREE.LineBasicMaterial({ color: 0x00ddff })
    )
    this.mesh.add(edges)

    // Antenna spike sticking up out of the top. With the camera at 45° looking
    // down, world +Y projects to "up" on screen (+Z projects DOWN — that bit
    // me last build). Long axis along +Y so it reads as a vertical mast.
    const antGeo = new THREE.BoxGeometry(size * 0.18, size * 0.6, size * 0.18)
    const antMat = new THREE.MeshStandardMaterial({
      color: 0x00ffee,
      emissive: new THREE.Color(0x00aabb),
      emissiveIntensity: 1.5,
    })
    this.antenna = new THREE.Mesh(antGeo, antMat)
    this.antenna.position.set(0, size * 0.65, 0)
    this.mesh.add(this.antenna)

    // Point light at antenna tip gives the bunker some ambient illumination
    const light = new THREE.PointLight(0x00aaff, 3, 160)
    light.position.set(0, size * 0.5, 0)
    this.mesh.add(light)

    // HP bar — billboarded to face camera each frame (faceCamera method)
    this.hpBarGroup = new THREE.Group()
    this.hpBarGroup.position.set(0, size * 1.15, 0)
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

    scene.add(this.mesh)
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
    this.flashBody()
  }

  private flashBody() {
    const mat = this.body.material as THREE.MeshStandardMaterial
    const savedHex = mat.emissive.getHex()
    mat.emissive.setHex(0xff2200)
    mat.emissiveIntensity = 2.5
    setTimeout(() => {
      mat.emissive.setHex(savedHex)
      mat.emissiveIntensity = 0.6
    }, 200)
  }

  get isDead() { return this.hp <= 0 }

  update(delta: number) {
    this.pulseTime += delta
    // Antenna pulses (just emissive), no rotation — a bunker shouldn't spin
    const antMat = this.antenna.material as THREE.MeshStandardMaterial
    antMat.emissiveIntensity = 1.2 + Math.sin(this.pulseTime * 3.5) * 0.4
  }
}
