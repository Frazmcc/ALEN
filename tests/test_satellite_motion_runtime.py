"""Runtime regression tests for the browser's orbital sample interpolation.

Run the actual JavaScript function with Node rather than checking source tokens.
The CI workflow already installs Node on windows-latest.
"""
from pathlib import Path
import json
import subprocess

APP = Path("web/app.js").read_text(encoding="utf-8")


def test_satellite_trajectory_runtime_continuity() -> None:
    start = APP.index("function satelliteSkyVector(az,el){")
    end = APP.index("function satelliteRangeText(rangeKm){", start)
    functions = APP[start:end]
    script = (
        "const DEG=Math.PI/180,RAD=180/Math.PI;"
        "const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));"
        "const norm360=v=>(v%360+360)%360;"
        + functions
        + """
const requireOK=(ok,message)=>{if(!ok)throw Error(message)};
const points=satelliteTrajectory({
 trajectory:[
 {offset_seconds:0,azimuth_deg:359,elevation_deg:40,range_km:600},
 {offset_seconds:2,azimuth_deg:1,elevation_deg:41,range_km:598},
 {offset_seconds:4,azimuth_deg:3,elevation_deg:42,range_km:596}
]},2);
const mid=satelliteTrajectorySample(points,1000);
requireOK(mid.az<2||mid.az>358,"incorrect north-crossing interpolation");
requireOK(mid.el>40&&mid.el<41,"elevation interpolation failed");
const final=satelliteTrajectorySample(points,4000);
const expired=satelliteTrajectorySample(points,40000);
requireOK(Math.abs(final.az-expired.az)<1e-8,"expired prediction extrapolated azimuth");
requireOK(Math.abs(final.el-expired.el)<1e-8,"expired prediction extrapolated elevation");
requireOK(expired.rangeKm===final.rangeKm,"expired prediction extrapolated range");
console.log(JSON.stringify({az:mid.az,el:mid.el,expiredAz:expired.az}));
"""
    )
    result = subprocess.run(
        ["node", "-e", script],
        capture_output=True,
        text=True,
        check=False,
        timeout=10,
    )
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert 0 <= payload["az"] < 360


def test_browser_uses_absolute_server_sample_epoch() -> None:
    assert 'position_sample_at||""' in APP
    assert 'wallNow-sampleEpochMs' in APP
    assert 'throw new Error("stale satellite prediction")' in APP
