#!/usr/bin/env python3
"""Offline integrity checks for the committed GIS products; standard library only."""
import hashlib
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'content/packs/okanagan-fire/environment'
RUNTIME = ROOT / 'web/wwwroot/content/packs/okanagan-fire/environment'


def grids(grid):
    yield grid
    for child in grid.get('details', []):
        yield from grids(child)


class SceneryIntegrity(unittest.TestCase):
    def test_source_runtime_closure(self):
        for source in SOURCE.iterdir():
            if source.is_file():
                self.assertEqual(source.read_bytes(), (RUNTIME / source.name).read_bytes(), source.name)

    def test_grid_dimensions_ranges_and_parent_alignment(self):
        terrain = json.loads((SOURCE / 'okanagan-central.cdem.json').read_text())
        self.assertEqual([g['id'] for g in grids(terrain)],
                         ['okanagan-valley', 'central-okanagan', 'peachland', 'big-white', 'silverstar', 'apex', 'baldy'])
        for grid in grids(terrain):
            self.assertEqual(len(grid['elevationsM']), grid['rows'])
            for row in grid['elevationsM']:
                self.assertEqual(len(row), grid['columns'])
                self.assertTrue(all(isinstance(h, (int, float)) and 250 < h < 3000 for h in row))
            b = grid['bounds']
            dx, dy = (b['east']-b['west'])/(grid['columns']-1), (b['north']-b['south'])/(grid['rows']-1)
            for child in grid.get('details', []):
                w, c = child['parentWindow'], child['bounds']
                for actual, expected in [(c['west'], b['west']+dx*w['columnStart']), (c['east'], b['west']+dx*w['columnEnd']),
                                         (c['south'], b['south']+dy*w['rowStart']), (c['north'], b['south']+dy*w['rowEnd'])]:
                    self.assertAlmostEqual(actual, expected, places=8)

    def test_orthophoto_payload_hashes(self):
        terrain = json.loads((SOURCE / 'okanagan-central.cdem.json').read_text())
        for grid in grids(terrain):
            if 'texture' not in grid:
                continue
            texture = grid['texture']
            for item in [texture, texture['fallback']]:
                image = SOURCE / Path(item['url']).name
                self.assertEqual(hashlib.sha256(image.read_bytes()).hexdigest(), item['sha256'])
            self.assertEqual(len(texture['coverage']), grid['rows'])
            self.assertTrue(all(len(row) == grid['columns'] for row in texture['coverage']))


if __name__ == '__main__':
    unittest.main()
