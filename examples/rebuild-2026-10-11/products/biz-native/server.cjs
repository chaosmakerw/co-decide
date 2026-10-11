'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  loadMembers,
  createSeed,
  migrateState,
  createRequest,
  cancelRequest,
  viewFor,
} = require('./domain.cjs');

const MAX_BODY_BYTES = 32 * 1024;
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function publicError(message, status) {
  return Object.assign(new Error(message), { status });
}

function persist(file, nextState) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryFile = path.join(directory, `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporaryFile, `${JSON.stringify(nextState, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporaryFile, file);
  } catch (error) {
    try { fs.unlinkSync(temporaryFile); } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') console.error('清理临时数据失败：', cleanupError.code);
    }
    throw error;
  }
}

function setSecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader('Cache-Control', 'no-store');
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  const contentType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    request.resume();
    return Promise.reject(publicError('请使用 application/json 提交数据。', 415));
  }
  if (Number(request.headers['content-length']) > MAX_BODY_BYTES) {
    request.resume();
    return Promise.reject(publicError('提交内容超过 32 KB。', 413));
  }
  return new Promise((resolve, reject) => {
    let length = 0;
    let completed = false;
    const chunks = [];
    const fail = (error) => {
      if (completed) return;
      completed = true;
      reject(error);
    };
    request.on('data', (chunk) => {
      if (completed) return;
      length += chunk.length;
      if (length > MAX_BODY_BYTES) {
        chunks.length = 0;
        fail(publicError('提交内容超过 32 KB。', 413));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (completed) return;
      try {
        const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!result || typeof result !== 'object' || Array.isArray(result)) {
          throw publicError('提交内容必须是 JSON 对象。', 400);
        }
        completed = true;
        resolve(result);
      } catch (error) {
        fail(error.status ? error : publicError('JSON 格式不正确。', 400));
      }
    });
    request.on('error', () => fail(publicError('读取提交内容失败。', 400)));
    request.on('aborted', () => fail(publicError('提交已中断。', 400)));
  });
}

function csvCell(value) {
  let text = value == null ? '' : String(value);
  // Spreadsheet applications also recognize formula markers after whitespace.
  if (/^\s*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function exportCsv(view) {
  const members = new Map(view.members.map((member) => [member.id, member.name]));
  const types = { annual: '年假', personal: '事假', sick: '病假', comp: '调休' };
  const statuses = { registered: '已登记', rejected: '历史已拒绝', cancelled: '已撤回' };
  const rows = [['登记编号', '姓名', '假期类型', '开始日期', '开始时段', '结束日期', '结束时段', '天数', '事由', '交接安排', '状态', '历史审批人', '历史审批说明']];
  for (const request of view.requests) {
    rows.push([
      request.id, members.get(request.memberId) || '', types[request.type] || request.type,
      request.startDate, request.startPeriod === 'am' ? '上午' : '下午',
      request.endDate, request.endPeriod === 'am' ? '上午' : '下午', request.days,
      request.reason, request.handover, statuses[request.status] || request.status,
      members.get(request.decisionBy) || '', request.decisionNote,
    ]);
  }
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** Create an isolated local demo server. The caller owns listen() and close(). */
function createApp(options = {}) {
  const dataFile = path.resolve(options.dataFile || path.join(__dirname, 'data', 'leave-data.json'));
  const membersFile = path.resolve(options.membersFile || path.join(__dirname, 'members.csv'));
  const today = () => typeof options.today === 'function' ? options.today() : options.today || localToday();
  const members = loadMembers(fs.readFileSync(membersFile, 'utf8'));
  let state;
  if (fs.existsSync(dataFile)) {
    const previousState = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const migratedState = migrateState(previousState);
    // Persist every actual migration, including legacy statuses in a v2 file.
    // Publish the new state only after the atomic save succeeds.
    if (JSON.stringify(migratedState) !== JSON.stringify(previousState)) persist(dataFile, migratedState);
    state = migratedState;
  } else {
    state = createSeed(members, today());
    persist(dataFile, state);
  }

  function actorFor(request) {
    const actorId = request.headers['x-demo-actor'];
    if (typeof actorId !== 'string' || !state.members.some((member) => member.id === actorId)) {
      throw publicError('请选择有效的本地演示身份。', 403);
    }
    return actorId;
  }

  function view(actorId) {
    const currentToday = today();
    return { ...viewFor({ ...state, todayIso: currentToday }, actorId), today: currentToday, demo: true };
  }

  function mutate(actorId, action) {
    const nextState = structuredClone(state);
    nextState.todayIso = today();
    action(nextState);
    try { persist(dataFile, nextState); } catch (error) {
      console.error('保存请假数据失败：', error.code || 'UNKNOWN');
      throw publicError('保存失败，数据没有变更，请稍后重试。', 500);
    }
    state = nextState;
    return view(actorId);
  }

  const server = http.createServer(async (request, response) => {
    setSecurityHeaders(response);
    try {
      const origin = request.headers.origin;
      const port = request.socket.localPort;
      if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) {
        throw publicError('仅接受当前本地演示页面的请求。', 403);
      }
      // Match the original path, so URL normalization cannot turn traversal into a permitted file.
      const pathname = (request.url || '').split('?', 1)[0];
      if (!pathname.startsWith('/') || pathname.includes('#')) throw publicError('路径不存在。', 404);

      if (pathname === '/api/bootstrap') {
        if (request.method !== 'GET') throw publicError('此接口仅支持 GET。', 405);
        sendJson(response, 200, { members: state.members, today: today(), demo: true });
        return;
      }

      if (pathname === '/api/state' || pathname === '/api/export') {
        if (request.method !== 'GET') throw publicError('此接口仅支持 GET。', 405);
        const actorId = actorFor(request);
        const currentView = view(actorId);
        if (pathname === '/api/state') sendJson(response, 200, currentView);
        else {
          response.writeHead(200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="leave-requests.csv"',
          });
          response.end(exportCsv(currentView));
        }
        return;
      }

      const actionMatch = /^\/api\/requests\/([A-Za-z0-9_-]+)\/(decision|cancel)$/.exec(pathname);
      if (pathname === '/api/requests' || actionMatch) {
        if (request.method !== 'POST') throw publicError('此接口仅支持 POST。', 405);
        const actorId = actorFor(request);
        if (actionMatch?.[2] === 'decision') {
          request.resume();
          throw publicError('审批接口已停用。请假提交即登记生效，同日多人请假请协商安排。', 410);
        }
        const input = await readJson(request);
        const currentView = mutate(actorId, (nextState) => {
          if (!actionMatch) createRequest(nextState, actorId, input, today());
          else cancelRequest(nextState, actorId, actionMatch[1]);
        });
        sendJson(response, actionMatch ? 200 : 201, currentView);
        return;
      }

      const staticFile = STATIC_FILES.get(pathname);
      if (staticFile) {
        if (request.method !== 'GET' && request.method !== 'HEAD') throw publicError('此文件仅支持 GET 或 HEAD。', 405);
        const body = fs.readFileSync(path.join(__dirname, staticFile[0]));
        response.writeHead(200, { 'Content-Type': staticFile[1], 'Content-Length': body.length });
        response.end(request.method === 'HEAD' ? undefined : body);
        return;
      }
      throw publicError('路径不存在。', 404);
    } catch (error) {
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
      if (status === 500 && !error.status) console.error('本地服务错误：', error.code || error.name);
      if (!response.headersSent && !response.destroyed) {
        sendJson(response, status, { error: status === 500 && !error.status ? '服务暂时无法处理请求。' : error.message });
      }
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须是 1 到 65535 的整数。');
  const server = createApp();
  server.listen(port, '127.0.0.1', () => console.log(`请假管理本地演示：http://127.0.0.1:${port}`));
  server.on('error', (error) => {
    console.error('启动失败：', error.code || error.message);
    process.exitCode = 1;
  });
}

module.exports = { createApp };
