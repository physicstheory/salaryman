// Functional readiness check. Stage first; requires Playwright and Chromium.
// PLAYWRIGHT=/path/to/playwright CHROME=/path/to/chromium node tools/readiness-test.cjs /tmp/salaryman-check
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const game = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || '/tmp/salaryman-retail');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2' };
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
    assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('mres')).borderRadius),'9px','Redesigned controls stylesheet must load');
    const state = () => page.evaluate(() => ({ mode: player.mode, cities: world?.cities.length,
      hq: !!player.hq, outfit: player.outfit, cast: pplLib.ready.length,
      boot: document.getElementById('bootstage').textContent, loading: !document.getElementById('boot').hidden,
      cutscene: cut.active, placed: player.placed, x: player.pos.x, z: player.pos.z, stationSignNames: signNames.length, signAtlasSize: signCanvas ? [signCanvas.width,signCanvas.height] : null }));
    try {
      await page.waitForFunction(() => document.body.classList.contains('titleup'), null, { timeout: 240000 });
      console.log('PASS title and world generation', JSON.stringify(await state()));
      await page.evaluate(async()=>{await SalaryArt.ready;if(SalaryArt.state.failed.length)throw Error('Missing generated art');});
      await page.evaluate(() => {
        setPaused(true,'settings');
        document.head.insertAdjacentHTML('beforeend','<style>body>*:not(#stage):not(script):not(style){display:none!important}#stage{filter:none!important;opacity:1!important;transform:none!important}</style>');
        window.retailProof={rooms:[],windows:world.cities.reduce((n,c)=>n+(c.retailWindows||[]).length,0)};
        window.proofRender=(room,reverse)=>{
          const stage=new THREE.Scene();stage.background=new THREE.Color('#19343d');
          const copy=room.group.clone(true);copy.position.set(0,0,0);copy.visible=true;stage.add(copy);
          stage.add(new THREE.HemisphereLight(0xfff3df,0x5b6f6c,1.1));
          const c=new THREE.PerspectiveCamera(64,1280/720,.05,80);
          c.position.set(reverse?-2.2:2.4,2.05,reverse?-3.7:4.6);c.lookAt(0,1.6,reverse?3:-2.7);
          renderer.setRenderTarget(null);renderer.setPixelRatio(1);renderer.setSize(1280,720);renderer.render(stage,c);
        };
      });
      for(const brand of ['dokoto','books','clothes','plaza']){
        const rooms=await page.evaluate(brand=>{
          const list=brand==='dokoto'?MALL_FLOORS.map((f,i)=>interiorMallLevel({brand:'dokoto'},i)):[interiorRoom({brand})];
          list.forEach(r=>{
            if(!r.group.userData.salaryRetailRefurbished)throw Error('Missing refurbishment: '+r.key);
            if(!r.colliders.every(c=>Object.values(c).every(Number.isFinite)))throw Error('Invalid collider: '+r.key);
            if(!r.spots?.every(s=>Number.isFinite(s.x)&&Number.isFinite(s.z))&&r.spots)throw Error('Invalid navigation');
          });
          window.proofRooms=list;return list.map(r=>({key:r.key,identity:r.retailIdentity,items:r.items.length,colliders:r.colliders.length}));
        },brand);
        for(let i=0;i<rooms.length;i++){
          await page.evaluate(i=>proofRender(proofRooms[i],false),i);
          await page.screenshot({path:path.join(output,'interior-'+rooms[i].key.replace(':','-')+'.png'),timeout:120000});
        }
        if(brand==='dokoto'){
          await page.evaluate(()=>proofRender(proofRooms.find(r=>r.key==='dokoto:1'),true));
          await page.screenshot({path:path.join(output,'device-campaigns.png'),timeout:120000});
        }
        await page.evaluate(rows=>retailProof.rooms.push(...rows),rooms);
      }
      for(const side of [-1,1]){
        await page.evaluate(side=>{
          const s=new THREE.Scene();s.background=new THREE.Color('#19343d');
          const list=SalaryRetail.themes.map((th,i)=>({x:(i%3-1)*7.4,y:Math.floor(i/3)*3.7+1.7,z:0,ry:0,w:6.6,h:2.7,theme:i}));
          SalaryRetail.installWindows(s,list,()=>{},false);
          const c=new THREE.PerspectiveCamera(52,1280/720,.05,80);c.position.set(side*2.8,3.3,17);c.lookAt(0,3.3,0);
          renderer.render(s,c);
          const gl=renderer.getContext();if(gl.getError()!==gl.NO_ERROR)throw Error('Retail shader WebGL error');
          if(renderer.info.programs.some(p=>p.diagnostics&&p.diagnostics.runnable===false))throw Error('Retail shader failed compilation');
        },side);
        await page.screenshot({path:path.join(output,'windows-'+side+'.png'),timeout:120000});
      }
      const result=await page.evaluate(()=>({...retailProof,art:SalaryArt.state}));
      assert.ok(result.art.coated>0,'Fixtures must use the generated material surfaces');
      assert.equal(result.art.failed.length,0,'All generated art must load locally');
      assert.ok(result.windows>0,'Mapped shop windows must exist in the actual world');
      assert.equal(new Set(result.rooms.filter(r=>r.key.startsWith('dokoto:')).map(r=>r.identity)).size,5);
      assert.deepEqual(errors,[]);
      fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'passed',startedAt,completedAt:new Date().toISOString(),result,errors,warnings},null,2));
      console.log('PASS retail interiors, all five department floors, world windows and compiled parallax shader',JSON.stringify(result));
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
