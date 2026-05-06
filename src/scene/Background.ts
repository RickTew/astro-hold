import * as THREE from 'three'
import { Config } from '../game/GameConfig'

const TERRAIN_BASE = '#1b1610'

export class Background {
  private group: THREE.Group

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group()
    this.buildGround()
    this.buildZoneOverlays()
    scene.add(this.group)
  }

  private buildGround() {
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = TERRAIN_BASE
    ctx.fillRect(0, 0, size, size)

    // Rocky specks — organic dots of slightly varied tone
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const r = Math.random() * 5 + 0.5
      const v = Math.floor(Math.random() * 20 + 6)
      ctx.fillStyle = `rgb(${v + 16},${v + 11},${v + 4})`
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // Lighter mineral highlights
    for (let i = 0; i < 600; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const r = Math.random() * 2.5 + 0.3
      const v = Math.floor(Math.random() * 15 + 28)
      ctx.fillStyle = `rgb(${v + 12},${v + 8},${v + 3})`
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // Subtle crack lines
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'
    ctx.lineWidth = 1
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60)
      ctx.stroke()
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(7, 7)

    // Very large plane — covers any screen size/zoom level
    const geo = new THREE.PlaneGeometry(4000, 4000)
    const mat = new THREE.MeshBasicMaterial({ map: texture })
    const plane = new THREE.Mesh(geo, mat)
    plane.position.z = -6
    this.group.add(plane)
  }

  private buildZoneOverlays() {
    const H = 4000  // tall enough for any screen

    // Defender zone — very subtle blue tint
    const defMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(400, H),
      new THREE.MeshBasicMaterial({ color: 0x001133, transparent: true, opacity: 0.12 })
    )
    defMesh.position.set(-400, 0, -4)
    this.group.add(defMesh)

    // Attacker zone — very subtle red tint
    const attMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(400, H),
      new THREE.MeshBasicMaterial({ color: 0x220000, transparent: true, opacity: 0.12 })
    )
    attMesh.position.set(400, 0, -4)
    this.group.add(attMesh)

    // Zone divider lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0x334455 })
    const mkLine = (pts: THREE.Vector3[]) =>
      new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat)

    this.group.add(mkLine([new THREE.Vector3(-200, -2000, -3), new THREE.Vector3(-200, 2000, -3)]))
    this.group.add(mkLine([new THREE.Vector3( 200, -2000, -3), new THREE.Vector3( 200, 2000, -3)]))
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
