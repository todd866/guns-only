#!/usr/bin/env python3
"""Saucer Springs character pipeline: toy riding dinosaurs on one shared rig and clip contract.

Builds ORIGINAL stylised creatures from primitives (no external assets), rigs them, authors their
clips in Python, saves the editable .blend and exports a skinned GLB per kind.

  HEAVY_SLOT_LABEL=rc-dino heavy-slot -- /Applications/Blender.app/Contents/MacOS/Blender \
    --background --factory-startup --python tools/rc/blender/character_dino.py \
    [-- --kinds dino,longneck,triceratops,raptor,quetzal --render evidence/rc-characters --shots three-quarter,mid-run]

Kinds: `dino` (the original hand-built biped, kept exactly), `raptor` (biped), `longneck` and
`triceratops` (quadrupeds), `quetzal` (a knuckle-walking flyer). The four new kinds are species
data (body primitives, a stance that generates legs and leg bones together, ornaments, saddle,
palette, gaits) fed through the same build: remesh -> heat weights -> rigid parts -> IK clips -> GLB.

Units are real-world metres at game scale (the buggy is 0.42 m long). Blender axes: +Z up,
+Y forward, +X = the creature's left; glTF export gives +Y up, -Z forward (same as the buggy).

Mesh: the soft body is a union of ellipsoid/tube primitives, voxel-remeshed into one manifold
skin, decimated to budget, coloured per face from the nearest source primitive, and skinned
with Blender's automatic (heat) weights. Small hard parts (googly eyes, jaw, horns, frill, saddle,
claws, wings) are rigid: weighted to their bone, so they never smear.

Clips are authored analytically (sine gaits + a sagittal two-bone IK per leg that keeps stance
feet planted) and keyed every 1/60 s. Root motion is NOT baked: clips play in place and the game
moves the root at the clip's ground speed (recorded in provenance.json and characters.js).
"""
import argparse, json, math, sys
from functools import partial
from pathlib import Path
import bpy, bmesh
from mathutils import Vector, Quaternion, Matrix
from mathutils.bvhtree import BVHTree

REPO = Path(__file__).resolve().parents[3]
FPS = 60  # keys every 1/60 s: the gallop's stance sweeps 13 cm per 1/30 s, and slerp between sparser keys sinks the foot ~2 cm
TAU = 2 * math.pi

# material slots, identical order for every kind: body, belly, accent, saddle, eye
GREEN, CREAM, ORANGE, BROWN, BLACK = range(5)
BODY, BELLY, ACCENT = GREEN, CREAM, ORANGE


def make_materials(palette):
    mats = []
    for name, (rgb, rough) in palette.items():
        m = bpy.data.materials.new(name); m.use_nodes = True
        bs = m.node_tree.nodes.get('Principled BSDF')
        bs.inputs['Base Color'].default_value = (*rgb, 1)
        bs.inputs['Roughness'].default_value = rough
        bs.inputs['Metallic'].default_value = 0
        m.diffuse_color = (*rgb, 1)
        mats.append(m)
    return mats


def palette(prefix, body, belly, accent):
    return {f'{prefix}_Body': (body, 0.45), f'{prefix}_Belly': (belly, 0.45), f'{prefix}_Accent': (accent, 0.42),
            'Saddle_Brown': ((0.30, 0.13, 0.05), 0.55), 'Eye_Black': ((0.015, 0.015, 0.02), 0.25)}


# ---------------------------------------------------------------- primitive helpers
def link(obj):
    bpy.context.scene.collection.objects.link(obj); return obj


def ellipsoid(name, c, r, mat, pitch=0.0, seg=18, rings=10):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    bm.to_mesh(me); bm.free()
    obj = link(bpy.data.objects.new(name, me))
    obj.scale = r; obj.rotation_euler = (pitch, 0, 0); obj.location = c
    obj['mat'] = mat
    return obj


def tube(name, pts, mat, step=0.012):
    """Spheres along a polyline [(x,y,z,radius)...]; the voxel remesh fuses them into a smooth tube."""
    out = []
    for i in range(len(pts) - 1):
        a, b = Vector(pts[i][:3]), Vector(pts[i + 1][:3]); ra, rb = pts[i][3], pts[i + 1][3]
        n = max(2, int((b - a).length / step))
        for k in range(n + (i == len(pts) - 2)):
            s = k / n; r = ra + (rb - ra) * s
            out.append(ellipsoid(f'{name}_{i}_{k}', a.lerp(b, s), (r, r, r), mat, seg=16, rings=10))
    return out


def cone(name, base, tip, r, mat, verts=8, r2=None):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r * 0.25 if r2 is None else r2, depth=1.0)
    bm.to_mesh(me); bm.free()
    obj = link(bpy.data.objects.new(name, me))
    d = Vector(tip) - Vector(base)
    obj.location = Vector(base) + d / 2; obj.scale = (1, 1, d.length)
    obj.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); obj['mat'] = mat
    return obj


def torus(name, c, major, minor, mat, axis_rot=(0, math.pi / 2, 0)):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    # bmesh has no torus op: sweep a ring of rings
    segs, sides = 12, 5
    rows = []
    for i in range(segs):
        a = 2 * math.pi * i / segs; row = []
        for j in range(sides):
            b = 2 * math.pi * j / sides
            row.append(bm.verts.new(((major + minor * math.cos(b)) * math.cos(a), (major + minor * math.cos(b)) * math.sin(a), minor * math.sin(b))))
        rows.append(row)
    for i in range(segs):
        for j in range(sides):
            bm.faces.new((rows[i][j], rows[(i + 1) % segs][j], rows[(i + 1) % segs][(j + 1) % sides], rows[i][(j + 1) % sides]))
    bm.to_mesh(me); bm.free()
    obj = link(bpy.data.objects.new(name, me)); obj.location = c; obj.rotation_euler = axis_rot; obj['mat'] = mat
    return obj


def box(name, c, size, mat):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
    obj = link(bpy.data.objects.new(name, me)); obj.location = c; obj.scale = size; obj['mat'] = mat
    return obj


def mirror(fn):
    """Call fn(side, sx) for the left (+X) and right (-X) side."""
    return [fn('L', 1.0), fn('R', -1.0)]


def flat(lists):
    out = []
    for x in lists:
        out.extend(flat(x) if isinstance(x, (list, tuple)) else [x])
    return out


# ---------------------------------------------------------------- the original dinosaur (hand-built, kept exactly)
def soft_parts():
    """Everything that is remeshed into the one deforming skin."""
    p = []
    p.append(ellipsoid('torso', (0, 0.03, 0.31), (0.14, 0.24, 0.12), GREEN, pitch=0.12))
    p.append(ellipsoid('belly', (0, 0.07, 0.268), (0.112, 0.20, 0.098), CREAM, pitch=0.16))
    p.append(ellipsoid('hips', (0, -0.07, 0.30), (0.13, 0.14, 0.11), GREEN))
    p += tube('neck', [(0, 0.19, 0.35, 0.085), (0, 0.27, 0.41, 0.07), (0, 0.33, 0.47, 0.068)], GREEN)
    p += tube('throat', [(0, 0.22, 0.32, 0.06), (0, 0.30, 0.39, 0.05)], CREAM)
    p.append(ellipsoid('head', (0, 0.42, 0.53), (0.115, 0.15, 0.095), GREEN, pitch=-0.06))
    p.append(ellipsoid('snout', (0, 0.52, 0.505), (0.088, 0.085, 0.068), GREEN, pitch=-0.1))
    p += mirror(lambda s, sx: ellipsoid('brow_' + s, (sx * 0.062, 0.43, 0.595), (0.05, 0.05, 0.045), GREEN))
    p += mirror(lambda s, sx: ellipsoid('nostril_' + s, (sx * 0.03, 0.592, 0.53), (0.016, 0.014, 0.012), GREEN))
    p += tube('tail', [(0, -0.15, 0.31, 0.10), (0, -0.33, 0.31, 0.074), (0, -0.51, 0.29, 0.048), (0, -0.68, 0.27, 0.022)], GREEN)
    # chunky plates along the neck, head and tail: orange toy spikes (the saddle covers mid-back)
    for i, (y, z, h) in enumerate([(0.24, 0.45, 0.038), (0.31, 0.52, 0.036), (0.40, 0.625, 0.03),
                                   (-0.17, 0.43, 0.045), (-0.29, 0.405, 0.042), (-0.41, 0.375, 0.036), (-0.52, 0.345, 0.03), (-0.61, 0.315, 0.022)]):
        p.append(ellipsoid(f'plate_{i}', (0, y, z), (0.013, h * 0.85, h), ORANGE))

    def leg(s, sx):
        q = tube('thigh_' + s, [(sx * 0.115, -0.035, 0.285, 0.082), (sx * 0.122, 0.035, 0.19, 0.068), (sx * 0.125, 0.05, 0.15, 0.052)], GREEN)
        q += tube('shin_' + s, [(sx * 0.125, 0.05, 0.15, 0.048), (sx * 0.125, -0.01, 0.06, 0.034)], GREEN)
        q.append(ellipsoid('foot_' + s, (sx * 0.125, 0.045, 0.03), (0.058, 0.10, 0.03), GREEN))
        for k, dx in enumerate((-0.033, 0, 0.033)):
            q.append(ellipsoid(f'toe_{s}{k}', (sx * 0.125 + dx, 0.13 - abs(dx) * 0.6, 0.026), (0.022, 0.03, 0.024), GREEN))
        q += tube('arm_' + s, [(sx * 0.105, 0.20, 0.33, 0.032), (sx * 0.13, 0.25, 0.28, 0.024), (sx * 0.135, 0.268, 0.255, 0.024)], GREEN)
        return q
    p += flat(mirror(leg))
    return p


def rigid_parts():
    """(object, bone) pairs weighted 100% to one bone."""
    r = []
    for s, sx in (('L', 1), ('R', -1)):
        eye = Vector((sx * 0.075, 0.445, 0.585))
        r.append((ellipsoid('eye_' + s, eye, (0.046, 0.046, 0.046), CREAM, seg=18, rings=10), 'head'))
        look = Vector((sx * 0.55, 0.75, 0.25)).normalized()
        r.append((ellipsoid('pupil_' + s, eye + look * 0.032, (0.023, 0.023, 0.023), BLACK, seg=12, rings=6), 'head'))
        for k, dx in enumerate((-0.033, 0, 0.033)):
            base = (sx * 0.125 + dx, 0.15 - abs(dx) * 0.6, 0.022)
            r.append((cone(f'claw_{s}{k}', base, (base[0], base[1] + 0.03, 0.008), 0.011, ORANGE), 'foot_' + s))
        r.append((ellipsoid('flap_' + s, (sx * 0.138, 0.0, 0.355), (0.012, 0.085, 0.06), BROWN, seg=16, rings=8), 'spine_01'))
        r.append((box('strap_' + s, (sx * 0.15, 0.0, 0.27), (0.008, 0.016, 0.07), BROWN), 'spine_01'))
        r.append((torus('stirrup_' + s, (sx * 0.152, 0.0, 0.225), 0.02, 0.0055, ORANGE), 'spine_01'))
    r.append((ellipsoid('jaw', (0, 0.465, 0.445), (0.088, 0.125, 0.034), GREEN, pitch=0.05), 'jaw'))
    r.append((ellipsoid('tongue', (0, 0.45, 0.468), (0.058, 0.085, 0.014), ORANGE, seg=16, rings=8), 'jaw'))
    for s, sx in (('L', 1), ('R', -1)):  # two goofy buck teeth
        r.append((cone('tooth_' + s, (sx * 0.022, 0.585, 0.455), (sx * 0.022, 0.588, 0.418), 0.012, CREAM, verts=6), 'head'))
    # western saddle: seat, cantle, horn
    r.append((ellipsoid('saddle_seat', (0, 0.0, 0.425), (0.088, 0.115, 0.026), BROWN, pitch=0.1), 'spine_01'))
    r.append((ellipsoid('saddle_cantle', (0, -0.095, 0.442), (0.078, 0.026, 0.036), BROWN), 'spine_01'))
    r.append((cone('saddle_horn', (0, 0.10, 0.43), (0, 0.112, 0.482), 0.014, BROWN, verts=8), 'spine_01'))
    r.append((ellipsoid('saddle_knob', (0, 0.113, 0.486), (0.021, 0.021, 0.013), ORANGE, seg=12, rings=6), 'spine_01'))
    return r


DINO_BONES = [  # name, head, tail, parent, deform
    ('root', (0, 0, 0), (0, 0.12, 0), None, False),
    ('spine_01', (0, -0.06, 0.30), (0, 0.10, 0.33), 'root', True),
    ('spine_02', (0, 0.10, 0.33), (0, 0.22, 0.37), 'spine_01', True),
    ('neck', (0, 0.22, 0.37), (0, 0.33, 0.47), 'spine_02', True),
    ('head', (0, 0.33, 0.47), (0, 0.58, 0.52), 'neck', True),
    ('jaw', (0, 0.36, 0.462), (0, 0.585, 0.44), 'head', True),
    ('tail_01', (0, -0.12, 0.31), (0, -0.32, 0.31), 'spine_01', True),
    ('tail_02', (0, -0.32, 0.31), (0, -0.50, 0.29), 'tail_01', True),
    ('tail_03', (0, -0.50, 0.29), (0, -0.70, 0.27), 'tail_02', True),
]
for _s, _x in (('L', 1), ('R', -1)):
    DINO_BONES += [
        ('thigh_' + _s, (_x * 0.12, -0.03, 0.28), (_x * 0.125, 0.05, 0.15), 'spine_01', True),
        ('shin_' + _s, (_x * 0.125, 0.05, 0.15), (_x * 0.125, -0.01, 0.055), 'thigh_' + _s, True),
        ('foot_' + _s, (_x * 0.125, -0.01, 0.055), (_x * 0.125, 0.14, 0.02), 'shin_' + _s, True),
        ('arm_' + _s, (_x * 0.11, 0.20, 0.33), (_x * 0.135, 0.268, 0.255), 'spine_02', True),
    ]
DINO_CONNECTED = {'spine_02', 'neck', 'head', 'tail_02', 'tail_03', 'shin_L', 'shin_R', 'foot_L', 'foot_R'}


# ---------------------------------------------------------------- species builder (data -> parts + bones)
def X(p, sx):
    return (p[0] * sx, *p[1:])


def species_soft(spec):
    """Soft primitives from data, plus legs generated from the stance."""
    p = []
    for e in spec['soft']:
        kind, name = e[0], e[1]
        for sx, sfx in ((1, '_L'), (-1, '_R')) if e[-1] == 'mirror' else ((1, ''),):
            if kind == 'e': p.append(ellipsoid(name + sfx, X(e[2], sx), e[3], e[4], pitch=e[5] if len(e) > 5 and e[5] != 'mirror' else 0.0))
            elif kind == 't': p += tube(name + sfx, [X(q, sx) for q in e[2]], e[3])
    for chain in ('hind', 'front'):
        L = spec['legs'].get(chain)
        if not L or L.get('rigid'): continue
        for s, sx in (('L', 1), ('R', -1)):
            x = L['x'] * sx; (r0, r1, r2) = L['r']
            p += tube(f'{chain}_upper_{s}', [(x, *L['top'], r0), (x, *L['mid'], r1)], BODY)
            p += tube(f'{chain}_lower_{s}', [(x, *L['mid'], r1 * 0.95), (x, *L['ankle'], r2)], BODY)
            fy, fz, frx, fry, frz = L['foot']
            p.append(ellipsoid(f'{chain}_foot_{s}', (x, L['ankle'][0] + fy, fz), (frx, fry, frz), BODY))
            for k in range(L.get('toes', 3)):
                dx = (k - (L.get('toes', 3) - 1) / 2) * frx * 0.62
                p.append(ellipsoid(f'{chain}_toe_{s}{k}', (x + dx, L['ankle'][0] + fy + fry * 0.85 - abs(dx) * 0.5, frz * 0.85), (frx * 0.38, frx * 0.5, frz * 0.8), BODY))
    if spec.get('arms'):
        A = spec['arms']
        for s, sx in (('L', 1), ('R', -1)):
            p += tube('arm_' + s, [X(A['base'], sx) + (A['r'][0],), X(A['end'], sx) + (A['r'][1],)], BODY)
    return p


def saddle_parts(y, top, s, flank_x, flap_z):
    """The western saddle, scaled: seat top at `top`, flaps hanging on the flanks."""
    r = [(ellipsoid('saddle_seat', (0, y, top - 0.026 * s), (0.088 * s, 0.115 * s, 0.026 * s), BROWN, pitch=0.1), 'spine_01'),
         (ellipsoid('saddle_cantle', (0, y - 0.095 * s, top - 0.009 * s), (0.078 * s, 0.026 * s, 0.036 * s), BROWN), 'spine_01'),
         (cone('saddle_horn', (0, y + 0.10 * s, top - 0.021 * s), (0, y + 0.112 * s, top + 0.031 * s), 0.014 * s, BROWN, verts=8), 'spine_01'),
         (ellipsoid('saddle_knob', (0, y + 0.113 * s, top + 0.035 * s), (0.021 * s, 0.021 * s, 0.013 * s), ORANGE, seg=12, rings=6), 'spine_01')]
    for side, sx in (('L', 1), ('R', -1)):
        r += [(ellipsoid('flap_' + side, (sx * (flank_x + 0.011), y, flap_z), (0.012, 0.085 * s, 0.06 * s), BROWN, seg=16, rings=8), 'spine_01'),
              (box('strap_' + side, (sx * (flank_x + 0.023), y, flap_z - 0.085 * s), (0.008, 0.016 * s, 0.07 * s), BROWN), 'spine_01'),
              (torus('stirrup_' + side, (sx * (flank_x + 0.025), y, flap_z - 0.13 * s), 0.02 * s, 0.0055 * s, ORANGE), 'spine_01')]
    return r


def species_rigid(spec):
    r = []
    for e in spec['rigid']:
        kind, name = e[0], e[1]
        for sx, sfx in ((1, '_L'), (-1, '_R')) if e[-1] == 'mirror' else ((1, ''),):
            bone = e[-2] if e[-1] == 'mirror' else e[-1]
            bone = bone.replace('_X', sfx) if sfx else bone
            if kind == 'e':  # small parts get fewer facets: the tri budget is mostly the skin
                big = max(e[3]) >= 0.05
                r.append((ellipsoid(name + sfx, X(e[2], sx), e[3], e[4], pitch=e[5], seg=16 if big else 10, rings=9 if big else 6), bone))
            elif kind == 'c': r.append((cone(name + sfx, X(e[2], sx), X(e[3], sx), e[4], e[5], r2=e[6]), bone))
    E = spec['eyes']
    for s, sx in (('L', 1), ('R', -1)):
        eye = Vector(X(E['c'], sx))
        r.append((ellipsoid('eye_' + s, eye, (E['r'],) * 3, CREAM, seg=16, rings=9), 'head'))
        look = Vector((sx * 0.55, 0.75, 0.25)).normalized()
        r.append((ellipsoid('pupil_' + s, eye + look * E['r'] * 0.7, (E['r'] * 0.5,) * 3, BLACK, seg=10, rings=6), 'head'))
    for chain, bone in (('hind', 'foot'), ('front', 'hand')):  # claws/nails at the front of each foot
        L = spec['legs'].get(chain)
        if not L or L.get('rigid') or not L.get('nail'): continue
        fy, fz, frx, fry, frz = L['foot']
        for s, sx in (('L', 1), ('R', -1)):
            for k in range(L.get('toes', 3)):
                dx = (k - (L.get('toes', 3) - 1) / 2) * frx * 0.62
                base = (sx * L['x'] + dx, L['ankle'][0] + fy + fry * 1.1 - abs(dx) * 0.5, frz * 0.7)
                r.append((cone(f'{chain}_nail_{s}{k}', base, (base[0], base[1] + frx * 0.45, frz * 0.25), frx * 0.2, L['nail']), f'{bone}_{s}'))
    S = spec['saddle']
    r += saddle_parts(S['y'], S['top'], S['scale'], S['flank_x'], S['flap_z'])
    r += spec.get('extra_rigid', lambda: [])()
    return r


def species_bones(spec):
    B = spec['bones']; bones = [('root', (0, 0, 0), (0, 0.12, 0), None, False)]
    for name, h, t, parent in B:
        bones.append((name, h, t, parent, True))
    for chain, names, parent in (('hind', ('thigh', 'shin', 'foot'), 'spine_01'), ('front', ('arm', 'forearm', 'hand'), 'spine_02')):
        L = spec['legs'].get(chain)
        if not L: continue
        for s, sx in (('L', 1), ('R', -1)):
            x = L['x'] * sx; pts = [(x, *L['top']), (x, *L['mid']), (x, *L['ankle']), (x, *L['toe'])]
            bones += [(names[0] + '_' + s, pts[0], pts[1], parent, True), (names[1] + '_' + s, pts[1], pts[2], names[0] + '_' + s, True),
                      (names[2] + '_' + s, pts[2], pts[3], names[1] + '_' + s, True)]
    if spec.get('arms'):
        A = spec['arms']
        for s, sx in (('L', 1), ('R', -1)): bones.append(('arm_' + s, X(A['base'], sx), X(A['end'], sx), 'spine_02', True))
    for s, sx in (('L', 1), ('R', -1)):
        for name, h, t, parent in spec.get('wing_bones', []):
            bones.append((name + '_' + s, X(h, sx), X(t, sx), (parent + '_' + s) if parent.startswith('wing') else parent, True))
    return bones


# ---------------------------------------------------------------- build
def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.actions, bpy.data.cameras, bpy.data.lights, bpy.data.curves):
        for d in list(coll): coll.remove(d)
    s = bpy.context.scene; s.render.fps = FPS; s.render.fps_base = 1; s.unit_settings.system = 'METRIC'


def evaluated_copy(obj, name):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=False, depsgraph=dg)
    me.name = name; return me


def apply_transform(obj):
    # Built from loc/rot/scale directly: matrix_world is stale until a depsgraph update.
    obj.data.transform(Matrix.LocRotScale(obj.location, obj.rotation_euler, obj.scale))
    obj.location = (0, 0, 0); obj.rotation_euler = (0, 0, 0); obj.scale = (1, 1, 1)


def build_skin(mats, spec):
    parts = spec['soft_fn']()
    bpy.context.view_layer.update()
    trees = []
    for o in parts:
        apply_transform(o)
        bm = bmesh.new(); bm.from_mesh(o.data); trees.append((BVHTree.FromBMesh(bm), o['mat'])); bm.free()
    # union: join every primitive into one object, then voxel-remesh it into a single manifold skin
    node = spec['node']
    union = bpy.data.objects.new(node + 'Union', bpy.data.meshes.new(node + 'Union')); link(union)
    bm = bmesh.new()
    for o in parts: bm.from_mesh(o.data)
    bm.to_mesh(union.data); bm.free()
    for o in parts: bpy.data.objects.remove(o, do_unlink=True)
    rm = union.modifiers.new('voxel', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = spec['voxel']; rm.adaptivity = 0
    remeshed = evaluated_copy(union, node + 'Remesh'); union.modifiers.clear(); union.data = remeshed
    tris = sum(len(p.vertices) - 2 for p in remeshed.polygons)
    dec = union.modifiers.new('decimate', 'DECIMATE'); dec.decimate_type = 'COLLAPSE'; dec.ratio = min(1.0, spec['body_tris'] / max(tris, 1))
    skin = evaluated_copy(union, node + 'Skin'); union.modifiers.clear(); union.data = skin; union.name = node + 'Mesh'
    for m in mats: skin.materials.append(m)
    for poly in skin.polygons:  # colour each face from the nearest source primitive
        best, idx = 1e9, GREEN
        for tree, mat in trees:
            hit = tree.find_nearest(poly.center)
            if hit[0] is not None and hit[3] < best: best, idx = hit[3], mat
        poly.material_index = idx; poly.use_smooth = True
    return union, tris


def build_armature(spec):
    data = bpy.data.armatures.new(spec['node'] + 'Rig'); arm = link(bpy.data.objects.new(spec['node'], data))
    bpy.context.view_layer.objects.active = arm; arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for name, h, t, parent, deform in spec['bone_list']:
        b = data.edit_bones.new(name); b.head = h; b.tail = t; b.roll = 0; b.use_deform = deform
        if parent: b.parent = data.edit_bones[parent]; b.use_connect = name in spec.get('connected', ())
    bpy.ops.object.mode_set(mode='OBJECT')
    data.display_type = 'STICK'
    for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'
    return arm


def skin_to(arm, mesh, exclude=()):
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    saved = {}
    for name in exclude:  # bones that drive rigid-only parts must not pull the soft skin
        b = arm.data.bones.get(name)
        if b: saved[name] = b.use_deform; b.use_deform = False
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    for name, v in saved.items(): arm.data.bones[name].use_deform = v
    deform = [b for b in arm.data.bones if b.use_deform and b.name not in exclude]
    missing = [v.index for v in mesh.data.vertices if sum(g.weight for g in v.groups) < 1e-4]
    if missing:  # heat weighting can fail on some islands: fall back to nearest bone segment
        for name in {b.name for b in deform} - {g.name for g in mesh.vertex_groups}: mesh.vertex_groups.new(name=name)
        for vi in missing:
            co = mesh.data.vertices[vi].co; best = min(deform, key=lambda b: seg_dist(co, b.head_local, b.tail_local))
            mesh.vertex_groups[best.name].add([vi], 1.0, 'REPLACE')
    limit_and_normalise(mesh, 4)
    return len(missing)


def seg_dist(p, a, b):
    ab = b - a; s = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); return (a + ab * s - p).length


def limit_and_normalise(mesh, n):
    names = {g.index: g.name for g in mesh.vertex_groups}
    for v in mesh.data.vertices:
        ws = sorted(((g.weight, g.group) for g in v.groups if g.weight > 1e-4), reverse=True)
        keep = ws[:n]; total = sum(w for w, _ in keep) or 1
        for _, gi in ws[n:]: mesh.vertex_groups[names[gi]].remove([v.index])
        for w, gi in keep: mesh.vertex_groups[names[gi]].add([v.index], w / total, 'REPLACE')


def attach_rigid(arm, mesh, mats, spec):
    objs = []
    for obj, bone in spec['rigid_fn']():
        apply_transform(obj)
        obj.data.materials.clear()
        for m in mats: obj.data.materials.append(m)
        for p in obj.data.polygons:
            if 'mat' in obj: p.material_index = obj['mat']
            p.use_smooth = True
        if bone is not None:  # None: the part already carries its own vertex groups (wing membranes)
            g = obj.vertex_groups.new(name=bone); g.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
        objs.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    mesh.select_set(True); bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.join()
    return mesh


def empty(name, arm, bone, at):
    e = link(bpy.data.objects.new(name, None)); e.empty_display_type = 'ARROWS'; e.empty_display_size = 0.06
    e.parent = arm; e.parent_type = 'BONE'; e.parent_bone = bone
    bpy.context.view_layer.update(); e.matrix_world = Matrix.Translation(at)
    return e


# ---------------------------------------------------------------- animation
def rx(a): return Quaternion((1, 0, 0), a)
def ry(a): return Quaternion((0, 1, 0), a)
def rz(a): return Quaternion((0, 0, 1), a)
def smooth(s): return s * s * (3 - 2 * s)
def ramp(u, a, b): return smooth(min(1.0, max(0.0, (u - a) / (b - a))))


def catmull(keys, f):
    """Catmull-Rom through [(frame, value)...], clamped at the ends."""
    if f <= keys[0][0]: return keys[0][1]
    if f >= keys[-1][0]: return keys[-1][1]
    for i in range(len(keys) - 1):
        (f1, v1), (f2, v2) = keys[i], keys[i + 1]
        if f1 <= f <= f2:
            f0, v0 = keys[i - 1] if i > 0 else (2 * f1 - f2, v1)
            f3, v3 = keys[i + 2] if i + 2 < len(keys) else (2 * f2 - f1, v2)
            t = (f - f1) / (f2 - f1); m1 = (v2 - v0) / (f2 - f0) * (f2 - f1); m2 = (v3 - v1) / (f3 - f1) * (f2 - f1)
            t2, t3 = t * t, t * t * t
            return (2 * t3 - 3 * t2 + 1) * v1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * v2 + (t3 - t2) * m2


CHAINS = (('L', ('thigh_L', 'shin_L', 'foot_L')), ('R', ('thigh_R', 'shin_R', 'foot_R')),
          ('FL', ('arm_L', 'forearm_L', 'hand_L')), ('FR', ('arm_R', 'forearm_R', 'hand_R')))
SCALED = ('wing_shoulder_L', 'wing_shoulder_R', 'arm_L', 'arm_R')  # keyed scale: folded wing / hidden walking arm


class Rig:
    """Pose writer. Legs are sagittal two-bone IK chains (hind: thigh/shin/foot on spine_01; front:
    arm/forearm/hand on spine_02); the knee bends the way it does at rest."""

    def __init__(self, arm):
        self.arm = arm; self.prev = {}
        b = {x.name: x for x in arm.data.bones}; self.b = b
        yz = lambda v: (v.y, v.z)
        d = lambda p, q: math.hypot(q[0] - p[0], q[1] - p[1]); ang = lambda p, q: math.atan2(q[1] - p[1], q[0] - p[0])
        self.P = yz(b['spine_01'].head_local); self.C = yz(b['spine_02'].head_local)
        self.chains = {}
        for key, (u, m, e) in CHAINS:
            if m not in b: continue
            H0, K0, A0, T0 = yz(b[u].head_local), yz(b[m].head_local), yz(b[e].head_local), yz(b[e].tail_local)
            phi0, th0 = ang(H0, A0), ang(H0, K0)
            self.chains[key] = dict(bones=(u, m, e), parent=b[u].parent.name, H0=H0, A0=A0, a=d(H0, K0), b=d(K0, A0), rest_d=d(H0, A0),
                                    thigh0=th0, shin0=ang(K0, A0), knee=1 if math.sin(th0 - phi0) > 0 else -1)
        self.biped_arms = 'forearm_L' not in b and 'arm_L' in b
        self.wings = 'wing_shoulder_L' in b
        # legacy names used by the dino's jump
        self.A0 = self.chains['L']['A0']

    @staticmethod
    def rot(p, ang, about):
        y, z = p[0] - about[0], p[1] - about[1]
        return (about[0] + y * math.cos(ang) - z * math.sin(ang), about[1] + y * math.sin(ang) + z * math.cos(ang))

    def base(self, ch, dy, dz, p, c):
        """Posed position of a chain's root joint and the pitch of its parent frame."""
        if ch['parent'] == 'spine_01':
            q = self.rot(ch['H0'], p, self.P); return (q[0] + dy, q[1] + dz), p
        C = self.rot(self.C, p, self.P); C = (C[0] + dy, C[1] + dz)
        off = self.rot(ch['H0'], p + c, self.C)
        return (C[0] + off[0] - self.C[0], C[1] + off[1] - self.C[1]), p + c

    def hip(self, dy, dz, p):
        return self.base(self.chains['L'], dy, dz, p, 0)[0]

    def leg_ik(self, ch, H, A, toe, parent_pitch):
        dy, dz = A[0] - H[0], A[1] - H[1]; a, b = ch['a'], ch['b']
        d = min(max(math.hypot(dy, dz), abs(a - b) + 1e-4), a + b - 1e-4)
        phi = math.atan2(dz, dy); alpha = math.acos((a ** 2 + d * d - b ** 2) / (2 * a * d))
        th = phi + ch['knee'] * alpha; K = (H[0] + a * math.cos(th), H[1] + a * math.sin(th))
        Ad = (H[0] + d * math.cos(phi), H[1] + d * math.sin(phi)); sh = math.atan2(Ad[1] - K[1], Ad[0] - K[0])
        wt, ws = th - ch['thigh0'], sh - ch['shin0']
        return wt - parent_pitch, ws - wt, toe - ws

    def set(self, name, q=Quaternion(), loc=None, scale=None):
        pb = self.arm.pose.bones[name]; R = pb.bone.matrix_local.to_3x3(); Ri = R.inverted()
        local = (Ri @ q.to_matrix() @ R).to_quaternion()
        if name in self.prev and self.prev[name].dot(local) < 0: local.negate()
        self.prev[name] = local.copy(); pb.rotation_quaternion = local
        if loc is not None: pb.location = Ri @ Vector(loc)
        if scale is not None: pb.scale = (scale, scale, scale)

    def pose(self, f, P):
        p = P.get('pitch', 0); c = P.get('chest', 0); dy, dz = P.get('dy', 0), P.get('dz', 0)
        self.set('root')
        self.set('spine_01', rz(P.get('yaw', 0)) @ ry(P.get('roll', 0)) @ rx(p), (0, dy, dz))
        self.set('spine_02', rz(P.get('chest_yaw', 0)) @ rx(c))
        if 'neck_02' in self.b:
            self.set('neck', rz(P.get('neck_yaw', 0)) @ rx(P.get('neck', 0)))
            self.set('neck_02', rz(P.get('neck_yaw', 0) * 0.8) @ rx(P.get('neck2', P.get('neck', 0))))
        else:
            self.set('neck', rx(P.get('neck', 0)))
        self.set('head', rz(P.get('head_yaw', 0)) @ rx(P.get('head', 0)))
        self.set('jaw', rx(-P.get('jaw', 0)))
        for i, (tp, ty) in enumerate(P.get('tail', [(0, 0)] * 3)): self.set(f'tail_0{i + 1}', rz(ty) @ rx(tp))
        for key, ch in self.chains.items():
            H, pp = self.base(ch, dy, dz, p, c)
            ay, az = P.get('ankle_' + key, (0, 0))
            t, sh, ft = self.leg_ik(ch, H, (ch['A0'][0] + ay, ch['A0'][1] + az), P.get('toe_' + key, 0), pp)
            u, m, e = ch['bones']
            self.set(u, rx(t), scale=P.get('arm_scale', 1.0) if u.startswith('arm_') else None)
            self.set(m, rx(sh)); self.set(e, rx(ft))
        if self.biped_arms:
            for s in ('L', 'R'): self.set('arm_' + s, rx(P.get('arm_' + s, 0)))
        if self.wings:
            W = P.get('wing', {}); scale = P.get('wing_scale', 0.01)
            for s, sg in (('L', 1), ('R', -1)):
                up = W.get('up', 0) + sg * W.get('bank', 0)
                self.set('wing_shoulder_' + s, rz(sg * W.get('sweep', 0)) @ ry(-sg * up), scale=scale)
                self.set('wing_elbow_' + s, ry(-sg * W.get('elbow', 0)) @ rz(sg * W.get('elbow_sweep', 0)))
                self.set('wing_wrist_' + s, ry(-sg * W.get('wrist', 0)))
                self.set('wing_finger_01_' + s, ry(-sg * W.get('finger', 0)) @ rz(sg * W.get('finger_sweep', 0)))
                self.set('wing_finger_02_' + s, ry(-sg * W.get('finger', 0) * 0.7))
        for pb in self.arm.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=f, group=pb.name)
            if pb.name == 'spine_01': pb.keyframe_insert('location', frame=f, group=pb.name)
            if pb.name in SCALED and (self.wings or pb.name.startswith('wing')): pb.keyframe_insert('scale', frame=f, group=pb.name)


def gait_foot(u, duty, stride, lift, toe_amp):
    u %= 1.0
    if u < duty: return (stride / 2 - stride * u / duty, 0.0), 0.0
    s = (u - duty) / (1 - duty)
    return (-stride / 2 + stride * smooth(s), lift * math.sin(math.pi * s)), -toe_amp * math.sin(2 * math.pi * s)


# ---- dino clips (the defaults reproduce the shipped dino exactly; the raptor passes its own numbers)
def idle(t):
    b = math.sin(TAU * t)
    return dict(dz=-0.004 + 0.004 * b, chest=0.03 * b, neck=0.03 * math.sin(TAU * t + 0.6), head=0.04 * math.sin(2 * TAU * t),
                head_yaw=0.16 * math.sin(TAU * t), jaw=0.03 + 0.03 * math.sin(2 * TAU * t + 1.0),
                tail=[(0.02 * math.sin(TAU * t + i), 0.16 * math.sin(TAU * t - 0.6 * i)) for i in range(3)],
                arm_L=0.12 * math.sin(2 * TAU * t), arm_R=0.12 * math.sin(2 * TAU * t + 1.4))


def walk(t, S=0.18, D=0.6, Hh=0.05, k=1.0):
    aL, toeL = gait_foot(t, D, S, Hh, 0.22); aR, toeR = gait_foot(t + 0.5, D, S, Hh, 0.22)
    c2 = math.cos(2 * TAU * (t - 0.3))
    return dict(dz=k * (-0.008 + 0.008 * c2), roll=0.05 * math.cos(TAU * (t - 0.3)), yaw=0.07 * math.cos(TAU * t), pitch=0.0,
                chest_yaw=-0.04 * math.cos(TAU * t), neck=0.03 * c2, head=-0.05 * c2, head_yaw=-0.04 * math.cos(TAU * t),
                jaw=0.05 + 0.03 * math.sin(2 * TAU * t),
                tail=[(0.03 * math.sin(2 * TAU * t - i), -0.13 * math.cos(TAU * t - 0.7 * (i + 1))) for i in range(3)],
                ankle_L=aL, ankle_R=aR, toe_L=toeL, toe_R=toeR, arm_L=-0.35 * math.cos(TAU * t), arm_R=0.35 * math.cos(TAU * t))


def run(t, S=0.2, D=0.4, Hh=0.10, k=1.0):
    aL, toeL = gait_foot(t, D, S, Hh, 0.35); aR, toeR = gait_foot(t + 0.5, D, S, Hh, 0.35)
    c2 = math.cos(2 * TAU * (t - 0.2))
    return dict(dz=k * (-0.012 - 0.026 * c2), pitch=-0.14 + 0.05 * c2, chest=-0.04, neck=0.16 - 0.06 * c2, head=0.06 + 0.08 * math.cos(2 * TAU * (t - 0.2) + 0.8),
                yaw=0.05 * math.cos(TAU * t), jaw=0.28 + 0.08 * math.sin(2 * TAU * t),
                tail=[(0.14 + 0.08 * math.cos(2 * TAU * (t - 0.2) + 0.9 + 0.5 * i), -0.1 * math.cos(TAU * t - 0.7 * (i + 1))) for i in range(3)],
                ankle_L=aL, ankle_R=aR, toe_L=toeL, toe_R=toeR,
                arm_L=0.35 + 0.55 * math.sin(TAU * t), arm_R=0.35 - 0.55 * math.sin(TAU * t))


GALLOP_DUTY, GALLOP_STRIDE, GALLOP_LAG = 0.15, 0.30, 0.08  # dino: per-foot ground contact share, stance travel (m), R-foot lag


def gallop_pelvis(u, duty=GALLOP_DUTY, lag=GALLOP_LAG, rise=0.15, k=1.0):
    """Bounding body: a short low stance (both feet, slightly staggered), then a long flight arc."""
    u %= 1.0; land = duty + lag
    if u < land: return k * (-0.03 - 0.012 * math.sin(math.pi * u / land))
    return k * -0.03 + rise * math.sin(math.pi * (u - land) / (1 - land))


def gallop_foot(u, body_dz, duty=GALLOP_DUTY, stride=GALLOP_STRIDE, tuck=0.06):
    """Stance: ankle sweeps back at ground speed. Swing: tuck under the rising body, then reach forward to land."""
    u %= 1.0
    if u < duty: return (stride / 2 - stride * u / duty, 0.0), 0.0
    s = (u - duty) / (1 - duty)
    y = -stride / 2 + stride * smooth(s) - tuck * math.sin(math.pi * s)  # kick back, then reach
    z = max(0.0, body_dz + 0.03) * math.sin(math.pi * s) ** 0.5 + tuck * math.sin(math.pi * s)
    return (y, z), -0.5 * math.sin(math.pi * s) * (1 - s) + 0.25 * math.sin(math.pi * s) * s


def gallop(t, duty=GALLOP_DUTY, stride=GALLOP_STRIDE, lag=GALLOP_LAG, rise=0.15, tuck=0.06, k=1.0):
    dz = gallop_pelvis(t, duty, lag, rise, k)
    aL, toeL = gallop_foot(t, dz, duty, stride, tuck); aR, toeR = gallop_foot(t - lag, dz, duty, stride, tuck)
    w = TAU * t
    return dict(dz=dz, pitch=-0.08 + 0.12 * math.sin(w - TAU * 0.1), chest=-0.05, yaw=0.03 * math.sin(w),
                neck=0.12 - 0.12 * math.sin(w - TAU * 0.3), head=0.10 + 0.16 * math.sin(w - TAU * 0.35),
                jaw=0.42 + 0.1 * math.sin(2 * w),
                tail=[(0.05 - 0.10 * math.sin(w - TAU * 0.1 - 0.8 * (i + 1)), 0.05 * math.sin(w - 0.9 * i)) for i in range(3)],
                ankle_L=aL, ankle_R=aR, toe_L=toeL, toe_R=toeR,
                arm_L=-0.7 + 0.25 * math.sin(2 * w), arm_R=-0.7 + 0.25 * math.sin(2 * w + 1.2))


JUMP = dict(
    dz=[(0, 0), (5, -0.07), (8, 0.10), (12, 0.22), (16, 0.10), (18, 0.0), (20, -0.06), (24, 0)],
    pitch=[(0, 0), (5, -0.18), (8, 0.15), (12, 0.05), (17, -0.05), (20, -0.12), (24, 0)],
    reach=[(0, 0.226), (7, 0.255), (10, 0.20), (13, 0.17), (16, 0.21), (18, 0.24), (24, 0.226)],
    ay=[(0, 0), (8, -0.04), (12, 0.03), (17, 0.02), (24, 0)],
    toe=[(0, 0), (7, -0.3), (12, -0.2), (17, 0.1), (19, 0), (24, 0)],
    tail=[(0, 0), (5, -0.15), (9, 0.30), (14, 0.22), (19, -0.18), (24, 0)],
    neck=[(0, 0), (5, 0.12), (9, -0.10), (14, 0.05), (20, 0.14), (24, 0)],
    head=[(0, 0), (5, 0.06), (9, 0.12), (14, 0.0), (20, -0.06), (24, 0)],
    jaw=[(0, 0.03), (6, 0.0), (9, 0.45), (15, 0.45), (19, 0.1), (24, 0.03)],
    arm=[(0, 0), (5, -0.3), (9, 1.0), (15, 1.1), (19, -0.2), (24, 0)],
)


def jump_pose(rig, f, js=1.0, pitch_k=1.0):
    """f in 30 fps frames (0..24). Each leg stays planted until its hip rises past the reach curve,
    scaled to that leg's rest length (the dino's 0.226 m)."""
    k = {n: catmull(v, f) for n, v in JUMP.items()}
    dz, p = k['dz'] * js, k['pitch'] * pitch_k
    out = dict(dz=dz, pitch=p, neck=k['neck'], head=k['head'], jaw=k['jaw'], tail=[(k['tail'] * (1 + 0.3 * i), 0) for i in range(3)],
               arm_L=k['arm'], arm_R=k['arm'] * 0.9)
    for key, ch in rig.chains.items():
        H, _ = rig.base(ch, 0, dz, p, 0)
        az = max(0.0, H[1] - k['reach'] / 0.226 * ch['rest_d'] - ch['A0'][1])
        grounded = az <= 1e-6
        out['ankle_' + key] = (0.0 if grounded else k['ay'] * js, az)
        out['toe_' + key] = 0.0 if grounded and f < 7 or grounded and f > 19 else k['toe']
    return out


# ---- quadruped clips
QUAD_PHASES = {'walk': (0.0, 0.5, 0.25, 0.75), 'trot': (0.0, 0.5, 0.5, 0.0)}


def quad_cycle(t, G, gait):
    """Walk (lateral sequence, 4-beat) and trot (diagonal pairs) for any four-legged kind."""
    g = G[gait]; S, D, lift, bob = g['S'], g['D'], g['lift'], g['bob']; st = G.get('style', {}).get(gait, {})
    out = {}
    for key, ph in zip(('L', 'R', 'FL', 'FR'), QUAD_PHASES[gait]):
        out['ankle_' + key], out['toe_' + key] = gait_foot(t - ph, D, S, lift, 0.2)
    w = TAU * t; m = TAU * 2 * (t - D / 2)
    out.update(dz=(-bob + bob * math.cos(m)) if gait == 'walk' else (-0.4 * bob - bob * math.cos(m)),
               pitch=st.get('pitch', 0) + 0.015 * math.sin(m), roll=g.get('roll', 0.03) * math.cos(w), yaw=g.get('yaw', 0.04) * math.cos(w),
               chest=0.0, neck=st.get('neck', 0) + g.get('neck_bob', 0.04) * math.sin(m + 0.8), neck2=st.get('neck', 0) + g.get('neck_bob', 0.04) * 0.8 * math.sin(m + 1.4),
               neck_yaw=g.get('neck_sway', 0.05) * math.sin(w), head=st.get('head', 0) - 0.04 * math.sin(m + 0.8), head_yaw=-0.04 * math.sin(w),
               jaw=st.get('jaw', 0.05) + 0.03 * math.sin(2 * w),
               tail=[(st.get('tail', 0.02) + 0.03 * math.sin(m - i), -g.get('tail_sway', 0.12) * math.cos(w - 0.7 * (i + 1))) for i in range(3)])
    return out


def quad_gallop(t, G):
    """Bound: hind pair then front pair, each a short stance, with flight phases between; rocking-horse pitch."""
    g = G['gallop']; S, D, lag, rise, tuck = g['S'], g['D'], g['lag'], g['rise'], g['tuck']; st = G.get('style', {}).get('gallop', {})
    dz = -0.02 + rise * (0.5 - 0.5 * math.cos(TAU * 2 * (t - D / 2 - lag / 2)))
    out = dict(dz=dz, pitch=st.get('pitch', 0) - g.get('rock', 0.08) * math.cos(TAU * (t - 0.25)), yaw=0.02 * math.sin(TAU * t),
               neck=st.get('neck', 0) - 0.10 * math.sin(TAU * t - 1.0), neck2=st.get('neck', 0) - 0.08 * math.sin(TAU * t - 1.6),
               head=st.get('head', 0) + 0.12 * math.sin(TAU * t - 0.6), jaw=st.get('jaw', 0.35) + 0.08 * math.sin(2 * TAU * t),
               tail=[(st.get('tail', 0.05) - 0.10 * math.sin(TAU * t - 0.8 * (i + 1)), 0.04 * math.sin(TAU * t - 0.9 * i)) for i in range(3)])
    for key, ph in zip(('L', 'R', 'FL', 'FR'), (0.0, lag, 0.5, 0.5 + lag)):
        out['ankle_' + key], out['toe_' + key] = gallop_foot(t - ph, dz, D, S, tuck)
    return out


def quad_idle(t, G):
    b = math.sin(TAU * t); st = G.get('style', {}).get('idle', {})
    return dict(dz=-0.004 + 0.004 * b, chest=0.02 * b, neck=st.get('neck', 0) + 0.04 * math.sin(TAU * t + 0.6), neck2=st.get('neck', 0) + 0.05 * math.sin(TAU * t + 1.2),
                neck_yaw=0.10 * math.sin(TAU * t), head=0.05 * math.sin(2 * TAU * t), head_yaw=0.18 * math.sin(TAU * t),
                jaw=0.03 + 0.03 * math.sin(2 * TAU * t + 1.0), tail=[(0.02 * math.sin(TAU * t + i), 0.16 * math.sin(TAU * t - 0.6 * i)) for i in range(3)])


# ---- flyer clips (quetzal). Flight clips hold the pelvis FLY_DZ above the root so the feet hang in the air.
FLY_DZ = 0.25


def flight_body(dz, legs_up=1.0):
    """Hind legs tucked back under the tail, neck stretched forward, head level."""
    return dict(dz=dz, pitch=-0.30, neck=-0.55, neck2=-0.35, head=1.2,
                ankle_L=(-0.10 * legs_up, dz + 0.14 * legs_up), ankle_R=(-0.10 * legs_up, dz + 0.14 * legs_up),
                toe_L=-0.9 * legs_up, toe_R=-0.9 * legs_up, ankle_FL=(0, dz), ankle_FR=(0, dz), arm_scale=0.01, wing_scale=1.0)


def flap(t):
    w = TAU * t
    out = flight_body(FLY_DZ + 0.035 * math.sin(w + 1.6))
    out.update(jaw=0.12, tail=[(0.05 * math.sin(w - i), 0) for i in range(3)],
               wing=dict(up=0.15 + 0.65 * math.sin(w), elbow=0.30 * math.sin(w - 0.9), wrist=0.15 * math.sin(w - 1.3),
                         finger=0.25 * math.sin(w - 1.6), sweep=0.10 * math.cos(w)))
    return out


def glide(t):
    w = TAU * t
    out = flight_body(FLY_DZ + 0.02 * math.sin(w))
    out.update(roll=0.06 * math.sin(w), head_yaw=0.15 * math.sin(w), neck_yaw=0.05 * math.sin(w), jaw=0.05,
               tail=[(0.03 * math.sin(w - i), 0.04 * math.sin(w - i)) for i in range(3)],
               wing=dict(up=0.06 + 0.03 * math.sin(w), bank=0.05 * math.sin(w), finger=0.05 + 0.03 * math.sin(w + 0.5)))
    return out


def ground_pose(rig, dz, pitch=0.0):
    """Every leg planted at rest (hips may dip); used by takeoff/land on the ground."""
    return {**{'ankle_' + k: (0.0, 0.0) for k in rig.chains}, 'dz': dz, 'pitch': pitch}


def blend(a, b, s):
    """Linear blend of two pose dicts (numbers, pairs, tail lists, wing dicts)."""
    out = {}
    for key in set(a) | set(b):
        va, vb = a.get(key), b.get(key)
        if va is None: va = vb if not isinstance(vb, (int, float)) else ({'arm_scale': 1.0, 'wing_scale': 0.01}.get(key, 0.0))
        if vb is None: vb = va if not isinstance(va, (int, float)) else ({'arm_scale': 1.0, 'wing_scale': 0.01}.get(key, 0.0))
        if isinstance(va, dict): out[key] = {k: va.get(k, 0) * (1 - s) + vb.get(k, 0) * s for k in set(va) | set(vb)}
        elif isinstance(va, (list, tuple)) and va and isinstance(va[0], (list, tuple)): out[key] = [tuple(x * (1 - s) + y * s for x, y in zip(p, q)) for p, q in zip(va, vb)]
        elif isinstance(va, (list, tuple)): out[key] = tuple(x * (1 - s) + y * s for x, y in zip(va, vb))
        else: out[key] = va * (1 - s) + vb * s
    return out


def takeoff(rig, u):
    """0.8 s: crouch, unfold, two big flaps, rise to flight height."""
    crouch = ground_pose(rig, -0.06, 0.12); crouch.update(neck=0.15, head=-0.2, jaw=0.2)
    if u < 0.25:
        return blend(ground_pose(rig, 0.0), crouch, smooth(u / 0.25))
    unfold = ramp(u, 0.25, 0.36); rise = ramp(u, 0.30, 1.0)
    flight = flight_body(FLY_DZ * rise - 0.06 * (1 - rise), legs_up=ramp(u, 0.55, 0.95))
    w = TAU * 2 * (u - 0.30) / 0.70  # two flaps
    flight.update(wing=dict(up=(0.2 + 0.75 * math.sin(w)) * unfold, elbow=0.3 * math.sin(w - 0.9), finger=0.3 * math.sin(w - 1.6)),
                  jaw=0.35, wing_scale=0.01 + 0.99 * unfold, arm_scale=1.0 - 0.99 * unfold)
    pose = blend(crouch, flight, ramp(u, 0.25, 0.45))
    pose['wing_scale'], pose['arm_scale'] = flight['wing_scale'], flight['arm_scale']
    for k in ('L', 'R'):  # hind feet stay planted; once the body rises past reach the IK lifts them straight-legged
        if u < 0.55: pose['ankle_' + k] = (0.0, 0.0)
    return pose


def land(rig, u):
    """0.8 s: flare and back-flap, legs reach, touch down at 0.6, fold the wings, settle."""
    w = TAU * 1.5 * u
    air = flight_body(FLY_DZ * (1 - ramp(u, 0.0, 0.62)), legs_up=1 - ramp(u, 0.15, 0.5))
    air.update(pitch=-0.30 + 0.45 * ramp(u, 0.1, 0.5), jaw=0.3, wing=dict(up=0.25 + 0.45 * math.sin(w), sweep=-0.25 * ramp(u, 0.2, 0.55), elbow=0.25 * math.sin(w - 0.9)))
    settle = ground_pose(rig, -0.05 * math.sin(math.pi * ramp(u, 0.6, 1.0)), 0.0); settle.update(neck=0.1 * (1 - ramp(u, 0.7, 1.0)))
    pose = blend(air, settle, ramp(u, 0.55, 0.85))
    fold = ramp(u, 0.68, 0.84)
    pose['wing_scale'], pose['arm_scale'] = 1.0 - 0.99 * fold, 0.01 + 0.99 * fold
    if u > 0.6:
        for k in rig.chains: pose['ankle_' + k] = (0.0, 0.0)
    return pose


# ---------------------------------------------------------------- species data
def biped_clips(G):
    return {
        'idle': (2.0, True, 0.0, lambda rig, u: idle(u)),
        'walk': (G['walk']['T'], True, G['walk']['S'] / (G['walk']['D'] * G['walk']['T']), lambda rig, u: walk(u, G['walk']['S'], G['walk']['D'], G['walk']['lift'], G['k'])),
        'run': (G['run']['T'], True, G['run']['S'] / (G['run']['D'] * G['run']['T']), lambda rig, u: run(u, G['run']['S'], G['run']['D'], G['run']['lift'], G['k'])),
        'jump': (0.8, False, 0.0, lambda rig, u: jump_pose(rig, u * 24, G['jump'])),
        'gallop': (G['gallop']['T'], True, G['gallop']['S'] / (G['gallop']['D'] * G['gallop']['T']),
                   lambda rig, u: gallop(u, G['gallop']['D'], G['gallop']['S'], G['gallop']['lag'], G['gallop']['rise'], G['gallop']['tuck'], G['k'])),
    }


def quad_clips(G):
    sp = lambda g: G[g]['S'] / (G[g]['D'] * G[g]['T'])
    return {
        'idle': (2.0, True, 0.0, lambda rig, u: quad_idle(u, G)),
        'walk': (G['walk']['T'], True, sp('walk'), lambda rig, u: quad_cycle(u, G, 'walk')),
        'run': (G['trot']['T'], True, sp('trot'), lambda rig, u: quad_cycle(u, G, 'trot')),
        'jump': (0.8, False, 0.0, lambda rig, u: jump_pose(rig, u * 24, G['jump'], 0.4)),
        'gallop': (G['gallop']['T'], True, sp('gallop'), lambda rig, u: quad_gallop(u, G)),
    }


def dino_clips():
    return {
        'idle': (2.0, True, 0.0, lambda rig, u: idle(u)),
        'walk': (1.0, True, round(0.18 / (0.6 * 1.0), 3), lambda rig, u: walk(u)),
        'run': (0.6, True, round(0.20 / (0.4 * 0.6), 3), lambda rig, u: run(u)),
        'jump': (0.8, False, 0.0, lambda rig, u: jump_pose(rig, u * 24)),
        'gallop': (0.5, True, round(GALLOP_STRIDE / (GALLOP_DUTY * 0.5), 3), lambda rig, u: gallop(u)),
    }


def S_(name, *a): return ('e', name, *a)


RAPTOR = dict(
    node='Raptor', voxel=0.005, body_tris=5200, cam=0.95, review_target=0.24,
    palette=palette('Raptor', (0.36, 0.14, 0.60), (0.93, 0.82, 0.58), (0.98, 0.72, 0.06)),
    soft=[('e', 'torso', (0, 0.0, 0.28), (0.075, 0.15, 0.07), BODY, 0.1), ('e', 'belly', (0, 0.02, 0.258), (0.06, 0.12, 0.052), BELLY, 0.12),
          ('e', 'hips', (0, -0.05, 0.28), (0.07, 0.08, 0.065), BODY, 0.0),
          ('t', 'neck', [(0, 0.12, 0.30, 0.045), (0, 0.16, 0.35, 0.037), (0, 0.19, 0.40, 0.033)], BODY),
          ('t', 'throat', [(0, 0.13, 0.28, 0.03), (0, 0.17, 0.35, 0.025)], BELLY),
          ('e', 'head', (0, 0.235, 0.415), (0.052, 0.075, 0.048), BODY, -0.05), ('e', 'snout', (0, 0.29, 0.40), (0.034, 0.058, 0.03), BODY, -0.05),
          ('e', 'brow', (0.03, 0.235, 0.447), (0.026, 0.03, 0.022), BODY, 0.0, 'mirror'),
          ('t', 'tail', [(0, -0.10, 0.28, 0.06), (0, -0.25, 0.29, 0.04), (0, -0.42, 0.29, 0.024), (0, -0.57, 0.29, 0.012)], BODY),
          ('e', 'stripe0', (0, -0.20, 0.288), (0.050, 0.02, 0.050), ACCENT, 0.0), ('e', 'stripe1', (0, -0.30, 0.29), (0.041, 0.019, 0.041), ACCENT, 0.0),
          ('e', 'stripe2', (0, -0.40, 0.29), (0.032, 0.017, 0.032), ACCENT, 0.0), ('e', 'stripe3', (0, -0.49, 0.29), (0.023, 0.015, 0.023), ACCENT, 0.0)],
    legs=dict(hind=dict(x=0.06, top=(-0.04, 0.25), mid=(0.03, 0.15), ankle=(-0.03, 0.05), toe=(0.07, 0.015), r=(0.05, 0.034, 0.02),
                        foot=(0.04, 0.017, 0.026, 0.05, 0.017), toes=2, nail=ACCENT)),
    arms=dict(base=(0.05, 0.12, 0.27), end=(0.065, 0.18, 0.22), r=(0.02, 0.014)),
    rigid=[('e', 'jaw', (0, 0.265, 0.378), (0.033, 0.065, 0.014), BODY, 0.05, 'jaw'), ('e', 'tongue', (0, 0.255, 0.388), (0.022, 0.045, 0.006), ACCENT, 0.0, 'jaw'),
           ('c', 'tooth_a', (0.022, 0.30, 0.388), (0.022, 0.302, 0.372), 0.005, BELLY, None, 'head', 'mirror'),
           ('c', 'tooth_b', (0.018, 0.325, 0.388), (0.018, 0.327, 0.374), 0.0045, BELLY, None, 'head', 'mirror'),
           ('c', 'crest_a', (0, 0.22, 0.455), (0, 0.15, 0.53), 0.016, ACCENT, 0.003, 'head'), ('c', 'crest_b', (0, 0.195, 0.45), (0, 0.11, 0.50), 0.014, ACCENT, 0.003, 'head'),
           ('c', 'crest_c', (0, 0.245, 0.458), (0, 0.205, 0.535), 0.013, ACCENT, 0.003, 'head'),
           ('c', 'crest_s', (0.02, 0.215, 0.45), (0.05, 0.15, 0.50), 0.011, ACCENT, 0.002, 'head', 'mirror'),
           ('c', 'sickle', (0.045, 0.012, 0.03), (0.045, 0.045, 0.065), 0.009, ACCENT, 0.001, 'foot_X', 'mirror'),
           ('c', 'arm_feather', (0.062, 0.15, 0.25), (0.085, 0.10, 0.20), 0.012, ACCENT, 0.002, 'arm_X', 'mirror'),
           ('c', 'tail_feather', (0, -0.55, 0.29), (0, -0.64, 0.30), 0.016, ACCENT, 0.003, 'tail_03')],
    eyes=dict(c=(0.036, 0.245, 0.44), r=0.024),
    saddle=dict(y=-0.01, top=0.352, scale=0.7, flank_x=0.074, flap_z=0.30),
    bones=[('spine_01', (0, -0.06, 0.27), (0, 0.07, 0.29), 'root'), ('spine_02', (0, 0.07, 0.29), (0, 0.14, 0.31), 'spine_01'),
           ('neck', (0, 0.14, 0.31), (0, 0.19, 0.40), 'spine_02'), ('head', (0, 0.19, 0.40), (0, 0.345, 0.40), 'neck'),
           ('jaw', (0, 0.20, 0.392), (0, 0.33, 0.375), 'head'),
           ('tail_01', (0, -0.08, 0.28), (0, -0.24, 0.29), 'spine_01'), ('tail_02', (0, -0.24, 0.29), (0, -0.40, 0.29), 'tail_01'),
           ('tail_03', (0, -0.40, 0.29), (0, -0.575, 0.29), 'tail_02')],
    mouth=(0, 0.345, 0.39),
    gaits=dict(k=0.7, jump=0.75, walk=dict(T=0.8, S=0.14, D=0.6, lift=0.035), run=dict(T=0.4, S=0.18, D=0.4, lift=0.07),
               gallop=dict(T=0.4, S=0.22, D=0.15, lag=0.06, rise=0.10, tuck=0.045)),
)

LONGNECK = dict(
    node='Longneck', voxel=0.009, body_tris=6200, cam=1.55, review_target=0.5,
    palette=palette('Longneck', (0.10, 0.40, 0.55), (0.93, 0.85, 0.62), (0.95, 0.40, 0.48)),
    soft=[('e', 'torso', (0, 0.0, 0.42), (0.20, 0.36, 0.17), BODY, 0.04), ('e', 'belly', (0, 0.02, 0.37), (0.165, 0.30, 0.135), BELLY, 0.04),
          ('e', 'hips', (0, -0.20, 0.42), (0.18, 0.16, 0.15), BODY, 0.0), ('e', 'shoulders', (0, 0.20, 0.43), (0.17, 0.15, 0.15), BODY, 0.0),
          ('t', 'neck', [(0, 0.26, 0.50, 0.115), (0, 0.40, 0.62, 0.085), (0, 0.53, 0.77, 0.068), (0, 0.64, 0.90, 0.058)], BODY),
          ('t', 'throat', [(0, 0.30, 0.46, 0.08), (0, 0.44, 0.59, 0.058), (0, 0.56, 0.75, 0.044)], BELLY),
          ('e', 'head', (0, 0.71, 0.95), (0.075, 0.10, 0.07), BODY, -0.1), ('e', 'snout', (0, 0.79, 0.93), (0.055, 0.06, 0.045), BODY, -0.1),
          ('e', 'brow', (0.04, 0.71, 1.0), (0.035, 0.035, 0.03), BODY, 0.0, 'mirror'),
          ('t', 'tail', [(0, -0.30, 0.43, 0.13), (0, -0.52, 0.39, 0.085), (0, -0.76, 0.33, 0.05), (0, -0.98, 0.26, 0.02)], BODY),
          ('e', 'spot_a', (0.18, -0.08, 0.48), (0.03, 0.06, 0.045), ACCENT, 0.0, 'mirror'), ('e', 'spot_b', (0.185, 0.12, 0.45), (0.03, 0.05, 0.04), ACCENT, 0.0, 'mirror'),
          ('e', 'spot_c', (0.17, -0.26, 0.40), (0.03, 0.04, 0.035), ACCENT, 0.0, 'mirror')]
         + [('e', f'bump{i}', (0, y, z), (0.022, 0.035, 0.03), ACCENT, 0.0) for i, (y, z) in enumerate(
             [(0.36, 0.625), (0.48, 0.735), (0.58, 0.85), (-0.42, 0.535), (-0.60, 0.47), (-0.78, 0.39), (-0.92, 0.32)])],
    legs=dict(hind=dict(x=0.15, top=(-0.20, 0.36), mid=(-0.14, 0.21), ankle=(-0.20, 0.06), toe=(-0.08, 0.02), r=(0.095, 0.08, 0.065),
                        foot=(0.02, 0.045, 0.07, 0.08, 0.05), toes=3, nail=BELLY),
              front=dict(x=0.15, top=(0.20, 0.36), mid=(0.14, 0.21), ankle=(0.20, 0.06), toe=(0.30, 0.02), r=(0.09, 0.075, 0.062),
                         foot=(0.02, 0.045, 0.065, 0.075, 0.048), toes=3, nail=BELLY)),
    rigid=[('e', 'jaw', (0, 0.76, 0.90), (0.05, 0.07, 0.02), BODY, 0.05, 'jaw'), ('e', 'tongue', (0, 0.75, 0.912), (0.032, 0.05, 0.008), ACCENT, 0.0, 'jaw')],
    eyes=dict(c=(0.056, 0.735, 0.985), r=0.032),
    saddle=dict(y=0.0, top=0.598, scale=1.15, flank_x=0.20, flap_z=0.50),
    bones=[('spine_01', (0, -0.22, 0.42), (0, 0.0, 0.44), 'root'), ('spine_02', (0, 0.0, 0.44), (0, 0.24, 0.47), 'spine_01'),
           ('neck', (0, 0.24, 0.47), (0, 0.46, 0.66), 'spine_02'), ('neck_02', (0, 0.46, 0.66), (0, 0.65, 0.90), 'neck'),
           ('head', (0, 0.65, 0.90), (0, 0.85, 0.95), 'neck_02'), ('jaw', (0, 0.68, 0.92), (0, 0.84, 0.90), 'head'),
           ('tail_01', (0, -0.30, 0.43), (0, -0.52, 0.39), 'spine_01'), ('tail_02', (0, -0.52, 0.39), (0, -0.76, 0.33), 'tail_01'),
           ('tail_03', (0, -0.76, 0.33), (0, -0.99, 0.26), 'tail_02')],
    mouth=(0, 0.85, 0.92),
    gaits=dict(jump=0.6, walk=dict(T=1.4, S=0.20, D=0.7, lift=0.05, bob=0.014, neck_bob=0.06, neck_sway=0.08, tail_sway=0.16),
               trot=dict(T=0.8, S=0.22, D=0.45, lift=0.07, bob=0.02, neck_bob=0.08),
               gallop=dict(T=0.6, S=0.24, D=0.2, lag=0.05, rise=0.07, tuck=0.06, rock=0.05),
               style=dict(gallop=dict(neck=-0.05, jaw=0.3))),
)

TRICERATOPS = dict(
    node='Triceratops', voxel=0.0075, body_tris=5600, cam=1.2, review_target=0.32,
    palette=palette('Triceratops', (0.82, 0.38, 0.08), (0.95, 0.86, 0.62), (0.13, 0.40, 0.78)),
    soft=[('e', 'torso', (0, -0.02, 0.31), (0.17, 0.30, 0.135), BODY, 0.0), ('e', 'belly', (0, 0.0, 0.275), (0.14, 0.25, 0.11), BELLY, 0.0),
          ('e', 'hips', (0, -0.20, 0.31), (0.15, 0.14, 0.12), BODY, 0.0), ('e', 'shoulders', (0, 0.16, 0.31), (0.15, 0.13, 0.12), BODY, 0.0),
          ('t', 'neck', [(0, 0.20, 0.32, 0.10), (0, 0.28, 0.33, 0.09)], BODY),
          ('e', 'head', (0, 0.40, 0.33), (0.12, 0.15, 0.11), BODY, -0.15), ('e', 'beak', (0, 0.54, 0.28), (0.075, 0.09, 0.07), BODY, -0.3),
          ('e', 'cheek', (0.09, 0.38, 0.30), (0.05, 0.05, 0.05), BODY, 0.0, 'mirror'),
          ('t', 'tail', [(0, -0.30, 0.30, 0.10), (0, -0.46, 0.26, 0.065), (0, -0.62, 0.21, 0.035), (0, -0.70, 0.18, 0.015)], BODY),
          ('e', 'spot_a', (0.15, -0.10, 0.36), (0.025, 0.05, 0.04), ACCENT, 0.0, 'mirror'), ('e', 'spot_b', (0.15, 0.08, 0.36), (0.025, 0.04, 0.035), ACCENT, 0.0, 'mirror')],
    legs=dict(hind=dict(x=0.14, top=(-0.20, 0.27), mid=(-0.13, 0.15), ankle=(-0.19, 0.05), toe=(-0.10, 0.015), r=(0.085, 0.065, 0.048),
                        foot=(0.02, 0.035, 0.05, 0.065, 0.035), toes=3, nail=BELLY),
              front=dict(x=0.14, top=(0.17, 0.27), mid=(0.11, 0.16), ankle=(0.17, 0.05), toe=(0.25, 0.015), r=(0.075, 0.06, 0.045),
                         foot=(0.02, 0.033, 0.046, 0.06, 0.033), toes=3, nail=BELLY)),
    rigid=[('e', 'frill', (0, 0.30, 0.46), (0.22, 0.03, 0.17), ACCENT, 0.45, 'head'),
           ('c', 'horn_brow', (0.06, 0.43, 0.42), (0.10, 0.60, 0.56), 0.03, BELLY, 0.004, 'head', 'mirror'),
           ('c', 'horn_nose', (0, 0.57, 0.34), (0, 0.62, 0.43), 0.026, BELLY, 0.004, 'head'),
           ('e', 'jaw', (0, 0.47, 0.255), (0.075, 0.11, 0.03), BODY, 0.1, 'jaw'), ('e', 'tongue', (0, 0.45, 0.27), (0.045, 0.07, 0.01), ACCENT, 0.0, 'jaw')]
          + [('e', f'frill_knob{i}', (0.22 * math.cos(a), 0.30 - 0.435 * 0.17 * math.sin(a), 0.46 + 0.90 * 0.17 * math.sin(a)), (0.026, 0.026, 0.026), BELLY, 0.0, 'head')
             for i, a in enumerate([-0.25 + (math.pi + 0.5) * k / 8 for k in range(9)])],
    eyes=dict(c=(0.095, 0.45, 0.39), r=0.036),
    saddle=dict(y=-0.05, top=0.447, scale=1.0, flank_x=0.17, flap_z=0.37),
    bones=[('spine_01', (0, -0.22, 0.31), (0, -0.02, 0.32), 'root'), ('spine_02', (0, -0.02, 0.32), (0, 0.18, 0.32), 'spine_01'),
           ('neck', (0, 0.18, 0.32), (0, 0.30, 0.34), 'spine_02'), ('head', (0, 0.30, 0.34), (0, 0.64, 0.30), 'neck'),
           ('jaw', (0, 0.34, 0.28), (0, 0.60, 0.24), 'head'),
           ('tail_01', (0, -0.26, 0.30), (0, -0.42, 0.27), 'spine_01'), ('tail_02', (0, -0.42, 0.27), (0, -0.57, 0.22), 'tail_01'),
           ('tail_03', (0, -0.57, 0.22), (0, -0.71, 0.18), 'tail_02')],
    mouth=(0, 0.64, 0.26),
    gaits=dict(jump=0.6, walk=dict(T=1.0, S=0.16, D=0.65, lift=0.045, bob=0.008, tail_sway=0.10),
               trot=dict(T=0.6, S=0.18, D=0.45, lift=0.06, bob=0.015),
               gallop=dict(T=0.5, S=0.20, D=0.2, lag=0.05, rise=0.07, tuck=0.05, rock=0.06),
               style=dict(gallop=dict(neck=-0.22, head=-0.18, jaw=0.25, pitch=-0.04), trot=dict(neck=-0.08, head=-0.08))),
)


def quetzal_wing(side, sx):
    """Spread flight wing: leading-edge spar per bone plus a two-sided membrane weighted to the spar bones."""
    pts = [Vector(X(p, sx)) for p in QUETZAL_WING_PTS]
    bones = [f'wing_{b}_{side}' for b in ('shoulder', 'elbow', 'wrist', 'finger_01', 'finger_02')]
    out = []
    for i, bn in enumerate(bones):
        r0, r1 = (0.032, 0.026, 0.02, 0.017, 0.011)[i], (0.026, 0.02, 0.017, 0.011, 0.004)[i]
        out.append((cone(f'spar_{side}{i}', pts[i], pts[i + 1], r0, BELLY, verts=8, r2=r1), bn))
    # membrane: leading edge (spar polyline) to a scalloped trailing edge from the tip back to the hip
    hip = Vector((sx * 0.07, -0.13, 0.47)); n_span, n_chord = 18, 5
    seg_len = [(pts[i + 1] - pts[i]).length for i in range(5)]; total = sum(seg_len)
    def le(s):
        d = s * total
        for i, L in enumerate(seg_len):
            if d <= L or i == 4: return pts[i].lerp(pts[i + 1], min(1.0, d / L)), i
            d -= L
    me = bpy.data.meshes.new(f'membrane_{side}'); bm = bmesh.new(); grid = []; owner = []
    for a in range(n_span + 1):
        s = a / n_span; L, seg = le(s)
        T = hip.lerp(pts[5], s); T = T + Vector((0, -0.10 * math.sin(math.pi * s), 0))  # scalloped trailing edge
        row = []
        for b in range(n_chord + 1):
            c = b / n_chord; row.append(bm.verts.new(L.lerp(T, c))); owner.append(seg)
        grid.append(row)
    for a in range(n_span):
        for b in range(n_chord):
            q = (grid[a][b], grid[a + 1][b], grid[a + 1][b + 1], grid[a][b + 1])
            bm.faces.new(q if sx > 0 else q[::-1])
    bm.to_mesh(me); bm.free()
    obj = link(bpy.data.objects.new(f'membrane_{side}', me)); obj['mat'] = ORANGE
    groups = {bn: obj.vertex_groups.new(name=bn) for bn in bones}
    for vi, seg in enumerate(owner): groups[bones[seg]].add([vi], 1.0, 'REPLACE')
    out.append((obj, None))
    return out


QUETZAL_WING_PTS = [(0.10, 0.12, 0.56), (0.40, 0.14, 0.57), (0.75, 0.16, 0.58), (0.86, 0.16, 0.58), (1.18, 0.08, 0.57), (1.50, -0.05, 0.55)]


def quetzal_extra():
    r = []
    for side, sx in (('L', 1), ('R', -1)):
        r += quetzal_wing(side, sx)
        # knuckle-walking arm (rigid so its scale-to-hide in flight never pulls the body skin)
        F = QUETZAL['legs']['front']; x = sx * F['x']
        top, mid, ank, toe = [(x, *F[k]) for k in ('top', 'mid', 'ankle', 'toe')]
        r += [(cone(f'qarm_{side}', top, mid, 0.04, BODY, verts=10, r2=0.03), 'arm_' + side),
              (ellipsoid(f'qelbow_{side}', mid, (0.032, 0.032, 0.032), BODY, seg=12, rings=8), 'forearm_' + side),
              (cone(f'qforearm_{side}', mid, ank, 0.03, BODY, verts=10, r2=0.022), 'forearm_' + side),
              (ellipsoid(f'qwrist_{side}', ank, (0.026, 0.026, 0.026), BODY, seg=12, rings=8), 'hand_' + side),
              (cone(f'qhand_{side}', ank, toe, 0.022, BODY, verts=8, r2=0.016), 'hand_' + side),
              (ellipsoid(f'qknuckle_{side}', toe, (0.026, 0.03, 0.02), BELLY, seg=12, rings=8), 'hand_' + side),
              # the folded wing: membrane bundle along the forearm and the long finger pointing back up
              (ellipsoid(f'qfold_{side}', (x + sx * 0.02, 0.06, 0.34), (0.012, 0.09, 0.15), ORANGE, -0.35, seg=14, rings=8), 'forearm_' + side),
              (cone(f'qfinger_{side}', ank, (x + sx * 0.03, -0.07, 0.58), 0.016, BELLY, verts=8, r2=0.005), 'forearm_' + side)]
    return r


QUETZAL = dict(
    node='Quetzal', voxel=0.006, body_tris=4200, cam=1.45, review_target=0.55,
    palette=palette('Quetzal', (0.90, 0.88, 0.80), (0.98, 0.78, 0.25), (0.88, 0.22, 0.12)),
    soft=[('e', 'torso', (0, 0.0, 0.50), (0.11, 0.18, 0.10), BODY, 0.35), ('e', 'belly', (0, 0.02, 0.475), (0.09, 0.15, 0.08), BELLY, 0.35),
          ('e', 'hips', (0, -0.13, 0.44), (0.09, 0.09, 0.08), BODY, 0.0), ('e', 'chest', (0, 0.12, 0.57), (0.11, 0.09, 0.09), BODY, 0.0),
          ('t', 'neck', [(0, 0.17, 0.62, 0.055), (0, 0.25, 0.76, 0.046), (0, 0.31, 0.90, 0.042), (0, 0.36, 1.0, 0.040)], BODY),
          ('e', 'head', (0, 0.44, 1.04), (0.06, 0.12, 0.07), BODY, -0.1),
          ('t', 'beak', [(0, 0.50, 1.04, 0.045), (0, 0.62, 1.0, 0.03), (0, 0.78, 0.95, 0.008)], BELLY),
          ('e', 'brow', (0.035, 0.43, 1.085), (0.03, 0.04, 0.025), BODY, 0.0, 'mirror'),
          ('t', 'tail', [(0, -0.18, 0.44, 0.04), (0, -0.27, 0.42, 0.025), (0, -0.34, 0.40, 0.012)], BODY)],
    legs=dict(hind=dict(x=0.08, top=(-0.13, 0.42), mid=(-0.06, 0.25), ankle=(-0.12, 0.06), toe=(-0.04, 0.015), r=(0.055, 0.04, 0.025),
                        foot=(0.03, 0.02, 0.03, 0.055, 0.02), toes=3, nail=ORANGE),
              front=dict(x=0.14, top=(0.13, 0.56), mid=(0.04, 0.38), ankle=(0.12, 0.12), toe=(0.18, 0.03), r=(0.04, 0.03, 0.022), rigid=True)),
    rigid=[('e', 'crest', (0, 0.33, 1.15), (0.012, 0.15, 0.085), ORANGE, 0.55, 'head'),
           ('c', 'jaw', (0, 0.47, 0.995), (0, 0.77, 0.938), 0.03, BELLY, 0.006, 'jaw'),
           ('e', 'tongue', (0, 0.52, 1.0), (0.016, 0.06, 0.006), ORANGE, 0.2, 'jaw')],
    extra_rigid=quetzal_extra,
    eyes=dict(c=(0.048, 0.445, 1.07), r=0.03),
    saddle=dict(y=0.0, top=0.615, scale=0.8, flank_x=0.11, flap_z=0.54),
    bones=[('spine_01', (0, -0.16, 0.44), (0, 0.02, 0.52), 'root'), ('spine_02', (0, 0.02, 0.52), (0, 0.16, 0.60), 'spine_01'),
           ('neck', (0, 0.16, 0.60), (0, 0.28, 0.80), 'spine_02'), ('neck_02', (0, 0.28, 0.80), (0, 0.36, 1.0), 'neck'),
           ('head', (0, 0.36, 1.0), (0, 0.78, 0.95), 'neck_02'), ('jaw', (0, 0.46, 1.0), (0, 0.77, 0.935), 'head'),
           ('tail_01', (0, -0.18, 0.44), (0, -0.25, 0.43), 'spine_01'), ('tail_02', (0, -0.25, 0.43), (0, -0.31, 0.415), 'tail_01'),
           ('tail_03', (0, -0.31, 0.415), (0, -0.37, 0.40), 'tail_02')],
    wing_bones=[('wing_shoulder', QUETZAL_WING_PTS[0], QUETZAL_WING_PTS[1], 'spine_02'), ('wing_elbow', QUETZAL_WING_PTS[1], QUETZAL_WING_PTS[2], 'wing_shoulder'),
                ('wing_wrist', QUETZAL_WING_PTS[2], QUETZAL_WING_PTS[3], 'wing_elbow'), ('wing_finger_01', QUETZAL_WING_PTS[3], QUETZAL_WING_PTS[4], 'wing_wrist'),
                ('wing_finger_02', QUETZAL_WING_PTS[4], QUETZAL_WING_PTS[5], 'wing_finger_01')],
    mouth=(0, 0.79, 0.95),
    gaits=dict(jump=0.8, walk=dict(T=1.0, S=0.16, D=0.65, lift=0.05, bob=0.015, roll=0.07, yaw=0.08, neck_bob=0.08, neck_sway=0.10),
               trot=dict(T=0.6, S=0.20, D=0.45, lift=0.07, bob=0.02, roll=0.05),
               gallop=dict(T=0.5, S=0.22, D=0.2, lag=0.0, rise=0.10, tuck=0.06, rock=0.10),
               style=dict(gallop=dict(jaw=0.45, neck=-0.1))),
)


def species(spec, clips):
    spec = dict(spec)
    spec['soft_fn'] = partial(species_soft, spec); spec['rigid_fn'] = partial(species_rigid, spec)
    spec['bone_list'] = species_bones(spec); spec['clips'] = clips
    spec['saddle_at'] = (0, spec['saddle']['y'], spec['saddle']['top'] + 0.001)
    return spec


def kinds():
    q = quad_clips(QUETZAL['gaits'])
    q.update({'takeoff': (0.8, False, 0.0, takeoff), 'flap': (0.6, True, 0.0, lambda rig, u: flap(u)),
              'glide': (2.0, True, 0.0, lambda rig, u: glide(u)), 'land': (0.8, False, 0.0, land)})
    return {
        'dino': dict(node='Dino', voxel=0.0065, body_tris=6000, cam=1.0, review_target=0.32,
                     palette={'Dino_Green': ((0.16, 0.50, 0.12), 0.45), 'Dino_Cream': ((0.93, 0.80, 0.52), 0.45),
                              'Dino_Orange': ((0.95, 0.32, 0.05), 0.42), 'Saddle_Brown': ((0.30, 0.13, 0.05), 0.55),
                              'Eye_Black': ((0.015, 0.015, 0.02), 0.25)},
                     soft_fn=soft_parts, rigid_fn=rigid_parts, bone_list=DINO_BONES, connected=DINO_CONNECTED,
                     saddle_at=(0, 0.0, 0.452), mouth=(0, 0.60, 0.46), clips=dino_clips()),
        'raptor': species(RAPTOR, biped_clips(RAPTOR['gaits'])),
        'longneck': species(LONGNECK, quad_clips(LONGNECK['gaits'])),
        'triceratops': species(TRICERATOPS, quad_clips(TRICERATOPS['gaits'])),
        'quetzal': species(QUETZAL, q),
    }


def author_actions(arm, spec):
    rig = Rig(arm); ad = arm.animation_data_create(); table = {}
    for name, (seconds, loop, speed, fn) in spec['clips'].items():
        frames = round(seconds * FPS); table[name] = (frames, loop, round(speed, 3))
        act = bpy.data.actions.new(name); act.use_fake_user = True; ad.action = act; rig.prev = {}
        for f in range(frames + 1):
            rig.pose(f, fn(rig, f / frames))
        act.use_frame_range = True; act.frame_start = 0; act.frame_end = frames; act.use_cyclic = loop
        for fc in fcurves(act):
            for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
        tr = ad.nla_tracks.new(); tr.name = name; tr.strips.new(name, 0, act); tr.mute = True
        ad.action = None
    for pb in arm.pose.bones: pb.rotation_quaternion = Quaternion(); pb.location = Vector(); pb.scale = (1, 1, 1)
    return table


def fcurves(act):
    if hasattr(act, 'fcurves') and act.fcurves is not None and len(act.fcurves): return list(act.fcurves)
    out = []  # Blender 5 layered actions
    for layer in getattr(act, 'layers', []):
        for strip in layer.strips:
            for bag in strip.channelbags: out.extend(bag.fcurves)
    return out


# ---------------------------------------------------------------- export + review render
def export(arm, mesh, empties, glb, blend):
    glb.parent.mkdir(parents=True, exist_ok=True); blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action='DESELECT')
    for o in [arm, mesh, *empties]: o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
                              export_def_bones=False, export_force_sampling=True, export_frame_step=1, export_reset_pose_bones=True,
                              export_morph=False, export_cameras=False, export_lights=False, export_extras=False,
                              export_materials='EXPORT', export_image_format='NONE', export_texcoords=False,
                              export_optimize_animation_size=True)


def review_render(out, arm, kind, spec, only=None):
    out.mkdir(parents=True, exist_ok=True); scene = bpy.context.scene
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try: scene.render.engine = eng; break
        except TypeError: pass
    try: scene.eevee.taa_render_samples = 48
    except AttributeError: pass
    scene.render.resolution_x, scene.render.resolution_y = 1200, 900; scene.render.image_settings.file_format = 'PNG'
    world = scene.world or bpy.data.worlds.new('World'); scene.world = world; world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.68, 0.80, 1); world.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    sun = link(bpy.data.objects.new('ReviewSun', bpy.data.lights.new('ReviewSun', 'SUN'))); sun.data.energy = 3.2; sun.data.color = (1, 0.93, 0.83)
    sun.rotation_euler = (math.radians(50), 0, math.radians(-140)); sun.data.angle = math.radians(3)
    ground = bpy.data.meshes.new('ReviewGround'); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=8); bm.to_mesh(ground); bm.free()
    g = link(bpy.data.objects.new('ReviewGround', ground)); gm = bpy.data.materials.new('ReviewGround'); gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.55, 0.42, 0.28, 1); gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9; ground.materials.append(gm)
    # grey buggy-size proxies (0.42 x 0.28 x 0.20 m): one beside the creature, one on the saddle
    k = spec['cam']
    pm = bpy.data.materials.new('ReviewProxy'); pm.use_nodes = True; pm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.6, 0.6, 0.62, 1)
    beside = box('ReviewBuggyProxy', (0.42 * k + 0.1, 0.25 * k, 0.10), (0.28, 0.42, 0.20), 0); beside.data.materials.append(pm)
    rider = box('ReviewRiderProxy', (0, 0, 0), (0.28, 0.42, 0.20), 0); rider.data.materials.append(pm)
    saddle = bpy.data.objects['Saddle']; apply_transform(rider); rider.parent = saddle; bpy.context.view_layer.update()
    rider.matrix_world = saddle.matrix_world @ Matrix.Translation((0, 0, 0.10))  # bottom face on the saddle point
    cam = link(bpy.data.objects.new('ReviewCamera', bpy.data.cameras.new('ReviewCamera'))); scene.camera = cam; cam.data.lens = 50
    label = bpy.data.curves.new('ReviewLabel', 'FONT'); label.body = 'BLENDER REVIEW RENDER (not in-engine)' if kind == 'dino' else f'BLENDER REVIEW, not in-engine: {kind}'; label.size = 0.035 if kind == 'dino' else 0.03
    lo = link(bpy.data.objects.new('ReviewLabel', label)); lo.parent = cam; lo.location = (-0.33, -0.235, -1.0)
    lm = bpy.data.materials.new('ReviewLabel'); lm.use_nodes = True; lm.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (1, 1, 1, 1)
    lm.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 2; label.materials.append(lm)
    ad = arm.animation_data
    for tr in ad.nla_tracks: tr.mute = True
    target = Vector((0, 0.0, spec['review_target']))
    clips = spec['clips']; frame_at = lambda c, u: round(clips[c][0] * FPS * u)
    shots = [('front', (0.0, 2.6 * k, 0.55 * k), None, 0), ('side', (2.7 * k, 0.0, 0.45 * k), None, 0),
             ('three-quarter', (1.9 * k, 1.75 * k, 0.85 * k), 'idle' if kind != 'dino' else None, 0),
             ('mid-run', (1.9 * k, 1.75 * k, 0.75 * k), 'run', frame_at('run', 1 / 6)), ('jump-apex', (2.2 * k, 1.2 * k, 0.7 * k), 'jump', frame_at('jump', 0.5)),
             ('gallop', (1.9 * k, 1.75 * k, 0.8 * k), 'gallop', frame_at('gallop', 0.4))]
    if 'flap' in clips:
        shots += [('flap', (2.2 * k, 2.0 * k, 1.1 * k), 'flap', frame_at('flap', 0.25)), ('glide', (2.2 * k, 2.0 * k, 1.1 * k), 'glide', 0)]
    if only: shots = [x for x in shots if x[0] in only]
    paths = []
    for name, pos, clip, frame in shots:
        ad.action = bpy.data.actions[clip] if clip else None
        if clip and hasattr(ad, 'action_slot') and ad.action_slot is None and len(ad.action.slots): ad.action_slot = ad.action.slots[0]
        if not clip:
            for pb in arm.pose.bones: pb.rotation_quaternion = Quaternion(); pb.location = Vector(); pb.scale = (1, 1, 1)
        scene.frame_set(frame)
        cam.location = pos; cam.rotation_euler = (target - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
        prefix = 'blender-review-' if kind == 'dino' else f'blender-review-{kind}-'
        path = out / f'{prefix}{name}.png'; scene.render.filepath = str(path); bpy.ops.render.render(write_still=True); paths.append(str(path))
    return paths


def build(kind, spec, args):
    clear(); mats = make_materials(spec['palette'])
    mesh, remesh_tris = build_skin(mats, spec)
    arm = build_armature(spec)
    exclude = [n for n, *_ in spec['bone_list'] if n.startswith('wing_')]
    if spec.get('legs', {}).get('front', {}).get('rigid'): exclude += [f'{b}_{s}' for b in ('arm', 'forearm', 'hand') for s in 'LR']
    fallback = skin_to(arm, mesh, exclude)
    attach_rigid(arm, mesh, mats, spec)
    empties = [empty('Saddle', arm, 'spine_01', Vector(spec['saddle_at'])), empty('Mouth', arm, 'head', Vector(spec['mouth']))]
    table = author_actions(arm, spec)
    bpy.context.view_layer.update()
    tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    bb = [mesh.matrix_world @ Vector(c) for c in mesh.bound_box]
    ext = [max(v[i] for v in bb) - min(v[i] for v in bb) for i in range(3)]
    out = args.out if args.out.is_absolute() else REPO / args.out
    glb, blend = out / f'{kind}.glb', REPO / f'assets/rc/characters/{kind}.blend'
    export(arm, mesh, empties, glb, blend)
    stats = dict(triangles=tris, remesh_triangles_before_decimate=remesh_tris, bones=len(arm.data.bones), deform_bones=sum(b.use_deform for b in arm.data.bones),
                 vertices_weighted_by_fallback=fallback, extent_m_blender_xyz=[round(e, 3) for e in ext], glb_bytes=glb.stat().st_size,
                 clips={n: dict(frames=f, seconds=round(f / FPS, 3), loop=l, ground_speed_mps=s) for n, (f, l, s) in table.items()})
    (out / f'{kind}.provenance.json').write_text(json.dumps({'asset': f'characters/{kind}.glb', 'generator': 'tools/rc/blender/character_dino.py', 'blender': bpy.app.version_string,
                                                            'license': 'MIT (original authored geometry, rig, animation and materials; repository MIT)', 'external_assets': [],
                                                            'editable_source': f'assets/rc/characters/{kind}.blend', 'stats': stats}, indent=2) + '\n')
    if args.render: stats['renders'] = review_render(args.render if args.render.is_absolute() else REPO / args.render, arm, kind, spec, args.shots.split(',') if args.shots else None)
    print(f'CHARACTER_STATS {kind} ' + json.dumps(stats), flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--kinds', default='dino', help='comma list: dino,raptor,longneck,triceratops,quetzal')
    ap.add_argument('--out', type=Path, default=Path('web/wwwroot/rc/assets/characters'))
    ap.add_argument('--render', type=Path); ap.add_argument('--shots', help='comma list of review shots (default all)')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    table = kinds()
    for kind in args.kinds.split(','):
        build(kind, table[kind], args)


if __name__ == '__main__':
    main()
