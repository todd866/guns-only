"""Parse district GLB JSON chunks (stdlib only). Used to build the parity material table."""
import json
import struct
from pathlib import Path

DISTRICT_GLB_NAMES = ('skatepark', 'housing', 'bx', 'school')


def read_gltf_document(glb_path):
    """Return the glTF dict from a GLB file's JSON chunk."""
    data = Path(glb_path).read_bytes()
    if len(data) < 12 or data[:4] != b'glTF':
        raise ValueError(f'not a GLB: {glb_path}')
    _magic, _version, _length = struct.unpack('<4sII', data[:12])
    offset = 12
    chunk_len, chunk_type = struct.unpack('<I4s', data[offset:offset + 8])
    offset += 8
    chunk = data[offset:offset + chunk_len]
    if chunk_type != b'JSON':
        raise ValueError(f'first GLB chunk is not JSON: {glb_path}')
    return json.loads(chunk.decode().rstrip('\x00 '))


def material_names_from_glb(glb_path):
    """Material names in file order (glTF materials array)."""
    doc = read_gltf_document(glb_path)
    names = []
    for index, material in enumerate(doc.get('materials') or []):
        names.append(material.get('name') or f'material_{index}')
    return names


def material_names_from_district_glbs(repo_root):
    """Union of glTF material names across the four district GLBs."""
    root = Path(repo_root)
    names = set()
    for district in DISTRICT_GLB_NAMES:
        glb = root / 'web/wwwroot/rc/assets/districts' / f'{district}.glb'
        names.update(material_names_from_glb(glb))
    return names
