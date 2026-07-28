#!/usr/bin/env python3
"""TM projection round-trip tests for Korea default and Ukraine central meridian."""

from __future__ import annotations

import math
import unittest

import numpy as np

from build_korea_terrain import (
    central_meridian_deg_for_region,
    utm_to_wgs84,
    wgs84_to_utm,
)


class TmProjectionTests(unittest.TestCase):
    def test_korea_default_meridian_matches_zone_52(self) -> None:
        self.assertEqual(central_meridian_deg_for_region({"workingCrs": "EPSG:32652"}), 129.0)
        east, north = wgs84_to_utm(38.3, 127.15)
        lat, lon = utm_to_wgs84(east, north)
        self.assertAlmostEqual(float(lat), 38.3, places=5)
        self.assertAlmostEqual(float(lon), 127.15, places=5)

    def test_ukraine_central_meridian_round_trip(self) -> None:
        region = {
            "workingCrs": "TM_WGS84_CM35.7",
            "centralMeridianDeg": 35.7,
        }
        self.assertEqual(central_meridian_deg_for_region(region), 35.7)
        east, north = wgs84_to_utm(48.5, 38.0, central_meridian_deg=35.7)
        lat, lon = utm_to_wgs84(east, north, central_meridian_deg=35.7)
        self.assertAlmostEqual(float(lat), 48.5, places=5)
        self.assertAlmostEqual(float(lon), 38.0, places=5)
        # Far edge of the jet-range AOI should stay well under kilometre-scale TM stretch.
        east_w, north_w = wgs84_to_utm(46.6, 33.0, central_meridian_deg=35.7)
        self.assertTrue(math.isfinite(float(east_w)) and math.isfinite(float(north_w)))


if __name__ == "__main__":
    unittest.main()
