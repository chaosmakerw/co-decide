import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const host = '127.0.0.1';
const servers = new Set();
const children = new Set();
const states = [];
let closing = false;

function inside(base, target) {
  const relative = path.relative(base,target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function localPath(base, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('清单路径必须是有效相对路径');
  const resolved = path.resolve(base,relative);
  if (!inside(base,resolved)) throw new Error('清单路径超出应用目录');
  return resolved;
}

async function realInside(base, target) {
  const [realBase,realTarget] = await Promise.all([fs.realpath(base),fs.realpath(target)]);
  if (!inside(realBase,realTarget)) throw new Error('文件路径超出可访问目录');
  return realTarget;
}

const mime = {
  '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.svg':'image/svg+xml',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp',
  '.ico':'image/x-icon','.csv':'text/csv; charset=utf-8','.md':'text/plain; charset=utf-8',
  '.txt':'text/plain; charset=utf-8','.pdf':'application/pdf'
};

function reply(response,status,body,type = 'text/plain; charset=utf-8') {
  response.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  response.end(body);
}

function staticHandler(directory, entry, gallery = false) {
  return async (request,response) => {
    if (!['GET','HEAD'].includes(request.method)) { reply(response,405,'Method not allowed'); return; }
    try {
      const pathname = decodeURIComponent(new URL(request.url,`http://${host}`).pathname);
      if (gallery && pathname === '/api/apps') { reply(response,200,JSON.stringify(states),'application/json; charset=utf-8'); return; }
      if (pathname.includes('\\') || pathname.includes('\0')) { reply(response,400,'Invalid path'); return; }
      const relative = pathname === '/' ? entry : pathname.slice(1);
      let target = localPath(directory,relative);
      let stat = await fs.stat(target);
      if (stat.isDirectory()) { target = path.join(target,'index.html'); stat = await fs.stat(target); }
      if (!stat.isFile()) { reply(response,404,'Not found'); return; }
      target = await realInside(directory,target);
      const content = await fs.readFile(target);
      response.writeHead(200,{'Content-Type':mime[path.extname(target).toLowerCase()] || 'application/octet-stream','Content-Length':content.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (error instanceof URIError) reply(response,400,'Invalid path');
      else reply(response,404,'Not found');
    }
  };
}

async function listen(server, port = 0) {
  if (closing) throw new Error('查看服务正在关闭');
  servers.add(server);
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(port,host,resolve); });
  return server.address().port;
}

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve,reject) => { probe.once('error',reject); probe.listen(0,host,resolve); });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

function reachable(url) {
  return new Promise(resolve => {
    const request = http.get(url,response => { response.resume(); resolve(response.statusCode >= 200 && response.statusCode < 400); });
    request.setTimeout(500,() => request.destroy());
    request.on('error',() => resolve(false));
  });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve,ms)); }

async function launch(product) {
  if (closing) throw new Error('查看服务正在关闭');
  if (!/^[a-z0-9-]+$/.test(product.id || '')) throw new Error('成品 ID 无效');
  const directory = localPath(root,product.directory);
  await realInside(root,directory);
  if (!(await fs.stat(directory)).isDirectory()) throw new Error('应用目录不存在');
  const entry = product.entry || 'index.html';
  localPath(directory,entry);
  let port;
  if (product.server) {
    const serverFile = localPath(directory,product.server);
    await realInside(directory,serverFile);
    port = await freePort();
    if (closing) throw new Error('查看服务正在关闭');
    const child = spawn(process.execPath,[serverFile],{
      cwd:directory,env:{...process.env,PORT:String(port),HOST:host},
      stdio:['ignore','pipe','pipe'],windowsHide:true
    });
    children.add(child);
    let failed;
    child.on('error',error => { failed = error.message; });
    child.on('exit',code => { children.delete(child); if (!closing) { failed = `服务已退出（${code}）`; const state = states.find(item => item.id === product.id); if (state) { delete state.url; state.error = failed; } } });
    for (const stream of [child.stdout,child.stderr]) stream.on('data',chunk => process.stdout.write(`[${product.id}] ${chunk.toString().trimEnd()}\n`));
    const url = `http://${host}:${port}/${entry.split('/').map(encodeURIComponent).join('/')}`;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (closing || failed || child.exitCode !== null) break;
      if (await reachable(url)) return url;
      await delay(100);
    }
    throw new Error(failed || '应用启动后未能访问入口');
  }
  port = await listen(http.createServer(staticHandler(directory,entry)));
  return `http://${host}:${port}/${entry.split('/').map(encodeURIComponent).join('/')}`;
}

async function cleanup() {
  if (closing) return;
  closing = true;
  const closingServers = [...servers].map(server => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections?.();
  }));
  const closingChildren = [...children].map(child => new Promise(resolve => {
    if (child.exitCode !== null) { resolve(); return; }
    let timeout;
    child.once('exit',() => { clearTimeout(timeout); resolve(); });
    child.kill('SIGTERM');
    timeout = setTimeout(() => { child.kill('SIGKILL'); resolve(); },2500);
  }));
  await Promise.allSettled([...closingServers,...closingChildren]);
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(root,'products.json'),'utf8'));
  const products = Array.isArray(manifest) ? manifest : manifest.products;
  if (!Array.isArray(products) || !products.length) throw new Error('products.json 尚无成品清单');
  const identifiers = new Set();
  for (const product of products) {
    if (closing) return;
    if (identifiers.has(product.id)) throw new Error('成品 ID 重复');
    identifiers.add(product.id);
    const state = {id:product.id}; states.push(state);
    try { state.url = await launch(product); }
    catch (error) { state.error = error.message; console.error(`[${product.id}] ${state.error}`); }
    if (closing) return;
  }
  const port = await listen(http.createServer(staticHandler(root,'gallery.html',true)));
  console.log(`\n查看成品：http://${host}:${port}/\n按 Ctrl+C 关闭本次启动的服务。`);
}

for (const signal of ['SIGINT','SIGTERM','SIGBREAK']) process.on(signal,() => { cleanup().then(() => process.exit(0)); });
main().catch(async error => { console.error(`启动失败：${error.message}`); await cleanup(); process.exitCode = 1; });
