(()=>{
"use strict";
const root=document.querySelector(".sky-shell");
if(!root||root.dataset.ready)return;
root.dataset.ready="true";

const canvas=document.querySelector("#sky");
const ctx=canvas.getContext("2d",{alpha:false});
const inspector=document.querySelector("#inspector");
const searchInput=document.querySelector("#sky-search");
const searchResults=document.querySelector("#search-results");
const clock=document.querySelector("#clock");
const rateEl=document.querySelector("#time-rate");
const playBtn=document.querySelector("#time-play");
const locationEl=document.querySelector("#location-status");
const liveEl=document.querySelector("#live-status");

const DEG=Math.PI/180,RAD=180/Math.PI,EARTH_KM=6371.0088,MU=398600.4418;
let width=1,height=1,dpr=1,yaw=180,pitch=30,minPitch=0,fov=92,drag=null,selected=null;
let simTime=Date.now(),timeRate=1,running=true,lastFrame=performance.now();
let observer=null,geoWatch=null,aircraftTimer=null,satelliteTimer=null;
let aircraft=[],satellites=[],satelliteElements=[];
let aircraftUpdated=0,satellitesUpdated=0;
const layers={stars:true,constellations:true,planets:true,atmosphere:true,aircraft:true,satellites:true};

const STAR_CATALOG=[
{id:"vega",kind:"STAR",name:"Vega",ra:279.23473479,dec:38.78368896,mag:.03,color:"#dcecff",distance:"25.0 ly",detail:"A0 V",fact:"Vega is a rapidly rotating A-type star and one of the brightest stars in the northern sky."},
{id:"deneb",kind:"STAR",name:"Deneb",ra:310.35797912,dec:45.28033881,mag:1.25,color:"#d9e8ff",distance:"~2,600 ly",detail:"A2 Ia",fact:"Deneb is a luminous blue-white supergiant and forms one corner of the Summer Triangle."},
{id:"altair",kind:"STAR",name:"Altair",ra:297.6958273,dec:8.8683212,mag:.77,color:"#f3f5ff",distance:"16.7 ly",detail:"A7 V",fact:"Altair spins so quickly that it is measurably flattened at its poles."},
{id:"arcturus",kind:"STAR",name:"Arcturus",ra:213.9153002,dec:19.1824092,mag:-.05,color:"#ffd6a0",distance:"36.7 ly",detail:"K1.5 III",fact:"Arcturus is an orange giant and one of the brightest stars visible from Earth."},
{id:"capella",kind:"STAR",name:"Capella",ra:79.1723279,dec:45.9979915,mag:.08,color:"#fff0c4",distance:"42.9 ly",detail:"G8 III + G0 III",fact:"Capella is a multiple-star system whose two brightest members are giant stars."},
{id:"rigel",kind:"STAR",name:"Rigel",ra:78.6344671,dec:-8.2016384,mag:.13,color:"#d7e8ff",distance:"~860 ly",detail:"B8 Ia",fact:"Rigel is a blue supergiant marking Orion's foot."},
{id:"betelgeuse",kind:"STAR",name:"Betelgeuse",ra:88.792939,dec:7.407064,mag:.42,color:"#ffad83",distance:"~640 ly",detail:"M1-2 Ia-ab",fact:"Betelgeuse is a red supergiant in Orion."},
{id:"sirius",kind:"STAR",name:"Sirius",ra:101.2871553,dec:-16.7161159,mag:-1.46,color:"#eef6ff",distance:"8.6 ly",detail:"A1 V",fact:"Sirius is the brightest star in Earth's night sky."},
{id:"procyon",kind:"STAR",name:"Procyon",ra:114.8254935,dec:5.2249931,mag:.34,color:"#fff5db",distance:"11.5 ly",detail:"F5 IV-V",fact:"Procyon is one of the nearest bright stars to the Sun."},
{id:"spica",kind:"STAR",name:"Spica",ra:201.298247,dec:-11.161322,mag:.98,color:"#dce8ff",distance:"~250 ly",detail:"B1 V",fact:"Spica is the brightest star in Virgo."},
{id:"antares",kind:"STAR",name:"Antares",ra:247.3519157,dec:-26.4320023,mag:.96,color:"#ff9d7a",distance:"~550 ly",detail:"M1.5 Iab",fact:"Antares is a red supergiant in Scorpius."},
{id:"pollux",kind:"STAR",name:"Pollux",ra:116.328957,dec:28.026199,mag:1.14,color:"#ffd7a6",distance:"33.7 ly",detail:"K0 III",fact:"Pollux is the brightest star in Gemini."}
];

const SKY_OBJECTS=[...STAR_CATALOG];
const constellationLines=[
["vega","deneb","altair"],
["betelgeuse","rigel"],
["sirius","procyon","pollux"]
];

function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function norm360(v){v%=360;return v<0?v+360:v}
function adiff(a,b){return ((a-b+540)%360)-180}
function toJulian(ms){return ms/86400000+2440587.5}
function gmstDeg(ms){
 const jd=toJulian(ms),t=(jd-2451545.0)/36525;
 return norm360(280.46061837+360.98564736629*(jd-2451545.0)+.000387933*t*t-t*t*t/38710000);
}
function raDecToAltAz(ra,dec,ms){
 if(!observer)return null;
 const lst=norm360(gmstDeg(ms)+observer.lon),ha=adiff(lst,ra)*DEG;
 const lat=observer.lat*DEG,d=dec*DEG;
 const sinAlt=Math.sin(d)*Math.sin(lat)+Math.cos(d)*Math.cos(lat)*Math.cos(ha);
 const alt=Math.asin(clamp(sinAlt,-1,1));
 const y=-Math.sin(ha)*Math.cos(d);
 const x=Math.sin(d)*Math.cos(lat)-Math.cos(d)*Math.sin(lat)*Math.cos(ha);
 return{az:norm360(Math.atan2(y,x)*RAD),el:alt*RAD};
}
function horizonBottomGap(){
 return width<=900?124:72;
}
function updateMinPitch(){
 const vfov=fov*height/Math.max(width,1);
 const targetY=Math.max(0,height-horizonBottomGap());
 minPitch=((targetY/height)-.55)/.82*vfov;
}
function resize(){
 dpr=Math.min(devicePixelRatio||1,2);
 width=Math.max(1,canvas.clientWidth);height=Math.max(1,canvas.clientHeight);
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
 ctx.setTransform(dpr,0,0,dpr,0,0);
 updateMinPitch();
 pitch=Math.max(pitch,minPitch);
}
new ResizeObserver(resize).observe(canvas);resize();

function project(az,el){
 const dx=adiff(az,yaw),vfov=fov*height/Math.max(width,1),dy=el-pitch;
 if(Math.abs(dx)>fov*.62||Math.abs(dy)>vfov*.72)return null;
 return[width*.5+dx/fov*width,height*.55-dy/vfov*height*.82];
}

function observerLabel(){
 if(!observer)return "LOCATION REQUIRED";
 const acc=Number.isFinite(observer.accuracy)?` ±${Math.round(observer.accuracy)}m`:"";
 return `${observer.lat.toFixed(4)}°, ${observer.lon.toFixed(4)}°${acc}`;
}
function setLocationStatus(text,state="pending"){
 locationEl.textContent=text;
 locationEl.dataset.state=state;
}
function setLiveStatus(){
 const a=aircraft.length,s=satellites.length;
 const parts=[];
 if(layers.aircraft)parts.push(`${a} aircraft`);
 if(layers.satellites)parts.push(`${s} satellites`);
 liveEl.textContent=observer?`LIVE · ${parts.join(" · ")}`:"WAITING FOR LOCATION";
}

function requestLocation(){
 if(!("geolocation" in navigator)){setLocationStatus("LOCATION UNAVAILABLE","error");return}
 setLocationStatus("REQUESTING CURRENT LOCATION…","pending");
 const options={enableHighAccuracy:true,timeout:10000,maximumAge:30000};
 navigator.geolocation.getCurrentPosition(onLocation,onLocationError,options);
 geoWatch=navigator.geolocation.watchPosition(onLocation,onLocationError,{enableHighAccuracy:true,timeout:20000,maximumAge:60000});
}
function onLocation(pos){
 const first=!observer;
 observer={lat:pos.coords.latitude,lon:pos.coords.longitude,altM:Number.isFinite(pos.coords.altitude)?pos.coords.altitude:0,accuracy:pos.coords.accuracy};
 setLocationStatus(observerLabel(),"ok");
 if(first){
   yaw=observer.lat>=0?180:0;
   pitch=minPitch;
   refreshAircraft(true);
   refreshSatellites(true);
 }
 setLiveStatus();
}
function onLocationError(err){
 const reasons={1:"LOCATION PERMISSION REQUIRED",2:"LOCATION UNAVAILABLE",3:"LOCATION REQUEST TIMED OUT"};
 setLocationStatus(reasons[err.code]||"LOCATION ERROR","error");
 setLiveStatus();
}

function greatCircle(lat1,lon1,lat2,lon2){
 const p1=lat1*DEG,p2=lat2*DEG,dp=(lat2-lat1)*DEG,dl=(lon2-lon1)*DEG;
 const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
 const central=2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
 const y=Math.sin(dl)*Math.cos(p2);
 const x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
 return{distanceKm:EARTH_KM*central,bearing:norm360(Math.atan2(y,x)*RAD)};
}
function airborneAltAz(lat,lon,altM){
 if(!observer)return null;
 const g=greatCircle(observer.lat,observer.lon,lat,lon);
 const obsAltKm=(observer.altM||0)/1000,targetAltKm=Math.max(0,altM||0)/1000;
 const curvature=(g.distanceKm*g.distanceKm)/(2*EARTH_KM);
 const el=Math.atan2(targetAltKm-obsAltKm-curvature,Math.max(.001,g.distanceKm))*RAD;
 return{az:g.bearing,el,distanceKm:g.distanceKm};
}
function aircraftAltitudeM(a){
 const v=a.alt_geom??a.alt_baro;
 return typeof v==="number"&&Number.isFinite(v)?v*.3048:0;
}
async function refreshAircraft(force=false){
 if(!observer||!layers.aircraft)return;
 if(!force&&Date.now()-aircraftUpdated<2500)return;
 aircraftUpdated=Date.now();
 try{
   const url=`https://api.adsb.lol/v2/lat/${observer.lat.toFixed(4)}/lon/${observer.lon.toFixed(4)}/dist/120`;
   const res=await fetch(url,{mode:"cors",cache:"no-store",credentials:"omit"});
   if(!res.ok)throw new Error("aircraft "+res.status);
   const data=await res.json(),now=performance.now();
   const old=new Map(aircraft.map(a=>[a.id,a]));
   aircraft=(Array.isArray(data.ac)?data.ac:[]).filter(a=>Number.isFinite(a.lat)&&Number.isFinite(a.lon)).slice(0,450).map(a=>{
     const id=(a.hex||a.flight||Math.random().toString(36)).trim(),prior=old.get(id);
     return{
       id,kind:"AIRCRAFT",name:(a.flight||a.r||a.hex||"Aircraft").trim(),lat:a.lat,lon:a.lon,
       displayLat:prior?.displayLat??a.lat,displayLon:prior?.displayLon??a.lon,
       altM:aircraftAltitudeM(a),gs:Number(a.gs)||0,track:Number(a.track)||0,
       type:a.t||"Aircraft",registration:a.r||"—",seen:Number(a.seen)||0,lastFrame:now
     };
   });
 }catch(e){console.warn("ALEN aircraft feed unavailable",e)}
 setLiveStatus();
}
function stepAircraft(now){
 for(const a of aircraft){
   const dt=Math.min(100,Math.max(0,now-(a.lastFrame||now)));a.lastFrame=now;
   const k=1-Math.exp(-dt/900);
   a.displayLat+=(a.lat-a.displayLat)*k;a.displayLon+=(a.lon-a.displayLon)*k;
 }
}

function parseEpoch(s){const t=Date.parse(s);return Number.isFinite(t)?t:Date.now()}
function solveKepler(M,e){
 let E=M;
 for(let i=0;i<7;i++)E-= (E-e*Math.sin(E)-M)/(1-e*Math.cos(E));
 return E;
}
function satelliteEci(el,ms){
 const nRev=Number(el.MEAN_MOTION),e=Number(el.ECCENTRICITY),inc=Number(el.INCLINATION)*DEG;
 const raan=Number(el.RA_OF_ASC_NODE)*DEG,arg=Number(el.ARG_OF_PERICENTER)*DEG;
 if(![nRev,e,inc,raan,arg].every(Number.isFinite)||nRev<=0)return null;
 const n=nRev*2*Math.PI/86400,a=Math.cbrt(MU/(n*n));
 const M0=Number(el.MEAN_ANOMALY)*DEG,dt=(ms-parseEpoch(el.EPOCH))/1000,M=(M0+n*dt)%(2*Math.PI);
 const E=solveKepler(M,e),nu=2*Math.atan2(Math.sqrt(1+e)*Math.sin(E/2),Math.sqrt(1-e)*Math.cos(E/2));
 const r=a*(1-e*Math.cos(E)),u=arg+nu;
 const cu=Math.cos(u),su=Math.sin(u),co=Math.cos(raan),so=Math.sin(raan),ci=Math.cos(inc),si=Math.sin(inc);
 return{x:r*(co*cu-so*su*ci),y:r*(so*cu+co*su*ci),z:r*(su*si)};
}
function eciToEcef(v,ms){
 const g=gmstDeg(ms)*DEG,c=Math.cos(g),s=Math.sin(g);
 return{x:c*v.x+s*v.y,y:-s*v.x+c*v.y,z:v.z};
}
function observerEcef(){
 const lat=observer.lat*DEG,lon=observer.lon*DEG,r=EARTH_KM+(observer.altM||0)/1000;
 return{x:r*Math.cos(lat)*Math.cos(lon),y:r*Math.cos(lat)*Math.sin(lon),z:r*Math.sin(lat)};
}
function satelliteAltAz(el,ms){
 if(!observer)return null;
 const eci=satelliteEci(el,ms);if(!eci)return null;
 const sat=eciToEcef(eci,ms),obs=observerEcef(),dx=sat.x-obs.x,dy=sat.y-obs.y,dz=sat.z-obs.z;
 const lat=observer.lat*DEG,lon=observer.lon*DEG;
 const east=-Math.sin(lon)*dx+Math.cos(lon)*dy;
 const north=-Math.sin(lat)*Math.cos(lon)*dx-Math.sin(lat)*Math.sin(lon)*dy+Math.cos(lat)*dz;
 const up=Math.cos(lat)*Math.cos(lon)*dx+Math.cos(lat)*Math.sin(lon)*dy+Math.sin(lat)*dz;
 const range=Math.sqrt(east*east+north*north+up*up);
 return{az:norm360(Math.atan2(east,north)*RAD),el:Math.asin(clamp(up/range,-1,1))*RAD,rangeKm:range};
}
async function refreshSatellites(force=false){
 if(!layers.satellites)return;
 if(!force&&Date.now()-satellitesUpdated<2*60*60*1000)return;
 satellitesUpdated=Date.now();
 try{
   const res=await fetch("https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json",{mode:"cors",cache:"no-store",credentials:"omit"});
   if(!res.ok)throw new Error("satellites "+res.status);
   const data=await res.json();
   satelliteElements=Array.isArray(data)?data.slice(0,300):[];
 }catch(e){console.warn("ALEN satellite feed unavailable",e)}
 setLiveStatus();
}
function stepSatellites(ms){
 if(!observer||!layers.satellites){satellites=[];return}
 satellites=satelliteElements.map(el=>{
   const p=satelliteAltAz(el,ms);if(!p||p.el<0)return null;
   return{id:String(el.NORAD_CAT_ID||el.OBJECT_ID||el.OBJECT_NAME),kind:"SATELLITE",name:el.OBJECT_NAME||"Satellite",az:p.az,el:p.el,rangeKm:p.rangeKm,detail:"CelesTrak visual group"};
 }).filter(Boolean).sort((a,b)=>b.el-a.el).slice(0,120);
}

function currentSkyObjects(ms){
 if(!observer)return[];
 return SKY_OBJECTS.map(o=>{
   const p=raDecToAltAz(o.ra,o.dec,ms);
   return p?{...o,az:p.az,el:p.el}:null;
 }).filter(Boolean);
}
function drawHorizon(){
 const p=project(yaw,0),horizonY=p?.[1]??height;
 if(layers.atmosphere){
  const glow=ctx.createLinearGradient(0,Math.max(0,horizonY-120),0,Math.min(height,horizonY+20));
  glow.addColorStop(0,"rgba(60,120,160,0)");glow.addColorStop(.72,"rgba(65,125,165,.12)");glow.addColorStop(1,"rgba(0,0,0,.22)");
  ctx.fillStyle=glow;ctx.fillRect(0,Math.max(0,horizonY-120),width,Math.min(140,height));
 }
 if(horizonY>=0&&horizonY<=height){
   ctx.strokeStyle="rgba(190,225,240,.24)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,horizonY);ctx.lineTo(width,horizonY);ctx.stroke();
 }
}
function draw(){
 const g=ctx.createLinearGradient(0,0,0,height);
 g.addColorStop(0,"#01030a");g.addColorStop(.62,layers.atmosphere?"#07111d":"#02050a");g.addColorStop(1,layers.atmosphere?"#102334":"#02050a");
 ctx.fillStyle=g;ctx.fillRect(0,0,width,height);
 drawHorizon();

 const liveObjects=currentSkyObjects(simTime);
 const byId=new Map(liveObjects.map(o=>[o.id,o]));
 if(layers.constellations){
  ctx.strokeStyle="rgba(115,160,190,.28)";ctx.lineWidth=.8;
  for(const chain of constellationLines){
   ctx.beginPath();let started=false;
   for(const id of chain){const o=byId.get(id);if(!o||o.el<0){started=false;continue}const p=project(o.az,o.el);if(!p){started=false;continue}if(!started){ctx.moveTo(...p);started=true}else ctx.lineTo(...p)}
   ctx.stroke();
  }
 }
 if(layers.stars){
  for(const o of liveObjects){
   if(o.el<0)continue;const p=project(o.az,o.el);if(!p)continue;
   const r=Math.max(1.2,3.8-o.mag*.42)*(90/fov),isSelected=selected?.id===o.id;
   if(isSelected){ctx.strokeStyle="#7be5ff";ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(p[0],p[1],r+8,0,Math.PI*2);ctx.stroke()}
   ctx.globalAlpha=Math.max(.35,1-o.mag*.11);ctx.shadowBlur=10;ctx.shadowColor=o.color;ctx.fillStyle=o.color;
   ctx.beginPath();ctx.arc(p[0],p[1],r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1;
   if(o.mag<.5||isSelected){ctx.fillStyle=isSelected?"#dff9ff":"rgba(226,241,250,.76)";ctx.font="11px ui-monospace,monospace";ctx.fillText(o.name,p[0]+r+6,p[1]-r-2)}
  }
 }
 if(layers.aircraft){
  for(const a of aircraft){
   const q=airborneAltAz(a.displayLat,a.displayLon,a.altM);if(!q||q.el<0)continue;const p=project(q.az,q.el);if(!p)continue;
   ctx.save();ctx.translate(p[0],p[1]);ctx.rotate(adiff(a.track,q.az)*DEG);ctx.fillStyle="#9fd9ff";ctx.font="17px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("✈",0,0);ctx.restore();
   ctx.fillStyle="rgba(180,225,255,.85)";ctx.font="9px ui-monospace";ctx.fillText(a.name,p[0]+11,p[1]-8);
  }
 }
 if(layers.satellites){
  for(const s of satellites){
   const p=project(s.az,s.el);if(!p)continue;
   ctx.strokeStyle="#ffe08b";ctx.lineWidth=1;ctx.strokeRect(p[0]-2.5,p[1]-2.5,5,5);
   if(s.el>30){ctx.fillStyle="rgba(255,224,139,.85)";ctx.font="9px ui-monospace";ctx.fillText(s.name,p[0]+7,p[1]-5)}
  }
 }
 if(!observer){
   ctx.fillStyle="rgba(232,246,255,.85)";ctx.font="600 16px system-ui";ctx.textAlign="center";
   ctx.fillText("Allow current location to initialise your live sky",width/2,height*.54);
   ctx.textAlign="left";
 }
}

function allSelectableObjects(){
 const stars=currentSkyObjects(simTime).filter(o=>o.el>=0);
 const ac=aircraft.map(a=>{const p=airborneAltAz(a.displayLat,a.displayLon,a.altM);return p?{...a,az:p.az,el:p.el}:null}).filter(Boolean);
 return [...stars,...ac,...satellites];
}
function nearestObject(x,y){
 let best=null,bestD=Infinity;
 for(const o of allSelectableObjects()){const p=project(o.az,o.el);if(!p)continue;const d=Math.hypot(x-p[0],y-p[1]);if(d<22&&d<bestD){best=o;bestD=d}}
 return best;
}
function showObject(o){
 selected=o;
 document.querySelector("#inspector-kind").textContent=o.kind;
 document.querySelector("#inspector-name").textContent=o.name;
 document.querySelector("#inspector-fact").textContent=o.fact||(
   o.kind==="AIRCRAFT"?"Live aircraft position from the current ADS-B feed; motion is smoothed between network updates.":
   "Live satellite position propagated from current orbital elements. Visual position is approximate rather than precision tracking."
 );
 const visual=document.querySelector("#inspector-visual");
 const color=o.color||(o.kind==="AIRCRAFT"?"#9fd9ff":"#ffe08b");
 visual.style.background="radial-gradient(circle at 50% 50%,"+color+" 0 4px,rgba(123,229,255,.20) 5px 28px,transparent 46%),#010308";
 const details=document.querySelector("#inspector-details");details.replaceChildren();
 let rows=[];
 if(o.kind==="AIRCRAFT")rows=[["Type",o.type],["Registration",o.registration],["Altitude",Math.round(o.altM)+" m"],["Ground speed",Math.round(o.gs)+" kt"],["Track",Math.round(o.track)+"°"],["Azimuth",o.az.toFixed(1)+"°"],["Elevation",o.el.toFixed(1)+"°"]];
 else if(o.kind==="SATELLITE")rows=[["Source",o.detail],["Range",Math.round(o.rangeKm)+" km"],["Azimuth",o.az.toFixed(1)+"°"],["Elevation",o.el.toFixed(1)+"°"]];
 else rows=[["Type",o.detail],["Distance",o.distance],["Azimuth",o.az.toFixed(1)+"°"],["Elevation",o.el.toFixed(1)+"°"],["Magnitude",String(o.mag)]];
 for(const [k,v] of rows){const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=k;dd.textContent=v;details.append(dt,dd)}
 inspector.hidden=false;
}
function clearSelection(){selected=null;inspector.hidden=true}

canvas.addEventListener("pointerdown",e=>{canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,yaw,pitch,moved:false}});
canvas.addEventListener("pointermove",e=>{
 if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>3)drag.moved=true;
 yaw=norm360(drag.yaw-dx/width*fov);
 pitch=clamp(drag.pitch+dy/height*fov*.55,minPitch,88);
});
canvas.addEventListener("pointerup",e=>{
 if(!drag)return;const moved=drag.moved;drag=null;try{canvas.releasePointerCapture(e.pointerId)}catch{}
 if(moved)return;const r=canvas.getBoundingClientRect(),o=nearestObject(e.clientX-r.left,e.clientY-r.top);if(!o)return;
 if(selected?.id===o.id)clearSelection();else showObject(o);
});
canvas.addEventListener("wheel",e=>{
 e.preventDefault();fov=clamp(fov*(e.deltaY<0?.88:1.12),18,130);
 updateMinPitch();pitch=Math.max(pitch,minPitch);
},{passive:false});
document.querySelector("#inspector-close").addEventListener("click",clearSelection);

document.querySelectorAll("[data-layer]").forEach(btn=>btn.addEventListener("click",()=>{
 const key=btn.dataset.layer;layers[key]=!layers[key];btn.setAttribute("aria-pressed",String(layers[key]));
 if(key==="aircraft"&&layers[key])refreshAircraft(true);
 if(key==="satellites"&&layers[key])refreshSatellites(true);
 setLiveStatus();
}));

function renderSearch(){
 const q=searchInput.value.trim().toLowerCase();if(!q){searchResults.hidden=true;searchResults.replaceChildren();return}
 const matches=allSelectableObjects().filter(o=>o.name.toLowerCase().includes(q)).slice(0,8);
 searchResults.replaceChildren(...matches.map(o=>{
  const b=document.createElement("button");b.type="button";
  const n=document.createElement("span");n.textContent=o.name;const k=document.createElement("small");k.textContent=o.kind;b.append(n,k);
  b.addEventListener("click",()=>{yaw=o.az;pitch=Math.max(minPitch,o.el);showObject(o);searchInput.value="";searchResults.hidden=true;});return b;
 }));
 searchResults.hidden=!matches.length;
}
searchInput.addEventListener("input",renderSearch);
searchInput.addEventListener("keydown",e=>{if(e.key==="Escape"){searchInput.value="";searchResults.hidden=true}});

document.querySelector("#time-back").addEventListener("click",()=>{timeRate=Math.max(-1000,timeRate===1?-10:timeRate*10);running=true;updateTimeControls()});
document.querySelector("#time-forward").addEventListener("click",()=>{timeRate=Math.min(1000,timeRate===1?10:Math.abs(timeRate)*10);running=true;updateTimeControls()});
playBtn.addEventListener("click",()=>{running=!running;updateTimeControls()});
document.querySelector("#time-now").addEventListener("click",()=>{simTime=Date.now();timeRate=1;running=true;updateTimeControls()});
function updateTimeControls(){rateEl.textContent=timeRate+"×";playBtn.textContent=running?"❚❚":"▶";playBtn.setAttribute("aria-label",running?"Pause time":"Resume time")}

function tick(now){
 const dt=Math.min(100,Math.max(0,now-lastFrame));lastFrame=now;if(running)simTime+=dt*timeRate;
 if(timeRate===1&&running&&Math.abs(simTime-Date.now())>1500)simTime=Date.now();
 clock.textContent=new Date(simTime).toLocaleString([], {year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"});
 stepAircraft(now);stepSatellites(simTime);draw();requestAnimationFrame(tick);
}
aircraftTimer=setInterval(()=>refreshAircraft(false),3000);
satelliteTimer=setInterval(()=>refreshSatellites(false),15*60*1000);
window.addEventListener("beforeunload",()=>{if(geoWatch!==null)navigator.geolocation.clearWatch(geoWatch);clearInterval(aircraftTimer);clearInterval(satelliteTimer)});
updateTimeControls();setLiveStatus();requestLocation();requestAnimationFrame(tick);
})();