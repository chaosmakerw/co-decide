(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LeaveCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MEMBERS = Object.freeze([
    Object.freeze({ id: 'lin', name: '林言', role: '负责人' }),
    Object.freeze({ id: 'qiao', name: '乔雨', role: '成员' }),
    Object.freeze({ id: 'tang', name: '唐辰', role: '成员' })
  ]);
  var TYPES = Object.freeze(['年假', '事假', '病假', '其他']);
  var PERIODS = Object.freeze(['full', 'am', 'pm']);
  var DAY_MS = 86400000;
  var sequence = 0;

  function ValidationError(errors) {
    this.name = 'ValidationError';
    this.errors = errors;
    this.message = errors.map(function (error) { return error.message; }).join('；');
    if (Error.captureStackTrace) Error.captureStackTrace(this, ValidationError);
  }
  ValidationError.prototype = Object.create(Error.prototype);
  ValidationError.prototype.constructor = ValidationError;

  function issue(field, code, message) { return { field: field, code: code, message: message }; }

  function getMember(id) {
    return MEMBERS.find(function (member) { return member.id === id; }) || null;
  }

  // 用 UTC 数值表示一个公历日期，避免时区与夏令时改变工作日或天数。
  function parseDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    var parts = value.split('-').map(Number);
    if (parts[0] < 1 || parts[0] > 9999) return null;
    var date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
    if (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1 || date.getUTCDate() !== parts[2]) return null;
    return Math.floor(date.getTime() / DAY_MS);
  }

  function isWorkingOrdinal(ordinal) {
    var weekday = new Date(ordinal * DAY_MS).getUTCDay();
    return weekday >= 1 && weekday <= 5;
  }

  function weekdays(start, end) {
    if (end < start) return 0;
    var span = end - start + 1;
    var completeWeeks = Math.floor(span / 7);
    var count = completeWeeks * 5;
    for (var i = completeWeeks * 7; i < span; i += 1) {
      if (isWorkingOrdinal(start + i)) count += 1;
    }
    return count;
  }

  function workingDaysBetween(startDate, endDate) {
    var start = parseDate(startDate);
    var end = parseDate(endDate);
    if (start === null || end === null || end < start) {
      throw new ValidationError([issue('date', 'INVALID_RANGE', '请填写有效的起止日期，结束日期不能早于开始日期')]);
    }
    return weekdays(start, end);
  }

  function normalize(input) {
    var errors = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { errors: [issue('input', 'INVALID_INPUT', '请填写请假信息')], record: null };
    }
    var member = getMember(input.memberId);
    if (!member) errors.push(issue('memberId', 'INVALID_MEMBER', '请选择团队中的成员'));
    if (TYPES.indexOf(input.type) === -1) errors.push(issue('type', 'INVALID_TYPE', '请选择有效的请假类型'));
    var startDate = input.startDate;
    var endDate = input.endDate === undefined ? startDate : input.endDate;
    var start = parseDate(startDate);
    var end = parseDate(endDate);
    if (start === null) errors.push(issue('startDate', 'INVALID_DATE', '开始日期不是有效的公历日期'));
    if (end === null) errors.push(issue('endDate', 'INVALID_DATE', '结束日期不是有效的公历日期'));
    var period = input.period === undefined ? 'full' : input.period;
    if (PERIODS.indexOf(period) === -1) errors.push(issue('period', 'INVALID_PERIOD', '请选择全天、上午或下午'));
    if (start !== null && end !== null) {
      if (end < start) errors.push(issue('endDate', 'END_BEFORE_START', '结束日期不能早于开始日期'));
      if (end !== start && (period === 'am' || period === 'pm')) errors.push(issue('period', 'HALF_DAY_RANGE', '上午或下午请假只能选择同一天，跨日请假请选择全天'));
      if (end >= start && weekdays(start, end) === 0) errors.push(issue('date', 'NO_WORKING_DAYS', '这段日期只有周末，请选择至少一个周一至周五'));
    }
    var reason = input.reason == null ? '' : input.reason;
    if (typeof reason !== 'string') errors.push(issue('reason', 'INVALID_REASON', '请假说明应为文字'));
    else if (reason.length > 300) errors.push(issue('reason', 'REASON_TOO_LONG', '请假说明最多填写 300 个字符'));
    if (errors.length) return { errors: errors, record: null };
    return {
      errors: [],
      record: {
        memberId: member.id,
        memberName: member.name,
        type: input.type,
        startDate: startDate,
        endDate: endDate,
        period: period,
        duration: weekdays(start, end) * (period === 'full' ? 1 : 0.5),
        status: 'registered',
        reason: reason.trim()
      }
    };
  }

  function interval(record) {
    if (!record || record.status !== 'registered' || !getMember(record.memberId)) return null;
    var start = parseDate(record.startDate);
    var end = parseDate(record.endDate);
    if (start === null || end === null || end < start || PERIODS.indexOf(record.period) === -1) return null;
    if (record.period !== 'full' && start !== end) return null;
    return { start: start, end: end, period: record.period, memberId: record.memberId };
  }

  function overlap(left, right) {
    var start = Math.max(left.start, right.start);
    var end = Math.min(left.end, right.end);
    if (start > end || weekdays(start, end) === 0) return false;
    return start !== end || left.period === 'full' || right.period === 'full' || left.period === right.period;
  }

  function recordList(records) {
    if (!Array.isArray(records)) throw new TypeError('records 必须是数组');
    return records;
  }

  // 返回内部原记录，页面显示前应通过 toPublic 去除私人说明。
  function getConflicts(record, records) {
    records = recordList(records === undefined ? [] : records);
    var candidate = interval(record);
    if (!candidate) return [];
    return records.filter(function (other) {
      var otherInterval = interval(other);
      return otherInterval && otherInterval.memberId !== candidate.memberId && overlap(candidate, otherInterval);
    });
  }

  function validate(input, records) {
    records = recordList(records === undefined ? [] : records);
    var normalized = normalize(input);
    var record = normalized.record;
    var errors = normalized.errors.slice();
    if (record) {
      var candidate = interval(record);
      var ownOverlap = records.some(function (other) {
        var otherInterval = interval(other);
        return otherInterval && otherInterval.memberId === candidate.memberId && overlap(candidate, otherInterval);
      });
      if (ownOverlap) errors.push(issue('date', 'SELF_OVERLAP', '你在该时段已有有效请假，请调整日期或时段'));
    }
    return {
      valid: errors.length === 0,
      errors: errors,
      record: errors.length ? null : record,
      conflicts: record ? getConflicts(record, records) : []
    };
  }

  function timestamp(options) {
    var value = options && options.now !== undefined ? options.now : new Date();
    if (typeof value === 'function') value = value();
    var date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new TypeError('now 必须是有效时间');
    return date.toISOString();
  }

  function generateId() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return 'leave-' + globalThis.crypto.randomUUID();
    }
    sequence += 1;
    return 'leave-' + Date.now().toString(36) + '-' + sequence.toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  function create(input, records, options) {
    var result = validate(input, records);
    if (!result.valid) throw new ValidationError(result.errors);
    var id = options && options.id !== undefined ? options.id : generateId();
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('id 必须是非空字符串');
    return Object.assign({}, result.record, { id: id, createdAt: timestamp(options), cancelledAt: null });
  }

  function cancel(record, actorId, options) {
    if (!record || !getMember(actorId) || record.memberId !== actorId) {
      throw new ValidationError([issue('memberId', 'FORBIDDEN', '只能撤销自己的请假')]);
    }
    if (record.status !== 'registered' && record.status !== 'cancelled') {
      throw new ValidationError([issue('status', 'INVALID_STATUS', '这条请假状态无效')]);
    }
    if (record.status === 'cancelled') return Object.assign({}, record);
    return Object.assign({}, record, { status: 'cancelled', cancelledAt: timestamp(options) });
  }

  function dateOrdinalOrThrow(date) {
    var ordinal = parseDate(date);
    if (ordinal === null) throw new ValidationError([issue('date', 'INVALID_DATE', '日期不是有效的公历日期')]);
    return ordinal;
  }

  function isActiveOnDate(record, date) {
    var ordinal = dateOrdinalOrThrow(date);
    var active = interval(record);
    return Boolean(active && isWorkingOrdinal(ordinal) && active.start <= ordinal && active.end >= ordinal);
  }

  function getAbsentMembers(records, date) {
    records = recordList(records);
    var ordinal = dateOrdinalOrThrow(date);
    if (!isWorkingOrdinal(ordinal)) return [];
    var ids = new Set();
    records.forEach(function (record) {
      var active = interval(record);
      if (active && active.start <= ordinal && active.end >= ordinal) ids.add(active.memberId);
    });
    return MEMBERS.filter(function (member) { return ids.has(member.id); });
  }

  function countAbsent(records, date) { return getAbsentMembers(records, date).length; }

  function toPublic(record) {
    var normalized = normalize(record);
    if (normalized.errors.length) throw new ValidationError(normalized.errors);
    if (record.status !== 'registered' && record.status !== 'cancelled') {
      throw new ValidationError([issue('status', 'INVALID_STATUS', '这条请假状态无效')]);
    }
    var safe = normalized.record;
    return {
      person: { id: safe.memberId, name: safe.memberName },
      date: { start: safe.startDate, end: safe.endDate, period: safe.period },
      type: safe.type,
      duration: safe.duration,
      status: record.status
    };
  }

  return Object.freeze({
    MEMBERS: MEMBERS,
    TYPES: TYPES,
    PERIODS: PERIODS,
    ValidationError: ValidationError,
    getMember: getMember,
    workingDaysBetween: workingDaysBetween,
    validate: validate,
    create: create,
    cancel: cancel,
    getConflicts: getConflicts,
    isActiveOnDate: isActiveOnDate,
    getAbsentMembers: getAbsentMembers,
    countAbsent: countAbsent,
    toPublic: toPublic
  });
});
