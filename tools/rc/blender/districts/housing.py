"""Area 51½ district 1: Base Housing ("Liberty Loop", Little Nellie AFB).

Run (shared machine: wrap in heavy-slot, two threads):
  HEAVY_SLOT_LABEL=area51 heavy-slot -- /Applications/Blender.app/Contents/MacOS/Blender --background \
    --factory-startup --threads 2 --python tools/rc/blender/districts/housing.py -- \
    --out web/wwwroot/rc/assets/districts [--render evidence/area51/housing]
  ... --python tools/rc/blender/districts/housing.py -- --out DIR --render-only --render evidence/area51/housing

v2 direction (owner, 2026-10-21): Nellis-flavoured desert base housing, bright and friendly:
stucco in warm desert pastels, low terracotta tile roofs, xeriscape yards (decomposed-granite
gravel, river rock, agave, barrel cactus, desert palms, mesquite) with a few turf patches, CMU
block walls, a brown mountain ridge to the east and a hazy generic skyline to the south-west.
Cultural dressing is fictional and kid-safe (docs/research/area51-usaf-nellis-vegas-references.md,
section A only; section B respected: no Thunderbirds marks, real insignia, casino names or
gambling imagery). All lettering is mesh text from Blender's bundled font.

Layout (Blender metres, +Z up, X east, Y north). Street centreline: rounded rectangle, half
extents 70 x 42 m, corner radius 16 m, a tighter 420.53 m clockwise lap. 7 m asphalt between ROLLED
(mountable) kerbs: a smoothstep rising 10 cm over 35 cm, so no vertical face anywhere on the road
edge. Every other step on drivable ground is <= 2 cm; anything taller is a real wall (>= 25 cm).

Street names: south RED FLAG DR, west WEAPONS SCHOOL WAY, north AGGRESSOR AVE, east THUNDER WAY.

Shortcut: north street -> house N3's driveway (plywood tabletop kicker) -> through its open
garage -> turf backyard green (trampoline; alien specimen underneath) -> wall gap -> house S3's
garage -> south street. 84 m instead of 125 m; no gate sits in the skipped section.
"""
import argparse
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C   # noqa: E402
from common import (vis, col, marker, box, aabb, beam, cylinder, annulus, torus, ico, frustum,  # noqa: E402
                    polygon_slab, transform, ring_slab, ring_sheet, ring_profile, rolled_kerb, grid_region,
                    hexa, text2d, place_flat, place_on_cylinder)

REPO = Path(__file__).resolve().parents[4]

C.PALETTE.update({
    'asphalt': ('#5E5A5E', 0, .92), 'paint': ('#F4C531', 0, .6), 'concrete': ('#D9CDB8', 0, .88),
    'grass': ('#7FBE4A', 0, .95), 'gravel': ('#D2B48C', 0, .97), 'rock': ('#9C6E55', 0, .9),
    'stucco_sand': ('#EBD3A4', 0, .9), 'stucco_peach': ('#F2B793', 0, .9), 'stucco_adobe': ('#D98E64', 0, .9),
    'stucco_sage': ('#BFCBA0', 0, .9), 'trim': ('#F8F3E8', 0, .55), 'roof_tile': ('#C0603C', 0, .75),
    'door_red': ('#D9483F', 0, .5), 'glass': ('#7FB7D8', .1, .15), 'cmu': ('#DCC39C', 0, .92),
    'plywood': ('#E5BE7C', 0, .7), 'metal': ('#97A2AC', .6, .4), 'rubber': ('#2A2F3A', 0, .85),
    'pad_blue': ('#2F63B5', 0, .55), 'leaf': ('#7FA65A', 0, .85), 'trunk': ('#8A6240', 0, .9),
    'sign_green': ('#2E7D4F', 0, .5), 'hi_vis': ('#DDF22E', 0, .35), 'haze': ('#C9C3DA', 0, .9),
})

LOOP = C.RoundedLoop(70, 42, 16)
ROAD, KERB, PARK, WALK = 3.5, 3.85, 5.0, 6.5
Z_KERB, Z_LAWN, Z_WALK, Z_TURF, Z_DRIVE = .10, .10, .11, .115, .115
GATE_D = [0, 40, 80, 120, 160, 196, 212, 378]


def L(part, gx, fy, s):
    """House-local (u along street, v toward street from the front wall) -> world."""
    return transform(part, lambda p: (gx + s * p[0], fy + s * p[1], p[2]))


def facing_quads(verts, quads, want):
    """Orient quads so their normal agrees with the desired direction (open far-field sheets)."""
    out = []
    for q in quads:
        a, b, c = verts[q[0]], verts[q[1]], verts[q[2]]
        u = [b[i] - a[i] for i in range(3)]
        w = [c[i] - b[i] for i in range(3)]
        n = (u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0])
        d = want(a)
        out.append(q if sum(n[i] * d[i] for i in range(3)) >= 0 else tuple(reversed(q)))
    return out


# ---------------------------------------------------------------- lettering and signs

def words(group_mat, body, size, centre, facing, max_w=None, bold=.02, out=.03):
    v, f, w = text2d(body, size, bold=bold)
    sc = min(1.0, max_w / w) if max_w and w else 1.0
    vis('decal', group_mat).add(place_flat(v, f, centre, facing, out=out, scale=sc), kind='flag')


def sign(label, cx, cy, facing, w, h, z0, lines, board='trim', border=None, posts=1, post='metal',
         both=False, collide=True, thick=.05):
    """Board on posts. lines: [(text, size, mat, dz from board centre)]. Text faces `facing`."""
    yaw = math.radians(facing + 90)
    a = math.radians(facing)
    n = (math.cos(a), math.sin(a))
    if border:
        vis('signs', border).add(box(cx - n[0] * .01, cy - n[1] * .01, z0 - .04, w + .08, thick, h + .08, yaw))
    vis('signs', board).add(box(cx, cy, z0, w, thick + .002, h, yaw))
    zc = z0 + h / 2
    for text, size, mat, dz in lines:
        words(mat, text, size, (cx, cy, zc + dz), facing, max_w=w * .9, out=thick / 2 + .006)
        if both:
            words(mat, text, size, (cx, cy, zc + dz), facing + 180, max_w=w * .9, out=thick / 2 + .006)
    r = (-n[1], n[0])
    xs = [0.0] if posts == 1 else [-w * .38, w * .38]
    for k in xs:
        px, py = cx + r[0] * k - n[0] * (thick / 2 + .04), cy + r[1] * k - n[1] * (thick / 2 + .04)
        vis('signs', post).add(box(px, py, 0, .07, .07, z0 + h * .85, yaw))
        if collide:
            col('metal', f'{label}_post', box(px, py, 0, .3, .3, max(z0 + h * .85, .5), yaw))


# ---------------------------------------------------------------- street, kerbs, yards, horizon

def ground():
    vis('street', 'asphalt').add(ring_sheet(LOOP, [-ROAD, -2.6, -1.2, 0, 1.2, 2.6, ROAD], 0), kind='up')
    col('asphalt', 'street', ring_slab(LOOP, -ROAD, ROAD, -.3, 0))
    for sgn, side in ((-1, 'in'), (1, 'out')):
        vis('street', 'concrete').add(ring_profile(LOOP, rolled_kerb(sgn * ROAD, sgn * KERB, Z_KERB, -.02)))
        col('concrete', f'rolled_kerb_{side}', ring_profile(LOOP, rolled_kerb(sgn * ROAD, sgn * KERB, Z_KERB, -.3, 4)))
        a, b = sorted((sgn * KERB, sgn * PARK))
        vis('street', 'gravel').add(ring_sheet(LOOP, [a, b], Z_LAWN), kind='up')
        col('gravel', f'parkway_{side}', ring_slab(LOOP, a, b, -.3, Z_LAWN))
        a, b = sorted((sgn * PARK, sgn * WALK))
        vis('street', 'concrete').add(ring_slab(LOOP, a, b, -.02, Z_WALK))
        col('concrete', f'sidewalk_{side}', ring_slab(LOOP, a, b, -.3, Z_WALK))
    # Decomposed-granite yards: clipped regular grids (dense enough for vertex AO), edges tucked
    # 10 cm under the sidewalk so the clip line never shows and nothing wide z-fights.
    inner = -6.4
    vis('yard', 'gravel').add(grid_region(-64, 64, -36, 36, 1.0, lambda p: LOOP.sdf(p, inner) < 0,
                                          lambda p: LOOP.to_boundary(p, inner), Z_LAWN), kind='up')
    col('gravel', 'infield', polygon_slab(LOOP.ring(-WALK), -.3, Z_LAWN))
    o_in, o_out = 6.4, 38

    def inside(p):
        return LOOP.sdf(p, o_in) > 0 and LOOP.sdf(p, o_out) < 0

    def project(p):
        return LOOP.to_boundary(p, o_in if LOOP.sdf(p, o_in) <= 0 else o_out)
    vis('yard', 'gravel').add(grid_region(-109, 109, -81, 81, 1.25, inside, project, Z_LAWN), kind='up')
    col('gravel', 'outfield', ring_slab(LOOP, WALK, o_out, -.3, Z_LAWN))
    vis('far', 'gravel').add(ring_sheet(LOOP, [37.5, 60, 700], .1), kind='up')
    # Tan CMU perimeter wall with a concrete cap and pilasters: the soft boundary.
    g = vis('perimeter', 'cmu')
    g.add(ring_slab(LOOP, 35.9, 36.1, 0, 1.4))
    for i, p in enumerate(LOOP.ring(36)):
        if i % 3 == 0:
            g.add(box(p[0], p[1], 0, .42, .42, 1.6))
    vis('perimeter', 'concrete').add(ring_slab(LOOP, 35.85, 36.15, 1.4, 1.47))
    col('concrete', 'perimeter_wall', ring_slab(LOOP, 35.85, 36.15, -.3, 1.47))
    # Centre-line dashes and a chequered start/finish line (paint only, <= 5 mm).
    g = vis('decal', 'paint')
    for k in range(int(LOOP.length // 6)):
        d0 = 3 + 6 * k
        if d0 + 3 > LOOP.length - 2:
            break
        v = []
        for (p, _, n) in [LOOP.at(d0 + t) for t in (0, 1, 2, 3)]:
            v += [(p[0] - n[0] * .07, p[1] - n[1] * .07, .004), (p[0] + n[0] * .07, p[1] + n[1] * .07, .004)]
        g.add((v, [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(3)]), kind='up')
    p, t, n = LOOP.at(0)
    for row in range(2):
        for k in range(14):
            off, along = -ROAD + .25 + .5 * k, -.25 + .5 * row
            c = (p[0] + n[0] * off + t[0] * along, p[1] + n[1] * off + t[1] * along)
            vis('decal', 'trim' if (row + k) % 2 else 'rubber').add(box(c[0], c[1], 0, .5, .5, .005))


def horizon():
    """Brown ridge to the east (Sunrise-Mountain-like, generic), low hills elsewhere, and a hazy
    generic skyline to the south-west. Silhouettes only; no real building likeness."""
    rows, n = [], 180
    for i in range(n):
        th = 2 * math.pi * i / n
        east = max(0.0, math.cos(th - math.radians(10))) ** 1.5
        h = 16 + 8 * math.sin(7 * th) + 5 * math.sin(17 * th + 1) + east * (60 + 22 * math.sin(5 * th + 1)
                                                                              + 12 * abs(math.sin(13 * th)))
        r = 470 + 30 * math.sin(3 * th)
        rows.append([(r * math.cos(th), r * math.sin(th), -1), ((r + 50) * math.cos(th), (r + 50) * math.sin(th), h * .62),
                     ((r + 95) * math.cos(th), (r + 95) * math.sin(th), h), ((r + 190) * math.cos(th), (r + 190) * math.sin(th), -1)])
    v = [p for row in rows for p in row]
    quads = [(i * 4 + k, ((i + 1) % n) * 4 + k, ((i + 1) % n) * 4 + k + 1, i * 4 + k + 1) for i in range(n) for k in range(3)]
    vis('far', 'rock').add((v, facing_quads(v, quads, lambda a: (-a[0], -a[1], 400))), kind='flag')
    for k in range(16):
        th = math.radians(198 + k * 3.1 + 1.3 * math.sin(k * 2.7))
        r = 560 + 30 * math.sin(k * 1.9)
        w = 12 + 8 * abs(math.sin(k * 3.3))
        h = 16 + 26 * abs(math.sin(k * 1.37 + .4)) + (14 if k in (5, 9) else 0)
        x, y = r * math.cos(th), r * math.sin(th)
        vis('far', 'haze').add(box(x, y, -1, w, w * .8, h, th))
        if k % 3 == 0:
            vis('far', 'haze').add(box(x, y, h - 1, w * .6, w * .5, h * .18, th))


# ---------------------------------------------------------------- desert plants and rocks

def agave(x, y, s=1.0):
    g = vis('plants', 'leaf')
    for ring, (count, rad, hgt) in enumerate(((11, .6, .42), (7, .38, .55))):
        for i in range(count):
            a = 2 * math.pi * i / count + ring * .3
            w = .09 * s
            px, py = -math.sin(a) * w, math.cos(a) * w
            tip = (x + math.cos(a) * rad * s, y + math.sin(a) * rad * s, Z_LAWN + hgt * s * (.8 + .2 * math.sin(i * 2.3)))
            v = [(x + px, y + py, Z_LAWN), (x - px, y - py, Z_LAWN), tip, (x, y, Z_LAWN + .12 * s)]
            g.add((v, [(0, 1, 2), (0, 2, 3), (1, 3, 2), (0, 3, 1)]))


def barrel_cactus(x, y):
    for dx, dy, r in ((0, 0, .3), (.55, .2, .22), (.2, -.5, .18)):
        vis('plants', 'leaf').add(ico((x + dx, y + dy, Z_LAWN + r), r, 2, (1, 1, 1.15)), smooth=True)
        vis('plants', 'door_red').add(ico((x + dx, y + dy, Z_LAWN + 2.1 * r), .06, 1), smooth=True)


def palm(x, y, h=7.0, label='palm'):
    vis('trees', 'trunk').add(frustum((x, y, 0), .24, .16, h, 10))
    vis('trees', 'trunk').add(ico((x, y, h), .38, 1), smooth=True)
    g = vis('trees', 'leaf')
    for i in range(10):
        a = 2 * math.pi * i / 10 + .2 * math.sin(i)
        ca, sa = math.cos(a), math.sin(a)
        pts = [(0, h + .1, .3), (1.0, h + .45, .26), (1.9, h + .2, .17), (2.6, h - .55, .05)]
        for (r0, z0, w0), (r1, z1, w1) in zip(pts, pts[1:]):
            c = [(x + ca * r0 + sa * w0, y + sa * r0 - ca * w0, z0), (x + ca * r0 - sa * w0, y + sa * r0 + ca * w0, z0),
                 (x + ca * r1 - sa * w1, y + sa * r1 + ca * w1, z1), (x + ca * r1 + sa * w1, y + sa * r1 - ca * w1, z1)]
            g.add(hexa([(p[0], p[1], p[2] - .025) for p in c] + [(p[0], p[1], p[2] + .025) for p in c]))
    col('wood', label, box(x, y, 0, .5, .5, h))


def mesquite(x, y, s=1.0, label='mesquite'):
    vis('trees', 'trunk').add(beam((x - .3 * s, y), (x + .1 * s, y + .1 * s), .22 * s, 0, 1.6 * s))
    vis('trees', 'trunk').add(cylinder((x, y, 0), .16 * s, 2.0 * s, 8))
    g = vis('trees', 'leaf')
    for dx, dy, dz, r in ((0, 0, 2.3, 1.7), (1.2, .5, 2.1, 1.2), (-1.1, -.6, 2.15, 1.25), (.2, -.9, 2.6, 1.0)):
        g.add(ico((x + dx * s, y + dy * s, dz * s), r * s, 2, (1.25, 1.25, .5)), smooth=True)
    col('wood', label, box(x, y, 0, .4 * s, .4 * s, 2.0 * s))


def boulder(x, y, r=.45, label='boulder'):
    vis('plants', 'rock').add(ico((x, y, Z_LAWN + r * .3), r, 1, (1.25, 1, .75)))
    col('concrete', label, box(x, y, 0, 2.2 * r, 1.8 * r, max(.4, r * .95)))


def river_rocks(pts):
    g = vis('plants', 'rock')
    for i, (x, y) in enumerate(pts):
        r = .12 + .05 * abs(math.sin(i * 1.7))
        g.add(ico((x, y, Z_LAWN + .02), r, 0, (1.2, 1, .55)))


def turf_patch(x0, x1, y0, y1, label):
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    vis('yard', 'grass').add(grid_region(x0, x1, y0, y1, 1.0, lambda p: True, lambda p: p, Z_TURF), kind='up')
    vis('yard', 'grass').add(aabb(x0, x1, y0, y1, Z_LAWN - .01, Z_TURF - .006))
    col('grass', label, aabb(x0, x1, y0, y1, -.3, Z_TURF))
    pts = []
    for (ax, ay), (bx, by) in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
        k = max(1, int(math.dist((ax, ay), (bx, by)) / .42))
        pts += [(ax + (bx - ax) * i / k, ay + (by - ay) * i / k) for i in range(k)]
    # River rock lies outside the turf edge (cosmetic only, ~5 cm high, no collision).
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    river_rocks([(px + .22 * (1 if px > cx else -1) * (abs(px - cx) > abs(x1 - x0) / 2 - .01),
                  py + .22 * (1 if py > cy else -1) * (abs(py - cy) > abs(y1 - y0) / 2 - .01)) for px, py in pts])


# ---------------------------------------------------------------- ranch houses (stucco, tile roofs)

def house(hid, gx, fy, s, living_dir, paint, road_y, tunnel=False, turf=False, palm_tree=True, banner=None,
          belt_mailbox=False):
    D, H, W = 9.0, 2.7, 12.0
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

    def W_(u, v):
        return (gx + s * u, fy + s * v)

    facing = 90 if s > 0 else 270
    if tunnel:
        V('concrete', aabb(lu[0] - .06, lu[1] + .06, -D - .06, .06, 0, .3))
        V(paint, aabb(lu[0], lu[1], -D, 0, .3, H))
        K('concrete', 'living', aabb(lu[0], lu[1], -D, 0, 0, H))
        ow = sorted((-ud * 3.25, -ud * 3.05))
        pieces = [aabb(ow[0], ow[1], -D, 0, 0, H),
                  aabb(-3.25, -1.8, -D, -D + .2, 0, H), aabb(1.8, 3.25, -D, -D + .2, 0, H),
                  aabb(-1.8, 1.8, -D, -D + .2, 2.25, H),
                  aabb(-3.25, -2.4, -.2, 0, 0, H), aabb(2.4, 3.25, -.2, 0, 0, H),
                  aabb(-2.4, 2.4, -.2, 0, 2.25, H), aabb(-3.25, 3.25, -D, 0, 2.55, H)]
        for i, part in enumerate(pieces):
            V(paint, part)
            K('concrete', f'garage_{i}', part)
        V('concrete', aabb(-3.05, 3.05, -D + .2, -.2, 0, Z_DRIVE))
        K('concrete', 'garage_floor', aabb(-3.05, 3.05, -D - 1.2, 0, -.3, Z_DRIVE))
        V('concrete', aabb(-1.9, 1.9, -D - 1.2, -D + .2, 0, Z_DRIVE))
        V('trim', aabb(-2.4, 2.4, -2.7, -.2, 2.33, 2.47))          # rolled-up door
        for jamb in (aabb(-2.55, -2.4, 0, .04, 0, 2.4), aabb(2.4, 2.55, 0, .04, 0, 2.4),
                     aabb(-2.55, 2.55, 0, .04, 2.25, 2.4)):
            V('trim', jamb)
        V('concrete', aabb(ow[0] - .06, ow[1] + .06, -D - .06, .06, 0, .3))
        sh = sorted((-ud * 2.5, -ud * 3.05))
        V('trunk', aabb(sh[0], sh[1], -7, -2.5, Z_DRIVE, 1.7))
        K('concrete', 'shelf', aabb(sh[0], sh[1], -7, -2.5, 0, 1.7))
        for k, m in enumerate(('door_red', 'pad_blue', 'paint', 'hi_vis')):
            V(m, cylinder((-ud * 2.2, -6.4 + k * 1.1, Z_DRIVE), .12, .26, 10))
    else:
        V('concrete', aabb(u0 - .06, u1 + .06, -D - .06, .06, 0, .3))
        V(paint, aabb(u0, u1, -D, 0, .3, H))
        K('concrete', 'walls', aabb(u0, u1, -D, 0, 0, H))
        V('trim', aabb(-2.4, 2.4, 0, .07, Z_DRIVE, 2.25))
        for k in range(4):
            V('cmu', aabb(-2.38, 2.38, .07, .085, .5 + k * .45, .53 + k * .45))
        for uc in (-1.8, -.6, .6, 1.8):
            V('glass', aabb(uc - .45, uc + .45, 0, .09, 1.78, 2.06))
        V('trim', aabb(-2.6, 2.6, 0, .04, .3, 2.4))
    # Low-pitch terracotta tile roof: 16-degree gable, 0.55 m eaves, barrel-tile ribs, ridge cap.
    tan = math.tan(math.radians(16))
    vr, zr = -D / 2, H + D / 2 * tan
    ze = H - .55 * tan
    ra, rb = u0 - .55, u1 + .55
    att = [(u0, 0, H), (u0, -D, H), (u0, vr, zr), (u1, 0, H), (u1, -D, H), (u1, vr, zr)]
    att_f = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (0, 2, 5, 3), (1, 4, 5, 2)]
    V(paint, (att, att_f))
    K('concrete', 'roof', (att, att_f))
    for front in (True, False):
        e = .55 if front else -D - .55
        bot = [(ra, vr, zr), (rb, vr, zr), (rb, e, ze), (ra, e, ze)]
        V('roof_tile', hexa(bot + [(x, y, z + .12) for x, y, z in bot]))
        k = 0
        u = ra + .3
        while u < rb - .2:
            rib = [(u - .07, vr, zr + .12), (u + .07, vr, zr + .12), (u + .07, e, ze + .12), (u - .07, e, ze + .12)]
            V('roof_tile', hexa(rib + [(x, y, z + .06) for x, y, z in rib]))
            u += .62
            k += 1
        V('trim', aabb(ra, rb, e - .04 if front else e, e if front else e + .04, ze - .1, ze + .02))
    V('roof_tile', aabb(ra, rb, vr - .16, vr + .16, zr + .1, zr + .26))
    # Front door, porch (a real 26 cm wall-step, not a wedge trap) and walk to the driveway.
    dc = at_u(2.2)
    V('trim', aabb(dc - .65, dc + .65, 0, .05, .3, 2.48))
    V('door_red' if hid in ('N2', 'S1', 'O2') else 'pad_blue', aabb(dc - .5, dc + .5, 0, .08, .36, 2.32))
    V('metal', aabb(dc + ud * .32 - .04, dc + ud * .32 + .04, .08, .13, 1.15, 1.25))
    V('concrete', aabb(dc - 1, dc + 1, 0, 1.2, 0, .36))
    K('concrete', 'porch', aabb(dc - 1, dc + 1, 0, 1.2, 0, .36))
    wa = sorted((ud * 2.6, dc + ud * .6))
    V('concrete', aabb(wa[0], wa[1], 1.2, 2.2, 0, Z_LAWN + .008))
    for k in (5.8, 9.6):
        uc = at_u(k)
        V('trim', aabb(uc - .85, uc + .85, 0, .05, .85, 2.15))
        V('glass', aabb(uc - .7, uc + .7, 0, .075, .98, 2.02))
        V('trim', aabb(uc - .95, uc + .95, 0, .14, .76, .86))           # stucco sill
    for k in (3, 7, 10.5):
        uc = at_u(k)
        V('trim', aabb(uc - .75, uc + .75, -D - .05, -D, 1.0, 2.1))
        V('glass', aabb(uc - .6, uc + .6, -D - .075, -D, 1.1, 2.0))
    ue = ud * (3.25 + W)
    sg = 1 if ue > 0 else -1
    V('trim', aabb(ue, ue + sg * .05, -5.3, -3.7, 1.0, 2.1))
    V('glass', aabb(ue, ue + sg * .075, -5.15, -3.85, 1.1, 2.0))
    # Driveway: concrete from the garage to the kerb crest (2 cm above gravel and the kerb crest).
    lk = abs(road_y - fy)
    K('concrete', 'driveway', aabb(-2.6, 2.6, 0, lk - (KERB - ROAD), -.3, Z_DRIVE))
    V('concrete', aabb(-2.6, 2.6, 0, lk - (WALK - ROAD), Z_LAWN - .01, Z_DRIVE))
    V('concrete', aabb(-2.6, 2.6, lk - (PARK - ROAD), lk - (KERB - ROAD), Z_LAWN - .01, Z_DRIVE))
    for j in range(1, int((lk - 3) // 3.5) + 1):
        vis('decal', 'rubber').add(L(aabb(-2.6, 2.6, j * 3.5 - .02, j * 3.5 + .02, Z_DRIVE, Z_DRIVE + .002), gx, fy, s))
    # Mailbox on the parkway (a real post: a wall, not a step).
    mu, mv = -ud * 3.5, lk - .75
    V('trunk', aabb(mu - .05, mu + .05, mv - .05, mv + .05, 0, 1.05))
    V('metal', aabb(mu - .12, mu + .12, mv - .25, mv + .25, 1.05, 1.2))
    V('metal', cylinder((mu, mv - .25, 1.2), .12, .5, 10, 'Y'))
    V('door_red', aabb(mu + .12, mu + .14, mv + .05, mv + .1, 1.15, 1.45))
    K('metal', 'mailbox', aabb(mu - .13, mu + .13, mv - .26, mv + .26, 0, 1.33))
    if belt_mailbox:   # the legendary reflective PT belt, draped over the mailbox
        V('hi_vis', aabb(mu - .15, mu + .15, mv - .05, mv + .05, 1.32, 1.34))
        for sx in (-1, 1):
            V('hi_vis', aabb(mu + sx * .15 - .01, mu + sx * .15 + .01, mv - .05, mv + .05, .75, 1.34))
    # Xeriscape front yard.
    for k in (4.8, 11.0):
        agave(*W_(at_u(k), 1.35), .9)
    barrel_cactus(*W_(at_u(11.8), lk - 4.9))
    boulder(*W_(ud * 3.45, lk - 4.4), .42, f'{hid}_boulder_a')
    boulder(*W_(-ud * 3.95, 2.6), .5, f'{hid}_boulder_b')
    if palm_tree:
        palm(*W_(at_u(1.3), lk - 5.6), 6.5, f'{hid}_palm')
    else:
        mesquite(*W_(at_u(1.3), lk - 5.6), .85, f'{hid}_mesquite')
    if turf:
        p0, p1 = W_(at_u(2.9), 2.8), W_(at_u(10.6), lk - 4.0)
        turf_patch(p0[0], p1[0], p0[1], p1[1], f'{hid}_turf')
    if banner:
        c = W_(0, .11)
        vis('signs', 'trim').add(L(aabb(-2.2, 2.2, .075, .1, 1.2, 1.85), gx, fy, s))
        words('door_red', banner, .34, (c[0], c[1], 1.53), facing, max_w=4.1, out=.0)
    return {'id': hid, 'garage_x': gx, 'front_y': fy, 'tunnel': tunnel}


# ---------------------------------------------------------------- backyard props

def block_wall(p, q, label, h=1.8):
    g = vis('walls', 'cmu')
    g.add(beam(p, q, .2, 0, h))
    n = max(1, round(math.dist(p, q) / 3.2))
    for i in range(n + 1):
        t = i / n
        g.add(box(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, 0, .4, .4, h + .1))
    vis('walls', 'concrete').add(beam(p, q, .28, h, .06))
    col('concrete', label, beam(p, q, .3, -.3, h + .06))


def trampoline(cx, cy):
    z = Z_TURF
    for i in range(6):
        a = math.pi * i / 3
        vis('green', 'metal').add(cylinder((cx + 1.8 * math.cos(a), cy + 1.8 * math.sin(a), z), .03, .8, 8))
        col('metal', 'trampoline_leg', box(cx + 1.8 * math.cos(a), cy + 1.8 * math.sin(a), 0, .07, .07, z + .82))
    vis('green', 'metal').add(torus((cx, cy, z + .82), 1.8, .035, 32, 6))
    vis('green', 'pad_blue').add(annulus((cx, cy), 1.45, 1.86, z + .83, z + .88, 32))
    vis('green', 'rubber').add(cylinder((cx, cy, z + .8), 1.47, .03, 32, smooth=False))
    col('rubber', 'trampoline_bed', cylinder((cx, cy, z + .76), 1.86, .12, 12, smooth=False),
        {'bounce': 1.6, 'note': 'trampoline bed: rubber surface, restitution boost for the car physics'})


def bbq(cx, cy):
    g = vis('green', 'rubber')
    g.add(ico((cx, cy, .95), .32, 2, (1, 1, .75)), smooth=True)
    g.add(cylinder((cx, cy, 1.15), .04, .08, 8))
    for i in range(3):
        a = 2 * math.pi * i / 3
        vis('green', 'metal').add(box(cx + .3 * math.cos(a), cy + .3 * math.sin(a), Z_TURF, .04, .04, .75))
    col('metal', 'bbq', box(cx, cy, 0, .7, .7, 1.25))


def picnic_table(cx, cy):
    g = vis('green', 'trunk')
    g.add(aabb(cx - .9, cx + .9, cy - .4, cy + .4, .7, .76))
    col('wood', 'picnic_top', aabb(cx - .9, cx + .9, cy - .4, cy + .4, .7, .76))
    for sy in (-.7, .7):
        g.add(aabb(cx - .9, cx + .9, cy + sy - .14, cy + sy + .14, .42, .46))
        col('wood', 'picnic_bench', aabb(cx - .9, cx + .9, cy + sy - .14, cy + sy + .14, .42, .46))
    for sx in (-.7, .7):
        for sy in (-1, 1):
            g.add(aabb(cx + sx - .05, cx + sx + .05, cy + sy * .75 - .04, cy + sy * .75 + .04, Z_TURF, .72))
            col('wood', 'picnic_leg', aabb(cx + sx - .05, cx + sx + .05, cy + sy * .75 - .04,
                                           cy + sy * .75 + .04, 0, .72))


def doghouse(cx, cy):
    vis('green', 'door_red').add(aabb(cx - .55, cx + .55, cy - .7, cy + .7, Z_TURF, .85))
    v = [(cx - .65, cy - .8, .85), (cx + .65, cy - .8, .85), (cx, cy - .8, 1.3),
         (cx - .65, cy + .8, .85), (cx + .65, cy + .8, .85), (cx, cy + .8, 1.3)]
    vis('green', 'trim').add((v, [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (0, 3, 5, 2), (1, 2, 5, 4)]))
    vis('green', 'rubber').add(aabb(cx - .25, cx + .25, cy - .705, cy - .69, Z_TURF, .62))
    words('trim', 'DEFENDER DOG', .1, (cx, cy - .7, .74), 270, max_w=1.0, out=.0)
    col('wood', 'doghouse', aabb(cx - .55, cx + .55, cy - .7, cy + .7, 0, 1.2))


def kiddie_pool(cx, cy):
    vis('green', 'pad_blue').add(annulus((cx, cy), 1.05, 1.25, Z_TURF - .01, .42, 24))
    vis('green', 'glass').add(cylinder((cx, cy, Z_TURF - .01), 1.06, .2, 24, smooth=False))
    col('rubber', 'kiddie_pool_rim', annulus((cx, cy), 1.05, 1.25, -.1, .42, 12),
        {'note': 'inflatable pool rim, 30 cm: a wall, not a step'})


def swing_set(cx, cy):
    for sx in (-1.6, 1.6):
        for sy in (-.9, .9):
            p0, p1 = (cx + sx, cy), (cx + sx, cy + sy)
            v = [(p0[0] - .035, p0[1], 2.2), (p0[0] + .035, p0[1], 2.2), (p1[0] + .035, p1[1], Z_TURF),
                 (p1[0] - .035, p1[1], Z_TURF)]
            v += [(x, y + (.035 if sy > 0 else -.035), z) for x, y, z in v]
            vis('green', 'metal').add(hexa(v))
            col('metal', 'swing_leg', box(p1[0], p1[1] - sy * .45, 0, .12, .9, 1.1))
    vis('green', 'metal').add(cylinder((cx - 1.7, cy, 2.2), .05, 3.4, 10, 'X'))
    for sx, m in ((-.7, 'door_red'), (.7, 'paint')):
        vis('green', m).add(aabb(cx + sx - .25, cx + sx + .25, cy - .12, cy + .12, .45, .5))
        for dx in (-.22, .22):
            vis('green', 'metal').add(aabb(cx + sx + dx - .01, cx + sx + dx + .01, cy - .01, cy + .01, .5, 2.2))


def bike(cx, cy, yaw):
    """A kid's bike lying on its side in the gravel."""
    ca, sa = math.cos(yaw), math.sin(yaw)

    def P(a, b):
        return (cx + a * ca - b * sa, cy + a * sa + b * ca)
    z = Z_LAWN + .03
    for a in (0, 1.0):
        p = P(a, 0)
        vis('props', 'rubber').add(torus((p[0], p[1], z), .27, .03, 20, 6))
        vis('props', 'metal').add(cylinder((p[0], p[1], z - .01), .04, .05, 8))
    for a, b in [((0, 0), (.42, -.02)), ((.42, -.02), (.36, .5)), ((.36, .5), (0, 0)),
                 ((.36, .5), (.88, .48)), ((.42, -.02), (.88, .48)), ((.88, .48), (1.0, 0))]:
        vis('props', 'door_red').add(beam(P(*a), P(*b), .045, z + .02, .045))
    s = P(.34, .58)
    vis('props', 'rubber').add(box(s[0], s[1], z + .02, .22, .1, .07, yaw))
    h = P(.9, .62)
    vis('props', 'metal').add(box(h[0], h[1], z + .02, .05, .05, .42))
    c = P(.5, .25)
    col('metal', 'bike', box(c[0], c[1], 0, 1.65, .95, .45, yaw), {'note': 'tall enough to read as a wall'})


def hoop(px, py):
    vis('props', 'metal').add(cylinder((px, py, Z_LAWN), .06, 3.1, 10))
    vis('props', 'metal').add(aabb(px, px + .8, py - .04, py + .04, 2.9, 2.98))
    vis('props', 'trim').add(aabb(px + .8, px + .85, py - .6, py + .6, 2.7, 3.5))
    vis('props', 'door_red').add(aabb(px + .85, px + .86, py - .2, py + .2, 3.0, 3.3))
    vis('props', 'door_red').add(torus((px + 1.1, py, 3.02), .23, .015, 16, 4))
    vis('props', 'concrete').add(cylinder((px, py, Z_LAWN - .02), .3, .1, 12))
    col('metal', 'hoop_pole', box(px, py, 0, .2, .2, 3.1))


def flag(px, py, scale=1.0, height=8.8, base=True, label='flagpole', us=True):
    if base:
        vis('park', 'concrete').add(cylinder((px, py, 0), 1.4, .38, 20, smooth=False))
        col('concrete', f'{label}_plinth', cylinder((px, py, -.1), 1.4, .48, 12, smooth=False))
    z0 = .38 if base else Z_LAWN
    vis('park', 'metal').add(cylinder((px, py, z0), .07 * scale, height, 12))
    vis('park', 'plywood').add(ico((px, py, z0 + height + .1 * scale), .13 * scale, 2), smooth=True)
    col('metal', label, box(px, py, 0, .2, .2, z0 + height))
    top, fh, fl, nseg = z0 + height - .05, .95 * scale, 1.55 * scale, 10

    def wave(x):
        return .09 * scale * math.sin(x / scale * 3.6) * (x / fl)

    def strip(mat, x0, x1, za, zb):
        n = max(2, round(nseg * (x1 - x0) / fl))
        xs = [x0 + (x1 - x0) * i / n for i in range(n + 1)]
        for side in (-1, 1):
            v = []
            for x in xs:
                v += [(px + .07 + x, py + wave(x) + side * .002, za), (px + .07 + x, py + wave(x) + side * .002, zb)]
            f = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) if side > 0 else (2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2)
                 for i in range(n)]
            vis('park', mat).add((v, f), kind='flag')
    if not us:      # a plain red flag ("Red Flag" nod), no emblem
        strip('door_red', 0, fl, top - fh, top)
        return
    sh = fh / 13
    for k in range(13):
        z1 = top - k * sh
        strip('door_red' if k % 2 == 0 else 'trim', .62 * scale if k < 7 else 0, fl, z1 - sh, z1)
    strip('pad_blue', 0, .62 * scale, top - 7 * sh, top)
    for i in range(5):
        for j in range(4):
            x = .07 + i * .12
            z = top - .07 - j * .12
            for side in (-1, 1):
                y = py + wave(x) + side * .0045
                q = ((px + .07 + x - .025, y, z - .025), (px + .07 + x + .025, y, z - .025),
                     (px + .07 + x + .025, y, z + .025), (px + .07 + x - .025, y, z + .025))
                vis('park', 'trim').add((q, [(0, 1, 2, 3) if side > 0 else (0, 3, 2, 1)]), kind='flag')
    for i in range(18):
        a = 2 * math.pi * i / 18
        vis('park', ('door_red', 'trim', 'pad_blue')[i % 3]).add(
            ico((px + 1.65 * math.cos(a), py + 1.65 * math.sin(a), Z_LAWN + .08), .13, 1), smooth=True)


def bench(cx, cy, yaw):
    g = vis('park', 'trunk')
    g.add(box(cx, cy, .42, 1.6, .42, .06, yaw))
    ca, sa = math.cos(yaw), math.sin(yaw)
    g.add(box(cx + .2 * sa, cy - .2 * ca, .5, 1.6, .05, .45, yaw))
    for sx in (-.7, .7):
        g.add(box(cx + sx * ca, cy + sx * sa, Z_LAWN, .08, .4, .32, yaw))
    col('wood', 'bench', box(cx, cy, 0, 1.6, .45, .95, yaw))


def plywood_ramp(cx, y_lo, y_hi, y_back, h=.4, top=1.8, flank=.8):
    """Tabletop kicker on the N3 driveway: 14-degree launch face, sloped flanks and back, so it
    has no vertical face for a car to wedge against from any side."""
    z, a, b = Z_DRIVE, top / 2, top / 2 + flank
    A, B = (cx - b, y_lo, z), (cx + b, y_lo, z)
    Cc, D, E, F = (cx - b, y_hi, z), (cx - a, y_hi, z + h), (cx + a, y_hi, z + h), (cx + b, y_hi, z)
    G, Hh = (cx - b, y_back, z), (cx + b, y_back, z)
    v = [A, B, Cc, D, E, F, G, Hh]
    faces = [(0, 3, 4, 1), (0, 2, 3), (1, 4, 5), (3, 6, 7, 4), (2, 6, 3), (5, 4, 7), (0, 1, 5, 2), (2, 5, 7, 6)]
    vis('ramp', 'plywood').add((v, faces))
    for k in range(5):
        t = (k + .5) / 5
        y = y_lo + (y_hi - y_lo) * t
        hw = b - (b - a) * t
        vis('decal', 'paint').add(aabb(cx - hw * .55, cx + hw * .55, y - .05, y + .05, z + h * t + .004, z + h * t + .012))
    col('wood', 'plywood_ramp', (v, faces), {'note': '40 cm tabletop kicker on the shortcut; no vertical faces'})


WALL_H, WALL_W = .7, .8              # garden wall: 70 cm above the yard, 80 cm wide cap
WALL_PTS = [(20, 25.0), (20, 21.5), (20, 13.5), (20, 11), (22.6, 11), (26.0, 11), (26.8, 11), (27.9, 11), (33.4, 11), (36.6, 11.0)]


def garden_wall_run():
    """GARDEN WALL RUN (ALT_wall): up a plywood ramp in the N2/N3 side yard, along the cap of a
    70 cm CMU garden wall, a 90-degree corner (brake hard), a kicker over a 0.8 m gap in the wall
    (keep your speed up), then down a ramp into the backyard green and out through S3's garage.
    It replaces the green's north block wall east of x = 19.6. Falling off drops 0.7 m onto yard
    gravel or turf: both lead back to the street (or on into the green shortcut), never a trap."""
    P = WALL_PTS
    z = Z_LAWN
    part = C.flanked_ramp(P[0], P[1], WALL_W, WALL_H, .5, z0=z)
    vis('wallrun', 'plywood').add(part)
    col('wood', 'wall_ramp_up', part, {'note': 'skill shortcut ramp'})
    C.walkway('garden_wall_a', [P[1], P[2], P[3], P[4], P[6]], WALL_W, z + WALL_H, 'concrete', 'cmu', group='wallrun')
    kick = C.wedge(P[5], P[6], WALL_W, z + WALL_H, .12)
    vis('wallrun', 'plywood').add(kick)
    col('wood', 'wall_kicker', kick, {'note': '12 cm kicker before the gap'})
    C.walkway('garden_wall_b', [(P[6][0] + .8, P[6][1]), P[8]], WALL_W, z + WALL_H, 'concrete', 'cmu', group='wallrun')
    part = C.flanked_ramp(P[9], P[8], WALL_W, WALL_H, .5, z0=z)
    vis('wallrun', 'plywood').add(part)
    col('wood', 'wall_ramp_down', part, {'note': 'skill shortcut ramp'})
    for (ax, ay), (bx, by) in ((P[1], P[3]), (P[3], P[5]), ((P[6][0] + .8, P[6][1]), P[8])):   # cap stripes
        n = int(math.dist((ax, ay), (bx, by)) / .7)
        for k in range(n):
            u = (k + .5) / n
            cx, cy = ax + (bx - ax) * u, ay + (by - ay) * u
            vis('decal', 'paint' if k % 2 else 'trim').add(box(cx, cy, z + WALL_H, .55, .1, .004, math.atan2(by - ay, bx - ax) + math.pi / 2))
    sign('wall_run', 17.6, 26.2, 90, 1.2, .5, .6, [('GARDEN WALL RUN', .1, 'door_red', .08), ('NO SKATEBOARDS. TOYS OK.', .06, 'rubber', -.1)],
         posts=2, post='trunk')


# ---------------------------------------------------------------- USAF / Nellis / Vegas dressing

def water_tower(cx, cy):
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        x, y = cx + 3.4 * math.cos(a), cy + 3.4 * math.sin(a)
        vis('tower', 'metal').add(beam((x, y), (cx + 2.4 * math.cos(a), cy + 2.4 * math.sin(a)), .3, 0, .3))
        vis('tower', 'metal').add(cylinder((x, y, 0), .22, 18.5, 8))
        col('metal', 'water_tower_leg', box(x, y, 0, .5, .5, 18.5))
    for z in (6, 12):
        vis('tower', 'metal').add(torus((cx, cy, z), 3.4, .07, 16, 4))
    vis('tower', 'metal').add(cylinder((cx, cy, 0), .5, 18.5, 10))
    vis('tower', 'trim').add(cylinder((cx, cy, 18.5), 5.2, 6.5, 32))
    vis('tower', 'trim').add(frustum((cx, cy, 18.5), 3.0, 5.2, .01, 32))
    vis('tower', 'pad_blue').add(frustum((cx, cy, 25.0), 5.3, .6, 2.2, 32))
    vis('tower', 'pad_blue').add(torus((cx, cy, 18.6), 5.22, .1, 32, 4))
    toward = math.degrees(math.atan2(-cy, -cx))
    for th in (toward, toward + 180):
        for body, size, dz in (('LITTLE NELLIE AFB', 1.05, 22.4), ('AIM HIGH · DRIVE LOW', .62, 20.5)):
            v, f, _ = text2d(body, size, bold=.03)
            vis('decal', 'pad_blue').add(place_on_cylinder(v, f, (cx, cy), 5.23, dz, th), kind='flag')


def gate_guard_jet(cx, cy, heading=200):
    """Fictional cartoon aggressor jet on a pedestal: splinter desert camo, shark-mouth nose."""
    vis('jet', 'concrete').add(box(cx, cy, 0, 3.2, 3.2, .35))
    vis('jet', 'cmu').add(box(cx, cy, .35, 1.0, 1.0, 2.5))
    col('concrete', 'gate_guard_pedestal', box(cx, cy, -.3, 3.2, 3.2, .65))
    col('concrete', 'gate_guard_column', box(cx, cy, 0, 1.0, 1.0, 2.85))
    pitch, yaw = math.radians(14), math.radians(heading)
    oz = 3.35

    def X(part):
        def f(p):
            x, y, z = p
            x, z = x * math.cos(pitch) - z * math.sin(pitch), x * math.sin(pitch) + z * math.cos(pitch)
            return (cx + x * math.cos(yaw) - y * math.sin(yaw), cy + x * math.sin(yaw) + y * math.cos(yaw), oz + z)
        return transform(part, f)
    camo = ['haze', 'rock', 'cmu', 'haze', 'rock']
    for i, m in enumerate(camo):
        vis('jet', m).add(X(cylinder((-4 + i * 1.5, 0, 0), .55, 1.5, 14, 'X')))
    vis('jet', 'rubber').add(X(frustum((3.5, 0, 0), .55, .08, 2.1, 14, 'X')))
    vis('jet', 'rubber').add(X(frustum((-4.0, 0, 0), .55, .42, -.5, 14, 'X')))
    for side in (-1, 1):   # shark teeth
        for k in range(5):
            x0 = 3.65 + k * .22
            r = .55 - (x0 - 3.5) * .22
            tri = [(x0, side * (r + .01), .02), (x0 + .22, side * (r - .04 + .01), .02), (x0 + .11, side * (r - .02 + .01), -.16)]
            vis('decal', 'trim').add(X((tri, [(0, 1, 2), (0, 2, 1)])), kind='flag')
    vis('jet', 'glass').add(X(ico((2.2, 0, .45), .5, 2, (1.6, .75, .6))), smooth=True)
    for side in (-1, 1):
        inner = [(1.5, side * .5), (-1.2, side * 1.9), (-3.4, side * 1.9), (-3.4, side * .5)]
        outer = [(-1.2, side * 1.9), (-3.0, side * 3.6), (-3.6, side * 3.6), (-3.4, side * 1.9)]
        vis('jet', 'haze').add(X(transform(polygon_slab(inner, -.06, .06), lambda p: p)))
        vis('jet', 'rock').add(X(transform(polygon_slab(outer, -.05, .05), lambda p: p)))
        stab = [(-3.6, side * .5), (-4.4, side * 1.6), (-4.7, side * 1.6), (-4.6, side * .5)]
        vis('jet', 'cmu').add(X(polygon_slab(stab, -.04, .04)))
    fin = polygon_slab([(-2.4, .4), (-4.2, 2.5), (-4.75, 2.5), (-4.6, .4)], -.05, .05)
    vis('jet', 'haze').add(X(transform(fin, lambda p: (p[0], p[2], p[1]))))
    sign('gate_guard_plaque', cx + 2.2 * math.cos(math.radians(90)), cy + 2.0, 90, 1.5, .55, .5,
         [('GATE GUARD', .16, 'rubber', .1), ('BAD GUYS SQUADRON', .1, 'rubber', -.12)], board='plywood', posts=2)


def janet_bus(cx, cy):
    """A plain white shuttle with a red stripe, parked. No markings at all: that is the joke."""
    vis('bus', 'trim').add(aabb(cx - 4.5, cx + 4.5, cy - 1.25, cy + 1.25, .55, 3.1))
    vis('bus', 'door_red').add(aabb(cx - 4.52, cx + 4.52, cy - 1.27, cy + 1.27, 1.05, 1.25))
    vis('bus', 'glass').add(aabb(cx - 4.0, cx + 3.9, cy - 1.27, cy + 1.27, 1.7, 2.55))
    vis('bus', 'glass').add(aabb(cx + 4.4, cx + 4.53, cy - 1.0, cy + 1.0, 1.5, 2.7))
    for x in (-3.0, 3.0):
        for y in (-1.1, 1.1):
            vis('bus', 'rubber').add(cylinder((cx + x, cy + y - .15, .5), .5, .3, 14, 'Y'))
    col('metal', 'janet_bus', aabb(cx - 4.5, cx + 4.5, cy - 1.25, cy + 1.25, 0, 3.1))


def defenders_booth(cx, cy):
    vis('booth', 'trim').add(box(cx, cy, 0, 2.2, 2.2, 2.5))
    vis('booth', 'glass').add(box(cx, cy, 1.15, 2.26, 2.26, .8))
    vis('booth', 'pad_blue').add(box(cx, cy, 2.5, 2.9, 2.9, .18))
    vis('booth', 'pad_blue').add(box(cx, cy + 1.46, 2.1, 2.9, .04, .42))
    words('trim', 'DEFENDERS', .26, (cx, cy + 1.46, 2.31), 90, max_w=2.6, out=.025)
    col('concrete', 'defenders_booth', box(cx, cy, 0, 2.2, 2.2, 2.68))
    sign('halt_sign', cx - 2.2, cy + 1.3, 90, .9, .6, .9, [('HALT!', .2, 'trim', .08), ('(PLEASE)', .12, 'trim', -.15)],
         board='door_red')
    # Red-and-white barrier arm, raised (decorative), on a post.
    vis('booth', 'metal').add(box(cx + 1.6, cy + 1.3, 0, .2, .2, 1.0))
    for k in range(6):
        vis('booth', 'door_red' if k % 2 == 0 else 'trim').add(beam((cx + 1.6 + .02, cy + 1.3 + k * .5),
                                                                    (cx + 1.6 + .02, cy + 1.3 + (k + 1) * .5), .1, 1.0, .1))


def pt_belt_arch():
    """The start/finish arch: a giant reflective PT belt slung between two poles."""
    p, t, n = LOOP.at(0)
    ends = [(p[0] + n[0] * o, p[1] + n[1] * o) for o in (-4.45, 4.45)]
    for i, e in enumerate(ends):
        vis('arch', 'metal').add(cylinder((e[0], e[1], 0), .1, 3.6, 10))
        col('metal', f'start_arch_post_{i}', box(e[0], e[1], 0, .3, .3, 3.6))
    vis('arch', 'metal').add(beam(ends[0], ends[1], .08, 3.5, .08))
    seg = 16
    for side in (-1, 1):
        v = []
        for i in range(seg + 1):
            u = i / seg
            sag = .28 * (1 - (2 * u - 1) ** 2)
            x = ends[0][0] + (ends[1][0] - ends[0][0]) * u + t[0] * side * .01
            y = ends[0][1] + (ends[1][1] - ends[0][1]) * u + t[1] * side * .01
            v += [(x, y, 3.0 - sag), (x, y, 3.52 - sag)]
        f = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(seg)]
        vis('arch', 'hi_vis').add((v, facing_quads(v, f, lambda a: (-t[0] * side, -t[1] * side, 0))), kind='flag')
        facing = math.degrees(math.atan2(-t[1] * side, -t[0] * side))
        words('rubber', 'START · FINISH', .2, (p[0], p[1], 2.99), facing, max_w=4.5, out=.03)


def liberty_loop_curb_art():
    """MK64-style alternating kerb blocks and painted arrows make the route readable at speed.

    These are thin visual overlays on the existing rolled kerbs.  They deliberately do not add
    collision; the continuous concrete kerb and asphalt slab remain the single physical edge.
    """
    count = int(LOOP.length // 4)
    for k in range(count):
        d = 1.5 + k * 4
        p, t, n = LOOP.at(d)
        yaw = math.atan2(t[1], t[0])
        material = 'door_red' if k % 2 == 0 else 'trim'
        for side in (-1, 1):
            x, y = p[0] + n[0] * side * 3.72, p[1] + n[1] * side * 3.72
            vis('curb_art', material).add(box(x, y, .112, 3.25, .28, .025, yaw), kind='up')
    # Flat, high-contrast arrows on the four neighbourhood approaches echo the MK64 HUD line.
    for d, side in ((19, 1), (118, -1), (219, 1), (319, -1)):
        p, t, n = LOOP.at(d)
        x, y = p[0] + n[0] * side * 1.1, p[1] + n[1] * side * 1.1
        vis('curb_art', 'paint').add(box(x, y, .014, 1.5, .42, .006, math.atan2(t[1], t[0])), kind='up')


def liberty_loop_landmark():
    """A tiny fictional housing gateway gives the loop a memorable visual anchor."""
    x, y = -70, -42.5
    for dx in (-2.8, 2.8):
        vis('loop_landmark', 'trim').add(cylinder((x + dx, y, 0), .16, 3.2, 10))
        col('metal', f'loop_landmark_post_{dx}', box(x + dx, y, 0, .32, .32, 3.2))
    vis('loop_landmark', 'door_red').add(box(x, y, 3.0, 6.1, .18, .72))
    words('trim', 'BASE HOUSING', .3, (x, y - .11, 3.03), 270, max_w=5.6, out=.1)


def street_blades(d, a_name, b_name, label):
    p, t, n = LOOP.at(d)
    x, y = p[0] + n[0] * 4.45, p[1] + n[1] * 4.45
    vis('signs', 'metal').add(box(x, y, 0, .08, .08, 3.0))
    col('metal', f'{label}_post', box(x, y, 0, .3, .3, 3.0))
    for name, z, ang in ((a_name, 2.55, 0), (b_name, 2.82, 90)):
        vis('signs', 'sign_green').add(box(x, y, z, 1.7, .03, .22, math.radians(ang)))
        for facing in (ang - 90, ang + 90):
            words('trim', name, .12, (x, y, z + .11), facing, max_w=1.55, out=.02)


def pcs_move(cx, cy):
    """PCS season on house O1's driveway: a moving pod and a stack of labelled boxes."""
    vis('pcs', 'trim').add(aabb(cx - 1.2, cx + 1.2, cy, cy + 3.6, Z_DRIVE, 2.7))
    vis('pcs', 'pad_blue').add(aabb(cx - 1.22, cx + 1.22, cy - .02, cy + 3.62, 2.3, 2.72))
    words('pad_blue', 'PCS', .7, (cx, cy, 1.55), 270, max_w=2.1, out=.012)
    words('rubber', 'HANDLE WITH CARE', .15, (cx, cy, .95), 270, max_w=2.1, out=.012)
    col('metal', 'pcs_pod', aabb(cx - 1.2, cx + 1.2, cy, cy + 3.6, 0, 2.7))
    labels = ['PCS', 'FRAGILE', 'KITCHEN', 'TOYS!!', 'MISC', 'KITCHEN 2']
    k = 0
    cx, cy = cx + 4.6, cy - .9          # stacked on the lawn beside the driveway, pod lettering clear
    for row, xs in enumerate(([-.65, 0, .65], [-.33, .33], [0])):
        for dx in xs:
            z = Z_LAWN + row * .6
            vis('pcs', 'plywood').add(aabb(cx + dx - .29, cx + dx + .29, cy - 1.1, cy - .5, z, z + .58))
            vis('decal', 'paint').add(aabb(cx + dx - .29, cx + dx + .29, cy - .82, cy - .78, z + .58, z + .585))
            words('rubber', labels[k], .07, (cx + dx, cy - 1.1, z + .32), 270, max_w=.52, out=.005)
            k += 1
    col('wood', 'pcs_boxes', aabb(cx - .95, cx + .95, cy - 1.1, cy - .5, 0, Z_DRIVE + 1.8))


def squadron_rock(cx, cy):
    v = [(cx - 1.1, cy - .8, 0), (cx + 1.2, cy - .9, 0), (cx + 1.0, cy + .7, 0), (cx - 1.2, cy + .7, 0),
         (cx - .9, cy - .5, 1.05), (cx + .95, cy - .6, 1.0), (cx + .8, cy + .7, 1.1), (cx - .95, cy + .7, 1.15)]
    vis('rock', 'door_red').add(hexa(v))
    vis('rock', 'pad_blue').add(ico((cx - .1, cy, 1.15), .7, 1, (1.2, .9, .45)))
    words('paint', 'BAD GUYS SQ', .2, (cx, cy + .7, .75), 90, max_w=1.8, out=.012)
    words('trim', 'GO FAST, TOYS!', .12, (cx, cy + .7, .45), 90, max_w=1.8, out=.012)
    col('concrete', 'squadron_rock', aabb(cx - 1.2, cx + 1.2, cy - .9, cy + .7, -.1, 1.3))


def welcome_sign(cx, cy, facing):
    """A stylised, re-drawn Vegas-style welcome board (rounded, bulbed), fictional wording."""
    yaw = math.radians(facing + 90)
    a = math.radians(facing)
    n = (math.cos(a), math.sin(a))
    r = (-n[1], n[0])
    for k in (-1.25, 1.25):
        vis('signs', 'metal').add(box(cx + r[0] * k - n[0] * .1, cy + r[1] * k - n[1] * .1, 0, .16, .16, 2.4, yaw))
        col('metal', 'welcome_sign_post', box(cx + r[0] * k - n[0] * .1, cy + r[1] * k - n[1] * .1, 0, .35, .35, 2.4, yaw))
    vis('signs', 'trim').add(box(cx, cy, 1.9, 3.6, .12, 2.1, yaw))
    vis('signs', 'door_red').add(box(cx - n[0] * .02, cy - n[1] * .02, 1.82, 3.76, .1, 2.26, yaw))
    for i in range(14):
        k = -1.65 + 3.3 * i / 13
        for z in (1.98, 3.9):
            vis('signs', 'paint').add(ico((cx + r[0] * k + n[0] * .07, cy + r[1] * k + n[1] * .07, z), .055, 1), smooth=True)
    vis('signs', 'door_red').add(ico((cx + n[0] * .05, cy + n[1] * .05, 4.35), .3, 1, (1, .3, 1)))
    for text, size, mat, z in (('WELCOME TO', .2, 'pad_blue', 3.62), ('FABULOUS', .42, 'door_red', 3.12),
                               ('AREA 51½', .34, 'pad_blue', 2.6), ('DRIVE SLOW · COME BACK SOON', .1, 'rubber', 2.18)):
        words(mat, text, size, (cx, cy, z), facing, max_w=3.3, out=.07)


def monument(cx, cy):
    vis('monument', 'rock').add(box(cx, cy, 0, 5.4, .9, .45))
    vis('monument', 'stucco_adobe').add(box(cx, cy, .45, 5.0, .6, 1.25))
    vis('monument', 'roof_tile').add(box(cx, cy, 1.7, 5.3, .8, .14))
    for text, size, z in (('LITTLE NELLIE AFB', .36, 1.4), ('HOME OF THE FIGHTER PILOT', .17, 1.03),
                          ('(AND THE FIGHTER TOY)', .14, .78)):
        words('trim', text, size, (cx, cy + .3, z), 90, max_w=4.7, out=.006)
    col('concrete', 'monument', box(cx, cy, -.1, 5.4, .9, 1.94))


def sun_face(cx, cy, z, facing, r=.35):
    a = math.radians(facing)
    n = (math.cos(a), math.sin(a))
    rr = (-n[1], n[0])
    c = (cx + n[0] * .04, cy + n[1] * .04)
    vis('decal', 'paint').add(transform(cylinder((0, 0, 0), r, .02, 16, 'Y', smooth=False),
                                        lambda p: (c[0] + rr[0] * p[0] + n[0] * p[1], c[1] + rr[1] * p[0] + n[1] * p[1], z + p[2])))
    for i in range(10):
        t = 2 * math.pi * i / 10
        p0, p1 = (math.cos(t) * r * 1.15, math.sin(t) * r * 1.15), (math.cos(t) * r * 1.5, math.sin(t) * r * 1.5)
        v = [(c[0] + rr[0] * p0[0] + n[0] * .01, c[1] + rr[1] * p0[0] + n[1] * .01, z + p0[1] - .03),
             (c[0] + rr[0] * p0[0] + n[0] * .01, c[1] + rr[1] * p0[0] + n[1] * .01, z + p0[1] + .03),
             (c[0] + rr[0] * p1[0] + n[0] * .01, c[1] + rr[1] * p1[0] + n[1] * .01, z + p1[1])]
        vis('decal', 'paint').add((v, [(0, 2, 1)]), kind='flag')


def dressing():
    pt_belt_arch()
    liberty_loop_curb_art()
    liberty_loop_landmark()
    for d, a, b, lab in ((64.85, 'RED FLAG DR', 'WEAPONS SCHOOL WAY', 'blade_sw'),
                         (138.55, 'AGGRESSOR AVE', 'WEAPONS SCHOOL WAY', 'blade_nw'),
                         (268.25, 'AGGRESSOR AVE', 'THUNDER WAY', 'blade_ne'),
                         (341.95, 'RED FLAG DR', 'THUNDER WAY', 'blade_se')):
        street_blades(d, a, b, lab)
    speed = [('SPEED', .13, 'rubber', .33), ('LIMIT', .13, 'rubber', .17), ('15', .34, 'rubber', -.08),
             ('STRICTLY ENFORCED', .065, 'door_red', -.33)]
    sign('speed_s', -24, -46.4, 0, .7, .9, 1.55, speed, border='rubber')
    sign('speed_n', 30, 46.4, 180, .7, .9, 1.55, speed, border='rubber')
    sign('quiet_hours', -74.45, -2, 270, 1.1, .6, 1.6, [('QUIET HOURS', .13, 'trim', .13), ('2200 - 0600', .15, 'trim', -.12)],
         board='pad_blue', border='trim')
    for k, (txt, mat) in enumerate((('BX  ↑', 'sign_green'), ('COMMISSARY  ↑', 'sign_green'),
                                    ('FLIGHTLINE  →', 'sign_green'), ('AREA 51½: NO', 'door_red'))):
        sign(f'bx_post_{k}', -74.45, 15, 270, 1.5, .26, 2.75 - k * .31, [(txt, .14, 'trim', 0)], board=mat, collide=k == 0)
    sign('alien_xing', 74.45, 12, 90, .85, .85, 1.6, [('ALIEN', .15, 'rubber', .12), ('XING', .17, 'rubber', -.12)],
         board='paint', border='rubber')
    sign('dry_heat', 46, 51.5, 270, 1.4, .8, 1.0, [("IT'S A DRY HEAT!", .13, 'door_red', -.22)], board='trim',
         border='door_red', posts=2)
    sun_face(46, 51.5 - .03, 1.55, 270, .2)
    sign('speed_is_life', 31, 49.4, 270, 1.1, .55, .55, [('SPEED IS LIFE', .12, 'pad_blue', .1),
                                                         ('(BUT 15 MPH HERE)', .08, 'rubber', -.12)], posts=2, post='trunk')
    sign('yard_of_month', -5.5, 30.2, 90, 1.1, .6, .55, [('YARD OF', .16, 'door_red', .12), ('THE MONTH', .16, 'door_red', -.12)],
         posts=2, post='trunk')
    flag(-8.8, 30.8, .45, 2.3, base=False, label='red_flag', us=False)
    sign('pcs_sale', -15, 46.45, 270, .85, .5, .5, [('PCS SALE', .14, 'door_red', .08), ('SAT 0800', .1, 'rubber', -.13)],
         posts=2, post='trunk')
    sign('retreat', 0, -60.2, 90, 1.0, .4, .45, [('RETREAT 1700', .12, 'trim', 0)], board='pad_blue', posts=2)
    # Fake gate in the east perimeter wall; the wall stays solid behind it.
    gx = 106 - .25
    vis('gate', 'metal').add(aabb(gx - .05, gx + .05, -3, 3, 0, 2.2))
    for k in range(13):
        vis('gate', 'metal').add(aabb(gx - .08, gx - .05, -3 + k * .5 - .02, -3 + k * .5 + .02, 0, 2.2))
    sign('do_not_enter', gx - .2, 0, 180, 1.8, .9, .9, [('AREA 51½', .18, 'trim', .25), ('DO NOT ENTER', .16, 'trim', 0),
                                                        ('(PLEASE)', .12, 'trim', -.25)], board='door_red', collide=False)
    water_tower(86, 44)
    gate_guard_jet(32, -66, heading=115)
    janet_bus(-36, -58.5)
    defenders_booth(46, -55)
    squadron_rock(-14, -64.5)
    welcome_sign(-83, -30, 0)
    monument(18, -53.5)
    # Yellow ribbon round a front-yard mesquite: "welcome home".
    vis('props', 'paint').add(torus((-15, -29, 1.3), .2, .035, 16, 6))
    for side in (-1, 1):
        vis('props', 'paint').add(torus((-15 + side * .12, -29.22, 1.38), .1, .025, 10, 4, 'Y'))


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
    for d, lat in ((22, 1.6), (62, -1.6), (102, 0), (142, 1.6), (212, -1.6), (300, 0), (342, 1.6)):
        p, _, n = LOOP.at(d)
        picks.append((p[0] + n[0] * lat, p[1] + n[1] * lat, .3))
    picks += [(38.75, 19.8, Z_DRIVE + .3), (38.75, -3.0, Z_TURF + .3)]
    for k, at in enumerate(picks, start=1):
        marker(f'PICKUP_{k:02d}', at, extras={'route': 'shortcut' if k > 7 else 'main'}, display='SPHERE')
    marker('SPEC_01', (30, 0, Z_TURF + .22), extras={'hint': 'under the backyard trampoline, off the shortcut'},
           display='CUBE')
    # Challenge coins: off the line, each one a small detour (driven by tools/rc/coins-reachable.test.mjs).
    shortcut_out = [(38.75, -14), (38.75, -26), (38.75, -38)]
    C.coin(1, (38.75, 32.4, Z_DRIVE + .4 + .25), [(38.75, 41), (38.75, 36)], [(38.75, 26), (38.75, 14), (38.75, 0)] + shortcut_out,
           'shortcut: on the crest of the plywood kicker')
    C.coin(2, (-34, 5, Z_TURF + .25), [(38.75, 41), (38.75, 34), (38.75, 24), (38.75, 12), (36, 4), (30, -6.5), (0, -8), (-20, -8),
                                       (-28, -8), (-34, -3)],
           [(-34, 8.6), (-26, 8.6), (-10, 8.6), (4, 6.5), (10, -7), (30, -6.5), (38.75, -4)] + shortcut_out,
           'backyard green: under the swing set, far end')
    C.coin(3, (84.2, 44, Z_LAWN + .25), [(70, 30), (76, 40), (80, 44)], [(88, 44), (84, 38), (76, 34), (70, 28)],
           'under the water tower, between its legs')
    C.coin(4, (-36, -61.6, Z_LAWN + .25), [(-46, -42), (-45, -50), (-43, -61.6)], [(-28, -61.6), (-26, -52), (-22, -42)],
           'behind the Janet bus')
    C.coin(5, (46, -57.8, Z_LAWN + .25), [(38, -42), (40, -50), (42, -57.8)], [(50, -57.8), (52, -50), (54, -42)],
           'behind the Defenders booth')
    # Skill shortcut: the garden wall run, from the north street to the south street.
    ai_xy = [LOOP.at(k * step)[0] for k in range(count)]
    wall = [(20, 42), (20, 31)] + WALL_PTS[:6] + [(26.74, 11)] + WALL_PTS[7:] + [(38.75, 7), (38.75, -2), (38.75, -14), (38.75, -26), (38.75, -36.5), (36, -41), (31.9, -42)]
    speeds = [7, 7, 5, 4.8, 3.5, 2.0, 3.2, 5.2, 5.2, 4.8, 4.5, 4.5, 6, 7.5, 7.5, 7.5, 5.5, 5.5, 7]
    C.alt_route('wall', wall, ai_xy, speeds, half=WALL_W / 2, gaps={8})
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
    horizon()
    houses = [
        house('N1', -41.75, 24, 1, 1, 'stucco_sand', 38.5),
        house('N2', 4.25, 24, 1, -1, 'stucco_sage', 38.5, turf=True, palm_tree=False, belt_mailbox=True),
        house('N3', 38.75, 24, 1, -1, 'stucco_peach', 38.5, tunnel=True),
        house('S1', -27.25, -24, -1, -1, 'stucco_adobe', -38.5, palm_tree=False),
        house('S2', -2.75, -24, -1, 1, 'stucco_sand', -38.5, turf=True, banner='WELCOME HOME!'),
        house('S3', 38.75, -24, -1, -1, 'stucco_sage', -38.5, tunnel=True, palm_tree=False),
        house('O1', -20, 56.5, -1, -1, 'stucco_peach', 45.5),
        house('O2', 22, 56.5, -1, 1, 'stucco_adobe', 45.5, turf=True, palm_tree=False),
    ]
    # Turf backyard green behind CMU block walls, open only at the shortcut gaps.
    turf_patch(-49.8, 49.8, -10.8, 10.8, 'green')
    for y in (11, -11):
        tag = 'n' if y > 0 else 's'
        block_wall((-50, y), (19.2 if y > 0 else 36.0, y), f'wall_green_{tag}_w')
        block_wall((41.5, y), (50, y), f'wall_green_{tag}_e')
    block_wall((-50, -11), (-50, 11), 'wall_green_w')
    block_wall((50, -11), (50, 11), 'wall_green_e')
    trampoline(30, 0)
    bbq(-15, 5)
    picnic_table(-24, -3)
    doghouse(16, 7.5)
    kiddie_pool(-2, -4)
    swing_set(-34, 5)
    plywood_ramp(38.75, 34.0, 32.4, 31.0)
    garden_wall_run()
    bike(-12, 52, .5)
    hoop(18.5, 51.5)
    flag(0, -62)
    bench(-4.5, -58.5, 0)
    bench(4.5, -58.5, 0)
    pcs_move(-20, 52.2)
    dressing()
    mesquites = [(-22, -68, 1.2), (22, -66, 1.1), (-50, -72, 1.3), (50, -72, 1.25), (-4, -72, 1.0), (10, -74, 1.15),
                 (-48, 66, 1.2), (2, 68, 1.1), (60, 64, 1.2), (-8, 74, 1.0), (-62, 58, 1.1), (-92, 0, 1.3),
                 (-95, 24, 1.1), (-92, -42, 1.2), (-82, 48, 1.1), (92, 6, 1.3), (95, -22, 1.1), (84, -46, 1.1),
                 (-57, -4, 1.0), (-55, 9, 1.1), (57, -6, 1.0), (56, 9, .95), (-40, -2, 1.1), (6, 5, 1.0),
                 (12, -6, .9), (-18, 29, 1.0), (16, 29.5, 1.05), (-15, -29, 1.0), (17, -30, 1.1)]
    for i, (x, y, s) in enumerate(mesquites):
        mesquite(x, y, s, f'mesquite_{i:02d}')
    palms = [(-40, 46.45), (-5, 46.45), (8, 46.45), (40, 46.45), (-36, -46.45), (-12, -46.45), (12, -46.45),
             (36, -46.45), (74.45, -10), (74.45, 3), (-74.45, -10), (-74.45, 7)]
    for i, (x, y) in enumerate(palms):
        palm(x, y, 7.5 + (i % 3) * .8, f'street_palm_{i:02d}')
    for i, (x, y) in enumerate(((-88, 30), (-60, -66), (66, -60), (88, -10), (-30, 70), (28, 72))):
        agave(x, y, 1.2)
        barrel_cactus(x + 1.6, y + .8)
        boulder(x - 1.4, y - .6, .6, f'yard_boulder_{i}')
    gates, ai_step, ai_count = race_markers()
    C.ROOT['district'] = 'housing'
    C.ROOT['base'] = 'Little Nellie AFB (fictional)'
    C.ROOT['lap_length_m'] = round(LOOP.length, 2)
    C.ROOT['race_direction'] = 'clockwise from above'
    C.ROOT['streets'] = 'S: Red Flag Dr, W: Weapons School Way, N: Aggressor Ave, E: Thunder Way'
    C.ROOT['shortcut'] = 'N3 driveway kicker -> N3 garage -> backyard green -> S3 garage -> south street'
    return {'houses': houses, 'ai_count': ai_count, 'ai_spacing_m': round(ai_step, 2), 'gates': len(gates)}


def shots():
    return [
        ('overview', (88, -150, 96), (0, -6, 0), 30),
        ('street-toy-eye', (8, -42.6, .16), (-40, -41.2, .6), 22),
        ('garage-ramp', (38.75, 42.4, .5), (38.75, 26, .9), 26),
        ('backyard-shortcut', (38.0, -6.5, .7), (38.75, 20, 1.1), 24),
        ('entrance-dressing', (16, -47.2, 1.1), (22, -56, 1.3), 28),
        ('kerb-closeup', (-30, -39.3, .09), (-37, -38.45, .05), 34),
        ('garden-wall-run', (15.5, 29.5, 2.2), (29, 11, .3), 24),
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
            'script': 'housing.py', 'district': 'housing', 'version': 2,
            'editable_source': 'assets/rc/districts/housing.blend',
            'lap_length_m': round(LOOP.length, 2), 'gates': info['gates'], 'ai_nodes': info['ai_count'],
            'ai_spacing_m': info['ai_spacing_m'], 'houses': len(info['houses']), **stats,
            'lettering': "mesh text from Blender's bundled UI font (no textures)",
            'cultural_references': 'fictional, kid-safe; docs/research/area51-usaf-nellis-vegas-references.md '
                                   'section A; section B avoided (no Thunderbirds marks, real insignia, '
                                   'casino names or gambling imagery)',
            'vertex_ao': bake or 'not baked (--no-bake)',
            'vertex_ao_method': 'Cycles AO bake to per-corner BYTE_COLOR attribute "AO", exported as COLOR_0; '
                                'remapped to floor..1. Real bake, no painted shading. Decals and the far '
                                'backdrop are left at 1.0 (not occluders, not baked).',
            'glb_bytes': glb.stat().st_size})
        print('HOUSING_EXPORT', glb, glb.stat().st_size, stats)
    if args.render:
        print('HOUSING_RENDERS', C.render_glb(glb, args.render, shots()))


if __name__ == '__main__':
    main()
