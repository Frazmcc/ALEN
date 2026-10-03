(()=>{
"use strict";
const root=document.querySelector(".sky-shell");
if(root.dataset.ready)return;
root.dataset.ready="true";

const canvas=document.querySelector("#sky");
const ctx=canvas.getContext("2d",{alpha:false});
const inspector=document.querySelector("#inspector");
const searchInput=document.querySelector("#sky-search");
const searchResults=document.querySelector("#search-results");
const clock=document.querySelector("#clock");
const rateEl=document.querySelector("#time-rate");
const playBtn=document.querySelector("#time-play");

let width=1,height=1,dpr=1,yaw=0,pitch=18,fov=92,drag=null,selected=null;
let simTime=Date.now(),timeRate=1,running=true,lastFrame=performance.now();
const layers={stars:true,constellations:true,planets:true,atmosphere:true,aircraft:false,satellites:false};

const objects=[
{id:"vega",kind:"STAR",name:"Vega",az:47,el:63,mag:.03,color:"#dcecff",distance:"25.0 ly",detail:"A0 V",fact:"Vega is a rapidly rotating A-type star and one of the brightest stars in the northern sky."},
{id:"deneb",kind:"STAR",name:"Deneb",az:29,el:49,mag:1.25,color:"#d9e8ff",distance:"~2,600 ly",detail:"A2 Ia",fact:"Deneb is an extremely luminous blue-white supergiant and forms one corner of the Summer Triangle."},
{id:"altair",kind:"STAR",name:"Altair",az:92,el:39,mag:.77,color:"#f3f5ff",distance:"16.7 ly",detail:"A7 V",fact:"Altair spins so quickly that it is noticeably flattened at its poles."},
{id:"arcturus",kind:"STAR",name:"Arcturus",az:272,el:31,mag:-.05,color:"#ffd6a0",distance:"36.7 ly",detail:"K1.5 III",fact:"Arcturus is an orange giant and one of the brightest stars visible from Earth."},
{id:"saturn",kind:"PLANET",name:"Saturn",az:138,el:28,mag:.6,color:"#f3d18b",distance:"1.3 billion km",detail:"Gas giant",fact:"Saturn's rings are made mostly of water ice, with particles ranging from dust grains to house-sized chunks."},
{id:"jupiter",kind:"PLANET",name:"Jupiter",az:203,el:44,mag:-2.1,color:"#f1d6ae",distance:"780 million km",detail:"Gas giant",fact:"Jupiter is the largest planet in the Solar System and hosts the long-lived Great Red Spot storm."},
{id:"mars",kind:"PLANET",name:"Mars",az:318,el:24,mag:1.1,color:"#ff8a63",distance:"225 million km",detail:"Terrestrial",fact:"Mars has the largest known volcano in the Solar System, Olympus Mons."},
{id:"moon",kind:"MOON",name:"Moon",az:165,el:57,mag:-11.8,color:"#f3f0dc",distance:"384,400 km",detail:"Natural satellite",fact:"The Moon is tidally locked, so nearly the same hemisphere always faces Earth."}
];

const constellationLines=[[[47,63],[29,49],[92,39]],[[272,31],[318,24]]];
const stars=Array.from({length:460},(_,i)=>{
  const a=(i*9301+49297)%233280,b=(i*233+991)%1009,c=(i*89+17)%997,t=c/997;
  return{az:a/233280*360,el:Math.pow(b/1009,.72)*90,mag:.8+t*5.2,color:t<.18?"#ffd2a1":t<.48?"#fff1d0":t<.8?"#f7fbff":"#c8ddff"};
});

function resize(){
 dpr=Math.min(devicePixelRatio||1,2);width=Math.max(1,canvas.clientWidth);height=Math.max(1,canvas.clientHeight);
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
}
new ResizeObserver(resize).observe(canvas);resize();

const adiff=(a,b)=>((a-b+540)%360)-180;
function project(az,el){
 const dx=adiff(az,yaw),dy=el-pitch,vfov=fov*height/Math.max(width,1);
 if(Math.abs(dx)>fov*.62||Math.abs(dy)>vfov*.62)return null;
 return[width*.5+dx/fov*width,height*.55-dy/vfov*height*.82];
}
function draw(){
 const g=ctx.createLinearGradient(0,0,0,height);
 g.addColorStop(0,"#01030a");g.addColorStop(.62,layers.atmosphere?"#07111d":"#02050a");g.addColorStop(1,layers.atmosphere?"#102334":"#02050a");
 ctx.fillStyle=g;ctx.fillRect(0,0,width,height);

 const horizonY=project(yaw,0)?.[1]??height*.82;
 if(layers.atmosphere){
  const glow=ctx.createLinearGradient(0,horizonY-100,0,horizonY+80);
  glow.addColorStop(0,"rgba(60,120,160,0)");glow.addColorStop(.65,"rgba(65,125,165,.11)");glow.addColorStop(1,"rgba(0,0,0,.18)");
  ctx.fillStyle=glow;ctx.fillRect(0,horizonY-100,width,180);
 }
 ctx.strokeStyle="rgba(190,225,240,.18)";ctx.beginPath();ctx.moveTo(0,horizonY);ctx.lineTo(width,horizonY);ctx.stroke();

 if(layers.constellations){
  ctx.strokeStyle="rgba(115,160,190,.26)";ctx.lineWidth=.8;
  for(const chain of constellationLines){
   ctx.beginPath();let started=false;
   for(const [az,el] of chain){const p=project(az,el);if(!p){started=false;continue}if(!started){ctx.moveTo(...p);started=true}else ctx.lineTo(...p)}
   ctx.stroke();
  }
 }
 if(layers.stars){
  for(const s of stars){
   const p=project(s.az,s.el);if(!p)continue;
   const r=Math.max(.35,2.1-s.mag*.27)*(90/fov);
   ctx.globalAlpha=Math.max(.22,1-s.mag*.12);ctx.fillStyle=s.color;ctx.beginPath();ctx.arc(p[0],p[1],r,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
 }
 for(const o of objects){
  if(o.kind==="STAR"&&!layers.stars)continue;
  if((o.kind==="PLANET"||o.kind==="MOON")&&!layers.planets)continue;
  const p=project(o.az,o.el);if(!p)continue;
  const isSelected=selected?.id===o.id;
  const r=(o.kind==="STAR"?Math.max(3,5-o.mag):o.kind==="MOON"?10:7)*(90/fov);
  if(isSelected){ctx.strokeStyle="#7be5ff";ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(p[0],p[1],r+9,0,Math.PI*2);ctx.stroke()}
  ctx.shadowBlur=o.kind==="STAR"?12:18;ctx.shadowColor=o.color;ctx.fillStyle=o.color;ctx.beginPath();ctx.arc(p[0],p[1],r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle=isSelected?"#dff9ff":"rgba(226,241,250,.82)";ctx.font="11px ui-monospace,monospace";ctx.textAlign="left";ctx.fillText(o.name,p[0]+r+7,p[1]-r-2);
 }
 if(layers.aircraft){const p=project((yaw+24)%360,Math.max(8,pitch+8));if(p){ctx.fillStyle="#9fd9ff";ctx.font="18px system-ui";ctx.fillText("✈",p[0],p[1]);ctx.font="10px ui-monospace";ctx.fillText("DEMO123",p[0]+20,p[1]-4)}}
 if(layers.satellites){const p=project((yaw-35+360)%360,Math.min(80,pitch+18));if(p){ctx.strokeStyle="#ffe08b";ctx.strokeRect(p[0]-3,p[1]-3,6,6);ctx.fillStyle="#ffe08b";ctx.font="10px ui-monospace";ctx.fillText("SAT",p[0]+9,p[1]-5)}}
}
function nearestObject(x,y){
 let best=null,bestD=Infinity;
 for(const o of objects){const p=project(o.az,o.el);if(!p)continue;const d=Math.hypot(x-p[0],y-p[1]);if(d<20&&d<bestD){best=o;bestD=d}}
 return best;
}
function showObject(o){
 selected=o;
 document.querySelector("#inspector-kind").textContent=o.kind;
 document.querySelector("#inspector-name").textContent=o.name;
 document.querySelector("#inspector-fact").textContent=o.fact;
 const visual=document.querySelector("#inspector-visual");
 visual.style.background="radial-gradient(circle at 50% 50%,"+o.color+" 0 4px,rgba(123,229,255,.20) 5px 28px,transparent 46%),#010308";
 const details=document.querySelector("#inspector-details");details.replaceChildren();
 for(const [k,v] of [["Type",o.detail],["Distance",o.distance],["Azimuth",o.az.toFixed(1)+"°"],["Elevation",o.el.toFixed(1)+"°"],["Magnitude",String(o.mag)]]){
  const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=k;dd.textContent=v;details.append(dt,dd);
 }
 inspector.hidden=false;
}
function clearSelection(){selected=null;inspector.hidden=true}

canvas.addEventListener("pointerdown",e=>{canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,yaw,pitch,moved:false}});
canvas.addEventListener("pointermove",e=>{
 if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>3)drag.moved=true;
 yaw=(drag.yaw-dx/width*fov+360)%360;pitch=Math.max(-5,Math.min(88,drag.pitch+dy/height*fov*.55));draw();
});
canvas.addEventListener("pointerup",e=>{
 if(!drag)return;const moved=drag.moved;drag=null;try{canvas.releasePointerCapture(e.pointerId)}catch{}
 if(moved)return;const r=canvas.getBoundingClientRect(),o=nearestObject(e.clientX-r.left,e.clientY-r.top);if(!o)return;
 if(selected?.id===o.id)clearSelection();else showObject(o);draw();
});
canvas.addEventListener("wheel",e=>{e.preventDefault();fov=Math.max(18,Math.min(130,fov*(e.deltaY<0?.88:1.12)));draw()},{passive:false});
document.querySelector("#inspector-close").addEventListener("click",()=>{clearSelection();draw()});

document.querySelectorAll("[data-layer]").forEach(btn=>btn.addEventListener("click",()=>{
 const key=btn.dataset.layer;layers[key]=!layers[key];btn.setAttribute("aria-pressed",String(layers[key]));draw();
}));

function renderSearch(){
 const q=searchInput.value.trim().toLowerCase();if(!q){searchResults.hidden=true;searchResults.replaceChildren();return}
 const matches=objects.filter(o=>o.name.toLowerCase().includes(q)).slice(0,6);
 searchResults.replaceChildren(...matches.map(o=>{
  const b=document.createElement("button");b.type="button";
  const n=document.createElement("span");n.textContent=o.name;const k=document.createElement("small");k.textContent=o.kind;b.append(n,k);
  b.addEventListener("click",()=>{yaw=o.az;pitch=o.el;showObject(o);searchInput.value="";searchResults.hidden=true;draw()});return b;
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
 const dt=Math.min(100,now-lastFrame);lastFrame=now;if(running)simTime+=dt*timeRate;
 clock.textContent=new Date(simTime).toLocaleString([], {year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"});
 draw();requestAnimationFrame(tick);
}
updateTimeControls();requestAnimationFrame(tick);
})();