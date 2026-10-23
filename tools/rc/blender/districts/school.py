"""Saucer Springs AFB district 3: Saucer Springs Elementary (fictional).

Run (shared machine: wrap in heavy-slot, two threads):
  HEAVY_SLOT_LABEL=area51 heavy-slot -- /Applications/Blender.app/Contents/MacOS/Blender --background \
    --factory-startup --threads 2 --python tools/rc/blender/districts/school.py -- \
    --out web/wwwroot/rc/assets/districts [--render evidence/area51/school]
  ... --python tools/rc/blender/districts/school.py -- --out DIR --render-only --render evidence/area51/school

A fictional DoDEA-style on-base elementary school with Nellis-desert flavour: tan stucco outside,
painted block inside, waxed vinyl tile in the halls, a polished maple gym, shade sails over a
rubber-mulch playground. Every name and mark is invented; section B of
docs/research/area51-usaf-nellis-vegas-references.md is respected (no DoDEA, USAF or unit marks,
no real brands). "Month of the Military Child" (April, purple) is a real, generic tradition.

Layout (Blender metres, +Z up, X east, Y north; real scale; toy car 0.42 m long):
  lobby + front office  x   4 .. 26, y  0 .. 14     start/finish, trophy case
  north hallway         x 9.8 .. 14.2, y 14 .. 70.2  lockers, kid art, PCS GOODBYE card wall
  science room          x 14.2 .. 26, y 36 .. 48     drive-through pocket, DESERT PLANTS exhibit (specimen)
  library               x -10 .. 9.8, y 30 .. 65.8   shortcut: diagonal under a hanging model F-16
  west hallway          x -10 .. 9.8, y 65.8 .. 70.2
  gym                   x -50 .. -10, y 40 .. 74     gymfloor (slippery), parachute, folded bleachers
  cafeteria             x -50 .. -10, y 0 .. 39.7    a tunnel of long folding tables
  playground            x -54 .. 2, y -46 .. 0       rubber mulch, racing slide jump, monkey bars, sandbox
  front walk            x 2 .. 30, y -46 .. 0        flagpole plaza, school bus, entrance canopy

Lap (~330 m): lobby north -> locker hallway -> west hallway -> gym (west, south, east) -> through
the cafeteria under six folding tables -> out the doors -> down the playground over the racing
slide (a tabletop: up the slide, across the deck, down a rubber berm) -> east under the monkey
bars -> through the fence gate -> round the flagpole plaza -> in the front doors.

Shortcut: from the north hallway into the library and diagonally across it to the west hallway,
under the hanging model F-16. ~40 m instead of ~52 m; no gate sits in the skipped section.

Kid rules: every floor is flush (z = 0, collision slabs abut); every lane on the lap has >= 3 m
clear; everything standing on the floor is >= 0.3 m tall (a wall, never a wheel trap); the only
ramps (slide, berm, the tot-lot hill) have sloped or railed sides; overhead things (tables,
monkey bars, banners, the F-16) are wholly above 0.6 m.
"""
import argparse
import math
import random
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C   # noqa: E402
from common import (vis, marker, box, aabb, beam, cylinder, annulus, torus, ico, frustum,  # noqa: E402
                    polygon_slab, transform, grid_region, hexa, text2d, place_flat)

REPO = Path(__file__).resolve().parents[4]
TOY_CLEAR = .45

C.PALETTE.update({
    'vct': ('#E4DCC6', 0, .3), 'gym': ('#D9A35F', 0, .14), 'carpet': ('#3E6FA3', 0, .98),
    'ceiling': ('#ECE8DC', 0, .9), 'troffer': ('#FFF9EE', 0, .4), 'wall': ('#EFE6CF', 0, .9),
    'stucco': ('#E0C08F', 0, .92), 'blue': ('#2F6FD0', 0, .45), 'red': ('#D23A2F', 0, .5),
    'yellow': ('#F2C230', 0, .45), 'green': ('#3FA34D', 0, .55), 'purple': ('#7B3FB0', 0, .55),
    'white': ('#F6F4EE', 0, .6), 'black': ('#1E1E22', 0, .55), 'steel': ('#B8BCC0', .7, .32),
    'wood': ('#B07A45', 0, .6), 'rubber': ('#9A4636', 0, .95), 'sand': ('#E3CF9E', 0, .97),
    'concrete': ('#B3AA98', 0, .9), 'glass': ('#A9D3E6', .1, .12), 'orange': ('#F07A2A', 0, .5),
    'navy': ('#1C2A52', 0, .5), 'teal': ('#2AA6A0', 0, .5), 'grey': ('#6E6E70', 0, .7),
})

# Interior lighting as in bx.py: the game sun is shadowed by the ceilings, so materials carry a
# warm self-illumination of a fraction of their own albedo; troffers glow. Materials only seen
# outdoors (in the desert sun) get a little, so the playground does not wash out.
EMISSION = {'troffer': 1.0, 'ceiling': .78, 'glass': .85, 'stucco': .12, 'rubber': .14, 'sand': .12, 'concrete': .15}
EMISSION_DEFAULT = .5
WARM = (1.0, .95, .86)
RNG = random.Random(51.5)
SOLIDS = []          # (label, x0, x1, y0, y1, zmin, zmax)
RAMPS = set()        # collision labels that are driven on (not obstacles for the half-width scan)


def col(surface, label, part, extras=None, ramp=False):
    o = C.col(surface, label, part, extras)
    vs = part[0] if not isinstance(part, C.Geo) else part.v
    xs, ys, zs = [p[0] for p in vs], [p[1] for p in vs], [p[2] for p in vs]
    SOLIDS.append((o.name, min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)))
    if ramp:
        RAMPS.add(o.name)
    return o


# ---------------------------------------------------------------- the lap

CORNERS = [(12, 68), (-42, 68), (-42, 50), (-26, 50), (-26, -38), (24, -38), (24, -22), (12, -22)]
RADII = [5, 6, 6, 6, 6, 5.5, 5, 5]
ROUTE = C.Route(CORNERS, RADII)
ROUTE.d0 = ROUTE.nearest((12, 10))
GATES = [(12, 10), (12, 24), (-14, 68), (-42, 59), (-34, 50), (-26, 37.6), (-26, 6), (-26, -27), (-6, -38), (12, -9)]

# The racing slide on the playground's south leg (x = -26, driven southward, i.e. toward -Y):
# up the slide (tile: slick plastic), across the deck (wood), down a rubber berm.
SL = {'x': -26, 'y0': -12.0, 'y1': -14.6, 'y2': -16.6, 'y3': -21.6, 'h': .5, 'half': 1.7, 'flank': .9}


def slide_z(x, y):
    """Driven surface height of the slide region (0 elsewhere)."""
    if abs(x - SL['x']) > SL['half'] + SL['flank'] or not (SL['y3'] <= y <= SL['y0']):
        return 0.0
    if abs(x - SL['x']) <= SL['half'] and y >= SL['y1']:
        return SL['h'] * (SL['y0'] - y) / (SL['y0'] - SL['y1'])
    if abs(x - SL['x']) <= SL['half'] and y >= SL['y2']:
        return SL['h']
    if y < SL['y2']:
        t = (y - SL['y3']) / (SL['y2'] - SL['y3'])
        top = SL['h'] * t
        a = SL['half'] * t + (SL['half'] + SL['flank']) * (1 - t)         # top half width at this y
        d = abs(x - SL['x'])
        if d <= a:
            return top
        b = SL['half'] + SL['flank']
        return max(0.0, top * (b - d) / max(b - a, 1e-6))
    return 0.0


def ground_z(x, y):
    return slide_z(x, y)


# ---------------------------------------------------------------- small helpers

def panel(group, mat, c, facing, w, h, z0, out=0.0, dx=0.0):
    """Vertical rectangle (one quad) centred at c, front face toward `facing` degrees."""
    a = math.radians(facing)
    n = (math.cos(a), math.sin(a))
    r = (-n[1], n[0])
    cx, cy = c[0] + n[0] * out + r[0] * dx, c[1] + n[1] * out + r[1] * dx
    v = [(cx - r[0] * w / 2, cy - r[1] * w / 2, z0), (cx + r[0] * w / 2, cy + r[1] * w / 2, z0),
         (cx + r[0] * w / 2, cy + r[1] * w / 2, z0 + h), (cx - r[0] * w / 2, cy - r[1] * w / 2, z0 + h)]
    vis(group, mat).add((v, [(0, 1, 2, 3)]), kind='flag')


def flat_up(group, mat, x0, x1, y0, y1, z):
    vis(group, mat).add(([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [(0, 1, 2, 3)]), kind='up')


def flat_down(group, mat, x0, x1, y0, y1, z):
    vis(group, mat).add(([(x0, y0, z), (x0, y1, z), (x1, y1, z), (x1, y0, z)], [(0, 1, 2, 3)]), kind='flag')


def disc_up(group, mat, cx, cy, r, z, n=24, a0=0.0, a1=2 * math.pi):
    pts = [(cx + r * math.cos(a0 + (a1 - a0) * k / n), cy + r * math.sin(a0 + (a1 - a0) * k / n), z) for k in range(n + 1)]
    v = [(cx, cy, z)] + pts
    vis(group, mat).add((v, [(0, k, k + 1) for k in range(1, n + 1)]), kind='up')


def ring_up(group, mat, cx, cy, r0, r1, z, n=32):
    v = []
    for k in range(n):
        a = 2 * math.pi * k / n
        v += [(cx + r0 * math.cos(a), cy + r0 * math.sin(a), z), (cx + r1 * math.cos(a), cy + r1 * math.sin(a), z)]
    vis(group, mat).add((v, [(2 * k, 2 * ((k + 1) % n), 2 * ((k + 1) % n) + 1, 2 * k + 1) for k in range(n)]), kind='up')


def words(mat, body, size, centre, facing, max_w=None, bold=.02, out=.01, group='decal'):
    v, f, w = text2d(body, size, bold=bold)
    sc = min(1.0, max_w / w) if max_w and w else 1.0
    vis(group, mat).add(place_flat(v, f, centre, facing, out=out, scale=sc), kind='flag')


def floor_words(mat, body, size, cx, cy, heading_deg, max_w=None, z=.003):
    """Lettering painted on the floor, reading along heading_deg (world XY)."""
    v, f, w = text2d(body, size, bold=.02)
    sc = min(1.0, max_w / w) if max_w and w else 1.0
    a = math.radians(heading_deg)
    ux, uy, vx, vy = math.cos(a), math.sin(a), -math.sin(a), math.cos(a)
    verts = [(cx + (x * ux + y * vx) * sc, cy + (x * uy + y * vy) * sc, z) for x, y in v]
    vis('decal', mat).add((verts, f), kind='up')


def hanging_banner(cx, cy, facing, w, h, z0, lines, board, both=True, cords=True, ceiling=3.0):
    """Ceiling-hung banner (overhead, no collision)."""
    yaw = math.radians(facing + 90)
    vis('signs', board).add(box(cx, cy, z0, w, .03, h, yaw))
    zc = z0 + h / 2
    for text, size, mat, dz in lines:
        for f in ((facing, facing + 180) if both else (facing,)):
            words(mat, text, size, (cx, cy, zc + dz), f, max_w=w * .92, out=.02)
    if cords:
        a = math.radians(facing)
        r = (-math.sin(a), math.cos(a))
        for k in (-w * .4, w * .4):
            vis('signs', 'steel').add(cylinder((cx + r[0] * k, cy + r[1] * k, z0 + h), .008, ceiling - z0 - h, 4))


def jet_silhouette(group, mat, c, facing, s, z, out=.004):
    """Flat side view of a generic jet (a kid's drawing), front face toward `facing`."""
    pts = [(0, 0), (-.9, -.12), (-1.1, -.5), (-1.5, -.5), (-1.45, -.1), (-1.9, -.1), (-2.1, -.3), (-2.3, -.3), (-2.2, 0),
           (-2.3, .3), (-2.1, .3), (-1.9, .1), (-1.45, .1), (-1.5, .5), (-1.1, .5), (-.9, .12)]
    v2 = [((-p[0] - 1.15) * s, p[1] * s * 1.4) for p in pts]
    verts, faces = place_flat(v2, [tuple(range(len(v2)))], (c[0], c[1], z), facing, out=out)
    vis(group, mat).add((verts, faces), kind='flag')


# ---------------------------------------------------------------- floors

def poly_inside(poly):
    def f(p):
        n, ok = len(poly), True
        for i in range(n):
            a, b = poly[i], poly[(i + 1) % n]
            if (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) < -1e-9:
                ok = False
        return ok
    return f


def poly_project(poly):
    def f(p):
        best, bd = p, 1e9
        n = len(poly)
        for i in range(n):
            a, b = poly[i], poly[(i + 1) % n]
            dx, dy = b[0] - a[0], b[1] - a[1]
            t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
            q = (a[0] + dx * t, a[1] + dy * t)
            d = math.dist(p, q)
            if d < bd:
                best, bd = q, d
        return best
    return f


def floor_poly(label, poly, surface, mat, cell=1.0):
    """Convex floor region: clipped visual grid (AO density) and a 30 cm collision slab."""
    xs, ys = [p[0] for p in poly], [p[1] for p in poly]
    vis('floor', mat).add(grid_region(min(xs), max(xs), min(ys), max(ys), cell, poly_inside(poly), poly_project(poly), 0.0), kind='up')
    col(surface, label, polygon_slab(poly, -.3, 0))


def floor_rect(label, x0, x1, y0, y1, surface, mat, cell=1.0):
    floor_poly(label, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], surface, mat, cell)


CHAMFER = [(9.8, 60.8), (4.8, 65.8)]      # library NE corner: opens the hallway L for a 5 m line radius


def floors():
    floor_rect('lobby', 4, 26, 0, 14, 'tile', 'vct')
    floor_rect('hall_n', 9.8, 14.2, 14, 70.2, 'tile', 'vct')
    floor_rect('hall_w', -10, 9.8, 65.8, 70.2, 'tile', 'vct')
    floor_poly('hall_corner', [CHAMFER[0], (9.8, 65.8), CHAMFER[1]], 'tile', 'vct', .5)
    floor_rect('science', 14.2, 26, 36, 48, 'tile', 'vct')
    floor_poly('library', [(-10, 30), (9.8, 30), CHAMFER[0], CHAMFER[1], (-10, 65.8)], 'carpet', 'carpet')
    floor_rect('gym', -50, -10, 40, 74, 'gymfloor', 'gym')
    floor_rect('cafeteria', -50, -10, 0, 40, 'tile', 'vct')
    # Outdoors (flush with the indoor floors at y = 0).
    floor_rect('apron', -54, 2, -5, 0, 'concrete', 'concrete')
    floor_rect('pg_west', -54, -44, -46, -5, 'concrete', 'concrete')
    floor_rect('pg_south', -44, -8, -46, -43, 'concrete', 'concrete')
    floor_rect('mulch', -44, -8, -43, -5, 'rubber', 'rubber')
    floor_rect('pg_east', -8, 2, -41, -5, 'concrete', 'concrete')
    floor_rect('pg_se_w', -8, -6, -46, -41, 'concrete', 'concrete')
    floor_rect('sandbox', -6, 0, -45, -41, 'dirt', 'sand', .5)
    floor_rect('pg_se_s', -6, 0, -46, -45, 'concrete', 'concrete')
    floor_rect('pg_se_e', 0, 2, -46, -41, 'concrete', 'concrete')
    floor_rect('front', 2, 30, -46, 0, 'concrete', 'concrete')
    # Floor finishes (paint-thin, visual only). VCT: 12-inch tile joints in the halls and lobby.
    for x0, x1, y0, y1 in ((4, 26, 0, 14), (9.8, 14.2, 14, 70.2), (-10, 9.8, 65.8, 70.2), (14.2, 26, 36, 48)):
        x = math.ceil(x0 / .61) * .61
        while x < x1:
            flat_up('decal', 'white', x - .004, x + .004, y0, y1, .0012)
            x += .61
        y = math.ceil(y0 / .61) * .61
        while y < y1:
            flat_up('decal', 'white', x0, x1, y - .004, y + .004, .0012)
            y += .61
    # Accent tile stripe down the hallway (classic school VCT: a coloured border line).
    for xs in (10.6, 13.4):
        flat_up('decal', 'blue', xs - .15, xs + .15, 14.3, 65.5, .002)
    flat_up('decal', 'blue', -9.5, 9.5, 66.45, 66.75, .002)
    flat_up('decal', 'blue', -9.5, 9.5, 69.25, 69.55, .002)
    # Cafeteria: big chequer of cream and red tiles.
    for i in range(-50, -10, 3):
        for j in range(0, 39, 3):
            if (i // 3 + j // 3) % 2 == 0:
                flat_up('decal', 'red', i + .02, i + 2.98, j + .02, j + 2.98, .0012)
    # Walk-off mats at the front doors and the cafeteria exit.
    for x0, x1, y0, y1 in ((9.6, 14.4, .3, 2.6), (-28.4, -23.6, .3, 2.4)):
        flat_up('decal', 'grey', x0, x1, y0, y1, .004)
        flat_up('decal', 'black', x0 + .15, x1 - .15, y0 + .15, y1 - .15, .005)


# ---------------------------------------------------------------- walls, ceilings

def wall(label, x0, x1, y0, y1, h, mat='wall', base=True, collide=True, surface='concrete', outside=None):
    """Box wall. outside = (facing_deg, face_coord) paints the exterior face stucco."""
    vis('walls', mat).add(aabb(x0, x1, y0, y1, 0, h))
    if base and mat == 'wall':
        vis('walls', 'grey').add(aabb(x0 - .015, x1 + .015, y0 - .015, y1 + .015, 0, .1))
    if collide:
        col(surface, label, aabb(x0, x1, y0, y1, -.3, h))
    if outside is not None:
        f, at = outside
        if f in (90, 270):      # face normal +-Y
            panel('walls', 'stucco', ((x0 + x1) / 2, at), f, x1 - x0, h, 0, out=.004)
        else:
            panel('walls', 'stucco', (at, (y0 + y1) / 2), f, y1 - y0, h, 0, out=.004)


def wall_x(label, x0, x1, y0, y1, h, gaps=(), header=None, **kw):
    """Wall running along X from x0 to x1 (thickness y0..y1) with door gaps [(a, b)]; a header
    fills each gap from `header` up to h (visual only: it is overhead)."""
    xs = [x0]
    for a, b in sorted(gaps):
        xs += [a, b]
    xs.append(x1)
    for i in range(0, len(xs), 2):
        if xs[i + 1] - xs[i] > .01:
            wall(f'{label}_{i // 2}', xs[i], xs[i + 1], y0, y1, h, **kw)
    if header is not None:
        for a, b in gaps:
            vis('walls', kw.get('mat', 'wall')).add(aabb(a, b, y0, y1, header, h))


def wall_y(label, x0, x1, y0, y1, h, gaps=(), header=None, **kw):
    ys = [y0]
    for a, b in sorted(gaps):
        ys += [a, b]
    ys.append(y1)
    for i in range(0, len(ys), 2):
        if ys[i + 1] - ys[i] > .01:
            wall(f'{label}_{i // 2}', x0, x1, ys[i], ys[i + 1], h, **kw)
    if header is not None:
        for a, b in gaps:
            vis('walls', kw.get('mat', 'wall')).add(aabb(x0, x1, a, b, header, h))


DOOR_H = 2.6
FRONT_GAP = (9.8, 14.2)
CAFE_EXIT = (-28.2, -23.8)
CAFE_DOOR = (-28.2, -23.8)
LIB_DOOR_E = (32.0, 35.4)
LIB_DOOR_N = (-6.1, -2.5)
SCI_DOORS = ((37.0, 40.4), (43.6, 47.0))


def shell():
    t = .3
    # Exterior: south facade (stucco outside), west, north, east.
    for i, (x0, x1) in enumerate(((-50.3, CAFE_EXIT[0]), (CAFE_EXIT[1], 4), (26, 26.3))):
        wall(f'facade_s_{i}', x0, x1, -t, 0, 4.4, outside=(270, -t))
    for x0, x1 in (CAFE_EXIT,):
        vis('walls', 'wall').add(aabb(x0, x1, -t, 0, DOOR_H, 4.4))
        panel('walls', 'stucco', ((x0 + x1) / 2, -t), 270, x1 - x0, 4.4 - DOOR_H, DOOR_H, out=.004)
    # Lobby storefront: low wall, glass, mullions, transom; the front door gap in the middle.
    for i, (x0, x1) in enumerate(((4, FRONT_GAP[0]), (FRONT_GAP[1], 26))):
        col('concrete', f'storefront_{i}', aabb(x0, x1, -t, 0, -.3, 3.6))
        vis('walls', 'grey').add(aabb(x0, x1, -t, 0, 0, .45))
        vis('walls', 'glass').add(aabb(x0, x1, -.2, -.1, .45, 2.9))
        x = x0
        while x <= x1 + .01:
            vis('walls', 'steel').add(aabb(x - .05, x + .05, -.24, -.06, .45, 2.9))
            x += 1.6
    vis('walls', 'steel').add(aabb(4, 26, -.24, -.06, 2.9, 3.0))
    vis('walls', 'wall').add(aabb(4, 26, -t, 0, 3.0, 4.4))
    panel('walls', 'stucco', (15, -t), 270, 22, 1.4, 3.0, out=.004)
    for xd in (FRONT_GAP[0] + .05, FRONT_GAP[1] - .05):      # door frames (doors propped open, inside)
        vis('walls', 'steel').add(aabb(xd - .06, xd + .06, -t, 0, 0, 2.9))
    wall_y('facade_w', -50.3, -50, 0, 74.3, 7.4, outside=(180, -50.3))
    wall_x('facade_n', -50.3, 26.3, 74, 74.3, 7.4, outside=(90, 74.3))
    wall_y('facade_e', 26, 26.3, 0, 74, 4.4, outside=(0, 26.3))
    # Interior partitions (painted block, both sides).
    wall_y('lobby_w', 3.7, 4, 0, 14, 3.6)
    wall_x('lobby_n', 4, 26, 14, 14.3, 3.6, gaps=[(9.8, 14.2)], header=3.0)
    wall_y('hall_w', 9.5, 9.8, 14.3, CHAMFER[0][1], 3.6, gaps=[LIB_DOOR_E], header=DOOR_H)
    wall_y('hall_e', 14.2, 14.5, 14.3, 70.5, 3.6, gaps=list(SCI_DOORS), header=DOOR_H)
    wall_x('hall_end', -10, 14.5, 70.2, 70.5, 3.6)
    # Library NE chamfer (a diagonal wall) and north wall with the shortcut door.
    (ax, ay), (bx, by) = CHAMFER
    vis('walls', 'wall').add(beam((ax - .15, ay + .15), (bx - .15, by + .15), .3, 0, 3.6))
    col('concrete', 'lib_chamfer', beam((ax - .15, ay + .15), (bx - .15, by + .15), .3, -.3, 3.6))
    wall_x('lib_n', -9.7, CHAMFER[1][0] - .2, 65.5, 65.8, 3.6, gaps=[LIB_DOOR_N], header=DOOR_H)
    wall_x('lib_s', -9.7, 9.5, 30, 30.3, 3.6)
    wall_y('cafe_e', -10, -9.7, 0, 40, 4.0)
    wall_y('gym_e', -10, -9.7, 40, 74, 7.4, gaps=[(65.8, 70.2)], header=3.0)
    wall_x('gym_s', -50, -10, 39.7, 40, 7.4, gaps=[CAFE_DOOR], header=3.0)
    wall_x('sci_s', 14.5, 26, 35.7, 36, 3.0)
    wall_x('sci_n', 14.5, 26, 48, 48.3, 3.0)
    # Window bands on the cafeteria south wall (inside + outside) and the gym's high clerestory.
    for x0 in range(-48, -10, 4):
        if CAFE_EXIT[0] - 1 < x0 + 1.5 < CAFE_EXIT[1] + 1:
            continue
        for f, y in ((90, 0), (270, -t)):
            panel('walls', 'glass', (x0 + 1.5, y), f, 2.6, 1.3, 1.1, out=.006)
            panel('walls', 'white', (x0 + 1.5, y), f, 2.8, 1.5, 1.0, out=.005)
    for y0 in range(42, 72, 5):
        panel('walls', 'glass', (-50, y0 + 2), 0, 3.6, 1.0, 5.6, out=.006)
        panel('walls', 'glass', (-50.3, y0 + 2), 180, 3.6, 1.0, 5.6, out=.006)


ROOMS = [  # (name, x0, x1, y0, y1, ceiling height)
    ('lobby', 4, 26, 0, 14, 3.6), ('hall_n', 9.8, 14.2, 14, 70.2, 3.0), ('hall_w', -10, 9.8, 65.8, 70.2, 3.0),
    ('science', 14.2, 26, 36, 48, 3.0), ('library', -10, 9.8, 30, 65.8, 3.6), ('cafeteria', -50, -10, 0, 40, 4.0),
]


def ceilings():
    for name, x0, x1, y0, y1, h in ROOMS:
        flat_down('decal', 'ceiling', x0, x1, y0, y1, h)
        x = math.ceil(x0 / .61) * .61                      # 2 x 2 ft T-bar grid
        while x < x1:
            flat_down('decal', 'steel', x - .012, x + .012, y0, y1, h - .004)
            x += .61
        y = math.ceil(y0 / .61) * .61
        while y < y1:
            flat_down('decal', 'steel', x0, x1, y - .012, y + .012, h - .004)
            y += .61
        px, py = (2.44, 2.44) if name != 'hall_n' else (2.2, 3.05)
        x = math.floor(x0 / px) * px + px / 2
        while x < x1 - .4:
            y = math.floor(y0 / py) * py + py / 2
            while y < y1 - .7:
                if x > x0 + .4 and y > y0 + .7:
                    flat_down('decal', 'troffer', x - .3, x + .3, y - .6, y + .6, h - .006)
                y += py
            x += px
    # Gym: open steel joists, a deck, round high-bay lights.
    flat_down('decal', 'ceiling', -50, -10, 40, 74, 7.0)
    for k in range(9):
        x = -48 + k * 4.75
        vis('decal', 'steel').add(aabb(x - .08, x + .08, 40, 74, 6.4, 6.98))
        for j in range(6):
            y = 43 + j * 5.6
            vis('decal', 'steel').add(cylinder((x + 2.37, y, 6.0), .015, 1.0, 4))
            vis('decal', 'troffer').add(cylinder((x + 2.37, y, 5.8), .32, .2, 14, smooth=False))


# ---------------------------------------------------------------- hallway furniture

def lockers(label, a, b, face_x, facing, colour='blue', h=1.8, depth=.38, axis='y'):
    """Run of hallway lockers against a wall at face_x, from a to b along the wall, doors facing."""
    sg = 1 if facing in (0, 90) else -1
    if axis == 'y':
        x0, x1 = sorted((face_x, face_x + sg * depth))
        vis('lockers', colour).add(aabb(x0, x1, a, b, .1, h))
        vis('lockers', 'grey').add(aabb(x0, x1, a, b, 0, .1))
        col('metal', label, aabb(x0, x1, a, b, -.3, h))
        front = face_x + sg * depth
        n = int((b - a) / .31)
        for k in range(n + 1):
            y = a + k * (b - a) / n
            panel('decal', 'black', (front, y), facing, .012, h - .14, .12, out=.004)
            if k < n:
                yc = y + (b - a) / n / 2
                for z in (h - .3, .3):
                    for j in range(3):
                        panel('decal', 'navy', (front, yc), facing, .16, .012, z + j * .035, out=.004)
                panel('decal', 'steel', (front, yc + .09), facing, .03, .12, 1.0, out=.006)
    else:
        y0, y1 = sorted((face_x, face_x + sg * depth))
        vis('lockers', colour).add(aabb(a, b, y0, y1, .1, h))
        vis('lockers', 'grey').add(aabb(a, b, y0, y1, 0, .1))
        col('metal', label, aabb(a, b, y0, y1, -.3, h))
        front = face_x + sg * depth
        n = int((b - a) / .31)
        for k in range(n + 1):
            x = a + k * (b - a) / n
            panel('decal', 'black', (x, front), facing, .012, h - .14, .12, out=.004)
            if k < n:
                xc = x + (b - a) / n / 2
                for z in (h - .3, .3):
                    for j in range(3):
                        panel('decal', 'navy', (xc, front), facing, .16, .012, z + j * .035, out=.004)
                panel('decal', 'steel', (xc - .09, front), facing, .03, .12, 1.0, out=.006)


def bulletin_board(cx, cy, facing, w, title, seed, jets=True):
    """Cork board with kid drawings (jets, suns, houses) and a paper title strip."""
    rng = random.Random(seed)
    panel('boards', 'wood', (cx, cy), facing, w, 1.2, 1.0, out=.006)
    panel('boards', 'yellow', (cx, cy), facing, w + .08, 1.28, .96, out=.005)
    words('navy', title, .1, (cx, cy, 2.06), facing, max_w=w * .9, out=.01)
    a = math.radians(facing)
    r = (-math.sin(a), math.cos(a))
    cols = max(2, int(w / .42))
    for k in range(cols):
        for j in range(2):
            u = -w / 2 + .25 + k * (w - .5) / max(1, cols - 1)
            z = 1.15 + j * .45
            p = (cx + r[0] * u, cy + r[1] * u)
            panel('boards', 'white', p, facing, .3, .38, z, out=.009)
            pick = rng.random()
            if jets and pick < .55:
                jet_silhouette('boards', rng.choice(['blue', 'red', 'grey', 'navy', 'purple']), p, facing, .08, z + .2, out=.011)
                disc_v = rng.choice(['yellow', 'orange'])
                panel('boards', disc_v, (p[0] + r[0] * .09, p[1] + r[1] * .09), facing, .06, .06, z + .3, out=.012)
            elif pick < .8:
                panel('boards', rng.choice(['red', 'green', 'teal']), p, facing, .16, .12, z + .06, out=.011)
                panel('boards', 'orange', p, facing, .2, .06, z + .18, out=.012)
                panel('boards', 'yellow', (p[0] - r[0] * .09, p[1] - r[1] * .09), facing, .06, .06, z + .3, out=.012)
            else:
                for q in range(3):
                    panel('boards', rng.choice(['purple', 'blue', 'green', 'red']), p, facing, .22, .015, z + .08 + q * .07, out=.011)


def door_closed(cx, cy, facing, label, h=2.2):
    """A closed classroom door with a narrow window and a room sign (decor on the wall)."""
    panel('doors', 'grey', (cx, cy), facing, 1.06, h + .06, 0, out=.006)
    panel('doors', 'wood', (cx, cy), facing, .92, h, 0, out=.012)
    panel('doors', 'glass', (cx, cy), facing, .12, .7, 1.2, out=.016, dx=.25)
    panel('doors', 'steel', (cx, cy), facing, .12, .03, 1.0, out=.018, dx=-.3)
    panel('doors', 'navy', (cx, cy), facing, .42, .2, 1.5, out=.006, dx=.82)
    words('white', label, .05, (cx, cy, 1.6), facing, max_w=.38, out=.012)


def hallways():
    # North hallway, west side (x = 9.8 face, doors face east).
    lockers('lk_nw_0', 15.0, 21.5, 9.8, 0)
    bulletin_board(9.81, 25.0, 0, 3.0, 'OUR HEROES FLY JETS!', 1)
    door_closed(9.81, 28.6, 0, 'ROOM 3 · 1ST GRADE')
    lockers('lk_nw_1', 36.2, 46.0, 9.8, 0)
    bulletin_board(9.81, 48.8, 0, 3.2, 'WHERE HAVE YOU LIVED?', 2, jets=False)
    lockers('lk_nw_2', 51.0, 59.5, 9.8, 0, colour='red')
    # East side (x = 14.2 face, doors face west).
    lockers('lk_ne_0', 15.0, 23.0, 14.2, 180)
    door_closed(14.19, 24.6, 180, 'ROOM 4 · 2ND GRADE')
    lockers('lk_ne_1', 26.0, 35.4, 14.2, 180)
    lockers('lk_ne_2', 48.6, 50.4, 14.2, 180, colour='red')
    door_closed(14.19, 65.0, 180, 'MUSIC · SHHH')
    # Science doors: a SCIENCE LAB sign between them, frames on the openings.
    vis('signs', 'green').add(aabb(14.15, 14.2, 41.1, 42.9, 1.9, 2.4))
    words('white', 'SCIENCE LAB', .14, (14.15, 42.0, 2.2), 180, max_w=1.7, out=.004)
    words('yellow', 'DESERT PLANTS →', .07, (14.15, 42.0, 2.0), 180, max_w=1.7, out=.004)
    for a, b in SCI_DOORS + (LIB_DOOR_E,):
        xw = 14.2 if (a, b) in SCI_DOORS else 9.8
        f = 180 if xw > 12 else 0
        for y in (a, b):
            vis('doors', 'grey').add(aabb(xw - .08 if f == 180 else xw - .02, xw + .02 if f == 180 else xw + .08, y - .06, y + .06, 0, DOOR_H))
    # PCS GOODBYE card wall: a paper banner and a grid of cards and envelopes.
    cx, f = 14.19, 180
    rng = random.Random(9)
    panel('cards', 'white', (cx, 55.5), f, 7.8, 1.35, .9, out=.006)
    words('white', 'PCS GOODBYE · WE WILL MISS YOU!', .17, (cx, 55.5, 2.48), f, max_w=7.6, out=.012)
    panel('cards', 'purple', (cx, 55.5), f, 7.8, .34, 2.31, out=.006)
    for k in range(18):
        for j in range(3):
            y = 52.0 + k * .4 + rng.uniform(-.04, .04)
            z = 1.0 + j * .42 + rng.uniform(-.03, .03)
            m = rng.choice(['red', 'blue', 'yellow', 'green', 'orange', 'teal', 'purple', 'white'])
            panel('cards', m, (cx, y), f, .3, .34, z, out=.01)
            if rng.random() < .4:
                panel('cards', 'navy', (cx, y), f, .2, .015, z + .2, out=.012)
                panel('cards', 'navy', (cx, y), f, .16, .015, z + .14, out=.012)
    for text, y, z in (('BYE MAX! GERMANY ROCKS', 53.6, 2.2), ('SEE YOU AT THE NEXT BASE', 57.6, 2.2), ('GOOD LUCK IN JAPAN, AVA', 55.5, .78)):
        words('navy', text, .06, (cx, y, z), f, max_w=2.2, out=.012)
    # West hallway lockers (north side faces south; library side faces north).
    lockers('lk_w_n0', -9.2, -1.2, 70.2, 270, axis='x')
    lockers('lk_w_n1', 1.6, 8.6, 70.2, 270, axis='x', colour='red')
    lockers('lk_w_s0', -1.0, 4.2, 65.8, 90, axis='x')
    # GYM signs over the gym opening, on both faces.
    for f, x in ((180, -10.02), (0, -9.68)):
        words('white', 'GYM', .32, (x, 68.0, 3.42), f, max_w=2, out=.004)
    vis('signs', 'red').add(aabb(-10.02, -9.68, 66.8, 69.2, 3.15, 3.7))
    words('navy', 'LIBRARY ↓', .12, (-4.3, 65.8, 2.75), 90, max_w=2, out=.004)
    words('navy', 'LIBRARY', .2, (9.8, 33.7, 2.85), 0, max_w=2.6, out=.004)
    # Banners across the halls (overhead).
    hanging_banner(12, 14.6, 270, 4.0, .5, 2.35, [('WELCOME BACK MILITARY KIDS!', .17, 'white', 0)], 'blue', ceiling=3.0)
    hanging_banner(12, 44.0, 270, 4.0, .55, 2.3, [('MONTH OF THE MILITARY CHILD', .14, 'white', .1), ('APRIL · PURPLE UP!', .1, 'yellow', -.13)],
                   'purple', ceiling=3.0)
    hanging_banner(-24, 68.0, 0, 4.0, .55, 4.6, [('HOME OF THE ROCKETS', .2, 'white', 0)], 'navy', ceiling=7.0)
    # Water fountain and an extinguisher cabinet (wall-mounted, above toy height: decor only).
    vis('props', 'steel').add(aabb(14.0, 14.2, 62.2, 62.8, .75, .95))
    vis('props', 'red').add(aabb(9.8, 9.9, 62.5, 62.9, 1.2, 1.7))
    for y in (24.0, 50.6):
        words('red', 'EXIT', .1, (9.81 if y < 30 else 14.19, y, 2.75), 0 if y < 30 else 180, max_w=.5, out=.004)


# ---------------------------------------------------------------- lobby and front office

def lobby():
    # START · FINISH chequer across the lobby and a banner.
    for row in range(2):
        for k in range(9):
            x = 9.8 + k * .49
            vis('decal', 'white' if (row + k) % 2 else 'black').add(aabb(x, x + .49, 9.75 + row * .25, 10.0 + row * .25, .003, .006))
    hanging_banner(12, 10.0, 270, 4.2, .45, 2.95, [('START · FINISH', .22, 'navy', 0)], 'yellow', ceiling=3.6)
    # Rocket floor emblem.
    disc_up('decal', 'navy', 12, 5.2, 1.6, .0025, 32)
    ring_up('decal', 'yellow', 12, 5.2, 1.6, 1.75, .0026)
    floor_words('white', 'ROCKETS', .42, 12, 4.7, 0, max_w=2.6, z=.0035)
    rocket_shape('decal', 12, 5.85, .0035, .6, up=True)
    # Trophy case on the west wall.
    x0 = 4.0
    vis('trophy', 'wood').add(aabb(x0, x0 + .55, 3.0, 11.0, 0, .9))
    vis('trophy', 'glass').add(aabb(x0 + .5, x0 + .55, 3.05, 10.95, .9, 2.1))
    vis('trophy', 'wood').add(aabb(x0, x0 + .55, 3.0, 11.0, 2.1, 2.3))
    vis('trophy', 'navy').add(aabb(x0, x0 + .02, 3.0, 11.0, .9, 2.1))
    for z in (1.0, 1.55):
        vis('trophy', 'glass').add(aabb(x0, x0 + .5, 3.05, 10.95, z - .015, z))
        for k in range(10):
            y = 3.5 + k * .75
            m = 'yellow' if k % 3 else 'steel'
            vis('trophy', m).add(cylinder((x0 + .25, y, z), .07, .05, 8))
            vis('trophy', m).add(cylinder((x0 + .25, y, z + .05), .02, .14, 6))
            vis('trophy', m).add(frustum((x0 + .25, y, z + .19), .05, .1, .16, 10))
    col('wood', 'trophy_case', aabb(x0, x0 + .55, 3.0, 11.0, -.3, 2.3))
    words('navy', 'ROCKET PRIDE', .2, (4.0, 7.0, 2.6), 0, max_w=5, out=.004)
    words('red', 'SPELLING BEE · SCIENCE FAIR · FIELD DAY', .08, (4.0, 7.0, 2.4), 0, max_w=6, out=.004)
    # Front office: counter with a glass window over it, the office visible behind.
    vis('office', 'wood').add(aabb(18.6, 19.3, .3, 13.7, 0, 1.05))
    vis('office', 'white').add(aabb(18.55, 19.35, .3, 13.7, 1.05, 1.1))
    vis('office', 'glass').add(aabb(18.92, 18.96, .3, 13.7, 1.1, 2.3))
    vis('office', 'wall').add(aabb(18.6, 19.3, .3, 13.7, 2.3, 3.6))
    col('wood', 'office_counter', aabb(18.55, 19.35, .3, 13.7, -.3, 3.6))
    words('navy', 'FRONT OFFICE', .22, (18.55, 7, 2.85), 180, max_w=5, out=.004)
    words('red', 'ALL VISITORS MUST CHECK IN', .09, (18.55, 7, 2.55), 180, max_w=5, out=.004)
    words('navy', 'TARDY? SEE MRS. K', .06, (18.55, 4, .75), 180, max_w=2, out=.004)
    # Behind the glass: staff cubbies, a copier, a clock.
    for k in range(6):
        for j in range(4):
            vis('office', ['white', 'yellow', 'blue', 'white'][(k + j) % 4]).add(aabb(25.7, 25.98, 4 + k * .5, 4.45 + k * .5, 1.0 + j * .3, 1.25 + j * .3))
    vis('office', 'grey').add(aabb(23, 24.2, 11.5, 12.6, 0, 1.1))
    vis('office', 'white').add(cylinder((25.98, 9.5, 2.6), .25, .02, 16, 'X', smooth=False))
    vis('office', 'black').add(aabb(25.95, 25.96, 9.48, 9.52, 2.5, 2.72))
    # Safety patrol: the reflective-belt crossing-guard vest on a hook, by the hallway.
    hx, hy = 8.2, 13.99
    vis('props', 'steel').add(aabb(hx - .03, hx + .03, hy - .08, hy, 1.62, 1.66))
    v = [(hx - .26, 1.0), (hx + .26, 1.0), (hx + .28, 1.5), (hx + .1, 1.62), (hx - .1, 1.62), (hx - .28, 1.5)]
    vis('props', 'orange').add(([(x, hy - .02, z) for x, z in v], [(0, 1, 2, 3, 4, 5)]), kind='flag')
    vis('props', 'yellow').add(aabb(hx - .26, hx + .26, hy - .03, hy - .025, 1.2, 1.24))
    vis('props', 'white').add(aabb(hx - .26, hx + .26, hy - .031, hy - .026, 1.3, 1.33))
    for sx in (-.16, .16):
        vis('props', 'yellow').add(aabb(hx + sx - .02, hx + sx + .02, hy - .03, hy - .025, 1.24, 1.6))
    vis('signs', 'green').add(aabb(hx - .45, hx + .45, hy - .01, hy, 1.75, 2.05))
    words('white', 'SAFETY PATROL', .08, (hx, hy - .01, 1.9), 270, max_w=.85, out=.003)
    words('navy', 'BE SEEN · BE SAFE', .06, (hx, hy - .03, .9), 270, max_w=.9, out=.003)
    # School name over the hallway entrance (inside) and a "WELCOME" mat-side sign.
    words('navy', 'SAUCER SPRINGS ELEMENTARY', .2, (12, 14.0, 3.25), 270, max_w=4.2, out=.004)


def rocket_shape(group, cx, cy, z, s, up=False, facing=270, mat=('red', 'white', 'yellow')):
    """Friendly cartoon rocket (the mascot), flat. up=True paints it on the floor pointing +Y."""
    body = [(-.18, -.6), (.18, -.6), (.2, .3), (0, .75), (-.2, .3)]
    fin_l = [(-.18, -.6), (-.42, -.78), (-.36, -.25), (-.19, -.1)]
    fin_r = [(.18, -.6), (.19, -.1), (.36, -.25), (.42, -.78)]
    flame = [(-.12, -.62), (.12, -.62), (0, -.95)]
    parts = [(body, mat[0]), (fin_l, mat[1]), (fin_r, mat[1]), (flame, mat[2])]
    for pts, m in parts:
        if up:
            verts = [(cx + x * s, cy + y * s, z) for x, y in pts]
            vis(group, m).add((verts, [tuple(range(len(verts)))]), kind='up')
        else:
            verts, faces = place_flat([(x * s, y * s) for x, y in pts], [tuple(range(len(pts)))], (cx, cy, z), facing, out=.01)
            vis(group, m).add((verts, faces), kind='flag')
    if up:
        disc_up(group, 'glass' if mat[0] != 'glass' else 'white', cx, cy + .2 * s, .09 * s, z + .0005, 12)


# ---------------------------------------------------------------- science room (desert plants)

def science():
    # Lab benches on the south and north walls, sinks, and a desert-plants display on the east.
    for i, (y0, y1) in enumerate(((36.0, 36.9), (47.1, 48.0))):
        vis('lab', 'white').add(aabb(17.0, 25.7, y0, y1, 0, .82))
        vis('lab', 'black').add(aabb(16.95, 25.75, y0 - .02 if i == 0 else y0 - .03, y1 + .02, .82, .88))
        col('wood', f'lab_bench_{i}', aabb(16.95, 25.75, y0 - .03, y1 + .03, -.3, .88))
        vis('lab', 'steel').add(cylinder((19.0, (y0 + y1) / 2, .88), .03, .3, 6))
    # Volcano model (south bench), fish tank and a plant (north bench), the solar system mobile.
    vis('lab', 'wood').add(frustum((21.5, 36.45, .88), .32, .08, .38, 14))
    vis('lab', 'red').add(ico((21.5, 36.45, 1.27), .07, 1, (1, 1, .6)), smooth=True)
    vis('lab', 'glass').add(aabb(22.5, 23.7, 47.25, 47.8, .88, 1.36))
    vis('lab', 'blue').add(aabb(22.52, 23.68, 47.27, 47.78, .88, 1.2))
    vis('lab', 'orange').add(ico((23.0, 47.5, 1.05), .04, 1, (1.6, .5, .8)), smooth=True)
    vis('lab', 'green').add(ico((18.0, 47.5, 1.15), .22, 1, (1, 1, 1.2)), smooth=True)
    vis('lab', 'rubber').add(frustum((18.0, 47.5, .88), .12, .15, .18, 10))
    for k, (r, m, rad) in enumerate(((0, 'yellow', .22), (.7, 'grey', .06), (1.1, 'orange', .09), (1.5, 'blue', .1),
                                     (1.9, 'red', .08), (2.5, 'orange', .17), (3.0, 'yellow', .15))):
        a = k * 1.3
        p = (20.2 + r * math.cos(a), 42 + r * math.sin(a))
        vis('lab', m).add(ico((p[0], p[1], 2.25), rad, 1), smooth=True)
        vis('lab', 'steel').add(cylinder((p[0], p[1], 2.25 + rad), .005, 3.0 - 2.25 - rad, 3))
    words('navy', 'PERIODIC TABLE OF SNACKS', .1, (16, 36.0, 2.55), 90, max_w=3, out=.006)
    panel('lab', 'white', (19.5, 36.0), 90, 3.0, .9, 1.25, out=.004)
    for k in range(9):
        for j in range(4):
            panel('lab', ['red', 'yellow', 'green', 'blue', 'teal', 'orange'][(k + j) % 6], (18.2 + k * .32, 36.0), 90, .26, .17, 1.32 + j * .2, out=.006)
    # The display: a table with a simple desert-botany exhibit and poster.
    cx, cy = 25.15, 42.0
    vis('lab', 'black').add(aabb(24.6, 25.7, 40.4, 43.6, 0, .75))
    col('wood', 'desert_plants_display', aabb(24.6, 25.7, 40.4, 43.6, -.3, .75))
    # A low pot and three broad leaves read as a friendly desert plant at toy scale.
    vis('lab', 'orange').add(cylinder((cx, cy, .88), .20, .24, 10, smooth=False))
    vis('lab', 'green').add(cylinder((cx, cy, 1.12), .045, .48, 8))
    for dx, dy, scale in ((-.18, .02, .13), (.18, .04, .13), (0, .16, .15)):
        vis('lab', 'green').add(ico((cx + dx, cy + dy, 1.38 + abs(dx) * .15), scale, 1, (.36, .12, .9)), smooth=True)
    panel('lab', 'navy', (26.0, 42.0), 180, 3.0, 1.2, 1.55, out=.004)
    words('yellow', 'DESERT PLANTS', .22, (26.0, 42.0, 2.42), 180, max_w=2.8, out=.01)
    words('white', 'LIFE IN THE MOJAVE', .08, (26.0, 42.0, 2.15), 180, max_w=2.8, out=.01)
    for k in range(4):
        y = 40.9 + k * .75
        vis('lab', 'green').add(ico((25.99, y, 1.8), .06 + k * .03, 1, (.3, 1, 1)), smooth=True)
        if k < 3:
            words('white', '→', .1, (26.0, y + .37, 1.8), 180, out=.01)
    words('red', 'DO NOT PICK THE PLANTS', .07, (24.6, 42.0, .45), 180, max_w=2.5, out=.004)
    words('navy', 'MS. RIVERA · SCIENCE', .09, (26.0, 38.0, 2.4), 180, max_w=2, out=.004)


# ---------------------------------------------------------------- library (shortcut)

SC_LANE = [(7.0, 35.2), (-4.3, 61.6)]      # the diagonal across the library


def _seg_box_dist(seg, b):
    (ax, ay), (bx, by) = seg
    x0, x1, y0, y1 = b
    best = 1e9
    n = 80
    for i in range(n + 1):
        t = i / n
        px, py = ax + (bx - ax) * t, ay + (by - ay) * t
        dx, dy = max(x0 - px, 0, px - x1), max(y0 - py, 0, py - y1)
        best = min(best, math.hypot(dx, dy))
    return best


def bookshelf(label, x0, x1, y0, y1, h, facing_dirs, seed):
    rng = random.Random(seed)
    vis('shelves', 'wood').add(aabb(x0, x1, y0, y1, 0, h))
    col('wood', label, aabb(x0, x1, y0, y1, -.3, h))
    for f in facing_dirs:
        a = math.radians(f)
        n = (round(math.cos(a)), round(math.sin(a)))
        if n[0]:
            face, L, c0 = (x1 if n[0] > 0 else x0), y1 - y0, y0
        else:
            face, L, c0 = (y1 if n[1] > 0 else y0), x1 - x0, x0
        levels = [z for z in (.12, .5, .88, 1.26, 1.64) if z < h - .3]
        for z in levels:
            u = .05
            while u < L - .1:
                w = min(rng.uniform(.03, .07) * 4, L - u - .03)
                hb = rng.uniform(.18, .3)
                m = rng.choice(['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'teal', 'navy', 'white'])
                if n[0]:
                    panel('books', m, (face, c0 + u + w / 2), f, w - .01, hb, z, out=.004)
                else:
                    panel('books', m, (c0 + u + w / 2, face), f, w - .01, hb, z, out=.004)
                u += w


def library():
    lane = SC_LANE
    shelves = [  # x0, x1, y0, y1, h, facing
        (-9.7, -9.15, 31.0, 64.8, 1.8, [0]),             # west wall
        (-9.0, 8.8, 30.3, 30.85, 1.8, [90]),              # south wall
        (-9.0, -6.6, 64.95, 65.5, 1.8, [270]),            # north wall, west of the door
        (-2.0, 3.6, 64.95, 65.5, 1.8, [270]),             # north wall, east of the door
        (8.95, 9.5, 36.5, 59.6, 1.8, [180]),              # east wall, north of the hallway door
        (-6.0, -2.0, 36.0, 37.0, 1.1, [90, 270]),         # picture-book islands, both sides of the lane
        (-6.5, -5.5, 41.0, 46.0, 1.1, [0, 180]),
        (-8.0, -7.0, 50.0, 56.0, 1.1, [0, 180]),
        (3.5, 4.5, 52.0, 58.0, 1.1, [0, 180]),
        (6.0, 7.0, 45.0, 50.0, 1.1, [0, 180]),
        (-1.0, 3.0, 61.0, 62.0, 1.1, [90, 270]),
    ]
    for i, (x0, x1, y0, y1, h, faces) in enumerate(shelves):
        d = _seg_box_dist(lane, (x0, x1, y0, y1))
        assert d >= 2.2, f'library shelf {i} only {d:.2f} m from the shortcut lane'
        bookshelf(f'shelf_{i}', x0, x1, y0, y1, h, faces, i)
    # Reading rug (paint-thin) beside the lane, bean bags (soft walls) round it.
    disc_up('decal', 'yellow', -3.2, 47.5, 2.2, .003, 32)
    for k in range(8):
        disc_up('decal', ['red', 'green', 'blue', 'purple', 'orange', 'teal', 'yellow', 'white'][k], -3.2, 47.5, 2.0, .0035, 4,
                2 * math.pi * k / 8, 2 * math.pi * (k + 1) / 8)
    for i, (x, y, m) in enumerate(((-6.8, 48.5, 'red'), (-5.6, 51.5, 'green'), (-1.6, 44.2, 'purple'))):
        assert _seg_box_dist(lane, (x - .5, x + .5, y - .5, y + .5)) >= 2.2
        vis('bags', m).add(ico((x, y, .28), .45, 2, (1.1, 1.1, .65)), smooth=True)
        col('carpet', f'bean_bag_{i}', box(x, y, -.3, .8, .8, .62))
    # Librarian's desk by the east door, a globe.
    vis('desk', 'wood').add(aabb(5.0, 7.8, 31.5, 32.3, 0, .76))
    col('wood', 'librarian_desk', aabb(5.0, 7.8, 31.5, 32.3, -.3, .76))
    assert _seg_box_dist(lane, (5.0, 7.8, 31.5, 32.3)) >= 2.2
    vis('desk', 'blue').add(ico((5.6, 31.9, 1.0), .2, 2), smooth=True)
    vis('desk', 'steel').add(cylinder((5.6, 31.9, .76), .03, .05, 6))
    words('navy', 'READ ACROSS THE BASE', .24, (-9.15, 48, 2.6), 0, max_w=6, out=.006)
    words('purple', 'BOOKS ARE PORTABLE · LIKE US', .1, (-9.15, 48, 2.3), 0, max_w=6, out=.006)
    words('navy', 'QUIET VOICES', .16, (0, 30.85, 2.4), 90, max_w=4, out=.006)
    # Hanging model F-16 (a generic single-engine jet model on strings) over the lane.
    words('navy', 'MODEL F-16 · BUILT BY 5TH GRADE ↑', .07, (6.0, 47.5, .85), 180, max_w=1.8, out=.006)
    model_jet(1.0, 48.6, 2.45, math.degrees(math.atan2(lane[1][1] - lane[0][1], lane[1][0] - lane[0][0])))


def model_jet(cx, cy, z, heading, s=1.0):
    """Generic single-engine fighter model ~1.8 m long (no markings, no insignia)."""
    a = math.radians(heading)
    ca, sa = math.cos(a), math.sin(a)

    def X(part):
        return transform(part, lambda p: (cx + (p[0] * ca - p[1] * sa) * s, cy + (p[0] * sa + p[1] * ca) * s, z + p[2] * s))
    vis('jet', 'grey').add(X(cylinder((-.8, 0, 0), .09, 1.25, 12, 'X')))
    vis('jet', 'grey').add(X(frustum((.45, 0, 0), .09, .01, .45, 12, 'X')))
    vis('jet', 'glass').add(X(ico((.32, 0, .08), .1, 1, (2.2, .7, .7))))
    vis('jet', 'grey').add(X(polygon_slab([(.2, 0), (-.35, .62), (-.5, .62), (-.45, 0)], -.012, .012)))
    vis('jet', 'grey').add(X(polygon_slab([(.2, 0), (-.45, 0), (-.5, -.62), (-.35, -.62)], -.012, .012)))
    vis('jet', 'grey').add(X(polygon_slab([(-.6, 0), (-.8, .28), (-.88, .28), (-.86, 0)], -.01, .01)))
    vis('jet', 'grey').add(X(polygon_slab([(-.6, 0), (-.86, 0), (-.88, -.28), (-.8, -.28)], -.01, .01)))
    fin = [(-.55, .0, .05), (-.86, .0, .05), (-.88, 0, .42), (-.78, 0, .42)]
    vis('jet', 'grey').add(X(hexa([(x, y - .01, zz) for x, y, zz in fin] + [(x, y + .01, zz) for x, y, zz in fin])))
    vis('jet', 'navy').add(X(box(.1, 0, -.15, .28, .12, .08)))
    vis('jet', 'steel').add(X(cylinder((-.86, 0, 0), .07, .06, 10, 'X')))
    for dx in (.3, -.6):
        p = (cx + dx * ca * s, cy + dx * sa * s)
        vis('jet', 'steel').add(cylinder((p[0], p[1], z + .08), .004, 3.6 - z - .08, 3))


# ---------------------------------------------------------------- gym

def gym():
    # Board seams (paint-thin) and the court: boundary, centre line and circle, keys, a 3-pt arc.
    x = -50 + .6
    while x < -10:
        flat_up('decal', 'wood', x - .004, x + .004, 40.1, 73.9, .001)
        x += 1.2
    cx, cy, hx, hy = -30.0, 57.0, 11.0, 6.5

    def line(x0, x1, y0, y1, m='red'):
        flat_up('decal', m, x0, x1, y0, y1, .002)
    w = .05
    line(cx - hx, cx + hx, cy - hy - w, cy - hy)
    line(cx - hx, cx + hx, cy + hy, cy + hy + w)
    line(cx - hx - w, cx - hx, cy - hy, cy + hy)
    line(cx + hx, cx + hx + w, cy - hy, cy + hy)
    line(cx - w / 2, cx + w / 2, cy - hy, cy + hy)
    ring_up('decal', 'red', cx, cy, 1.8, 1.85, .002, 40)
    disc_up('decal', 'navy', cx, cy, 1.6, .0022, 32)
    floor_words('yellow', 'ROCKETS', .5, cx, cy - .3, 0, max_w=2.6, z=.003)
    rocket_shape('decal', cx, cy + .55, .003, .5, up=True)
    for sg in (-1, 1):
        kx = cx + sg * hx
        flat_up('decal', 'navy', min(kx, kx - sg * 4.6), max(kx, kx - sg * 4.6), cy - 1.8, cy + 1.8, .0018)
        ring_up('decal', 'red', kx - sg * 4.6, cy, 1.8, 1.85, .002, 32)
    # Hoops on the end walls (wall-mounted, overhead), pads under them.
    for sg, xw in ((-1, -50), (1, -10)):
        f = 0 if sg < 0 else 180
        xb = xw - sg * 1.0
        vis('hoops', 'steel').add(aabb(min(xw, xb), max(xw, xb), cy - .05, cy + .05, 3.3, 3.4))
        vis('hoops', 'white').add(aabb(xb - .03, xb + .03, cy - .9, cy + .9, 2.7, 3.75))
        vis('hoops', 'red').add(aabb(xb - .035, xb + .035, cy - .3, cy + .3, 2.85, 3.3))
        vis('hoops', 'orange').add(torus((xb - sg * .26, cy, 2.75), .23, .012, 18, 4))
        panel('hoops', 'blue', (xw, cy), f, 6.0, 1.8, 0, out=.03)
    # Folded bleachers along the north wall: a stepped face of benches, steel ends.
    for k in range(7):
        vis('bleach', 'wood').add(aabb(-46, -14, 72.75 + k * .04, 73.95, .25 + k * .38, .55 + k * .38))
        vis('bleach', 'steel').add(aabb(-46, -14, 72.7 + k * .04, 72.75 + k * .04, .2 + k * .38, .25 + k * .38))
    for xe in (-46.1, -14):
        vis('bleach', 'steel').add(aabb(xe, xe + .1, 72.7, 74, 0, 2.95))
    vis('bleach', 'grey').add(aabb(-46, -14, 72.7, 74, 0, .25))
    col('wood', 'bleachers', aabb(-46.1, -13.9, 72.7, 74, -.3, 2.95), {'note': 'folded against the wall'})
    words('navy', 'BLEACHERS PUSHED BACK FOR PE', .12, (-30, 72.7, .2), 270, max_w=5, out=.002)
    # The rainbow parachute, spread on the floor across the line (paint-thin: the car drives on it).
    px, py, pr = -24.0, 67.0, 3.1
    cols = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'white']
    for k in range(16):
        disc_up('decal', cols[k % 8], px, py, pr, .004, 3, 2 * math.pi * k / 16, 2 * math.pi * (k + 1) / 16)
    disc_up('decal', 'white', px, py, .35, .0045, 16)
    for k in range(16):
        a = 2 * math.pi * k / 16
        vis('decal', 'navy').add(torus((px + (pr + .08) * math.cos(a), py + (pr + .08) * math.sin(a), .006), .07, .012, 8, 3))
    # Folded mats, a ball cart, scooter boards, a climbing rope (overhead).
    for k in range(4):
        vis('mats', 'blue' if k % 2 else 'navy').add(aabb(-49.5, -45.5, 40.3, 41.9, k * .2, k * .2 + .19))
    col('wood', 'mats', aabb(-49.5, -45.5, 40.3, 41.9, -.3, .8))
    vis('cart', 'steel').add(aabb(-37.0, -35.6, 40.6, 41.4, .1, .95))
    for k in range(9):
        vis('cart', ['red', 'orange', 'blue', 'yellow'][k % 4]).add(ico((-36.85 + (k % 3) * .45, 40.75 + (k // 3) % 2 * .3, .95 + (k // 6) * .1), .13, 1), smooth=True)
    col('metal', 'ball_cart', aabb(-37.05, -35.55, 40.55, 41.45, -.3, 1.15))
    for k in range(5):
        vis('scooters', ['red', 'blue', 'yellow', 'green', 'orange'][k]).add(aabb(-48.0, -47.4, 40.8, 41.4, .8 + k * .05, .84 + k * .05))
    vis('gymrope', 'wood').add(cylinder((-46.0, 46.0, 1.4), .025, 5.6, 6))
    words('white', 'GOOD SPORTS WIN', .4, (-30, 40.0, 4.4), 90, max_w=10, out=.03)
    words('yellow', 'HOME OF THE ROCKETS', .55, (-50, 57, 4.6), 0, max_w=12, out=.03)
    rocket_shape('decal', -50, 63.5, 5.0, 1.6, facing=0)


# ---------------------------------------------------------------- cafeteria

TUNNEL_Y = (34.0, 30.5, 27.0, 23.5, 20.0, 16.5)


def folding_table(label, cx, cy, length=3.6, depth=.76, along='x', chairs_up=False):
    """Long folding table, top .70-.74 m (overhead for the toy), legs inset at the ends."""
    hx, hy = (length / 2, depth / 2) if along == 'x' else (depth / 2, length / 2)
    vis('tables', 'white').add(aabb(cx - hx, cx + hx, cy - hy, cy + hy, .70, .74))
    vis('tables', 'grey').add(aabb(cx - hx, cx + hx, cy - hy, cy + hy, .69, .70))
    col('wood', f'{label}_top', aabb(cx - hx, cx + hx, cy - hy, cy + hy, .70, .74), {'note': 'overhead: the toy car drives under'})
    for sx in (-1, 1):
        for sy in (-1, 1):
            lx = cx + sx * (hx - .1) if along == 'x' else cx + sx * (hx - .06)
            ly = cy + sy * (hy - .06) if along == 'x' else cy + sy * (hy - .1)
            vis('tables', 'steel').add(box(lx, ly, 0, .05, .05, .7))
            col('metal', f'{label}_leg', box(lx, ly, -.3, .07, .07, 1.0))
    if chairs_up:
        n = int(length / .6)
        for k in range(n):
            u = -length / 2 + .3 + k * (length - .6) / max(1, n - 1)
            for sy in (-1, 1):
                x, y = (cx + u, cy + sy * .2) if along == 'x' else (cx + sy * .2, cy + u)
                vis('chairs', 'red' if k % 2 else 'blue').add(box(x, y, .74 + .38, .36, .36, .03))
                for dx in (-.15, .15):
                    for dy in (-.15, .15):
                        vis('chairs', 'steel').add(box(x + dx, y + dy, .74, .02, .02, .38))


def cafeteria():
    for i, y in enumerate(TUNNEL_Y):
        folding_table(f'tunnel_table_{i}', -26.0, y)
    # Side tables: chairs stacked upside-down on top after lunch. One on the east side hides a coin.
    for i, (x, y) in enumerate(((-38, 32), (-38, 26), (-38, 20), (-38, 14), (-38, 8), (-14, 30), (-14, 24), (-14, 18), (-14, 9))):
        folding_table(f'side_table_{i}', x, y, chairs_up=True)
    # Serving line along the west wall.
    vis('serve', 'steel').add(aabb(-49.7, -47.0, 8, 32, 0, .9))
    vis('serve', 'steel').add(aabb(-47.1, -46.7, 8, 32, .82, .86))
    vis('serve', 'glass').add(aabb(-47.6, -47.55, 8.2, 31.8, 1.1, 1.5))
    col('metal', 'serving_line', aabb(-49.7, -46.7, 8, 32, -.3, 1.5))
    for k in range(12):
        y = 9 + k * 1.9
        vis('serve', ['orange', 'yellow', 'green', 'red'][k % 4]).add(aabb(-48.9, -47.7, y, y + 1.2, .9, .96))
    for k in range(10):
        vis('serve', 'grey').add(aabb(-47.0, -46.75, 9 + k * .05, 9.04 + k * .05, .86, 1.15))
    vis('signs', 'navy').add(aabb(-50, -49.95, 12, 28, 2.2, 3.4))
    words('yellow', 'SERVING LINE', .32, (-49.95, 20, 3.1), 0, max_w=8, out=.004)
    for text, z in (('TODAY: PIZZA DAY', 2.75), ('DESSERT: CHOCOLATE PUDDING', 2.5), ('THANK YOU, LUNCH CREW!', 2.3)):
        words('white', text, .14, (-49.95, 20, z), 0, max_w=8, out=.004)
    # Milk cooler and tray return by the exit, trash and recycling bins.
    vis('cafe', 'white').add(aabb(-49.6, -48.0, 3.0, 4.6, 0, 1.0))
    vis('cafe', 'red').add(aabb(-48.0, -47.98, 3.1, 4.5, .4, .9))
    col('metal', 'milk_cooler', aabb(-49.6, -48.0, 3.0, 4.6, -.3, 1.0))
    for i, (x, m) in enumerate(((-31.5, 'grey'), (-20.5, 'blue'))):
        vis('cafe', m).add(cylinder((x, 1.4, 0), .32, .9, 14))
        col('metal', f'bin_{i}', box(x, 1.4, -.3, .66, .66, 1.2))
    words('navy', 'BUS YOUR TRAY', .14, (-26, 39.7, 3.15), 270, max_w=4, out=.004)
    words('white', 'PLAYGROUND →', .16, (-26, .0, 2.85), 90, max_w=4, out=.006)
    words('red', 'CAFETERIA', .4, (-26, 39.7, 3.6), 270, max_w=6, out=.004)
    # Chair stacks against the east wall (walls of chairs).
    for k in range(6):
        y = 3 + k * 1.2
        for j in range(8):
            vis('chairs', 'red' if (k + j) % 2 else 'blue').add(aabb(-11.0, -10.5, y, y + .45, .1 + j * .17, .14 + j * .17))
        vis('chairs', 'steel').add(aabb(-11.0, -10.98, y, y + .45, 0, 1.45))
        col('metal', f'chair_stack_{k}', aabb(-11.05, -10.45, y, y + .45, -.3, 1.45))


# ---------------------------------------------------------------- playground

def fence_run(label, p, q, h=1.5, gap=None):
    """Black steel picket fence from p to q (a wall to the car), optional gap (t0, t1 along it)."""
    L = math.dist(p, q)
    d = ((q[0] - p[0]) / L, (q[1] - p[1]) / L)
    spans = [(0, L)] if gap is None else [(0, gap[0]), (gap[1], L)]
    for si, (t0, t1) in enumerate(spans):
        a = (p[0] + d[0] * t0, p[1] + d[1] * t0)
        b = (p[0] + d[0] * t1, p[1] + d[1] * t1)
        vis('fence', 'black').add(beam(a, b, .05, 1.38, .06))
        vis('fence', 'black').add(beam(a, b, .05, .12, .05))
        n = max(1, int((t1 - t0) / .14))
        for k in range(n + 1):
            t = t0 + (t1 - t0) * k / n
            x, y = p[0] + d[0] * t, p[1] + d[1] * t
            if k % 18 == 0:
                vis('fence', 'black').add(box(x, y, 0, .09, .09, h))
            else:
                vis('fence', 'black').add(box(x, y, .05, .022, .022, h - .12))
        col('metal', f'{label}_{si}', beam(a, b, .12, -.3, h))


def racing_slide():
    """Tot-lot racing slide on the line, driven UP from the bottom: a tabletop jump.
    Bed (tile) 0 -> 0.5 m over 2.6 m (11 deg) between rails, deck (wood) 2 m, rubber berm down
    5 m (6 deg) with 29-degree flanks. Side blocks close the deck sides to the berm flanks."""
    x, y0, y1, y2, y3, h, a, fl = SL['x'], SL['y0'], SL['y1'], SL['y2'], SL['y3'], SL['h'], SL['half'], SL['flank']
    bed = C.wedge((x, y0), (x, y1), 2 * a, 0, h)
    vis('slide', 'yellow').add(bed)
    col('tile', 'slide_bed', bed, {'note': 'racing slide, driven up: smooth plastic'}, ramp=True)
    for k, m in enumerate(('red', 'yellow', 'blue')):          # three lanes, ridges between
        xa = x - a + k * 2 * a / 3
        vis('decal', m).add(([(xa + .03, y0 - .02, .004), (xa + 2 * a / 3 - .03, y0 - .02, .004),
                              (xa + 2 * a / 3 - .03, y1, h + .004), (xa + .03, y1, h + .004)], [(0, 1, 2, 3)]), kind='up')
    for sg in (-1, 1):                                          # rails: sloped closed boxes, 32 cm above the bed
        r0, r1 = x + sg * a, x + sg * (a + .12)
        lo, hi = sorted((r0, r1))
        v = [(lo, y0, -.3), (hi, y0, -.3), (hi, y1, -.3), (lo, y1, -.3), (lo, y0, .32), (hi, y0, .32), (hi, y1, h + .32), (lo, y1, h + .32)]
        vis('slide', 'red').add(hexa([(px, py, max(pz, 0)) for px, py, pz in v]))
        col('metal', f'slide_rail_{"lr"[sg > 0]}', hexa(v))
    deck = aabb(x - a, x + a, y2, y1, -.3, h)
    vis('slide', 'teal').add(aabb(x - a, x + a, y2, y1, 0, h))
    col('wood', 'slide_deck', deck, {'note': 'play-structure deck, 50 cm'}, ramp=True)
    for sg in (-1, 1):                                          # deck side blocks (climbers) and guards
        xa, xb = sorted((x + sg * a, x + sg * (a + fl + .1)))
        vis('slide', 'teal').add(aabb(xa, xb, y2, y1, 0, h + .9))
        col('metal', f'deck_side_{"lr"[sg > 0]}', aabb(xa, xb, y2, y1, -.3, h + .9))
        for k in range(4):
            vis('decal', 'yellow').add(aabb(xa + .02, xb - .02, y2 - .005, y2, .2 + k * .3, .26 + k * .3))
        for py in (y1, y2):                                     # roof posts on the outer corners
            vis('slide', 'blue').add(box(x + sg * (a + fl), py, h + .9, .12, .12, 1.4))
    vis('slide', 'red').add(aabb(x - a - fl - .1, x + a + fl + .1, y2 - .1, y1 + .1, 2.8, 2.9))
    roof = [(x - a - fl - .2, y2 - .2, 2.9), (x + a + fl + .2, y2 - .2, 2.9), (x + a + fl + .2, y1 + .2, 2.9), (x - a - fl - .2, y1 + .2, 2.9),
            (x, y2 - .2, 3.5), (x, y1 + .2, 3.5)]
    vis('slide', 'yellow').add((roof, [(0, 4, 5, 3), (1, 2, 5, 4), (0, 1, 4), (3, 5, 2)]), kind='closed')
    b = a + fl
    v = [(x - b, y3, 0), (x + b, y3, 0), (x - b, y2, 0), (x + b, y2, 0), (x - a, y2, h), (x + a, y2, h)]
    faces = [(0, 4, 5, 1), (0, 2, 4), (1, 5, 3), (2, 3, 5, 4), (0, 1, 3, 2)]
    vis('slide', 'rubber').add((v, faces))
    col('rubber', 'landing_berm', (v, faces), {'note': 'rubber berm, 6 deg, flanks 29 deg: lands soft'}, ramp=True)
    # A tube slide on the west side and a climbing net on the east (decor on the side blocks).
    vis('slide', 'blue').add(torus((x - b - .4, (y1 + y2) / 2, 1.0), .5, .2, 12, 6, 'Y'))
    col('metal', 'tube_slide', box(x - b - .4, (y1 + y2) / 2, -.3, 1.5, .5, 2.0))
    for k in range(5):
        vis('slide', 'navy').add(aabb(x + b + .1, x + b + .14, y2 + k * .45, y2 + k * .45 + .03, .1, h + .85))
    words('navy', 'RACING SLIDE', .14, (x, y1 + .2, 3.1), 90, max_w=3.4, out=.01)
    sign_post('slide_rules', x + 3.6, y0 + 1.5, 90, [('UP THE SLIDE?', .09, 'navy', .12), ('ONLY IF YOU', .09, 'navy', -.02),
                                                      ('ARE A TOY', .09, 'red', -.16)], 'white', w=.8, hgt=.55, z0=.6)


def tot_hill(cx, cy, R=3.0, h=.45, n=24, rings=6):
    """Rubber tot-lot hill: a smooth cosine dome (max 13 deg), a coin on top."""
    v = [(cx, cy, h)]
    for j in range(1, rings + 1):
        r = R * j / rings
        z = h * (math.cos(math.pi * r / R) + 1) / 2
        v += [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n), z) for k in range(n)]
    f = [(0, 1 + k, 1 + (k + 1) % n) for k in range(n)]
    for j in range(rings - 1):
        b0, b1 = 1 + j * n, 1 + (j + 1) * n
        f += [(b0 + k, b1 + k, b1 + (k + 1) % n, b0 + (k + 1) % n) for k in range(n)]
    vis('hill', 'green').add((v, f), kind='up')
    base = len(v)
    vb = v + [(cx + R * math.cos(2 * math.pi * k / n), cy + R * math.sin(2 * math.pi * k / n), -.3) for k in range(n)]
    outer = 1 + (rings - 1) * n
    fb = list(f) + [(outer + k, base + k, base + (k + 1) % n, outer + (k + 1) % n) for k in range(n)]
    fb.append(tuple(base + k for k in reversed(range(n))))
    col('rubber', 'tot_hill', (vb, fb), {'note': 'cosine dome, 45 cm, rubber'})


def monkey_bars(cx, cy, span=5.4, w=.7):
    """Monkey bars across the east leg: drive under (rungs at 2 m), ladders at both ends."""
    y0, y1 = cy - span / 2, cy + span / 2
    for yy in (y0, y1):
        for sx in (-w / 2, w / 2):
            vis('bars', 'blue').add(box(cx + sx, yy, 0, .07, .07, 2.05))
        for k in range(6):
            vis('bars', 'yellow').add(box(cx, yy, .3 + k * .32, w, .04, .04))
        col('metal', f'monkey_ladder_{int(yy > cy)}', box(cx, yy, -.3, w + .1, .3, 2.4))
    for sx in (-w / 2, w / 2):
        vis('bars', 'blue').add(box(cx + sx, cy, 2.02, .06, span, .06))
    for k in range(int(span / .35)):
        vis('bars', 'yellow').add(box(cx, y0 + .2 + k * .35, 2.03, w, .03, .03))


def swing_set(cx, cy):
    for sy in (-1.8, 1.8):
        for sx in (-.9, .9):
            p0, p1 = (cx, cy + sy), (cx + sx, cy + sy)
            v = [(p0[0] - .04, p0[1] - .04, 2.4), (p0[0] + .04, p0[1] - .04, 2.4), (p1[0] + .04, p1[1] - .04, 0), (p1[0] - .04, p1[1] - .04, 0)]
            vis('swings', 'red').add(hexa(v + [(x, y + .08, z) for x, y, z in v]))
        col('metal', f'swing_leg_{int(sy > 0)}', box(cx, cy + sy, -.3, 1.9, .2, 1.4))
    vis('swings', 'red').add(cylinder((cx, cy - 1.9, 2.4), .05, 3.8, 10, 'Y'))
    for sy, m in ((-.7, 'blue'), (.7, 'yellow')):
        vis('swings', m).add(aabb(cx - .12, cx + .12, cy + sy - .25, cy + sy + .25, .5, .55))
        for dy in (-.22, .22):
            vis('swings', 'steel').add(aabb(cx - .005, cx + .005, cy + sy + dy - .005, cy + sy + dy + .005, .55, 2.4))


def shade_sail(corners, label, mat='teal', post_h=4.0):
    """Tensioned shade sail on tall posts (overhead, posts are walls)."""
    pts = [(x, y, z) for x, y, z in corners]
    n = len(pts)
    cx, cy = sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n
    cz = min(p[2] for p in pts) - .35
    v = pts + [(cx, cy, cz)]
    up = [(i, (i + 1) % n, n) for i in range(n)]
    vis('sails', mat).add((v, up), kind='up')
    vis('sails', mat).add((v, [tuple(reversed(f)) for f in up]), kind='flag')
    for i, (x, y, z) in enumerate(pts):
        vis('sails', 'steel').add(cylinder((x, y, 0), .09, z + .2, 10))
        col('metal', f'{label}_post_{i}', box(x, y, -.3, .3, .3, z + .5))


def playground():
    # Boundary: picket fence round the outdoor zone, with a gate on the line between the
    # playground and the front walk.
    fence_run('fence_w', (-54, 0), (-54, -46))
    fence_run('fence_s', (-54, -46), (30, -46))
    fence_run('fence_e', (30, -46), (30, 0))
    fence_run('fence_nw', (-54, 0), (-50.3, 0))
    fence_run('fence_ne', (26.3, 0), (30, 0))
    fence_run('fence_mid', (2, 0), (2, -46), h=1.2, gap=(35.5, 40.5))
    for sg in (-1, 1):
        vis('fence', 'yellow').add(box(2, -38 + sg * 2.5, 0, .14, .14, 1.6))
    racing_slide()
    tot_hill(-37.0, -24.0)
    monkey_bars(-13.0, -38.0)
    swing_set(-48.5, -26.0)
    shade_sail([(-32, -9.5, 3.7), (-20, -9.5, 4.0), (-20, -24.5, 3.7), (-32, -24.5, 4.0)], 'sail_slide')
    shade_sail([(-7.6, -45.6, 3.2), (1.2, -45.6, 3.5), (-7.6, -41.0, 3.0)], 'sail_sand', 'orange')
    shade_sail([(-52, -20, 3.4), (-44.5, -20, 3.6), (-44.5, -32, 3.4)], 'sail_swings', 'orange')
    # Sandbox: flush timber edge (paint-thin), toys left in it.
    for x0, x1, y0, y1 in ((-6, 0, -41.15, -41.0), (-6, 0, -45.0, -44.85), (-6, -5.85, -45, -41), (-.15, 0, -45, -41)):
        flat_up('decal', 'wood', x0, x1, y0, y1, .004)
    vis('sandtoys', 'red').add(frustum((-5.2, -44.3, 0), .13, .17, .2, 10))
    vis('sandtoys', 'yellow').add(aabb(-1.2, -.9, -44.7, -43.9, 0, .05))
    vis('sandtoys', 'blue').add(ico((-2.0, -44.5, .12), .14, 1, (1.4, 1, .8)), smooth=True)
    for i, (x, y) in enumerate(((-4.8, -43.6), (-1.0, -42.4))):
        vis('sandtoys', 'sand').add(ico((x, y, 0), .35, 1, (1.2, 1, .45)), smooth=True)
    # Concrete apron: four-square, hopscotch, a tetherball pole, benches, drinking fountain.
    sq = (-40.0, -2.5)
    for k in range(3):
        flat_up('decal', 'white', sq[0] - 2 + k * 2 - .03, sq[0] - 2 + k * 2 + .03, sq[1] - 2, sq[1] + 2, .003)
        flat_up('decal', 'white', sq[0] - 2, sq[0] + 2, sq[1] - 2 + k * 2 - .03, sq[1] - 2 + k * 2 + .03, .003)
    for k, m in enumerate(('red', 'yellow', 'blue', 'green')):
        floor_words(m, str(k + 1), .5, sq[0] + (-1 if k in (0, 3) else 1), sq[1] + (-1 if k < 2 else 1), 90)
    hx0 = 6.0
    for k, (dx, dy) in enumerate(((0, 0), (0, .7), (-.35, 1.4), (.35, 1.4), (0, 2.1), (-.35, 2.8), (.35, 2.8), (0, 3.5))):
        x, y = hx0 + dx - 1.0, -12.0 + dy
        flat_up('decal', 'yellow', x - .3, x + .3, y - .3, y - .26, .003)
        flat_up('decal', 'yellow', x - .3, x + .3, y + .26, y + .3, .003)
        flat_up('decal', 'yellow', x - .3, x - .26, y - .3, y + .3, .003)
        flat_up('decal', 'yellow', x + .26, x + .3, y - .3, y + .3, .003)
        floor_words('white', str(k + 1), .3, x, y, 90)
    vis('pole', 'steel').add(cylinder((-46.0, -2.4, 0), .05, 3.0, 8))
    vis('pole', 'yellow').add(ico((-45.7, -2.4, 1.5), .13, 2), smooth=True)
    vis('pole', 'white').add(beam((-46.0, -2.4), (-45.73, -2.4), .006, 1.6, 1.4))
    col('metal', 'tetherball', box(-46.0, -2.4, -.3, .3, .3, 3.3))
    for i, x in enumerate((-46.0, -36.0, -16.0, -6.0)):
        vis('benches', 'wood').add(aabb(x - .9, x + .9, -1.0, -.6, .42, .47))
        vis('benches', 'wood').add(aabb(x - .9, x + .9, -.55, -.5, .5, .9))
        for sx in (-.8, .8):
            vis('benches', 'steel').add(aabb(x + sx - .04, x + sx + .04, -1.0, -.5, 0, .45))
        col('wood', f'bench_{i}', aabb(x - .9, x + .9, -1.05, -.45, -.3, .9))
    vis('props', 'steel').add(aabb(-30.8, -30.3, -.55, -.3, .0, .85))
    col('metal', 'fountain', aabb(-30.85, -30.25, -.6, -.3, -.3, .85))
    vis('signs', 'yellow').add(aabb(-31.4, -29.7, -.32, -.3, 1.3, 1.8))
    words('red', "IT'S A DRY HEAT!", .1, (-30.55, -.32, 1.65), 270, max_w=1.6, out=.002)
    words('navy', 'DRINK WATER', .1, (-30.55, -.32, 1.45), 270, max_w=1.6, out=.002)
    words('navy', 'PLAYGROUND RULES: TAKE TURNS · NO TOY CARS ON THE SLIDE', .08, (-21.0, -.3, 1.6), 270, max_w=4.0, out=.006)
    words('red', '(EXCEPT TODAY)', .08, (-21.0, -.3, 1.45), 270, max_w=4.0, out=.006)
    # Facade dressing seen from the playground: the school name and the mascot.
    words('navy', 'SAUCER SPRINGS ELEMENTARY', .5, (-26, -.3, 3.5), 270, max_w=16, out=.01)
    rocket_shape('decal', -40.5, -.3, 3.0, 1.4, facing=270)


def front_walk():
    # Gravel landscape (paint-thin) off the paths, agave and barrel cacti, boulders, two palms.
    for x0, x1, y0, y1 in ((2.4, 8.3, -33.6, -3.5), (16, 29.6, -16.6, -.5), (28.5, 29.6, -45.6, -17), (2.4, 21, -45.6, -42.4),
                           (13.5, 20.2, -34.0, -26.0)):
        flat_up('decal', 'sand', x0, x1, y0, y1, .002)
    for i, (x, y) in enumerate(((4.5, -30), (6.5, -20), (4.0, -9), (28.6, -30))):
        agave(x, y)
    for i, (x, y) in enumerate(((6.8, -26.5), (5.0, -14.0), (17.5, -44.3))):
        vis('plants', 'wood').add(ico((x, y, .2), .55, 1, (1.25, 1, .7)))
        col('concrete', f'boulder_{i}', box(x, y, -.3, 1.2, 1.0, .75))
    for i, (x, y) in enumerate(((4.0, -44.0), (28.5, -12.0))):
        palm(x, y, 6.5 + i, f'palm_{i}')
    # Flagpole plaza in the S of the lap: a raised-edge planter, open only on its south side, with
    # the PLANTER RUN skill shortcut across it (see plaza_run()).
    flagpole(17.0, -30.0)
    plaza_run()
    # Monument sign by the front walk, facing the line as the car heads north.
    sx, sy = 6.0, -16.0
    vis('sign', 'stucco').add(aabb(sx - .4, sx + .4, sy - 2.2, sy + 2.2, 0, 1.6))
    vis('sign', 'navy').add(aabb(sx + .4, sx + .44, sy - 2.0, sy + 2.0, .3, 1.5))
    col('concrete', 'monument_sign', aabb(sx - .4, sx + .44, sy - 2.2, sy + 2.2, -.3, 1.6))
    words('white', 'SAUCER SPRINGS', .3, (sx + .44, sy, 1.22), 0, max_w=3.8, out=.005)
    words('white', 'ELEMENTARY', .3, (sx + .44, sy, .9), 0, max_w=3.8, out=.005)
    words('yellow', 'HOME OF THE ROCKETS', .16, (sx + .44, sy, .55), 0, max_w=3.8, out=.005)
    rocket_shape('decal', sx + .44, sy - 1.6, 1.0, .5, facing=0)
    # Entrance canopy on two posts over the front doors.
    vis('canopy', 'stucco').add(aabb(8.6, 15.4, -5.2, -.3, 3.0, 3.3))
    flat_down('decal', 'ceiling', 8.6, 15.4, -5.2, -.3, 2.995)
    for x in (9.0, 15.0):
        vis('canopy', 'steel').add(box(x, -4.8, 0, .18, .18, 3.0))
        col('metal', f'canopy_post_{int(x > 12)}', box(x, -4.8, -.3, .25, .25, 3.3))
    words('navy', 'WELCOME, ROCKETS!', .26, (12, -5.2, 3.15), 270, max_w=6.4, out=.005)
    words('navy', 'SAUCER SPRINGS ELEMENTARY', .36, (15, -.3, 3.7), 270, max_w=10.5, out=.012)
    words('red', 'EST. 51½ · AIM HIGH, DRIVE LOW', .12, (15, -.3, 3.38), 270, max_w=10, out=.012)
    # School bus parked along the east side, nose west.
    school_bus(22.5, -8.75)
    # Crosswalk and school-zone signs on the north leg.
    for k in range(7):
        x = 9.2 + k * .8
        flat_up('decal', 'white', x, x + .45, -18.0, -16.0, .003)
    sign_post('school_zone', 16.5, -18.5, 270, [('SCHOOL', .14, 'black', .16), ('ZONE', .14, 'black', -.02), ('15 MPH', .12, 'black', -.2)],
              'yellow')
    sign_post('crossing', 8.5, -19.5, 270, [('CROSSING', .1, 'black', .1), ('GUARD ON DUTY', .07, 'black', -.08)], 'hivis')
    # Bike rack by the doors.
    for k in range(6):
        vis('bikes', 'steel').add(torus((3.4, -4.0 + k * .5, .45), .38, .02, 14, 4, 'X'))
    col('metal', 'bike_rack', aabb(3.0, 3.8, -4.4, -1.2, -.3, .9))


PLAZA = (6.0, 20.0, -35.0, -25.5)          # planter ring x0, x1, y0, y1 (outer)
PLAZA_GAP = (7.4, 11.4)                     # opening in the south wall
RUN_H, RUN_W = .6, .8
RUN_PTS = [(7.9, -35.5), (9.3, -33.9), (11.1, -32.1), (13.2, -30.0), (13.2, -28.75), (13.2, -28.05), (13.2, -27.0),
           (13.2, -25.2), (13.2, -22.5)]


def plaza_run():
    """PLANTER RUN (ALT_planter): up a ramp inside the flagpole planter, along a 0.8 m wall-top,
    a 45-degree dogleg (brake), a kicker over a 0.8 m gap (keep your speed up), over the planter's
    north wall and down onto the front walk. Falling off drops 0.6 m onto the planter floor, which
    opens only back onto the lap behind you: a dead end, never a trap."""
    x0, x1, y0, y1 = PLAZA
    t = .3
    for i, (a, b, c, d) in enumerate(((x0, PLAZA_GAP[0], y0, y0 + t), (PLAZA_GAP[1], x1, y0, y0 + t), (x0, x1, y1 - t, y1),
                                      (x0, x0 + t, y0, y1), (x1 - t, x1, y0, y1))):
        vis('planter', 'stucco').add(aabb(a, b, c, d, 0, RUN_H - .04))
        vis('planter', 'concrete').add(aabb(a - .02, b + .02, c - .02, d + .02, RUN_H - .04, RUN_H))
        col('concrete', f'planter_wall_{i}', aabb(a, b, c, d, -.3, RUN_H), {'note': 'planter edge: a wall, 60 cm'})
    flat_up('decal', 'sand', x0 + t, x1 - t, y0 + t, y1 - t, .003)
    toe, top = RUN_PTS[1], RUN_PTS[2]
    part = C.flanked_ramp(toe, top, RUN_W, RUN_H, .5)
    vis('planter', 'yellow').add(part)
    col('wood', 'planter_ramp_up', part, {'note': 'skill shortcut ramp'}, ramp=True)
    C.walkway('planter_walk_a', [RUN_PTS[2], RUN_PTS[3], RUN_PTS[5]], RUN_W, RUN_H, 'concrete', 'concrete', group='planter')
    kick = C.wedge(RUN_PTS[4], RUN_PTS[5], RUN_W, RUN_H, .12)
    vis('planter', 'yellow').add(kick)
    col('wood', 'planter_kicker', kick, {'note': '12 cm kicker before the gap'}, ramp=True)
    C.walkway('planter_walk_b', [(13.2, -27.25), RUN_PTS[7]], RUN_W, RUN_H, 'concrete', 'concrete', group='planter')
    part = C.flanked_ramp(RUN_PTS[8], RUN_PTS[7], RUN_W, RUN_H, .5)
    vis('planter', 'yellow').add(part)
    col('wood', 'planter_ramp_down', part, {'note': 'skill shortcut ramp'}, ramp=True)
    # Chevrons on the walkway and a sign at the entrance.
    for (ax, ay), (bx, by) in ((RUN_PTS[2], RUN_PTS[3]), (RUN_PTS[3], RUN_PTS[5]), ((13.2, -27.25), RUN_PTS[7])):
        n = int(math.dist((ax, ay), (bx, by)) / .6)
        for k in range(n):
            u = (k + .5) / n
            cx, cy = ax + (bx - ax) * u, ay + (by - ay) * u
            vis('decal', 'red' if k % 2 else 'white').add(box(cx, cy, RUN_H, .5, .12, .004, math.atan2(by - ay, bx - ax) + math.pi / 2))
    sign_post('planter_run', 4.4, -34.6, 270, [('PLANTER RUN', .1, 'navy', .1), ('KEEP OFF THE GRASS', .06, 'red', -.06),
                                               ('(IT IS GRAVEL)', .05, 'navy', -.16)], 'white', w=.9, hgt=.45, z0=.6)


def sign_post(label, cx, cy, facing, lines, board, w=.8, hgt=.8, z0=1.4):
    yaw = math.radians(facing + 90)
    a = math.radians(facing)
    n = (math.cos(a), math.sin(a))
    vis('signs', 'steel').add(box(cx - n[0] * .05, cy - n[1] * .05, 0, .06, .06, z0 + hgt))
    vis('signs', board if board != 'hivis' else 'yellow').add(box(cx, cy, z0, w, .03, hgt, yaw))
    for text, size, mat, dz in lines:
        words(mat, text, size, (cx, cy, z0 + hgt / 2 + dz), facing, max_w=w * .9, out=.02)
    col('metal', f'{label}_post', box(cx - n[0] * .05, cy - n[1] * .05, -.3, .3, .3, z0 + hgt + .3))


def school_bus(cx, cy, L=10.0, W=2.4):
    vis('bus', 'yellow').add(aabb(cx - L / 2, cx + L / 2, cy - W / 2, cy + W / 2, .5, 3.0))
    vis('bus', 'yellow').add(aabb(cx - L / 2 - 1.2, cx - L / 2, cy - W / 2 + .05, cy + W / 2 - .05, .5, 1.7))
    vis('bus', 'black').add(aabb(cx - L / 2 - 1.25, cx + L / 2 + .02, cy - W / 2 - .02, cy + W / 2 + .02, .5, .62))
    for side in (-1, 1):
        y = cy + side * (W / 2 + .005)
        for k in range(8):
            panel('bus', 'glass', (cx - L / 2 + .8 + k * 1.15, y), 90 if side > 0 else 270, .9, .7, 1.9, out=.0)
        panel('bus', 'black', (cx, y), 90 if side > 0 else 270, L, .06, 1.6, out=.002)
        words('black', 'SCHOOL BUS', .3, (cx + .5, y, 2.75), 90 if side > 0 else 270, max_w=4, out=.004)
        for x in (cx - L / 2 + 1.0, cx + L / 2 - 1.6):
            vis('bus', 'black').add(cylinder((x, cy + (W / 2 - .25 if side > 0 else -W / 2 - .05), .48), .48, .3, 14, 'Y'))
    panel('bus', 'glass', (cx - L / 2 - .01, cy), 180, W - .3, .9, 1.85, out=0)
    panel('bus', 'red', (cx - L / 2 - 1.21, cy), 180, .3, .12, 1.3, out=0, dx=-.8)
    panel('bus', 'red', (cx - L / 2 - 1.21, cy), 180, .3, .12, 1.3, out=0, dx=.8)
    col('metal', 'school_bus', aabb(cx - L / 2 - 1.25, cx + L / 2, cy - W / 2, cy + W / 2, -.3, 3.0))


def agave(x, y, s=1.0):
    g = vis('plants', 'green')
    for ring, (count, rad, hgt) in enumerate(((11, .6, .42), (7, .38, .55))):
        for i in range(count):
            a = 2 * math.pi * i / count + ring * .3
            w = .09 * s
            px, py = -math.sin(a) * w, math.cos(a) * w
            tip = (x + math.cos(a) * rad * s, y + math.sin(a) * rad * s, hgt * s * (.8 + .2 * math.sin(i * 2.3)))
            v = [(x + px, y + py, 0), (x - px, y - py, 0), tip, (x, y, .12 * s)]
            g.add((v, [(0, 1, 2), (0, 2, 3), (1, 3, 2), (0, 3, 1)]))
    col('wood', f'agave_{round(x)}_{round(y)}', box(x, y, -.3, 1.2 * s, 1.2 * s, .9))


def palm(x, y, h, label):
    vis('trees', 'wood').add(frustum((x, y, 0), .24, .16, h, 10))
    g = vis('trees', 'green')
    for i in range(10):
        a = 2 * math.pi * i / 10 + .2 * math.sin(i)
        ca, sa = math.cos(a), math.sin(a)
        pts = [(0, h + .1, .3), (1.0, h + .45, .26), (1.9, h + .2, .17), (2.6, h - .55, .05)]
        for (r0, z0, w0), (r1, z1, w1) in zip(pts, pts[1:]):
            c = [(x + ca * r0 + sa * w0, y + sa * r0 - ca * w0, z0), (x + ca * r0 - sa * w0, y + sa * r0 + ca * w0, z0),
                 (x + ca * r1 - sa * w1, y + sa * r1 + ca * w1, z1), (x + ca * r1 + sa * w1, y + sa * r1 - ca * w1, z1)]
            g.add(hexa([(p[0], p[1], p[2] - .025) for p in c] + [(p[0], p[1], p[2] + .025) for p in c]))
    col('wood', label, box(x, y, -.3, .5, .5, h))


def flagpole(px, py, height=8.0):
    vis('park', 'concrete').add(cylinder((px, py, 0), 1.4, .38, 20, smooth=False))
    col('concrete', 'flag_plinth', cylinder((px, py, -.3), 1.4, .68, 12, smooth=False))
    vis('park', 'steel').add(cylinder((px, py, .38), .07, height, 12))
    vis('park', 'yellow').add(ico((px, py, .38 + height + .1), .13, 2), smooth=True)
    top, fh, fl = .38 + height - .05, .95, 1.55
    sh = fh / 13
    for k in range(13):
        z1 = top - k * sh
        x0 = .62 if k < 7 else 0
        for side in (-1, 1):
            q = [(px + .07 + x0, py + side * .002, z1 - sh), (px + .07 + fl, py + side * .002, z1 - sh),
                 (px + .07 + fl, py + side * .002, z1), (px + .07 + x0, py + side * .002, z1)]
            vis('park', 'red' if k % 2 == 0 else 'white').add((q, [(0, 1, 2, 3) if side < 0 else (3, 2, 1, 0)]), kind='flag')
    for side in (-1, 1):
        q = [(px + .07, py + side * .003, top - 7 * sh), (px + .69, py + side * .003, top - 7 * sh), (px + .69, py + side * .003, top),
             (px + .07, py + side * .003, top)]
        vis('park', 'navy').add((q, [(0, 1, 2, 3) if side < 0 else (3, 2, 1, 0)]), kind='flag')
    for i in range(18):
        a = 2 * math.pi * i / 18
        vis('park', ('red', 'white', 'blue')[i % 3]).add(ico((px + 1.65 * math.cos(a), py + 1.65 * math.sin(a), .08), .13, 1), smooth=True)


def horizon():
    """Desert ground past the fence, a brown ridge to the east, low hills elsewhere (generic)."""
    vis('far', 'sand').add(([(-700, -700, -.02), (700, -700, -.02), (700, 700, -.02), (-700, 700, -.02)], [(0, 1, 2, 3)]), kind='up')
    rows, n = [], 160
    for i in range(n):
        th = 2 * math.pi * i / n
        east = max(0.0, math.cos(th - math.radians(10))) ** 1.5
        h = 14 + 7 * math.sin(7 * th) + 4 * math.sin(17 * th + 1) + east * (55 + 20 * math.sin(5 * th + 1))
        r = 430 + 25 * math.sin(3 * th)
        rows.append([(r * math.cos(th), r * math.sin(th), -1), ((r + 50) * math.cos(th), (r + 50) * math.sin(th), h * .62),
                     ((r + 95) * math.cos(th), (r + 95) * math.sin(th), h), ((r + 190) * math.cos(th), (r + 190) * math.sin(th), -1)])
    v = [p for row in rows for p in row]
    quads = [(i * 4 + k, ((i + 1) % n) * 4 + k, ((i + 1) % n) * 4 + k + 1, i * 4 + k + 1) for i in range(n) for k in range(3)]
    out = []
    for q in quads:
        a, b, c = v[q[0]], v[q[1]], v[q[2]]
        u = [b[i] - a[i] for i in range(3)]
        w = [c[i] - b[i] for i in range(3)]
        nrm = (u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0])
        out.append(q if nrm[0] * -a[0] + nrm[1] * -a[1] + nrm[2] * 400 >= 0 else tuple(reversed(q)))
    vis('far', 'wood').add((v, out), kind='flag')


# ---------------------------------------------------------------- race metadata

def half_width_at(p):
    """Usable half width at a line point: clearance to the nearest standing solid."""
    best = 9.0
    for name, x0, x1, y0, y1, z0, z1 in SOLIDS:
        if z1 <= .02 or z0 > TOY_CLEAR or name in FLOOR_NAMES or name in RAMPS:
            continue
        dx, dy = max(x0 - p[0], 0, p[0] - x1), max(y0 - p[1], 0, p[1] - y1)
        best = min(best, math.hypot(dx, dy))
    return best


FLOOR_NAMES = set()


def ai_phase(step, count):
    """Pick the sampling phase that keeps linear interpolation between neighbouring nodes within
    4 cm of the slide surface (the validator probes node midpoints)."""
    best = None
    for k in range(int(step * 10)):
        ph = k / 10
        worst = 0.0
        for i in range(count):
            d0, d1 = ph + i * step, ph + (i + 1) * step
            p0, _, _ = ROUTE.at(d0)
            p1, _, _ = ROUTE.at(d1)
            pm, _, _ = ROUTE.at((d0 + d1) / 2)
            z0, z1 = ground_z(*p0), ground_z(*p1)
            zm_line = (z0 + z1) / 2
            q = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
            worst = max(worst, abs(zm_line - ground_z(*q)))
        if best is None or worst < best[0] - 1e-6:
            best = (worst, ph)
    return best


def race_markers():
    gates = []
    for i, q in enumerate(GATES):
        d = ROUTE.nearest(q) if i else 0.0
        p, t, _ = ROUTE.at(d)
        hw = max(1.4, min(2.6, half_width_at(p) - .3))
        gates.append(marker(f'GATE_{i:02d}', (p[0], p[1], ground_z(*p)), t, (hw, 1, 1),
                            {'lap_order': i, 'track_distance_m': round(d, 2), 'half_width_m': round(hw, 2)}, 'SINGLE_ARROW'))
    p, t, n = ROUTE.at(0)
    for k, (back, lat) in enumerate(((3, 1.1), (3, -1.1), (6, 1.1), (6, -1.1)), start=1):
        marker(f'START_{k}', (p[0] - t[0] * back + n[0] * lat, p[1] - t[1] * back + n[1] * lat, 0), t,
               extras={'grid_slot': k, 'player': k == 1}, display='SINGLE_ARROW')
    count = round(ROUTE.length / 6.2)
    step = ROUTE.length / count
    worst, phase = ai_phase(step, count)
    print('SCHOOL_AI_PHASE', round(phase, 2), 'worst midpoint error', round(worst, 3))
    assert worst < .045, worst
    widths = []
    for k in range(count):
        d = phase + k * step
        p, t, _ = ROUTE.at(d)
        hw = max(.7, min(2.6, half_width_at(p) - .35))
        widths.append(hw)
        marker(f'AI_{k:03d}', (p[0], p[1], ground_z(*p)), t, (hw, 1, 1), {'track_distance_m': round(d, 2)}, 'SINGLE_ARROW')
    picks = [(12, 18), (12, 52), (-30, 68), (-42, 56), (-26, 10), (-26, -6), (-6, -38), (24, -27.5), (12, -12)]
    picks = [ROUTE.at(ROUTE.nearest(q))[0] for q in picks]
    picks = [(x, y, ground_z(x, y) + .3) for x, y in picks] + [(4.6, 40.8, .3)]
    for k, at in enumerate(picks, start=1):
        marker(f'PICKUP_{k:02d}', at, extras={'route': 'shortcut' if k > 9 else 'main'}, display='SPHERE')
    marker('SPEC_01', (23.0, 42.0, .3), extras={'hint': 'science room: the DESERT PLANTS display (drive in one door, out the other)'},
           display='CUBE')
    # Skill shortcuts (ALT_<name>_NNN): the library diagonal and the planter run.
    ai_xy = [ROUTE.at(phase + k * step)[0] for k in range(count)]
    (ax, ay), (bx, by) = SC_LANE
    lib = [(12, 27), (12, 30), (11.4, 32.2), (9.6, 33.7), (7.0, 35.2)]
    lib += [(ax + (bx - ax) * k / 9, ay + (by - ay) * k / 9) for k in range(1, 9)]
    lib += [(-4.3, 61.6), (-4.3, 63.6), (-4.3, 65.65), (-5.4, 67.4), (-8.0, 68.0), (-11.5, 68.0)]
    lib_speed = [7, 6, 4.5, 4.5, 5.5] + [7.5] * 8 + [6, 4.5, 4, 3.5, 5, 7]
    C.alt_route('library', lib, ai_xy, lib_speed, half=1.5)
    run = [(5.0, -38.0)] + RUN_PTS[:5] + [(13.2, -28.11)] + RUN_PTS[6:] + [(12.4, -18.0)]
    C.alt_route('planter', run, ai_xy, [7, 5, 4.5, 4.5, 3.0, 5.5, 5.5, 5.0, 4.5, 5.0, 7], half=RUN_W / 2, gaps={6})
    sc = lib
    coins()
    marker('CAM_library_shortcut', (5.5, 37.0, .5), (bx - ax, by - ay), extras={'note': 'diagonal under the hanging model F-16'})
    marker('CAM_table_tunnel', (-26, 37.5, .45), (0, -1), extras={'note': 'low chase hint under the cafeteria tables'})
    marker('CAM_racing_slide', (-26, -8.5, .6), (0, -1), extras={'note': 'up the racing slide, over the deck'})
    marker('CAM_science_room', (16, 38.7, .5), (1, 0), extras={'note': 'science pocket, DESERT PLANTS'})
    return gates, step, count, widths, len(sc)


def coins():
    """Five challenge coins, each a short detour off the lap (see tools/rc/coins-reachable.test.mjs)."""
    (ax, ay), (bx, by) = SC_LANE
    mid = (ax + (bx - ax) * .5, ay + (by - ay) * .5)
    C.coin(1, (mid[0], mid[1], .25), [(12, 27), (12, 30), (11.4, 32.2), (9.6, 33.7), (7.0, 35.2)],
           [(-4.3, 61.6), (-4.3, 63.6), (-4.3, 65.65), (-5.4, 67.4), (-8.0, 68.0)],
           'library shortcut: on the reading rug path, under the hanging model F-16')
    C.coin(2, (-47.0, 57.0, .25), [(-42, 63), (-45.5, 60)], [(-46.5, 53.5), (-42.5, 50.5)],
           'gym: under the west basketball hoop')
    C.coin(3, (-14.0, 24.0, .25), [(-21.5, 14.0), (-18.5, 20.8), (-14.0, 21.2)],
           [(-14.0, 26.9), (-19.5, 26.9), (-21.0, 20.0), (-21.5, 14.0), (-26, 8)],
           'cafeteria: under a side table, chairs stacked on top')
    hill_top = .45 + .25
    C.coin(4, (-37.0, -24.0, hill_top), [(-26, -29), (-33, -29.5), (-37, -27.6)], [(-37, -20.2), (-33.5, -19.5), (-30, -22.5), (-28.5, -28)],
           'playground: on top of the tot-lot hill')
    C.coin(5, (-3.0, -42.6, .25), [(-7, -38.3), (-4.6, -40.2)], [(-1.2, -41.5), (-.5, -38.8)],
           'in the sandbox, under the orange sail')


def clearance_report(widths):
    tight = []
    for name, x0, x1, y0, y1, z0, z1 in SOLIDS:
        if z1 <= .02 or z0 > TOY_CLEAR or name in FLOOR_NAMES or name in RAMPS:
            continue
        d = min(math.hypot(max(x0 - p[0], 0, p[0] - x1), max(y0 - p[1], 0, p[1] - y1)) for p in ROUTE.pts[::2])
        if d < 1.3:
            tight.append((round(d, 2), name))
    tight.sort()
    print('SCHOOL_CLEARANCE', tight[:40])
    print('SCHOOL_HALF_WIDTHS min %.2f max %.2f' % (min(widths), max(widths)))
    return tight


def apply_emission():
    for name, m in C._MATS.items():
        k = EMISSION.get(name, EMISSION_DEFAULT)
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        base = bsdf.inputs['Base Color'].default_value
        tint = (1, 1, 1) if name in EMISSION else WARM
        bsdf.inputs['Emission Color'].default_value = (base[0] * k * tint[0], base[1] * k * tint[1], base[2] * k * tint[2], 1)
        bsdf.inputs['Emission Strength'].default_value = 1.0


def build():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    C.ROOT = marker('School_Root', (0, 0, 0))
    C.ROOT.parent = None
    n0 = len(SOLIDS)
    floors()
    FLOOR_NAMES.update(s[0] for s in SOLIDS[n0:])
    shell()
    ceilings()
    hallways()
    lobby()
    science()
    library()
    gym()
    cafeteria()
    playground()
    front_walk()
    horizon()
    gates, ai_step, ai_count, widths, sc_n = race_markers()
    tight = clearance_report(widths)
    C.ROOT['district'] = 'school'
    C.ROOT['base'] = 'Saucer Springs AFB (fictional)'
    C.ROOT['school'] = 'SAUCER SPRINGS ELEMENTARY, HOME OF THE ROCKETS (fictional)'
    C.ROOT['lap_length_m'] = round(ROUTE.length, 2)
    C.ROOT['race_direction'] = 'lobby north, halls, gym, cafeteria south, playground, front walk; see school.py docstring'
    C.ROOT['shortcut'] = 'north hallway -> library diagonal (model F-16) -> west hallway'
    return {'ai_count': ai_count, 'ai_spacing_m': round(ai_step, 2), 'gates': len(gates), 'tight': tight, 'shortcut_nodes': sc_n}


INDOOR_SHOTS = [
    ('lobby-start', (12, 4.2, .3), (12, 30, .9), 22),
    ('hallway-lockers', (12, 17, .25), (12, 50, 1.0), 22),
    ('pcs-card-wall', (11.0, 50.5, .5), (14.2, 56, 1.5), 22),
    ('science-plants', (16.5, 39.0, .4), (26, 42.5, 1.2), 22),
    ('library-shortcut', (8.6, 33.9, .35), (-4.3, 62, 1.5), 20),
    ('gym-parachute', (-11.5, 68.0, .35), (-42, 64, .8), 20),
    ('gym-wide', (-12, 42.5, 3.2), (-40, 66, .6), 18),
    ('cafeteria-tunnel', (-26, 38.6, .22), (-26, 10, .5), 20),
]
OUTDOOR_SHOTS = [
    ('overview', (70, -125, 110), (-12, 18, 0), 30),
    ('playground-slide', (-26, -4.5, .35), (-26, -24, .5), 22),
    ('slide-side', (-19.5, -12, 1.4), (-27, -17, .3), 24),
    ('monkey-bars-sandbox', (-24, -36.5, .45), (2, -41, .8), 22),
    ('front-entrance', (21, -24, 1.2), (12, 0, 2.0), 22),
]


def render(glb, out):
    """Review renders of the exported GLB (re-imported). Interior views: sun blocked, dim sky,
    baked emission; outdoor views keep the sun. Labelled Blender review renders, not in-engine."""
    C.render_glb(glb, out, [])
    scene = bpy.context.scene
    cam = scene.camera
    from mathutils import Vector
    written = []
    out = Path(out)
    lights = [o for o in scene.objects if o.type == 'LIGHT']
    for shots, indoor in ((INDOOR_SHOTS, True), (OUTDOOR_SHOTS, False)):
        scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6 if indoor else 1.5
        for o in lights:
            o.data.energy = 0.0 if indoor else 3.6
        for name, eye, target, lens in shots:
            cam.location = eye
            cam.data.lens = lens
            cam.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
            scene.render.filepath = str((out / f'{name}.png').resolve())
            bpy.ops.render.render(write_still=True)
            written.append(scene.render.filepath)
    return written


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--blend', type=Path, default=REPO / 'assets/rc/districts/school.blend')
    ap.add_argument('--render', type=Path)
    ap.add_argument('--render-only', action='store_true')
    ap.add_argument('--no-bake', action='store_true')
    ap.add_argument('--no-blend', action='store_true')
    args = ap.parse_args(argv)
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    glb = out / 'school.glb'
    if not args.render_only:
        info = build()
        objs = C.flush_visuals()
        apply_emission()
        bake = None if args.no_bake else C.bake_ao(objs)
        if not args.no_blend:
            args.blend.parent.mkdir(parents=True, exist_ok=True)
            bpy.context.preferences.filepaths.save_version = 0
            bpy.ops.wm.save_as_mainfile(filepath=str(args.blend.resolve()), compress=True)
        stats = C.counts()
        C.join_visuals_by_material()
        C.export_glb(glb)
        C.write_provenance(out / 'school.provenance.json', {
            'script': 'school.py', 'district': 'school', 'version': 1,
            'editable_source': 'assets/rc/districts/school.blend',
            'lap_length_m': round(ROUTE.length, 2), 'gates': info['gates'], 'ai_nodes': info['ai_count'],
            'ai_spacing_m': info['ai_spacing_m'], 'shortcut_nodes': info['shortcut_nodes'], **stats,
            'lettering': "mesh text from Blender's bundled UI font (no textures)",
            'cultural_references': 'fictional, kid-safe; docs/research/area51-usaf-nellis-vegas-references.md section A; '
                                   'section B avoided (no DoDEA/USAF/unit marks, no real brands); Month of the Military '
                                   'Child (April, purple) is a generic tradition',
            'interior_lighting': 'materials carry emission = albedo x 0.5 (warm), ceiling 0.78, troffers 1.0; outdoor-only '
                                 'materials (stucco, rubber, sand, concrete) 0.12-0.15, since the game sun is shadowed indoors',
            'vertex_ao': bake or 'not baked (--no-bake)',
            'vertex_ao_method': 'Cycles AO bake to per-corner BYTE_COLOR attribute "AO", exported as COLOR_0; '
                                'remapped to floor..1. Real bake, no painted shading. Decals, ceilings and the far '
                                'backdrop are left at 1.0 (not baked).',
            'glb_bytes': glb.stat().st_size})
        print('SCHOOL_EXPORT', glb, glb.stat().st_size, stats, 'lap', round(ROUTE.length, 1))
    if args.render:
        print('SCHOOL_RENDERS', render(glb, args.render))


if __name__ == '__main__':
    main()
