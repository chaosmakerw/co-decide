import { createServer } from 'node:http';
import { open, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = await realpath(dirname(fileURLToPath(import.meta.url)));
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

function withinRoot(candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot);
}

function sendError(response, status) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
  response.end(status === 404 ? 'Not found' : status === 405 ? 'Method not allowed' : 'Bad request');
}

export function createStaticServer() {
  return createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      sendError(response, 405);
      return;
    }

    let handle;
    try {
      // Inspect the unnormalized request path so encoded dot segments cannot disappear.
      const pathname = decodeURIComponent((request.url ?? '').split(/[?#]/, 1)[0]);
      if (!pathname.startsWith('/') || /[\\\0:]/.test(pathname)) {
        sendError(response, 400);
        return;
      }
      const segments = pathname.split('/').filter(Boolean);
      if (segments.some((segment) => segment.startsWith('.'))) {
        sendError(response, 404);
        return;
      }
      const requestedFile = segments.length === 0 ? 'index.html' : segments.join(sep);
      const contentType = contentTypes.get(extname(requestedFile).toLowerCase());
      const candidate = resolve(root, requestedFile);
      if (!contentType || !withinRoot(candidate)) {
        sendError(response, 404);
        return;
      }
      const actualFile = await realpath(candidate);
      const actualContentType = contentTypes.get(extname(actualFile).toLowerCase());
      const actualSegments = relative(root, actualFile).split(sep);
      if (!withinRoot(actualFile) || !actualContentType || actualSegments.some((segment) => segment.startsWith('.'))) {
        sendError(response, 404);
        return;
      }
      handle = await open(actualFile, 'r');
      const stats = await handle.stat();
      if (!stats.isFile()) {
        await handle.close();
        handle = undefined;
        sendError(response, 404);
        return;
      }
      response.writeHead(200, {
        'Content-Type': actualContentType,
        'Content-Length': stats.size,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache',
      });
      if (request.method === 'HEAD') {
        await handle.close();
        handle = undefined;
        response.end();
        return;
      }
      const stream = handle.createReadStream();
      handle = undefined;
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      if (response.headersSent) {
        response.destroy();
      } else {
        sendError(response, error instanceof URIError ? 400 : 404);
      }
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT 必须是 1 到 65535 之间的整数。');
    process.exitCode = 1;
  } else {
    const server = createStaticServer();
    server.on('error', (error) => {
      console.error(`启动失败：${error.code ?? 'SERVER_ERROR'}`);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`阅读工具已启动：http://127.0.0.1:${port}`);
    });
  }
}
