import * as THREE from 'three'

const HP_BAR_TILT = -Math.PI / 4

export class SphereDefender {
  worldX = -350
  worldY = 0
  hp: number
  readonly maxHp = 300
  isDead = false
  readonly range = 200
  readonly damage = 10

  private hpBarFill: THREE.Mesh

  constructor(private scene: THREE.Scene, readonly mesh: THREE.Group) {
    this.hp = this.maxHp
    this.hpBarFill = this.buildHpBar()
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

  private buildHpBar(): THREE.Mesh {
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 4),
      new THREE.MeshBasicMaterial({ color: 0x222222 })
    )
    bg.position.set(0, 30, 0.1)
    bg.rotation.x = HP_BAR_TILT
    this.mesh.add(bg)

    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 4),
      new THREE.MeshBasicMaterial({ color: 0x00cc44 })
    )
    fill.position.set(0, 30, 0.2)
    fill.rotation.x = HP_BAR_TILT
    this.mesh.add(fill)
    return fill
  }
}
