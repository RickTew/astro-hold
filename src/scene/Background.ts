import * as THREE from 'three'
import { STAGE } from '../game/GameConfig'

// ─── Background ───────────────────────────────────────────────────────────────

export class Background {
  private group: THREE.Group

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group()
    this.buildGround()
    scene.add(this.group)
  }

  private buildGround() {
    // S22c: flat procedural floor. One themed color with a whisper of vertical
    // shading for depth so the pixel sprites still pop. The old gradient pools,
    // zone tint bands, and divider lines were removed: the blue/red grid base
    // borders now mark territory, and decorative add-ons (rocks, wreckage)
    // will come later as stage obstacles, not painted into the ground.
    const base = STAGE.theme.floor
    const r = (base >> 16) & 0xff
    const g = (base >> 8) & 0xff
    const b = base & 0xff
    const top = `rgb(${r}, ${g}, ${b})`
    const bottom = `rgb(${Math.round(r * 0.82)}, ${Math.round(g * 0.82)}, ${Math.round(b * 0.82)})`

    // Tiny canvas: it is a continuous single-hue gradient, no detail to lose.
    const W = 16
    const H = 256
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, top)
    grad.addColorStop(1, bottom)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter

    // 8000 wide so the floor always overflows the (larger) board + margins on
    // any window aspect or zoom.
    const geo = new THREE.PlaneGeometry(8000, 8000)
    const mat = new THREE.MeshBasicMaterial({ map: texture })
    const plane = new THREE.Mesh(geo, mat)
    plane.position.z = -6
    this.group.add(plane)
  }

  dispose() {
    this.group.traverse(obj => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
        obj.geometry.dispose()
        const m = obj.material
        if (Array.isArray(m)) m.forEach(x => x.dispose())
        else m.dispose()
      }
    })
  }
}
