#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_korea_atlas import (  # noqa: E402
    build_page,
    encoded_lods,
    SourceCellCatalog,
    stable_seed,
    terrain_metrics,
    tile_plan,
    wgs84_to_utm,
)


class SyntheticCatalog:
    def __init__(self):
        self.calls = 0

    def sample(self, easting, northing):
        self.calls += 1
        height = ((easting - easting.min()) * 2.0
                  + (northing - northing.min()) * 3.0).astype(np.float32)
        water = np.zeros(easting.shape, dtype=bool)
        if self.calls == 2:
            water[:] = True
        return height, water


class KoreaAtlasBuilderTests(unittest.TestCase):
    def test_samples_locked_implicit_ocean_without_source_objects(self):
        source_lock = {
            "canonicalCoverage": {"implicitWaterCells": ["N38E127"]},
            "products": [{"objects": []}],
        }
        region = {
            "aoiWgs84": [127.0, 38.0, 128.0, 39.0],
            "acquisitionCells": ["N38E127"],
        }
        with tempfile.TemporaryDirectory() as directory:
            catalog = SourceCellCatalog(source_lock, region, Path(directory))
            east, north = wgs84_to_utm(
                np.array([[38.5, 32.5]]), np.array([[127.5, 123.5]])
            )
            height, water = catalog.sample(east, north)
            self.assertEqual(float(height[0, 0]), 0)
            self.assertTrue(bool(water[0, 0]))
            self.assertEqual(float(height[0, 1]), 0)
            self.assertTrue(bool(water[0, 1]))

    def test_partitions_tiles_into_stable_pages(self):
        pages = tile_plan((0.0, 0.0, 32.0, 16.0), 8.0, 16.0)
        self.assertEqual(len(pages), 2)
        self.assertEqual(sum(len(value) for value in pages.values()), 8)
        self.assertEqual(pages[(0, 0)][0]["id"], "e0000-n0000")
        self.assertEqual(pages[(1, 0)][0]["id"], "e0002-n0000")

    def test_lods_are_exact_subsamples_and_seeds_are_stable(self):
        height = np.arange(25, dtype=np.float32).reshape(5, 5)
        water = np.zeros((5, 5), dtype=bool)
        water[2, 2] = True
        lods = list(encoded_lods(height, water, (5, 3)))
        self.assertEqual(lods[0][3].shape, (5, 5))
        self.assertEqual(lods[1][3].shape, (3, 3))
        self.assertEqual(int(lods[1][3][1, 1]), -32768)
        self.assertEqual(stable_seed("korea:e0001-n0002"),
                         stable_seed("korea:e0001-n0002"))
        self.assertNotEqual(stable_seed("1950s"), stable_seed("modern"))
        metrics = terrain_metrics(height, water, 2.0, "fixture")
        self.assertEqual(metrics["seed"], stable_seed("fixture"))
        self.assertGreater(metrics["ruggednessM"], 0)

    def test_page_omits_all_water_tiles_and_emits_range_records(self):
        source_lock = {
            "sourceLockId": "source.test.v1",
            "products": [{
                "id": "dem.test",
                "edition": "1",
                "licence": {"requiredNotices": ["test notice"]},
            }],
        }
        region = {"id": "test"}
        tiles = [
            {
                "id": "e0000-n0000", "eastIndex": 0, "northIndex": 0,
                "minimumEastM": 0.0, "minimumNorthM": 0.0,
            },
            {
                "id": "e0001-n0000", "eastIndex": 1, "northIndex": 0,
                "minimumEastM": 8.0, "minimumNorthM": 0.0,
            },
        ]
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            descriptor = build_page(
                SyntheticCatalog(), source_lock, region, 500_000.0, 4_000_000.0,
                tiles, (0.0, 0.0, 16.0, 8.0), output, 8.0, (5, 3), "page-test",
            )
            self.assertIsNotNone(descriptor)
            manifest = json.loads((output / "pages/page-test.manifest.json").read_text())
            self.assertEqual(len(manifest["chunks"]), 1)
            self.assertEqual(manifest["chunks"][0]["generation"]["landFraction"], 1.0)
            self.assertEqual([record["sampleCount"] for record in manifest["chunks"][0]["lods"]],
                             [5, 3])
            self.assertEqual(manifest["bundle"]["recordCount"], 2)
            self.assertEqual(manifest["bundle"]["byteLength"],
                             (output / "pages/page-test.terrain").stat().st_size)
            self.assertEqual(descriptor["chunkCount"], 1)


if __name__ == "__main__":
    unittest.main()
