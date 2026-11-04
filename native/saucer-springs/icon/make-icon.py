# Saucer Springs app icon from a real ray-traced render of the game's car (native --shot).
# Full-bleed square artwork: current macOS applies its own rounded mask, and adding our own
# padding or corners makes it put the icon inside a grey frame.
# Usage: python3 make-icon.py hero.png out.png
import sys
from PIL import Image, ImageEnhance, ImageDraw, ImageFilter
src = Image.open(sys.argv[1]).convert('RGB'); w, h = src.size
# Crop toward the car (the middle three-quarter hero shot), then grade for small sizes.
box = (int(w * .14), int(h * .12), int(w * .90), int(h * .88)); art = src.crop(box).resize((1024, 1024), Image.LANCZOS)
art = ImageEnhance.Contrast(art).enhance(1.12); art = ImageEnhance.Color(art).enhance(1.18)
vig = Image.new('L', (1024, 1024), 0); ImageDraw.Draw(vig).ellipse((-180, -140, 1204, 1250), fill=255); vig = vig.filter(ImageFilter.GaussianBlur(120))
dark = Image.new('RGB', (1024, 1024), (16, 18, 28)); art = Image.composite(art, dark, vig.point(lambda v: int(70 + v * 185 / 255)))
art.save(sys.argv[2])
