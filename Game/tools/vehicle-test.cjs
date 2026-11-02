// Functional readiness check. Stage first; requires Playwright and Chromium.
// PLAYWRIGHT=/path/to/playwright CHROME=/path/to/chromium node tools/readiness-test.cjs /tmp/salaryman-check
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const game = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || '/tmp/salaryman-vehicles');
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
    page.on('pageerror', error => {errors.push(error.message);console.log('PAGE ERROR',error.message);});
    page.on('console', message => { if (['warning', 'error'].includes(message.type())) { const text = message.text(); warningCounts[text] = (warningCounts[text] || 0) + 1; if (warningCounts[text] === 1) { warnings.push(text); console.log(message.type(),text.slice(0,500)); } } });
    page.on('response', response => { if(response.url().includes('/cars/'))console.log('CAR RESPONSE',response.status(),new URL(response.url()).pathname);if(response.status() >= 400) console.log('HTTP',response.status(), new URL(response.url()).pathname); });
    await page.route('konto://vendor/**', route => route.fulfill({
      path: path.join(game, 'vendor', new URL(route.request().url()).pathname.split('/').pop()), contentType: 'text/javascript'
    }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);

    await page.waitForFunction(()=>document.body.classList.contains('titleup'),null,{timeout:240000});
    console.log("PASS title");
    await page.evaluate(async()=>{paused=true;await Promise.race([traffic.modelsReady,new Promise((_,no)=>setTimeout(()=>no(Error(JSON.stringify({pools:traffic.pool.map(p=>p?.items?.length),kinds:CAR_KINDS.map(k=>k.name)}))),120000))]);});
    console.log("PASS vehicle model loading");
    const results=await page.evaluate(()=>{
      // Freeze normal play, then exercise the same cheat and renderer paths.
      paused=true;story.step='free';player.placed=true;player.mode='walk';player.pos.set(2523,10,1645);
      const rows=[];
      for(const [cheat,entry] of Object.entries(CHEAT_VEHICLES)){
        if(['plane','skydive','heli'].includes(entry.kind))continue;
        if(!runCheat(cheat))throw Error('Cheat rejected: '+cheat);
        if(!drive.car)throw Error('No drivable vehicle: '+cheat);
        updateTraffic(0,drive.car.pos);
        const pool=traffic.pool[drive.car.kind],o=pool?.items[0];
        if(!o||!o.visible)throw Error('Detailed vehicle not visible: '+cheat);
        let tris=0;o.traverse(m=>{if(m.isMesh)tris+=(m.geometry.index?.count||m.geometry.attributes.position?.count||0)/3;});
        if(!Number.isFinite(tris)||tris<200)throw Error('Invalid vehicle geometry: '+cheat);
        const k=CAR_KINDS[drive.car.kind].name;rows.push({cheat,kind:k,triangles:Math.round(tris),source:CAR_MODELS[k].url||'authored mesh'});
        drive.car=null;drive.parked.length=0;
      }
      if(traffic.paint.some(m=>m.visible)||traffic.trim.some(m=>m.visible)||traffic.deco.some(m=>m?.visible))throw Error('Block car fallback remains visible');
      if(traffic.paint.some(m=>m.geometry.attributes.position))throw Error('Legacy block geometry allocated');
      const c=document.createElement('canvas');c.width=512;c.height=1024;const g=c.getContext('2d');
      for(const app of Object.keys(PHONE_SCREENS)){phone.app=app;phone.sub=0;phone.site=null;phone.ryde=null;phone.entry=null;phone.vmail='';if(app==='Camera')continue;PHONE_SCREENS[app](g,512,1024);}
      phone.app='Ryde';phone.ryde={cls:'Sedan',plate:'KONTO 42',fare:2100,eta:2,eta0:3};appRyde(g,512,1024);phone.ryde=null;
      const s=new THREE.Scene(),cam=new THREE.PerspectiveCamera(50,1,.1,100);cam.position.set(8,4,8);cam.lookAt(0,1,0);s.add(new THREE.HemisphereLight(0xffffff,0x404040,1));
      const ki=CAR_KINDS.findIndex(k=>k.name==='ryde'),o=traffic.pool[ki].items[0];o.position.set(0,0,0);o.rotation.set(0,0,0);o.visible=true;const copy=o.clone(true);s.add(copy);renderer.render(s,cam);
      if(!o.userData.rydeLivery||!o.userData.rydeLivery.children.length)throw Error('Missing RYDE fleet livery');
      if(renderer.info.programs.some(p=>p.diagnostics?.runnable===false))throw Error('Vehicle shader failure');
      return {rows,apps:Object.keys(PHONE_SCREENS),hiddenFallbacks:true,rydeLivery:true};
    });
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'passed',results,errors,warnings},null,2));
    console.log('PASS detailed cheat vehicles, block geometry removed, app screens and RYDE livery',JSON.stringify(results));
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
