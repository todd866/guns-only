"""Shared authoring kit for Area 51½ districts (Blender 5.2, background mode).

Every district script builds native, editable objects, bakes ambient occlusion into a
vertex colour attribute, saves an editable .blend, then joins visual meshes by material
and exports one GLB that follows the node-naming contract in docs/area-51-build-plan.md:

  VIS_*              rendered geometry (joined per material at export)
  COL_<surface>_*    collision-only closed meshes, no material
  GATE_NN            empty, local -Z (Blender +Y) = race direction, scale.x = half width
  START_N, AI_NNN, PICKUP_*, SPEC_*, CAM_*   empties

All geometry is original and procedural. No downloads, no reference-game data.
Blender is +Z up; the glTF exporter converts to +Y up.
"""
import json
import math
from pathlib import Path

import bpy
import bmesh

SURFACES = ('asphalt', 'concrete', 'grass', 'dirt', 'wood', 'gymfloor', 'carpet', 'metal', 'tile')

PALETTE = {}      # name -> (hex, metallic, roughness); filled by the district
_MATS = {}
_VIS = {}         # (group, material) -> Geo
_COLS = []
_NAMES = {}
ROOT = None


# ---------------------------------------------------------------- materials

def _lin(c):
    return c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4


def material(name):
    if name in _MATS:
        return _MATS[name]
    colour, metal, rough = PALETTE[name]
    rgb = [_lin(int(colour[i:i + 2], 16) / 255) for i in (1, 3, 5)]
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_backface_culling = True       # glTF doubleSided=false; all open sheets face up
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    _MATS[name] = m
    return m


# ---------------------------------------------------------------- geometry accumulation

class Geo:
    """Triangle/quad soup with a per-face 'closed' or 'up' orientation rule."""

    def __init__(self):
        self.v, self.f, self.smooth, self.kind = [], [], [], []

    def add(self, part, smooth=False, kind='closed'):
        verts, faces = part[0], part[1]
        o = len(self.v)
        self.v.extend(tuple(map(float, p)) for p in verts)
        self.f.extend(tuple(i + o for i in f) for f in faces)
        sm = part[2] if len(part) > 2 else [smooth] * len(faces)
        self.smooth.extend(sm)
        self.kind.extend([kind] * len(faces))
        return self

    @property
    def tris(self):
        return sum(len(f) - 2 for f in self.f)


def vis(group, mat):
    key = (group, mat)
    if key not in _VIS:
        _VIS[key] = Geo()
    return _VIS[key]


def _unique(name):
    n = _NAMES.get(name, 0)
    _NAMES[name] = n + 1
    return name if n == 0 else f'{name}_{n + 1}'


def _object(name, geo, mat=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(geo.v, [], geo.f)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    closed = [f for f, k in zip(bm.faces, geo.kind) if k == 'closed']
    if closed:
        bmesh.ops.recalc_face_normals(bm, faces=closed)
    for f, k, s in zip(bm.faces, geo.kind, geo.smooth):
        if k == 'up':
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
        f.smooth = bool(s)
    bm.to_mesh(mesh)
    bm.free()
    mesh.validate(clean_customdata=False)
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    o.parent = ROOT
    if mat:
        mesh.materials.append(material(mat))
    return o


def col(surface, label, part, extras=None):
    """Closed collision mesh tagged by surface; hidden from render and bake."""
    assert surface in SURFACES, surface
    g = part if isinstance(part, Geo) else Geo().add(part)
    o = _object(_unique(f'COL_{surface}_{label}'), g)
    o['surface'] = surface
    for k, v in (extras or {}).items():
        o[k] = v
    o.hide_render = True
    o.display_type = 'WIRE'
    _COLS.append(o)
    return o


def flush_visuals():
    objs = []
    for (group, mat), g in _VIS.items():
        if g.f:
            objs.append(_object(_unique(f'VIS_{group}_{mat}'), g, mat))
    return objs


def marker(name, at, heading=None, scale=(1, 1, 1), extras=None, display='PLAIN_AXES'):
    """Empty. heading = (dx, dy) world direction for local +Y (glTF -Z)."""
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.parent = ROOT
    o.location = at
    o.empty_display_type = display
    o.empty_display_size = .5
    if heading is not None:
        o.rotation_euler = (0, 0, math.atan2(heading[1], heading[0]) - math.pi / 2)
    o.scale = scale
    for k, v in (extras or {}).items():
        o[k] = v
    return o


# ---------------------------------------------------------------- primitives (world coords)

def hexa(c):
    """8 corners: bottom 0-3 then top 4-7, same winding."""
    return list(c), [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]


def box(cx, cy, z0, sx, sy, h, yaw=0.0):
    ca, sa = math.cos(yaw), math.sin(yaw)
    pts = []
    for z in (z0, z0 + h):
        for x, y in ((-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2)):
            pts.append((cx + x * ca - y * sa, cy + x * sa + y * ca, z))
    return hexa(pts)


def aabb(x0, x1, y0, y1, z0, z1):
    return box((x0 + x1) / 2, (y0 + y1) / 2, z0, abs(x1 - x0), abs(y1 - y0), z1 - z0)


def beam(p, q, w, z0, h):
    """Horizontal bar from p to q (xy), width w, from z0 up h."""
    dx, dy = q[0] - p[0], q[1] - p[1]
    return box((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, z0, math.hypot(dx, dy), w, h, math.atan2(dy, dx))


def wedge(lo, hi, width, z0, h):
    """Ramp rising from lo (height 0) to hi (height h) with a vertical back at hi."""
    dx, dy = hi[0] - lo[0], hi[1] - lo[1]
    n = math.hypot(dx, dy)
    sx, sy = -dy / n * width / 2, dx / n * width / 2
    v = [(lo[0] + sx, lo[1] + sy, z0), (lo[0] - sx, lo[1] - sy, z0),
         (hi[0] - sx, hi[1] - sy, z0), (hi[0] + sx, hi[1] + sy, z0),
         (hi[0] + sx, hi[1] + sy, z0 + h), (hi[0] - sx, hi[1] - sy, z0 + h)]
    return v, [(0, 1, 2, 3), (0, 4, 5, 1), (3, 2, 5, 4), (0, 3, 4), (1, 5, 2)]


def _axis_map(axis):
    return {'Z': lambda a, b, c: (a, b, c), 'X': lambda a, b, c: (c, a, b), 'Y': lambda a, b, c: (a, c, b)}[axis]


def cylinder(c, r, h, n=12, axis='Z', smooth=True):
    """Cylinder starting at c and extending h along +axis; flat caps keep their own verts."""
    m = _axis_map(axis)
    ring = [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    v = []
    for z in (0, h, 0, h):
        v += [tuple(c[k] + m(x, y, z)[k] for k in range(3)) for x, y in ring]
    f = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    f += [tuple(2 * n + i for i in reversed(range(n))), tuple(3 * n + i for i in range(n))]
    return v, f, [smooth] * n + [False, False]


def annulus(c, r0, r1, z0, z1, n=24):
    v = []
    for r, z in ((r0, z0), (r1, z0), (r1, z1), (r0, z1)):
        v += [(c[0] + r * math.cos(2 * math.pi * i / n), c[1] + r * math.sin(2 * math.pi * i / n), z) for i in range(n)]
    f = []
    for i in range(n):
        j = (i + 1) % n
        for a in range(4):
            b = (a + 1) % 4
            f.append((a * n + i, a * n + j, b * n + j, b * n + i))
    return v, f


def torus(c, R, r, n=16, m=6, axis='Z'):
    mp = _axis_map(axis)
    v = []
    for i in range(n):
        a = 2 * math.pi * i / n
        for j in range(m):
            b = 2 * math.pi * j / m
            x, y, z = (R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)
            p = mp(x, y, z)
            v.append((c[0] + p[0], c[1] + p[1], c[2] + p[2]))
    f = [(i * m + j, i * m + (j + 1) % m, ((i + 1) % n) * m + (j + 1) % m, ((i + 1) % n) * m + j)
         for i in range(n) for j in range(m)]
    return v, f, [True] * len(f)


def ico(c, r, subdiv=1, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    bm.verts.index_update()
    v = [(c[0] + p.co.x * r * scale[0], c[1] + p.co.y * r * scale[1], c[2] + p.co.z * r * scale[2]) for p in bm.verts]
    f = [tuple(p.index for p in face.verts) for face in bm.faces]
    bm.free()
    return v, f, [True] * len(f)


def polygon_slab(pts, z0, z1):
    """Closed prism over a convex polygon (fan from centroid)."""
    n = len(pts)
    cx, cy = sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n
    v = [(x, y, z0) for x, y in pts] + [(x, y, z1) for x, y in pts] + [(cx, cy, z0), (cx, cy, z1)]
    f = []
    for i in range(n):
        j = (i + 1) % n
        f += [(i, j, n + j, n + i), (2 * n, j, i), (2 * n + 1, n + i, n + j)]
    return v, f


def transform(part, fn):
    out = [fn(p) for p in part[0]]
    return (out, *part[1:])


# ---------------------------------------------------------------- rounded-rectangle loop

class RoundedLoop:
    """Closed rounded rectangle traversed clockwise from (0,-hy) heading -X.

    point(seg, u, off): off > 0 is outward. A shared (seg, u) parameter list makes every
    offset ring share topology, so rings stitch into closed slabs.
    """

    def __init__(self, hx, hy, r, step=2.0, arc_n=16):
        self.hx, self.hy, self.r = hx, hy, r
        cx, cy = hx - r, hy - r
        lengths = [cx, r * math.pi / 2, 2 * cy, r * math.pi / 2, 2 * cx, r * math.pi / 2, 2 * cy, r * math.pi / 2, cx]
        self.params = []
        for s, L in enumerate(lengths):
            n = arc_n if s % 2 else max(1, round(L / step))
            self.params += [(s, i / n) for i in range(n)]
        self.length = sum(lengths)
        dense = []
        for s, L in enumerate(lengths):
            n = max(1, int(math.ceil(L / .25)))
            dense += [self.point(s, i / n, 0) for i in range(n)]
        self._dense = dense
        self._cum = [0.0]
        for i in range(1, len(dense) + 1):
            a, b = dense[i - 1], dense[i % len(dense)]
            self._cum.append(self._cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))

    def point(self, s, u, off):
        a, b, q = self.hx + off, self.hy + off, max(self.r + off, 0.0)
        cx, cy = a - q, b - q

        def arc(ox, oy, t0):
            t = math.radians(t0 - 90 * u)
            return (ox + q * math.cos(t), oy + q * math.sin(t))
        return [lambda: (-u * cx, -b), lambda: arc(-cx, -cy, -90), lambda: (-a, -cy + 2 * cy * u),
                lambda: arc(-cx, cy, 180), lambda: (-cx + 2 * cx * u, b), lambda: arc(cx, cy, 90),
                lambda: (a, cy - 2 * cy * u), lambda: arc(cx, -cy, 0), lambda: (cx - cx * u, -b)][s]()

    def ring(self, off):
        return [self.point(s, u, off) for s, u in self.params]

    def at(self, d):
        """Centreline position, unit tangent (race direction) and outward normal at arc length d."""
        L = self._cum[-1]
        d %= L
        lo, hi = 0, len(self._cum) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if self._cum[mid] <= d:
                lo = mid
            else:
                hi = mid
        a, b = self._dense[lo], self._dense[(lo + 1) % len(self._dense)]
        seg = self._cum[lo + 1] - self._cum[lo]
        t = (d - self._cum[lo]) / seg
        p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        tx, ty = (b[0] - a[0]) / seg, (b[1] - a[1]) / seg
        return p, (tx, ty), (-ty, tx)   # clockwise travel: left of tangent is outward

    def sdf(self, p, off):
        a, b, q = self.hx + off, self.hy + off, max(self.r + off, 0.0)
        dx, dy = abs(p[0]) - (a - q), abs(p[1]) - (b - q)
        return math.hypot(max(dx, 0), max(dy, 0)) + min(max(dx, dy), 0) - q

    def to_boundary(self, p, off):
        a, b, q = self.hx + off, self.hy + off, max(self.r + off, 0.0)
        ix, iy = a - q, b - q
        c = (max(-ix, min(ix, p[0])), max(-iy, min(iy, p[1])))
        dx, dy = p[0] - c[0], p[1] - c[1]
        d = math.hypot(dx, dy)
        if d > 1e-9:
            return (c[0] + q * dx / d, c[1] + q * dy / d)
        if a - abs(p[0]) < b - abs(p[1]):
            return (math.copysign(a, p[0] or 1), p[1])
        return (p[0], math.copysign(b, p[1] or 1))


def ring_slab(loop, off_in, off_out, z0, z1):
    pi, po = loop.ring(off_in), loop.ring(off_out)
    n = len(pi)
    v = []
    for a, b in zip(pi, po):
        v += [(a[0], a[1], z0), (a[0], a[1], z1), (b[0], b[1], z1), (b[0], b[1], z0)]
    f = []
    for i in range(n):
        j = (i + 1) % n
        for k in range(4):
            kk = (k + 1) % 4
            f.append((4 * i + k, 4 * i + kk, 4 * j + kk, 4 * j + k))
    return v, f


def ring_sheet(loop, offs, z):
    rows = [loop.ring(o) for o in offs]
    n = len(rows[0])
    v = [(p[0], p[1], z) for row in rows for p in row]
    f = [(r * n + i, r * n + (i + 1) % n, (r + 1) * n + (i + 1) % n, (r + 1) * n + i)
         for r in range(len(rows) - 1) for i in range(n)]
    return v, f


def grid_region(x0, x1, y0, y1, cell, inside, project, z):
    """Regular grid clipped to a region: cells with any corner inside are kept and their
    outside corners are projected onto the boundary, so the edge is smooth, not jagged."""
    nx, ny = int(math.ceil((x1 - x0) / cell)), int(math.ceil((y1 - y0) / cell))
    idx, v, f = {}, [], []

    def vert(i, j):
        if (i, j) not in idx:
            p = (x0 + i * cell, y0 + j * cell)
            if not inside(p):
                p = project(p)
            idx[(i, j)] = len(v)
            v.append((p[0], p[1], z))
        return idx[(i, j)]
    for i in range(nx):
        for j in range(ny):
            corners = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            if any(inside((x0 + a * cell, y0 + b * cell)) for a, b in corners):
                f.append(tuple(vert(a, b) for a, b in corners))
    return v, f


# ---------------------------------------------------------------- bake / export / render

def bake_ao(objs, distance=1.6, samples=24, floor=.38):
    """Cycles AO bake into a per-corner byte colour attribute 'AO' (exported as COLOR_0).
    Values are remapped to floor..1 so contact shadows read without crushing albedo."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    if scene.world is None:
        scene.world = bpy.data.worlds.new('World')
    scene.world.light_settings.distance = distance
    # Paint/decal sheets lie millimetres above the road: they must not occlude it.
    # Far backdrop is outside the AO distance of anything; giant triangles would smear it.
    decals = [o for o in objs if o.name.startswith(('VIS_decal_', 'VIS_far_'))]
    objs = [o for o in objs if o not in decals]
    for o in decals:
        o.hide_render = True
        attr = o.data.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER')
        o.data.color_attributes.active_color = attr
        buf = [1.0] * (len(attr.data) * 4)
        attr.data.foreach_set('color', buf)
    for o in objs:
        attr = o.data.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER')
        o.data.color_attributes.active_color = attr
        o.data.color_attributes.render_color_index = o.data.color_attributes.active_color_index
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', use_clear=True)
    lo, hi = 1.0, 0.0
    for o in objs:
        data = o.data.color_attributes['AO'].data
        buf = [0.0] * (len(data) * 4)
        data.foreach_get('color', buf)
        for i in range(0, len(buf), 4):
            a = buf[i]
            lo, hi = min(lo, a), max(hi, a)
            a = floor + (1 - floor) * a
            buf[i] = buf[i + 1] = buf[i + 2] = a
            buf[i + 3] = 1.0
        data.foreach_set('color', buf)
    for o in decals:
        o.hide_render = False
    return {'raw_min': round(lo, 3), 'raw_max': round(hi, 3), 'floor': floor, 'distance_m': distance, 'samples': samples}


def join_visuals_by_material():
    groups = {}
    for o in list(ROOT.children):
        if o.type == 'MESH' and o.name.startswith('VIS_'):
            groups.setdefault(o.data.materials[0].name, []).append(o)
    for mat, objs in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        j = bpy.context.view_layer.objects.active
        j.name = f'VIS_{mat}'
        j.data.name = f'VIS_{mat}'


def export_glb(path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in [ROOT, *ROOT.children_recursive]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = ROOT
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_apply=True,
                              export_extras=True, export_yup=True, export_cameras=False, export_lights=False,
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                              export_active_vertex_color_when_no_material=False, export_image_format='NONE')


def counts():
    vis_t = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in ROOT.children if o.name.startswith('VIS_'))
    col_t = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in _COLS)
    return {'visual_triangles': vis_t, 'collision_triangles': col_t, 'collision_meshes': len(_COLS),
            'materials': len(_MATS)}


def write_provenance(path, extra):
    data = {'generator': 'tools/rc/blender/districts/' + extra.pop('script'), 'blender': bpy.app.version_string,
            'license': 'MIT (original procedural geometry and flat PBR materials)', 'external_assets': [],
            'reference_game_assets': 'none; no Re-Volt/RVGL model, texture or data was read'}
    data.update(extra)
    Path(path).write_text(json.dumps(data, indent=2) + '\n')


def render_glb(glb, out, shots, res=(1280, 720), samples=24):
    """Review renders of the exported GLB itself (re-imported), COL_* hidden.
    Labelled Blender review renders: never evidence of in-engine appearance."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    scene = bpy.context.scene
    for o in scene.objects:
        if o.name.startswith('COL_'):
            o.hide_render = True
            o.hide_set(True)
    # COLOR_0 multiplies base colour (glTF semantics); wire it if the importer did not.
    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        nt = m.node_tree
        if any(n.bl_idname in ('ShaderNodeVertexColor', 'ShaderNodeAttribute') for n in nt.nodes):
            continue
        bsdf = next((n for n in nt.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled'), None)
        if not bsdf or bsdf.inputs['Base Color'].is_linked:
            continue
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.layer_name = ''
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1
        mix.inputs[7].default_value = bsdf.inputs['Base Color'].default_value
        nt.links.new(vc.outputs['Color'], mix.inputs[6])
        nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    world = bpy.data.worlds.new('Sky')
    scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (.42, .62, .95, 1)
    bg.inputs['Strength'].default_value = 1.1
    sun_data = bpy.data.lights.new('Sun', 'SUN')
    sun_data.energy = 3.6
    sun_data.color = (1, .93, .82)
    sun_data.angle = math.radians(2.5)
    sun = bpy.data.objects.new('Sun', sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(42), 0, math.radians(-35))
    scene.render.engine = 'BLENDER_EEVEE'
    try:
        scene.eevee.taa_render_samples = samples
    except Exception:
        pass
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    cam_data = bpy.data.cameras.new('Review')
    cam_data.clip_start = .05
    cam_data.clip_end = 2000
    cam = bpy.data.objects.new('Review', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    from mathutils import Vector
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    written = []
    for name, eye, target, lens in shots:
        # shots are given in Blender (+Z up) coordinates; the importer restored +Z up.
        cam.location = eye
        cam_data.lens = lens
        cam.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str((out / f'{name}.png').resolve())
        bpy.ops.render.render(write_still=True)
        written.append(scene.render.filepath)
    return written
