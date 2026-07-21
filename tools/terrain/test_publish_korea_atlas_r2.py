#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from publish_korea_atlas_r2 import publication_files, upload  # noqa: E402


class KoreaAtlasPublisherTests(unittest.TestCase):
    def test_root_publication_marker_is_last(self):
        with tempfile.TemporaryDirectory() as directory:
            root_path = Path(directory) / "korea.atlas.manifest.json"
            pages = root_path.parent / "pages"
            pages.mkdir()
            page_path = pages / "page.manifest.json"
            page_path.write_text(json.dumps({"bundle": {"uri": "page.terrain"}}))
            (pages / "page.terrain").write_bytes(b"terrain")
            root_path.write_text(json.dumps({
                "pages": [{"manifest": {"uri": "pages/page.manifest.json"}}],
            }))

            relative_paths = [relative.as_posix()
                              for _, relative, _ in publication_files(root_path)]
            self.assertEqual(relative_paths, [
                "pages/page.manifest.json",
                "pages/page.terrain",
                "korea.atlas.manifest.json",
            ])

    def test_upload_retries_transient_wrangler_failure(self):
        item = (Path("page.terrain"), Path("pages/page.terrain"),
                "application/octet-stream")
        failure = subprocess.CalledProcessError(1, ["wrangler"])
        with patch("publish_korea_atlas_r2.subprocess.run",
                   side_effect=[failure, None]) as run, \
                patch("publish_korea_atlas_r2.time.sleep") as sleep:
            key = upload(["wrangler"], "terrain", "version", item, retries=2)
        self.assertEqual(key, "version/pages/page.terrain")
        self.assertEqual(run.call_count, 2)
        sleep.assert_called_once_with(1)


if __name__ == "__main__":
    unittest.main()
