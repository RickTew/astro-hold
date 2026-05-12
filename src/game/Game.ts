import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Config, UnitType } from './GameConfig'
import { Background } from '../scene/Background'
import { PowerCore } from '../entities/PowerCore'
import { SphereDefender } from '../entities/SphereDefender'
import { Unit } from '../entities/Unit'
import { HUD } from '../ui/HUD'
import { AIPlayer } from '../ai/AIPlayer'
import { BuildPhase } from './BuildPhase'
import { BattlePhase } from './BattlePhase'

type Phase = 'loading' | 'build' | 'battle' | 'win' | 'lose'

// Unified placement session — covers both cyborg and sphere placement.
// Ghost mesh is the authoritative position; never re-raycast at click time.
// onPlace returns true to end the session (single-shot), false to stay
// in placement mode (multi-place).
type PlacementKind = 'sphere' | UnitType
type PlacementSession = {
  kind: PlacementKind
  ghost: THREE.Mesh
  tint: THREE.Mesh | null
  zoneXMin: number
  zoneXMax: number
  onPlace: (x: number, y: number) => boolean
  onEnd?: () => void
}

const SPHERE_COST = 100

export class Game {
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private renderer: THREE.WebGLRenderer
  private rafId = 0
  private lastTime = 0
  private phase: Phase = 'loading'

  private background!: Background
  private powerCore!: PowerCore
  private hud!: HUD
  private buildPhase: BuildPhase | null = null
  private battlePhase: BattlePhase | null = null
  private attackerUnits: Unit[] = []

  private attCredits = Config.START_CREDITS
  private attZoneMesh: THREE.Mesh | null = null
  private defZoneMesh: THREE.Mesh | null = null

  // Multi-sphere: one template, many cloned instances per placement.
  private sphereTemplate: THREE.Object3D | null = null
  private spheres: SphereDefender[] = []

  // Single source of truth for any active placement.
  private placement: PlacementSession | null = null

  // Camera pan/zoom state
  private isPanning = false
  private lastPan = { x: 0, y: 0 }
  private zoomVelocity = 0

  constructor(private canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x201b14)  // matches terrain darkest tone

    const halfH = 600 / (window.innerWidth / window.innerHeight)
    this.camera = new THREE.OrthographicCamera(-600, 600, halfH, -halfH, 1, 1500)
    this.camera.position.set(0, 300, 300)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)

    this.scene.add(new THREE.AmbientLight(0xffffff, 2.5))
    const dir = new THREE.DirectionalLight(0xffffff, 1.2)
    dir.position.set(0, 0, 100)
    this.scene.add(dir)

    window.addEventListener('resize', this.onResize)
    window.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('contextmenu', this.onContextMenu)
  }

  async init() {
    this.background = new Background(this.scene)
    this.powerCore = new PowerCore(this.scene)
    this.hud = new HUD()

    // Light map grid (50-unit cells)
    const grid = new THREE.GridHelper(1200, 24, 0xaaaaaa, 0x777777)
    grid.rotation.x = Math.PI / 2
    grid.position.z = 1.5
    const gridMats = Array.isArray(grid.material) ? grid.material : [grid.material]
    gridMats.forEach(m => { const lm = m as THREE.LineBasicMaterial; lm.transparent = true; lm.opacity = 0.3 })
    this.scene.add(grid)

    // Block UI until all visuals are ready, so placements never show the swap.
    await Promise.all([
      Unit.preload(),
      this.loadSphereTemplate(),
    ])

    this.hud.showGame()
    this.enterBuildPhase()
  }

  // Loads sphere.glb once and stores a normalized model as the clone source.
  // Falls back to a plain SphereGeometry only if the GLB load fails.
  private loadSphereTemplate(): Promise<void> {
    return new Promise<void>(resolve => {
      const loader = new GLTFLoader()
      loader.load(
        '/models/sphere.glb',
        gltf => {
          const model = gltf.scene
          const box = new THREE.Box3().setFromObject(model)
          const size = new THREE.Vector3()
          box.getSize(size)
          const maxDim = Math.max(size.x, size.y, size.z)
          if (maxDim > 0) model.scale.setScalar(36 / maxDim)
          this.sphereTemplate = model
          resolve()
        },
        undefined,
        () => {
          // Fallback only on failure — basic-material sphere so it renders
          // correctly under the scene's bright ambient lighting.
          const fallback = new THREE.Mesh(
            new THREE.SphereGeometry(18, 24, 24),
            new THREE.MeshBasicMaterial({ color: 0x44ccff })
          )
          this.sphereTemplate = fallback
          resolve()
        }
      )
    })
  }

  private enterBuildPhase() {
    this.phase = 'build'
    this.attackerUnits = []
    this.attCredits = Config.START_CREDITS
    this.hud.setPhase('build')
    this.hud.setAttCredits(this.attCredits)
    this.buildPhase = new BuildPhase(this.scene, this.camera, this.hud, Config.START_CREDITS)

    // Permanent subtle tints so players see each zone before clicking a Buy.
    this.defZoneMesh = this.makeZoneTint(
      Config.WORLD.LEFT, Config.DEFENDER_MAX_X, 0x00ddff, 0.07, 0.3
    )
    this.attZoneMesh = this.makeZoneTint(
      Config.ATTACKER_MIN_X, Config.WORLD.RIGHT, 0xff4488, 0.07, 0.3
    )

    this.hud.onBuySphere = () => {
      if (this.placement?.kind === 'sphere') { this.endPlacement(); return }
      if (!this.buildPhase || this.buildPhase.getCredits() < SPHERE_COST) return
      this.startSpherePlacement()
    }

    this.hud.onBattle = () => this.enterBattlePhase()

    this.hud.onSpawnUnit = (type) => {
      if (this.placement?.kind === type) { this.endPlacement(); return }
      this.startCyborgPlacement(type)
    }
  }

  private enterBattlePhase() {
    if (!this.buildPhase) return
    this.endPlacement()
    this.removeZoneTint('att')
    this.removeZoneTint('def')

    const structures = this.buildPhase.getStructures()
    this.buildPhase.cleanup()
    this.buildPhase = null

    const units = this.attackerUnits.length > 0
      ? this.attackerUnits
      : AIPlayer.buildArmy(Config.START_CREDITS).map(t => new Unit(this.scene, t, 420 + Math.random() * 100))
    this.attackerUnits = []

    this.phase = 'battle'
    this.hud.setPhase('battle')

    this.battlePhase = new BattlePhase(this.scene, this.powerCore, units, structures, this.spheres)
    this.battlePhase.onWin  = () => { this.phase = 'win';  this.hud.setPhase('win') }
    this.battlePhase.onLose = () => { this.phase = 'lose'; this.hud.setPhase('lose') }
  }

  // ── Placement (unified) ──────────────────────────────────────────────────

  private startSpherePlacement() {
    const ghost = this.makeGhostRing(0x44aaff, 16, 24)
    ghost.position.set(-400, 0, 1)
    this.scene.add(ghost)
    const tint = this.makeZoneTint(
      Config.WORLD.LEFT, Config.DEFENDER_MAX_X, 0x00ddff, 0.32, 0.5
    )
    this.placement = {
      kind: 'sphere',
      ghost, tint,
      zoneXMin: Config.WORLD.LEFT,
      zoneXMax: Config.DEFENDER_MAX_X,
      onPlace: (x, y) => {
        if (!this.buildPhase || !this.sphereTemplate) return false
        if (!this.buildPhase.spendCredits(SPHERE_COST)) return false
        this.spheres.push(new SphereDefender(this.scene, x, y, this.sphereTemplate))
        return false  // multi-place — keep selecting until user cancels or credits run out
      },
    }
  }

  private startCyborgPlacement(type: UnitType) {
    const color = Config.UNITS[type].color
    const ghost = this.makeGhostRing(color, 12, 20)
    ghost.position.set(400, 0, 1)
    this.scene.add(ghost)
    this.hud.setSelectedUnitType(type)
    this.placement = {
      kind: type,
      ghost, tint: null,
      zoneXMin: Config.ATTACKER_MIN_X,
      zoneXMax: Config.WORLD.RIGHT,
      onPlace: (x, y) => {
        const cost = Config.UNITS[type].cost
        if (this.attCredits < cost) return false
        this.attCredits -= cost
        this.hud.setAttCredits(this.attCredits)
        this.attackerUnits.push(new Unit(this.scene, type, x, y))
        return false
      },
      onEnd: () => this.hud.setSelectedUnitType(null),
    }
  }

  private endPlacement() {
    if (!this.placement) return
    const p = this.placement
    this.placement = null
    this.scene.remove(p.ghost)
    p.ghost.geometry.dispose()
    ;(p.ghost.material as THREE.Material).dispose()
    if (p.tint) {
      this.scene.remove(p.tint)
      p.tint.geometry.dispose()
      ;(p.tint.material as THREE.Material).dispose()
    }
    p.onEnd?.()
  }

  private makeGhostRing(color: number, inner: number, outer: number): THREE.Mesh {
    const geo = new THREE.RingGeometry(inner, outer, 24)
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    return new THREE.Mesh(geo, mat)
  }

  private makeZoneTint(xMin: number, xMax: number, color: number, opacity: number, z: number): THREE.Mesh {
    const w = xMax - xMin
    const h = Config.WORLD.TOP - Config.WORLD.BOTTOM
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
    )
    mesh.position.set((xMin + xMax) / 2, 0, z)
    this.scene.add(mesh)
    return mesh
  }

  private removeZoneTint(side: 'att' | 'def') {
    const m = side === 'att' ? this.attZoneMesh : this.defZoneMesh
    if (!m) return
    this.scene.remove(m)
    m.geometry.dispose()
    ;(m.material as THREE.Material).dispose()
    if (side === 'att') this.attZoneMesh = null
    else this.defZoneMesh = null
  }

  private screenToWorld(clientX: number, clientY: number): THREE.Vector2 | null {
    const ndcX = (clientX / window.innerWidth) * 2 - 1
    const ndcY = -(clientY / window.innerHeight) * 2 + 1
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera)
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const target = new THREE.Vector3()
    if (!raycaster.ray.intersectPlane(groundPlane, target)) return null
    return new THREE.Vector2(target.x, target.y)
  }

  start() {
    this.lastTime = performance.now()
    this.loop()
  }

  private loop = () => {
    this.rafId = requestAnimationFrame(this.loop)
    const now = performance.now()
    const delta = Math.min((now - this.lastTime) / 1000, 0.1)
    this.lastTime = now

    this.attackerUnits.forEach(u => { u.update(delta); u.faceCamera(this.camera) })
    this.powerCore?.update(delta)
    this.powerCore?.faceCamera(this.camera)
    this.spheres.forEach(s => { s.update(delta); s.faceCamera(this.camera) })
    this.buildPhase?.faceCamera(this.camera)
    this.battlePhase?.update(delta)
    this.battlePhase?.faceCamera(this.camera)

    // Smooth zoom with damping
    if (Math.abs(this.zoomVelocity) > 0.0002) {
      const factor = 1 + this.zoomVelocity
      const newWidth = (this.camera.right - this.camera.left) * factor
      if (newWidth >= 200 && newWidth <= 2800) {
        this.camera.left   *= factor
        this.camera.right  *= factor
        this.camera.top    *= factor
        this.camera.bottom *= factor
        this.camera.updateProjectionMatrix()
      }
      this.zoomVelocity *= 0.82
    }

    this.renderer.render(this.scene, this.camera)
  }

  private onResize = () => {
    const { innerWidth: w, innerHeight: h } = window
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h)
    const halfH = 600 / (w / h)
    this.camera.top    =  halfH
    this.camera.bottom = -halfH
    this.camera.updateProjectionMatrix()
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    this.zoomVelocity += Math.max(-0.015, Math.min(0.015, e.deltaY * 0.00015))
  }

  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 1 || e.button === 2) {
      this.isPanning = true
      this.lastPan = { x: e.clientX, y: e.clientY }
    }
    if (e.button === 0 && this.phase === 'build') {
      if ((e.target as HTMLElement).closest('#hud')) return  // ignore HUD clicks

      if (this.placement) {
        if (!this.placement.ghost.visible) return
        const { x, y } = this.placement.ghost.position
        const shouldEnd = this.placement.onPlace(x, y)
        if (shouldEnd) this.endPlacement()
      }
    }
  }

  private onMouseMove = (e: MouseEvent) => {
    if (this.isPanning) {
      const dx = e.clientX - this.lastPan.x
      const dy = e.clientY - this.lastPan.y
      const ww = this.camera.right - this.camera.left
      const wh = this.camera.top - this.camera.bottom
      const panX = (dx / window.innerWidth) * ww
      const panY = (dy / window.innerHeight) * wh
      this.camera.position.x -= panX
      this.camera.position.y += panY * 0.707
      this.camera.position.z -= panY * 0.707
      this.lastPan = { x: e.clientX, y: e.clientY }
    }
    if (this.placement) {
      const pos = this.screenToWorld(e.clientX, e.clientY)
      const inZone = pos
        && pos.x >= this.placement.zoneXMin
        && pos.x <= this.placement.zoneXMax
      if (pos && inZone) {
        const clampedY = Math.max(Config.WORLD.BOTTOM + 20, Math.min(Config.WORLD.TOP - 20, pos.y))
        this.placement.ghost.position.set(pos.x, clampedY, 1)
        this.placement.ghost.visible = true
      } else {
        this.placement.ghost.visible = false
      }
    }
  }

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 1 || e.button === 2) this.isPanning = false
  }

  private onContextMenu = (e: Event) => e.preventDefault()

  dispose() {
    cancelAnimationFrame(this.rafId)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('contextmenu', this.onContextMenu)
    this.buildPhase?.cleanup()
    this.endPlacement()
    this.removeZoneTint('att')
    this.removeZoneTint('def')
    for (const s of this.spheres) this.scene.remove(s.mesh)
    this.spheres = []
    this.sphereTemplate = null
    this.renderer.dispose()
    this.scene.clear()
    this.hud?.dispose()
  }
}
