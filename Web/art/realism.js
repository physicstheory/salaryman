/* Licensed photographed architectural detail. Shared maps; capped GPU resolution by tier. */
(function(){
'use strict';
const T=THREE,loads=new Map(),state={loaded:[],failed:[]};
function tier(){return typeof gfx==='undefined'?'high':gfx.tier;}
function size(){return tier()==='low'?512:tier()==='ultra'?2048:1024;}
function image(name){if(!loads.has(name))loads.set(name,new Promise(resolve=>{const im=new Image();im.onload=()=>{state.loaded.push(name);resolve(im);};im.onerror=()=>{state.failed.push(name);resolve(null);};im.src='art/realism/'+name+(tier()==='low'?'-low':'')+'.jpg';}));return loads.get(name);}
function canvasMap(im,spec,srgb,base){const n=size(),c=document.createElement('canvas');c.width=c.height=n;const g=c.getContext('2d');
  const nx=Math.max(1,Math.round(spec.cell[0]/4)),ny=Math.max(1,Math.round(spec.cell[1]/4));
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)g.drawImage(im,x*n/nx,y*n/ny,n/nx+1,n/ny+1);
  if(base){g.globalCompositeOperation='multiply';g.globalAlpha=.90;g.drawImage(base,0,0,n,n);}
  const t=new T.CanvasTexture(c);t.encoding=srgb?T.sRGBEncoding:T.LinearEncoding;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=tier()==='low'?2:4;return t;
}
function facade(side,style,spec){const kind={shop:'brick',houses:'plaster',shed:'metal',deck:'concrete',coast:'plaster',kura:'plaster'}[style];if(!kind)return;
  const base=side.map?.image;
  image(kind+'-color').then(im=>{if(!im)return;side.map=canvasMap(im,spec,true,base);side.userData.salaryPhotographic=kind;side.needsUpdate=true;});
  if(side.isMeshStandardMaterial){image(kind+'-normal').then(im=>{if(!im)return;side.normalMap=canvasMap(im,spec,false);side.normalScale=new T.Vector2(.3,.3);side.needsUpdate=true;});image(kind+'-roughness').then(im=>{if(!im)return;side.roughnessMap=canvasMap(im,spec,false);side.roughness=1;side.needsUpdate=true;});}
}
function cap(t){const im=t.image,n=size();if(im&&Math.max(im.width,im.height)>n){const c=document.createElement('canvas'),k=n/Math.max(im.width,im.height);c.width=Math.max(1,Math.round(im.width*k));c.height=Math.max(1,Math.round(im.height*k));c.getContext('2d').drawImage(im,0,0,c.width,c.height);t.image=c;t.needsUpdate=true;}return t;}
const personImages=new WeakMap();
function person(root){const n=tier()==='low'?512:tier()==='medium'?1024:2048;
 root.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m)continue;
  for(const key of ['map','normalMap','roughnessMap','metalnessMap','alphaMap','emissiveMap']){const t=m[key],im=t?.image;if(!im||Math.max(im.width,im.height)<=n)continue;let c=personImages.get(im);if(!c){c=document.createElement('canvas');const k=n/Math.max(im.width,im.height);c.width=Math.max(1,Math.round(im.width*k));c.height=Math.max(1,Math.round(im.height*k));c.getContext('2d').drawImage(im,0,0,c.width,c.height);personImages.set(im,c);}t.image=c;t.needsUpdate=true;}
  if(typeof gfx!=='undefined'&&gfx.env&&m.isMeshStandardMaterial){m.envMap=gfx.env;m.envMapIntensity=.25;}m.needsUpdate=true;
 }});root.userData.salaryRealistic=true;
}
window.SalaryRealism={facade,cap,state,person};
})();
