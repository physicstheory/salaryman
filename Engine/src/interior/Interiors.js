// Shared retail architecture, finishes, signage, lighting and thermostatic ventilation.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function retailTemperature(hour=12,weather={}) {
  if(Number.isFinite(weather.temperature))return clamp(weather.temperature,-20,48);
  return 24+5*Math.sin((hour-8)/24*Math.PI*2)-5*clamp(weather.rain||0,0,1);
}
export function fanDemand(temperature,running=false) {
  if(!Number.isFinite(temperature))return 0;
  return temperature<(running?22:24)?0:clamp((temperature-22)/9,.25,1);
}
export function retailProfile(shop={},options={}) {
  const station=!!(shop.station||options.station),name=shop.name||'',central=!!shop.central||/central|中央/i.test(name);
  if(station){
    if(central)return {width:64,depth:44,height:14,wallHeight:9,glassRoof:true,design:'glass-terminus',accent:0x286b78};
    if(/soti/i.test(name))return {width:32,depth:22,height:5.8,design:'business-hub',accent:0x2c7697};
    if(/mizuho|瑞穂/i.test(name)||shop.city==='Mizuho')return {width:22,depth:16,height:4.8,design:'timber-local',accent:0x697b50};
    return {width:26,depth:19,height:5.2,design:/coast|nagisa|hamaura/i.test(name+' '+shop.city)?'coastal-hall':'neighbourhood-station',accent:0x4a7b86};
  }
  const spec={books:[24,17,4.2,'reading-house'],clothes:[26,18,4.6,'fashion-gallery'],dokoto:[32,22,5.2,'technology-showroom'],ramen:[22,16,4.2,'noodle-kitchen'],sushi:[24,18,4.5,'sushi-bar'],sushiya:[24,18,4.5,'sushi-bar'],petmart:[26,18,4.4,'pet-market'],pharmacy:[24,17,4.2,'health-store'],plaza:[32,24,5.8,'retail-arcade']}[shop.brand]||[24,17,4.2,'neighbourhood-market'];
  return {width:spec[0],depth:spec[1],height:spec[2],design:spec[3],accent:0x48696c};
}
export class InteriorEngine {
  constructor(T,options={}) {
    this.T=T;this.quality=options.quality||'high';this.environment=options.environment||null;
    this.materials=new Map();this.maps=new Map();this.signs=new Map();this.serial=0;
    this.unit=new T.BoxGeometry(1,1,1);
  }
  texture(kind,channel) {
    const key=kind+':'+channel;if(this.maps.has(key))return this.maps.get(key);
    const T=this.T,low=this.quality==='low',name={paint:'plaster',tile:'concrete',wood:'plaster',fabric:'plaster'}[kind]||kind;
    const suffix=channel==='map'?'color':channel==='normalMap'?'normal':'roughness';
    const file=(kind==='wood'||kind==='fabric')&&channel!=='roughnessMap'?'art/interior/'+(kind==='wood'?'wood_floor':'dirty_carpet')+(channel==='normalMap'?'_nor':'')+'.jpg':`art/realism/${name}-${suffix}${low?'-low':''}.jpg`;
    const t=new T.TextureLoader().load(file);
    t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(.5,.5);t.anisotropy=low?2:4;if(channel==='map')t.encoding=T.sRGBEncoding;
    this.maps.set(key,t);return t;
  }
  material(kind='paint',color=0xffffff) {
    const key=kind+':'+color;if(this.materials.has(key))return this.materials.get(key);
    const T=this.T,m=new T.MeshStandardMaterial({color,map:this.texture(kind,'map'),normalMap:this.texture(kind,'normalMap'),roughnessMap:this.texture(kind,'roughnessMap'),roughness:kind==='metal'?.58:kind==='tile'?.68:.9,metalness:kind==='metal'?.65:0,normalScale:new T.Vector2(.28,.28),envMap:this.environment,envMapIntensity:.2,fog:false});
    // Metre-scale projection on architectural geometry; unit boxes must not stretch a photograph over an entire wall.
    m.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
#ifdef USE_UV
 vec4 roomP=vec4(position,1.0);
#ifdef USE_INSTANCING
 roomP=instanceMatrix*roomP;
#endif
 roomP=modelMatrix*roomP;
 vec3 roomN=normal;
#ifdef USE_INSTANCING
 roomN=mat3(instanceMatrix)*roomN;
#endif
 roomN=mat3(modelMatrix)*roomN;
 vec3 an=abs(roomN);vec2 roomUV=an.y>max(an.x,an.z)?roomP.xz:an.x>an.z?roomP.zy:roomP.xy;
 vUv=(uvTransform*vec3(roomUV,1.0)).xy;
#endif`);};
    m.customProgramCacheKey=()=> 'shigoto-interior-metres-v2';m.userData.shDry=true;this.materials.set(key,m);return m;
  }
  mapped(map,kind='paint') {
    const key='mapped:'+map.uuid+':'+kind;if(this.materials.has(key))return this.materials.get(key);
    const base=this.material(kind),m=base.clone();m.map=map;m.fog=false;m.userData.shDry=true;
    // Authored wall/floor artwork keeps its own UV coordinates, including floor seams and brand trim.
    this.materials.set(key,m);return m;
  }
  box(root,w,h,d,x,y,z,kind='metal',color=0xffffff) {
    const m=new this.T.Mesh(this.unit,this.material(kind,color));m.scale.set(w,h,d);m.position.set(x,y,z);m.userData.shDry=true;root.add(m);return m;
  }
  sign(text,w,h,bg='#253c43',fg='#ffffff',fonts) {
    const T=this.T,key=[text,w,h,bg,fg].join('|');let mat=this.signs.get(key);
    if(!mat){const c=document.createElement('canvas');c.width=this.quality==='low'?1024:2048;c.height=Math.max(128,Math.round(c.width*h/w));const g=c.getContext('2d'),W=c.width,H=c.height,pad=Math.round(W*.035);
      g.fillStyle=bg;g.fillRect(0,0,W,H);const wash=g.createLinearGradient(0,0,0,H);wash.addColorStop(0,'rgba(255,255,255,.10)');wash.addColorStop(1,'rgba(0,0,0,.08)');g.fillStyle=wash;g.fillRect(0,0,W,H);
      g.fillStyle=fg;g.globalAlpha=.65;g.fillRect(pad,H*.19,Math.max(3,W*.003),H*.62);g.globalAlpha=1;
      const family=fonts?.style?fonts.style('interior:'+text,{text,stable:true,prefer:['gothic','corporate'],avoid:['pixel','cute']}).family:"'Konto Sans','Yu Gothic',sans-serif";
      let size=Math.round(H*.43);g.font=`600 ${size}px ${family}`;while(g.measureText(text).width>W-pad*4&&size>H*.2){size--;g.font=`600 ${size}px ${family}`;}
      g.textAlign='center';g.textBaseline='middle';g.fillStyle=fg;g.fillText(text,W*.52,H*.52,W-pad*4);
      const map=new T.CanvasTexture(c);map.encoding=T.sRGBEncoding;map.anisotropy=4;
      mat=new T.MeshStandardMaterial({map,normalMap:this.texture('metal','normalMap'),roughnessMap:this.texture('metal','roughnessMap'),roughness:.65,metalness:.05,emissive:0xffffff,emissiveMap:map,emissiveIntensity:.12,fog:false});mat.userData.shDry=true;this.signs.set(key,mat);
    }
    const mesh=new T.Mesh(new T.PlaneGeometry(w,h),mat);mesh.name='Architectural sign · '+text;
    this.box(mesh,w+.035,h+.035,.045,0,0,-.028,'metal',0x77838a);
    this.box(mesh,.012,h+.018,.012,-w/2-.008,0,.001,'metal',0xb8c2c6);
    this.box(mesh,.012,h+.018,.012,w/2+.008,0,.001,'metal',0xb8c2c6);
    const back=new T.Mesh(new T.PlaneGeometry(w,h),mat);back.position.z=-.054;back.rotation.y=Math.PI;mesh.add(back);
    mesh.userData.shDry=true;return mesh;
  }
  shelf(root,width,kind='metal',accent=0x314b4b) {
    const T=this.T,group=new T.Group();group.name='Open retail gondola';root.add(group);
    const parts=[],trim=[],push=(a,w,h,d,x,y,z)=>a.push({w,h,d,x,y,z});
    push(parts,width,1.6,.025,0,.86,-.245); // thin rear panel, behind every product
    push(parts,width,.12,.62,0,.10,.045);
    const bays=Math.ceil(width/1.25);
    for(let i=0;i<=bays;i++)push(parts,.038,1.75,.065,-width/2+width*i/bays,.9,-.19);
    for(const y of [.36,.80,1.24,1.68]){push(parts,width,.035,.64,0,y,.06);push(trim,width,.048,.018,0,y-.015,.39);}
    for(let i=0;i<bays;i++)for(const y of [.36,.80,1.24])push(parts,.20,.035,.021,-width/2+width*(i+.5)/bays,y-.012,.405);
    const batch=(list,mat)=>{const im=new T.InstancedMesh(this.unit,mat,list.length),m=new T.Matrix4(),q=new T.Quaternion(),p=new T.Vector3(),sz=new T.Vector3();list.forEach((o,i)=>{p.set(o.x,o.y,o.z);sz.set(o.w,o.h,o.d);m.compose(p,q,sz);im.setMatrixAt(i,m);});im.instanceMatrix.needsUpdate=true;im.receiveShadow=true;im.userData.shDry=true;group.add(im);};
    batch(parts,this.material(kind,kind==='wood'?0xd5c4ad:0xc6cdd0));batch(trim,this.material('paint',accent));
    group.userData.openRetailShelf=true;return group;
  }
  fan(root,x,z,height) {
    const T=this.T,g=new T.Group();g.name='Thermostatic ceiling fan';g.position.set(x,height,z);root.add(g);
    this.box(g,.16,.3,.16,0,.16,0,'metal',0x6c767b);
    const rotor=new T.Group();g.add(rotor);
    const hub=new T.Mesh(new T.CylinderGeometry(.13,.10,.14,20),this.material('metal',0x697779));rotor.add(hub);
    const blade=new T.Shape();blade.moveTo(.08,-.045);blade.bezierCurveTo(.32,-.12,.77,-.12,.88,-.015);blade.bezierCurveTo(.86,.1,.38,.13,.13,.07);blade.closePath();
    const geo=new T.ExtrudeGeometry(blade,{depth:.014,bevelEnabled:true,bevelSize:.008,bevelThickness:.006,bevelSegments:1,steps:1,curveSegments:10});geo.rotateX(-Math.PI/2);
    for(let i=0;i<4;i++){const m=new T.Mesh(geo,this.material('metal',0xb0aaa0));m.rotation.y=i*Math.PI/2;rotor.add(m);}
    return {group:g,rotor,speed:0,angle:0,running:false};
  }
  identityArchitecture(room,rig,width,depth,height) {
    const T=this.T,design=room.profile?.design;
    if(design==='reading-house')for(const x of [-width*.3,0,width*.3])this.box(rig,.16,.18,depth-.4,x,height-.22,0,'wood',0x9c8060);
    if(design==='fashion-gallery'){
      const ring=new T.Mesh(new T.TorusGeometry(2.1,.045,8,64),this.material('paint',0xe3ddd0).clone());ring.rotation.x=Math.PI/2;ring.position.y=height-.5;ring.material.emissive=new T.Color(0xffebcf);ring.material.emissiveIntensity=.45;rig.add(ring);
    }
    if(design==='technology-showroom')for(const sd of [-1,1]){const strip=this.box(rig,.04,.09,depth-.6,sd*(width/2-.18),height-1,0,'paint',0xafd7de);strip.material=strip.material.clone();strip.material.emissive=new T.Color(0x9cdae3);strip.material.emissiveIntensity=.4;}
    if(design==='noodle-kitchen'||design==='sushi-bar'){
      const shape=[new T.Vector2(.08,.32),new T.Vector2(.12,.28),new T.Vector2(.28,.12),new T.Vector2(.34,0)],geo=new T.LatheGeometry(shape,24);
      for(const x of [-4,0,4]){this.box(rig,.02,height-2.9,.02,x,(height+2.9)/2,-depth*.15,'metal',0x626e71);const shade=new T.Mesh(geo,this.material('paint',0xd3ba90));shade.position.set(x,2.75,-depth*.15);rig.add(shade);}
    }
  }
  stationSeating(room,rig,width,depth) {
    const T=this.T;
    if(!this.seatGeo){const sh=new T.Shape(),w=.56,d=.46,r=.055;sh.moveTo(-w/2+r,-d/2);sh.lineTo(w/2-r,-d/2);sh.quadraticCurveTo(w/2,-d/2,w/2,-d/2+r);sh.lineTo(w/2,d/2-r);sh.quadraticCurveTo(w/2,d/2,w/2-r,d/2);sh.lineTo(-w/2+r,d/2);sh.quadraticCurveTo(-w/2,d/2,-w/2,d/2-r);sh.lineTo(-w/2,-d/2+r);sh.quadraticCurveTo(-w/2,-d/2,-w/2+r,-d/2);this.seatGeo=new T.ExtrudeGeometry(sh,{depth:.035,bevelEnabled:true,bevelSize:.01,bevelThickness:.008,bevelSegments:2,steps:1,curveSegments:6});}
    room.seats=room.seats||[];room.colliders=room.colliders||[];
    for(const x of [-width*.32,width*.32])for(const z of room.glassRoof?[-depth*.18,depth*.18]:[depth*.18]){
      const group=new T.Group();group.name='Station seating';group.position.set(x,0,z);group.rotation.y=z>0?Math.PI:0;rig.add(group);
      this.box(group,2.05,.08,.08,0,.32,0,'metal',0x6f858e);
      for(const sx of [-.82,.82]){this.box(group,.07,.42,.07,sx,.22,0,'metal',0x7e9298);this.box(group,.13,.035,.50,sx,.03,0,'metal',0x7e9298);}
      for(const sx of [-.62,0,.62]){const seat=new T.Mesh(this.seatGeo,this.material('metal',0xb5c6c8));seat.rotation.x=-Math.PI/2;seat.position.set(sx,.48,0);group.add(seat);const back=new T.Mesh(this.seatGeo,this.material('metal',0xb5c6c8));back.position.set(sx,.76,-.23);back.rotation.x=-.12;group.add(back);room.seats.push({x:x+sx,z:z+(z>0?-.02:.02),yaw:group.rotation.y});}
      room.colliders.push({x0:x-1.1,x1:x+1.1,z0:z-.4,z1:z+.4});
    }
    // Raised tactile guide from the entry to the ticket gates. One instanced batch.
    const strips=[],push=(x,z,turned)=>{for(let k=-2;k<=2;k++)strips.push({x:x+(turned?0:k*.055),z:z+(turned?k*.055:0),sx:turned?.52:.022,sz:turned?.022:.52});};
    for(let z=depth/2-.7;z>=-.4;z-=.6)push(0,z,false);
    for(let x=-.6;x>=-width/2+3.7;x-=.6)push(x,-.4,true);
    const im=new T.InstancedMesh(this.unit,this.material('tile',0xdcc871),strips.length),m=new T.Matrix4(),q=new T.Quaternion(),pos=new T.Vector3(),scale=new T.Vector3();strips.forEach((s,i)=>{pos.set(s.x,.064,s.z);scale.set(s.sx,.014,s.sz);m.compose(pos,q,scale);im.setMatrixAt(i,m);});im.instanceMatrix.needsUpdate=true;im.receiveShadow=true;im.name='Tactile route to ticket gates';rig.add(im);
  }
  stationRoof(room,rig,width,depth,height) {
    const T=this.T,p=room.profile,spring=p.wallHeight||height-5,rise=height-spring,positions=[],uv=[],indices=[],N=32;
    for(let z=0;z<=8;z++)for(let i=0;i<=N;i++){const t=i/N;positions.push((t-.5)*width,spring+Math.sin(t*Math.PI)*rise,(z/8-.5)*depth);uv.push(t,z/8);}
    for(let z=0;z<8;z++)for(let i=0;i<N;i++){const a=z*(N+1)+i;indices.push(a,a+N+1,a+1,a+1,a+N+1,a+N+2);}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
    const glass=new T.MeshPhysicalMaterial({color:0xc7e7e9,transparent:true,opacity:.18,roughness:.12,metalness:0,clearcoat:1,envMap:this.environment,envMapIntensity:.45,side:T.DoubleSide,depthWrite:false});
    const roof=new T.Mesh(geo,glass);roof.name='Tōkonto vaulted glass roof';roof.userData.rainOccluder=true;roof.userData.shDry=true;rig.add(roof);
    const endPos=[],endUV=[],endIx=[];
    for(const z of [-depth/2,depth/2]){const base=endPos.length/3;for(let i=0;i<=N;i++){const t=i/N;endPos.push((t-.5)*width,spring,z,(t-.5)*width,spring+Math.sin(t*Math.PI)*rise,z);endUV.push(t,0,t,1);}for(let i=0;i<N;i++){const a=base+i*2;endIx.push(a,a+1,a+2,a+1,a+3,a+2);}}
    const endGeo=new T.BufferGeometry();endGeo.setAttribute('position',new T.Float32BufferAttribute(endPos,3));endGeo.setAttribute('uv',new T.Float32BufferAttribute(endUV,2));endGeo.setIndex(endIx);endGeo.computeVertexNormals();const ends=new T.Mesh(endGeo,glass);ends.name='Glazed station gables';rig.add(ends);
    const pts=[];for(let i=0;i<=32;i++){const t=i/32;pts.push(new T.Vector3((t-.5)*width,spring+Math.sin(t*Math.PI)*rise,0));}
    const ribGeo=new T.TubeGeometry(new T.CatmullRomCurve3(pts),48,.23,8,false),steel=this.material('metal',0xc3d2d4);
    for(let i=0;i<=6;i++){const z=(i/6-.5)*depth,rib=new T.Mesh(ribGeo,steel);rib.position.z=z;rig.add(rib);for(const sd of [-1,1])this.box(rig,.28,spring,.28,sd*(width/2-.2),spring/2,z,'metal',0xb7c9cc);}
    for(const t of [.12,.3,.5,.7,.88])this.box(rig,.075,.09,depth,(t-.5)*width,spring+Math.sin(t*Math.PI)*rise-.12,0,'metal',0x9db5ba);
    // Exposed ductwork, cable trays, suspended signs and luminaires belong to the roof structure.
    for(const sd of [-1,1]){const duct=new T.Mesh(new T.CylinderGeometry(.25,.25,depth*.82,16),this.material('metal',0x8a9da0));duct.rotation.x=Math.PI/2;duct.position.set(sd*width*.31,spring-.5,0);rig.add(duct);
      this.box(rig,.6,.10,depth*.88,sd*width*.22,spring-.9,0,'metal',0x6b858b);
      for(const z of [-depth*.22,depth*.22]){this.box(rig,.025,spring-4.8,.025,sd*width*.16,(spring+4.8)/2,z,'metal',0x879ba2);const sign=this.sign(sd<0?'NHRail  ·  PLATFORMS  ←':'SHOPS  ·  EXIT  →',5,.7,'#173e49','#f4f3e9');sign.position.set(sd*width*.16,4.8,z);rig.add(sign);}
    }
    return roof;
  }
  refurbish(room,{width=24,depth=17,height=4.2}={}) {
    if(room.refurbishment)return room.refurbishment;
    const T=this.T,root=room.group,rig=new T.Group();rig.name='Retail lighting and ventilation';root.add(rig);root.userData.shDry=true;
    const warm=/ramen|sushi|books|home|capsule/.test(room.brand),high=this.quality!=='low',station=!!room.station,lightHeight=station?Math.min(height-.4,6):height-.4;
    const fill=new T.HemisphereLight(warm?0xffedda:0xe8f1ff,0x61666a,.6);rig.add(fill);
    const lights=[];for(const x of [-width*.26,width*.26])for(const z of high?[-depth*.26,depth*.26]:[0]){
      const l=new T.PointLight(warm?0xffe2b9:0xf1f6ff,1.15,Math.max(width,depth)*.85,1.5);l.position.set(x,lightHeight,z);rig.add(l);lights.push(l);
      const fixtureY=station?lightHeight+.4:height-.12;
      const frame=this.box(rig,1.55,.09,.42,x,fixtureY,z,'metal',0xaab4b6);
      if(room.glassRoof)this.box(rig,.025,2.3,.025,x,fixtureY+1.15,z,'metal',0x889da3);
      const diffuser=this.box(frame,1,.03,1,0,-.7,0,'paint',0xf0f2ec);diffuser.scale.set(.91,.3,.83); // nested in the luminaire's dimensions
      const dm=this.material('paint',0xf0f2ec).clone();dm.emissive=new T.Color(warm?0xffe0af:0xe4f0ff);dm.emissiveIntensity=.75;diffuser.material=dm;
    }
    // Cassette vents, skirting and a working ceiling fan are architectural details, never aisle obstacles.
    if(!room.glassRoof)for(const z of [-depth*.28,depth*.28]){this.box(rig,.85,.08,.85,0,height-.1,z,'paint',0xd3d9d9);for(let i=-3;i<=3;i++)this.box(rig,.6,.015,.018,0,height-.15,z+i*.075,'metal',0x58686d);}
    this.box(rig,width,.13,.07,0,.1,-depth/2+.15,'metal',0x8b9699);
    for(const sd of [-1,1])this.box(rig,.07,.13,depth-.3,sd*(width/2-.15),.1,0,'metal',0x8b9699);
    this.identityArchitecture(room,rig,width,depth,height);
    if(room.station)this.stationSeating(room,rig,width,depth);
    if(room.glassRoof)this.stationRoof(room,rig,width,depth,height);
    if(room.profile?.design==='timber-local'){for(const x of [-width*.32,0,width*.32])this.box(rig,.22,.28,depth,x,height-.25,0,'wood',0x9b805b);}
    const fanY=room.glassRoof?(room.profile.wallHeight-.65):Math.max(2.3,height-.55);
    const fans=[this.fan(rig,-width*.25,0,fanY),this.fan(rig,width*.25,-depth*.2,fanY)];
    root.traverse(o=>{if(o.isHemisphereLight&&o!==fill)o.intensity=0;if(!o.isMesh)return;o.receiveShadow=true;
      if(o.userData.salaryFinish&&o.material?.isMeshBasicMaterial)o.material=o.material.map?this.mapped(o.material.map):this.material('paint',o.userData.salaryFinish);
      if(!o.geometry?.attributes.uv)return;
      for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m?.isMeshStandardMaterial||m.transparent)continue;
        if(!m.map)m.map=this.texture('paint','map');
        if(!m.normalMap){m.normalMap=this.texture('paint','normalMap');m.normalScale=new T.Vector2(.18,.18);}
        if(!m.roughnessMap)m.roughnessMap=this.texture('paint','roughnessMap');m.needsUpdate=true;
      }
    });
    const state={rig,lights,fans,temperature:24,brand:room.brand,design:room.profile?.design||room.brand};room.refurbishment=state;return state;
  }
  update(room,dt,{temperature=24}={}) {
    const st=room?.refurbishment;if(!st||!room.group.visible)return;
    dt=Number.isFinite(dt)?clamp(dt,0,.1):0;st.temperature=Number.isFinite(temperature)?temperature:24;
    for(const f of st.fans){const demand=fanDemand(st.temperature,f.running);f.running=demand>0;f.speed+=(demand*10-f.speed)*(1-Math.exp(-dt*2));f.angle=(f.angle+f.speed*dt)%(Math.PI*2);f.rotor.rotation.y=f.angle;}
  }
}
