(() => {
  'use strict';
  const Core = window.LeaveCore;
  const $ = id => document.getElementById(id);
  if (!Core) {
    $('storage-warning').hidden = false;
    $('storage-warning').textContent = '业务模块未能加载，请通过 start.cmd 启动后重新打开页面。';
    $('open-leave').disabled = true;
    return;
  }
  const STORAGE_KEY = 'qiri-leave-demo:v1';
  const IDENTITY_KEY = 'qiri-demo-identity';
  const PERIOD_LABELS = { full: '全天', am: '上午', pm: '下午' };
  const today = localISO(new Date());
  const state = { records: [], memberId: 'qiao', view: 'calendar', month: monthStart(today), selectedDate: today, memberFilter: 'all', statusFilter: 'all', blocked: false, cancelId: null, detailId: null };
  let toastTimer;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const avatar = member => `<span class="avatar ${member.id}">${escape(member.name[0])}</span>`;
  const member = () => Core.getMember(state.memberId);
  function localISO(date) { return `${date.getFullYear().toString().padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  function dateObject(iso) { const parts = iso.split('-').map(Number); const result = new Date(0); result.setUTCHours(0, 0, 0, 0); result.setUTCFullYear(parts[0], parts[1] - 1, parts[2]); return result; }
  function isoDate(date) { return date.toISOString().slice(0, 10); }
  function monthStart(date) { return date.slice(0, 7) + '-01'; }
  function monthEnd(date) { const result = dateObject(monthStart(date)); result.setUTCMonth(result.getUTCMonth() + 1, 0); return isoDate(result); }
  function addDays(date, amount) { const result = dateObject(date); result.setUTCDate(result.getUTCDate() + amount); return isoDate(result); }
  function nextWorkday(date) { while ([0, 6].includes(dateObject(date).getUTCDay())) date = addDays(date, 1); return date; }
  function dateLabel(date, year = false) { const parts = date.split('-').map(Number); return `${year ? parts[0] + ' 年 ' : ''}${parts[1]} 月 ${parts[2]} 日`; }
  function rangeLabel(record) { return record.startDate === record.endDate ? dateLabel(record.startDate) : `${dateLabel(record.startDate)} — ${dateLabel(record.endDate)}`; }
  function rangeWithYear(record) { return record.startDate === record.endDate ? dateLabel(record.startDate, true) : `${dateLabel(record.startDate, true)} — ${dateLabel(record.endDate, record.startDate.slice(0, 4) !== record.endDate.slice(0, 4))}`; }
  function activeRecords() { return state.records.filter(record => record.status === 'registered'); }
  function recordsOn(date) { return activeRecords().filter(record => Core.isActiveOnDate(record, date)); }
  function covering(records, period) { return [...new Set(records.filter(record => record.period === 'full' || record.period === period).map(record => record.memberId))]; }
  function hasCoordination(date) { const records = recordsOn(date); return covering(records, 'am').length > 1 || covering(records, 'pm').length > 1; }
  function inMonth(record) { return record.status === 'registered' && record.startDate <= monthEnd(state.month) && record.endDate >= state.month && monthDuration(record) > 0; }
  function monthDuration(record) { const start = record.startDate > state.month ? record.startDate : state.month; const end = record.endDate < monthEnd(state.month) ? record.endDate : monthEnd(state.month); return Core.workingDaysBetween(start, end) * (record.period === 'full' ? 1 : 0.5); }
  function seedRecords() {
    const base = today.slice(0, 7);
    // 固定同一月份的示例输入，并把落在周末的日期移到下一个工作日。
    const tangDate = nextWorkday(`${base}-15`);
    const qiaoDate = nextWorkday(`${base}-19`);
    const linDate = nextWorkday(`${base}-22`);
    const inputs = [
      { memberId: 'tang', type: '事假', startDate: tangDate, endDate: tangDate, period: 'full', reason: '个人事务，已提前安排交接。' },
      { memberId: 'qiao', type: '年假', startDate: qiaoDate, endDate: nextWorkday(addDays(qiaoDate, 1)), period: 'full', reason: '短途休息，事项会提前整理好。' },
      { memberId: 'lin', type: '其他', startDate: linDate, endDate: linDate, period: 'am', reason: '上午处理个人事项，下午正常在岗。' }
    ];
    return inputs.map((input, index) => Core.create(input, [], { id: `example-${index + 1}`, now: new Date() }));
  }
  function decodeRecords(raw) {
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.records) || data.records.length > 10000) throw new Error('存储格式无效');
    const ids = new Set();
    const records = data.records.map(rawRecord => {
      if (!rawRecord || typeof rawRecord.id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(rawRecord.id) || ids.has(rawRecord.id) || !['registered', 'cancelled'].includes(rawRecord.status) || typeof rawRecord.createdAt !== 'string') throw new Error('登记数据无效');
      ids.add(rawRecord.id);
      const normalized = Core.create(rawRecord, [], { id: rawRecord.id, now: rawRecord.createdAt });
      if (rawRecord.status === 'cancelled') {
        if (typeof rawRecord.cancelledAt !== 'string') throw new Error('撤销数据无效');
        return Core.cancel(normalized, normalized.memberId, { now: rawRecord.cancelledAt });
      }
      return normalized;
    });
    const active = [];
    for (const record of records) {
      if (record.status !== 'registered') continue;
      if (!Core.validate(record, active).valid) throw new Error('重复登记数据无效');
      active.push(record);
    }
    return records;
  }
  function warnStorage(message, blocked = true) {
    state.blocked = blocked;
    $('storage-warning').hidden = false;
    $('storage-warning').textContent = message;
    $('open-leave').disabled = blocked;
    $('day-new-leave').disabled = blocked;
    $('empty-new-leave').disabled = blocked;
  }
  function commit(records) {
    if (state.blocked) throw new Error('本机数据目前不可写入，请检查页面顶部提示。');
    if (records.length > 10000) throw new Error('本地演示最多保存 10000 笔记录，请先导出已有登记。');
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, records, updatedAt: new Date().toISOString() })); }
    catch { warnStorage('本机保存失败：请允许浏览器存储或释放空间后重试。未保存的操作不会生效。', false); throw new Error('登记没有保存成功，请允许浏览器存储或释放空间后重试。'); }
    state.records = records;
    $('storage-warning').hidden = true;
  }
  function refreshLatest() {
    if (state.blocked) throw new Error('本机数据目前不可写入，请检查页面顶部提示。');
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) throw new Error('本机记录已被清除');
      state.records = decodeRecords(raw);
    } catch {
      warnStorage('本机登记数据无法读取，已暂停写入以保留原数据。请检查浏览器存储设置；如数据已清除，可刷新重新载入示例。');
      throw new Error('无法读取本机登记数据，操作尚未生效。');
    }
  }
  function initialize() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        state.records = seedRecords();
        commit(state.records);
      } else state.records = decodeRecords(raw);
    } catch {
      state.records = [];
      warnStorage('本机登记数据无法读取，已暂停写入以保留原数据。请检查浏览器存储设置或已有记录；本工具不会覆盖无法读取的数据。');
    }
    try { const identity = sessionStorage.getItem(IDENTITY_KEY); if (Core.getMember(identity)) state.memberId = identity; } catch { /* 身份偏好不影响登记保存。 */ }
    $('identity-select').value = state.memberId;
    const first = activeRecords().filter(inMonth).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    if (first) state.selectedDate = first.startDate;
    bindEvents();
    render();
  }
  function render() {
    renderIdentity(); renderStats(); renderCalendar(); renderDay(); renderList(); renderUpcoming();
    const titles = { calendar: ['团队请假', '把彼此的安排放在一起，让工作和休息都有着落。'], mine: ['我的请假', '属于你的休息时间，登记后就安心安排。'], records: ['全部登记', '让每一次请假都有记录，也让彼此的安排更清楚。'] };
    $('page-title').textContent = titles[state.view][0];
    $('page-description').textContent = titles[state.view][1];
    $('welcome-banner').hidden = state.view !== 'calendar';
    $('calendar-view').hidden = state.view !== 'calendar';
    $('list-view').hidden = state.view === 'calendar';
    $('upcoming-section').hidden = state.view !== 'calendar';
    document.querySelectorAll('[data-view]').forEach(button => {
      const active = button.dataset.view === state.view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
      const dot = button.querySelector('.nav-dot'); if (dot) dot.hidden = !active;
    });
  }
  function renderIdentity() {
    $('identity-avatar').className = `avatar ${state.memberId}`;
    $('identity-avatar').textContent = member().name[0];
    $('team-members').innerHTML = Core.MEMBERS.map(person => `<div class="team-member">${avatar(person)}<span><b>${person.name}</b><small>${person.role}</small></span>${person.id === state.memberId ? '<span class="you-label">我</span>' : ''}</div>`).join('');
  }
  function renderStats() {
    const monthRecords = activeRecords().filter(inMonth);
    $('stat-count').textContent = monthRecords.length;
    $('stat-days').textContent = monthRecords.reduce((sum, record) => sum + monthDuration(record), 0);
    let conflicts = 0;
    const monthDays = dateObject(monthEnd(state.month)).getUTCDate();
    for (let i = 0; i < monthDays; i++) if (hasCoordination(addDays(state.month, i))) conflicts++;
    $('stat-conflicts').textContent = conflicts;
  }
  function renderCalendar() {
    const date = dateObject(state.month);
    $('month-title').textContent = `${date.getUTCMonth() + 1} 月`;
    $('month-year').textContent = date.getUTCFullYear();
    const offset = (date.getUTCDay() + 6) % 7;
    const daysInMonth = dateObject(monthEnd(state.month)).getUTCDate();
    const count = Math.ceil((daysInMonth + offset) / 7) * 7;
    let html = '';
    for (let i = 0; i < count; i++) {
      const cellDate = dateObject(state.month);
      cellDate.setUTCDate(1 - offset + i);
      if (cellDate.getUTCFullYear() < 1 || cellDate.getUTCFullYear() > 9999) {
        html += '<div class="calendar-day other-month" aria-hidden="true"></div>';
        continue;
      }
      const current = isoDate(cellDate);
      const outside = current.slice(0, 7) !== state.month.slice(0, 7);
      const weekend = [0, 6].includes(dateObject(current).getUTCDay());
      const all = recordsOn(current);
      const visible = all.filter(record => state.memberFilter === 'all' || record.memberId === state.memberFilter);
      const coordination = hasCoordination(current);
      const names = visible.map(record => `${record.memberName}${PERIOD_LABELS[record.period]}请假`).join('，');
      html += `<button type="button" class="calendar-day${outside ? ' other-month' : ''}${weekend ? ' weekend' : ''}${current === today ? ' is-today' : ''}${current === state.selectedDate ? ' selected' : ''}" data-date="${current}" aria-pressed="${current === state.selectedDate}" aria-label="${escape(dateLabel(current, true))}${names ? '，' + escape(names) : weekend ? '，周末' : '，没有请假'}${coordination ? '，需要协商' : ''}"><span class="day-number">${dateObject(current).getUTCDate()}</span>${coordination ? '<span class="calendar-conflict">协商</span>' : ''}${visible.slice(0, 3).map(record => `<span class="day-chip ${record.memberId}">${escape(record.memberName)} · ${PERIOD_LABELS[record.period]}</span>`).join('')}${visible.length > 3 ? `<span class="day-more">+ ${visible.length - 3} 项</span>` : ''}</button>`;
    }
    $('calendar-grid').innerHTML = html;
  }
  function renderDay() {
    const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dateObject(state.selectedDate).getUTCDay()];
    const weekend = ['周日', '周六'].includes(weekday);
    $('selected-date-label').textContent = `${dateLabel(state.selectedDate)} · ${weekday}`;
    const records = recordsOn(state.selectedDate);
    const am = covering(records, 'am'); const pm = covering(records, 'pm');
    $('day-availability').innerHTML = weekend ? '<span>周末 · 不计工作日</span>' : `<span>上午 <b>${3 - am.length} / 3</b> 人可用</span><span>下午 <b>${3 - pm.length} / 3</b> 人可用</span>`;
    $('day-people').innerHTML = Core.MEMBERS.map(person => {
      const own = records.filter(record => record.memberId === person.id);
      let period = '';
      if (own.some(record => record.period === 'full') || (own.some(record => record.period === 'am') && own.some(record => record.period === 'pm'))) period = '全天';
      else if (own.length) period = PERIOD_LABELS[own[0].period];
      const status = weekend ? '<span class="day-person-status">周末</span>' : own.length ? `<button class="day-person-status away" data-detail="${escape(own[0].id)}" aria-label="查看${person.name}的请假">${period}请假</button>` : '<span class="day-person-status">在岗</span>';
      return `<div class="day-person">${avatar(person)}<div class="day-person-info"><b>${person.name}</b><small>${person.role}</small></div>${status}</div>`;
    }).join('');
    $('day-conflict').innerHTML = hasCoordination(state.selectedDate) ? '<div class="day-conflict-note"><b>有成员的请假时段重叠</b>可以一起确认交接和人手安排。所有登记均已生效，这条提醒不会替团队作决定。</div>' : '';
    $('day-new-leave').disabled = state.blocked;
    $('day-new-leave').textContent = weekend ? '选择工作日登记' : '登记这一天';
  }
  function visibleList() {
    return state.records.filter(record => (state.view !== 'mine' || record.memberId === state.memberId) && (state.statusFilter === 'all' || record.status === state.statusFilter)).sort((a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt.localeCompare(a.createdAt));
  }
  function renderList() {
    const records = visibleList();
    $('list-title').textContent = state.view === 'mine' ? `${member().name}的请假` : '团队登记记录';
    $('list-subtitle').textContent = state.view === 'mine' ? '可查看自己的说明，也可撤销有效登记。' : '提交即登记生效；撤销记录会保留，私人说明不出现在列表或导出中。';
    $('record-rows').innerHTML = records.map(record => {
      const safe = Core.toPublic(record); const person = Core.getMember(safe.person.id);
      return `<tr><td><div class="table-member">${avatar(person)}${safe.person.name}</div></td><td class="table-date">${escape(rangeLabel(record))}<small>${escape(record.startDate.slice(0, 4))} 年${record.startDate.slice(0, 4) !== record.endDate.slice(0, 4) ? ' — ' + escape(record.endDate.slice(0, 4)) + ' 年' : ''} · ${PERIOD_LABELS[safe.date.period]}</small></td><td>${safe.type}</td><td>${safe.duration} 天</td><td><span class="record-status ${safe.status === 'cancelled' ? 'cancelled' : ''}">${safe.status === 'cancelled' ? '已撤销' : '已登记'}</span></td><td><div class="table-actions"><button data-detail="${escape(record.id)}">详情</button>${record.memberId === state.memberId && record.status === 'registered' && !state.blocked ? `<button data-cancel="${escape(record.id)}">撤销</button>` : ''}</div></td></tr>`;
    }).join('');
    $('list-empty').hidden = records.length !== 0;
    document.querySelector('.table-scroll').hidden = records.length === 0;
    $('export-records').disabled = records.length === 0;
  }
  function renderUpcoming() {
    const records = activeRecords().filter(inMonth).sort((a, b) => a.startDate.localeCompare(b.startDate));
    $('upcoming-count').textContent = `${records.length} 笔登记`;
    $('upcoming-list').innerHTML = records.length ? records.slice(0, 3).map(record => `<button class="upcoming-card" data-detail="${escape(record.id)}">${avatar(Core.getMember(record.memberId))}<span class="upcoming-content"><b>${escape(record.memberName)} <span style="font-weight:400;color:#94a087">· ${record.duration} 天</span></b><small>${escape(rangeLabel(record))} · ${PERIOD_LABELS[record.period]}</small></span><span class="upcoming-type">${record.type}</span></button>`).join('') : '<p class="upcoming-empty">这个月还没有有效请假登记，团队安排一目了然。</p>';
  }
  function switchView(view) { state.view = view; render(); }
  function openDialog(id) { $(id).showModal(); document.body.classList.add('no-scroll'); }
  function closeDialog(id) { $(id).close(); updateScrollLock(); }
  function updateScrollLock() { document.body.classList.toggle('no-scroll', Boolean(document.querySelector('dialog[open]'))); }
  function openLeave(date) {
    if (state.blocked) return;
    hideToast();
    const form = $('leave-form'); form.reset();
    const initial = nextWorkday(date || today);
    $('start-date').value = initial; $('end-date').value = initial;
    $('form-person').innerHTML = `${avatar(member())}<span><b>${member().name}</b><small>以当前本地演示身份登记</small></span>`;
    $('form-error').hidden = true;
    $('submit-leave').disabled = false;
    updateForm(); openDialog('leave-dialog');
  }
  function formInput() { const data = new FormData($('leave-form')); return { memberId: state.memberId, type: data.get('type'), startDate: data.get('startDate'), endDate: data.get('endDate'), period: data.get('period'), reason: data.get('reason') }; }
  function updateForm() {
    const input = formInput();
    const result = Core.validate(input, state.records);
    let duration = '—';
    try { if (input.period === 'full' || input.startDate === input.endDate) { const count = Core.workingDaysBetween(input.startDate, input.endDate); if (count > 0) duration = count * (input.period === 'full' ? 1 : 0.5); } } catch { /* 非法输入在提交时给出明确反馈。 */ }
    $('form-duration').innerHTML = `${duration} <small>个工作日</small>`;
    $('reason-count').textContent = `${input.reason.length} / 300`;
    $('form-conflicts').hidden = result.conflicts.length === 0;
    if (result.conflicts.length) {
      const names = [...new Set(result.conflicts.map(record => Core.toPublic(record).person.name))];
      $('form-conflicts').innerHTML = `<strong>${names.map(escape).join('、')}的请假与你有时段重叠</strong>仍可直接登记，请与同事确认交接和人手安排。这是协商提醒，不会阻止请假。`;
    }
    if (!$('form-error').hidden) { $('form-error').hidden = result.valid; $('form-error').textContent = result.errors.map(error => error.message).join('；'); }
  }
  function submitLeave(event) {
    event.preventDefault();
    if ($('submit-leave').disabled) return;
    $('submit-leave').disabled = true;
    try {
      refreshLatest();
      const input = formInput(); const record = Core.create(input, state.records);
      const conflicts = Core.getConflicts(record, state.records);
      commit([...state.records, record]);
      state.month = monthStart(record.startDate); state.selectedDate = record.startDate;
      closeDialog('leave-dialog'); render();
      showToast(conflicts.length ? '请假已登记生效；时段有重叠，记得和同事协商。' : '请假已登记生效，团队安排已更新。');
    } catch (error) {
      $('form-error').hidden = false; $('form-error').textContent = error instanceof Core.ValidationError ? error.message : '登记未生效。' + error.message;
      updateFormPreservingError();
      const firstError = error.errors && error.errors[0];
      const fields = { startDate: 'start-date', endDate: 'end-date', date: 'start-date', period: 'leave-period', reason: 'leave-reason' };
      if (firstError && fields[firstError.field]) $(fields[firstError.field]).focus();
    } finally { $('submit-leave').disabled = false; }
  }
  function updateFormPreservingError() { const message = $('form-error').textContent; updateForm(); $('form-error').hidden = false; $('form-error').textContent = message; }
  function showDetail(id) {
    const record = state.records.find(record => record.id === id); if (!record) return;
    state.detailId = id;
    const safe = Core.toPublic(record); const person = Core.getMember(safe.person.id);
    const canReadReason = record.memberId === state.memberId || member().role === '负责人';
    $('detail-content').innerHTML = `<div class="detail-person">${avatar(person)}<span><b>${person.name}</b><small>${person.role}</small></span></div><div class="detail-line"><span>请假日期</span><b>${escape(rangeWithYear(record))}</b></div><div class="detail-line"><span>请假时段</span><b>${PERIOD_LABELS[safe.date.period]}</b></div><div class="detail-line"><span>类型 / 天数</span><b>${safe.type} · ${safe.duration} 个工作日</b></div><div class="detail-line"><span>登记状态</span><b><span class="record-status ${safe.status === 'cancelled' ? 'cancelled' : ''}">${safe.status === 'registered' ? '已登记 · 已生效' : '已撤销'}</span></b></div>${canReadReason ? `<div class="detail-reason"><small>私人说明 · 仅本人及负责人视角可见</small>${escape(record.reason || '没有补充说明。')}</div>` : '<p class="privacy-note">私人说明仅在本人及负责人视角显示。</p>'}<div class="detail-line"><span>登记时间</span><b>${escape(new Date(record.createdAt).toLocaleString('zh-CN', { hour12: false }))}</b></div>${record.status === 'cancelled' ? `<div class="detail-line"><span>撤销时间</span><b>${escape(new Date(record.cancelledAt).toLocaleString('zh-CN', { hour12: false }))}</b></div>` : ''}`;
    $('detail-actions').innerHTML = `<button class="secondary-button" data-close="detail-dialog">关闭</button>${record.memberId === state.memberId && record.status === 'registered' && !state.blocked ? `<button class="primary-button" data-cancel="${escape(record.id)}">撤销请假</button>` : ''}`;
    openDialog('detail-dialog');
  }
  function askCancel(id) {
    const record = state.records.find(record => record.id === id);
    if (!record || record.memberId !== state.memberId || record.status !== 'registered' || state.blocked) return;
    hideToast();
    state.cancelId = id;
    $('cancel-summary').textContent = `${record.memberName} · ${rangeWithYear(record)} · ${PERIOD_LABELS[record.period]} · ${record.duration} 个工作日`;
    $('cancel-error').hidden = true; $('confirm-cancel').disabled = false;
    openDialog('cancel-dialog');
  }
  function confirmCancel() {
    if ($('confirm-cancel').disabled) return;
    $('confirm-cancel').disabled = true;
    try {
      refreshLatest();
      const record = state.records.find(record => record.id === state.cancelId);
      if (!record) throw new Error('未找到这条登记，请刷新后重试。');
      const cancelled = Core.cancel(record, state.memberId);
      commit(state.records.map(record => record.id === cancelled.id ? cancelled : record));
      closeDialog('cancel-dialog');
      if ($('detail-dialog').open) closeDialog('detail-dialog');
      render(); showToast('请假已撤销，团队在岗安排已恢复。');
    } catch (error) { $('cancel-error').hidden = false; $('cancel-error').textContent = error.message; }
    finally { $('confirm-cancel').disabled = false; }
  }
  function hideToast() { clearTimeout(toastTimer); $('toast').hidden = true; }
  function showToast(message) { clearTimeout(toastTimer); $('toast-text').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(hideToast, 4500); }
  function exportRecords() {
    const records = visibleList();
    if (!records.length) return;
    // 公开字段导出；公式前缀加单引号，避免表格软件将文本作为公式执行。
    const csvCell = value => { let text = String(value); if (/^[=+\-@\t\r]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
    const rows = [['成员', '开始日期', '结束日期', '时段', '类型', '工作日天数', '状态'], ...records.map(record => { const safe = Core.toPublic(record); return [safe.person.name, safe.date.start, safe.date.end, PERIOD_LABELS[safe.date.period], safe.type, safe.duration, safe.status === 'registered' ? '已登记' : '已撤销']; })];
    const blob = new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `栖日-${state.view === 'mine' ? member().name + '的请假' : '团队登记'}-${today}.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('登记已导出，文件不包含私人说明。');
  }
  function bindEvents() {
    document.addEventListener('click', event => {
      const view = event.target.closest('[data-view]'); if (view) { switchView(view.dataset.view); return; }
      const date = event.target.closest('[data-date]'); if (date) { state.selectedDate = date.dataset.date; renderCalendar(); renderDay(); return; }
      const detail = event.target.closest('[data-detail]'); if (detail) { showDetail(detail.dataset.detail); return; }
      const cancel = event.target.closest('[data-cancel]'); if (cancel) { askCancel(cancel.dataset.cancel); return; }
      const close = event.target.closest('[data-close]'); if (close) closeDialog(close.dataset.close);
    });
    $('identity-select').addEventListener('change', event => {
      if (!Core.getMember(event.target.value)) return;
      state.memberId = event.target.value;
      try { sessionStorage.setItem(IDENTITY_KEY, state.memberId); } catch { /* 仅偏好保存失败，不影响登记。 */ }
      document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); updateScrollLock(); render();
    });
    $('member-filter').addEventListener('change', event => { state.memberFilter = event.target.value; renderCalendar(); });
    $('status-filter').addEventListener('change', event => { state.statusFilter = event.target.value; renderList(); });
    $('open-leave').addEventListener('click', () => openLeave());
    $('day-new-leave').addEventListener('click', () => openLeave(state.selectedDate));
    $('empty-new-leave').addEventListener('click', () => openLeave());
    $('leave-form').addEventListener('submit', submitLeave);
    $('leave-form').addEventListener('input', updateForm);
    $('leave-form').addEventListener('change', updateForm);
    $('start-date').addEventListener('change', () => { if ($('end-date').value < $('start-date').value) $('end-date').value = $('start-date').value; updateForm(); });
    $('confirm-cancel').addEventListener('click', confirmCancel);
    $('prev-month').addEventListener('click', () => moveMonth(-1));
    $('next-month').addEventListener('click', () => moveMonth(1));
    $('today-button').addEventListener('click', () => { state.month = monthStart(today); state.selectedDate = today; render(); });
    $('see-all').addEventListener('click', () => switchView('records'));
    $('export-records').addEventListener('click', exportRecords);
    document.querySelectorAll('dialog').forEach(dialog => {
      dialog.addEventListener('close', updateScrollLock);
      dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog.id); } });
    });
    window.addEventListener('storage', event => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      try {
        refreshLatest(); render();
        if ($('leave-dialog').open) updateForm();
        if ($('detail-dialog').open) { const id = state.detailId; closeDialog('detail-dialog'); if (state.records.some(record => record.id === id)) showDetail(id); }
      } catch { document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); updateScrollLock(); render(); }
    });
  }
  function moveMonth(amount) {
    const date = dateObject(state.month);
    date.setUTCMonth(date.getUTCMonth() + amount);
    const year = date.getUTCFullYear(); if (year < 1 || year > 9999) return;
    state.month = isoDate(date); state.selectedDate = state.month; render();
  }
  initialize();
})();
