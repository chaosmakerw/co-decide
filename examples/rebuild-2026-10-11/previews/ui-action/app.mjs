import { parseCSV, newState, normalizeBook, statusOf, percentOf, recordProgress, escapeHTML as esc } from './domain.mjs';

const app = document.querySelector('#app');
const view = new URLSearchParams(location.search).get('view') === 'focus' ? 'focus' : 'shelf';
const storageKey = 'yiye-reading-preview-v1';
let state;
let filter = 'all';
let screen = 'library';
let query = '';
let activeBook = null;
let toastTimer;
let loadWarning = '';

const paths = {
  book:'M4 4h6a3 3 0 0 1 2 2v14a4 4 0 0 0-4-2H3V4h1Zm16 0h-6a3 3 0 0 0-2 2v14a4 4 0 0 1 4-2h5V4h-1Z',
  library:'M4 5v15m5-17v17m5-15v15m4-16 4 15',
  list:'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  check:'m8 12 3 3 5-6M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  note:'M8 4H5v17h15V11M9 15l1-4 9-9 3 3-9 9-4 1Z',
  plus:'M12 5v14M5 12h14',
  search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  arrow:'M4 12h16m-6-6 6 6-6 6',
  down:'M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5',
  close:'m6 6 12 12M6 18 18 6',
  leaf:'M20 3C5 2 1 11 7 17s15-1 13-14ZM4 21l11-11',
  chart:'M4 20V10m8 10V4m8 16v-7',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.book}"/></svg>`;
const statusLabels = { want:'想读', reading:'在读', finished:'已读完' };
const date = new Date();
const today = date.toLocaleDateString('sv-SE');
const dateText = date.toLocaleDateString('zh-CN', {month:'long',day:'numeric',weekday:'long'});
const counts = () => ({ all:state.books.length, want:state.books.filter(b=>statusOf(b)==='want').length, reading:state.books.filter(b=>statusOf(b)==='reading').length, finished:state.books.filter(b=>statusOf(b)==='finished').length });
const shortDate = value => new Date(value).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'});
const localDay = value => new Date(value).toLocaleDateString('sv-SE');
const bookOf = id => state.books.find(b=>b.id===id);
const colorOf = book => Math.max(0,state.books.findIndex(b=>b.id===book.id)) % 3;
const badge = book => `<span class="badge ${statusOf(book)}">${statusLabels[statusOf(book)]}</span>`;
const cover = book => `<div class="bookcover color-${colorOf(book)}" aria-hidden="true"><span class="covertitle">${esc(book.title.slice(0,12))}</span><span class="coverline"></span><span class="coverauthor">${esc(book.author.slice(0,14))} 著</span></div>`;
const progress = book => `<div class="progress" role="progressbar" aria-label="${esc(book.title)}阅读进度" aria-valuenow="${percentOf(book)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${percentOf(book)}%"></span></div><div class="progress-label"><span>第 ${book.currentPage} 页 / 共 ${book.totalPages} 页</span><span>${percentOf(book)}%</span></div>`;
const brand = () => `<div class="brand"><div class="brandmark">${icon('book')}</div><div class="brandname">一页<small>A LITTLE, EVERY DAY</small></div></div>`;
const routes = () => `<div class="routebar"><span class="label">两种阅读空间 · 可操作小样</span><a class="route ${view==='shelf'?'active':''}" href="/preview.html?view=shelf">A　把书收进自己的书架</a><a class="route ${view==='focus'?'active':''}" href="/preview.html?view=focus">B　每天继续读下去</a></div>`;

function notify(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>toast.classList.remove('show'),3200);
}

function save(next) {
  localStorage.setItem(storageKey,JSON.stringify(next));
  state = next;
}

function filteredBooks() {
  return state.books.filter(book => (filter==='all'||statusOf(book)===filter) && `${book.title} ${book.author}`.toLowerCase().includes(query.toLowerCase()));
}

function bookcard(book) {
  return `<button class="bookcard" data-action="open" data-id="${esc(book.id)}" aria-label="打开《${esc(book.title)}》详情"><div class="bookdisplay color-${colorOf(book)}">${badge(book)}${cover(book)}</div><div class="bookinfo"><h3>${esc(book.title)}</h3><p class="author">${esc(book.author)} · ${book.totalPages} 页</p><div class="progress"><span style="width:${percentOf(book)}%"></span></div><div class="cardmeta"><span>${book.currentPage===0?'还未翻开，期待相遇':statusOf(book)==='finished'?'已读完，故事留在心里':`已读 ${book.currentPage} 页`}</span><span>${percentOf(book)}%</span></div></div></button>`;
}

function tabs() {
  const c = counts();
  return `<div class="toolbar"><div class="tabs" role="group" aria-label="阅读状态筛选">${['all','want','reading','finished'].map(key=>`<button class="tab ${filter===key?'active':''}" data-action="filter" data-filter="${key}" aria-pressed="${filter===key}">${key==='all'?'全部书籍':statusLabels[key]}<small>${c[key]}</small></button>`).join('')}</div><label class="search">${icon('search')}<input id="search" type="search" placeholder="搜索书名或作者" aria-label="搜索书名或作者" value="${esc(query)}"></label></div>`;
}

function library() {
  return `${tabs()}<div class="bookgrid" id="bookgrid">${filteredBooks().map(bookcard).join('')||'<div class="empty">这里还没有书。换个筛选条件，或添加你的下一本书。</div>'}</div>`;
}

function notesView() {
  return `<div class="sectionhead"><h2>留在书页之间<small>${state.notes.length} 条笔记</small></h2></div>${state.notes.length?state.notes.slice().reverse().map(note=>`<div class="note"><p>${esc(note.text)}</p><small>《${esc(bookOf(note.bookId)?.title||'书籍')}》 · 第 ${note.page} 页 · ${shortDate(note.createdAt)}</small></div>`).join(''):'<div class="empty">读到有感触的地方，在书籍详情中写下第一条笔记。</div>'}`;
}

function previewInfo() {
  return `<div class="preview-info"><b>${view==='shelf'?'A · 书架优先':'B · 阅读行动优先'}</b>　${view==='shelf'?'完整书架放在首页，找书、改进度、整理笔记都从书籍出发。':'首页先呈现正在读的书，直接记下读到哪一页，再回看实际阅读记录。'}<br>可试：把《山间来信》从第 36 页改为第 56 页，再切换方案对比。两种小样共用数据，原始 CSV 保持不变。</div>`;
}

function shelf() {
  const c = counts();
  const current = state.books.find(b=>statusOf(b)==='reading');
  const nav = (key,label,name) => `<button class="${screen==='library'&&filter===key?'active':''}" data-action="filter" data-filter="${key}">${icon(name)}<span>${label}</span><span class="num">${c[key]}</span></button>`;
  return `${routes()}<div class="shell"><aside class="sidebar">${brand()}<p class="navtitle eyebrow">我的阅读空间</p><nav class="nav" aria-label="阅读导航">${nav('all','我的书架','library')}${nav('reading','正在阅读','book')}${nav('want','想读清单','list')}${nav('finished','已读书籍','check')}</nav><div class="side-divider"></div><div class="extra-nav"><p class="navtitle eyebrow">字里行间</p><div class="nav"><button class="${screen==='notes'?'active':''}" data-action="notes">${icon('note')}<span>阅读笔记</span><span class="num">${state.notes.length}</span></button></div></div><div class="side-quote"><p>书页翻过的地方，<br>也是生活走过的地方。</p><span></span></div><div class="profile"><div class="avatar">读</div><div>我的阅读空间<small>给自己一点阅读时间</small></div></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">阅读空间 <span> / </span><span>${screen==='notes'?'阅读笔记':'我的书架'}</span></div><div class="topright"><span class="date">${dateText}</span><button class="iconbutton" data-action="export" aria-label="导出书籍 CSV" title="导出书籍 CSV">${icon('down')}</button></div></header><div class="intro"><div><div class="eyebrow" style="margin-bottom:9px">YOUR PERSONAL LIBRARY</div><h1>${screen==='notes'?'我的阅读笔记':'我的书架'}</h1><p>${screen==='notes'?'把触动你的句子和想法，留在这里。':'让每一本书，都在生活里找到自己的位置。'}</p></div><button class="button" data-action="add">${icon('plus')}添加书籍</button></div><section class="stats" aria-label="书架概览">${[['all','书架藏书','library'],['reading','正在阅读','book'],['want','等待读的书','clock'],['finished','已读完','check']].map(([key,label,name])=>`<div class="stat"><div><p class="stat-label">${label}</p><p class="stat-value">${c[key]}<small>本</small></p></div><div class="stat-icon">${icon(name)}</div></div>`).join('')}</section>${screen==='notes'?notesView():`${current?`<div class="sectionhead"><h2>继续上次的旅程</h2><span class="eyebrow">CURRENTLY READING</span></div><section class="feature">${cover(current)}<div class="featurecopy"><div class="eyebrow">一页一页，慢慢来</div><h2>${esc(current.title)}</h2><p class="author">${esc(current.author)} 著</p><p class="quote">读到哪里，就把故事停在那里。<br>下一次打开，还能接着往下走。</p>${progress(current)}</div><div class="featureaction"><button class="button" data-action="open" data-id="${esc(current.id)}">${icon('note')}更新阅读进度</button><p>距读完还有 ${current.totalPages-current.currentPage} 页</p></div></section>`:''}<div class="sectionhead"><h2>书架上的故事<small>${c.all} 本书，${c.all} 种可能</small></h2><button class="textbutton" data-action="notes">阅读笔记 ${icon('arrow')}</button></div>${library()}`}${previewInfo()}<footer class="footnote"><span>读书这件小事，慢慢积累成自己的世界。</span><span>本地演示 · 数据保存在此浏览器</span></footer></main></div>`;
}

function week() {
  const monday = new Date(date.getFullYear(),date.getMonth(),date.getDate());
  monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
  const readDays = new Set(state.sessions.map(s=>localDay(s.createdAt)));
  return `<div class="week">${['一','二','三','四','五','六','日'].map((label,i)=>{const d=new Date(monday);d.setDate(d.getDate()+i);const key=d.toLocaleDateString('sv-SE');return `<div class="weekday ${key===today?'today':''} ${readDays.has(key)?'read':''}">周${label}<span>${readDays.has(key)?'✓':d.getDate()}</span></div>`;}).join('')}</div>`;
}

function focus() {
  const current = bookOf(activeBook) || state.books.find(b=>statusOf(b)==='reading') || state.books.find(b=>statusOf(b)==='want');
  const next = state.books.find(b=>statusOf(b)==='want'&&b.id!==current?.id);
  const todaySessions = state.sessions.filter(s=>localDay(s.createdAt)===today);
  const pages = todaySessions.reduce((sum,s)=>sum+s.pages,0);
  const history = state.sessions.slice().reverse().slice(0,6);
  return `${routes()}<div class="focus-shell"><header class="focus-header">${brand()}<nav class="focus-nav" aria-label="阅读导航"><button class="${screen==='library'?'active':''}" data-action="today">今日阅读</button><button class="${screen==='books'?'active':''}" data-action="books">全部书籍</button><button class="${screen==='notes'?'active':''}" data-action="notes">笔记</button></nav></header><div class="focus-intro"><div><div class="eyebrow" style="margin-bottom:11px">A LITTLE, EVERY DAY</div><h1>${screen==='notes'?'留住读到的好想法':screen==='books'?'你的阅读队列':'今天，也读几页吧。'}</h1><p>${screen==='library'?'不必急着读完，从上次停下的地方继续。':screen==='books'?'挑一本想读的书，让下一段旅程开始。':'把片刻的感受，变成下次能找回的记忆。'}</p></div><button class="button secondary" data-action="add">${icon('plus')}添加书籍</button></div>${screen==='notes'?notesView():screen==='books'?library():`<div class="focus-layout"><div><section class="focus-hero"><div class="eyebrow">YOUR NEXT PAGE</div>${current?`<div class="focus-current">${cover(current)}<div>${badge(current)}<h2>${esc(current.title)}</h2><p class="author">${esc(current.author)} 著</p><button class="textbutton" style="margin-top:19px;color:#b6a7de" data-action="open" data-id="${esc(current.id)}">查看详情与笔记 ${icon('arrow')}</button></div></div>${progress(current)}<form id="quick-progress" class="focus-log" data-id="${esc(current.id)}"><label class="field"><span>这次读到第几页？</span><input name="page" type="number" min="0" max="${current.totalPages}" step="1" value="${current.currentPage}" required aria-label="这次读到第几页"></label><button type="submit" class="button">记录阅读 ${icon('arrow')}</button></form><p class="focus-help">保存后按实际新增页数记录本次阅读。</p><p class="formerror" id="quick-error" role="alert"></p>`:'<div class="history-empty">你的阅读队列已经读完。添加一本书，开始新的旅程。</div>'}</section><section class="focus-history"><div class="sectionhead"><h2>最近的阅读足迹</h2><span class="eyebrow">READING JOURNAL</span></div>${history.length?history.map(s=>`<div class="historyrow"><span><span class="dot"></span>${esc(bookOf(s.bookId)?.title||'书籍')}<br><small style="margin-left:19px;display:block;margin-top:6px">第 ${s.fromPage} → ${s.toPage} 页</small></span><span>+ ${s.pages} 页 <small style="margin-left:10px">${shortDate(s.createdAt)}</small></span></div>`).join(''):'<div class="history-empty">每次读完，记下停在哪一页。<br>你的第一条阅读足迹，会出现在这里。</div>'}</section></div><aside class="focus-aside"><section class="focus-panel"><h2>今天的一点积累</h2><div class="daystats"><div><div class="number">${pages}<small>页</small></div><p>今日实际阅读</p></div><div><div class="number">${todaySessions.length}<small>次</small></div><p>今天记录的阅读</p></div></div>${week()}<p class="small muted" style="margin-top:18px;font-size:9px">${dateText} · 从第一次记录开始积累</p></section><section class="focus-panel"><h2>下一段旅程</h2>${next?`<div class="next-book">${cover(next)}<div><h3>${esc(next.title)}</h3><p>${esc(next.author)} · ${next.totalPages} 页</p><button data-action="choose" data-id="${esc(next.id)}">开始读这本 ${icon('arrow')}</button></div></div>`:'<p class="small muted" style="margin-top:18px;line-height:1.8">暂时没有等待读的书。可以给书架添一本。</p>'}</section><section class="focus-panel"><h2>读完的故事</h2><p class="small muted" style="margin-top:17px;line-height:1.9">${counts().finished} 本书已经陪你走过一段路。</p><button class="textbutton" style="color:#bbaaf4;margin-top:13px" data-action="completed">回看已读书籍 ${icon('arrow')}</button></section></aside></div>`}${previewInfo()}<footer class="footnote"><span>每一页，都是向前的一小步。</span><button data-action="export">导出书籍 CSV · 本地演示</button></footer></div>`;
}

function render() {
  document.body.classList.toggle('focus-theme',view==='focus');
  app.innerHTML = view==='focus'?focus():shelf();
  if(loadWarning) { notify(loadWarning); loadWarning=''; }
}

let restoreFocus = null;
function closeDrawer() {
  document.querySelector('.overlay')?.remove();
  document.body.style.overflow = '';
  restoreFocus?.focus();
}

function showDrawer(content) {
  restoreFocus = document.activeElement;
  closeDrawer();
  restoreFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<section class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">${content}</section>`;
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';
  overlay.addEventListener('click',event=>{if(event.target===overlay||event.target.closest('[data-action="close"]'))closeDrawer();});
  overlay.querySelector('input,button')?.focus();
}

function openBook(id) {
  const book = bookOf(id);
  if(!book)return;
  const notes = state.notes.filter(n=>n.bookId===id);
  showDrawer(`<div class="drawerhead"><h2 id="drawer-title">书页之间</h2><button class="close" data-action="close" aria-label="关闭详情">${icon('close')}</button></div><div class="drawerbook">${cover(book)}<div><h2>${esc(book.title)}</h2><p class="author">${esc(book.author)} · ${book.totalPages} 页</p>${badge(book)}</div></div>${progress(book)}<form id="book-progress" data-id="${esc(id)}"><label class="field"><span>当前读到第几页</span><input name="page" type="number" value="${book.currentPage}" min="0" max="${book.totalPages}" step="1" required><span class="hint">可填写 0–${book.totalPages} 的整数。读到最后一页，会自动标记读完。</span></label><label class="field"><span>这次有什么想记下的？</span><textarea name="note" maxlength="5000" placeholder="一句摘抄，一个想法，或此刻的感受…"></textarea><span class="hint">可选。笔记会保存在当前书籍下。</span></label><p class="formerror" role="alert"></p><div class="formactions"><button class="button" type="submit">保存进度与笔记</button><button class="button secondary" type="button" data-action="finish" data-id="${esc(id)}">标记读完</button></div></form><div class="sectionhead"><h2 style="font-size:19px">阅读笔记<small>${notes.length} 条</small></h2></div>${notes.length?notes.slice().reverse().map(note=>`<div class="note"><p>${esc(note.text)}</p><small>第 ${note.page} 页 · ${shortDate(note.createdAt)}</small></div>`).join(''):'<p class="muted small" style="line-height:1.8">还没有笔记，写下第一段想留下的文字吧。</p>'}`);
}

function addBook() {
  showDrawer(`<div class="drawerhead"><h2 id="drawer-title">让新故事住进来</h2><button class="close" data-action="close" aria-label="关闭添加书籍">${icon('close')}</button></div><p class="muted small" style="line-height:1.9;margin-bottom:26px">一本想读的书，一段可以慢慢开始的旅程。</p><form id="add-book"><label class="field"><span>书名</span><input name="title" maxlength="120" placeholder="例如：山间来信" required></label><label class="field"><span>作者</span><input name="author" maxlength="120" placeholder="作者姓名" required></label><label class="field"><span>总页数</span><input name="total" type="number" min="1" max="1000000" step="1" placeholder="例如：240" required></label><label class="field"><span>当前读到第几页</span><input name="page" type="number" min="0" step="1" value="0" required><span class="hint">还没开始读，填 0 即可。</span></label><p class="formerror" role="alert"></p><button class="button" style="width:100%;margin-top:12px" type="submit">${icon('plus')}添加到书架</button></form>`);
}

function updateBook(form) {
  const data = new FormData(form);
  const book = bookOf(form.dataset.id);
  const next = recordProgress(state,book.id,data.get('page'),data.get('note')||'',new Date());
  const delta = next.sessions.length-state.sessions.length;
  const changed = next.books.find(b=>b.id===book.id).currentPage!==book.currentPage;
  save(next);
  closeDrawer();
  render();
  notify(delta?'已记录本次阅读，继续慢慢向前。':changed?'阅读进度已更新。':data.get('note')?.trim()?'笔记已保存。':'已经在这一页，无需重复记录。');
}

document.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');
  if(!target)return;
  const action=target.dataset.action;
  if(action==='open')openBook(target.dataset.id);
  if(action==='add')addBook();
  if(action==='filter') {filter=target.dataset.filter;screen=view==='focus'?'books':'library';render();}
  if(action==='notes') {screen='notes';render();}
  if(action==='today') {screen='library';render();}
  if(action==='books') {screen='books';filter='all';query='';render();}
  if(action==='completed') {screen='books';filter='finished';query='';render();}
  if(action==='choose') {activeBook=target.dataset.id;screen='library';render();notify('已切换到这本书。读过后，再记录新的页数。');}
  if(action==='finish') {const form=document.querySelector('#book-progress');form.elements.page.value=bookOf(target.dataset.id).totalPages;form.requestSubmit();}
  if(action==='export') {
    const cell=value=>`"${String(value).replaceAll('"','""')}"`;
    const csv='\uFEFFtitle,author,total_pages,current_page\r\n'+state.books.map(b=>[b.title,b.author,b.totalPages,b.currentPage].map(cell).join(',')).join('\r\n');
    const link=document.createElement('a');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));link.href=url;link.download='我的书架.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('书架 CSV 已导出。');
  }
});

document.addEventListener('submit',event=>{
  const form=event.target;
  if(!['book-progress','quick-progress','add-book'].includes(form.id))return;
  event.preventDefault();
  try {
    if(form.id==='add-book') {
      const data=new FormData(form);
      const book=normalizeBook({id:crypto.randomUUID(),title:data.get('title'),author:data.get('author'),totalPages:data.get('total'),currentPage:data.get('page')});
      save({...state,books:[...state.books,book]});closeDrawer();render();notify('新书已经住进你的书架。');
    } else updateBook(form);
  } catch(error) {
    const message=error.name==='QuotaExceededError'?'浏览器存储空间不足，请先导出书架。':error.name==='SecurityError'?'浏览器禁止保存本地数据，请允许本地存储后重试。':error.message;
    (form.querySelector('.formerror')||document.querySelector('#quick-error')).textContent=message;
  }
});

document.addEventListener('input',event=>{
  if(event.target.id==='search') {
    query=event.target.value;
    document.querySelector('#bookgrid').innerHTML=filteredBooks().map(bookcard).join('')||'<div class="empty">没有找到匹配的书籍，试试其他书名或作者。</div>';
  }
});

document.addEventListener('keydown',event=>{
  const dialog=document.querySelector('.drawer');
  if(!dialog)return;
  if(event.key==='Escape')closeDrawer();
  if(event.key==='Tab') {
    const focusable=[...dialog.querySelectorAll('button,input,textarea,select,a[href]')].filter(el=>!el.disabled);
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){last.focus();event.preventDefault();}
    else if(!event.shiftKey&&document.activeElement===last){first.focus();event.preventDefault();}
  }
});

try {
  const response=await fetch('./books.csv');
  if(!response.ok)throw new Error('无法读取 books.csv，请通过本地服务打开页面。');
  const seedBooks=parseCSV(await response.text());
  const stored=localStorage.getItem(storageKey);
  if(stored) {
    const candidate=JSON.parse(stored);
    if(candidate.version!==1||!Array.isArray(candidate.books)||!Array.isArray(candidate.notes)||!Array.isArray(candidate.sessions))throw new Error('已有本地数据格式不正确。');
    candidate.books=candidate.books.map(normalizeBook);
    state=candidate;
  } else state=newState(seedBooks);
  render();
} catch(error) {
  app.innerHTML=`<div class="loading"><h2>暂时无法打开阅读空间</h2><p style="margin-top:18px;line-height:1.9;font-size:13px">${esc(error.message)}<br>请使用 <code>node server.mjs</code> 启动后访问本地地址。已有数据不会被覆盖。</p></div>`;
}
