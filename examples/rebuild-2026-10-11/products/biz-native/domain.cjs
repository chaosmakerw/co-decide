'use strict';

const { randomUUID } = require('node:crypto');

const DAY_MS = 86_400_000;
const ANNUAL_ALLOWANCE = 12;
const TYPES = new Set(['annual', 'personal', 'sick', 'comp']);
const MEMBER_COLORS = ['#bc684b', '#557d68', '#607e9d', '#9673a3', '#ac8743'];

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

// Keep every old record and its private/history fields while retiring approval.
function migrateState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)
    || ![1, 2].includes(state.version)
    || !Array.isArray(state.members) || !Array.isArray(state.requests)
    || [...state.members, ...state.requests].some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    fail(400, '请假数据格式无效，无法迁移。');
  }
  const migrated = structuredClone(state);
  migrated.version = 2;
  for (const request of migrated.requests) {
    if (request.status === 'pending' || request.status === 'approved') request.status = 'registered';
  }
  return migrated;
}

// The source roster is kept unchanged. Quoted CSV cells are supported too.
function readCsv(csvText) {
  if (typeof csvText !== 'string') fail(400, '成员文件需要是 CSV 文本。');
  const source = csvText.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      if (cell.length > 0 || closedQuote) fail(400, '成员 CSV 引号格式不正确。');
      quoted = true;
    } else if (char === ',' || char === '\r' || char === '\n') {
      row.push(cell.trim());
      cell = '';
      closedQuote = false;
      if (char !== ',') {
        if (row.some(value => value.length > 0)) rows.push(row);
        row = [];
        if (char === '\r' && source[i + 1] === '\n') i += 1;
      }
    } else {
      if (closedQuote && !/\s/.test(char)) fail(400, '成员 CSV 引号格式不正确。');
      if (!closedQuote) cell += char;
    }
  }
  if (quoted) fail(400, '成员 CSV 引号未闭合。');
  row.push(cell.trim());
  if (row.some(value => value.length > 0)) rows.push(row);
  return rows;
}

function loadMembers(csvText) {
  const rows = readCsv(csvText);
  if (!rows.length || rows[0].length !== 2 || rows[0][0] !== 'name' || rows[0][1] !== 'role') {
    fail(400, '成员 CSV 表头应为 name,role。');
  }
  const seen = new Set();
  const members = rows.slice(1).map((row, index) => {
    if (row.length !== 2) fail(400, '成员 CSV 每行应包含姓名和角色。');
    const [name, label] = row;
    if (!name || [...name].length > 40 || /[\u0000-\u001f\u007f]/.test(name)) {
      fail(400, '成员姓名需要为 1 至 40 个字符。');
    }
    if (seen.has(name)) fail(400, '成员 CSV 存在重复姓名。');
    seen.add(name);
    const role = label === '负责人' || label === 'manager' ? 'manager'
      : label === '成员' || label === 'member' ? 'member' : null;
    if (!role) fail(400, '成员角色应为负责人或成员。');
    return {
      id: `m${index + 1}`,
      name,
      role,
      title: role === 'manager' ? '团队负责人' : '团队成员',
      color: MEMBER_COLORS[index % MEMBER_COLORS.length],
    };
  });
  if (!members.length) fail(400, '团队至少需要一位成员。');
  if (!members.some(member => member.role === 'manager')) fail(400, '团队需要至少一位负责人。');
  return members;
}

function parseDate(value, label = '日期') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) {
    fail(400, `${label}应为有效的 YYYY-MM-DD 日期。`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail(400, `${label}不是有效的日历日期。`);
  }
  return date.getTime();
}

function getWindow(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, '请填写请假申请。');
  const startMs = parseDate(input.startDate, '开始日期');
  const endMs = parseDate(input.endDate, '结束日期');
  const startPeriod = input.startPeriod === undefined ? 'am' : input.startPeriod;
  const endPeriod = input.endPeriod === undefined ? 'pm' : input.endPeriod;
  if (!['am', 'pm'].includes(startPeriod) || !['am', 'pm'].includes(endPeriod)) {
    fail(400, '请假时段应为上午或下午。');
  }
  const first = (startMs / DAY_MS) * 2 + (startPeriod === 'pm' ? 1 : 0);
  const last = (endMs / DAY_MS) * 2 + (endPeriod === 'pm' ? 1 : 0);
  if (last < first) fail(400, '结束时间不能早于开始时间。');
  if ((endMs - startMs) / DAY_MS + 1 > 365) fail(400, '一次申请的日期范围最多为 365 天。');
  return { startMs, endMs, startPeriod, endPeriod, first, last };
}

function workingUnits(first, last) {
  let units = 0;
  const firstDay = Math.floor(first / 2);
  const lastDay = Math.floor(last / 2);
  for (let day = firstDay; day <= lastDay; day += 1) {
    const weekday = new Date(day * DAY_MS).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    units += Math.max(0, Math.min(last, day * 2 + 1) - Math.max(first, day * 2) + 1);
  }
  return units;
}

function calculateDays(input) {
  const window = getWindow(input);
  return workingUnits(window.first, window.last) / 2;
}

function actorIn(state, actorId) {
  const actor = state.members.find(member => member.id === actorId);
  if (!actor) fail(403, '请选择有效的团队成员。');
  return actor;
}

function textField(value, label, min = 0, max = 300) {
  if (value === undefined && min === 0) return '';
  if (typeof value !== 'string') fail(400, `${label}需要是文字。`);
  const result = value.trim();
  const length = [...result].length;
  if (length < min || length > max) fail(400, `${label}需要为 ${min} 至 ${max} 个字符。`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) {
    fail(400, `${label}包含不支持的控制字符。`);
  }
  return result;
}

function getBalance(state, memberId, year) {
  actorIn(state, memberId);
  if (!Number.isInteger(year) || year < 1 || year > 9999) fail(400, '余额年份无效。');
  let used = 0;
  for (const request of state.requests) {
    if (request.memberId !== memberId || request.type !== 'annual'
      || Number(request.startDate.slice(0, 4)) !== year) continue;
    if (request.status === 'registered') used += request.days;
  }
  return { memberId, year, total: ANNUAL_ALLOWANCE, used, reserved: 0, remaining: ANNUAL_ALLOWANCE - used };
}

function overlaps(a, b) {
  const left = getWindow(a);
  const right = getWindow(b);
  const first = Math.max(left.first, right.first);
  const last = Math.min(left.last, right.last);
  return last >= first && workingUnits(first, last) > 0;
}

function createRequest(state, actorId, input, todayIso) {
  actorIn(state, actorId);
  const window = getWindow(input);
  if (!TYPES.has(input.type)) fail(400, '请选择有效的请假类型。');
  const days = workingUnits(window.first, window.last) / 2;
  if (days === 0) fail(400, '请假范围至少应包含半个工作日，周末不计入请假。');
  const reason = textField(input.reason, '请假说明', 2);
  const handover = textField(input.handover, '工作交接');
  if (todayIso !== undefined) parseDate(todayIso, '当天日期');
  if (input.type === 'annual') {
    if (input.startDate.slice(0, 4) !== input.endDate.slice(0, 4)) {
      fail(400, '跨年的年假需要按年度拆成两次申请。');
    }
    const balance = getBalance(state, actorId, Number(input.startDate.slice(0, 4)));
    if (days > balance.remaining) fail(409, `本年度可登记年假不足，剩余 ${balance.remaining} 天。`);
  }
  const candidate = {
    startDate: input.startDate,
    endDate: input.endDate,
    startPeriod: window.startPeriod,
    endPeriod: window.endPeriod,
  };
  if (state.requests.some(request => request.memberId === actorId
    && request.status === 'registered' && overlaps(request, candidate))) {
    fail(409, '该时段与本人已有的请假登记重叠。');
  }
  const now = new Date().toISOString();
  const request = {
    id: `r-${randomUUID()}`,
    memberId: actorId,
    type: input.type,
    ...candidate,
    days,
    reason,
    handover,
    status: 'registered',
    createdAt: now,
    updatedAt: now,
    decisionBy: null,
    decisionNote: '',
  };
  state.requests.push(request);
  if (todayIso !== undefined) state.todayIso = todayIso;
  return request;
}

function requestIn(state, requestId) {
  const request = state.requests.find(item => item.id === requestId);
  if (!request) fail(404, '未找到这条请假申请。');
  return request;
}

function decideRequest() {
  fail(410, '已改为提交即登记，不再使用审批');
}

function cancelRequest(state, actorId, requestId) {
  actorIn(state, actorId);
  const request = requestIn(state, requestId);
  if (request.memberId !== actorId) fail(403, '只能撤回自己的申请。');
  if (request.status !== 'registered') fail(409, '只有生效中的请假登记可以撤回。');
  request.status = 'cancelled';
  request.updatedAt = new Date().toISOString();
  return request;
}

function currentDateIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calendarFor(state) {
  return state.requests.filter(request => request.status === 'registered').map(request => ({
    id: request.id,
    memberId: request.memberId,
    memberName: state.members.find(member => member.id === request.memberId)?.name || '团队成员',
    type: request.type,
    startDate: request.startDate,
    endDate: request.endDate,
    startPeriod: request.startPeriod,
    endPeriod: request.endPeriod,
    days: request.days,
  }));
}

// A date-level heads-up, even when people's half-days do not overlap.
// Derive it from the public calendar so it cannot expose private leave details.
function warningsForCalendar(calendar) {
  const byDate = new Map();
  for (const request of calendar) {
    const { startMs, endMs } = getWindow(request);
    for (let day = startMs; day <= endMs; day += DAY_MS) {
      if ([0, 6].includes(new Date(day).getUTCDay())) continue;
      const date = new Date(day).toISOString().slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, { members: new Map(), requestIds: new Set() });
      const entry = byDate.get(date);
      entry.members.set(request.memberId, { id: request.memberId, name: request.memberName });
      entry.requestIds.add(request.id);
    }
  }
  return [...byDate.entries()]
    .filter(([, entry]) => entry.members.size >= 2)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, entry]) => ({
      date,
      members: [...entry.members.values()].sort((left, right) => left.id.localeCompare(right.id)),
      requestIds: [...entry.requestIds].sort(),
    }));
}

function getCoordinationWarnings(state) {
  return warningsForCalendar(calendarFor(state));
}

function viewFor(state, actorId) {
  const actor = actorIn(state, actorId);
  const todayIso = state.todayIso || currentDateIso();
  parseDate(todayIso, '当天日期');
  const year = Number(todayIso.slice(0, 4));
  const visibleMembers = actor.role === 'manager' ? state.members : [actor];
  const calendar = calendarFor(state);
  return {
    version: state.version,
    todayIso,
    seeded: Boolean(state.seeded),
    actor: { ...actor },
    members: state.members.map(member => ({ ...member })),
    requests: state.requests
      .filter(request => actor.role === 'manager' || request.memberId === actorId)
      .map(request => ({ ...request })),
    calendar,
    coordinationWarnings: warningsForCalendar(calendar),
    balances: visibleMembers.map(member => getBalance(state, member.id, year)),
  };
}

function moveWorkday(anchorIso, offset) {
  let value = parseDate(anchorIso);
  while ([0, 6].includes(new Date(value).getUTCDay())) value += DAY_MS;
  const direction = offset < 0 ? -1 : 1;
  for (let moved = 0; moved < Math.abs(offset);) {
    value += direction * DAY_MS;
    if (![0, 6].includes(new Date(value).getUTCDay())) moved += 1;
  }
  return new Date(value).toISOString().slice(0, 10);
}

function createSeed(members, todayIso = currentDateIso()) {
  parseDate(todayIso, '当天日期');
  const state = { version: 2, todayIso, seeded: true, members: members.map(member => ({ ...member })), requests: [] };
  const manager = state.members.find(member => member.role === 'manager');
  if (!manager) fail(400, '团队需要至少一位负责人。');
  const colleagues = state.members.filter(member => member.id !== manager.id);
  const examples = [];
  if (colleagues[0]) {
    examples.push({ member: colleagues[0], type: 'annual', from: -4, to: -3, start: 'am', end: 'pm', reason: '【演示】安排短途休息，已提前完成本周事项。', handover: '项目日常问题由团队协助处理，文档已同步。' });
    examples.push({ member: colleagues[0], type: 'annual', from: 1, to: 2, start: 'am', end: 'pm', reason: '【演示】处理个人安排，登记年假。', handover: '本周交付提前完成，紧急事项可联系林言。' });
  }
  if (colleagues[1]) {
    examples.push({ member: colleagues[1], type: 'sick', from: -1, to: -1, start: 'am', end: 'pm', reason: '【演示】身体不适，休息一天。', handover: '今日例会记录请团队协助整理。' });
    examples.push({ member: colleagues[1], type: 'personal', from: 1, to: 1, start: 'pm', end: 'pm', reason: '【演示】下午需要处理个人事务，与同日休假的同事协商安排。', handover: '上午完成待办，当日下午事项顺延。' });
    examples.push({ member: colleagues[1], type: 'comp', from: 5, to: 5, start: 'am', end: 'pm', reason: '【演示】安排一天调休。', handover: '本周工作已完成，请团队留意紧急事项。' });
  }
  examples.push({ member: manager, type: 'personal', from: 4, to: 4, start: 'am', end: 'am', reason: '【演示】上午办理个人事务。', handover: '需要沟通的事项请提前说明，下午恢复处理。' });
  examples.forEach((example, index) => {
    const startDate = moveWorkday(todayIso, example.from);
    let endDate = moveWorkday(todayIso, example.to);
    // Demo startup must also work near New Year without creating invalid annual leave.
    if (example.type === 'annual' && startDate.slice(0, 4) !== endDate.slice(0, 4)) endDate = startDate;
    const request = createRequest(state, example.member.id, {
      type: example.type,
      startDate,
      endDate,
      startPeriod: example.start,
      endPeriod: example.end,
      reason: example.reason,
      handover: example.handover,
    }, todayIso);
    request.id = `demo-${String(index + 1).padStart(3, '0')}`;
    request.createdAt = `${todayIso}T08:${String(index * 5).padStart(2, '0')}:00.000Z`;
    request.updatedAt = request.createdAt;
  });
  return state;
}

module.exports = { loadMembers, createSeed, createRequest, decideRequest, cancelRequest, viewFor, calculateDays, getBalance, migrateState, getCoordinationWarnings };
