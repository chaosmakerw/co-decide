'use strict';

(() => {
  const STORAGE_KEY = 'dorm-habits-local-demo-v1';
  const MEMBERS = [
    { id: 'm1', name: '室友 1', example: '阅读 20 分钟' },
    { id: 'm2', name: '室友 2', example: '跑步 15 分钟' },
    { id: 'm3', name: '室友 3', example: '练习 Java 25 分钟' },
    { id: 'm4', name: '室友 4', example: '整理桌面' }
  ];
  const $ = id => document.getElementById(id);
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const today = () => dateKey(new Date());
  const parseDay = key => new Date(`${key}T12:00:00`);
  const validDate = key => typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && dateKey(parseDay(key)) === key;
  const weekDays = key => {
    const monday = parseDay(key);
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
    return Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + offset);
      return dateKey(date);
    });
  };
  const seed = () => ({
    version: 1,
    selectedMemberId: 'm1',
    habits: MEMBERS.map(member => ({ id: `example-${member.id}`, ownerId: member.id, name: member.example, createdOn: today() })),
    checks: {}
  });
  const validateState = value => {
    if (!value || value.version !== 1 || !MEMBERS.some(m => m.id === value.selectedMemberId) || !Array.isArray(value.habits) || !value.checks || typeof value.checks !== 'object' || Array.isArray(value.checks)) return false;
    const ids = new Set();
    const names = new Set();
    for (const habit of value.habits) {
      if (!habit || typeof habit.id !== 'string' || !habit.id || ids.has(habit.id) || !MEMBERS.some(m => m.id === habit.ownerId) || typeof habit.name !== 'string' || !habit.name.trim() || habit.name.length > 40 || !validDate(habit.createdOn)) return false;
      const ownerName = `${habit.ownerId}:${habit.name}`;
      if (names.has(ownerName)) return false;
      names.add(ownerName);
      ids.add(habit.id);
    }
    return Object.entries(value.checks).every(([day, checked]) => validDate(day) && Array.isArray(checked) && new Set(checked).size === checked.length && checked.every(id => ids.has(id) && value.habits.find(habit => habit.id === id).createdOn <= day));
  };
  let state;
  let blocked = false;
  let renderedDay;
  const status = (message, error = false) => {
    $('status').textContent = message;
    $('status').classList.toggle('error', error);
  };
  const blockStorage = () => {
    blocked = true;
    state = seed();
    $('storage-error').hidden = false;
    $('storage-error').textContent = '本地记录无法读取，已停止写入，原始存储没有被覆盖。请检查浏览器网站数据，或使用另一份浏览器个人资料重新试用。';
    $('member-select').disabled = true;
    $('habit-name').disabled = true;
    $('add-habit').disabled = true;
  };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    state = saved === null ? seed() : JSON.parse(saved);
    if (!validateState(state)) throw new Error('Invalid local record');
    if (saved === null) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {
    blockStorage();
  }
  const ownHabits = (owner, day = today()) => state.habits.filter(habit => habit.ownerId === owner && habit.createdOn <= day);
  const isDone = (habitId, day) => (state.checks[day] || []).includes(habitId);
  const dailyTotals = (habits, day) => ({ total: habits.length, complete: habits.filter(habit => isDone(habit.id, day)).length });
  const weeklyTotals = (habits, days, currentDay) => {
    let total = 0;
    let complete = 0;
    for (const habit of habits) for (const day of days) {
      if (day < habit.createdOn || day > currentDay) continue;
      total++;
      if (isDone(habit.id, day)) complete++;
    }
    return { total, complete };
  };
  const commit = (next, message) => {
    if (blocked) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      state = next;
      render();
      status(message);
      return true;
    } catch (_) {
      status('保存失败，操作未生效。请检查浏览器是否允许保存网站数据，然后重试。', true);
      return false;
    }
  };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const toggleHabit = habitId => {
    const currentDay = today();
    const habit = state.habits.find(h => h.id === habitId && h.ownerId === state.selectedMemberId && h.createdOn <= currentDay);
    if (!habit || blocked) return;
    const next = structuredClone(state);
    const checked = new Set(next.checks[currentDay] || []);
    const wasDone = checked.has(habitId);
    if (wasDone) checked.delete(habitId);
    else checked.add(habitId);
    next.checks[currentDay] = Array.from(checked);
    commit(next, wasDone ? `已撤销“${habit.name}”的今日打卡。` : `“${habit.name}”今日已打卡，并已保存。`);
  };
  const render = () => {
    const currentDay = today();
    renderedDay = currentDay;
    const days = weekDays(currentDay);
    const selected = MEMBERS.find(m => m.id === state.selectedMemberId);
    const personal = ownHabits(selected.id, currentDay);
    const activeHabits = state.habits.filter(h => h.createdOn <= currentDay);
    const room = dailyTotals(activeHabits, currentDay);
    const mine = dailyTotals(personal, currentDay);
    const percent = room.total ? Math.round(room.complete / room.total * 100) : 0;
    $('today-label').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(parseDay(currentDay));
    $('member-select').value = selected.id;
    $('room-percent').textContent = `${percent}%`;
    $('room-progress').value = percent;
    $('room-summary').textContent = room.total ? `全宿舍今日已完成 ${room.complete} / ${room.total} 个习惯${room.complete === room.total ? ' · 今日全部完成' : ''}` : '还没有每日习惯，新增后就能开始记录。';
    $('personal-summary').textContent = `${mine.complete} / ${mine.total} 已完成`;
    $('room-members').replaceChildren(...MEMBERS.map(member => {
      const totals = dailyTotals(ownHabits(member.id, currentDay), currentDay);
      const card = element('div', `member-card${member.id === selected.id ? ' current' : ''}`);
      card.dataset.member = member.id;
      card.append(element('strong', '', member.name), element('span', '', totals.total ? `今日 ${totals.complete} / ${totals.total} 已完成` : '还没有每日习惯'));
      return card;
    }));
    const roomWeek = weeklyTotals(state.habits, days, currentDay);
    $('room-week').textContent = `宿舍本周截至今天：${roomWeek.complete} / ${roomWeek.total} 次已完成`;
    $('habit-list').replaceChildren(...personal.map(habit => {
      const done = isDone(habit.id, currentDay);
      const row = element('div', `habit-row${done ? ' done' : ''}`);
      row.dataset.habitId = habit.id;
      const copy = element('div');
      copy.append(element('h3', 'habit-name', habit.name), element('span', 'habit-state', done ? '今天已打卡' : '今天待完成'));
      const button = element('button', done ? 'undo' : '', done ? '撤销' : '打卡');
      button.type = 'button';
      button.disabled = blocked;
      button.setAttribute('aria-label', `${done ? '撤销' : '打卡'}：${habit.name}`);
      button.setAttribute('aria-pressed', String(done));
      button.addEventListener('click', () => toggleHabit(habit.id));
      row.append(copy, button);
      return row;
    }));
    if (!personal.length) $('habit-list').append(element('p', 'empty', '先新增一个小习惯，今天就可以开始。'));
    $('week-range').textContent = `${days[0]} 至 ${days[6]} · ${selected.name}`;
    const week = weeklyTotals(personal, days, currentDay);
    $('week-summary').textContent = `截至今天已完成 ${week.complete} / ${week.total} 次`;
    const head = element('tr');
    head.append(element('th', '', '每日习惯'));
    for (const [index, day] of days.entries()) {
      const cell = element('th');
      cell.append(element('span', 'week-day', ['一', '二', '三', '四', '五', '六', '日'][index]), element('span', 'week-date', day.slice(5)));
      cell.scope = 'col';
      head.append(cell);
    }
    $('week-table').querySelector('thead').replaceChildren(head);
    $('week-table').querySelector('tbody').replaceChildren(...personal.map(habit => {
      const row = element('tr');
      const label = element('th', '', habit.name);
      label.scope = 'row';
      row.append(label);
      for (const day of days) {
        const code = day < habit.createdOn ? 'not-created' : day > currentDay ? 'future' : isDone(habit.id, day) ? 'complete' : 'pending';
        const symbol = { 'not-created': '—', future: '·', complete: '✓', pending: '○' }[code];
        const explanation = { 'not-created': '尚未建立', future: '未来日期', complete: '已完成', pending: '尚未完成' }[code];
        const cell = element('td', code, symbol);
        cell.dataset.day = day;
        cell.setAttribute('aria-label', `${day} ${explanation}`);
        row.append(cell);
      }
      return row;
    }));
  };
  $('member-select').addEventListener('change', event => {
    if (blocked || !MEMBERS.some(m => m.id === event.target.value)) return;
    const next = structuredClone(state);
    next.selectedMemberId = event.target.value;
    commit(next, '已切换演示身份。');
    if (state.selectedMemberId !== event.target.value) event.target.value = state.selectedMemberId;
  });
  $('habit-form').addEventListener('submit', event => {
    event.preventDefault();
    if (blocked) return;
    const name = $('habit-name').value.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 40) return status('请输入 1—40 个字符的习惯名称。', true);
    if (state.habits.some(h => h.ownerId === state.selectedMemberId && h.name === name)) return status('你已经有同名习惯了，请换一个名称。', true);
    const next = structuredClone(state);
    next.habits.push({ id: crypto.randomUUID(), ownerId: state.selectedMemberId, name, createdOn: today() });
    if (commit(next, `已新增“${name}”，从今天开始记录。`)) $('habit-name').value = '';
  });
  render();
  if (blocked) status('当前显示示例内容，所有写入操作已暂停。', true);
  const refreshDay = () => { if (renderedDay !== today()) render(); };
  document.addEventListener('visibilitychange', refreshDay);
  setInterval(refreshDay, 30000);
})();
