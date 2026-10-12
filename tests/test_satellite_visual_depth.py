"""Satellite visual depth cues remain point-like and preserve perspective maths."""
from pathlib import Path
import subprocess

APP = Path("web/app.js").read_text(encoding="utf-8")


def test_satellite_depth_runtime():
    begin=APP.index("function satelliteDepthCue(")
    end=APP.index("function drawSatellitePoint(",begin)
    js="""const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));\n"""+APP[begin:end]+"""
const check=(x,msg)=>{if(!x)throw Error(msg)};
const near=satelliteDepthCue(400,65);
const far=satelliteDepthCue(36000,65);
const low=satelliteDepthCue(400,5);
const selected=satelliteDepthCue(400,65,true);
check(near.radius>far.radius,"distance radius regression");
check(near.alpha>far.alpha,"distance alpha regression");
check(low.alpha<near.alpha,"horizon extinction regression");
check(far.radius>=0.5&&near.radius<=2,"unrealistically large sky dot");
check(selected.radius<=2.5,"selection changes dot too much");
check(satelliteDepthCue(NaN,50).radius<2,"invalid range must not create large dot");
check(satelliteDepthCue(400,NaN).alpha<=near.alpha,"invalid elevation must fade safely");
"""
    proc=subprocess.run(["node","-e",js],capture_output=True,text=True,timeout=10)
    assert proc.returncode==0,proc.stderr


def test_existing_perspective_projection_is_preserved():
    assert "const nx=x/(z*Math.tan(hfov/2)),ny=y/(z*Math.tan(vfov/2));" in APP
    assert "if(!isAboveLandscape(s.az,s.el))continue;const p=project(s.az,s.el);" in APP
    assert "const depth=satelliteDepthCue(s.rangeKm,s.el,active);" in APP
