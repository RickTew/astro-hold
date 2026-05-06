import * as THREE from 'three'
import { Config } from './GameConfig'
import { Unit } from '../entities/Unit'
import { Structure } from '../entities/Structure'
import { Projectile } from '../entities/Projectile'
import { Explosion } from '../entities/Explosion'
import { PowerCore } from '../entities/PowerCore'

const MINE_DETECT_RADIUS = 65

export class BattlePhase {
  private projectiles: Projectile[] = []
  private explosions: Explosion[] = []
  private turnTimer = Config.TURN_INTERVAL
  private unitIdx = 0
  private structIdx = 0
  private isUnitTurn = true
  private over = false

  onWin: (() => void) | null = null
  onLose: (() => void) | null = null

  constructor(
    private scene: THREE.Scene,
    private core: PowerCore,
    private units: Unit[],
    private structures: Structure[]
  ) {}

  update(delta: number) {
    if (this.over) return

    for (const u of this.units) u.update(delta)

    // Advance projectiles; apply damage on arrival
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const hit = this.projectiles[i].update(delta)
      if (hit) {
        const proj = this.projectiles[i]
        this.explosions.push(new Explosion(this.scene, proj.targetX, proj.targetY, proj.isAoe ? proj.aoeRadius : 20, 0.4))
        this.projectiles.splice(i, 1)
      }
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      this.explosions[i].update(delta)
      if (this.explosions[i].isDone) this.explosions.splice(i, 1)
    }

    // Wait for projectiles to land before next turn
    if (this.projectiles.length > 0) return

    this.turnTimer -= delta
    if (this.turnTimer > 0) return
    this.turnTimer = Config.TURN_INTERVAL

    this.executeTurn()
  }

  private executeTurn() {
    const alive = this.units.filter(u => !u.isDead)
    if (!alive.length) { this.over = true; this.onWin?.(); return }
    if (this.core.isDead)  { this.over = true; this.onLose?.(); return }

    if (this.isUnitTurn) {
      if (this.unitIdx >= alive.length) this.unitIdx = 0
      this.doUnitTurn(alive[this.unitIdx++])
    } else {
      const activeStructs = this.structures.filter(s => !s.isDead && s.type !== 'wall' && s.type !== 'mine')
      if (activeStructs.length) {
        if (this.structIdx >= activeStructs.length) this.structIdx = 0
        this.doStructureTurn(activeStructs[this.structIdx++], alive)
      }
    }

    this.isUnitTurn = !this.isUnitTurn

    // Check win/lose after each action
    const stillAlive = this.units.filter(u => !u.isDead)
    if (!stillAlive.length) { this.over = true; this.onWin?.(); return }
    if (this.core.isDead)   { this.over = true; this.onLose?.(); return }
  }

  private doUnitTurn(unit: Unit) {
    if (unit.isDead) return

    // Mine check before moving
    this.checkMines(unit)
    if (unit.isDead) return

    // Blocked by wall? (scouts bypass)
    if (!unit.isScout) {
      const blocking = this.structures.find(s =>
        s.type === 'wall' && !s.isDead &&
        Math.abs(s.worldX - unit.worldX) < 40 &&
        Math.abs(s.worldY - unit.worldY) < 30
      )
      if (blocking) {
        blocking.takeDamage(unit.damage)
        return
      }
    }

    // Move toward power core
    const tx = this.core.mesh.position.x
    const ty = this.core.mesh.position.y
    const dx = tx - unit.worldX
    const dy = ty - unit.worldY
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist <= Config.POWER_CORE.RADIUS + 20) {
      // Attack the core
      if (unit.isBomber) {
        const aoe = Config.UNITS.bomber.aoeRadius
        this.core.takeDamage(unit.damage)
        this.explosions.push(new Explosion(this.scene, unit.worldX, unit.worldY, aoe, 0.8))
        // AoE damages nearby structures too
        for (const s of this.structures) {
          if (!s.isDead) {
            const sdx = s.worldX - unit.worldX
            const sdy = s.worldY - unit.worldY
            if (Math.sqrt(sdx * sdx + sdy * sdy) < aoe) s.takeDamage(unit.damage * 0.4)
          }
        }
        unit.kill()
      } else {
        this.core.takeDamage(unit.damage)
      }
    } else {
      const nx = unit.worldX + (dx / dist) * unit.speed
      const ny = unit.worldY + (dy / dist) * unit.speed
      unit.moveTo(nx, ny)
      // Re-check mines after moving
      this.checkMines(unit)
    }
  }

  private checkMines(unit: Unit) {
    for (const s of this.structures) {
      if (s.type !== 'mine' || s.isDead) continue
      const dx = s.worldX - unit.worldX
      const dy = s.worldY - unit.worldY
      if (Math.sqrt(dx * dx + dy * dy) < MINE_DETECT_RADIUS) {
        // Detonate — damage all units in AoE
        const radius = Config.STRUCTURES.mine.range + 10
        this.explosions.push(new Explosion(this.scene, s.worldX, s.worldY, radius, 0.7))
        for (const u of this.units) {
          if (!u.isDead) {
            const udx = u.worldX - s.worldX
            const udy = u.worldY - s.worldY
            if (Math.sqrt(udx * udx + udy * udy) < radius) u.takeDamage(Config.STRUCTURES.mine.damage)
          }
        }
        s.takeDamage(9999)  // self-destruct
      }
    }
  }

  private doStructureTurn(structure: Structure, aliveUnits: Unit[]) {
    if (structure.isDead) return

    let nearest: Unit | null = null
    let nearestDist: number = structure.range

    for (const u of aliveUnits) {
      const dx = u.worldX - structure.worldX
      const dy = u.worldY - structure.worldY
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < nearestDist) { nearestDist = d; nearest = u }
    }

    if (!nearest) return

    const isAoe = structure.type === 'cannon'
    const proj = new Projectile(
      this.scene,
      structure.worldX, structure.worldY,
      nearest,
      nearest.worldX, nearest.worldY,
      structure.damage,
      isAoe,
      isAoe ? 45 : 0
    )
    this.projectiles.push(proj)

    // Damage applied on projectile arrival (in update loop)
    // Apply now for gameplay correctness; visual is the flying projectile
    if (isAoe) {
      for (const u of aliveUnits) {
        const dx = u.worldX - nearest.worldX
        const dy = u.worldY - nearest.worldY
        if (Math.sqrt(dx * dx + dy * dy) < 45) u.takeDamage(structure.damage)
      }
    } else {
      nearest.takeDamage(structure.damage)
    }
  }
}
