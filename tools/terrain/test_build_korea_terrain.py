#!/usr/bin/env python3

from __future__ import annotations

import math
import json
from pathlib import Path
import struct
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_korea_terrain import (  # noqa: E402
    VALLEY_SEED,
    build_valley_network,
    carve_valley_network,
    quantize,
)


class KoreaTerrainCarveTests(unittest.TestCase):
    def test_seeded_network_has_three_connected_monotonic_major_runs(self):
        first = build_valley_network()
        second = build_valley_network()
        self.assertEqual(first, second)
        self.assertNotEqual(first, build_valley_network(VALLEY_SEED + 1))
        self.assertEqual(len(first["runs"]), 3)
        for run in first["runs"]:
            self.assertGreater(run["lengthM"], 15_000)
            self.assertEqual(run["outletNodeId"], "coast-outlet")
            self.assertTrue(all(
                upstream > downstream
                for upstream, downstream in zip(
                    run["floorHeightsM"], run["floorHeightsM"][1:]
                )
            ))
            self.assertGreaterEqual(run["floorWidthRangeM"][0], 1500)
            self.assertLessEqual(run["floorWidthRangeM"][1], 3000)
            self.assertGreaterEqual(run["wallAngleRangeDegrees"][0], 20)
            self.assertLessEqual(run["wallAngleRangeDegrees"][1], 30)

    def test_carve_makes_the_declared_floor_and_wall_profile_bit_identically(self):
        network = build_valley_network()
        reach = next(
            item for item in network["reaches"]
            if item["parentId"] == "marquee-upper--marquee-mid"
        )
        upstream = reach["upstream"]
        downstream = reach["downstream"]
        east_delta = downstream["eastM"] - upstream["eastM"]
        north_delta = downstream["northM"] - upstream["northM"]
        length = math.hypot(east_delta, north_delta)
        east_mid = (upstream["eastM"] + downstream["eastM"]) * 0.5
        north_mid = (upstream["northM"] + downstream["northM"]) * 0.5
        half_width = (upstream["floorWidthM"] + downstream["floorWidthM"]) * 0.25
        offset = half_width + 400.0
        normal_east = -north_delta / length
        normal_north = east_delta / length
        east = np.array([[east_mid, east_mid + normal_east * offset]], dtype=np.float64)
        north = np.array([[north_mid, north_mid + normal_north * offset]], dtype=np.float64)
        source = np.full(east.shape, 2500.0, dtype=np.float32)
        water = np.zeros(east.shape, dtype=bool)
        isolated_network = {"reaches": [reach]}

        first = carve_valley_network(east, north, source, water, isolated_network)
        second = carve_valley_network(east, north, source, water, isolated_network)
        expected_floor = (
            upstream["floorHeightM"] + downstream["floorHeightM"]
        ) * 0.5
        self.assertAlmostEqual(float(first[0, 0]), expected_floor, places=4)
        wall_angle = math.degrees(math.atan(
            (float(first[0, 1]) - float(first[0, 0])) / 400.0
        ))
        self.assertGreaterEqual(wall_angle, 20.0)
        self.assertLessEqual(wall_angle, 30.0)
        self.assertEqual(quantize(first, water).tobytes(),
                         quantize(second, water).tobytes())

    def test_conditioned_land_floors_descend_even_across_source_dem_pits(self):
        network = build_valley_network()
        for run in network["runs"]:
            nodes = [network["nodes"][node_id] for node_id in run["nodeIds"]]
            east = np.array([[node["eastM"] for node in nodes]], dtype=np.float64)
            north = np.array([[node["northM"] for node in nodes]], dtype=np.float64)
            source = np.full(east.shape, -500.0, dtype=np.float32)
            water = np.zeros(east.shape, dtype=bool)
            carved = carve_valley_network(east, north, source, water, network)[0]
            self.assertTrue(all(
                upstream > downstream
                for upstream, downstream in zip(carved, carved[1:])
            ), f"{run['id']} did not retain a monotonically descending land floor")

    def test_water_classification_is_never_rewritten_by_the_carve(self):
        network = build_valley_network()
        outlet = network["nodes"]["coast-outlet"]
        east = np.array([[outlet["eastM"]]], dtype=np.float64)
        north = np.array([[outlet["northM"]]], dtype=np.float64)
        source = np.array([[0.0]], dtype=np.float32)
        water = np.array([[True]], dtype=bool)
        carved = carve_valley_network(east, north, source, water, network)
        self.assertEqual(float(carved[0, 0]), 0.0)
        self.assertEqual(int(quantize(carved, water)[0, 0]), -32768)

    def test_committed_renderer_lod_and_kernel_truth_are_one_grid(self):
        terrain_dir = (
            Path(__file__).resolve().parents[2]
            / "content/packs/korea-1950s/environment/terrain"
        )
        manifest = json.loads((terrain_dir / "central-front.manifest.json").read_text())
        self.assertEqual(manifest["terrainVersion"], "central-front-carved-valleys-v3")
        self.assertEqual(manifest["carving"]["seed"], f"0x{VALLEY_SEED:014x}")
        bundle = (terrain_dir / manifest["bundle"]["uri"]).read_bytes()
        truth_bytes = (terrain_dir / manifest["simulationTruth"]["uri"]).read_bytes()
        _, version, width, height, spacing, _, _, scale, sentinel = struct.unpack(
            "<8sIIIddddh10x", truth_bytes[:64]
        )
        self.assertEqual((version, width, height, spacing, scale, sentinel),
                         (1, 1025, 1025, 128.0, 0.1, -32768))
        truth = np.frombuffer(truth_bytes, dtype="<i2", offset=64).reshape(height, width)
        renderer = np.empty_like(truth)
        written = np.zeros(truth.shape, dtype=bool)
        for chunk in manifest["chunks"]:
            record = chunk["lods"][1]
            self.assertEqual((record["sampleCount"], record["spacingM"]), (129, 128.0))
            tile = np.frombuffer(
                bundle,
                dtype="<i2",
                count=record["sampleCount"] ** 2,
                offset=record["byteOffset"],
            ).reshape(record["sampleCount"], record["sampleCount"])
            east = chunk["eastIndex"] * 128
            north = chunk["northIndex"] * 128
            target = np.s_[north:north + 129, east:east + 129]
            overlap = written[target]
            if np.any(overlap):
                self.assertTrue(np.array_equal(renderer[target][overlap], tile[overlap]))
            renderer[target] = tile
            written[target] = True
        self.assertTrue(np.all(written))
        self.assertTrue(np.array_equal(renderer, truth),
                        "renderer LOD1 and embedded kernel truth diverged")


if __name__ == "__main__":
    unittest.main()
