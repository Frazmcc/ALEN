"""Sky-view manual floor matches the approved video while portrait sensors stay physical."""
from pathlib import Path
import subprocess

APP=Path("web/app.js").read_text(encoding="utf-8")


def test_lowest_manual_view_horizon_is_at_82_percent_of_canvas():
    beginning=APP.index("function updateMinPitch(){")
    end=APP.index("function fovLimits()",beginning)
    code=APP[beginning:end]
    js=(
        "const RAD=180/Math.PI;let minPitch=0;let vfov=75*Math.PI/180;"
        "const verticalFovRad=()=>vfov;"
        +code+
        "updateMinPitch();"
        "const screenY=.5+Math.tan(minPitch*Math.PI/180)/Math.tan(vfov/2)*.5;"
        "if(Math.abs(screenY-.82)>1e-8)throw Error('incorrect horizon framing');"
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
