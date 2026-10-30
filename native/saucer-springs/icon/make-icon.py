# Saucer Springs launcher icon: a saucer beaming up an orange RC buggy over a desert mesa at dusk.
# Usage: python3 make-icon.py out.png   (1024 px, macOS rounded-square mask)
import sys, math, random
from PIL import Image, ImageDraw, ImageFilter
S = 2048
img = Image.new('RGBA', (S, S))
px = img.load()
top, mid, low = (34, 22, 74), (122, 52, 120), (252, 150, 72)
for y in range(S):
    t = y / S
    c = [int(top[i] + (mid[i] - top[i]) * min(1, t / .55)) if t < .55 else int(mid[i] + (low[i] - mid[i]) * (t - .55) / .3) for i in range(3)]
    c = [max(0, min(255, v)) for v in c]
    for x in range(S): px[x, y] = (*c, 255)
d = ImageDraw.Draw(img)
random.seed(4)
for _ in range(90):
    x, y, r = random.randrange(S), random.randrange(int(S * .5)), random.choice([3, 4, 5, 7])
    d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 245, 220, random.randrange(120, 255)))
# Mesas and desert floor.
d.polygon([(0, 1400), (260, 1380), (330, 1250), (700, 1240), (760, 1390), (1250, 1400), (1330, 1300), (1620, 1290), (1700, 1410), (2048, 1420), (2048, 2048), (0, 2048)], fill=(92, 44, 60))
d.rectangle((0, 1560, S, S), fill=(214, 128, 70))
d.polygon([(0, 1500), (2048, 1470), (2048, 1600), (0, 1640)], fill=(176, 92, 66))
# Tractor beam.
beam = Image.new('RGBA', (S, S), (0, 0, 0, 0)); bd = ImageDraw.Draw(beam)
bd.polygon([(860, 820), (1188, 820), (1480, 1760), (568, 1760)], fill=(140, 255, 170, 120))
beam = beam.filter(ImageFilter.GaussianBlur(30)); img.alpha_composite(beam)
# Buggy floating in the beam: wedge body, cockpit, fat wheels, a jet tail.
car = Image.new('RGBA', (S, S), (0, 0, 0, 0)); cd = ImageDraw.Draw(car)
cx, cy = 1024, 1420
for wx in (-300, 300):
    cd.ellipse((cx + wx - 150, cy - 40, cx + wx + 150, cy + 260), fill=(26, 26, 32))
    cd.ellipse((cx + wx - 70, cy + 40, cx + wx + 70, cy + 180), fill=(200, 200, 210))
cd.polygon([(cx - 470, cy + 60), (cx - 380, cy - 60), (cx + 330, cy - 120), (cx + 470, cy - 20), (cx + 460, cy + 90), (cx - 450, cy + 120)], fill=(244, 128, 34))
cd.polygon([(cx - 380, cy - 60), (cx + 330, cy - 120), (cx + 300, cy - 70), (cx - 360, cy - 10)], fill=(255, 176, 90))
cd.polygon([(cx - 120, cy - 70), (cx + 40, cy - 230), (cx + 230, cy - 230), (cx + 260, cy - 100)], fill=(30, 40, 54))
cd.polygon([(cx - 440, cy - 40), (cx - 520, cy - 300), (cx - 400, cy - 300), (cx - 330, cy - 60)], fill=(214, 96, 22))
car = car.rotate(8, center=(cx, cy), resample=Image.BICUBIC); img.alpha_composite(car)
# The saucer: glow, rim, hull, dome, lights.
glow = Image.new('RGBA', (S, S), (0, 0, 0, 0)); gd = ImageDraw.Draw(glow)
gd.ellipse((420, 560, 1628, 980), fill=(160, 255, 190, 150)); glow = glow.filter(ImageFilter.GaussianBlur(60)); img.alpha_composite(glow)
d = ImageDraw.Draw(img)
d.ellipse((400, 640, 1648, 900), fill=(120, 132, 150))
d.ellipse((420, 610, 1628, 850), fill=(206, 214, 226))
d.ellipse((720, 420, 1328, 780), fill=(150, 236, 255))
d.ellipse((800, 450, 1050, 600), fill=(225, 252, 255))
for i in range(9):
    a = math.pi * (i + .5) / 9
    x, y = 1024 - math.cos(a) * 560, 790 + math.sin(a) * 60
    d.ellipse((x - 34, y - 34, x + 34, y + 34), fill=(255, 226, 90) if i % 2 else (120, 255, 160))
img = img.resize((1024, 1024), Image.LANCZOS)
# macOS app icon grid: 824 px rounded square inside the 1024 canvas, with a soft shadow.
mask = Image.new('L', (1024, 1024), 0); ImageDraw.Draw(mask).rounded_rectangle((100, 100, 924, 924), radius=185, fill=255)
art = img.resize((824, 824), Image.LANCZOS); canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
shadow = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)); ImageDraw.Draw(shadow).rounded_rectangle((100, 112, 924, 936), radius=185, fill=(0, 0, 0, 110))
canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))
layer = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)); layer.paste(art, (100, 100)); layer.putalpha(Image.composite(layer.getchannel('A'), mask, mask))
canvas.alpha_composite(layer)
canvas.save(sys.argv[1])
