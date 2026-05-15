# AstroHold — Project Rules for Claude

## Stack 
- Package manager: pnpm
- Bundler: Vite 8 (Rolldown inside)
- Renderer: Three.js r184
- Language: TypeScript 6 (strict)
- Linting: Biome (when added)

## File conventions
- All static assets (GLBs, textures, audio) go in `/public/` — loaded via absolute paths like `/models/cyborg/idle.glb`
- Shaders go in `/src/shaders/` as `.vert`/`.frag` — add `vite-plugin-glsl` when first shader is written
- Zip archives go in `/_zips/`

## Key constants to know
- World: x -600 to 600, y -200 to 200
- Defender zone: x < -200 | Attacker zone: x > 200 | Battlefield: middle
- Power Core at (-550, 0)
- Grid cell: 50×50 in defender zone (8 cols × 8 rows)
- Start credits: 200 (defender + attacker each start with 200)

## Visual stack: hybrid pixel-sprite + 3D
The game uses **Three.js** as the rendering engine throughout. Inside that, individual entities can be EITHER pixel-art sprites OR 3D GLB models — both are first-class.

**Default preference: pixel sprite from PixelLab** for simple/one-pose entities. Faster to build, instant load, no clone/material/Meshy-export gotchas.

**3D GLB models still welcome** for humanoid characters with rigs and animations, or any time the 3D version is more fun to author or play with. The cyborg is 3D today and may stay 3D; new bosses, NPCs, or visual centerpieces can be 3D too.

When picking which approach for a new entity, decide based on the entity, not project-wide policy:
- One static look or simple spin/cycle → pixel sprite (8 directions from PixelLab, ~24 KB total)
- Many animation states × directions → 3D rigged model (one GLB scales infinitely)
- Visual flair, particles, dynamic lighting → 3D
- Tiny UI sprites, projectiles, structures, mines → pixel sprite

### Pixel sprite assets
- Folder: `/public/sprites/<entity>/{south, south-east, east, north-east, north, north-west, west, south-west}.png`
- Source: PixelLab. Standard rotation set is 8 directions.
- Rendered via `THREE.Sprite` with `NearestFilter` for crisp pixel scaling. Required flags: `transparent: true`, `depthTest: false`, `depthWrite: false`, `alphaTest: 0.1`, `renderOrder` bumped (see SphereDefender.ts for the canonical pattern).
- Spinning effect: cycle through the 8 directional frames on a timer (sphere uses 0.4 s per frame, ~3.2 s per full spin).

### 3D models (still active for the cyborg today)
- Folder: `/public/models/<entity>/`
- For animation-heavy characters, prefer the merged-animation format: `character.glb` (mesh + skeleton) + `animations.glb` (all clips in one file).
- `MODEL_SCALE` and `MODEL_TILT_X` in `src/entities/Unit.ts` are the first knobs to tweak when model size/orientation is wrong.
- New models: create → add to `/public/models/` → playtest → exhaust improvements → then add next model.

### Required model orientation (for the existing Unit pipeline to "just work")
- Body axis along **+Y** (standard glTF / Meshy default). At MODEL_TILT_X=0 the cyborg appears upright in the 45° tilted view.
- Forward / front face along **+Z** (Meshy default). The unit's default rotation.y faces -X (toward power core) by rotating the +Z front around the +Y body axis.
- Origin at the **feet** so position (worldX, worldY, 0) lands on the ground.
- A new humanoid model authored to these conventions plugs into Unit.ts without per-model rotation tweaks. If a model deviates, prefer fixing the asset over per-unit special-cases.

## Architecture
- `GameConfig.ts` — all constants, change numbers here first before touching logic
- `Game.ts` — scene, camera, renderer, state machine (loading → build → battle → win/lose); owns sphere placement flow (sphereSelecting / spherePlaced / sphereGhostMesh)
- `BuildPhase.ts` — grid structure placement; exposes `spendCredits(n)` and `getCredits()` so Game.ts can deduct for sphere purchase
- `BattlePhase.ts` — turn-based: ALL units act simultaneously, then ALL structures + sphere act simultaneously; TURN_INTERVAL controls speed; damage deferred via Projectile.onHit callbacks
- `SphereDefender.ts` — defender hero; worldX/worldY are mutable (updated at placement time); range 200, HP 300, cost 100cr
- `HUD.ts` — DOM overlay only, no Three.js; exposes onBuySphere / onSpawnUnit / onBattle / onSelectStructure callbacks; markSpherePurchased() disables button
- HMR dispose is wired in `main.ts` + `Game.ts` — do not remove it

## Canonical placement flow (cyborg + sphere)
Both placements share this 3-step pattern. **The ghost mesh is the source of truth for placement position.** Don't re-raycast at click time.

1. **HUD button click → enter selecting mode**: set a flag (`sphereSelecting` / `selectedAttUnitType`), call `createXxxGhost()` to add a ring mesh to the scene at a starting world position.
2. **`onMouseMove` → update ghost**: raycast cursor to world via `screenToWorld(clientX, clientY)`. If the world position is inside the valid zone, set `ghost.position` and `ghost.visible = true`. Otherwise `ghost.visible = false`.
3. **`onMouseDown` → place at ghost**: `if (!ghost.visible) return` is the gate. Then `spendCredits(...)` and read position from `ghost.position` (NOT a fresh raycast). Then `clearGhost()` and update HUD.

Also: in `createSphereGhost`, a bright zone tint is added over the defender zone so the click target is obvious. `clearSphereGhost` removes both the ghost and the zone tint.

## Rendering
- Use `MeshBasicMaterial` for ground/overlays — MeshStandardMaterial multiplies color by ambient+directional (≈3.7×), making dark earth tones render as washed-out gray
- Grid: neutral gray (0xaaaaaa/0x777777), opacity 0.3, z=1.5 (must be above zone tint overlays at z=-4)
- Scene background color should match terrain darkest tone (currently 0x201b14)

## Deployment
- Always deploy with `vercel --prod` — `vercel` alone creates a preview URL that users won't see
- Production URL: https://astrohold3.vercel.app

## Rules
- Don't hardcode rules or patterns that don't match our actual build — verify before committing
- Prefer pragmatic/working over theoretically correct
- Check if a tool/plugin is actually useful for this project before adding it
- `vite-plugin-gltf` is installed but inactive until GLBs are imported (not just URL-loaded from /public)
- No test files yet — add Vitest only when there's logic worth testing
