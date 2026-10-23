"""Saucer Springs AFB district 2: the Base Exchange (fictional).

Run (shared machine: wrap in heavy-slot, two threads):
  HEAVY_SLOT_LABEL=area51 heavy-slot -- /Applications/Blender.app/Contents/MacOS/Blender --background \
    --factory-startup --threads 2 --python tools/rc/blender/districts/bx.py -- \
    --out web/wwwroot/rc/assets/districts [--render evidence/area51/bx]
  ... --python tools/rc/blender/districts/bx.py -- --out DIR --render-only --render evidence/area51/bx

Modelled on the real Nellis AFB main exchange interior (12 CC BY 2.0 USAF photos of the 2015
remodel, docs/research/area51-nellis-photo-reference.md): a 2x2 ft drop-tile ceiling with long
rows of 2x4 troffers, glossy amber polished concrete on the concourse and food court, honey
wood-look laminate in soft goods, grey carpet in women's apparel, black gondolas with orange
header bands, pale-maple electronics islands with stainless tops, a lowered FOOD COURT soffit,
mosaic-tile counters, a coffee counter, blue checkout lanes, square cream columns, a central
light well and a hero mural at the entrance. Every name and mark is invented (no Exchange logo,
no tenant or product brands, no USAF symbol); section B of
docs/research/area51-usaf-nellis-vegas-references.md is respected.

Layout (Blender metres, +Z up, X east, Y north; real scale; toy car 0.42 m long):
  lobby       y -43 .. -34.3   start/finish, mural on the west wall, cart corral
  store       x -52 .. 52, y -34.3 .. 24, ceiling 4.2 m
  stockroom   x -36 .. 30, y 24.3 .. 33, behind the back wall, two swinging-door openings

Lap (~317 m): lobby west -> entrance doors -> concourse (light well) -> main aisle north between
gondolas -> ZONE TECH electronics island weave -> TOY HANGAR corner (giant RC buggy cutout) -> toy
aisle east (model aircraft) -> soft-goods U (laminate, then carpet) -> FOOD COURT, under a row of
mess tables -> past the MILITARY CLEARANCE racks -> checkout lane 3 -> exit doors -> lobby.

Shortcut: from the toy aisle, through the swinging doors into the stockroom, up a flattened-box
ramp over a pallet deck (alien specimen on top) and out the second swinging doors into the food
court. ~75 m instead of ~96 m; no gate sits in the skipped U.

Kid rules: every aisle on the lap has >= 3 m clear; every floor is flush (z = 0, collision slabs
abut); everything standing on the floor is >= 0.3 m tall (a wall, never a wheel trap); the only
overhead geometry the line passes under (mess-table tops) is wholly above 0.7 m.
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
                    polygon_slab, transform, wedge, grid_region, hexa, text2d, place_flat)

REPO = Path(__file__).resolve().parents[4]
H = 4.2                      # ceiling height
TOY_CLEAR = .45              # anything wholly above this is overhead for the toy car

C.PALETTE.update({
    'polish': ('#B8955C', 0, .22), 'laminate': ('#C99A5B', 0, .45), 'carpet': ('#8C8A84', 0, .98),
    'concrete': ('#A9A59C', 0, .9), 'ceiling': ('#E8E4D6', 0, .9), 'troffer': ('#FFF9EE', 0, .4),
    'wall': ('#EDE6A8', 0, .9), 'olive': ('#A89A2E', 0, .85), 'orange': ('#D2693A', 0, .7),
    'veneer': ('#6B3A22', 0, .6), 'black': ('#1E1E1E', 0, .55), 'header': ('#E9A820', 0, .5),
    'white': ('#F4F2EC', 0, .6), 'steel': ('#B8BCC0', .7, .32), 'maple': ('#D8B98A', 0, .55),
    'blue': ('#2350B0', 0, .5), 'navy': ('#1C2A52', 0, .5), 'red': ('#C8352E', 0, .5),
    'green': ('#3FA34D', 0, .55), 'cardboard': ('#B98A55', 0, .85), 'glass': ('#A9D3E6', .1, .12),
    'grey': ('#6E6E70', 0, .7), 'magenta': ('#D93A8C', 0, .5), 'hivis': ('#DDF22E', 0, .35),
})

# Store lighting. In the game the sun casts shadows from every district mesh, so under the
# ceiling only the hemisphere light reaches; the fluorescent troffers are represented honestly
# as emission: troffers glow, the ceiling is lit by them, and every interior surface carries a
# warm self-illumination of a fraction of its own albedo (the even, bright store look).
EMISSION = {'troffer': 1.0, 'ceiling': .78, 'glass': .85}
EMISSION_DEFAULT = .5
WARM = (1.0, .95, .86)

PRODUCTS = ['white', 'red', 'blue', 'header', 'green', 'orange', 'cardboard', 'magenta', 'hivis', 'navy', 'white', 'blue']
RNG = random.Random(51.5)
SOLIDS = []                  # (label, x0, x1, y0, y1, zmin, zmax) for the route clearance check


# ---------------------------------------------------------------- collision with bookkeeping

def col(surface, label, part, extras=None):
    o = C.col(surface, label, part, extras)
    vs = part[0] if not isinstance(part, C.Geo) else part.v
    xs, ys, zs = [p[0] for p in vs], [p[1] for p in vs], [p[2] for p in vs]
    SOLIDS.append((o.name, min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)))
    return o


# ---------------------------------------------------------------- the lap

Route = C.Route


CORNERS = [(-28, -38.6), (-28, 0), (-37, 2.5), (-47, -.5), (-47, 16), (-19, 16), (-19, -8), (14, -8), (14, 19),
           (41.5, 19), (41.5, -18.5), (12, -18.5), (12, -38.6)]
RADII = [4, 4, 6, 5, 4.5, 4.5, 4.5, 4.5, 4.5, 5, 5, 4.5, 4]
ROUTE = Route(CORNERS, RADII)
ROUTE.d0 = 0.0
ROUTE.d0 = ROUTE.nearest((0, -38.6))
GATES = [(0, -38.6), (-28, -28), (-28, -12), (-38, 2.2), (-47, 8), (-38, 16), (41.5, 13), (41.5, -10.5), (26, -18.5), (12, -28.5)]


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


def words(mat, body, size, centre, facing, max_w=None, bold=.02, out=.01, group='decal'):
    v, f, w = text2d(body, size, bold=bold)
    sc = min(1.0, max_w / w) if max_w and w else 1.0
    vis(group, mat).add(place_flat(v, f, centre, facing, out=out, scale=sc), kind='flag')


def hanging_sign(label, cx, cy, facing, w, h, z0, lines, board='black', poles=True):
    """Ceiling-hung two-sided department sign (no collision: wholly above the car)."""
    yaw = math.radians(facing + 90)
    vis('signs', board).add(box(cx, cy, z0, w, .06, h, yaw))
    zc = z0 + h / 2
    for text, size, mat, dz in lines:
        for f in (facing, facing + 180):
            words(mat, text, size, (cx, cy, zc + dz), f, max_w=w * .9, out=.036)
    if poles:
        a = math.radians(facing)
        r = (-math.sin(a), math.cos(a))
        for k in (-w * .35, w * .35):
            vis('signs', 'steel').add(cylinder((cx + r[0] * k, cy + r[1] * k, z0 + h), .02, H - z0 - h, 6))


# ---------------------------------------------------------------- floors, walls, ceiling

FLOORS = [  # x0, x1, y0, y1, surface, visual material
    (-52, 52, -34.3, -11.8, 'tile', 'polish'),
    (-52, -23.5, -11.8, 24, 'tile', 'polish'),
    (-23.5, 10.5, -11.8, 24, 'wood', 'laminate'),
    (10.5, 18, -11.8, 13, 'carpet', 'carpet'),
    (10.5, 18, 13, 24, 'wood', 'laminate'),
    (18, 52, -11.8, 24, 'tile', 'polish'),
    (-36, 22, -43, -34.3, 'tile', 'polish'),
    (-36, 30, 24, 33, 'concrete', 'concrete'),
]


def floors():
    for i, (x0, x1, y0, y1, surf, mat) in enumerate(FLOORS):
        vis('floor', mat).add(grid_region(x0, x1, y0, y1, 1.0,
                                          lambda p, r=(x0, x1, y0, y1): r[0] <= p[0] <= r[1] and r[2] <= p[1] <= r[3],
                                          lambda p, r=(x0, x1, y0, y1): (min(max(p[0], r[0]), r[1]), min(max(p[1], r[2]), r[3])),
                                          0.0), kind='up')
        col(surf, f'floor_{i}', aabb(x0, x1, y0, y1, -.3, 0))
        if mat == 'polish':          # saw-cut joints every 4.8 m
            x = math.ceil(x0 / 4.8) * 4.8
            while x < x1:
                flat_up('decal', 'grey', x - .006, x + .006, y0, y1, .0015)
                x += 4.8
            y = math.ceil(y0 / 4.8) * 4.8
            while y < y1:
                flat_up('decal', 'grey', x0, x1, y - .006, y + .006, .0015)
                y += 4.8
        if mat == 'laminate':        # plank seams every 1.22 m across the boards
            x = math.ceil(x0 / 1.22) * 1.22
            while x < x1:
                flat_up('decal', 'veneer', x - .004, x + .004, y0, y1, .0012)
                x += 1.22
    # Walk-off mats at both inner door openings and the outer doors (paint-thin, visual only).
    for x0, x1, y0, y1 in ((-33, -23, -37.6, -34.4), (6, 16, -37.6, -34.4), (-12, -4, -42.9, -40.6)):
        flat_up('decal', 'grey', x0, x1, y0, y1, .004)
        flat_up('decal', 'black', x0 + .15, x1 - .15, y0 + .15, y1 - .15, .005)


def wall(label, x0, x1, y0, y1, mat='wall', h=H, base=True, collide=True, surface='concrete'):
    vis('walls', mat).add(aabb(x0, x1, y0, y1, 0, h))
    if base and mat == 'wall':
        vis('walls', 'grey').add(aabb(x0 - .015, x1 + .015, y0 - .015, y1 + .015, 0, .1))
    if collide:
        col(surface, label, aabb(x0, x1, y0, y1, -.3, h))


def shell():
    t = .3
    # Store perimeter.
    wall('store_w', -52 - t, -52, -34.3, 24.3)
    wall('store_e', 52, 52 + t, -34.3, 24.3)
    for i, (x0, x1) in enumerate(((-52, -32), (-28, 22), (26, 52))):        # back wall, two door gaps
        wall(f'store_back_{i}', x0, x1, 24, 24 + t)
    for i, (x0, x1) in enumerate(((-52, -34), (-22, 5), (17, 52))):         # front wall, two door gaps
        wall(f'store_front_{i}', x0, x1, -34.3, -34)
    for x0, x1 in ((-32, -28), (22, 26), (-34, -22), (5, 17)):                # headers over the openings
        y0, y1 = ((24, 24 + t) if x0 in (-32, 22) else (-34.3, -34))
        vis('walls', 'wall').add(aabb(x0, x1, y0, y1, 2.6 if x0 in (-32, 22) else 3.1, H))
    # Lobby: mural wall west, end wall east, glass storefront south.
    wall('lobby_w', -36 - t, -36, -43, -34.3)
    wall('lobby_e', 22, 22 + t, -43, -34.3)
    col('concrete', 'lobby_storefront', aabb(-36, 22, -43 - t, -43, -.3, H))
    vis('walls', 'grey').add(aabb(-36, 22, -43 - t, -43, 0, .45))
    vis('walls', 'wall').add(aabb(-36, 22, -43 - t, -43, 3.3, H))
    vis('walls', 'glass').add(aabb(-36, 22, -43 - .2, -43 - .1, .45, 3.3))
    x = -36.0
    while x <= 22.01:
        vis('walls', 'steel').add(aabb(x - .05, x + .05, -43 - .24, -43 + .02, .45, 3.3))
        x += 1.6
    vis('walls', 'steel').add(aabb(-36, 22, -43 - .24, -43 + .03, 2.4, 2.48))
    for xd in (-12, -8, -4):                                                   # outer doors (closed)
        vis('walls', 'steel').add(aabb(xd - .04, xd + .04, -43 + .02, -43 + .05, .02, 2.4))
    words('white', 'PUSH-PULL? NO. AUTOMATIC.', .09, (-8, -43, 2.2), 90, max_w=3, out=.06)
    # Stockroom: plain CMU.
    wall('stock_w', -36 - t, -36, 24.3, 33 + t, 'concrete')
    wall('stock_e', 30, 30 + t, 24.3, 33 + t, 'concrete')
    wall('stock_n', -36, 30, 33, 33 + t, 'concrete')
    for x0, x1 in ((-36, -32), (-28, 22), (26, 30)):        # stockroom face of the back wall is CMU
        vis('walls', 'concrete').add(aabb(x0, x1, 24.3, 24.31, 0, H))
    # Columns: square, cream, grey base trim (the photos' structural bay).
    for i, (cx, cy) in enumerate(((-44, -28), (-12, -28), (26, -30.5), (-40, 7.6), (24, 8.5), (-38, -6.5))):
        vis('columns', 'wall').add(box(cx, cy, 0, .6, .6, H))
        vis('columns', 'grey').add(box(cx, cy, 0, .64, .64, .12))
        col('concrete', f'column_{i}', box(cx, cy, -.3, .64, .64, H + .3))


CEIL_HOLE = (-31, -25, -31, -25)        # light well over the concourse


def ceiling():
    rects = [(-52, 52, -34.3, 24), (-36, 22, -43, -34.3), (-36, 30, 24.3, 33)]
    hx0, hx1, hy0, hy1 = CEIL_HOLE
    pieces = []
    for x0, x1, y0, y1 in rects:
        if x0 < hx0 and x1 > hx1 and y0 < hy0 and y1 > hy1:
            pieces += [(x0, x1, y0, hy0), (x0, x1, hy1, y1), (x0, hx0, hy0, hy1), (hx1, x1, hy0, hy1)]
        else:
            pieces.append((x0, x1, y0, y1))
    for x0, x1, y0, y1 in pieces:
        if y0 >= 24.3:                                     # stockroom: open deck, painted grey
            flat_down('decal', 'concrete', x0, x1, y0, y1, H)
            for k in range(int((x1 - x0) / 3)):
                vis('decal', 'grey').add(aabb(x0 + 1.5 + k * 3, x0 + 1.62 + k * 3, y0, y1, H - .35, H - .001))
            continue
        flat_down('decal', 'ceiling', x0, x1, y0, y1, H)
        x = math.ceil(x0 / .61) * .61                      # 2 x 2 ft T-bar grid
        while x < x1:
            flat_down('decal', 'steel', x - .012, x + .012, y0, y1, H - .004)
            x += .61
        y = math.ceil(y0 / .61) * .61
        while y < y1:
            flat_down('decal', 'steel', x0, x1, y - .012, y + .012, H - .004)
            y += .61
    # 2 x 4 ft troffers, long axis north-south, in regular rows (the "runway" the photos show).
    for x0, x1, y0, y1 in pieces:
        if y0 >= 24.3:                                     # stockroom: bare strip lights
            for ys in (26.9, 30.3):
                x = x0 + 1.5
                while x < x1 - 2.5:
                    flat_down('decal', 'troffer', x, x + 2.4, ys - .07, ys + .07, H - .36)
                    x += 3.6
            continue
        px, py = (2.44, 3.05)
        x = math.floor(x0 / px) * px + px / 2
        while x < x1 - .4:
            y = math.floor(y0 / py) * py + py / 2
            while y < y1 - .7:
                if x > x0 + .4 and y > y0 + .7:
                    flat_down('decal', 'troffer', x - .3, x + .3, y - .6, y + .6, H - .006)
                y += py
            x += px
    # Light well: a raised square with a skylight and a lantern pendant.
    for f, c, w in ((90, ((hx0 + hx1) / 2, hy0), hx1 - hx0), (270, ((hx0 + hx1) / 2, hy1), hx1 - hx0),
                    (0, (hx0, (hy0 + hy1) / 2), hy1 - hy0), (180, (hx1, (hy0 + hy1) / 2), hy1 - hy0)):
        panel('decal', 'ceiling', c, f, w, 1.3, H)
    flat_down('decal', 'troffer', hx0, hx1, hy0, hy1, H + 1.3)
    cx, cy = (hx0 + hx1) / 2, (hy0 + hy1) / 2
    vis('decal', 'steel').add(cylinder((cx, cy, 3.0), .015, H + 1.3 - 3.0, 6))
    vis('decal', 'white').add(frustum((cx, cy, 2.55), .55, .25, .5, 16))
    vis('decal', 'troffer').add(cylinder((cx, cy, 2.53), .5, .02, 16, smooth=False))
    # FOOD COURT soffit (lowered bulkhead) along the food court's west edge.
    vis('soffit', 'navy').add(aabb(18.2, 19.4, -11.8, 24, 3.25, H))
    vis('soffit', 'veneer').add(aabb(18.15, 18.2, -11.8, 24, 3.25, H))
    words('white', 'FOOD COURT', .42, (18.15, 19.5, 3.72), 180, max_w=5, out=.01)
    words('header', 'TABLES ARE TUNNELS', .16, (18.15, 19.5, 3.38), 180, max_w=4, out=.01)
    words('white', 'FOOD COURT', .42, (19.4, 2, 3.72), 0, max_w=5, out=.01)


# ---------------------------------------------------------------- gondolas and wall shelving

def _frame(x0, x1, y0, y1):
    """Local frame for an axis-aligned fixture: u along the long axis, v across (v>0 = side +1)."""
    if x1 - x0 >= y1 - y0:
        yc = (y0 + y1) / 2
        return x1 - x0, y1 - y0, (lambda u, v, z: (x0 + u, yc + v, z)), (0, 1), (1, 0)
    xc = (x0 + x1) / 2
    return y1 - y0, x1 - x0, (lambda u, v, z: (xc + v, y0 + u, z)), (1, 0), (0, 1)


def _quad(group, mat, P, a, b, c, d, want):
    v = [P(*a), P(*b), P(*c), P(*d)]
    e1 = [v[1][i] - v[0][i] for i in range(3)]
    e2 = [v[2][i] - v[1][i] for i in range(3)]
    n = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
    f = (0, 1, 2, 3) if n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0 else (3, 2, 1, 0)
    vis(group, mat).add((v, [f]), kind='flag')


def stock_shelf(group, P, side_dir, L, v_in, v_out, levels, kind, rng, side_sign, bare=False):
    """Shelves and merchandise on one face. v from v_in (spine) to v_out (front, signed)."""
    s = side_sign
    for li, z in enumerate(levels):
        _quad(group, 'black', P, (0, v_in, z), (L, v_in, z), (L, v_out, z), (0, v_out, z), (0, 0, 1))
        _quad(group, 'black', P, (0, v_out, z - .05), (L, v_out, z - .05), (L, v_out, z), (0, v_out, z), side_dir)
        _quad(group, 'white', P, (0, v_out + s * .002, z - .04), (L, v_out + s * .002, z - .04),
              (L, v_out + s * .002, z - .015), (0, v_out + s * .002, z - .015), side_dir)
        top = levels[li + 1] - .08 if li + 1 < len(levels) else z + .32
        u = .04
        while u < L - .15 and not bare:
            w = rng.uniform(.22, .55) if kind != 'shoes' else .34
            w = min(w, L - .04 - u)
            hgt = min(top - z - .02, rng.uniform(.16, .34) if kind not in ('shoes', 'blouses') else .13)
            mat = {'shoes': 'black', 'blouses': 'white'}.get(kind) or rng.choice(PRODUCTS)
            vf = v_out - s * .03
            _quad(group, mat, P, (u, vf, z), (u + w, vf, z), (u + w, vf, z + hgt), (u, vf, z + hgt), side_dir)
            _quad(group, mat, P, (u, vf, z + hgt), (u + w, vf, z + hgt), (u + w, v_in + s * .02, z + hgt),
                  (u, v_in + s * .02, z + hgt), (0, 0, 1))
            if kind == 'shoes':
                _quad(group, 'white', P, (u + .05, vf + s * .002, z + .04), (u + .2, vf + s * .002, z + .04),
                      (u + .2, vf + s * .002, z + .08), (u + .05, vf + s * .002, z + .08), side_dir)
            u += w + .03


def gondola(label, x0, x1, y0, y1, header=None, sides=(True, True), kind='goods', h=1.85, endcaps=(True, True),
            header_mat='header', seed=0, bare=()):
    rng = random.Random(f'{label}{seed}')
    L, D, P, vdir, udir = _frame(x0, x1, y0, y1)
    g = f'gondola_{label}'
    one = sides[0] != sides[1]
    vin = -D / 2 + .06 if one and sides[0] else 0
    v_spine = (-D / 2 + .06, -D / 2 + .16) if one and sides[0] else ((D / 2 - .16, D / 2 - .06) if one else (-.05, .05))
    vis(g, 'black').add(hexa([P(0, -D / 2, 0), P(L, -D / 2, 0), P(L, D / 2, 0), P(0, D / 2, 0),
                              P(0, -D / 2, .1), P(L, -D / 2, .1), P(L, D / 2, .1), P(0, D / 2, .1)]))
    sv0, sv1 = v_spine
    vis(g, 'black').add(hexa([P(0, sv0, 0), P(L, sv0, 0), P(L, sv1, 0), P(0, sv1, 0),
                              P(0, sv0, h), P(L, sv0, h), P(L, sv1, h), P(0, sv1, h)]))
    for k in range(int(L / 1.22) + 1):                                  # uprights
        u = min(L - .03, k * 1.22 + .03)
        vis(g, 'grey').add(hexa([P(u - .02, sv0 - .02, 0), P(u + .02, sv0 - .02, 0), P(u + .02, sv1 + .02, 0), P(u - .02, sv1 + .02, 0),
                                 P(u - .02, sv0 - .02, h), P(u + .02, sv0 - .02, h), P(u + .02, sv1 + .02, h), P(u - .02, sv1 + .02, h)]))
    levels = [.1, .5, .88, 1.26, 1.62] if kind != 'shoes' else [.1, .4, .7, 1.0, 1.3, 1.6]
    for sgn, on in zip((1, -1), sides):
        if not on:
            continue
        want = (vdir[0] * sgn, vdir[1] * sgn, 0)
        stock_shelf(g, P, want, L, (sv1 if sgn > 0 else sv0), sgn * (D / 2), levels, kind, rng, sgn, bare=sgn in bare)
    if header:
        hv0, hv1 = (sv0 - .04, sv1 + .04)
        vis(g, header_mat).add(hexa([P(0, hv0, h), P(L, hv0, h), P(L, hv1, h), P(0, hv1, h),
                                     P(0, hv0, h + .3), P(L, hv0, h + .3), P(L, hv1, h + .3), P(0, hv1, h + .3)]))
        for sgn, on in zip((1, -1), sides):
            if not on:
                continue
            for k in range(max(1, int(L // 9))):
                uc = L * (k + .5) / max(1, int(L // 9))
                c = P(uc, 0, 0)
                facing = math.degrees(math.atan2(vdir[1] * sgn, vdir[0] * sgn))
                off = (hv1 if sgn > 0 else -hv0) + .004
                words('white', header, .16, (c[0], c[1], h + .15), facing, max_w=min(L * .8, 5), out=off)
    for ui, on in zip((0, 1), endcaps):
        if not on:
            continue
        u_end = 0 if ui == 0 else L
        sg = -1 if ui == 0 else 1
        want = (udir[0] * sg, udir[1] * sg, 0)
        cap = ['red', 'header', 'blue', 'green', 'hivis'][rng.randrange(5)]
        for z in (.1, .62, 1.14):
            _quad(g, 'black', P, (u_end, -D / 2, z), (u_end + sg * .45, -D / 2, z), (u_end + sg * .45, D / 2, z), (u_end, D / 2, z), (0, 0, 1))
            n = 3
            for k in range(n):
                va, vb = -D / 2 + .04 + k * (D - .08) / n, -D / 2 + .04 + (k + 1) * (D - .08) / n - .03
                hh = .32
                _quad(g, cap if k != 1 else 'white', P, (u_end + sg * .42, va, z), (u_end + sg * .42, vb, z),
                      (u_end + sg * .42, vb, z + hh), (u_end + sg * .42, va, z + hh), want)
                _quad(g, cap if k != 1 else 'white', P, (u_end + sg * .42, va, z + hh), (u_end + sg * .42, vb, z + hh),
                      (u_end + sg * .05, vb, z + hh), (u_end + sg * .05, va, z + hh), (0, 0, 1))
        vis(g, 'black').add(hexa([P(u_end, -D / 2, 0), P(u_end + sg * .45, -D / 2, 0), P(u_end + sg * .45, D / 2, 0), P(u_end, D / 2, 0),
                                  P(u_end, -D / 2, .1), P(u_end + sg * .45, -D / 2, .1), P(u_end + sg * .45, D / 2, .1), P(u_end, D / 2, .1)]))
        vis(g, 'black').add(hexa([P(u_end, -D / 2, .1), P(u_end + sg * .04, -D / 2, .1), P(u_end + sg * .04, D / 2, .1), P(u_end, D / 2, .1),
                                  P(u_end, -D / 2, 1.7), P(u_end + sg * .04, -D / 2, 1.7), P(u_end + sg * .04, D / 2, 1.7), P(u_end, D / 2, 1.7)]))
    ex = [(.45 if endcaps[0] else 0), (.45 if endcaps[1] else 0)]
    a0, a1 = P(-ex[0], -D / 2, 0), P(L + ex[1], D / 2, 0)
    col('metal', f'gondola_{label}', aabb(min(a0[0], a1[0]), max(a0[0], a1[0]), min(a0[1], a1[1]), max(a0[1], a1[1]),
                                          -.3, h + (.3 if header else 0)))


def endcap_sign(cx, cy, facing, lines, board='red', w=1.1):
    """Card on a post above an endcap (decor; sits inside the gondola's collision)."""
    zc = 2.05
    vis('signs', board).add(box(cx, cy, 1.9, w, .03, .55, math.radians(facing + 90)))
    for text, size, mat, dz in lines:
        words(mat, text, size, (cx, cy, zc + .07 + dz), facing, max_w=w * .9, out=.02)


# ---------------------------------------------------------------- departments

def housewares_and_main_aisle():
    for i, xc in enumerate((-30.9, -35.3, -39.7, -44.1)):
        gondola(f'hw_{i}', xc - .6, xc + .6, -21, -9, header='HOUSEWARES' if i else 'HOME & HEARTH', seed=i)
    gondola('hb_main', -25.7, -24.5, -21, -9, header='HEALTH & BEAUTY')
    for i, xc in enumerate((-20.7, -16.3, -11.9, -7.5, -3.1, 1.3, 5.7)):
        gondola(f'hb_{i}', xc - .6, xc + .6, -21, -15.6, header=('SNACKS', 'PET', 'PAPER', 'HEALTH', 'BEAUTY', 'SEASONAL', 'TRAVEL')[i], seed=i)
    for i, xc in enumerate((30.5, 35, 39.5, 44)):
        gondola(f'mart_{i}', xc - .6, xc + .6, -30.5, -24, header=('DESERT MART', 'BEVERAGES', 'PANTRY', 'SNACKS')[i], seed=20 + i)
    gondola('wall_e', 51.2, 52, -33, -14, header='DESERT MART GROCERY', sides=(False, True), endcaps=(False, False))
    hanging_sign('desert_mart', 37, -21.5, 90, 3.2, .75, 2.75, [('DESERT MART', .28, 'white', .1), ('GROCERY · PCS SUPPLIES', .1, 'header', -.2)],
                 board='green')
    for row in range(3):                                   # PCS moving-box pallet display
        vis('pcs', 'cardboard').add(aabb(47.2 + row * .05, 49.2 - row * .05, -28.6 + row * .05, -27.4 - row * .05, row * .38, row * .38 + .36))
    words('black', 'PCS SEASON', .14, (48.2, -28.6, .95), 270, max_w=1.8, out=.003)
    words('red', 'MOVING BOXES', .1, (48.2, -28.6, .75), 270, max_w=1.8, out=.003)
    col('wood', 'pcs_boxes', aabb(47.2, 49.2, -28.6, -27.4, -.3, 1.14))
    gondola('wall_w', -52, -51.2, -21, -9, header='STORAGE & ORGANIZATION', sides=(True, False), endcaps=(False, False))
    # The famous endcap, facing the concourse as the car enters the main aisle.
    endcap_sign(-30.9, -21.5, 270, [('REFLECTIVE BELTS', .1, 'black', .12), ('NOW 2 FOR 1', .14, 'black', -.08)], board='hivis', w=1.15)
    for k in range(6):                      # belts hanging off the endcap face
        vis('props', 'hivis').add(aabb(-31.4 + k * .2, -31.32 + k * .2, -21.47, -21.45, .75, 1.5))
    endcap_sign(-25.1, -21.5, 270, [('PCS SEASON', .12, 'white', .1), ('BOXES & TAPE', .1, 'white', -.1)], board='blue')
    hanging_sign('pcs_sale', -28, -19.5, 270, 3.4, .75, 2.75, [('PCS SEASON SALE', .26, 'white', .12),
                                                                ('EVERYTHING MUST MOVE (YOU TOO)', .1, 'header', -.2)], board='red')


def electronics():
    # TV wall: screens facing west into ZONE TECH; its east face is soft goods.
    vis('tech', 'wall').add(aabb(-24.5, -23.5, -9, 10, 0, 3.4))
    vis('tech', 'grey').add(aabb(-23.515, -23.485, -9, 10, 0, .1))
    col('metal', 'tv_wall', aabb(-24.5, -23.5, -9, 10, -.3, 3.4))
    vis('tech', 'black').add(aabb(-24.52, -24.5, -9, 10, .3, 3.4))
    for j, z in enumerate((.9, 1.75)):
        for k in range(9):
            y = -8 + k * 2.05
            vis('tech', 'navy').add(aabb(-24.55, -24.52, y, y + 1.8, z, z + .78))
            vis('decal', ['blue', 'magenta', 'green', 'header'][(k + j) % 4]).add(
                aabb(-24.56, -24.555, y + .2, y + .9, z + .15, z + .5))
    words('header', 'ZONE TECH', .5, (-24.52, .5, 3.05), 180, max_w=6, out=.02)
    words('white', 'SOFT GOODS', .4, (-23.5, 1, 3.0), 0, max_w=6, out=.02)
    # Stadium islands: stainless tops on pale-maple wedge bases, laptops and tablets on top.
    for i, (cx, cy, L) in enumerate(((-33.5, -5.3, 6.4), (-41.5, 5.0, 6.4), (-33.0, 6.6, 5.0))):
        r = 1.1
        pts = []
        for k in range(10):
            a = -math.pi / 2 + math.pi * k / 9
            pts.append((cx + L / 2 - r + r * math.cos(a), cy + r * math.sin(a)))
        for k in range(10):
            a = math.pi / 2 + math.pi * k / 9
            pts.append((cx - L / 2 + r + r * math.cos(a), cy + r * math.sin(a)))
        vis('tech', 'steel').add(polygon_slab(pts, .86, .93))
        for k in range(4):
            x = cx - L / 2 + .8 + k * (L - 1.6) / 3
            vis('tech', 'maple').add(polygon_slab([(x - .5, cy - .75), (x + .5, cy - .75), (x + .32, cy + .75), (x - .32, cy + .75)], 0, .86))
        for k in range(int(L / .9)):
            x = cx - L / 2 + .6 + k * .9
            for sgn in (-1, 1):
                y = cy + sgn * .55
                vis('tech', 'black').add(box(x, y, .93, .34, .24, .015))
                v = [(x - .17, y + sgn * .12, .945), (x + .17, y + sgn * .12, .945), (x + .17, y + sgn * .2, 1.17), (x - .17, y + sgn * .2, 1.17)]
                vis('tech', 'black').add(hexa(v + [(p[0], p[1] + sgn * .012, p[2]) for p in v]))
                facing = 90 if sgn < 0 else 270
                panel('decal', ['blue', 'magenta', 'green'][(k + i) % 3], (x, y + sgn * .14 - sgn * .004, 0), facing, .3, .18, .965)
        col('metal', f'island_{i}', polygon_slab(pts, -.3, .93))
        hanging_sign(f'zone_tech_{i}', cx, cy, 0, 2.6, .8, 2.7,
                     [('ZONE', .3, 'white', .14), ('TECH', .3, 'header', -.18)])
    gondola('tech_wall', -52, -51.2, -6, 9, header='GAMING  ·  AUDIO  ·  CHARGERS', sides=(True, False), endcaps=(False, False))
    for k in range(4):                      # a big-screen wall over the tech wall shelving
        vis('tech', 'navy').add(aabb(-51.2, -51.15, -5 + k * 3.6, -2.2 + k * 3.6, 2.25, 3.75))


def toys():
    gondola('toy_s', -43, -24, 10.6, 11.8, header='TOY HANGAR', seed=3, kind='toys')
    gondola('toy_n1', -44, -32, 20.2, 21.4, header='MODEL AIRCRAFT', seed=4, bare=(-1,))
    gondola('toy_n2', -28, -22.5, 20.2, 21.4, header='TOY HANGAR', seed=5)
    # Model jets on the model-aircraft shelves (south face of toy_n1).
    for k in range(10):
        for z in (.5, .88, 1.26):
            x, y = -43.3 + k * 1.15, 20.45
            body = ['steel', 'grey', 'red', 'blue'][(k + int(z * 10)) % 4]
            vis('jets', body).add(cylinder((x - .2, y, z + .08), .035, .4, 8, 'X'))
            vis('jets', body).add(frustum((x + .2, y, z + .08), .035, .005, .1, 8, 'X'))
            vis('jets', body).add(polygon_slab([(x + .05, y), (x - .14, y - .17), (x - .19, y - .17), (x - .12, y)], z + .075, z + .085))
            vis('jets', body).add(polygon_slab([(x + .05, y), (x - .14, y + .17), (x - .19, y + .17), (x - .12, y)], z + .075, z + .085))
            vis('jets', 'glass').add(ico((x + .1, y, z + .11), .03, 1, (1.6, .8, .7)))
    # Stacked cans and boxes to knock into (static in v1; each stack is one wall-height solid).
    for i, (cx, cy) in enumerate(((-36.5, 12.45), (-27.5, 12.45), (-41, 19.6))):
        n = 4
        for row in range(n):
            for k in range(n - row):
                x = cx - (n - 1 - row) * .07 + k * .14 - (n - 1) * .07 + .2
                vis('cans', ['red', 'header', 'green', 'blue'][(row + k + i) % 4]).add(cylinder((x, cy, row * .16), .065, .16, 10))
                vis('cans', 'white').add(cylinder((x, cy, row * .16 + .05), .0655, .05, 10, smooth=True))
        col('metal', f'can_pyramid_{i}', aabb(cx - .55, cx + .45, cy - .1, cy + .1, -.3, .64))
    for i, (cx, cy) in enumerate(((-32, 12.6), (-24.6, 19.5))):
        for row in range(4):
            for k in range(3 - row // 2):
                x = cx - .5 + k * .5 + (row % 2) * .2
                vis('cans', ['blue', 'magenta', 'header', 'red'][(row + k) % 4]).add(aabb(x - .22, x + .22, cy - .2, cy + .2, row * .34, row * .34 + .33))
        col('wood', f'box_stack_{i}', aabb(cx - .75, cx + .75, cy - .2, cy + .2, -.3, 1.36))
    # Giant cardboard cutout of an RC buggy, facing the car as it comes north up the corner.
    cx, cy = -49.3, 21.6
    def fl(part):          # cutout plane: local x along, local y up, local z = thickness (world +y)
        return transform(part, lambda p: (cx + p[0], cy + p[2], p[1]))
    body = [(-1.3, .55), (-1.1, 1.0), (.2, 1.15), (1.2, .85), (1.35, .55)]
    vis('cutout', 'cardboard').add(fl(polygon_slab([(x, y) for x, y in body] + [(1.35, .4), (-1.3, .4)], 0, .03)))
    vis('cutout', 'red').add(fl(polygon_slab([(-1.0, .62), (-.85, .98), (.25, 1.08), (1.0, .82), (1.1, .62)], -.01, 0)))
    vis('cutout', 'header').add(fl(polygon_slab([(-1.45, 1.2), (-1.4, 1.45), (-.75, 1.45), (-.8, 1.2)], -.01, .02)))
    vis('cutout', 'cardboard').add(fl(polygon_slab([(-1.15, 1.0), (-1.05, 1.0), (-1.05, 1.25), (-1.15, 1.25)], 0, .03)))
    for wx in (-.85, .85):
        vis('cutout', 'black').add(fl(transform(cylinder((0, 0, 0), .42, .05, 18, 'Y', smooth=False), lambda p: (p[0] + wx, p[2] + .45, p[1] - .02))))
        vis('cutout', 'steel').add(fl(transform(cylinder((0, 0, 0), .16, .06, 12, 'Y', smooth=False), lambda p: (p[0] + wx, p[2] + .45, p[1] - .03))))
    words('white', 'RC RACER!', .22, (cx, cy - .04, .75), 270, max_w=1.4, out=0)
    words('black', 'BATTERIES NOT INCLUDED', .07, (cx, cy - .04, .5), 270, max_w=1.6, out=0)
    vis('cutout', 'cardboard').add(beam((cx - .4, cy + .03), (cx - .4, cy + .6), .05, 0, 1.0))
    col('wood', 'buggy_cutout', aabb(cx - 1.5, cx + 1.5, cy - .15, cy + .7, -.3, 1.5))
    # Sports corner behind the toy aisle: ball cage, bike rack.
    vis('sports', 'steel').add(aabb(-21.5, -19.3, 22.6, 23.9, 0, 1.4))
    for k in range(10):
        vis('sports', 'orange').add(ico((-21.3 + (k % 5) * .45, 23.0 + (k // 5) * .45, 1.42), .12, 1), smooth=True)
    col('metal', 'ball_cage', aabb(-21.5, -19.3, 22.6, 23.9, -.3, 1.5))
    hanging_sign('toy_hangar', -40, 16, 0, 3.0, .85, 2.7, [('TOY HANGAR', .3, 'white', .1), ('SQUADRON OF FUN', .12, 'header', -.22)],
                 board='green')
    # Slat wall and big letters over the toy corner.
    vis('toys_wall', 'orange').add(aabb(-51.98, -51.95, 10.5, 23.5, .3, 2.6))
    for k in range(18):
        vis('toys_wall', 'veneer').add(aabb(-51.95, -51.94, 10.5, 23.5, .4 + k * .12, .42 + k * .12))
    words('white', 'PLAY', .9, (-51.95, 17, 3.35), 0, max_w=5, out=.02)


def round_rack(cx, cy, label, colour):
    vis('racks', 'steel').add(cylinder((cx, cy, 0), .32, .03, 12, smooth=False))
    vis('racks', 'steel').add(cylinder((cx, cy, 0), .025, 1.32, 6))
    vis('racks', 'steel').add(torus((cx, cy, 1.32), .55, .015, 16, 4))
    alt = {'red': 'white', 'blue': 'navy', 'green': 'olive', 'magenta': 'white', 'header': 'orange', 'navy': 'grey',
           'white': 'blue', 'orange': 'red'}[colour]
    for k in range(18):
        a = 2 * math.pi * k / 18
        vis('racks', colour if k % 3 else alt).add(box(cx + .52 * math.cos(a), cy + .52 * math.sin(a), .58, .09, .3, .72,
                                                       a + math.pi / 2))
    col('metal', label, box(cx, cy, -.3, 1.3, 1.3, 1.65))


def mannequin(cx, cy, facing, colour):
    a = math.radians(facing)
    vis('manikins', 'white').add(cylinder((cx, cy, .3), .26, .02, 12, smooth=False))
    for s in (-1, 1):
        vis('manikins', 'black').add(frustum((cx - math.sin(a) * .09 * s, cy + math.cos(a) * .09 * s, .32), .06, .05, .8, 8))
    vis('manikins', colour).add(frustum((cx, cy, 1.1), .17, .21, .55, 10))
    vis('manikins', 'white').add(cylinder((cx, cy, 1.65), .04, .1, 6))
    vis('manikins', 'white').add(ico((cx, cy, 1.85), .1, 2, (.85, .85, 1.15)), smooth=True)


def soft_goods():
    # The solid block inside the U: shop walls 2.6 m tall, dressed on all three driven faces.
    bx0, bx1, by0, by1 = -15.5, 10.5, -1, 24
    # The block is split by the RUNWAY passage (y 15.8 .. 19.8, see runway()).
    for i, (ya, yb) in enumerate(((by0, RUNWAY_Y[0]), (RUNWAY_Y[1], by1))):
        vis('softblock', 'wall').add(aabb(bx0, bx1, ya, yb, 0, 2.6))
        vis('softblock', 'header').add(aabb(bx0 - .03, bx1 + .03, ya - (.03 if i == 0 else 0), yb + (.03 if i == 0 else 0), 2.6, 2.9))
        col('concrete', f'soft_block_{i}', aabb(bx0, bx1, ya, yb, -.3, 2.9))
    words('black', "WOMEN'S BLOUSES", .17, (-9, by0 - .03, 2.75), 270, max_w=4, out=.003)
    words('black', "MEN'S DRESS BLUES", .17, (3.5, by0 - .03, 2.75), 270, max_w=4, out=.003)
    words('black', 'MORALE PATCHES', .17, (bx0 - .03, 8, 2.75), 180, max_w=4, out=.003)
    words('black', 'FLIGHT SUITS', .17, (bx0 - .03, 22, 2.75), 180, max_w=3.5, out=.003)
    words('black', 'FIT TO FLY', .17, (bx1 + .03, 4, 2.75), 0, max_w=4, out=.003)
    # South face: the photo's black wall shelving of folded blouses with an orange header.
    gondola('blouses', -14.8, -3.2, by0 - .6, by0, header=None, sides=(False, True), kind='blouses', endcaps=(False, False))
    gondola('dress_blues', -2.6, 9.8, by0 - .6, by0, header=None, sides=(False, True), kind='blouses', endcaps=(False, False), seed=2)
    # West face: morale patches board, flight suits rail.
    vis('patches', 'black').add(aabb(bx0 - .06, bx0, 3.5, 12.5, .5, 2.3))
    rng = random.Random(7)
    for k in range(14):
        for j in range(6):
            y, z = 3.9 + k * .62, .75 + j * .27
            m = rng.choice(['red', 'blue', 'header', 'green', 'white', 'magenta', 'hivis', 'orange'])
            if (k + j) % 3 == 0:
                vis('patches', m).add(transform(cylinder((0, 0, 0), .11, .012, 10, 'X', smooth=False),
                                                lambda p, y=y, z=z: (bx0 - .075 + p[0], y + p[1], z + p[2])))
            else:
                v = [(bx0 - .07, y - .12, z - .1), (bx0 - .07, y + .12, z - .1), (bx0 - .07, y + .12, z + .06), (bx0 - .07, y, z + .13),
                     (bx0 - .07, y - .12, z + .06)]
                vis('patches', m).add((v, [(4, 3, 2, 1, 0)]), kind='flag')
    words('white', 'MORALE PATCHES', .2, (bx0 - .06, 8, 2.05), 180, max_w=3, out=.012)
    words('header', '3 FOR $10 · NO, THE CAT ONE IS NOT REGULATION', .065, (bx0 - .06, 8, .6), 180, max_w=6, out=.012)
    vis('suits', 'steel').add(aabb(bx0 - .55, bx0 - .5, 20.4, 23.6, 1.55, 1.58))
    for k in range(6):
        y = 20.7 + k * .48
        vis('suits', ['olive', 'green', 'olive', 'navy'][k % 4]).add(aabb(bx0 - .62, bx0 - .4, y - .2, y + .2, .35, 1.5))
    col('metal', 'flight_suits', aabb(bx0 - .7, bx0, 20.4, 23.6, -.3, 1.6))
    # East face: shoe wall (black shelves, shoe boxes), orange slat wall above, "FIT TO FLY".
    gondola('shoes_u', bx1, bx1 + .55, 1, 12, sides=(True, False), kind='shoes', endcaps=(False, False), h=1.9)
    # Opposite the east leg: the long shoe wall that closes the U from the food court.
    gondola('shoes_e', 17.4, 18.2, -12.4, 13, header='SHOES', sides=(False, True), kind='shoes', endcaps=(False, False), h=1.9)
    vis('shoewall', 'orange').add(aabb(17.5, 18.2, -12.4, 13, 2.2, 3.2))
    for k in range(8):
        vis('shoewall', 'veneer').add(aabb(17.49, 17.5, -12.4, 13, 2.25 + k * .12, 2.27 + k * .12))
    words('white', 'FIT TO FLY', .55, (17.49, 0, 2.72), 180, max_w=7, out=.01)
    # U south side: one long run that also faces the H&B cross aisle.
    gondola('u_south', -15, 17.4, -12.4, -11.2, header='SOFT GOODS', seed=9)
    # Round racks and mannequins along the U (never inside 3 m of the line).
    racks = [(-22.3, 12.5), (-22.3, 7.0), (-22.3, 1.8), (-16.6, -4.5), (-6, -4.6), (6, -4.6), (16.5, -3.6), (16.6, 6.6)]
    for i, (x, y) in enumerate(racks):
        round_rack(x, y, f'round_rack_{i}', ['red', 'blue', 'green', 'magenta', 'header', 'navy', 'white', 'orange'][i])
    for i, (x, y, f, m) in enumerate(((-0.5, -3.8, 270, 'red'), (.3, -3.8, 270, 'navy'), (11.6, 13.3, 180, 'magenta'))):
        mannequin(x, y, f, m)
    vis('manikins', 'white').add(aabb(-1.2, 1.0, -4.4, -3.2, 0, .3))
    vis('manikins', 'black').add(aabb(-1.21, 1.01, -4.41, -3.19, 0, .05))
    col('wood', 'mannequin_deck', aabb(-1.2, 1.0, -4.4, -3.2, -.3, .3), {'note': '30 cm platform: a wall, not a step'})
    col('wood', 'mannequin_n', box(11.6, 13.3, -.3, .6, .6, 2.2))
    # Military clearance rail against the TV wall's soft-goods face.
    vis('clear', 'steel').add(aabb(-23.4, -23.0, -7.5, -2.5, 1.5, 1.53))
    for k in range(10):
        y = -7.3 + k * .5
        vis('clear', ['olive', 'grey', 'navy', 'green', 'header'][k % 5]).add(aabb(-23.42, -22.9, y - .2, y + .2, .45, 1.45))
    col('metal', 'clearance_rail', aabb(-23.5, -22.8, -7.5, -2.5, -.3, 1.6))
    hanging_sign('soft_goods', -2, -8, 0, 3.0, .7, 2.85, [('SOFT GOODS', .26, 'white', .08), ('UNIFORM-ISH', .1, 'header', -.2)],
                 board='navy')
    hanging_sign('women', 14, 4, 90, 2.4, .6, 2.9, [("WOMEN'S", .24, 'white', 0)], board='magenta')


def food_court():
    # Restaurant counters on the east wall: back panel, mosaic band, menu boards, header.
    units = [('AFTERBURNER BURGERS', 'red', 14, 22.6), ('RED FLAG PIZZA', 'green', 4, 12.4), ('CADET CAFE', 'olive', -10.6, 2.4)]
    rng = random.Random(11)
    for name, accent, y0, y1 in units:
        vis('fc', 'veneer' if accent != 'olive' else 'olive').add(aabb(51.7, 52, y0, y1, 0, 3.3))
        z0 = 1.05
        y = y0 + .2
        while y < y1 - .2:                                # mosaic tile band (maroon / olive / gold)
            z = z0
            while z < 2.1:
                m = rng.choice(['red', 'olive', 'header', 'veneer', 'red', 'cardboard'])
                panel('mosaic', m, (51.7, y + .095), 180, .19, .14, z, out=.004)
                z += .16
            y += .21
        vis('fc', 'maple').add(aabb(48.3, 49.2, y0 + .4, y1 - .4, 0, 1.05))
        vis('fc', 'steel').add(aabb(48.2, 49.3, y0 + .35, y1 - .35, 1.05, 1.09))
        vis('fc', 'glass').add(aabb(48.3, 48.33, y0 + .6, y1 - .6, 1.09, 1.45))
        col('wood', f'counter_{name.split()[0].lower()}', aabb(48.2, 49.3, y0 + .35, y1 - .35, -.3, 1.1))
        for k in range(3):                                 # menu boards
            yc = y0 + 1.6 + k * (y1 - y0 - 3.2) / 2
            vis('fc', 'black').add(aabb(51.6, 51.68, yc - .85, yc + .85, 2.25, 3.05))
            for j in range(6):
                vis('decal', 'white').add(aabb(51.595, 51.6, yc - .7, yc + rng.uniform(-.1, .65), 2.4 + j * .1, 2.43 + j * .1))
        vis('fc', accent).add(aabb(50.6, 52, y0, y1, 3.3, 3.9))
        words('white', name, .36, (50.6, (y0 + y1) / 2, 3.6), 180, max_w=y1 - y0 - .6, out=.004)
        vis('fc', 'grey').add(aabb(49.3, 51.6, y0, y0 + .06, 0, 3.3))
    # Coffee extras: cups and the BAD GUYS SQUADRON mug display.
    for k in range(5):
        vis('fc', 'white').add(cylinder((48.75, -9.5 + k * .3, 1.09), .05, .14, 8))
    cx, cy = 45.5, -12.5
    vis('mugs', 'maple').add(aabb(cx - .9, cx + .9, cy - .45, cy + .45, 0, .8))
    for row, z in enumerate((.8, .95, 1.1)):
        for k in range(6 - 2 * row):
            vis('mugs', 'black' if (k + row) % 2 else 'red').add(cylinder((cx - .6 + k * .24 + row * .24, cy, z), .055, .14, 10))
    vis('signs', 'black').add(aabb(cx - .04, cx, cy - .8, cy + .8, 1.25, 1.75))
    words('red', 'BAD GUYS SQUADRON', .1, (cx - .04, cy, 1.58), 180, max_w=1.5, out=.003)
    words('white', 'MUGS · WE ALWAYS LOSE ON PURPOSE', .055, (cx - .04, cy, 1.4), 180, max_w=1.5, out=.003)
    col('wood', 'mug_table', aabb(cx - .9, cx + .9, cy - .45, cy + .45, -.3, 1.3))
    # Mess tables on the line: a tunnel. Tops at 0.72-0.76 m are overhead; legs are walls.
    for i, ty in enumerate((8.1, 5.7, 3.3, .9)):
        x0, x1, y0, y1 = 40.1, 42.9, ty - .9, ty + .9
        vis('tables', 'maple').add(aabb(x0, x1, y0, y1, .72, .76))
        vis('tables', 'steel').add(aabb(x0 + .02, x1 - .02, y0 + .02, y1 - .02, .69, .72))
        col('wood', f'mess_table_top_{i}', aabb(x0, x1, y0, y1, .72, .76), {'note': 'overhead: the toy car drives under'})
        for lx in (x0 + .03, x1 - .09):
            for ly in (y0 + .03, y1 - .09):
                vis('tables', 'steel').add(aabb(lx, lx + .06, ly, ly + .06, 0, .72))
                col('metal', f'mess_table_leg_{i}', aabb(lx, lx + .06, ly, ly + .06, -.3, .74))
        for sx in (-1, 1):
            chair(41.5 + sx * 1.9, ty, 0 if sx < 0 else 180, f'mess_chair_{i}')
    # Four-tops on pedestals, chairs around.
    for i, (tx, ty) in enumerate(((24, 12.5), (30, 12.5), (35.5, 12.5), (24, 4.5), (30, 4.5), (35.5, 4.5), (24, -3.5), (30, -3.5))):
        vis('tables', 'maple').add(cylinder((tx, ty, .72), .5, .04, 16, smooth=False))
        vis('tables', 'steel').add(cylinder((tx, ty, 0), .05, .72, 8))
        vis('tables', 'steel').add(cylinder((tx, ty, 0), .3, .03, 12, smooth=False))
        col('metal', f'table_base_{i}', box(tx, ty, -.3, .62, .62, 1.0))
        col('wood', f'table_top_{i}', box(tx, ty, .72, 1.0, 1.0, .04), {'note': 'overhead'})
        for k, (dx, dy) in enumerate(((-.85, 0), (.85, 0), (0, -.85), (0, .85))):
            chair(tx + dx, ty + dy, math.degrees(math.atan2(-dy, -dx)), f'chair_{i}_{k}')
    # Tray return and bins.
    vis('fc', 'veneer').add(aabb(34, 37, 22.6, 23.9, 0, 1.0))
    vis('fc', 'steel').add(aabb(33.95, 37.05, 22.55, 23.95, 1.0, 1.04))
    col('wood', 'tray_return', aabb(33.95, 37.05, 22.55, 23.95, -.3, 1.04))
    words('white', 'TRAYS · THANK YOU, AIRMAN', .09, (35.5, 22.55, .7), 270, max_w=2.8, out=.005)
    for i, (x, y) in enumerate(((19.6, 9), (19.6, -6), (33.5, -8.8), (38.6, -.8))):
        vis('fc', 'veneer').add(box(x, y, 0, .6, .6, 1.0))
        vis('fc', 'black').add(box(x, y, 1.0, .5, .5, .04))
        col('wood', f'bin_{i}', box(x, y, -.3, .6, .6, 1.3))
    # Wood-veneer feature panels on the food court back wall.
    vis('fc', 'veneer').add(aabb(26, 51.7, 23.95, 24, 0, 3.4))
    words('header', 'CHOW TIME', .5, (39, 23.95, 2.6), 270, max_w=6, out=.005)


def chair(cx, cy, facing, label):
    a = math.radians(facing)
    vis('chairs', 'red').add(box(cx, cy, .44, .44, .44, .04, a))
    vis('chairs', 'red').add(box(cx - math.cos(a) * .2, cy - math.sin(a) * .2, .48, .04, .44, .42, a))
    for sx in (-.18, .18):
        for sy in (-.18, .18):
            vis('chairs', 'steel').add(box(cx + sx * math.cos(a) - sy * math.sin(a), cy + sx * math.sin(a) + sy * math.cos(a), 0, .03, .03, .44))
    col('metal', label, box(cx, cy, -.3, .48, .48, 1.2, a))


def checkout():
    for i, x in enumerate((.5, 5, 9.6, 14.4, 19, 23.5)):
        y0, y1 = -32, -26.5
        vis('checkout', 'blue').add(aabb(x - .5, x + .5, y0, y1, 0, .9))
        vis('checkout', 'black').add(aabb(x - .58, x + .58, y0 - .05, y1, .9, .94))
        vis('checkout', 'steel').add(aabb(x - .52, x + .52, y0, y1, .05, .12))
        vis('checkout', 'black').add(box(x, y1 - .8, .94, .28, .2, .22))
        vis('checkout', 'black').add(box(x, y1 - 1.6, .94, .05, .05, .32))
        vis('checkout', 'navy').add(box(x, y1 - 1.6, 1.26, .3, .04, .22, .3))
        vis('checkout', 'blue').add(aabb(x - .5, x + .5, y1, y1 + .45, 0, 1.45))                       # impulse rack
        for z in (.35, .7, 1.05):
            for k in range(4):
                vis('checkout', ['red', 'header', 'green', 'magenta'][(k + i) % 4]).add(
                    aabb(x - .45 + k * .23, x - .26 + k * .23, y1 + .45, y1 + .47, z, z + .25))
        vis('checkout', 'steel').add(cylinder((x, y0 + .2, .94), .03, 1.4, 6))
        vis('checkout', 'white').add(box(x, y0 + .2, 2.34, .4, .1, .4))
        lane = i + 1
        for f in (90, 270):
            words('blue', str(lane), .3, (x, y0 + .2, 2.54), f, max_w=.35, out=.052)
        col('metal', f'checkout_{lane}', aabb(x - .58, x + .58, y0 - .05, y1 + .47, -.3, 1.5))
    hanging_sign('checkout', 12, -28, 270, 3.0, .7, 2.9, [('CHECKOUT', .28, 'white', .05)], board='blue')
    words('navy', 'THANK YOU · FLY SAFE!', .3, (11, -34, 3.55), 90, max_w=5.5, out=.01)
    words('navy', 'THANK YOU · FLY SAFE!', .3, (11, -34, 3.55), 270, max_w=5.5, out=.32)


def concourse():
    # IT'S A DRY HEAT: sunscreen pyramid (three 40 cm tiers, each a wall).
    cx, cy = -18.5, -27.5
    for t, (w, z) in enumerate(((2.4, 0), (1.6, .4), (.8, .8))):
        vis('sunscreen', 'white').add(box(cx, cy, z, w, w, .4))
        n = int(w / .2)
        for k in range(n):
            for sgn in (-1, 1):
                vis('sunscreen', ['header', 'orange', 'hivis'][(k + t) % 3]).add(
                    box(cx - w / 2 + .1 + k * .2, cy + sgn * (w / 2 + .03), z + .05, .14, .06, .3))
                vis('sunscreen', ['header', 'orange', 'hivis'][(k + t + 1) % 3]).add(
                    box(cx + sgn * (w / 2 + .03), cy - w / 2 + .1 + k * .2, z + .05, .06, .14, .3))
        col('concrete', f'sunscreen_tier_{t}', box(cx, cy, -.3 if t == 0 else z, w + .1, w + .1, .4 + (.3 if t == 0 else 0)))
    vis('signs', 'white').add(box(cx, cy, 1.2, .06, .06, 1.1))
    vis('signs', 'header').add(box(cx, cy, 2.3, 1.6, .06, .7))
    for f in (270, 90):
        words('red', "IT'S A DRY HEAT", .16, (cx, cy, 2.75), f, max_w=1.5, out=.035)
        words('black', 'SUNSCREEN · SPF 51½', .09, (cx, cy, 2.5), f, max_w=1.5, out=.035)
    # CHALLENGE COINS glass counter.
    cx, cy = -6, -29
    vis('coins', 'steel').add(aabb(cx - 1.5, cx + 1.5, cy - .4, cy + .4, 0, .3))
    vis('coins', 'black').add(aabb(cx - 1.45, cx + 1.45, cy - .38, cy + .38, .3, .75))
    vis('coins', 'red').add(aabb(cx - 1.4, cx + 1.4, cy - .35, cy + .35, .75, .78))
    for k in range(10):
        for j in range(2):
            vis('coins', 'header').add(cylinder((cx - 1.2 + k * .27, cy - .12 + j * .24, .78), .05, .012, 10, smooth=False))
    vis('coins', 'glass').add(aabb(cx - 1.5, cx + 1.5, cy - .4, cy + .4, .95, .97))
    for sx in (-1.49, 1.49):
        vis('coins', 'steel').add(aabb(cx + sx - .01, cx + sx + .01, cy - .4, cy + .4, .3, .97))
    col('metal', 'coin_counter', aabb(cx - 1.5, cx + 1.5, cy - .4, cy + .4, -.3, .97))
    vis('signs', 'navy').add(aabb(cx - 1.2, cx + 1.2, cy - .02, cy + .02, 1.25, 1.75))
    vis('signs', 'steel').add(aabb(cx - .02, cx + .02, cy - .02, cy + .02, .97, 1.25))
    for f in (270, 90):
        words('header', 'CHALLENGE COINS', .15, (cx, cy, 1.55), f, max_w=2.2, out=.025)
        words('white', 'COLLECT ALL 51½', .08, (cx, cy, 1.36), f, max_w=2.2, out=.025)
    # MILITARY CLEARANCE racks, inside the hairpin before checkout.
    for i, (rx, ry) in enumerate(((24.0, -14.6), (30.0, -14.6))):
        vis('clear', 'steel').add(aabb(rx - 1.1, rx + 1.1, ry - .04, ry + .04, 1.45, 1.48))
        for k in range(9):
            x = rx - 1.0 + k * .25
            vis('clear', ['olive', 'navy', 'grey', 'green'][(k + i) % 4]).add(aabb(x - .1, x + .1, ry - .25, ry + .25, .4, 1.42))
        for sx in (-1.1, 1.1):
            vis('clear', 'steel').add(aabb(rx + sx - .02, rx + sx + .02, ry - .3, ry + .3, 0, 1.48))
        col('metal', f'mil_clearance_{i}', aabb(rx - 1.15, rx + 1.15, ry - .3, ry + .3, -.3, 1.5))
    hanging_sign('mil_clear', 27.0, -15.4, 0, 2.6, .65, 2.55, [('MILITARY', .2, 'white', .12), ('CLEARANCE', .2, 'white', -.14)],
                 board='red')
    # Shopping carts parked in the lobby corral (grey wire, blue handles).
    for k in range(5):
        x = 17 + k * .55
        y0, y1 = -42.6, -41.6
        for (a0, a1, b0, b1) in ((x - .26, x + .26, y0, y0 + .02), (x - .26, x + .26, y1 - .02, y1), (x - .26, x - .24, y0, y1),
                                 (x + .24, x + .26, y0, y1)):
            vis('carts', 'steel').add(aabb(a0, a1, b0, b1, .45, .95))
        vis('carts', 'steel').add(aabb(x - .24, x + .24, y0, y1, .45, .47))
        vis('carts', 'blue').add(aabb(x - .27, x + .27, y1 + .05, y1 + .1, .98, 1.02))
        for wx in (-.2, .2):
            for wy in (y0 + .1, y1 - .1):
                vis('carts', 'black').add(cylinder((x + wx, wy, .04), .04, .03, 8, 'X'))
    col('metal', 'cart_corral', aabb(16.6, 19.6, -42.7, -41.4, -.3, 1.05))
    # Anti-theft pedestals at the door jambs.
    for i, x in enumerate((-33.6, -22.4, 5.4, 16.6)):
        vis('pedestals', 'white').add(aabb(x - .12, x + .12, -34.95, -34.35, 0, 1.65))
        vis('pedestals', 'grey').add(aabb(x - .13, x + .13, -34.96, -34.34, 0, .08))
        col('metal', f'pedestal_{i}', aabb(x - .13, x + .13, -34.96, -34.34, -.3, 1.65))
    # Lobby signage: the store name over the entrance, the quiet-hours note between the doors.
    vis('signs', 'white').add(aabb(-33.5, -22.5, -34.42, -34.3, 3.1, 4.0))
    words('navy', 'BASE EXCHANGE', .5, (-28, -34.42, 3.66), 270, max_w=10, out=.005)
    words('red', 'AIM HIGH · SHOP LOW', .17, (-28, -34.42, 3.25), 270, max_w=10, out=.005)
    vis('signs', 'white').add(aabb(-7.4, -6.6, -34.32, -34.3, 1.05, 1.62))
    for text, size, z in (('QUIET PLEASE', .1, 1.48), ('RETREAT AT 1700', .085, 1.33), ('(STOP, FACE THE FLAG,', .055, 1.2),
                          ('THEN KEEP RACING)', .055, 1.12)):
        words('black', text, size, (-7, -34.32, z), 270, max_w=.72, out=.003)
    vis('signs', 'hivis').add(aabb(-7.05, -6.95, -34.33, -34.32, 1.58, 1.66))
    # START · FINISH: chequered floor strip and a banner across the lobby.
    for row in range(2):
        for k in range(17):
            y = -42.9 + k * .5
            if y + .5 > -34.4:
                break
            vis('decal', 'white' if (row + k) % 2 else 'black').add(aabb(-.25 + row * .25, row * .25, y, y + .5, .003, .006))
    vis('signs', 'steel').add(aabb(-.05, .05, -42.5, -35, 3.2, 3.24))
    vis('signs', 'hivis').add(aabb(-.03, .03, -42.2, -35.3, 2.6, 3.15))
    for f in (0, 180):
        words('black', 'START · FINISH', .32, (0, -38.75, 2.88), f, max_w=6.4, out=.035)


def mural():
    """Hero mural on the lobby's west wall (faces east down the start straight). Original art:
    a night skyline, generic toy jets, a row of photo-style panels and fictional wording."""
    x = -36 + .002
    f = 0
    y0, y1, z0, z1 = -42.7, -34.6, .25, 3.95
    yc = (y0 + y1) / 2
    panel('mural', 'navy', (x, yc), f, y1 - y0, z1 - z0, z0, out=.0)
    panel('mural', 'blue', (x, yc), f, y1 - y0, .75, z0, out=.004)
    rng = random.Random(3)
    yy = y0 + .1
    while yy < y1 - .3:                    # skyline silhouettes with lit windows
        w = rng.uniform(.25, .6)
        hgt = rng.uniform(.4, 1.3) + (.5 if abs(yy - (y0 + 5.8)) < .4 else 0)
        m = rng.choice(['magenta', 'header', 'veneer', 'blue', 'header'])
        panel('mural', m, (x, yy + w / 2), f, w, hgt, 1.0, out=.006)
        for k in range(int(hgt / .18)):
            panel('mural', 'white' if m != 'header' else 'navy', (x, yy + w / 2), f, w * .5, .04, 1.08 + k * .18, out=.008)
        yy += w + rng.uniform(.03, .2)
    for k in range(6):                     # photo-style panels (crew chief, K-9, chow line, ...)
        yc_k = y0 + .45 + k * 1.28
        panel('mural', ['olive', 'cardboard', 'grey', 'green', 'maple', 'red'][k], (x, yc_k + .55), f, 1.18, .88, 1.95, out=.01)
        panel('mural', 'white', (x, yc_k + .55), f, 1.26, .96, 1.91, out=.009)
    for (jy, jz, s) in ((-38.6, 3.45, 1.0), (-36.2, 1.25, .6), (-41.6, 1.35, .7)):     # generic toy jets
        pts = [(0, .0), (-.9, -.12), (-1.1, -.5), (-1.5, -.5), (-1.45, -.1), (-1.9, -.1), (-2.1, -.3), (-2.3, -.3), (-2.2, .0),
               (-2.3, .3), (-2.1, .3), (-1.9, .1), (-1.45, .1), (-1.5, .5), (-1.1, .5), (-.9, .12)]
        v2 = [(-p[0] * s - .9 * s, p[1] * s * 1.6) for p in pts]
        cy, cz = jy, jz
        verts = [(x + .012, cy + px, cz + pz) for px, pz in v2]
        vis('mural', 'steel').add((verts, [tuple(range(len(verts)))]), kind='flag')
    words('white', 'WELCOME HOME,', .32, (x, yc + .2, 3.12), f, max_w=4.6, out=.014)
    words('header', 'TOY HEROES', .5, (x, yc + .2, 2.68), f, max_w=4.6, out=.014)
    words('white', 'BASE EXCHANGE · SAUCER SPRINGS AFB', .14, (x, yc, .62), f, max_w=6, out=.014)


def stockroom():
    # Pallet racking along the north wall, box stacks along the south wall.
    for k in range(13):
        x0 = -35.6 + k * 5.0
        if x0 > 29:
            break
        x1 = min(x0 + 4.8, 29.6)
        for xx in (x0, x1 - .1):
            vis('racking', 'blue').add(aabb(xx, xx + .1, 31.6, 32.9, 0, 3.6))
        for z in (1.2, 2.4, 3.5):
            vis('racking', 'orange').add(aabb(x0, x1, 31.55, 31.65, z - .12, z))
            vis('racking', 'orange').add(aabb(x0, x1, 32.85, 32.95, z - .12, z))
        for zb in (0, 1.2, 2.4):
            n = 3
            for j in range(n):
                bx = x0 + .2 + j * (x1 - x0 - .3) / n
                hb = .55 + .35 * ((j + k) % 2)
                vis('racking', 'cardboard').add(aabb(bx, bx + (x1 - x0 - .5) / n, 31.75, 32.8, zb + .02, zb + min(hb, 1.0)))
                vis('decal', 'white').add(aabb(bx + .2, bx + .55, 31.745, 31.75, zb + .25, zb + .4))
    col('metal', 'racking', aabb(-35.7, 29.7, 31.5, 33, -.3, 3.6))
    stacks = [(-35.6, -33), (-27, -22), (-19, -15), (-9, 12), (15, 21.6), (26.2, 29.6)]
    for i, (x0, x1) in enumerate(stacks):
        x = x0
        while x < x1 - .4:
            w = min(.8, x1 - x)
            for row in range(3):
                vis('boxes', 'cardboard').add(aabb(x + .02, x + w - .02, 24.4, 25.7, row * .55, row * .55 + .53))
                vis('decal', 'black' if (row + i) % 2 else 'red').add(aabb(x + .1, x + w - .1, 25.705, 25.71, row * .55 + .3, row * .55 + .36))
            x += w
        col('wood', f'box_stack_s_{i}', aabb(x0, x1, 24.31, 25.8, -.3, 1.65))
    # Yellow safety lines along the corridor.
    flat_up('decal', 'header', -35.5, 29.5, 25.85, 25.95, .002)
    flat_up('decal', 'header', -35.5, 29.5, 31.35, 31.45, .002)
    # Pallet deck with flattened-box ramps both ends: the shortcut's jump, with the specimen on top.
    px0, px1, py0, py1, ph = -2, 4, 25.8, 31.5, .3
    for k in range(9):
        y = py0 + .05 + k * (py1 - py0 - .1) / 8
        vis('pallets', 'cardboard').add(aabb(px0, px1, y - .05, y + .05, .14, ph))
    for x in (px0, (px0 + px1) / 2, px1 - .1):
        vis('pallets', 'veneer').add(aabb(x, x + .1, py0, py1, 0, .14))
    vis('pallets', 'maple').add(aabb(px0, px1, py0, py1, ph - .02, ph))
    col('wood', 'pallet_deck', aabb(px0, px1, py0, py1, -.3, ph), {'note': 'pallet deck, 30 cm: ramps both ends'})
    yc = (py0 + py1) / 2
    for lo, hi, name in (((px0 - 2.8, yc), (px0, yc), 'up'), ((px1 + 2.8, yc), (px1, yc), 'down')):
        part = wedge(lo, hi, py1 - py0, 0, ph)
        vis('pallets', 'cardboard').add(part)
        col('wood', f'box_ramp_{name}', part, {'note': 'flattened cardboard box ramp, 6 degrees'})
        sx = 1 if name == 'up' else -1
        for k in range(3):
            xa = lo[0] + sx * (.5 + k * .8)
            zt = ph * abs(xa - lo[0]) / 2.8
            vis('decal', 'blue').add(([(xa - .03, py0 + .4, zt + .004), (xa + .03, py0 + .4, zt + .004), (xa + .03, py1 - .4, zt + .004),
                                       (xa - .03, py1 - .4, zt + .004)], [(0, 1, 2, 3)]), kind='up')
    # THIS SIDE UP stencil on the up ramp, readable from the approach.
    v, f, w = text2d('THIS SIDE UP', .32, bold=.02)
    sc = min(1.0, 4.5 / w)
    ang = math.atan2(ph, 2.8)
    verts = []
    for x, y in v:
        wx = px0 - 1.4 + y * sc * math.cos(ang)
        verts.append((wx, yc - x * sc, ph * (wx - (px0 - 2.8)) / 2.8 + .006))
    vis('decal', 'black').add((verts, [tuple(reversed(face)) for face in f]), kind='up')
    # Stockroom prop only: the alien reveal belongs to the late-game portal district.
    # Keep the crate and its collision here, but do not show the specimen early.
    sx, sy = 1.0, 30.8
    vis('alien', 'cardboard').add(aabb(-1.6, -.4, 31.0, 31.45, ph, ph + .6))
    words('red', 'STOCK SAMPLE', .13, (-1.0, 31.0, ph + .42), 270, max_w=1.1, out=.002)
    words('black', 'HANDLE WITH CARE', .06, (-1.0, 31.0, ph + .25), 270, max_w=1.1, out=.002)
    col('wood', 'specimen_crate', aabb(-1.6, -.4, 31.0, 31.45, ph, ph + .6))
    # Pallet jack and a lone box pile: the stockroom chicane.
    jx, jy = -13.5, 26.4                   # parked against the south stacks, not in the lane
    vis('jack', 'red').add(aabb(jx - .35, jx + .35, jy - .35, jy + .35, .05, .55))
    for s in (-1, 1):
        vis('jack', 'steel').add(aabb(jx + .4, jx + 1.6, jy + s * .25 - .08, jy + s * .25 + .08, .03, .09))
    vis('jack', 'black').add(beam((jx - .3, jy), (jx - .8, jy), .06, .5, .06))
    vis('jack', 'black').add(aabb(jx - .85, jx - .75, jy - .03, jy + .03, .5, 1.2))
    vis('jack', 'black').add(aabb(jx - .85, jx - .75, jy - .2, jy + .2, 1.15, 1.2))
    col('metal', 'pallet_jack', aabb(jx - .9, jx + 1.6, jy - .4, jy + .4, -.3, 1.2), {'note': 'tines read as part of the wall'})
    for i, (bx, by) in enumerate(((13.5, 30.95), (-22.0, 30.95))):     # flush with the racking
        for k in range(3):
            vis('boxes', 'cardboard').add(aabb(bx - .5 + k * .02, bx + .5 - k * .02, by - .55, by + .55, k * .5, k * .5 + .48))
        col('wood', f'box_pile_{i}', aabb(bx - .5, bx + .5, by - .55, by + .55, -.3, 1.45))
    # Swinging doors, propped open into the stockroom (static for now), with portholes.
    for i, (dx0, dx1) in enumerate(((-32, -28), (22, 26))):
        for hx, sg in ((dx0, 1), (dx1, -1)):
            lx = hx + sg * .06
            vis('doors', 'grey').add(aabb(lx - .03, lx + .03, 24.35, 26.25, 0, 2.5))
            vis('doors', 'black').add(aabb(lx - .035, lx + .035, 24.5, 26.1, 0, .35))
            vis('doors', 'glass').add(transform(cylinder((0, 0, 0), .2, .08, 14, 'X', smooth=False),
                                                lambda p, lx=lx: (lx - .04 + p[0], 25.3 + p[1], 1.6 + p[2])))
            col('metal', f'swing_door_{i}', aabb(lx - .05, lx + .05, 24.3, 26.25, -.3, 2.5))
        vis('doors', 'steel').add(aabb(dx0, dx1, 23.9, 24.0, 2.5, 2.6))
        for f, yy in ((270, 23.98), (90, 24.32)):
            words('white' if f == 270 else 'black', 'STOCKROOM', .2, ((dx0 + dx1) / 2, yy, 3.15), f, max_w=3.5, out=.01)
        vis('signs', 'red').add(aabb(dx0 + .2, dx1 - .2, 23.94, 23.98, 2.75, 2.98))
        words('white', 'EMPLOYEES ONLY (AND TOYS)', .1, ((dx0 + dx1) / 2, 23.94, 2.865), 270, max_w=3.4, out=.002)
    # Strip-lit stockroom gets no troffers over the racking (handled in ceiling()).


RUNWAY_Y = (15.8, 19.8)
RUN_H, RUN_W = .6, .8
# Careful line across the passage: ramp toe, ramp top, a dogleg pair (brake), kicker, gap, stage.
RUNWAY_PTS = [(-15.4, 17.8), (-12.4, 17.8), (-5.6, 17.8), (-4.0, 16.6), (-.5, 16.6), (1.9, 16.6), (2.6, 16.6), (3.8, 16.6),
              (7.0, 16.6), (9.0, 17.0), (10.5, 17.0), (13.5, 17.0)]


def runway():
    """FLIGHT SUIT RUNWAY (ALT_runway): a fashion runway through a passage cut across the soft-goods
    block, 0.6 m high and 0.8 m wide: ramp up, a dogleg (brake), a kicker over a 0.8 m gap (keep
    your speed), the stage, ramp down onto the U's east leg. The passage is closed at floor level
    by the stage, so a car that falls off (0.6 m onto laminate) can only drive back out the way it
    came: a dead end, never a trap, and never faster than the U."""
    P = RUNWAY_PTS
    ya, yb = RUNWAY_Y
    part = C.flanked_ramp(P[0], P[1], RUN_W, RUN_H, .5)
    vis('runway', 'black').add(part)
    C.col('wood', 'runway_ramp_up', part, {'note': 'skill shortcut ramp'})
    C.walkway('runway_a', [P[1], P[2], P[3], P[4], P[6]], RUN_W, RUN_H, 'wood', 'black', group='runway')
    kick = C.wedge(P[5], P[6], RUN_W, RUN_H, .12)
    vis('runway', 'header').add(kick)
    C.col('wood', 'runway_kicker', kick, {'note': '12 cm kicker before the gap'})
    C.walkway('runway_b', [(P[6][0] + .8, P[6][1]), P[8], (8.2, 16.7)], RUN_W, RUN_H, 'wood', 'black', group='runway')
    # The stage closes the passage at floor level; the runway lands on it and ramps down outside.
    sx0 = 7.8
    vis('runway', 'black').add(aabb(sx0, 10.5, ya, yb, 0, RUN_H))
    vis('runway', 'white').add(aabb(sx0 - .01, 10.51, ya, yb, RUN_H - .03, RUN_H))
    C.col('wood', 'runway_stage', aabb(sx0, 10.5, ya, yb, -.3, RUN_H), {'note': 'stage: closes the passage at floor level'})
    part = C.flanked_ramp(P[11], P[10], RUN_W, RUN_H, .5)
    vis('runway', 'black').add(part)
    C.col('wood', 'runway_ramp_down', part, {'note': 'skill shortcut ramp'})
    # Runway lights along both edges and the catwalk sign over the passage mouth.
    for a, b in ((P[1], P[2]), (P[4], P[5]), ((P[6][0] + .8, P[6][1]), P[8])):
        n = int(math.dist(a, b) / .5)
        for k in range(n + 1):
            x = a[0] + (b[0] - a[0]) * k / max(n, 1)
            y = a[1] + (b[1] - a[1]) * k / max(n, 1)
            for sg in (-1, 1):
                vis('decal', 'hivis').add(box(x, y + sg * (RUN_W / 2 - .05), RUN_H, .06, .06, .02))
    vis('signs', 'magenta').add(aabb(-15.53, -15.5, ya, yb, 2.0, 2.6))
    words('white', 'FLIGHT SUIT RUNWAY', .2, (-15.53, (ya + yb) / 2, 2.38), 180, max_w=3.8, out=.003)
    words('header', 'NO RUNNING · YES DRIVING', .09, (-15.53, (ya + yb) / 2, 2.12), 180, max_w=3.8, out=.003)
    vis('runway', 'header').add(aabb(-15.5, 10.5, ya, ya + .05, 2.6, 2.9))
    vis('runway', 'header').add(aabb(-15.5, 10.5, yb - .05, yb, 2.6, 2.9))


# ---------------------------------------------------------------- race metadata

def half_width_at(p):
    """Usable half width at a line point: clearance to the nearest solid, less the car's half."""
    best = 9.0
    for name, x0, x1, y0, y1, z0, z1 in SOLIDS:
        if z1 <= .02 or z0 > TOY_CLEAR or name.startswith('COL_concrete_floor') or name.startswith(('COL_tile_floor', 'COL_wood_floor', 'COL_carpet_floor')):
            continue
        dx, dy = max(x0 - p[0], 0, p[0] - x1), max(y0 - p[1], 0, p[1] - y1)
        best = min(best, math.hypot(dx, dy))
    return best


def race_markers():
    gates = []
    for i, q in enumerate(GATES):
        d = ROUTE.nearest(q) if i else 0.0
        p, t, _ = ROUTE.at(d)
        hw = max(1.4, min(2.6, half_width_at(p) - .3))
        gates.append(marker(f'GATE_{i:02d}', (p[0], p[1], 0), t, (hw, 1, 1),
                            {'lap_order': i, 'track_distance_m': round(d, 2), 'half_width_m': round(hw, 2)}, 'SINGLE_ARROW'))
    p, t, n = ROUTE.at(0)
    for k, (back, lat) in enumerate(((3, 1.1), (3, -1.1), (6, 1.1), (6, -1.1)), start=1):
        marker(f'START_{k}', (p[0] - t[0] * back + n[0] * lat, p[1] - t[1] * back + n[1] * lat, 0), t,
               extras={'grid_slot': k, 'player': k == 1}, display='SINGLE_ARROW')
    count = round(ROUTE.length / 6.2)
    step = ROUTE.length / count
    widths = []
    for k in range(count):
        p, t, _ = ROUTE.at(k * step)
        hw = max(.7, min(2.6, half_width_at(p) - .35))
        widths.append(hw)
        marker(f'AI_{k:03d}', (p[0], p[1], 0), t, (hw, 1, 1), {'track_distance_m': round(k * step, 2)}, 'SINGLE_ARROW')
    picks = [(-28, -22), (-42.5, 1.3), (-34.5, 16), (-19, 4), (0, -8), (14, 8), (41.5, -6.5), (26, -18.5)]
    picks = [ROUTE.at(ROUTE.nearest(q))[0] for q in picks]
    picks = [(x, y, .3) for x, y in picks] + [(-12, 28.65, .3), (16.5, 28.65, .3)]
    for k, at in enumerate(picks, start=1):
        marker(f'PICKUP_{k:02d}', at, extras={'route': 'shortcut' if k > 8 else 'main'}, display='SPHERE')
    marker('SPEC_01', (1.0, 28.65, .3 + .22), extras={'hint': 'stockroom shortcut: on the pallet deck at the top of the box ramp'},
           display='CUBE')
    # Skill shortcuts (ALT_<name>_NNN): the stockroom (box ramp, pallet deck) and the runway.
    ai_xy = [ROUTE.at(k * step)[0] for k in range(count)]
    sc = [(-33, 16), (-31, 17.2), (-30, 19), (-30, 21.5), (-30, 24), (-29.6, 26.2), (-28, 27.9), (-25, 28.6), (-21, 28.6), (-17, 28.6),
          (-13, 28.6), (-9, 28.65), (-6, 28.65), (-3.5, 28.65), (-1, 28.65), (1, 28.65), (3.5, 28.65), (6, 28.65), (9, 28.65),
          (12.5, 28.65), (16, 28.65), (19, 28.65), (21.6, 28.4), (23.4, 27.6), (24, 26), (24, 24), (24, 22.2), (25, 20.6),
          (26.8, 19.5), (28.8, 19)]
    sc_speed = [4.5 if (x < -27 and 20 < y < 27.5) or (x > 21 and 21 < y < 28.5) else 5 if -5 < x < 7 else 7 for x, y in sc]
    sc_speed[0] = sc_speed[-1] = 6
    C.alt_route('stockroom', sc, ai_xy, sc_speed, half=1.6)
    rw = [(-24, 16), (-18.0, 17.6)] + RUNWAY_PTS[:6] + [(2.54, 16.6)] + RUNWAY_PTS[7:] + [(17.5, 19)]
    C.alt_route('runway', rw, ai_xy, [7, 4.5, 4, 3.8, 2.2, 2.2, 4.0, 4.8, 5.0, 4.2, 3.8, 3.0, 3.2, 3.5, 6], half=RUN_W / 2, gaps={8})
    # Challenge coins: off the line, each one a small detour (driven by tools/rc/coins-reachable.test.mjs).
    sc_in = [(-33, 16), (-31, 17.2), (-30, 19), (-30, 21.5), (-30, 24), (-29.6, 26.2), (-28, 27.9), (-25, 28.6), (-21, 28.6),
             (-17, 28.6), (-13, 28.6), (-9, 28.65), (-6, 28.65), (-3.5, 28.4)]
    sc_out = [(3.5, 28.4), (6, 28.65), (9, 28.65), (12.5, 28.65), (16, 28.65), (19, 28.65), (21.6, 28.4), (23.4, 27.6), (24, 26),
              (24, 24), (24, 22.2), (25, 20.6), (26.8, 19.5), (28.8, 19)]
    C.coin(1, (1.0, 27.6, .3 + .25), sc_in, sc_out, 'stockroom shortcut: on the pallet deck, beside the specimen jar')
    C.coin(2, (-41.9, -15, .3), [(-28, -26), (-33, -23.5), (-41.9, -22.5)], [(-41.9, -7.8), (-44.5, -2)],
           'halfway down the last HOUSEWARES aisle')
    C.coin(3, (-6, -31.2, .3), [(-28, -32), (-24, -31.2), (-14, -31.2)], [(-1.5, -30.8), (-3, -24.5), (-14, -23.5), (-24, -23)],
           'behind the CHALLENGE COINS counter, of course')
    C.coin(4, (27, 8.5, .3), [(22, 19), (26.5, 16.5)], [(27, .5), (27, -7), (27, -12), (27, -16.5)],
           'food court: between the four-tops, out through the MILITARY CLEARANCE racks')
    C.coin(5, (48.2, -31.2, .3), [(41.5, -10), (44.5, -17), (49.6, -23), (49.8, -28.6)],
           [(45.9, -31.2), (45.9, -26.5), (45.6, -22), (40, -18.5)], 'DESERT MART: behind the PCS moving-box pallet')
    marker('CAM_table_tunnel', (41.5, 9.6, .45), (0, -1), extras={'note': 'low chase hint under the mess tables'})
    marker('CAM_checkout_lane', (12, -24, .5), (0, -1), extras={'note': 'checkout lane 3, counters both sides'})
    marker('CAM_stockroom_doors', (-30, 22.5, .5), (0, 1), extras={'note': 'swinging doors into the stockroom'})
    marker('CAM_stockroom_ramp', (-7, 28.65, .5), (1, 0), extras={'note': 'flattened-box ramp onto the pallet deck'})
    return gates, step, count, widths


def clearance_report(widths):
    """Print every solid that crowds the line (<1.2 m from the centreline). Mess-table legs are
    the intended exception (the tunnel)."""
    tight = []
    for name, x0, x1, y0, y1, z0, z1 in SOLIDS:
        if z1 <= .02 or z0 > TOY_CLEAR or '_floor_' in name:
            continue
        d = min(math.hypot(max(x0 - p[0], 0, p[0] - x1), max(y0 - p[1], 0, p[1] - y1)) for p in ROUTE.pts[::2])
        if d < 1.2:
            tight.append((round(d, 2), name))
    tight.sort()
    print('BX_CLEARANCE', tight[:40])
    print('BX_HALF_WIDTHS min %.2f max %.2f' % (min(widths), max(widths)))
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
    C.ROOT = marker('BX_Root', (0, 0, 0))
    C.ROOT.parent = None
    floors()
    shell()
    ceiling()
    housewares_and_main_aisle()
    electronics()
    toys()
    soft_goods()
    food_court()
    checkout()
    concourse()
    mural()
    stockroom()
    runway()
    gates, ai_step, ai_count, widths = race_markers()
    tight = clearance_report(widths)
    C.ROOT['district'] = 'bx'
    C.ROOT['base'] = 'Saucer Springs AFB (fictional)'
    C.ROOT['store'] = 'Base Exchange (fictional)'
    C.ROOT['lap_length_m'] = round(ROUTE.length, 2)
    C.ROOT['race_direction'] = 'lobby west, store anticlockwise then clockwise; see bx.py docstring'
    C.ROOT['shortcut'] = 'toy aisle -> swinging doors -> stockroom (box ramp, pallet deck, specimen) -> food court'
    return {'ai_count': ai_count, 'ai_spacing_m': round(ai_step, 2), 'gates': len(gates), 'tight': tight}


def shots():
    return [
        ('overview', (70, -112, 92), (2, -6, 0), 30),
        ('entrance-mural', (6.5, -38.6, .32), (-36, -38.6, 1.7), 22),
        ('entrance-doors', (-27.2, -42.4, .45), (-28, -14, 1.3), 20),
        ('main-aisle-toy-eye', (-28, -25, .2), (-28, 0, .95), 20),
        ('electronics', (-27.5, -2.5, .45), (-47, 1, .9), 20),
        ('toy-aisle', (-45.5, 16, .3), (-20, 16, .95), 22),
        ('soft-goods-u', (-19, 14, .35), (-19, -8, .9), 20),
        ('food-court', (41.5, 14.5, .35), (41.5, -8, .45), 20),
        ('food-court-wide', (20.5, -10, 1.7), (46, 14, 1.0), 20),
        ('stockroom-shortcut', (-27, 28.2, .45), (8, 28.6, .55), 20),
        ('checkout', (12, -21.5, .4), (12, -40, .8), 20),
        ('runway', (-19.5, 18.2, 1.2), (6, 16.8, .4), 20),
    ]


def render(glb, out):
    """Review renders of the exported GLB (re-imported), lit like the game interior: the sun is
    blocked by the ceiling, a dim sky stands in for the hemisphere light, and the baked-in
    emission does the rest. Labelled Blender review renders, not in-engine evidence."""
    C.render_glb(glb, out, [])
    scene = bpy.context.scene
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
    for o in list(scene.objects):
        if o.type == 'LIGHT':
            o.data.energy = 0.0
    cam = scene.camera
    from mathutils import Vector
    written = []
    out = Path(out)
    for name, eye, target, lens in shots():
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
    ap.add_argument('--blend', type=Path, default=REPO / 'assets/rc/districts/bx.blend')
    ap.add_argument('--render', type=Path)
    ap.add_argument('--render-only', action='store_true')
    ap.add_argument('--no-bake', action='store_true')
    ap.add_argument('--no-blend', action='store_true')
    args = ap.parse_args(argv)
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    glb = out / 'bx.glb'
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
        C.write_provenance(out / 'bx.provenance.json', {
            'script': 'bx.py', 'district': 'bx', 'version': 1,
            'editable_source': 'assets/rc/districts/bx.blend',
            'lap_length_m': round(ROUTE.length, 2), 'gates': info['gates'], 'ai_nodes': info['ai_count'],
            'ai_spacing_m': info['ai_spacing_m'], **stats,
            'lettering': "mesh text from Blender's bundled UI font (no textures)",
            'reference_photos': 'look matched to 12 CC BY 2.0 USAF photos of the Nellis AFB Exchange (2015 remodel), '
                                'kept privately; no photo pixels, logos or tenant marks are in the asset '
                                '(docs/research/area51-nellis-photo-reference.md)',
            'cultural_references': 'fictional, kid-safe; docs/research/area51-usaf-nellis-vegas-references.md section A; '
                                   'section B avoided (no Exchange/AAFES mark, no USAF symbol, no real brands)',
            'interior_lighting': 'materials carry emission = albedo x 0.5 (warm), ceiling 0.78, troffers 1.0: the '
                                 'store lighting, since the game sun is shadowed by the ceiling',
            'vertex_ao': bake or 'not baked (--no-bake)',
            'vertex_ao_method': 'Cycles AO bake to per-corner BYTE_COLOR attribute "AO", exported as COLOR_0; '
                                'remapped to floor..1. Real bake, no painted shading. Decals, the ceiling and '
                                'troffers are left at 1.0 (not baked).',
            'glb_bytes': glb.stat().st_size})
        print('BX_EXPORT', glb, glb.stat().st_size, stats, 'lap', round(ROUTE.length, 1))
    if args.render:
        print('BX_RENDERS', render(glb, args.render))


if __name__ == '__main__':
    main()
