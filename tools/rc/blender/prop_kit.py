#!/usr/bin/env python3
"""Saucer Springs prop kit: fourteen ORIGINAL toy-style props in one GLB, for venues authored as data.

  HEAVY_SLOT_LABEL=rc-kit heavy-slot -- /Applications/Blender.app/Contents/MacOS/Blender \
    --background --factory-startup --python tools/rc/blender/prop_kit.py

Writes assets/rc/kit/props.blend (editable), web/wwwroot/rc/assets/kit/props.glb and
kit.provenance.json beside it. Placement files (docs/rc-placements.md) address props by node name.

Conventions (docs/rc-reference-and-pipeline.md): metres at REAL scale (the world is real-sized, the
car is a 0.42 m RC buggy), Blender +Z up / +Y forward; glTF export gives +Y up / -Z forward.
Every prop is one top-level empty whose origin is its ground contact (centre of the footprint,
z=0), parenting one mesh per material (<name>__Kit_Paint etc.). Props are laid out on a 10 m grid so the .blend is reviewable; the runtime IGNORES the
top-level node transform and uses the geometry in prop-local space.

Each prop has exactly one child COL_<name>: an axis-aligned box or vertical cylinder in prop-local
space, custom property collider='box'|'cylinder' (exported as glTF extras). The loader strips it
into a collision descriptor and never draws it.

Materials: three flat metallic-roughness materials shared by every prop (Kit_Paint, Kit_Metal,
Kit_Wood). Albedo is per-face vertex colour (COLOR_0) multiplied by a ray-cast ambient occlusion
term (the bake_hero.py approach, plus a ground plane so bases darken where they meet the floor).
Base colour factors are white so the vertex colour is the colour. Kit_Wood also covers the other
rough non-metals (concrete, hay, canvas).
"""
import json, math, sys
from pathlib import Path
import bpy, bmesh
from mathutils import Vector, Matrix, Euler
from mathutils.bvhtree import BVHTree

REPO = Path(__file__).resolve().parents[3]
BLEND = REPO / 'assets/rc/kit/props.blend'
GLB = REPO / 'web/wwwroot/rc/assets/kit/props.glb'
PROVENANCE = GLB.with_name('kit.provenance.json')
GRID = 10.0

MATERIALS = {  # name: (roughness, metallic)
    'Kit_Paint': (0.5, 0.0),
    'Kit_Metal': (0.38, 0.85),
    'Kit_Wood': (0.85, 0.0),
}
MAT_ORDER = list(MATERIALS)
PAINT, METAL, WOOD = range(3)

# Linear-RGB toy palette.
C = dict(
    wood=(0.42, 0.22, 0.09), wood_dark=(0.28, 0.14, 0.06), steel=(0.42, 0.44, 0.46), galv=(0.62, 0.64, 0.66),
    iron=(0.10, 0.11, 0.12), green=(0.05, 0.30, 0.10), green_dark=(0.03, 0.16, 0.06), orange=(0.95, 0.26, 0.02),
    white=(0.86, 0.86, 0.83), red=(0.72, 0.05, 0.04), yellow=(0.92, 0.58, 0.03), blue=(0.06, 0.22, 0.62),
    sky=(0.42, 0.66, 0.86), concrete=(0.56, 0.54, 0.50), straw=(0.80, 0.60, 0.22), straw_end=(0.62, 0.42, 0.14),
    twine=(0.30, 0.18, 0.07), pumpkin=(0.88, 0.22, 0.01), stem=(0.20, 0.30, 0.06), canvas=(0.85, 0.36, 0.08),
    canvas_light=(0.92, 0.80, 0.55), lens=(0.98, 0.92, 0.70),
    # steam-era farm set
    barn_red=(0.42, 0.05, 0.03), engine_green=(0.04, 0.20, 0.08), brass=(0.80, 0.52, 0.12), soil=(0.17, 0.09, 0.04),
    leaf=(0.10, 0.34, 0.05), wheat=(0.86, 0.62, 0.16), stone=(0.40, 0.39, 0.36), plaid=(0.55, 0.06, 0.04),
    denim=(0.10, 0.18, 0.42), burlap=(0.60, 0.45, 0.24), weathered=(0.36, 0.27, 0.18), sail=(0.80, 0.74, 0.60),
)


def make_materials():
    mats = []
    for name in MAT_ORDER:
        rough, metal = MATERIALS[name]
        m = bpy.data.materials.new(name); m.use_nodes = True
        nt = m.node_tree; bs = nt.nodes.get('Principled BSDF')
        bs.inputs['Base Color'].default_value = (1, 1, 1, 1)
        bs.inputs['Roughness'].default_value = rough
        bs.inputs['Metallic'].default_value = metal
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
        nt.links.new(vc.outputs['Color'], bs.inputs['Base Color'])
        m.diffuse_color = (0.8, 0.8, 0.8, 1); m.use_backface_culling = True
        mats.append(m)
    return mats


# ---------------------------------------------------------------- part builder
class Prop:
    """Accumulates primitives into one bmesh with per-face material index and corner colour."""

    def __init__(self, name):
        self.name = name; self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Col')

    def _claim(self, before, mat, rgb, smooth):
        new = [f for f in self.bm.faces if f not in before]
        for f in new:
            f.material_index = mat; f.smooth = smooth
            for lp in f.loops: lp[self.col] = (*rgb, 1.0)
        return new

    def box(self, c, size, mat, rgb, rot=(0, 0, 0), bevel=0.0):
        before = set(self.bm.faces)
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=Matrix.LocRotScale(Vector(c), Euler(rot), Vector(size)))
        if bevel > 0:
            vs = r['verts']; es = list({e for v in vs for e in v.link_edges})
            bmesh.ops.bevel(self.bm, geom=vs + es, offset=bevel, segments=1, affect='EDGES', profile=0.5)
        return self._claim(before, mat, rgb, False)

    def cyl(self, c, r, h, mat, rgb, seg=12, r2=None, rot=(0, 0, 0), smooth=True):
        """Cylinder (or cone frustum) centred at c along local Z, height h."""
        before = set(self.bm.faces)
        bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h,
                              matrix=Matrix.LocRotScale(Vector(c), Euler(rot), Vector((1, 1, 1))))
        faces = self._claim(before, mat, rgb, smooth)
        for f in faces:  # n-gon caps stay flat; quad sides follow `smooth`
            if len(f.verts) > 4: f.smooth = False
        return faces

    def rod(self, a, b, r, mat, rgb, seg=8):
        a, b = Vector(a), Vector(b); d = b - a
        q = d.to_track_quat('Z', 'Y')
        before = set(self.bm.faces)
        bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=d.length,
                              matrix=Matrix.LocRotScale((a + b) / 2, q, Vector((1, 1, 1))))
        return self._claim(before, mat, rgb, True)

    def strip(self, a, b, w, t, mat, rgb):
        """Thin flat box from a to b (width w in-plane, thickness t)."""
        a, b = Vector(a), Vector(b); d = b - a
        q = d.to_track_quat('X', 'Y')
        return self.box((a + b) / 2, (d.length, t, w), mat, rgb, rot=q.to_euler())

    def sphere(self, c, r, mat, rgb, seg=12, rings=8, scale=(1, 1, 1), rib=0.0, ribs=0):
        before = set(self.bm.faces)
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=rings, radius=1.0)
        for v in res['verts']:
            p = v.co
            if ribs:
                k = 1.0 - rib * (0.5 - 0.5 * math.cos(ribs * math.atan2(p.y, p.x)))
                p.x *= k; p.y *= k
            v.co = Vector(c) + Vector((p.x * r * scale[0], p.y * r * scale[1], p.z * r * scale[2]))
        return self._claim(before, mat, rgb, True)

    def prism(self, profile, x0, x1, mat, rgb):
        """Extrude a closed (y, z) profile (counter-clockwise seen from +X) between x0 and x1."""
        before = set(self.bm.faces)
        left = [self.bm.verts.new((x0, y, z)) for y, z in profile]
        right = [self.bm.verts.new((x1, y, z)) for y, z in profile]
        n = len(profile)
        self.bm.faces.new(list(reversed(left))); self.bm.faces.new(right)
        for i in range(n):
            j = (i + 1) % n
            self.bm.faces.new((left[i], left[j], right[j], right[i]))
        return self._claim(before, mat, rgb, False)

    def poly(self, pts, mat, rgb):
        before = set(self.bm.faces)
        self.bm.faces.new([self.bm.verts.new(p) for p in pts])
        return self._claim(before, mat, rgb, False)


# ---------------------------------------------------------------- the props
def picnic_table(p):
    for i in range(5):
        p.box((0, -0.32 + i * 0.16, 0.73), (1.8, 0.145, 0.04), WOOD, C['wood'], bevel=0.008)
    for s in (-1, 1):
        for i in range(2):
            p.box((0, s * (0.52 + i * 0.13), 0.43), (1.8, 0.12, 0.04), WOOD, C['wood'], bevel=0.008)
        for x in (-0.68, 0.68):
            p.strip((x, s * 0.62, 0.0), (x, s * 0.08, 0.71), 0.09, 0.07, WOOD, C['wood_dark'])
    for x in (-0.68, 0.68):
        p.box((x, 0, 0.39), (0.07, 1.42, 0.07), WOOD, C['wood_dark'])
        p.box((x, 0, 0.69), (0.07, 0.78, 0.05), WOOD, C['wood_dark'])
    return 'box', (0, 0, 0.375), (1.8, 1.5, 0.75)


def bench(p):
    for i in range(3):
        p.box((0, -0.12 + i * 0.13, 0.45), (1.8, 0.115, 0.04), WOOD, C['wood'], bevel=0.008)
    for i in range(2):
        p.box((0, -0.25, 0.62 + i * 0.16), (1.8, 0.04, 0.12), WOOD, C['wood'], rot=(math.radians(-12), 0, 0), bevel=0.008)
    for x in (-0.72, 0.72):
        p.box((x, 0.02, 0.21), (0.06, 0.06, 0.42), METAL, C['iron'])
        p.box((x, -0.06, 0.42), (0.06, 0.46, 0.05), METAL, C['iron'])
        p.strip((x, -0.18, 0.0), (x, -0.30, 0.86), 0.06, 0.06, METAL, C['iron'])
        p.box((x, -0.02, 0.62), (0.05, 0.36, 0.04), METAL, C['iron'])
    return 'box', (0, -0.04, 0.43), (1.8, 0.58, 0.86)


def bin_(p):
    p.cyl((0, 0, 0.05), 0.24, 0.1, METAL, C['iron'], seg=14)
    p.cyl((0, 0, 0.47), 0.27, 0.78, PAINT, C['green'], seg=14, r2=0.3)
    p.cyl((0, 0, 0.88), 0.32, 0.06, METAL, C['steel'], seg=14)
    p.cyl((0, 0, 0.905), 0.26, 0.02, PAINT, C['iron'], seg=14, smooth=False)
    for a in range(0, 360, 90):
        x, y = 0.29 * math.cos(math.radians(a)), 0.29 * math.sin(math.radians(a))
        p.box((x, y, 0.5), (0.03, 0.03, 0.66), PAINT, C['green_dark'], rot=(0, 0, math.radians(a)))
    return 'cylinder', (0, 0, 0.46), (0.64, 0.92, 0.64)


def street_lamp(p):
    p.cyl((0, 0, 0.2), 0.17, 0.4, PAINT, C['green_dark'], seg=12, r2=0.11)
    p.cyl((0, 0, 2.6), 0.07, 4.8, PAINT, C['green_dark'], seg=10, r2=0.05)
    p.sphere((0, 0, 5.02), 0.08, PAINT, C['green_dark'], seg=8, rings=5)
    p.strip((0, 0, 4.85), (0, 1.1, 5.05), 0.06, 0.06, PAINT, C['green_dark'])
    p.box((0, 1.25, 5.0), (0.34, 0.56, 0.14), PAINT, C['green_dark'], bevel=0.02)
    p.box((0, 1.25, 4.92), (0.26, 0.46, 0.04), PAINT, C['lens'])
    return 'cylinder', (0, 0, 2.55), (0.36, 5.1, 0.36)


def chain_link_fence_panel(p):
    W, H = 3.0, 1.8
    for x in (-W / 2, W / 2):
        p.cyl((x, 0, H / 2 + 0.03), 0.045, H + 0.06, METAL, C['galv'], seg=8)
        p.sphere((x, 0, H + 0.07), 0.055, METAL, C['galv'], seg=8, rings=4)
    p.rod((-W / 2, 0, H - 0.04), (W / 2, 0, H - 0.04), 0.024, METAL, C['galv'], seg=6)
    p.rod((-W / 2, 0, 0.06), (W / 2, 0, 0.06), 0.012, METAL, C['galv'], seg=4)
    # Coarse toy diamond mesh: two families of 45-degree wires clipped to the panel rectangle.
    step = 0.3; x0, x1, z0, z1 = -W / 2 + 0.05, W / 2 - 0.05, 0.06, H - 0.05
    for m in (1, -1):
        c = x0 - (z1 - z0)
        while c < x1 + (z1 - z0):
            # line z = z0 + m * (x - c) for m=1, z = z1 + m * (x - c) for m=-1
            zb = z0 if m > 0 else z1
            xa, xb = sorted((c + (z0 - zb) / m, c + (z1 - zb) / m))
            xa, xb = max(xa, x0), min(xb, x1)
            if xb - xa > 0.05:
                p.strip((xa, 0, zb + m * (xa - c)), (xb, 0, zb + m * (xb - c)), 0.018, 0.01, METAL, C['galv'])
            c += step
    return 'box', (0, 0, 0.93), (3.0, 0.2, 1.86)


def bollard(p):
    p.cyl((0, 0, 0.45), 0.1, 0.9, PAINT, C['yellow'], seg=12)
    p.sphere((0, 0, 0.9), 0.1, PAINT, C['yellow'], seg=12, rings=6, scale=(1, 1, 0.6))
    for z in (0.62, 0.74):
        p.cyl((0, 0, z), 0.103, 0.05, PAINT, C['white'], seg=12)
    p.cyl((0, 0, 0.02), 0.14, 0.04, METAL, C['iron'], seg=12)
    return 'cylinder', (0, 0, 0.48), (0.26, 0.96, 0.26)


def traffic_cone(p):
    p.box((0, 0, 0.02), (0.4, 0.4, 0.04), PAINT, C['orange'], bevel=0.015)
    p.cyl((0, 0, 0.385), 0.17, 0.69, PAINT, C['orange'], seg=14, r2=0.035)
    p.cyl((0, 0, 0.42), 0.112, 0.11, PAINT, C['white'], seg=14, r2=0.094)
    return 'cylinder', (0, 0, 0.36), (0.4, 0.72, 0.4)


def jersey_barrier(p):
    prof = [(-0.3, 0.0), (0.3, 0.0), (0.3, 0.08), (0.2, 0.3), (0.09, 0.81), (-0.09, 0.81), (-0.2, 0.3), (-0.3, 0.08)]
    p.prism(prof, -1.5, 1.5, WOOD, C['concrete'])
    for x in (-1.0, 1.0):  # toy reflector stripes
        p.box((x, -0.25, 0.32), (0.5, 0.012, 0.12), PAINT, C['orange'], rot=(math.radians(-24), 0, 0))
        p.box((x, 0.25, 0.32), (0.5, 0.012, 0.12), PAINT, C['orange'], rot=(math.radians(24), 0, 0))
    return 'box', (0, 0, 0.405), (3.0, 0.6, 0.81)


def sign_post(p):
    for x in (-0.55, 0.55):
        p.cyl((x, 0, 1.12), 0.04, 2.24, METAL, C['galv'], seg=8)
    p.box((0, 0.045, 1.62), (1.3, 0.05, 0.86), PAINT, C['green'], bevel=0.02)
    p.box((0, 0.075, 1.62), (1.18, 0.012, 0.74), PAINT, C['white'])
    return 'box', (0, 0.03, 1.12), (1.3, 0.16, 2.24)


def hay_bale(p):
    p.cyl((0, 0, 0.6), 0.6, 1.2, WOOD, C['straw'], seg=16, rot=(0, math.pi / 2, 0))
    for x in (-0.6, 0.6):
        p.cyl((x * 1.002, 0, 0.6), 0.5, 0.01, WOOD, C['straw_end'], seg=16, rot=(0, math.pi / 2, 0), smooth=False)
    for x in (-0.3, 0.3):
        p.cyl((x, 0, 0.6), 0.607, 0.04, WOOD, C['twine'], seg=16, rot=(0, math.pi / 2, 0))
    return 'box', (0, 0, 0.6), (1.2, 1.2, 1.2)


def pumpkin(p):
    p.sphere((0, 0, 0.24), 0.33, PAINT, C['pumpkin'], seg=24, rings=10, scale=(1, 1, 0.72), rib=0.12, ribs=8)
    p.cyl((0, 0, 0.5), 0.035, 0.12, WOOD, C['stem'], seg=6, r2=0.025, rot=(math.radians(10), 0, 0))
    return 'cylinder', (0, 0, 0.25), (0.66, 0.5, 0.66)


def tent(p):
    L, Wd, H = 2.0, 1.8, 1.3
    hw = Wd / 2
    for s in (-1, 1):  # two canvas roof panels, a little proud of the ridge
        a = Vector((0, s * hw, 0.02)); b = Vector((0, 0, H))
        d = b - a; ang = math.atan2(d.z, -s * d.y)
        p.box(((a + b) / 2).to_tuple(), (L, d.length, 0.03), WOOD, C['canvas'], rot=(s * -ang, 0, 0))
    p.poly([(-L / 2 + 0.01, -hw + 0.03, 0.02), (-L / 2 + 0.01, 0, H - 0.04), (-L / 2 + 0.01, hw - 0.03, 0.02)], WOOD, C['canvas_light'])
    p.poly([(L / 2 - 0.01, hw - 0.03, 0.02), (L / 2 - 0.01, 0, H - 0.04), (L / 2 - 0.01, -hw + 0.03, 0.02)], WOOD, C['canvas_light'])
    p.poly([(L / 2 - 0.009, 0.3, 0.02), (L / 2 - 0.009, 0, 0.9), (L / 2 - 0.009, -0.3, 0.02)], WOOD, C['twine'])  # door flap
    for x in (-L / 2 - 0.02, L / 2 + 0.02):
        p.cyl((x, 0, (H + 0.15) / 2), 0.025, H + 0.15, METAL, C['steel'], seg=6)
    p.rod((-L / 2 - 0.02, 0, H + 0.02), (L / 2 + 0.02, 0, H + 0.02), 0.02, METAL, C['steel'], seg=6)
    return 'box', (0, 0, 0.7), (2.1, 1.8, 1.4)


def water_tower(p):
    R0, R1, top = 1.75, 1.15, 5.0
    corners = [(1, 1), (-1, 1), (-1, -1), (1, -1)]
    for sx, sy in corners:
        p.rod((sx * R0, sy * R0, 0), (sx * R1, sy * R1, top), 0.1, METAL, C['steel'], seg=8)
        p.cyl((sx * R0, sy * R0, 0.1), 0.22, 0.2, WOOD, C['concrete'], seg=8)
    for i in range(4):  # X bracing on each face at two levels
        (ax, ay), (bx, by) = corners[i], corners[(i + 1) % 4]
        for z0, z1 in ((0.4, 2.5), (2.5, 4.7)):
            r0 = R0 + (R1 - R0) * z0 / top; r1 = R0 + (R1 - R0) * z1 / top
            p.rod((ax * r0, ay * r0, z0), (bx * r1, by * r1, z1), 0.035, METAL, C['steel'], seg=4)
            p.rod((bx * r0, by * r0, z0), (ax * r1, ay * r1, z1), 0.035, METAL, C['steel'], seg=4)
    p.cyl((0, 0, top + 0.04), 1.95, 0.08, METAL, C['steel'], seg=20)  # catwalk deck
    for k in range(10):
        a = 2 * math.pi * k / 10
        p.rod((1.9 * math.cos(a), 1.9 * math.sin(a), top + 0.08), (1.9 * math.cos(a), 1.9 * math.sin(a), top + 0.75), 0.02, METAL, C['steel'], seg=4)
    p.cyl((0, 0, top + 0.75), 1.92, 0.04, METAL, C['steel'], seg=20)  # rail ring (thin disc)
    p.cyl((0, 0, top + 1.2), 1.6, 2.2, PAINT, C['sky'], seg=24)
    p.cyl((0, 0, top + 1.55), 1.62, 0.42, PAINT, C['red'], seg=24)
    p.cyl((0, 0, top + 2.7), 1.72, 0.8, PAINT, C['white'], seg=24, r2=0.12)
    p.sphere((0, 0, top + 3.12), 0.14, PAINT, C['red'], seg=10, rings=6)
    # ladder up the +Y face to the catwalk
    for x in (-0.22, 0.22):
        p.box((x, R0 + 0.15, top / 2), (0.05, 0.05, top), METAL, C['iron'])
    for i in range(12):
        p.box((0, R0 + 0.15, 0.35 + i * 0.4), (0.44, 0.04, 0.04), METAL, C['iron'])
    return 'cylinder', (0, 0, 4.0), (3.9, 8.0, 3.9)


def fuel_drum(p):
    p.cyl((0, 0, 0.44), 0.29, 0.88, PAINT, C['blue'], seg=16)
    for z in (0.3, 0.6):
        p.cyl((0, 0, z), 0.3, 0.03, METAL, C['steel'], seg=16)
    p.cyl((0, 0, 0.885), 0.27, 0.012, METAL, C['steel'], seg=16, smooth=False)
    p.cyl((0.14, 0, 0.9), 0.035, 0.03, METAL, C['iron'], seg=6)
    return 'cylinder', (0, 0, 0.45), (0.6, 0.9, 0.6)



# ---------------------------------------------------------------- steam-era farm set (dark world, owner 31 Oct)
AXIS_X = (0, math.pi / 2, 0)   # cylinder axis along X (wheels)
AXIS_Y = (math.pi / 2, 0, 0)   # cylinder axis along Y (boilers, axles pointing forward)


def wheel(p, c, r, w, rim, spokes=8, seg=20, hub_mat=METAL, hub=C['iron']):
    """Toy spoked wheel on the X axis: tyre band, recessed disc, hub and proud spokes on the outer face."""
    x, y, z = c; side = 1 if x >= 0 else -1
    p.cyl(c, r, w, PAINT, rim, seg=seg, rot=AXIS_X)
    p.cyl((x + side * w * 0.52, y, z), r * 0.82, 0.02, WOOD, C['wood_dark'], seg=seg, rot=AXIS_X, smooth=False)
    p.cyl((x + side * w * 0.55, y, z), r * 0.2, w * 0.5, hub_mat, hub, seg=10, rot=AXIS_X)
    for k in range(spokes):
        a = 2 * math.pi * k / spokes
        p.strip((x + side * w * 0.56, y + math.cos(a) * r * 0.18, z + math.sin(a) * r * 0.18),
                (x + side * w * 0.56, y + math.cos(a) * r * 0.8, z + math.sin(a) * r * 0.8), r * 0.09, 0.03, PAINT, rim)


def steam_tractor(p):
    for sx in (-1, 1):
        wheel(p, (sx * 0.86, -1.05, 0.95), 0.95, 0.38, C['barn_red'], spokes=10, seg=24)
        wheel(p, (sx * 0.62, 1.30, 0.52), 0.52, 0.22, C['barn_red'], spokes=6, seg=16)
    p.rod((-0.9, -1.05, 0.95), (0.9, -1.05, 0.95), 0.07, METAL, C['iron'])
    p.rod((-0.65, 1.30, 0.52), (0.65, 1.30, 0.52), 0.06, METAL, C['iron'])
    p.cyl((0, 0.25, 1.2), 0.46, 2.1, PAINT, C['engine_green'], seg=18, rot=AXIS_Y)        # boiler
    for y in (-0.5, 0.25, 1.0):
        p.cyl((0, y, 1.2), 0.475, 0.06, METAL, C['brass'], seg=18, rot=AXIS_Y)
    p.cyl((0, 1.38, 1.2), 0.5, 0.32, METAL, C['iron'], seg=18, rot=AXIS_Y)                  # smokebox
    p.cyl((0, 1.38, 2.35), 0.13, 2.0, METAL, C['iron'], seg=10)                             # tall chimney
    p.cyl((0, 1.38, 3.45), 0.13, 0.25, METAL, C['iron'], seg=10, r2=0.24)                   # flared cap
    p.sphere((0, 0.35, 1.7), 0.17, METAL, C['brass'], seg=10, rings=6)                      # steam dome
    p.box((0, -0.1, 1.72), (0.36, 0.7, 0.2), METAL, C['iron'], bevel=0.03)                  # cylinder block
    p.cyl((0.6, -0.15, 1.45), 0.42, 0.1, PAINT, C['barn_red'], seg=18, rot=AXIS_X)          # flywheel
    p.box((0, -1.0, 1.05), (1.0, 0.8, 1.1), PAINT, C['engine_green'], bevel=0.03)           # firebox / footplate
    p.box((0, -1.55, 0.55), (1.3, 0.5, 0.08), WOOD, C['weathered'])                         # footboard
    for sx in (-1, 1):
        for y in (-1.6, 0.3):
            p.rod((sx * 0.62, y, 1.6), (sx * 0.62, y, 3.0), 0.04, METAL, C['iron'], seg=6)
    p.box((0, -0.65, 3.04), (1.45, 2.3, 0.08), WOOD, C['weathered'], bevel=0.02)          # canopy
    return 'box', (0, 0.0, 1.25), (2.1, 3.9, 2.5)


def thresher(p):
    p.box((0, 0, 1.55), (1.6, 4.0, 1.7), PAINT, C['barn_red'], bevel=0.05)
    p.box((0, 0, 2.48), (1.3, 3.6, 0.16), WOOD, C['weathered'], bevel=0.02)
    for y in (-1.2, 0, 1.2):
        p.box((0, y, 1.55), (1.66, 0.08, 1.74), WOOD, C['weathered'])                       # toy plank bands
    for sx in (-1, 1):
        for y in (-1.4, 1.4):
            wheel(p, (sx * 0.9, y, 0.5), 0.5, 0.18, C['iron'], spokes=6, seg=16, hub=C['brass'])
    # feed chute at the front: a sloped open trough
    a, b = Vector((0, 2.0, 2.2)), Vector((0, 3.0, 1.45)); d = b - a; ang = math.atan2(d.z, d.y)
    mid = (a + b) / 2
    p.box(mid.to_tuple(), (1.0, d.length, 0.06), WOOD, C['wood'], rot=(ang, 0, 0))
    for sx in (-1, 1):
        p.box((sx * 0.5, mid.y, mid.z + 0.12), (0.06, d.length, 0.25), WOOD, C['wood'], rot=(ang, 0, 0))
    # straw blower pipe at the back
    p.rod((0, -1.8, 2.4), (0, -2.5, 3.4), 0.2, METAL, C['steel'], seg=10)
    p.cyl((0, -2.6, 3.55), 0.2, 0.3, METAL, C['steel'], seg=10, r2=0.34, rot=(math.radians(-35), 0, 0))
    p.cyl((0.86, 0.6, 1.9), 0.38, 0.12, METAL, C['iron'], seg=16, rot=AXIS_X)              # belt pulley
    p.rod((0, 2.0, 0.55), (0, 2.8, 0.4), 0.05, WOOD, C['wood_dark'], seg=6)                 # drawbar
    return 'box', (0, 0.3, 1.4), (2.0, 5.4, 2.8)


WINDMILL_AXLE = (0, 0.62, 8.35)   # Blender coords of the rotor axle, relative to the windmill's ground pivot


def windmill(p):
    top, base, h = 0.42, 1.45, 7.9
    corners = [(1, 1), (-1, 1), (-1, -1), (1, -1)]
    lerp = lambda z: base + (top - base) * z / h
    for sx, sy in corners:
        p.strip((sx * base, sy * base, 0), (sx * top, sy * top, h), 0.16, 0.16, WOOD, C['weathered'])
        p.box((sx * base, sy * base, 0.12), (0.4, 0.4, 0.24), WOOD, C['stone'])
    for z in (1.6, 3.6, 5.6):
        r = lerp(z)
        for i in range(4):
            (ax, ay), (bx, by) = corners[i], corners[(i + 1) % 4]
            p.strip((ax * r, ay * r, z), (bx * r, by * r, z), 0.1, 0.08, WOOD, C['wood'])
    for i in (0, 2):   # X braces on two faces
        (ax, ay), (bx, by) = corners[i], corners[(i + 1) % 4]
        for z0, z1 in ((0.2, 3.6), (3.6, 7.0)):
            r0, r1 = lerp(z0), lerp(z1)
            p.strip((ax * r0, ay * r0, z0), (bx * r1, by * r1, z1), 0.07, 0.05, WOOD, C['wood_dark'])
            p.strip((bx * r0, by * r0, z0), (ax * r1, ay * r1, z1), 0.07, 0.05, WOOD, C['wood_dark'])
    p.box((0, 0, h + 0.05), (1.3, 1.3, 0.1), WOOD, C['wood'])                               # platform
    p.box((0, 0.05, 8.35), (0.5, 1.1, 0.5), PAINT, C['barn_red'], bevel=0.05)               # gearbox housing (fixed)
    p.cyl((0, 0.05, 8.65), 0.38, 0.12, METAL, C['iron'], seg=12, r2=0.1)
    p.rod((0, 0.5, 8.35), (0, 0.66, 8.35), 0.07, METAL, C['iron'], seg=8)                   # axle stub
    p.strip((0, -0.4, 8.35), (0, -2.6, 8.45), 0.08, 0.08, WOOD, C['wood_dark'])            # tail boom
    p.box((0, -2.7, 8.5), (0.04, 1.0, 0.9), PAINT, C['sail'], bevel=0.01)                   # tail vane
    ax, ay, az = WINDMILL_AXLE
    return 'box', (0, 0, 4.0), (3.0, 3.0, 8.0), {'attach': {'prop': 'windmill-head', 'offset': [ax, az, -ay]}}


def windmill_head(p):
    """Four-blade rotor. Origin ON THE AXLE (not the ground); spins about Blender Y = glTF -Z."""
    p.cyl((0, 0.08, 0), 0.22, 0.24, METAL, C['iron'], seg=12, rot=AXIS_Y)
    p.sphere((0, 0.22, 0), 0.14, METAL, C['brass'], seg=10, rings=6)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2; d = Vector((math.cos(a), 0, math.sin(a)))
        p.strip((d * 0.15 + Vector((0, 0.1, 0))).to_tuple(), (d * 3.3 + Vector((0, 0.1, 0))).to_tuple(), 0.1, 0.08, WOOD, C['wood_dark'])
        side = Vector((-math.sin(a), 0, math.cos(a)))
        for i in range(5):   # slatted sail
            r = 0.9 + i * 0.55; c = d * r + side * 0.32 + Vector((0, 0.14, 0))
            p.box(c.to_tuple(), (0.42, 0.04, 0.6), PAINT, C['sail'], rot=(0, -a, 0))
    return None


def hay_wagon(p):
    p.box((0, 0, 1.0), (1.8, 3.4, 0.12), WOOD, C['wood'], bevel=0.02)
    for sx in (-1, 1):
        for z in (1.25, 1.55):
            p.box((sx * 0.88, 0, z), (0.06, 3.4, 0.08), WOOD, C['wood'])
        for y in (-1.6, -0.55, 0.55, 1.6):
            p.box((sx * 0.88, y, 1.3), (0.07, 0.07, 0.6), WOOD, C['wood_dark'])
    for y in (-1.15, 1.15):
        p.rod((-0.95, y, 0.55), (0.95, y, 0.55), 0.05, METAL, C['iron'], seg=6)
        for sx in (-1, 1):
            wheel(p, (sx * 0.98, y, 0.55), 0.55, 0.14, C['barn_red'], spokes=8, seg=16)
    p.box((0, 0, 0.8), (0.2, 3.0, 0.2), WOOD, C['wood_dark'])
    p.rod((0, 1.7, 0.75), (0, 3.0, 0.45), 0.05, WOOD, C['wood_dark'], seg=6)                # tongue
    for (x, y, z, sx, sy, sz) in ((0, -0.8, 1.45, 1.6, 1.4, 0.7), (0, 0.8, 1.45, 1.6, 1.4, 0.7), (0.1, 0, 2.05, 1.3, 2.4, 0.55), (-0.1, 0.2, 2.5, 0.9, 1.3, 0.4)):
        p.box((x, y, z), (sx, sy, sz), WOOD, C['straw'], bevel=0.06)                        # blocky hay load
    return 'box', (0, 0.3, 1.35), (2.2, 4.6, 2.7)


def water_pump(p):
    p.box((0, 0, 0.1), (0.7, 0.7, 0.2), WOOD, C['stone'], bevel=0.03)
    p.box((0, 0, 0.75), (0.24, 0.24, 1.1), PAINT, C['engine_green'], bevel=0.02)
    p.cyl((0, 0, 1.36), 0.17, 0.12, METAL, C['iron'], seg=10)
    p.rod((0, 0.1, 1.05), (0, 0.48, 0.95), 0.05, METAL, C['iron'], seg=8)                    # spout
    p.rod((0, -0.05, 1.42), (0, -0.75, 1.75), 0.03, METAL, C['iron'], seg=6)                 # handle
    p.sphere((0, -0.78, 1.77), 0.05, METAL, C['iron'], seg=8, rings=4)
    p.box((0, 0.75, 0.22), (1.1, 0.5, 0.44), WOOD, C['weathered'], bevel=0.02)               # trough
    p.box((0, 0.75, 0.42), (0.95, 0.36, 0.03), PAINT, C['sky'])                             # water
    return 'box', (0, 0.25, 0.7), (1.2, 1.5, 1.45)


def split_rail_fence(p):
    for x in (-1.5, 1.5):
        p.box((x, 0, 0.6), (0.14, 0.14, 1.2), WOOD, C['weathered'], rot=(0, 0, math.radians(8)))
        p.box((x, 0, 1.22), (0.18, 0.18, 0.06), WOOD, C['wood_dark'])
    for i, z in enumerate((0.38, 0.72, 1.04)):
        off = 0.09 if i % 2 else -0.09
        p.strip((-1.55, off, z), (1.55, -off, z + (0.04 if i % 2 else -0.03)), 0.1, 0.09, WOOD, C['wood'])
    return 'box', (0, 0, 0.62), (3.1, 0.3, 1.24)


def crop_row(p, crop='wheat'):
    p.prism([(-0.28, 0.0), (0.28, 0.0), (0.16, 0.14), (-0.16, 0.14)], -1.0, 1.0, WOOD, C['soil'])
    if crop == 'wheat':
        for i in range(8):
            x = -0.875 + i * 0.25
            for k, (dx, dy, h) in enumerate(((0, 0, 0.62), (0.06, 0.07, 0.52), (-0.06, -0.06, 0.56))):
                p.box((x + dx, dy, 0.14 + h / 2), (0.05, 0.05, h), WOOD, C['leaf'] if k == 2 else C['wheat'])
                p.box((x + dx, dy, 0.14 + h + 0.06), (0.09, 0.09, 0.14), PAINT, C['wheat'])   # blocky ear
    else:
        for i in range(4):
            x = -0.75 + i * 0.5; s = 0.32 + 0.05 * ((i * 7) % 3)
            p.box((x, 0.02, 0.14 + s * 0.42), (s, s, s * 0.82), PAINT, C['pumpkin'], bevel=0.04)
            p.box((x, 0.02, 0.14 + s * 0.82 + 0.05), (0.05, 0.05, 0.1), WOOD, C['stem'])
            p.box((x + 0.25, -0.12, 0.17), (0.22, 0.18, 0.04), WOOD, C['leaf'], rot=(0, 0, 0.5))
    return 'box', (0, 0, 0.35), (2.0, 0.6, 0.7)


def scarecrow(p):
    p.box((0, 0, 1.0), (0.1, 0.1, 2.0), WOOD, C['weathered'])
    p.box((0, 0, 1.55), (1.5, 0.08, 0.08), WOOD, C['weathered'])
    p.box((0, 0, 1.35), (0.5, 0.26, 0.6), PAINT, C['plaid'], bevel=0.03)                    # shirt
    for sx in (-1, 1):
        p.box((sx * 0.5, 0, 1.55), (0.5, 0.2, 0.2), PAINT, C['plaid'], bevel=0.02)          # sleeves
        p.box((sx * 0.8, 0, 1.55), (0.12, 0.14, 0.12), WOOD, C['straw'])                   # straw hands
    p.box((0, 0, 0.92), (0.44, 0.24, 0.3), PAINT, C['denim'], bevel=0.02)
    p.box((0, 0, 1.88), (0.32, 0.3, 0.34), WOOD, C['burlap'], bevel=0.04)                   # sack head
    p.box((0, 0.155, 1.9), (0.2, 0.01, 0.05), PAINT, C['iron'])                             # stitched mouth
    p.cyl((0, 0, 2.08), 0.32, 0.03, WOOD, C['straw_end'], seg=12, smooth=False)            # hat brim
    p.cyl((0, 0, 2.2), 0.16, 0.24, WOOD, C['straw_end'], seg=12, r2=0.12)
    return 'box', (0, 0, 1.15), (0.6, 0.4, 2.3)


def silo(p):
    p.cyl((0, 0, 0.15), 1.75, 0.3, WOOD, C['stone'], seg=24)
    p.cyl((0, 0, 3.15), 1.6, 5.7, PAINT, C['barn_red'], seg=24)
    for z in (1.2, 2.6, 4.0, 5.4):
        p.cyl((0, 0, z), 1.63, 0.08, METAL, C['steel'], seg=24)
    p.sphere((0, 0, 6.0), 1.62, METAL, C['galv'], seg=24, rings=10, scale=(1, 1, 0.62))   # dome
    p.sphere((0, 0, 7.0), 0.12, METAL, C['iron'], seg=8, rings=5)
    for x in (-0.22, 0.22):
        p.box((x, 1.66, 3.2), (0.05, 0.05, 6.0), METAL, C['iron'])
    for i in range(14):
        p.box((0, 1.66, 0.6 + i * 0.42), (0.44, 0.04, 0.04), METAL, C['iron'])
    p.box((0, 1.6, 0.9), (0.8, 0.06, 1.4), WOOD, C['wood_dark'], bevel=0.02)               # door
    return 'cylinder', (0, 0, 3.5), (3.5, 3.5, 7.0)


PROPS = [
    ('picnic-table', picnic_table), ('bench', bench), ('bin', bin_), ('street-lamp', street_lamp),
    ('chain-link-fence-panel', chain_link_fence_panel), ('bollard', bollard), ('traffic-cone', traffic_cone),
    ('jersey-barrier', jersey_barrier), ('sign-post', sign_post), ('hay-bale', hay_bale), ('pumpkin', pumpkin),
    ('tent', tent), ('water-tower', water_tower), ('fuel-drum', fuel_drum),
    # steam-era farm set
    ('steam-tractor', steam_tractor), ('thresher', thresher), ('windmill', windmill), ('windmill-head', windmill_head),
    ('hay-wagon', hay_wagon), ('water-pump', water_pump), ('split-rail-fence', split_rail_fence),
    ('crop-row', crop_row), ('crop-row@1', lambda p: crop_row(p, 'pumpkin')), ('scarecrow', scarecrow), ('silo', silo),
]
# Kit-variant nodes: '<prop>@<n>' replaces <prop> when an item asks for variant n (placements.js). Attach-only
# nodes (windmill-head) have no ground pivot and no collider; the parent's extras.attach places them.


# ---------------------------------------------------------------- AO bake
def bake_ao(me, extra_tris, reach):
    """Per-vertex hemisphere visibility (12 golden-spiral rays), multiplied into the 'Col' corners."""
    verts = [v.co.copy() for v in me.vertices]; faces = [tuple(p.vertices) for p in me.polygons]
    off = len(verts)
    for tri in extra_tris:
        verts.extend(tri); faces.append((off, off + 1, off + 2)); off += 3
    bvh = BVHTree.FromPolygons(verts, faces, all_triangles=False)
    golden = math.pi * (3 - math.sqrt(5)); n_rays = 12; ao = {}
    for v in me.vertices:
        n = v.normal.normalized(); u = n.cross(Vector((0, 0, 1)))
        if u.length < 0.01: u = n.cross(Vector((1, 0, 0)))
        u.normalize(); w = n.cross(u).normalized(); clear = 0
        for k in range(n_rays):
            q = (k + 0.5) / n_rays; th = golden * k; rad = math.sqrt(max(0, 1 - q * q))
            d = (u * math.cos(th) + w * math.sin(th)) * rad + n * q
            if bvh.ray_cast(v.co + n * 0.004, d, reach)[0] is None: clear += 1
        ao[v.index] = 0.35 + 0.65 * clear / n_rays
    col = me.color_attributes['Col']
    for lp in me.loops:
        r, g, b, a = col.data[lp.index].color; k = ao[lp.vertex_index]
        col.data[lp.index].color = (r * k, g * k, b * k, 1.0)


def collider_mesh(name, kind, centre, size):
    bm = bmesh.new(); cx, cy, cz = centre; sx, sy, sz = size
    if kind == 'box':
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.LocRotScale(Vector(centre), None, Vector(size)))
    else:
        bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=max(sx, sy) / 2, radius2=max(sx, sy) / 2, depth=sz,
                              matrix=Matrix.Translation(Vector(centre)))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); return me


def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for d in list(coll): coll.remove(d)
    bpy.context.scene.unit_settings.system = 'METRIC'


def main():
    clear(); mats = make_materials(); scene = bpy.context.scene
    stats = {}; objects = []
    cols = 4; placed = {}; attach_at = {}
    for i, (name, fn) in enumerate(PROPS):
        p = Prop(name)
        ret = fn(p)
        kind, centre, size = ret[:3] if ret else (None, None, None)
        extra = ret[3] if ret and len(ret) > 3 else {}
        # collider sizes are written in Blender axes (x, y=forward, z=up)
        me = bpy.data.meshes.new(name); p.bm.normal_update(); p.bm.to_mesh(me); p.bm.free()
        for m in mats: me.materials.append(m)
        lo = Vector((min(v.co.x for v in me.vertices), min(v.co.y for v in me.vertices), min(v.co.z for v in me.vertices)))
        hi = Vector((max(v.co.x for v in me.vertices), max(v.co.y for v in me.vertices), max(v.co.z for v in me.vertices)))
        g = max(hi.x - lo.x, hi.y - lo.y) * 0.5 + 1.5
        ground = [[Vector((-g, -g, 0)), Vector((g, -g, 0)), Vector((g, g, 0))], [Vector((-g, -g, 0)), Vector((g, g, 0)), Vector((-g, g, 0))]] if kind else []
        bake_ao(me, ground, reach=min(2.5, max(0.6, (hi - lo).length * 0.6)))
        # The prop node is an empty at the ground contact; its drawn children are one single-material mesh
        # each. Blender 5.2's glTF exporter writes the active colour attribute only into the FIRST primitive of
        # a multi-material mesh (later primitives come out white; 'MATERIAL' mode adds a white COLOR_0 and puts
        # the real colours in COLOR_1), so every exported mesh carries exactly one material.
        obj = bpy.data.objects.new(name, None); scene.collection.objects.link(obj)
        obj.empty_display_type = 'PLAIN_AXES'; obj.empty_display_size = 0.3
        obj.location = ((i % cols) * GRID, -(i // cols) * GRID, 0)
        if name in attach_at: obj.location = attach_at[name]   # review the rotor assembled on its tower
        obj['kit_prop'] = name
        if 'attach' in extra:
            a = extra['attach']; obj['attach'] = {'prop': a['prop'], 'offset': [round(v, 4) for v in a['offset']]}
            ox, oy, oz = a['offset']; attach_at[a['prop']] = obj.location + Vector((ox, -oz, oy))   # glTF -> Blender
        objects.append(obj)
        for mi in sorted({f.material_index for f in me.polygons}):
            bm = bmesh.new(); bm.from_mesh(me)
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != mi], context='FACES')
            for f in bm.faces: f.material_index = 0
            part = bpy.data.meshes.new(f'{name}__{MAT_ORDER[mi]}'); bm.to_mesh(part); bm.free()
            part.materials.append(mats[mi])
            part.color_attributes.active_color = part.color_attributes['Col']
            part.color_attributes.render_color_index = part.color_attributes.active_color_index
            po = bpy.data.objects.new(part.name, part); scene.collection.objects.link(po); po.parent = obj
            objects.append(po)
        if kind:
            col_me = collider_mesh('COL_' + name, kind, centre, size)
            col = bpy.data.objects.new('COL_' + name, col_me); scene.collection.objects.link(col)
            col.parent = obj; col['collider'] = kind
            col.display_type = 'WIRE'; col.hide_render = True
            objects.append(col)
        tris = sum(len(f.vertices) - 2 for f in me.polygons)
        used = sorted({MAT_ORDER[f.material_index] for f in me.polygons})
        stats[name] = dict(triangles=tris, vertices=len(me.vertices), materials=used,
                           extent_m_blender_xyz=[round(v, 3) for v in (hi - lo)], ground_contact_z=round(lo.z, 4),
                           collider=dict(kind=kind, centre_blender=list(centre), size_blender=list(size)) if kind else None,
                           **({'attach': extra['attach']} if 'attach' in extra else {}))
    GLB.parent.mkdir(parents=True, exist_ok=True); BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(GLB), export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
                              export_extras=True, export_cameras=False, export_lights=False, export_animations=False,
                              export_materials='EXPORT', export_image_format='NONE', export_texcoords=False, export_normals=True,
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False)
    total = sum(s['triangles'] for s in stats.values())
    summary = dict(props=len(stats), triangles=total, materials=MAT_ORDER, glb_bytes=GLB.stat().st_size, per_prop=stats)
    PROVENANCE.write_text(json.dumps({
        'asset': 'kit/props.glb', 'generator': 'tools/rc/blender/prop_kit.py', 'blender': bpy.app.version_string,
        'license': 'MIT (original authored geometry and materials; repository MIT)', 'external_assets': [],
        'editable_source': 'assets/rc/kit/props.blend',
        'conventions': 'real-scale metres; each prop is a top-level node named after it with its origin at ground contact; '
                       'runtime ignores the top-level transform; COL_<name> child is the collision proxy (extras.collider box|cylinder); '
                       '<prop>@<n> nodes are kit variants; extras.attach {prop, offset (glTF, prop-local)} places an attach-only node '
                       '(windmill-head: origin on the axle, spins about local Z, no collider)',
        'stats': summary}, indent=2) + '\n')
    print('KIT_STATS ' + json.dumps({k: v for k, v in summary.items() if k != 'per_prop'} | {'per_prop_tris': {k: v['triangles'] for k, v in stats.items()}}))


if __name__ == '__main__':
    main()
