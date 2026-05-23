import * as THREE from 'three'

// Floating "heal happened" visual effects. Three randomly-picked variants
// per call so the player gets variety across a long battle. Each VFX is
// SELF-CONTAINED — it adds itself to the scene, runs its own RAF-driven
// animation, and disposes when the duration elapses. Nothing has to tick
// it externally; nothing has to clean it up.
//
// Variants:
//   'number' — single floating "+N" text that rises and fades. Most
//              informative; reads the exact amount.
//   'bubble' — 5 small green orbs that drift up and outward, fading.
//              Soft particle look; reads as a healing aura.
//   'plus'   — 3 "+" glyphs that pop outward at random angles. Crisp
//              medical/sci-fi feel; reads as a med-pack discharge.

export type HealVfxVariant = 'number' | 'bubble' | 'plus'

// Cached text textures keyed by display string. The "+30" / "+20" / "+15"
// values come up over and over per game; rendering them once and reusing
// the texture avoids canvas-allocation churn during a long battle.
const textTextureCache = new Map<string, THREE.Texture>()
const plusTextureCache: { tex: THREE.Texture | null } = { tex: null }
const bubbleTextureCache: { tex: THREE.Texture | null } = { tex: null }

function makeTextTexture(text: string): THREE.Texture {
  const cached = textTextureCache.get(text)
  if (cached) return cached
  const c = document.createElement('canvas')
  c.width = 128; c.height = 64
  const ctx = c.getContext('2d')!
  ctx.font = 'bold 36px Orbitron, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Black outline so the green text reads on any background.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)'
  ctx.lineWidth = 6
  ctx.strokeText(text, 64, 32)
  ctx.fillStyle = '#7dff8a'
  ctx.fillText(text, 64, 32)
  const tex = new THREE.CanvasTexture(c)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.colorSpace = THREE.SRGBColorSpace
  textTextureCache.set(text, tex)
  return tex
}

function makePlusTexture(): THREE.Texture {
  if (plusTextureCache.tex) return plusTextureCache.tex
  const c = document.createElement('canvas')
  c.width = 32; c.height = 32
  const ctx = c.getContext('2d')!
  // Bright cyan-green plus sign with a darker outline for crispness.
  ctx.fillStyle = '#7dff8a'
  ctx.fillRect(13, 5, 6, 22)
  ctx.fillRect(5, 13, 22, 6)
  ctx.strokeStyle = 'rgba(0, 50, 20, 0.9)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(13, 5, 6, 22)
  ctx.strokeRect(5, 13, 22, 6)
  const tex = new THREE.CanvasTexture(c)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.colorSpace = THREE.SRGBColorSpace
  plusTextureCache.tex = tex
  return tex
}

function makeBubbleTexture(): THREE.Texture {
  if (bubbleTextureCache.tex) return bubbleTextureCache.tex
  const c = document.createElement('canvas')
  c.width = 32; c.height = 32
  const ctx = c.getContext('2d')!
  // Radial gradient — bright center, fading to transparent edge.
  const grad = ctx.createRadialGradient(16, 16, 2, 16, 16, 14)
  grad.addColorStop(0,    'rgba(200, 255, 220, 0.95)')
  grad.addColorStop(0.45, 'rgba(120, 240, 150, 0.65)')
  grad.addColorStop(1,    'rgba(60, 200, 100, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 32, 32)
  const tex = new THREE.CanvasTexture(c)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.colorSpace = THREE.SRGBColorSpace
  bubbleTextureCache.tex = tex
  return tex
}

// Drop a heal effect at (x, y) in `scene`. Variants:
//   'number' — floating "+N" text. Reserved for med-pack THROWS so the
//              player sees the exact amount restored on impact.
//   'plus'   — "+" sparkle stamp. Reserved for TETHER ticks so the
//              sustained beam reads as steady support healing.
//   'bubble' — green-orb swarm. Reserved for PAD pulses so the area
//              aura reads as zone-of-effect healing.
// Default behavior (no variant arg) is 'plus' since it's the most common.
export function spawnHealVfx(
  scene: THREE.Scene,
  x: number, y: number,
  amount: number,
  variant: HealVfxVariant = 'plus',
) {
  switch (variant) {
    case 'number': spawnNumberVfx(scene, x, y, amount); break
    case 'bubble': spawnBubbleVfx(scene, x, y); break
    case 'plus':   spawnPlusVfx(scene, x, y); break
  }
}

// Shared lifecycle: RAF-driven, self-disposing. The animator is invoked
// with elapsed time (0..1 of duration) and returns nothing; it just
// mutates whatever it captured in closure.
function animateAndDispose(
  duration: number,
  animator: (t: number) => void,
  onDone: () => void,
) {
  const start = performance.now()
  const tick = () => {
    const elapsed = (performance.now() - start) / 1000
    if (elapsed >= duration) {
      onDone()
      return
    }
    animator(elapsed / duration)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function spawnNumberVfx(scene: THREE.Scene, x: number, y: number, amount: number) {
  const tex = makeTextTexture(`+${amount}`)
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false,
  })
  const sprite = new THREE.Sprite(mat)
  // Width 56 keeps two-digit numbers readable without overflowing the cell.
  sprite.scale.set(56, 28, 1)
  sprite.position.set(x, y + 18, 6)
  sprite.renderOrder = 20
  scene.add(sprite)
  // Small lateral drift so consecutive numbers on the same target don't
  // overlap exactly (looks like a clipping glitch when they stack).
  const drift = (Math.random() - 0.5) * 18
  animateAndDispose(
    0.9,
    t => {
      sprite.position.x = x + drift * t
      sprite.position.y = y + 18 + 38 * t      // rise 38 units over the lifetime
      mat.opacity = t < 0.7 ? 1 : (1 - (t - 0.7) / 0.3)   // hold then fade
    },
    () => {
      sprite.removeFromParent()
      mat.dispose()
    },
  )
}

function spawnBubbleVfx(scene: THREE.Scene, x: number, y: number) {
  const tex = makeBubbleTexture()
  const COUNT = 5
  // Per-bubble starting offsets + drift vectors picked once so each
  // bubble follows a consistent trajectory across the animation.
  const bubbles: Array<{ sprite: THREE.Sprite; ox: number; oy: number; dx: number; dy: number; mat: THREE.SpriteMaterial }> = []
  for (let i = 0; i < COUNT; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const sprite = new THREE.Sprite(mat)
    const size = 12 + Math.random() * 8
    sprite.scale.set(size, size, 1)
    const ox = (Math.random() - 0.5) * 16
    const oy = (Math.random() - 0.5) * 10
    sprite.position.set(x + ox, y + oy, 6)
    sprite.renderOrder = 20
    scene.add(sprite)
    bubbles.push({
      sprite, mat, ox, oy,
      dx: (Math.random() - 0.5) * 24,
      dy: 24 + Math.random() * 18,
    })
  }
  animateAndDispose(
    0.85,
    t => {
      for (const b of bubbles) {
        b.sprite.position.x = x + b.ox + b.dx * t
        b.sprite.position.y = y + b.oy + b.dy * t
        b.mat.opacity = (1 - t) * 0.9
      }
    },
    () => {
      for (const b of bubbles) {
        b.sprite.removeFromParent()
        b.mat.dispose()
      }
    },
  )
}

function spawnPlusVfx(scene: THREE.Scene, x: number, y: number) {
  const tex = makePlusTexture()
  const COUNT = 3
  const sprites: Array<{ sprite: THREE.Sprite; angle: number; mat: THREE.SpriteMaterial }> = []
  for (let i = 0; i < COUNT; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false,
    })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(20, 20, 1)
    sprite.position.set(x, y + 8, 6)
    sprite.renderOrder = 20
    scene.add(sprite)
    // Evenly distributed angles + random jitter so the plus signs spread
    // outward in a fan from the unit.
    const angle = (i / COUNT) * Math.PI * 2 + Math.random() * 0.5
    sprites.push({ sprite, mat, angle })
  }
  animateAndDispose(
    0.7,
    t => {
      const dist = 32 * t
      for (const s of sprites) {
        s.sprite.position.x = x + Math.cos(s.angle) * dist
        s.sprite.position.y = y + 8 + Math.sin(s.angle) * dist + 12 * t  // slight overall rise
        s.mat.opacity = (1 - t) * 0.95
        const scale = 20 * (1 + 0.6 * t)   // grow as they drift out
        s.sprite.scale.set(scale, scale, 1)
      }
    },
    () => {
      for (const s of sprites) {
        s.sprite.removeFromParent()
        s.mat.dispose()
      }
    },
  )
}
