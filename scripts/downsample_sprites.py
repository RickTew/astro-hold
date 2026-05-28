#!/usr/bin/env python3
"""
S21 pixel-perfect: downsample sprite PNGs to their target world-unit
pixel size with nearest-neighbor. Produces visually identical output to
the runtime NearestFilter downsample but shrinks file size + GPU
memory + texture upload time.

Walk every PNG inside each /public/sprites/<folder>/ directory (including
nested state/dir/frame_NNN.png and explosion/frame_NNN.png) and downsize
in place to (target, target) using PIL's NEAREST resampling.

Sized to match the per-type render sizes from Structure.ts +
SpriteUnit.ts + SphereDefender.ts. Skip folders that are unused, that
are preview-only and may need re-export later, or that would need to
be upscaled (no benefit).

Run from repo root: python3 scripts/downsample_sprites.py
"""

import sys
from pathlib import Path
from PIL import Image

# Folder -> target pixel size (== world-unit size at PPWU=2 with PNG=wu).
# Sourced from SPRITE_SIZE_OVERRIDE in Structure.ts, SpriteUnit.ts, and
# SphereDefender.ts. See docs/PIXEL_PERFECT.md for the contract.
TARGETS = {
    "bomber":         80,   # Defender Blastor (Structure)
    "cannon":         60,   # Cyborg cannon SpriteUnit
    "cyborg_stalker": 76,   # Stalker SpriteUnit
    "defense":        50,   # Defender preview structure
    "dog":            60,   # Combat Dog SpriteUnit
    "doublegun":      60,   # Doublegun SpriteUnit
    "grenadier":      60,   # Grenadier SpriteUnit
    "gun":            40,   # Defender Phaser Cannon (Structure)
    "hulk":           84,   # Hulk SpriteUnit
    "laser":          34,   # Defender Laser (Structure)
    "medic":          60,   # Medic SpriteUnit
    "repair":         60,   # Repair SpriteUnit (defender)
    "robot_mine":     36,   # Defender Mine (Structure)
    "sentry":         84,   # Defender Sentry (Structure)
    "signal":         42,   # Defender Signal (Structure)
    "sniper":         60,   # Sniper SpriteUnit
    "sphere":         45,   # SphereDefender
    "tower":          64,   # Defender Tower / turret (Structure)
    # Preview-only tile. Sized to match the HUD icon use.
    "cyborg_mine":    50,
    # SKIPPED (unused/staged): cyborg_gatling, cyborg_sentry, freeze_mine,
    # grenade_bomb, grenade_fire, grenade_gas, powercore (native 124px is
    # already smaller than target 150 wu, upscaling adds no detail).
}

SPRITES_ROOT = Path("public/sprites")


def downsize_png(path: Path, target: int) -> tuple[int, int, bool]:
    """Returns (orig_size, new_size, did_resize)."""
    with Image.open(path) as im:
        w, h = im.size
        if w == target and h == target:
            return (w, target, False)
        if w > target or h > target:
            # NEAREST preserves the pixel-art look and produces identical
            # output to the GPU's NearestFilter downsample at runtime.
            resized = im.resize((target, target), Image.Resampling.NEAREST)
        else:
            # Upscaling pixel art doesn't gain quality. Skip.
            return (w, w, False)
        resized.save(path, "PNG", optimize=True)
        return (w, target, True)


def process_folder(folder: Path, target: int) -> tuple[int, int]:
    """Returns (resized_count, skipped_count)."""
    resized, skipped = 0, 0
    for png in folder.rglob("*.png"):
        try:
            orig, new, did = downsize_png(png, target)
        except Exception as e:
            print(f"  ERROR {png}: {e}", file=sys.stderr)
            continue
        if did:
            resized += 1
        else:
            skipped += 1
    return resized, skipped


def main() -> int:
    if not SPRITES_ROOT.exists():
        print(f"ERROR: {SPRITES_ROOT} not found. Run from repo root.", file=sys.stderr)
        return 1

    total_resized = 0
    total_skipped = 0
    for folder_name, target in sorted(TARGETS.items()):
        folder = SPRITES_ROOT / folder_name
        if not folder.is_dir():
            print(f"  SKIP {folder_name}: folder missing")
            continue
        r, s = process_folder(folder, target)
        total_resized += r
        total_skipped += s
        print(f"  {folder_name:18s} -> {target}px : {r} resized, {s} skipped")

    print(f"\nTotal: {total_resized} PNGs resized, {total_skipped} unchanged.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
