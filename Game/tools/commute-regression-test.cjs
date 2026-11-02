const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),T=require('../vendor/three.min.js');
const html=fs.readFileSync(require('node:path').resolve(__dirname,'../../Web/konto.html'),'utf8');
const part=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
test('mission time-speed changes preserve absolute time and the nine oclock deadline',()=>{
 const c={clock:72000,Number};vm.createContext(c);vm.runInContext(part('const TIME =','function advanceGameMinutes')+'this.api={TIME,gameMinutes,setTimeRate};',c);const a=c.api;
 const absolute=a.TIME.startMin+c.clock*a.TIME.rate;
 for(const rate of [.012,.4,4,.05,.4]){a.setTimeRate(rate);assert.ok(Math.abs(a.TIME.startMin+c.clock*a.TIME.rate-absolute)<1e-7);}
 a.TIME.startMin=522-c.clock*a.TIME.rate;assert.ok(Math.abs(a.gameMinutes()-522)<1e-7);a.setTimeRate(.03);c.clock+=60;assert.ok(Math.abs(a.gameMinutes()-523.8)<1e-7);
});
test('platforms and train stops use nearest segments, including long sparse track segments',()=>{
 const c={clamp,Math};vm.createContext(c);vm.runInContext(part('function railProject(','function ensureSotiStation('),c);
 const q=c.railProject([[0,10,0],[0,30,1000]],20,450);assert.equal(q.x,0);assert.equal(q.z,450);assert.equal(q.s,450);assert.equal(q.y,19);assert.equal(q.dist,20);
});
test('trains stop with the middle of the set aligned to the platform, on both loop and linear lines',()=>{
 const c={TRAIN_KINDS:[{name:'commuter',cars:6,L:20,gap:.6}]};vm.createContext(c);vm.runInContext(part('function nextStop(','// A set standing at a platform'),c);
 for(const loop of [false,true]){const line={kindName:'commuter',loop,length:1000,stops:[{s:200,name:'SOTI',at:[1,2]}]};assert.ok(Math.abs(c.nextStop(line,100).s-261.8)<1e-6);}
});
test('cars climb a ramp on a long frame while preserving collisions and bridge level',()=>{
 const steps=[],world={walkY(x,z,ref){steps.push(z);return 10+z*.3;},bridgeY(x,z,ref){const h=10+z*.3;return h<=ref+1.6?h:null;},sampleHeight(){return 1;}};
 const c={world,Math,insideBuilding:()=>false,treeBlocks:()=>false,WORLD_X:30000,WORLD_Z:30000};vm.createContext(c);vm.runInContext(part('function moveCarGrounded(','function updateDrive('),c);
 const car={yaw:0,speed:80,pos:new T.Vector3(100,40.04,100),vel:new T.Vector2(0,80),onWalk:false};c.moveCarGrounded(car,{W:1.8,L:4.5},.1);
 assert.ok(Math.abs(car.pos.z-108)<1e-6);assert.ok(Math.abs(car.pos.y-(10+108*.3+.04))<1e-6);assert.ok(steps.length>10,'A long frame must not skip straight across the ramp');
 c.insideBuilding=()=>true;car.crashCool=1;c.moveCarGrounded(car,{W:1.8,L:4.5},.1);assert.ok(Math.abs(car.pos.z-108)<1e-6,'Walls still block the car');
});
test('wrong turns compare against the planned route instead of the last trimmed connector',()=>{
 let now=2000,solves=0;const c={nav:{waypoint:{x:0,z:500},route:null},player:{placed:true,pos:{x:0,z:0}},flight:{active:false},drive:{car:null},performance:{now:()=>now},routeSolve:(p,w)=>{solves++;return [[p.x,p.z],[0,100],[0,500]];},navGuideUpdate(){},navGuide:{},clearWaypoint(){},say(){},clamp,Math};vm.createContext(c);vm.runInContext(part('function updateRoute()','// ---- the route in the world:'),c);
 c.updateRoute();assert.equal(solves,1);c.player.pos={x:80,z:50};now=2500;c.updateRoute();assert.equal(solves,1);now=3400;c.updateRoute();assert.equal(solves,2,'Deviating along a temporary connector must still reroute');
});
