"""Refresh ALEN's independent, freshness-checked CelesTrak OMM snapshot.

Runs from GitHub Actions no more than every six hours. Cached content stays
available on an isolated orbit-feed branch and is NOT tied to website deploys.
CelesTrak source data remains attributed, unmodified orbital data.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from time import sleep
import json
import os
import sys

import httpx

GROUPS = (
    "last-30-days", "stations", "visual", "starlink", "oneweb", "kuiper",
    "gnss", "weather", "earth-resources", "science", "amateur", "geo",
    "military", "cubesat", "fengyun-1c-debris", "iridium-33-debris",
    "cosmos-2251-debris", "cosmos-1408-debris",
)
HOT_GROUPS = {"starlink", "oneweb", "kuiper"}
MEDIUM_GROUPS = {"last-30-days", "stations", "visual"}
SOURCE = "https://celestrak.org/NORAD/elements/gp.php"


def freshness_age_days(epoch: str, when: datetime) -> float:
    parsed = datetime.fromisoformat(epoch.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return (when - parsed.astimezone(timezone.utc)).total_seconds() / 86400


def validated_snapshot(group: str, payload: object, when: datetime) -> tuple[list[dict], float] | None:
    if not isinstance(payload, list) or not payload:
        return None
    entries = [item for item in payload if isinstance(item, dict)
               and "NORAD_CAT_ID" in item and "MEAN_MOTION" in item
               and "EPOCH" in item]
    if not entries or len(entries) < 0.95 * len(payload):
        return None
    ages = []
    for item in entries[::max(1, len(entries)//250)]:
        try:
            ages.append(freshness_age_days(str(item["EPOCH"]), when))
        except (ValueError, TypeError):
            pass
    if not ages:
        return None
    midpoint = median(ages)
    upper_bound = 5 if group in HOT_GROUPS else 10 if group in MEDIUM_GROUPS else 21
    if not -2 <= midpoint <= upper_bound:
        return None
    return entries, midpoint


def main() -> int:
    directory = Path(os.getenv("ALEN_ORBIT_FEED_OUTPUT", "/tmp/alen-orbit-feed"))
    directory.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    manifest = {"source": SOURCE, "fetchedAt": now.isoformat(),
                "licenceNote": "Public orbital elements from CelesTrak; respect usage policy.",
                "groups": {}}
    successful = 0
    with httpx.Client(timeout=30.0, headers={"User-Agent": "ALEN-OrbitSnapshot/1.0 (https://github.com/Frazmcc/ALEN)", "Accept": "application/json"}) as client:
        for group in GROUPS:
            # Do not repeatedly retry 403/429 responses: CelesTrak rate-limits.
            try:
                res = client.get(SOURCE, params={"GROUP": group.upper(), "FORMAT": "JSON"})
                res.raise_for_status()
                checked = validated_snapshot(group, res.json(), now)
                if checked is None:
                    print(f"{group}: skipped empty or stale source", flush=True)
                    continue
                entries, median_age = checked
                (directory / f"{group}.json").write_text(
                    json.dumps(entries, separators=(",", ":"), ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )
                manifest["groups"][group] = {
                    "count": len(entries), "medianEpochAgeDays": round(median_age, 3),
                    "fetchedAt": now.isoformat(),
                }
                successful += 1
                print(f"{group}: {len(entries)} records, median age {median_age:.2f} days", flush=True)
            except (httpx.HTTPError, ValueError, KeyError) as exc:
                print(f"{group}: source unavailable ({str(exc)[:140]})", flush=True)
            sleep(0.5)
    # Keep the prior snapshot for any group we could not safely refresh.
    (directory / "latest-run.json").write_text(json.dumps(manifest, indent=2) + "\n",encoding="utf-8")
    print(f"Updated {successful}/{len(GROUPS)} groups", flush=True)
    if "starlink" not in manifest["groups"]:
        print("Starlink refresh failed; existing snapshot remains unchanged", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
