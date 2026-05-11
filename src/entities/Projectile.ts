import * as THREE from 'three'
import type { Unit } from './Unit'

const SPEED = 450  // units per second

export class Projectile {
  private mesh: THREE.Mesh
  isDone = false
  targetX: number
  targetY: number
  onHit: (() => void) | null = null

  constructor(
    private scene: THREE.Scene,
    startX: number,
    startY: number,
    private targetUnit: Unit | null,
    fixedTargetX: number,
    fixedTargetY: number,
    readonly damage: number,
    readonly isAoe: boolean = false,
    readonly aoeRadius: number = 0,
    baseColor: number = 0xffee00   // yellow = structure shots; cyan = unit shots
  ) {
    this.targetX = fixedTargetX
    this.targetY = fixedTargetY

    const geo = new THREE.SphereGeometry(isAoe ? 6 : 4, 6, 6)
    const mat = new THREE.MeshBasicMaterial({ color: isAoe ? 0xff4400 : baseColor })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.position.set(startX, startY, 1)
    scene.add(this.mesh)
  }

  // Returns true when it reaches the target
  update(delta: number): boolean {
    if (this.targetUnit && !this.targetUnit.isDead) {
      this.targetX = this.targetUnit.worldX
      this.targetY = this.targetUnit.worldY
    }

    const dx = this.targetX - this.mesh.position.x
    const dy = this.targetY - this.mesh.position.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const step = SPEED * delta

    if (dist <= step) {
      this.isDone = true
      this.mesh.removeFromParent()
      this.mesh.geometry.dispose()
      ;(this.mesh.material as THREE.MeshBasicMaterial).dispose()
      return true
    }

    this.mesh.position.x += (dx / dist) * step
    this.mesh.position.y += (dy / dist) * step
    return false
  }
}
