import * as THREE from 'three'

// Soft elliptical drop-shadow sprite, shared helper. One per piece.
//
// SOURCE OF TRUTH: build-test.html DUSTY PLANET REAL TEST row uses the
// .tint-blue / .tint-red CSS classes. The gradient + size below mirror
// those classes exactly so the live game matches what the user picked
// in the test lab. Keep them in sync — when one changes, change both.
//
// Style: SIMPLE single-tint radial gradient (no dark core overlay).
// Center alpha 0.55, fades to transparent at 70% radius. Material
// opacity 1.0 — the gradient's alpha is the source of truth, don't
// compound at the material layer.

type ShadowSide = 'defender' | 'attacker'

const TEX_CACHE = new Map<ShadowSide, THREE.Texture>()

function shadowTexture(side: ShadowSide): THREE.Texture {
  const cached = TEX_CACHE.get(side)
  if (cached) return cached

  // Square canvas so the radial gradient reaches alpha 0 at every
  // edge. A non-square canvas clips the gradient on the short axis
  // and gives a flat-topped ellipse in-game.
  const SQ = 256
  const c = document.createElement('canvas')
  c.width = SQ
  c.height = SQ
  const ctx = c.getContext('2d')!

  const rgb = side === 'defender' ? '40, 90, 160' : '160, 50, 60'
  const grad = ctx.createRadialGradient(SQ / 2, SQ / 2, 0, SQ / 2, SQ / 2, SQ / 2)
  grad.addColorStop(0,   `rgba(${rgb}, 0.55)`)
  grad.addColorStop(0.7, `rgba(${rgb}, 0)`)
  grad.addColorStop(1,   `rgba(${rgb}, 0)`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, SQ, SQ)

  const tex = new THREE.CanvasTexture(c)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  TEX_CACHE.set(side, tex)
  return tex
}

type ShadowOpts = {
  size: number
  side: ShadowSide
  floating?: boolean
  // Visible-bottom of the PNG as a fraction of PNG height. Defaults
  // to 0.78 (just past the 0.74 standard, matches build-test top:78%
  // for the bulk of the roster). Override per piece for sprites with
  // feet extending farther down: laser ~0.91, gun ~0.97, signal ~0.98.
  footFraction?: number
}

export function makeShadowSprite({
  size,
  side,
  floating = false,
  footFraction,
}: ShadowOpts): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: shadowTexture(side),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    opacity: 1.0,
  })
  const sprite = new THREE.Sprite(mat)
  // Width 70%, height 14% of sprite_size. Matches the build-test
  // piece-shadow base CSS (width:70% height:14%).
  sprite.scale.set(size * 0.7, size * 0.14, 1)
  // Position the shadow center EXACTLY at the visible feet of the
  // sprite (no offset past). Half hides behind the opaque sprite
  // pixels above; half is the visible halo below. No gap between
  // sprite and shadow, so no "floating" perception.
  const foot = footFraction ?? 0.74
  const groundedY = (0.5 - foot) * size
  // Floating sphere drops 16% past its feet so the float gap reads.
  const floatingY = (0.5 - foot - 0.16) * size
  sprite.position.set(0, floating ? floatingY : groundedY, 4)
  sprite.renderOrder = 9
  return sprite
}
