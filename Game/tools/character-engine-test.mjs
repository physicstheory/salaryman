import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Characters,kindOf} from '../../Engine/src/characters/Characters.js';
const require=createRequire(import.meta.url),T=require('../vendor/three.min.js');
const C=new Characters(T,{quality:'low'});
const source=new T.MeshStandardMaterial({name:'warm cloth suit',roughness:.8});
const map=()=>new T.DataTexture(new Uint8Array(16).fill(255),2,2,T.RGBAFormat);
source.map=map();source.normalMap=map();source.roughnessMap=map();source.aoMap=map();source.envMap=map();
const m=C.material(source,{skinned:true,model:'test'});
assert.equal(m.envMap,source.envMap,'Retain the scene reflection map');
const shader={uniforms:{},fragmentShader:'#include <common>\n#include <lights_physical_pars_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>'};m.onBeforeCompile(shader);
assert.equal(shader.uniforms.chAllowSkin.value,0,'Warm fabric must not scatter as skin');
assert.equal(kindOf({name:'person.short02'}),'hair');assert.equal(kindOf({name:'person.ears'}),'skin');
const g=new T.PlaneGeometry(1,1),mesh=new T.Mesh(g,source),root=new T.Group();root.add(mesh);C.upgrade(root);
assert.ok(g.attributes.uv2,'Occlusion has a usable UV set');assert.equal(C.report().missing.length,0);
const big=new T.PlaneGeometry(1,1,180,180);big.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(big.attributes.position.count*4),4));const weights=new Float32Array(big.attributes.position.count*4);for(let i=0;i<weights.length;i+=4)weights[i]=1;big.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
const heavy=new T.SkinnedMesh(big,source);C.setQuality('ultra');C.upgrade(heavy,{hero:true});assert.equal(heavy.geometry,big,'Subdivision respects the 80K output triangle limit per mesh');
console.log('PASS character material semantics, reflections, AO UVs, complete-map report and subdivision budget');
// The game's r128 textures do not provide userData. Exercise actual synthesis
// against that version, with a small pixel canvas so this regression is cheap.
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){},getImageData(_x,_y,w,h){return {data:new Uint8ClampedArray(w*h*4).fill(190)};},putImageData(){}})})};
globalThis.ImageData=class{constructor(data,w,h){this.data=data;this.width=w;this.height=h;}};
const synth=new Characters(T,{quality:'medium'}),incomplete=new T.MeshStandardMaterial({name:'cloth imported suit',map:map()}),generated=new T.Mesh(new T.PlaneGeometry(1,1),incomplete);
synth.upgrade(generated,{model:'generated'});
assert.ok(generated.material.normalMap?.userData.shigotoSynth);assert.ok(generated.material.roughnessMap);assert.ok(generated.material.aoMap);assert.ok(generated.geometry.attributes.uv2);assert.equal(synth.report().missing.length,0);
delete globalThis.document;delete globalThis.ImageData;
console.log('PASS map synthesis on the shipped Three.js version and post-synthesis AO UVs');
