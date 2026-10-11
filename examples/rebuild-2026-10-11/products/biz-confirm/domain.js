(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LeaveDomain = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var DAY = 86400000;
  var members = Object.freeze([
    Object.freeze({ id: 'lin', name: '林言', role: 'lead' }),
    Object.freeze({ id: 'qiao', name: '乔雨', role: 'member' }),
    Object.freeze({ id: 'tang', name: '唐辰', role: 'member' })
  ]);
  var types = Object.freeze(['年假', '事假', '病假', '调休']);

  function fail(message) { throw new Error(message); }
  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function memberOf(actorId) {
    if (typeof actorId !== 'string') fail('请先选择有效的团队成员。');
    var member = members.find(function (item) { return item.id === actorId; });
    if (!member) fail('请先选择有效的团队成员。');
    return member;
  }
  function applicantOf(actorId) {
    var member = memberOf(actorId);
    if (member.role !== 'member') fail('林言负责确认成员申请；此演示不支持负责人为自己申请请假。');
    return member;
  }
  function textValue(value, label, required) {
    if (typeof value !== 'string') fail(label + '必须是文字。');
    var result = value.trim();
    if (Array.from(result).length > 300) fail(label + '不能超过 300 字。');
    if (required && !result) fail('驳回申请时请填写处理说明。');
    return result;
  }
  function dateValue(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      fail(label + '必须是 YYYY-MM-DD 格式的真实日期。');
    }
    var year = Number(value.slice(0, 4));
    var month = Number(value.slice(5, 7));
    var day = Number(value.slice(8, 10));
    var leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    var lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > lengths[month - 1]) {
      fail(label + '必须是 YYYY-MM-DD 格式的真实日期。');
    }
    var date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
  }
  function rangeOf(start, end) {
    var first = dateValue(start, '开始日期');
    var last = dateValue(end, '结束日期');
    if (last < first) fail('结束日期不能早于开始日期。');
    if ((last - first) / DAY + 1 > 366) fail('一次申请的日期范围不能超过 366 个自然日。');
    return { first: first, last: last };
  }
  function businessDays(start, end) {
    var range = rangeOf(start, end);
    var result = 0;
    for (var time = range.first; time <= range.last; time += DAY) {
      var weekday = new Date(time).getUTCDay();
      if (weekday !== 0 && weekday !== 6) result += 1;
    }
    return result;
  }
  function validateLeave(input) {
    if (!isObject(input)) fail('请假内容必须是一个有效对象。');
    var allowed = ['type', 'start', 'end', 'reason', 'days'];
    if (Object.keys(input).some(function (key) { return allowed.indexOf(key) < 0; })) {
      fail('请假内容包含不支持的字段。');
    }
    if (types.indexOf(input.type) < 0) fail('请选择年假、事假、病假或调休。');
    var days = businessDays(input.start, input.end);
    if (days < 1) fail('请假范围必须包含至少一个工作日。');
    if (input.days !== undefined && input.days !== days) fail('请假天数必须与日期范围计算结果一致。');
    return {
      type: input.type,
      start: input.start,
      end: input.end,
      reason: input.reason === undefined ? '' : textValue(input.reason, '请假说明', false),
      days: days
    };
  }
  function validStamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
        Number(value.slice(0, 4)) < 1) return false;
    var date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString() === value;
  }
  function validateSnapshotLeave(data) {
    var normalized = validateLeave(data);
    if (data.days !== normalized.days || typeof data.reason !== 'string' || data.reason !== normalized.reason) {
      fail('存储的请假快照缺少正确的天数或说明。');
    }
  }
  function validatePending(pending, allowWithdrawal) {
    if (pending === null) return;
    if (!isObject(pending)) fail('请假数据中的待确认内容无效。');
    if (pending.kind === 'create' || pending.kind === 'edit') {
      validateSnapshotLeave(pending.data);
    } else if (pending.kind === 'withdraw' && allowWithdrawal) {
      validatePending(pending.previous, false);
    } else fail('请假数据中的待确认类型无效。');
  }
  function validateSnapshot(effective, pending) {
    if (effective !== null) validateSnapshotLeave(effective);
    validatePending(pending, true);
    var request = pending && pending.kind === 'withdraw' ? pending.previous : pending;
    if (request && request.kind === 'create' && effective !== null) fail('初次申请不能已经生效。');
    if (request && request.kind === 'edit' && effective === null) fail('变更申请缺少原生效请假。');
    if (pending && pending.kind === 'withdraw' && pending.previous === null && effective === null) {
      fail('撤回申请缺少原请假或待确认事项。');
    }
  }
  function displayLeave(snapshot) {
    return snapshot.pending && (snapshot.pending.data || (snapshot.pending.previous && snapshot.pending.previous.data)) || snapshot.effective;
  }
  function validateRecord(record) {
    if (!isObject(record) || typeof record.id !== 'string' || !record.id ||
        !validStamp(record.createdAt) || !Array.isArray(record.history) || record.history.length === 0) fail('请假记录格式无效。');
    applicantOf(record.ownerId);
    validateSnapshot(record.effective, record.pending);
    if (record.terminal !== undefined && record.terminal !== null &&
        record.terminal !== 'rejected' && record.terminal !== 'withdrawn') fail('请假记录的结束状态无效。');
    if (record.terminal && (record.effective !== null || record.pending !== null)) fail('已结束的请假记录不能继续生效或待确认。');
    if (record.effective === null && record.pending === null && !record.terminal) fail('请假记录缺少有效状态。');
    if (record.lastResult !== null) {
      var result = record.lastResult;
      if (!isObject(result) || ['create', 'edit', 'withdraw'].indexOf(result.action) < 0 ||
          ['approve', 'reject'].indexOf(result.decision) < 0 || !validStamp(result.at) ||
          result.by !== 'lin') fail('请假记录的处理结果无效。');
      textValue(result.comment, '处理说明', result.decision === 'reject');
    }
    if (record.terminal === 'rejected' && (!record.lastResult || record.lastResult.action !== 'create' || record.lastResult.decision !== 'reject')) {
      fail('已驳回记录的处理结果不一致。');
    }
    if (record.terminal === 'withdrawn' && (!record.lastResult || record.lastResult.action !== 'withdraw' || record.lastResult.decision !== 'approve')) {
      fail('已撤回记录的处理结果不一致。');
    }
    record.history.forEach(function (entry) {
      if (!isObject(entry) || ['submit', 'edit', 'withdraw', 'decide'].indexOf(entry.kind) < 0 ||
          ['create', 'edit', 'withdraw'].indexOf(entry.action) < 0 || !validStamp(entry.at) ||
          ['待确认', '修改待确认', '撤回待确认', '已生效', '已驳回', '已撤回'].indexOf(entry.status) < 0) {
        fail('请假记录的历史格式无效。');
      }
      validateSnapshot(entry.effective, entry.pending);
      if (entry.kind === 'decide') {
        if (entry.by !== 'lin' || ['approve', 'reject'].indexOf(entry.decision) < 0) fail('历史处理结果无效。');
      } else if (entry.by !== record.ownerId || entry.decision !== null) fail('历史申请操作无效。');
      textValue(entry.comment, '历史说明', entry.decision === 'reject');
      var terminal = entry.status === '已驳回' ? 'rejected' : entry.status === '已撤回' ? 'withdrawn' : null;
      if (terminal && (entry.effective !== null || entry.pending !== null)) fail('历史结束状态与快照不一致。');
      if (statusOf({ effective: entry.effective, pending: entry.pending, terminal: terminal }) !== entry.status) {
        fail('历史状态与快照不一致。');
      }
    });
    if (!displayLeave(record) && !record.history.some(displayLeave)) fail('请假记录缺少可显示的申请内容。');
  }
  function validateState(state) {
    if (!isObject(state) || state.version !== 1 || !Number.isSafeInteger(state.revision) ||
        state.revision < 0 || !Array.isArray(state.records)) fail('请假数据格式无效，请重新载入有效数据。');
    var ids = new Set();
    state.records.forEach(function (record) {
      validateRecord(record);
      if (ids.has(record.id)) fail('请假数据包含重复的申请编号。');
      ids.add(record.id);
    });
    if (state.revision === Number.MAX_SAFE_INTEGER) fail('请假数据版本已达到上限。');
    return state;
  }
  function createState() { return { version: 1, revision: 0, records: [] }; }
  function findRecord(state, recordId) {
    if (typeof recordId !== 'string' || !recordId) fail('请提供有效的申请编号。');
    var record = state.records.find(function (item) { return item.id === recordId; });
    if (!record) fail('请假申请不存在。');
    return record;
  }
  function editableRecord(state, actorId, recordId) {
    applicantOf(actorId);
    var record = findRecord(state, recordId);
    if (record.ownerId !== actorId) fail('只能修改或撤回自己的请假申请。');
    if (record.terminal || (!record.pending && !record.effective)) fail('这条申请已经结束，请重新提交新申请。');
    return record;
  }
  function intervalsOf(record) {
    var intervals = record.effective ? [record.effective] : [];
    var pending = record.pending;
    if (pending && pending.kind === 'withdraw') pending = pending.previous;
    if (pending && (pending.kind === 'create' || pending.kind === 'edit')) intervals.push(pending.data);
    return intervals;
  }
  function checkOverlap(state, actorId, input, ignoredId) {
    var overlaps = state.records.some(function (record) {
      if (record.ownerId !== actorId || record.id === ignoredId) return false;
      return intervalsOf(record).some(function (leave) {
        return input.start <= leave.end && input.end >= leave.start;
      });
    });
    if (overlaps) fail('日期与本人已有的生效请假或待确认申请重叠，请调整日期。');
  }
  function statusOf(record) {
    if (!isObject(record)) fail('请提供有效的请假记录。');
    if (record.pending) {
      if (record.pending.kind === 'create') return '待确认';
      if (record.pending.kind === 'edit') return '修改待确认';
      if (record.pending.kind === 'withdraw') return '撤回待确认';
      fail('请假数据中的待确认类型无效。');
    }
    if (record.terminal === 'rejected') return '已驳回';
    if (record.terminal === 'withdrawn') return '已撤回';
    if (record.effective) return '已生效';
    fail('请假记录缺少有效状态。');
  }
  function recordHistory(record, kind, action, actorId, at, comment, decision) {
    record.history.push({
      kind: kind, action: action, at: at, by: actorId, comment: comment,
      decision: decision || null, status: statusOf(record),
      effective: clone(record.effective), pending: clone(record.pending)
    });
  }
  function nextState(state) {
    validateState(state);
    var next = clone(state);
    next.revision += 1;
    return next;
  }
  function newId(state) {
    var id;
    do {
      id = 'leave-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 11);
    } while (state.records.some(function (record) { return record.id === id; }));
    return id;
  }
  function submit(state, actorId, input) {
    applicantOf(actorId);
    var data = validateLeave(input);
    var next = nextState(state);
    checkOverlap(next, actorId, data);
    var at = new Date().toISOString();
    var record = {
      id: newId(next), ownerId: actorId, createdAt: at, effective: null,
      pending: { kind: 'create', data: data }, lastResult: null, terminal: null, history: []
    };
    recordHistory(record, 'submit', 'create', actorId, at, '', null);
    next.records.push(record);
    return next;
  }
  function edit(state, actorId, recordId, input) {
    var next = nextState(state);
    var record = editableRecord(next, actorId, recordId);
    if (record.pending && record.pending.kind === 'withdraw') fail('撤回申请正在等待确认，处理后才能修改。');
    var data = validateLeave(input);
    checkOverlap(next, actorId, data, recordId);
    var action = record.effective ? 'edit' : 'create';
    record.pending = { kind: action, data: data };
    recordHistory(record, 'edit', action, actorId, new Date().toISOString(), '', null);
    return next;
  }
  function requestWithdrawal(state, actorId, recordId) {
    var next = nextState(state);
    var record = editableRecord(next, actorId, recordId);
    if (record.pending && record.pending.kind === 'withdraw') fail('这条申请已经在等待撤回确认。');
    record.pending = { kind: 'withdraw', previous: clone(record.pending) };
    recordHistory(record, 'withdraw', 'withdraw', actorId, new Date().toISOString(), '', null);
    return next;
  }
  function decide(state, actorId, recordId, decision, comment) {
    var member = memberOf(actorId);
    if (member.role !== 'lead') fail('只有负责人林言可以确认或驳回申请。');
    if (decision !== 'approve' && decision !== 'reject') fail('请选择确认或驳回。');
    var note = textValue(comment === undefined ? '' : comment, '处理说明', decision === 'reject');
    var next = nextState(state);
    var record = findRecord(next, recordId);
    if (record.ownerId === actorId) fail('不能处理自己的请假申请。');
    if (!record.pending) fail('这条申请没有待确认事项。');
    var pending = record.pending;
    var action = pending.kind;
    var at = new Date().toISOString();
    if (decision === 'approve') {
      if (action === 'withdraw') {
        record.effective = null;
        record.pending = null;
        record.terminal = 'withdrawn';
      } else {
        checkOverlap(next, record.ownerId, pending.data, recordId);
        record.effective = clone(pending.data);
        record.pending = null;
        record.terminal = null;
      }
    } else if (action === 'withdraw') {
      record.pending = clone(pending.previous);
    } else {
      record.pending = null;
      if (action === 'create') record.terminal = 'rejected';
    }
    record.lastResult = { action: action, decision: decision, comment: note, at: at, by: actorId };
    recordHistory(record, 'decide', action, actorId, at, note, decision);
    return next;
  }

  return Object.freeze({
    members: members, types: types, createState: createState, validateLeave: validateLeave, validateState: validateState,
    businessDays: businessDays, submit: submit, edit: edit,
    requestWithdrawal: requestWithdrawal, decide: decide, statusOf: statusOf
  });
});
