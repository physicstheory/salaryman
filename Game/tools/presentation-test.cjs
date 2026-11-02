// Run with: node Game/tools/presentation-test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.resolve(__dirname, '../../Web/konto.html'), 'utf8');
function declaration(start, end) { return html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start))); }
const tiers = declaration('const TIERS =', 'const TIER_ORDER');
const sizing = declaration('function sizeRenderer()', '// The shader patch:');
function render(tier, width, height, dpr, scale = null, pcMode = null, cinematic = false) {
  const context = { document: { getElementById: () => ({ clientWidth: width, clientHeight: height }) }, window: { devicePixelRatio: dpr },
    gfx: { tier, scale, cinematic }, perf: { mult: 1 }, flight: { lowres: false }, gameSet: { pcMode }, camera: { updateProjectionMatrix() {} },
    renderer: { domElement: { style: {} }, setPixelRatio(n) { this.ratio = n; }, setSize(w,h) { this.width = w; this.height = h; } } };
  vm.runInNewContext(tiers + sizing + 'sizeRenderer();', context);
  return context;
}
test('automatic presets bound total pixels on HiDPI displays', () => {
  for (const [tier, budget] of Object.entries({ low: 1280*720, medium: 1920*1080, high: 2560*1440, ultra: 3840*2160 })) {
    for (const [w,h,dpr] of [[1280,720,1],[1920,1080,2],[3840,2160,2],[2560,1600,1.5]]) {
      const c = render(tier,w,h,dpr); const r = c.renderer;
      assert.ok(r.width*r.height*r.ratio*r.ratio <= budget*1.003, tier);
      assert.ok(Math.abs(r.width/r.height-w/h)<0.005);
      assert.equal(r.domElement.style.width, '100%');
      assert.equal(c.camera.aspect, w/h);
    }
  }
});
test('explicit resolution remains available, PC preset retains budget', () => {
  const manual = render('high',1920,1080,1,2).renderer;
  assert.equal(manual.width,3840);
  const preset = render('ultra',3840,2160,2,1.35,'high').renderer;
  assert.ok(preset.width*preset.height*preset.ratio**2<=3840*2160*1.003);
});
test('cinematic rendering bounds automatic resolution and restores gameplay quality',()=>{
  const film=render('ultra',3840,2160,2,null,null,true).renderer;
  assert.ok(film.width*film.height*film.ratio**2<=1920*1080*1.003);
  const game=render('ultra',3840,2160,2).renderer;
  assert.ok(game.width*game.height*game.ratio**2>1920*1080*1.01);
  const manual=render('high',1920,1080,1,2,null,true).renderer;
  assert.equal(manual.width,3840,'Explicit user resolution remains explicit');
});
test('phone calendar follows game days and ignores host timezone', () => {
  const c = { TIME: { startMin: 17*60+10, rate: 0.4 }, clock: 0 };
  vm.createContext(c);
  vm.runInContext(declaration('function phoneDate(', 'function two('), c);
  assert.match(c.phoneDate(false), /Monday,? 6 April/);
  c.clock = (1440-c.TIME.startMin)/c.TIME.rate;
  assert.match(c.phoneDate(false), /Tuesday,? 7 April/);
  c.clock += 30*1440/c.TIME.rate;
  assert.match(c.phoneDate(false), /Thursday,? 7 May/);
});
test('anime social feed keeps authored scenes and player photographs offline', () => {
  const c = { animeArt: () => true, mnScene: scene => ({ scene }), fetch: () => { throw new Error('Unexpected external image request'); } };
  vm.createContext(c);
  vm.runInContext(html.match(/const mnPhotos = .*;/)[0]
    + declaration('function mnPhotoFor(', '// Photographs come')
    + declaration('function mnWarm()', 'function mynetInit()'), c);
  const post = { scene: 'skyline', you: false };
  assert.equal(c.mnImg(post).scene, 'skyline');
  assert.equal(post.photoTried, undefined);
  const photo = { from: 'in-game camera' };
  assert.equal(c.mnImg({ you: true, photo }), photo);
  c.mnWarm();
});
test('loading overlay leaves simulation idle and resumes without a time jump', () => {
  const boot = { hidden: false }, callbacks = [], ticks = [];
  const c = { performance: { now: () => 0 }, radio: {}, wheel: {}, world: {}, scene: {}, player: { placed: false },
    document: { getElementById: () => boot }, requestAnimationFrame: fn => callbacks.push(fn),
    tick: dt => ticks.push(dt), perfHold() {} };
  vm.runInNewContext(declaration('function frameLoop()', 'function generate(seed)'), c);
  c.frameLoop(); callbacks.shift()(1000); callbacks.shift()(2000);
  assert.equal(ticks.length, 0);
  boot.hidden = true; callbacks.shift()(2016);
  assert.equal(ticks.length, 1);
  assert.equal(ticks[0], 0.016);
  assert.equal(callbacks.length, 1);
});
test('all visible settings are reachable with controller navigation', () => {
  const ids = ['mquality','mres','mfinish','mshadows','mpcmode','madapt','mundo','muidensity','muimotion','mrumble','mlook','minvert'];
  const elements = Object.fromEntries(ids.map(id => [id, { hidden: false, style: { display: id==='mundo'?'none':'' } }]));
  const c = { pause: { tab: 0 }, PAUSE_TABS: ['settings'], document: { getElementById: id => elements[id] } };
  vm.createContext(c);
  vm.runInContext(declaration('const PAUSE_ROWS =','const PAUSE_HINT') + declaration('function pauseRows()', 'function syncPauseRows()'),c);
  assert.deepEqual(Array.from(c.pauseRows()), ids.filter(id => id!=='mundo'));
  elements.mundo.style.display='';assert.ok(c.pauseRows().includes('mundo'));
});
test('interface density and reduced motion apply from saved preferences', () => {
  const c={gameSet:{uiDensity:'compact',reduceMotion:true},document:{body:{dataset:{}}}};
  vm.createContext(c);vm.runInContext(declaration('function applyInterfaceSettings()', 'applyInterfaceSettings();'),c);
  c.applyInterfaceSettings();assert.equal(c.document.body.dataset.uiDensity,'compact');assert.equal(c.document.body.dataset.reducedMotion,'true');
  c.gameSet.uiDensity='comfortable';c.gameSet.reduceMotion=false;c.applyInterfaceSettings();assert.equal(c.document.body.dataset.uiDensity,'comfortable');assert.equal(c.document.body.dataset.reducedMotion,undefined);
});
test('NHRail lists actual nearby world stations by distance', () => {
  const c={world:{cities:[{name:'Mizuho',stations:[{name:'West',centre:[400,300]},{name:'Home',centre:[0,30]}]},{name:'Tōkonto',stations:[{name:'Central',centre:[50,0]}]}]},player:{pos:{x:0,z:0}}};
  vm.createContext(c);vm.runInContext(declaration('function nearbyRailStations()', 'function appNihon('),c);
  const stops=Array.from(c.nearbyRailStations());assert.deepEqual(stops.map(s=>s.name),['Home','Central','West']);assert.equal(stops[2].distance,500);
  c.world=null;assert.equal(c.nearbyRailStations().length,0);
});
test('opaque pause pages skip GPU rendering and still permit camera capture', () => {
  const c={paused:true,capture:false,gfx:{lost:false},setWeatherShelter(){},frameGrab:{want:false},post:{time:0,on:false},world:null,scene:{},camera:{},renders:0,grabs:0,applyCameraFull(){},fxUsable:()=>false,fx:{on:false},postUsable:()=>false};
  c.wantFrame=()=>c.capture;c.grabFrame=()=>c.grabs++;c.renderer={render:()=>c.renders++};vm.createContext(c);
  vm.runInContext(declaration('function present()', '// THE AAA CHAIN').replace(/\n\/\/ =+\s*$/, ''),c);c.present();assert.equal(c.renders,0);
  c.capture=true;c.present();assert.equal(c.renders,1);assert.equal(c.grabs,1);
  c.capture=false;c.paused=false;c.present();assert.equal(c.renders,2);
});
test('every world station gets a unique readable atlas cell beyond the old 16-row limit', () => {
  const c={world:{cities:[{stations:Array.from({length:100},(_,i)=>({name:'Station '+i}))}]}};
  vm.createContext(c);vm.runInContext(declaration('const SIGN_W = 1024','function buildSignAtlas()'),c);
  const cells=[];
  for(let i=0;i<100;i++){const row=c.signRow('Station '+i);assert.equal(row,i);const uv=c.signUV(row);assert.ok(uv.u0>=0&&uv.u1<=1&&uv.v0>=0&&uv.v1<=1);cells.push(JSON.stringify(uv));}
  assert.equal(new Set(cells).size,100);
  assert.throws(()=>c.signRow('Not in world'),/not registered/);
});
test('map legend colors describe the rendered transport and waypoint layers', () => {
  const palette=vm.runInNewContext(declaration('const MAPC =','const nav =')+'MAPC_ROAD;');
  for(const [label,key] of [['Highway','express'],['Rail (overlay)','rail'],['Bus (overlay)','bus'],['Waypoint and route','waypoint']]) {
    assert.ok(html.includes('<i style="background:'+palette[key]+'"></i>'+label),label+' legend must match rendered map');
  }
});

test('real-world car paint remains the material updated by driving on Low',()=>{
  const THREE=require('../vendor/three.min.js');
  const c={THREE,gfx:{tier:'low',high:false,env:null},window:{},carMatCache:{},animeArt:()=>true,worldReal:()=>true,carDriver:()=>null,
    toonify(){throw Error('Real-world vehicle unexpectedly toonified');},toonMat(){throw Error('Paint updates must target the real material');}};
  vm.createContext(c);vm.runInContext(declaration('function carTightBox(', '// Drivers use the same rigged PBR cast'),c);
  const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,1.4,4),new THREE.MeshStandardMaterial());mesh.material.name='paint';root.add(mesh);
  const fitted=c.fitCarModel(root,{name:'sedan',L:4,W:2,H:1.4},{user:true});
  assert.equal(fitted.userData.paint,mesh.material);fitted.userData.paint.color.setRGB(.2,.3,.4);assert.equal(mesh.material.color.r,.2);
});

test('outfit try-ons reuse pristine rig templates and shared source materials',()=>{
  const Three=require('../vendor/three.min.js'),loads=[],seen=[];
  const T={...Three,GLTFLoader:class{load(url,ok){loads.push(url);const scene=new Three.Group(),bone=new Three.Bone();bone.name='Bip01_Pelvis';scene.add(bone,new Three.Mesh(new Three.BoxGeometry(),new Three.MeshStandardMaterial()));ok({scene,animations:[]});}}};
  const c={THREE:T,pplLib:{dir:'people/real/',anime:false},gfx:{tier:'high'},player:{outfit:null,hq:true},say(){},console,
    pplPlayer(g){const bone=g.scene.getObjectByName('Bip01_Pelvis');seen.push({x:bone.position.x,material:g.scene.children.find(o=>o.isMesh).material});bone.position.x=17;}};
  vm.createContext(c);vm.runInContext(declaration('function cloneSkinned(', '// Called when Seiko')+declaration('const wardrobe =','function wardrobeOpen()')+'globalThis.cacheWardrobe=wardrobe;',c);
  c.cacheWardrobe.list=[{id:'a',file:'a.glb',name:'A'},{id:'b',file:'b.glb',name:'B'}];
  c.seikoOutfit('a',true);c.seikoOutfit('b',true);c.seikoOutfit('a',true);
  assert.equal(loads.length,2);assert.deepEqual(seen.map(x=>x.x),[0,0,0]);assert.equal(seen[0].material,seen[2].material);
});

test('moat height texture retains terrain above the former 25 metre limit',()=>{
  const THREE=require('../vendor/three.min.js'),c={THREE,water:{},GRID_X:2,GRID_Z:1,world:{height:new Float32Array([32,40]),idx:(x,z)=>z*2+x}};
  vm.createContext(c);vm.runInContext(declaration('function waterGroundAt(', 'function waterHeightTexture()')+declaration('function waterHeightTextureF()', 'function waterMaterial('),c);
  const tex=c.waterHeightTextureF();assert.equal(tex.type,THREE.FloatType);assert.equal(tex.image.data[0],32);assert.equal(tex.image.data[4],40);
  assert.equal(c.waterHeightTextureF(),tex,'The world height texture is shared');
  c.CELL=1;c.DEST={sites:[{cx:1,cz:0,hx:.4,hz:.4,h:()=>58}]};c.water.heightForF=null;const holiday=c.waterHeightTextureF();assert.equal(holiday.image.data[0],32);assert.equal(holiday.image.data[4],58,'Holiday terrain is present in the water height map');
});

test('retargeting uses the same facing frame for raw and already-adopted animation templates',()=>{
  const THREE=require('../vendor/three.min.js'),tpl=new THREE.Group(),hips=new THREE.Bone(),head=new THREE.Bone(),arm=new THREE.Bone();hips.name='Hips';head.name='Head';head.position.set(0,1.5,-.1);arm.name='UpperArmL';arm.position.set(-.4,1.2,.03);hips.add(head,arm);tpl.add(hips);
  const c={THREE,peds:{tpl},pplLib:{}};vm.createContext(c);vm.runInContext(declaration('function cloneSkinned(', '// Called when Seiko')+declaration('function pplSource()', 'function pplTarget('),c);
  const raw=c.pplSource();c.pplLib.src=null;tpl.rotation.y=Math.PI;const adopted=c.pplSource();
  for(const name of Object.keys(raw.bindQ)){assert.ok(Math.abs(raw.bindQ[name].dot(adopted.bindQ[name]))>1-1e-6,name);assert.ok(raw.bindP[name].distanceTo(adopted.bindP[name])<1e-6,name);}
});
