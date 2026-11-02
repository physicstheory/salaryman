// Functional readiness check. Stage first; requires Playwright and Chromium.
// PLAYWRIGHT=/path/to/playwright CHROME=/path/to/chromium node tools/readiness-test.cjs /tmp/salaryman-check
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const game = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || '/tmp/salaryman-readiness');
const mime = { '.html': 'text/html', '.svg':'image/svg+xml', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2' };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname === '/music/index.json') { response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ stations: {} })); return; }
  const file = path.resolve(game, 'app', '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(path.join(game, 'app') + path.sep)) { response.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    response.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(error ? 'Missing asset' : data);
  });
});
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const startedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'running',startedAt},null,2));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const errors = [], warnings = [], warningCounts = {};
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME || undefined,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (['warning', 'error'].includes(message.type())) { const text = message.text(); warningCounts[text] = (warningCounts[text] || 0) + 1; if (warningCounts[text] === 1) { warnings.push(text); console.log(message.type(),text.slice(0,500)); } } });
    page.on('response', response => { if(response.status() >= 400) console.log('HTTP',response.status(), new URL(response.url()).pathname); });
    await page.route('konto://vendor/**', route => route.fulfill({
      path: path.join(game, 'vendor', new URL(route.request().url()).pathname.split('/').pop()), contentType: 'text/javascript'
    }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('pause')).filter),'none','Shared color theme must load without parent grayscale');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('mres')).borderRadius),'0px','Redesigned controls stylesheet must load');
    const state = () => page.evaluate(() => ({ mode: player.mode, cities: world?.cities.length,
      hq: !!player.hq, outfit: player.outfit, cast: pplLib.ready.length,
      boot: document.getElementById('bootstage').textContent, loading: !document.getElementById('boot').hidden,
      cutscene: cut.active, placed: player.placed, x: player.pos.x, z: player.pos.z, phoneOpen:phone.open,phoneBox:(()=>{const r=document.getElementById('phone').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};})(),stationSignNames: signNames.length, signAtlasSize: signCanvas ? [signCanvas.width,signCanvas.height] : null }));
    try {
      await page.waitForFunction(() => document.body.classList.contains('titleup'), null, { timeout: 240000 });
      console.log('PASS title and world generation', JSON.stringify(await state()));
      const persistence=await page.evaluate(()=>{if(!PERSIST.engine?.done)throw Error('Persistence load did not finish before the title');return PERSIST.engine.report;});
      fs.writeFileSync(path.join(output,'persistence.json'),JSON.stringify(persistence,null,2));
      assert.equal(persistence.stages.filter(s=>!s.ok).length,0,'Persistence build stages must succeed');
      assert.equal(persistence.failed,0,'Persistence quality checks must pass');
      console.log('PASS persistence load and quality checks',persistence.checks.length,persistence.residentMb+' MB resident');

      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.getElementById('boot').hidden && player.hq && player.outfit === 'village', null, { timeout: 240000 });
      console.log('PASS story assets and rigged player');
      // Exercise the same cleanup used by the supported cinematic skip.
      await page.evaluate(() => cutFinish(true));
      await page.waitForFunction(() => !cut.active && player.placed, null, { timeout: 60000 });
      console.log('PASS intro skip and playable state');
      await page.waitForFunction(() => window.shigoto?.engine?.physics?.ready, null, {timeout:60000});
      await page.evaluate(async()=>{await SalaryArt.ready;if(SalaryArt.state.failed.length)throw Error('Missing generated art');if(!worldReal())throw Error('Claude realistic-world mode is not enabled');const w=shigoto.engine.weather,wet=w.wetness,puddles=w.puddles;shigoto.weather('rain',true);if(w.state!=='rain')throw Error('Weather integration failed');shigoto.weather('clear',true);w.wetness=wet;w.puddles=puddles;shigoto.engine.surfaces.uniforms.shWet.value=wet;shigoto.engine.surfaces.uniforms.shPuddles.value=puddles;});
      await page.evaluate(()=>{const C=SHIGOTO.characters(THREE);if(!pplLib.real||pplLib.dir!=='people/real/')throw Error('Claude realistic cast not selected');let n=0;(player.glb||player.obj).traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m.userData.shigotoChar)throw Error('Character engine shader not applied');if(m.userData.charKind!=='hair'&&(!m.map||!m.normalMap||!m.roughnessMap||!m.aoMap))throw Error('Missing PBR map');n++;}});if(!n)throw Error('No player materials');if(!wardrobe.list.some(e=>e.id==='custom_suit_black'))throw Error('Missing generated wardrobe choices');});
      console.log('PASS Claude engine, character PBR maps, physics, weather and generated art loading');
      const facing = await page.evaluate(() => {
        setPaused(true,'rig-check');
        const bones={};player.obj.traverse(o=>{if(o.isBone)bones[o.name]=o;});
        const pos=n=>bones[n].getWorldPosition(new THREE.Vector3());
        const originalYaw=player.obj.rotation.y, results=[];
        for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]) {
          player.obj.rotation.y=yaw;
          for(const name of ['idle','walk','run']) {
            const action=player.clips[name];if(!action)throw Error('Missing '+name+' animation');
            player.mixer.stopAllAction();action.reset().play();player.mixer.setTime(action.getClip().duration*.37);player.obj.updateMatrixWorld(true);
            const face=pos('Bip01_MNose').sub(pos('Bip01_Head'));face.y=0;face.normalize();
            const shoulders=pos('Bip01_L_Clavicle').sub(pos('Bip01_R_Clavicle'));
            const body=shoulders.cross(new THREE.Vector3(0,1,0));body.y=0;body.normalize();
            const forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
            const row={name,yaw,headForward:face.dot(forward),bodyForward:body.dot(forward),headBody:face.dot(body)};
            if(row.headForward<.5||row.bodyForward<.5||row.headBody<.7)throw Error('Misaligned in-game rig: '+JSON.stringify(row));
            results.push(row);
          }
        }
        player.obj.rotation.y=originalYaw;player.mixer.stopAllAction();player.action=null;player.clipName='';playSeikoClip('idle',0);player.obj.updateMatrixWorld(true);setPaused(false);
        return results;
      });
      console.log('PASS actual player head/body facing in idle, walk and run at four headings',JSON.stringify(facing));


      await page.evaluate(() => { let n=0;while(cut.active&&n++<20)cutFinish(true);if(home.inside)leaveHome();if(interior.active)interiorLeave(true);cheat('GOTOKONTO');cheat('MIDDAY');loadShow(false);document.getElementById('fade').style.opacity='0'; });
      await page.waitForTimeout(3000);
      const result = await state();
      assert.ok(result.cities > 0 && Number.isFinite(result.x) && Number.isFinite(result.z));
      assert.equal(result.mode, 'walk');
      assert.equal(result.hq, true);
      assert.ok(result.signAtlasSize && result.signAtlasSize.every(n=>n<=4096),'Station atlas must fit conservative GPU texture limits');
      if(process.env.SCREENSHOTS==="1") await page.screenshot({ path: path.join(output, 'gameplay.png'), timeout: 240000 });
      await page.evaluate(() => {setPhone(true);setPaused(true,'phone');});
      await page.waitForFunction(() => { const box = document.getElementById('phone').getBoundingClientRect(); return phone.open && box.top < innerHeight - 100 && box.bottom <= innerHeight; }, null, { timeout: 60000, polling:100 });
      if(process.env.SCREENSHOTS==="1") await page.screenshot({ path: path.join(output, 'phone.png'), animations: 'disabled', timeout: 240000 });
      console.log('PASS phone visible on screen');
      // The 3D scene can stay paused while the native-resolution app canvases are checked.
      await page.evaluate(() => setPaused(true, 'phone'));
      const appNames = await page.evaluate(() => Object.keys(PHONE_SCREENS));
      const appScreens = [];
      for (const app of appNames) {
        await page.evaluate(app => {
          phone.app=app;phone.sub=0;phone.site=null;phone.entry=null;phone.vmail="";
          setPhone(true);drawPhone();
        },app);
        if (app === 'Camera') {
          await page.waitForFunction(() => frameGrab.ok, null, {timeout:60000});
          await page.evaluate(() => drawPhone());
        }
        const data = await page.evaluate(() => document.getElementById('phonecanvas').toDataURL('image/png'));
        fs.writeFileSync(path.join(output,'app-'+app+'.png'),Buffer.from(data.split(',')[1],'base64'));
        if (app === 'Noodle') {
          const web = await page.evaluate(() => document.getElementById('webcanvas').toDataURL('image/png'));
          fs.writeFileSync(path.join(output,'browser.png'),Buffer.from(web.split(',')[1],'base64'));
        }
        appScreens.push(app);
      }
      console.log('PASS app canvas render checks',appScreens.join(', '));
      await page.evaluate(() => {
        phone.app='Nihon';phone.sub=0;setPhone(true);phoneAct();
        if (!nav.waypoint || !Number.isFinite(nav.waypoint.x)) throw Error('NHRail did not mark directions');
      });
      console.log('PASS real station directions');
      await page.evaluate(() => { setPhone(false);expedioOpen('app','konto'); });
      if(process.env.SCREENSHOTS==="1") await page.screenshot({path:path.join(output,'expedio.png'),timeout:240000,animations:'disabled'});
      await page.evaluate(() => { expedioClose();setPaused(true,'settings'); });
      await page.locator('#muidensity').click();
      assert.equal(await page.evaluate(() => document.body.dataset.uiDensity),'compact');
      await page.locator('#muidensity').click();
      await page.locator('#muimotion').click();
      assert.equal(await page.evaluate(() => document.body.dataset.reducedMotion),'true');
      await page.locator('#muimotion').click();
      await page.evaluate(() => { pause.row=pauseRows().length-1;syncPauseRows(); });
      const selectedInView=await page.evaluate(() => {
        const element=document.getElementById(pauseRows()[pause.row]);const view=element.closest('.ppage').getBoundingClientRect();const box=element.getBoundingClientRect();return box.top>=view.top&&box.bottom<=view.bottom;
      });
      assert.equal(selectedInView,true,'Selected settings row must stay visible');
      if(process.env.SCREENSHOTS==="1") await page.screenshot({path:path.join(output,'settings.png'),timeout:240000,animations:'disabled'});
      await page.evaluate(() => setMapOpen(true));
      if(process.env.SCREENSHOTS==="1") await page.screenshot({path:path.join(output,'map.png'),timeout:240000,animations:'disabled'});
      console.log('PASS settings, interface preferences, scrolling and map');
      await page.evaluate(()=>{
        setMapOpen(false);setPhone(false);setPaused(true,'phone');
        document.getElementById('pause').style.visibility='hidden';
        if(home.inside)leaveHome();if(interior.active)interiorLeave(true);
        applyTier('high',{quiet:true});
        const c=world.cities.find(c=>c.name==='Tōkonto')||world.cities[0],target=c.scramble?.at||c.centre,spots=[];
        for(const road of c.roads){if(road.elevated||!road.pts)continue;for(let i=1;i<road.pts.length;i++){
          const a=road.pts[i-1],b=road.pts[i],dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz);if(len<10)continue;
          const vx=dx/len,vz=dz/len;
          for(const t of [.2,.5,.8]){const x=a[0]+dx*t,z=a[2]+dz*t,y=world.surfaceY(x,z);
            if(insideBuilding(x,z,2)||insideBuilding(x-vx*6,z-vz*6,2)||world.bridgeY(x,z)!==null)continue;
            if(Math.abs(world.surfaceY(x-vx*6,z-vz*6)-y)>1)continue;
            spots.push({x,z,y,vx,vz,score:Math.hypot(x-target[0],z-target[1])});
          }
        }}
        spots.sort((a,b)=>a.score-b.score);const at=spots[0];if(!at)throw Error('No unobstructed city camera position');
        placeSeiko(new THREE.Vector3(at.x,at.y,at.z));player.pos.y=world.walkY(at.x,at.z,player.pos.y);player.obj.position.copy(player.pos);at.y=player.pos.y;player.yaw=player.targetYaw=Math.atan2(at.vx,at.vz);player.obj.rotation.y=player.yaw;player.obj.visible=true;
        yaw=Math.atan2(-at.vx,-at.vz);pitch=-.12;
        camPos.set(at.x-at.vx*6,at.y+2.6,at.z-at.vz*6);camera.position.copy(camPos);camera.near=2;camera.fov=60;camera.updateProjectionMatrix();camera.lookAt(at.x,at.y+1.5,at.z);camera.updateMatrixWorld(true);
        streamFrame();frameGrab.want=true;present();
        window.reviewCamera={city:c.name,player:player.pos.toArray(),camera:camera.position.toArray(),insideBuilding:insideBuilding(player.pos.x,player.pos.z,1)};
      });
      if(process.env.SCREENSHOTS==="1") await page.screenshot({path:path.join(output,'city-high.png'),timeout:240000});
      const engine=await page.evaluate(()=>({running:!!shigoto.engine,physicsReady:shigoto.engine.physics.ready,failed:shigoto.failed,realWorld:worldReal(),tier:gfx.tier,post:fx.on,art:SalaryArt.state,capture:reviewCamera}));
      assert.equal(engine.running,true);assert.equal(engine.failed,false);assert.equal(engine.realWorld,true);assert.equal(engine.post,true);assert.equal(engine.capture.insideBuilding,false);
      console.log('PASS high-quality scene render check',JSON.stringify(engine));
      const retail=await page.evaluate(()=>{
        const rooms=[...MALL_FLOORS.map((_,i)=>interiorMallLevel({brand:'dokoto'},i)),...['clothes','street','plaza','books','ramen'].map(brand=>interiorRoom({brand}))];
        for(const r of rooms)if(!r.colliders.every(c=>Object.values(c).every(Number.isFinite)))throw Error('Invalid refurbished collider: '+r.key);
        const custom=STORE_SHELVES.clothes[0].items.filter(e=>e.outfit?.startsWith('custom_'));
        if(custom.length!==4||STORE_SHELVES.street[0].items.filter(e=>e.outfit?.startsWith('custom_')).length!==4)throw Error('Missing shop outfit skins');
        window.reviewRooms=rooms;const it=custom[0];purse.yen=100000;const before=purse.yen;const previous=shops.inside;shops.inside={brand:'clothes'};const cost=outfitPrice(it).cost;outfitBuy(it);shops.inside=previous;
        if(purse.yen!==before-cost||!story.owned[it.outfit])throw Error('Outfit purchase failed');
        return {rooms:rooms.map(r=>({key:r.key,items:r.items.length,colliders:r.colliders.length})),purchased:it.outfit};
      });
      await page.waitForFunction(()=>player.outfit==='custom_suit_black'&&!wardrobe.loading,null,{timeout:90000});
      await page.waitForFunction(()=>reviewRooms.filter(r=>['dokoto','clothes','plaza','street'].includes(r.brand)).every(r=>{let n=0;r.group.traverse(o=>{if(o.userData.salaryUpholstered)n++;});return n>=2;}),null,{timeout:30000});
      const customSkin=await page.evaluate(()=>{let n=0;(player.glb||player.obj).traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m.userData.shigotoChar)throw Error('Generated skin shader missing');if(m.userData.charKind!=='hair'&&(!m.map||!m.normalMap||!m.roughnessMap||!m.aoMap))throw Error('Generated skin PBR map missing: '+m.name+' '+JSON.stringify(SHIGOTO.characters(THREE).report()));n++;}});if(!storyWearingSuit())throw Error('Custom tailoring not recognized as a suit');frameGrab.want=true;present();return n;});
      console.log('PASS refurbished shop lighting, upholstered chairs, eight additional skins, purchase and rigged custom outfit',JSON.stringify({retail,customSkin}));
      const atlas = await page.evaluate(() => adAtlas().image.toDataURL('image/png'));
      fs.writeFileSync(path.join(output, 'adverts.png'), Buffer.from(atlas.split(',')[1], 'base64'));
      fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({status:'passed',startedAt,completedAt:new Date().toISOString(),result,engine,retail,customSkin,appScreens,errors,warnings,warningCounts},null,2));
      assert.deepEqual(errors, [], 'Uncaught JavaScript errors');
      console.log('PASS gameplay, phone and adverts', JSON.stringify(result));
    } catch (error) {
      const failedState=await state();
      fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'failed',startedAt,failedState,error:String(error),errors,warnings,warningCounts},null,2));
      console.error('READINESS FAILURE', JSON.stringify(failedState));
      console.error('WARNINGS', JSON.stringify(warnings));
      console.error('ERRORS', JSON.stringify(errors));
      throw error;
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
