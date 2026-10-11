'use strict';
(() => {
  const data = window.ReadingData;
  const $ = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const now = () => new Date().toISOString();
  const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const statusLabel = {want:'想读',reading:'正在读',done:'已读完'};
  let storage;
  try { storage = window.localStorage; } catch (_) { storage = undefined; }
  const store = data.createStore(storage);
  const loaded = store.load();
  let books = loaded.books;
  let protectedStorage = Boolean(loaded.error);
  let unsaved = Boolean(loaded.error);
  let activeFilter = 'all';
  let activeView = 'books';
  let selectedId = null;
  let detailTab = 'progress';
  let editingId = null;
  let toastTimer;
  let confirmAction = null;
  const noteDrafts = new Map();
  function toast(message) {
    $('#toast').textContent = message;
    $('#toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3300);
  }
  function notice(message) {
    $('#storage-notice').textContent = message;
    $('#storage-notice').hidden = !message;
    $('#storage-status').classList.toggle('unsaved', unsaved);
    $('#storage-status').innerHTML = `<i></i> ${unsaved ? '未保存 · 请导出备份' : '本地保存'}`;
  }
  if (loaded.error) notice(`${loaded.error} 当前展示的修改仅保留在本次页面中；请导出备份。已有存储内容不会被自动覆盖。`);
  function commit(next, message, allowReplace = false, errorSelector = null) {
    try {
      const normalized = data.normalize(next);
      data.exportBackup(normalized);
      const result = protectedStorage && !allowReplace ? {ok:false,error:'已有存储无法正常读取，尚未覆盖原有内容。'} : store.save(normalized);
      books = normalized;
      unsaved = !result.ok;
      if (result.ok) protectedStorage = false;
      notice(result.ok ? '' : `${result.error} 修改仅保留在当前页面；请导出备份。`);
      render();
      toast(result.ok ? message : `${message}（仅当前页面，请导出备份）`);
      return true;
    } catch (error) {
      if (errorSelector && $(errorSelector)) $(errorSelector).textContent = error.message;
      else toast(error.message);
      return false;
    }
  }
  function themeFor(book) {
    if (book.title === '山间来信') return 'green';
    if (book.title === '城市慢步') return 'peach';
    if (book.title === '晚风笔记') return 'night';
    return ['green','peach','night'][[...book.id].reduce((sum,ch) => sum + ch.charCodeAt(0), 0) % 3];
  }
  function art(book, index, asButton = true) {
    const theme = themeFor(book);
    const landscapes = {
      green:'<path d="M-10 180V100L57 17 133 100 175 47 244 130V190" fill="#587b64"/><path d="M-5 190V139L76 62 167 167 210 105 243 143V190" fill="#345a43"/><path d="M-5 190V181L129 124 242 180V190" fill="#a5b096"/><path d="M65 191Q146 133 241 190" fill="#ded9bc"/>',
      peach:'<circle cx="163" cy="57" r="32" fill="#b26544"/><path d="M18 190V87H62V190M76 190V116H117V190M132 190V96H177V190M189 190V132H221V190" fill="#7b624f"/><path d="M26 101H53M26 118H53M26 135H53M85 130H109M85 147H109M141 112H167M141 128H167M141 144H167" stroke="#eccba9" stroke-width="5"/><path d="M0 183h230" stroke="#594b3d" stroke-width="9"/>',
      night:'<circle cx="158" cy="51" r="30" fill="#ede0b8"/><circle cx="173" cy="43" r="26" fill="#5a5b74"/><path d="M-5 149Q52 102 119 151T240 129V190H-5" fill="#373f55"/><path d="M-5 180Q107 134 234 172V190H-5" fill="#8b8f9f"/><path d="M30 35h3M57 60h3M86 24h3M195 95h3" stroke="#dfdbc9" stroke-width="2"/>'
    };
    const tag = asButton ? 'button' : 'div';
    const attrs = asButton ? `type="button" data-open="${esc(book.id)}" aria-label="打开${esc(book.title)}的详情"` : '';
    return `<${tag} class="cover-stage stage-${theme}" ${attrs}><span class="stage-kicker">THE BOOKS WE KEEP</span><div class="book-cover cover-${theme}"><span class="cover-caption">A PERSONAL READING COLLECTION</span><h3 class="cover-title">${esc(book.title)}</h3><span class="cover-author">${esc(book.author)} 著</span><svg viewBox="0 0 230 190" class="cover-landscape" aria-hidden="true">${landscapes[theme]}</svg><span class="cover-imprint">页间文库 · PRIVATE COLLECTION</span></div><span class="stage-index">${String(index + 1).padStart(2,'0')}</span></${tag}>`;
  }
  function bookCard(book, index) {
    const percent = Math.round(book.currentPage / book.totalPages * 100);
    return `<article class="book-card">${art(book,index)}<div class="book-caption"><span class="book-number">NO. ${String(index + 1).padStart(2,'0')}</span><span class="book-status ${book.status}">${statusLabel[book.status]}</span></div><button type="button" class="book-title-button" data-open="${esc(book.id)}">${esc(book.title)}</button><p class="book-author">${esc(book.author)} <span> / ${book.totalPages} 页</span></p><div class="book-foot"><div class="mini-progress"><span class="mini-track" aria-hidden="true"><i style="width:${percent}%"></i></span><span>${book.currentPage} / ${book.totalPages} 页</span></div><button type="button" data-open="${esc(book.id)}">翻开这本<span>↗</span></button></div></article>`;
  }
  function dateLabel(date) { return new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date)); }
  function render() {
    const search = $('#book-search').value.trim().toLocaleLowerCase();
    let shown = books.filter(book => (activeFilter === 'all' || book.status === activeFilter) && `${book.title} ${book.author}`.toLocaleLowerCase().includes(search));
    const sort = $('#book-sort').value;
    if (sort === 'title') shown.sort((a,b) => a.title.localeCompare(b.title,'zh-CN'));
    if (sort === 'progress') shown.sort((a,b) => b.currentPage / b.totalPages - a.currentPage / a.totalPages);
    if (sort === 'added') shown.sort((a,b) => b.addedAt.localeCompare(a.addedAt));
    $('#book-grid').innerHTML = shown.map(bookCard).join('');
    const done = books.filter(book => book.status === 'done').length;
    $('#collection-count').textContent = `共 ${books.length} 本 · ${done} 本已读完`;
    $('#count-all').textContent = books.length;
    ['reading','want','done'].forEach(status => { $(`#count-${status}`).textContent = books.filter(book => book.status === status).length; });
    all('[data-filter]').forEach(button => { const selected = button.dataset.filter === activeFilter; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)); });
    $('#book-empty').hidden = shown.length > 0;
    $('#empty-title').textContent = books.length ? '这次，没有找到合适的书' : '书架还空着';
    $('#empty-copy').textContent = books.length ? '换个关键词，或回到全部书目继续挑选。' : '收下第一本书，开始你的阅读故事。';
    $('#empty-action').textContent = books.length ? '清除筛选，浏览全部 ↗' : '收一本书 ＋';
    $('#showing-count').textContent = shown.length === books.length ? `展示全部 ${books.length} 本书` : `展示 ${shown.length} 本 / 共 ${books.length} 本`;
    renderNotes();
  }
  function renderNotes() {
    const notes = books.flatMap(book => book.notes.map(note => ({book,note}))).sort((a,b) => b.note.createdAt.localeCompare(a.note.createdAt));
    $('#notes-count').textContent = notes.length ? `${notes.length} 则笔记，留住阅读时闪过的想法。` : '记录阅读时留下的想法。';
    $('#notes-empty').hidden = notes.length > 0;
    $('#notes-list').innerHTML = notes.map(({book,note},index) => `<article class="note-card"><div class="note-card-top"><span>READING NOTE / ${String(index + 1).padStart(2,'0')}</span><span>${dateLabel(note.createdAt)}</span></div><p class="note-text">${esc(note.text)}</p><div class="note-card-foot"><button type="button" data-open="${esc(book.id)}" data-tab="notes">《${esc(book.title)}》 ↗</button><span>第 ${note.page} 页</span></div></article>`).join('');
  }
  function setView(view) {
    activeView = view;
    $('#books-view').hidden = view !== 'books';
    $('#notes-view').hidden = view !== 'notes';
    ['books','notes'].forEach(name => { const nav = $(`#nav-${name}`); nav.classList.toggle('active', name === view); if (name === view) nav.setAttribute('aria-current','page'); else nav.removeAttribute('aria-current'); });
  }
  function rememberNoteDraft() {
    if (!selectedId || !$('#note-input')) return;
    const text = $('#note-input').value;
    if (text) noteDrafts.set(selectedId,{text,page:$('#note-page').value});
    else noteDrafts.delete(selectedId);
  }
  function changeDetailTab(tab) {
    detailTab = tab;
    $('#detail-progress').hidden = tab !== 'progress';
    $('#detail-notes').hidden = tab !== 'notes';
    all('[data-detail-tab]').forEach(button => {
      const active = button.dataset.detailTab === tab;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
  }
  function openDetails(id, tab = 'progress') {
    rememberNoteDraft();
    const book = books.find(book => book.id === id);
    if (!book) return;
    selectedId = id;
    detailTab = tab;
    const percent = Math.round(book.currentPage / book.totalPages * 100);
    const bookIndex = books.findIndex(item => item.id === id);
    const actions = '<button type="button" class="text-button" data-edit>编辑书籍</button><button type="button" class="text-button danger" data-remove>移出书刊</button>';
    $('#detail-content').innerHTML = `<div class="detail-layout"><aside class="detail-art">${art(book,bookIndex,false)}<div class="detail-metadata"><span>${book.totalPages} 页</span><span>${book.notes.length} 则笔记</span></div><div class="detail-small-actions">${actions}</div></aside><section class="detail-main"><span class="book-status ${book.status}">${statusLabel[book.status]}</span><h2>${esc(book.title)}</h2><p class="detail-author">${esc(book.author)} · 收藏于 ${dateLabel(book.addedAt)}</p><div class="detail-tabs" role="group" aria-label="书籍详情内容"><button type="button" data-detail-tab="progress" class="${tab === 'progress' ? 'active' : ''}" aria-pressed="${tab === 'progress'}">阅读进度</button><button type="button" data-detail-tab="notes" class="${tab === 'notes' ? 'active' : ''}" aria-pressed="${tab === 'notes'}">我的笔记 <span>(${book.notes.length})</span></button></div><div id="detail-progress" ${tab === 'progress' ? '' : 'hidden'}><div class="progress-summary"><strong>${percent}%</strong><span>${book.currentPage} / ${book.totalPages} 页</span></div><div class="detail-track" aria-hidden="true"><i style="width:${percent}%"></i></div><form id="progress-form"><label for="page-input">现在读到第几页？</label><input id="page-input" type="number" min="0" max="${book.totalPages}" step="1" value="${book.currentPage}" required><p class="form-hint">可修正之前的页码；读到第 ${book.totalPages} 页会自动标记为已读完。</p><p id="progress-error" class="form-error" role="alert"></p><button class="button button-dark wide" type="submit">留住这次进度 ↗</button></form><p class="progress-quote">${book.status === 'done' ? '合上一本书，带走一个新的世界。' : '一页，也是一段属于自己的时间。'}</p></div><div id="detail-notes" ${tab === 'notes' ? '' : 'hidden'}><form id="note-form"><label for="note-input">记一句话，或此刻的想法</label><textarea id="note-input" maxlength="4000" rows="4" placeholder="哪些文字让你停下来？" required></textarea><div class="form-row"><div><label for="note-page">对应页码</label><input id="note-page" type="number" min="0" max="${book.totalPages}" step="1" value="${book.currentPage}" required></div></div><p id="note-error" class="form-error" role="alert"></p><button class="button button-dark wide" type="submit">保存这则笔记 ↗</button></form><div class="detail-notes-list">${book.notes.length ? [...book.notes].reverse().map(note => `<article class="detail-note"><p>${esc(note.text)}</p><div class="detail-note-foot"><span>第 ${note.page} 页 · ${dateLabel(note.createdAt)}</span><button type="button" data-remove-note="${esc(note.id)}">删除笔记</button></div></article>`).join('') : '<p class="no-notes">还没有笔记。第一条，可以从一个小想法开始。</p>'}</div></div><div class="mobile-detail-actions">${actions}</div></section></div>`;
    const draft = noteDrafts.get(id);
    if (draft) { $('#note-input').value = draft.text; $('#note-page').value = draft.page; }
    if (unsaved) {
      const warning = document.createElement('p');
      warning.className = 'detail-save-notice';
      warning.setAttribute('role','status');
      warning.textContent = '当前修改未保存到浏览器，仅保留在本次页面。关闭详情后，请在页脚导出备份。';
      $('.detail-author').after(warning);
    }
    const dialog = $('#detail-dialog');
    if (!dialog.open) dialog.showModal();
    else $(`[data-detail-tab="${tab}"]`).focus({preventScroll:true});
  }
  function openBookForm(id = null) {
    editingId = id;
    const book = books.find(book => book.id === id);
    $('#book-form').reset();
    $('#book-error').textContent = '';
    $('#book-dialog-title').textContent = book ? '编辑这本书' : '收一本喜欢的书';
    $('#book-submit').textContent = book ? '保存书籍信息 ↗' : '加入我的书刊 ↗';
    if (book) {
      $('#title-input').value = book.title;
      $('#author-input').value = book.author;
      $('#total-input').value = book.totalPages;
      $('#current-input').value = book.currentPage;
    }
    $('#book-dialog').showModal();
  }
  function confirm(title, copy, label, action) {
    confirmAction = action;
    $('#confirm-title').textContent = title;
    $('#confirm-copy').textContent = copy;
    $('#confirm-accept').textContent = label;
    $('#confirm-dialog').showModal();
  }
  function pageValue(input, max, allowZero = true) {
    const raw = input.value.trim();
    const value = Number(raw);
    if (!raw || !Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > max) throw new Error(`请输入 ${allowZero ? 0 : 1} 到 ${max} 之间的整数页码。`);
    return value;
  }
  $('#book-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const old = books.find(book => book.id === editingId);
      const totalPages = pageValue($('#total-input'),1000000,false);
      const currentPage = pageValue($('#current-input'),totalPages);
      const title = $('#title-input').value.trim();
      const author = $('#author-input').value.trim();
      if (!title || !author) throw new Error('请填写书名和作者，空格不算内容。');
      if (books.some(book => book.id !== editingId && book.title === title && book.author === author)) throw new Error('这本书已经在书刊里了，可以直接打开它。');
      if (old?.notes.some(note => note.page > totalPages)) throw new Error('总页数不能小于现有笔记的对应页码，请先核对笔记。');
      const updated = data.validateBook({id:old?.id || uid(),title,author,totalPages,currentPage,status:currentPage === totalPages ? 'done' : currentPage ? 'reading' : 'want',notes:old?.notes || [],addedAt:old?.addedAt || now(),updatedAt:now()});
      const next = old ? books.map(book => book.id === old.id ? updated : book) : [...books,updated];
      if (commit(next, old ? '书籍信息已更新' : '这本书，已经收进你的书刊',false,'#book-error')) {
        $('#book-dialog').close();
        if (old && $('#detail-dialog').open) openDetails(old.id,detailTab);
        if (!old) { setView('books'); activeFilter = 'all'; $('#book-search').value = ''; $('#book-sort').value = 'added'; render(); }
      }
    } catch (error) { $('#book-error').textContent = error.message; }
  });
  $('#detail-content').addEventListener('submit', event => {
    event.preventDefault();
    const book = books.find(book => book.id === selectedId);
    if (!book) return;
    if (event.target.id === 'progress-form') {
      try {
        const page = pageValue($('#page-input'),book.totalPages);
        const updated = {...book,currentPage:page,status:page === book.totalPages ? 'done' : page ? 'reading' : 'want',updatedAt:now()};
        if (commit(books.map(item => item.id === book.id ? updated : item), page === book.totalPages ? '读完了，给自己一点肯定' : `已记录到第 ${page} 页`,false,'#progress-error')) openDetails(book.id,'progress');
      } catch (error) { $('#progress-error').textContent = error.message; }
    }
    if (event.target.id === 'note-form') {
      try {
        const text = $('#note-input').value.trim();
        if (!text) throw new Error('先写下一点内容，再保存这则笔记。');
        const page = pageValue($('#note-page'),book.totalPages);
        const note = {id:uid(),text,page,createdAt:now()};
        const updated = {...book,notes:[...book.notes,note],updatedAt:now()};
        if (commit(books.map(item => item.id === book.id ? updated : item),'这则想法，已经留下',false,'#note-error')) {
          $('#note-input').value = '';
          noteDrafts.delete(book.id);
          openDetails(book.id,'notes');
        }
      } catch (error) { $('#note-error').textContent = error.message; }
    }
  });
  document.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.close) $(`#${target.dataset.close}`).close();
    if (target.dataset.open) openDetails(target.dataset.open,target.dataset.tab || 'progress');
    if (target.dataset.detailTab) changeDetailTab(target.dataset.detailTab);
    if (target.hasAttribute('data-edit')) openBookForm(selectedId);
    if (target.hasAttribute('data-remove')) {
      const book = books.find(item => item.id === selectedId);
      if (!book) return;
      confirm('把这本书移出书刊？', `《${book.title}》及其 ${book.notes.length} 则笔记将从当前书刊移除。你可以先在页脚导出备份。`,'移出书刊',() => {
        if (commit(books.filter(item => item.id !== book.id),'这本书已移出书刊')) {
          noteDrafts.delete(book.id);
          selectedId = null;
          $('#detail-dialog').close();
        }
      });
    }
    if (target.dataset.removeNote) {
      const book = books.find(item => item.id === selectedId);
      const noteId = target.dataset.removeNote;
      if (!book) return;
      confirm('删除这则笔记？','删除后这则笔记会从当前书刊中移除。','删除笔记',() => {
        const updated = {...book,notes:book.notes.filter(note => note.id !== noteId),updatedAt:now()};
        if (commit(books.map(item => item.id === book.id ? updated : item),'笔记已删除')) openDetails(book.id,'notes');
      });
    }
  });
  all('[data-filter]').forEach(button => button.addEventListener('click',() => { activeFilter = button.dataset.filter; render(); }));
  $('#book-search').addEventListener('input',render);
  $('#book-sort').addEventListener('change',render);
  $('#add-book').addEventListener('click',() => openBookForm());
  $('#empty-action').addEventListener('click',() => { if (!books.length) openBookForm(); else { activeFilter = 'all'; $('#book-search').value = ''; render(); } });
  $('#nav-books').addEventListener('click',() => setView('books'));
  $('#nav-notes').addEventListener('click',() => setView('notes'));
  $('#back-to-books').addEventListener('click',() => setView('books'));
  $('#confirm-cancel').addEventListener('click',() => $('#confirm-dialog').close());
  $('#detail-dialog').addEventListener('close',rememberNoteDraft);
  $('#confirm-dialog').addEventListener('close',() => { confirmAction = null; });
  $('#confirm-accept').addEventListener('click',() => { const action = confirmAction; confirmAction = null; $('#confirm-dialog').close(); if (action) action(); });
  all('dialog').forEach(dialog => dialog.addEventListener('click',event => { if (event.target !== dialog) return; const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); }));
  $('#export-button').addEventListener('click',() => {
    try {
      const blob = new Blob([data.exportBackup(books)],{type:'application/json;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `页间书刊-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url),10000);
      toast('已导出书籍、进度和全部笔记');
    } catch (error) { toast(`导出失败：${error.message}`); }
  });
  $('#import-button').addEventListener('click',() => { $('#import-file').value = ''; $('#import-file').click(); });
  $('#import-file').addEventListener('change',async event => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 32 * 1024 * 1024) { toast('文件不能超过 32 MB，请拆分书单后再导入'); return; }
    try {
      const content = await file.text();
      if (/\.json$/i.test(file.name)) {
        const imported = data.parseBackup(content);
        confirm('从备份恢复书刊？', `这份备份包含 ${imported.length} 本书、${imported.reduce((sum,book) => sum + book.notes.length,0)} 则笔记。\n确认后会替换当前的 ${books.length} 本书。建议先导出当前书刊的备份。`,'恢复备份',() => { if (commit(imported,'书刊已从备份恢复',true)) { selectedId = null; noteDrafts.clear(); $('#detail-dialog').close(); activeFilter = 'all'; $('#book-search').value = ''; setView('books'); render(); } });
      } else if (/\.csv$/i.test(file.name)) {
        const imported = data.parseCSV(content);
        const keys = new Set(books.map(book => JSON.stringify([book.title,book.author])));
        const fresh = imported.filter(book => { const key = JSON.stringify([book.title,book.author]); if (keys.has(key)) return false; keys.add(key); return true; });
        const skipped = imported.length - fresh.length;
        if (!fresh.length) { toast(`没有新增书籍，${skipped} 本相同书目已在书刊中`); return; }
        if (commit([...books,...fresh],`已收下 ${fresh.length} 本书${skipped ? `，跳过 ${skipped} 本已有书目` : ''}`)) { setView('books'); activeFilter = 'all'; $('#book-search').value = ''; render(); }
      } else throw new Error('请选择 .csv 书单或 .json 备份文件。');
    } catch (error) { toast(`导入未完成：${error.message}`); }
  });
  window.addEventListener('beforeunload',event => { if (unsaved) { event.preventDefault(); event.returnValue = ''; } });
  render();
})();
