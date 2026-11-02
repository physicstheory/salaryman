// The chunked GPU warm-up (SHIGOTO.warmGPUChunked) in a real WebGL2 context: it must split the work into batches, compile exactly the
// programs play will use (a real render afterwards compiles nothing new), put every object's visibility back, and stop cleanly, saying so,
// when the context is lost halfway. No screenshots.
const path=require('node:path'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT||'playwright');const root=path.resolve(__dirname,'../..');
const files={'/three.js':path.join(root,'Game/vendor/three.min.js'),'/shigoto.js':path.join(root,'Web/engine/shigoto.js')};
const page='<!doctype html><canvas id=c width=320 height=180></canvas><script src="/three.js"></script><script src="/shigoto.js"></script>';
const server=http.createServer((q,r)=>{if(files[q.url]){r.setHeader('Content-Type','text/javascript');return fs.createReadStream(files[q.url]).pipe(r);}r.setHeader('Content-Type','text/html');r.end(page);});
(async()=>{await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const browser=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});try{
const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:'+server.address().port+'/');
const r=await p.evaluate(async()=>{
  const build=()=>{const cv=document.createElement('canvas');cv.width=320;cv.height=180;document.body.appendChild(cv);const renderer=new THREE.WebGLRenderer({canvas:cv});renderer.shadowMap.enabled=true;renderer.outputEncoding=THREE.sRGBEncoding;
    const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x888888,10,500);const sun=new THREE.DirectionalLight(0xffffff,1);sun.castShadow=true;sun.position.set(30,60,10);scene.add(sun,new THREE.HemisphereLight(0xffffff,0x444444,0.5));
    const cam=new THREE.PerspectiveCamera(60,16/9,0.1,1000);cam.position.set(0,5,20);cam.lookAt(0,0,0);
    const g=new THREE.BoxGeometry(1,1,1),hidden=new THREE.Group();hidden.visible=false;scene.add(hidden);const meshes=[];
    for(let i=0;i<240;i++){const k=i%24;const m=k<8?new THREE.MeshStandardMaterial({color:k*999,roughness:k/8}):k<16?new THREE.MeshLambertMaterial({color:k*777,transparent:k%2===0}):new THREE.MeshPhongMaterial({color:k*555,flatShading:k%3===0});
      if(k%5===0){const c=document.createElement('canvas');c.width=c.height=64;m.map=new THREE.CanvasTexture(c);}
      const o=new THREE.Mesh(g,m);o.castShadow=true;o.position.set((i%20)*3-30,0,-Math.floor(i/20)*3-200*(i%7===0));(i%4===0?hidden:scene).add(o);meshes.push(o);}
    return {renderer,scene,cam,meshes};};
  // reference: how many programs does one plain render of everything (made visible) compile?
  const A=build();A.scene.traverse(o=>{o.visible=true;o.frustumCulled=false;});A.renderer.render(A.scene,A.cam);const refPrograms=A.renderer.info.programs.length;A.renderer.dispose();A.renderer.forceContextLoss();
  const B=build();const vis0=B.meshes.map(o=>[o.visible,o.frustumCulled]);
  const res=await SHIGOTO.warmGPUChunked(B.renderer,B.scene,B.cam,{THREE,limits:{programs:3,items:40},encoding:THREE.sRGBEncoding});
  const visBack=B.meshes.every((o,i)=>o.visible===vis0[i][0]&&o.frustumCulled===vis0[i][1]);const after=B.renderer.info.programs.length;B.scene.traverse(o=>{o.visible=true;o.frustumCulled=false;});B.renderer.setRenderTarget(null);B.renderer.render(B.scene,B.cam);const afterReal=B.renderer.info.programs.length;
  const again=await SHIGOTO.warmGPUChunked(B.renderer,B.scene,B.cam,{THREE});
  B.renderer.dispose();B.renderer.forceContextLoss();
  // context lost halfway
  SHIGOTO.forgetWarm();const C=build();const ext=C.renderer.getContext().getExtension('WEBGL_lose_context');let n=0;
  const lost=await SHIGOTO.warmGPUChunked(C.renderer,C.scene,C.cam,{THREE,limits:{programs:2,items:20},progress:()=>{if(++n===3)ext.loseContext();}});
  SHIGOTO.forgetWarm();const D=build();const capped=await SHIGOTO.warmGPUChunked(D.renderer,D.scene,D.cam,{THREE,texBudget:64*64*4*1.34*3.5});
  return {refPrograms,res,after,afterReal,visBack,again,lost,capped};
});
assert.ok(r.res.batches>=4,'the work is split into batches: '+r.res.batches);
assert.equal(r.res.objects,240);assert.ok(r.visBack,'every object keeps its own visibility and culling');assert.equal(r.res.lost,false);assert.equal(r.res.error,null);
assert.equal(r.afterReal,r.after,'a real render after the warm compiles no new programs ('+r.after+' then '+r.afterReal+')');
assert.ok(r.after>=r.refPrograms,'every program a plain render needs was compiled ('+r.after+' of '+r.refPrograms+')');
assert.equal(r.again.objects,0,'a second warm only does what is new');
assert.equal(r.lost.lost,true,'a lost context stops the warm and says so');assert.ok(r.lost.objects<240);
assert.ok(r.capped.skipped>0&&r.capped.objects+r.capped.skipped===240,'past the video memory budget, meshes with new textures wait for play ('+r.capped.skipped+' left)');
assert.deepEqual(errors,[]);
console.log('PASS chunked GPU warm: '+r.res.batches+' batches, '+r.after+' programs, nothing recompiled in play, second warm empty, video memory budget kept, stops cleanly on a lost context');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
