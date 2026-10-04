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
let width=1,height=1,dpr=1,yaw=180,pitch=30,minPitch=0,fov=92,drag=null,selected=null;
let simTime=Date.now(),lastFrame=performance.now();
let observer=null,geoWatch=null,aircraftTimer=null,satelliteTimer=null;
let aircraft=[],satellites=[],satelliteElements=[],airports=[],brightStars=[];
let aircraftUpdated=0,satellitesUpdated=0,lastSatelliteStep=0;
const satelliteGroupCache=new Map();
let terrainProfile=null,terrainObserverElevation=0,terrainLoadToken=0;
const terrainTileCache=new Map();
const layers={stars:true,constellations:true,planets:true,atmosphere:true,landscape:true,airports:true,aircraft:true,satellites:true};
const SATELLITE_GROUPS={
 new:{label:"New launches · ≤30 days",sources:["last-30-days"],enabled:true,color:"#68ff9a",glyph:"✦",priority:100,limit:900},
 stations:{label:"Space stations",sources:["stations"],enabled:true,color:"#ffffff",glyph:"▣",priority:90,limit:120},
 bright:{label:"Bright / visual",sources:["visual"],enabled:true,color:"#ffe082",glyph:"◆",priority:70,limit:250},
 starlink:{label:"Starlink",sources:["starlink"],enabled:false,color:"#64b5f6",glyph:"●",priority:60,limit:1800},
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
async function loadBrightStars(){
 try{
  const res=await fetch("./data/bright-stars.json?v=1",{cache:"force-cache"});
  if(!res.ok)throw new Error("stars "+res.status);
  const data=await res.json();
  brightStars=(Array.isArray(data.stars)?data.stars:[]).map(s=>({
   id:s.id,kind:"STAR",name:s.name,ra:Number(s.ra),dec:Number(s.dec),mag:Number(s.mag),
   color:starColor(s.temp),distance:"—",detail:s.designation||"Bright star",
   fact:"A real star from the Yale Bright Star Catalog."
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
  return{id:"planet:"+id,kind:"PLANET",name:info.name,ra:p.ra,dec:p.dec,az:altaz.az,el:altaz.el,
   color:info.color,symbol:info.symbol,detail:info.detail,fact:info.fact};
 }).filter(Boolean);
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
 return width<=900?70:72;
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
   const z=9,azStep=5,distances=[.5,1,2,4,8,16,32,48];
   const obsElev=await terrainElevationAt(observer.lat,observer.lon,z);
   const bearings=Array.from({length:Math.ceil(360/azStep)},(_,i)=>i*azStep);
   const profile=await Promise.all(bearings.map(async az=>{
     let best=0;
     for(const distanceKm of distances){
       const p=destinationPoint(observer.lat,observer.lon,az,distanceKm);
       const elev=await terrainElevationAt(p.lat,p.lon,z);
       const curvature=(distanceKm*distanceKm)/(2*EARTH_KM)*1000;
       const angle=Math.atan2(elev-obsElev-curvature,distanceKm*1000)*RAD;
       if(Number.isFinite(angle))best=Math.max(best,angle);
     }
     return{az,el:clamp(best,0,18)};
   }));
   if(token!==terrainLoadToken)return;
   terrainObserverElevation=obsElev;
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
async function refreshAircraft(force=false){
 if(!observer||!layers.aircraft)return;
 if(!force&&Date.now()-aircraftUpdated<2500)return;
 aircraftUpdated=Date.now();
 try{
   const url=`https://api.adsb.lol/v2/lat/${observer.lat.toFixed(4)}/lon/${observer.lon.toFixed(4)}/dist/${AIRCRAFT_RADIUS_NM}`;
   const res=await fetch(url,{mode:"cors",cache:"no-store",credentials:"omit"});
   if(!res.ok)throw new Error("aircraft "+res.status);
   const data=await res.json(),now=performance.now();
   const old=new Map(aircraft.map(a=>[a.id,a]));
   aircraft=(Array.isArray(data.ac)?data.ac:[]).filter(a=>Number.isFinite(a.lat)&&Number.isFinite(a.lon)&&greatCircle(observer.lat,observer.lon,a.lat,a.lon).distanceKm<=AIRCRAFT_RADIUS_KM).slice(0,450).map(a=>{
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

async function refreshAirports(){
 if(!observer||!layers.airports)return;
 try{
   const qs=new URLSearchParams({lat:String(observer.lat),lon:String(observer.lon),radius_km:String(AIRPORT_RADIUS_KM),limit:"14"});
   const res=await fetch(API_BASE+"/api/v1/airports?"+qs,{mode:"cors",cache:"no-store",credentials:"omit"});
   if(!res.ok)throw new Error("airports "+res.status);
   const data=await res.json();
   airports=(Array.isArray(data.airports)?data.airports:[]).filter(a=>Number(a.distance_km)<=AIRPORT_RADIUS_KM).map(a=>({
     id:"airport:"+(a.icao||a.iata||a.name),kind:"AIRPORT",name:a.name||a.icao||"Airport",
     iata:a.iata||"",icao:a.icao||"",distanceKm:Number(a.distance_km)||0,
     az:Number(a.bearing_deg)||0,type:a.type||"airport",lat:Number(a.latitude),lon:Number(a.longitude)
   }));
 }catch(e){airports=[];console.warn("ALEN airport feed unavailable",e)}
}
function airportDisplayObject(a){
 return{...a,el:terrainHorizonElevation(a.az)+.75};
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
async function refreshSatellites(force=false){
 if(!observer||!layers.satellites)return;
 if(!force&&Date.now()-satellitesUpdated<8000)return;
 satellitesUpdated=Date.now();
 try{
  const sources=[...new Set(activeSatelliteGroups().flatMap(([,group])=>group.sources))];
  if(!sources.length){satellites=[];setLiveStatus();return}
  const qs=new URLSearchParams({
   lat:String(observer.lat),lon:String(observer.lon),altitude_m:String(observer.altM||0),
   groups:sources.join(","),limit:"320"
  });
  const res=await fetch(API_BASE+"/api/v1/satellites?"+qs,{mode:"cors",cache:"no-store",credentials:"omit"});
  if(!res.ok)throw new Error("satellites "+res.status);
  const data=await res.json();
  satellites=(Array.isArray(data.satellites)?data.satellites:[]).map(s=>{
   const memberships=logicalSatelliteMemberships(s.groups),group=satellitePrimaryGroup(memberships),style=SATELLITE_GROUPS[group]||SATELLITE_GROUPS.bright;
   return{id:"sat:"+s.norad,kind:"SATELLITE",name:s.name||("NORAD "+s.norad),az:Number(s.azimuth_deg),el:Number(s.elevation_deg),
    rangeKm:Number(s.range_km),detail:"SGP4 · CelesTrak orbital elements",group,groupLabel:style.label,color:style.color,glyph:style.glyph,
    norad:String(s.norad||"—"),objectId:s.international_id||"—",memberships,isNew:memberships.includes("new"),isDebris:memberships.includes("debris")};
  }).filter(s=>Number.isFinite(s.az)&&Number.isFinite(s.el)&&s.el>=0);
 }catch(e){satellites=[];console.warn("ALEN satellite feed unavailable",e)}
 setLiveStatus();
}
function stepSatellites(_ms){}

function currentSkyObjects(ms){
 if(!observer)return[];
 const catalogue=brightStars.length?brightStars:SKY_OBJECTS;
 return catalogue.map(o=>{
   const p=raDecToAltAz(o.ra,o.dec,ms);
   return p?{...o,az:p.az,el:p.el}:null;
 }).filter(Boolean);
}
function screenYForElevation(el){
 const vfov=fov*height/Math.max(width,1);
 return height*.55-(el-pitch)/vfov*height*.82;
}
function drawLandscapeLayer(fill){
 ctx.beginPath();
 let first=true;
 const step=5;
 for(let x=-step;x<=width+step;x+=step){
   const az=norm360(yaw+(x-width*.5)/width*fov);
   const el=terrainHorizonElevation(az);
   const y=screenYForElevation(el);
   if(first){ctx.moveTo(x,y);first=false}else ctx.lineTo(x,y);
 }
 ctx.lineTo(width+step,height+2);ctx.lineTo(-step,height+2);ctx.closePath();
 ctx.fillStyle=fill;ctx.fill();
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
 const horizonY=screenYForElevation(0);
 if(layers.landscape&&horizonY<height+180)drawLandscapeLayer("rgba(2,5,7,.98)");
}
function isAboveLandscape(az,el){
 return !layers.landscape||el>terrainHorizonElevation(az);
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
   if(o.el<0||!isAboveLandscape(o.az,o.el))continue;const p=project(o.az,o.el);if(!p)continue;
   const r=Math.max(1.2,3.8-o.mag*.42)*(90/fov),isSelected=selected?.id===o.id;
   if(isSelected){ctx.strokeStyle="#7be5ff";ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(p[0],p[1],r+8,0,Math.PI*2);ctx.stroke()}
   ctx.globalAlpha=Math.max(.35,1-o.mag*.11);ctx.shadowBlur=10;ctx.shadowColor=o.color;ctx.fillStyle=o.color;
   ctx.beginPath();ctx.arc(p[0],p[1],r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1;
   if(o.mag<.5||isSelected){ctx.fillStyle=isSelected?"#dff9ff":"rgba(226,241,250,.76)";ctx.font="11px ui-monospace,monospace";ctx.fillText(o.name,p[0]+r+6,p[1]-r-2)}
  }
 }
 if(layers.planets){
  for(const o of currentPlanetObjects(simTime)){
   if(o.el<0||!isAboveLandscape(o.az,o.el))continue;const p=project(o.az,o.el);if(!p)continue;const active=selected?.id===o.id;
   const size=o.name==="Sun"?25:o.name==="Moon"?22:15;
   ctx.fillStyle=o.color;ctx.font=`${active?"700 ":""}${size}px system-ui`;ctx.textAlign="center";ctx.textBaseline="middle";
   ctx.fillText(o.symbol,p[0],p[1]);ctx.textAlign="left";ctx.textBaseline="alphabetic";
   if(active){ctx.strokeStyle=o.color;ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(p[0],p[1],size*.72,0,Math.PI*2);ctx.stroke()}
   ctx.fillStyle="rgba(238,248,255,.88)";ctx.font="10px ui-monospace";ctx.fillText(o.name,p[0]+size*.55,p[1]-size*.45);
  }
 }
 if(layers.aircraft){
  for(const a of aircraft){
   const q=airborneAltAz(a.displayLat,a.displayLon,a.altM);if(!q||q.el<0||!isAboveLandscape(q.az,q.el))continue;const p=project(q.az,q.el);if(!p)continue;
   const depthScale=clamp(1.28-q.slantRangeKm/110,.72,1.22),iconSize=Math.round(17*depthScale);
   ctx.save();ctx.translate(p[0],p[1]);ctx.rotate(adiff(a.track,q.az)*DEG);ctx.fillStyle="#9fd9ff";ctx.font=iconSize+"px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("✈",0,0);ctx.restore();
   ctx.globalAlpha=clamp(1.08-q.slantRangeKm/180,.62,1);ctx.fillStyle="rgba(180,225,255,.85)";ctx.font="9px ui-monospace";ctx.fillText(a.name,p[0]+iconSize*.65,p[1]-iconSize*.45);ctx.globalAlpha=1;
  }
 }
 if(layers.satellites){
  for(const s of satellites){
   if(!isAboveLandscape(s.az,s.el))continue;const p=project(s.az,s.el);if(!p)continue;
   const active=selected?.id===s.id,satScale=clamp(1.3-Math.log10(Math.max(100,s.rangeKm))/4,.72,1.15);
   const satSize=Math.round((active?15:12)*satScale);
   ctx.fillStyle=s.color;ctx.strokeStyle=s.color;ctx.globalAlpha=clamp(1.12-Math.log10(Math.max(100,s.rangeKm))/8,.68,1);ctx.font="700 "+satSize+"px ui-monospace";
   ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(s.glyph||"◇",p[0],p[1]);ctx.textAlign="left";ctx.textBaseline="alphabetic";ctx.globalAlpha=1;
   if(active){ctx.beginPath();ctx.arc(p[0],p[1],9,0,Math.PI*2);ctx.lineWidth=1;ctx.stroke()}
   if(s.el>28||active){ctx.globalAlpha=.9;ctx.font="9px ui-monospace";ctx.fillText(s.name,p[0]+8,p[1]-6);ctx.globalAlpha=1}
  }
 }

 drawLandscapeForeground();

 if(layers.airports){
  for(const raw of airports){
   const a=airportDisplayObject(raw),p=project(a.az,a.el);if(!p)continue;
   const active=selected?.id===a.id;
   ctx.strokeStyle=active?"#dff9ff":"rgba(123,229,255,.78)";ctx.fillStyle=active?"#dff9ff":"rgba(123,229,255,.78)";
   ctx.lineWidth=active?1.5:1;
   ctx.beginPath();ctx.moveTo(p[0],p[1]-8);ctx.lineTo(p[0]-5,p[1]+1);ctx.lineTo(p[0]+5,p[1]+1);ctx.closePath();ctx.stroke();
   ctx.beginPath();ctx.moveTo(p[0],p[1]+1);ctx.lineTo(p[0],p[1]+8);ctx.stroke();
   ctx.font="9px ui-monospace,monospace";ctx.fillText(a.iata||a.icao,p[0]+8,p[1]-6);
  }
 }

 if(!observer){
   ctx.fillStyle="rgba(232,246,255,.85)";ctx.font="600 16px system-ui";ctx.textAlign="center";
   ctx.fillText("Allow current location to initialise your live sky",width/2,height*.54);
   ctx.textAlign="left";
 }
}

function allSelectableObjects(){
 const stars=currentSkyObjects(simTime).filter(o=>o.el>=0&&isAboveLandscape(o.az,o.el));
 const ac=aircraft.map(a=>{const p=airborneAltAz(a.displayLat,a.displayLon,a.altM);return p?{...a,az:p.az,el:p.el}:null}).filter(o=>o&&isAboveLandscape(o.az,o.el));
 const aps=layers.airports?airports.map(airportDisplayObject):[];
 const planets=currentPlanetObjects(simTime).filter(o=>o.el>=0&&isAboveLandscape(o.az,o.el));
 const visibleSatellites=satellites.filter(o=>isAboveLandscape(o.az,o.el));
 return [...stars,...planets,...aps,...ac,...visibleSatellites];
}
function nearestObject(x,y){
 let best=null,bestD=Infinity;
 for(const o of allSelectableObjects()){const p=project(o.az,o.el);if(!p)continue;const d=Math.hypot(x-p[0],y-p[1]);if(d<22&&d<bestD){best=o;bestD=d}}
 return best;
}
function escapeSvgText(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[ch]))}
function objectVisualSvg(o){
 const title=escapeSvgText(o.name||o.kind),kind=escapeSvgText(o.kind||"OBJECT");
 let symbol="✦",sub="";
 if(o.kind==="AIRCRAFT"){symbol="✈";sub=escapeSvgText(o.registration||o.type||"Live aircraft")}
 else if(o.kind==="SATELLITE"){symbol=escapeSvgText(o.glyph||"◈");sub=escapeSvgText((o.groupLabel||"Orbital object")+(o.isNew?" · NEW":"")+(o.isDebris?" · DEBRIS":""))}
 else if(o.kind==="AIRPORT"){symbol="△";sub=escapeSvgText((o.iata||o.icao||"Airport")+" · "+Math.round(o.distanceKm)+" km")}
 else if(o.kind==="PLANET"){symbol=escapeSvgText(o.symbol||"●");sub=escapeSvgText(o.detail||"Solar System object")}
 else{sub=escapeSvgText(o.detail||"Astronomical object")}
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="360" viewBox="0 0 720 360"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#071522"/><stop offset="1" stop-color="#010308"/></linearGradient><radialGradient id="r"><stop offset="0" stop-color="#123044"/><stop offset="1" stop-color="#010308"/></radialGradient></defs><rect width="720" height="360" fill="url(#g)"/><circle cx="360" cy="170" r="112" fill="url(#r)" stroke="#1d526a"/><text x="360" y="205" text-anchor="middle" font-family="system-ui,sans-serif" font-size="96" fill="#9feaff">${symbol}</text><text x="28" y="302" font-family="system-ui,sans-serif" font-size="25" font-weight="700" fill="#eef8ff">${title}</text><text x="28" y="331" font-family="system-ui,sans-serif" font-size="15" fill="#88a4b5">${kind} · ${sub}</text></svg>`;
 return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);
}
function updateInspectorMedia(o){
 const image=document.querySelector("#inspector-image");
 const credit=document.querySelector("#inspector-image-credit");
 image.src=objectVisualSvg(o);image.alt=(o.name||o.kind)+" visual";
 credit.textContent=o.kind==="AIRPORT"?"Airport horizon reference · ALEN":o.kind==="AIRCRAFT"?"Live aircraft visual · ALEN":o.kind==="SATELLITE"?"Satellite visual · ALEN":"Sky object visual · ALEN";
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
 if(o.kind==="AIRCRAFT")rows=[["Type",o.type],["Registration",o.registration],["Altitude",Math.round(o.altM)+" m"],["Ground speed",Math.round(o.gs)+" kt"],["Track",Math.round(o.track)+"°"],["Ground distance",o.distanceKm.toFixed(1)+" km"],["Slant range",o.slantRangeKm.toFixed(1)+" km"],["Azimuth",o.az.toFixed(1)+"°"],["Elevation",o.el.toFixed(1)+"°"]];
 else if(o.kind==="AIRPORT")rows=[["IATA",o.iata||"—"],["ICAO",o.icao||"—"],["Type",String(o.type).replaceAll("_"," ")],["Distance",o.distanceKm.toFixed(1)+" km"],["Bearing",o.az.toFixed(1)+"°"]];
 else if(o.kind==="SATELLITE")rows=[["Category",o.groupLabel||"Satellite"],["NORAD",o.norad||"—"],["International ID",o.objectId||"—"],["New launch",o.isNew?"Yes · ≤30 days":"No"],["Debris",o.isDebris?"Yes":"No"],["Range",Math.round(o.rangeKm)+" km"],["Azimuth",o.az.toFixed(1)+"°"],["Elevation",o.el.toFixed(1)+"°"],["Source",o.detail]];
 else if(o.kind==="PLANET")rows=[["Type",o.detail],["Azimuth",o.az.toFixed(1)+"°"],["Elevation",o.el.toFixed(1)+"°"],["Right ascension",o.ra.toFixed(2)+"°"],["Declination",o.dec.toFixed(2)+"°"]];
 else rows=[["Type",o.detail],["Distance",o.distance],["Azimuth",o.az.toFixed(1)+"°"],["Elevation",o.el.toFixed(1)+"°"],["Magnitude",String(o.mag)]];
 for(const [k,v] of rows){const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=k;dd.textContent=v;details.append(dt,dd)}
 inspector.hidden=false;
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

document.querySelectorAll("[data-layer]").forEach(btn=>btn.addEventListener("click",()=>{
 const key=btn.dataset.layer;layers[key]=!layers[key];btn.setAttribute("aria-pressed",String(layers[key]));
 if(key==="aircraft"&&layers[key])refreshAircraft(true);
 if(key==="satellites"&&layers[key])refreshSatellites(true);
 if(key==="airports"&&layers[key])refreshAirports();
 setLiveStatus();
}));

document.querySelectorAll("[data-satellite-group]").forEach(input=>input.addEventListener("change",async()=>{
 const key=input.dataset.satelliteGroup,group=SATELLITE_GROUPS[key];if(!group)return;
 group.enabled=input.checked;
 input.closest("label")?.classList.toggle("is-on",group.enabled);
 if(layers.satellites)await refreshSatellites(true);else satellites=[];
}));
const satellitePanel=document.querySelector("#satellite-groups");
const satelliteGroupsButton=document.querySelector("#satellite-groups-button");
satelliteGroupsButton?.addEventListener("click",()=>{
 const opening=satellitePanel.hidden;satellitePanel.hidden=!opening;satelliteGroupsButton.setAttribute("aria-expanded",String(opening));
});
document.querySelector("#satellite-groups-close")?.addEventListener("click",()=>{satellitePanel.hidden=true;satelliteGroupsButton?.setAttribute("aria-expanded","false")});

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
 stepAircraft(now);stepSatellites(simTime);draw();requestAnimationFrame(tick);
}
aircraftTimer=setInterval(()=>refreshAircraft(false),3000);
satelliteTimer=setInterval(()=>refreshSatellites(false),10000);
window.addEventListener("beforeunload",()=>{if(geoWatch!==null)navigator.geolocation.clearWatch(geoWatch);clearInterval(aircraftTimer);clearInterval(satelliteTimer)});
loadBrightStars();setLiveStatus();requestLocation();requestAnimationFrame(tick);
})();