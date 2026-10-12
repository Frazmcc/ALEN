"""Aircraft visual depth must retain identifiable near aircraft and point-like distant traffic."""
from pathlib import Path
import subprocess

APP=Path("web/app.js").read_text(encoding="utf-8")


def test_aircraft_depth_cues_under_node():
    start=APP.index("function aircraftDepthCue(")
    end=APP.index("function drawAircraftIcon(",start)
    snippet=APP[start:end]
    script="""const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));\n"""+snippet+"""
const check=(condition,why)=>{if(!condition)throw Error(why)};
const near=aircraftDepthCue(1,65);
const middle=aircraftDepthCue(15,40);
const distant=aircraftDepthCue(150,15);
const horizon=aircraftDepthCue(15,1);
const chosen=aircraftDepthCue(15,40,true);
check(near.size>middle.size&&middle.size>distant.size,"size must shrink with distance");
check(near.alpha>middle.alpha&&middle.alpha>distant.alpha,"opacity must decrease with range");
check(horizon.alpha<middle.alpha,"low-elevation atmospheric reduction");
check(near.size<=15&&distant.size<5,"aircraft must not dominate sky");
check(chosen.size>=middle.size,"selected aircraft remain identifiable");
check(aircraftDepthCue(Infinity,40).size<5,"unknown distances do not produce giant markers");
check(aircraftDepthCue(15,NaN).alpha<=middle.alpha,"unknown elevation should not get extra clarity");
"""
    result=subprocess.run(["node","-e",script],capture_output=True,text=True,timeout=10)
    assert result.returncode==0,result.stderr


def test_aircraft_3d_projection_and_terrain_still_used():
    assert "const q=airborneAltAz(a.displayLat,a.displayLon,a.displayAltM??a.altM)" in APP
    assert "isAboveLandscape(q.az,q.el)" in APP
    assert "const p=project(q.az,q.el)" in APP
    assert "aircraftScreenRotation(a,q,p)" in APP
    assert "drawAircraftIcon(visualType,iconSize" in APP
