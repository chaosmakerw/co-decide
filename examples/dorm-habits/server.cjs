'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/styles.css': ['styles.css', 'text/css; charset=utf-8'] };
const port = Number(process.env.DORM_DEMO_PORT || 4173);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid DORM_DEMO_PORT');
const server = http.createServer((request, response) => {
  const entry = files[request.url.split('?')[0]];
  if (!entry || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
  if (request.method === 'HEAD') response.end();
  else fs.createReadStream(path.join(__dirname, entry[0])).pipe(response);
});
server.listen(port, '127.0.0.1', () => console.log(`READY http://127.0.0.1:${server.address().port}/`));
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已占用；请选择其他 DORM_DEMO_PORT，不要结束无关进程。` : error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
