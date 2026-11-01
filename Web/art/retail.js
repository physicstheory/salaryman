/* Salary Man original retail art. Interior mapping uses ray/box depth, no extra lights or render passes. */
(function () {
  'use strict';
  const T = THREE, themes = [
    {name:'SOTI STUDIO',tag:'Everyday, extraordinary.',wall:'#e3e9e5',accent:'#286d68',wood:'#a3ad9c',type:'tech'},
    {name:'KOMOREBI BOOKS',tag:'A little time for yourself.',wall:'#e4d7bd',accent:'#3c6250',wood:'#886346',type:'books'},
    {name:'MIZU COFFEE',tag:'Your morning, made slowly.',wall:'#dbcfbb',accent:'#a1593b',wood:'#795943',type:'cafe'},
    {name:'THREAD / 09',tag:'Made for the everyday.',wall:'#e8ded5',accent:'#6b5665',wood:'#a78b75',type:'fashion'},
    {name:'NAGI LIVING',tag:'Room to come home.',wall:'#dce1ce',accent:'#597a68',wood:'#b79a71',type:'home'},
    {name:'PEAR ATELIER',tag:'Find your next favourite.',wall:'#e9e9e4',accent:'#536376',wood:'#acb3b4',type:'tech'}
  ];
  const cache = new Map();
  function tex(key,w,h,draw){if(cache.has(key))return cache.get(key);const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;t.anisotropy=2;cache.set(key,t);return t;}
  function text(g,s,x,y,size,col,max){g.fillStyle=col;g.font='600 '+size+'px sans-serif';g.textAlign='center';g.fillText(s,x,y,max);}
  function phone(g,x,y,w,h,accent){g.fillStyle='#182d34';g.beginPath();g.roundRect(x,y,w,h,w*.13);g.fill();const gr=g.createLinearGradient(x,y,x+w,y+h);gr.addColorStop(0,accent);gr.addColorStop(1,'#add9bd');g.fillStyle=gr;g.beginPath();g.roundRect(x+3,y+3,w-6,h-6,w*.1);g.fill();g.fillStyle='#142c32';g.beginPath();g.arc(x+w/2,y+8,2,0,7);g.fill();}
  // Four 512x256 surfaces for each original fictional retailer; shared by every sealed window.
  function atlas(){return tex('window-atlas',2048,1536,(g)=>{
    themes.forEach((th,row)=>{for(let tile=0;tile<4;tile++){
      g.save();g.translate(tile*512,row*256);g.beginPath();g.rect(0,0,512,256);g.clip();
      g.fillStyle=tile===2?th.wood:tile===3?'#f1e9d8':th.wall;g.fillRect(0,0,512,256);
      if(tile===2){g.strokeStyle='rgba(30,35,30,.18)';g.lineWidth=2;for(let x=0;x<512;x+=64){g.beginPath();g.moveTo(x,0);g.lineTo(x,256);g.stroke();}for(let y=0;y<256;y+=64){g.beginPath();g.moveTo(0,y);g.lineTo(512,y);g.stroke();}}
      else if(tile===3){g.fillStyle='#fff8dd';g.shadowColor='#fff5cc';g.shadowBlur=12;g.fillRect(90,80,120,20);g.fillRect(310,170,120,20);}
      else {
        g.fillStyle=th.accent;g.fillRect(0,28,512,51);text(g,th.name,256,60,25,'#fff',470);text(g,th.tag,256,99,12,th.accent,470);
        g.fillStyle=th.wood;g.fillRect(0,240,512,16);
        if(th.type==='books'){for(let r=0;r<3;r++){g.fillStyle=th.wood;g.fillRect(35,133+r*36,442,6);for(let n=0;n<35;n++){g.fillStyle=['#a25e43','#426f69','#d1ae68','#667b8d','#c8c3b1'][n%5];g.fillRect(39+n*12,108+r*36,8,25);}}}
        else if(th.type==='tech'){g.fillStyle='#fff';g.fillRect(30,130,452,95);for(let n=0;n<6;n++)phone(g,52+n*71,142,29,58,th.accent);text(g,'EXPLORE · TRY · DISCOVER',256,218,12,th.accent,440);}
        else if(th.type==='cafe'){g.fillStyle='#253f38';g.fillRect(55,113,170,115);text(g,'COFFEE / TEA',140,140,17,'#f9ebcc',150);['House blend  ¥420','Matcha latte  ¥560','Freshly baked daily'].forEach((s,i)=>text(g,s,140,162+i*21,12,'#ede0bb',150));g.fillStyle=th.wood;g.fillRect(255,147,225,74);for(let n=0;n<6;n++){g.fillStyle='#ece1ca';g.fillRect(268+n*32,125,22,22);}}
        else if(th.type==='fashion'){g.fillStyle='#9c8979';g.fillRect(40,120,430,5);for(let n=0;n<10;n++){g.fillStyle=['#a17469','#557267','#e4cba9','#414851'][n%4];g.fillRect(50+n*42,131,31,80);g.fillRect(45+n*42,135,41,20);}}
        else{g.fillStyle=th.wood;g.fillRect(48,175,185,38);g.fillStyle='#839780';g.fillRect(56,145,170,48);g.fillStyle='#ebe0c7';g.fillRect(270,165,164,12);g.fillStyle=th.wood;g.fillRect(282,177,10,54);g.fillRect(411,177,10,54);}
        // Warm wall washers and skirting, painted shadows agree with the modeled room.
        const glow=g.createLinearGradient(0,0,0,120);glow.addColorStop(0,'rgba(255,245,211,.55)');glow.addColorStop(1,'rgba(255,245,211,0)');g.fillStyle=glow;g.fillRect(0,0,512,120);
      }
      g.restore();
    }});
  });}
  let windowMaterial;
  function material(){if(windowMaterial)return windowMaterial;windowMaterial=new T.ShaderMaterial({uniforms:{retailAtlas:{value:atlas()}},vertexShader:`
    attribute float retailTheme; varying float theme; varying vec2 paneUV; varying vec3 eye;
    void main(){mat4 world=modelMatrix*instanceMatrix;vec3 p=(world*vec4(position,1.)).xyz;vec3 d=cameraPosition-p;
      eye=vec3(dot(d,world[0].xyz)/dot(world[0].xyz,world[0].xyz),dot(d,world[1].xyz)/dot(world[1].xyz,world[1].xyz),dot(d,world[2].xyz)/dot(world[2].xyz,world[2].xyz));
      theme=retailTheme;paneUV=uv;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,fragmentShader:`
    uniform sampler2D retailAtlas; varying float theme; varying vec2 paneUV; varying vec3 eye;
    vec3 surface(float tile,vec2 uv){vec2 lo=vec2(tile/4.,theme/6.);return texture2D(retailAtlas,lo+(clamp(uv,.004,.996)*vec2(.25,1./6.))).rgb;}
    void main(){vec3 o=vec3(paneUV-.5,0.);vec3 d=-eye;d.z=min(d.z,-.0001);
      // A room six metres wide, 2.7 high and four deep. Plane instances encode the real proportions.
      vec3 inv=1./(d+vec3(.000001));vec3 a=(vec3(-.5,-.5,-4.)-o)*inv;vec3 b=(vec3(.5,.5,0.)-o)*inv;vec3 farT=max(a,b);float t=min(farT.x,min(farT.y,farT.z));vec3 p=o+d*t;
      vec3 col;float shade;
      if(farT.z<=farT.x&&farT.z<=farT.y){col=surface(0.,p.xy+.5);shade=.88;}
      else if(farT.x<farT.y){col=surface(1.,vec2(-p.z/4.,p.y+.5));shade=.74;}
      else if(p.y<0.){col=surface(2.,vec2(p.x+.5,-p.z/4.));shade=.72;}
      else{col=surface(3.,vec2(p.x+.5,-p.z/4.));shade=.96;}
      // Real parallax from a display island in front of the rear wall, with a shadowed front and lit top.
      vec3 ca=(vec3(-.28,-.5,-2.6)-o)*inv,cb=(vec3(.28,-.18,-1.8)-o)*inv;
      vec3 nearC=min(ca,cb),farC=max(ca,cb);float entry=max(nearC.x,max(nearC.y,nearC.z)),exitT=min(farC.x,min(farC.y,farC.z));
      if(entry>0.&&entry<exitT&&entry<t){vec3 q=o+d*entry;col=surface(2.,vec2(q.x+.5,-q.z/4.));shade=nearC.y>=nearC.x&&nearC.y>=nearC.z?1.05:.58;}
      col*=shade;float rim=step(paneUV.x,.018)+step(.982,paneUV.x)+step(paneUV.y,.028)+step(.972,paneUV.y);
      float mullion=1.-step(.006,abs(paneUV.x-.5));col=mix(col,vec3(.10,.16,.17),clamp(rim+mullion,0.,1.));
      float fres=pow(1.-clamp(eye.z/length(eye),0.,1.),3.);col=mix(col,vec3(.58,.72,.75),.045+fres*.2);
      gl_FragColor=vec4(col,1.);}`});return windowMaterial;}
  function installWindows(root,list,register,lean){const buckets=new Map();list.forEach(o=>{const k=Math.floor(o.x/128)+':'+Math.floor(o.z/128);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(o);});
    for(const rows of buckets.values()){const geo=new T.PlaneGeometry(1,1);geo.setAttribute('retailTheme',new T.InstancedBufferAttribute(new Float32Array(rows.map(o=>5-o.theme)),1));const mesh=new T.InstancedMesh(geo,material(),rows.length),dummy=new T.Object3D();
      rows.forEach((o,i)=>{dummy.position.set(o.x,o.y,o.z);dummy.rotation.set(0,o.ry,0);dummy.scale.set(o.w,o.h,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.frustumCulled=false;mesh.userData.salaryRetail=true;root.add(mesh);
      register(mesh,{x0:Math.min(...rows.map(o=>o.x))-5,x1:Math.max(...rows.map(o=>o.x))+5,z0:Math.min(...rows.map(o=>o.z))-5,z1:Math.max(...rows.map(o=>o.z))+5,y0:Math.min(...rows.map(o=>o.y))-2,y1:Math.max(...rows.map(o=>o.y))+2},lean?130:220);
    }
  }
  const floors={0:['ACCESSORY LAB','#c68451'],1:['SOTI / PEAR STUDIO','#286d68'],2:['SOUND & TIME','#555f89'],3:['PLAYBOX / PEAR CUBE','#7256a0'],4:['CINEMA GALLERY','#36576c']};
  function identity(brand,key){if(brand==='dokoto'){const f=floors[Number(String(key).split(':')[1]||1)]||floors[1];return {name:f[0],accent:f[1],wood:'#c2b5a0'};}const lookup={books:1,ramen:2,clothes:3,plaza:4,eleven:0,petmart:5};return themes[lookup[brand]??4];}
  function floorTexture(brand,key){if(window.SalaryArt && ['dokoto','books','clothes','plaza'].includes(brand))return SalaryArt.surface(brand==='books'?'walnut':brand==='clothes'?'oak':'terrazzo');if(!['dokoto','books','clothes','plaza'].includes(brand))return null;const th=identity(brand,key);return tex('floor:'+brand+':'+key,256,256,(g,w,h)=>{g.fillStyle=brand==='books'?'#a38a68':'#deded3';g.fillRect(0,0,w,h);g.strokeStyle='rgba(30,50,45,.12)';g.lineWidth=1;for(let n=0;n<256;n+=64){g.strokeRect(n,0,64,256);g.strokeRect(0,n,256,64);}g.fillStyle=th.accent;g.globalAlpha=.22;g.fillRect(0,0,8,256);g.fillRect(248,0,8,256);});}
  function wallTexture(brand,key){if(brand!=='dokoto')return null;const th=identity(brand,key);return tex('wall:'+key,512,256,(g,w,h)=>{g.fillStyle='#e8e5dc';g.fillRect(0,0,w,h);g.fillStyle=th.accent;g.fillRect(0,25,w,60);text(g,th.name,w/2,66,22,'#fff',w-40);g.fillStyle='rgba(20,40,40,.09)';for(let x=0;x<w;x+=32)g.fillRect(x,90,1,h);g.fillStyle=th.wood;g.fillRect(0,h-16,w,16);});}
  function campaign(device){if(window.SalaryArt)return SalaryArt.poster(device.maker==='pear'?'pear':'soti',device);return tex('campaign:'+device.id,512,768,(g,w,h)=>{const pear=device.maker==='pear',accent=pear?'#675b84':'#286d68';g.fillStyle=pear?'#eee8ef':'#e5eee7';g.fillRect(0,0,w,h);text(g,pear?'PEAR':'SOTI',w/2,66,22,accent,w-70);text(g,'Your everyday.',w/2,127,42,'#18333b',w-70);text(g,'A little extraordinary.',w/2,177,27,accent,w-70);g.save();g.translate(125,235);g.rotate(-.1);phone(g,0,0,155,302,accent);g.restore();g.save();g.translate(260,253);g.rotate(.12);phone(g,0,0,145,283,accent);g.restore();text(g,device.name,w/2,610,30,'#18333b',w-70);text(g,device.screen+'  /  '+device.chip,w/2,650,20,accent,w-70);text(g,'¥'+device.price.toLocaleString('en-US'),w/2,697,27,'#18333b',w-70);text(g,'Available at Dokoto Camera',w/2,738,16,accent,w-70);});}
  function refurbish(room,root,api){if(!['dokoto','plaza','books','clothes','eleven','petmart'].includes(room.brand))return;const th=identity(room.brand,room.key),add=api.add;
    // Fixtures stay above head height or flush against walls: no changes to exits, stock or lift navigation.
    for(const x of [-7.75,7.75]){add(root,.08,.12,10.6,x,3.48,0,th.accent);for(let z=-4.8;z<5;z+=.48)add(root,.08,.35,.045,x,3.17,z,th.wood);}
    for(const x of [-4.7,0,4.7]){add(root,.16,.10,8.6,x,3.56,0,'#293c3c');const light=add(root,.06,.025,8.3,x,3.495,0,'#fff1d0');light.material=new T.MeshBasicMaterial({color:'#fff1d0',fog:false});}
    const title=api.label(th.name,4.9,.30,th.accent,'#fff9e9');title.position.set(-4.5,2.91,5.32);title.rotation.y=Math.PI;root.add(title);
    if(room.brand==='dokoto'){
      [api.devices.so26,api.devices.p17].forEach((d,i)=>{if(!d)return;const poster=new T.Mesh(new T.PlaneGeometry(1.2,1.8),new T.MeshBasicMaterial({map:campaign(d),fog:false}));poster.position.set(i?4.5:-4.5,1.65,5.29);poster.rotation.y=Math.PI;root.add(poster);});
      const word=api.label('TRY IT HERE  /  ASK OUR TEAM',3.5,.23,'#e7e6dc',th.accent);word.position.set(1.3,2.62,-5.32);root.add(word);
    }
    room.retailIdentity=th.name;root.userData.salaryRetailRefurbished=true;
  }
  window.SalaryRetail={themes,installWindows,floorTexture,wallTexture,refurbish,campaign,atlas,identity};
})();
