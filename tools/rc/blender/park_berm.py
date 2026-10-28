"""Grassed berm around the skate plaza, in the plaza's raw Blender XY metres.
The plaza is cut into a slope: lawn meets the coping of the bowl, the long east
quarter and the western deck, then falls away from the park. Plain Python, so the
heightfield can be checked without Blender: python3 park_berm.py <out.png>.
"""
import math

A = .274
CA, SA = math.cos(A), math.sin(A)
FLOOR, RISE = .14, 1.4
TOP = FLOOR + RISE
FALL = 9.0       # metres for the lawn to fall from coping height to grade
EDGE = .5       # rise per metre of lawn beside the floor-level plaza
CELL = .6


def xf(u, v):
    return (u * CA - v * SA, u * SA + v * CA)


def rect(u0, u1, v0, v1):
    return [xf(u0, v0), xf(u1, v0), xf(u1, v1), xf(u0, v1)]


OUTLINE = [(-18.803, 1.307), (-1.196, 6.252), (.930, 10.087), (3.749, 12.814), (3.148, 16.742), (12.206, 19.238),
           (15.903, 8.239), (10.912, 6.668), (9.896, 4.680), (10.219, -.218), (13.870, .429), (15.534, -6.919), (-13.951, -15.053)]
# Paved path behind the bowl, raised to coping height as on the reference park.
SHOULDER = [(12.206, 19.238), (15.0, 20.0), (19.0, 7.7), (15.903, 8.239)]
RUN = 2.0
ARC_N = [(13.4 + RUN * math.cos(math.pi * .5 * (1 - i / 24)), 11.8 + RUN * math.sin(math.pi * .5 * (1 - i / 24))) for i in range(25)]
ARC_S = [(13.4 + RUN * math.cos(math.pi * .5 * i / 24), 8.7 - RUN * math.sin(math.pi * .5 * i / 24)) for i in range(25)]
# Coping-height decks: the berm meets their tops.
DECKS = [
    [xf(*p) for p in [(8.2, -3.4), (13.25, -3.4), (12.2, 3.45), (17.3, 3.65), (17.1, 6.7), (8.2, 6.7)]],
    [xf(*p) for p in [(7.55, 13.8)] + ARC_N + [(16.7, 11.8), (16.7, 15.15), (7.55, 15.15)]],
    [xf(*p) for p in ARC_S + [(17.1, 6.7), (16.7, 8.7)]],
    rect(15.4, 16.7, 6.4, 11.8),
    rect(-17.8, -16.0, -6.0, 6.4),
    SHOULDER,
]
# The bowl hollow between its decks rides at floor level.
BOWL = rect(7.8, 15.4, 6.7, 13.8)


def inside(p, poly):
    x, y = p
    c = False
    for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            c = not c
    return c


def edge_distance(p, poly):
    x, y = p
    best = 1e9
    for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
        dx, dy = x1 - x0, y1 - y0
        t = max(0, min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(x - x0 - t * dx, y - y0 - t * dy))
    return best


def on_deck(p):
    return any(inside(p, d) for d in DECKS)


def _floor(p):
    return (inside(p, OUTLINE) or inside(p, BOWL)) and not on_deck(p)


NEAR = ((.25, 0), (-.25, 0), (0, .25), (0, -.25))


def on_floor(p):
    # The traced slab overhangs some deck backs by a few centimetres; a sliver that thin
    # is lawn, not plaza floor.
    if not _floor(p):
        return False
    return not (edge_distance(p, OUTLINE) < .3 and min(edge_distance(p, d) for d in DECKS) < .3)


def smooth(t):
    t = max(0., min(1., t))
    return t * t * (3 - 2 * t)


def _floor_edge():
    # Exposed plaza edge: outline samples with floor on one side (the bowl rim is walled). Where a
    # deck sits on the outline, the lawn behind it meets the deck, not the floor.
    out = []
    for poly in (OUTLINE,):
        for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
            n = max(1, int(math.hypot(x1 - x0, y1 - y0) / .1))
            for k in range(n):
                x, y = x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n
                if any(on_floor((x + dx, y + dy)) for dx, dy in NEAR):
                    out.append((x, y))
    return out


FLOOR_EDGE = _floor_edge()


def height(p):
    """Lawn height above plaza datum 0; negative means tucked under the plaza or grade."""
    if on_deck(p):
        return TOP - .04
    if on_floor(p):
        return -.08
    deck = min(0 if inside(p, d) else edge_distance(p, d) for d in DECKS)
    floor = min(math.hypot(p[0] - x, p[1] - y) for x, y in FLOOR_EDGE)
    # Hold vertices within one and a half cells of the plaza below it, so no lawn triangle
    # rises across the floor's edge; the rolled apron and grade cover the tuck.
    beside = EDGE * max(0., floor - 1.5 * CELL)
    return min(TOP * (1 - smooth(deck / FALL)), beside) - (.08 if floor < 1.5 * CELL else 0)


def grid(x0=-30., x1=30., y0=-28., y1=31.):
    nx, ny = int((x1 - x0) / CELL), int((y1 - y0) / CELL)
    verts = [(x0 + i * CELL, y0 + j * CELL) for j in range(ny + 1) for i in range(nx + 1)]
    h = [height(p) for p in verts]
    faces = []
    for j in range(ny):
        for i in range(nx):
            k = j * (nx + 1) + i
            quad = (k, k + 1, k + nx + 2, k + nx + 1)
            if max(h[q] for q in quad) > .02:
                faces.append(quad)
    used = sorted({q for f in faces for q in f})
    remap = {old: new for new, old in enumerate(used)}
    return [(*verts[q], h[q]) for q in used], [tuple(remap[q] for q in f) for f in faces]


if __name__ == '__main__':
    import sys
    from PIL import Image
    s = 8
    x0, x1, y0, y1 = -30, 30, -28, 31
    img = Image.new('RGB', ((x1 - x0) * s, (y1 - y0) * s))
    px = img.load()
    for j in range(img.height):
        for i in range(img.width):
            p = (x0 + i / s, y1 - j / s)
            if on_deck(p):
                px[i, j] = (200, 200, 190)
            elif on_floor(p):
                px[i, j] = (120, 120, 120)
            else:
                g = max(0, height(p)) / TOP
                px[i, j] = (int(40 + 180 * g), int(90 + 120 * g), 40)
    img.save(sys.argv[1])
    v, f = grid()
    print('berm', len(v), 'verts', len(f), 'quads')
