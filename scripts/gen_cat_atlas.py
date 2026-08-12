"""Generate the pixel-cat sprite atlas used by myagent M0/M1."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "sprites"
PUBLIC_DIR = ROOT / "public" / "sprites"

FW, FH = 32, 32
SCALE = 4

ORANGE = (232, 145, 58, 255)
ORANGE_D = (196, 110, 40, 255)
CREAM = (255, 236, 210, 255)
PINK = (255, 170, 170, 255)
BLACK = (40, 28, 22, 255)
WHITE = (255, 255, 255, 255)
GREEN = (70, 160, 90, 255)


def px(draw: ImageDraw.ImageDraw, x: int, y: int, c, ox=0, oy=0) -> None:
    draw.point((ox + x, oy + y), fill=c)


def fill_rect(draw, x, y, w, h, c, ox=0, oy=0) -> None:
    draw.rectangle([ox + x, oy + y, ox + x + w - 1, oy + y + h - 1], fill=c)


def draw_cat(draw, ox, oy, *, leg_phase=0, sit=False, blink=False, tail_up=True) -> None:
    if sit:
        fill_rect(draw, 8, 14, 14, 12, ORANGE, ox, oy)
        fill_rect(draw, 9, 15, 12, 10, ORANGE_D, ox, oy)
        fill_rect(draw, 18, 18, 8, 8, ORANGE, ox, oy)
        fill_rect(draw, 9, 24, 4, 3, CREAM, ox, oy)
        fill_rect(draw, 14, 24, 4, 3, CREAM, ox, oy)
        head_y = 6
    else:
        fill_rect(draw, 6, 12, 16, 10, ORANGE, ox, oy)
        fill_rect(draw, 7, 13, 14, 8, ORANGE_D, ox, oy)
        fill_rect(draw, 9, 16, 10, 4, CREAM, ox, oy)
        legs = [(8, 22), (12, 22), (16, 22), (20, 22)]
        for i, (lx, ly) in enumerate(legs):
            dy = 0
            if leg_phase == 1 and i % 2 == 0:
                dy = -1
            if leg_phase == 2 and i % 2 == 1:
                dy = -1
            if leg_phase == 3 and i % 2 == 0:
                dy = 1
            fill_rect(draw, lx, ly + dy, 3, 5, ORANGE, ox, oy)
            fill_rect(draw, lx, ly + dy + 4, 3, 2, CREAM, ox, oy)
        head_y = 4

    fill_rect(draw, 8, head_y, 14, 12, ORANGE, ox, oy)
    fill_rect(draw, 9, head_y + 1, 12, 10, ORANGE_D, ox, oy)
    fill_rect(draw, 8, head_y - 3, 4, 4, ORANGE, ox, oy)
    fill_rect(draw, 9, head_y - 2, 2, 2, PINK, ox, oy)
    fill_rect(draw, 18, head_y - 3, 4, 4, ORANGE, ox, oy)
    fill_rect(draw, 19, head_y - 2, 2, 2, PINK, ox, oy)
    fill_rect(draw, 11, head_y + 5, 8, 5, CREAM, ox, oy)

    if blink:
        fill_rect(draw, 11, head_y + 4, 3, 1, BLACK, ox, oy)
        fill_rect(draw, 16, head_y + 4, 3, 1, BLACK, ox, oy)
    else:
        fill_rect(draw, 11, head_y + 3, 3, 3, WHITE, ox, oy)
        fill_rect(draw, 16, head_y + 3, 3, 3, WHITE, ox, oy)
        fill_rect(draw, 12, head_y + 4, 1, 2, BLACK, ox, oy)
        fill_rect(draw, 17, head_y + 4, 1, 2, BLACK, ox, oy)
        px(draw, 12, head_y + 4, GREEN, ox, oy)
        px(draw, 17, head_y + 4, GREEN, ox, oy)

    fill_rect(draw, 14, head_y + 7, 2, 1, PINK, ox, oy)
    px(draw, 14, head_y + 8, BLACK, ox, oy)
    px(draw, 15, head_y + 8, BLACK, ox, oy)
    px(draw, 7, head_y + 7, BLACK, ox, oy)
    px(draw, 6, head_y + 8, BLACK, ox, oy)
    px(draw, 22, head_y + 7, BLACK, ox, oy)
    px(draw, 23, head_y + 8, BLACK, ox, oy)

    if sit:
        fill_rect(draw, 24, 16, 3, 8, ORANGE, ox, oy)
        fill_rect(draw, 22, 14, 5, 3, ORANGE, ox, oy)
    elif tail_up:
        fill_rect(draw, 21, 8, 3, 8, ORANGE, ox, oy)
        fill_rect(draw, 22, 6, 3, 3, ORANGE, ox, oy)
    else:
        fill_rect(draw, 21, 14, 4, 3, ORANGE, ox, oy)
        fill_rect(draw, 24, 15, 3, 5, ORANGE, ox, oy)


def main() -> None:
    idle = [
        dict(leg_phase=0, blink=False, tail_up=True),
        dict(leg_phase=0, blink=False, tail_up=False),
        dict(leg_phase=0, blink=True, tail_up=True),
        dict(leg_phase=0, blink=False, tail_up=True),
    ]
    walk = [
        dict(leg_phase=1, blink=False, tail_up=True),
        dict(leg_phase=2, blink=False, tail_up=False),
        dict(leg_phase=3, blink=False, tail_up=True),
        dict(leg_phase=0, blink=False, tail_up=False),
    ]
    sit = [
        dict(sit=True, blink=False, tail_up=True),
        dict(sit=True, blink=False, tail_up=True),
        dict(sit=True, blink=True, tail_up=True),
        dict(sit=True, blink=False, tail_up=True),
    ]

    clips_src = [("idle", idle, 220), ("walk", walk, 140), ("sit", sit, 220)]
    total = sum(len(frames) for _, frames, _ in clips_src)
    atlas = Image.new("RGBA", (FW * total, FH), (0, 0, 0, 0))
    draw = ImageDraw.Draw(atlas)

    clips_meta = {}
    idx = 0
    for name, frames, frame_ms in clips_src:
        start = idx
        for params in frames:
            draw_cat(draw, idx * FW, 0, **params)
            idx += 1
        clips_meta[name] = {"start": start, "count": len(frames), "frameMs": frame_ms}

    big = atlas.resize((atlas.width * SCALE, atlas.height * SCALE), Image.NEAREST)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    meta = {
        "frameWidth": FW * SCALE,
        "frameHeight": FH * SCALE,
        "sourceFrameWidth": FW,
        "sourceFrameHeight": FH,
        "scale": SCALE,
        "image": "cat-atlas.png",
        "clips": clips_meta,
    }
    for dest in (OUT_DIR, PUBLIC_DIR):
        big.save(dest / "cat-atlas.png")
        (dest / "cat-atlas.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"wrote atlas {big.size} -> {OUT_DIR} and {PUBLIC_DIR}")


if __name__ == "__main__":
    main()
