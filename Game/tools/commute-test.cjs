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
    await page.goto(`http://127.0.0.1:${server.address().port}/?persist=0`);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('pause')).filter),'none','Shared color theme must load without parent grayscale');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('mres')).borderRadius),'0px','Redesigned controls stylesheet must load');
    const state = () => page.evaluate(() => ({ mode: player.mode, cities: world?.cities.length,
      hq: !!player.hq, outfit: player.outfit, cast: pplLib.ready.length,
      boot: document.getElementById('bootstage').textContent, loading: !document.getElementById('boot').hidden,
      cutscene: cut.active, placed: player.placed, x: player.pos.x, z: player.pos.z, phoneOpen:phone.open,phoneBox:(()=>{const r=document.getElementById('phone').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};})(),stationSignNames: signNames.length, signAtlasSize: signCanvas ? [signCanvas.width,signCanvas.height] : null }));
    try {
      await page.waitForFunction(() => document.body.classList.contains('titleup'), null, { timeout: 240000 });
      console.log('PASS title and world generation', JSON.stringify(await state()));
      const stations=await page.evaluate(()=>{const city=world.cities[0],st=city.stations.find(s=>s.name==='SOTI'),central=city.stations.find(s=>s.terminus);if(!st?.frame||!st.conc)throw Error('SOTI lacks a built platform/concourse');if(!central.architecture?.curvedGlass)throw Error('Central glass atrium missing');const dest=railDestinations().find(d=>d.name==='SOTI');if(!dest)throw Error('No Central to SOTI service');return {station:st.centre,walkToOffice:Math.hypot(st.centre[0]-story.soti.at[0],st.centre[1]-story.soti.at[1]),fare:dest.fare,platforms:city.furniture.platforms.length,atrium:central.architecture};});
      assert.equal(stations.fare,180);console.log('PASS SOTI rail connection, platforms and Central atrium',JSON.stringify(stations));
      await page.keyboard.press('Enter');await page.waitForFunction(()=>document.getElementById('boot').hidden&&player.hq&&player.outfit==='village',null,{timeout:120000});
      await page.evaluate(()=>{cutFinish(true);paused=true;});
      await page.waitForFunction(()=>!cut.active&&interior.active&&interior.bld,null,{timeout:30000});
      await page.evaluate(()=>{paused=true;const idx=interior.bld.floors.findIndex(f=>f.id===2);interiorGoLevel(idx);});
      await page.waitForFunction(()=>interior.bld.floors[interior.bld.idx].id===2);
      await page.evaluate(()=>{const sp=interior.room.spots.find(s=>s.brand==='clothes');if(!sp)throw Error('Suit Select door missing');interiorEnterStore(sp);purse.yen=3600;story.owned={village:true};story.flags={};story.wearing='village';outfitBuy(STORE_SHELVES.clothes.find(s=>s.name==='Suits').items[0]);});
      await page.waitForFunction(()=>player.outfit==='suit_charcoal'&&!wardrobe.loading,null,{timeout:60000});
      const offer=await page.evaluate(()=>{storyCommuteChoice();return {money:purse.yen,time:gameMinutes(),step:story.step,choices:interior.modal.opts.map(o=>[o[0],o[1]])};});
      assert.equal(offer.money,1800);assert.ok(Math.abs(offer.time-522)<.1);assert.equal(offer.step,'toSoti');assert.ok(offer.choices.some(c=>c[0]==='ryde'&&c[1].includes('1,460')));console.log('PASS trade-in budget, 08:42 deadline and commute choice',JSON.stringify(offer));
      await page.evaluate(()=>{interior.modal.opts.find(o=>o[0]==='rail')[2]();});
      await page.waitForFunction(()=>interior.bld.floors[interior.bld.idx].id===1);
      const boarded=await page.evaluate(()=>{const gate=interior.room.spots.find(s=>s.act==='platforms');if(!gate)throw Error('Ticket gates missing');railTicketOpen();const d=railDestinations().find(d=>d.name==='SOTI');interior.modal=null;interior.cardEl.classList.remove('on');railTripStart(d);const y=world.walkY(player.pos.x,player.pos.z,player.pos.y);if(Math.abs(y-player.pos.y)>.2)throw Error('Seiko waiting off platform '+JSON.stringify({y,position:player.pos.toArray()}));cutFinish(true);updateRide(0);setWeatherShelter();const cabin=trainCabinEnsure.root;if(!drive.train||!cabin.visible)throw Error('Passenger cabin missing');return {money:purse.yen,meshes:(()=>{let n=0;cabin.traverse(o=>{if(o.isMesh)n++;});return n;})(),rainVisible:shigoto.engine.weather.rain.visible};});
      assert.equal(boarded.money,1620);assert.ok(boarded.meshes>4);console.log('PASS paid local boarding and visible train cabin',JSON.stringify(boarded));
      const rain=await page.evaluate(()=>{shigoto.weather('rain',true);setWeatherShelter();return {rain:shigoto.engine.weather.rain.visible,splash:shigoto.engine.weather.splash.visible};});assert.equal(rain.rain,false);assert.equal(rain.splash,false);
      const arrival=await page.evaluate(()=>{const d=drive.train.trip,set=rail.sets[drive.train.set],k=TRAIN_KINDS[set.kind];set.s=d.to.s+k.cars*(k.L+k.gap)*.5;set.dwell=12;updateRide(0);railTripTick(.1);return {riding:!!drive.train,trip:railTrip.on,crowd:actors.list.filter(a=>a.tag==='commute').length,pos:player.pos.toArray(),target:nav.waypoint};});assert.equal(arrival.riding,false);assert.equal(arrival.trip,false);assert.equal(arrival.crowd,8);console.log('PASS SOTI arrival, office commuters and final walking route',JSON.stringify(arrival));
      const office=await page.evaluate(()=>{const r=storyOfficeRoom();r.group.visible=true;const before=renderer.getRenderTarget();camera.position.set(r.ox+3,interior.floorY+1.8,r.oz+3);camera.lookAt(r.ox,interior.floorY+1.4,r.oz-2);setWeatherShelter();const target=new THREE.WebGLRenderTarget(64,64),pixels=new Uint8Array(64*64*4);try{renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,64,64,pixels);}finally{renderer.setRenderTarget(before);target.dispose();}let mapped=0,normal=0,rough=0,views=0;r.group.traverse(o=>{if(!o.isMesh)return;for(const m of [].concat(o.material)){if(m.map)mapped++;if(m.normalMap)normal++;if(m.roughnessMap)rough++;if(Object.values(storySkylineTex.targets).some(t=>t.texture===m.map))views++;}});const lit=pixels.filter((v,i)=>i%4!==3&&v>12).length;r.group.visible=false;return {mapped,normal,rough,views,lit,rain:shigoto.engine.weather.rain.visible,shaderFailures:SHIGOTO.shaderFailures(renderer)};});console.log('OFFICE METRICS',JSON.stringify(office));assert.ok(office.mapped>=5&&office.normal>=3&&office.rough>=3&&office.views===2&&office.lit>100);assert.equal(office.rain,false);assert.deepEqual(office.shaderFailures,[]);console.log('PASS textured boss office, generated city views and dry/nonblack rendering',JSON.stringify(office));
      await page.evaluate(pos=>{player.pos.fromArray(pos);player.obj.position.copy(player.pos);setPaused(true);setPauseTab(0);},arrival.pos);
      await page.locator('#mapsearch').fill('SOTI');await page.locator('#mapresults button').first().click();
      const map=await page.evaluate(()=>({x:nav.mapCx,z:nav.mapCz,zoom:nav.mapZoom,waypoint:nav.waypoint,road:!!nav.baseRoad}));assert.equal(map.road,true);assert.ok(Math.hypot(map.x-stations.station[0],map.z-stations.station[1])<1);await page.locator('#mapzoomin').click();assert.ok(await page.evaluate(z=>nav.mapZoom>z,map.zoom));await page.locator('#maplocate').click();assert.ok(await page.evaluate(()=>Math.hypot(nav.mapCx-player.pos.x,nav.mapCz-player.pos.z)<1));console.log('PASS pause map search, destination, zoom and recenter');
      assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'passed',stations,offer,boarded,arrival,office,map,errors,warnings},null,2));
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
