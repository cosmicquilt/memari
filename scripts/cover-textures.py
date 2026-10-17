# THE COVER MATERIALS, drawn: four textures for printed covers, made here so
# nothing is licensed from anyone (2026-10-08, "instead of flat color, i would
# like detailed pattern"):
#
#   granite  white with grey and black crystals  ("a white and grey granite")
#   stone    grey board with fine grain and fibres, after the grey notebook
#            cover Andrew pointed at (Kelly Sikkema's photo, handoff/mockups)
#   leather  black pebble grain                  ("a leather moleskin pattern")
#   cloth    the hero's closed book: charcoal bookcloth, for the gold memari.
#
# Each is 18 x 12 in at 250 dpi - wide enough for the widest hardcover wrap -
# written to assets/covers/<name>.jpg, which src/lib/print/cover.ts lays
# under every cover. Seeded, so a re-run gives the same files.
#
#   python -I scripts/cover-textures.py [name ...]

import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

DPI = 250
W, H = 18 * DPI, 12 * DPI
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "covers")


def upsampled(rng, h, w, cell):
    """Smooth noise with features about `cell` px across: a random grid,
    resized up bicubically."""
    gh, gw = max(2, h // cell + 3), max(2, w // cell + 3)
    grid = rng.standard_normal((gh, gw)).astype(np.float32)
    img = Image.fromarray(grid, mode="F").resize((gw * cell, gh * cell), Image.BICUBIC)
    a = np.asarray(img)[cell : cell + h, cell : cell + w]
    return a / (a.std() + 1e-6)


def fbm(rng, h, w, cells, weights):
    total = np.zeros((h, w), np.float32)
    for cell, weight in zip(cells, weights):
        total += weight * upsampled(rng, h, w, cell)
    return total / (np.abs(np.array(weights)).sum())


def soft(a, sigma):
    """A small Gaussian blur of a float field: shifted copies, weighted -
    PIL blurs only 8-bit images."""
    r = max(1, int(np.ceil(sigma * 2.5)))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    out = np.zeros_like(a)
    pad = np.pad(a, ((0, 0), (r, r)), mode="edge")
    for i, wgt in enumerate(k):
        out += wgt * pad[:, i : i + a.shape[1]]
    pad = np.pad(out, ((r, r), (0, 0)), mode="edge")
    out = np.zeros_like(a)
    for i, wgt in enumerate(k):
        out += wgt * pad[i : i + a.shape[0], :]
    return out


def to_image(rgb):
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")


def tint(gray, colour):
    """A grey-level field (0..1 around a base) into RGB of one colour."""
    c = np.array(colour, np.float32).reshape(1, 1, 3)
    return gray[..., None] * c


def granite(rng):
    # A warm white ground, softly clouded.
    base = np.full((H, W, 3), (234, 233, 229), np.float32)
    base += 5 * fbm(rng, H, W, [600, 160, 40], [1, 0.6, 0.3])[..., None]
    # Crystals: patches of fine noise above a threshold, grouped by a slow
    # field so they gather in drifts rather than sprinkle evenly.
    drift = fbm(rng, H, W, [500, 140], [1, 0.5])
    layers = [
        ((150, 150, 152), 9, 1.05, 0.35),  # light grey crystals, many
        ((105, 106, 110), 6, 1.45, 0.30),  # mid grey
        ((48, 48, 52), 5, 1.95, 0.25),  # dark flecks, few
        ((20, 20, 22), 3, 2.55, 0.20),  # black specks, fewest
    ]
    for colour, cell, threshold, drift_weight in layers:
        n = upsampled(rng, H, W, cell) + drift_weight * drift
        mask = np.clip((n - threshold) * 3.0, 0, 1)
        mask = soft(mask.astype(np.float32), 0.7)
        base = base * (1 - mask[..., None]) + np.array(colour, np.float32) * mask[..., None]
    # A fine grain over it all, as stone has.
    base += 4 * rng.standard_normal((H, W)).astype(np.float32)[..., None]
    return to_image(base)


def stone(rng):
    # The grey board: even mid grey, a faint cloud, fine grain.
    base = np.full((H, W, 3), (152, 153, 155), np.float32)
    base += 4 * fbm(rng, H, W, [700, 200, 50], [1, 0.6, 0.3])[..., None]
    grain = upsampled(rng, H, W, 2) * 0.6 + rng.standard_normal((H, W)).astype(np.float32) * 0.8
    base += 5 * grain[..., None]
    img = to_image(base)
    # Fibres: short curled hairs pressed into the board, mostly a warm dark,
    # some lighter - drawn as small random walks.
    draw = ImageDraw.Draw(img, "RGBA")
    count = int(W * H / 9000)
    for i in range(count):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        angle = rng.uniform(0, 2 * np.pi)
        steps = int(rng.integers(6, 22))
        dark = rng.random() < 0.8
        colour = (112, 104, 92, int(rng.integers(70, 150))) if dark else (190, 188, 180, int(rng.integers(60, 120)))
        points = [(x, y)]
        for _ in range(steps):
            angle += rng.normal(0, 0.45)
            x += 2.2 * np.cos(angle)
            y += 2.2 * np.sin(angle)
            points.append((x, y))
        draw.line(points, fill=colour, width=1)
    # Specks.
    for _ in range(int(W * H / 2500)):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(0.5, 1.6)
        shade = int(rng.choice([95, 110, 185]))
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(shade, shade - 2, shade - 5, int(rng.integers(80, 170))))
    return img.filter(ImageFilter.GaussianBlur(0.35))


def worley(rng, h, w, cell):
    """Distances to the nearest and second-nearest of jittered points, one
    per `cell` px square: F1 and F2, in rows so memory stays small."""
    gh, gw = h // cell + 3, w // cell + 3
    pts = (np.stack(np.meshgrid(np.arange(gw), np.arange(gh)), -1) + rng.random((gh, gw, 2))).astype(np.float32) * cell
    f1 = np.empty((h, w), np.float32)
    f2 = np.empty((h, w), np.float32)
    xs = np.arange(w, dtype=np.float32)
    band = 120
    for y0 in range(0, h, band):
        ys = np.arange(y0, min(h, y0 + band), dtype=np.float32)
        yy, xx = np.meshgrid(ys, xs, indexing="ij")
        cy = (yy // cell).astype(np.int32)
        cx = (xx // cell).astype(np.int32)
        d = []
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                gy = np.clip(cy + dy, 0, gh - 1)
                gx = np.clip(cx + dx, 0, gw - 1)
                p = pts[gy, gx]
                d.append(np.hypot(p[..., 0] - xx, p[..., 1] - yy))
        d = np.sort(np.stack(d, 0), 0)
        f1[y0 : y0 + len(ys)] = d[0]
        f2[y0 : y0 + len(ys)] = d[1]
    return f1, f2


def leather(rng):
    # Pebble grain: rounded cells (F1) parted by fine creases (F2 - F1),
    # lit from the upper left, on a near-black with the faintest warmth.
    cell = 9
    f1, f2 = worley(rng, H, W, cell)
    height = 1.0 - np.clip(f1 / cell, 0, 1.2)
    crease = np.clip((f2 - f1) / (0.18 * cell), 0, 1)
    height = height * 0.7 + crease * 0.3
    height = soft(height.astype(np.float32), 0.9)
    gy, gx = np.gradient(height)
    light = -(gx + gy) * 0.7071
    shade = 6.0 * light / (np.abs(light).std() + 1e-6)
    base = np.full((H, W, 3), (30, 29, 29), np.float32)
    base += 2.2 * shade[..., None]
    base -= 7.0 * (1 - crease)[..., None]
    base += 3 * fbm(rng, H, W, [600, 150], [1, 0.5])[..., None]
    return to_image(base)


def cloth(rng):
    # Bookcloth: a fine weave of threads across and down, slubbed, on the
    # hero's slate charcoal.
    base = np.full((H, W, 3), (63, 67, 70), np.float32)
    rows = rng.standard_normal(H).astype(np.float32)
    cols = rng.standard_normal(W).astype(np.float32)
    # Threads about 3 px apart; each thread's tone wanders along it.
    weft = np.repeat(rows[:, None], W, 1) * (0.6 + 0.4 * upsampled(rng, H, W, 40))
    warp = np.repeat(cols[None, :], H, 0) * (0.6 + 0.4 * upsampled(rng, H, W, 40))
    checker = ((np.arange(H)[:, None] + np.arange(W)[None, :]) % 2).astype(np.float32)
    weave = np.where(checker > 0, weft, warp)
    weave = soft(weave.astype(np.float32), 0.6)
    base += 4.5 * weave[..., None]
    base += 3 * fbm(rng, H, W, [500, 120], [1, 0.5])[..., None]
    base += 2 * rng.standard_normal((H, W)).astype(np.float32)[..., None]
    return to_image(base)


MAKERS = {"granite": (granite, 11), "stone": (stone, 12), "leather": (leather, 13), "cloth": (cloth, 14)}

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    names = sys.argv[1:] or list(MAKERS)
    for name in names:
        maker, seed = MAKERS[name]
        img = maker(np.random.default_rng(seed))
        path = os.path.join(OUT, f"{name}.jpg")
        img.save(path, quality=88, subsampling=0, dpi=(DPI, DPI))
        print(f"{name}: {img.size[0]}x{img.size[1]}, {os.path.getsize(path) / 1e6:.1f} MB -> {os.path.relpath(path)}")
