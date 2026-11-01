// Functional readiness check. Stage first; requires Playwright and Chromium.
// PLAYWRIGHT=/path/to/playwright CHROME=/path/to/chromium node tools/readiness-test.cjs /tmp/salaryman-check
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const game = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || '/tmp/salaryman-cinematic');
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

    await page.waitForFunction(()=>document.body.classList.contains('titleup'),null,{timeout:240000});
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.getElementById('boot').hidden&&cut.active&&player.hq&&player.outfit==='village',null,{timeout:240000});
    const start=await page.evaluate(()=>{
      window.cinemaCounters={ambient:0,physics:shigoto?.engine?.frame||0};
      for(const name of ['updateParking','updateWanted','updateMyNet','pedsTick']){const original=window[name];window[name]=function(...args){cinemaCounters.ambient++;return original(...args);};}
      const shots=cut.shots.map(s=>({duration:s.dur,fov:s.fov,lines:s.lines||[]}));
      const before={fov:cut.fovWas,exposure:renderer.toneMappingExposure};
      tick(1/30);tick(1/30);tick(1/30);
      const first=cut.t;paused=true;tick(1/30);const stayed=cut.t===first;paused=false;
      return {shots,before,cinematic:gfx.cinematic,actors:actors.list.filter(a=>a.tag==='family').length,ambient:cinemaCounters.ambient,physicsStayed:!shigoto?.engine||shigoto.engine.frame===cinemaCounters.physics,pauseStayed:stayed,position:camera.position.toArray(),size:renderer.getDrawingBufferSize(new THREE.Vector2()).toArray()};
    });
    assert.equal(start.shots.length,13);assert.equal(start.cinematic,true);assert.equal(start.actors,3);assert.equal(start.ambient,0);assert.equal(start.physicsStayed,true);assert.equal(start.pauseStayed,true);assert.ok(start.position.every(Number.isFinite));assert.ok(start.size[0]*start.size[1]<=1920*1080*1.003);
    const duration=start.shots.reduce((n,s)=>n+s.duration,0);assert.ok(duration>=40&&duration<50);
    for(const shot of start.shots){assert.ok(shot.fov>=35&&shot.fov<=60);assert.ok(shot.lines.every(line=>line[0]<shot.duration));}
    await page.keyboard.down('Space');
    await page.waitForFunction(()=>!cut.active&&story.step==='suit',null,{timeout:60000});
    await page.keyboard.up('Space');
    const finish=await page.evaluate(()=>({cinematic:gfx.cinematic,fov:camera.fov,exposure:renderer.toneMappingExposure,family:actors.list.filter(a=>a.tag==='family').length,player:player.placed,step:story.step}));
    assert.equal(finish.cinematic,false);assert.equal(finish.fov,start.before.fov);assert.ok(Number.isFinite(finish.exposure)&&finish.exposure>0);assert.equal(finish.family,0);assert.equal(finish.player,true);assert.equal(finish.step,'suit');assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'passed',startedAt,completedAt:new Date().toISOString(),duration,start,finish,errors,warnings},null,2));
    console.log('PASS opening cast, 13 paced camera shots, reduced background work, cinematic pixel budget, pause, held-key skip and clean story handoff',JSON.stringify({duration,finish}));
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
