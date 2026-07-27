"""Recompute the headline telemetry/build checks from the saved bounded evidence."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent
EVIDENCE = json.loads((ROOT / "evidence.json").read_text(encoding="utf-8"))


def parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


runtime = EVIDENCE["runtime_log_slice"]
deployment = EVIDENCE["deployment"]
gaps = runtime["adjacent_telemetry_gap_ms"]

posts_from_minutes = sum(row["posts"] for row in runtime["telemetry_posts_by_minute"])
assert posts_from_minutes == runtime["telemetry_posts"]
assert runtime["telemetry_posts"] == runtime["telemetry_successes_204"]
assert runtime["build_info_gets"] == runtime["build_info_successes_200"]
assert gaps["count"] == runtime["telemetry_posts"] - 1
assert EVIDENCE["local_contract_tests"]["tests_run"] == EVIDENCE["local_contract_tests"]["tests_passed"]

window_minutes = (
    parse_utc(runtime["window_end_utc"]) - parse_utc(runtime["window_start_utc"])
).total_seconds() / 60
telemetry_success_rate = runtime["telemetry_successes_204"] / runtime["telemetry_posts"]
subsecond_gap_share = gaps["under_1_second"] / gaps["count"]

summary = {
    "deployment_ready": deployment["state"] == "READY",
    "created_to_ready_seconds": round(deployment["created_to_ready_ms"] / 1000, 3),
    "browser_boot_clean": EVIDENCE["browser_smoke"]["boot_ready"]
    and not EVIDENCE["browser_smoke"]["fatal_visible"]
    and EVIDENCE["browser_smoke"]["console_warning_or_error_count"] == 0,
    "observed_log_window_minutes": round(window_minutes, 3),
    "observed_telemetry_posts": runtime["telemetry_posts"],
    "telemetry_post_success_rate": telemetry_success_rate,
    "subsecond_adjacent_gap_share": round(subsecond_gap_share, 4),
    "vercel_web_analytics_usable": EVIDENCE["vercel_web_analytics"]["tracking_installed"],
    "behavioral_metrics_available": EVIDENCE["production_telemetry_access"]["behavioral_metrics_available"],
}

print(json.dumps(summary, indent=2, sort_keys=True))
