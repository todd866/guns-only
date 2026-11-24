#!/usr/bin/env python3
"""
UE 5.8 headless Editor Python pipeline:
1. Import all generated PNGs under Assets/Textures/ into /Game/GunsOnly/Textures/
   with proper sRGB/Compression settings (TC_Normalmap, TC_Masks, TC_Default).
2. Create and compile full PBR + emissive + translucent UE 5.8 UMaterials under
   /Game/GunsOnly/Materials/ (multi-octave world-aligned Ukraine terrain, Have Glass V F-22,
   splinter Su-27S, glowing MFD cockpit, Mach shock-diamond afterburners, HDR PAPI, vapor).
3. Import all Blender FBX meshes from Assets/Meshes/ into /Game/GunsOnly/Meshes/,
   assign their /Game/GunsOnly/Materials/* slots by slot name, verify cm bounds, and save all.
"""
import os
import unreal

MEL = unreal.MaterialEditingLibrary
EAL = unreal.EditorAssetLibrary
AT = unreal.AssetToolsHelpers.get_asset_tools()

PROJECT_DIR = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())
ASSETS_DIR = os.path.join(PROJECT_DIR, "Assets")
TEX_SRC_DIR = os.path.join(ASSETS_DIR, "Textures")
MESH_SRC_DIR = os.path.join(ASSETS_DIR, "Meshes")

PKG_TEX = "/Game/GunsOnly/Textures"
PKG_MAT = "/Game/GunsOnly/Materials"
PKG_MESH = "/Game/GunsOnly/Meshes"


def ensure_dir(pkg_dir: str) -> None:
    if not EAL.does_directory_exist(pkg_dir):
        EAL.make_directory(pkg_dir)


def import_texture(png_name: str, kind: str) -> unreal.Texture2D:
    asset_name = os.path.splitext(png_name)[0]
    asset_path = f"{PKG_TEX}/{asset_name}"
    src_file = os.path.join(TEX_SRC_DIR, png_name)
    if not os.path.exists(src_file):
        raise RuntimeError(f"Missing texture source: {src_file}")

    task = unreal.AssetImportTask()
    task.set_editor_property("filename", src_file)
    task.set_editor_property("destination_path", PKG_TEX)
    task.set_editor_property("destination_name", asset_name)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("automated", True)
    task.set_editor_property("save", True)
    AT.import_asset_tasks([task])

    tex = EAL.load_asset(asset_path)
    if tex is None:
        raise RuntimeError(f"Failed to import texture {asset_path}")

    if kind == "normal":
        tex.set_editor_property("srgb", False)
        tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
    elif kind == "roughness":
        tex.set_editor_property("srgb", False)
        tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_MASKS)
    else:
        tex.set_editor_property("srgb", True)
        tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_DEFAULT)
    EAL.save_loaded_asset(tex, only_if_is_dirty=False)
    return tex


def new_or_reset_material(mat_name: str) -> unreal.Material:
    mat_path = f"{PKG_MAT}/{mat_name}"
    mat = EAL.load_asset(mat_path) if EAL.does_asset_exist(mat_path) else None
    if mat is None:
        factory = unreal.MaterialFactoryNew()
        mat = AT.create_asset(mat_name, PKG_MAT, unreal.Material, factory)
    if mat is None:
        raise RuntimeError(f"Failed to create material {mat_path}")
    MEL.delete_all_material_expressions(mat)
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_OPAQUE)
    mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_DEFAULT_LIT)
    mat.set_editor_property("two_sided", False)
    return mat


def expr(mat: unreal.Material, cls, x: int = 0, y: int = 0):
    node = MEL.create_material_expression(mat, cls, x, y)
    if node is None:
        raise RuntimeError(f"Failed creating {cls}")
    return node


def const1(mat: unreal.Material, val: float, x: int = 0, y: int = 0):
    n = expr(mat, unreal.MaterialExpressionConstant, x, y)
    n.set_editor_property("r", float(val))
    return n


def const3(mat: unreal.Material, r: float, g: float, b: float, x: int = 0, y: int = 0):
    n = expr(mat, unreal.MaterialExpressionConstant3Vector, x, y)
    n.set_editor_property("constant", unreal.LinearColor(float(r), float(g), float(b), 1.0))
    return n


def scalar_param(mat: unreal.Material, name: str, val: float, x: int = 0, y: int = 0):
    n = expr(mat, unreal.MaterialExpressionScalarParameter, x, y)
    n.set_editor_property("parameter_name", name)
    n.set_editor_property("default_value", float(val))
    return n


def vector_param(mat: unreal.Material, name: str, rgba: tuple, x: int = 0, y: int = 0):
    n = expr(mat, unreal.MaterialExpressionVectorParameter, x, y)
    n.set_editor_property("parameter_name", name)
    n.set_editor_property("default_value", unreal.LinearColor(*rgba))
    return n


def tex_sample(mat: unreal.Material, tex: unreal.Texture2D, sampler_type, uv_node=None, x: int = 0, y: int = 0):
    n = expr(mat, unreal.MaterialExpressionTextureSample, x, y)
    n.set_editor_property("texture", tex)
    n.set_editor_property("sampler_type", sampler_type)
    if uv_node is not None:
        MEL.connect_material_expressions(uv_node, "", n, "UVs")
    return n


def tex_coord(mat: unreal.Material, tile_u: float, tile_v: float, x: int = 0, y: int = 0):
    tc = expr(mat, unreal.MaterialExpressionTextureCoordinate, x, y)
    tc.set_editor_property("u_tiling", float(tile_u))
    tc.set_editor_property("v_tiling", float(tile_v))
    return tc


def add_expr(mat, a, b, x=0, y=0):
    n = expr(mat, unreal.MaterialExpressionAdd, x, y)
    MEL.connect_material_expressions(a, "", n, "A")
    MEL.connect_material_expressions(b, "", n, "B")
    return n


def sub_expr(mat, a, b, x=0, y=0):
    n = expr(mat, unreal.MaterialExpressionSubtract, x, y)
    MEL.connect_material_expressions(a, "", n, "A")
    MEL.connect_material_expressions(b, "", n, "B")
    return n


def mul_expr(mat, a, b, x=0, y=0):
    n = expr(mat, unreal.MaterialExpressionMultiply, x, y)
    MEL.connect_material_expressions(a, "", n, "A")
    MEL.connect_material_expressions(b, "", n, "B")
    return n


def div_expr(mat, a, b, x=0, y=0):
    n = expr(mat, unreal.MaterialExpressionDivide, x, y)
    MEL.connect_material_expressions(a, "", n, "A")
    MEL.connect_material_expressions(b, "", n, "B")
    return n


def clamp01(mat, a, x=0, y=0):
    n = expr(mat, unreal.MaterialExpressionClamp, x, y)
    n.set_editor_property("min_default", 0.0)
    n.set_editor_property("max_default", 1.0)
    MEL.connect_material_expressions(a, "", n, "")
    return n


def lerp_expr(mat, a, b, alpha, x=0, y=0):
    n = expr(mat, unreal.MaterialExpressionLinearInterpolate, x, y)
    MEL.connect_material_expressions(a, "", n, "A")
    MEL.connect_material_expressions(b, "", n, "B")
    MEL.connect_material_expressions(alpha, "", n, "Alpha")
    return n


def mask_components(mat, a, r=False, g=False, b=False, alpha=False, x=0, y=0):
    n = expr(mat, unreal.MaterialExpressionComponentMask, x, y)
    n.set_editor_property("r", bool(r))
    n.set_editor_property("g", bool(g))
    n.set_editor_property("b", bool(b))
    n.set_editor_property("a", bool(alpha))
    MEL.connect_material_expressions(a, "", n, "")
    return n


def finalize_mat(mat: unreal.Material) -> unreal.Material:
    MEL.layout_material_expressions(mat)
    errs = MEL.recompile_material(mat)
    if errs:
        raise RuntimeError(f"Material compile errors in {mat.get_name()}: {errs}")
    EAL.save_loaded_asset(mat, only_if_is_dirty=False)
    return mat


def build_standard_pbr(
    mat_name: str,
    tex_alb: unreal.Texture2D,
    tex_nrm: unreal.Texture2D,
    tex_rgh: unreal.Texture2D,
    tile: float = 1.0,
    metallic: float = 0.0,
    tint: tuple = None,
    rough_scale: float = 1.0,
) -> unreal.Material:
    mat = new_or_reset_material(mat_name)
    uv = tex_coord(mat, tile, tile, -800, 0)
    s_alb = tex_sample(mat, tex_alb, unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, uv, -500, -200)
    s_nrm = tex_sample(mat, tex_nrm, unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL, uv, -500, 120)
    s_rgh = tex_sample(mat, tex_rgh, unreal.MaterialSamplerType.SAMPLERTYPE_MASKS, uv, -500, 380)

    base_out = s_alb
    if tint is not None:
        base_out = mul_expr(mat, s_alb, const3(mat, *tint, -500, -340), -250, -200)
    MEL.connect_material_property(base_out, "", unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.connect_material_property(s_nrm, "", unreal.MaterialProperty.MP_NORMAL)

    if abs(rough_scale - 1.0) > 1e-3:
        r_mul = mul_expr(mat, mask_components(mat, s_rgh, r=True, x=-280, y=380), const1(mat, rough_scale, -280, 480), -120, 380)
        MEL.connect_material_property(clamp01(mat, r_mul, -20, 380), "", unreal.MaterialProperty.MP_ROUGHNESS)
    else:
        MEL.connect_material_property(s_rgh, "", unreal.MaterialProperty.MP_ROUGHNESS)

    if metallic > 1e-4:
        MEL.connect_material_property(const1(mat, metallic, -200, 80), "", unreal.MaterialProperty.MP_METALLIC)
    return finalize_mat(mat)


def build_solid_pbr(
    mat_name: str,
    rgba: tuple,
    metallic: float = 0.0,
    roughness: float = 0.5,
    emissive: tuple = None,
    emissive_boost: float = 1.0,
    blend_mode=None,
    unlit: bool = False,
    two_sided: bool = False,
    fresnel_exp: float = 0.0,
    opacity: float = 1.0,
) -> unreal.Material:
    mat = new_or_reset_material(mat_name)
    if blend_mode is not None:
        mat.set_editor_property("blend_mode", blend_mode)
    if unlit:
        mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    if two_sided:
        mat.set_editor_property("two_sided", True)

    col = vector_param(mat, "Color", rgba, -400, -200)
    if not unlit:
        MEL.connect_material_property(col, "", unreal.MaterialProperty.MP_BASE_COLOR)
        MEL.connect_material_property(const1(mat, metallic, -400, 20), "", unreal.MaterialProperty.MP_METALLIC)
        MEL.connect_material_property(const1(mat, roughness, -400, 140), "", unreal.MaterialProperty.MP_ROUGHNESS)

    if emissive is not None:
        # Unlit and dynamic solid materials share the "Color" VectorParameter so runtime SetVectorParameterValue("Color", ...) drives HDR emission too.
        em_col = col if unlit else (vector_param(mat, "EmissiveTint", emissive, -400, 280) if blend_mode is not None else const3(mat, *emissive[:3], -400, 280))
        boost = scalar_param(mat, "EmissiveBoost", emissive_boost, -400, 420)
        em_out = mul_expr(mat, em_col, boost, -160, 320)
        MEL.connect_material_property(em_out, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)

    if blend_mode in (unreal.BlendMode.BLEND_TRANSLUCENT, unreal.BlendMode.BLEND_ADDITIVE):
        if fresnel_exp > 0.0:
            fr = expr(mat, unreal.MaterialExpressionFresnel, -420, 560)
            MEL.connect_material_expressions(const1(mat, fresnel_exp, -620, 540), "", fr, "ExponentIn")
            MEL.connect_material_expressions(const1(mat, 0.25, -620, 620), "", fr, "BaseReflectFractionIn")
            op_node = mul_expr(mat, fr, const1(mat, opacity, -420, 680), -200, 580)
        else:
            op_node = scalar_param(mat, "Opacity", opacity, -200, 580)
        MEL.connect_material_property(clamp01(mat, op_node, -60, 580), "", unreal.MaterialProperty.MP_OPACITY)
    return finalize_mat(mat)


def build_ukraine_terrain_material(textures: dict) -> unreal.Material:
    """
    Multi-octave world-aligned terrain shader blending Steppe -> Highland -> Slope Scree
    and flat reflective water rivers below 180 cm MSL (1.8 m). Zero UV seams or obvious tiling.
    """
    mat = new_or_reset_material("M_Ukraine_Terrain")

    wp = expr(mat, unreal.MaterialExpressionWorldPosition, -1400, 0)
    wp_xy = mask_components(mat, wp, r=True, g=True, x=-1150, y=-100)
    wp_z = mask_components(mat, wp, b=True, x=-1150, y=340)

    # Dual-scale world UVs (macro 1,250 m + detail 240 m rotated slightly)
    uv_macro = div_expr(mat, wp_xy, const1(mat, 125000.0, -1150, -240), -900, -180)
    uv_detail = div_expr(mat, wp_xy, const1(mat, 24000.0, -1150, -340), -900, -40)

    st_alb_m = tex_sample(mat, textures["T_Ukraine_Steppe_Albedo"], unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, uv_macro, -620, -480)
    st_alb_d = tex_sample(mat, textures["T_Ukraine_Steppe_Albedo"], unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, uv_detail, -620, -240)
    steppe_alb = mul_expr(mat, st_alb_m, lerp_expr(mat, const3(mat, 0.72, 0.72, 0.72, -620, -20), st_alb_d, const1(mat, 0.45, -620, 80), -420, -240), -260, -380)

    hi_alb = tex_sample(mat, textures["T_Ukraine_Highland_Albedo"], unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, uv_detail, -620, 120)
    st_nrm = tex_sample(mat, textures["T_Ukraine_Steppe_Normal"], unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL, uv_detail, -620, 380)
    hi_nrm = tex_sample(mat, textures["T_Ukraine_Highland_Normal"], unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL, uv_detail, -620, 640)
    st_rgh = tex_sample(mat, textures["T_Ukraine_Steppe_Roughness"], unreal.MaterialSamplerType.SAMPLERTYPE_MASKS, uv_detail, -620, 880)
    hi_rgh = tex_sample(mat, textures["T_Ukraine_Highland_Roughness"], unreal.MaterialSamplerType.SAMPLERTYPE_MASKS, uv_detail, -620, 1120)

    # Altitude factor: ramp 0 -> 1 between 105 m (10500 cm) and 235 m (23500 cm)
    alt_t = clamp01(
        mat,
        div_expr(mat, sub_expr(mat, wp_z, const1(mat, 10500.0, -950, 380), -820, 340), const1(mat, 13000.0, -950, 480), -700, 340),
        -560,
        340,
    )
    # Steep slope factor exposes highland rock strata along cliffs/ridges
    wn = expr(mat, unreal.MaterialExpressionVertexNormalWS, -950, 620)
    wn_z = mask_components(mat, wn, b=True, x=-800, y=620)
    slope_t = clamp01(
        mat,
        mul_expr(mat, sub_expr(mat, const1(mat, 1.0, -800, 720), wn_z, -680, 660), const1(mat, 5.5, -680, 760), -560, 660),
        -440,
        660,
    )
    rock_alpha = clamp01(mat, add_expr(mat, alt_t, slope_t, -340, 480), -220, 480)

    land_alb = lerp_expr(mat, steppe_alb, hi_alb, rock_alpha, -120, -140)
    land_nrm = lerp_expr(mat, st_nrm, hi_nrm, rock_alpha, -120, 460)
    land_rgh = lerp_expr(mat, st_rgh, hi_rgh, rock_alpha, -120, 920)

    # River/water blend <= 180 cm (1.8 m)
    water_mask = sub_expr(
        mat,
        const1(mat, 1.0, -340, 220),
        clamp01(mat, div_expr(mat, sub_expr(mat, wp_z, const1(mat, 80.0, -580, 240), -480, 220), const1(mat, 140.0, -480, 300), -380, 220), -260, 220),
        -120,
        220,
    )
    final_alb = lerp_expr(mat, land_alb, const3(mat, 0.035, 0.085, 0.125, -120, 80), water_mask, 120, -120)
    final_nrm = lerp_expr(mat, land_nrm, const3(mat, 0.0, 0.0, 1.0, -120, 320), water_mask, 120, 440)
    final_rgh = lerp_expr(mat, land_rgh, const1(mat, 0.07, -120, 760), water_mask, 120, 860)

    MEL.connect_material_property(final_alb, "", unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.connect_material_property(final_nrm, "", unreal.MaterialProperty.MP_NORMAL)
    MEL.connect_material_property(final_rgh, "", unreal.MaterialProperty.MP_ROUGHNESS)
    return finalize_mat(mat)


def build_cobra_jungle_terrain_material(textures: dict) -> unreal.Material:
    """
    Cobra Canyon multi-octave terrain shader blending dense tropical jungle canopy -> rocky
    highland cliffs (WorldZ + VertexNormalWS.B) and murky canyon river water below ~97 m MSL.
    """
    mat = new_or_reset_material("M_Cobra_Jungle_Terrain")
    wp = expr(mat, unreal.MaterialExpressionWorldPosition, -1400, 0)
    wp_xy = mask_components(mat, wp, r=True, g=True, x=-1150, y=-100)
    wp_z = mask_components(mat, wp, b=True, x=-1150, y=340)

    uv_macro = div_expr(mat, wp_xy, const1(mat, 60000.0, -1150, -240), -900, -180)
    uv_detail = div_expr(mat, wp_xy, const1(mat, 12000.0, -1150, -340), -900, -40)

    jg_alb_m = tex_sample(mat, textures["T_Cobra_Jungle_Albedo"], unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, uv_macro, -620, -480)
    jg_alb_d = tex_sample(mat, textures["T_Cobra_Jungle_Albedo"], unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, uv_detail, -620, -240)
    jungle_alb = mul_expr(mat, jg_alb_m, lerp_expr(mat, const3(mat, 0.72, 0.72, 0.72, -620, -20), jg_alb_d, const1(mat, 0.45, -620, 80), -420, -240), -260, -380)

    hi_alb = tex_sample(mat, textures["T_Ukraine_Highland_Albedo"], unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, uv_detail, -620, 120)
    jg_nrm = tex_sample(mat, textures["T_Cobra_Jungle_Normal"], unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL, uv_detail, -620, 380)
    hi_nrm = tex_sample(mat, textures["T_Ukraine_Highland_Normal"], unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL, uv_detail, -620, 640)
    jg_rgh = tex_sample(mat, textures["T_Cobra_Jungle_Roughness"], unreal.MaterialSamplerType.SAMPLERTYPE_MASKS, uv_detail, -620, 880)
    hi_rgh = tex_sample(mat, textures["T_Ukraine_Highland_Roughness"], unreal.MaterialSamplerType.SAMPLERTYPE_MASKS, uv_detail, -620, 1120)

    alt_t = clamp01(
        mat,
        div_expr(mat, sub_expr(mat, wp_z, const1(mat, 22000.0, -950, 380), -820, 340), const1(mat, 20000.0, -950, 480), -700, 340),
        -560,
        340,
    )
    wn = expr(mat, unreal.MaterialExpressionVertexNormalWS, -950, 620)
    wn_z = mask_components(mat, wn, b=True, x=-800, y=620)
    slope_t = clamp01(
        mat,
        mul_expr(mat, sub_expr(mat, const1(mat, 1.0, -800, 720), wn_z, -680, 660), const1(mat, 5.2, -680, 760), -560, 660),
        -440,
        660,
    )
    rock_alpha = clamp01(mat, add_expr(mat, alt_t, slope_t, -340, 480), -220, 480)

    land_alb = lerp_expr(mat, jungle_alb, hi_alb, rock_alpha, -120, -140)
    land_nrm = lerp_expr(mat, jg_nrm, hi_nrm, rock_alpha, -120, 460)
    land_rgh = lerp_expr(mat, jg_rgh, hi_rgh, rock_alpha, -120, 920)

    water_mask = sub_expr(
        mat,
        const1(mat, 1.0, -340, 220),
        clamp01(mat, div_expr(mat, sub_expr(mat, wp_z, const1(mat, 9550.0, -580, 240), -480, 220), const1(mat, 300.0, -480, 300), -380, 220), -260, 220),
        -120,
        220,
    )
    final_alb = lerp_expr(mat, land_alb, const3(mat, 0.04, 0.11, 0.09, -120, 80), water_mask, 120, -120)
    final_nrm = lerp_expr(mat, land_nrm, const3(mat, 0.0, 0.0, 1.0, -120, 320), water_mask, 120, 440)
    final_rgh = lerp_expr(mat, land_rgh, const1(mat, 0.06, -120, 760), water_mask, 120, 860)

    MEL.connect_material_property(final_alb, "", unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.connect_material_property(final_nrm, "", unreal.MaterialProperty.MP_NORMAL)
    MEL.connect_material_property(final_rgh, "", unreal.MaterialProperty.MP_ROUGHNESS)
    return finalize_mat(mat)


def import_all_meshes() -> None:
    mesh_files = sorted(f for f in os.listdir(MESH_SRC_DIR) if f.endswith(".fbx"))
    if not mesh_files:
        raise RuntimeError(f"No .fbx files found in {MESH_SRC_DIR}")

    for fbx_name in mesh_files:
        asset_name = os.path.splitext(fbx_name)[0]
        src_path = os.path.join(MESH_SRC_DIR, fbx_name)
        ui = unreal.FbxImportUI()
        ui.set_editor_property("import_mesh", True)
        ui.set_editor_property("import_materials", False)
        ui.set_editor_property("import_textures", False)
        ui.set_editor_property("automated_import_should_detect_type", False)
        ui.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_STATIC_MESH)
        ui.static_mesh_import_data.set_editor_property("combine_meshes", True)
        ui.static_mesh_import_data.set_editor_property("auto_generate_collision", False)

        task = unreal.AssetImportTask()
        task.set_editor_property("filename", src_path)
        task.set_editor_property("destination_path", PKG_MESH)
        task.set_editor_property("destination_name", asset_name)
        task.set_editor_property("replace_existing", True)
        task.set_editor_property("automated", True)
        task.set_editor_property("save", True)
        task.set_editor_property("options", ui)
        AT.import_asset_tasks([task])

        mesh = EAL.load_asset(f"{PKG_MESH}/{asset_name}")
        if mesh is None:
            raise RuntimeError(f"Failed importing {asset_name}")

        # Assign matching /Game/GunsOnly/Materials/<SlotName> cleanly
        mats = mesh.get_editor_property("static_materials")
        for idx in range(len(mats)):
            slot_name = str(mats[idx].material_slot_name)
            mat_path = f"{PKG_MAT}/{slot_name}"
            mat_asset = EAL.load_asset(mat_path) if EAL.does_asset_exist(mat_path) else None
            if mat_asset is not None:
                mesh.set_material(idx, mat_asset)
        EAL.save_loaded_asset(mesh, only_if_is_dirty=False)

        bounds = mesh.get_bounds()
        ext = bounds.box_extent * 2.0
        print(f"Imported {asset_name}: size=({ext.x:.0f} x {ext.y:.0f} x {ext.z:.0f}) cm, slots={len(mats)}")
        if asset_name == "SM_F22_Raptor" and not (1400.0 <= ext.x <= 2400.0 and 1000.0 <= ext.y <= 1700.0):
            raise RuntimeError(f"Unexpected SM_F22_Raptor cm bounds: {ext}")
        if asset_name == "SM_Su27_Flanker" and not (1700.0 <= ext.x <= 2800.0 and 1100.0 <= ext.y <= 1850.0):
            raise RuntimeError(f"Unexpected SM_Su27_Flanker cm bounds: {ext}")
        if asset_name == "SM_AH1G_Cobra" and not (1000.0 <= ext.x <= 1650.0 and 220.0 <= ext.y <= 500.0):
            raise RuntimeError(f"Unexpected SM_AH1G_Cobra cm bounds: {ext}")
        if asset_name == "SM_AH1G_MainRotor" and not (1100.0 <= ext.y <= 1550.0):
            raise RuntimeError(f"Unexpected SM_AH1G_MainRotor cm bounds: {ext}")


def main() -> None:
    ensure_dir("/Game/GunsOnly")
    ensure_dir(PKG_TEX)
    ensure_dir(PKG_MAT)
    ensure_dir(PKG_MESH)

    # 1. Import all PNG textures
    textures = {}
    for png_name in sorted(os.listdir(TEX_SRC_DIR)):
        if not png_name.endswith(".png"):
            continue
        base = os.path.splitext(png_name)[0]
        kind = "normal" if base.endswith("_Normal") else ("roughness" if base.endswith("_Roughness") else "albedo")
        textures[base] = import_texture(png_name, kind)

    # 2. Build compiled UE 5.8 PBR Material library
    build_ukraine_terrain_material(textures)
    build_cobra_jungle_terrain_material(textures)
    build_standard_pbr(
        "M_Runway_Asphalt",
        textures["T_Runway_Asphalt_Albedo"],
        textures["T_Runway_Asphalt_Normal"],
        textures["T_Runway_Asphalt_Roughness"],
        tile=6.0,
    )
    build_standard_pbr(
        "M_F22_RAM_Body",
        textures["T_F22_RAM_Albedo"],
        textures["T_F22_RAM_Normal"],
        textures["T_F22_RAM_Roughness"],
        tile=2.5,
        metallic=0.45,
        rough_scale=0.95,
    )
    build_standard_pbr(
        "M_Su27_Splinter",
        textures["T_Su27_Splinter_Albedo"],
        textures["T_Su27_Splinter_Normal"],
        textures["T_Su27_Splinter_Roughness"],
        tile=2.5,
        metallic=0.35,
    )
    build_standard_pbr(
        "M_AH1G_OliveDrab",
        textures["T_AH1G_OliveDrab_Albedo"],
        textures["T_AH1G_OliveDrab_Normal"],
        textures["T_AH1G_OliveDrab_Roughness"],
        tile=2.0,
        metallic=0.18,
    )

    build_solid_pbr("M_Runway_Markings", (0.88, 0.88, 0.86, 1.0), metallic=0.0, roughness=0.72)
    build_solid_pbr("M_F22_DarkMetal", (0.11, 0.12, 0.14, 1.0), metallic=0.88, roughness=0.28)
    build_solid_pbr("M_F22_GoldCanopy", (0.88, 0.65, 0.18, 1.0), metallic=0.90, roughness=0.06, emissive=(0.18, 0.12, 0.02, 1.0), emissive_boost=0.25)
    build_solid_pbr("M_F22_CockpitInterior", (0.06, 0.07, 0.08, 1.0), metallic=0.15, roughness=0.75)
    build_solid_pbr("M_Su27_Titanium", (0.38, 0.41, 0.50, 1.0), metallic=0.92, roughness=0.22)
    build_solid_pbr("M_Su27_Canopy", (0.55, 0.78, 0.96, 1.0), metallic=0.25, roughness=0.05)
    build_solid_pbr("M_Su27_Radome", (0.86, 0.88, 0.90, 1.0), metallic=0.0, roughness=0.36)
    build_solid_pbr("M_Cockpit_Carbon", (0.045, 0.05, 0.055, 1.0), metallic=0.18, roughness=0.58)
    build_solid_pbr("M_Base_Concrete", (0.52, 0.51, 0.48, 1.0), metallic=0.0, roughness=0.86)
    build_solid_pbr("M_Base_Metal", (0.32, 0.35, 0.38, 1.0), metallic=0.80, roughness=0.38)
    build_solid_pbr("M_Base_Glass", (0.10, 0.24, 0.34, 1.0), metallic=0.20, roughness=0.05)

    # Emissive MFD glass using T_Cockpit_MFD_Emissive
    m_mfd = new_or_reset_material("M_Cockpit_MFD")
    tc_mfd = tex_coord(m_mfd, 1.0, 1.0, -500, 0)
    s_mfd = tex_sample(m_mfd, textures["T_Cockpit_MFD_Emissive"], unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, tc_mfd, -260, 0)
    MEL.connect_material_property(s_mfd, "", unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.connect_material_property(const1(m_mfd, 0.06, -260, 180), "", unreal.MaterialProperty.MP_ROUGHNESS)
    MEL.connect_material_property(mul_expr(m_mfd, s_mfd, const1(m_mfd, 2.6, -260, 280), -40, 200), "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    finalize_mat(m_mfd)

    # Translucent / Emissive / Additive flight materials
    build_solid_pbr(
        "M_HUD_Glass", (0.10, 0.72, 0.42, 1.0), metallic=0.05, roughness=0.04,
        emissive=(0.06, 0.55, 0.32, 1.0), emissive_boost=0.55,
        blend_mode=unreal.BlendMode.BLEND_TRANSLUCENT, two_sided=True, fresnel_exp=1.6, opacity=0.22,
    )
    build_solid_pbr(
        "M_Afterburner_Outer", (1.0, 0.40, 0.08, 1.0), emissive=(1.0, 0.42, 0.08, 1.0), emissive_boost=12.0,
        blend_mode=unreal.BlendMode.BLEND_ADDITIVE, unlit=True, two_sided=True, fresnel_exp=0.0, opacity=0.85,
    )
    build_solid_pbr(
        "M_Afterburner_Core", (0.85, 0.94, 1.0, 1.0), emissive=(0.75, 0.92, 1.0, 1.0), emissive_boost=22.0,
        blend_mode=unreal.BlendMode.BLEND_ADDITIVE, unlit=True, two_sided=True, fresnel_exp=0.0, opacity=0.95,
    )
    build_solid_pbr(
        "M_Papi_Lamp", (1.0, 0.95, 0.85, 1.0), emissive=(1.0, 0.95, 0.85, 1.0), emissive_boost=10.0,
        blend_mode=None, unlit=True, two_sided=False,
    )
    build_solid_pbr(
        "M_Tracer_Bolt", (1.0, 0.86, 0.35, 1.0), emissive=(1.0, 0.82, 0.25, 1.0), emissive_boost=16.0,
        blend_mode=None, unlit=True,
    )
    build_solid_pbr(
        "M_Rocket_Flare", (1.0, 0.55, 0.14, 1.0), emissive=(1.0, 0.55, 0.14, 1.0), emissive_boost=22.0,
        blend_mode=None, unlit=True,
    )
    build_solid_pbr(
        "M_NavLights", (1.0, 0.22, 0.16, 1.0), emissive=(1.0, 0.22, 0.16, 1.0), emissive_boost=8.0,
        blend_mode=None, unlit=True,
    )
    build_solid_pbr(
        "M_Gate_Hologram", (0.16, 0.90, 1.0, 1.0), emissive=(0.16, 0.92, 1.0, 1.0), emissive_boost=5.5,
        blend_mode=unreal.BlendMode.BLEND_TRANSLUCENT, unlit=True, two_sided=True, fresnel_exp=1.8, opacity=0.72,
    )
    build_solid_pbr(
        "M_Vapor_Trail", (0.94, 0.96, 1.0, 1.0), emissive=(0.82, 0.88, 0.96, 1.0), emissive_boost=1.4,
        blend_mode=unreal.BlendMode.BLEND_TRANSLUCENT, unlit=True, two_sided=True, fresnel_exp=0.0, opacity=0.38,
    )

    # 3. Import FBXs & link material slots
    import_all_meshes()

    # 4. Persist all created UE5 assets cleanly
    EAL.save_directory("/Game/GunsOnly", only_if_is_dirty=False, recursive=True)
    print("import_to_ue.py: SUCCESS - saved all textures, PBR materials, and StaticMeshes.")


if __name__ == "__main__":
    main()
