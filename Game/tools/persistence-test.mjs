import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ResidentSet,Persistence,warmGPU} from '../../Engine/src/persist/Persistence.js';
const require=createRequire(import.meta.url),T=require('../vendor/three.min.js');
const evicted=[],set=new ResidentSet('test',{budget:100,onEvict:k=>evicted.push(k)});
const visible={visible:true},near={visible:false},far={visible:false};
set.add('visible',visible,900,0,40);set.add('near',near,1,0,40);set.add('far',far,100,0,40);
assert.equal(set.enforce(0,0),1);assert.deepEqual(evicted,['far']);assert.equal(set.get('visible'),visible);assert.equal(set.get('near'),near);assert.equal(set.bytes,80);
const scene=new T.Scene(),mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());mesh.visible=false;scene.add(mesh);
const oldTarget={},renderer={info:{programs:[]},shadowMap:{autoUpdate:true},target:oldTarget,compile(){},getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},render(){this.shadowMap.autoUpdate=false;throw Error('device upload failed');}};
let disposed=0;class Target extends T.WebGLRenderTarget{dispose(){disposed++;super.dispose();}}
const result=warmGPU(renderer,scene,new T.PerspectiveCamera(),{THREE:{WebGLRenderTarget:Target}});
assert.match(result.error,/device upload failed/);assert.equal(renderer.target,oldTarget);assert.equal(renderer.shadowMap.autoUpdate,true);assert.equal(mesh.visible,false);assert.equal(mesh.frustumCulled,true);assert.equal(disposed,1);
const p=new Persistence({budget:1000});p.stage('build',1,()=>({built:1}));p.check('world','built',()=>true);const report=await p.run();assert.equal(report.failed,0);assert.equal(p.done,true);assert.equal(p.running,false);
console.log('PASS persistence residency, hidden-first eviction, load report and renderer recovery after GPU upload failure');
