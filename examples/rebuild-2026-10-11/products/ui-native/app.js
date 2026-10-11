import { createInitialState, getBookStatus, addBook, updateBook, removeBook, saveNote, deleteNote, recordReading, setGoal, parseBooksCsv, mergeImportedBooks, toBooksCsv, validateState } from './reading-model.js';

const STORAGE_KEY = 'yuejian.reading.v1';
const RECOVERY_KEY = 'yuejian.reading.recovery.v1';
const $ = (selector) => document.querySelector(selector);
const h = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, extra = '') => `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const statusLabels = { reading: '在读', unread: '待读', finished: '已读完' };
const viewLabels = { books: '我的书架', reading: '正在阅读', notes: '读书笔记', stats: '阅读统计' };
let state = createInitialState();
let view = 'books';
let filter = 'all';
let query = '';
let sort = 'added';
let layout = 'grid';
let selectedBook = null;
let pendingConfirm = null;
let importMode = null;
let damagedBackup = null;
let recoveryBackup = null;
let storageAvailable = true;
let toastTimer;

try {
  recoveryBackup = localStorage.getItem(RECOVERY_KEY);
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try { state = validateState(JSON.parse(stored)); }
    catch { damagedBackup = stored; }
  }
} catch { storageAvailable = false; }

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4200);
}

function commit(next, message) {
  // Persist before changing the rendered state; quota failures never masquerade as a successful save.
  if (damagedBackup && recoveryBackup && recoveryBackup !== damagedBackup) throw new Error('已有一份原始恢复备份，请先导出当前无法读取的备份，再保存新数据。');
  try {
    if (damagedBackup) {
      localStorage.setItem(RECOVERY_KEY, damagedBackup);
      recoveryBackup = damagedBackup;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  catch { throw new Error('浏览器未能保存数据，当前内容未改变。请先导出备份，或检查浏览器存储设置。'); }
  state = next;
  damagedBackup = null;
  storageAvailable = true;
  render();
  if (message) toast(message);
}

function counts() {
  return {
    all: state.books.length,
    reading: state.books.filter((book) => getBookStatus(book) === 'reading').length,
    unread: state.books.filter((book) => getBookStatus(book) === 'unread').length,
    finished: state.books.filter((book) => getBookStatus(book) === 'finished').length,
  };
}

function readableDate(date) {
  return new Date(date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

const noteDate = (note) => note.updatedAt ?? note.createdAt;

function coverArt(style) {
  if (style === 'city') return `<svg class="cover-art" viewBox="0 0 320 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="320" height="220" fill="#e4d8bf"/><circle cx="254" cy="48" r="32" fill="#f0e7d3"/><path d="M140 220V106h57v114M206 220V83h39v137M253 220V126h57v94" fill="#c7b39b"/><path d="M159 106V87h22v19M208 83l17-17 20 17" fill="#bba387"/><path d="M85 220v-69h63v69M0 220v-38h89v38" fill="#d3c2a7"/><path d="M194 220V136h43v84M244 220v-45h76v45" fill="#af9b80"/><g fill="#e9dfcc"><path d="M150 120h7v12h-7zm20 0h7v12h-7zm0 25h7v12h-7zm-20 0h7v12h-7zm-41 16h8v13h-8zm19 0h8v13h-8zm-19 27h8v13h-8zm19 0h8v13h-8zm87-91h7v13h-7zm14 0h7v13h-7zm-14 25h7v13h-7zm14 0h7v13h-7zm31 17h7v13h-7zm20 0h7v13h-7zm20 0h7v13h-7zm-87 7h6v10h-6zm11 0h6v10h-6zm-11 22h6v10h-6zm11 0h6v10h-6z"/></g><path d="M0 213h320" stroke="#a89377" stroke-width="2"/><path d="M275 214v-33m-1 8c-19-1-19-25-4-27 15-17 36 1 25 14 5 9-5 17-21 13" stroke="#929479" stroke-width="2" fill="#a6ab8d"/><path d="M93 214c52-17 88-6 125 6" fill="none" stroke="#f0e6d0" stroke-width="4"/></svg>`;
  if (style === 'wind') return `<svg class="cover-art" viewBox="0 0 320 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="320" height="220" fill="#8fa5b8"/><path d="M0 170c69-59 140 63 222-2 41-34 74-30 98-9v61H0Z" fill="#7c96ac"/><path d="M0 196c62-47 130 41 211 0 64-34 93-3 109 1v23H0Z" fill="#6e8a9e"/><circle cx="266" cy="52" r="25" fill="#d9e0d8"/><circle cx="276" cy="44" r="23" fill="#8fa5b8"/><path d="M244 213c-15-21-24-44-6-84m-4 36c-22 1-28-17-30-22 18-1 24 7 30 22m-1 15c19-1 26-14 30-24-18 0-25 11-30 24m-7 14c-15 3-30-8-30-18 19-2 25 8 30 18" fill="#b7c5c7" stroke="#b7c5c7" stroke-width="1.4"/><path d="M116 111c20-9 39-8 67 2m-56 17c16-8 25-5 36-3M72 182c20-6 30-8 51-5" fill="none" stroke="#c1d0d5" stroke-width="1" opacity=".6"/><path d="m276 106 5 3-2-5m-133 71 7 3-3-6m48-81 5 3-1-6" fill="none" stroke="#d9e1e2" stroke-width="1.4"/></svg>`;
  if (style === 'bloom') return `<svg class="cover-art" viewBox="0 0 320 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="320" height="220" fill="#a596b2"/><circle cx="270" cy="55" r="37" fill="#b7a6bf"/><path d="M155 230c28-49 59-83 94-124m-42 55c-34-3-40-27-41-37 29 5 32 23 41 37m18-22c22 6 35-6 46-20-24-2-36 8-46 20m-45 54c-31-1-42-17-46-29 28-2 37 13 46 29m-10 9c29 7 52-4 66-19-34-6-44 10-66 19" fill="#d5cedb" stroke="#d5cedb" stroke-width="2"/><g fill="#f0d2d4"><ellipse cx="250" cy="100" rx="13" ry="25"/><ellipse cx="250" cy="100" rx="13" ry="25" transform="rotate(60 250 100)"/><ellipse cx="250" cy="100" rx="13" ry="25" transform="rotate(120 250 100)"/></g><circle cx="250" cy="100" r="8" fill="#d5b383"/></svg>`;
  return `<svg class="cover-art" viewBox="0 0 320 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="320" height="220" fill="#8eaa90"/><circle cx="266" cy="43" r="31" fill="#c4d0b2" opacity=".65"/><path d="m90 220 63-111 44 47 40-87 83 124v27Z" fill="#6e8b73"/><path d="m141 220 56-93 47 74 31-61 45 52v28Z" fill="#5d7a67"/><path d="m0 220 39-64 41 26 66-31 39 69Z" fill="#587862"/><path d="m0 190 44-2 60 16 63-24 36 8 50-21 67 30v23H0Z" fill="#3e6552"/><path d="m244 100-19 30m12-21 18 25m-72-5 17 21m-61 48 23-16m48 19 37-23m-18 32 48-17m-247-8 16-9m-25 20 18-9" stroke="#a4b699" stroke-width=".7" fill="none" opacity=".45"/><path d="M235 221c-24-25-34-32-14-43 27-12 33-28 23-34" stroke="#b9c5ac" stroke-width="3" fill="none" opacity=".7"/><path d="M298 220v-85m-20 53 20-37 21 37m-15-38-6-18-13 26m-217 62v-51m-13 32 13-25 12 25" stroke="#294f3e" stroke-width="3" fill="none"/></svg>`;
}

function cover(book) {
  const style = ['mountain', 'city', 'wind', 'bloom'].includes(book.cover) ? book.cover : 'mountain';
  const status = getBookStatus(book);
  const english = { mountain: 'LETTERS FROM<br>THE MOUNTAINS', city: 'A WALK THROUGH<br>THE EVERYDAY', wind: 'NOTES IN<br>THE EVENING BREEZE', bloom: 'A LITTLE ROOM<br>FOR WONDER' }[style];
  return `<div class="book-cover cover-${style}" data-action="detail" data-id="${h(book.id)}" role="button" tabindex="0" aria-label="查看 ${h(book.title)}"><div class="cover-type"><div class="cover-title">${h(book.title)}</div><div class="cover-author">${h(book.author)} / 著</div></div>${coverArt(style)}<span class="cover-english">${english}</span><span class="cover-status ${status}">${status === 'finished' ? icon('check') : ''}${statusLabels[status]}</span></div>`;
}

function heroArt() {
  return `<svg class="hero-art" viewBox="0 0 380 230" fill="none" aria-hidden="true"><ellipse cx="225" cy="214" rx="140" ry="10" fill="#d9cee7" opacity=".45"/><circle cx="245" cy="99" r="89" fill="#e5daef" opacity=".7"/><path d="M314 173c6-24 12-51 10-77m-1 22c-26-4-30-26-28-36 21 4 24 19 28 36m0 20c24-5 37-23 33-36-26 4-28 22-33 36m-5 17c-24-3-31-19-28-28 20 0 26 14 28 28" fill="#a5ad99" stroke="#9da58f" stroke-width="2"/><path d="M299 173h36l-5 36h-25l-6-36Z" fill="#c4b5a7"/><path d="M301 180h32" stroke="#b5a497"/><path d="M78 196h162v12H78z" fill="#9c83b6"/><path d="M81 199h153v6H81z" fill="#e7dfe8"/><path d="M83 178h159v16H83z" fill="#b9bda8"/><path d="M92 182h144v9H92z" fill="#eff0df"/><path d="M83 178v16m16-16v16" stroke="#9ba68c"/><path d="m86 165 140-6 1 18-141 7-1-19Z" fill="#c4a593"/><path d="m91 168 128-5 1 11-128 6-1-12Z" fill="#f0e4d5"/><path d="M117 119c25-7 48 0 69 12 17-14 44-23 72-21l8 68c-25-5-54 2-73 13-23-10-48-12-75-5l-1-67Z" fill="#ab91c3"/><path d="M118 112c27-7 50 1 69 12 16-15 40-26 65-24l5 68c-23-1-48 7-64 20-22-11-46-14-71-8l-4-68Z" fill="#fdf9f1"/><path d="m187 124 6 64" stroke="#c5b4ce" stroke-width="1.5"/><path d="m127 121 45 8m-42 2 43 7m-42 3 43 8m-42 3 42 7m-41 4 43 7m25-41c13-8 28-11 40-13m-39 21c13-9 27-12 40-13m-38 21c12-8 26-11 39-13m-38 21c14-8 28-12 40-13" stroke="#cbbfd0" stroke-width="1.4" stroke-linecap="round"/><path d="m204 103 15-4 5 43-9-5-6 7-5-41Z" fill="#a48abc"/><path d="M66 146h33v36c0 7-33 7-33 0v-36Z" fill="#d5c3dc"/><ellipse cx="82.5" cy="146" rx="16.5" ry="4" fill="#bca4c7"/><ellipse cx="82.5" cy="146" rx="13" ry="3" fill="#998290"/><path d="M98 151c23-4 21 28 1 23" stroke="#bba4c9" stroke-width="5"/><path d="M76 135c-8-12 5-14 0-25m12 25c-7-8 6-15 0-21" stroke="#c6b9d5" stroke-width="2" stroke-linecap="round"/><path d="m278 59 4 6 7-2-4 6 4 6-7-2-4 6v-7l-7-3 7-3v-7Z" fill="#b8a1cd"/><path d="m120 62 2 4 5 1-4 3 1 5-4-2-4 2 1-5-3-3 4-1 2-4Z" fill="#c1add1"/><circle cx="271" cy="93" r="3" fill="#c4b0d4"/><path d="m150 64 10-3m-5-3v10" stroke="#c5b3d5" stroke-width="1.5" stroke-linecap="round"/></svg>`;
}

function metricsHtml(statistics = false) {
  const c = counts();
  const metrics = statistics
    ? [['shelf', '书架藏书', c.all, '本'], ['check', '已读完', c.finished, '本'], ['clock', '累计阅读时间', state.sessions.reduce((s, item) => s + item.minutes, 0), '分钟'], ['note', '读书笔记', state.notes.length, '条']]
    : [['shelf', '书架藏书', c.all, '本'], ['book', '正在阅读', c.reading, '本'], ['check', '已读完', c.finished, '本'], ['note', '读书笔记', state.notes.length, '条']];
  return `<div class="metrics">${metrics.map(([symbol, label, value, unit]) => `<div class="metric"><div class="metric-icon">${icon(symbol)}</div><div><div class="metric-label">${label}</div><div class="metric-value">${value.toString().padStart(2, '0')}<small>${unit}</small></div></div></div>`).join('')}</div>`;
}

function card(book) {
  const status = getBookStatus(book);
  const percent = Math.round(book.currentPage / book.totalPages * 100);
  const notes = state.notes.filter((note) => note.bookId === book.id).length;
  return `<article class="book-card ${status}" data-book-id="${h(book.id)}">${cover(book)}<div class="book-info"><div class="book-title-line"><h3><button data-action="detail" data-id="${h(book.id)}">${h(book.title)}</button></h3><button class="icon-button" data-action="detail" data-id="${h(book.id)}" aria-label="管理 ${h(book.title)}">${icon('more')}</button></div><div class="book-meta"><span>${h(book.author)}</span><span class="meta-dot">·</span><span>${book.totalPages} 页</span><span class="book-category">${h(book.category)}</span></div><div class="book-progress-heading"><span>${book.currentPage} / ${book.totalPages} 页</span><strong>${percent}%</strong></div><div class="progress-track" role="progressbar" aria-label="${h(book.title)}阅读进度" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${percent}%"></div></div><div class="book-card-footer"><span>${icon('note')}${notes ? `${notes} 条笔记` : '还没有笔记'}</span><button class="text-button" data-action="${status === 'finished' ? 'note' : 'detail'}" data-id="${h(book.id)}">${status === 'finished' ? '写点感想' : status === 'unread' ? '开始阅读' : '更新进度'}${icon('arrow')}</button></div></div></article>`;
}

function empty(title, description, action = 'add', label = '添加一本书', symbol = 'book') {
  return `<div class="empty-state"><div class="empty-icon">${icon(symbol)}</div><h3>${title}</h3><p>${description}</p>${action ? `<button class="button button-primary" data-action="${action}">${icon('plus')}${label}</button>` : ''}</div>`;
}

function visibleBooks() {
  const wanted = view === 'reading' ? 'reading' : filter;
  const normalizedQuery = query.toLocaleLowerCase().trim();
  return state.books.filter((book) => (wanted === 'all' || getBookStatus(book) === wanted) && (!normalizedQuery || `${book.title} ${book.author} ${book.category}`.toLocaleLowerCase().includes(normalizedQuery)))
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN') : sort === 'progress' ? b.currentPage / b.totalPages - a.currentPage / a.totalPages : b.addedAt.localeCompare(a.addedAt));
}

function booksResults() {
  const books = visibleBooks();
  if (books.length) return books.map(card).join('');
  if (query.trim()) return empty('还没有找到这本书', '试试其他书名、作者或分类。', 'clear-search', '清空搜索', 'search');
  if (view === 'reading' || filter === 'reading') return empty('下一段旅程，从翻开书开始', '打开一本待读的书，更新页数，就会出现在这里。', 'show-unread', '看看待读的书');
  if (filter === 'finished') return empty('好书值得慢慢读', '当阅读进度到达最后一页，这里就会留下你的收获。', 'show-all', '返回全部书籍', 'check');
  return empty('给书架添一点新的期待', '把想读的书放进来，下一次阅读就有了方向。');
}

function toolbar() {
  const c = counts();
  return `<div class="book-toolbar">${view === 'books' ? `<div class="filter-tabs" role="group" aria-label="书籍状态">${[['all', '全部书籍'], ['reading', '在读'], ['unread', '待读'], ['finished', '已读完']].map(([key, label]) => `<button class="filter-tab ${filter === key ? 'active' : ''}" data-filter="${key}" aria-pressed="${filter === key}">${label}<span>${c[key]}</span></button>`).join('')}</div>` : `<span class="notes-count">${c.reading} 本书正在旅途中</span>`}<div class="toolbar-right"><div class="search-field">${icon('search')}<input id="book-search" type="search" placeholder="搜索书名、作者…" value="${h(query)}" aria-label="搜索书名、作者或分类"></div><select id="book-sort" class="sort-select" aria-label="书籍排序"><option value="added" ${sort === 'added' ? 'selected' : ''}>最近添加</option><option value="title" ${sort === 'title' ? 'selected' : ''}>书名排序</option><option value="progress" ${sort === 'progress' ? 'selected' : ''}>阅读进度</option></select><div class="view-switch" role="group" aria-label="展示方式"><button data-layout="grid" class="${layout === 'grid' ? 'active' : ''}" aria-pressed="${layout === 'grid'}" aria-label="网格视图">${icon('grid')}</button><button data-layout="list" class="${layout === 'list' ? 'active' : ''}" aria-pressed="${layout === 'list'}" aria-label="列表视图">${icon('list')}</button></div></div></div>`;
}

function bookView() {
  const reading = state.books.find((book) => getBookStatus(book) === 'reading');
  const hero = `<div class="hero"><div class="hero-copy"><div class="hero-kicker">${icon('flower')} MAKE ROOM FOR READING</div><h2>把时间，留给好书。</h2><p>不赶进度，只享受每一次翻页。</p>${reading ? `<button class="hero-action" data-action="detail" data-id="${h(reading.id)}">接着读 · ${h(reading.title)}${icon('arrow')}</button>` : `<button class="hero-action" data-action="add">开启下一段阅读${icon('arrow')}</button>`}</div>${heroArt()}</div>`;
  return `<div class="page-heading"><div><h1>${viewLabels[view]}</h1><p>${view === 'reading' ? '故事还在继续，回到上次停下的那一页。' : '收藏想读的书，也收藏阅读中的自己。'}</p></div><button class="button button-primary" data-action="add">${icon('plus')}添加书籍</button></div>${view === 'books' ? `${hero}${metricsHtml()}<div class="section-heading"><h2>我的藏书</h2><span>每一本，都值得被好好阅读</span></div>` : `<div class="reading-intro">${icon('leaf')}读得慢一点，也许会看见更多。</div>`}${toolbar()}<div class="books-grid ${layout === 'list' ? 'list-view' : ''}" id="books-results">${booksResults()}</div>`;
}

function notesResults() {
  const text = query.trim().toLocaleLowerCase();
  const notes = state.notes.filter((note) => {
    const book = state.books.find((item) => item.id === note.bookId);
    return !text || `${note.content} ${book?.title} ${book?.author}`.toLocaleLowerCase().includes(text);
  }).sort((a, b) => noteDate(b).localeCompare(noteDate(a)));
  if (!notes.length) return empty(text ? '没有找到这段文字' : '把有共鸣的文字，留在这里', text ? '试试另一个关键词。' : '摘录一句话，记录一个想法，让阅读不止于翻页。', text ? 'clear-search' : state.books.length ? 'note' : 'add', text ? '清空搜索' : state.books.length ? '写第一条笔记' : '先添加一本书', 'note');
  return notes.map((note) => {
    const book = state.books.find((item) => item.id === note.bookId);
    return `<article class="note-card"><div class="note-card-header"><span>${icon('book')}<button class="text-button" data-action="detail" data-id="${h(note.bookId)}">${h(book.title)}</button></span><span class="note-page">第 ${note.page} 页</span></div><p class="note-text">${h(note.content)}</p><div class="note-card-footer"><span>${readableDate(noteDate(note))}</span><div class="note-actions"><button class="icon-button" data-action="edit-note" data-id="${h(note.id)}" aria-label="编辑笔记">${icon('note')}</button><button class="icon-button" data-action="delete-note" data-id="${h(note.id)}" aria-label="删除笔记">${icon('trash')}</button></div></div></article>`;
  }).join('');
}

function notesView() {
  return `<div class="page-heading"><div><h1>读书笔记</h1><p>留住触动你的文字，也留住当时的心情。</p></div><button class="button button-primary" data-action="note">${icon('plus')}写笔记</button></div><div class="notes-toolbar"><span>共 ${state.notes.length} 条阅读的痕迹</span><div class="search-field">${icon('search')}<input id="note-search" type="search" placeholder="搜索书名、笔记内容…" value="${h(query)}" aria-label="搜索笔记"></div></div><div class="notes-grid" id="notes-results">${notesResults()}</div>`;
}

function statsView() {
  const c = counts();
  const percent = Math.min(100, Math.round(c.finished / state.goal * 100));
  const pages = state.books.reduce((sum, book) => sum + book.currentPage, 0);
  return `<div class="page-heading"><div><h1>阅读统计</h1><p>每一小步，都在让你的世界变得更宽广。</p></div><button class="button button-secondary" data-action="goal">${icon('target')}调整目标</button></div>${metricsHtml(true)}<div class="stats-columns"><section class="stats-panel"><h2>我的阅读目标</h2><p>从书架中已读完的书，看看自己的积累。</p><div class="goal-chart"><div class="goal-ring" style="--angle:${percent * 3.6}deg"><div class="goal-ring-center"><strong>${percent}<small style="font-size:14px">%</small></strong><span>目标完成度</span></div></div><div class="goal-chart-copy"><h3>${c.finished} / ${state.goal} 本</h3><p>${c.finished >= state.goal ? '目标达成，给自己一点掌声。' : `还有 ${state.goal - c.finished} 本好书的旅程。`}<br>按照自己的节奏，慢慢来。</p><button class="text-button" data-action="goal">设定阅读目标 ${icon('arrow')}</button></div></div></section><section class="stats-panel"><h2>书架上的旅程</h2><p>已读 ${pages.toLocaleString('zh-CN')} 页，故事仍在继续。</p><div class="status-bars">${[['reading', '正在阅读'], ['finished', '已读完'], ['unread', '等待翻开']].map(([key, label]) => `<div><div class="status-bar-label"><span>${label}</span><span>${c[key]} 本</span></div><div class="status-bar-track"><div class="status-bar-fill" style="width:${c.all ? c[key] / c.all * 100 : 0}%"></div></div></div>`).join('')}</div></section></div><section class="stats-panel session-panel"><h2>最近的阅读时光</h2><p>记录一次阅读，看看时间去了哪里。</p><div class="session-list">${state.sessions.length ? [...state.sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12).map((session) => { const book = state.books.find((item) => item.id === session.bookId); return `<div class="session-item"><div class="metric-icon">${icon('book')}</div><div><strong>${h(book.title)}</strong><small>${readableDate(session.date)}</small></div><div class="session-summary">${session.minutes} 分钟 · ${session.pages} 页</div></div>`; }).join('') : empty('还没有记录阅读时光', '在书籍详情中填写页码与阅读分钟数，就能留下第一条记录。', 'show-all', '去书架看看', 'clock')}</div></section><p class="stats-hint">阅读时间只统计你实际记录的时长，初始书单不会生成历史记录。</p>`;
}

function render() {
  const c = counts();
  $('#nav-book-count').textContent = c.all;
  $('#nav-reading-count').textContent = c.reading;
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
    button.setAttribute('aria-current', button.dataset.view === view ? 'page' : 'false');
  });
  $('#breadcrumb-view').textContent = viewLabels[view];
  $('#sidebar-goal').innerHTML = `<div class="sidebar-goal-heading"><span>阅读小目标</span><button class="text-button" data-action="goal">调整</button></div><div class="sidebar-goal-value"><strong>${c.finished}</strong><span>/ ${state.goal} 本</span></div><div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, c.finished / state.goal * 100)}%"></div></div><div class="sidebar-goal-note">${c.finished >= state.goal ? '给每一步积累一点掌声。' : '每读完一本，离目标就近一点。'}</div>`;
  const banner = damagedBackup ? `<div class="recovery-banner"><span>本地备份无法读取，暂时展示初始书单。保存新数据前，请先保留原始备份。</span><button class="text-button" data-action="export-damaged">导出原始备份</button></div>` : !storageAvailable ? `<div class="recovery-banner"><span>当前浏览器无法访问本地存储。请检查存储设置后再保存。</span></div>` : '';
  $('#main').innerHTML = banner + (view === 'notes' ? notesView() : view === 'stats' ? statsView() : bookView());
  document.title = `阅间 · ${viewLabels[view]}`;
}

function navigate(next) {
  if (!Object.hasOwn(viewLabels, next)) return;
  view = next;
  query = '';
  filter = 'all';
  history.replaceState(null, '', `#${next}`);
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function openDialog(id) {
  const dialog = $(`#${id}`);
  if (!dialog.open) dialog.showModal();
}

function closeDialog(id) { $(`#${id}`).close(); }

function openBook(id) {
  const book = id ? state.books.find((item) => item.id === id) : null;
  if (id && !book) return toast('这本书已不存在。');
  const form = $('#book-form');
  form.reset();
  form.elements.id.value = book?.id ?? '';
  ['title', 'author', 'totalPages', 'currentPage', 'category', 'cover'].forEach((field) => {
    if (book) form.elements[field].value = book[field];
  });
  if (book && !form.elements.cover.value) form.elements.cover.value = 'mountain';
  $('#book-error').textContent = '';
  $('#book-dialog-title').textContent = book ? '编辑书籍信息' : '把好书放进书架';
  $('#book-submit-label').textContent = book ? '保存修改' : '加入书架';
  openDialog('book-dialog');
}

function openNote(bookId, noteId) {
  if (!state.books.length) return toast('先添加一本书，再记录笔记吧。');
  const note = noteId ? state.notes.find((item) => item.id === noteId) : null;
  if (noteId && !note) return toast('这条笔记已不存在。');
  const form = $('#note-form');
  form.reset();
  form.elements.id.value = note?.id ?? '';
  $('#note-book').innerHTML = state.books.filter((book) => !note || book.id === note.bookId).map((book) => `<option value="${h(book.id)}">${h(book.title)}</option>`).join('');
  form.elements.bookId.value = note?.bookId ?? bookId ?? state.books[0].id;
  const book = state.books.find((item) => item.id === form.elements.bookId.value) ?? state.books[0];
  form.elements.page.value = note?.page ?? book.currentPage;
  form.elements.page.max = book.totalPages;
  form.elements.content.value = note?.content ?? '';
  $('#note-error').textContent = '';
  $('#note-dialog-title').textContent = note ? '编辑这段阅读的痕迹' : '留下一点阅读的痕迹';
  openDialog('note-dialog');
}

function showDetails(id) {
  const book = state.books.find((item) => item.id === id);
  if (!book) return toast('这本书已不存在。');
  selectedBook = id;
  const notes = state.notes.filter((note) => note.bookId === id).sort((a, b) => noteDate(b).localeCompare(noteDate(a)));
  const percent = Math.round(book.currentPage / book.totalPages * 100);
  $('#detail-content').innerHTML = `<div class="detail-header">${cover(book)}<div class="detail-text"><span class="eyebrow">YOUR READING JOURNEY</span><h2>${h(book.title)}</h2><div class="detail-author">${h(book.author)} · ${book.totalPages} 页</div><div class="detail-category">${h(book.category)} · ${statusLabels[getBookStatus(book)]}</div><div class="detail-progress-text">已读 ${book.currentPage} 页 · ${percent}%</div><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div></div><button class="icon-button" data-close="detail-dialog" aria-label="关闭">${icon('close')}</button></div><section class="detail-section"><div class="detail-section-heading"><h3>记录这一次阅读</h3><span>页数和时间，都会好好留住</span></div><form id="progress-form" class="progress-form"><div class="form-row"><label>读到了第几页？<input name="currentPage" type="number" min="${book.currentPage}" max="${book.totalPages}" step="1" value="${book.currentPage}" required></label><label>阅读了多少分钟？<input name="minutes" type="number" min="1" max="1440" step="1" placeholder="例如：20" required></label><button class="button button-primary" type="submit">${icon('check')}记录阅读</button></div><p class="form-error" id="progress-error" role="alert"></p></form></section><section class="detail-section"><div class="detail-section-heading"><h3>这本书的笔记 <span>(${notes.length})</span></h3><button class="text-button" data-action="note" data-id="${h(id)}">+ 写一条笔记</button></div>${notes.length ? notes.slice(0, 3).map((note) => `<div class="detail-note"><p>${h(note.content)}</p><small>第 ${note.page} 页 · ${readableDate(note.createdAt)} <button class="text-button" data-action="edit-note" data-id="${h(note.id)}">编辑</button></small></div>`).join('') : `<p class="detail-empty">还没有笔记，留下一句话或一个想法吧。</p>`}${notes.length > 3 ? `<button class="text-button detail-notes-more" data-action="all-notes">查看全部笔记 ${icon('arrow')}</button>` : ''}</section><div class="detail-bottom"><button class="delete-button" data-action="delete-book" data-id="${h(id)}">${icon('trash')}移出书架</button><button class="button button-secondary" data-action="edit-book" data-id="${h(id)}">${icon('note')}编辑书籍</button></div>`;
  openDialog('detail-dialog');
}

function confirmation(title, message, action, dangerous = false) {
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-action').classList.toggle('button-danger', dangerous);
  pendingConfirm = action;
  openDialog('confirm-dialog');
}

function download(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function selectFile(mode) {
  importMode = mode;
  $('#file-input').value = '';
  $('#file-input').accept = mode === 'csv' ? '.csv,text/csv' : '.json,application/json';
  $('#data-error').textContent = '';
  $('#file-input').click();
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button, a, [role="button"]');
  if (!target) return;
  if (target.matches('.brand')) { event.preventDefault(); navigate('books'); return; }
  if (target.dataset.close) { closeDialog(target.dataset.close); return; }
  if (target.dataset.view) { navigate(target.dataset.view); return; }
  if (target.dataset.filter) { filter = target.dataset.filter; render(); return; }
  if (target.dataset.layout) { layout = target.dataset.layout; render(); return; }
  const action = target.dataset.action;
  const id = target.dataset.id;
  try {
    if (action === 'add') openBook();
    else if (action === 'detail') showDetails(id);
    else if (action === 'edit-book') openBook(id);
    else if (action === 'note') openNote(id);
    else if (action === 'edit-note') openNote(undefined, id);
    else if (action === 'all-notes') { closeDialog('detail-dialog'); navigate('notes'); }
    else if (action === 'delete-book') confirmation('把这本书移出书架？', '这本书的笔记和阅读记录也会一并移除。建议先导出完整备份。', () => { commit(removeBook(state, id), '已移出书架'); closeDialog('detail-dialog'); }, true);
    else if (action === 'delete-note') confirmation('删除这条笔记？', '删除后无法撤回，请确认这段文字已经不需要了。', () => { commit(deleteNote(state, id), '已删除笔记'); }, true);
    else if (action === 'goal') { $('#goal-form').elements.goal.value = state.goal; $('#goal-error').textContent = ''; openDialog('goal-dialog'); }
    else if (action === 'data') { $('#data-error').textContent = ''; $('#recovery-export').hidden = !recoveryBackup && !damagedBackup; openDialog('data-dialog'); }
    else if (action === 'export-json') { download(JSON.stringify(state, null, 2), `阅间-完整备份-${new Date().toISOString().slice(0, 10)}.json`, 'application/json;charset=utf-8'); toast('完整备份已导出，记得好好保存。'); }
    else if (action === 'export-csv') { download(`\uFEFF${toBooksCsv(state)}`, '阅间-我的书单.csv', 'text/csv;charset=utf-8'); toast('书单已导出'); }
    else if (action === 'import-csv') selectFile('csv');
    else if (action === 'import-json') selectFile('json');
    else if (action === 'export-damaged') { download(damagedBackup ?? recoveryBackup, '阅间-原始备份.json', 'application/json;charset=utf-8'); if (damagedBackup && recoveryBackup && recoveryBackup !== damagedBackup) damagedBackup = null; toast('原始备份已导出'); }
    else if (action === 'show-all') navigate('books');
    else if (action === 'show-unread') { navigate('books'); filter = 'unread'; render(); }
    else if (action === 'clear-search') { query = ''; render(); }
  } catch (error) { toast(error.message); }
});

document.addEventListener('keydown', (event) => {
  const coverElement = event.target.closest('.book-cover[role="button"]');
  if (coverElement && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); showDetails(coverElement.dataset.id); }
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'book-search') { query = event.target.value; $('#books-results').innerHTML = booksResults(); }
  if (event.target.id === 'note-search') { query = event.target.value; $('#notes-results').innerHTML = notesResults(); }
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'book-sort') { sort = event.target.value; $('#books-results').innerHTML = booksResults(); }
  if (event.target.id === 'note-book') {
    const book = state.books.find((item) => item.id === event.target.value);
    $('#note-form').elements.page.max = book.totalPages;
    $('#note-form').elements.page.value = book.currentPage;
  }
});

$('#book-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  const id = data.id;
  delete data.id;
  if (!data.category.trim()) data.category = '其他';
  try {
    commit(id ? updateBook(state, id, data) : addBook(state, data), id ? '书籍信息已更新' : '新书已加入书架，期待下一次翻页。');
    closeDialog('book-dialog');
    if (id && $('#detail-dialog').open) showDetails(id);
  } catch (error) { $('#book-error').textContent = error.message; }
});

$('#note-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  if (!data.id) delete data.id;
  try {
    commit(saveNote(state, data), '这段阅读的痕迹，已好好保存。');
    closeDialog('note-dialog');
    if ($('#detail-dialog').open && selectedBook) showDetails(selectedBook);
  } catch (error) { $('#note-error').textContent = error.message; }
});

document.addEventListener('submit', (event) => {
  if (event.target.id !== 'progress-form') return;
  event.preventDefault();
  try {
    const data = Object.fromEntries(new FormData(event.target));
    commit(recordReading(state, { ...data, bookId: selectedBook }), '阅读已记录，又多了一段与好书相处的时间。');
    showDetails(selectedBook);
  } catch (error) { $('#progress-error').textContent = error.message; }
});

$('#goal-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try { commit(setGoal(state, event.target.elements.goal.value), '阅读目标已更新'); closeDialog('goal-dialog'); }
  catch (error) { $('#goal-error').textContent = error.message; }
});

$('#confirm-action').addEventListener('click', () => {
  const action = pendingConfirm;
  try { action?.(); closeDialog('confirm-dialog'); pendingConfirm = null; }
  catch (error) { toast(error.message); }
});

$('#file-input').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  const mode = importMode;
  if (!file) return;
  try {
    const sizeLimit = mode === 'csv' ? 12 : 64;
    if (file.size > sizeLimit * 1024 * 1024) throw new Error(`文件超过 ${sizeLimit} MB，请先整理内容后再导入。`);
    const text = await file.text();
    if (mode === 'csv') {
      const books = parseBooksCsv(text);
      const next = mergeImportedBooks(state, books);
      const added = next.books.length - state.books.length;
      commit(next, `已导入 ${added} 本书，跳过 ${books.length - added} 本重复书籍。`);
      closeDialog('data-dialog');
    } else {
      let raw;
      try { raw = JSON.parse(text.replace(/^\uFEFF/, '')); }
      catch { throw new Error('这不是有效的 JSON 备份文件。'); }
      const restored = validateState(raw);
      confirmation('恢复这份阅读备份？', `将使用备份中的 ${restored.books.length} 本书、${restored.notes.length} 条笔记和 ${restored.sessions.length} 条阅读记录替换当前全部数据。请先导出当前完整备份。`, () => {
        commit(restored, '完整备份已恢复');
        closeDialog('data-dialog');
        if ($('#detail-dialog').open) closeDialog('detail-dialog');
      });
    }
  } catch (error) { $('#data-error').textContent = `导入未完成：${error.message} 当前数据未改变。`; }
});

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
}
$('#confirm-dialog').addEventListener('close', () => { pendingConfirm = null; });

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    state = validateState(JSON.parse(event.newValue));
    damagedBackup = null;
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    render();
    toast('已同步当前浏览器另一标签页的阅读数据。');
  } catch { toast('另一标签页的数据无法读取，当前页面保留原数据。'); }
});

const hashView = location.hash.slice(1);
if (Object.hasOwn(viewLabels, hashView)) view = hashView;
const recoveryExport = document.createElement('button');
recoveryExport.id = 'recovery-export';
recoveryExport.className = 'text-button';
recoveryExport.dataset.action = 'export-damaged';
recoveryExport.textContent = '导出原始恢复备份';
recoveryExport.hidden = true;
$('#data-dialog').insertBefore(recoveryExport, $('#data-error'));
$('#today-date').textContent = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
render();
