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
AUDIO_SRC_DIR = os.path.join(ASSETS_DIR, "Audio")
UI_SRC_DIR = os.path.join(ASSETS_DIR, "UI")

PKG_TEX = "/Game/GunsOnly/Textures"
PKG_MAT = "/Game/GunsOnly/Materials"
PKG_MESH = "/Game/GunsOnly/Meshes"
PKG_AUDIO = "/Game/GunsOnly/Audio"
PKG_UI = "/Game/GunsOnly/UI"


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
    instanced: bool = False,
) -> unreal.Material:
    mat = new_or_reset_material(mat_name)
    if instanced:
        mat.set_editor_property("used_with_instanced_static_meshes", True)
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

    # Dual-scale world UVs (macro 4,200 m + detail 680 m rotated ~37 deg to avoid square grid tiling)
    uv_macro = div_expr(mat, wp_xy, const1(mat, 420000.0, -1150, -240), -900, -180)
    uv_rot = expr(mat, unreal.MaterialExpressionCustom, -900, -40)
    uv_rot.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT2)
    uv_rot.set_editor_property("description", "RotateUkraineDetailUV")
    ci_xy = unreal.CustomInput()
    ci_xy.set_editor_property("input_name", "WPXY")
    uv_rot.set_editor_property("inputs", [ci_xy])
    uv_rot.set_editor_property("code", "float2 p = WPXY; return float2(p.x * 0.8 + p.y * 0.6, -p.x * 0.6 + p.y * 0.8) / 68000.0;")
    MEL.connect_material_expressions(wp_xy, "", uv_rot, "WPXY")
    uv_detail = uv_rot

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


def import_all_audio() -> None:
    if not os.path.isdir(AUDIO_SRC_DIR):
        return
    ensure_dir(PKG_AUDIO)
    loop_names = {
        "SW_F22_Idle", "SW_F22_Mil", "SW_F22_Grit",
        "SW_Rapier_Idle", "SW_Rapier_Mil", "SW_Rapier_Grit",
        "SW_F14_Engine", "SW_Cobra_Rotor", "SW_FireBoss_Prop",
        "SW_Vulcan_Loop", "SW_Minigun_Loop",
        "SW_AIM9_Growl", "SW_AIM9_Lock",
    }
    for wav_name in sorted(f for f in os.listdir(AUDIO_SRC_DIR) if f.endswith(".wav")):
        asset_name = os.path.splitext(wav_name)[0]
        src_path = os.path.join(AUDIO_SRC_DIR, wav_name)
        task = unreal.AssetImportTask()
        task.set_editor_property("filename", src_path)
        task.set_editor_property("destination_path", PKG_AUDIO)
        task.set_editor_property("destination_name", asset_name)
        task.set_editor_property("replace_existing", True)
        task.set_editor_property("automated", True)
        task.set_editor_property("save", True)
        AT.import_asset_tasks([task])

        sw = EAL.load_asset(f"{PKG_AUDIO}/{asset_name}")
        if sw is None:
            raise RuntimeError(f"Failed importing sound {asset_name}")
        if asset_name in loop_names:
            sw.set_editor_property("looping", True)
        EAL.save_loaded_asset(sw, only_if_is_dirty=False)
        print(f"Imported audio: {asset_name} (loop={asset_name in loop_names})")


def import_all_ui_cards() -> None:
    if not os.path.isdir(UI_SRC_DIR):
        return
    ensure_dir(PKG_UI)
    for png_name in sorted(f for f in os.listdir(UI_SRC_DIR) if f.endswith(".png")):
        asset_name = os.path.splitext(png_name)[0]
        src_path = os.path.join(UI_SRC_DIR, png_name)
        task = unreal.AssetImportTask()
        task.set_editor_property("filename", src_path)
        task.set_editor_property("destination_path", PKG_UI)
        task.set_editor_property("destination_name", asset_name)
        task.set_editor_property("replace_existing", True)
        task.set_editor_property("automated", True)
        task.set_editor_property("save", True)
        AT.import_asset_tasks([task])

        tex = EAL.load_asset(f"{PKG_UI}/{asset_name}")
        if tex is None:
            raise RuntimeError(f"Failed importing UI card {asset_name}")
        tex.set_editor_property("srgb", True)
        tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_DEFAULT)
        tex.set_editor_property("lod_group", unreal.TextureGroup.TEXTUREGROUP_UI)
        tex.set_editor_property("never_stream", True)
        EAL.save_loaded_asset(tex, only_if_is_dirty=False)
        print(f"Imported UI card: {asset_name}")


def build_masked_texture_mat(
    mat_name: str,
    tex_alb: unreal.Texture2D,
    roughness: float = 0.62,
    metallic: float = 0.0,
    two_sided: bool = True,
    alpha_masked: bool = True,
    instanced: bool = False,
) -> unreal.Material:
    mat = new_or_reset_material(mat_name)
    if instanced:
        mat.set_editor_property("used_with_instanced_static_meshes", True)
    mat.set_editor_property("two_sided", two_sided)
    if alpha_masked:
        mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
        mat.set_editor_property("opacity_mask_clip_value", 0.35)
    uv = tex_coord(mat, 1.0, 1.0, -600, 0)
    s_alb = tex_sample(mat, tex_alb, unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, uv, -320, 0)
    MEL.connect_material_property(s_alb, "", unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.connect_material_property(const1(mat, metallic, -320, 220), "", unreal.MaterialProperty.MP_METALLIC)
    MEL.connect_material_property(const1(mat, roughness, -320, 320), "", unreal.MaterialProperty.MP_ROUGHNESS)
    if alpha_masked:
        MEL.connect_material_property(s_alb, "A", unreal.MaterialProperty.MP_OPACITY_MASK)
    return finalize_mat(mat)


def build_water_material(
    mat_name: str,
    base_rgb: tuple,
    roughness: float = 0.055,
    wave_scale_cm: float = 2400.0,
) -> unreal.Material:
    """Self-contained procedural ocean / mountain lake surface with specular wave micro-normals."""
    mat = new_or_reset_material(mat_name)
    col = vector_param(mat, "WaterColor", (*base_rgb, 1.0), -520, -240)
    MEL.connect_material_property(col, "", unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.connect_material_property(const1(mat, 0.05, -520, -60), "", unreal.MaterialProperty.MP_METALLIC)
    MEL.connect_material_property(const1(mat, 0.35, -520, 20), "", unreal.MaterialProperty.MP_SPECULAR)
    MEL.connect_material_property(const1(mat, roughness, -520, 100), "", unreal.MaterialProperty.MP_ROUGHNESS)
    MEL.connect_material_property(
        mul_expr(mat, col, const1(mat, 0.14, -520, 180), -300, 180),
        "",
        unreal.MaterialProperty.MP_EMISSIVE_COLOR,
    )

    wp = expr(mat, unreal.MaterialExpressionWorldPosition, -760, 260)
    tm = expr(mat, unreal.MaterialExpressionTime, -760, 420)
    ws = scalar_param(mat, "WaveScaleCm", wave_scale_cm, -760, 540)

    custom = expr(mat, unreal.MaterialExpressionCustom, -420, 300)
    custom.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT3)
    custom.set_editor_property("description", "ProceduralWaterNormal")
    c_inputs = []
    for nm in ("WorldPos", "TimeSec", "ScaleCm"):
        ci = unreal.CustomInput()
        ci.set_editor_property("input_name", nm)
        c_inputs.append(ci)
    custom.set_editor_property("inputs", c_inputs)
    custom.set_editor_property(
        "code",
        "\n".join([
            "float2 p = WorldPos.xy / max(ScaleCm, 100.0);",
            "float t = TimeSec * 0.65;",
            "float dx = 0.032 * cos(p.x * 2.1 + t) + 0.018 * cos(dot(p, float2(1.7, 1.3)) * 4.3 - t * 1.4);",
            "float dy = 0.032 * sin(p.y * 2.3 - t * 0.8) + 0.018 * sin(dot(p, float2(-1.4, 1.8)) * 4.7 + t * 1.2);",
            "return normalize(float3(dx, dy, 1.0));",
        ]),
    )
    MEL.connect_material_expressions(wp, "", custom, "WorldPos")
    MEL.connect_material_expressions(tm, "", custom, "TimeSec")
    MEL.connect_material_expressions(ws, "", custom, "ScaleCm")
    MEL.connect_material_property(custom, "", unreal.MaterialProperty.MP_NORMAL)
    return finalize_mat(mat)


def build_okanagan_terrain_material(textures: dict) -> unreal.Material:
    """BC pine valley -> rocky alpine slopes -> sandy Okanagan Lake shoreline at ~342 m MSL."""
    mat = new_or_reset_material("M_Okanagan_Terrain")
    wp = expr(mat, unreal.MaterialExpressionWorldPosition, -1400, 0)
    wp_xy = mask_components(mat, wp, r=True, g=True, x=-1150, y=-100)
    wp_z = mask_components(mat, wp, b=True, x=-1150, y=340)

    uv_macro = div_expr(mat, wp_xy, const1(mat, 80000.0, -1150, -240), -900, -180)
    uv_detail = div_expr(mat, wp_xy, const1(mat, 16000.0, -1150, -340), -900, -40)

    for_alb = mul_expr(
        mat,
        tex_sample(mat, textures["T_Cobra_Jungle_Albedo"], unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, uv_macro, -620, -420),
        const3(mat, 0.56, 0.68, 0.52, -620, -200),
        -380,
        -320,
    )
    rock_alb = mul_expr(
        mat,
        tex_sample(mat, textures["T_Ukraine_Highland_Albedo"], unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, uv_detail, -620, 40),
        const3(mat, 0.88, 0.84, 0.78, -620, 220),
        -380,
        120,
    )
    for_nrm = tex_sample(mat, textures["T_Cobra_Jungle_Normal"], unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL, uv_detail, -620, 400)
    rock_nrm = tex_sample(mat, textures["T_Ukraine_Highland_Normal"], unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL, uv_detail, -620, 640)

    alt_t = clamp01(
        mat,
        div_expr(mat, sub_expr(mat, wp_z, const1(mat, 78000.0, -950, 380), -820, 340), const1(mat, 35000.0, -950, 480), -700, 340),
        -560,
        340,
    )
    wn = expr(mat, unreal.MaterialExpressionVertexNormalWS, -950, 620)
    wn_z = mask_components(mat, wn, b=True, x=-800, y=620)
    slope_t = clamp01(
        mat,
        mul_expr(mat, sub_expr(mat, const1(mat, 1.0, -800, 720), wn_z, -680, 660), const1(mat, 4.8, -680, 760), -560, 660),
        -440,
        660,
    )
    rock_alpha = clamp01(mat, add_expr(mat, alt_t, slope_t, -340, 480), -220, 480)

    land_alb = lerp_expr(mat, for_alb, rock_alb, rock_alpha, -120, -140)
    land_nrm = lerp_expr(mat, for_nrm, rock_nrm, rock_alpha, -120, 460)
    shore_mask = sub_expr(
        mat,
        const1(mat, 1.0, -340, 220),
        clamp01(mat, div_expr(mat, sub_expr(mat, wp_z, const1(mat, 34200.0, -580, 240), -480, 220), const1(mat, 350.0, -480, 300), -380, 220), -260, 220),
        -120,
        220,
    )
    final_alb = lerp_expr(mat, land_alb, const3(mat, 0.34, 0.30, 0.24, -120, 80), shore_mask, 120, -120)
    MEL.connect_material_property(final_alb, "", unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.connect_material_property(land_nrm, "", unreal.MaterialProperty.MP_NORMAL)
    MEL.connect_material_property(const1(mat, 0.78, -120, 860), "", unreal.MaterialProperty.MP_ROUGHNESS)
    return finalize_mat(mat)


def build_volumetric_cloud_material() -> unreal.Material:
    """
    Cooked self-contained 2-deck 3D volumetric cumulus/stratus cloud raymarching material
    driven at runtime from GunsSimWeatherState / LayeredCloudField. Zero external engine deps.
    """
    mat = new_or_reset_material("M_Volumetric_Clouds")
    mat.set_editor_property("material_domain", unreal.MaterialDomain.MD_VOLUME)
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_ADDITIVE)
    mat.set_editor_property("used_with_volumetric_cloud", True)

    cloud_tint = vector_param(mat, "CloudTint", (0.98, 0.99, 1.0, 1.0), -520, -320)
    MEL.connect_material_property(cloud_tint, "", unreal.MaterialProperty.MP_BASE_COLOR)

    wp = expr(mat, unreal.MaterialExpressionWorldPosition, -900, 0)
    p_cov1 = scalar_param(mat, "Coverage", 0.50, -900, 120)
    p_base1 = scalar_param(mat, "BaseAltCm", 160000.0, -900, 200)
    p_thk1 = scalar_param(mat, "ThicknessCm", 240000.0, -900, 280)
    p_scl1 = scalar_param(mat, "MacroScaleCm", 480000.0, -900, 360)
    p_cov2 = scalar_param(mat, "Coverage2", 0.26, -900, 440)
    p_base2 = scalar_param(mat, "BaseAlt2Cm", 640000.0, -900, 520)
    p_thk2 = scalar_param(mat, "Thickness2Cm", 160000.0, -900, 600)
    p_scl2 = scalar_param(mat, "MacroScale2Cm", 850000.0, -900, 680)
    p_dens = scalar_param(mat, "DensityScale", 0.022, -900, 760)
    p_wind = vector_param(mat, "WindOffsetCm", (0.0, 0.0, 0.0, 0.0), -900, 840)

    custom = expr(mat, unreal.MaterialExpressionCustom, -380, 260)
    custom.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT1)
    custom.set_editor_property("description", "GunsOnlyVolumetricClouds2Deck")
    names = [
        "WorldPos", "Coverage", "BaseAltCm", "ThicknessCm", "MacroScaleCm",
        "Coverage2", "BaseAlt2Cm", "Thickness2Cm", "MacroScale2Cm", "DensityScale", "WindOffsetCm",
    ]
    c_inputs = []
    for nm in names:
        ci = unreal.CustomInput()
        ci.set_editor_property("input_name", nm)
        c_inputs.append(ci)
    custom.set_editor_property("inputs", c_inputs)

    hlsl = "\n".join([
        "float3 wp = WorldPos;",
        "float3 wind = WindOffsetCm.xyz;",
        "float outD = 0.0;",
        "for (int deck = 0; deck < 2; deck++) {",
        "    float baseCm = (deck == 0) ? BaseAltCm : BaseAlt2Cm;",
        "    float thkCm = (deck == 0) ? ThicknessCm : Thickness2Cm;",
        "    float cov = (deck == 0) ? Coverage : Coverage2;",
        "    float scaleCm = (deck == 0) ? MacroScaleCm : MacroScale2Cm;",
        "    float deckGain = (deck == 0) ? 1.0 : 0.85;",
        "    float h = (wp.z - baseCm) / max(thkCm, 5000.0);",
        "    if (cov > 0.01 && h > 0.0 && h < 1.0) {",
        "        float prof = smoothstep(0.0, 0.16, h) * smoothstep(1.0, 0.28, h);",
        "        float3 u = (wp + wind * ((deck == 0) ? 1.0 : 1.45)) / max(scaleCm, 20000.0) * float3(2.8, 2.8, 3.2) + float3(0.4, 9.2, 0.0);",
        "        float v = 0.0;",
        "        float amp = 0.50;",
        "        float3 qp = u;",
        "        for (int oct = 0; oct < 4; oct++) {",
        "            float3 gi = floor(qp);",
        "            float3 gf = frac(qp);",
        "            gf = gf * gf * (3.0 - 2.0 * gf);",
        "            float3 c000 = frac((gi + float3(0,0,0)) * float3(0.1031, 0.1030, 0.0973)); c000 += dot(c000, c000.yxz + 33.33);",
        "            float3 c100 = frac((gi + float3(1,0,0)) * float3(0.1031, 0.1030, 0.0973)); c100 += dot(c100, c100.yxz + 33.33);",
        "            float3 c010 = frac((gi + float3(0,1,0)) * float3(0.1031, 0.1030, 0.0973)); c010 += dot(c010, c010.yxz + 33.33);",
        "            float3 c110 = frac((gi + float3(1,1,0)) * float3(0.1031, 0.1030, 0.0973)); c110 += dot(c110, c110.yxz + 33.33);",
        "            float3 c001 = frac((gi + float3(0,0,1)) * float3(0.1031, 0.1030, 0.0973)); c001 += dot(c001, c001.yxz + 33.33);",
        "            float3 c101 = frac((gi + float3(1,0,1)) * float3(0.1031, 0.1030, 0.0973)); c101 += dot(c101, c101.yxz + 33.33);",
        "            float3 c011 = frac((gi + float3(0,1,1)) * float3(0.1031, 0.1030, 0.0973)); c011 += dot(c011, c011.yxz + 33.33);",
        "            float3 c111 = frac((gi + float3(1,1,1)) * float3(0.1031, 0.1030, 0.0973)); c111 += dot(c111, c111.yxz + 33.33);",
        "            float n000 = frac((c000.x + c000.y) * c000.z);",
        "            float n100 = frac((c100.x + c100.y) * c100.z);",
        "            float n010 = frac((c010.x + c010.y) * c010.z);",
        "            float n110 = frac((c110.x + c110.y) * c110.z);",
        "            float n001 = frac((c001.x + c001.y) * c001.z);",
        "            float n101 = frac((c101.x + c101.y) * c101.z);",
        "            float n011 = frac((c011.x + c011.y) * c011.z);",
        "            float n111 = frac((c111.x + c111.y) * c111.z);",
        "            float nxy0 = lerp(lerp(n000, n100, gf.x), lerp(n010, n110, gf.x), gf.y);",
        "            float nxy1 = lerp(lerp(n001, n101, gf.x), lerp(n011, n111, gf.x), gf.y);",
        "            float nval = lerp(nxy0, nxy1, gf.z);",
        "            v += amp * nval;",
        "            qp = qp * 2.05 + float3(17.1, 31.7, 11.3);",
        "            amp *= 0.5;",
        "        }",
        "        float norm = saturate((v - 0.28) / 0.38);",
        "        float thresh = 0.86 - 0.54 * saturate(cov);",
        "        float baseD = saturate((norm * prof - thresh) / 0.26);",
        "        outD = max(outD, baseD * deckGain);",
        "    }",
        "}",
        "return outD * DensityScale;",
    ])
    custom.set_editor_property("code", hlsl)

    for nm, node in [
        ("WorldPos", wp), ("Coverage", p_cov1), ("BaseAltCm", p_base1), ("ThicknessCm", p_thk1),
        ("MacroScaleCm", p_scl1), ("Coverage2", p_cov2), ("BaseAlt2Cm", p_base2), ("Thickness2Cm", p_thk2),
        ("MacroScale2Cm", p_scl2), ("DensityScale", p_dens), ("WindOffsetCm", p_wind),
    ]:
        MEL.connect_material_expressions(node, "", custom, nm)

    ext_prop = getattr(unreal.MaterialProperty, "MP_EXTINCTION", unreal.MaterialProperty.MP_SUBSURFACE_COLOR)
    MEL.connect_material_property(custom, "", ext_prop)

    if hasattr(unreal, "MaterialExpressionVolumetricAdvancedOutput"):
        vao = expr(mat, unreal.MaterialExpressionVolumetricAdvancedOutput, -140, 560)
        vao.set_editor_property("phase_g", 0.68)
        vao.set_editor_property("phase_g2", -0.25)
        vao.set_editor_property("phase_blend", 0.30)
        vao.set_editor_property("multi_scattering_contribution", 0.85)
        vao.set_editor_property("multi_scattering_occlusion", 0.18)
        vao.set_editor_property("multi_scattering_eccentricity", 0.65)
        MEL.connect_material_expressions(const1(mat, 1.0, -340, 560), "", vao, "ConservativeDensity")

    return finalize_mat(mat)


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
    build_volumetric_cloud_material()
    build_ukraine_terrain_material(textures)
    build_cobra_jungle_terrain_material(textures)
    build_okanagan_terrain_material(textures)
    build_water_material("M_Ocean_Water", (0.018, 0.145, 0.310), roughness=0.18, wave_scale_cm=2600.0)
    build_water_material("M_Okanagan_Lake", (0.025, 0.210, 0.295), roughness=0.16, wave_scale_cm=1500.0)
    build_standard_pbr(
        "M_Runway_Asphalt",
        textures["T_Runway_Asphalt_Albedo"],
        textures["T_Runway_Asphalt_Normal"],
        textures["T_Runway_Asphalt_Roughness"],
        tile=6.0,
    )
    build_standard_pbr(
        "M_Carrier_Deck",
        textures["T_Runway_Asphalt_Albedo"],
        textures["T_Runway_Asphalt_Normal"],
        textures["T_Runway_Asphalt_Roughness"],
        tile=3.5,
        tint=(0.56, 0.58, 0.62),
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
        "M_F14_NavyGray",
        textures["T_F22_RAM_Albedo"],
        textures["T_F22_RAM_Normal"],
        textures["T_F22_RAM_Roughness"],
        tile=2.5,
        metallic=0.32,
        tint=(0.94, 0.96, 1.0),
        rough_scale=1.05,
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

    if "T_PalmTree_Trunk" in textures:
        build_masked_texture_mat("M_Palm_Trunk", textures["T_PalmTree_Trunk"], roughness=0.85, two_sided=False, alpha_masked=False, instanced=True)
    if "T_PalmTree_Leaves" in textures:
        build_masked_texture_mat("M_Palm_Leaves", textures["T_PalmTree_Leaves"], roughness=0.62, two_sided=True, alpha_masked=True, instanced=True)
    if "T_Cobra_Plants" in textures:
        build_masked_texture_mat("M_Cobra_Plants", textures["T_Cobra_Plants"], roughness=0.65, two_sided=True, alpha_masked=True, instanced=True)
    if "T_Cobra_Foliage_Atlas" in textures:
        build_masked_texture_mat("M_Cobra_Foliage", textures["T_Cobra_Foliage_Atlas"], roughness=0.62, two_sided=True, alpha_masked=True, instanced=True)

    build_solid_pbr("M_MiG28_Black", (0.035, 0.038, 0.044, 1.0), metallic=0.28, roughness=0.18)
    build_solid_pbr("M_Rapier_Titanium", (0.24, 0.25, 0.29, 1.0), metallic=0.86, roughness=0.26)
    build_solid_pbr("M_FireBoss_Yellow", (0.95, 0.72, 0.04, 1.0), metallic=0.12, roughness=0.28)
    build_solid_pbr("M_Balloon_White", (0.94, 0.96, 1.0, 1.0), metallic=0.0, roughness=0.22)
    build_solid_pbr("M_Tree_Foliage", (0.11, 0.22, 0.09, 1.0), metallic=0.0, roughness=0.78, two_sided=True, instanced=True)
    build_solid_pbr("M_Tree_Trunk", (0.18, 0.13, 0.09, 1.0), metallic=0.0, roughness=0.90, instanced=True)

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
    build_solid_pbr(
        "M_Explosion_Fire", (1.0, 0.48, 0.08, 1.0), emissive=(1.0, 0.45, 0.08, 1.0), emissive_boost=18.0,
        blend_mode=unreal.BlendMode.BLEND_ADDITIVE, unlit=True, two_sided=True, fresnel_exp=0.0, opacity=0.90,
    )
    build_solid_pbr(
        "M_Smoke_Plume", (0.09, 0.09, 0.10, 1.0), metallic=0.0, roughness=0.95,
        blend_mode=unreal.BlendMode.BLEND_TRANSLUCENT, unlit=False, two_sided=True, fresnel_exp=0.0, opacity=0.58,
    )
    build_solid_pbr(
        "M_Water_Curtain", (0.85, 0.95, 1.0, 1.0), emissive=(0.45, 0.65, 0.78, 1.0), emissive_boost=0.85,
        blend_mode=unreal.BlendMode.BLEND_TRANSLUCENT, unlit=False, two_sided=True, fresnel_exp=0.0, opacity=0.60,
    )

    # 3. Import Audio & UI Cards
    import_all_audio()
    import_all_ui_cards()

    # 4. Import FBXs & link material slots
    import_all_meshes()

    # 5. Ensure dedicated startup map exists for standalone packaging (-pak / -cook)
    ensure_startup_map()

    # 6. Persist all created UE5 assets cleanly
    EAL.save_directory("/Game/GunsOnly", only_if_is_dirty=False, recursive=True)
    print("import_to_ue.py: SUCCESS - saved all audio, UI cards, textures, PBR/cloud materials, StaticMeshes, and startup map.")


def ensure_startup_map() -> None:
    map_pkg = "/Game/GunsOnly/Maps"
    map_asset = f"{map_pkg}/GunsOnlyMain"
    ensure_dir(map_pkg)
    if not EAL.does_asset_exist(map_asset):
        les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
        if not les.new_level(map_asset, False):
            raise RuntimeError(f"Failed creating level {map_asset}")
        if not les.save_current_level():
            raise RuntimeError(f"Failed saving level {map_asset}")
        print(f"Created startup map {map_asset}")
    if not EAL.does_asset_exist(map_asset):
        raise RuntimeError(f"Missing startup map {map_asset} after save")


if __name__ == "__main__":
    main()
