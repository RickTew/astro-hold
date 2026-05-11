import * as THREE from 'three'

// ─── Lightweight 2D Perlin Noise ──────────────────────────────────────────────

function makePerlin(seed = 42) {
  const perm = Array.from({ length: 256 }, (_: unknown, i: number) => i)
  let s = seed >>> 0
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[perm[i], perm[j]] = [perm[j], perm[i]]
  }
  const p = [...perm, ...perm]

  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const lerp  = (a: number, b: number, t: number) => a + t * (b - a)
  const grad  = (h: number, x: number, y: number) =>
    ((h & 1) ? -x : x) + ((h & 2) ? -y : y)

  function noise2(x: number, y: number): number {
    const xi = Math.floor(x) & 255
    const yi = Math.floor(y) & 255
    const xf = x - Math.floor(x)
    const yf = y - Math.floor(y)
    const u = fade(xf), v = fade(yf)
    const aa = p[p[xi]     + yi],     ab = p[p[xi]     + yi + 1]
    const ba = p[p[xi + 1] + yi],     bb = p[p[xi + 1] + yi + 1]
    return lerp(
      lerp(grad(aa, xf, yf),     grad(ba, xf - 1, yf),     u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v
    )
  }

  function fbm(x: number, y: number, oct = 5): number {
    let v = 0, amp = 0.5, freq = 1, max = 0
    for (let i = 0; i < oct; i++) {
      v   += noise2(x * freq, y * freq) * amp
      max += amp; amp *= 0.5; freq *= 2
    }
    return v / max  // ≈ -0.5 .. +0.5
  }

  return { fbm }
}

// ─── Background ───────────────────────────────────────────────────────────────

export class Background {
  private group: THREE.Group

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group()
    this.buildGround()
    this.buildZoneOverlays()
    scene.add(this.group)
  }

  private buildGround() {
    const SIZE = 512
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d')!

    // ── Perlin-based colour coat ───────────────────────────────────────────────
    const perlin = makePerlin(37)
    const img = ctx.createImageData(SIZE, SIZE)
    const d   = img.data

    // Three brown/grey tones — wider contrast so splotches read without lighting
    const C0 = [32,  27, 20]   // very dark earth
    const C1 = [62,  54, 42]   // mid brown
    const C2 = [98,  87, 68]   // sandy highlight

    const SCALE = 3.5   // noise cycles across the canvas → medium splotch size
    const OCT   = 5     // fractal octaves for organic detail

    for (let py = 0; py < SIZE; py++) {
      for (let px = 0; px < SIZE; px++) {
        // FBM → shift from [-0.5,+0.5] to [0,1]
        let n = perlin.fbm(px / SIZE * SCALE, py / SIZE * SCALE, OCT) + 0.5
        n = Math.max(0, Math.min(1, n))

        let r: number, g: number, b: number
        if (n < 0.5) {
          const t = n * 2
          r = (C0[0] + (C1[0] - C0[0]) * t) | 0
          g = (C0[1] + (C1[1] - C0[1]) * t) | 0
          b = (C0[2] + (C1[2] - C0[2]) * t) | 0
        } else {
          const t = (n - 0.5) * 2
          r = (C1[0] + (C2[0] - C1[0]) * t) | 0
          g = (C1[1] + (C2[1] - C1[1]) * t) | 0
          b = (C1[2] + (C2[2] - C1[2]) * t) | 0
        }

        const i = (py * SIZE + px) * 4
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)

    // ── Surface micro-detail on top of noise ──────────────────────────────────
    // Rocky specks — semi-transparent for blending
    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * SIZE
      const y = Math.random() * SIZE
      const r = Math.random() * 3.5 + 0.4
      const v = Math.floor(Math.random() * 22 - 11)
      ctx.globalAlpha = 0.3 + Math.random() * 0.35
      ctx.fillStyle = `rgb(${62 + v},${54 + v},${42 + v})`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }

    // Bright mineral flecks
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * SIZE
      const y = Math.random() * SIZE
      const r = Math.random() * 1.8 + 0.3
      ctx.globalAlpha = 0.35 + Math.random() * 0.3
      ctx.fillStyle = 'rgb(112,100,84)'
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }

    // Subtle crack lines
    ctx.globalAlpha = 1
    ctx.strokeStyle = 'rgba(0,0,0,0.13)'
    ctx.lineWidth = 1
    for (let i = 0; i < 25; i++) {
      const x = Math.random() * SIZE
      const y = Math.random() * SIZE
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + (Math.random() - 0.5) * 70, y + (Math.random() - 0.5) * 70)
      ctx.stroke()
    }

    const texture = new THREE.CanvasTexture(canvas)
    // MirroredRepeat hides seams where noise values don't match at tile edges
    texture.wrapS = THREE.MirroredRepeatWrapping
    texture.wrapT = THREE.MirroredRepeatWrapping
    texture.repeat.set(3, 3)

    const geo = new THREE.PlaneGeometry(4000, 4000)
    const mat = new THREE.MeshBasicMaterial({ map: texture })
    const plane = new THREE.Mesh(geo, mat)
    plane.position.z = -6
    this.group.add(plane)
  }

  private buildZoneOverlays() {
    const H = 4000

    // Defender zone — subtle blue tint
    const defMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(400, H),
      new THREE.MeshBasicMaterial({ color: 0x001133, transparent: true, opacity: 0.12 })
    )
    defMesh.position.set(-400, 0, -4)
    this.group.add(defMesh)

    // Attacker zone — subtle red tint
    const attMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(400, H),
      new THREE.MeshBasicMaterial({ color: 0x220000, transparent: true, opacity: 0.12 })
    )
    attMesh.position.set(400, 0, -4)
    this.group.add(attMesh)

    // Zone divider lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0x334455 })
    const mkLine  = (pts: THREE.Vector3[]) =>
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
