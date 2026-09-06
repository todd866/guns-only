#!/usr/bin/env node
// The original 33×33 importer would erase Peachland and the mountain detail grids.
// Keep the familiar entry point as a pointer to the complete, source-backed authoring pipeline.
console.error("Use a Python environment with tools/terrain/requirements-okanagan.txt, then run:");
console.error("  python tools/terrain/fetch_okanagan_scenery.py");
console.error("  python tools/terrain/fetch_okanagan_resorts.py");
process.exitCode = 1;
