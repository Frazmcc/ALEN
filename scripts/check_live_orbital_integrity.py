"""Live deployment integrity check: prevent a return to 16 satellites / 10k rejected."""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

API = os.getenv("ALEN_LIVE_API", "https://alen-api-lquw.onrender.com")
PARAMS = urllib.parse.urlencode({
    "lat": 55.7706, "lon": -4.0914,
    "groups": "starlink,stations,visual", "limit": 50,
})


def evaluate(diagnostics: dict, satellites: list) -> dict:
    unique = int(diagnostics.get("unique_orbits", 0))
    visible = int(diagnostics.get("visible", 0))
    rejected = int(diagnostics.get("physically_implausible", 0))
    returned = int(diagnostics.get("returned", 0))
    sources = diagnostics.get("catalogue_source_by_group") or {}
    if unique < 1000:
        raise AssertionError(f"Full satellite catalogue missing: {unique} unique records")
    if visible < 100:
        raise AssertionError(f"Only {visible} geometric-horizon satellites visible; source likely stale")
    if rejected > max(50, unique // 10):
        raise AssertionError(f"Over-filtering regression: {rejected}/{unique} predictions rejected")
    if returned < min(50, visible):
        raise AssertionError(f"API returned {returned} but {visible} satellites passed the horizon check")
    if len(satellites) != returned:
        raise AssertionError("Reported and returned counts disagree")
    if sources.get("starlink") not in {"alen_snapshot", "celestrak", "secondary_tle"}:
        raise AssertionError(f"Starlink source unhealthy: {sources.get('starlink')!r}")
    if diagnostics.get("complete") is False:
        raise AssertionError(f"Missing orbital source groups: {diagnostics.get('missing_groups')}")
    return {
        "unique": unique, "visible": visible, "returned": returned,
        "rejected": rejected, "source": sources,
        "position_sample_at": diagnostics.get("position_sample_at"),
    }


# Diagnostic request copied from the current web client's default groups.
# Runs on PRs to expose mobile/desktop failures that the light three-group
# integrity probe cannot reproduce. Do not confuse the 50-object probe with
# the default 2000-object browser request.
FRONTEND_GROUPS = (
    "last-30-days,stations,visual,starlink,oneweb,"
    "gnss,weather,earth-resources"
)
def probe_frontend_request() -> None:
    params=urllib.parse.urlencode({
        "lat":55.7706,"lon":-4.0914,"groups":FRONTEND_GROUPS.replace(",earth-resources",""),
        "limit":2000,"altitude_m":0,
    })
    url=API.rstrip("/")+"/api/v1/satellites?"+params
    start=time.monotonic()
    try:
        request=urllib.request.Request(url,headers={"User-Agent":"ALEN-Frontend-Diagnostics/1.0"})
        with urllib.request.urlopen(request,timeout=35) as response:
            payload=json.load(response)
        diagnostics=payload.get("diagnostics") or {}
        print("FRONTEND PROBE:",json.dumps({
            "elapsed_seconds":round(time.monotonic()-start,1),
            "returned":len(payload.get("satellites") or []),
            "unique_orbits":diagnostics.get("unique_orbits"),
            "complete":diagnostics.get("complete"),
            "missing_groups":diagnostics.get("missing_groups"),
            "sample_age_seconds":diagnostics.get("position_sample_age_seconds"),
        },indent=2),flush=True)
    except Exception as error:
        print("FRONTEND PROBE FAILED after",round(time.monotonic()-start,1),
              "seconds:",repr(error),flush=True)
        raise

def main() -> int:
    url = API.rstrip("/") + "/api/v1/satellites?" + PARAMS
    last_error: Exception | None = None
    for attempt in range(1, 5):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "ALEN-CI-LiveIntegrity/1.0"})
            with urllib.request.urlopen(request, timeout=90) as response:
                result = json.load(response)
            verified = evaluate(result["diagnostics"], result["satellites"])
            print("PASS: current full-sky orbital feed", json.dumps(verified, indent=2), flush=True)
            if os.getenv("GITHUB_EVENT_NAME") == "pull_request":
                probe_frontend_request()
            return 0
        except (OSError, TimeoutError, ValueError, AssertionError, KeyError) as error:
            last_error = error
            print(f"Live orbital integrity attempt {attempt}/4: {error}", flush=True)
            if attempt < 4:
                time.sleep(25)
    raise SystemExit(f"Live orbital integrity FAILED: {last_error}")


if __name__ == "__main__":
    raise SystemExit(main())
