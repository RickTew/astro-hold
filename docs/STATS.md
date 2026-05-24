# AstroHold — Stats & Game Mechanics

Living balance document. Update as we tune. Aim: "like chess but not strict" —
for any strong ability on one side, the other side gets a comparable counter.

**Status:** game is mid-transition from real-time simultaneous combat → grid-based
turn-by-turn strategy. The numbers below are the current Config values; the
**Proposed AP / Behavior** column captures the rule we want once the turn system
lands.

---

## Map & Grid

- World extent: x [-600, +600], y [-200, +200] = 1200 × 400 world units
- Grid cell: **50 × 50** world units → **24 columns × 8 rows = 192 cells**
- Defender zone (Robots): x < -200 (8 columns)
- Battlefield (no-build zone): -200 ≤ x ≤ 200 (8 columns)
- Attacker zone (Cyborgs): x > 200 (8 columns)
- **One piece per cell.** Strict. No stacking. Enforced at placement;
  movement will enforce it once the turn system lands.
- Placement snaps to cell centers automatically. Cell centers are at
  (LEFT + col*50 + 25, BOTTOM + row*50 + 25) for col/row indices.

## Turn flow — plan-then-play, continuous reveal loop (LIVE)

**The cinematic model** — players make all decisions FIRST, then the
game plays out. User framing: *"we are now watching the space battle
take place."* Build → Plan once → click BATTLE → battles auto-chain
until win/lose.

1. **Build.** Place pieces from credits (multiples of 10 — leftover
   credits must always be spendable by the cheapest piece). Click READY
   when done.
2. **Plan (first turn only).** Queue actions for any of your pieces.
   Click a piece, click a cell to queue Move, Shift+click an enemy to
   queue Fire, right-click clears or deselects. Each action deducts AP
   from the piece's budget.
3. **Battle / Reveal.** The engine sorts every queued (actor, action)
   pair by **Initiative (descending)** and animates them one at a time
   (~600ms per step). Pieces from either side interleave by initiative.
4. **Auto-loop.** When the reveal finishes, the next reveal starts
   immediately. Queued actions clear so DEFAULT BEHAVIOUR takes over:
   cyborgs march toward the core (fire if anything's in range), spheres
   + towers auto-fire at the nearest cyborg, dogs hunt the nearest
   cyborg / wander when nothing in sight.
5. **Stalemate guard.** If a reveal completes with zero possible actions
   (e.g. no cyborgs placed), the loop halts instead of spinning forever.
6. **Win/lose** flips the phase and shows the message. No restart yet.

**Invalid actions strict-skip.** If your queued target died or your
destination cell got taken before your action's turn comes up, your
piece does *nothing* that step. No best-effort re-target. Mind-game
tension > forgiveness.

**Initiative source:** each piece's `speed` value verbatim. Stationary
pieces (Sphere, structures, core) use **`STATIONARY_INITIATIVE = 100`**
(raised from 10 mid-session because defenders fired LAST and felt
useless — now they fire BEFORE cyborgs each turn).

**Structures during the reveal:** turrets / cannons / bombers auto-fire
on their initiative tick at the closest enemy in range (or AoE splash
for bomber + cannon). Walls / mines stay passive (apBudget 0). The
defender doesn't queue actions for structures.

**Pricing rule (locked):** All piece costs in multiples of 10 so leftover
credits can always be spent down. Cheapest cyborg = Grenadier 50cr (was
55 — rounded). Cheapest defender = Wall 20cr.

**HP bars hidden globally** ("plan-then-watch model"). Wall is the
exception — the wall body itself shrinks from the top as it takes damage.
Code keeps the bar meshes in place but `visible = false`; one-line flip
to bring them back if a mid-battle decision mode is added later.

### Action Points (proposed AP budgets)

Each piece spends Action Points (AP) per turn. Default actions:

| Action | AP |
|---|---|
| Move one cell (orthogonal or diagonal) | 1 |
| Fire a direct-fire weapon | 1 |
| Throw a grenade (AoE) | 2 |
| Turn to face a new direction (cyborgs) | 1 |
| Turn (Sphere) | **0 — Sphere turns are free** |

**Line of sight & blocking:**
- Direct-fire weapons hit the first solid piece/wall on the line. They cannot
  shoot through other pieces.
- Grenadier grenades **arc over** intervening pieces and land at the target
  cell — they can be lobbed past walls and friendly units.

**Ammo budgets (D&D-style, per game):**
- Every piece that can attack has a per-game ammo pool, NOT a per-turn one.
  Once spent, the piece is inert (still alive, still a target — just can't
  fire). Forces strategic shot allocation rather than RTS spam.
- Defender: Turret 6, Cannon 4, Bomber 3, Gun(preview) 5, Laser(preview) 5,
  Sphere 8, Mine 1. Wall / Defense / Signal have 0 (they don't shoot).
- Cyborg: Scout 6, Tank 5, Bomber 3, Drone 8, Cannon 4, Grenadier 3,
  Double Gun 5. Dog (defender mobile) 5.
- Tuning rule of thumb: ammo budget × damage should be comparable to that
  piece's "fair share" of damage required to end the game, so a spent
  piece feels like it did its part.

**Bomb counterplay (reactive AI):**
- Direct-fire units automatically check for armed ENEMY bombs in their
  attack range. If any are far enough that the unit is outside the bomb's
  own AoE (safe shot), they prefer firing at the bomb over firing at an
  enemy unit. Detonating an enemy bomb early clears the lane.
- Moving units flee armed-bomb AoE cells when picking their next step.
  pickStepTowardPoint scores candidates by (distance + 2 × bomb damage in
  that cell) — any damage outweighs ~2 cell-lengths of distance, so units
  sidestep around primed bombs rather than walking into them.
- **Grenadier diffuse:** if a Grenadier auto-AI step finds an armed enemy
  bomb within 1.5 cells, they DIFFUSE it instead of moving/firing/throwing.
  Diffuse costs 1 AP, applies no damage, and the bomb vanishes with a
  small white puff. Only the Grenadier has this capability (it's their
  thematic counter to enemy proximity traps).

**Lobbed AoE — proximity bombs with 1-turn arming delay:**
- Robot Bomber (defender) and cyborg Bomber / Grenadier throw **proximity
  bombs**, not direct-fire blasts. The thrower lobs a grenade onto a target
  **empty cell within range**. The grenade lands as a pulsing sprite on
  that cell.
- **Arming delay:** the grenade lands UNARMED (yellow tint, slow pulse) and
  cannot trigger during the turn it lands. At the END of that reveal it
  arms (white tint, fast pulse). From the next turn onward, any enemy
  entering its AoE radius detonates it immediately.
- The arming delay is the strategic window — opponents see the yellow
  marker on their next planning turn and can route around / diffuse /
  shoot the bomb before it arms.
- **One bomb per thrower at a time.** A Bomber / Grenadier can't throw a
  new bomb while their previous one is still armed on the field. Once it
  detonates, they're free to throw again.
- Bombs are walkable (don't block movement). Friendly pieces can pass
  through their own side's bombs harmlessly; only enemies trigger them.
- Direct-fire AoE (Cannon turret, mines) still detonates instantly — only
  thrown grenades use the proximity mechanic.

**Firing arc:**
- **Mobile units fire 8-directional.** They pivot to face their target, so
  no angle is off-limits.
- **Structures (Tower, Bomber, etc.) fire in a 120° wedge.** They ship with
  a single facing (defender towers face east toward the cyborg corridor).
  Targets outside the wedge are ignored — the structure won't shoot a
  cyborg that flanks around to its rear. Bomb-throw cell picking obeys the
  same wedge for structure bombers (mobile bombers/grenadiers can lob in
  any direction since they pivot).
- Future: pay-per-additional-facing UI lets the player widen a structure's
  arc coverage during BUILD.
- Reasons a future piece might be **cardinal-only** (4 directions): hardpoint-
  mounted turret, heavy servo motors too slow to traverse diagonally, sniper
  rifle that only fires straight lines, energy emitter with a fixed beam axis.
  Designed cardinal-only pieces become natural counters to fast diagonal units.
  See "Proposed future pieces" below.

---

## Defenders (Robots, blue side)

### Sphere Defender
| Stat | Value |
|---|---|
| Cost | 100 |
| HP | 300 |
| Damage | **25** (was 10 — buffed for defender balance) |
| Attack range | 300 |
| Sight range | 400 |
| Speed | — (stationary) |
| Initiative | **100** (stationary fallback; fires before any cyborg) |
| AP | **3 shots/turn** |
| Behavior | Defensive / stationary; queued or auto-fires nearest cyborg in range |

**Special:** Spherical hero — fires in any direction. Auto-fire (no queued
action) targets the single nearest cyborg in range; queue up to 3 fire
actions for finer control. 4-frame death explosion on HP=0.

### Combat Dog (defender mobile unit — NEW)
| Stat | Value |
|---|---|
| Cost | 40 |
| HP | 80 |
| Speed | 90 (highest mobile speed in the game) |
| Damage | 15 |
| Attack range | 150 |
| Sight range | 280 |
| Initiative | 90 (= speed; goes before cyborgs but after stationary defenders) |
| Behavior | Hunts nearest cyborg in sight; wanders if nothing visible |

Placed in the defender zone. First mobile defender — wires through the
same SpriteUnit class as cyborgs, just `side='defender'` and faces east on
placement. Has its own walking animation; death plays the 4-frame
explosion (omnidirectional; same frames copied into every dir folder).

### Robot Repair (defender mobile support — session 16)
| Stat | Value |
|---|---|
| Cost | 70 |
| HP | 60 |
| Speed | 65 |
| Range (tether reach) | 150 |
| Repair amount | 15/tick (pad) · 20/turn (tether) |
| Ammo (shared charge pool) | 5 |
| AP | 3 |
| Diagonal movement | yes (`allowDiagonalMove: true`) |

Defender-side support unit. **Two repair modes** share the 5-charge ammo
pool: **deploy repair-pad** (2 charges, drops a wrench-glyph station that
ticks +15 HP to adjacent defender pieces for 4 ticks or until destroyed)
and **weld-tether** (1 charge/turn, glowing amber beam pins both endpoints,
+20 HP/turn). Repairs anything defender-side with HP: towers, walls,
bombers, cannons, gunwalls, sphere, the Combat Dog, and the Power Core.

(The PixelLab export ships a Repair animation but no throw clip, so the
throw mode the Medic uses isn't replicated here. The welding pose plays
every time the bot deploys a pad or attaches/ticks a tether.)

AI priority: weld the highest-priority piece in range (Power Core 12 →
Cannon 9 → Bomber 8 ≈ Gunwall 8 → Sphere 8 → Tower 7 → …), else drop a
pad on a cluster of 2+ wounded, else walk toward the most-damaged piece.

Sprite assets: 8-direction rotations + 9-frame walking (Moving) anim +
9-frame Repair anim (wired as `repair` AnimState, fires on
pad/tether actions and re-fires each tether tick). Death duplicates the
4-frame explodes anim into every direction folder, same as the Combat Dog.

### Sentry (defender structure — session 16, renamed from "Gunwall")
| Stat | Value |
|---|---|
| Cost | 60 |
| HP | **150** (nerfed from 200) |
| Damage | 25 |
| Range | 200 |
| Ammo | 5 |
| AP | 1 |
| Fire interval | 2 |
| Sprite size | 84 (matches Hulk) |
| Fire arc | **Omnidirectional** — sprite auto-rotates to target |

Heavy-armor tower on tracks. The art (originally generated as "Robot_Wall"
but the internal zip folder was "Robot_Tank" — closer to its true nature)
is a tracked vehicle with gun arms; reads as a tower, not a wall, so we
renamed `gunwall` → `sentry` after the first deploy. Tankier than a tower
(HP 200 vs 80) with the same damage but shorter range (200 vs 250) — built
as a hard point on the front line, eats hits and still bites back. Same
fire-arc compass-rose mechanic as the tower (default east, pay to add more).
8-direction static rotations, no animations. Repair-bot priority 8 (tied
with Bomber and Sphere).

### Wall (procedural laser-wall — redesigned in session 16)
| Stat | Value |
|---|---|
| Cost | 20 |
| HP | 300 |
| Damage | 0 |
| Range | — |
| AoE | — |
| AP | 0 |
| Ammo | 0 |

Two metallic emitter plates at the top and bottom of the cell with a
glowing cyan energy beam between them. Replaces the brown-box wall visual
that used to fill this slot. **Stats are unchanged** — pure blocker, eats
300 HP of hits before failing, no offensive capability of its own.

The beam pulses every frame via `Structure.update()` (a subtle ~5 Hz
opacity oscillation, with the emitter sockets shimmering out of phase at
7 Hz). HP feedback: beam scale.x thins and beamMat opacity drops as the
wall takes damage, with emitter sockets fading in parallel — at low HP the
whole structure dims to a faint flicker.

HUD icon is a stacked CSS-gradient mini-version of the same visual (two
metallic bars top + bottom, beam between) so the shop tile reads the same
way as the in-game piece. **Wall is now buyable from the player's HUD**
(replaced the DEFENSE preview tile in the robot grid).

### Structures (production)

| Structure | Cost | HP | Damage | Range | AoE | apBudget | Sprite |
|---|---|---|---|---|---|---|---|
| Turret (Tower) | 30 | 80 | 25 | 250 | — | 1 | Robot_Tower (faces east) |
| Bomber | 70 | 100 | 20 | 200 | 50 | 1 | Robot_Bomber. Ammo 3 bombs/game. Throws proximity traps onto empty cells. 120° east-facing wedge. |
| Wall | 20 | 300 | 0 | 0 | — | 0 | Brown box that shrinks from the top as it takes damage (no HP bar; the body IS the HP indicator) |
| Cannon | 60 | 120 | 40 | 280 | 45 | 1 | LEGACY — no shop button, type kept for compatibility |
| Mine | 20 | 50 | 60 | 60 | 70 | 0 | Detonates when a cyborg moves on top |

### Structures (preview pieces, dashed border in shop)
Single south.png each (unknown.png from Meshy export). Placeable so the
user can preview in-game and decide which to commission full 8-direction
renders for.

| Preview | Cost | HP | Damage | Range | Notes |
|---|---|---|---|---|---|
| Defense | 20 | 80 | 0 | 0 | Geodesic dome (user liked — possible Shield Generator) |
| Gun | 30 | 80 | 15 | 200 | Twin-barrel turret (user liked) |
| Laser | 40 | 70 | 25 | 300 | Twin-laser turret |
| Signal | 20 | 50 | 0 | 0 | Satellite dish |

### Power Core (objective, not buyable)
| Stat | Value |
|---|---|
| HP | 100 |
| Footprint | **2x2 cells** (size rule: small=1, large=4) |
| Sprite size | GRID_CELL * 3 = 150 world units (visually dominates) |
| Position | (-550, 0) — centroid sits on the grid intersection between cols 0/1 and rows 3/4 |
| Death | 9-frame explosion + 180-unit AoE blast that wipes nearby cyborgs |

Defender loses if Power Core HP reaches 0.

---

## Attackers (Cyborgs, red side)

| Unit | Cost | HP | Speed | Damage | Atk range | Sight | AoE | AP | Behavior |
|---|---|---|---|---|---|---|---|---|---|
| **Cannon** | 70 | 180 | 55 | 35 | 240 | 320 | — | 3 | Aggressive — advance to attack range, hold, fire |
| **Grenadier** | **50** | 110 | 75 | 20 | 180 | 280 | 45 | 3 | Standoff — keep distance, lob proximity grenades. Can DIFFUSE adjacent armed enemy bombs (1 AP). Green sprite tint. |
| **Double Gun** | 90 | 160 | 65 | 45 | 230 | 300 | — | 3 | Aggressive — heavy direct fire from medium range. Warm-orange sprite tint. |
| **Hulk** | 100 | 280 | **45** | 55 | 70 | 220 | — | 2 | Melee bruiser — heaviest HP / damage, slow speed (bumped 35 → 45 in S17). **Slam (2 AP, 40 dmg, 3 ammo)**: hits all enemies in a 3-cell-wide wedge one tile forward. **Unlimited fists** — no ammo cost for punches (regular ammo=5 is unused for the punch action; only slam consumes slamAmmo). Single-minded core-march: punches if adjacent, marches to core otherwise. |
| **Sniper** | 90 | 80 | 50 | 150 | **350** | **400** | — | 2 | Precision strike. **Single shot** (ammo 1) at long range — 150 dmg one-shots every defender structure (max HP 120 cannon turret) and most cyborg-tier units. Range trimmed 400 → 350 in S17 (sight 450 → 400). **Crouch rule (S17): can NOT crouch and shoot the same turn** — first turn in range plays the aim pose (no fire), next turn fires. Movement breaks the crouch. After firing the sniper anchors crouched, retreats east if out of ammo. AI build enforces 3-cell sniper spacing. Sprite aim-pose offset is `dx = ±0.10 × size` (measured from PNG bbox). |
| **Medic** | 70 | 50 | 70 | 30* | 150 | 280 | — | 3 | Support unit, three heal modes sharing a 5-charge pool. **Throw med-pack** (1 charge, 3-cell range), **Deploy medic-pad** (2 charges, 15 HP/tick × 4 ticks), **Tether** (1 charge/turn, 20 HP/turn). AI priority: tether high-value ally first → throw at most-damaged → drop pad on cluster → walk toward wounded. **Diagonal movement allowed** (`allowDiagonalMove: true`). |
| **Stalker** (S17) | 70 | 130 | 60 | 40 | 70 | 220 | — | 2 | **Cloaked melee bruiser.** Spawns invisible (sprite at 35% opacity, defender targeting AI skips cloaked units; AoE/splash still hits). Cloak drops PERMANENTLY on first damage-dealing action OR on any incoming damage. Unlimited fists (ammo=99). Single-minded front-line charge: melee if adjacent, else march at nearest defender (no sight gate). Sprite size 76 (sub-Hulk). 8-direction art + walking + east/west strike. Folder: `cyborg_stalker/`. |
| **Grenadier (S17 rules)** | 50 | 110 | 75 | 20 | 180 | 280 | 60 | 3 | **Extra explosive shielding** — AoE damage halved on grenadiers (heavy blast plating). Throws must land BEHIND or to the SIDE of the nearest enemy (never in front where cyborgs cluster). Zero ally hits required. Geometric classification via cos of angle between (thrower→enemy) and (enemy→cell). Can DIFFUSE adjacent armed enemy bombs (1 AP). |

Cyborgs spawn in the attacker zone (x > 200) and need to traverse the
battlefield to reach the Power Core at (-550, 0). All cyborg costs are
multiples of 10 so leftover credits stay spendable.

---

## Build-Phase Credit Allocation (session 16)
Two stacking bonuses on top of `START_CREDITS` (1000):

| Side | Bonus | Player budget | AI budget |
|---|---|---|---|
| Defender | base × 1.0 | **1000** | **1500** (× AI_CREDIT_BONUS 1.5) |
| Attacker | base × 1.3 (ATTACKER_CREDIT_BONUS) | **1300** | **1950** (× 1.5 on top) |

Attacker bonus added in session 16 — defender pieces are stationary
and healable so cyborgs need more bodies to compensate. AI bonus is
unchanged (0.5).

## Ammo Crates (session 16)
Resupply boxes drop in the middle no-build zone every 5 reveals during
BATTLE (cap 4 on-field). Random cell, weighted bag:
- 55% ammo
- 20% grenade
- 15% medkit
- 10% repair_kit

Each pickup grants `+2` to the unit's `ammoRemaining` (capped at the
Config max). Crates have 1 HP — destroyed by grenades in their AoE or
by defender direct-fire when no cyborg is in range. Gated by unit
family via `kitForUnit()`: a medic can't pick up a bullet crate.

## Build-Phase Economy (proposed expansion)

Currently: place pieces only, fixed starting credits + extra fire-arc
purchases for directional structures.

### Live: Extra fire arcs (compass-rose UI)
Every directional structure ships with one east-facing 120° wedge.
Right-click the placed structure during BUILD to open a compass rose;
pay `Config.EXTRA_FACING_COST` (30cr) per additional cardinal facing
(max 4 = omnidirectional coverage). Right-click on empty space still
pans the camera. Left-click anywhere outside the rose closes it.
Refunding a structure refunds only its base cost — extra-facing spend
is sunk.

Planned shop additions (apply per-piece):
| Upgrade | Effect | Suggested cost |
|---|---|---|
| Extra ammo | +N shots / turn (or unlimited) | 15-25 |
| Health pack | Restore HP for one piece | 20-30 |
| Shield | Absorbs next N damage points before HP is hit | 25-40 |
| AP boost | +1 AP for one turn for one piece | 15-25 |

Goal: small economic decisions that let weaker pieces threaten bigger ones
(e.g. cheap turret + shield can survive a Cannon push).

---

## AI Behavior States

Every piece runs a small state machine. Default transitions:

```
                       (target in sight)              (target lost / dead)
   ┌──────────┐   ───────────────────►   ┌───────────┐   ──────────►   ┌──────────┐
   │  CAMP    │                          │ ENGAGED   │                  │  CAMP    │
   │ (idle)   │   ◄───────────────       │ (behavior │                  │          │
   └──────────┘   (return to spawn)      │  routine) │                  └──────────┘
                                          └───────────┘
```

**CAMP** — no enemy in sight. Piece can:
- Wander: move 1 random adjacent cell every N turns (low frequency so it
  doesn't drift far from spawn). Skip for stationary pieces (Sphere, structures).
- Hold: stationary, idle animation.

**Live implementation (cyborgs):** when no defender / structure / core is
within the unit's `sightRange`, there's a **50% chance per turn** to wander
to a random unoccupied adjacent cell. The other 50% the unit advances toward
the core normally (so they still close the distance, just less directly).

**ENGAGED** — a target is in sight. Piece runs its behavior routine:

| Behavior | Description |
|---|---|
| **Aggressive** | Advance to attack range, fire whenever ready. Cannon, Double Gun. |
| **Standoff** | Stay at max attack range; if enemy closes inside (range × 0.6) retreat one cell. Grenadier. |
| **Defensive** | Stationary; fire whenever a target enters attack range. Spheres, turrets. |
| **Sneaky** (future) | Try to flank — route around enemy front line to hit from behind. Assassin. |
| **Sniper** (future) | Halt and crouch (different sprite state) before firing. Long range, slow rate of fire. |
| **Suicide rush** (future) | Charge nearest target ignoring losses; explode on contact. |

**Sight range** is separate from attack range:
- Sight > attack lets a piece spot threats before engaging (most pieces).
- Sight < attack would make a piece "blind" beyond a certain distance —
  potential weakness for a long-range piece that needs a spotter.

---

## Proposed future pieces

These would deepen the rock-paper-scissors. Listed as design seeds — none are
built yet.

| Side | Name | Cost guess | Behavior | Special |
|---|---|---|---|---|
| Robots | **Heavy Laser Turret** | 80 | Defensive | Cardinal-only fire (N/S/E/W). High damage, long cooldown. Cyborgs that approach diagonally avoid it briefly. |
| Robots | **Sniper Spire** | 60 | Sniper | Cardinal-only, very long range (450). Single shot per turn. Counters fast cyborgs from across the map. |
| Robots | **Shield Generator** | 50 | Defensive | Stationary. Adds shield HP to adjacent friendly pieces per turn. |
| Robots | **Recon Drone** | 35 | Sneaky | Mobile spotter. Long sight, no weapon. Reveals fog of war for nearby allies (future fog-of-war system). |
| Cyborgs | **Sapper** | 40 | Aggressive | Slow, low HP. Can disable a wall by sitting next to it for one turn. |
| Cyborgs | **Sniper Cyborg** | 65 | Sniper | Cardinal-only, attack range 380, sight 450, single shot per turn. Crouches to aim — visible "crouch" sprite. Soft counter to the Sphere. |
| Cyborgs | **Assassin** | 75 | Sneaky | High speed, low HP, short range melee. Tries to flank around the front line and hit defenders from the side or back. |
| Cyborgs | **Berserker** | 50 | Suicide rush | Charges nearest target ignoring fire; detonates on contact for big AoE. |

## Balance Principles

1. **Mirror power, not abilities.** If Grenadier can hit behind cover, Robots
   need a piece that detects/snipes behind cover too.
2. **Action economy beats raw damage.** A piece with 2 AP that fires twice often
   out-trades a piece with 1 AP that fires once at higher damage.
3. **Cost reflects role, not just stats.** A pricey unit can be balanced by
   limiting how many of it can fit in the build zone.
4. **The Power Core is the only objective.** Side missions (eliminate all units)
   are secondary.

---

## Open design questions

- ~~Plan-then-play vs one-action-at-a-time?~~ **LOCKED: plan-then-play with
  initiative-interleaved reveal, strict-skip on invalid actions.** See
  "Turn flow" section above.
- ~~Same-turn fire by structures?~~ **LOCKED: structures auto-fire on their
  initiative tick. Defender doesn't queue actions for them.**
- **Directional firing arcs (planned follow-up).** Structures should be
  directional, with arc bought at purchase and cost scaling per direction
  (draft: 1 dir = base cost, +10cr each additional direction; full omni =
  base + 70cr). This narrows what counts as a "target in range" for the
  auto-fire check. Will land in a separate pass right after the turn system.
- **Diagonal movement** — allowed (8-directional) or 4-directional only?
  Sphere should be 8-dir since it can shoot in any direction. Cyborgs?
- **Turning cost for cyborgs** — should turning take an AP, or piggyback on the
  move? Sphere is free; cyborgs need a tradeoff so they can't pivot+fire freely.
- **Ammo finite vs unlimited?** Finite ammo per piece + buyable refills creates
  resource pressure but adds inventory tracking.
- **Camp wandering frequency** — every turn (too chaotic) or every 2-3 turns
  (more natural)? Stationary pieces never wander. (Currently moot once
  plan-then-play lands — wander becomes a queued "move random" action only
  if AI is driving the side.)
- **Sight range blocking** — do walls / other pieces block sight the same way
  they block projectiles? Probably yes for symmetry, but sniper/spotter pieces
  may need a "elevated sight" exception.
- **Sneaky / flank routing** — does an Assassin pathfind around the enemy line,
  or just prefer cells away from the highest enemy density? Latter is simpler.
