"""Sky-view manual floor matches the approved video while portrait sensors stay physical."""
from pathlib import Path
import subprocess

APP=Path("web/app.js").read_text(encoding="utf-8")


def test_lowest_manual_view_horizon_fits_above_bottom_controls():
    beginning=APP.index("function updateMinPitch(){")
    end=APP.index("function fovLimits()",beginning)
    code=APP[beginning:end]
    js=(
        "const RAD=180/Math.PI;const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));"
        "let minPitch=0,width=1000,height=700,barHeight=58;"
        "const verticalFovRad=()=>75*Math.PI/180;"
        "const horizonBottomGap=()=>barHeight+10;"
        +code+
        """
function horizonRatio(){
 updateMinPitch();
 return .5+Math.tan(minPitch*Math.PI/180)/Math.tan(verticalFovRad()/2)*.5;
}
let ratio=horizonRatio();
if(Math.abs(ratio-(height-(barHeight+10)-12)/height)>1e-8)throw Error("desktop framing must respect bottom controls");
barHeight=125;
ratio=horizonRatio();
if(ratio*height>height-(barHeight+10)-11)throw Error("horizon overlaps layer bar");
height=360;barHeight=100;
ratio=horizonRatio();
if(ratio*height>height-(barHeight+10)-11)throw Error("compact viewport overlap");
"""
    )
    result=subprocess.run(["node","-e",js],capture_output=True,text=True,timeout=10)
    assert result.returncode==0,result.stderr


def test_default_view_starts_low_but_calibrated_phone_can_show_level_horizon():
    assert "pitch=minPitch;" in APP
    assert "const targetPitch=clamp(applyTiltDirection(rawTilt)+tiltOffsetDeg,0,89);" in APP
    assert "pitch=0;" in APP
    assert "function restoreSavedSkyView()" in APP
    # Saved views remain available via button, but no longer override the new
    # prescribed lowest-framing initial view on GPS initialization.
    location_block=APP[APP.index("function onLocation(pos){"):APP.index("function onLocationError(")]
    assert "restoreSavedSkyView();" not in location_block
    assert "pitch=minPitch;" in location_block
