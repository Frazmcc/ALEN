"""Browser-facing saved sky-view contract and storage failure regression checks."""
from pathlib import Path
import subprocess

APP = Path("web/app.js").read_text(encoding="utf-8")
HTML = Path("web/index.html").read_text(encoding="utf-8")


def test_sky_view_controls_and_local_storage_contract() -> None:
    for control in ("sky-view-save", "sky-view-restore", "sky-view-clear"):
        assert f'id="{control}"' in HTML
        assert f'querySelector("#{control}")' in APP
    assert "alen.sky-view.v1" in APP
    assert 'querySelector("#sky-view-restore").addEventListener("click"' in APP
    assert "function restoreSavedSkyView()" in APP
    assert "localStorage.removeItem(SKY_VIEW_STORAGE_KEY)" in APP
    assert "do not calibrate a physical camera lens" in HTML


def test_saved_view_rejects_invalid_data_and_restores_valid_angles() -> None:
    start = APP.index("const SKY_VIEW_STORAGE_KEY=")
    end = APP.index("let simTime=", start)
    helpers = APP[start:end]
    js = """
const store=new Map();
const localStorage={
 getItem:k=>store.get(k)??null,
 setItem:(k,v)=>store.set(k,v),
 removeItem:k=>store.delete(k)
};
let yaw=180,pitch=30,fov=90,minPitch=0;
const norm360=x=>(x%360+360)%360;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function setFov(x){fov=clamp(x,18,130)}
""" + helpers + """
const check=(ok,msg)=>{if(!ok)throw Error(msg)};
check(!readSavedSkyView(),"empty store should not restore");
store.set(SKY_VIEW_STORAGE_KEY,'{"version":1,"yaw":900,"pitch":30,"fov":90}');
check(!restoreSavedSkyView(),"invalid azimuth must be rejected");
store.set(SKY_VIEW_STORAGE_KEY,'{corrupt');
check(!restoreSavedSkyView(),"invalid JSON must be rejected");
yaw=12;pitch=25;fov=75;
check(saveSkyView(),"valid view should save");
yaw=222;pitch=40;fov=90;
check(restoreSavedSkyView(),"view should restore");
check(yaw===12&&pitch===25&&fov===75,"saved angles not restored");
check(clearSavedSkyView()&&!readSavedSkyView(),"clear should remove view");
"""
    result = subprocess.run(
        ["node", "-e", js], capture_output=True, text=True, timeout=10, check=False
    )
    assert result.returncode == 0, result.stderr
