#!/usr/bin/env node
// Zero-dependency static server: `npm start`, then open http://localhost:8080
// (Opening index.html directly also works; this mirrors how GitHub Pages serves it.)
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.PORT || 8080;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/markdown', '.csv': 'text/csv', '.txt': 'text/plain' };
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`KURUKSHETRA running at http://localhost:${PORT}`));
