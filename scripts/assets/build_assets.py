"""Build the game's runtime assets from the art in the project root `assets/` folder.

Run from the game folder:  uv run --no-project --with pillow --with numpy python scripts/assets/build_assets.py

Outputs
  assets/game/**            resized WebP images used by the game
  assets/icon.png ...       app icon, adaptive icon layers, splash, favicon
  src/content/generated/assetMetrics.ts   sprite and jar measurements used by the renderer

Why measurements: each ghost sprite is drawn around a physics circle. The script finds the body
centre (centroid of the opaque fur) and its equivalent radius, crops a square around that centre,
and records how far the canvas extends past the body, so a circle of radius r is drawn with the
right sprite size on every tier.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

GAME = Path(__file__).resolve().parents[2]
SRC = GAME.parents[1] / "assets"
OUT = GAME / "assets" / "game"
GEN = GAME / "src" / "content" / "generated"

CHAR_SIZE = 384
WEBP_Q = 88


def save_webp(im: Image.Image, rel: str, quality: int = WEBP_Q) -> None:
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path.with_suffix(".webp"), "WEBP", quality=quality, method=6)


def fit(im: Image.Image, max_side: int) -> Image.Image:
    im = im.copy()
    im.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return im


def sprite_metrics(im: Image.Image) -> tuple[Image.Image, float]:
    """Crop a square centred on the body; return (crop, drawScale) where drawScale = half / bodyRadius."""
    a = np.asarray(im.getchannel("A"), dtype=np.float32)
    core = a > 200
    ys, xs = np.nonzero(core)
    cx, cy = xs.mean(), ys.mean()
    body_r = math.sqrt(core.sum() / math.pi)
    vis_y, vis_x = np.nonzero(a > 12)
    half = float(np.sqrt((vis_x - cx) ** 2 + (vis_y - cy) ** 2).max()) + 4
    box = (int(cx - half), int(cy - half), int(cx + half), int(cy + half))
    return im.crop(box), half / body_r


def build_characters(metrics: dict) -> None:
    chars = json.loads((SRC / "characters" / "characters.json").read_text())
    scales = {}
    for c in chars["numbers"]:
        crop, scale = sprite_metrics(Image.open(SRC / "characters" / c["sprite"]).convert("RGBA"))
        save_webp(crop.resize((CHAR_SIZE, CHAR_SIZE), Image.Resampling.LANCZOS), f"ghosts/{c['tier']:02d}_{c['id']}")
        scales[c["tier"]] = round(scale, 4)
        pop = SRC / "characters" / c["popSprite"]
        if pop.exists():
            pcrop, _ = sprite_metrics(Image.open(pop).convert("RGBA"))
            save_webp(pcrop.resize((CHAR_SIZE, CHAR_SIZE), Image.Resampling.LANCZOS), f"ghosts/pop_{c['tier']:02d}_{c['id']}")
    crystal_scales = {}
    for c in chars["crystals"]:
        crop, scale = sprite_metrics(Image.open(SRC / "characters" / c["sprite"]).convert("RGBA"))
        save_webp(crop.resize((CHAR_SIZE, CHAR_SIZE), Image.Resampling.LANCZOS), f"crystals/{c['id']}")
        crystal_scales[c["id"]] = round(scale, 4)
    metrics["ghostDrawScale"] = scales
    metrics["crystalDrawScale"] = crystal_scales
    metrics["popTiers"] = [c["tier"] for c in chars["numbers"] if (SRC / "characters" / c["popSprite"]).exists()]


def build_jar(metrics: dict) -> None:
    jar = Image.open(SRC / "jar" / "jar_glass_night.png").convert("RGBA")
    jar = jar.crop(jar.getchannel("A").point(lambda v: 255 if v > 12 else 0).getbbox())
    a = np.asarray(jar.getchannel("A"), dtype=np.int32)
    h, w = a.shape
    mid = a[int(h * 0.5)]
    centre = w // 2
    glass = 100  # wall sits in the middle of the frosted glass
    left = centre - int(np.argmax(mid[:centre][::-1] > glass))
    right = centre + int(np.argmax(mid[centre:] > glass))
    col = a[:, centre]
    bottom = int(h * 0.6) + int(np.argmax(col[int(h * 0.6):] > glass))
    # the cavity starts below the neck band: last opaque row above the middle
    upper = col[: int(h * 0.45)]
    rim = int(np.nonzero(upper > glass)[0].max())
    target_w = 720
    k = target_w / w
    save_webp(jar.resize((target_w, round(h * k)), Image.Resampling.LANCZOS), "jar/jar")
    metrics["jar"] = {
        "imageW": target_w, "imageH": round(h * k),
        "innerLeft": round(left * k, 1), "innerRight": round(right * k, 1),
        "innerTop": round(rim * k, 1), "innerBottom": round(bottom * k, 1),
    }


def build_scene() -> None:
    for name in ("bg_game_night_world", "bg_map_ghost_path"):
        save_webp(Image.open(SRC / "backgrounds" / f"{name}.png").convert("RGB"), f"bg/{name}", 82)
    for state in ("closed", "opening", "open"):
        im = Image.open(SRC / "door" / f"door_{state}.png").convert("RGBA")
        im = im.crop(im.getchannel("A").point(lambda v: 255 if v > 12 else 0).getbbox())
        save_webp(fit(im, 900), f"door/door_{state}")
    sizes = {
        "ui/panel": 640, "fx/merge_spark": 384, "fx/glow_ring": 384, "fx/glitter": 256, "fx/stars": 256,
        "fx/sparkle": 128, "fx/heart": 128, "fx/light_orb": 160, "fx/shooting_star": 256,
        "currency/coin": 128, "currency/coin_stack": 192, "currency/gem": 128,
        "currency/star": 160, "currency/star_empty": 160,
        "ui/counter_pill": 320, "ui/hug_tag": 256,
        "ui/btn_play": 192, "ui/btn_pause": 160, "ui/btn_settings": 160, "ui/btn_home": 160,
        "ui/btn_retry": 160, "ui/btn_store": 160,
        "map/node_open": 256, "map/node_current": 256, "map/node_locked": 256, "map/node_done": 256,
        "map/node_gem": 256, "map/node_boss_door": 288,
    }
    for rel, side in sizes.items():
        save_webp(fit(Image.open(SRC / f"{rel}.png").convert("RGBA"), side), rel)


def build_app_icons() -> None:
    bg = Image.open(SRC / "backgrounds" / "bg_game_night_world.png").convert("RGB")
    square = bg.crop((0, 0, bg.width, bg.width)).resize((1024, 1024), Image.Resampling.LANCZOS)
    square = square.filter(ImageFilter.GaussianBlur(6))
    ghost = Image.open(SRC / "characters" / "numbers" / "2048_lumi.png").convert("RGBA")
    ghost, _ = sprite_metrics(ghost)
    icon = square.copy().convert("RGBA")
    g = ghost.resize((820, 820), Image.Resampling.LANCZOS)
    icon.alpha_composite(g, (102, 120))
    icon.convert("RGB").save(GAME / "assets" / "icon.png")
    icon.convert("RGB").resize((48, 48), Image.Resampling.LANCZOS).save(GAME / "assets" / "favicon.png")
    # Android adaptive layers: foreground must keep the subject inside the 66% safe zone
    fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    fg.alpha_composite(ghost.resize((600, 600), Image.Resampling.LANCZOS), (212, 222))
    fg.save(GAME / "assets" / "android-icon-foreground.png")
    square.save(GAME / "assets" / "android-icon-background.png")
    mono = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    silhouette = ghost.resize((600, 600), Image.Resampling.LANCZOS).getchannel("A")
    mono.paste(Image.new("RGBA", (600, 600), (255, 255, 255, 255)), (212, 222), silhouette)
    mono.save(GAME / "assets" / "android-icon-monochrome.png")
    splash = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    splash.alpha_composite(ghost.resize((700, 700), Image.Resampling.LANCZOS), (162, 162))
    splash.save(GAME / "assets" / "splash-icon.png")


def write_metrics(metrics: dict) -> None:
    GEN.mkdir(parents=True, exist_ok=True)
    body = json.dumps(metrics, indent=2)
    (GEN / "assetMetrics.ts").write_text(
        "// Generated by scripts/assets/build_assets.py. Do not edit by hand.\n"
        f"export const assetMetrics = {body} as const;\n",
        encoding="utf-8",
    )


def main() -> None:
    metrics: dict = {}
    build_characters(metrics)
    build_jar(metrics)
    build_scene()
    build_app_icons()
    write_metrics(metrics)
    total = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    print(json.dumps(metrics["jar"]), f"game assets: {total / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
