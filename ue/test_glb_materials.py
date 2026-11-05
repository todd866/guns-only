"""GLB material-name extraction for the Unreal parity material table (no UE required)."""
import json
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / 'ue' / 'unreal'))
from glb_materials import (  # noqa: E402
    DISTRICT_GLB_NAMES,
    material_names_from_district_glbs,
    material_names_from_glb,
    read_gltf_document,
)


class GlbMaterialNamesTest(unittest.TestCase):
    def test_read_gltf_document_has_materials_array(self):
        glb = REPO / 'web/wwwroot/rc/assets/districts/skatepark.glb'
        doc = read_gltf_document(glb)
        self.assertIn('materials', doc)
        self.assertGreaterEqual(len(doc['materials']), 1)

    def test_skatepark_material_names(self):
        glb = REPO / 'web/wwwroot/rc/assets/districts/skatepark.glb'
        names = material_names_from_glb(glb)
        self.assertIn('concrete', names)
        self.assertIn('turf', names)
        self.assertEqual(len(names), len(set(names)))

    def test_union_across_four_district_glbs(self):
        names = material_names_from_district_glbs(REPO)
        for district in DISTRICT_GLB_NAMES:
            glb = REPO / f'web/wwwroot/rc/assets/districts/{district}.glb'
            for name in material_names_from_glb(glb):
                self.assertIn(name, names)
        self.assertIn('asphalt', names)
        self.assertIn('gym', names)
        self.assertGreaterEqual(len(names), 60)

    def test_material_table_covers_all_glb_names(self):
        table_path = REPO / 'ue/unreal/material-table.json'
        table = json.loads(table_path.read_text(encoding='utf-8'))
        glb_names = material_names_from_district_glbs(REPO)
        self.assertEqual(set(table), glb_names)
        for name, entry in table.items():
            self.assertRegex(entry['baseColor'], '^#[0-9a-f]{6}$')
            self.assertIn('roughness', entry)
            self.assertIn('metallic', entry)
            self.assertIn('note', entry)


if __name__ == '__main__':
    unittest.main()
