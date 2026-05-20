import { Config, StructureType, UnitType } from '../game/GameConfig'
import type { PlanningSelectionInfo } from '../game/PlanningPhase'
import type { CombatLogEntry } from '../game/RevealPhase'

const SPHERE_COST = 100   // mirrors Game.SPHERE_COST

export class HUD {
  private container: HTMLElement
  private creditsEl!: HTMLElement
  private attCreditsEl!: HTMLElement
  private phaseEl!: HTMLElement
  private bottomBarEl!: HTMLElement
  private robotShopEl!: HTMLElement
  private cyborgShopEl!: HTMLElement
  private messageEl!: HTMLElement
  private loadingEl!: HTMLElement
  private planBarEl!: HTMLElement
  private planSelectionEl!: HTMLElement
  private combatLogEl!: HTMLElement
  // Sticky empty-state marker so we know whether to wipe the "(combat will
  // appear here…)" placeholder on first append.
  private combatLogEmpty = true
  private compassRoseEl: HTMLElement | null = null
  // Document-level mousedown listener installed when the rose opens. Closes
  // the rose on any click outside the rose DOM — works regardless of whether
  // the click lands on the canvas or another HUD element.
  private compassRoseOutsideListener: ((e: MouseEvent) => void) | null = null

  onSelectStructure: ((type: StructureType) => void) | null = null
  onSpawnUnit: ((type: UnitType) => void) | null = null
  onBuySphere: (() => void) | null = null
  onBuyDog: (() => void) | null = null
  onBattle: (() => void) | null = null
  // Side picker — Game listens here for the chosen team. Fires once,
  // after which the AI takes the other side for the rest of the game.
  onPickSide: ((side: 'defender' | 'attacker') => void) | null = null
  // Compass-rose callbacks. Game decides whether the purchase succeeds (cost,
  // credits, duplicate facing); HUD just forwards the click intent.
  onAddFacing: ((angle: number) => void) | null = null
  // Player clicked Refund on an opened rose. Game removes the structure and
  // returns the base cost. HUD will auto-close the rose after the callback.
  onRefundStructure: (() => void) | null = null
  // Rose closed (via the X button, document-level outside-click listener, or
  // hideCompassRose called by Game). Game uses this to clear editingStructure
  // and hide the arc-preview overlay.
  onRoseClose: (() => void) | null = null

  constructor() {
    this.container = document.getElementById('hud')!
    this.build()
  }

  private build() {
    this.container.innerHTML = `
      <div id="loading-screen">LOADING ASSETS...</div>
      <div id="phase-display" class="hidden">BUILD PHASE</div>
      <div id="team-label-def" class="hidden">ROBOTS</div>
      <div id="credits-display" class="hidden">Credits: <span id="credits-val">200</span></div>
      <div id="team-label-att" class="hidden">CYBORGS</div>
      <div id="att-credits-display" class="hidden">Credits: <span id="att-credits-val">200</span></div>
      <div id="top-robot-shop" class="shop-panel hidden">
        <button id="sphere-btn" class="shop-btn">Sphere 100cr</button>
        <button class="shop-btn" data-type="turret">Tower 30cr</button>
        <button class="shop-btn" data-type="bomber">Bomber 70cr</button>
        <button class="shop-btn" data-type="wall">Wall 20cr</button>
        <button id="dog-btn" class="shop-btn">Dog 40cr</button>
        <button class="shop-btn preview" data-type="defense">Defense 20cr</button>
        <button class="shop-btn preview" data-type="gun">Gun 30cr</button>
        <button class="shop-btn preview" data-type="laser">Laser 40cr</button>
        <button class="shop-btn preview" data-type="signal">Signal 20cr</button>
      </div>
      <div id="top-cyborg-shop" class="shop-panel att-panel hidden">
        <button class="att-btn" data-type="cannon">Cannon 70cr</button>
        <button class="att-btn" data-type="grenadier">Grenadier 50cr</button>
        <button class="att-btn" data-type="doublegun">Double Gun 90cr</button>
        <button class="att-btn" data-type="hulk">Hulk 100cr</button>
        <button class="att-btn" data-type="sniper">Sniper 90cr</button>
      </div>
      <div id="bottom-bar" class="hidden">
        <button id="battle-btn">READY</button>
      </div>
      <div id="plan-bar" class="hidden">
        <div id="plan-instructions">
          <strong>PLAN PHASE</strong>
          <span>Click a piece &middot; click a cell to queue Move &middot; Shift+click an enemy to queue Fire &middot; Right-click to clear / deselect</span>
        </div>
        <button id="plan-battle-btn">BATTLE</button>
      </div>
      <div id="plan-selection" class="hidden"></div>
      <div id="combat-log" class="hidden"><div class="log-empty">(combat events appear here as the battle plays)</div></div>
      <div id="game-message" class="hidden"></div>
      <div id="side-picker" class="hidden">
        <div class="sp-card-row">
          <div class="sp-card" data-side="defender">
            <div class="sp-team">ROBOTS</div>
            <div class="sp-role">DEFEND THE CORE</div>
          </div>
          <div class="sp-card att" data-side="attacker">
            <div class="sp-team">CYBORGS</div>
            <div class="sp-role">DESTROY THE CORE</div>
          </div>
        </div>
      </div>
    `

    this.loadingEl        = this.container.querySelector('#loading-screen')!
    this.phaseEl          = this.container.querySelector('#phase-display')!
    this.creditsEl        = this.container.querySelector('#credits-val')!
    this.attCreditsEl     = this.container.querySelector('#att-credits-val')!
    this.bottomBarEl      = this.container.querySelector('#bottom-bar')!
    this.robotShopEl      = this.container.querySelector('#top-robot-shop')!
    this.cyborgShopEl     = this.container.querySelector('#top-cyborg-shop')!
    this.messageEl        = this.container.querySelector('#game-message')!
    this.planBarEl        = this.container.querySelector('#plan-bar')!
    this.planSelectionEl  = this.container.querySelector('#plan-selection')!
    this.combatLogEl      = this.container.querySelector('#combat-log')!

    this.container.querySelector('#sphere-btn')?.addEventListener('click', () => {
      this.onBuySphere?.()
    })

    this.container.querySelector('#dog-btn')?.addEventListener('click', () => {
      this.onBuyDog?.()
    })

    this.container.querySelectorAll('.shop-btn:not(#sphere-btn):not(#dog-btn)').forEach(btn => {
      btn.addEventListener('click', e => {
        const type = (e.currentTarget as HTMLElement).dataset.type as StructureType
        this.container.querySelectorAll('.shop-btn').forEach(b => b.classList.remove('selected'))
        ;(e.currentTarget as HTMLElement).classList.add('selected')
        this.onSelectStructure?.(type)
      })
    })

    this.container.querySelectorAll('.att-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const type = (e.currentTarget as HTMLElement).dataset.type as UnitType
        this.onSpawnUnit?.(type)
      })
    })

    this.container.querySelector('#battle-btn')!.addEventListener('click', () => {
      this.playBattleSound()
      this.onBattle?.()
    })

    this.container.querySelector('#plan-battle-btn')!.addEventListener('click', () => {
      this.playBattleSound()
      this.onBattle?.()
    })

    // Side-picker cards. Mouse-only per the no-keyboard rule.
    this.container.querySelectorAll<HTMLElement>('#side-picker .sp-card').forEach(card => {
      card.addEventListener('click', () => {
        const side = card.dataset.side as 'defender' | 'attacker'
        this.onPickSide?.(side)
      })
    })
  }

  // ─── Side picker / single-player mode ──────────────────────────────────

  // Shown after preload — player picks Robots or Cyborgs. AI takes the
  // other side via Game.opponentAI.
  showSidePicker() {
    this.loadingEl.classList.add('hidden')
    const picker = this.container.querySelector('#side-picker')
    picker?.classList.remove('hidden')
  }

  // Lock in the player's chosen side. Hides the opposing shop panel; the
  // AI handles spawning for that side. Also hides the side-picker overlay.
  setPlayerSide(side: 'defender' | 'attacker') {
    const picker = this.container.querySelector('#side-picker')
    picker?.classList.add('hidden')
    // Hide the AI side's shop panel — the player must not click it, nor
    // see its credits.
    if (side === 'defender') {
      this.container.querySelector('#top-cyborg-shop')?.classList.add('ai-side')
      this.container.querySelector('#att-credits-display')?.classList.add('ai-side')
      this.container.querySelector('#team-label-att')?.classList.add('ai-side')
    } else {
      this.container.querySelector('#top-robot-shop')?.classList.add('ai-side')
      this.container.querySelector('#credits-display')?.classList.add('ai-side')
      this.container.querySelector('#team-label-def')?.classList.add('ai-side')
    }
  }

  // Stub so Game can log without checking — no UI for system log on the
  // baseline HUD; reserved for future redesigns.
  logSystemMessage(_text: string, _kind: 'system' | 'player' | 'ai' = 'system') {
    // intentionally no-op
  }

  showGame() {
    this.loadingEl.classList.add('hidden')
    this.phaseEl.classList.remove('hidden')
    this.container.querySelector('#credits-display')!.classList.remove('hidden')
    this.container.querySelector('#att-credits-display')!.classList.remove('hidden')
    this.container.querySelector('#team-label-def')!.classList.remove('hidden')
    this.container.querySelector('#team-label-att')!.classList.remove('hidden')
  }

  setCredits(amount: number) {
    this.creditsEl.textContent = String(amount)
    this.refreshAffordability('robots', amount)
  }

  setAttCredits(amount: number) {
    this.attCreditsEl.textContent = String(amount)
    this.refreshAffordability('cyborgs', amount)
  }

  // Grey out buttons whose cost exceeds current credits so failed placements
  // are obvious. Was previously silent — user thought placement was broken.
  private refreshAffordability(side: 'robots' | 'cyborgs', credits: number) {
    if (side === 'robots') {
      const sphereBtn = this.container.querySelector('#sphere-btn')
      sphereBtn?.classList.toggle('insufficient', credits < SPHERE_COST)
      const dogBtn = this.container.querySelector('#dog-btn')
      dogBtn?.classList.toggle('insufficient', credits < Config.UNITS.dog.cost)
      this.container.querySelectorAll('#top-robot-shop .shop-btn[data-type]').forEach(b => {
        const type = (b as HTMLElement).dataset.type as StructureType
        const cost = Config.STRUCTURES[type]?.cost ?? 0
        b.classList.toggle('insufficient', credits < cost)
      })
    } else {
      this.container.querySelectorAll('#top-cyborg-shop .att-btn[data-type]').forEach(b => {
        const type = (b as HTMLElement).dataset.type as UnitType
        const cost = Config.UNITS[type]?.cost ?? 0
        b.classList.toggle('insufficient', credits < cost)
      })
    }
  }

  setSelectedUnitType(type: UnitType | null) {
    this.container.querySelectorAll('.att-btn').forEach(b => b.classList.remove('selected'))
    if (type) {
      this.container.querySelector(`.att-btn[data-type="${type}"]`)?.classList.add('selected')
    }
  }

  // Drop the visual "selected" highlight off any structure button — called
  // when the player picks a sphere/cyborg so the UI mirrors that the
  // structure placement was cancelled under the hood.
  clearStructureSelection() {
    this.container.querySelectorAll('.shop-btn').forEach(b => b.classList.remove('selected'))
  }

  setPhase(phase: 'build' | 'planning' | 'reveal' | 'win' | 'lose') {
    switch (phase) {
      case 'build':
        this.phaseEl.textContent = 'BUILD PHASE'
        this.bottomBarEl.classList.remove('hidden')
        this.robotShopEl.classList.remove('hidden')
        this.cyborgShopEl.classList.remove('hidden')
        this.planBarEl.classList.add('hidden')
        this.planSelectionEl.classList.add('hidden')
        this.combatLogEl.classList.add('hidden')
        this.messageEl.classList.add('hidden')
        break
      case 'planning':
        this.phaseEl.textContent = 'PLAN PHASE'
        this.bottomBarEl.classList.add('hidden')
        this.robotShopEl.classList.add('hidden')
        this.cyborgShopEl.classList.add('hidden')
        this.planBarEl.classList.remove('hidden')
        this.combatLogEl.classList.add('hidden')
        this.messageEl.classList.add('hidden')
        break
      case 'reveal':
        this.phaseEl.textContent = 'BATTLE'
        this.bottomBarEl.classList.add('hidden')
        this.robotShopEl.classList.add('hidden')
        this.cyborgShopEl.classList.add('hidden')
        this.planBarEl.classList.add('hidden')
        this.planSelectionEl.classList.add('hidden')
        this.combatLogEl.classList.remove('hidden')
        this.messageEl.classList.add('hidden')
        break
      case 'win':
        this.phaseEl.textContent = 'BATTLE PHASE'
        this.showEndMessage('DEFENDER WINS', 'Power Core survived', '#00ffaa')
        break
      case 'lose':
        this.phaseEl.textContent = 'BATTLE PHASE'
        this.showEndMessage('ATTACKER WINS', 'Power Core destroyed', '#ff4444')
        break
    }
  }

  // Win/lose overlay with a Play Again button. Reload-based reset — simplest
  // reliable path, avoids the partial-state landmines a hand-rolled reset
  // would hit (pending grenades, animation frames mid-clip, audio context).
  private showEndMessage(headline: string, subtitle: string, color: string) {
    this.messageEl.innerHTML = `
      ${headline}
      <small>${subtitle}</small>
      <button id="play-again-btn">Play Again</button>
    `
    this.messageEl.style.color = color
    this.messageEl.classList.remove('hidden')
    this.messageEl.querySelector('#play-again-btn')?.addEventListener('click', () => {
      window.location.reload()
    })
  }

  // Shown when a reveal completes with 0 planned actions — no piece on
  // either side can act (out of ammo, no targets in sight, no movement
  // options). Same Play Again affordance as win/lose so the player isn't
  // stuck staring at a frozen board.
  showStalemate(reason?: string) {
    this.showEndMessage(
      'STALEMATE',
      reason ?? 'No piece can act — start a new round?',
      '#ffcc44',
    )
  }

  hideMessage() {
    this.messageEl.classList.add('hidden')
    this.messageEl.innerHTML = ''
  }

  // ── Compass rose ─────────────────────────────────────────────────────────

  // Open the rose at a fixed screen position. activeFacings is the list of
  // currently-active math-angles (0=east, π/2=north, etc); cost is the price
  // to add ONE new facing; credits is the player's current balance (drives
  // the unaffordable greyout). The 'name' label is the structure type shown
  // in the title row.
  showCompassRose(screenX: number, screenY: number, opts: {
    name: string
    activeFacings: ReadonlyArray<number>
    cost: number
    credits: number
  }) {
    this.hideCompassRose()
    const el = document.createElement('div')
    el.id = 'compass-rose'
    el.style.left = `${screenX}px`
    el.style.top  = `${screenY}px`
    el.innerHTML = this.buildRoseInnerHtml(opts)
    this.wireRoseButtons(el)
    this.container.appendChild(el)
    this.compassRoseEl = el

    // Document-level mousedown: close the rose on ANY click outside its DOM.
    // Captures the event before Game's window-level handler so it can decide
    // whether to bubble (no stopPropagation here — Game's refund/place still
    // runs on the same click, which is exactly what the user expects: one
    // click closes the rose AND acts at the click target).
    this.compassRoseOutsideListener = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target && this.compassRoseEl?.contains(target)) return
      this.hideCompassRose()
    }
    document.addEventListener('mousedown', this.compassRoseOutsideListener, true)
  }

  hideCompassRose() {
    // Only fire onRoseClose if there was actually an open rose to close —
    // otherwise the internal-cleanup call at the top of showCompassRose
    // would clobber Game's editingStructure RIGHT AFTER it was set, breaking
    // the rose's button clicks.
    const wasOpen = this.compassRoseEl !== null
    if (this.compassRoseEl) {
      this.compassRoseEl.remove()
      this.compassRoseEl = null
    }
    if (this.compassRoseOutsideListener) {
      document.removeEventListener('mousedown', this.compassRoseOutsideListener, true)
      this.compassRoseOutsideListener = null
    }
    if (wasOpen) this.onRoseClose?.()
  }

  private wireRoseButtons(el: HTMLElement) {
    el.querySelectorAll<HTMLElement>('.rose-btn[data-angle]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('active')) return
        if (btn.classList.contains('unaffordable')) return
        const angle = parseFloat(btn.dataset.angle!)
        this.onAddFacing?.(angle)
      })
    })
    el.querySelector<HTMLElement>('.rose-close-btn')?.addEventListener('click', () => {
      this.hideCompassRose()
    })
    el.querySelector<HTMLElement>('.rose-refund-btn')?.addEventListener('click', () => {
      this.onRefundStructure?.()
      this.hideCompassRose()
    })
  }

  isCompassRoseOpen(): boolean { return this.compassRoseEl !== null }

  // Re-render the rose's button states without recreating the DOM element.
  // Called by Game after a successful addFacing so the newly-active direction
  // flips to its "active" style and the cost recalculates.
  refreshCompassRose(opts: {
    name: string
    activeFacings: ReadonlyArray<number>
    cost: number
    credits: number
  }) {
    if (!this.compassRoseEl) return
    this.compassRoseEl.innerHTML = this.buildRoseInnerHtml(opts)
    this.wireRoseButtons(this.compassRoseEl)
  }

  private buildRoseInnerHtml(opts: {
    name: string
    activeFacings: ReadonlyArray<number>
    cost: number
    credits: number
  }): string {
    // Order: top row blank/N/blank, middle W/center/E, bottom blank/S/blank.
    // Cardinal labels in compass terms (top-down view): N = +Y (up on screen),
    // E = +X (right), S = -Y (down), W = -X (left). Math angles: E=0, N=π/2,
    // W=π, S=-π/2 (or 3π/2 normalized).
    const dirs: Array<{ key: string; angle: number; arrow: string; pos: number }> = [
      { key: 'N', angle:  Math.PI / 2,  arrow: '↑', pos: 2 },
      { key: 'W', angle:  Math.PI,      arrow: '←', pos: 4 },
      { key: 'E', angle:  0,            arrow: '→', pos: 6 },
      { key: 'S', angle: -Math.PI / 2,  arrow: '↓', pos: 8 },
    ]
    const TAU = Math.PI * 2
    const isActive = (a: number) =>
      opts.activeFacings.some(f => {
        const fn = ((f % TAU) + TAU) % TAU
        const an = ((a % TAU) + TAU) % TAU
        return Math.abs(fn - an) < 0.01
      })
    // Build the 3x3 grid by position index (1..9). Corners + center get fillers.
    const cells: string[] = []
    for (let i = 1; i <= 9; i++) {
      if (i === 5) {
        cells.push('<div class="rose-center">' + opts.activeFacings.length + '/4</div>')
        continue
      }
      const d = dirs.find(x => x.pos === i)
      if (!d) { cells.push('<div></div>'); continue }
      if (isActive(d.angle)) {
        cells.push(`<div class="rose-btn active" data-angle="${d.angle}"><span class="rose-arrow">${d.arrow}</span><span class="rose-on">ON</span></div>`)
      } else if (opts.credits < opts.cost) {
        cells.push(`<div class="rose-btn unaffordable" data-angle="${d.angle}"><span class="rose-arrow">${d.arrow}</span><span class="rose-cost">+${opts.cost}cr</span></div>`)
      } else {
        cells.push(`<div class="rose-btn" data-angle="${d.angle}"><span class="rose-arrow">${d.arrow}</span><span class="rose-cost">+${opts.cost}cr</span></div>`)
      }
    }
    return `
      <div class="rose-title">
        <span>${opts.name} arcs</span>
        <button class="rose-close-btn" type="button" aria-label="Close">✕</button>
      </div>
      ${cells.join('')}
      <div class="rose-footer">
        <button class="rose-refund-btn" type="button">Refund</button>
      </div>
    `
  }

  // Append one reveal's worth of combat-log entries under a "── Turn N ──"
  // header. Auto-scrolls to the bottom so the latest action is in view; trims
  // the DOM to the last ~200 entries so long battles don't bloat memory.
  appendCombatLog(turn: number, entries: ReadonlyArray<CombatLogEntry>) {
    if (entries.length === 0) return
    if (this.combatLogEmpty) {
      this.combatLogEl.innerHTML = ''
      this.combatLogEmpty = false
    }
    const header = document.createElement('div')
    header.className = 'log-turn'
    header.textContent = `── Turn ${turn} ──`
    this.combatLogEl.appendChild(header)
    for (const e of entries) {
      const row = document.createElement('div')
      row.className = `log-entry ${e.side}`
      row.textContent = e.text
      this.combatLogEl.appendChild(row)
    }
    const MAX_ROWS = 220
    while (this.combatLogEl.childElementCount > MAX_ROWS) {
      this.combatLogEl.removeChild(this.combatLogEl.firstChild!)
    }
    this.combatLogEl.scrollTop = this.combatLogEl.scrollHeight
  }

  setPlanningSelection(info: PlanningSelectionInfo | null) {
    if (!info) {
      this.planSelectionEl.classList.add('hidden')
      this.planSelectionEl.innerHTML = ''
      return
    }
    const queueLines = info.queuedActions.length === 0
      ? '<em>(no actions queued)</em>'
      : info.queuedActions.map((a, i) => {
          if (a.kind === 'move')  return `${i + 1}. Move → (${a.cell.col}, ${a.cell.row})`
          if (a.kind === 'fire')  return `${i + 1}. Fire → ${a.target.kind}:${a.target.id}`
          if (a.kind === 'throw') return `${i + 1}. Throw → (${a.cell.col}, ${a.cell.row})`
          return `${i + 1}. Hold`
        }).join('<br>')
    const sideColor = info.side === 'defender' ? '#66ccff' : '#ff7766'
    this.planSelectionEl.innerHTML = `
      <div class="plan-sel-header" style="color:${sideColor}">${info.label}</div>
      <div class="plan-sel-ap">AP: <strong>${info.apRemaining}</strong> / ${info.apBudget}</div>
      <div class="plan-sel-queue">${queueLines}</div>
    `
    this.planSelectionEl.classList.remove('hidden')
  }

  private playBattleSound() {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(220, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.35)
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.45)
      osc.onended = () => ctx.close()
    } catch { /* audio unavailable */ }
  }

  dispose() {
    this.container.innerHTML = ''
  }
}
