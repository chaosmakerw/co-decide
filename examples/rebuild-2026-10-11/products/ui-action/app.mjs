import { parseCSV, newState, normalizeBook, validateState, statusOf, percentOf, recordProgress, exportCSV, escapeHTML as esc } from './domain.mjs';

const app = document.querySelector('#app');
const KEY = 'yiye-reading-desk-v1';
const statusLabels = {want:'想读',reading:'在读',finished:'读完'};
const svgPaths = {
  book:'M4 4h6a3 3 0 0 1 2 2v14a4 4 0 0 0-4-2H3V4h1Zm16 0h-6a3 3 0 0 0-2 2v14a4 4 0 0 1 4-2h5V4h-1Z',
  shelf:'M4 5v15m5-17v17m5-15v15m4-16 4 15',
  note:'M8 4H5v17h15V11M9 15l1-4 9-9 3 3-9 9-4 1Z',
  plus:'M12 5v14M5 12h14',
  arrow:'M4 12h16m-6-6 6 6-6 6',
  chevron:'m9 6 6 6-6 6',
  clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  check:'m5 12 4 4L19 6',
  search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  close:'m6 6 12 12M6 18 18 6',
  data:'M4 7v10c0 4 16 4 16 0V7M20 7c0 4-16 4-16 0s16-4 16 0M4 12c0 4 16 4 16 0',
  down:'M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5',
  leaf:'M20 3C5 2 1 11 7 17s15-1 13-14ZM4 21l11-11',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${svgPaths[name]||svgPaths.book}"/></svg>`;
let state;
let screen = 'today';
let filter = 'all';
let query = '';
let returnFocus = null;
let toastTimer;
let dayRefreshTimer;
let pendingImport = null;
let importRequest = 0;
let syncConflict = false;
let lastRaw = null;
const bookOf = id => state.books.find(book=>book.id===id);
const badge = book => `<span class="badge ${statusOf(book)}">${statusLabels[statusOf(book)]}</span>`;
const localDay = value => new Date(value).toLocaleDateString('sv-SE');
const dayText = value => new Date(value).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric',weekday:'long'});
const timestamp = value => new Date(value).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const counts = () => ({all:state.books.length,...Object.fromEntries(['want','reading','finished'].map(status=>[status,state.books.filter(book=>statusOf(book)===status).length]))});
const activeFor = source => {
  const chosen=source.books.find(book=>book.id===source.activeBookId);
  return chosen&&statusOf(chosen)!=='finished'?chosen:source.books.find(book=>statusOf(book)==='reading')||source.books.find(book=>statusOf(book)==='want');
};
const active = () => activeFor(state);
const lastSession = book => state.sessions.filter(session=>session.bookId===book.id).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
const pageLabel = book => book.currentPage===0?'准备从第 1 页开始':`下次从第 ${book.currentPage+1} 页继续`;

function notify(message) {
  const element=document.querySelector('#toast');
  element.textContent=message; element.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>element.classList.remove('show'),3500);
}

function save(next) {
  if(syncConflict || localStorage.getItem(KEY)!==lastRaw) {
    syncConflict=true;
    throw new Error('另一个页面更新了阅读数据，请刷新本页后再保存。当前输入仍保留。');
  }
  const validated=validateState(next);
  validated.activeBookId=activeFor(validated)?.id||null;
  const serialized=JSON.stringify(validated);
  localStorage.setItem(KEY,serialized);
  lastRaw=serialized;state=validated;
}

function safeError(error) {
  if(error.name==='QuotaExceededError')return '本地存储空间不足。请先导出完整备份，当前输入仍保留。';
  if(error.name==='SecurityError')return '浏览器不允许保存本地数据。当前输入仍保留。';
  return error.message || '暂时无法保存，请重试。';
}

function header() {
  return `<header class="header"><a class="brand" href="/" aria-label="一页，返回今日阅读"><span class="brand-icon">${icon('book')}</span><span>一页<small>READING DESK</small></span></a><nav aria-label="主导航">${[['today','今日阅读','book'],['books','我的书架','shelf'],['notes','阅读笔记','note']].map(([key,label,name])=>`<button data-action="screen" data-screen="${key}" class="navitem ${screen===key?'active':''}" ${screen===key?'aria-current="page"':''}>${icon(name)}${label}</button>`).join('')}</nav><button class="local-status" data-action="data">${icon('data')}<span>本地阅读空间</span><span class="status-dot"></span></button></header>`;
}

function progress(book) {
  return `<div class="progress" role="progressbar" aria-label="《${esc(book.title)}》阅读进度" aria-valuenow="${percentOf(book)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${percentOf(book)}%"></span></div>`;
}

function empty(text,action='add',label='添加一本书') {
  return `<div class="empty">${icon('book')}<p>${text}</p>${action?`<button class="button secondary" data-action="${action}">${label}${icon('arrow')}</button>`:''}</div>`;
}

function week(now=new Date()) {
  const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  start.setDate(start.getDate()-((start.getDay()+6)%7));
  const readDays=new Set(state.sessions.map(session=>localDay(session.createdAt)));
  return `<div class="week" id="reading-week">${['一','二','三','四','五','六','日'].map((label,index)=>{const date=new Date(start);date.setDate(start.getDate()+index);const day=localDay(date);return `<div class="week-day ${day===localDay(now)?'today':''} ${readDays.has(day)?'read':''}" aria-label="${day}${readDays.has(day)?'有阅读记录':'没有阅读记录'}"><span>${label}</span><div>${readDays.has(day)?icon('check'):date.getDate()}</div></div>`;}).join('')}</div>`;
}

function queue() {
  const current=active();
  const items=state.books.filter(book=>book.id!==current?.id&&statusOf(book)!=='finished');
  return `<section class="panel queue"><div class="panel-heading"><h2>接下来读什么</h2><span class="subtle">${items.length} 本候选</span></div>${items.length?items.slice(0,4).map(book=>`<button class="queue-row" data-action="choose" data-id="${esc(book.id)}"><span class="book-symbol tone-${state.books.indexOf(book)%3}">${icon('book')}</span><span class="queue-title"><strong>${esc(book.title)}</strong><small>${esc(book.author)} · ${book.currentPage?`停在第 ${book.currentPage} 页`:`${book.totalPages} 页`}</small></span><span class="queue-end">${badge(book)}${icon('chevron')}</span></button>`).join(''):'<p class="panel-empty">专心读手上的这本。<br>想开启新旅程时，再添一本书。</p>'}<button class="panel-link" data-action="screen" data-screen="books">管理完整书架 ${icon('arrow')}</button></section>`;
}

function readingForm(book) {
  return `<form id="reading-form" data-id="${esc(book.id)}" class="reading-form">
    <div class="form-title"><h3>记录刚刚读过的几页</h3><span>不设目标，按自己的节奏</span></div>
    <div class="reading-controls">
      <label class="page-field"><span>本次读到第</span><input name="page" type="number" min="0" max="${book.totalPages}" step="1" value="${book.currentPage}" required aria-label="本次读到第几页"><span>页</span></label>
      <button class="button" type="submit">保存本次阅读 ${icon('arrow')}</button>
    </div>
    <label class="inline-note">${icon('note')}<input name="note" maxlength="5000" placeholder="顺手记一个想法（可选）" aria-label="本次阅读笔记"></label>
    <div class="form-bottom"><span id="reading-delta" class="subtle">更新页码后，按实际增加的页数记录。</span><button type="button" class="text-button" data-action="complete" data-id="${esc(book.id)}">我已读完 ${icon('check')}</button></div>
    <p class="formerror" role="alert"></p>
  </form>`;
}

function latestPositionText(book) {
  const latest = lastSession(book);
  if (!latest) return '尚无阅读足迹，当前页码是已保存的阅读起点。';
  const history = `最近一次阅读记录：${timestamp(latest.createdAt)}，第 ${latest.fromPage} → ${latest.toPage} 页`;
  return latest.toPage === book.currentPage ? history : `${history}；当前保存位置为第 ${book.currentPage} 页。`;
}

function resumePanel(current) {
  const heading = `<div class="panel-heading"><h2>${icon('book')}今天读这本</h2><span class="eyebrow">CONTINUE READING</span></div>`;
  if (!current) {
    const message = state.books.length ? '书架中的书都已读完。给今天挑一本新书吧。' : '从一本想读的书开始今天的阅读。';
    return `<section class="panel resume-panel">${heading}${empty(message)}</section>`;
  }
  const bookCard = `<div class="resume-book">
    <div class="mini-cover tone-${state.books.indexOf(current)%3}" aria-hidden="true"><span>${esc(current.title.slice(0,8))}</span></div>
    <div class="resume-title"><div>${badge(current)}<span class="subtle">${current.author ? `${esc(current.author)} 著` : '作者未填写'}</span></div><h2>${esc(current.title)}</h2><p>${pageLabel(current)}</p></div>
    <button class="icon-button" data-action="detail" data-id="${esc(current.id)}" aria-label="查看《${esc(current.title)}》详情" title="查看书籍详情">${icon('chevron')}</button>
  </div>`;
  const position = `<div class="position"><div><span class="subtle">目前停在</span><p><strong>${current.currentPage}</strong><span>/ ${current.totalPages} 页</span></p></div><div class="position-right"><b>${percentOf(current)}%</b><span>还有 ${current.totalPages-current.currentPage} 页</span></div></div>`;
  const historyHint = `<div class="last-position">${icon('clock')}<span>${latestPositionText(current)}</span></div>`;
  return `<section class="panel resume-panel">${heading}${bookCard}${position}${progress(current)}${historyHint}${readingForm(current)}</section>`;
}

function historyPanel() {
  const history = state.sessions.slice().sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,5);
  const rows = history.map(session=>`<button class="history-row" data-action="detail" data-id="${esc(session.bookId)}">
    <span class="timeline-dot"></span><span class="history-copy"><strong>${esc(bookOf(session.bookId)?.title||'书籍')}</strong><span>第 ${session.fromPage} → ${session.toPage} 页 <span class="middot">·</span> ${timestamp(session.createdAt)}</span></span>
    <span class="page-gain">+${session.pages}<small> 页</small></span>
  </button>`).join('');
  const content = history.length ? `<div class="timeline">${rows}</div>` : `<div class="history-empty"><span class="empty-icon">${icon('clock')}</span><div><p>第一条阅读足迹，等你留下。</p><span>保存新的页码后，记录会从这里开始。</span></div></div>`;
  return `<section class="panel history-panel"><div class="panel-heading"><h2>最近的阅读足迹</h2><span class="subtle">${state.sessions.length} 条记录</span></div>${content}<p class="history-hint">足迹记录实际前进的页数；修正到更早的页码会保留历史。</p></section>`;
}

function dailyPanel(now) {
  const sessionsToday = state.sessions.filter(session=>localDay(session.createdAt)===localDay(now));
  const todayPages = sessionsToday.reduce((sum,session)=>sum+session.pages,0);
  return `<section class="panel daily-panel"><div class="panel-heading"><h2>今天的一点积累</h2>${icon('leaf')}</div><div class="daily-numbers"><div><strong id="today-pages">${todayPages}</strong><span>页</span><small>今日阅读</small></div><div><strong id="today-sessions">${sessionsToday.length}</strong><span>次</span><small>阅读记录</small></div></div>${week(now)}<p class="daily-caption">有记录的日子，都会留下印记。</p></section>`;
}

function todayView() {
  const now = new Date();
  const heading = `<div class="page-heading"><div><div class="eyebrow">ONE PAGE AT A TIME</div><h1>今天，接着上一页。</h1><p><span id="today-date">${dayText(now)}</span> <span class="middot">·</span> 给自己留一点阅读时间</p></div><button class="button secondary" data-action="add">${icon('plus')}添加书籍</button></div>`;
  const completed = `<section class="quiet-card"><span>${icon('check')}</span><div><strong>${counts().finished} 本书已读完</strong><p>读过的故事，都好好留在书架里。</p></div><button class="icon-button" data-action="finished" aria-label="查看已读完的书">${icon('chevron')}</button></section>`;
  const primary = `<div class="primary-column">${resumePanel(active())}${historyPanel()}</div>`;
  const secondary = `<aside class="secondary-column">${dailyPanel(now)}${queue()}${completed}</aside>`;
  return `${heading}<div class="desk-layout">${primary}${secondary}</div>`;
}

function filteredBooks() {
  return state.books.filter(book=>(filter==='all'||statusOf(book)===filter)&&`${book.title} ${book.author}`.toLowerCase().includes(query.toLowerCase()));
}

function bookRows() {
  const books=filteredBooks();
  return books.length?books.map(book=>`<div class="book-row"><button class="book-cell" data-action="detail" data-id="${esc(book.id)}"><span class="book-symbol tone-${state.books.indexOf(book)%3}">${icon('book')}</span><span><strong>${esc(book.title)}</strong><small>${esc(book.author)}</small></span></button><div class="book-state">${badge(book)}</div><div class="book-progress">${progress(book)}<span>第 ${book.currentPage} / ${book.totalPages} 页</span></div><div class="book-percent">${percentOf(book)}%</div><button class="text-button book-action" data-action="choose" data-id="${esc(book.id)}">${statusOf(book)==='finished'?'查看详情':'今天读这本'}${icon('chevron')}</button></div>`).join(''):empty('没有找到匹配的书籍。换个筛选，或添加一本书。');
}

function booksView() {
  const c=counts();
  return `<div class="page-heading"><div><div class="eyebrow">YOUR READING QUEUE</div><h1>我的书架</h1><p>${c.reading} 本在读 <span class="middot">·</span> ${c.want} 本想读 <span class="middot">·</span> ${c.finished} 本已读完</p></div><button class="button" data-action="add">${icon('plus')}添加书籍</button></div><section class="panel library-panel"><div class="library-toolbar"><div class="tabs" role="group" aria-label="书籍状态筛选">${['all','reading','want','finished'].map(key=>`<button class="tab ${filter===key?'active':''}" data-action="filter" data-filter="${key}" aria-pressed="${filter===key}">${key==='all'?'全部书籍':statusLabels[key]}<small>${c[key]}</small></button>`).join('')}</div><label class="search">${icon('search')}<input id="book-search" type="search" placeholder="搜索书名或作者" aria-label="搜索书名或作者" value="${esc(query)}"></label></div><div class="book-table-heading"><span>书籍 / 作者</span><span>状态</span><span>阅读进度</span><span></span><span></span></div><div id="book-rows">${bookRows()}</div></section>`;
}

function noteRows() {
  const notes=state.notes.slice().reverse().filter(note=>`${note.text} ${bookOf(note.bookId)?.title||''}`.toLowerCase().includes(query.toLowerCase()));
  return notes.length?notes.map(note=>`<article class="note-card"><div class="note-meta"><button data-action="detail" data-id="${esc(note.bookId)}">${icon('book')}${esc(bookOf(note.bookId)?.title||'书籍')}</button><span>第 ${note.page} 页 <span class="middot">·</span> ${timestamp(note.createdAt)}</span></div><p>${esc(note.text)}</p></article>`).join(''):empty(query?'没有找到匹配的笔记。':'把读到的感受，留在这里。','screen-today','去记录阅读');
}

function notesView() {
  return `<div class="page-heading"><div><div class="eyebrow">BETWEEN THE LINES</div><h1>阅读笔记</h1><p>${state.notes.length} 段留下的文字，可以随时回来翻看。</p></div><label class="search">${icon('search')}<input id="note-search" type="search" aria-label="搜索笔记内容或书名" placeholder="搜索笔记或书名" value="${esc(query)}"></label></div><div class="notes-grid" id="note-rows">${noteRows()}</div>`;
}

function render() {
  app.innerHTML=`<div class="workspace">${header()}<main id="main-content">${screen==='today'?todayView():screen==='books'?booksView():notesView()}</main><footer><span>一页一页，按自己的节奏。</span><span>数据仅保存在此浏览器 <span class="middot">·</span> <button data-action="data">备份与导入</button></span></footer></div>`;
}

function refreshDailyDisplay() {
  if(!state||screen!=='today')return;
  const now=new Date();
  const sessionsToday=state.sessions.filter(session=>localDay(session.createdAt)===localDay(now));
  const values={
    'today-date':dayText(now),
    'today-pages':sessionsToday.reduce((sum,session)=>sum+session.pages,0),
    'today-sessions':sessionsToday.length,
  };
  for(const [id,value] of Object.entries(values)) {
    const element=document.querySelector(`#${id}`);
    if(element)element.textContent=String(value);
  }
  const calendar=document.querySelector('#reading-week');
  if(calendar)calendar.outerHTML=week(now);
}

function scheduleDayRefresh() {
  clearTimeout(dayRefreshTimer);
  const now=new Date();
  const nextDay=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
  dayRefreshTimer=setTimeout(()=>{
    refreshDailyDisplay();
    scheduleDayRefresh();
  },Math.max(1000,nextDay-now+100));
}

function closeDialog() {
  pendingImport=null;
  importRequest++;
  document.querySelector('.overlay')?.remove();document.body.style.overflow='';
  if(returnFocus?.isConnected)returnFocus.focus();
}

function dialog(title,content) {
  const focus=document.activeElement;closeDialog();returnFocus=focus;
  const overlay=document.createElement('div');overlay.className='overlay';
  overlay.innerHTML=`<section class="drawer" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="drawer-heading"><div class="eyebrow">YOUR READING SPACE</div><button class="icon-button" data-action="close" aria-label="关闭">${icon('close')}</button></div><h2 id="dialog-title">${title}</h2>${content}</section>`;
  document.body.append(overlay);document.body.style.overflow='hidden';
  overlay.addEventListener('click',event=>{if(event.target===overlay)closeDialog();});
  overlay.querySelector('input,button,textarea')?.focus();
}

function detail(id) {
  const book=bookOf(id);if(!book)return;
  const notes=state.notes.filter(note=>note.bookId===id).slice().reverse();
  dialog(esc(book.title),`<div class="detail-meta"><span>${esc(book.author)} · ${book.totalPages} 页</span>${badge(book)}</div><div class="detail-progress"><span>第 ${book.currentPage} 页</span><b>${percentOf(book)}%</b></div>${progress(book)}<form id="detail-form" data-id="${esc(id)}"><label class="field"><span>当前读到第几页</span><input name="page" type="number" min="0" max="${book.totalPages}" step="1" value="${book.currentPage}" required><small>0 为想读；读到 ${book.totalPages} 页会自动标记读完。</small></label><label class="field"><span>写下此刻的想法</span><textarea name="note" maxlength="5000" rows="4" placeholder="一句摘抄，或自己的理解…"></textarea></label><p class="formerror" role="alert"></p><div class="form-actions"><button class="button" type="submit">保存进度与笔记</button><button class="button secondary" type="button" data-action="edit" data-id="${esc(id)}">编辑书籍</button></div></form><div class="drawer-section-heading"><h3>这本书的笔记</h3><span>${notes.length} 条</span></div>${notes.length?notes.map(note=>`<div class="note-card"><span class="subtle">第 ${note.page} 页 · ${timestamp(note.createdAt)}</span><p>${esc(note.text)}</p></div>`).join(''):'<p class="panel-empty">还没有笔记。留下一个想法，下次还能找回来。</p>'}`);
}

function bookForm(id) {
  const book=id?bookOf(id):null;
  dialog(book?'编辑书籍':'添加一本书',`<p class="drawer-description">${book?'修改书名、作者或总页数，笔记和阅读足迹会保留。':'把下一段旅程放进书架，随时可以开始。'}</p><form id="book-form" ${book?`data-id="${esc(id)}"`:''}><label class="field"><span>书名</span><input name="title" maxlength="120" required value="${esc(book?.title||'')}" placeholder="例如：山间来信"></label><label class="field"><span>作者</span><input name="author" maxlength="120" value="${esc(book?.author||'')}" placeholder="作者姓名（可选）"></label><div class="form-columns"><label class="field"><span>总页数</span><input name="total" type="number" min="1" max="1000000" step="1" required value="${book?.totalPages||''}" placeholder="240"></label><label class="field"><span>当前已读页数</span><input name="page" type="number" min="0" max="1000000" step="1" required value="${book?.currentPage||0}"></label></div><p class="subtle form-guidance">${book?'修改已读页数只修正位置，不新增阅读足迹。记录本次阅读请使用阅读工作台。':'已有的阅读位置作为起点，不计入今日阅读。'}</p><p class="formerror" role="alert"></p><button type="submit" class="button full">${book?'保存书籍信息':'添加到书架'}${icon('arrow')}</button></form>`);
}

function dataDialog() {
  dialog('让阅读记录好好留着',`<p class="drawer-description">数据保存在当前浏览器。完整备份包含书籍、页码、笔记和足迹，可在其他浏览器手动导入。</p><div class="data-action"><div>${icon('down')}<span><strong>完整备份</strong><small>JSON · 保留全部记录</small></span></div><button class="button secondary" data-action="backup">导出备份</button></div><div class="data-action"><div>${icon('shelf')}<span><strong>书架清单</strong><small>CSV · 仅书籍和当前进度</small></span></div><button class="button secondary" data-action="csv">导出 CSV</button></div><div class="drawer-section-heading"><h3>导入资料</h3></div><form id="import-form"><label class="field"><span>选择 CSV 书籍资料或 JSON 完整备份</span><input type="file" name="file" accept=".csv,.json,text/csv,application/json" required><small>最多 5 MB。CSV 列：title、author、total_pages、current_page。</small></label><label class="field"><span>导入方式</span><select name="mode"><option value="merge">合并到现有记录（相同书名与作者跳过）</option><option value="replace">替换全部本地记录</option></select></label><p class="form-guidance subtle">完整 JSON 备份可合并笔记和足迹。替换会先展示数量和确认按钮；原 CSV 文件始终保留。</p><p class="formerror" role="alert"></p><button class="button full" type="submit">检查导入文件 ${icon('arrow')}</button></form>`);
}

function download(content,name,type) {
  const url=URL.createObjectURL(new Blob([content],{type}));const anchor=document.createElement('a');
  anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function readingSubmit(form) {
  const data=new FormData(form);const book=bookOf(form.dataset.id);
  const next=recordProgress(state,book.id,data.get('page'),data.get('note')||'',new Date());
  const change=next.books.find(item=>item.id===book.id).currentPage-book.currentPage;
  next.activeBookId=statusOf(next.books.find(item=>item.id===book.id))==='finished'?null:book.id;
  save(next);closeDialog();render();
  notify(change>0?`已记录 ${change} 页阅读${statusOf(bookOf(book.id))==='finished'?'，这本书读完了。':'，下次从这里继续。'}`:change<0?'已修正阅读位置，原足迹仍保留。':data.get('note')?.trim()?'笔记已保存。':'页码没有变化，没有新增阅读记录。');
}

function mergeImport(incoming) {
  incoming=validateState(incoming);
  const books=state.books.slice(),notes=state.notes.slice(),sessions=state.sessions.slice();
  const mapping=new Map();let addedBooks=0;
  for(const book of incoming.books) {
    const duplicate=books.find(existing=>existing.title===book.title&&existing.author===book.author);
    if(duplicate){mapping.set(book.id,duplicate.id);continue;}
    const newBook={...book,id:crypto.randomUUID()};mapping.set(book.id,newBook.id);books.push(newBook);addedBooks++;
  }
  let addedNotes=0,addedSessions=0;
  for(const note of incoming.notes) {
    const bookId=mapping.get(note.bookId);const book=books.find(item=>item.id===bookId);
    if(note.page>book.totalPages)throw new Error('同名书籍总页数不一致，无法合并笔记。可以先编辑书籍信息，或选择替换。');
    if(notes.some(existing=>existing.bookId===bookId&&existing.text===note.text&&existing.page===note.page&&existing.createdAt===note.createdAt))continue;
    notes.push({...note,id:crypto.randomUUID(),bookId});addedNotes++;
  }
  for(const session of incoming.sessions) {
    const bookId=mapping.get(session.bookId);const book=books.find(item=>item.id===bookId);
    if(session.toPage>book.totalPages)throw new Error('同名书籍总页数不一致，无法合并阅读足迹。可以先编辑书籍信息，或选择替换。');
    if(sessions.some(existing=>existing.bookId===bookId&&existing.fromPage===session.fromPage&&existing.toPage===session.toPage&&existing.createdAt===session.createdAt))continue;
    sessions.push({...session,id:crypto.randomUUID(),bookId});addedSessions++;
  }
  notes.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));sessions.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  return {next:{...state,books,notes,sessions},addedBooks,addedNotes,addedSessions};
}

async function importSubmit(form) {
  const file=form.elements.file.files[0];if(!file)throw new Error('请选择一个文件。');
  if(file.size>5*1024*1024)throw new Error('文件不能超过 5 MB。');
  const request=importRequest;
  const mode=form.elements.mode.value;
  const text=await file.text();
  if(request!==importRequest||!form.isConnected)return;
  if(form.elements.file.files[0]!==file||form.elements.mode.value!==mode) {
    throw new Error('检查期间文件或导入方式发生变化，请重新检查。当前选择仍保留。');
  }
  let incoming;
  if(file.name.toLowerCase().endsWith('.csv'))incoming=newState(parseCSV(text));
  else if(file.name.toLowerCase().endsWith('.json')) {
    try {incoming=validateState(JSON.parse(text.replace(/^\uFEFF/,'')));}
    catch(error){throw new Error(`JSON 备份无法读取：${error.message}`);}
  } else throw new Error('仅支持 .csv 或 .json 文件。');
  const replace=mode==='replace';
  const result=replace?{next:incoming,addedBooks:incoming.books.length,addedNotes:incoming.notes.length,addedSessions:incoming.sessions.length}:mergeImport(incoming);
  dialog(replace?'确认替换本地记录':'确认合并阅读资料',`<p class="drawer-description">${replace?`当前 ${state.books.length} 本书、${state.notes.length} 条笔记、${state.sessions.length} 条足迹将被替换。建议先导出完整备份。`:'相同书名与作者保留现有页码，重复笔记和足迹会跳过。'}</p><div class="import-summary"><div><b>${result.addedBooks}</b><span>${replace?'导入书籍':'新增书籍'}</span></div><div><b>${result.addedNotes}</b><span>${replace?'导入笔记':'新增笔记'}</span></div><div><b>${result.addedSessions}</b><span>${replace?'导入足迹':'新增足迹'}</span></div></div><p class="formerror" role="alert" id="import-error"></p><div class="form-actions"><button class="button ${replace?'danger':''}" data-action="confirm-import">${replace?'确认替换全部记录':'确认合并'}</button><button class="button secondary" data-action="data">返回</button></div>`);
  pendingImport=result.next;
}

document.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');if(!target)return;
  const action=target.dataset.action;
  if(action==='close')closeDialog();
  if(action==='screen'||action==='screen-today') {screen=target.dataset.screen||'today';query='';filter='all';closeDialog();render();}
  if(action==='filter') {filter=target.dataset.filter;render();}
  if(action==='add')bookForm();
  if(action==='edit')bookForm(target.dataset.id);
  if(action==='detail')detail(target.dataset.id);
  if(action==='finished') {screen='books';filter='finished';query='';render();}
  if(action==='data')dataDialog();
  if(action==='choose') {
    const book=bookOf(target.dataset.id);
    if(!book)return;
    if(statusOf(book)==='finished'){detail(book.id);return;}
    try {save({...state,activeBookId:book.id});screen='today';query='';render();notify(`今天读《${book.title}》，停在第 ${book.currentPage} 页。`);}
    catch(error){notify(safeError(error));}
  }
  if(action==='complete') {
    const form=document.querySelector('#reading-form');
    const book=bookOf(target.dataset.id);
    if(!form||!book||form.dataset.id!==book.id)return;
    form.elements.page.value=book.totalPages;form.requestSubmit();
  }
  if(action==='backup') {download(JSON.stringify(state,null,2),`一页完整备份-${localDay(new Date())}.json`,'application/json');notify('已导出完整备份，书籍、笔记和足迹都在里面。');}
  if(action==='csv') {download(exportCSV(state),'一页书架.csv','text/csv;charset=utf-8');notify('书架 CSV 已导出，完整记录请使用 JSON 备份。');}
  if(action==='confirm-import'&&pendingImport) {
    try {save(pendingImport);pendingImport=null;closeDialog();render();notify('资料已导入，可以接着阅读了。');}
    catch(error){const errorElement=document.querySelector('#import-error');if(errorElement)errorElement.textContent=safeError(error);else notify(safeError(error));}
  }
});

document.addEventListener('submit',async event=>{
  const form=event.target;if(!['reading-form','detail-form','book-form','import-form'].includes(form.id))return;
  event.preventDefault();const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;
  try {
    if(form.id==='reading-form'||form.id==='detail-form')readingSubmit(form);
    if(form.id==='book-form') {
      const data=new FormData(form);const id=form.dataset.id||crypto.randomUUID();
      const book=normalizeBook({id,title:data.get('title'),author:data.get('author'),totalPages:data.get('total'),currentPage:data.get('page')});
      const books=form.dataset.id?state.books.map(existing=>existing.id===id?book:existing):[...state.books,book];
      save({...state,books});closeDialog();render();notify(form.dataset.id?'书籍信息已更新。':'已添加到书架，可以选择今天读这本。');
    }
    if(form.id==='import-form')await importSubmit(form);
  } catch(error) {form.querySelector('.formerror').textContent=safeError(error);}
  finally {if(submit)submit.disabled=false;}
});

document.addEventListener('input',event=>{
  if(event.target.id==='book-search'){query=event.target.value;document.querySelector('#book-rows').innerHTML=bookRows();}
  if(event.target.id==='note-search'){query=event.target.value;document.querySelector('#note-rows').innerHTML=noteRows();}
  if(event.target.name==='page'&&event.target.closest('#reading-form')) {
    const book=bookOf(event.target.form.dataset.id);const raw=event.target.value;const value=Number(raw);
    document.querySelector('#reading-delta').textContent=raw===''?'填写本次读到的页码。':!/^\d+$/.test(raw)||!Number.isSafeInteger(value)||value<0||value>book.totalPages?`请输入 0–${book.totalPages} 的整数。`:value>book.currentPage?`本次将记录 ${value-book.currentPage} 页阅读。`:value<book.currentPage?'将修正阅读位置，已记录的足迹会保留。':'页码未变化，不会重复计入今日阅读。';
  }
});

document.addEventListener('keydown',event=>{
  const drawer=document.querySelector('.drawer');if(!drawer)return;
  if(event.key==='Escape')closeDialog();
  if(event.key==='Tab') {
    const items=[...drawer.querySelectorAll('button,input,textarea,select,a[href]')].filter(item=>!item.disabled);
    if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1).focus();}
    else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0].focus();}
  }
});

window.addEventListener('storage',event=>{
  if(event.key!==KEY&&event.key!==null)return;
  syncConflict=true;notify('另一个页面更新了数据。请刷新本页后继续，当前输入仍保留。');
});

document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&state) {
    refreshDailyDisplay();
    scheduleDayRefresh();
  }
});

try {
  lastRaw=localStorage.getItem(KEY);
  if(lastRaw)state=validateState(JSON.parse(lastRaw));
  else {
    const response=await fetch('./books.csv');
    if(!response.ok)throw new Error('无法读取初始书籍资料。请检查 books.csv 是否存在。');
    state=newState(parseCSV(await response.text()));
    state.activeBookId=active()?.id||null;
  }
  render();
  scheduleDayRefresh();
} catch(error) {
  app.innerHTML=`<div class="startup-error"><div class="brand-icon">${icon('book')}</div><h1>阅读空间暂时无法打开</h1><p>${esc(safeError(error))}</p><span>请使用 node server.mjs 启动本地服务，再访问 http://127.0.0.1:4173。<br>已有本地记录保留，不会自动覆盖。</span></div>`;
}
