/* Original generated product campaigns and material scans for Salary Man. No network at runtime. */
(function(){
  'use strict';
  const T=THREE,images={},textures=new Map(),materials=new Map(),pending=[];
  const state={loaded:[],failed:[],coated:0};
  function load(name,url){return new Promise(resolve=>{const im=new Image();im.onload=()=>{images[name]=im;state.loaded.push(name);resolve(true);};im.onerror=()=>{state.failed.push(url);resolve(false);};im.src=url;});}
  const ready=Promise.all([load('campaigns','art/product-campaigns.png'),load('surfaces','art/material-surfaces.png')]);
  const slots={soti:0,pear:1,playbox:2,eleven:3};
  const names={soti:'SOTI So26',pear:'Pear P17',playbox:'PLAYBOX 5',eleven:'11 ELEVEN'};
  const tiles={oak:0,metal:1,fabric:2,plaster:3,terrazzo:4,walnut:5};
  function photo(g,key,x,y,w,h){const im=images.campaigns;if(!im||slots[key]===undefined)return false;const n=slots[key],sw=im.width/2,sh=im.height/2;g.drawImage(im,(n%2)*sw,Math.floor(n/2)*sh,sw,sh,x,y,w,h);return true;}
  function surface(kind){if(textures.has(kind))return textures.get(kind);const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');g.fillStyle={oak:'#c3a076',metal:'#999ea0',fabric:'#41464a',plaster:'#e7e4db',terrazzo:'#d9d5c8',walnut:'#94704f'}[kind];g.fillRect(0,0,512,512);
    const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;t._kon={clones:[]};
    const paint=()=>{const im=images.surfaces;if(!im)return;const n=tiles[kind],sw=im.width/3,sh=im.height/2;g.drawImage(im,(n%3)*sw,Math.floor(n/3)*sh,sw,sh,0,0,512,512);t.needsUpdate=true;t._kon.clones.forEach(q=>q.needsUpdate=true);};paint();ready.then(paint);textures.set(kind,t);return t;
  }
  function poster(key,device){const k='poster:'+key+':'+(device?.id||'');if(textures.has(k))return textures.get(k);const c=document.createElement('canvas');c.width=512;c.height=768;const g=c.getContext('2d');const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;t.anisotropy=4;
    const draw=()=>{g.fillStyle=key==='playbox'?'#162338':'#f1eee4';g.fillRect(0,0,512,768);g.textAlign='center';g.fillStyle=key==='playbox'?'#f1eee4':'#18343b';g.font='600 32px sans-serif';g.fillText(names[key],256,82,454);g.font='500 18px sans-serif';g.fillText(key==='eleven'?'Good food. On your way.':'Discover it at Dokoto Camera',256,122,454);photo(g,key,0,164,512,512/1.5);
      g.fillStyle=key==='playbox'?'#f1eee4':'#18343b';g.font='600 26px sans-serif';g.fillText(device?.name||names[key],256,578,450);g.font='500 20px sans-serif';g.fillText(device?device.screen+' / '+device.chip:key==='eleven'?'Fresh bento · Onigiri · Green tea':'Clock out. Play on.',256,623,450);
      if(device){g.font='600 29px sans-serif';g.fillText('¥'+device.price.toLocaleString('en-US'),256,673,450);}g.font='500 17px sans-serif';g.fillText(key==='eleven'?'Your neighbourhood. Open all night.':'Try it in store. Ask our team.',256,724,450);t.needsUpdate=true;};draw();ready.then(draw);textures.set(k,t);return t;
  }
  function interiorPoster(brand,i){if(brand==='dokoto'){const key={0:'pear',1:'soti',3:'playbox'}[i%6];if(key)return poster(key);}if(brand==='eleven'&&[0,2,3].includes(i%6))return poster('eleven');return null;}
  function bindAtlas(cv,ads,w,h,t){const draw=()=>{const g=cv.getContext('2d');ads.forEach((ad,i)=>{const key=ad.art||(i===0?'eleven':null);if(!key)return;g.save();g.beginPath();g.rect(0,i*h,350,h);g.clip();photo(g,key,0,i*h+18,330,220);g.restore();});t.needsUpdate=true;};draw();ready.then(draw);}
  const wood=new Set(['#c8a878','#c2b5a0','#886346','#b79a71','#d8b88a','#9a7a58','#8a6a48','#a97c50','#795943','#8a7a62','#a78b75']);
  const metal=new Set(['#8d939c','#59606a','#4b5058','#aeb6c0','#6d7580','#5b636b']);
  const plaster=new Set(['#f4f4f2','#eef3ef','#f1efe9','#f1ece6','#f6f6f3']);
  function furniture(kind,tint){const lit=typeof gfx!=="undefined"&&gfx.high,key='pbr:'+kind+':'+tint+':'+lit;if(materials.has(key))return materials.get(key);
    const map=surface(kind),opts={map,color:tint||'#fff',fog:false};let m;
    if(lit){m=new T.MeshStandardMaterial({...opts,roughness:kind==='fabric'?.92:kind==='metal'?.38:.74,metalness:kind==='metal'?.65:0,envMap:typeof gfx!=='undefined'?gfx.env:null,envMapIntensity:.35});if(kind==='fabric'||kind==='oak'||kind==='walnut'){m.bumpMap=map;m.bumpScale=kind==='fabric'?.0008:.0015;}}
    else m=new T.MeshLambertMaterial(opts);
    materials.set(key,m);return m;
  }
  function coat(root){root.traverse(m=>{const hex=m.userData?.salaryFinish;if(!m.isMesh)return;const kind=m.userData.salarySurfaceKind||(wood.has(hex)?'oak':metal.has(hex)?'metal':plaster.has(hex)?'plaster':null);if(!kind)return;
    m.material=furniture(kind,kind==='fabric'?(hex||'#91a797'):kind==='metal'?'#b9c3c5':'#e1e0d7');m.receiveShadow=true;m.userData.salarySurface=kind;state.coated++;});}
  const cushionGeometries=new Map();
  function cushion(w,h,d,r){const key=[w,h,d,r].join(':');if(cushionGeometries.has(key))return cushionGeometries.get(key);const g=new T.BoxGeometry(w,h,d,4,2,4),p=g.attributes.position,n=g.attributes.normal;
    for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i),q=v.clone().clamp(new T.Vector3(-w/2+r,-h/2+r,-d/2+r),new T.Vector3(w/2-r,h/2-r,d/2-r)),a=v.clone().sub(q).normalize();v.copy(q).addScaledVector(a,r);p.setXYZ(i,v.x,v.y,v.z);n.setXYZ(i,a.x,a.y,a.z);}p.needsUpdate=n.needsUpdate=true;cushionGeometries.set(key,g);return g;
  }
  function chairCover(root){const fabric=furniture('fabric','#77988d');const seat=new T.Mesh(cushion(.42,.055,.38,.012),fabric);seat.position.set(0,.465,0);seat.userData.salarySurface='fabric';root.add(seat);
    const back=new T.Mesh(cushion(.39,.30,.045,.012),fabric);back.position.set(0,.74,-.17);back.userData.salarySurface='fabric';root.add(back);
    if(!textures.has('contact')){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),r=g.createRadialGradient(64,64,12,64,64,64);r.addColorStop(0,'rgba(12,18,16,.28)');r.addColorStop(1,'rgba(12,18,16,0)');g.fillStyle=r;g.fillRect(0,0,128,128);textures.set('contact',new T.CanvasTexture(c));}
    const shade=new T.Mesh(new T.PlaneGeometry(.7,.7),new T.MeshBasicMaterial({map:textures.get('contact'),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,fog:false}));shade.rotation.x=-Math.PI/2;shade.position.y=.036;root.add(shade);root.userData.salaryUpholstered=true;
  }
  const stockMats=new Map();
  function stock(it,kind,root,tier){
    if(['gun','ammo','baton','umbrella'].includes(kind))return;
    const size=tier==='low'?128:tier==='medium'?256:512,key=kind+':'+(it.id||it.name)+':'+size;
    let mat=stockMats.get(key);
    if(!mat){const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d'),scale=size/512;
      const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;t.anisotropy=4;
      const draw=()=>{g.setTransform(scale,0,0,scale,0,0);g.fillStyle=it.col||'#e8e5dc';g.fillRect(0,0,512,512);g.textAlign='center';g.fillStyle='#18343b';g.font='600 29px sans-serif';
        const name=it.name||it.id||'Everyday essentials';
        if(kind==='bowl'){
          g.fillStyle=/rice|bento/i.test(name)?'#dfcf9f':'#ba833c';g.fillRect(0,0,512,512);
          for(let n=0;n<170;n++){g.strokeStyle=/rice|bento/i.test(name)?'#f6efda':'#eac76c';g.lineWidth=5;g.beginPath();const x=(n*83)%512,y=(n*137)%512;g.moveTo(x,y);g.quadraticCurveTo(x+17,y-12,x+25,y+4);g.stroke();}
          for(let n=0;n<23;n++){g.fillStyle=n%3?'#417749':'#b95d35';g.fillRect((n*173)%480,(n*107)%480,18,14);}
        }else if(kind==='phone'){
          const gr=g.createLinearGradient(0,0,512,512);gr.addColorStop(0,'#153b59');gr.addColorStop(.6,'#72a8a0');gr.addColorStop(1,'#e5bca2');g.fillStyle=gr;g.fillRect(0,0,512,512);
          g.fillStyle='#f1eee4';g.font='500 86px sans-serif';g.fillText('10:26',256,168);g.font='500 20px sans-serif';g.fillText('Monday 6 April',256,201);g.fillRect(28,23,42,5);g.strokeStyle='#fff';g.strokeRect(435,19,43,15);
          g.fillStyle='#11232b';g.beginPath();g.roundRect(218,9,76,16,8);g.fill();
          for(let n=0;n<12;n++){const x=55+(n%4)*112,y=270+Math.floor(n/4)*72;g.fillStyle=['#218b75','#e18b5e','#548bb3','#7d648c'][n%4];g.beginPath();g.roundRect(x,y,58,51,11);g.fill();g.fillStyle='#eff2e8';g.font='600 26px sans-serif';g.fillText(['M','W','N','C'][n%4],x+29,y+35);}
          g.fillStyle='#fff';g.beginPath();g.roundRect(176,491,160,6,3);g.fill();
        }else if(kind==='tv'){g.fillStyle='#132331';g.fillRect(0,0,512,512);photo(g,'playbox',0,86,512,342);}
        else if(kind==='shirt'){g.fillStyle=it.shirt||it.col||'#477261';g.fillRect(0,0,512,512);g.globalAlpha=.2;g.globalCompositeOperation='soft-light';g.drawImage(surface('fabric').image,0,0,512,512);g.globalCompositeOperation='source-over';g.globalAlpha=1;}
        else{
          const accent=kind==='book'?'#365f4f':kind==='game'?'#273b68':kind==='pill'?'#28795c':'#2a696d';
          g.fillStyle=accent;g.fillRect(0,0,512,64);g.fillStyle='#fff';g.font='600 20px sans-serif';g.fillText(kind==='book'?'KOMOREBI PRESS':kind==='game'?'PLAYBOX / PEAR CUBE':'KONTO · EVERYDAY COLLECTION',256,41,470);
          if(kind==='game')photo(g,'playbox',0,70,512,340);
          else if(kind==='book'){const grad=g.createLinearGradient(0,68,512,420);grad.addColorStop(0,'#a8c0a6');grad.addColorStop(1,accent);g.fillStyle=grad;g.fillRect(0,68,512,352);g.fillStyle='#f4ecd8';for(let n=0;n<7;n++)g.fillRect(30+n*73,240+(n%3)*32,48,160);}
          else if(kind==='audio'){g.strokeStyle=accent;g.lineWidth=25;g.beginPath();g.arc(256,240,102,Math.PI,0);g.stroke();g.fillStyle=accent;g.beginPath();g.roundRect(133,238,50,115,20);g.roundRect(329,238,50,115,20);g.fill();if(/watch/.test(it.id||'')){g.fillStyle='#eae5db';g.fillRect(90,100,330,295);g.fillStyle='#252f37';g.fillRect(225,100,60,295);g.beginPath();g.arc(255,247,83,0,7);g.fill();g.strokeStyle='#e9ede1';g.lineWidth=7;g.beginPath();g.moveTo(255,190);g.lineTo(255,247);g.lineTo(293,270);g.stroke();}}
          else if(kind==='can'){g.fillStyle=accent;g.fillRect(0,64,512,355);g.fillStyle='#e6dca8';g.font='700 74px sans-serif';g.fillText(/energy/i.test(it.id||'')?'GANBARE':'KONTO',256,223);g.font='500 32px sans-serif';g.fillText(/tea/i.test(name)?'GREEN TEA':'REFRESH YOUR DAY',256,281);}
          else if(kind==='pill'){g.fillStyle='#348063';g.fillRect(230,150,52,200);g.fillRect(155,224,202,52);}
          else{g.fillStyle=accent;g.globalAlpha=.1;for(let x=0;x<512;x+=28)g.fillRect(x,76,10,310);g.globalAlpha=1;g.fillStyle=accent;g.font='600 34px sans-serif';g.fillText('Made for your everyday.',256,247,440);}
          g.fillStyle='#f3eee0';g.fillRect(0,420,512,92);g.fillStyle='#19353a';g.font='600 26px sans-serif';g.fillText(name,256,459,470);g.font='500 17px sans-serif';g.fillText(kind==='book'?'A little time for yourself.':'Quality · Designed in Konto',256,485,470);
          g.fillStyle='#152c33';for(let n=0;n<38;n++)g.fillRect(365+n*3.2,494,(n%3)+1,14);
        }
        t.needsUpdate=true;
      };draw();ready.then(draw);mat=new T.MeshBasicMaterial({map:t,fog:false});stockMats.set(key,mat);
    }
    if(kind==='bowl'){if(root.children[1]?.isMesh)root.children[1].material=mat;}
    else if(kind==='can'){root.children.filter(m=>m.isMesh&&m.geometry.type==='CylinderGeometry').forEach(m=>m.material=mat);}
    else if(kind==='shirt'){root.children.filter(m=>m.isMesh&&m.userData.salaryFinish===it.shirt).forEach(m=>m.material=mat);}
    else if(kind!=='bowl'){
      const dims={phone:[.17,.3,0,.18,.0275],tv:[.56,.32,0,.22,.0325],game:[.2,.28,0,.14,.018],book:[.18,.26,0,.13,.023],audio:[.2,.2,0,.1,.052],pill:[.14,.2,0,.1,.047],console:[.3,.1,0,.05,.122],box:[.2,.22,0,.11,.076]};
      const d=dims[kind]||dims.box,m=new T.Mesh(new T.PlaneGeometry(d[0],d[1]),mat);m.position.set(d[2],d[3],d[4]);m.userData.salaryProductFace=true;root.add(m);
    }
    root.userData.salaryProductTexture=key;state.stockTextured=(state.stockTextured||0)+1;
  }
  window.SalaryArt={ready,state,photo,surface,poster,interiorPoster,bindAtlas,coat,stock,furniture,chairCover};
})();
