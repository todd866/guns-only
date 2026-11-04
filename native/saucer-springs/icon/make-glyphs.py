# Saucer Springs icon layers for Icon Composer (AppIcon.icon): bold shapes that survive 32 px.
# Each layer is a transparent 1024² PNG; macOS supplies the squircle, glass and lighting.
from PIL import Image, ImageDraw, ImageFilter
import math
S = 1024
def layer(): return Image.new('RGBA', (S, S), (0, 0, 0, 0))
# Beam: a warm, soft trapezoid from under the saucer to the ground.
beam = layer(); d = ImageDraw.Draw(beam)
d.polygon([(400, 470), (624, 470), (790, 905), (234, 905)], fill=(255, 214, 120, 150)); beam = beam.filter(ImageFilter.GaussianBlur(6))
beam.save('AppIcon.icon/Assets/beam.png')
# Saucer: a big silver disc with a dark rim, cyan dome, and five lights.
sau = layer(); d = ImageDraw.Draw(sau)
d.ellipse((120, 330, 904, 560), fill=(90, 98, 116, 255))           # rim shadow
d.ellipse((120, 300, 904, 520), fill=(214, 222, 234, 255))          # disc
d.ellipse((330, 170, 694, 420), fill=(110, 226, 255, 255))          # dome
d.ellipse((390, 200, 520, 290), fill=(220, 250, 255, 255))          # dome highlight
for i, x in enumerate((215, 360, 512, 664, 809)):
    y = 452 if i in (0, 4) else 478
    d.ellipse((x - 34, y - 34, x + 34, y + 34), fill=(255, 196, 40, 255) if i % 2 else (120, 255, 150, 255))
sau.save('AppIcon.icon/Assets/saucer.png')
# The RC buggy: orange wedge body, dark cockpit, two fat wheels; side view, nose right.
car = layer(); d = ImageDraw.Draw(car)
for cx in (370, 680):
    d.ellipse((cx - 105, 735, cx + 105, 945), fill=(24, 24, 30, 255)); d.ellipse((cx - 44, 796, cx + 44, 884), fill=(205, 210, 220, 255))
d.polygon([(230, 820), (290, 720), (700, 690), (830, 760), (820, 830), (240, 850)], fill=(246, 128, 30, 255))
d.polygon([(470, 705), (560, 610), (680, 612), (700, 694)], fill=(32, 40, 56, 255))
d.polygon([(250, 735), (215, 600), (300, 600), (340, 725)], fill=(214, 96, 20, 255))  # tail fin
car.save('AppIcon.icon/Assets/buggy.png')
