"""Area 51½ district 1: Base Housing ("Liberty Loop").

Run (shared machine: wrap in heavy-slot, two threads):
  HEAVY_SLOT_LABEL=area51 heavy-slot -- /Applications/Blender.app/Contents/MacOS/Blender --background \
    --factory-startup --threads 2 --python tools/rc/blender/districts/housing.py -- \
    --out web/wwwroot/rc/assets/districts [--render evidence/area51/housing]
  ... --python tools/rc/blender/districts/housing.py -- --out DIR --render-only --render evidence/area51/housing

Layout (Blender metres, +Z up, X east, Y north). The street centreline is a rounded
rectangle, half extents 70 x 42 m, corner radius 24 m: a 406.8 m clockwise lap. Asphalt is
7 m wide with 12 cm concrete kerbs (a real step: a 5 cm-radius toy wheel cannot climb it, so
the kerb is the kid-friendly soft wall). Every driveway has a rubber kerb ramp, so lawns and
driveways are reachable and nothing is a dead end.

Shortcut: from the north street, up house N3's driveway (plywood jump ramp on it), through
its open double garage, out of the back door, across the shared backyard green (trampoline;
alien specimen hidden underneath), through the fence gap, through house S3's garage and down
its driveway onto the south street. 84 m instead of 125 m of road, but on grass and with two
90-degree turns. No gate sits in the skipped section, so both routes count.
"""
import argparse
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C   # noqa: E402
from common import (vis, col, marker, box, aabb, beam, wedge, cylinder, annulus, torus, ico,  # noqa: E402
                    polygon_slab, transform, ring_slab, ring_sheet, grid_region, Geo, hexa)

REPO = Path(__file__).resolve().parents[4]

C.PALETTE.update({
    'asphalt': ('#5E5A5E', 0, .92), 'paint': ('#F4C531', 0, .6), 'concrete': ('#D3C9B5', 0, .88),
    'grass': ('#79BD47', 0, .95), 'leaf': ('#4E9E3C', 0, .85), 'trunk': ('#7D5535', 0, .9),
    'siding_yellow': ('#F5D57A', 0, .7), 'siding_blue': ('#9ECBEA', 0, .7), 'siding_mint': ('#ABDDB4', 0, .7),
    'siding_coral': ('#F4A68E', 0, .7), 'siding_cream': ('#F2E6CB', 0, .7),
    'roof_brown': ('#8E5B45', 0, .8), 'roof_slate': ('#56688A', 0, .75), 'trim': ('#F8F5EC', 0, .55),
    'door_red': ('#D9483F', 0, .5), 'glass': ('#7FB7D8', .1, .15), 'wood': ('#C1915C', 0, .8),
    'plywood': ('#E5BE7C', 0, .7), 'metal': ('#97A2AC', .6, .4), 'rubber': ('#2A2F3A', 0, .85),
    'pad_blue': ('#2F63B5', 0, .55),
})

LOOP = C.RoundedLoop(70, 42, 24)
ROAD, KERB, PARK, WALK = 3.5, 3.65, 5.0, 6.5
Z_KERB, Z_LAWN, Z_WALK, Z_DRIVE = .12, .11, .12, .14
GATE_D = [0, 40, 80, 120, 160, 196, 230, 378]


def L(part, gx, fy, s):
    """House-local (u along street, v toward street from the front wall) -> world."""
    return transform(part, lambda p: (gx + s * p[0], fy + s * p[1], p[2]))


# ---------------------------------------------------------------- street, kerbs, lawns

def ground():
    vis('street', 'asphalt').add(ring_sheet(LOOP, [-ROAD, -2.6, -1.2, 0, 1.2, 2.6, ROAD], 0), kind='up')
    col('asphalt', 'street', ring_slab(LOOP, -ROAD, ROAD, -.3, 0))
    for sgn, side in ((-1, 'in'), (1, 'out')):
        a, b = sorted((sgn * ROAD, sgn * KERB))
        vis('street', 'concrete').add(ring_slab(LOOP, a, b, -.02, Z_KERB))
        col('concrete', f'kerb_{side}', ring_slab(LOOP, a, b, -.3, Z_KERB))
        a, b = sorted((sgn * KERB, sgn * PARK))
        vis('street', 'grass').add(ring_sheet(LOOP, [a, b], Z_LAWN), kind='up')
        col('grass', f'parkway_{side}', ring_slab(LOOP, a, b, -.3, Z_LAWN))
        a, b = sorted((sgn * PARK, sgn * WALK))
        vis('street', 'concrete').add(ring_slab(LOOP, a, b, -.02, Z_WALK))
        col('concrete', f'sidewalk_{side}', ring_slab(LOOP, a, b, -.3, Z_WALK))
    # Lawns: clipped regular grids (dense enough for vertex AO under houses and fences),
    # edges tucked 10 cm under the sidewalk: hides the chordal clip line without a wide
    # coplanar overlap that would z-fight at distance.
    inner = -6.4
    vis('lawn', 'grass').add(grid_region(-64, 64, -36, 36, 1.0, lambda p: LOOP.sdf(p, inner) < 0,
                                         lambda p: LOOP.to_boundary(p, inner), Z_LAWN), kind='up')
    col('grass', 'infield', polygon_slab(LOOP.ring(-WALK), -.3, Z_LAWN))
    o_in, o_out = 6.4, 38

    def inside(p):
        return LOOP.sdf(p, o_in) > 0 and LOOP.sdf(p, o_out) < 0

    def project(p):
        return LOOP.to_boundary(p, o_in if LOOP.sdf(p, o_in) <= 0 else o_out)
    vis('lawn', 'grass').add(grid_region(-109, 109, -81, 81, 1.25, inside, project, Z_LAWN), kind='up')
    col('grass', 'outfield', ring_slab(LOOP, WALK, o_out, -.3, Z_LAWN))
    vis('far', 'grass').add(ring_sheet(LOOP, [37.5, 60, 400], .1), kind='up')
    # White perimeter fence: the soft boundary. Closed collision ring.
    g = vis('perimeter', 'trim')
    g.add(ring_slab(LOOP, 35.95, 36.05, 0, 1.15))
    g.add(ring_slab(LOOP, 35.9, 36.1, 1.15, 1.22))
    for i, p in enumerate(LOOP.ring(36)):
        if i % 2 == 0:
            g.add(box(p[0], p[1], 0, .16, .16, 1.3))
    col('wood', 'perimeter_fence', ring_slab(LOOP, 35.9, 36.1, -.3, 1.3))
    # Centre-line dashes and a chequered start/finish line.
    g = vis('decal', 'paint')
    for k in range(int(LOOP.length // 6)):
        d0 = 3 + 6 * k
        if d0 + 3 > LOOP.length - 2:
            break
        pts = [LOOP.at(d0 + t) for t in (0, 1, 2, 3)]
        v = []
        for (p, _, n) in pts:
            v += [(p[0] - n[0] * .07, p[1] - n[1] * .07, .004), (p[0] + n[0] * .07, p[1] + n[1] * .07, .004)]
        g.add((v, [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(3)]), kind='up')
    p, t, n = LOOP.at(0)
    for row in range(2):
        for k in range(14):
            off = -ROAD + .25 + .5 * k
            along = -.25 + .5 * row
            c = (p[0] + n[0] * off + t[0] * along, p[1] + n[1] * off + t[1] * along)
            vis('decal', 'trim' if (row + k) % 2 else 'rubber').add(box(c[0], c[1], 0, .5, .5, .005))


# ---------------------------------------------------------------- ranch houses

def house(hid, gx, fy, s, living_dir, paint, roof, kerb_y, tunnel=False, chimney=False, shutter='roof_slate'):
    D, H, W = 9.0, 2.6, 12.0
    ud = living_dir * s
    lu = sorted((ud * 3.25, ud * (3.25 + W)))
    u0, u1 = min(-3.25, lu[0]), max(3.25, lu[1])
    grp = f'house_{hid}'

    def V(mat, part, **kw):
        vis(grp, mat).add(L(part, gx, fy, s), **kw)

    def K(surface, label, part, extras=None):
        col(surface, f'{hid}_{label}', L(part, gx, fy, s), extras)

    def at_u(k):
        return ud * (3.25 + k)

    # Walls.
    if tunnel:
        V('concrete', aabb(lu[0] - .06, lu[1] + .06, -D - .06, .06, 0, .3))
        V(paint, aabb(lu[0], lu[1], -D, 0, .3, H))
        K('wood', 'living', aabb(lu[0], lu[1], -D, 0, 0, H))
        ow = sorted((-ud * 3.25, -ud * 3.05))
        pieces = [aabb(ow[0], ow[1], -D, 0, 0, H),
                  aabb(-3.25, -1.8, -D, -D + .2, 0, H), aabb(1.8, 3.25, -D, -D + .2, 0, H),
                  aabb(-1.8, 1.8, -D, -D + .2, 2.25, H),
                  aabb(-3.25, -2.4, -.2, 0, 0, H), aabb(2.4, 3.25, -.2, 0, 0, H),
                  aabb(-2.4, 2.4, -.2, 0, 2.25, H), aabb(-3.25, 3.25, -D, 0, 2.45, H)]
        for i, part in enumerate(pieces):
            V(paint, part)
            K('wood', f'garage_{i}', part)
        V('concrete', aabb(-3.05, 3.05, -D + .2, -.2, 0, Z_DRIVE))
        K('concrete', 'garage_floor', aabb(-3.05, 3.05, -D - 1.2, 0, 0, Z_DRIVE))
        V('concrete', aabb(-1.9, 1.9, -D - 1.2, -D + .2, 0, Z_DRIVE))
        V('trim', aabb(-2.4, 2.4, -2.7, -.2, 2.28, 2.42))         # rolled-up door
        for jamb in (aabb(-2.55, -2.4, 0, .04, 0, 2.4), aabb(2.4, 2.55, 0, .04, 0, 2.4),
                     aabb(-2.55, 2.55, 0, .04, 2.25, 2.4)):
            V('trim', jamb)                                        # open door frame
        V('concrete', aabb(ow[0] - .06, ow[1] + .06, -D - .06, .06, 0, .3))
        sh = sorted((-ud * 2.5, -ud * 3.05))
        V('wood', aabb(sh[0], sh[1], -7, -2.5, Z_DRIVE, 1.7))
        K('wood', 'shelf', aabb(sh[0], sh[1], -7, -2.5, 0, 1.7))
        for k, m in enumerate(('door_red', 'pad_blue', 'paint', 'door_red')):
            V(m, cylinder((-ud * 2.2, -6.4 + k * 1.1, Z_DRIVE), .12, .26, 10))
    else:
        V('concrete', aabb(u0 - .06, u1 + .06, -D - .06, .06, 0, .3))
        V(paint, aabb(u0, u1, -D, 0, .3, H))
        K('wood', 'walls', aabb(u0, u1, -D, 0, 0, H))
        V('trim', aabb(-2.4, 2.4, 0, .07, Z_DRIVE, 2.25))
        for k in range(4):
            V('trim', aabb(-2.38, 2.38, .07, .085, .5 + k * .45, .53 + k * .45))
        for uc in (-1.8, -.6, .6, 1.8):
            V('glass', aabb(uc - .45, uc + .45, 0, .09, 1.78, 2.06))
        V('trim', aabb(-2.6, 2.6, 0, .04, .3, 2.4))
    # Roof: gable along the street, 22-degree pitch, 0.5 m eaves, ridge cap, fascia.
    tan = math.tan(math.radians(22))
    vr, zr = -D / 2, H + D / 2 * tan
    ze = H - .5 * tan
    ra, rb = u0 - .5, u1 + .5
    att = [(u0, 0, H), (u0, -D, H), (u0, vr, zr), (u1, 0, H), (u1, -D, H), (u1, vr, zr)]
    att_f = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (0, 2, 5, 3), (1, 4, 5, 2)]
    V(paint, (att, att_f))
    K('wood', 'roof', (att, att_f))
    for front in (True, False):
        e = .5 if front else -D - .5
        bot = [(ra, vr, zr), (rb, vr, zr), (rb, e, ze), (ra, e, ze)]
        V(roof, hexa(bot + [(x, y, z + .14) for x, y, z in bot]))
        V('trim', aabb(ra, rb, e - .04 if front else e, e if front else e + .04, ze - .16, ze + .02))
    V(roof, aabb(ra, rb, vr - .14, vr + .14, zr + .08, zr + .22))
    # Front door, porch step and walk to the driveway.
    dc = at_u(2.2)
    V('trim', aabb(dc - .65, dc + .65, 0, .05, .3, 2.48))
    V('door_red', aabb(dc - .5, dc + .5, 0, .08, .32, 2.32))
    V('metal', aabb(dc + ud * .32 - .04, dc + ud * .32 + .04, .08, .13, 1.15, 1.25))
    V('concrete', aabb(dc - 1, dc + 1, 0, 1.2, 0, .28))
    K('concrete', 'step', aabb(dc - 1, dc + 1, 0, 1.2, 0, .28))
    wa = sorted((ud * 2.6, dc + ud * .6))
    V('concrete', aabb(wa[0], wa[1], 1.2, 2.2, 0, Z_LAWN + .008))
    # Windows: frame, glass, shutters, flower box out front; plain on back and end walls.
    for k in (5.8, 9.6):
        uc = at_u(k)
        V('trim', aabb(uc - .85, uc + .85, 0, .05, .85, 2.15))
        V('glass', aabb(uc - .7, uc + .7, 0, .075, .98, 2.02))
        for side in (-1, 1):
            V(shutter, aabb(uc + side * .92 - .19, uc + side * .92 + .19, 0, .06, .9, 2.1))
        V('wood', aabb(uc - .8, uc + .8, 0, .28, .62, .84))
        for j in range(5):
            V('door_red' if j % 2 else 'trim', ico((uc - .6 + j * .3, .16, .9), .1, 1), smooth=True)
    for k in (3, 7, 10.5):
        uc = at_u(k)
        V('trim', aabb(uc - .75, uc + .75, -D - .05, -D, 1.0, 2.1))
        V('glass', aabb(uc - .6, uc + .6, -D - .075, -D, 1.1, 2.0))
    ue = ud * (3.25 + W)
    sgn = 1 if ue > 0 else -1
    V('trim', aabb(ue, ue + sgn * .05, -5.3, -3.7, 1.0, 2.1))
    V('glass', aabb(ue, ue + sgn * .075, -5.15, -3.85, 1.1, 2.0))
    if chimney:
        cu = at_u(8)
        V('door_red', aabb(cu - .4, cu + .4, -6.2, -5.4, 3.0, 5.1))
        V('concrete', aabb(cu - .5, cu + .5, -6.3, -5.3, 5.1, 5.22))
    for k in (4.0, 7.7, 11.4):
        uc = at_u(k)
        V('leaf', ico((uc, .75, .42), .55, 2, (1.15, 1, .8)), smooth=True)
    # Driveway, kerb ramp (rubber, like a real gutter ramp) and mailbox.
    lk = abs(kerb_y - fy)
    V('concrete', aabb(-2.6, 2.6, 0, lk, 0, Z_DRIVE))
    K('concrete', 'driveway', aabb(-2.6, 2.6, 0, lk, 0, Z_DRIVE))
    for j in range(1, int(lk // 3.5) + 1):
        vis('decal', 'rubber').add(L(aabb(-2.6, 2.6, j * 3.5 - .02, j * 3.5 + .02, Z_DRIVE, Z_DRIVE + .002), gx, fy, s))
    rmp = wedge((0, lk + .9), (0, lk), 5.2, 0, Z_DRIVE)
    V('rubber', rmp)
    K('concrete', 'kerb_ramp', rmp)
    mu, mv = -ud * 3.5, lk - .75
    V('wood', aabb(mu - .05, mu + .05, mv - .05, mv + .05, 0, 1.05))
    V('metal', aabb(mu - .12, mu + .12, mv - .25, mv + .25, 1.05, 1.2))
    V('metal', cylinder((mu, mv - .25, 1.2), .12, .5, 10, 'Y'))
    V('door_red', aabb(mu + .12, mu + .14, mv + .05, mv + .1, 1.15, 1.45))
    K('metal', 'mailbox', aabb(mu - .13, mu + .13, mv - .26, mv + .26, 0, 1.33))
    return {'id': hid, 'garage_x': gx, 'front_y': fy, 'tunnel': tunnel}


# ---------------------------------------------------------------- props

def tree(x, y, s=1.0, label='tree'):
    vis('trees', 'trunk').add(cylinder((x, y, 0), .17 * s, 2.5 * s, 8))
    g = vis('trees', 'leaf')
    for dx, dy, dz, r in ((0, 0, 2.7, 1.55), (.7, .35, 3.4, 1.15), (-.6, -.45, 3.15, 1.25), (.1, -.2, 4.1, .9)):
        g.add(ico((x + dx * s, y + dy * s, dz * s), r * s, 2), smooth=True)
    col('wood', label, box(x, y, 0, .36 * s, .36 * s, 2.5 * s))


def fence_run(p, q, label, h=1.8):
    g = vis('fences', 'wood')
    g.add(beam(p, q, .05, 0, h))
    n = max(1, round(math.dist(p, q) / 2.4))
    for i in range(n + 1):
        t = i / n
        g.add(box(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, 0, .12, .12, h + .08))
    g.add(beam(p, q, .1, h - .1, .08))
    col('wood', label, beam(p, q, .12, -.3, h))


def trampoline(cx, cy):
    z = Z_LAWN
    for i in range(6):
        a = math.pi * i / 3
        vis('green', 'metal').add(cylinder((cx + 1.8 * math.cos(a), cy + 1.8 * math.sin(a), z), .03, .8, 8))
        col('metal', 'trampoline_leg', box(cx + 1.8 * math.cos(a), cy + 1.8 * math.sin(a), 0, .07, .07, z + .82))
    vis('green', 'metal').add(torus((cx, cy, z + .82), 1.8, .035, 32, 6))
    vis('green', 'pad_blue').add(annulus((cx, cy), 1.45, 1.86, z + .83, z + .88, 32))
    vis('green', 'rubber').add(cylinder((cx, cy, z + .8), 1.47, .03, 32, smooth=False))
    col('carpet', 'trampoline_bed', cylinder((cx, cy, z + .76), 1.86, .12, 12, smooth=False),
        {'bounce': 1.6, 'note': 'trampoline bed: restitution boost for the car physics'})


def bbq(cx, cy):
    g = vis('green', 'rubber')
    g.add(ico((cx, cy, .95), .32, 2, (1, 1, .75)), smooth=True)
    g.add(cylinder((cx, cy, 1.15), .04, .08, 8))
    for i in range(3):
        a = 2 * math.pi * i / 3
        vis('green', 'metal').add(beam((cx, cy), (cx + .3 * math.cos(a), cy + .3 * math.sin(a)), .03, Z_LAWN, .7))
        vis('green', 'metal').add(box(cx + .3 * math.cos(a), cy + .3 * math.sin(a), Z_LAWN, .04, .04, .75))
    col('metal', 'bbq', box(cx, cy, 0, .7, .7, 1.25))


def picnic_table(cx, cy):
    g = vis('green', 'wood')
    g.add(aabb(cx - .9, cx + .9, cy - .4, cy + .4, .7, .76))
    col('wood', 'picnic_top', aabb(cx - .9, cx + .9, cy - .4, cy + .4, .7, .76))
    for sy in (-.7, .7):
        g.add(aabb(cx - .9, cx + .9, cy + sy - .14, cy + sy + .14, .42, .46))
        col('wood', 'picnic_bench', aabb(cx - .9, cx + .9, cy + sy - .14, cy + sy + .14, .42, .46))
    for sx in (-.7, .7):
        for sy in (-1, 1):
            g.add(aabb(cx + sx - .05, cx + sx + .05, cy + sy * .75 - .04, cy + sy * .75 + .04, Z_LAWN, .72))
            col('wood', 'picnic_leg', aabb(cx + sx - .05, cx + sx + .05, cy + sy * .75 - .04,
                                           cy + sy * .75 + .04, 0, .72))


def doghouse(cx, cy):
    vis('green', 'door_red').add(aabb(cx - .55, cx + .55, cy - .7, cy + .7, Z_LAWN, .85))
    v = [(cx - .65, cy - .8, .85), (cx + .65, cy - .8, .85), (cx, cy - .8, 1.3),
         (cx - .65, cy + .8, .85), (cx + .65, cy + .8, .85), (cx, cy + .8, 1.3)]
    vis('green', 'trim').add((v, [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (0, 3, 5, 2), (1, 2, 5, 4)]))
    vis('green', 'rubber').add(aabb(cx - .25, cx + .25, cy - .705, cy - .69, Z_LAWN, .62))
    col('wood', 'doghouse', aabb(cx - .55, cx + .55, cy - .7, cy + .7, 0, 1.2))


def kiddie_pool(cx, cy):
    vis('green', 'pad_blue').add(annulus((cx, cy), 1.05, 1.25, Z_LAWN - .01, Z_LAWN + .26, 24))
    vis('green', 'glass').add(cylinder((cx, cy, Z_LAWN - .01), 1.06, .2, 24, smooth=False))
    col('metal', 'kiddie_pool_rim', annulus((cx, cy), 1.05, 1.25, -.1, Z_LAWN + .26, 12),
        {'note': 'inflatable pool rim; the water inside is a shallow obstacle-free disc'})


def swing_set(cx, cy):
    for sx in (-1.6, 1.6):
        for sy in (-.9, .9):
            vis('green', 'metal').add(beam((cx + sx, cy + sy * .05), (cx + sx * 1.0, cy + sy), .07, Z_LAWN, .07))
            p0, p1 = (cx + sx, cy), (cx + sx, cy + sy)
            v = [(p0[0] - .035, p0[1], 2.2), (p0[0] + .035, p0[1], 2.2), (p1[0] + .035, p1[1], Z_LAWN),
                 (p1[0] - .035, p1[1], Z_LAWN)]
            v += [(x, y + (.035 if sy > 0 else -.035), z) for x, y, z in v]
            vis('green', 'metal').add(hexa([v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7]]))
            col('metal', 'swing_leg', box(p1[0], p1[1] - sy * .45, 0, .12, .9, 1.1))
    vis('green', 'metal').add(cylinder((cx - 1.7, cy, 2.2), .05, 3.4, 10, 'X'))
    for sx, m in ((-.7, 'door_red'), (.7, 'paint')):
        vis('green', m).add(aabb(cx + sx - .25, cx + sx + .25, cy - .12, cy + .12, .45, .5))
        for dx in (-.22, .22):
            vis('green', 'metal').add(aabb(cx + sx + dx - .01, cx + sx + dx + .01, cy - .01, cy + .01, .5, 2.2))


def bike(cx, cy, yaw):
    """A kid's bike lying on its side in the grass."""
    ca, sa = math.cos(yaw), math.sin(yaw)

    def P(a, b):
        return (cx + a * ca - b * sa, cy + a * sa + b * ca)
    z = Z_LAWN + .03
    for a in (0, 1.0):
        p = P(a, 0)
        vis('props', 'rubber').add(torus((p[0], p[1], z), .27, .03, 20, 6))
        vis('props', 'metal').add(cylinder((p[0], p[1], z - .01), .04, .05, 8))
    frame = [((0, 0), (.42, -.02)), ((.42, -.02), (.36, .5)), ((.36, .5), (0, 0)),
             ((.36, .5), (.88, .48)), ((.42, -.02), (.88, .48)), ((.88, .48), (1.0, 0))]
    for a, b in frame:
        vis('props', 'door_red').add(beam(P(*a), P(*b), .045, z + .02, .045))
    s = P(.34, .58)
    vis('props', 'rubber').add(box(s[0], s[1], z + .02, .22, .1, .07, yaw))
    h = P(.9, .62)
    vis('props', 'metal').add(box(h[0], h[1], z + .02, .05, .05, .42))
    c = P(.5, .25)
    col('metal', 'bike', box(c[0], c[1], 0, 1.65, .95, .28, yaw))


def hoop(px, py):
    vis('props', 'metal').add(cylinder((px, py, Z_LAWN), .06, 3.1, 10))
    vis('props', 'metal').add(aabb(px, px + .8, py - .04, py + .04, 2.9, 2.98))
    vis('props', 'trim').add(aabb(px + .8, px + .85, py - .6, py + .6, 2.7, 3.5))
    vis('props', 'door_red').add(aabb(px + .85, px + .86, py - .2, py + .2, 3.0, 3.3))
    vis('props', 'door_red').add(torus((px + 1.1, py, 3.02), .23, .015, 16, 4))
    vis('props', 'concrete').add(cylinder((px, py, Z_LAWN - .02), .3, .1, 12))
    col('metal', 'hoop_pole', box(px, py, 0, .2, .2, 3.1))


def flag(px, py):
    vis('park', 'concrete').add(cylinder((px, py, 0), 1.4, .25, 20, smooth=False))
    col('concrete', 'flag_plinth', cylinder((px, py, -.1), 1.4, .35, 12, smooth=False))
    vis('park', 'metal').add(cylinder((px, py, .25), .07, 8.8, 12))
    vis('park', 'plywood').add(ico((px, py, 9.12), .13, 2), smooth=True)
    col('metal', 'flagpole', box(px, py, 0, .16, .16, 9))
    # 13 stripes and a canton, gently waving; thin double-sided strips (offset 2 mm).
    top, fh, fl, nseg = 8.95, .95, 1.55, 10
    sh = fh / 13

    def wave(x):
        return .09 * math.sin(x * 3.6) * (x / fl)

    def strip(mat, x0, x1, z0, z1):
        n = max(2, round(nseg * (x1 - x0) / fl))
        xs = [x0 + (x1 - x0) * i / n for i in range(n + 1)]
        for side in (-1, 1):
            off = side * .002
            v = []
            for x in xs:
                v += [(px + .07 + x, py + wave(x) + off, z0), (px + .07 + x, py + wave(x) + off, z1)]
            f = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) if side > 0 else (2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2)
                 for i in range(n)]
            vis('park', mat).add((v, f), kind='flag')
    for k in range(13):
        z1 = top - k * sh
        x0 = .62 if k < 7 else 0
        strip('door_red' if k % 2 == 0 else 'trim', x0, fl, z1 - sh, z1)
    strip('pad_blue', 0, .62, top - 7 * sh, top)
    for i in range(5):
        for j in range(4):
            x = .07 + i * .12
            z = top - .07 - j * .12
            for side in (-1, 1):
                y = py + wave(x) + side * .0045
                vis('park', 'trim').add(((
                    (px + .07 + x - .025, y, z - .025), (px + .07 + x + .025, y, z - .025),
                    (px + .07 + x + .025, y, z + .025), (px + .07 + x - .025, y, z + .025)),
                    [(0, 1, 2, 3) if side > 0 else (0, 3, 2, 1)]), kind='flag')
    for i in range(18):
        a = 2 * math.pi * i / 18
        vis('park', ('door_red', 'trim', 'pad_blue')[i % 3]).add(
            ico((px + 1.65 * math.cos(a), py + 1.65 * math.sin(a), Z_LAWN + .08), .13, 1), smooth=True)


def bench(cx, cy, yaw):
    g = vis('park', 'wood')
    g.add(box(cx, cy, .42, 1.6, .42, .06, yaw))
    ca, sa = math.cos(yaw), math.sin(yaw)
    bx, by = cx - .2 * (-sa), cy - .2 * ca
    g.add(box(bx, by, .5, 1.6, .05, .45, yaw))
    for sx in (-.7, .7):
        g.add(box(cx + sx * ca, cy + sx * sa, Z_LAWN, .08, .4, .32, yaw))
    col('wood', 'bench', box(cx, cy, 0, 1.6, .45, .95, yaw))


def plywood_ramp(cx, y_lo, y_hi, width=1.8, h=.4):
    part = wedge((cx, y_lo), (cx, y_hi), width, Z_DRIVE, h)
    vis('ramp', 'plywood').add(part)
    for sx in (-1, 0, 1):
        x = cx + sx * (width / 2 - .06)
        vis('ramp', 'wood').add(aabb(x - .05, x + .05, y_hi - .09, y_hi - .01, Z_DRIVE, Z_DRIVE + h - .01))
    for k in range(5):
        y = y_lo + (y_hi - y_lo) * (k + .5) / 5
        frac = (y - y_lo) / (y_hi - y_lo)
        vis('decal', 'paint').add(aabb(cx - width / 2 + .05, cx + width / 2 - .05, y - .05, y + .05,
                                      Z_DRIVE + h * frac + .004, Z_DRIVE + h * frac + .012))
    col('wood', 'plywood_ramp', part, {'note': '40 cm kicker: optional jump on the shortcut'})


# ---------------------------------------------------------------- race metadata

def race_markers():
    gates = []
    for i, d in enumerate(GATE_D):
        p, t, _ = LOOP.at(d)
        gates.append(marker(f'GATE_{i:02d}', (p[0], p[1], 0), t, (ROAD, 1, 1),
                            {'lap_order': i, 'track_distance_m': round(d, 2), 'half_width_m': ROAD},
                            'SINGLE_ARROW'))
    p, t, n = LOOP.at(0)
    for k, (back, lat) in enumerate(((3, 1.1), (3, -1.1), (6, 1.1), (6, -1.1)), start=1):
        marker(f'START_{k}', (p[0] - t[0] * back + n[0] * lat, p[1] - t[1] * back + n[1] * lat, 0), t,
               extras={'grid_slot': k, 'player': k == 1}, display='SINGLE_ARROW')
    count = round(LOOP.length / 8)
    step = LOOP.length / count
    for k in range(count):
        p, t, _ = LOOP.at(k * step)
        marker(f'AI_{k:03d}', (p[0], p[1], 0), t, (3.1, 1, 1), {'track_distance_m': round(k * step, 2)},
               'SINGLE_ARROW')
    picks = []
    for k, (d, lat) in enumerate(((22, 1.6), (62, -1.6), (102, 0), (142, 1.6), (212, -1.6), (300, 0), (342, 1.6))):
        p, _, n = LOOP.at(d)
        picks.append((p[0] + n[0] * lat, p[1] + n[1] * lat, .3))
    picks += [(38.75, 19.8, Z_DRIVE + .3), (38.75, -3.0, Z_LAWN + .3)]
    for k, at in enumerate(picks, start=1):
        marker(f'PICKUP_{k:02d}', at, extras={'route': 'shortcut' if k > 7 else 'main'}, display='SPHERE')
    marker('SPEC_01', (30, 0, Z_LAWN + .22), extras={'hint': 'under the backyard trampoline, off the shortcut'},
           display='CUBE')
    marker('CAM_garage_tunnel', (38.75, 28.0, .5), (0, -1), extras={'note': 'optional low chase hint through N3 garage'})
    return gates, step, count


def build():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    C.ROOT = marker('Housing_Root', (0, 0, 0))
    C.ROOT.parent = None
    ground()
    houses = [
        house('N1', -41.75, 24, 1, 1, 'siding_yellow', 'roof_brown', 38.5, chimney=True),
        house('N2', 4.25, 24, 1, -1, 'siding_blue', 'roof_slate', 38.5, shutter='door_red'),
        house('N3', 38.75, 24, 1, -1, 'siding_coral', 'roof_brown', 38.5, tunnel=True),
        house('S1', -27.25, -24, -1, -1, 'siding_mint', 'roof_slate', -38.5, chimney=True, shutter='door_red'),
        house('S2', -2.75, -24, -1, 1, 'siding_cream', 'roof_brown', -38.5),
        house('S3', 38.75, -24, -1, -1, 'siding_blue', 'roof_slate', -38.5, tunnel=True, shutter='door_red'),
        house('O1', -20, 56.5, -1, -1, 'siding_mint', 'roof_brown', 45.5, chimney=True),
        house('O2', 22, 56.5, -1, 1, 'siding_yellow', 'roof_slate', 45.5, shutter='door_red'),
    ]
    # Backyard green: fenced, open only at the shortcut gaps behind the N3/S3 garages.
    for y in (11, -11):
        tag = 'n' if y > 0 else 's'
        fence_run((-50, y), (36.0, y), f'fence_green_{tag}_w')
        fence_run((41.5, y), (50, y), f'fence_green_{tag}_e')
    fence_run((-50, -11), (-50, 11), 'fence_green_w')
    fence_run((50, -11), (50, 11), 'fence_green_e')
    trampoline(30, 0)
    bbq(-15, 5)
    picnic_table(-24, -3)
    doghouse(16, 7.5)
    kiddie_pool(-2, -4)
    swing_set(-34, 5)
    plywood_ramp(38.75, 33.6, 32.0)
    bike(-12, 52, .5)
    hoop(18.5, 51.5)
    flag(0, -62)
    bench(-4.5, -58.5, 0)
    bench(4.5, -58.5, 0)
    # Distant low-poly tree line beyond the perimeter: depth for the toy's-eye horizon.
    for i, (sg, u) in enumerate(LOOP.params[::7]):
        p = LOOP.point(sg, u, 62 + 9 * ((i * 7) % 3))
        r = 9 + 4 * ((i * 5) % 3)
        vis('far', 'leaf').add(ico((p[0], p[1], -1.5), r, 2, (1.5, 1.5, .62)), smooth=True)
    trees = [(-34, -60, 1.1), (-22, -68, 1.2), (22, -66, 1.1), (34, -58, 1.0), (-50, -72, 1.3), (50, -72, 1.25),
             (-8, -72, 1.0), (10, -74, 1.15), (-48, 66, 1.2), (2, 68, 1.1), (48, 66, 1.2), (-8, 74, 1.0),
             (62, 60, 1.1), (-62, 58, 1.1), (-92, 0, 1.3), (-95, 24, 1.1), (-90, -28, 1.2), (-82, 48, 1.1),
             (92, 6, 1.3), (95, -22, 1.1), (88, 32, 1.2), (84, -46, 1.1), (-57, -4, 1.0), (-55, 9, 1.1),
             (57, -6, 1.0), (56, 9, .95), (-40, -2, 1.1), (6, 5, 1.0), (12, -6, .9), (-18, 29, 1.0),
             (16, 29.5, 1.05), (-15, -29, 1.0), (17, -30, 1.1)]
    street = [(-40, 46.3), (-5, 46.3), (8, 46.3), (40, 46.3), (-36, -46.3), (-12, -46.3), (12, -46.3),
              (36, -46.3), (74.3, -10), (74.3, 10), (-74.3, -10), (-74.3, 10)]
    for i, (x, y, s) in enumerate(trees):
        tree(x, y, s, f'tree_{i:02d}')
    for i, (x, y) in enumerate(street):
        tree(x, y, .85, f'street_tree_{i:02d}')
    gates, ai_step, ai_count = race_markers()
    C.ROOT['district'] = 'housing'
    C.ROOT['lap_length_m'] = round(LOOP.length, 2)
    C.ROOT['race_direction'] = 'clockwise from above'
    C.ROOT['shortcut'] = 'N3 driveway ramp -> N3 garage -> backyard green -> S3 garage -> south street'
    return {'houses': houses, 'ai_count': ai_count, 'ai_spacing_m': round(ai_step, 2), 'gates': len(gates)}


def shots():
    return [
        ('overview', (88, -150, 96), (0, -6, 0), 30),
        ('street-toy-eye', (8, -42.6, .16), (-40, -41.2, .4), 22),
        ('garage-ramp', (38.75, 42.4, .5), (38.75, 26, .9), 26),
        ('backyard-shortcut', (38.0, -6.5, .7), (38.75, 20, 1.1), 24),
    ]


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--blend', type=Path, default=REPO / 'assets/rc/districts/housing.blend')
    ap.add_argument('--render', type=Path)
    ap.add_argument('--render-only', action='store_true')
    ap.add_argument('--no-bake', action='store_true')
    args = ap.parse_args(argv)
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    glb = out / 'housing.glb'
    if not args.render_only:
        info = build()
        objs = C.flush_visuals()
        bake = None if args.no_bake else C.bake_ao(objs)
        args.blend.parent.mkdir(parents=True, exist_ok=True)
        bpy.context.preferences.filepaths.save_version = 0   # no housing.blend1 backups
        bpy.ops.wm.save_as_mainfile(filepath=str(args.blend.resolve()), compress=True)
        stats = C.counts()
        C.join_visuals_by_material()
        C.export_glb(glb)
        C.write_provenance(out / 'housing.provenance.json', {
            'script': 'housing.py', 'district': 'housing', 'editable_source': 'assets/rc/districts/housing.blend',
            'lap_length_m': round(LOOP.length, 2), 'gates': info['gates'], 'ai_nodes': info['ai_count'],
            'ai_spacing_m': info['ai_spacing_m'], 'houses': len(info['houses']), **stats,
            'vertex_ao': bake or 'not baked (--no-bake)',
            'vertex_ao_method': 'Cycles AO bake to per-corner BYTE_COLOR attribute "AO", exported as COLOR_0; '
                                'remapped to floor..1. Real bake, no painted shading.',
            'glb_bytes': glb.stat().st_size})
        print('HOUSING_EXPORT', glb, glb.stat().st_size, stats)
    if args.render:
        print('HOUSING_RENDERS', C.render_glb(glb, args.render, shots()))


if __name__ == '__main__':
    main()
