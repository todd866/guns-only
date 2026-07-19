"""Deterministic Guns Only Blender-to-GLB export entrypoint.

Run through Blender, not a system Python:
  blender --background source.blend --python export_glb.py -- --output model.glb
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from pathlib import Path

import bpy


def fail(message: str) -> None:
    raise RuntimeError(f"guns-only export: {message}")


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Validate and export a Guns Only GLB")
    parser.add_argument("--output", required=True)
    parser.add_argument("--collection")
    parser.add_argument("--selection", action="store_true")
    parser.add_argument("--apply-modifiers", action="store_true")
    parser.add_argument("--animations", action="store_true")
    parser.add_argument("--allow-unapplied-transforms", action="store_true")
    args = parser.parse_args(arguments)
    if args.collection and args.selection:
        parser.error("--collection and --selection are mutually exclusive")
    return args


def selected_objects(args: argparse.Namespace) -> list[bpy.types.Object]:
    if args.collection:
        collection = bpy.data.collections.get(args.collection)
        if collection is None:
            fail(f"collection '{args.collection}' does not exist")
        objects = list(collection.all_objects)
    elif args.selection:
        objects = list(bpy.context.selected_objects)
    else:
        # Full-scene export deliberately omits authoring cameras and lights.
        objects = [obj for obj in bpy.context.scene.objects if obj.type not in {"CAMERA", "LIGHT"}]
    if not objects:
        fail("export set is empty")
    objects.sort(key=lambda obj: obj.name)
    return objects


def validate_scene(args: argparse.Namespace, objects: list[bpy.types.Object]) -> None:
    if bpy.app.version < (4, 0, 0):
        fail(f"Blender 4.0+ is required; found {bpy.app.version_string}")

    scene = bpy.context.scene
    if scene.unit_settings.system != "METRIC":
        fail("scene unit system must be METRIC")
    if not math.isclose(scene.unit_settings.scale_length, 1.0, rel_tol=0.0, abs_tol=1e-6):
        fail("scene unit scale_length must be 1.0 (one Blender unit equals one metre)")

    names: set[str] = set()
    for obj in objects:
        if obj.name in names:
            fail(f"duplicate exported object name '{obj.name}'")
        names.add(obj.name)
        if obj.type in {"CAMERA", "LIGHT"}:
            fail(f"export set contains {obj.type.lower()} '{obj.name}'; cameras and lights are runtime-owned")
        if any(component < 0 for component in obj.scale):
            fail(f"object '{obj.name}' has negative scale; apply transforms and fix winding")
        if not args.allow_unapplied_transforms and any(not math.isclose(component, 1.0, rel_tol=0.0, abs_tol=1e-5) for component in obj.scale):
            fail(f"object '{obj.name}' has unapplied scale {tuple(round(value, 6) for value in obj.scale)}")
        if obj.name.startswith("SOCKET_") and obj.type != "EMPTY":
            fail(f"socket '{obj.name}' must be an Empty so it exports as a transform-only glTF node")

    if not any(obj.type == "MESH" for obj in objects):
        fail("export set contains no mesh objects")


def select_only(objects: list[bpy.types.Object]) -> None:
    for obj in bpy.context.view_layer.objects:
        obj.select_set(False)
    for obj in objects:
        if obj.name not in bpy.context.view_layer.objects:
            fail(f"object '{obj.name}' is not in the active view layer")
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = next((obj for obj in objects if obj.type == "MESH"), objects[0])


def export(args: argparse.Namespace, output: Path) -> None:
    desired = {
        "filepath": str(output),
        "export_format": "GLB",
        "use_selection": True,
        "export_yup": True,
        "export_normals": True,
        "export_tangents": True,
        "export_extras": True,
        "export_cameras": False,
        "export_lights": False,
        "export_animations": args.animations,
        "export_apply": args.apply_modifiers,
        "export_attributes": True,
        "will_save_settings": False,
        "check_existing": False,
    }
    operator = bpy.ops.export_scene.gltf
    available = {prop.identifier for prop in operator.get_rna_type().properties}
    required = {"filepath", "export_format", "use_selection", "export_yup", "export_extras"}
    missing = sorted(required - available)
    if missing:
        fail(f"installed glTF exporter lacks required settings: {', '.join(missing)}")
    settings = {key: value for key, value in desired.items() if key in available}
    result = operator(**settings)
    if "FINISHED" not in result:
        fail(f"Blender glTF exporter returned {sorted(result)}")
    if not output.is_file() or output.stat().st_size == 0:
        fail("exporter did not create a non-empty GLB")


def main() -> None:
    args = parse_args()
    output = Path(os.path.abspath(args.output))
    if output.suffix.lower() != ".glb":
        fail("--output must end in .glb")
    output.parent.mkdir(parents=True, exist_ok=True)
    objects = selected_objects(args)
    validate_scene(args, objects)
    select_only(objects)
    export(args, output)
    print(f"guns-only export: wrote {output} ({output.stat().st_size} bytes, {len(objects)} objects)")


if __name__ == "__main__":
    main()
