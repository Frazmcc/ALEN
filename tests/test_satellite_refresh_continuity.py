"""Satellite refresh must preserve object identities and avoid abrupt blinking."""
from pathlib import Path
import subprocess

APP=Path("web/app.js").read_text(encoding="utf-8")


def test_continuity_and_fade_with_live_js():
    start=APP.index("function satelliteVisibility(")
    end=APP.index("function satelliteRangeText(",start)
    js="""const SATELLITE_FADE_MS=1600,SATELLITE_MISSING_GRACE_MS=30000;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
"""+APP[start:end]+"""
function check(ok,msg){if(!ok)throw Error(msg)}
const current={id:"sat:100",lastSeenAt:1000,firstSeenAt:1000,trajectory:[{}]};
let prior=new Map([[current.id,current]]);
let merged=mergeSatelliteContinuity(prior,[],11000,500);
check(merged.length===1&&merged[0]===current,"missing object removed instantly");
check(satelliteVisibility(current,11000)===1,"absence must not blink immediately");
check(satelliteVisibility(current,41000)===0,"missing satellite eventually fades");
const returned={id:"sat:100"};
merged=mergeSatelliteContinuity(prior,[returned],12000,700);
check(merged.length===1&&merged[0].firstSeenAt===1000,"reappearing id must preserve first seen");
check(!merged[0].missingSince,"return cancels pending disappearance");
const newOne={id:"sat:101"};
merged=mergeSatelliteContinuity(new Map(),[newOne],20000,800);
check(satelliteVisibility(newOne,20000)===0,"new dot must fade in");
check(satelliteVisibility(newOne,22000)===1,"new dot must become fully visible");
"""
    result=subprocess.run(["node","-e",js],capture_output=True,text=True,timeout=10)
    assert result.returncode==0,result.stderr


def test_continuous_satellite_render_contract():
    assert "satellites=mergeSatelliteContinuity(previous,next,wallNow,frameNow)" in APP
    assert "const visibility=satelliteVisibility(s)" in APP
    assert "drawSatellitePoint(s,active,dayMode,visibility)" in APP
    assert "const SATELLITE_REFRESH_MS=5000" in APP
    assert "s.displayVec=blendSkyVector(" in APP
