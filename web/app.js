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
const locationEl=document.querySelector("#location-status");
const liveEl=document.querySelector("#live-status");

const DEG=Math.PI/180,RAD=180/Math.PI,EARTH_KM=6371.0088,MU=398600.4418;
const API_BASE="https://alen-api-lquw.onrender.com";
const AIRCRAFT_RADIUS_MILES=50,AIRCRAFT_RADIUS_KM=80.4672,AIRCRAFT_RADIUS_NM=43.4488;
const AIRPORT_RADIUS_MILES=50,AIRPORT_RADIUS_KM=80.4672;
let width=1,height=1,dpr=1,yaw=180,pitch=30,minPitch=0,fov=130,drag=null,selected=null;
let simTime=Date.now(),lastFrame=performance.now();
let observer=null,geoWatch=null,aircraftTimer=null,satelliteTimer=null;
let aircraft=[],satellites=[],satelliteElements=[],airports=[],brightStars=[];
let aircraftUpdated=0,satellitesUpdated=0,lastSatelliteStep=0,satelliteDiagnostics=null,satelliteRequestState="idle",satelliteRequestInFlight=false;
const satelliteGroupCache=new Map();
let terrainProfile=null,terrainObserverElevation=0,terrainLoadToken=0;
const terrainTileCache=new Map();
const layers={stars:true,constellations:true,planets:true,atmosphere:true,landscape:true,airports:true,aircraft:true,satellites:true};
const MULTISTATE_LAYERS=new Set(["stars","planets","airports","aircraft","satellites"]);
const layerPhases={stars:0,planets:0,airports:0,aircraft:0,satellites:0};
const AIRCRAFT_GROUPS={
 commercial:{label:"Commercial",enabled:true,labels:true,phase:0},
 military:{label:"Military",enabled:true,labels:true,phase:0},
 emergency:{label:"Emergency / special",enabled:true,labels:true,phase:0},
 other:{label:"Other",enabled:true,labels:true,phase:0}
};
function phaseState(phase){return phase===2?"off":phase===0?"labels":"plain"}
function phaseEnabled(phase){return phase!==2}
function phaseLabels(phase){return phase===0}
function advancePhase(phase){return ((Number(phase)||0)+1)%4}
function layerLabelsOn(key){return !MULTISTATE_LAYERS.has(key)||phaseLabels(layerPhases[key])}
function syncLayerButton(btn,key){
 if(!MULTISTATE_LAYERS.has(key)){
  const state=layers[key]?"on":"off";
  btn.dataset.state=state;
  btn.setAttribute("aria-pressed",String(layers[key]));
  btn.title=`${btn.textContent}: ${layers[key]?"on":"off"}`;
  return;
 }
 const phase=layerPhases[key],state=phaseState(phase);
 btn.dataset.state=state;
 btn.setAttribute("aria-pressed",state==="off"?"false":state==="labels"?"true":"mixed");
 btn.title=state==="labels"?`${btn.textContent}: on with labels`:state==="plain"?`${btn.textContent}: on without labels`:`${btn.textContent}: off`;
}
function syncGroupButton(btn,group){
 const state=phaseState(group.phase);
 btn.dataset.state=state;
 btn.classList.toggle("is-on",group.enabled);
 btn.setAttribute("aria-pressed",state==="off"?"false":state==="labels"?"true":"mixed");
 btn.title=state==="labels"?`${group.label}: on with labels`:state==="plain"?`${group.label}: on without labels`:`${group.label}: off`;
}
const SATELLITE_GROUPS={
 new:{label:"New launches · ≤30 days",sources:["last-30-days"],enabled:true,color:"#68ff9a",glyph:"✦",priority:100,limit:900},
 stations:{label:"Space stations",sources:["stations"],enabled:true,color:"#ffffff",glyph:"▣",priority:90,limit:120},
 bright:{label:"Bright / visual",sources:["visual"],enabled:true,color:"#ffe082",glyph:"◆",priority:70,limit:250},
 starlink:{label:"Starlink",sources:["starlink"],enabled:true,color:"#64b5f6",glyph:"●",priority:60,limit:1800},
 oneweb:{label:"OneWeb",sources:["oneweb"],enabled:false,color:"#ab8cff",glyph:"●",priority:59,limit:900},
 kuiper:{label:"Kuiper",sources:["kuiper"],enabled:false,color:"#50d0ff",glyph:"●",priority:58,limit:700},
 navigation:{label:"Navigation / GNSS",sources:["gnss"],enabled:false,color:"#4dd0c8",glyph:"◇",priority:57,limit:500},
 weather:{label:"Weather",sources:["weather"],enabled:false,color:"#6ed0ff",glyph:"◐",priority:56,limit:500},
 earth:{label:"Earth observation",sources:["earth-resources"],enabled:false,color:"#7ee787",glyph:"◉",priority:55,limit:700},
 science:{label:"Science",sources:["science"],enabled:false,color:"#e6a6ff",glyph:"✧",priority:54,limit:500},
 amateur:{label:"Amateur radio",sources:["amateur"],enabled:false,color:"#ffb86c",glyph:"○",priority:53,limit:700},
 geo:{label:"Geostationary",sources:["geo"],enabled:false,color:"#ffd166",glyph:"◇",priority:52,limit:700},
 military:{label:"Military",sources:["military"],enabled:false,color:"#ff9f43",glyph:"◆",priority:51,limit:700},
 cubesat:{label:"CubeSats",sources:["cubesat"],enabled:false,color:"#b7f7d0",glyph:"□",priority:50,limit:900},
 debris:{label:"Space junk / debris",sources:["fengyun-1c-debris","iridium-33-debris","cosmos-2251-debris","cosmos-1408-debris"],enabled:false,color:"#ff6262",glyph:"×",priority:95,limit:2200}
};
for(const group of Object.values(SATELLITE_GROUPS)){group.labels=group.enabled;group.phase=group.enabled?0:2}

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
const PLANET_INFO={
 sun:{name:"Sun",symbol:"☉",color:"#ffd76a",detail:"G2 V star",fact:"The Sun is the star at the centre of the Solar System."},
 moon:{name:"Moon",symbol:"◐",color:"#e8edf2",detail:"Natural satellite",fact:"The Moon is Earth's natural satellite."},
 mercury:{name:"Mercury",symbol:"☿",color:"#c6b69b",detail:"Terrestrial planet",fact:"Mercury is the innermost planet in the Solar System."},
 venus:{name:"Venus",symbol:"♀",color:"#ffe0a3",detail:"Terrestrial planet",fact:"Venus is often the brightest planet seen from Earth."},
 mars:{name:"Mars",symbol:"♂",color:"#ff8a66",detail:"Terrestrial planet",fact:"Mars is the fourth planet from the Sun."},
 jupiter:{name:"Jupiter",symbol:"♃",color:"#f0c29a",detail:"Gas giant",fact:"Jupiter is the largest planet in the Solar System."},
 saturn:{name:"Saturn",symbol:"♄",color:"#f5d889",detail:"Gas giant",fact:"Saturn is famous for its extensive ring system."},
 uranus:{name:"Uranus",symbol:"⛢",color:"#9fe8eb",detail:"Ice giant",fact:"Uranus rotates on its side relative to most planets."},
 neptune:{name:"Neptune",symbol:"♆",color:"#759cff",detail:"Ice giant",fact:"Neptune is the outermost major planet."}
};
const constellationLines=[
["vega","deneb","altair"],
["betelgeuse","rigel"],
["sirius","procyon","pollux"]
];

function starColor(temp){
 const t=clamp(Number(temp)||6000,2500,30000);
 if(t<3500)return "#ffb07a";if(t<5000)return "#ffd2a1";if(t<6500)return "#fff2d2";if(t<9000)return "#eef4ff";return "#cfe1ff";
}
function hexRgb(value){
 const hex=String(value||"#ffffff").replace("#","");
 const full=hex.length===3?hex.split("").map(ch=>ch+ch).join(""):hex.padEnd(6,"f").slice(0,6);
 return [0,2,4].map(i=>parseInt(full.slice(i,i+2),16)||0);
}
function mixHexColor(a,b,t){
 const u=clamp(t,0,1),ca=hexRgb(a),cb=hexRgb(b);
 return `rgb(${Math.round(ca[0]+(cb[0]-ca[0])*u)} ${Math.round(ca[1]+(cb[1]-ca[1])*u)} ${Math.round(ca[2]+(cb[2]-ca[2])*u)})`;
}
function starRenderPalette(baseColor,daylight){
 const d=clamp(daylight,0,1);
 if(d<.3)return{fill:baseColor,halo:baseColor,label:"rgba(226,241,250,.78)",outline:"rgba(255,255,255,.16)"};
 if(d<.7){
  const t=(d-.3)/.4;
  return{fill:mixHexColor(baseColor,"#f8fbff",t),halo:"#f8fbff",label:"rgba(239,248,255,.92)",outline:"rgba(3,25,42,.35)"};
 }
 const t=(d-.7)/.3;
 return{fill:mixHexColor("#f8fbff","#08283f",t),halo:"#ffffff",label:mixHexColor("#eef8ff","#08283f",t),outline:"rgba(255,255,255,.62)"};
}
function starVisibilityAlpha(visualMag,sky){
 const night=clamp(sky.starVisibility,0,1);
 if(sky.daylight<.72)return night;
 const brightFactor=clamp((2.0-visualMag)/3.2,0,1);
 const daylightFloor=.1+.28*brightFactor;
 return Math.max(night,daylightFloor);
}
async function loadBrightStars(){
 try{
  const res=await fetch("./data/bright-stars.json?v=1",{cache:"force-cache"});
  if(!res.ok)throw new Error("stars "+res.status);
  const data=await res.json();
  brightStars=(Array.isArray(data.stars)?data.stars:[]).map(s=>({
   id:s.id,kind:"STAR",name:s.name,ra:Number(s.ra),dec:Number(s.dec),mag:Number(s.mag),
   color:starColor(s.temp),distance:"—",detail:s.designation||"Catalogued star",temperatureK:Number(s.temp)||null,
   fact:`${s.name||s.designation||"This star"} is a catalogued star plotted at its real right ascension and declination. Apparent magnitude describes how bright it looks from Earth; lower values are brighter.`
  })).filter(s=>Number.isFinite(s.ra)&&Number.isFinite(s.dec)&&Number.isFinite(s.mag));
 }catch(e){console.warn("ALEN bright-star catalogue unavailable",e)}
}
function orbitalEccentricAnomaly(Mdeg,e){
 const M=norm360(Mdeg)*DEG;let E=M+e*Math.sin(M)*(1+e*Math.cos(M));
 for(let i=0;i<6;i++)E-=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E));
 return E;
}
function orbitalPosition(elements,d){
 const N=(elements.N0+elements.Nd*d)*DEG,i=(elements.i0+elements.id*d)*DEG,w=(elements.w0+elements.wd*d)*DEG;
 const a=elements.a0+elements.ad*d,e=elements.e0+elements.ed*d,M=elements.M0+elements.Md*d;
 const E=orbitalEccentricAnomaly(M,e),xv=a*(Math.cos(E)-e),yv=a*Math.sqrt(1-e*e)*Math.sin(E);
 const v=Math.atan2(yv,xv),r=Math.hypot(xv,yv),u=v+w;
 return{
  x:r*(Math.cos(N)*Math.cos(u)-Math.sin(N)*Math.sin(u)*Math.cos(i)),
  y:r*(Math.sin(N)*Math.cos(u)+Math.cos(N)*Math.sin(u)*Math.cos(i)),
  z:r*(Math.sin(u)*Math.sin(i))
 };
}
function eclipticToRaDec(x,y,z,d){
 const ecl=(23.4393-3.563e-7*d)*DEG;
 const ye=y*Math.cos(ecl)-z*Math.sin(ecl),ze=y*Math.sin(ecl)+z*Math.cos(ecl);
 return{ra:norm360(Math.atan2(ye,x)*RAD),dec:Math.atan2(ze,Math.hypot(x,ye))*RAD};
}
function solarSystemRaDec(ms){
 const d=toJulian(ms)-2451543.5;
 const sunW=282.9404+4.70935e-5*d,sunE=.016709-1.151e-9*d,sunM=356.0470+.9856002585*d;
 const sunEA=orbitalEccentricAnomaly(sunM,sunE),sunXv=Math.cos(sunEA)-sunE,sunYv=Math.sqrt(1-sunE*sunE)*Math.sin(sunEA);
 const sunV=Math.atan2(sunYv,sunXv),sunR=Math.hypot(sunXv,sunYv),sunLon=sunV+sunW*DEG;
 const sx=sunR*Math.cos(sunLon),sy=sunR*Math.sin(sunLon);
 const elements={
  mercury:{N0:48.3313,Nd:3.24587e-5,i0:7.0047,id:5e-8,w0:29.1241,wd:1.01444e-5,a0:.387098,ad:0,e0:.205635,ed:5.59e-10,M0:168.6562,Md:4.0923344368},
  venus:{N0:76.6799,Nd:2.4659e-5,i0:3.3946,id:2.75e-8,w0:54.891,wd:1.38374e-5,a0:.72333,ad:0,e0:.006773,ed:-1.302e-9,M0:48.0052,Md:1.6021302244},
  mars:{N0:49.5574,Nd:2.11081e-5,i0:1.8497,id:-1.78e-8,w0:286.5016,wd:2.92961e-5,a0:1.523688,ad:0,e0:.093405,ed:2.516e-9,M0:18.6021,Md:.5240207766},
  jupiter:{N0:100.4542,Nd:2.76854e-5,i0:1.303,id:-1.557e-7,w0:273.8777,wd:1.64505e-5,a0:5.20256,ad:0,e0:.048498,ed:4.469e-9,M0:19.895,Md:.0830853001},
  saturn:{N0:113.6634,Nd:2.3898e-5,i0:2.4886,id:-1.081e-7,w0:339.3939,wd:2.97661e-5,a0:9.55475,ad:0,e0:.055546,ed:-9.499e-9,M0:316.967,Md:.0334442282},
  uranus:{N0:74.0005,Nd:1.3978e-5,i0:.7733,id:1.9e-8,w0:96.6612,wd:3.0565e-5,a0:19.18171,ad:-1.55e-8,e0:.047318,ed:7.45e-9,M0:142.5905,Md:.011725806},
  neptune:{N0:131.7806,Nd:3.0173e-5,i0:1.77,id:-2.55e-7,w0:272.8461,wd:-6.027e-6,a0:30.05826,ad:3.313e-8,e0:.008606,ed:2.15e-9,M0:260.2471,Md:.005995147}
 };
 const out={sun:eclipticToRaDec(sx,sy,0,d)};
 for(const [key,el] of Object.entries(elements)){const p=orbitalPosition(el,d);out[key]=eclipticToRaDec(p.x+sx,p.y+sy,p.z,d)}
 const moonEl={N0:125.1228,Nd:-.0529538083,i0:5.1454,id:0,w0:318.0634,wd:.1643573223,a0:60.2666,ad:0,e0:.0549,ed:0,M0:115.3654,Md:13.0649929509};
 const m=orbitalPosition(moonEl,d);out.moon=eclipticToRaDec(m.x,m.y,m.z,d);
 return out;
}
function currentPlanetObjects(ms){
 if(!observer||!layers.planets)return[];
 const positions=solarSystemRaDec(ms);
 return Object.entries(positions).map(([id,p])=>{
  const info=PLANET_INFO[id],altaz=raDecToAltAz(p.ra,p.dec,ms);if(!info||!altaz)return null;
  return makeAstronomySkyObject({id:"planet:"+id,kind:"PLANET",name:info.name,ra:p.ra,dec:p.dec,az:altaz.az,el:altaz.el,
   color:info.color,symbol:info.symbol,detail:info.detail,fact:info.fact});
 }).filter(Boolean);
}
function currentSunAltAz(ms){
 if(!observer)return null;
 const sun=solarSystemRaDec(ms).sun;
 return sun?raDecToAltAz(sun.ra,sun.dec,ms):null;
}
function mixRgb(a,b,t){
 const u=clamp(t,0,1);
 return `rgb(${Math.round(a[0]+(b[0]-a[0])*u)} ${Math.round(a[1]+(b[1]-a[1])*u)} ${Math.round(a[2]+(b[2]-a[2])*u)})`;
}
function timeOfDaySky(sunEl){
 const stops=[
  {el:-18,top:[1,3,10],mid:[7,17,29],horizon:[16,35,52],stars:1},
  {el:-12,top:[4,10,25],mid:[18,36,64],horizon:[61,70,94],stars:.92},
  {el:-6,top:[14,30,65],mid:[52,76,111],horizon:[153,96,91],stars:.62},
  {el:-1,top:[42,82,136],mid:[103,131,171],horizon:[241,157,104],stars:.16},
  {el:6,top:[74,132,190],mid:[116,169,216],horizon:[185,210,229],stars:.02},
  {el:25,top:[71,138,204],mid:[111,174,224],horizon:[176,210,235],stars:0},
  {el:90,top:[65,132,202],mid:[105,169,222],horizon:[169,206,234],stars:0}
 ];
 if(!Number.isFinite(sunEl))sunEl=-18;
 let lo=stops[0],hi=stops[stops.length-1];
 for(let i=1;i<stops.length;i++){if(sunEl<=stops[i].el){lo=stops[i-1];hi=stops[i];break}}
 const t=hi.el===lo.el?0:clamp((sunEl-lo.el)/(hi.el-lo.el),0,1);
 return{
  top:mixRgb(lo.top,hi.top,t),
  mid:mixRgb(lo.mid,hi.mid,t),
  horizon:mixRgb(lo.horizon,hi.horizon,t),
  starVisibility:lo.stars+(hi.stars-lo.stars)*t,
  daylight:clamp((sunEl+6)/12,0,1)
 };
}
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
 const footer=document.querySelector(".layerbar");
 const footerHeight=footer?.getBoundingClientRect().height||58;
 return Math.ceil(footerHeight+10);
}
function verticalFovRad(){
 const hfov=clamp(fov,1,170)*DEG;
 return 2*Math.atan(Math.tan(hfov/2)*height/Math.max(width,1));
}
function updateMinPitch(){
 const vfov=verticalFovRad(),targetY=Math.max(0,height-horizonBottomGap());
 const normalized=(targetY-height*.5)/Math.max(1,height*.5);
 minPitch=Math.atan(normalized*Math.tan(vfov/2))*RAD;
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
 const azr=az*DEG,elr=el*DEG,yawr=yaw*DEG,pitchr=pitch*DEG;
 const target=[Math.cos(elr)*Math.sin(azr),Math.cos(elr)*Math.cos(azr),Math.sin(elr)];
 const forward=[Math.cos(pitchr)*Math.sin(yawr),Math.cos(pitchr)*Math.cos(yawr),Math.sin(pitchr)];
 const right=[Math.cos(yawr),-Math.sin(yawr),0];
 const up=[-Math.sin(yawr)*Math.sin(pitchr),-Math.cos(yawr)*Math.sin(pitchr),Math.cos(pitchr)];
 const z=target[0]*forward[0]+target[1]*forward[1]+target[2]*forward[2];
 if(z<=0)return null;
 const x=target[0]*right[0]+target[1]*right[1];
 const y=target[0]*up[0]+target[1]*up[1]+target[2]*up[2];
 const hfov=clamp(fov,1,170)*DEG,vfov=verticalFovRad();
 const nx=x/(z*Math.tan(hfov/2)),ny=y/(z*Math.tan(vfov/2));
 if(Math.abs(nx)>1.08||Math.abs(ny)>1.08)return null;
 return[width*.5+nx*width*.5,height*.5-ny*height*.5];
}

function latLonToTilePixel(lat,lon,z=9){
 const n=2**z,latRad=clamp(lat,-85.05112878,85.05112878)*DEG;
 const tx=(lon+180)/360*n;
 const ty=(1-Math.asinh(Math.tan(latRad))/Math.PI)/2*n;
 const x=Math.floor(tx),y=Math.floor(ty);
 return{x,y,px:clamp(Math.floor((tx-x)*256),0,255),py:clamp(Math.floor((ty-y)*256),0,255),z};
}
function terrainTileKey(x,y,z){return `${z}/${x}/${y}`}
function loadTerrainTile(x,y,z){
 const key=terrainTileKey(x,y,z);
 if(terrainTileCache.has(key))return terrainTileCache.get(key);
 const promise=fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,{mode:"cors",cache:"force-cache",credentials:"omit"})
  .then(res=>{if(!res.ok)throw new Error("terrain "+res.status);return res.blob()})
  .then(createImageBitmap)
  .then(bitmap=>{
    const off=document.createElement("canvas");off.width=256;off.height=256;
    const ox=off.getContext("2d",{willReadFrequently:true});ox.drawImage(bitmap,0,0,256,256);
    if(typeof bitmap.close==="function")bitmap.close();
    return ox.getImageData(0,0,256,256).data;
  });
 terrainTileCache.set(key,promise);
 return promise;
}
async function terrainElevationAt(lat,lon,z=9){
 const p=latLonToTilePixel(lat,lon,z),data=await loadTerrainTile(p.x,p.y,p.z);
 const i=(p.py*256+p.px)*4;
 return data[i]*256+data[i+1]+data[i+2]/256-32768;
}
function destinationPoint(lat,lon,bearingDeg,distanceKm){
 const d=distanceKm/EARTH_KM,b=bearingDeg*DEG,p1=lat*DEG,l1=lon*DEG;
 const p2=Math.asin(Math.sin(p1)*Math.cos(d)+Math.cos(p1)*Math.sin(d)*Math.cos(b));
 const l2=l1+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(p1),Math.cos(d)-Math.sin(p1)*Math.sin(p2));
 return{lat:p2*RAD,lon:((l2*RAD+540)%360)-180};
}
async function refreshTerrainProfile(){
 if(!observer)return;
 const token=++terrainLoadToken;
 try{
   const z=10,azStep=3,eyeHeightM=1.7;
   const distances=[.25,.5,1,2,3,5,8,12,18,25,35,50,70];
   const groundElev=await terrainElevationAt(observer.lat,observer.lon,z);
   const observerEyeElev=groundElev+eyeHeightM;
   const bearings=Array.from({length:Math.ceil(360/azStep)},(_,i)=>i*azStep);
   const profile=await Promise.all(bearings.map(async az=>{
     let best=0,bestDistanceKm=0;
     for(const distanceKm of distances){
       const p=destinationPoint(observer.lat,observer.lon,az,distanceKm);
       const elev=await terrainElevationAt(p.lat,p.lon,z);
       const curvature=(distanceKm*distanceKm)/(2*EARTH_KM)*1000;
       const angle=Math.atan2(elev-observerEyeElev-curvature,distanceKm*1000)*RAD;
       if(Number.isFinite(angle)&&angle>best){best=angle;bestDistanceKm=distanceKm}
     }
     return{az,el:clamp(best,0,18),distanceKm:bestDistanceKm};
   }));
   if(token!==terrainLoadToken)return;
   terrainObserverElevation=groundElev;
   terrainProfile=profile;
 }catch(e){
   if(token===terrainLoadToken){terrainProfile=null;console.warn("ALEN terrain skyline unavailable",e)}
 }
}
function terrainHorizonElevation(az){
 if(!terrainProfile?.length)return 0;
 const step=360/terrainProfile.length,pos=norm360(az)/step,i=Math.floor(pos)%terrainProfile.length,f=pos-Math.floor(pos);
 const a=terrainProfile[i].el,b=terrainProfile[(i+1)%terrainProfile.length].el;
 return a+(b-a)*f;
}

function makeSkyObject(raw){
 const az=Number(raw.az),el=Number(raw.el);
 const horizonEl=Number.isFinite(az)?terrainHorizonElevation(az):0;
 return{
  ...raw,
  az,
  el,
  horizonEl,
  aboveGeometricHorizon:Number.isFinite(el)&&el>=0,
  aboveTerrainHorizon:Number.isFinite(el)&&el>horizonEl,
  selectable:raw.selectable!==false
 };
}
function skyObjectScreen(o){
 return o&&Number.isFinite(o.az)&&Number.isFinite(o.el)?project(o.az,o.el):null;
}
function skyObjectVisible(o,{respectLandscape=true,requireScreen=false}={}){
 if(!o||!Number.isFinite(o.az)||!Number.isFinite(o.el)||o.el<0)return false;
 if(respectLandscape&&layers.landscape&&o.el<=terrainHorizonElevation(o.az))return false;
 if(requireScreen&&!skyObjectScreen(o))return false;
 return true;
}
function atmosphericRefractionDeg(geometricEl){
 if(!layers.atmosphere||!Number.isFinite(geometricEl)||geometricEl<=-1||geometricEl>=90)return 0;
 const angle=(geometricEl+10.3/(geometricEl+5.11))*DEG;
 if(!Number.isFinite(angle))return 0;
 const correction=(1.02/Math.tan(angle))/60;
 return clamp(correction,0,1);
}
function atmosphericExtinctionMagnitude(geometricEl){
 if(!layers.atmosphere||!Number.isFinite(geometricEl)||geometricEl>=90)return 0;
 if(geometricEl<=0)return 2.5;
 const altitude=Math.max(.1,geometricEl);
 const airmass=1/(Math.sin(altitude*DEG)+.50572*Math.pow(altitude+6.07995,-1.6364));
 return clamp((airmass-1)*.18,0,2.5);
}
function makeAstronomySkyObject(raw){
 const geometricEl=Number(raw.el);
 const refractionDeg=atmosphericRefractionDeg(geometricEl);
 const extinctionMag=raw.kind==="STAR"?atmosphericExtinctionMagnitude(geometricEl):0;
 const apparentMag=raw.kind==="STAR"&&Number.isFinite(raw.mag)?Number(raw.mag)+extinctionMag:null;
 return makeSkyObject({...raw,geometricEl,refractionDeg,extinctionMag,apparentMag,el:geometricEl+refractionDeg});
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
 if(layers.satellites){
   const loaded=satelliteDiagnostics?.unique_orbits;
   if(satelliteRequestState==="error")parts.push("satellite feed unavailable");
   else if(satelliteRequestState==="stale")parts.push(`${s} satellites · feed reconnecting`);
   else if(satelliteRequestState==="requesting"&&satelliteDiagnostics===null)parts.push("satellites loading…");
   else parts.push(loaded===0?"satellite feed unavailable":`${s} satellites`);
 }
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
   setTimeout(()=>refreshSatellites(true),1500);
   refreshTerrainProfile();
   refreshAirports();
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
function destinationPoint(lat,lon,bearingDeg,distanceKm){
 const angular=distanceKm/EARTH_KM,b=bearingDeg*DEG,p1=lat*DEG,l1=lon*DEG;
 const sinP2=Math.sin(p1)*Math.cos(angular)+Math.cos(p1)*Math.sin(angular)*Math.cos(b);
 const p2=Math.asin(clamp(sinP2,-1,1));
 const y=Math.sin(b)*Math.sin(angular)*Math.cos(p1);
 const x=Math.cos(angular)-Math.sin(p1)*Math.sin(p2);
 const l2=l1+Math.atan2(y,x);
 return{lat:p2*RAD,lon:((l2*RAD+540)%360)-180};
}
function blendAngle(current,target,k){
 return norm360(current+adiff(target,current)*k);
}
function geodeticToEcef(latDeg,lonDeg,altM){
 const a=6378137,e2=6.69437999014e-3,lat=latDeg*DEG,lon=lonDeg*DEG;
 const sinLat=Math.sin(lat),cosLat=Math.cos(lat),n=a/Math.sqrt(1-e2*sinLat*sinLat);
 return{
  x:(n+altM)*cosLat*Math.cos(lon),
  y:(n+altM)*cosLat*Math.sin(lon),
  z:(n*(1-e2)+altM)*sinLat
 };
}
function airborneAltAz(lat,lon,altM){
 if(!observer)return null;
 const obs=geodeticToEcef(observer.lat,observer.lon,observer.altM||0);
 const target=geodeticToEcef(lat,lon,Math.max(0,altM||0));
 const dx=target.x-obs.x,dy=target.y-obs.y,dz=target.z-obs.z;
 const latr=observer.lat*DEG,lonr=observer.lon*DEG;
 const east=-Math.sin(lonr)*dx+Math.cos(lonr)*dy;
 const north=-Math.sin(latr)*Math.cos(lonr)*dx-Math.sin(latr)*Math.sin(lonr)*dy+Math.cos(latr)*dz;
 const up=Math.cos(latr)*Math.cos(lonr)*dx+Math.cos(latr)*Math.sin(lonr)*dy+Math.sin(latr)*dz;
 const horizontalM=Math.hypot(east,north),slantRangeM=Math.hypot(horizontalM,up);
 if(slantRangeM<1)return{az:0,el:90,distanceKm:0,slantRangeKm:0,horizontalKm:0};
 return{
  az:norm360(Math.atan2(east,north)*RAD),
  el:Math.atan2(up,horizontalM)*RAD,
  distanceKm:greatCircle(observer.lat,observer.lon,lat,lon).distanceKm,
  slantRangeKm:slantRangeM/1000,
  horizontalKm:horizontalM/1000
 };
}
function aircraftAltitudeM(a){
 const v=a.alt_geom??a.alt_baro;
 return typeof v==="number"&&Number.isFinite(v)?v*.3048:0;
}
const AIRLINE_PREFIXES={
 BAW:"British Airways",SHT:"British Airways",EZY:"easyJet",TOM:"TUI Airways",
 KLM:"KLM",RYR:"Ryanair",LOG:"Loganair",EXS:"Jet2",DLH:"Lufthansa",
 EIN:"Aer Lingus",AFR:"Air France",VIR:"Virgin Atlantic",UAE:"Emirates",
 QTR:"Qatar Airways",THY:"Turkish Airlines",SAS:"SAS",NAX:"Norwegian",
 WUK:"Wizz Air UK",WZZ:"Wizz Air",UAL:"United Airlines",DAL:"Delta Air Lines",
 AAL:"American Airlines"
};
function aircraftOperator(a){
 const feed=String(a.operator||"").trim();
 if(feed)return feed;
 const callsign=String(a.callsign||a.name||"").trim().toUpperCase();
 const prefix=callsign.match(/^[A-Z]{3}/)?.[0];
 return AIRLINE_PREFIXES[prefix]||"Unknown";
}
const SPECIAL_SQUAWK_MEANINGS={
 "0020":"HEMS / Air Ambulance",
 "0023":"Search and Rescue (SAR)",
 "0026":"Special Tasks",
 "0032":"Police air support",
 "0033":"Parachute dropping",
 "0034":"Antenna / target / glider towing",
 "7500":"Unlawful interference",
 "7600":"Radio communication failure",
 "7700":"General emergency"
};
function aircraftIsMilitary(a){
 const op=String(a.operator||"").toUpperCase();
 const callsign=String(a.callsign||a.name||"").toUpperCase();
 return Boolean((Number(a.dbFlags)||0)&1)||/(ROYAL AIR FORCE|RAF|ROYAL NAVY|ARMY AIR|MILITARY)/.test(op)||/^(RFR|RRR|NVY|AAC)/.test(callsign);
}
function aircraftSpecialMeaning(a){
 const squawk=String(a.squawk||"").padStart(4,"0");
 if(SPECIAL_SQUAWK_MEANINGS[squawk])return SPECIAL_SQUAWK_MEANINGS[squawk];
 const callsign=String(a.callsign||a.name||"").trim().toUpperCase();
 const op=String(a.operator||"").toUpperCase();
 if(/^(UKP|POLICE)/.test(callsign)||op.includes("POLICE"))return "Police operations";
 if(/^(HLE|HELIMED)/.test(callsign)||op.includes("AIR AMBULANCE"))return "HEMS / Air Ambulance";
 if(/^(COASTGUARD|RESCUE|BRITISH RESCUE)/.test(callsign)||op.includes("COASTGUARD"))return "Search and Rescue (SAR)";
 if(aircraftIsMilitary(a))return "Military operation";
 return "";
}
function aircraftGroupKey(a){
 if(aircraftIsMilitary(a))return "military";
 const special=aircraftSpecialMeaning(a);
 if(special&&special!=="Military operation")return "emergency";
 const callsign=String(a.callsign||a.name||"").trim().toUpperCase();
 const prefix=callsign.match(/^[A-Z]{3}/)?.[0];
 if(prefix&&AIRLINE_PREFIXES[prefix])return "commercial";
 return "other";
}
function aircraftGroupEnabled(a){
 const group=AIRCRAFT_GROUPS[aircraftGroupKey(a)];
 return !group||group.enabled;
}
function aircraftLabelsOn(a){
 const group=AIRCRAFT_GROUPS[aircraftGroupKey(a)];
 return layerLabelsOn("aircraft")&&(!group||group.labels);
}
function aircraftVisualType(a){
 const type=String(a.type||"").trim().toUpperCase(),category=String(a.category||"").trim().toUpperCase();
 if(aircraftIsMilitary(a)||category==="A6")return "military";
 if(category==="A7"||/^(H1|H2|H3|H4|H5|H6|H7|EC3|EC4|EC5|R22|R44|R66|B06|A109|A119|A139|AS50|S76|S92|UH60|CH47|AH64)/.test(type))return "helicopter";
 if(category==="B1"||/^(ASW|DG|LS[0-9]|ASK|SZD|JS[123]|GLID)/.test(type))return "glider";
 if(category==="B2")return "balloon";
 if(category==="B6")return "drone";
 if(/^(AT4|AT7|AT8|DH8|DHC6|SF34|BE20|B350|PC12|C208|E120|F50|F27|L410|AN2[468])/.test(type))return "turboprop";
 if(category==="A1"||category==="A2"||/^(C1[05789][02368]|C2[01][068]|P28|PA[12-9]|SR2[02]|DA4[02]|DA2[04]|BE3[356]|M20|RV[0-9]|P06|P20|TB[129]|DR40)/.test(type))return "light";
 if(/^(A3[0124-9]|A2[02-9]|B7[0-9]{2}|E1[679][05]|E2[09][05]|CRJ|BCS|MD8|MD9|DC9|DC10|L101|GLF|CL3|CL6|C5[0-9]{2}|LJ[234567]|FA[5-9]X)/.test(type))return "jet";
 return "aircraft";
}
function aircraftScreenRotation(a,q,p){
 const heading=norm360(a.displayTrack??a.track??0);
 const speed=Math.max(0,Number(a.displayGs??a.gs)||0);
 const lookAheadKm=clamp(speed*1.852/3600*18,.8,6);
 const ahead=destinationPoint(a.displayLat,a.displayLon,heading,lookAheadKm);
 const aheadAltAz=airborneAltAz(ahead.lat,ahead.lon,a.displayAltM??a.altM);
 const aheadPoint=aheadAltAz?project(aheadAltAz.az,aheadAltAz.el):null;
 if(aheadPoint){
  const dx=aheadPoint[0]-p[0],dy=aheadPoint[1]-p[1];
  if(Math.hypot(dx,dy)>.25)return Math.atan2(dx,-dy);
 }
 return adiff(heading,q.az)*DEG;
}
function drawAircraftIcon(kind,size,fill,stroke){
 const s=size/20;
 ctx.save();ctx.scale(s,s);ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=1.7/s;ctx.lineJoin="round";ctx.lineCap="round";
 ctx.beginPath();
 if(kind==="helicopter"){
  ctx.moveTo(0,-8);ctx.quadraticCurveTo(4,-7,4,-2);ctx.lineTo(2,3);ctx.lineTo(1,8);ctx.lineTo(-1,8);ctx.lineTo(-2,3);ctx.quadraticCurveTo(-4,-7,0,-8);ctx.closePath();
  ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(-8,-1);ctx.lineTo(8,-1);ctx.moveTo(0,-1);ctx.lineTo(0,-9);ctx.moveTo(-3,7);ctx.lineTo(3,7);ctx.stroke();
 }else if(kind==="glider"){
  ctx.moveTo(0,-9);ctx.lineTo(1,-2);ctx.lineTo(10,0);ctx.lineTo(1.2,1.2);ctx.lineTo(1,8);ctx.lineTo(-1,8);ctx.lineTo(-1.2,1.2);ctx.lineTo(-10,0);ctx.lineTo(-1,-2);ctx.closePath();ctx.fill();ctx.stroke();
 }else if(kind==="military"){
  ctx.moveTo(0,-10);ctx.lineTo(2,-3);ctx.lineTo(8,4);ctx.lineTo(2,3);ctx.lineTo(1,9);ctx.lineTo(-1,9);ctx.lineTo(-2,3);ctx.lineTo(-8,4);ctx.lineTo(-2,-3);ctx.closePath();ctx.fill();ctx.stroke();
 }else if(kind==="turboprop"){
  ctx.moveTo(0,-10);ctx.lineTo(2,-4);ctx.lineTo(8,-1);ctx.lineTo(8,1);ctx.lineTo(2,2);ctx.lineTo(1,8);ctx.lineTo(4,9);ctx.lineTo(4,10);ctx.lineTo(0,9);ctx.lineTo(-4,10);ctx.lineTo(-4,9);ctx.lineTo(-1,8);ctx.lineTo(-2,2);ctx.lineTo(-8,1);ctx.lineTo(-8,-1);ctx.lineTo(-2,-4);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.arc(-5,-1,1.2,0,Math.PI*2);ctx.arc(5,-1,1.2,0,Math.PI*2);ctx.stroke();
 }else if(kind==="light"){
  ctx.moveTo(0,-9);ctx.lineTo(1.5,-3);ctx.lineTo(7,0);ctx.lineTo(7,1.5);ctx.lineTo(1.3,1.5);ctx.lineTo(1,7);ctx.lineTo(4,8);ctx.lineTo(4,9);ctx.lineTo(0,8);ctx.lineTo(-4,9);ctx.lineTo(-4,8);ctx.lineTo(-1,7);ctx.lineTo(-1.3,1.5);ctx.lineTo(-7,1.5);ctx.lineTo(-7,0);ctx.lineTo(-1.5,-3);ctx.closePath();ctx.fill();ctx.stroke();
 }else if(kind==="balloon"){
  ctx.ellipse(0,-2,6,7,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-2,4);ctx.lineTo(-1,8);ctx.lineTo(1,8);ctx.lineTo(2,4);ctx.stroke();ctx.strokeRect(-1.5,8,3,2);
 }else if(kind==="drone"){
  ctx.rect(-2,-2,4,4);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-2,-2);ctx.lineTo(-7,-7);ctx.moveTo(2,-2);ctx.lineTo(7,-7);ctx.moveTo(-2,2);ctx.lineTo(-7,7);ctx.moveTo(2,2);ctx.lineTo(7,7);ctx.stroke();
  for(const [x,y] of [[-7,-7],[7,-7],[-7,7],[7,7]]){ctx.beginPath();ctx.arc(x,y,2.2,0,Math.PI*2);ctx.stroke()}
 }else{
  const swept=kind==="jet";
  ctx.moveTo(0,-10);ctx.lineTo(2,-4);ctx.lineTo(swept?9:8,swept?2:0);ctx.lineTo(swept?8:8,swept?4:1.5);ctx.lineTo(2,2);ctx.lineTo(1,8);ctx.lineTo(4,9);ctx.lineTo(4,10);ctx.lineTo(0,9);ctx.lineTo(-4,10);ctx.lineTo(-4,9);ctx.lineTo(-1,8);ctx.lineTo(-2,2);ctx.lineTo(swept?-8:-8,swept?4:1.5);ctx.lineTo(swept?-9:-8,swept?2:0);ctx.lineTo(-2,-4);ctx.closePath();ctx.fill();ctx.stroke();
 }
 ctx.restore();
}

const AIRCRAFT_GRACE_MS=20000;
const AIRCRAFT_POSITION_RESPONSE_MS=4200;
const AIRCRAFT_MOTION_RESPONSE_MS=1800;
const AIRCRAFT_ALTITUDE_RESPONSE_MS=2200;
const AIRCRAFT_MAX_FRAME_DT_MS=250;
async function refreshAircraft(force=false){
 if(!observer||!layers.aircraft)return;
 if(!force&&Date.now()-aircraftUpdated<2500)return;
 aircraftUpdated=Date.now();
 try{
   const qs=new URLSearchParams({lat:String(observer.lat),lon:String(observer.lon),radius_nm:String(AIRCRAFT_RADIUS_NM),limit:"450"});
   const res=await fetch(API_BASE+"/api/v1/aircraft?"+qs,{mode:"cors",cache:"no-store",credentials:"omit"});
   if(!res.ok)throw new Error("aircraft "+res.status);
   const data=await res.json(),frameNow=performance.now(),wallNow=Date.now();
   const previous=new Map(aircraft.map(a=>[a.id,a]));
   const next=new Map();
   for(const a of (Array.isArray(data.aircraft)?data.aircraft:[])){
     if(!Number.isFinite(Number(a.lat))||!Number.isFinite(Number(a.lon)))continue;
     const id=String(a.hex||a.flight||a.registration||"").trim();
     if(!id)continue;
     const prior=previous.get(id),lat=Number(a.lat),lon=Number(a.lon);
     const measuredGs=Math.max(0,Number(a.gs)||0),measuredTrack=norm360(Number(a.track)||0);
     const seenSeconds=clamp(Number(a.seen)||0,0,30);
     const projected=destinationPoint(lat,lon,measuredTrack,measuredGs*1.852*seenSeconds/3600);
     const measuredAltM=aircraftAltitudeM({alt_geom:a.alt_geom,alt_baro:a.alt_baro});
     next.set(id,{
       id,kind:"AIRCRAFT",name:String(a.flight||a.registration||a.hex||"Aircraft").trim(),callsign:String(a.flight||"").trim(),operator:String(a.operator||"").trim(),squawk:String(a.squawk||"").trim(),dbFlags:Number(a.db_flags)||0,hex:String(a.hex||"").trim(),
       lat:projected.lat,lon:projected.lon,
       displayLat:prior?.displayLat??projected.lat,displayLon:prior?.displayLon??projected.lon,
       altM:measuredAltM,displayAltM:prior?.displayAltM??measuredAltM,
       gs:measuredGs,displayGs:prior?.displayGs??measuredGs,
       track:measuredTrack,displayTrack:prior?.displayTrack??measuredTrack,
       targetLat:projected.lat,targetLon:projected.lon,
       targetUpdatedAt:frameNow,
       type:a.type||"Aircraft",category:String(a.category||"").trim().toUpperCase(),registration:a.registration||"—",seen:seenSeconds,
       lastFrame:prior?.lastFrame??frameNow,lastSeenAt:wallNow
     });
   }
   for(const [id,prior] of previous){
     if(next.has(id))continue;
     const lastSeenAt=Number(prior.lastSeenAt)||wallNow;
     if(wallNow-lastSeenAt<=AIRCRAFT_GRACE_MS)next.set(id,prior);
   }
   aircraft=[...next.values()];
 }catch(e){
   console.warn("ALEN aircraft feed unavailable; retaining recent aircraft",e);
   const wallNow=Date.now();
   aircraft=aircraft.filter(a=>wallNow-(Number(a.lastSeenAt)||wallNow)<=AIRCRAFT_GRACE_MS);
 }
 setLiveStatus();
}
function stepAircraft(now){
 for(const a of aircraft){
   const rawDt=Math.max(0,now-(a.lastFrame||now));a.lastFrame=now;
   if(rawDt<=0)continue;
   const dt=Math.min(AIRCRAFT_MAX_FRAME_DT_MS,rawDt);
   const motionK=1-Math.exp(-dt/AIRCRAFT_MOTION_RESPONSE_MS);
   const altitudeK=1-Math.exp(-dt/AIRCRAFT_ALTITUDE_RESPONSE_MS);
   const positionK=1-Math.exp(-dt/AIRCRAFT_POSITION_RESPONSE_MS);

   a.displayGs+=(a.gs-a.displayGs)*motionK;
   a.displayTrack=blendAngle(a.displayTrack,a.track,motionK);
   a.displayAltM+=(a.altM-a.displayAltM)*altitudeK;

   const displayTravelKm=Math.max(0,a.displayGs)*1.852*dt/3600000;
   const displayAdvanced=destinationPoint(a.displayLat,a.displayLon,a.displayTrack,displayTravelKm);
   a.displayLat=displayAdvanced.lat;a.displayLon=displayAdvanced.lon;

   const targetTravelKm=Math.max(0,a.gs)*1.852*dt/3600000;
   const targetAdvanced=destinationPoint(a.targetLat??a.lat,a.targetLon??a.lon,a.track,targetTravelKm);
   a.targetLat=targetAdvanced.lat;a.targetLon=targetAdvanced.lon;

   const latError=(a.targetLat??a.displayLat)-a.displayLat;
   const lonError=adiff(a.targetLon??a.displayLon,a.displayLon);
   a.displayLat+=latError*positionK;
   a.displayLon+=lonError*positionK;

   if(rawDt>AIRCRAFT_MAX_FRAME_DT_MS){
     const catchupMs=rawDt-AIRCRAFT_MAX_FRAME_DT_MS;
     const catchupKm=Math.max(0,a.displayGs)*1.852*catchupMs/3600000;
     const catchup=destinationPoint(a.displayLat,a.displayLon,a.displayTrack,catchupKm);
     a.displayLat=catchup.lat;a.displayLon=catchup.lon;
     const targetCatchupKm=Math.max(0,a.gs)*1.852*catchupMs/3600000;
     const targetCatchup=destinationPoint(a.targetLat,a.targetLon,a.track,targetCatchupKm);
     a.targetLat=targetCatchup.lat;a.targetLon=targetCatchup.lon;
   }
 }
}

async function refreshAirports(){
 if(!observer||!layers.airports)return;
 try{
   const qs=new URLSearchParams({lat:String(observer.lat),lon:String(observer.lon),radius_km:String(AIRPORT_RADIUS_KM),limit:"30"});
   const res=await fetch(API_BASE+"/api/v1/airports?"+qs,{mode:"cors",cache:"no-store",credentials:"omit"});
   if(!res.ok)throw new Error("airports "+res.status);
   const data=await res.json();
   const next=(Array.isArray(data.airports)?data.airports:[]).filter(a=>Number(a.distance_km)<=AIRPORT_RADIUS_KM).map(a=>({
     id:"airport:"+(a.icao||a.iata||a.name),kind:"AIRPORT",name:a.name||a.icao||"Airport",
     iata:a.iata||"",icao:a.icao||"",distanceKm:Number(a.distance_km)||0,
     az:Number(a.bearing_deg)||0,type:a.type||"airport",lat:Number(a.latitude),lon:Number(a.longitude)
   }));
   airports=next;
 }catch(e){
   console.warn("ALEN airport feed unavailable",e);
   setTimeout(()=>refreshAirports(),5000);
 }
}
function airportDisplayObject(a){
 const horizonEl=terrainHorizonElevation(a.az);
 return makeSkyObject({...a,horizonEl,el:horizonEl+1.6});
}

function satelliteGroupEntries(){
 return Object.entries(SATELLITE_GROUPS);
}
function activeSatelliteGroups(){
 return satelliteGroupEntries().filter(([,group])=>group.enabled);
}
function satellitePrimaryGroup(memberships){
 return memberships.map(key=>[key,SATELLITE_GROUPS[key]]).filter(([,g])=>g?.enabled).sort((a,b)=>b[1].priority-a[1].priority)[0]?.[0]||"bright";
}
function logicalSatelliteMemberships(sourceGroups){
 const sourceSet=new Set(sourceGroups||[]),memberships=[];
 for(const [key,group] of satelliteGroupEntries())if(group.sources.some(source=>sourceSet.has(source)))memberships.push(key);
 return memberships;
}
const SATELLITE_GRACE_MS=15000;
const SATELLITE_POSITION_RESPONSE_MS=850;
const SATELLITE_MAX_FRAME_DT_MS=250;
function satelliteMotionRate(current,next,horizonSeconds,isAngle=false){
 const h=Math.max(.25,Number(horizonSeconds)||2)*1000;
 return (isAngle?adiff(next,current):(next-current))/h;
}
function satelliteMotionModel(current,next,next2,horizonSeconds,isAngle=false){
 const h=Math.max(.25,Number(horizonSeconds)||2)*1000;
 const d1=isAngle?adiff(next,current):(next-current),d2=isAngle?adiff(next2,next):(next2-next);
 return{rate:d1/h,accel:(d2-d1)/(h*h)};
}
function satelliteSkyVector(az,el){
 const azr=az*DEG,elr=el*DEG,c=Math.cos(elr);
 return{x:c*Math.sin(azr),y:c*Math.cos(azr),z:Math.sin(elr)};
}
function normalizeSkyVector(v){
 const m=Math.hypot(v.x,v.y,v.z)||1;
 return{x:v.x/m,y:v.y/m,z:v.z/m};
}
function satelliteVectorToAltAz(v){
 const n=normalizeSkyVector(v),horizontal=Math.hypot(n.x,n.y);
 return{az:norm360(Math.atan2(n.x,n.y)*RAD),el:Math.atan2(n.z,horizontal)*RAD};
}
function satelliteVectorModel(v0,v1,v2,horizonSeconds){
 const h=Math.max(.25,Number(horizonSeconds)||2)*1000;
 return{
  rate:{x:(v1.x-v0.x)/h,y:(v1.y-v0.y)/h,z:(v1.z-v0.z)/h},
  accel:{x:(v2.x-2*v1.x+v0.x)/(h*h),y:(v2.y-2*v1.y+v0.y)/(h*h),z:(v2.z-2*v1.z+v0.z)/(h*h)}
 };
}
function blendSkyVector(current,target,k){
 return normalizeSkyVector({
  x:current.x+(target.x-current.x)*k,
  y:current.y+(target.y-current.y)*k,
  z:current.z+(target.z-current.z)*k
 });
}
function satelliteVisualType(s){
 if(s.group==="stations")return"station";
 if(s.group==="starlink"||s.group==="oneweb"||s.group==="kuiper")return"constellation";
 if(s.group==="navigation")return"navigation";
 if(s.group==="weather"||s.group==="earth")return"earth";
 if(s.group==="debris")return"debris";
 if(s.group==="cubesat"||s.group==="amateur")return"cubesat";
 return"satellite";
}
function drawSatelliteIcon(kind,size,fill,stroke){
 const k=size/14;ctx.save();ctx.scale(k,k);ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=1.2/k;ctx.lineJoin="round";ctx.lineCap="round";
 if(kind==="station"){
  ctx.strokeRect(-3,-2.5,6,5);ctx.fillRect(-2.2,-1.7,4.4,3.4);
  ctx.strokeRect(-10,-3.5,5,7);ctx.strokeRect(5,-3.5,5,7);
  ctx.beginPath();ctx.moveTo(-5,0);ctx.lineTo(-3,0);ctx.moveTo(3,0);ctx.lineTo(5,0);ctx.stroke();
 }else if(kind==="constellation"){
  ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(5,-3);ctx.lineTo(8,0);ctx.lineTo(5,3);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(-4,-1.5);ctx.lineTo(-4,1.5);ctx.moveTo(1,-2.4);ctx.lineTo(1,2.4);ctx.stroke();
 }else if(kind==="navigation"){
  ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(6,0);ctx.lineTo(0,6);ctx.lineTo(-6,0);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.arc(0,0,2.2,0,Math.PI*2);ctx.stroke();
 }else if(kind==="earth"){
  ctx.beginPath();ctx.arc(0,0,4.5,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(-4.5,0);ctx.moveTo(4.5,0);ctx.lineTo(8,0);ctx.stroke();
 }else if(kind==="cubesat"){
  ctx.strokeRect(-4,-4,8,8);ctx.fillRect(-2.8,-2.8,5.6,5.6);
  ctx.beginPath();ctx.moveTo(4,-2);ctx.lineTo(8,-4);ctx.lineTo(8,2);ctx.lineTo(4,2);ctx.stroke();
 }else if(kind==="debris"){
  ctx.beginPath();ctx.moveTo(-5,-4);ctx.lineTo(2,-6);ctx.lineTo(6,-1);ctx.lineTo(3,5);ctx.lineTo(-4,4);ctx.lineTo(-6,0);ctx.closePath();ctx.fill();ctx.stroke();
 }else{
  ctx.strokeRect(-3,-3,6,6);ctx.fillRect(-2,-2,4,4);
  ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(-3,0);ctx.moveTo(3,0);ctx.lineTo(8,0);ctx.stroke();
 }
 ctx.restore();
}
function labelBoxOverlaps(box,boxes){
 return boxes.some(b=>!(box.x+box.w<b.x||b.x+b.w<box.x||box.y+box.h<b.y||b.y+b.h<box.y));
}
async function refreshSatellites(force=false){
 if(!observer||satelliteRequestInFlight)return;
 if(!force&&Date.now()-satellitesUpdated<8000)return;
 satellitesUpdated=Date.now();
 satelliteRequestInFlight=true;
 satelliteRequestState="requesting";
 setLiveStatus();
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),20000);
 try{
  const sources=[...new Set(activeSatelliteGroups().flatMap(([,group])=>group.sources))];
  if(!sources.length){
   satellites=[];
   satelliteDiagnostics={unique_orbits:0,visible:0,requested_groups:[]};
   satelliteRequestState="ok";
   return;
  }
  const qs=new URLSearchParams({
   lat:String(observer.lat),lon:String(observer.lon),altitude_m:String(observer.altM||0),
   groups:sources.join(","),limit:"320"
  });
  const res=await fetch(API_BASE+"/api/v1/satellites?"+qs,{mode:"cors",cache:"no-store",credentials:"omit",signal:controller.signal});
  if(!res.ok)throw new Error("satellites "+res.status);
  const data=await res.json();
  satelliteDiagnostics=data.diagnostics||null;
  satelliteRequestState="ok";
  const frameNow=performance.now(),wallNow=Date.now(),previous=new Map(satellites.map(s=>[s.id,s])),next=[];
  for(const raw of (Array.isArray(data.satellites)?data.satellites:[])){
   const memberships=logicalSatelliteMemberships(raw.groups),group=satellitePrimaryGroup(memberships),style=SATELLITE_GROUPS[group]||SATELLITE_GROUPS.bright;
   const id="sat:"+raw.norad,prior=previous.get(id);
   const az=Number(raw.azimuth_deg),el=Number(raw.elevation_deg),rangeKm=Number(raw.range_km);
   const nextAz=Number(raw.azimuth_deg_next),nextEl=Number(raw.elevation_deg_next),nextRange=Number(raw.range_km_next);
   const nextAz2=Number(raw.azimuth_deg_next2),nextEl2=Number(raw.elevation_deg_next2),nextRange2=Number(raw.range_km_next2),horizon=Number(raw.motion_horizon_seconds)||2;
   if(!Number.isFinite(az)||!Number.isFinite(el)||el<0)continue;
   const sat=makeSkyObject({id,kind:"SATELLITE",name:raw.name||("NORAD "+raw.norad),az:prior?.displayAz??az,el:prior?.displayEl??el,
    rangeKm:prior?.displayRangeKm??rangeKm,detail:"SGP4 · CelesTrak orbital elements",group,groupLabel:style.label,color:style.color,glyph:style.glyph,
    norad:String(raw.norad||"—"),objectId:raw.international_id||"—",memberships,isNew:memberships.includes("new"),isDebris:memberships.includes("debris")});
   sat.displayAz=prior?.displayAz??az;sat.displayEl=prior?.displayEl??el;sat.displayRangeKm=prior?.displayRangeKm??rangeKm;
   const sample0=satelliteSkyVector(az,el);
   const sample1=Number.isFinite(nextAz)&&Number.isFinite(nextEl)?satelliteSkyVector(nextAz,nextEl):sample0;
   const sample2=Number.isFinite(nextAz2)&&Number.isFinite(nextEl2)?satelliteSkyVector(nextAz2,nextEl2):sample1;
   const vectorModel=satelliteVectorModel(sample0,sample1,sample2,horizon);
   sat.displayVec=prior?.displayVec??satelliteSkyVector(sat.displayAz,sat.displayEl);
   sat.targetVec=sample0;
   sat.vectorRate=vectorModel.rate;sat.vectorAccel=vectorModel.accel;
   sat.targetRangeKm=rangeKm;
   const rangeModel=Number.isFinite(nextRange)&&Number.isFinite(nextRange2)?satelliteMotionModel(rangeKm,nextRange,nextRange2,horizon,false):null;
   sat.rangeRateKmMs=rangeModel?.rate??(Number.isFinite(nextRange)?satelliteMotionRate(rangeKm,nextRange,horizon,false):(prior?.rangeRateKmMs||0));
   sat.rangeAccelKmMs2=rangeModel?.accel??(prior?.rangeAccelKmMs2||0);
   sat.lastFrame=prior?.lastFrame??frameNow;sat.lastSeenAt=wallNow;
   next.push(sat);
  }
  const nextIds=new Set(next.map(s=>s.id));
  for(const prior of previous.values()){
   if(nextIds.has(prior.id))continue;
   if(wallNow-(Number(prior.lastSeenAt)||wallNow)<=SATELLITE_GRACE_MS)next.push(prior);
  }
  satellites=next;
 }catch(e){
  const wallNow=Date.now();
  satellites=satellites.filter(s=>wallNow-(Number(s.lastSeenAt)||wallNow)<=SATELLITE_GRACE_MS);
  satelliteDiagnostics=satelliteDiagnostics||{unique_orbits:satellites.length};
  satelliteRequestState=satellites.length?"stale":"error";
  console.warn("ALEN satellite feed unavailable; retaining recent satellites",e);
 }finally{
  clearTimeout(timeout);
  satelliteRequestInFlight=false;
  setLiveStatus();
 }
}
function stepSatellites(now){
 for(const s of satellites){
  const rawDt=Math.max(0,now-(s.lastFrame||now));s.lastFrame=now;
  if(rawDt<=0)continue;
  const dt=Math.min(SATELLITE_MAX_FRAME_DT_MS,rawDt),positionK=1-Math.exp(-dt/SATELLITE_POSITION_RESPONSE_MS);
  const rate=s.vectorRate||{x:0,y:0,z:0},accel=s.vectorAccel||{x:0,y:0,z:0},target=s.targetVec||satelliteSkyVector(s.az,s.el);
  s.targetVec=normalizeSkyVector({
   x:target.x+rate.x*rawDt+.5*accel.x*rawDt*rawDt,
   y:target.y+rate.y*rawDt+.5*accel.y*rawDt*rawDt,
   z:target.z+rate.z*rawDt+.5*accel.z*rawDt*rawDt
  });
  s.vectorRate={x:rate.x+accel.x*rawDt,y:rate.y+accel.y*rawDt,z:rate.z+accel.z*rawDt};
  s.displayVec=blendSkyVector(s.displayVec||satelliteSkyVector(s.az,s.el),s.targetVec,positionK);
  const display=satelliteVectorToAltAz(s.displayVec);
  const rangeRate=Number(s.rangeRateKmMs)||0,rangeAccel=Number(s.rangeAccelKmMs2)||0;
  s.targetRangeKm=Math.max(0,(s.targetRangeKm??s.rangeKm)+rangeRate*rawDt+.5*rangeAccel*rawDt*rawDt);
  s.rangeRateKmMs=rangeRate+rangeAccel*rawDt;
  s.displayRangeKm=(s.displayRangeKm??s.rangeKm)+((s.targetRangeKm??s.rangeKm)-(s.displayRangeKm??s.rangeKm))*positionK;
  s.displayAz=display.az;s.displayEl=display.el;
  s.az=display.az;s.el=display.el;s.rangeKm=s.displayRangeKm;
 }
}

function currentSkyObjects(ms){
 if(!observer)return[];
 const catalogue=brightStars.length?brightStars:SKY_OBJECTS;
 return catalogue.map(o=>{
   const p=raDecToAltAz(o.ra,o.dec,ms);
   return p?makeAstronomySkyObject({...o,az:p.az,el:p.el}):null;
 }).filter(Boolean);
}
function screenYForElevation(el,az=yaw){
 const p=project(az,el);
 if(p)return p[1];
 const vfov=verticalFovRad(),delta=(el-pitch)*DEG;
 return height*.5-Math.tan(delta)/Math.tan(vfov/2)*height*.5;
}
function traceTerrainSkyline(){
 const points=[],step=4,margin=Math.max(80,width*.08);
 for(let x=-margin;x<=width+margin;x+=step){
   const az=norm360(yaw+(x-width*.5)/width*fov);
   const el=terrainHorizonElevation(az);
   points.push([x,screenYForElevation(el,az)]);
 }
 return{points,margin};
}
function drawDistantTerrain(dayMode){
 if(!layers.landscape||!terrainProfile?.length)return;
 const horizonY=screenYForElevation(0);
 if(horizonY>=height+180)return;
 const {points,margin}=traceTerrainSkyline();
 if(!points.length)return;

 ctx.beginPath();
 ctx.moveTo(points[0][0],points[0][1]);
 for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
 ctx.lineTo(width+margin,horizonY);ctx.lineTo(-margin,horizonY);ctx.closePath();

 const top=Math.max(0,horizonY-150),bottom=Math.min(height,horizonY+4);
 const terrainShade=ctx.createLinearGradient(0,top,0,bottom);
 if(dayMode){
  terrainShade.addColorStop(0,"rgba(45,70,82,.58)");
  terrainShade.addColorStop(1,"rgba(16,28,34,.90)");
 }else{
  terrainShade.addColorStop(0,"rgba(13,23,29,.76)");
  terrainShade.addColorStop(1,"rgba(3,8,11,.96)");
 }
 ctx.fillStyle=terrainShade;ctx.fill();

 ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
 for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
 ctx.strokeStyle=dayMode?"rgba(120,155,168,.34)":"rgba(105,145,160,.22)";
 ctx.lineWidth=.8;ctx.stroke();
}
function drawHorizon(){
 const horizonY=screenYForElevation(0);
 if(layers.atmosphere){
  const glow=ctx.createLinearGradient(0,Math.max(0,horizonY-120),0,Math.min(height,horizonY+28));
  glow.addColorStop(0,"rgba(60,120,160,0)");glow.addColorStop(.72,"rgba(65,125,165,.12)");glow.addColorStop(1,"rgba(0,0,0,.28)");
  ctx.fillStyle=glow;ctx.fillRect(0,Math.max(0,horizonY-120),width,Math.min(148,height));
 }
 if(horizonY>=0&&horizonY<=height){
   ctx.strokeStyle="rgba(190,225,240,.18)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,horizonY);ctx.lineTo(width,horizonY);ctx.stroke();
 }
}
function drawLandscapeForeground(){
 if(!layers.landscape)return;
 const horizonY=screenYForElevation(0);
 if(horizonY>=height+180)return;
 const y=clamp(horizonY,-2,height+2);
 ctx.fillStyle="rgba(2,5,7,.985)";
 ctx.fillRect(0,y,width,height-y+2);
 if(y>=0&&y<=height){
  ctx.strokeStyle="rgba(125,160,172,.16)";ctx.lineWidth=.8;
  ctx.beginPath();ctx.moveTo(0,y+.5);ctx.lineTo(width,y+.5);ctx.stroke();
 }
}
function isAboveLandscape(az,el){
 return !layers.landscape||el>terrainHorizonElevation(az);
}
function draw(){
 const sun=currentSunAltAz(simTime),sky=timeOfDaySky(sun?.el),dayMode=sky.daylight>.45;
 root.dataset.skyMode=dayMode?"day":"night";
 const objectText=dayMode?"#08283f":"#eef8ff";
 const aircraftInk=dayMode?"#083a59":"#9fd9ff";
 const g=ctx.createLinearGradient(0,0,0,height);
 g.addColorStop(0,sky.top);
 g.addColorStop(.62,layers.atmosphere?sky.mid:sky.top);
 g.addColorStop(1,layers.atmosphere?sky.horizon:sky.mid);
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
   if(o.el<0||!isAboveLandscape(o.az,o.el))continue;const p=project(o.az,o.el);if(!p)continue;
   const visualMag=Number.isFinite(o.apparentMag)?o.apparentMag:o.mag;
   const r=Math.max(1.05,3.8-visualMag*.42)*(90/fov),isSelected=selected?.id===o.id;
   if(isSelected){ctx.strokeStyle="#7be5ff";ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(p[0],p[1],r+8,0,Math.PI*2);ctx.stroke()}
   const daylightAlpha=starVisibilityAlpha(visualMag,sky),starPalette=starRenderPalette(o.color,sky.daylight);
   ctx.globalAlpha=Math.max(0,Math.max(.15,1-visualMag*.11)*daylightAlpha);
   ctx.shadowBlur=Math.max(2,10-o.extinctionMag*2);ctx.shadowColor=starPalette.halo;ctx.fillStyle=starPalette.fill;
   ctx.beginPath();ctx.arc(p[0],p[1],r,0,Math.PI*2);ctx.fill();
   if(sky.daylight>.45){ctx.shadowBlur=0;ctx.strokeStyle=starPalette.outline;ctx.lineWidth=.8;ctx.stroke()}
   ctx.shadowBlur=0;ctx.globalAlpha=1;
   if(layerLabelsOn("stars")&&(visualMag<.5||isSelected)&&daylightAlpha>.08){ctx.globalAlpha=Math.max(.28,daylightAlpha);ctx.fillStyle=isSelected?(dayMode?"#08283f":"#dff9ff"):starPalette.label;ctx.font="700 11px ui-monospace,monospace";ctx.fillText(o.name,p[0]+r+6,p[1]-r-2);ctx.globalAlpha=1}
  }
 }
 if(layers.planets){
  for(const o of currentPlanetObjects(simTime)){
   if(o.el<0||!isAboveLandscape(o.az,o.el))continue;const p=project(o.az,o.el);if(!p)continue;const active=selected?.id===o.id;
   const size=o.name==="Sun"?25:o.name==="Moon"?22:15;
   ctx.fillStyle=o.color;ctx.strokeStyle=dayMode?"rgba(6,31,48,.72)":"rgba(0,0,0,.36)";ctx.lineWidth=dayMode?2.2:1.2;ctx.font=`${active?"700 ":""}${size}px system-ui`;ctx.textAlign="center";ctx.textBaseline="middle";
   ctx.strokeText(o.symbol,p[0],p[1]);ctx.fillText(o.symbol,p[0],p[1]);ctx.textAlign="left";ctx.textBaseline="alphabetic";
   if(active){ctx.strokeStyle=o.color;ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(p[0],p[1],size*.72,0,Math.PI*2);ctx.stroke()}
   if(layerLabelsOn("planets")){ctx.fillStyle=objectText;ctx.font="700 10px ui-monospace";ctx.fillText(o.name,p[0]+size*.55,p[1]-size*.45);}
  }
 }
 if(layers.aircraft){
  for(const a of aircraft){
   if(!aircraftGroupEnabled(a))continue;
   const q=airborneAltAz(a.displayLat,a.displayLon,a.displayAltM??a.altM);if(!q||q.el<0||!isAboveLandscape(q.az,q.el))continue;const p=project(q.az,q.el);if(!p)continue;
   const depthScale=clamp(1.28-q.slantRangeKm/110,.72,1.22),iconSize=Math.round(19*depthScale),visualType=aircraftVisualType(a);
   ctx.save();ctx.translate(p[0],p[1]);ctx.rotate(aircraftScreenRotation(a,q,p));
   drawAircraftIcon(visualType,iconSize,aircraftInk,dayMode?"rgba(255,255,255,.88)":"rgba(0,0,0,.55)");
   ctx.restore();
   ctx.globalAlpha=1;
   if(aircraftLabelsOn(a)){
    const callsign=a.callsign||a.name||"Aircraft",operator=aircraftOperator(a),meaning=aircraftSpecialMeaning(a);
    const lines=meaning?[["Callsign:",callsign],["Meaning:",meaning]]:[["Callsign:",callsign],["Operator:",operator]];
    ctx.font="700 9px ui-monospace";
    const lineWidths=lines.map(([label,value])=>ctx.measureText(label+" "+value).width);
    const boxW=Math.max(...lineWidths)+12,boxH=lines.length*13+4;
    const boxX=p[0]+iconSize*.62,boxY=p[1]-iconSize*.82-boxH+5;
    ctx.fillStyle=dayMode?"rgba(5,30,47,.92)":"rgba(2,8,14,.92)";
    ctx.strokeStyle=meaning?"rgba(255,197,72,.92)":(dayMode?"rgba(255,255,255,.74)":"rgba(123,229,255,.38)");
    ctx.lineWidth=meaning?1.5:1;ctx.beginPath();ctx.roundRect(boxX,boxY,boxW,boxH,4);ctx.fill();ctx.stroke();
    lines.forEach(([label,value],index)=>{
     const y=boxY+12+index*13;
     ctx.fillStyle=meaning&&label==="Meaning:"?"#ffd166":"#7be5ff";ctx.fillText(label,boxX+6,y);
     const labelWidth=ctx.measureText(label+" ").width;
     ctx.fillStyle="#ffffff";ctx.fillText(value,boxX+6+labelWidth,y);
    });
    ctx.globalAlpha=1;
   }
  }
 }
 if(layers.satellites){
  const satelliteLabelBoxes=[];
  const orderedSatellites=[...satellites].sort((a,b)=>(selected?.id===b.id)-(selected?.id===a.id)||b.el-a.el);
  for(const s of orderedSatellites){
   if(!isAboveLandscape(s.az,s.el))continue;const p=project(s.az,s.el);if(!p)continue;
   const active=selected?.id===s.id,satScale=clamp(1.35-Math.log10(Math.max(100,s.rangeKm))/4,.76,1.18);
   const satSize=Math.round((active?18:14)*satScale),visualType=satelliteVisualType(s);
   ctx.save();ctx.translate(p[0],p[1]);
   drawSatelliteIcon(visualType,satSize,s.color,dayMode?"rgba(8,40,63,.88)":"rgba(225,245,255,.72)");
   ctx.restore();
   if(active){ctx.strokeStyle=s.color;ctx.beginPath();ctx.arc(p[0],p[1],satSize*.72+4,0,Math.PI*2);ctx.lineWidth=1;ctx.stroke()}
   const satGroup=SATELLITE_GROUPS[s.group];
   if(layerLabelsOn("satellites")&&satGroup?.labels&&(s.el>28||active)){
    ctx.font=active?"700 10px ui-monospace":"700 9px ui-monospace";
    const w=ctx.measureText(s.name).width+8,h=13,x=p[0]+satSize*.55+3,y=p[1]-12;
    const box={x,y,w,h};
    if(active||!labelBoxOverlaps(box,satelliteLabelBoxes)){
     satelliteLabelBoxes.push(box);
     ctx.fillStyle=dayMode?"rgba(237,247,252,.76)":"rgba(2,8,14,.68)";ctx.fillRect(x-3,y-1,w,h);
     ctx.fillStyle=active?s.color:objectText;ctx.fillText(s.name,x,y+9);
    }
   }
  }
 }

 drawDistantTerrain(dayMode);
 drawLandscapeForeground();

 if(layers.airports){
  for(const raw of airports){
   const a=airportDisplayObject(raw),p=project(a.az,a.el),h=project(a.az,a.horizonEl);if(!p)continue;
   const active=selected?.id===a.id,label=a.iata||a.icao||"APT";
   ctx.save();
   ctx.strokeStyle=active?"#ffffff":"rgba(123,229,255,.95)";ctx.fillStyle=active?"#ffffff":"rgba(123,229,255,.95)";
   ctx.lineWidth=active?2:1.4;
   if(h){ctx.beginPath();ctx.moveTo(p[0],p[1]+7);ctx.lineTo(h[0],h[1]);ctx.stroke()}
   ctx.beginPath();ctx.moveTo(p[0],p[1]-9);ctx.lineTo(p[0]-6,p[1]+2);ctx.lineTo(p[0]+6,p[1]+2);ctx.closePath();ctx.stroke();
   ctx.beginPath();ctx.moveTo(p[0],p[1]+2);ctx.lineTo(p[0],p[1]+9);ctx.stroke();
   if(layerLabelsOn("airports")){
    ctx.font="700 10px ui-monospace,monospace";
    const tw=ctx.measureText(label).width;
    ctx.fillStyle="rgba(2,7,12,.82)";ctx.fillRect(p[0]+8,p[1]-17,tw+8,15);
    ctx.fillStyle=active?"#ffffff":"#9feaff";ctx.fillText(label,p[0]+12,p[1]-6);
   }
   ctx.restore();
  }
 }

 if(!observer){
   ctx.fillStyle="rgba(232,246,255,.85)";ctx.font="600 16px system-ui";ctx.textAlign="center";
   ctx.fillText("Allow current location to initialise your live sky",width/2,height*.54);
   ctx.textAlign="left";
 }
}

function allSelectableObjects(){
 const stars=currentSkyObjects(simTime).filter(o=>skyObjectVisible(o));
 const ac=layers.aircraft?aircraft.filter(aircraftGroupEnabled).map(a=>{const p=airborneAltAz(a.displayLat,a.displayLon,a.displayAltM??a.altM);return p?makeSkyObject({...a,az:p.az,el:p.el,distanceKm:p.distanceKm,slantRangeKm:p.slantRangeKm,horizontalKm:p.horizontalKm}):null}).filter(o=>skyObjectVisible(o)):[];
 const aps=layers.airports?airports.map(airportDisplayObject).filter(o=>skyObjectVisible(o,{respectLandscape:false})):[];
 const planets=currentPlanetObjects(simTime).filter(o=>skyObjectVisible(o));
 const visibleSatellites=layers.satellites?satellites.filter(o=>SATELLITE_GROUPS[o.group]?.enabled!==false&&skyObjectVisible(o)):[];
 return [...stars,...planets,...aps,...ac,...visibleSatellites];
}
function nearestObject(x,y){
 let best=null,bestD=Infinity;
 for(const o of allSelectableObjects()){const p=skyObjectScreen(o);if(!p)continue;const d=Math.hypot(x-p[0],y-p[1]);if(d<30&&d<bestD){best=o;bestD=d}}
 return best;
}
function escapeSvgText(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[ch]))}
function objectVisualSvg(o){
 const title=escapeSvgText(o.name||o.kind),kind=escapeSvgText(o.kind||"OBJECT"),color=escapeSvgText(o.color||"#9feaff");
 let art="",sub="";
 if(o.kind==="AIRCRAFT"){
  sub=escapeSvgText((o.type||"Aircraft")+(o.registration&&o.registration!=="—"?" · "+o.registration:""));
  art=`<g transform="translate(360 166) rotate(-8)" fill="#dfeaf2" stroke="#6f8fa3" stroke-width="3"><path d="M0-112 18-48 118-8 118 9 22 2 15 73 55 97 55 111 0 96-55 111-55 97-15 73-22 2-118 9-118-8-18-48Z"/><path d="M-9-58H9" stroke="#8edcff" stroke-width="7"/></g>`;
 }else if(o.kind==="SATELLITE"){
  sub=escapeSvgText(o.groupLabel||"Orbital satellite");
  art=`<g transform="translate(360 170)" stroke="#bfe8ff" stroke-width="3"><rect x="-46" y="-28" width="92" height="56" rx="8" fill="#677985"/><rect x="-154" y="-45" width="94" height="90" fill="#244c79"/><rect x="60" y="-45" width="94" height="90" fill="#244c79"/><path d="M-60 0H-46M46 0H60" stroke-width="8"/><path d="M-138-45V45M-122-45V45M-106-45V45M-90-45V45M76-45V45M92-45V45M108-45V45M124-45V45M140-45V45" opacity=".45"/><circle cx="0" cy="0" r="16" fill="#d9e4e8"/><path d="M0-28V-62M-10-62H10" /></g>`;
 }else if(o.kind==="PLANET"){
  sub=escapeSvgText(o.detail||"Solar System object");
  const n=(o.name||"").toLowerCase();
  if(n==="saturn") art=`<g><ellipse cx="360" cy="174" rx="132" ry="34" fill="none" stroke="#c9b16a" stroke-width="15" transform="rotate(-10 360 174)"/><circle cx="360" cy="170" r="78" fill="#e4c87a"/><path d="M292 150 Q360 168 428 150M290 185 Q360 200 430 184" stroke="#b39455" stroke-width="8" fill="none" opacity=".7"/></g>`;
  else if(n==="jupiter") art=`<g><circle cx="360" cy="170" r="92" fill="#d7ad86"/><path d="M278 120 Q360 138 442 120M272 148 Q360 168 448 148M270 180 Q360 197 450 180M282 216 Q360 230 438 216" stroke="#9e684d" stroke-width="11" fill="none" opacity=".68"/><ellipse cx="406" cy="191" rx="24" ry="13" fill="#a84f3f"/></g>`;
  else if(n==="mars") art=`<g><circle cx="360" cy="170" r="88" fill="#c45f3d"/><path d="M320 118 q40 20 70 2t35 30q-35 8-54 35t-64-5q18-29 13-62Z" fill="#7d3d2f" opacity=".6"/><path d="M322 94 q38-18 76 2" stroke="#e8c0a2" stroke-width="10" opacity=".55"/></g>`;
  else if(n==="venus") art=`<g><circle cx="360" cy="170" r="88" fill="#e8c990"/><path d="M292 132 q55-37 137-4M286 172 q70-30 148 3M306 211 q65-24 111 2" stroke="#fff0c6" stroke-width="14" fill="none" opacity=".65"/></g>`;
  else if(n==="uranus"||n==="neptune") art=`<g><circle cx="360" cy="170" r="88" fill="${color}"/><path d="M286 157 Q360 145 434 157M286 184 Q360 174 434 184" stroke="#d8fbff" stroke-width="7" fill="none" opacity=".28"/></g>`;
  else if(n==="mercury") art=`<g><circle cx="360" cy="170" r="86" fill="#9d9489"/><circle cx="330" cy="145" r="18" fill="#77716a"/><circle cx="392" cy="190" r="25" fill="#807970"/><circle cx="388" cy="126" r="11" fill="#716c65"/></g>`;
  else if(n==="moon") art=`<g><circle cx="360" cy="170" r="90" fill="#d7d9d5"/><circle cx="326" cy="140" r="21" fill="#a7aaa7"/><circle cx="396" cy="190" r="27" fill="#b2b4b0"/><circle cx="386" cy="123" r="13" fill="#9da09d"/></g>`;
  else if(n==="sun") art=`<g><circle cx="360" cy="170" r="95" fill="#f2b84e"/><path d="M360 48V22M360 292V318M238 170H212M508 170H482M274 84 255 65M446 256 465 275M446 84 465 65M274 256 255 275" stroke="#f6d070" stroke-width="11" stroke-linecap="round"/><path d="M305 139 q38-26 73 2t44-5M299 193 q45 21 87-1t45 7" stroke="#d8862e" stroke-width="9" fill="none" opacity=".55"/></g>`;
  else art=`<circle cx="360" cy="170" r="88" fill="${color}"/>`;
 }else if(o.kind==="STAR"){
  sub=escapeSvgText(o.detail||"Star");
  art=`<g><circle cx="360" cy="170" r="92" fill="${color}"/><circle cx="332" cy="145" r="18" fill="#fff" opacity=".16"/><path d="M296 198 q48-20 98 1t43-20M312 121 q43 21 94 1" stroke="#fff" stroke-width="7" fill="none" opacity=".14"/></g>`;
 }else if(o.kind==="AIRPORT"){
  sub=escapeSvgText((o.iata||o.icao||"Airport")+" · "+Math.round(o.distanceKm)+" km");
  art=`<g transform="translate(360 170)" stroke="#9feaff" fill="none" stroke-width="8"><path d="M0-98V98M-62-70 0-98 62-70M-62 70 0 98 62 70"/><path d="M-102 0H102" stroke-width="4" stroke-dasharray="15 14"/></g>`;
 }else{
  sub=escapeSvgText(o.detail||"Sky object");
  art=`<circle cx="360" cy="170" r="88" fill="${color}"/>`;
 }
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="360" viewBox="0 0 720 360"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07111d"/><stop offset="1" stop-color="#010308"/></linearGradient></defs><rect width="720" height="360" fill="url(#bg)"/>${art}<text x="28" y="302" font-family="system-ui,sans-serif" font-size="25" font-weight="700" fill="#eef8ff">${title}</text><text x="28" y="331" font-family="system-ui,sans-serif" font-size="15" fill="#88a4b5">${kind} · ${sub}</text></svg>`;
 return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);
}
let inspectorMediaRequest=0;
function inspectorCreditText(o){
 return o.kind==="AIRCRAFT"?"Aircraft illustration · live position":o.kind==="SATELLITE"?"No verified photo loaded · ALEN illustration":o.kind==="PLANET"?"Planet appearance · ALEN illustration":o.kind==="STAR"?"Stellar appearance · ALEN illustration":o.kind==="AIRPORT"?"Airport horizon reference · ALEN":"Object appearance · ALEN";
}
function trustedExternalUrl(value,allowedHost){
 try{
  const url=new URL(String(value||""));
  if(url.protocol!=="https:"||url.hostname!==allowedHost)return "";
  return url.href;
 }catch{return ""}
}
function appendInspectorLink(parent,label,url,allowedHost){
 const safeUrl=trustedExternalUrl(url,allowedHost);
 if(!safeUrl)return;
 const sep=document.createTextNode(" · ");
 const a=document.createElement("a");
 a.href=safeUrl;a.target="_blank";a.rel="noopener noreferrer";a.textContent=label;
 parent.append(sep,a);
}
async function updateInspectorMedia(o){
 const image=document.querySelector("#inspector-image");
 const credit=document.querySelector("#inspector-image-credit");
 const token=++inspectorMediaRequest,fallback=objectVisualSvg(o);
 image.src=fallback;image.alt=(o.name||o.kind)+" visual";
 credit.textContent=inspectorCreditText(o);
 if(o.kind!=="AIRCRAFT")return;
 const registration=o.registration&&o.registration!=="—"?o.registration:"";
 const aircraftType=o.type&&o.type!=="Aircraft"?o.type:"";
 const icaoHex=String(o.hex||"").trim().toLowerCase();
 if(!registration&&!aircraftType&&!icaoHex)return;
 try{
  const qs=new URLSearchParams({registration,aircraft_type:aircraftType,icao_hex:icaoHex});
  const res=await fetch(API_BASE+"/api/v1/aircraft/photo?"+qs,{mode:"cors",cache:"force-cache",credentials:"omit"});
  if(!res.ok)throw new Error("aircraft photo "+res.status);
  const data=await res.json(),photo=data.photo;
  if(token!==inspectorMediaRequest||selected?.id!==o.id)return;
  if(!photo?.image_path){
   credit.textContent="No verified aircraft photo found · ALEN illustration";
   appendInspectorLink(credit,"More photos",`https://www.planespotters.net/photos/reg/${encodeURIComponent(registration)}`,"www.planespotters.net");
   return;
  }
  const imageUrl=API_BASE+photo.image_path;
  const probe=new Image();
  probe.decoding="async";
  probe.onload=()=>{
   if(token!==inspectorMediaRequest||selected?.id!==o.id)return;
   image.src=imageUrl;
   image.alt=`${registration||o.name} aircraft photo`;
   const matchLabel=photo.match==="icao"?"exact aircraft":photo.match==="registration"?"exact registration":"aircraft type";
   credit.replaceChildren(document.createTextNode(`${photo.artist||"Aircraft photographer"} · ${photo.license||"See source for usage terms"} · ${matchLabel}`));
   const commonsSource=trustedExternalUrl(photo.source_url,"commons.wikimedia.org");
   const planeSpottersSource=trustedExternalUrl(photo.source_url,"www.planespotters.net");
   if(commonsSource)appendInspectorLink(credit,"Source",commonsSource,"commons.wikimedia.org");
   else if(planeSpottersSource)appendInspectorLink(credit,"Source",planeSpottersSource,"www.planespotters.net");
   appendInspectorLink(credit,"More photos",photo.planespotters_url,"www.planespotters.net");
  };
  probe.onerror=()=>{
   if(token!==inspectorMediaRequest||selected?.id!==o.id)return;
   image.src=fallback;
   credit.textContent="Aircraft photo source unavailable · ALEN illustration";
   appendInspectorLink(credit,"More photos",photo.planespotters_url,"www.planespotters.net");
  };
  probe.src=imageUrl;
 }catch(e){
  if(token===inspectorMediaRequest){
   image.src=fallback;
   credit.textContent="Aircraft photo lookup unavailable · ALEN illustration";
   console.warn("ALEN aircraft photo lookup unavailable",e);
  }
 }
}
function formatRouteAirport(airport){
 if(!airport)return "Unavailable";
 const code=airport.iata||airport.icao||"";
 const name=airport.name||airport.location||"";
 return code&&name?`${code} · ${name}`:(code||name||"Unavailable");
}
function setInspectorDetail(key,value){
 const details=document.querySelector("#inspector-details");
 const dd=[...details.querySelectorAll("dd")].find(node=>node.dataset.key===key);
 if(dd)dd.textContent=value;
}
function formatSatelliteNumber(value,suffix="",digits=0){
 const n=Number(value);return Number.isFinite(n)?n.toFixed(digits)+suffix:"Not available";
}
async function updateSatelliteInfo(o){
 const norad=Number(o.norad);
 if(!Number.isFinite(norad))return;
 const token=o.id;
 try{
  const qs=new URLSearchParams({norad:String(norad),name:o.name||""});
  const res=await fetch(API_BASE+"/api/v1/satellite/info?"+qs,{mode:"cors",cache:"force-cache",credentials:"omit"});
  if(!res.ok)throw new Error("satellite info "+res.status);
  const data=await res.json(),info=data.satellite;
  if(selected?.id!==token||!info)return;

  setInspectorDetail("What is it?",info.object_type||"Artificial satellite");
  setInspectorDetail("Owner / operator",info.owner||"Not publicly listed");
  setInspectorDetail("Country",info.country||"Not publicly listed");
  setInspectorDetail("Status",info.status||"Unknown");
  setInspectorDetail("Launch date",info.launch_date||"Not publicly listed");
  setInspectorDetail("Launch site",info.launch_site||"Not publicly listed");
  setInspectorDetail("Expected life",info.life_expectancy||"Not publicly specified");
  setInspectorDetail("Cost",info.cost||"Not publicly specified");
  setInspectorDetail("Orbital period",formatSatelliteNumber(info.period_minutes," min",2));
  setInspectorDetail("Apogee",formatSatelliteNumber(info.apogee_km," km",0));
  setInspectorDetail("Perigee",formatSatelliteNumber(info.perigee_km," km",0));
  setInspectorDetail("Inclination",formatSatelliteNumber(info.inclination_deg,"°",2));
  setInspectorDetail("Radar cross-section",formatSatelliteNumber(info.rcs_m2," m²",2));

  const fact=document.querySelector("#inspector-fact");
  fact.textContent=info.purpose||"No public mission description was available for this object.";

  const photo=info.photo,image=document.querySelector("#inspector-image"),credit=document.querySelector("#inspector-image-credit");
  const imageUrl=trustedExternalUrl(photo?.image_url,"db-satnogs.freetls.fastly.net")||trustedExternalUrl(photo?.image_url,"upload.wikimedia.org");
  if(imageUrl){
   image.src=imageUrl;image.alt=(info.name||o.name)+" photo";
   credit.replaceChildren(document.createTextNode(`${photo.credit||"Satellite image"} · ${photo.license||"See source for licence"}`));
   const satnogsSource=trustedExternalUrl(photo.source_url,"db.satnogs.org");
   const commonsSource=trustedExternalUrl(photo.source_url,"commons.wikimedia.org");
   if(satnogsSource)appendInspectorLink(credit,"Source",satnogsSource,"db.satnogs.org");
   else if(commonsSource)appendInspectorLink(credit,"Source",commonsSource,"commons.wikimedia.org");
  }else{
   credit.textContent="No verified public image found · ALEN illustration";
  }
 }catch(e){
  if(selected?.id===token){
   for(const key of ["What is it?","Owner / operator","Country","Status","Launch date","Launch site","Expected life","Cost","Orbital period","Apogee","Perigee","Inclination","Radar cross-section"]){
    const dd=[...document.querySelector("#inspector-details").querySelectorAll("dd")].find(node=>node.dataset.key===key);
    if(dd&&dd.textContent==="Looking up…")dd.textContent="Unavailable";
   }
  }
  console.warn("ALEN satellite metadata unavailable",e);
 }
}
async function updateAircraftRoute(o){
 const callsign=String(o.callsign||o.name||"").trim();
 if(!callsign)return;
 const token=o.id;
 try{
  const qs=new URLSearchParams({callsign});
  const res=await fetch(API_BASE+"/api/v1/aircraft/route?"+qs,{mode:"cors",cache:"force-cache",credentials:"omit"});
  if(!res.ok)throw new Error("aircraft route "+res.status);
  const data=await res.json(),route=data.route;
  if(selected?.id!==token)return;
  if(!route){
   setInspectorDetail("Departure","Unavailable");
   setInspectorDetail("Arrival","Unavailable");
   return;
  }
  setInspectorDetail("Departure",formatRouteAirport(route.departure));
  setInspectorDetail("Arrival",formatRouteAirport(route.arrival));
 }catch(e){
  if(selected?.id===token){
   setInspectorDetail("Departure","Unavailable");
   setInspectorDetail("Arrival","Unavailable");
  }
  console.warn("ALEN aircraft route lookup unavailable",e);
 }
}
function showObject(o){
 selected=o;
 document.querySelector("#inspector-kind").textContent=o.kind;
 document.querySelector("#inspector-name").textContent=o.name;
 updateInspectorMedia(o);
 document.querySelector("#inspector-fact").textContent=o.fact||(
   o.kind==="AIRCRAFT"?"Live aircraft position from the current ADS-B feed; motion is smoothed between network updates.":
   o.kind==="AIRPORT"?"Nearby airport positioned at its true bearing along the local terrain horizon.":
   "Live satellite position propagated from current orbital elements. Visual position is approximate rather than precision tracking."
 );
 const details=document.querySelector("#inspector-details");details.replaceChildren();
 let rows=[];
 if(o.kind==="AIRCRAFT"){const meaning=aircraftSpecialMeaning(o);rows=[["Callsign",o.callsign||o.name||"—"],["Operator",aircraftOperator(o)],["Squawk",o.squawk||"—"],["Meaning",meaning||"Standard ATC assignment / no special operation identified"],["Departure","Looking up…"],["Arrival","Looking up…"],["Military",aircraftIsMilitary(o)?"Yes":"No"],["Type",o.type],["Registration",o.registration],["ICAO hex",o.hex||"—"],["Altitude",Math.round(o.altM)+" m"],["Ground speed",Math.round(o.gs)+" kt"],["Track",Math.round(o.track)+"°"],["Ground distance",o.distanceKm.toFixed(1)+" km"],["Slant range",o.slantRangeKm.toFixed(1)+" km"],["Azimuth",o.az.toFixed(1)+"°"],["Elevation",o.el.toFixed(1)+"°"]]}
 else if(o.kind==="AIRPORT")rows=[["IATA",o.iata||"—"],["ICAO",o.icao||"—"],["Type",String(o.type).replaceAll("_"," ")],["Distance",o.distanceKm.toFixed(1)+" km"],["Bearing",o.az.toFixed(1)+"°"]];
 else if(o.kind==="SATELLITE")rows=[
  ["What is it?","Looking up…"],
  ["Owner / operator","Looking up…"],
  ["Country","Looking up…"],
  ["Status","Looking up…"],
  ["Launch date","Looking up…"],
  ["Launch site","Looking up…"],
  ["Expected life","Looking up…"],
  ["Cost","Looking up…"],
  ["NORAD",o.norad||"—"],
  ["International ID",o.objectId||"—"],
  ["Category",o.groupLabel||"Satellite"],
  ["New launch",o.isNew?"Yes · ≤30 days":"No"],
  ["Debris",o.isDebris?"Yes":"No"],
  ["Orbital period","Looking up…"],
  ["Apogee","Looking up…"],
  ["Perigee","Looking up…"],
  ["Inclination","Looking up…"],
  ["Radar cross-section","Looking up…"],
  ["Current range",Math.round(o.rangeKm)+" km"],
  ["Current azimuth",o.az.toFixed(1)+"°"],
  ["Current elevation",o.el.toFixed(1)+"°"],
  ["Position source",o.detail]
 ];
 else if(o.kind==="PLANET")rows=[["Type",o.detail],["Azimuth",o.az.toFixed(1)+"°"],["Apparent elevation",o.el.toFixed(1)+"°"],["Geometric elevation",Number.isFinite(o.geometricEl)?o.geometricEl.toFixed(1)+"°":o.el.toFixed(1)+"°"],["Refraction",Number.isFinite(o.refractionDeg)?o.refractionDeg.toFixed(2)+"°":"0.00°"],["Right ascension",o.ra.toFixed(2)+"°"],["Declination",o.dec.toFixed(2)+"°"],["Position","Live for your location and current time"]];
 else rows=[["Classification",o.detail||"Star"],["Distance",o.distance||"—"],["Catalogue magnitude",Number.isFinite(o.mag)?o.mag.toFixed(2):"—"],["Apparent magnitude",Number.isFinite(o.apparentMag)?o.apparentMag.toFixed(2):(Number.isFinite(o.mag)?o.mag.toFixed(2):"—")],["Atmospheric extinction",Number.isFinite(o.extinctionMag)?o.extinctionMag.toFixed(2)+" mag":"0.00 mag"],["Temperature",o.temperatureK?Math.round(o.temperatureK)+" K":"—"],["Azimuth",o.az.toFixed(1)+"°"],["Apparent elevation",o.el.toFixed(1)+"°"],["Geometric elevation",Number.isFinite(o.geometricEl)?o.geometricEl.toFixed(1)+"°":o.el.toFixed(1)+"°"],["Refraction",Number.isFinite(o.refractionDeg)?o.refractionDeg.toFixed(2)+"°":"0.00°"],["Right ascension",Number.isFinite(o.ra)?o.ra.toFixed(2)+"°":"—"],["Declination",Number.isFinite(o.dec)?o.dec.toFixed(2)+"°":"—"]];
 for(const [k,v] of rows){const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=k;dd.textContent=v;dt.dataset.key=k;dd.dataset.key=k;details.append(dt,dd)}
 inspector.hidden=false;
 if(o.kind==="AIRCRAFT")updateAircraftRoute(o);
 if(o.kind==="SATELLITE")updateSatelliteInfo(o);
}
function clearSelection(){selected=null;inspector.hidden=true}

canvas.addEventListener("pointerdown",e=>{canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,yaw,pitch,moved:false}});
canvas.addEventListener("pointermove",e=>{
 if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>3)drag.moved=true;
 yaw=norm360(drag.yaw-dx/width*fov);
 pitch=clamp(drag.pitch+dy/height*fov*.62,minPitch,89);
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
canvas.addEventListener("keydown",e=>{
 if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key))return;
 e.preventDefault();
 const step=Math.max(1.5,fov*.035);
 if(e.key==="ArrowLeft")yaw=norm360(yaw-step);
 if(e.key==="ArrowRight")yaw=norm360(yaw+step);
 if(e.key==="ArrowUp")pitch=clamp(pitch+step,minPitch,89);
 if(e.key==="ArrowDown")pitch=clamp(pitch-step,minPitch,89);
});

document.querySelectorAll("[data-layer]").forEach(btn=>{
 const key=btn.dataset.layer;
 syncLayerButton(btn,key);
 btn.addEventListener("click",()=>{
  if(MULTISTATE_LAYERS.has(key)){
   layerPhases[key]=advancePhase(layerPhases[key]);
   layers[key]=phaseEnabled(layerPhases[key]);
  }else layers[key]=!layers[key];
  syncLayerButton(btn,key);
  if(key==="aircraft"&&layers[key])refreshAircraft(true);
  if(key==="satellites"&&layers[key])refreshSatellites(true);
  if(key==="airports"&&layers[key])refreshAirports();
  setLiveStatus();
 });
});

document.querySelectorAll("[data-satellite-group]").forEach(btn=>{
 const key=btn.dataset.satelliteGroup,group=SATELLITE_GROUPS[key];if(!group)return;
 syncGroupButton(btn,group);
 btn.addEventListener("click",async()=>{
  group.phase=advancePhase(group.phase);
  group.enabled=phaseEnabled(group.phase);
  group.labels=phaseLabels(group.phase);
  syncGroupButton(btn,group);
  await refreshSatellites(true);
 });
});
document.querySelectorAll("[data-aircraft-group]").forEach(btn=>{
 const key=btn.dataset.aircraftGroup,group=AIRCRAFT_GROUPS[key];if(!group)return;
 syncGroupButton(btn,group);
 btn.addEventListener("click",()=>{
  group.phase=advancePhase(group.phase);
  group.enabled=phaseEnabled(group.phase);
  group.labels=phaseLabels(group.phase);
  syncGroupButton(btn,group);
 });
});
const GROUP_PANELS=[
 ["astronomy-groups","astronomy-groups-button","astronomy-groups-close"],
 ["aircraft-groups","aircraft-groups-button","aircraft-groups-close"],
 ["satellite-groups","satellite-groups-button","satellite-groups-close"],
 ["display-groups","display-groups-button","display-groups-close"]
].map(([panelId,buttonId,closeId])=>({
 panel:document.querySelector("#"+panelId),
 button:document.querySelector("#"+buttonId),
 close:document.querySelector("#"+closeId)
}));
function closeControlPanels(except=null){
 for(const entry of GROUP_PANELS){
  if(entry===except)continue;
  if(entry.panel)entry.panel.hidden=true;
  entry.button?.setAttribute("aria-expanded","false");
 }
}
for(const entry of GROUP_PANELS){
 entry.button?.addEventListener("click",()=>{
  const opening=entry.panel?.hidden!==false;
  closeControlPanels(entry);
  if(entry.panel)entry.panel.hidden=!opening;
  entry.button.setAttribute("aria-expanded",String(opening));
 });
 entry.close?.addEventListener("click",()=>{
  if(entry.panel)entry.panel.hidden=true;
  entry.button?.setAttribute("aria-expanded","false");
 });
}

function renderSearch(){
 const q=searchInput.value.trim().toLowerCase();if(!q){searchResults.hidden=true;searchResults.replaceChildren();return}
 const matches=allSelectableObjects().filter(o=>o.name.toLowerCase().includes(q)).slice(0,8);
 searchResults.replaceChildren(...matches.map(o=>{
  const b=document.createElement("button");b.type="button";
  const n=document.createElement("span");n.textContent=o.name;const k=document.createElement("small");k.textContent=o.kind;b.append(n,k);
  b.addEventListener("click",()=>{yaw=o.az;pitch=clamp(o.el,minPitch,89);showObject(o);searchInput.value="";searchResults.hidden=true;});return b;
 }));
 searchResults.hidden=!matches.length;
}
searchInput.addEventListener("input",renderSearch);
searchInput.addEventListener("keydown",e=>{if(e.key==="Escape"){searchInput.value="";searchResults.hidden=true}});

function tick(now){
 const dt=Math.min(100,Math.max(0,now-lastFrame));lastFrame=now;
 simTime=Date.now();
 clock.textContent=new Date(simTime).toLocaleString([], {year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"});
 stepAircraft(now);stepSatellites(now);draw();requestAnimationFrame(tick);
}
aircraftTimer=setInterval(()=>refreshAircraft(false),3000);
satelliteTimer=setInterval(()=>refreshSatellites(false),10000);
window.addEventListener("beforeunload",()=>{if(geoWatch!==null)navigator.geolocation.clearWatch(geoWatch);clearInterval(aircraftTimer);clearInterval(satelliteTimer)});
loadBrightStars();setLiveStatus();requestLocation();requestAnimationFrame(tick);
})();