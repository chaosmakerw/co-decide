import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const files=new Set(['index.html','styles.css','app.js','domain.js','routes.html','routes-preview.png','app-desktop.png','app-mobile.png']);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png'};
const port=Number(process.env.PORT||4173);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT 必须为 1–65535 的整数。');
const server=http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
  let name;
  try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';}catch{res.writeHead(400);res.end('Bad request');return;}
  if(!files.has(name)){res.writeHead(404);res.end('Not found');return;}
  try{
    const body=await readFile(path.join(root,name));
    res.writeHead(200,{'Content-Type':mime[path.extname(name)],'Content-Length':body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`端口 ${port} 正在使用，请更换 PORT 后重试。`:error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`留白本地演示：http://127.0.0.1:${port}\n数据仅保存在当前浏览器，身份切换为演示。按 Ctrl+C 停止。`));
