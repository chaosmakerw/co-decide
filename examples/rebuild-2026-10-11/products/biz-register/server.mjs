import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const host = '127.0.0.1';
const defaultPort = 4317;
const rawPort = process.env.PORT;
const port = rawPort === undefined ? defaultPort : Number(rawPort);

if (rawPort !== undefined && (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535)) {
  console.error('启动失败：PORT 必须是 1 到 65535 之间的整数。');
  process.exitCode = 1;
} else {
  const root = dirname(fileURLToPath(import.meta.url));
  const files = new Map([
    ['/index.html', ['index.html', 'text/html; charset=utf-8']],
    ['/app.css', ['app.css', 'text/css; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/leave-core.js', ['leave-core.js', 'text/javascript; charset=utf-8']],
    ['/choice-preview.html', ['choice-preview.html', 'text/html; charset=utf-8']],
    ['/members.csv', ['members.csv', 'text/csv; charset=utf-8']],
  ]);

  function reply(request, response, status, message, extraHeaders = {}) {
    response.writeHead(status, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    });
    response.end(request.method === 'HEAD' ? undefined : message);
  }

  const server = createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      reply(request, response, 405, '此服务仅支持读取页面和静态文件。\n', { Allow: 'GET, HEAD' });
      return;
    }

    // Match the original path exactly: URL normalization must not turn a traversal into a valid route.
    const pathname = (request.url ?? '').split('?', 1)[0];
    const file = files.get(pathname === '/' ? '/index.html' : pathname);
    if (!file) {
      reply(request, response, 404, '未找到该页面或文件。\n');
      return;
    }

    try {
      const body = await readFile(join(root, file[0]));
      response.writeHead(200, {
        'Content-Type': file[1],
        'Content-Length': body.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
        reply(request, response, 404, '未找到该页面或文件。\n');
      } else {
        console.error(`读取 ${file[0]} 失败：${error.code ?? '未知错误'}`);
        reply(request, response, 500, '暂时无法读取文件，请稍后重试。\n');
      }
    }
  });

  server.on('error', (error) => {
    const reason = error.code === 'EADDRINUSE'
      ? `端口 ${port} 已被占用，可以设置 PORT 后重新启动。`
      : `无法监听本机地址（${error.code ?? '未知错误'}）。`;
    console.error(`启动失败：${reason}`);
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    console.log(`请假工具已启动： http://localhost:${port}`);
    console.log('仅限本机访问；浏览器保存本机数据。按 Ctrl+C 关闭服务。');
  });

  let closing = false;
  function shutdown() {
    if (closing) return;
    closing = true;
    console.log('\n正在关闭本机服务…');
    server.close((error) => {
      if (error) {
        console.error('关闭服务失败。');
        process.exitCode = 1;
      }
    });
    server.closeAllConnections();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
