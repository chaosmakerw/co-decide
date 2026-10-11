'use strict';

const ICONS = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  check: '<path d="m8 12 3 3 6-7"/><path d="M20 11v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2M8 18h2"/>',
  team: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  export: '<path d="M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
  leaf: '<path d="M20 4C10 1 3 8 5 15c3 7 14 5 15-11ZM5 20 15 9"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  tick: '<path d="m5 12 4 4L19 6"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.file}</svg>`;
const TYPES = { annual: '年假', personal: '事假', sick: '病假', comp: '调休' };
const STATUSES = { registered: '已登记', rejected: '历史未生效', cancelled: '已撤回' };
const ROUTES = { overview: '团队概览', mine: '我的登记', coordination: '协商提醒', calendar: '休假日历', team: '团队成员' };
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (selector) => document.querySelector(selector);
let state;
let route = 'overview';
let activeTab = 'all';
let search = '';
let typeFilter = 'all';
let page = 1;
let calendarYear, calendarMonth;
let selectedDate = '';
let busy = false;
let toastTimer;
const PAGE_SIZE = 6;

function dateObject(iso) { return new Date(`${iso}T12:00:00`); }
function isoDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function shortDate(iso) { return `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日`; }
function compactDate(iso) { return iso.slice(5).replace('-', '.'); }
function periodText(period) { return period === 'am' ? '上午' : '下午'; }
function dateRange(request) { return request.startDate === request.endDate ? shortDate(request.startDate) : `${shortDate(request.startDate)} – ${shortDate(request.endDate)}`; }
function formattedDays(days) { return Number.isInteger(days) ? String(days) : Number(days).toFixed(1); }
function memberById(id) { return state.members.find(m => m.id === id); }
function avatar(member, large = false) {
  const shades = ['green', 'peach', 'lavender', 'blue'];
  const index = state.members.findIndex(m => m.id === member?.id);
  return `<span class="avatar avatar-${shades[Math.max(0, index) % shades.length]}${large ? ' avatar-lg' : ''}" aria-hidden="true">${escapeHtml(member?.name.slice(-2) || '?')}</span>`;
}
function badge(status) { return `<span class="badge badge-${escapeHtml(status)}">${STATUSES[status] || '未知'}</span>`; }
function myBalance() { return state.balances.find(b => b.memberId === state.actor.id) || { total: 12, used: 0, reserved: 0, remaining: 12 }; }
function dayEvents(iso) {
  const weekday = dateObject(iso).getDay();
  if (weekday === 0 || weekday === 6) return [];
  return state.calendar.filter(r => r.startDate <= iso && r.endDate >= iso);
}
function upcomingWarnings() { return (state.coordinationWarnings || []).filter(w => w.date >= state.today); }
function warningForDate(date) { return (state.coordinationWarnings || []).find(w => w.date === date); }
function warningText(warning) { return `${shortDate(warning.date)}：${warning.members.map(m => m.name).join('、')}在同一天休假，请协商工作交接。`; }
function coordinationPanel(full = false) {
  const warnings = upcomingWarnings();
  if (!full && !warnings.length) return '';
  const visible = full ? warnings : warnings.slice(0, 3);
  return `<section class="panel coordination-panel" aria-label="同日休假协商提醒"><div class="panel-head"><div><div class="panel-title">${icon('team')}<h2>同日休假 · 协商提醒</h2><span class="muted-chip">仅提醒</span></div><p>登记已经生效，请伙伴们按实际情况协商交接安排。</p></div>${full ? '' : `<a class="link-button" href="#coordination">查看全部 ${warnings.length} 项 ${icon('right')}</a>`}</div>${visible.length ? `<div class="coordination-list">${visible.map(w => `<article class="coordination-row" data-coordination-date="${escapeHtml(w.date)}"><div class="coordination-date"><strong>${shortDate(w.date)}</strong><small>${w.date.slice(0, 4)} · ${dateObject(w.date).toLocaleDateString('zh-CN', { weekday: 'long' })}</small></div><div class="coordination-people"><div>${w.members.map(m => `<span class="coordination-person">${avatar(memberById(m.id))}<span>${escapeHtml(m.name)}</span></span>`).join('')}</div><p>共有 ${w.members.length} 位伙伴休假，建议确认工作交接。</p></div><button class="link-button" data-action="coordination-date" data-date="${escapeHtml(w.date)}">查看安排 ${icon('right')}</button></article>`).join('')}</div>` : `<div class="empty-state"><span class="empty-icon">${icon('leaf')}</span><h3>近期没有同日多人休假</h3><p>休假提交即登记。有多人同日休假时，这里会提示你们协商安排。</p></div>`}</section>`;
}
async function api(path, options = {}) {
  const headers = { 'X-Demo-Actor': state?.actor?.id || options.actorId || '', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers };
  const response = await fetch(path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '操作未完成，请稍后重试。');
  return data;
}
function notify(message, error = false) {
  clearTimeout(toastTimer);
  const toast = $('#toast');
  toast.className = `toast${error ? ' error' : ''}`;
  toast.innerHTML = `${icon(error ? 'info' : 'tick')}<span>${escapeHtml(message)}</span>`;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, error ? 6500 : 3500);
}

function renderChrome() {
  $('#profile-menu').hidden = true;
  $('#profile-button').setAttribute('aria-expanded', 'false');
  const warningCount = upcomingWarnings().length;
  const nav = [['overview', 'overview'], ['mine', 'file'], ['coordination', 'team'], ['calendar', 'calendar'], ['team', 'team']];
  $('#navigation').innerHTML = nav.map(([key, glyph]) => `<a class="nav-item ${route === key ? 'active' : ''}" href="#${key}" ${route === key ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${ROUTES[key]}</span>${key === 'coordination' && warningCount ? `<span class="nav-badge">${warningCount}</span>` : ''}</a>`).join('');
  $('.workspace-count').textContent = state.members.length;
  $('#breadcrumb-title').textContent = ROUTES[route];
  $('#header-date').textContent = dateObject(state.today).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
  $('#notification-icon').innerHTML = icon('bell');
  $('#notification-dot').hidden = !warningCount;
  $('#profile-button').innerHTML = `${avatar(state.actor)}<span class="profile-name">${escapeHtml(state.actor.name)}<small>${state.actor.role === 'manager' ? '团队负责人' : '团队成员'}</small></span>${icon('chevron')}`;
  $('#profile-menu').innerHTML = `<p class="popover-heading">切换演示身份</p>${state.members.map(m => `<button class="profile-option ${m.id === state.actor.id ? 'selected' : ''}" data-action="switch-actor" data-id="${escapeHtml(m.id)}">${avatar(m)}<span>${escapeHtml(m.name)}<small>${m.role === 'manager' ? '负责人 · 查看团队记录' : '成员 · 登记自己的休假'}</small></span>${m.id === state.actor.id ? `<span class="selected-check">${icon('tick')}</span>` : ''}</button>`).join('')}<div class="popover-foot">仅模拟不同角色的操作界面。<br>这不是真实登录，数据仅保存在本机。</div>`;
}

function heading() {
  const messages = {
    overview: [`${escapeHtml(state.actor.name)}，给忙碌留一点空白。`, '团队的休假安排，一目了然。让每一次休息都从容有序。', 'YOUR TEAM, AT A GLANCE'],
    mine: ['我的休假登记', '提交后立即生效，随时查看或撤回自己的休假安排。', 'A LITTLE TIME FOR YOURSELF'],
    coordination: ['一起商量，从容休假', '同一天有多人休假时，互相确认工作交接和协作安排。', 'MAKE PLANS TOGETHER'],
    calendar: ['一起，把时间安排好', '已登记休假即时展示，同日多人休假会提醒协商。', 'MAKE ROOM FOR A BREAK'],
    team: ['小团队，彼此照应', '了解伙伴的休假安排，让团队协作更从容。', 'GOOD PEOPLE, GOOD BALANCE'],
  };
  const [title, sub, eyebrow] = messages[route];
  return `<section class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${sub}</p></div><button class="button button-primary" data-action="apply">${icon('plus')}登记休假</button></section>`;
}
function stats() {
  const requests = route === 'mine' ? state.requests.filter(r => r.memberId === state.actor.id) : state.requests;
  const registered = requests.filter(r => r.status === 'registered').length;
  const offToday = new Set(dayEvents(state.today).map(r => r.memberId)).size;
  const month = state.today.slice(0, 7);
  const registeredDays = state.calendar.reduce((sum, r) => {
    let n = 0;
    const cursor = dateObject(r.startDate);
    const end = dateObject(r.endDate);
    for (; cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const iso = isoDate(cursor);
      if (iso.startsWith(month) && cursor.getDay() !== 0 && cursor.getDay() !== 6) n += 1 - (iso === r.startDate && r.startPeriod === 'pm' ? .5 : 0) - (iso === r.endDate && r.endPeriod === 'am' ? .5 : 0);
    }
    return sum + n;
  }, 0);
  const b = myBalance();
  return `<section class="stats-grid" aria-label="休假统计">${[
    ['已登记休假', registered, '项', 'calendar', '', '提交即生效，安排更轻松'],
    ['今日休假', offToday, '人', 'sun', 'green', [0, 6].includes(dateObject(state.today).getDay()) ? '今天是周末，好好休息吧' : `${state.members.length - offToday} 位伙伴正在岗`],
    ['本月已登记休假', formattedDays(registeredDays), '天', 'calendar', 'blue', `${Number(month.slice(5))}月的工作日休假合计`],
    ['我的可用年假', formattedDays(b.remaining), '天', 'leaf', 'purple', `全年 ${b.total} 天 · 已登记 ${formattedDays(b.used)} 天`],
  ].map(([label, n, unit, glyph, color, foot]) => `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon ${color}">${icon(glyph)}</span></div><div class="stat-number">${n}<small>${unit}</small></div><div class="stat-foot"><span class="tiny-dot"></span>${foot}</div></article>`).join('')}</section>`;
}

function scopedRequests() {
  let rows = state.requests;
  if (route === 'mine') rows = rows.filter(r => r.memberId === state.actor.id);
  return rows.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
function filteredRequests() {
  return scopedRequests().filter(r => {
    if (activeTab !== 'all' && r.status !== activeTab) return false;
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    const term = search.trim().toLocaleLowerCase();
    return !term || [memberById(r.memberId)?.name, TYPES[r.type], r.reason, r.startDate, r.endDate].some(v => String(v || '').toLocaleLowerCase().includes(term));
  });
}
function requestPanel() {
  const rows = scopedRequests();
  const title = route === 'mine' ? '我的登记记录' : '休假登记';
  const tabs = ['all', 'registered', 'cancelled', ...(rows.some(r => r.status === 'rejected') ? ['rejected'] : [])];
  return `<section class="panel requests-panel"><div class="panel-head"><div><div class="panel-title"><h2>${title}</h2><span class="muted-chip">本地演示</span></div><p>${state.actor.role === 'manager' && route !== 'mine' ? '提交即登记生效，伙伴们自行协商安排。' : '这里展示你本人的登记，个人事由仅负责人可见。'}</p></div><button class="link-button" data-action="export">${icon('export')}导出记录</button></div><div class="table-tabs" role="tablist" aria-label="按登记状态筛选">${tabs.map(status => `<button class="table-tab ${status === activeTab ? 'active' : ''}" role="tab" aria-selected="${status === activeTab}" data-action="tab" data-status="${status}">${status === 'all' ? '全部登记' : STATUSES[status]}${(status === 'all' || status === 'registered') ? `<span class="tab-count">${rows.filter(r => status === 'all' || r.status === status).length}</span>` : ''}</button>`).join('')}</div><div class="table-toolbar"><label class="search-field">${icon('search')}<input id="request-search" type="search" placeholder="搜索姓名、事由或日期" aria-label="搜索登记" value="${escapeHtml(search)}"></label><select id="type-filter" class="filter-select" aria-label="按休假类型筛选"><option value="all">全部类型</option>${Object.entries(TYPES).map(([key, label]) => `<option value="${key}" ${typeFilter === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div id="request-results"></div></section>`;
}
function renderRows() {
  const target = $('#request-results');
  if (!target) return;
  const rows = filteredRequests();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  page = Math.min(page, pages);
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  target.innerHTML = rows.length ? `<div class="table-scroll"><table class="request-table"><thead><tr><th>登记人</th><th>休假安排</th><th>时长</th><th>状态</th><th>操作</th></tr></thead><tbody>${visible.map(r => {
    const member = memberById(r.memberId);
    return `<tr><td><div class="member-cell">${avatar(member)}<div><strong>${escapeHtml(member.name)}</strong><small>${member.role === 'manager' ? '负责人' : '团队成员'}</small></div></div></td><td><div class="request-type type-${r.type}"><span class="type-dot"></span>${TYPES[r.type]}</div><div class="request-date">${compactDate(r.startDate)}${r.startDate !== r.endDate ? ` – ${compactDate(r.endDate)}` : ` · ${r.days === .5 ? periodText(r.startPeriod) : '全天'}`}</div></td><td class="days-cell">${formattedDays(r.days)} 天</td><td>${badge(r.status)}</td><td><button class="row-action" data-action="detail" data-id="${escapeHtml(r.id)}">查看详情</button></td></tr>`;
  }).join('')}</tbody></table></div>` : `<div class="empty-state"><span class="empty-icon">${icon('leaf')}</span><h3>${search || typeFilter !== 'all' ? '没有找到匹配的登记' : '这里还没有登记记录'}</h3><p>${search || typeFilter !== 'all' ? '试试其他关键词或休假类型。' : '给忙碌留一点空白，准备好后就登记休假吧。'}</p></div>`;
  target.insertAdjacentHTML('beforeend', `<div class="table-footer"><span>共 ${rows.length} 条记录${rows.length ? ` · 显示 ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, rows.length)} 条` : ''}</span><div class="pagination"><button class="page-button" data-action="page" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="上一页">‹</button>${Array.from({ length: pages }, (_, i) => `<button class="page-button ${page === i + 1 ? 'active' : ''}" data-action="page" data-page="${i + 1}" aria-label="第${i + 1}页" ${page === i + 1 ? 'aria-current="page"' : ''}>${i + 1}</button>`).join('')}<button class="page-button" data-action="page" data-page="${page + 1}" ${page === pages ? 'disabled' : ''} aria-label="下一页">›</button></div></div>`);
}

function calendar(full = false) {
  const first = new Date(calendarYear, calendarMonth, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(calendarYear, calendarMonth, 1 - offset, 12);
  const monthDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const cells = Math.ceil((offset + monthDays) / 7) * 7;
  const days = Array.from({ length: cells }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const iso = isoDate(d);
    const events = dayEvents(iso);
    const warning = warningForDate(iso);
    const classes = [d.getMonth() !== calendarMonth ? 'outside' : '', [0, 6].includes(d.getDay()) ? 'weekend' : '', events.length ? 'has-leave' : '', warning ? 'needs-coordination' : '', state.today === iso ? 'today' : '', selectedDate === iso ? 'selected' : ''].filter(Boolean).join(' ');
    const label = `${shortDate(iso)}，${events.length ? events.map(r => `${memberById(r.memberId)?.name}休${TYPES[r.type]}`).join('，') : '无人休假'}${warning ? '，同日多人休假，请协商交接' : ''}`;
    return `<button class="calendar-day ${classes}" data-action="calendar-day" data-date="${iso}" aria-label="${escapeHtml(label)}" ${selectedDate === iso ? 'aria-pressed="true"' : ''}><span>${d.getDate()}</span>${full ? events.slice(0, 2).map(r => `<span class="calendar-event">${escapeHtml(memberById(r.memberId)?.name)} · ${TYPES[r.type]}</span>`).join('') + (events.length > 2 ? `<span class="calendar-event">还有 ${events.length - 2} 条登记</span>` : '') : ''}</button>`;
  }).join('');
  const upcoming = state.calendar.filter(r => r.endDate >= state.today).slice().sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 3);
  const selectedEvents = selectedDate ? dayEvents(selectedDate) : [];
  const selectedWarning = selectedDate ? warningForDate(selectedDate) : null;
  return `<section class="panel calendar-panel ${full ? 'full-calendar' : ''}"><div class="panel-head"><div class="panel-title"><h2>${full ? '团队休假日历' : '休假日历'}</h2></div><div class="calendar-heading-actions"><button class="icon-button" data-action="calendar-prev" aria-label="上个月">${icon('left')}</button><button class="icon-button" data-action="calendar-next" aria-label="下个月">${icon('right')}</button></div></div><div class="calendar-month"><strong>${calendarYear} 年 ${calendarMonth + 1} 月</strong><button class="link-button" data-action="calendar-today">回到今天</button></div><div class="calendar-grid">${['一', '二', '三', '四', '五', '六', '日'].map(d => `<span class="weekday">${d}</span>`).join('')}${days}</div><div class="calendar-legend"><span><i class="legend-square"></i>已登记</span><span><i class="legend-square legend-coordination"></i>同日多人</span><span><i class="legend-square legend-today"></i>今天</span></div>${selectedDate ? `<div class="calendar-selected"><strong>${selectedDate} · 休假安排</strong>${selectedEvents.length ? selectedEvents.map(r => `<p>${escapeHtml(memberById(r.memberId)?.name)} · ${TYPES[r.type]}${r.startDate === selectedDate && r.startPeriod === 'pm' ? ' · 下午' : r.endDate === selectedDate && r.endPeriod === 'am' ? ' · 上午' : ' · 全天'}</p>`).join('') : '<p>当天没有已登记的休假，工作日统计不含周末。</p>'}${selectedWarning ? `<div class="coordination-hint">${escapeHtml(warningText(selectedWarning))} 登记已生效，具体安排由你们协商。</div>` : ''}</div>` : ''}${!full ? `<div class="upcoming-section"><div class="section-label">近期休假<span>已登记生效</span></div>${upcoming.length ? upcoming.map(r => `<div class="upcoming-row">${avatar(memberById(r.memberId))}<div><strong>${escapeHtml(memberById(r.memberId)?.name)} <span class="request-date">· ${TYPES[r.type]}</span></strong><small>${dateRange(r)}</small></div><span class="upcoming-days">${formattedDays(r.days)} 天</span></div>`).join('') : '<div class="request-date">近期没有已登记的休假安排。</div>'}</div>` : ''}</section>`;
}
function balancePanel() {
  const b = myBalance();
  const fill = n => Math.min(24, Math.max(0, Math.round(n / b.total * 24)));
  return `<section class="panel balance-panel"><div class="balance-title">我的年假<span>${state.today.slice(0, 4)} 年度</span></div><div class="balance-value">${formattedDays(b.remaining)}<small>天可用</small><span>共 ${b.total} 天</span></div><div class="progress-track" aria-label="已登记 ${b.used} 天，可用 ${b.remaining} 天"><span class="progress-fill fill-${fill(b.used)}"></span></div><div class="balance-key"><span><i class="key-dot"></i>已登记 ${formattedDays(b.used)} 天</span><span>可用 ${formattedDays(b.remaining)} 天</span></div><p class="balance-help">演示额度为每人每年 12 天。年假登记生效时计入余额，本人撤回后归还。</p></section>`;
}
function teamView() {
  return `<section class="team-grid">${state.members.map(m => {
    const b = state.balances.find(b => b.memberId === m.id);
    const off = dayEvents(state.today).some(r => r.memberId === m.id);
    const upcoming = state.calendar.filter(r => r.memberId === m.id && r.endDate >= state.today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    return `<article class="panel team-card"><div class="team-person">${avatar(m)}<div><h2>${escapeHtml(m.name)}</h2><p>${m.role === 'manager' ? '团队负责人' : '团队成员'}${m.id === state.actor.id ? ' · 我' : ''}</p></div></div>${b ? `<div class="team-metric">可用年假 <strong>${formattedDays(b.remaining)}</strong> 天<small> / ${b.total} 天</small></div><div class="request-date">已登记年假 ${formattedDays(b.used)} 天</div>` : '<div class="request-date">个人年假余额仅本人和负责人可见。</div>'}<div class="team-status"><i></i>${off ? '今日休假中' : [0, 6].includes(dateObject(state.today).getDay()) ? '今日为周末' : '今日在岗'}</div><p class="balance-help">${upcoming ? `近期休假：${dateRange(upcoming)} · ${TYPES[upcoming.type]}` : '近期暂无已登记休假。'}</p></article>`;
  }).join('')}</section><p class="page-hint">团队日历公开已登记的休假安排。请假事由与工作交接仅本人和负责人可见。</p>`;
}
function renderPage() {
  if (!state) return;
  renderChrome();
  const main = $('#main');
  if (route === 'calendar') main.innerHTML = heading() + calendar(true) + '<p class="page-hint">点击日期查看当天休假人员。周末不计入请假天数；此演示尚未配置法定节假日与调班。</p>';
  else if (route === 'team') main.innerHTML = heading() + teamView();
  else if (route === 'coordination') main.innerHTML = heading() + coordinationPanel(true);
  else {
    main.innerHTML = heading() + stats() + `<div class="content-grid"><div>${coordinationPanel()}${requestPanel()}<div class="quick-note">${icon('info')}<div><strong>休息有计划，协作更轻松。</strong><p>休假提交即登记生效。多人同日休假时请协商交接；本人可撤回登记，日历和年假余额同步更新。</p></div></div></div><aside class="right-stack" aria-label="休假日历与余额">${calendar()}${balancePanel()}</aside></div>`;
    renderRows();
  }
}
function setRoute() {
  route = Object.hasOwn(ROUTES, location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  if (location.hash && !Object.hasOwn(ROUTES, location.hash.slice(1))) history.replaceState(null, '', '#overview');
  activeTab = 'all'; search = ''; typeFilter = 'all'; page = 1;
  renderPage();
}

function closeDialogs() { document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); }
function nextWorkday() {
  const day = dateObject(state.today); day.setDate(day.getDate() + 1);
  while ([0, 6].includes(day.getDay())) day.setDate(day.getDate() + 1);
  return isoDate(day);
}
function openApply() {
  $('#apply-form').reset();
  $('#apply-error').hidden = true;
  $('#start-date').value = nextWorkday(); $('#end-date').value = nextWorkday();
  $('#start-period').value = 'am'; $('#end-period').value = 'pm';
  $('#applicant-summary').innerHTML = `${avatar(state.actor)}<span>${escapeHtml(state.actor.name)}</span><small>可用年假 ${formattedDays(myBalance().remaining)} 天</small>`;
  updateDuration();
  $('#apply-dialog').showModal();
}
function updateDuration() {
  const form = new FormData($('#apply-form'));
  const start = String(form.get('startDate'));
  const end = String(form.get('endDate'));
  let days = 0;
  const peerWarnings = [];
  if (start && end && start <= end) {
    const d = dateObject(start); const last = dateObject(end);
    if ((last - d) / 86400000 < 365) {
      for (; d <= last; d.setDate(d.getDate() + 1)) {
        const iso = isoDate(d);
        if (![0, 6].includes(d.getDay())) {
          days += 1 - (iso === start && form.get('startPeriod') === 'pm' ? .5 : 0) - (iso === end && form.get('endPeriod') === 'am' ? .5 : 0);
          const peers = [...new Set(dayEvents(iso).filter(r => r.memberId !== state.actor.id).map(r => r.memberId))].map(id => memberById(id));
          if (peers.length) peerWarnings.push({ date: iso, members: peers });
        }
      }
    }
  }
  $('#duration-preview').innerHTML = days > 0 ? `预计请假 <strong>${formattedDays(days)} 天</strong> · 仅计算周一至周五，未配置法定节假日与调班。` : '请选择有效的工作日期和时段，最长支持 365 个自然日。';
  const preview = $('#coordination-preview');
  preview.hidden = days <= 0 || !peerWarnings.length;
  preview.innerHTML = preview.hidden ? '' : `<strong>同日休假 · 请协商交接</strong>${peerWarnings.slice(0, 3).map(w => `<p>${escapeHtml(shortDate(w.date))}：${w.members.map(m => escapeHtml(m.name)).join('、')}也在休假。</p>`).join('')}${peerWarnings.length > 3 ? `<p>另有 ${peerWarnings.length - 3} 个日期同日多人休假。</p>` : ''}<p>提交后仍会立即生效，具体安排请和伙伴们协商。</p>`;
}
function openDetail(id) {
  const r = state.requests.find(r => r.id === id);
  if (!r) return notify('这条登记已不可用，请刷新后重试。', true);
  const m = memberById(r.memberId);
  const canCancel = state.actor.id === r.memberId && r.status === 'registered';
  const warnings = (state.coordinationWarnings || []).filter(w => w.requestIds.includes(r.id));
  $('#detail-dialog').innerHTML = `<div class="modal-header"><div><span class="eyebrow">LEAVE REGISTRATION</span><h2 id="detail-title">休假登记详情</h2></div><button class="icon-button" data-action="close-dialog" aria-label="关闭">×</button></div><div class="modal-body"><div class="detail-top"><div class="detail-person">${avatar(m, true)}<div><strong>${escapeHtml(m.name)}</strong><small>${m.role === 'manager' ? '团队负责人' : '团队成员'}</small></div></div>${badge(r.status)}</div><dl class="detail-grid"><div><dt>休假类型</dt><dd>${TYPES[r.type]}</dd></div><div><dt>请假时长</dt><dd>${formattedDays(r.days)} 个工作日</dd></div><div><dt>开始时间</dt><dd>${escapeHtml(r.startDate)} · ${periodText(r.startPeriod)}</dd></div><div><dt>结束时间</dt><dd>${escapeHtml(r.endDate)} · ${periodText(r.endPeriod)}</dd></div></dl>${warnings.length ? `<div class="coordination-hint"><strong>同日休假 · 请协商交接</strong>${warnings.slice(0, 3).map(w => `<p>${escapeHtml(warningText(w))}</p>`).join('')}${warnings.length > 3 ? `<p>另有 ${warnings.length - 3} 个日期，请到协商提醒中查看。</p>` : ''}<p>本条登记已生效，具体安排由你们协商。</p></div>` : ''}<div class="detail-section"><h3>请假事由</h3><p>${escapeHtml(r.reason)}</p></div><div class="detail-section"><h3>工作交接</h3><p>${escapeHtml(r.handover || '暂无交接说明。')}</p></div>${r.decisionBy ? `<div class="detail-section"><h3>历史审批记录 · ${escapeHtml(memberById(r.decisionBy)?.name || '负责人')}</h3><p>${escapeHtml(r.decisionNote || '已保留原记录。')}</p></div>` : ''}<p class="detail-created">提交于 ${escapeHtml(new Date(r.createdAt).toLocaleString('zh-CN', { hour12: false }))}</p><p id="detail-error" class="form-error" role="alert" hidden></p></div><div class="modal-footer"><button class="button button-secondary" data-action="close-dialog">关闭</button>${canCancel ? `<button class="button button-danger" data-action="cancel-request" data-id="${escapeHtml(r.id)}">撤回登记</button>` : ''}</div>`;
  $('#detail-dialog').showModal();
}
async function mutate(path, body, message, submittedRange) {
  if (busy) return;
  busy = true;
  const buttons = [...document.querySelectorAll('dialog[open] button')];
  buttons.forEach(b => b.disabled = true);
  try {
    state = await api(path, { method: 'POST', body: JSON.stringify(body) });
    closeDialogs(); renderPage();
    const warnings = submittedRange ? (state.coordinationWarnings || []).filter(w => w.date >= submittedRange.startDate && w.date <= submittedRange.endDate && w.members.some(m => m.id === state.actor.id)) : [];
    notify(message + (warnings.length ? ` ${warnings.slice(0, 2).map(warningText).join(' ')}${warnings.length > 2 ? ` 另有 ${warnings.length - 2} 个日期可在协商提醒中查看。` : ''}` : ''));
  } catch (error) {
    const target = $('#detail-dialog').open ? $('#detail-error') : $('#apply-error');
    if (target) { target.textContent = error.message; target.hidden = false; } else notify(error.message, true);
  } finally { busy = false; buttons.forEach(b => b.disabled = false); }
}
async function exportRecords() {
  try {
    const response = await fetch('/api/export', { headers: { 'X-Demo-Actor': state.actor.id } });
    if (!response.ok) throw new Error('导出未完成，请稍后重试。');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = `休假记录-${state.actor.name}-${state.today}.csv`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('已导出当前身份可查看的全部登记记录。');
  } catch (error) { notify(error.message, true); }
}

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!event.target.closest('.profile-wrap')) { $('#profile-menu').hidden = true; $('#profile-button').setAttribute('aria-expanded', 'false'); }
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'retry') { await init(); return; }
  if (!state) return;
  if (busy && ['close-dialog', 'switch-actor', 'cancel-request'].includes(action)) return;
  if (action === 'apply') openApply();
  else if (action === 'close-dialog') closeDialogs();
  else if (action === 'profile') { $('#profile-menu').hidden = !$('#profile-menu').hidden; target.setAttribute('aria-expanded', String(!$('#profile-menu').hidden)); }
  else if (action === 'switch-actor') {
    $('#profile-menu').hidden = true;
    try { const next = await api('/api/state', { headers: { 'X-Demo-Actor': target.dataset.id } }); state = next; try { localStorage.setItem('timeoff-demo-actor', state.actor.id); } catch {} closeDialogs(); setRoute(); notify(`已切换为${state.actor.name}（演示身份）`); }
    catch (error) { notify(error.message, true); }
  } else if (action === 'tab') { activeTab = target.dataset.status; page = 1; renderPage(); }
  else if (action === 'page') { page = Number(target.dataset.page); renderRows(); }
  else if (action === 'detail') openDetail(target.dataset.id);
  else if (action === 'calendar-prev' || action === 'calendar-next') { const d = new Date(calendarYear, calendarMonth + (action === 'calendar-prev' ? -1 : 1), 1); calendarYear = d.getFullYear(); calendarMonth = d.getMonth(); selectedDate = ''; renderPage(); }
  else if (action === 'calendar-today') { const d = dateObject(state.today); calendarYear = d.getFullYear(); calendarMonth = d.getMonth(); selectedDate = state.today; renderPage(); }
  else if (action === 'calendar-day') { selectedDate = target.dataset.date; renderPage(); }
  else if (action === 'coordination-date') {
    selectedDate = target.dataset.date;
    const d = dateObject(selectedDate); calendarYear = d.getFullYear(); calendarMonth = d.getMonth();
    if (route === 'calendar') renderPage(); else location.hash = 'calendar';
  } else if (action === 'cancel-request') {
    if (!confirm('确定撤回这条休假登记吗？撤回后会从日历移除，年假额度也会归还。')) return;
    await mutate(`/api/requests/${encodeURIComponent(target.dataset.id)}/cancel`, {}, '登记已撤回，日历和年假余额已更新。');
  } else if (action === 'export') await exportRecords();
  else if (action === 'notifications') {
    const warnings = upcomingWarnings();
    if (warnings.length) { location.hash = 'coordination'; notify(`有 ${warnings.length} 个日期同日多人休假，请和伙伴们协商交接。`); }
    else notify('近期没有同日多人休假，所有登记已即时生效。');
  }
});
document.addEventListener('input', event => {
  if (event.target.id === 'request-search') { search = event.target.value; page = 1; renderRows(); }
  if (['start-date', 'end-date', 'start-period', 'end-period'].includes(event.target.id)) updateDuration();
});
document.addEventListener('change', event => {
  if (event.target.id === 'type-filter') { typeFilter = event.target.value; page = 1; renderRows(); }
  if (event.target.closest('#apply-form')) updateDuration();
});
$('#apply-form').addEventListener('submit', async event => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget));
  body.reason = body.reason.trim(); body.handover = body.handover.trim();
  await mutate('/api/requests', body, '休假已登记生效，日历已更新。', body);
});
window.addEventListener('hashchange', () => { closeDialogs(); setRoute(); });
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => { if (event.target === dialog && !busy) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
});
async function init() {
  try {
    const bootstrap = await api('/api/bootstrap');
    let saved = ''; try { saved = localStorage.getItem('timeoff-demo-actor'); } catch {}
    const actor = bootstrap.members.find(m => m.id === saved) || bootstrap.members.find(m => m.role === 'manager') || bootstrap.members[0];
    state = await api('/api/state', { actorId: actor.id });
    const today = dateObject(state.today); calendarYear = today.getFullYear(); calendarMonth = today.getMonth();
    setRoute();
  } catch (error) {
    $('#main').innerHTML = `<section class="panel no-network"><span class="empty-icon">${icon('leaf')}</span><h1>工作台暂时没有连接上</h1><p>请先在本目录运行 <code>node server.cjs</code>，再打开 <code>http://127.0.0.1:4173</code>。</p><p>${escapeHtml(error.message)}</p><button class="button button-primary" data-action="retry">重新连接</button></section>`;
  }
}
init();
