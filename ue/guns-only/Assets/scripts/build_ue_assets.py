#!/usr/bin/env python3
"""
Sculpt high-detail aviation StaticMeshes and airbase structures in Blender 5.2.0 LTS,
export multi-material FBX files oriented for UE 5.8 (+X Forward, +/-Y Wingspan, +Z Up, cm scale),
and render 3 headless visual verification previews to scratch/.
"""
import math
import os
import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

REPO_ASSETS = "/Users/iantodd/Projects/guns-only-rc-cache-release/.worktrees/ue5-native/ue/guns-only/Assets"
MESH_OUT_DIR = os.path.join(REPO_ASSETS, "Meshes")
TEX_DIR = os.path.join(REPO_ASSETS, "Textures")
SCRATCH_DIR = "/Users/iantodd/.gemini/antigravity/brain/5a13e2d1-ef89-456e-9dbd-a7b2f52e5623/scratch"


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0


def ensure_mat(name: str, rgba: tuple, metallic: float = 0.0, roughness: float = 0.5, emission: tuple = None):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emission is not None and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = emission
            bsdf.inputs["Emission Strength"].default_value = 3.0
    return mat


def create_mesh_object(name: str, mat_list: list) -> tuple:
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for m in mat_list:
        obj.data.materials.append(m)
    bm = bmesh.new()
    return obj, mesh, bm


def add_loft_rings(bm: bmesh.types.BMesh, rings: list, mat_idx: int, cap_start: bool = True, cap_end: bool = True) -> None:
    """Connect closed sequences of 3D Vector rings with smooth faces and outward winding."""
    bm_rings = []
    for ring in rings:
        bm_rings.append([bm.verts.new(Vector(p)) for p in ring])
    n = len(bm_rings[0])
    for r_i in range(len(bm_rings) - 1):
        r0 = bm_rings[r_i]
        r1 = bm_rings[r_i + 1]
        for i in range(n):
            ni = (i + 1) % n
            try:
                f = bm.faces.new((r0[i], r0[ni], r1[ni], r1[i]))
                f.material_index = mat_idx
                f.smooth = True
            except ValueError:
                pass
    if cap_start and len(bm_rings[0]) >= 3:
        try:
            f = bm.faces.new(list(reversed(bm_rings[0])))
            f.material_index = mat_idx
        except ValueError:
            pass
    if cap_end and len(bm_rings[-1]) >= 3:
        try:
            f = bm.faces.new(bm_rings[-1])
            f.material_index = mat_idx
        except ValueError:
            pass


def add_airfoil_wing(
    bm: bmesh.types.BMesh,
    root_le: Vector,
    root_te: Vector,
    tip_le: Vector,
    tip_te: Vector,
    root_thick: float,
    tip_thick: float,
    mat_idx: int,
    dihedral_camber: float = 0.015,
    span_segments: int = 3,
) -> None:
    """Loft a beveled symmetric/cambered diamond-airfoil lifting surface with clean tip & seams."""
    sections = []
    for s in range(span_segments + 1):
        t = s / float(span_segments)
        le = root_le.lerp(tip_le, t)
        te = root_te.lerp(tip_te, t)
        chord_dir = te - le
        span_dir = (tip_le - root_le).normalized()
        up_n = chord_dir.cross(span_dir)
        if up_n.length < 1e-6:
            up_n = Vector((0.0, 0.0, 1.0))
        else:
            up_n.normalize()
        # Keep normal generally aligned upward (+Z for wings, outward for vertical fins)
        thick = root_thick * (1.0 - t) + tip_thick * t
        camb = chord_dir.length * dihedral_camber * (1.0 - 0.5 * t)
        p_le = le
        p_fwd_top = le.lerp(te, 0.28) + up_n * (thick * 0.50 + camb)
        p_aft_top = le.lerp(te, 0.68) + up_n * (thick * 0.36 + camb * 0.6)
        p_te = te
        p_aft_bot = le.lerp(te, 0.68) - up_n * (thick * 0.28)
        p_fwd_bot = le.lerp(te, 0.28) - up_n * (thick * 0.38)
        sections.append([p_le, p_fwd_top, p_aft_top, p_te, p_aft_bot, p_fwd_bot])
    add_loft_rings(bm, sections, mat_idx, cap_start=True, cap_end=True)


def add_box(bm: bmesh.types.BMesh, center: tuple, size: tuple, mat_idx: int, rot_euler: tuple = None) -> None:
    """Create a scaled & positioned prism directly inside bm."""
    mat = Matrix.Translation(Vector(center))
    if rot_euler:
        mat = mat @ Euler(rot_euler, "XYZ").to_matrix().to_4x4()
    mat = mat @ Matrix.Diagonal(Vector((size[0], size[1], size[2], 1.0)))
    res = bmesh.ops.create_cube(bm, size=1.0, matrix=mat)
    verts = res["verts"]
    vert_set = set(verts)
    for f in bm.faces:
        if all(v in vert_set for v in f.verts):
            f.material_index = mat_idx


def add_cylinder(bm: bmesh.types.BMesh, center: tuple, r1: float, r2: float, depth: float, segs: int, mat_idx: int, rot_euler: tuple = None, smooth: bool = True) -> None:
    mat = Matrix.Translation(Vector(center))
    if rot_euler:
        mat = mat @ Euler(rot_euler, "XYZ").to_matrix().to_4x4()
    res = bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=depth, matrix=mat
    )
    vert_set = set(res["verts"])
    for f in bm.faces:
        if all(v in vert_set for v in f.verts):
            f.material_index = mat_idx
            f.smooth = smooth


def finalize_and_uv_export(obj, mesh, bm, filename: str, apply_bevel: bool = False) -> tuple:
    """Fix normals, generate clean UV projection, convert RH meters -> UE cm FBX (+X fwd, +Z up)."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    # Set smooth shading by angle (Blender 4/5 mesh smooth_by_angle or polygon smooth)
    for poly in mesh.polygons:
        poly.use_smooth = True

    if apply_bevel:
        bev = obj.modifiers.new(name="MicroBevel", type="BEVEL")
        bev.width = 0.018
        bev.segments = 1
        bev.limit_method = "ANGLE"
        bev.angle_limit = math.radians(38.0)
        bpy.ops.object.modifier_apply(modifier=bev.name)

    # Smart UV Project cleanly in Edit Mode so PBR textures map smoothly across every shell
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.008)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Apply unit conversion scale directly onto vertex coords before FBX export (1 m -> 100 cm)
    # Using scale=(100,100,100) + transforms_apply avoids FBX global_scale ambiguities in UE5.
    # Also keep (+X fwd, +/-Y width, +Z up) so UE converts RH->LH (+X, -Y, +Z) cleanly.
    out_path = os.path.join(MESH_OUT_DIR, filename)
    bpy.ops.export_scene.fbx(
        filepath=out_path,
        use_selection=True,
        apply_scale_options="FBX_SCALE_UNITS",
        global_scale=1.0,
        axis_forward="-Y",
        axis_up="Z",
        use_mesh_modifiers=True,
        mesh_smooth_type="FACE",
        bake_space_transform=False,
    )

    dims_cm = (obj.dimensions.x * 100.0, obj.dimensions.y * 100.0, obj.dimensions.z * 100.0)
    print(f"Exported {filename}: bounds = {dims_cm[0]:.0f} x {dims_cm[1]:.0f} x {dims_cm[2]:.0f} cm, verts={len(mesh.vertices)}")
    obj.select_set(False)
    return dims_cm


def make_f22_ring(x: float, cz: float, hw: float, ht: float, hb: float, chine_y: float = 0.92) -> list:
    """8-point faceted F-22A chined cross section ordered cleanly CCW around +X."""
    return [
        (x, 0.0, cz + ht),
        (x, hw * 0.42, cz + ht * 0.68),
        (x, hw * chine_y, cz + ht * 0.08),
        (x, hw, cz),
        (x, hw * 0.55, cz - hb * 0.72),
        (x, 0.0, cz - hb),
        (x, -hw * 0.55, cz - hb * 0.72),
        (x, -hw, cz),
        (x, -hw * chine_y, cz + ht * 0.08),
        (x, -hw * 0.42, cz + ht * 0.68),
    ]


def build_f22_raptor() -> bpy.types.Object:
    m_ram = ensure_mat("M_F22_RAM_Body", (0.34, 0.38, 0.42, 1.0), metallic=0.42, roughness=0.38)
    m_dark = ensure_mat("M_F22_DarkMetal", (0.10, 0.11, 0.13, 1.0), metallic=0.88, roughness=0.28)
    m_canopy = ensure_mat("M_F22_GoldCanopy", (0.85, 0.66, 0.22, 1.0), metallic=0.92, roughness=0.06)
    m_pit = ensure_mat("M_F22_CockpitInterior", (0.07, 0.08, 0.09, 1.0), metallic=0.15, roughness=0.75)
    m_nav = ensure_mat("M_NavLights", (0.2, 1.0, 0.4, 1.0), emission=(0.3, 1.0, 0.5, 1.0))

    obj, mesh, bm = create_mesh_object("SM_F22_Raptor", [m_ram, m_dark, m_canopy, m_pit, m_nav])

    # Main faceted chined fuselage (+9.50 m nose to -8.65 m nozzles -> ~18.9 m total with tail)
    fuse_specs = [
        ( 9.52,  0.00, 0.02, 0.02, 0.02, 0.90),
        ( 9.05,  0.02, 0.22, 0.14, 0.14, 0.95),
        ( 8.20,  0.04, 0.56, 0.30, 0.28, 0.96),
        ( 6.80,  0.06, 0.88, 0.48, 0.40, 0.96),
        ( 5.00,  0.04, 1.06, 0.58, 0.48, 0.94),
        ( 3.20,  0.00, 1.46, 0.64, 0.56, 0.92),
        ( 1.20, -0.02, 1.62, 0.66, 0.60, 0.92),
        (-1.20, -0.02, 1.64, 0.64, 0.58, 0.92),
        (-3.80,  0.00, 1.56, 0.60, 0.54, 0.92),
        (-6.20,  0.00, 1.44, 0.52, 0.46, 0.90),
        (-8.40,  0.00, 1.28, 0.38, 0.36, 0.88),
    ]
    add_loft_rings(bm, [make_f22_ring(*s) for s in fuse_specs], 0)

    # Dorsal engine humps + caret diverterless engine intakes
    for side in (-1.0, 1.0):
        caret_specs = [
            ( 3.70, -0.10, 0.36, 0.22, 0.30, 0.92),
            ( 2.60, -0.12, 0.44, 0.34, 0.36, 0.92),
            ( 0.20, -0.10, 0.48, 0.38, 0.40, 0.92),
            (-4.20, -0.04, 0.46, 0.36, 0.36, 0.90),
            (-7.80,  0.00, 0.38, 0.28, 0.28, 0.88),
        ]
        rings = [[(x, y + side * 1.04, z) for (x, y, z) in make_f22_ring(*s)] for s in caret_specs]
        add_loft_rings(bm, rings, 0)

        # Dark recessed caret intake lip & compressor cavity
        add_box(bm, (3.62, side * 1.06, -0.12), (0.28, 0.68, 0.46), 1, (0.0, 0.0, side * 0.22))

        # 42-deg clipped diamond main wing airfoil
        add_airfoil_wing(
            bm,
            Vector(( 2.45, side * 1.38, -0.03)),
            Vector((-4.35, side * 1.38, -0.04)),
            Vector((-2.25, side * 6.78, -0.09)),
            Vector((-4.22, side * 6.78, -0.09)),
            root_thick=0.26, tip_thick=0.07, mat_idx=0, span_segments=4,
        )

        # Clipped all-moving horizontal stabilators
        add_airfoil_wing(
            bm,
            Vector((-5.10, side * 1.24, -0.02)),
            Vector((-8.60, side * 1.24, -0.02)),
            Vector((-7.05, side * 4.42, -0.06)),
            Vector((-8.68, side * 4.42, -0.06)),
            root_thick=0.18, tip_thick=0.05, mat_idx=0, dihedral_camber=0.0, span_segments=2,
        )

        # 28-deg outward-canted twin trapezoidal vertical tails
        cant_s = math.sin(math.radians(28.0))
        cant_c = math.cos(math.radians(28.0))
        fin_h = 2.65
        top_y = side * (1.22 + fin_h * cant_s)
        top_z = 0.34 + fin_h * cant_c
        add_airfoil_wing(
            bm,
            Vector((-4.65, side * 1.22, 0.34)),
            Vector((-7.85, side * 1.22, 0.28)),
            Vector((-6.35, top_y, top_z)),
            Vector((-8.28, top_y, top_z - 0.08)),
            root_thick=0.18, tip_thick=0.06, mat_idx=0, dihedral_camber=0.0, span_segments=2,
        )

        # Twin rectangular 2D thrust-vectoring F119 nozzle shrouds & dark paddles
        add_box(bm, (-8.65, side * 0.62, 0.00), (0.62, 0.88, 0.56), 1)
        add_box(bm, (-8.92, side * 0.62,  0.22), (0.48, 0.72, 0.08), 1, (0.0, -0.14, 0.0))
        add_box(bm, (-8.92, side * 0.62, -0.22), (0.48, 0.72, 0.08), 1, (0.0,  0.14, 0.0))

        # Wingtip nav beacon
        add_box(bm, (-3.35, side * 6.79, -0.07), (0.28, 0.07, 0.07), 4)

    # Cockpit interior tub + ACES-II ejection seat + pilot helmet
    add_box(bm, (4.35, 0.0, 0.52), (1.95, 0.68, 0.26), 3)
    add_box(bm, (3.80, 0.0, 0.78), (0.36, 0.42, 0.62), 3, (0.0, -0.26, 0.0))
    add_cylinder(bm, (3.92, 0.0, 1.12), 0.14, 0.13, 0.24, 10, 3)

    # Sculpted frameless teardrop golden canopy bubble (12 stations along X)
    canopy_rings = []
    for k in range(11):
        u = k / 10.0
        cx = 6.35 - u * 4.25
        arch = math.sin(math.pi * u) ** 0.72
        cw = 0.06 + 0.48 * arch
        ch = 0.04 + 0.64 * arch
        cz = 0.48
        ring = []
        for a_i in range(10):
            ang = math.pi * (a_i / 9.0)  # +Y to -Y arc over top
            ring.append((cx, math.cos(ang) * cw, cz + math.sin(ang) * ch))
        # Close lower sill chord
        ring.extend([(cx, -cw * 0.85, cz - 0.04), (cx, cw * 0.85, cz - 0.04)])
        canopy_rings.append(ring)
    add_loft_rings(bm, canopy_rings, 2)

    finalize_and_uv_export(obj, mesh, bm, "SM_F22_Raptor.fbx", apply_bevel=True)
    return obj


def build_su27_flanker() -> bpy.types.Object:
    m_camo = ensure_mat("M_Su27_Splinter", (0.38, 0.50, 0.64, 1.0), metallic=0.35, roughness=0.42)
    m_ti = ensure_mat("M_Su27_Titanium", (0.42, 0.44, 0.52, 1.0), metallic=0.92, roughness=0.22)
    m_can = ensure_mat("M_Su27_Canopy", (0.68, 0.86, 0.98, 1.0), metallic=0.25, roughness=0.05)
    m_rad = ensure_mat("M_Su27_Radome", (0.86, 0.88, 0.90, 1.0), metallic=0.0, roughness=0.36)
    m_nav = ensure_mat("M_NavLights", (1.0, 0.25, 0.2, 1.0), emission=(1.0, 0.25, 0.2, 1.0))

    obj, mesh, bm = create_mesh_object("SM_Su27_Flanker", [m_camo, m_ti, m_can, m_rad, m_nav])

    # White drooped dielectric nose radome (+10.95 down to +6.95)
    radome_specs = [
        (10.95, -0.34, 0.02, 0.02, 0.02, 0.72),
        (10.00, -0.26, 0.22, 0.20, 0.20, 0.72),
        ( 8.60, -0.12, 0.44, 0.36, 0.34, 0.72),
        ( 6.95,  0.02, 0.62, 0.48, 0.40, 0.74),
    ]
    add_loft_rings(bm, [make_f22_ring(*s) for s in radome_specs], 3)
    # Pitot probe & IRST optical sphere
    add_cylinder(bm, (11.45, 0.0, -0.37), 0.015, 0.005, 1.05, 8, 1, (0.0, math.radians(93.5), 0.0))
    add_cylinder(bm, (6.72, 0.0, 0.54), 0.09, 0.09, 0.16, 10, 2, (0.0, math.radians(75.0), 0.0))

    # Fuselage spine & blended centerbody (21.9 m overall)
    spine_specs = [
        ( 6.95,  0.02, 0.62, 0.48, 0.40, 0.74),
        ( 4.80,  0.14, 0.74, 0.64, 0.42, 0.76),
        ( 2.00,  0.16, 0.84, 0.66, 0.38, 0.78),
        (-1.50,  0.12, 0.86, 0.56, 0.34, 0.78),
        (-5.60,  0.08, 0.72, 0.42, 0.28, 0.76),
        (-7.40,  0.05, 0.46, 0.28, 0.22, 0.74),
    ]
    add_loft_rings(bm, [make_f22_ring(*s) for s in spine_specs], 0)
    # Central tail stinger boom between twin engines
    add_loft_rings(bm, [
        make_f22_ring(-7.40, 0.05, 0.46, 0.28, 0.22, 0.74),
        make_f22_ring(-9.80, 0.02, 0.22, 0.16, 0.14, 0.74),
    ], 1)

    for side in (-1.0, 1.0):
        # Wide-spaced underslung AL-31F engine pods
        nacelle = [
            ( 2.15, -0.22, 0.46, 0.34, 0.36, 0.75),
            (-1.20, -0.18, 0.54, 0.42, 0.42, 0.75),
            (-5.40, -0.12, 0.52, 0.40, 0.40, 0.75),
            (-7.95, -0.06, 0.46, 0.38, 0.38, 0.75),
        ]
        rings = [[(x, y + side * 1.12, z) for (x, y, z) in make_f22_ring(*s)] for s in nacelle]
        add_loft_rings(bm, rings, 0)
        # Exposed titanium AL-31F nozzle shroud & serrated petals
        add_cylinder(bm, (-8.35, side * 1.12, -0.06), 0.46, 0.38, 0.95, 16, 1, (0.0, math.radians(90.0), 0.0))
        add_box(bm, (2.25, side * 1.12, -0.26), (0.35, 0.66, 0.46), 1)

        # Sweeping LERX blending nose to main wing
        add_airfoil_wing(
            bm,
            Vector((5.80, side * 0.62, 0.14)),
            Vector((1.80, side * 0.62, 0.06)),
            Vector((2.20, side * 1.72, 0.00)),
            Vector((0.80, side * 1.72, -0.02)),
            root_thick=0.22, tip_thick=0.14, mat_idx=0, span_segments=3,
        )

        # High-aspect swept main wing (14.7 m wingspan) + Sorbtsiya wingtip rails
        add_airfoil_wing(
            bm,
            Vector(( 2.25, side * 1.48, -0.02)),
            Vector((-3.30, side * 1.48, -0.04)),
            Vector((-3.65, side * 7.25, -0.10)),
            Vector((-5.45, side * 7.25, -0.10)),
            root_thick=0.24, tip_thick=0.07, mat_idx=0, span_segments=4,
        )
        add_cylinder(bm, (-4.55, side * 7.36, -0.10), 0.09, 0.08, 2.30, 10, 1, (0.0, math.radians(90.0), 0.0))
        add_box(bm, (-3.45, side * 7.42, -0.10), (0.24, 0.06, 0.06), 4)

        # Horizontal tailplanes
        add_airfoil_wing(
            bm,
            Vector((-5.55, side * 1.32, -0.04)),
            Vector((-8.90, side * 1.32, -0.04)),
            Vector((-7.70, side * 4.82, -0.10)),
            Vector((-9.42, side * 4.82, -0.10)),
            root_thick=0.16, tip_thick=0.05, mat_idx=0, dihedral_camber=0.0, span_segments=2,
        )

        # Upright twin vertical tails (0 deg cant) + titanium tips + ventral strakes
        add_airfoil_wing(
            bm,
            Vector((-4.95, side * 1.36, 0.28)),
            Vector((-8.55, side * 1.36, 0.24)),
            Vector((-7.30, side * 1.40, 3.15)),
            Vector((-8.95, side * 1.40, 3.10)),
            root_thick=0.18, tip_thick=0.06, mat_idx=0, dihedral_camber=0.0, span_segments=2,
        )
        add_airfoil_wing(
            bm,
            Vector((-6.15, side * 1.32, -0.38)),
            Vector((-8.05, side * 1.32, -0.34)),
            Vector((-6.95, side * 1.40, -1.05)),
            Vector((-8.15, side * 1.40, -1.00)),
            root_thick=0.09, tip_thick=0.03, mat_idx=0, dihedral_camber=0.0, span_segments=1,
        )

    # Clear-blue bubble canopy
    canopy_rings = []
    for k in range(11):
        u = k / 10.0
        cx = 6.55 - u * 4.55
        arch = math.sin(math.pi * u) ** 0.72
        cw = 0.05 + 0.44 * arch
        ch = 0.04 + 0.62 * arch
        cz = 0.56 + 0.14 * (1.0 - abs(2.0 * u - 1.0))
        ring = [(cx, math.cos(math.pi * (a_i / 9.0)) * cw, cz + math.sin(math.pi * (a_i / 9.0)) * ch) for a_i in range(10)]
        ring.extend([(cx, -cw * 0.85, cz - 0.05), (cx, cw * 0.85, cz - 0.05)])
        canopy_rings.append(ring)
    add_loft_rings(bm, canopy_rings, 2)

    finalize_and_uv_export(obj, mesh, bm, "SM_Su27_Flanker.fbx", apply_bevel=True)
    return obj


def build_f22_cockpit() -> bpy.types.Object:
    """1st-person cockpit interior aligned with CockpitCamera at (2.40, 0.00, 1.15) m, FOV 72 deg."""
    m_carb = ensure_mat("M_Cockpit_Carbon", (0.06, 0.065, 0.075, 1.0), metallic=0.20, roughness=0.58)
    m_mfd = ensure_mat("M_Cockpit_MFD", (0.08, 0.88, 0.45, 1.0), emission=(0.15, 1.0, 0.55, 1.0))
    m_hud = ensure_mat("M_HUD_Glass", (0.12, 0.85, 0.45, 0.25), roughness=0.04)
    m_metal = ensure_mat("M_F22_DarkMetal", (0.15, 0.17, 0.20, 1.0), metallic=0.85, roughness=0.30)

    obj, mesh, bm = create_mesh_object("SM_F22_Cockpit", [m_carb, m_mfd, m_hud, m_metal])

    # Curved matte glare shield hood well below forward eye line (eye is Z=1.15 at X=2.40)
    add_box(bm, (2.98,  0.00, 0.87), (0.34, 0.82, 0.04), 0, (0.0, 0.14, 0.0))
    add_box(bm, (2.95,  0.00, 0.72), (0.28, 0.84, 0.30), 0, (0.0, 0.22, 0.0))

    # Left/right side consoles + dual throttle + right HOTAS flight stick
    for side in (-1.0, 1.0):
        add_box(bm, (2.56, side * 0.39, 0.76), (0.68, 0.16, 0.22), 0)
        # Sleek peripheral canopy sill rails (outside central +/- 24 deg FOV)
        add_box(bm, (2.78, side * 0.44, 0.96), (0.64, 0.045, 0.05), 0)
        # Slim outer canopy arch struts rising above peripheral upper corners
        add_box(bm, (2.92, side * 0.37, 1.18), (0.035, 0.035, 0.42), 0, (side * 0.28, -0.35, 0.0))

    # Lower upper canopy frame bar safely high (+25 deg above camera axis)
    add_box(bm, (2.82, 0.00, 1.38), (0.045, 0.56, 0.04), 0)

    # Dual throttle quadrant (left) & HOTAS sidestick (right)
    add_box(bm, (2.62, -0.36, 0.90), (0.09, 0.10, 0.08), 3)
    add_box(bm, (2.62,  0.36, 0.91), (0.06, 0.05, 0.14), 3, (0.0, 0.12, 0.0))

    # Integrated Control Panel (ICP) pedestal & holographic HUD Combiner Frame (center open!)
    add_box(bm, (2.92,  0.00, 0.91), (0.08, 0.15, 0.07), 3)
    add_box(bm, (2.88, -0.16, 1.04), (0.025, 0.018, 0.19), 3, (0.0, -0.18, 0.0))
    add_box(bm, (2.88,  0.16, 1.04), (0.025, 0.018, 0.19), 3, (0.0, -0.18, 0.0))

    # Translucent emerald HUD Combiner Glass plate (angled -38 deg; leaves HUD bright)
    add_box(bm, (2.88,  0.00, 1.06), (0.004, 0.28, 0.18), 2, (0.0, -0.58, 0.0))

    # Three recessed MFD displays below glare shield mapped [0..1] planar UVs directly for T_Cockpit_MFD_Emissive!
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Add the 3 angled MFD display quads AFTER smart_project so we assign exact [0..1] UV coords!
    bm2 = bmesh.new()
    bm2.from_mesh(mesh)
    uv_layer = bm2.loops.layers.uv.verify()
    mfd_centers = [(-0.22, 0.77, 0.14, 0.14), (0.00, 0.74, 0.17, 0.16), (0.22, 0.77, 0.14, 0.14)]
    for cy, cz, hw, hh in mfd_centers:
        # Tilted toward pilot eye at X=2.40, Z=1.15
        cx = 2.86
        tilt = math.radians(-22.0)
        v_bl = bm2.verts.new(Vector((cx + hh * math.sin(tilt), cy - hw * 0.5, cz - hh * math.cos(tilt) * 0.5)))
        v_br = bm2.verts.new(Vector((cx + hh * math.sin(tilt), cy + hw * 0.5, cz - hh * math.cos(tilt) * 0.5)))
        v_tr = bm2.verts.new(Vector((cx - hh * math.sin(tilt), cy + hw * 0.5, cz + hh * math.cos(tilt) * 0.5)))
        v_tl = bm2.verts.new(Vector((cx - hh * math.sin(tilt), cy - hw * 0.5, cz + hh * math.cos(tilt) * 0.5)))
        face = bm2.faces.new((v_tl, v_bl, v_br, v_tr))  # facing toward -X pilot eye!
        face.material_index = 1
        uvs = [(0.0, 1.0), (0.0, 0.0), (1.0, 0.0), (1.0, 1.0)]
        for loop, uv in zip(face.loops, uvs):
            loop[uv_layer].uv = uv
    bm2.to_mesh(mesh)
    bm2.free()

    out_path = os.path.join(MESH_OUT_DIR, "SM_F22_Cockpit.fbx")
    bpy.ops.export_scene.fbx(
        filepath=out_path, use_selection=True, apply_scale_options="FBX_SCALE_UNITS",
        global_scale=1.0, axis_forward="-Y", axis_up="Z", use_mesh_modifiers=True, mesh_smooth_type="FACE",
    )
    dims_cm = (obj.dimensions.x * 100.0, obj.dimensions.y * 100.0, obj.dimensions.z * 100.0)
    print(f"Exported SM_F22_Cockpit.fbx: bounds = {dims_cm[0]:.0f} x {dims_cm[1]:.0f} x {dims_cm[2]:.0f} cm")
    obj.select_set(False)
    return obj


def build_afterburner_plume() -> bpy.types.Object:
    m_outer = ensure_mat("M_Afterburner_Outer", (1.0, 0.42, 0.08, 1.0), emission=(1.0, 0.42, 0.08, 1.0))
    m_core = ensure_mat("M_Afterburner_Core", (0.95, 0.96, 1.0, 1.0), emission=(0.8, 0.95, 1.0, 1.0))
    obj, mesh, bm = create_mesh_object("SM_Afterburner_Plume", [m_outer, m_core])

    for side in (-1.0, 1.0):
        yc = side * 0.62
        # Outer glowing plasma envelope anchored at X=0 extending to -5.8 m
        outer_rings = []
        for k, (x, ry, rz) in enumerate([
            ( 0.00, 0.44, 0.28),
            (-0.90, 0.48, 0.34),
            (-2.40, 0.38, 0.28),
            (-4.20, 0.22, 0.16),
            (-5.80, 0.03, 0.03),
        ]):
            outer_rings.append([
                (x, yc + ry * math.cos(2.0 * math.pi * a / 12.0), rz * math.sin(2.0 * math.pi * a / 12.0))
                for a in range(12)
            ])
        add_loft_rings(bm, outer_rings, 0)

        # 5 nested supersonic Mach shock diamonds along exhaust centerline!
        for d_idx in range(5):
            x_center = -0.55 - d_idx * 0.92
            rad = 0.26 * (1.0 - d_idx * 0.14)
            add_cylinder(bm, (x_center + 0.14, yc, 0.0), 0.02, rad, 0.28, 10, 1, (0.0, math.radians(90.0), 0.0))
            add_cylinder(bm, (x_center - 0.16, yc, 0.0), rad, 0.02, 0.32, 10, 1, (0.0, math.radians(90.0), 0.0))

    finalize_and_uv_export(obj, mesh, bm, "SM_Afterburner_Plume.fbx", apply_bevel=False)
    return obj


def build_son_base_structures() -> None:
    m_conc = ensure_mat("M_Base_Concrete", (0.58, 0.57, 0.54, 1.0), metallic=0.0, roughness=0.88)
    m_metal = ensure_mat("M_Base_Metal", (0.34, 0.37, 0.40, 1.0), metallic=0.80, roughness=0.38)
    m_glass = ensure_mat("M_Base_Glass", (0.14, 0.26, 0.36, 1.0), metallic=0.15, roughness=0.06)
    m_radome = ensure_mat("M_Su27_Radome", (0.88, 0.89, 0.91, 1.0), metallic=0.0, roughness=0.40)
    m_nav = ensure_mat("M_NavLights", (1.0, 0.12, 0.10, 1.0), emission=(1.0, 0.12, 0.10, 1.0))

    # 1. Son Control Tower (~28 m tall)
    obj, mesh, bm = create_mesh_object("SM_Son_ControlTower", [m_conc, m_glass, m_metal, m_nav])
    add_cylinder(bm, (0.0, 0.0, 10.5), 3.4, 2.5, 21.0, 8, 0, smooth=False)
    add_cylinder(bm, (0.0, 0.0, 21.4), 2.8, 4.4, 1.2, 8, 0, smooth=False)
    add_cylinder(bm, (0.0, 0.0, 23.6), 4.2, 4.9, 3.2, 8, 1, smooth=False)
    add_cylinder(bm, (0.0, 0.0, 25.5), 5.2, 4.8, 0.7, 8, 0, smooth=False)
    add_box(bm, (0.0, 0.0, 26.8), (3.8, 0.4, 1.2), 2)
    add_cylinder(bm, (0.0, 0.0, 28.1), 0.14, 0.14, 1.4, 8, 3)
    finalize_and_uv_export(obj, mesh, bm, "SM_Son_ControlTower.fbx", apply_bevel=True)

    # 2. Hardened Aircraft Shelter / HAS Hangar (24 x 34 x 11.5 m)
    obj, mesh, bm = create_mesh_object("SM_Son_Hangar", [m_conc, m_metal])
    add_box(bm, (0.0, -11.5, 4.0), (34.0, 2.2, 8.0), 0)
    add_box(bm, (0.0,  11.5, 4.0), (34.0, 2.2, 8.0), 0)
    # Vaulted arch over runway-facing +X/-X hangar bay
    arch_rings = []
    for x_station in (-16.8, -8.4, 0.0, 8.4, 16.8):
        ring = []
        for k in range(13):
            ang = math.pi * (k / 12.0)
            ring.append((x_station, math.cos(ang) * 12.2, 5.2 + math.sin(ang) * 6.4))
        for k in range(12, -1, -1):
            ang = math.pi * (k / 12.0)
            ring.append((x_station, math.cos(ang) * 11.2, 5.2 + math.sin(ang) * 5.6))
        arch_rings.append(ring)
    add_loft_rings(bm, arch_rings, 1)
    # Blast apron doors slightly open
    add_box(bm, (-16.8, -6.2, 3.8), (0.6, 8.5, 7.6), 1)
    add_box(bm, (-16.8,  6.2, 3.8), (0.6, 8.5, 7.6), 1)
    finalize_and_uv_export(obj, mesh, bm, "SM_Son_Hangar.fbx", apply_bevel=True)

    # 3. Geodesic Radar Dome (18 m tall)
    obj, mesh, bm = create_mesh_object("SM_Son_RadarDome", [m_conc, m_radome, m_nav])
    add_cylinder(bm, (0.0, 0.0, 4.5), 4.2, 3.6, 9.0, 12, 0)
    add_cylinder(bm, (0.0, 0.0, 9.2), 4.6, 4.6, 0.6, 12, 0)
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=6.4, matrix=Matrix.Translation((0.0, 0.0, 13.8)))
    for f in bm.faces:
        if all(v.co.z > 9.3 for v in f.verts):
            f.material_index = 1
            f.smooth = True
    add_cylinder(bm, (0.0, 0.0, 20.6), 0.14, 0.10, 1.0, 8, 2)
    finalize_and_uv_export(obj, mesh, bm, "SM_Son_RadarDome.fbx", apply_bevel=False)


def build_ah1g_cobra() -> bpy.types.Object:
    """Sculpted Bell AH-1G HueyCobra (~13.6 m fuselage, chin turret, stub wing rocket pods, skids)."""
    m_od = ensure_mat("M_AH1G_OliveDrab", (0.18, 0.22, 0.14, 1.0), metallic=0.18, roughness=0.48)
    m_dark = ensure_mat("M_F22_DarkMetal", (0.11, 0.12, 0.13, 1.0), metallic=0.85, roughness=0.30)
    m_canopy = ensure_mat("M_Su27_Canopy", (0.50, 0.68, 0.78, 1.0), metallic=0.25, roughness=0.06)
    m_nav = ensure_mat("M_NavLights", (1.0, 0.25, 0.18, 1.0), emission=(1.0, 0.25, 0.18, 1.0))

    obj, mesh, bm = create_mesh_object("SM_AH1G_Cobra", [m_od, m_dark, m_canopy, m_nav])

    def hex_ring(x: float, cz: float, hw: float, ht: float, hb: float):
        return [
            (x,  0.0,       cz + ht),
            (x,  hw * 0.68, cz + ht * 0.68),
            (x,  hw,        cz + 0.02),
            (x,  hw * 0.72, cz - hb * 0.85),
            (x,  0.0,       cz - hb),
            (x, -hw * 0.72, cz - hb * 0.85),
            (x, -hw,        cz + 0.02),
            (x, -hw * 0.68, cz + ht * 0.68),
        ]

    # Narrow tandem fuselage + doghouse pylon fairing -> tail boom
    fuse_specs = [
        ( 5.65, -0.10, 0.16, 0.18, 0.20),
        ( 4.90, -0.04, 0.34, 0.32, 0.34),
        ( 3.80,  0.04, 0.44, 0.42, 0.42),
        ( 2.40,  0.08, 0.49, 0.48, 0.46),
        ( 0.80,  0.22, 0.50, 0.92, 0.48),
        (-0.80,  0.24, 0.46, 0.94, 0.46),
        (-2.15,  0.16, 0.32, 0.64, 0.30),
        (-3.60,  0.10, 0.22, 0.28, 0.24),
        (-5.50,  0.14, 0.16, 0.22, 0.18),
        (-7.15,  0.22, 0.11, 0.16, 0.14),
    ]
    add_loft_rings(bm, [hex_ring(*sp) for sp in fuse_specs], 0)

    # Flat-pane armored tandem greenhouse canopy
    canopy_rings = [
        (4.25, -0.02, 0.24, 0.46, 0.04),
        (3.25,  0.02, 0.35, 0.72, 0.04),
        (2.15,  0.06, 0.40, 0.88, 0.04),
        (1.05,  0.10, 0.38, 0.94, 0.04),
        (0.25,  0.14, 0.34, 0.86, 0.04),
    ]
    add_loft_rings(bm, [hex_ring(*sp) for sp in canopy_rings], 2)

    # T53 turboshaft exhaust nozzle & main rotor mast hub shaft
    add_cylinder(bm, (-2.38, 0.0, 0.74), 0.24, 0.20, 0.68, 14, 1, (0.0, math.radians(90.0), 0.0))
    add_cylinder(bm, (0.00, 0.0, 1.32), 0.15, 0.12, 0.52, 12, 1)

    # M28A1 flexible chin turret + minigun / 40mm barrels
    add_cylinder(bm, (5.12, 0.0, -0.34), 0.28, 0.24, 0.32, 14, 1)
    add_cylinder(bm, (5.72, -0.10, -0.38), 0.045, 0.040, 0.88, 10, 1, (0.0, math.radians(90.0), 0.0))
    add_cylinder(bm, (5.66,  0.10, -0.38), 0.055, 0.050, 0.64, 10, 1, (0.0, math.radians(90.0), 0.0))

    # Swept stub wings + M261 19-tube Hydra-70 rocket pods + nav lights
    for side in (-1.0, 1.0):
        add_airfoil_wing(
            bm,
            Vector(( 0.82, side * 0.46, 0.08)),
            Vector((-0.48, side * 0.46, 0.06)),
            Vector(( 0.46, side * 1.66, 0.02)),
            Vector((-0.50, side * 1.66, 0.00)),
            root_thick=0.14, tip_thick=0.07, mat_idx=0, dihedral_camber=0.0, span_segments=2,
        )
        # Rocket pod pylon + pod
        add_box(bm, (0.02, side * 1.35, -0.09), (0.58, 0.08, 0.22), 1)
        add_cylinder(bm, (0.08, side * 1.35, -0.26), 0.21, 0.21, 1.62, 14, 1, (0.0, math.radians(90.0), 0.0))
        add_cylinder(bm, (0.94, side * 1.35, -0.26), 0.21, 0.08, 0.20, 14, 0, (0.0, math.radians(90.0), 0.0))
        add_box(bm, (0.00, side * 1.68, 0.02), (0.16, 0.05, 0.05), 3)

        # Landing skids & properly anchored diagonal cross-struts ((y=+-0.28,z=-0.38) -> (y=+-1.06,z=-1.06))
        add_cylinder(bm, (0.95, side * 1.06, -1.06), 0.048, 0.048, 4.10, 10, 1, (0.0, math.radians(90.0), 0.0))
        add_cylinder(bm, (2.98, side * 1.06, -0.96), 0.048, 0.032, 0.36, 8, 1, (0.0, math.radians(52.0), 0.0))
        add_box(bm, (2.15, side * 0.67, -0.72), (0.075, 1.08, 0.065), 1, (-side * math.radians(41.0), 0.0, 0.0))
        add_box(bm, (-0.15, side * 0.67, -0.72), (0.075, 1.08, 0.065), 1, (-side * math.radians(41.0), 0.0, 0.0))

        # Horizontal tailplanes
        add_airfoil_wing(
            bm,
            Vector((-5.25, side * 0.14, 0.22)),
            Vector((-5.92, side * 0.14, 0.22)),
            Vector((-5.42, side * 1.18, 0.20)),
            Vector((-5.96, side * 1.18, 0.20)),
            root_thick=0.07, tip_thick=0.03, mat_idx=0, dihedral_camber=0.0, span_segments=1,
        )

    # Tall swept vertical tail fin + gearbox hub + 2-blade tail rotor
    add_airfoil_wing(
        bm,
        Vector((-6.05, 0.00, 0.22)),
        Vector((-7.15, 0.00, 0.22)),
        Vector((-6.78, 0.00, 2.18)),
        Vector((-7.65, 0.00, 2.18)),
        root_thick=0.14, tip_thick=0.06, mat_idx=0, dihedral_camber=0.0, span_segments=2,
    )
    add_cylinder(bm, (-7.18, -0.14, 1.96), 0.11, 0.09, 0.24, 10, 1, (math.radians(90.0), 0.0, 0.0))
    add_box(bm, (-7.18, -0.24, 1.96), (0.18, 0.04, 1.96), 1)
    add_box(bm, (-7.18, -0.24, 2.86), (0.18, 0.042, 0.16), 3)

    finalize_and_uv_export(obj, mesh, bm, "SM_AH1G_Cobra.fbx", apply_bevel=True)
    return obj


def build_ah1g_main_rotor() -> bpy.types.Object:
    """13.4 m Bell 540 wide-chord two-blade main rotor centered at origin for spinning on mast."""
    m_dark = ensure_mat("M_F22_DarkMetal", (0.11, 0.12, 0.13, 1.0), metallic=0.85, roughness=0.30)
    m_stripe = ensure_mat("M_Runway_Markings", (0.92, 0.86, 0.22, 1.0), roughness=0.55)

    obj, mesh, bm = create_mesh_object("SM_AH1G_MainRotor", [m_dark, m_stripe])
    add_cylinder(bm, (0.0, 0.0, 0.0), 0.24, 0.20, 0.28, 12, 0)
    add_box(bm, (0.0, 0.0, 0.02), (0.20, 1.35, 0.12), 0)
    for side in (-1.0, 1.0):
        # Blade spans Y = +-0.50 .. +-6.70 m (13.4 m total rotor disc!)
        add_box(bm, (0.0, side * 3.40, 0.03), (0.64, 5.80, 0.045), 0)
        # Yellow/white tip stripe
        add_box(bm, (0.0, side * 6.45, 0.032), (0.64, 0.48, 0.048), 1)

    finalize_and_uv_export(obj, mesh, bm, "SM_AH1G_MainRotor.fbx", apply_bevel=False)
    return obj


def build_ah1g_cockpit() -> bpy.types.Object:
    """1st-person AH-1G pilot canopy framing aligned around eye at (1.55, 0.00, 0.85) m, FOV 72."""
    m_carb = ensure_mat("M_Cockpit_Carbon", (0.055, 0.06, 0.065, 1.0), metallic=0.20, roughness=0.58)
    m_mfd = ensure_mat("M_Cockpit_MFD", (0.08, 0.88, 0.45, 1.0), emission=(0.15, 1.0, 0.55, 1.0))
    m_hud = ensure_mat("M_HUD_Glass", (0.12, 0.85, 0.45, 0.25), roughness=0.04)
    m_metal = ensure_mat("M_F22_DarkMetal", (0.14, 0.16, 0.18, 1.0), metallic=0.85, roughness=0.30)

    obj, mesh, bm = create_mesh_object("SM_AH1G_Cockpit", [m_carb, m_mfd, m_hud, m_metal])
    add_box(bm, (2.18, 0.00, 0.58), (0.34, 0.68, 0.045), 0, (0.0, 0.16, 0.0))
    add_box(bm, (2.14, 0.00, 0.43), (0.28, 0.70, 0.28), 0, (0.0, 0.20, 0.0))
    for side in (-1.0, 1.0):
        add_box(bm, (1.76, side * 0.34, 0.46), (0.64, 0.12, 0.20), 0)
        add_box(bm, (1.92, side * 0.38, 0.68), (0.58, 0.04, 0.045), 0)
        add_box(bm, (2.08, side * 0.31, 0.92), (0.032, 0.032, 0.44), 3, (side * 0.22, -0.32, 0.0))
    add_box(bm, (1.94, 0.00, 1.12), (0.045, 0.52, 0.04), 3)
    # Reflex sight frame & glass (leaves central line crystal clear)
    add_box(bm, (2.02, -0.11, 0.72), (0.018, 0.015, 0.15), 3)
    add_box(bm, (2.02,  0.11, 0.72), (0.018, 0.015, 0.15), 3)
    add_box(bm, (2.02,  0.00, 0.74), (0.004, 0.20, 0.14), 2, (0.0, -0.52, 0.0))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")

    bm2 = bmesh.new()
    bm2.from_mesh(mesh)
    uv_layer = bm2.loops.layers.uv.verify()
    cx = 2.02
    tilt = math.radians(-20.0)
    for cy, cz, hw, hh in [(-0.14, 0.48, 0.13, 0.12), (0.14, 0.48, 0.13, 0.12)]:
        v_bl = bm2.verts.new(Vector((cx + hh * math.sin(tilt), cy - hw * 0.5, cz - hh * math.cos(tilt) * 0.5)))
        v_br = bm2.verts.new(Vector((cx + hh * math.sin(tilt), cy + hw * 0.5, cz - hh * math.cos(tilt) * 0.5)))
        v_tr = bm2.verts.new(Vector((cx - hh * math.sin(tilt), cy + hw * 0.5, cz + hh * math.cos(tilt) * 0.5)))
        v_tl = bm2.verts.new(Vector((cx - hh * math.sin(tilt), cy - hw * 0.5, cz + hh * math.cos(tilt) * 0.5)))
        face = bm2.faces.new((v_tl, v_bl, v_br, v_tr))
        face.material_index = 1
        for loop, uv in zip(face.loops, [(0.0, 1.0), (0.0, 0.0), (1.0, 0.0), (1.0, 1.0)]):
            loop[uv_layer].uv = uv
    bm2.to_mesh(mesh)
    bm2.free()

    out_path = os.path.join(MESH_OUT_DIR, "SM_AH1G_Cockpit.fbx")
    bpy.ops.export_scene.fbx(
        filepath=out_path, use_selection=True, apply_scale_options="FBX_SCALE_UNITS",
        global_scale=1.0, axis_forward="-Y", axis_up="Z", use_mesh_modifiers=True, mesh_smooth_type="FACE",
    )
    dims_cm = (obj.dimensions.x * 100.0, obj.dimensions.y * 100.0, obj.dimensions.z * 100.0)
    print(f"Exported SM_AH1G_Cockpit.fbx: bounds = {dims_cm[0]:.0f} x {dims_cm[1]:.0f} x {dims_cm[2]:.0f} cm")
    obj.select_set(False)
    return obj


def build_cobra_structures() -> None:
    m_conc = ensure_mat("M_Base_Concrete", (0.50, 0.48, 0.44, 1.0), roughness=0.86)
    m_od = ensure_mat("M_AH1G_OliveDrab", (0.18, 0.22, 0.14, 1.0), metallic=0.18, roughness=0.52)
    m_metal = ensure_mat("M_F22_DarkMetal", (0.14, 0.15, 0.17, 1.0), metallic=0.85, roughness=0.32)
    m_truss = ensure_mat("M_Base_Metal", (0.30, 0.33, 0.36, 1.0), metallic=0.82, roughness=0.38)
    m_deck = ensure_mat("M_Runway_Asphalt", (0.18, 0.19, 0.20, 1.0), roughness=0.80)

    # 1. Fortified Bunker / DShK Emplacement (~6.8 m)
    obj, mesh, bm = create_mesh_object("SM_Cobra_Bunker", [m_conc, m_od, m_metal])
    add_box(bm, (0.0, 0.0, 0.85), (6.6, 5.8, 1.7), 0)
    add_box(bm, (0.0, 0.0, 2.05), (5.8, 5.0, 0.55), 1)
    add_box(bm, (2.2, 0.0, 1.35), (1.8, 2.8, 0.36), 2)
    add_cylinder(bm, (1.4, 0.0, 2.75), 0.12, 0.09, 2.8, 10, 2, (0.0, math.radians(65.0), 0.0))
    finalize_and_uv_export(obj, mesh, bm, "SM_Cobra_Bunker.fbx", apply_bevel=True)

    # 2. Iron Bell Steel Truss Bridge (~92 m x 12.4 m deck, piers down to -10 m)
    obj, mesh, bm = create_mesh_object("SM_Cobra_Bridge", [m_truss, m_conc, m_deck])
    add_box(bm, (0.0, 0.0, 0.0), (92.0, 12.2, 1.1), 2)
    add_box(bm, (-42.0, 0.0, -5.0), (8.0, 12.8, 10.0), 1)
    add_box(bm, ( 42.0, 0.0, -5.0), (8.0, 12.8, 10.0), 1)
    add_box(bm, (  0.0, 0.0, -5.0), (4.6, 11.6, 10.0), 1)
    for side in (-1.0, 1.0):
        add_box(bm, (0.0, side * 5.8, 7.2), (86.0, 0.65, 0.65), 0)
        add_box(bm, (0.0, side * 5.8, 1.2), (88.0, 0.55, 1.20), 0)
        for ix in range(-40, 44, 10):
            add_box(bm, (float(ix), side * 5.8, 4.0), (0.65, 0.65, 6.4), 0)
            if ix < 40:
                add_box(bm, (float(ix) + 5.0, side * 5.8, 4.0), (11.6, 0.45, 0.45), 0, (0.0, math.radians(32.0), 0.0))
                add_box(bm, (float(ix) + 5.0, side * 5.8, 4.0), (11.6, 0.45, 0.45), 0, (0.0, math.radians(-32.0), 0.0))
    for ix in range(-36, 40, 12):
        add_box(bm, (float(ix), 0.0, 7.2), (0.55, 11.6, 0.55), 0)
    finalize_and_uv_export(obj, mesh, bm, "SM_Cobra_Bridge.fbx", apply_bevel=False)


def build_approach_gate_portal() -> None:
    m_gate = ensure_mat("M_Gate_Hologram", (0.15, 0.90, 1.0, 0.65), emission=(0.20, 0.95, 1.0, 1.0))
    obj, mesh, bm = create_mesh_object("SM_ApproachGate_Portal", [m_gate])
    # Hollow octagonal portal frame (~104 m wide x 32 m tall, open interior center)
    w_outer, h_outer, thick = 52.0, 16.0, 2.2
    c = 12.0
    pts_outer = [
        (0.0,  w_outer - c,  h_outer),
        (0.0,  w_outer,      h_outer - c),
        (0.0,  w_outer,     -h_outer + c),
        (0.0,  w_outer - c, -h_outer),
        (0.0, -w_outer + c, -h_outer),
        (0.0, -w_outer,     -h_outer + c),
        (0.0, -w_outer,      h_outer - c),
        (0.0, -w_outer + c,  h_outer),
    ]
    for i in range(len(pts_outer)):
        a = Vector(pts_outer[i])
        b = Vector(pts_outer[(i + 1) % len(pts_outer)])
        mid = 0.5 * (a + b)
        seg = b - a
        ang = math.atan2(seg.z, seg.y)
        add_box(bm, (mid.x, mid.y, mid.z), (3.4, seg.length + thick * 0.4, thick), 0, (ang, 0.0, 0.0))
    finalize_and_uv_export(obj, mesh, bm, "SM_ApproachGate_Portal.fbx", apply_bevel=True)


def build_f14_tomcat() -> bpy.types.Object:
    """Sculpted Grumman F-14A Tomcat (~19.1 m long, ~19.5 m spread wing, twin tails, wide nacelles)."""
    m_gray = ensure_mat("M_F14_NavyGray", (0.56, 0.59, 0.63, 1.0), metallic=0.32, roughness=0.38)
    m_dark = ensure_mat("M_F22_DarkMetal", (0.11, 0.12, 0.14, 1.0), metallic=0.88, roughness=0.28)
    m_can = ensure_mat("M_Su27_Canopy", (0.64, 0.84, 0.96, 1.0), metallic=0.25, roughness=0.05)
    m_nav = ensure_mat("M_NavLights", (1.0, 0.25, 0.18, 1.0), emission=(1.0, 0.25, 0.18, 1.0))

    obj, mesh, bm = create_mesh_object("SM_F14_Tomcat", [m_gray, m_dark, m_can, m_nav])

    # Forward fuselage + pancake tunnel (~19.1 m overall)
    fuse_specs = [
        ( 9.55, -0.10, 0.03, 0.03, 0.03, 0.80),
        ( 8.60, -0.04, 0.34, 0.28, 0.26, 0.82),
        ( 7.00,  0.04, 0.62, 0.46, 0.38, 0.85),
        ( 4.60,  0.10, 0.86, 0.56, 0.44, 0.90),
        ( 2.20,  0.04, 1.56, 0.52, 0.42, 0.95),
        (-1.60,  0.00, 1.66, 0.46, 0.38, 0.95),
        (-5.80, -0.02, 1.48, 0.40, 0.32, 0.92),
        (-8.60,  0.00, 0.54, 0.22, 0.18, 0.85),
    ]
    add_loft_rings(bm, [make_f22_ring(*s) for s in fuse_specs], 0)

    for side in (-1.0, 1.0):
        # Wide-spaced underslung TF30 engine nacelles & boxy F-14 variable ramps
        nac = [
            ( 3.20, -0.12, 0.52, 0.36, 0.40, 0.88),
            (-0.80, -0.10, 0.58, 0.44, 0.44, 0.88),
            (-5.40, -0.06, 0.56, 0.42, 0.42, 0.88),
            (-8.35, -0.04, 0.48, 0.40, 0.38, 0.86),
        ]
        rings = [[(x, y + side * 1.32, z) for (x, y, z) in make_f22_ring(*s)] for s in nac]
        add_loft_rings(bm, rings, 0)
        add_box(bm, (3.25, side * 1.32, -0.14), (0.35, 0.78, 0.56), 1)
        add_cylinder(bm, (-8.80, side * 1.32, -0.04), 0.47, 0.38, 0.92, 16, 1, (0.0, math.radians(90.0), 0.0))

        # Fixed triangular wing glove
        add_airfoil_wing(
            bm,
            Vector(( 3.40, side * 0.92, 0.10)),
            Vector((-0.20, side * 0.92, 0.04)),
            Vector(( 1.25, side * 3.15, 0.04)),
            Vector((-1.35, side * 3.15, 0.00)),
            root_thick=0.28, tip_thick=0.22, mat_idx=0, span_segments=2,
        )

        # Iconic variable-sweep main wing (28 deg dogfight sweep, 19.5 m total span)
        add_airfoil_wing(
            bm,
            Vector(( 1.45, side * 2.55, 0.04)),
            Vector((-1.65, side * 2.55, 0.00)),
            Vector((-2.60, side * 9.75, 0.12)),
            Vector((-4.15, side * 9.75, 0.10)),
            root_thick=0.24, tip_thick=0.07, mat_idx=0, span_segments=4,
        )
        add_box(bm, (-3.35, side * 9.78, 0.11), (0.24, 0.06, 0.06), 3)

        # All-moving tailerons
        add_airfoil_wing(
            bm,
            Vector((-5.20, side * 1.65, -0.04)),
            Vector((-8.75, side * 1.65, -0.04)),
            Vector((-7.45, side * 5.05, -0.12)),
            Vector((-9.15, side * 5.05, -0.12)),
            root_thick=0.18, tip_thick=0.05, mat_idx=0, dihedral_camber=0.0, span_segments=2,
        )

        # Twin outward-canted F-14 vertical stabilizers + ventral strakes
        cant_s = math.sin(math.radians(5.0))
        cant_c = math.cos(math.radians(5.0))
        fin_h = 2.85
        top_y = side * (1.42 + fin_h * cant_s)
        top_z = 0.36 + fin_h * cant_c
        add_airfoil_wing(
            bm,
            Vector((-4.85, side * 1.42, 0.36)),
            Vector((-8.45, side * 1.42, 0.32)),
            Vector((-6.85, top_y, top_z)),
            Vector((-8.75, top_y, top_z - 0.06)),
            root_thick=0.18, tip_thick=0.06, mat_idx=0, dihedral_camber=0.0, span_segments=2,
        )
        add_airfoil_wing(
            bm,
            Vector((-5.60, side * 1.38, -0.42)),
            Vector((-7.90, side * 1.38, -0.38)),
            Vector((-6.50, side * 1.44, -1.06)),
            Vector((-7.95, side * 1.44, -1.02)),
            root_thick=0.09, tip_thick=0.03, mat_idx=1, dihedral_camber=0.0, span_segments=1,
        )

    # Tandem bubble canopy (pilot + RIO)
    canopy_rings = []
    for k in range(12):
        u = k / 11.0
        cx = 6.20 - u * 4.85
        arch = math.sin(math.pi * u) ** 0.70
        cw = 0.06 + 0.46 * arch
        ch = 0.05 + 0.68 * arch
        cz = 0.56
        ring = [(cx, math.cos(math.pi * (a_i / 9.0)) * cw, cz + math.sin(math.pi * (a_i / 9.0)) * ch) for a_i in range(10)]
        ring.extend([(cx, -cw * 0.85, cz - 0.04), (cx, cw * 0.85, cz - 0.04)])
        canopy_rings.append(ring)
    add_loft_rings(bm, canopy_rings, 2)

    # Twin underbelly AIM-54/AIM-9 rails & A-frame tailhook
    add_cylinder(bm, (-7.65, 0.0, -0.45), 0.05, 0.04, 2.30, 8, 1, (0.0, math.radians(96.0), 0.0))

    finalize_and_uv_export(obj, mesh, bm, "SM_F14_Tomcat.fbx", apply_bevel=True)
    return obj


def build_f14_cockpit() -> bpy.types.Object:
    """1st-person F-14A windscreen bow & TID/VDI instrument deck around eye (2.40, 0, 1.15) m."""
    m_carb = ensure_mat("M_Cockpit_Carbon", (0.06, 0.065, 0.075, 1.0), metallic=0.22, roughness=0.58)
    m_mfd = ensure_mat("M_Cockpit_MFD", (0.08, 0.88, 0.45, 1.0), emission=(0.15, 1.0, 0.55, 1.0))
    m_hud = ensure_mat("M_HUD_Glass", (0.12, 0.85, 0.45, 0.25), roughness=0.04)
    m_metal = ensure_mat("M_F22_DarkMetal", (0.16, 0.18, 0.20, 1.0), metallic=0.85, roughness=0.30)

    obj, mesh, bm = create_mesh_object("SM_F14_Cockpit", [m_carb, m_mfd, m_hud, m_metal])
    add_box(bm, (2.98, 0.00, 0.86), (0.36, 0.80, 0.04), 0, (0.0, 0.14, 0.0))
    add_box(bm, (2.95, 0.00, 0.72), (0.30, 0.82, 0.30), 0, (0.0, 0.22, 0.0))
    for side in (-1.0, 1.0):
        add_box(bm, (2.56, side * 0.40, 0.76), (0.68, 0.16, 0.22), 0)
        add_box(bm, (2.78, side * 0.45, 0.96), (0.64, 0.045, 0.05), 0)
        add_box(bm, (2.92, side * 0.32, 1.19), (0.040, 0.040, 0.44), 3, (side * 0.24, -0.34, 0.0))
        add_box(bm, (2.82, side * 0.16, 1.38), (0.05, 0.22, 0.035), 3)
    add_box(bm, (2.88, -0.15, 1.04), (0.025, 0.018, 0.18), 3, (0.0, -0.18, 0.0))
    add_box(bm, (2.88,  0.15, 1.04), (0.025, 0.018, 0.18), 3, (0.0, -0.18, 0.0))
    add_box(bm, (2.88,  0.00, 1.06), (0.004, 0.28, 0.17), 2, (0.0, -0.58, 0.0))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")

    bm2 = bmesh.new()
    bm2.from_mesh(mesh)
    uv_layer = bm2.loops.layers.uv.verify()
    for cy, cz, hw, hh in [(-0.20, 0.77, 0.14, 0.14), (0.00, 0.74, 0.18, 0.17), (0.20, 0.77, 0.14, 0.14)]:
        cx = 2.86
        tilt = math.radians(-22.0)
        v_bl = bm2.verts.new(Vector((cx + hh * math.sin(tilt), cy - hw * 0.5, cz - hh * math.cos(tilt) * 0.5)))
        v_br = bm2.verts.new(Vector((cx + hh * math.sin(tilt), cy + hw * 0.5, cz - hh * math.cos(tilt) * 0.5)))
        v_tr = bm2.verts.new(Vector((cx - hh * math.sin(tilt), cy + hw * 0.5, cz + hh * math.cos(tilt) * 0.5)))
        v_tl = bm2.verts.new(Vector((cx - hh * math.sin(tilt), cy - hw * 0.5, cz + hh * math.cos(tilt) * 0.5)))
        face = bm2.faces.new((v_tl, v_bl, v_br, v_tr))
        face.material_index = 1
        for loop, uv in zip(face.loops, [(0.0, 1.0), (0.0, 0.0), (1.0, 0.0), (1.0, 1.0)]):
            loop[uv_layer].uv = uv
    bm2.to_mesh(mesh)
    bm2.free()

    out_path = os.path.join(MESH_OUT_DIR, "SM_F14_Cockpit.fbx")
    bpy.ops.export_scene.fbx(
        filepath=out_path, use_selection=True, apply_scale_options="FBX_SCALE_UNITS",
        global_scale=1.0, axis_forward="-Y", axis_up="Z", use_mesh_modifiers=True, mesh_smooth_type="FACE",
    )
    obj.select_set(False)
    print("Exported SM_F14_Cockpit.fbx")
    return obj


def build_mig28_adversary() -> bpy.types.Object:
    """Gloss-black F-5E / MiG-28 Adversary (~14.5 m long, ~8.1 m span, tip rails, single tall fin)."""
    m_blk = ensure_mat("M_MiG28_Black", (0.035, 0.038, 0.044, 1.0), metallic=0.25, roughness=0.18)
    m_dark = ensure_mat("M_F22_DarkMetal", (0.14, 0.15, 0.17, 1.0), metallic=0.88, roughness=0.26)
    m_can = ensure_mat("M_Su27_Canopy", (0.62, 0.80, 0.94, 1.0), metallic=0.25, roughness=0.06)
    m_nav = ensure_mat("M_NavLights", (1.0, 0.16, 0.12, 1.0), emission=(1.0, 0.16, 0.12, 1.0))

    obj, mesh, bm = create_mesh_object("SM_MiG28_Adversary", [m_blk, m_dark, m_can, m_nav])
    fuse_specs = [
        ( 7.35, -0.06, 0.02, 0.02, 0.02, 0.78),
        ( 6.40, -0.02, 0.24, 0.22, 0.20, 0.80),
        ( 4.80,  0.04, 0.44, 0.38, 0.34, 0.82),
        ( 2.40,  0.02, 0.56, 0.42, 0.40, 0.82),
        (-1.20,  0.00, 0.64, 0.44, 0.40, 0.82),
        (-4.60,  0.00, 0.60, 0.40, 0.36, 0.80),
        (-7.05,  0.00, 0.48, 0.30, 0.28, 0.78),
    ]
    add_loft_rings(bm, [make_f22_ring(*s) for s in fuse_specs], 0)
    add_cylinder(bm, (7.75, 0.0, -0.07), 0.014, 0.004, 0.80, 8, 1, (0.0, math.radians(91.0), 0.0))

    for side in (-1.0, 1.0):
        add_box(bm, (1.60, side * 0.66, 0.02), (1.10, 0.24, 0.32), 0)
        add_box(bm, (2.16, side * 0.66, 0.02), (0.08, 0.22, 0.28), 1)
        add_cylinder(bm, (-7.20, side * 0.28, 0.00), 0.24, 0.20, 0.55, 12, 1, (0.0, math.radians(90.0), 0.0))
        add_airfoil_wing(
            bm,
            Vector(( 0.85, side * 0.56, -0.14)),
            Vector((-2.60, side * 0.56, -0.14)),
            Vector((-1.50, side * 4.05, -0.16)),
            Vector((-2.85, side * 4.05, -0.16)),
            root_thick=0.14, tip_thick=0.05, mat_idx=0, span_segments=3,
        )
        add_cylinder(bm, (-2.15, side * 4.09, -0.16), 0.06, 0.05, 1.95, 8, 1, (0.0, math.radians(90.0), 0.0))
        add_box(bm, (-1.20, side * 4.12, -0.16), (0.16, 0.05, 0.05), 3)
        add_airfoil_wing(
            bm,
            Vector((-4.60, side * 0.48, -0.12)),
            Vector((-6.80, side * 0.48, -0.12)),
            Vector((-5.95, side * 2.55, -0.16)),
            Vector((-6.95, side * 2.55, -0.16)),
            root_thick=0.10, tip_thick=0.04, mat_idx=0, dihedral_camber=0.0, span_segments=2,
        )

    # Single tall swept vertical fin
    add_airfoil_wing(
        bm,
        Vector((-3.80, 0.00, 0.34)),
        Vector((-6.85, 0.00, 0.28)),
        Vector((-5.95, 0.00, 2.38)),
        Vector((-7.15, 0.00, 2.34)),
        root_thick=0.14, tip_thick=0.05, mat_idx=0, dihedral_camber=0.0, span_segments=2,
    )

    canopy_rings = []
    for k in range(10):
        u = k / 9.0
        cx = 4.45 - u * 3.15
        arch = math.sin(math.pi * u) ** 0.72
        cw = 0.04 + 0.34 * arch
        ch = 0.04 + 0.48 * arch
        cz = 0.42
        ring = [(cx, math.cos(math.pi * (a_i / 9.0)) * cw, cz + math.sin(math.pi * (a_i / 9.0)) * ch) for a_i in range(10)]
        ring.extend([(cx, -cw * 0.85, cz - 0.04), (cx, cw * 0.85, cz - 0.04)])
        canopy_rings.append(ring)
    add_loft_rings(bm, canopy_rings, 2)

    finalize_and_uv_export(obj, mesh, bm, "SM_MiG28_Adversary.fbx", apply_bevel=True)
    return obj


def build_rapier_interceptor() -> bpy.types.Object:
    """Mach 3+ hypersonic cranked-delta Rapier interceptor (~22 m long, ~10.6 m span)."""
    m_ti = ensure_mat("M_Rapier_Titanium", (0.24, 0.25, 0.29, 1.0), metallic=0.86, roughness=0.26)
    m_dark = ensure_mat("M_F22_DarkMetal", (0.09, 0.10, 0.12, 1.0), metallic=0.90, roughness=0.24)
    m_can = ensure_mat("M_F22_GoldCanopy", (0.88, 0.68, 0.22, 1.0), metallic=0.92, roughness=0.06)
    m_nav = ensure_mat("M_NavLights", (0.25, 0.90, 1.0, 1.0), emission=(0.25, 0.90, 1.0, 1.0))

    obj, mesh, bm = create_mesh_object("SM_Rapier_Interceptor", [m_ti, m_dark, m_can, m_nav])
    fuse_specs = [
        ( 11.20,  0.00, 0.02, 0.02, 0.02, 0.96),
        (  9.40,  0.02, 0.44, 0.18, 0.16, 0.98),
        (  6.20,  0.04, 0.88, 0.42, 0.30, 0.98),
        (  2.50,  0.02, 1.24, 0.56, 0.36, 0.96),
        ( -2.80,  0.00, 1.38, 0.52, 0.34, 0.96),
        ( -7.40,  0.00, 1.24, 0.42, 0.30, 0.94),
        (-10.40,  0.00, 0.92, 0.32, 0.24, 0.90),
    ]
    add_loft_rings(bm, [make_f22_ring(*s) for s in fuse_specs], 0)

    for side in (-1.0, 1.0):
        # Cranked-delta hypersonic wing + tip sails
        add_airfoil_wing(
            bm,
            Vector(( 4.80, side * 0.95, -0.02)),
            Vector((-8.80, side * 0.95, -0.04)),
            Vector((-3.20, side * 5.25, -0.08)),
            Vector((-8.60, side * 5.25, -0.08)),
            root_thick=0.22, tip_thick=0.06, mat_idx=0, span_segments=4,
        )
        # Inward-canted twin tails on blended nacelles
        cant_s = -math.sin(math.radians(16.0))
        cant_c = math.cos(math.radians(16.0))
        fin_h = 2.35
        top_y = side * (1.05 + fin_h * cant_s)
        top_z = 0.32 + fin_h * cant_c
        add_airfoil_wing(
            bm,
            Vector((-6.20, side * 1.05, 0.32)),
            Vector((-9.90, side * 1.05, 0.28)),
            Vector((-8.40, top_y, top_z)),
            Vector((-10.20, top_y, top_z - 0.05)),
            root_thick=0.14, tip_thick=0.05, mat_idx=0, dihedral_camber=0.0, span_segments=2,
        )
        add_cylinder(bm, (-10.65, side * 0.52, 0.00), 0.38, 0.32, 0.70, 14, 1, (0.0, math.radians(90.0), 0.0))
        add_box(bm, (-8.40, side * 5.28, -0.08), (0.28, 0.05, 0.05), 3)

    canopy_rings = []
    for k in range(10):
        u = k / 9.0
        cx = 7.40 - u * 4.40
        arch = math.sin(math.pi * u) ** 0.72
        cw = 0.05 + 0.40 * arch
        ch = 0.04 + 0.44 * arch
        cz = 0.42
        ring = [(cx, math.cos(math.pi * (a_i / 9.0)) * cw, cz + math.sin(math.pi * (a_i / 9.0)) * ch) for a_i in range(10)]
        ring.extend([(cx, -cw * 0.85, cz - 0.03), (cx, cw * 0.85, cz - 0.03)])
        canopy_rings.append(ring)
    add_loft_rings(bm, canopy_rings, 2)

    finalize_and_uv_export(obj, mesh, bm, "SM_Rapier_Interceptor.fbx", apply_bevel=True)
    return obj


def build_at802f_fireboss() -> bpy.types.Object:
    """Air Tractor AT-802F Fire Boss (~11.0 m long, ~18.0 m wingspan, twin Wipline amphibious floats)."""
    m_yel = ensure_mat("M_FireBoss_Yellow", (0.95, 0.72, 0.04, 1.0), metallic=0.12, roughness=0.28)
    m_dark = ensure_mat("M_F22_DarkMetal", (0.12, 0.13, 0.15, 1.0), metallic=0.85, roughness=0.32)
    m_can = ensure_mat("M_Su27_Canopy", (0.65, 0.85, 0.96, 1.0), metallic=0.20, roughness=0.05)
    m_stripe = ensure_mat("M_Runway_Markings", (0.85, 0.14, 0.12, 1.0), roughness=0.35)
    m_nav = ensure_mat("M_NavLights", (1.0, 0.25, 0.18, 1.0), emission=(1.0, 0.25, 0.18, 1.0))

    obj, mesh, bm = create_mesh_object("SM_AT802F_FireBoss", [m_yel, m_dark, m_can, m_stripe, m_nav])

    # Long PT6A turboprop nose + huge water hopper + aft raised greenhouse fuselage
    fuse_specs = [
        ( 5.55,  0.08, 0.18, 0.20, 0.20, 0.72),
        ( 4.10,  0.14, 0.34, 0.34, 0.34, 0.75),
        ( 1.90,  0.22, 0.62, 0.56, 0.56, 0.78),
        ( 0.00,  0.24, 0.64, 0.62, 0.60, 0.78),
        (-1.60,  0.18, 0.54, 0.52, 0.50, 0.76),
        (-3.60,  0.10, 0.34, 0.36, 0.34, 0.74),
        (-5.40,  0.06, 0.14, 0.22, 0.20, 0.70),
    ]
    add_loft_rings(bm, [make_f22_ring(*s) for s in fuse_specs], 0)
    # Propeller spinner + exhaust stubs
    add_cylinder(bm, (5.82, 0.0, 0.08), 0.22, 0.04, 0.55, 14, 1, (0.0, math.radians(90.0), 0.0))

    # High greenhouse cockpit above rear hopper
    canopy_rings = []
    for k in range(8):
        u = k / 7.0
        cx = 0.30 - u * 2.15
        arch = math.sin(math.pi * u) ** 0.55
        cw = 0.08 + 0.38 * arch
        ch = 0.06 + 0.54 * arch
        cz = 0.78
        ring = [(cx, math.cos(math.pi * (a_i / 9.0)) * cw, cz + math.sin(math.pi * (a_i / 9.0)) * ch) for a_i in range(10)]
        ring.extend([(cx, -cw * 0.85, cz - 0.04), (cx, cw * 0.85, cz - 0.04)])
        canopy_rings.append(ring)
    add_loft_rings(bm, canopy_rings, 2)

    for side in (-1.0, 1.0):
        # High-aspect 18.0 m Fire Boss wings with upward dihedral + wingtip plates
        add_airfoil_wing(
            bm,
            Vector(( 1.55, side * 0.58, -0.18)),
            Vector((-0.90, side * 0.58, -0.20)),
            Vector(( 1.15, side * 8.95,  0.22)),
            Vector((-0.65, side * 8.95,  0.20)),
            root_thick=0.32, tip_thick=0.14, mat_idx=0, span_segments=4,
        )
        # Red wingtip conspicuity fence
        add_box(bm, (0.25, side * 9.00, 0.24), (1.85, 0.05, 0.38), 3)
        add_box(bm, (0.95, side * 9.05, 0.24), (0.18, 0.06, 0.06), 4)

        # Horizontal tailplane
        add_airfoil_wing(
            bm,
            Vector((-4.30, side * 0.14, 0.14)),
            Vector((-5.35, side * 0.14, 0.14)),
            Vector((-4.55, side * 2.85, 0.16)),
            Vector((-5.38, side * 2.85, 0.16)),
            root_thick=0.12, tip_thick=0.05, mat_idx=0, dihedral_camber=0.0, span_segments=2,
        )

        # Twin Wipline 10000 amphibious floats (~8.4 m long) + splayed struts
        flt = [
            ( 4.65, -1.62, 0.05, 0.06, 0.05, 0.72),
            ( 3.20, -1.72, 0.38, 0.34, 0.30, 0.76),
            ( 0.20, -1.74, 0.44, 0.38, 0.34, 0.78),
            (-2.60, -1.70, 0.32, 0.28, 0.24, 0.76),
            (-4.25, -1.62, 0.10, 0.12, 0.10, 0.72),
        ]
        rings = [[(x, y + side * 1.65, z) for (x, y, z) in make_f22_ring(*s)] for s in flt]
        add_loft_rings(bm, rings, 1)
        # Struts connecting fuselage -> floats
        add_box(bm, (1.60, side * 1.05, -0.95), (0.10, 1.55, 0.08), 1, (side * 0.72, 0.0, 0.0))
        add_box(bm, (-0.40, side * 1.05, -0.95), (0.10, 1.55, 0.08), 1, (side * 0.72, 0.0, 0.0))

    # Tall swept vertical fin (yellow + red cap)
    add_airfoil_wing(
        bm,
        Vector((-4.00, 0.00, 0.22)),
        Vector((-5.45, 0.00, 0.18)),
        Vector((-4.75, 0.00, 2.38)),
        Vector((-5.55, 0.00, 2.34)),
        root_thick=0.16, tip_thick=0.07, mat_idx=0, dihedral_camber=0.0, span_segments=2,
    )
    add_box(bm, (-5.12, 0.0, 2.36), (0.85, 0.08, 0.24), 3)

    finalize_and_uv_export(obj, mesh, bm, "SM_AT802F_FireBoss.fbx", apply_bevel=True)
    return obj


def build_at802f_prop() -> bpy.types.Object:
    """5-blade PT6A Hartzell propeller centered at origin (spun around +X at nose)."""
    m_dark = ensure_mat("M_F22_DarkMetal", (0.11, 0.12, 0.13, 1.0), metallic=0.88, roughness=0.28)
    m_tip = ensure_mat("M_Runway_Markings", (0.96, 0.86, 0.15, 1.0), roughness=0.40)
    obj, mesh, bm = create_mesh_object("SM_AT802F_Prop", [m_dark, m_tip])
    add_cylinder(bm, (0.0, 0.0, 0.0), 0.18, 0.14, 0.24, 12, 0, (0.0, math.radians(90.0), 0.0))
    for i in range(5):
        ang = 2.0 * math.pi * i / 5.0
        dy = math.cos(ang)
        dz = math.sin(ang)
        add_box(bm, (0.02, dy * 0.78, dz * 0.78), (0.04, 1.45, 0.18), 0, (ang, 0.0, 0.0))
        add_box(bm, (0.02, dy * 1.42, dz * 1.42), (0.044, 0.20, 0.17), 1, (ang, 0.0, 0.0))
    finalize_and_uv_export(obj, mesh, bm, "SM_AT802F_Prop.fbx", apply_bevel=False)
    return obj


def build_carrier_hull() -> bpy.types.Object:
    """Nimitz/Enterprise angled-deck carrier: 320m x 76m, deck surface at Z=0, hull down to -22m, starboard island."""
    m_deck = ensure_mat("M_Carrier_Deck", (0.14, 0.15, 0.16, 1.0), roughness=0.82)
    m_hull = ensure_mat("M_Base_Concrete", (0.36, 0.39, 0.42, 1.0), metallic=0.35, roughness=0.72)
    m_dark = ensure_mat("M_F22_DarkMetal", (0.12, 0.13, 0.15, 1.0), metallic=0.82, roughness=0.36)
    m_mark = ensure_mat("M_Runway_Markings", (0.94, 0.90, 0.72, 1.0), roughness=0.60)
    m_nav = ensure_mat("M_NavLights", (1.0, 0.70, 0.18, 1.0), emission=(1.0, 0.70, 0.18, 1.0))

    obj, mesh, bm = create_mesh_object("SM_Carrier_Hull", [m_deck, m_hull, m_dark, m_mark, m_nav])

    # Lower steel hull (-22 m waterline/keel up to -1.8 m under flight deck)
    hull_specs = [
        ( 158.0, -11.9,  3.5, 10.1, 10.1, 0.72),
        ( 125.0, -11.9, 15.0, 10.1, 10.1, 0.78),
        (  60.0, -11.9, 22.0, 10.1, 10.1, 0.82),
        ( -70.0, -11.9, 22.0, 10.1, 10.1, 0.82),
        (-135.0, -11.9, 17.5, 10.1, 10.1, 0.78),
        (-156.0, -11.9, 14.0, 10.1, 10.1, 0.74),
    ]
    add_loft_rings(bm, [make_f22_ring(*s) for s in hull_specs], 1)

    # Wide cantilevered flight deck slab: top surface sits right at Z = 0.0 (DeckLength=320, Width=76)
    add_box(bm, (-2.0, 0.0, -0.90), (308.0, 56.0, 1.80), 0)
    add_box(bm, ( 98.0, 0.0, -0.98), (112.0, 40.0, 1.80), 0)
    # Angled waist sponson extending port (-Y) to 76m total width (stepped slightly down to eliminate z-fighting)
    add_box(bm, (-24.0, -24.0, -0.96), (210.0, 28.0, 1.80), 0, (0.0, 0.0, math.radians(-9.0)))

    # Angled landing deck white centerline + edge markings + 4 arresting wires (Z = +0.06 m)
    ang = math.radians(-9.0)
    cos_a, sin_a = math.cos(ang), math.sin(ang)
    # Landing origin is aft-port (~(-20, -11)), strip angled -9 deg
    for seg in range(10):
        along = -125.0 + seg * 20.0
        cx = along * cos_a - (-10.0) * sin_a
        cy = along * sin_a + (-10.0) * cos_a
        add_box(bm, (cx, cy, 0.05), (9.5, 0.85, 0.10), 3, (0.0, 0.0, ang))
    # 4 arresting wires near touchdown (-64 m along = -0.2 * 320)
    for w_i in range(4):
        along = -64.0 + (w_i - 2) * 5.2
        cx = along * cos_a - (-10.0) * sin_a
        cy = along * sin_a + (-10.0) * cos_a
        add_box(bm, (cx, cy, 0.06), (0.28, 30.0, 0.12), 2, (0.0, 0.0, ang))
    # Bow catapult tracks & optical landing lens meatball box
    add_box(bm, (96.0, -6.5, 0.05), (92.0, 0.55, 0.10), 3)
    add_box(bm, (96.0,  9.5, 0.05), (92.0, 0.55, 0.10), 3)
    add_box(bm, (-78.0, -34.0, 1.6), (2.4, 2.2, 2.8), 4)

    # Starboard island superstructure (match Carrier.cs +along 8..48m, starboard edge Y=+24..33m, +29m tall)
    add_box(bm, (28.0, 26.5,  7.5), (42.0, 9.0, 15.0), 1)
    add_box(bm, (26.0, 26.5, 17.5), (26.0, 8.2,  6.5), 1)
    add_box(bm, (32.0, 26.5, 22.8), (12.0, 6.2,  4.2), 2)
    add_cylinder(bm, (16.0, 26.5, 26.0), 0.7, 0.4, 11.0, 8, 2)
    add_box(bm, (16.0, 26.5, 31.2), (0.6, 5.4, 1.4), 3)
    add_box(bm, (16.0, 26.5, 32.4), (0.5, 0.5, 0.6), 4)

    finalize_and_uv_export(obj, mesh, bm, "SM_Carrier_Hull.fbx", apply_bevel=False)
    return obj


def build_balloon_mine() -> bpy.types.Object:
    """High-altitude white weather balloon (~16 m sphere) + suspended steel payload frame."""
    m_bal = ensure_mat("M_Balloon_White", (0.94, 0.96, 1.0, 1.0), roughness=0.22)
    m_dark = ensure_mat("M_F22_DarkMetal", (0.14, 0.16, 0.18, 1.0), metallic=0.85, roughness=0.32)
    obj, mesh, bm = create_mesh_object("SM_Balloon_Mine", [m_bal, m_dark])
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=7.5, matrix=Matrix.Translation((0.0, 0.0, 6.5)))
    for f in bm.faces:
        f.material_index = 0
        f.smooth = True
    add_box(bm, (0.0, 0.0, -4.5), (1.8, 1.8, 1.4), 1)
    add_box(bm, (0.0, 0.0, -4.5), (0.25, 14.0, 0.25), 1)
    add_cylinder(bm, (0.0, 0.0, -2.0), 0.06, 0.06, 4.5, 8, 1)
    finalize_and_uv_export(obj, mesh, bm, "SM_Balloon_Mine.fbx", apply_bevel=False)
    return obj


def build_effects_and_trees() -> None:
    """3D Fireball core, billowing smoke puff, Ukraine windbreak tree, and Okanagan pine conifer."""
    m_fire = ensure_mat("M_Explosion_Fire", (1.0, 0.45, 0.08, 1.0), emission=(1.0, 0.48, 0.10, 1.0))
    obj, mesh, bm = create_mesh_object("SM_Explosion_Core", [m_fire])
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    for f in bm.faces:
        f.material_index = 0
        f.smooth = True
    finalize_and_uv_export(obj, mesh, bm, "SM_Explosion_Core.fbx", apply_bevel=False)

    m_smk = ensure_mat("M_Smoke_Plume", (0.10, 0.10, 0.11, 1.0), roughness=0.95)
    obj, mesh, bm = create_mesh_object("SM_Smoke_Puff", [m_smk])
    for ox, oy, oz, rad in [(0.0, 0.0, 0.0, 1.0), (0.55, 0.35, 0.25, 0.72), (-0.45, -0.35, 0.35, 0.68)]:
        res = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=rad, matrix=Matrix.Translation((ox, oy, oz)))
        vset = set(res["verts"])
        for f in bm.faces:
            if all(v in vset for v in f.verts):
                f.material_index = 0
                f.smooth = True
    finalize_and_uv_export(obj, mesh, bm, "SM_Smoke_Puff.fbx", apply_bevel=False)

    m_trunk = ensure_mat("M_Tree_Trunk", (0.18, 0.13, 0.09, 1.0), roughness=0.90)
    m_leaf = ensure_mat("M_Tree_Foliage", (0.11, 0.22, 0.09, 1.0), roughness=0.78)

    # Ukraine Shelterbelt Deciduous Tree (~14 m tall, base at Z=0)
    obj, mesh, bm = create_mesh_object("SM_Shelterbelt_Tree", [m_trunk, m_leaf])
    add_cylinder(bm, (0.0, 0.0, 2.8), 0.36, 0.18, 5.6, 8, 0)
    for cx, cy, cz, r in [(0.0, 0.0, 8.2, 3.6), (1.8, 1.1, 7.2, 2.6), (-1.7, 0.9, 7.5, 2.7), (0.2, -1.8, 7.0, 2.5), (0.0, 0.0, 10.8, 2.6)]:
        res = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r, matrix=Matrix.Translation((cx, cy, cz)))
        vset = set(res["verts"])
        for f in bm.faces:
            if all(v in vset for v in f.verts):
                f.material_index = 1
                f.smooth = True
    finalize_and_uv_export(obj, mesh, bm, "SM_Shelterbelt_Tree.fbx", apply_bevel=False)

    # Okanagan Douglas-Fir / Pine Conifer (~22 m tall, base at Z=0)
    obj, mesh, bm = create_mesh_object("SM_Pine_Tree", [m_trunk, m_leaf])
    add_cylinder(bm, (0.0, 0.0, 4.0), 0.42, 0.16, 8.0, 8, 0)
    for zc, rad, h in [(6.8, 3.8, 5.2), (10.2, 3.2, 5.0), (13.6, 2.5, 4.6), (16.8, 1.8, 4.2), (19.6, 1.1, 3.6)]:
        add_cylinder(bm, (0.0, 0.0, zc), rad, 0.15, h, 9, 1, smooth=True)
    finalize_and_uv_export(obj, mesh, bm, "SM_Pine_Tree.fbx", apply_bevel=False)


def convert_cobra_glbs() -> None:
    """Import real Cobra Vietnam vegetation GLBs, re-center cleanly at (0,0,0) base, map material slots, export FBX."""
    veg_dir = "/Users/iantodd/Projects/guns-only-rc-cache-release/.worktrees/ue5-native/content/packs/cobra-vietnam/assets/vegetation"
    configs = [
        ("palm-cluster.glb", "SM_Cobra_PalmCluster", 10.5, 0.35, {"PalmTree_Trunk": "M_Palm_Trunk", "PalmTree_Leaves": "M_Palm_Leaves"}),
        ("plant-clumps.glb", "SM_Cobra_PlantClump", 2.4, 0.45, {"Flowers": "M_Cobra_Plants"}),
    ]
    for glb_file, out_name, target_height_m, spread_scale, slot_map in configs:
        glb_path = os.path.join(veg_dir, glb_file)
        if not os.path.exists(glb_path):
            print(f"Skipping missing GLB: {glb_path}")
            continue

        bpy.ops.object.select_all(action="DESELECT")
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=glb_path)
        imported = [o for o in (set(bpy.data.objects) - before) if o.type == "MESH"]
        if not imported:
            raise RuntimeError(f"No meshes imported from {glb_path}")

        # Apply rotation/scale locally per node so vertex coords become upright meters, then center cluster at origin
        bpy.ops.object.select_all(action="DESELECT")
        locs = []
        for o in imported:
            o.parent = None
            bpy.context.view_layer.objects.active = o
            o.select_set(True)
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
            locs.append(o.location.copy())
            o.select_set(False)

        mean_xy = Vector((sum(p.x for p in locs) / len(locs), sum(p.y for p in locs) / len(locs), 0.0))
        for idx, o in enumerate(imported):
            rel = o.location - mean_xy
            o.location = Vector((rel.x * spread_scale, rel.y * spread_scale, 0.0))

        bpy.ops.object.select_all(action="DESELECT")
        for o in imported:
            o.select_set(True)
        bpy.context.view_layer.objects.active = imported[0]
        bpy.ops.object.join()
        merged = bpy.context.view_layer.objects.active
        merged.name = out_name
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

        # Normalize vertical base Z=0 and scale to target_height_m
        zs = [v.co.z for v in merged.data.vertices]
        min_z, max_z = min(zs), max(zs)
        cur_h = max(0.05, max_z - min_z)
        scl = target_height_m / cur_h
        for v in merged.data.vertices:
            v.co.x *= scl
            v.co.y *= scl
            v.co.z = (v.co.z - min_z) * scl
        merged.data.update()

        # Rename materials to match /Game/GunsOnly/Materials/<SlotName>
        for slot in merged.material_slots:
            if slot.material is None:
                continue
            orig = slot.material.name.split(".")[0]
            target_mat = slot_map.get(orig)
            if target_mat:
                slot.material.name = target_mat

        out_path = os.path.join(MESH_OUT_DIR, f"{out_name}.fbx")
        bpy.ops.export_scene.fbx(
            filepath=out_path, use_selection=True, apply_scale_options="FBX_SCALE_UNITS",
            global_scale=1.0, axis_forward="-Y", axis_up="Z", use_mesh_modifiers=True, mesh_smooth_type="FACE",
        )
        dims_cm = (merged.dimensions.x * 100.0, merged.dimensions.y * 100.0, merged.dimensions.z * 100.0)
        print(f"Converted {glb_file} -> {out_name}.fbx: bounds = {dims_cm[0]:.0f} x {dims_cm[1]:.0f} x {dims_cm[2]:.0f} cm, slots={[s.material.name for s in merged.material_slots if s.material]}")
        merged.select_set(False)


def render_previews() -> None:
    """Render fast studio verification PNGs using Blender Workbench to scratch/."""
    os.makedirs(SCRATCH_DIR, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.world = bpy.data.worlds.new("StudioWorld")
    scene.world.color = (0.07, 0.10, 0.14)

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    def point_cam(loc, target, fov_deg=45.0):
        cam_obj.location = Vector(loc)
        cam_data.lens_unit = "FOV"
        cam_data.angle = math.radians(fov_deg)
        cam_obj.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()

    def hide_all():
        for o in scene.objects:
            if o.type == "MESH":
                o.hide_render = True

    hide_all()
    bpy.data.objects["SM_F22_Raptor"].hide_render = False
    ab = bpy.data.objects["SM_Afterburner_Plume"]
    ab.hide_render = False
    ab.location = Vector((-8.85, 0.0, 0.0))
    point_cam((11.5, -13.5, 4.8), (-1.2, 0.0, 0.2), 42.0)
    scene.render.filepath = os.path.join(SCRATCH_DIR, "preview_f22.png")
    bpy.ops.render.render(write_still=True)

    hide_all()
    bpy.data.objects["SM_F14_Tomcat"].hide_render = False
    point_cam((14.0, -16.5, 5.8), (-1.0, 0.0, 0.2), 44.0)
    scene.render.filepath = os.path.join(SCRATCH_DIR, "preview_f14.png")
    bpy.ops.render.render(write_still=True)

    hide_all()
    bpy.data.objects["SM_AT802F_FireBoss"].hide_render = False
    pr = bpy.data.objects["SM_AT802F_Prop"]
    pr.hide_render = False
    pr.location = Vector((5.60, 0.0, 0.08))
    point_cam((11.0, -13.5, 4.5), (0.0, 0.0, 0.2), 42.0)
    scene.render.filepath = os.path.join(SCRATCH_DIR, "preview_fireboss.png")
    bpy.ops.render.render(write_still=True)

    hide_all()
    bpy.data.objects["SM_Carrier_Hull"].hide_render = False
    point_cam((-220.0, -145.0, 75.0), (10.0, 0.0, 5.0), 48.0)
    scene.render.filepath = os.path.join(SCRATCH_DIR, "preview_carrier.png")
    bpy.ops.render.render(write_still=True)


def main() -> None:
    os.makedirs(MESH_OUT_DIR, exist_ok=True)
    reset_scene()
    build_f22_raptor()
    build_su27_flanker()
    build_f22_cockpit()
    build_afterburner_plume()
    build_son_base_structures()
    build_ah1g_cobra()
    build_ah1g_main_rotor()
    build_ah1g_cockpit()
    build_cobra_structures()
    build_approach_gate_portal()
    build_f14_tomcat()
    build_f14_cockpit()
    build_mig28_adversary()
    build_rapier_interceptor()
    build_at802f_fireboss()
    build_at802f_prop()
    build_carrier_hull()
    build_balloon_mine()
    build_effects_and_trees()
    convert_cobra_glbs()
    render_previews()
    print("Blender sculpt + export + studio preview complete.")


if __name__ == "__main__":
    main()
