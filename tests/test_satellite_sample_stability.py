"""Satellite sample identity and explicit label mode regressions.

Sky-cell transitions must not replace a satellite simply because its azimuth
moves between bins. Group labels on must never silently hide objects by a
global 18-label cap or 18 degree altitude filter.
"""
from pathlib import Path
import subprocess

from alen.satellites import _select_visible_satellites

APP = Path("web/app.js").read_text(encoding="utf-8")


def test_satellite_sample_ids_stable_across_azimuth_cell_boundaries():
    original = [
        {"norad": 10000 + i, "azimuth_deg": i % 360,
         "elevation_deg": 25 + i % 55, "groups": ["starlink"]}
        for i in range(1250)
    ]
    moved = [
        {**item, "azimuth_deg": (float(item["azimuth_deg"]) + 47) % 360,
         "elevation_deg": max(0, float(item["elevation_deg"]) - 4)}
        for item in reversed(original)
    ]
    a = _select_visible_satellites(original, 500)
    b = _select_visible_satellites(moved, 500)
    assert len(a) == len(b) == 500
    assert {item["norad"] for item in a} == {item["norad"] for item in b}
    assert len({item["norad"] for item in a}) == 500


def test_explicit_group_label_mode_has_no_arbitrary_cap():
    assert "const MAX_SATELLITE_LABELS=18" not in APP
    assert 'const labelsEnabled=layerLabelsOn("satellites")||satGroup?.labels;' in APP
    assert "if(visibility>.5&&(active||labelsEnabled))" in APP
    assert "labelsEnabled&&s.el>18" not in APP
    assert "chooseSatelliteLabelPosition(" in APP


def test_label_placement_finds_free_slots_and_keeps_all_requests():
    start = APP.index("function chooseSatelliteLabelPosition(")
    end = APP.index("function satelliteRangeText(", start)
    js = """const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
""" + APP[start:end] + """
const used=[];
for(let i=0;i<45;i++){
 const box=chooseSatelliteLabelPosition(125,80,76,15,used,260,180);
 if(!box||box.x<0||box.y<0||box.x+box.w>260||box.y+box.h>180)
   throw Error("Label outside viewport or dropped");
}
if(used.length!==45)throw Error("Explicit labels silently omitted");
const separated=[];
const first=chooseSatelliteLabelPosition(100,80,50,15,separated,500,300);
const second=chooseSatelliteLabelPosition(100,80,50,15,separated,500,300);
if(first.x===second.x&&first.y===second.y)throw Error("Unnecessary label overlap");
"""
    result=subprocess.run(["node","-e",js],capture_output=True,text=True,timeout=10)
    assert result.returncode == 0, result.stderr


def test_five_second_poller_does_not_skip_every_other_cycle():
    assert "const SATELLITE_REFRESH_MS=5000" in APP
    assert "satellitesUpdated<8000" not in APP
    assert "satellitesUpdated<SATELLITE_REFRESH_MS-200" in APP
