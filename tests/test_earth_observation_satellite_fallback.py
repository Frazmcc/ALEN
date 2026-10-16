"""Regression checks for Earth Resources group slug and nonblocking satellite recovery."""
from pathlib import Path
import subprocess

from alen.satellites import SatelliteProvider
from scripts.sync_orbital_feed import celestrak_group

APP = Path("web/app.js").read_text(encoding="utf-8")
SNAPSHOT_SYNC = Path("scripts/sync_orbital_feed.py").read_text(encoding="utf-8")
PROVIDER = Path("src/alen/satellites.py").read_text(encoding="utf-8")


def test_celestrak_earth_resources_uses_official_resource_group():
    assert celestrak_group("earth-resources") == "resource"
    assert celestrak_group("starlink") == "starlink"
    assert SatelliteProvider._upstream_group("earth-resources") == "resource"
    assert "earth-resources" in SatelliteProvider.ALLOWED_GROUPS
    assert 'params={"GROUP": celestrak_group(group).upper(), "FORMAT": "JSON"}' in SNAPSHOT_SYNC
    assert 'params={"GROUP": self._upstream_group(group).upper(), "FORMAT": "JSON"}' in PROVIDER
    assert 'self._fetch_group_alen_snapshot_json' in PROVIDER
    assert 'f"{group}.json"' in SNAPSHOT_SYNC


def test_missing_earth_group_never_blocks_primary_satellites_in_browser():
    start = APP.index("const SATELLITE_REFRESH_MS=5000;")
    end = APP.index("const SATELLITE_MAX_SAMPLE_AGE_MS=", start)
    source = APP[start:end]
    script = """
const SATELLITE_GROUPS={
 earth:{enabled:true,sources:["earth-resources"]},
 stations:{enabled:true,sources:["stations"]},
 bright:{enabled:true,sources:["visual"]},
 starlink:{enabled:true,sources:["starlink"]},
 oneweb:{enabled:true,sources:["oneweb"]}
};
function activeSatelliteGroups(){return Object.entries(SATELLITE_GROUPS).filter(([,g])=>g.enabled)}
let observer={lat:55.77,lon:-4.09,altM:0},layers={satellites:true},satellites=[];
const document={hidden:false},API_BASE="https://example.invalid";
let reloadCount=0,requestedGroups=[];
function refreshSatellites(){reloadCount++;return Promise.resolve()}
function updateSatelliteGroupCounts(){}
function setLiveStatus(){}
""" + source + """
function check(ok,why){if(!ok)throw Error(why)}
async function run(){
 const initial=activeSatelliteSourceNames();
 check(initial.includes("starlink")&&initial.includes("visual")&&initial.includes("stations"),
       "healthy sources must be requested");
 check(!initial.includes("earth-resources"),"unknown earth source must not block baseline");
 let healthy=false;
 globalThis.fetch=async(url)=>{
  requestedGroups.push(new URL(url).searchParams.get("groups"));
  return {ok:true,json:async()=>({diagnostics:{
   loaded_by_group:{"earth-resources":healthy?12:0}
  }})};
 };
 const warn=console.warn;console.warn=()=>{};
 try{await probeEarthSource()}finally{console.warn=warn}
 check(!earthSourceHealthy,"empty earth catalogue must remain isolated");
 check(!activeSatelliteSourceNames().includes("earth-resources"),
       "missing earth must not suppress other group data");
 check(reloadCount===0,"failed background probe must not restart the live stream");
 check(requestedGroups.length===1&&requestedGroups[0]==="earth-resources",
       "background probe must only request Earth Resources");
 healthy=true;earthSourceProbeAt=0;
 await probeEarthSource();
 check(earthSourceHealthy,"valid earth orbit catalogue should restore the group");
 check(activeSatelliteSourceNames().includes("earth-resources"),
       "recovered category should rejoin normal live requests");
 check(reloadCount===1,"successful recovery should refresh the visible sky");
}
run().catch(e=>{console.error(e);process.exitCode=1});
"""
    p = subprocess.run(["node", "-e", script], text=True, capture_output=True, timeout=12)
    assert p.returncode == 0, p.stderr


def test_browser_preserves_full_satellite_coverage_when_earth_unavailable():
    assert 'const SATELLITE_REQUEST_LIMIT=2000;' in APP
    assert 'const sources=activeSatelliteSourceNames();' in APP
    assert 'const currentSignature=activeSatelliteSourceNames().sort().join(",");' in APP
    assert 'void probeEarthSource();' in APP
    assert 'satelliteRequestState=partialCatalogue||earthSourceUnavailable()?"partial":"ok";' in APP
    assert "Earth observation source unavailable; other satellite groups remain live" in APP
