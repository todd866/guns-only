#!/usr/bin/env python3
"""Neighbourhood skatepark paint atlas: original graffiti on worn concrete.

Four horizontal bands, each seamless left-to-right (the bowl wraps its U):
  image top    -> strip 3 central funbox banks
                  strip 2 manual pads (low sides: tags and stickers, no tall letters)
                  strip 1 western bank/deck wall
  image bottom -> strip 0 east quarter and pocket bowl
Within a band the bottom edge is the floor and the top edge is the lip.
Art direction follows the owner's reference park (bubble-letter throw-ups,
tags, chalk, buffed patches); every word and character here is original.

  python3 tools/rc/build-park-paint.py
"""
import math, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'web/wwwroot/rc/assets/materials/park-paint-atlas'
W, BAND = 2048, 512
FONTS = '/System/Library/Fonts/'
BUBBLE = FONTS + 'Supplemental/Arial Rounded Bold.ttf'
BLOCK = FONTS + 'Supplemental/Arial Black.ttf'
TAG = FONTS + 'MarkerFelt.ttc'
CHALK = FONTS + 'Supplemental/Chalkduster.ttf'
rng = random.Random(1987)

# Reference palette: cyan, bubblegum pink, lemon, lilac, tangerine, mint, sky.
FILLS = [((92, 200, 222), (40, 140, 190)), ((240, 120, 170), (190, 70, 140)), ((246, 222, 92), (214, 170, 40)),
         ((176, 150, 222), (120, 96, 186)), ((246, 150, 70), (214, 96, 46)), ((150, 222, 170), (70, 170, 120)),
         ((230, 236, 240), (176, 196, 210))]
INK = [(30, 30, 40), (40, 30, 70), (20, 50, 70)]


def concrete():
    base = Image.new('RGB', (W, BAND), (160, 160, 152))
    px = base.load()
    for y in range(BAND):
        for x in range(W):
            n = rng.random()
            m = 6 * math.sin(x * .011 + y * .004) * math.sin(y * .019) + 4 * math.sin((x - y) * .031)
            v = int((n - .5) * 16 + m)
            r, g, b = px[x, y]
            px[x, y] = (r + v, g + v, b + v - 1)
    d = ImageDraw.Draw(base)
    # Buffed-over patches: slightly different greys, as on the real walls.
    for _ in range(9):
        x, y, w, h = rng.randrange(W), rng.randrange(BAND), rng.randrange(120, 420), rng.randrange(60, 260)
        shade = rng.randrange(-6, 5)
        for dx in (-W, 0, W):
            d.rectangle([x + dx, y, x + dx + w, y + h], fill=(150 + shade, 151 + shade, 146 + shade))
    return base.filter(ImageFilter.GaussianBlur(.6))


def glyph_mask(text, font, size, tracking, wobble):
    """Letters drawn one by one, overlapped and tilted like a hand-painted throw-up."""
    f = ImageFont.truetype(font, size)
    w = int(sum(f.getbbox(c)[2] for c in text) + size)
    mask = Image.new('L', (w, int(size * 1.7)), 0)
    x = size * .3
    for c in text:
        cell = Image.new('L', (size * 2, size * 2), 0)
        ImageDraw.Draw(cell).text((size * .4, size * .2), c, font=f, fill=255)
        cell = cell.rotate(rng.uniform(-wobble, wobble), resample=Image.BICUBIC)
        dy = int(rng.uniform(-.08, .08) * size)
        mask.paste(255, (int(x - size * .4), dy), cell)
        x += f.getbbox(c)[2] * tracking
    return mask.crop(mask.getbbox())


def dilate(mask, r):
    return mask.filter(ImageFilter.MaxFilter(r * 2 + 1)) if r else mask


def paste_wrapped(canvas, layer, mask, x, y):
    for dx in (-W, 0, W):
        canvas.paste(layer, (x + dx, y), mask)


def throwup(canvas, text, cx, cy, height, font=BUBBLE, tilt=4):
    size = height
    fill = glyph_mask(text, font, size, rng.uniform(.78, .9), 12)
    # Fatten and round the strokes so the letters read as sprayed bubbles.
    fill = dilate(fill, max(1, size // 60)).filter(ImageFilter.GaussianBlur(size / 34)).point(lambda v: 255 if v > 120 else 0)
    pad = 26
    big = Image.new('L', (fill.width + pad * 2, fill.height + pad * 2), 0)
    big.paste(fill, (pad, pad))
    fill = big
    outline = dilate(fill, 7)
    shadow = ImageChops.offset(dilate(fill, 9), 9, 10)
    top, bottom = rng.choice(FILLS)
    grad = Image.new('RGB', fill.size)
    gd = ImageDraw.Draw(grad)
    for y in range(fill.height):
        t = y / max(1, fill.height - 1)
        gd.line([(0, y), (fill.width, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)))
    # Classic white highlight dashes along the upper-left of each letter.
    hi = ImageChops.subtract(fill, ImageChops.offset(fill, 7, 9)).filter(ImageFilter.MinFilter(3))
    piece = Image.new('RGB', fill.size, rng.choice(INK))
    shade = tuple(max(0, c - 70) for c in bottom)
    layers = Image.new('RGB', fill.size)
    layers.paste(shade, (0, 0), shadow)
    layers.paste(rng.choice(INK), (0, 0), outline)
    layers.paste(grad, (0, 0), fill)
    layers.paste((250, 250, 245), (0, 0), hi)
    alpha = ImageChops.lighter(ImageChops.lighter(shadow, outline), fill)
    # Drips run down from the fill's lower edge.
    dd = ImageDraw.Draw(layers)
    da = ImageDraw.Draw(alpha)
    for _ in range(rng.randrange(3, 8)):
        x = rng.randrange(pad, fill.width - pad)
        col = [y for y in range(fill.height) if fill.getpixel((x, y))]
        if not col:
            continue
        y0, length = col[-1], rng.randrange(14, 60)
        for draw, value in ((dd, bottom), (da, 255)):
            draw.line([(x, y0), (x, y0 + length)], fill=value, width=3)
            draw.ellipse([x - 3, y0 + length - 2, x + 3, y0 + length + 4], fill=value)
    angle = rng.uniform(-tilt, tilt)
    layers = layers.rotate(angle, expand=True, resample=Image.BICUBIC)
    alpha = alpha.rotate(angle, expand=True, resample=Image.BICUBIC)
    paste_wrapped(canvas, layers, alpha, int(cx - layers.width / 2), int(cy - layers.height / 2))


def tag(canvas, text, x, y, size, colour=None, font=TAG, angle=None):
    f = ImageFont.truetype(font, size)
    box = f.getbbox(text)
    layer = Image.new('L', (box[2] + 20, box[3] + 20), 0)
    ImageDraw.Draw(layer).text((10, 0), text, font=f, fill=255)
    layer = layer.rotate(rng.uniform(-10, 10) if angle is None else angle, expand=True, resample=Image.BICUBIC)
    colour = colour or rng.choice(INK + [(200, 40, 90), (40, 90, 200)])
    paste_wrapped(canvas, Image.new('RGB', layer.size, colour), layer, x, y)


def alien(canvas, cx, cy, r):
    """Original friendly alien character: the base's mascot, sprayed big."""
    s = int(r * 3)
    layer = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = s / 2
    ink = (25, 35, 40, 255)
    d.ellipse([c - r * 1.05 - 6, c - r * 1.2 - 6, c + r * 1.05 + 6, c + r * .95 + 6], fill=ink)
    d.ellipse([c - r * 1.05, c - r * 1.2, c + r * 1.05, c + r * .95], fill=(130, 214, 120, 255))
    for side in (-1, 1):
        ex = c + side * r * .42
        d.ellipse([ex - r * .32, c - r * .45, ex + r * .32, c + r * .2], fill=ink)
        d.ellipse([ex - r * .12, c - r * .35, ex + r * .02, c - r * .2], fill=(250, 250, 250, 255))
        d.line([(c + side * r * .3, c - r * 1.1), (c + side * r * .6, c - r * 1.55)], fill=ink, width=7)
        d.ellipse([c + side * r * .6 - 12, c - r * 1.55 - 12, c + side * r * .6 + 12, c - r * 1.55 + 12], fill=(246, 222, 92, 255), outline=ink, width=4)
    d.arc([c - r * .35, c + r * .15, c + r * .35, c + r * .6], 10, 170, fill=ink, width=7)
    layer = layer.rotate(rng.uniform(-8, 8), resample=Image.BICUBIC)
    for dx in (-W, 0, W):
        canvas.paste(layer, (int(cx - c + dx), int(cy - c)), layer)


def saucer(canvas, cx, cy, r):
    s = int(r * 3)
    layer = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = s / 2
    ink = (25, 35, 40, 255)
    d.ellipse([c - r * .45, c - r * .7, c + r * .45, c + r * .05], fill=(160, 220, 240, 255), outline=ink, width=6)
    d.ellipse([c - r, c - r * .2, c + r, c + r * .3], fill=(190, 196, 206, 255), outline=ink, width=7)
    for i in range(5):
        x = c - r * .7 + i * r * .35
        d.ellipse([x - 9, c - 2, x + 9, c + 16], fill=(246, 222, 92, 255), outline=ink, width=3)
    for i in range(3):
        d.line([(c + r * (1.1 + i * .25), c - r * .1 + i * 12), (c + r * (1.6 + i * .3), c - r * .1 + i * 12)], fill=ink, width=5)
    layer = layer.rotate(rng.uniform(-14, 14), resample=Image.BICUBIC)
    for dx in (-W, 0, W):
        canvas.paste(layer, (int(cx - c + dx), int(cy - c)), layer)


def history(canvas, words):
    """Years of older paint underneath: soft colour washes and faded pieces."""
    under = canvas.copy()
    wash = Image.new('L', canvas.size, 0)
    wd = ImageDraw.Draw(wash)
    for _ in range(14):
        x, y, r = rng.randrange(W), rng.randrange(BAND), rng.randrange(80, 220)
        colour = rng.choice(FILLS)[0]
        spot = Image.new('L', canvas.size, 0)
        ImageDraw.Draw(spot).ellipse([x - r * 1.6, y - r * .7, x + r * 1.6, y + r * .7], fill=255)
        spot = spot.filter(ImageFilter.GaussianBlur(40)).point(lambda v: v * .45)
        under.paste(colour, (0, 0), spot)
    for i, word in enumerate(words):
        throwup(under, word, (i + .5) * W / len(words), BAND * rng.uniform(.3, .7), rng.randrange(130, 170))
    return Image.blend(canvas, under, .5)


def chalk(canvas, n):
    d = ImageDraw.Draw(canvas)
    for _ in range(n):
        col = rng.choice([(236, 200, 220), (200, 230, 240), (240, 236, 190), (210, 240, 210)])
        x, y = rng.randrange(W), rng.randrange(BAND)
        pts = [(x + i * 14, y + 18 * math.sin(i * .9 + rng.random())) for i in range(rng.randrange(6, 20))]
        d.line(pts, fill=col, width=4)


def weather(band):
    """Fade the paint into the concrete; scuffs and wheel marks show through."""
    band = Image.blend(band, concrete(), .2)
    d = ImageDraw.Draw(band)
    for _ in range(2600):
        x, y = rng.randrange(W), rng.randrange(BAND)
        v = rng.randrange(140, 175)
        d.point((x, y), fill=(v, v, v - 4))
    for _ in range(60):
        x, y = rng.randrange(W), rng.randrange(int(BAND * .55), BAND)
        d.line([(x, y), (x + rng.randrange(60, 220), y + rng.randrange(-8, 8))], fill=(70, 70, 70), width=2)
    return band


def band_quarter():
    # East quarter and pocket bowl: the biggest wall, so the biggest pieces.
    b = history(concrete(), ['OLD', 'MOON', 'HOP', 'VIBE', 'LOOP'])
    for word, x in [('ZORP', .1), ('SAUCER', .48), ('BEEP', .86)]:
        throwup(b, word, x * W, BAND * rng.uniform(.42, .52), rng.randrange(165, 190))
    alien(b, W * .29, BAND * .5, 115)
    saucer(b, W * .68, BAND * .26, 100)
    for _ in range(12):
        tag(b, rng.choice(['zip', 'RC4', 'kbx', 'Oz', 'yo!', 'toot', 'dex']), rng.randrange(W), rng.randrange(BAND - 80), rng.randrange(38, 70))
    return weather(b)


def band_west():
    b = history(concrete(), ['DOT', 'MEW', 'FLY', 'OK', 'HUM'])
    for i, (word, x) in enumerate([('GRIND', .14), ('UFO', .43), ('RAD', .66), ('POP', .88)]):
        throwup(b, word, x * W, BAND * rng.uniform(.42, .52), rng.randrange(160, 190), font=BLOCK if i % 2 else BUBBLE)
    for _ in range(10):
        tag(b, rng.choice(['vroom', 'B-52', 'mx', 'hi', 'skate!', 'RC']), rng.randrange(W), rng.randrange(BAND - 80), rng.randrange(36, 64))
    chalk(b, 10)
    return weather(b)


def band_manual():
    # Low pad sides stretch tall art; keep to tags, stickers and chalk.
    b = concrete()
    for _ in range(22):
        tag(b, rng.choice(['zoom', 'rc', 'xo', 'AJ', 'go!', 'ufo', 'pow']), rng.randrange(W), rng.randrange(40, BAND - 140), rng.randrange(60, 110), font=rng.choice([TAG, BLOCK]))
    d = ImageDraw.Draw(b)
    for _ in range(10):
        x, y = rng.randrange(W), rng.randrange(BAND)
        col = rng.choice([(240, 80, 120), (60, 160, 220), (250, 220, 80), (250, 250, 250)])
        d.rectangle([x, y, x + rng.randrange(30, 70), y + rng.randrange(20, 50)], fill=col)
    chalk(b, 18)
    return weather(b)


def band_central():
    b = history(concrete(), ['WOW', 'HEY', 'SUN'])
    throwup(b, 'ZAP', W * .18, BAND * .5, 240, font=BUBBLE)
    throwup(b, 'SKATE', W * .52, BAND * .48, 200, font=BLOCK)
    saucer(b, W * .82, BAND * .45, 105)
    for _ in range(7):
        tag(b, rng.choice(['lol', 'C3', 'boing', 'yay']), rng.randrange(W), rng.randrange(BAND - 80), rng.randrange(36, 60))
    chalk(b, 22)
    return weather(b)


atlas = Image.new('RGB', (W, BAND * 4))
for row, make in enumerate([band_central, band_manual, band_west, band_quarter]):
    atlas.paste(make(), (0, row * BAND))
atlas.save(OUT.with_suffix('.png'), optimize=True)
atlas.resize((1536, 1536), Image.LANCZOS).save(OUT.with_suffix('.webp'), quality=84, method=6)
print('wrote', OUT.with_suffix('.png'), OUT.with_suffix('.webp'))
