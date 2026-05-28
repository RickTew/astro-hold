# AstroHold — Pixel-Perfect Rendering

S21 foundation contract for crisp pixel art at any window size. The
goal: each artist-drawn texel maps to an integer number of screen
pixels, every frame, regardless of device pixel ratio or browser zoom.

## The contract

- **`Config.PPWU = 2`** — pixels per world unit at base zoom. The
  internal renderer canvas is locked to `WORLD_WIDTH_WU * PPWU = 2400`
  px wide. Height matches the viewport aspect.
- **`renderer.setPixelRatio(1)`** — devicePixelRatio never multiplies
  the texture sample rate. The browser does the final stretch to the
  display via CSS.
- **`renderer({ antialias: false })`** — we want hard pixel edges, not
  shader-AA-smoothed ones.
- **`canvas.style.imageRendering = 'pixelated'`** — browser
  nearest-neighbor upscale from internal canvas to CSS pixels. Without
  this, the final blit on a 4K monitor or zoomed browser would smooth.
- **Render-time position snap** — every frame, before
  `renderer.render`, top-level scene children + the camera have their
  `position.x / .y` rounded to nearest `1 / PPWU` wu (= 0.5 wu at
  PPWU=2). Snaps integer screen pixel; gameplay logic still floats.
- **NearestFilter on pixel-art textures** — sprite, structure, pad,
  ammo box, power core all set `min/magFilter = NearestFilter`.
  Procedural soft VFX (shadows, gradients, glows, speech bubbles)
  stay on `LinearFilter` because their continuous gradients have no
  native pixel grid to preserve.

## Render-time snap (the safety net)

`Game.snapForRender()` runs once per frame between the gameplay update
pass and `renderer.render`. It iterates only `scene.children` (top
level — child sprites/HP bars/shadows ride on their parent's snapped
transform) and quantizes `.position.x / .y` to nearest `1 / PPWU` wu.

Gameplay-truth lives on `entity.worldX` / `entity.worldY` (which return
`logicalX` / `logicalY`, not `mesh.position`). Snapping `mesh.position`
is cosmetic — the next `update()` chase loop reads logicalX and walks
from the snapped position with no accumulating drift.

## What S21 did NOT do (next sessions)

- **Sprites still scale at render time.** Native PNG sizes (104-124 px)
  are scaled to target world-unit sizes (40-84 wu) per
  `SPRITE_SIZE_OVERRIDE` tables in `SpriteUnit.ts` / `Structure.ts`.
  Sprites stay crisp because NearestFilter masks the downsample, but
  we're throwing away texel detail every frame.
- **Re-export sprite PNGs to their target sizes.** Hulk PNG 108 -> 84,
  Sniper 104 -> 60, Phaser 120 -> 40, etc. After re-export, the
  `SPRITE_SIZE_OVERRIDE` constants can be deleted because sprites
  render at native size. Smaller files (faster loads, less GPU memory)
  and true 1:1 pixel-to-texel mapping.
- **Integer-multiple canvas upscale.** Today the browser stretches
  the 2400-px-wide internal canvas to whatever CSS width the window
  is (e.g. 1920 px = 0.8x). With `imageRendering: pixelated` this is
  nearest-neighbor but non-integer scale produces slightly uneven
  texel sizes. A future pass could letterbox to the nearest integer
  multiple instead.

## What to do when adding new visuals

- **Artist-drawn PNG sprite?** Use `NearestFilter` + `SRGBColorSpace`
  on the texture. Position the sprite in float wu; the render snap
  handles screen-pixel alignment.
- **Procedural gradient / glow / soft VFX?** `LinearFilter` is fine.
  Document the choice in a comment if it's not obvious why nearest
  was skipped (we already do this in Background.ts, Shadow.ts, etc.).
- **Mouse-position handling?** Existing raycaster code uses
  `clientX / clientY` against `window.innerWidth/Height` — that's CSS
  pixels, not internal canvas pixels. The camera frustum lives in wu,
  so the NDC math works regardless. Don't touch this without testing
  placement + zoom + pan together.

## How to verify

After any render-path change:
1. Reload at default zoom — sprites should be razor-sharp.
2. Resize the browser slowly — sprites should snap visibly (1-pixel
   jumps) rather than smear smoothly. Smear = the snap isn't running.
3. Browser-zoom in (Cmd-plus). Each step should be pixelated, not
   anti-aliased.
4. Walking units should not "wobble." Faster movement is more
   forgiving than near-stationary drift — watch the slowest piece
   (Hulk speed 45) for jitter.
