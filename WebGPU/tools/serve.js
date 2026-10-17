// A tiny static file server for running the game in a browser during development: node tools/serve.js [port]
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const port = Number(process.argv[2] || 8123);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.obj': 'text/plain', '.wasm': 'application/wasm' };
http.createServer((req, res) => {
  const p = path.normalize(path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log('http://127.0.0.1:' + port));
