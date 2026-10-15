"""Mobile horizon framing and motion stability using real ALEN JS excerpts."""
from pathlib import Path
import subprocess

APP=Path("web/app.js").read_text(encoding="utf-8")
HTML=Path("web/index.html").read_text(encoding="utf-8")


def node(script):
    p=subprocess.run(["node","-e",script],capture_output=True,text=True,timeout=10)
    assert p.returncode==0,p.stderr


def test_portrait_horizon_is_low_until_true_alignment_is_selected():
    start=APP.index("function verticalFovRad(){")
    end=APP.index("function screenElevationAtY(",start)
    vertical=APP[start:end]
    start=APP.index("function updateMinPitch(){")
    end=APP.index("function fovLimits(){",start)
    min_pitch=APP[start:end]
    start=APP.index("function project(az,el){")
    end=APP.index("function latLonToTilePixel(",start)
    projection=APP[start:end]
    node(
        """const DEG=Math.PI/180,RAD=180/Math.PI;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
let width=390,height=844,fov=77,yaw=0,pitch=0,minPitch=0;
const horizonBottomGap=()=>80;
""" + vertical + min_pitch + projection + """
updateMinPitch();pitch=minPitch;
const framed=project(0,0);
if(!framed||Math.abs(framed[0]-width/2)>1)throw Error("Projected level direction is wrong");
if(framed[1]<height*.80||framed[1]>height-80)throw Error("Phone horizon not near toolbar: "+framed[1]);
pitch=0;
const aligned=project(0,0);
if(!aligned||Math.abs(aligned[1]-height/2)>.01)throw Error("Physical pointing mode not centred");
"""
    )


def test_compass_and_tilt_are_independent_smooth_and_rate_limited():
    start=APP.index("let compassFollowing=false;")
    end=APP.index('const mobileSensorButton=document.querySelector("#mobile-sensors-enable");',start)
    functions=APP[start:end]
    node(
        """const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const norm360=x=>(x%360+360)%360;
const screen={orientation:{angle:0}};
let yaw=180,pitch=54,minPitch=54,mobileTrueAlignment=false;
const buttons=new Map();
const document={querySelector(id){
 if(!buttons.has(id))buttons.set(id,{textContent:"",setAttribute(){},
 addEventListener(event,fn){this[event]=fn}});
 return buttons.get(id);
}};
const window={addEventListener(){},removeEventListener(){}};
function skyViewMessage(){}
""" + functions + """
function check(x,msg){if(!x)throw Error(msg)}
compassFollowing=true;tiltOffsetDeg=0;
onCompassOrientation({timeStamp:100,beta:90,webkitCompassHeading:180,webkitCompassAccuracy:3});
check(pitch===54,"level phone should keep the low framed horizon");
onCompassOrientation({timeStamp:134,beta:120,webkitCompassHeading:230,webkitCompassAccuracy:3});
check(pitch>54&&pitch<55.4,"large phone tilt must be smoothed");
check(yaw>180&&yaw<182.5,"large heading turn must be smoothed");
const lastPitch=pitch,lastYaw=yaw;
onCompassOrientation({timeStamp:135,beta:130,webkitCompassHeading:250,webkitCompassAccuracy:3});
check(pitch===lastPitch&&yaw===lastYaw,"rapid duplicate event should not overdrive the view");
onCompassOrientation({timeStamp:169,beta:130,absolute:false,alpha:30});
const beforeYaw=yaw;
onCompassOrientation({timeStamp:170,beta:130,webkitCompassHeading:270,webkitCompassAccuracy:3});
check(yaw>beforeYaw,"absolute heading should not be lost after tilt-only event");
const mode=buttons.get("#sky-mobile-horizon-mode");
mode.click();
check(mobileTrueAlignment&&pitch===40,"true alignment should remove artificial horizon framing");
mode.click();
check(!mobileTrueAlignment&&pitch===89,"comfortable framing should be restored and clamped at zenith");
"""
    )


def test_touch_drag_sensitivity_does_not_change_mouse_motion():
    assert 'function panScale(pointerType){return pointerType==="touch"?.5:1}' in APP
    assert "pinch.startFov*panScale(e.pointerType)" in APP
    assert "fov*panScale(drag.pointerType)" in APP
    assert "lastHeadingUpdateAt" in APP and "lastTiltUpdateAt" in APP
    assert 'id="sky-mobile-horizon-mode"' in HTML
    node(
        'function panScale(pointerType){return pointerType==="touch"?.5:1};'
        'if(panScale("touch")!==.5||panScale("mouse")!==1||panScale("pen")!==1)throw Error("Touch sensitivity regression");'
    )
