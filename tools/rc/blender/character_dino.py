#!/usr/bin/env python3
"""Saucer Springs character pipeline, first creature: a chunky toy riding dinosaur.

Builds an ORIGINAL stylised bipedal runner from primitives (no external assets), rigs it,
authors four clips in Python, saves the editable .blend and exports a skinned GLB.

  HEAVY_SLOT_LABEL=rc-dino heavy-slot -- /Applications/Blender.app/Contents/MacOS/Blender \
    --background --factory-startup --python tools/rc/blender/character_dino.py [-- --render evidence/rc-characters]

Units are real-world metres at game scale (the buggy is 0.42 m long). Blender axes: +Z up,
+Y forward, +X = the dinosaur's left; glTF export gives +Y up, -Z forward (same as the buggy).

Mesh: the soft body is a union of ellipsoid/tube primitives, voxel-remeshed into one manifold
skin, decimated to budget, coloured per face from the nearest source primitive, and skinned
with Blender's automatic (heat) weights. Small hard parts (googly eyes, jaw, teeth, saddle,
claws) are rigid: 100% to one bone, so they never smear.

Clips are authored analytically (sine gaits + a two-bone leg IK that keeps stance feet
planted) and keyed every frame. Root motion is NOT baked: clips play in place and the game
moves the root at the clip's ground speed (recorded in provenance.json and characters.js).
"""
import argparse, json, math, sys
from pathlib import Path
import bpy, bmesh
from mathutils import Vector, Quaternion, Matrix
from mathutils.bvhtree import BVHTree

REPO = Path(__file__).resolve().parents[3]
BLEND = REPO / 'assets/rc/characters/dino.blend'
GLB = REPO / 'web/wwwroot/rc/assets/characters/dino.glb'
PROVENANCE = GLB.with_name('dino.provenance.json')
FPS = 30
BODY_TRIANGLES = 6000      # target for the decimated soft skin; rigid parts add ~1.5k
VOXEL = 0.0065

# ---------------------------------------------------------------- materials (flat toy PBR)
PALETTE = {  # name: (linear rgb, roughness)
    'Dino_Green':  ((0.16, 0.50, 0.12), 0.45),
    'Dino_Cream':  ((0.93, 0.80, 0.52), 0.45),
    'Dino_Orange': ((0.95, 0.32, 0.05), 0.42),
    'Saddle_Brown': ((0.30, 0.13, 0.05), 0.55),
    'Eye_Black':   ((0.015, 0.015, 0.02), 0.25),
}
MAT_ORDER = list(PALETTE)
GREEN, CREAM, ORANGE, BROWN, BLACK = range(5)


def make_materials():
    mats = []
    for name in MAT_ORDER:
        rgb, rough = PALETTE[name]
        m = bpy.data.materials.new(name); m.use_nodes = True
        bs = m.node_tree.nodes.get('Principled BSDF')
        bs.inputs['Base Color'].default_value = (*rgb, 1)
        bs.inputs['Roughness'].default_value = rough
        bs.inputs['Metallic'].default_value = 0
        m.diffuse_color = (*rgb, 1)
        mats.append(m)
    return mats


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


def cone(name, base, tip, r, mat, verts=8):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r * 0.25, depth=1.0)
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


# ---------------------------------------------------------------- the dinosaur (blender coords)
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


BONES = [  # name, head, tail, parent, deform
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
    BONES += [
        ('thigh_' + _s, (_x * 0.12, -0.03, 0.28), (_x * 0.125, 0.05, 0.15), 'spine_01', True),
        ('shin_' + _s, (_x * 0.125, 0.05, 0.15), (_x * 0.125, -0.01, 0.055), 'thigh_' + _s, True),
        ('foot_' + _s, (_x * 0.125, -0.01, 0.055), (_x * 0.125, 0.14, 0.02), 'shin_' + _s, True),
        ('arm_' + _s, (_x * 0.11, 0.20, 0.33), (_x * 0.135, 0.268, 0.255), 'spine_02', True),
    ]
CONNECTED = {'spine_02', 'neck', 'head', 'tail_02', 'tail_03', 'shin_L', 'shin_R', 'foot_L', 'foot_R'}


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


def build_skin(mats):
    parts = soft_parts()
    bpy.context.view_layer.update()
    trees = []
    for o in parts:
        apply_transform(o)
        bm = bmesh.new(); bm.from_mesh(o.data); trees.append((BVHTree.FromBMesh(bm), o['mat'])); bm.free()
    # union: join every primitive into one object, then voxel-remesh it into a single manifold skin
    union = bpy.data.objects.new('DinoUnion', bpy.data.meshes.new('DinoUnion')); link(union)
    bm = bmesh.new()
    for o in parts: bm.from_mesh(o.data)
    bm.to_mesh(union.data); bm.free()
    for o in parts: bpy.data.objects.remove(o, do_unlink=True)
    rm = union.modifiers.new('voxel', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = VOXEL; rm.adaptivity = 0
    remeshed = evaluated_copy(union, 'DinoRemesh'); union.modifiers.clear(); union.data = remeshed
    tris = sum(len(p.vertices) - 2 for p in remeshed.polygons)
    dec = union.modifiers.new('decimate', 'DECIMATE'); dec.decimate_type = 'COLLAPSE'; dec.ratio = min(1.0, BODY_TRIANGLES / max(tris, 1))
    skin = evaluated_copy(union, 'DinoSkin'); union.modifiers.clear(); union.data = skin; union.name = 'DinoMesh'
    for m in mats: skin.materials.append(m)
    for poly in skin.polygons:  # colour each face from the nearest source primitive
        best, idx = 1e9, GREEN
        for tree, mat in trees:
            hit = tree.find_nearest(poly.center)
            if hit[0] is not None and hit[3] < best: best, idx = hit[3], mat
        poly.material_index = idx; poly.use_smooth = True
    return union, tris


def build_armature():
    data = bpy.data.armatures.new('DinoRig'); arm = link(bpy.data.objects.new('Dino', data))
    bpy.context.view_layer.objects.active = arm; arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for name, h, t, parent, deform in BONES:
        b = data.edit_bones.new(name); b.head = h; b.tail = t; b.roll = 0; b.use_deform = deform
        if parent: b.parent = data.edit_bones[parent]; b.use_connect = name in CONNECTED
    bpy.ops.object.mode_set(mode='OBJECT')
    data.display_type = 'STICK'
    for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'
    return arm


def skin_to(arm, mesh):
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    deform = [b for b in arm.data.bones if b.use_deform]
    groups = {g.index: g.name for g in mesh.vertex_groups}
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


def attach_rigid(arm, mesh, mats):
    objs = []
    for obj, bone in rigid_parts():
        apply_transform(obj)
        obj.data.materials.clear()
        for m in mats: obj.data.materials.append(m)
        for p in obj.data.polygons: p.material_index = obj['mat']; p.use_smooth = True
        g = obj.vertex_groups.new(name=bone); g.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
        objs.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    mesh.select_set(True); bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.join()
    # remove material slots that ended up duplicated by the join
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


class Rig:
    def __init__(self, arm):
        self.arm = arm; self.prev = {}
        b = {x.name: x for x in arm.data.bones}
        yz = lambda v: (v.y, v.z)
        self.P = yz(b['spine_01'].head_local); self.H0 = yz(b['thigh_L'].head_local)
        self.K0 = yz(b['shin_L'].head_local); self.A0 = yz(b['foot_L'].head_local); self.T0 = yz(b['foot_L'].tail_local)
        d = lambda p, q: math.hypot(q[0] - p[0], q[1] - p[1]); ang = lambda p, q: math.atan2(q[1] - p[1], q[0] - p[0])
        self.a, self.b = d(self.H0, self.K0), d(self.K0, self.A0)
        self.thigh0, self.shin0, self.foot0 = ang(self.H0, self.K0), ang(self.K0, self.A0), ang(self.A0, self.T0)

    def hip(self, dy, dz, p):
        Py, Pz = self.P; hy, hz = self.H0[0] - Py, self.H0[1] - Pz
        return (Py + hy * math.cos(p) - hz * math.sin(p) + dy, Pz + hy * math.sin(p) + hz * math.cos(p) + dz)

    def leg_ik(self, H, A, toe, p):
        """Sagittal two-bone IK (knee forward). Returns (thigh, shin, foot) pitch deltas, each relative to its parent."""
        dy, dz = A[0] - H[0], A[1] - H[1]; d = min(max(math.hypot(dy, dz), abs(self.a - self.b) + 1e-4), self.a + self.b - 1e-4)
        phi = math.atan2(dz, dy); alpha = math.acos((self.a ** 2 + d * d - self.b ** 2) / (2 * self.a * d))
        th = phi + alpha; K = (H[0] + self.a * math.cos(th), H[1] + self.a * math.sin(th))
        Ad = (H[0] + d * math.cos(phi), H[1] + d * math.sin(phi)); sh = math.atan2(Ad[1] - K[1], Ad[0] - K[0])
        wt, ws, wf = th - self.thigh0, sh - self.shin0, toe
        return wt - p, ws - wt, wf - ws

    def set(self, name, q=Quaternion(), loc=None):
        pb = self.arm.pose.bones[name]; R = pb.bone.matrix_local.to_3x3(); Ri = R.inverted()
        local = (Ri @ q.to_matrix() @ R).to_quaternion()
        if name in self.prev and self.prev[name].dot(local) < 0: local.negate()
        self.prev[name] = local.copy(); pb.rotation_quaternion = local
        if loc is not None: pb.location = Ri @ Vector(loc)

    def pose(self, f, P):
        p = P.get('pitch', 0); dy, dz = P.get('dy', 0), P.get('dz', 0)
        self.set('root')
        self.set('spine_01', rz(P.get('yaw', 0)) @ ry(P.get('roll', 0)) @ rx(p), (0, dy, dz))
        self.set('spine_02', rz(P.get('chest_yaw', 0)) @ rx(P.get('chest', 0)))
        self.set('neck', rx(P.get('neck', 0)))
        self.set('head', rz(P.get('head_yaw', 0)) @ rx(P.get('head', 0)))
        self.set('jaw', rx(-P.get('jaw', 0)))
        for i, (tp, ty) in enumerate(P.get('tail', [(0, 0)] * 3)): self.set(f'tail_0{i + 1}', rz(ty) @ rx(tp))
        H = self.hip(dy, dz, p)
        for s in ('L', 'R'):
            ay, az = P.get('ankle_' + s, (0, 0))
            t, sh, ft = self.leg_ik(H, (self.A0[0] + ay, self.A0[1] + az), P.get('toe_' + s, 0), p)
            self.set('thigh_' + s, rx(t)); self.set('shin_' + s, rx(sh)); self.set('foot_' + s, rx(ft))
            self.set('arm_' + s, rx(P.get('arm_' + s, 0)))
        for pb in self.arm.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=f, group=pb.name)
            if pb.name == 'spine_01': pb.keyframe_insert('location', frame=f, group=pb.name)


def gait_foot(u, duty, stride, lift, toe_amp):
    u %= 1.0
    if u < duty: return (stride / 2 - stride * u / duty, 0.0), 0.0
    s = (u - duty) / (1 - duty)
    return (-stride / 2 + stride * smooth(s), lift * math.sin(math.pi * s)), -toe_amp * math.sin(2 * math.pi * s)


TAU = 2 * math.pi


def idle(t):
    b = math.sin(TAU * t)
    return dict(dz=-0.004 + 0.004 * b, chest=0.03 * b, neck=0.03 * math.sin(TAU * t + 0.6), head=0.04 * math.sin(2 * TAU * t),
                head_yaw=0.16 * math.sin(TAU * t), jaw=0.03 + 0.03 * math.sin(2 * TAU * t + 1.0),
                tail=[(0.02 * math.sin(TAU * t + i), 0.16 * math.sin(TAU * t - 0.6 * i)) for i in range(3)],
                arm_L=0.12 * math.sin(2 * TAU * t), arm_R=0.12 * math.sin(2 * TAU * t + 1.4))


def walk(t):
    D, S, Hh = 0.6, 0.18, 0.05
    aL, toeL = gait_foot(t, D, S, Hh, 0.22); aR, toeR = gait_foot(t + 0.5, D, S, Hh, 0.22)
    c2 = math.cos(2 * TAU * (t - 0.3))
    return dict(dz=-0.008 + 0.008 * c2, roll=0.05 * math.cos(TAU * (t - 0.3)), yaw=0.07 * math.cos(TAU * t), pitch=0.0,
                chest_yaw=-0.04 * math.cos(TAU * t), neck=0.03 * c2, head=-0.05 * c2, head_yaw=-0.04 * math.cos(TAU * t),
                jaw=0.05 + 0.03 * math.sin(2 * TAU * t),
                tail=[(0.03 * math.sin(2 * TAU * t - i), -0.13 * math.cos(TAU * t - 0.7 * (i + 1))) for i in range(3)],
                ankle_L=aL, ankle_R=aR, toe_L=toeL, toe_R=toeR, arm_L=-0.35 * math.cos(TAU * t), arm_R=0.35 * math.cos(TAU * t))


def run(t):
    D, S, Hh = 0.4, 0.2, 0.10
    aL, toeL = gait_foot(t, D, S, Hh, 0.35); aR, toeR = gait_foot(t + 0.5, D, S, Hh, 0.35)
    c2 = math.cos(2 * TAU * (t - 0.2))
    return dict(dz=-0.012 - 0.026 * c2, pitch=-0.14 + 0.05 * c2, chest=-0.04, neck=0.16 - 0.06 * c2, head=0.06 + 0.08 * math.cos(2 * TAU * (t - 0.2) + 0.8),
                yaw=0.05 * math.cos(TAU * t), jaw=0.28 + 0.08 * math.sin(2 * TAU * t),
                tail=[(0.14 + 0.08 * math.cos(2 * TAU * (t - 0.2) + 0.9 + 0.5 * i), -0.1 * math.cos(TAU * t - 0.7 * (i + 1))) for i in range(3)],
                ankle_L=aL, ankle_R=aR, toe_L=toeL, toe_R=toeR,
                arm_L=0.35 + 0.55 * math.sin(TAU * t), arm_R=0.35 - 0.55 * math.sin(TAU * t))


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


def jump_pose(rig, f):
    k = {n: catmull(v, f) for n, v in JUMP.items()}
    H = rig.hip(0, k['dz'], k['pitch']); az = max(0.0, H[1] - k['reach'] - rig.A0[1])
    grounded = az <= 1e-6; toe = 0.0 if grounded and f < 7 or grounded and f > 19 else k['toe']
    ay = 0.0 if grounded else k['ay']
    return dict(dz=k['dz'], pitch=k['pitch'], neck=k['neck'], head=k['head'], jaw=k['jaw'],
                tail=[(k['tail'] * (1 + 0.3 * i), 0) for i in range(3)],
                ankle_L=(ay, az), ankle_R=(ay, az), toe_L=toe, toe_R=toe, arm_L=k['arm'], arm_R=k['arm'] * 0.9)


CLIPS = {  # name: (frames, loop, ground speed m/s at which feet do not slide)
    'idle': (60, True, 0.0),
    'walk': (30, True, round(0.18 / (0.6 * 1.0), 3)),
    'run': (18, True, round(0.20 / (0.4 * 0.6), 3)),
    'jump': (24, False, 0.0),
}


def author_actions(arm):
    rig = Rig(arm); ad = arm.animation_data_create()
    for name, (frames, loop, _) in CLIPS.items():
        act = bpy.data.actions.new(name); act.use_fake_user = True; ad.action = act; rig.prev = {}
        for f in range(frames + 1):
            P = jump_pose(rig, f) if name == 'jump' else {'idle': idle, 'walk': walk, 'run': run}[name](f / frames)
            rig.pose(f, P)
        act.use_frame_range = True; act.frame_start = 0; act.frame_end = frames; act.use_cyclic = loop
        for fc in fcurves(act):
            for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
        tr = ad.nla_tracks.new(); tr.name = name; strip = tr.strips.new(name, 0, act); tr.mute = True
        ad.action = None
    for pb in arm.pose.bones: pb.rotation_quaternion = Quaternion(); pb.location = Vector()


def fcurves(act):
    if hasattr(act, 'fcurves') and act.fcurves is not None and len(act.fcurves): return list(act.fcurves)
    out = []  # Blender 5 layered actions
    for layer in getattr(act, 'layers', []):
        for strip in layer.strips:
            for bag in strip.channelbags: out.extend(bag.fcurves)
    return out


# ---------------------------------------------------------------- export + review render
def export(arm, mesh, empties):
    GLB.parent.mkdir(parents=True, exist_ok=True); BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    bpy.ops.object.select_all(action='DESELECT')
    for o in [arm, mesh, *empties]: o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=str(GLB), export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
                              export_def_bones=False, export_force_sampling=True, export_frame_step=1, export_reset_pose_bones=True,
                              export_morph=False, export_cameras=False, export_lights=False, export_extras=False,
                              export_materials='EXPORT', export_image_format='NONE', export_texcoords=False)


def review_render(out, arm):
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
    ground = bpy.data.meshes.new('ReviewGround'); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6); bm.to_mesh(ground); bm.free()
    g = link(bpy.data.objects.new('ReviewGround', ground)); gm = bpy.data.materials.new('ReviewGround'); gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.55, 0.42, 0.28, 1); gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9; ground.materials.append(gm)
    # grey buggy-size proxies (0.42 x 0.28 x 0.20 m): one beside the dinosaur, one on the saddle
    pm = bpy.data.materials.new('ReviewProxy'); pm.use_nodes = True; pm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.6, 0.6, 0.62, 1)
    beside = box('ReviewBuggyProxy', (0.42, 0.25, 0.10), (0.28, 0.42, 0.20), 0); beside.data.materials.append(pm)
    rider = box('ReviewRiderProxy', (0, 0, 0), (0.28, 0.42, 0.20), 0); rider.data.materials.append(pm)
    saddle = bpy.data.objects['Saddle']; apply_transform(rider); rider.parent = saddle; bpy.context.view_layer.update()
    rider.matrix_world = saddle.matrix_world @ Matrix.Translation((0, 0, 0.10))  # bottom face on the saddle point
    cam = link(bpy.data.objects.new('ReviewCamera', bpy.data.cameras.new('ReviewCamera'))); scene.camera = cam; cam.data.lens = 50
    label = bpy.data.curves.new('ReviewLabel', 'FONT'); label.body = 'BLENDER REVIEW RENDER (not in-engine)'; label.size = 0.035
    lo = link(bpy.data.objects.new('ReviewLabel', label)); lo.parent = cam; lo.location = (-0.33, -0.235, -1.0)
    lm = bpy.data.materials.new('ReviewLabel'); lm.use_nodes = True; lm.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (1, 1, 1, 1)
    lm.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 2; label.materials.append(lm)
    ad = arm.animation_data
    for tr in ad.nla_tracks: tr.mute = True
    target = Vector((0, 0.0, 0.32))
    shots = [('front', (0.0, 2.6, 0.55), None, 0), ('side', (2.7, 0.0, 0.45), None, 0), ('three-quarter', (1.9, 1.75, 0.85), None, 0),
             ('mid-run', (1.9, 1.75, 0.75), 'run', 5), ('jump-apex', (2.2, 1.2, 0.7), 'jump', 12)]
    paths = []
    for name, pos, clip, frame in shots:
        ad.action = bpy.data.actions[clip] if clip else None
        if clip and hasattr(ad, 'action_slot') and ad.action_slot is None and len(ad.action.slots): ad.action_slot = ad.action.slots[0]
        if not clip:
            for pb in arm.pose.bones: pb.rotation_quaternion = Quaternion(); pb.location = Vector()
        scene.frame_set(frame)
        cam.location = pos; cam.rotation_euler = (target - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
        path = out / f'blender-review-{name}.png'; scene.render.filepath = str(path); bpy.ops.render.render(write_still=True); paths.append(str(path))
    return paths


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--render', type=Path)
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    clear(); mats = make_materials()
    mesh, remesh_tris = build_skin(mats)
    arm = build_armature()
    fallback = skin_to(arm, mesh)
    attach_rigid(arm, mesh, mats)
    empties = [empty('Saddle', arm, 'spine_01', Vector((0, 0.0, 0.452))), empty('Mouth', arm, 'head', Vector((0, 0.60, 0.46)))]
    author_actions(arm)
    bpy.context.view_layer.update()
    tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    bb = [mesh.matrix_world @ Vector(c) for c in mesh.bound_box]
    ext = [max(v[i] for v in bb) - min(v[i] for v in bb) for i in range(3)]
    export(arm, mesh, empties)
    stats = dict(triangles=tris, remesh_triangles_before_decimate=remesh_tris, bones=len(arm.data.bones), deform_bones=sum(b.use_deform for b in arm.data.bones),
                 vertices_weighted_by_fallback=fallback, extent_m_blender_xyz=[round(e, 3) for e in ext], glb_bytes=GLB.stat().st_size,
                 clips={n: dict(frames=f, seconds=round(f / FPS, 3), loop=l, ground_speed_mps=s) for n, (f, l, s) in CLIPS.items()})
    PROVENANCE.write_text(json.dumps({'asset': 'characters/dino.glb', 'generator': 'tools/rc/blender/character_dino.py', 'blender': bpy.app.version_string,
                                      'license': 'MIT (original authored geometry, rig, animation and materials; repository MIT)', 'external_assets': [],
                                      'editable_source': 'assets/rc/characters/dino.blend', 'stats': stats}, indent=2) + '\n')
    if args.render: stats['renders'] = review_render(args.render if args.render.is_absolute() else REPO / args.render, arm)
    print('DINO_STATS ' + json.dumps(stats))


if __name__ == '__main__':
    main()
