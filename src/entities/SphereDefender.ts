import * as THREE from 'three'

export class SphereDefender {
  readonly mesh: THREE.Group       // outer, positioned in scene, never rotates
  private inner: THREE.Group       // rotates around Y
  worldX: number
  worldY: number
  hp: number
  readonly maxHp = 300
  isDead = false
  // Sphere outranges most attacker types — it's the 100cr defender. Only the
  // sniper drone (range 350) outranges it; scout/tank/bomber all lose at distance.
  readonly range = 300
  readonly damage = 10

  private hpBarGroup: THREE.Group
  private hpBarFill: THREE.Mesh

  // Caller hands over a fresh, owned model (one per placement). SphereDefender
  // mounts it directly with no clone — cloning Object3Ds across placements was
  // distorting the visual.
  constructor(scene: THREE.Scene, x: number, y: number, model: THREE.Object3D) {
    this.worldX = x
    this.worldY = y
    this.hp = this.maxHp

    this.mesh = new THREE.Group()
    this.mesh.position.set(x, y, 0)

    this.inner = new THREE.Group()
    this.inner.add(model)
    this.mesh.add(this.inner)

    const { group, fill } = this.buildHpBar()
    this.hpBarGroup = group
    this.hpBarFill = fill

    scene.add(this.mesh)
  }

  update(delta: number) {
    this.inner.rotation.y += delta * 0.5
  }

  faceCamera(camera: THREE.Camera) {
    this.hpBarGroup.quaternion.copy(camera.quaternion)
  }

  takeDamage(amount: number) {
    if (this.isDead) return
    this.hp = Math.max(0, this.hp - amount)
    const ratio = this.hp / this.maxHp
    this.hpBarFill.scale.x = ratio
    this.hpBarFill.position.x = -(1 - ratio) * 15
    const mat = this.hpBarFill.material as THREE.MeshBasicMaterial
    mat.color.setHex(ratio > 0.5 ? 0x00cc44 : ratio > 0.25 ? 0xffaa00 : 0xff2200)
    if (this.hp <= 0) {
      this.isDead = true
      this.mesh.visible = false
    }
  }

  private buildHpBar(): { group: THREE.Group; fill: THREE.Mesh } {
    const group = new THREE.Group()
    group.position.set(0, 30, 0)

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
