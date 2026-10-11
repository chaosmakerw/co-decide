import http from 'node:http';
import { realpath, open } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const publicFiles = new Set([
  'index.html', 'styles.css', 'app.js', 'reading-model.js', 'books.csv', 'favicon.svg',
]);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendError(response, status, message, method) {
  const body = Buffer.from(message, 'utf8');
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'X-Content-Type-Options': 'nosniff',
    ...(status === 405 ? { Allow: 'GET, HEAD' } : {}),
  });
  response.end(method === 'HEAD' ? undefined : body);
}

function getPublicPath(rawUrl) {
  const rawPath = (rawUrl || '/').split(/[?#]/, 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return { error: 400 };
  }

  // Inspect the original request path, before any URL parser can normalize it.
  if (!decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0')) {
    return { error: 404 };
  }
  const segments = decoded.slice(1).split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return { error: 404 };
  }

  const file = decoded === '/' ? 'index.html' : decoded.slice(1);
  if (publicFiles.has(file)) return { file };
  if (file.startsWith('assets/') && segments.slice(1).every((segment) => segment && !segment.startsWith('.') && !segment.includes('%'))) {
    return { file };
  }
  return { error: 404 };
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

export function createServer({ root = process.cwd() } = {}) {
  const absoluteRoot = path.resolve(root);
  return http.createServer(async (request, response) => {
    const method = request.method;
    if (method !== 'GET' && method !== 'HEAD') {
      sendError(response, 405, 'Method not allowed', method);
      return;
    }

    const publicPath = getPublicPath(request.url);
    if (publicPath.error) {
      sendError(response, publicPath.error, publicPath.error === 400 ? 'Invalid request path' : 'Not found', method);
      return;
    }

    let handle;
    try {
      const resolvedRoot = await realpath(absoluteRoot);
      const expectedFile = path.join(resolvedRoot, publicPath.file);
      const resolvedFile = await realpath(expectedFile);
      // Reject symlink aliases, including aliases to private files inside root.
      if (!isWithin(resolvedRoot, resolvedFile) || path.relative(expectedFile, resolvedFile) !== '') {
        sendError(response, 404, 'Not found', method);
        return;
      }
      handle = await open(resolvedFile, 'r');
      const stat = await handle.stat();
      if (!stat.isFile()) {
        sendError(response, 404, 'Not found', method);
        return;
      }
      const body = method === 'HEAD' ? undefined : await handle.readFile();
      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(resolvedFile).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body ? body.length : stat.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(body);
    } catch (error) {
      const missing = ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'ELOOP'].includes(error.code);
      sendError(response, missing ? 404 : 500, missing ? 'Not found' : 'Unable to read file', method);
    } finally {
      await handle?.close().catch(() => {});
    }
  });
}

function getPort(value = '5173') {
  if (!/^\d+$/.test(value)) throw new Error('PORT 必须是 1 到 65535 之间的整数。');
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT 必须是 1 到 65535 之间的整数。');
  }
  return port;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const port = getPort(process.env.PORT);
    const server = createServer();
    server.on('error', (error) => {
      console.error(`启动失败：${error.message}`);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`阅读工具已启动：http://127.0.0.1:${port}`);
    });
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => server.close());
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
