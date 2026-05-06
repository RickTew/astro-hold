import { StructureType, UnitType } from '../game/GameConfig'

export class HUD {
  private container: HTMLElement
  private creditsEl!: HTMLElement
  private attCreditsEl!: HTMLElement
  private phaseEl!: HTMLElement
  private bottomBarEl!: HTMLElement
  private messageEl!: HTMLElement
  private loadingEl!: HTMLElement

  onSelectStructure: ((type: StructureType) => void) | null = null
  onSpawnUnit: ((type: UnitType) => void) | null = null
  onBattle: (() => void) | null = null

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
      <div id="bottom-bar" class="hidden">
        <div id="shop" class="shop-panel">
          <button class="shop-btn" data-type="turret">Turret 30cr</button>
          <button class="shop-btn" data-type="cannon">Cannon 60cr</button>
          <button class="shop-btn" data-type="wall">Wall 20cr</button>
          <button class="shop-btn" data-type="mine">Mine 20cr</button>
        </div>
        <button id="battle-btn">&#9876; BATTLE</button>
        <div id="attacker-shop" class="shop-panel att-panel">
          <button class="att-btn" data-type="scout">Scout 20cr</button>
          <button class="att-btn" data-type="tank">Tank 50cr</button>
          <button class="att-btn" data-type="bomber">Bomber 60cr</button>
          <button class="att-btn" data-type="drone">Drone 30cr</button>
        </div>
      </div>
      <div id="game-message" class="hidden"></div>
    `

    this.loadingEl     = this.container.querySelector('#loading-screen')!
    this.phaseEl       = this.container.querySelector('#phase-display')!
    this.creditsEl     = this.container.querySelector('#credits-val')!
    this.attCreditsEl  = this.container.querySelector('#att-credits-val')!
    this.bottomBarEl   = this.container.querySelector('#bottom-bar')!
    this.messageEl     = this.container.querySelector('#game-message')!

    this.container.querySelectorAll('.shop-btn').forEach(btn => {
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

    this.container.querySelector('#battle-btn')!.addEventListener('click', () => this.onBattle?.())
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
  }

  setAttCredits(amount: number) {
    this.attCreditsEl.textContent = String(amount)
  }

  setPhase(phase: 'build' | 'battle' | 'win' | 'lose') {
    switch (phase) {
      case 'build':
        this.phaseEl.textContent = 'BUILD PHASE'
        this.bottomBarEl.classList.remove('hidden')
        this.messageEl.classList.add('hidden')
        break
      case 'battle':
        this.phaseEl.textContent = 'BATTLE PHASE'
        this.bottomBarEl.classList.add('hidden')
        break
      case 'win':
        this.phaseEl.textContent = 'BATTLE PHASE'
        this.messageEl.innerHTML = 'DEFENDER WINS<small>Power Core survived</small>'
        this.messageEl.style.color = '#00ffaa'
        this.messageEl.classList.remove('hidden')
        break
      case 'lose':
        this.phaseEl.textContent = 'BATTLE PHASE'
        this.messageEl.innerHTML = 'ATTACKER WINS<small>Power Core destroyed</small>'
        this.messageEl.style.color = '#ff4444'
        this.messageEl.classList.remove('hidden')
        break
    }
  }

  dispose() {
    this.container.innerHTML = ''
  }
}
