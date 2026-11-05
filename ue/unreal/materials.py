"""Parity-spike district materials: glTF slot names -> UE material instances."""
import json
import os

import unreal

PACKAGE = '/Game/ParitySpike/Materials'
OPAQUE_PARENT = f'{PACKAGE}/M_ParitySpike_Opaque'
GLASS_PARENT = f'{PACKAGE}/M_ParitySpike_Glass'

_logged_unknown = set()
_cache = {'parents': {}, 'instances': {}}


def _hex_to_linear(hex_color):
    hex_color = hex_color.lstrip('#')
    if len(hex_color) != 6:
        raise ValueError(f'expected #rrggbb, got {hex_color!r}')
    def srgb_to_linear(c):
        # The table is sRGB hex (what the web's colour pickers show); UE parameters are linear.
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r = srgb_to_linear(int(hex_color[0:2], 16) / 255.0)
    g = srgb_to_linear(int(hex_color[2:4], 16) / 255.0)
    b = srgb_to_linear(int(hex_color[4:6], 16) / 255.0)
    return unreal.LinearColor(r, g, b, 1.0)


def _ensure_parent(path, translucent):
    key = 'glass' if translucent else 'opaque'
    if key in _cache['parents']:
        return _cache['parents'][key]
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        material = unreal.EditorAssetLibrary.load_asset(path)
        _cache['parents'][key] = material
        return material

    os.makedirs(unreal.Paths.project_saved_dir(), exist_ok=True)
    asset_name = path.rsplit('/', 1)[-1]
    package_path = path.rsplit('/', 1)[0]
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.MaterialFactoryNew()
    material = tools.create_asset(asset_name, package_path, unreal.Material, factory)
    mel = unreal.MaterialEditingLibrary

    base = mel.create_material_expression(material, unreal.MaterialExpressionVectorParameter, -420, -40)
    base.set_editor_property('parameter_name', 'BaseColor')
    rough = mel.create_material_expression(material, unreal.MaterialExpressionScalarParameter, -420, 120)
    rough.set_editor_property('parameter_name', 'Roughness')
    metal = mel.create_material_expression(material, unreal.MaterialExpressionScalarParameter, -420, 280)
    metal.set_editor_property('parameter_name', 'Metallic')

    mel.connect_material_property(base, '', unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(rough, '', unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(metal, '', unreal.MaterialProperty.MP_METALLIC)

    if translucent:
        material.set_editor_property('blend_mode', unreal.BlendMode.BLEND_TRANSLUCENT)
        opacity = mel.create_material_expression(material, unreal.MaterialExpressionScalarParameter, -420, 440)
        opacity.set_editor_property('parameter_name', 'Opacity')
        opacity.set_editor_property('default_value', 0.35)
        mel.connect_material_property(opacity, '', unreal.MaterialProperty.MP_OPACITY)

    mel.recompile_material(material)
    unreal.EditorAssetLibrary.save_asset(path)
    _cache['parents'][key] = material
    return material


def _mic_path(material_name):
    safe = material_name.replace(' ', '_')
    return f'{PACKAGE}/MI_{safe}'


def _ensure_instance(material_name, entry):
    path = _mic_path(material_name)
    if path in _cache['instances']:
        return _cache['instances'][path]
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        mic = unreal.EditorAssetLibrary.load_asset(path)
        _cache['instances'][path] = mic
        return mic

    translucent = material_name == 'glass'
    parent_path = GLASS_PARENT if translucent else OPAQUE_PARENT
    parent = _ensure_parent(parent_path, translucent)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.MaterialInstanceConstantFactoryNew()
    asset_name = path.rsplit('/', 1)[-1]
    package_path = path.rsplit('/', 1)[0]
    mic = tools.create_asset(asset_name, package_path, unreal.MaterialInstanceConstant, factory)
    unreal.MaterialEditingLibrary.set_material_instance_parent(mic, parent)
    unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(
        mic, 'BaseColor', _hex_to_linear(entry['baseColor']))
    unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(
        mic, 'Roughness', float(entry['roughness']))
    unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(
        mic, 'Metallic', float(entry['metallic']))
    unreal.EditorAssetLibrary.save_asset(path)
    _cache['instances'][path] = mic
    return mic


def _slot_name(static_mesh, slot_index):
    if static_mesh is None:
        return None
    try:
        name = static_mesh.get_material_slot_name(slot_index)
        if name:
            return str(name)
    except Exception:
        pass
    static_materials = static_mesh.get_editor_property('static_materials')
    if slot_index < len(static_materials):
        slot = static_materials[slot_index]
        return str(slot.get_editor_property('material_slot_name'))
    return None


def apply_material_table(actors, table_path):
    """Map imported StaticMeshActor slots through material-table.json.

    Returns dict with mapped_slots, unknown_names (sorted), and unknown_slots counts.
    """
    with open(table_path, encoding='utf-8') as fh:
        table = json.load(fh)

    mapped = 0
    unknown_names = set()
    unknown_slots = 0

    for actor in actors:
        if not isinstance(actor, unreal.StaticMeshActor):
            continue
        comp = actor.get_component_by_class(unreal.StaticMeshComponent)
        if comp is None:
            continue
        static_mesh = comp.get_static_mesh()
        slot_count = comp.get_num_materials()
        for slot_index in range(slot_count):
            name = _slot_name(static_mesh, slot_index)
            if not name or name not in table:
                unknown_slots += 1
                if name and name not in table:
                    if name not in _logged_unknown:
                        _logged_unknown.add(name)
                        unknown_names.add(name)
                        unreal.log_warning(f'[parity-spike] unknown material slot name: {name}')
                continue
            mic = _ensure_instance(name, table[name])
            comp.set_material(slot_index, mic)
            mapped += 1

    return {
        'mapped_slots': mapped,
        'unknown_names': sorted(unknown_names),
        'unknown_slots': unknown_slots,
    }
