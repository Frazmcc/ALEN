"""Exercise ALEN's real sky projection as JavaScript in Node.

Synthetic geometry checks are repeatable and complementary to (not a replacement
for) a calibrated photograph of the real sky from the observer location.
"""
import json
from pathlib import Path
import subprocess

APP = Path("web/app.js").read_text(encoding="utf-8")


def test_real_sky_screen_projection_geometry() -> None:
    a = APP.index("function verticalFovRad(){")
    b = APP.index("function screenElevationAtY(", a)
    vertical_fov = APP[a:b]
    a = APP.index("function project(az,el){")
    b = APP.index("function latLonToTilePixel(", a)
    projection = APP[a:b]

    js = (
        """const DEG=Math.PI/180,RAD=180/Math.PI;
let width=1920,height=1080,fov=90,yaw=0,pitch=0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
"""
        + vertical_fov + projection
        + """
function check(ok,message){if(!ok)throw Error(message)}
function near(value,expected,epsilon=1e-6){
 return Number.isFinite(value)&&Math.abs(value-expected)<epsilon;
}
const middle=project(0,0);
check(middle&&near(middle[0],960)&&near(middle[1],540),
      "north at horizon should be screen centre");
const right=project(45,0),left=project(315,0);
check(right&&left&&near(right[0],1920)&&near(left[0],0),
      "45-degree horizontal azimuth should hit horizontal FOV edges");
check(near(right[1],540)&&near(left[1],540),
      "horizontal objects should have equal horizon height");
check(project(180,0)===null,"objects behind observer must be clipped");
const northWrap=project(359.999,0);
check(northWrap&&Math.abs(northWrap[0]-960)<1,
      "359-to-zero azimuth crossing must be continuous");
yaw=90;
const east=project(90,0);
check(east&&near(east[0],960)&&near(east[1],540),
      "east direction should center when yaw is 90");
yaw=0;pitch=90;
const zenith=project(0,90);
check(zenith&&near(zenith[0],960)&&near(zenith[1],540),
      "zenith should center when camera pitch is 90");
pitch=0;fov=60;
const edge=project(30,0);
check(edge&&near(edge[0],1920),"horizontal FOV must map to expected pixel");
console.log(JSON.stringify({north:middle,east,zenith,azimuthWrap:northWrap}));
"""
    )
    result = subprocess.run(
        ["node", "-e", js], capture_output=True, text=True, timeout=10, check=False
    )
    assert result.returncode == 0, result.stderr
    actual = json.loads(result.stdout)
    assert len(actual["north"]) == 2
