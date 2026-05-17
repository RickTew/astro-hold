import * as THREE from 'three'
import { Config } from './GameConfig'
import { AP_COST, CellRef, QueuedAction } from './TurnTypes'
import { SpriteUnit } from '../entities/SpriteUnit'
import { SphereDefender } from '../entities/SphereDefender'
import { Structure } from '../entities/Structure'
import { PixelPowerCore } from '../entities/PixelPowerCore'

// Any piece the player can click on during planning. Spheres, structures,
// and cyborgs all share the action/AP shape; the core is a passive target only.
export type Selectable = SpriteUnit | SphereDefender | Structure

// Lightweight target descriptor passed to onTargetUpdate so the HUD can show
// what the selected piece has queued so far.
export interface PlanningSelectionInfo {
  label: string
  side: 'attacker' | 'defender'
  apRemaining: number
  apBudget: number
  queuedActions: ReadonlyArray<QueuedAction>
}

const SELECT_RING_COLOR = 0xffff66
const MOVE_LINE_COLOR   = 0x44aaff
const FIRE_LINE_COLOR   = 0xff5544

// Click hit radius (world units). Larger than a cell so it's forgiving for
// fast clicks but small enough that adjacent pieces don't both match.
const CLICK_RADIUS = 28
const CLICK_RADIUS_SQ = CLICK_RADIUS * CLICK_RADIUS

export class PlanningPhase {
  selected: Selectable | null = null

  /** HUD listens here to render the panel showing AP + queued list. */
  onSelectionChange: ((info: PlanningSelectionInfo | null) => void) | null = null

  private overlayGroup: THREE.Group
  private selectionRing: THREE.Mesh | null = null

  constructor(
    private scene: THREE.Scene,
    private spheres: SphereDefender[],
    private cyborgs: SpriteUnit[],
    private structures: Structure[],
    private core: PixelPowerCore,
  ) {
    // Reset every piece's plan when planning opens — fresh AP, no leftover
    // queued actions from a previous turn.
    for (const s of spheres)    if (!s.isDead) s.clearPlan()
    for (const c of cyborgs)    if (!c.isDead) c.clearPlan()
    for (const s of structures) if (!s.isDead) s.clearPlan()

    this.overlayGroup = new THREE.Group()
    this.overlayGroup.renderOrder = 20
    this.scene.add(this.overlayGroup)

    this.redrawOverlays()
  }

  // ── Click routing (called by Game.ts mouse handler) ──────────────────────

  /**
   * Primary-button click in world space. shift=true queues a Fire action when
   * the click lands on an enemy. Otherwise:
   *   - click on a friendly piece → select it
   *   - click on a cell with a selected piece → queue a Move
   */
  onPrimaryClick(worldX: number, worldY: number, shift: boolean) {
    if (shift && this.selected) {
      // Shift + click = queue Fire at clicked enemy (if any).
      const target = this.enemyAt(worldX, worldY, this.selected)
      if (target) this.queueFire(this.selected, target)
      return
    }

    // Click on a piece → select that piece.
    const piece = this.pieceAt(worldX, worldY)
    if (piece) {
      this.select(piece)
      return
    }

    // Click on a cell with a piece selected → queue Move.
    if (this.selected) {
      this.queueMove(this.selected, worldX, worldY)
    }
  }

  /**
   * Right-click. If a piece is selected and has queued actions, clear them
   * (refund AP). Otherwise deselect.
   */
  onSecondaryClick() {
    if (this.selected && this.selected.queuedActions.length > 0) {
      this.selected.clearPlan()
      this.emitSelection()
      this.redrawOverlays()
      return
    }
    this.deselect()
  }

  // ── Selection ────────────────────────────────────────────────────────────

  private select(piece: Selectable) {
    this.selected = piece
    this.refreshSelectionRing()
    this.emitSelection()
  }

  private deselect() {
    this.selected = null
    this.removeSelectionRing()
    this.emitSelection()
  }

  private refreshSelectionRing() {
    this.removeSelectionRing()
    if (!this.selected) return
    const { x, y } = this.pieceWorld(this.selected)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(22, 28, 32),
      new THREE.MeshBasicMaterial({
        color: SELECT_RING_COLOR, side: THREE.DoubleSide,
        transparent: true, opacity: 0.85, depthTest: false,
      })
    )
    ring.position.set(x, y, 1.2)
    ring.renderOrder = 19
    this.scene.add(ring)
    this.selectionRing = ring
  }

  private removeSelectionRing() {
    if (!this.selectionRing) return
    this.scene.remove(this.selectionRing)
    this.selectionRing.geometry.dispose()
    ;(this.selectionRing.material as THREE.Material).dispose()
    this.selectionRing = null
  }

  private emitSelection() {
    if (!this.selected || !this.onSelectionChange) {
      this.onSelectionChange?.(null)
      return
    }
    this.onSelectionChange({
      label: this.pieceLabel(this.selected),
      side: this.selected.side,
      apRemaining: this.selected.apRemaining,
      apBudget: this.selected.apBudget,
      queuedActions: this.selected.queuedActions,
    })
  }

  // ── Action queueing ──────────────────────────────────────────────────────

  private queueMove(piece: Selectable, worldX: number, worldY: number) {
    if (piece.apRemaining < AP_COST.move) return

    // Walls/mines/sphere/structures don't move — only cyborgs have a non-zero
    // move ability today. Reject silently.
    if (!(piece instanceof SpriteUnit)) return

    const cell = this.cellAtWorld(worldX, worldY)
    if (!cell) return

    // For now, no reachability check — phase 3 reveal will skip invalid moves
    // anyway (strict skip), and we want plan-then-play tension. We do reject
    // queuing the same cell twice in a row.
    const last = piece.queuedActions[piece.queuedActions.length - 1]
    if (last?.kind === 'move' && last.cell.col === cell.col && last.cell.row === cell.row) return

    const action: QueuedAction = { kind: 'move', cell }
    piece.queueAction(action, AP_COST.move)
    this.emitSelection()
    this.redrawOverlays()
  }

  private queueFire(piece: Selectable, target: Selectable | PixelPowerCore) {
    if (piece.apRemaining < AP_COST.fire) return

    // Range check against the piece's attack range.
    const sx = this.pieceWorld(piece).x
    const sy = this.pieceWorld(piece).y
    const tx = 'worldX' in target ? target.worldX : target.mesh.position.x
    const ty = 'worldY' in target ? target.worldY : target.mesh.position.y
    const dx = tx - sx, dy = ty - sy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const range = this.pieceRange(piece)
    if (dist > range) return

    const action: QueuedAction = {
      kind: 'fire',
      target: { kind: targetKind(target), id: targetId(target) },
    }
    piece.queueAction(action, AP_COST.fire)
    this.emitSelection()
    this.redrawOverlays()
  }

  // ── Hit-testing ──────────────────────────────────────────────────────────

  private pieceAt(worldX: number, worldY: number): Selectable | null {
    let closest: Selectable | null = null
    let closestDist = CLICK_RADIUS_SQ
    const consider = (piece: Selectable, px: number, py: number) => {
      const dx = px - worldX, dy = py - worldY
      const d = dx * dx + dy * dy
      if (d < closestDist) { closestDist = d; closest = piece }
    }
    for (const s of this.spheres)    if (!s.isDead) consider(s, s.worldX, s.worldY)
    for (const c of this.cyborgs)    if (!c.isDead) consider(c, c.worldX, c.worldY)
    for (const s of this.structures) if (!s.isDead) consider(s, s.worldX, s.worldY)
    return closest
  }

  private enemyAt(worldX: number, worldY: number, selected: Selectable): Selectable | PixelPowerCore | null {
    const friendlySide = selected.side
    // Defender selecting → enemies are cyborgs. Attacker selecting → enemies
    // are defender pieces (spheres, structures) plus the core.
    let closest: Selectable | PixelPowerCore | null = null
    let closestDist = CLICK_RADIUS_SQ
    const consider = (entity: Selectable | PixelPowerCore, px: number, py: number) => {
      const dx = px - worldX, dy = py - worldY
      const d = dx * dx + dy * dy
      if (d < closestDist) { closestDist = d; closest = entity }
    }
    if (friendlySide === 'defender') {
      for (const c of this.cyborgs) if (!c.isDead) consider(c, c.worldX, c.worldY)
    } else {
      for (const s of this.spheres)    if (!s.isDead) consider(s, s.worldX, s.worldY)
      for (const s of this.structures) if (!s.isDead) consider(s, s.worldX, s.worldY)
      if (!this.core.isDead) consider(this.core, this.core.mesh.position.x, this.core.mesh.position.y)
    }
    return closest
  }

  private cellAtWorld(worldX: number, worldY: number): CellRef | null {
    const cell = Config.GRID_CELL
    const col = Math.floor((worldX - Config.WORLD.LEFT) / cell)
    const row = Math.floor((worldY - Config.WORLD.BOTTOM) / cell)
    const maxCol = Math.floor((Config.WORLD.RIGHT - Config.WORLD.LEFT) / cell)
    const maxRow = Math.floor((Config.WORLD.TOP - Config.WORLD.BOTTOM) / cell)
    if (col < 0 || col >= maxCol || row < 0 || row >= maxRow) return null
    return { col, row }
  }

  private cellWorldCenter(cell: CellRef): { x: number; y: number } {
    const c = Config.GRID_CELL
    return {
      x: Config.WORLD.LEFT   + cell.col * c + c / 2,
      y: Config.WORLD.BOTTOM + cell.row * c + c / 2,
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private pieceWorld(piece: Selectable): { x: number; y: number } {
    return { x: piece.worldX, y: piece.worldY }
  }

  private pieceLabel(piece: Selectable): string {
    if (piece instanceof SpriteUnit)     return `${Config.UNITS[piece.type].label} ${piece.id}`
    if (piece instanceof SphereDefender) return `Sphere ${piece.id}`
    return `${Config.STRUCTURES[piece.type].label} ${piece.id}`
  }

  private pieceRange(piece: Selectable): number {
    if (piece instanceof SpriteUnit)     return Config.UNITS[piece.type].range
    if (piece instanceof SphereDefender) return Config.SPHERE.range
    return Config.STRUCTURES[piece.type].range
  }

  // ── Visual overlays for every queued action ──────────────────────────────

  private redrawOverlays() {
    // Tear down old overlay primitives.
    while (this.overlayGroup.children.length > 0) {
      const o = this.overlayGroup.children[0]
      this.overlayGroup.remove(o)
      ;(o as any).geometry?.dispose?.()
      ;(o as any).material?.dispose?.()
    }

    const allPlanners: Selectable[] = [
      ...this.spheres.filter(s => !s.isDead),
      ...this.cyborgs.filter(c => !c.isDead),
      ...this.structures.filter(s => !s.isDead),
    ]
    for (const piece of allPlanners) {
      let sx = piece.worldX, sy = piece.worldY
      for (const action of piece.queuedActions) {
        if (action.kind === 'move') {
          const dest = this.cellWorldCenter(action.cell)
          this.overlayGroup.add(this.makeLine(sx, sy, dest.x, dest.y, MOVE_LINE_COLOR))
          this.overlayGroup.add(this.makeDot(dest.x, dest.y, MOVE_LINE_COLOR))
          sx = dest.x; sy = dest.y
        } else if (action.kind === 'fire') {
          const t = this.resolveTarget(action.target)
          if (!t) continue
          this.overlayGroup.add(this.makeLine(sx, sy, t.x, t.y, FIRE_LINE_COLOR))
        }
      }
    }
  }

  private makeLine(x1: number, y1: number, x2: number, y2: number, color: number): THREE.Line {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([x1, y1, 1.5, x2, y2, 1.5], 3))
    const mat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.85, depthTest: false,
    })
    const line = new THREE.Line(geo, mat)
    line.renderOrder = 20
    return line
  }

  private makeDot(x: number, y: number, color: number): THREE.Mesh {
    const geo = new THREE.CircleGeometry(5, 12)
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, depthTest: false,
    })
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, 1.5)
    m.renderOrder = 20
    return m
  }

  private resolveTarget(ref: { kind: string; id: string }): { x: number; y: number } | null {
    if (ref.kind === 'core') {
      return { x: this.core.mesh.position.x, y: this.core.mesh.position.y }
    }
    const all: Selectable[] = [...this.spheres, ...this.cyborgs, ...this.structures]
    const hit = all.find(p => p.id === ref.id && !p.isDead)
    return hit ? { x: hit.worldX, y: hit.worldY } : null
  }

  dispose() {
    this.removeSelectionRing()
    this.scene.remove(this.overlayGroup)
    while (this.overlayGroup.children.length > 0) {
      const o = this.overlayGroup.children[0]
      this.overlayGroup.remove(o)
      ;(o as any).geometry?.dispose?.()
      ;(o as any).material?.dispose?.()
    }
  }
}

function targetKind(target: Selectable | PixelPowerCore): 'unit' | 'sphere' | 'structure' | 'core' {
  if (target instanceof SpriteUnit)     return 'unit'
  if (target instanceof SphereDefender) return 'sphere'
  if (target instanceof Structure)      return 'structure'
  return 'core'
}

function targetId(target: Selectable | PixelPowerCore): string {
  if (target instanceof PixelPowerCore) return 'core'
  return target.id
}
