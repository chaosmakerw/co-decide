(() => {
  'use strict';
  const seeds = [
    {id:'f1',title:'夜班电车',year:2024,state:'想看',note:'朋友说很适合一个人安静看'},
    {id:'f2',title:'玻璃岛',year:2023,state:'看过',note:'最记得结尾留白的海面'},
    {id:'f3',title:'星期天的广播',year:2025,state:'想看',note:'想找个周末和朋友一起看'}
  ];
  const query = new URLSearchParams(location.search);
  const route = ['shelf','next','notes'].includes(query.get('route')) ? query.get('route') : 'shelf';
  const key = 'film-directions-20261012-' + route;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let films = seeds.map(f => ({...f}));
  let nextId = 'f1';
  let filter = '全部';
  let term = '';
  let selectedId;
  let storageAvailable = true;
  let toastTimer;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && Array.isArray(saved.films) && saved.films.every(f => f && typeof f.id === 'string' && typeof f.title === 'string' && ['想看','看过'].includes(f.state) && typeof f.note === 'string')) {
      films = saved.films;
      nextId = saved.nextId;
    }
  } catch { storageAvailable = false; }
  document.body.dataset.route = route;
  document.querySelector(`[data-route="${route}"]`).setAttribute('aria-current','page');
  document.title = ({shelf:'映格 · 私人影库',next:'下一场 · 我的片单',notes:'余味手记 · 我的电影笔记'})[route];
  if (query.has('embedded')) document.querySelector('.preview-bar').style.display = 'none';
  function save() {
    try { localStorage.setItem(key, JSON.stringify({films,nextId})); }
    catch { storageAvailable = false; }
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message + (storageAvailable ? '' : '；浏览器未允许保存，关闭页面后会丢失');
    $('toast').classList.add('visible');
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3000);
  }
  function icon(kind) {
    const paths = {shelf:'<rect x="4" y="5" width="24" height="22" rx="2"/><path d="M10 5v22M22 5v22M4 12h6M4 20h6M22 12h6M22 20h6"/>',next:'<path d="M5 6h22v7a4 4 0 0 0 0 8v5H5v-5a4 4 0 0 0 0-8z"/><path d="m13 12 8 5-8 5z"/>',notes:'<path d="M5 6h20a3 3 0 0 1 3 3v19H8a3 3 0 0 1-3-3zM10 6v22M14 12h9M14 17h7M5 10H2M5 17H2M5 24H2"/>'};
    return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${paths[kind]}</svg>`;
  }
  function art(film) {
    let graphic;
    if (film.id === 'f1') graphic = '<rect width="300" height="400" fill="#433855"/><circle cx="229" cy="73" r="34" fill="#d9c69d"/><path d="M0 165h32V92h32v67h35v-47h38v96h24v-59h33v21h27v-50h42v45h37v235H0z" fill="#302c46"/><path d="m42 400 101-153h12L84 400M218 400l-68-153h14l99 153" stroke="#b0a4bb" stroke-width="4"/><path d="M100 267v-99q0-14 15-14h72q14 0 14 14v99z" fill="#a796a5"/><rect x="111" y="174" width="79" height="44" rx="2" fill="#e8ce88"/><path d="M138 174v44M165 174v44" stroke="#75677e" stroke-width="3"/><path d="M107 238h85M114 252h17M171 252h17" stroke="#efe2b7" stroke-width="5"/><path d="M148 154v-16h20" fill="none" stroke="#95869b" stroke-width="3"/><ellipse cx="150" cy="305" rx="57" ry="12" fill="#75657f" opacity=".55"/><path d="M38 50v32M67 43v32M21 98v32M278 84v28M239 123v20" stroke="#8e7f9b" stroke-width="1"/><text x="27" y="337" fill="#ebe0c7" font-size="25" font-family="SimSun,serif">夜班电车</text><text x="28" y="362" fill="#baacc7" font-size="10" font-family="sans-serif">最后一班，驶向天亮。</text>';
    else if (film.id === 'f2') graphic = '<rect width="300" height="400" fill="#8dadba"/><rect y="188" width="300" height="212" fill="#35667a"/><circle cx="223" cy="85" r="32" fill="#dbe1d1"/><path d="m39 211 58-86 39 18 47 72-35 18z" fill="#567578"/><path d="m96 127-9 83 47 13 16-51-14-29z" fill="#688985"/><path d="M0 232h85m24 0h131m14 0h46M19 267h81m29 0h134M0 298h180m18 0h102M35 332h89m17 0h129" fill="none" stroke="#80a8b1" stroke-width="2"/><path d="M39 211h143" stroke="#c2d1c4" stroke-width="2"/><text x="26" y="57" fill="#e5eeeb" font-size="31" font-family="SimSun,serif">玻璃岛</text><text x="27" y="79" fill="#e5eeeb" font-size="10" font-family="sans-serif">海面记得所有沉默。</text>';
    else if (film.id === 'f3') graphic = '<rect width="300" height="400" fill="#ddaa83"/><rect width="300" height="190" fill="#7b96ad"/><path d="M0 155h300M0 176h300" stroke="#f4d7ab" stroke-width="2"/><circle cx="215" cy="65" r="30" fill="#eedbc1"/><rect x="44" y="133" width="212" height="157" rx="14" fill="#f1dfbe"/><rect x="60" y="151" width="106" height="119" rx="6" fill="#c9b491"/><path d="M71 162h84M71 176h84M71 190h84M71 204h84M71 218h84M71 232h84M71 246h84M71 260h84" stroke="#83765f" stroke-width="3"/><circle cx="211" cy="210" r="23" fill="#897e69"/><circle cx="211" cy="210" r="16" fill="#d6c69f"/><path d="m211 210 7-8" stroke="#897e69" stroke-width="3"/><path d="M186 164h50M192 246h38" stroke="#ad987d" stroke-width="3"/><path d="m96 133 90-45" stroke="#e9d7b6" stroke-width="3"/><text x="25" y="339" fill="#fff1d9" font-size="23" font-family="SimSun,serif">星期天的广播</text><text x="28" y="365" fill="#705148" font-size="10" font-family="sans-serif">把声音调到晴天。</text>';
    else graphic = `<rect width="300" height="400" fill="#637d91"/><circle cx="150" cy="174" r="95" fill="#aac1bb"/><circle cx="150" cy="174" r="60" fill="#4b6578"/><path d="m139 141 49 33-49 33z" fill="#e1d9bd"/><path d="M30 306h240M30 366h240" stroke="#8ba4ac"/><text x="30" y="341" fill="#f3ede0" font-size="22" font-family="SimSun,serif">${esc(film.title.slice(0,10))}</text>`;
    return `<svg class="art" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${graphic}</svg>`;
  }
  function header(brand,button) {
    return `<header class="app-header"><div class="brand">${icon(route)}${brand}</div><p class="small">${films.length} 部收藏 · ${films.filter(f=>f.state==='想看').length} 部想看</p><button class="primary" id="add-film">${button}</button></header>`;
  }
  function search(placeholder) {
    return `<label class="search"><span aria-hidden="true">⌕</span><input id="search-films" type="search" aria-label="搜索收藏" placeholder="${placeholder}" value="${esc(term)}"></label>`;
  }
  function matches(f) { return (f.title + f.note).toLowerCase().includes(term.toLowerCase()); }
  function renderShelf() {
    const list = films.filter(f => (filter==='全部'||f.state===filter) && matches(f));
    const memory = [...films].reverse().find(f=>f.state==='看过'&&f.note);
    return `${header('映格','＋ 收藏电影')}<div class="shelf-main"><div class="shelf-heading"><div><h1>有些电影，想一直留在身边。</h1><p>一面属于你的电影墙。想看与看过，都在这里。</p></div></div><div class="toolbar"><div class="filters" aria-label="观看状态筛选">${['全部','想看','看过'].map(v=>`<button data-filter="${v}" class="${v===filter?'active':''}" aria-pressed="${v===filter}">${v} ${v==='全部'?films.length:films.filter(f=>f.state===v).length}</button>`).join('')}</div>${search('找片名，或找一句话')}</div><div class="poster-grid">${list.map(f=>`<button class="poster-card" data-open="${esc(f.id)}" aria-label="查看${esc(f.title)}"><div class="art-wrap">${art(f)}</div><div class="poster-caption"><h2>${esc(f.title)}</h2><p>${esc(f.year||'年份待补')}<span class="state ${f.state==='看过'?'watched':''}">${f.state}</span></p></div></button>`).join('')}${!term&&filter==='全部'?'<button class="add-slot" data-add><span>＋</span>再放进一部电影</button>':''}</div>${!list.length?'<div class="empty">还没有找到这部电影。试试其他词，或收藏一部。</div>':''}${memory?`<div class="memory-strip"><span class="small">留在心里的画面<br>${esc(memory.title)}</span><p>“${esc(memory.note)}”</p></div>`:''}</div>`;
  }
  function renderNext() {
    const want = films.filter(f=>f.state==='想看');
    const current = want.find(f=>f.id===nextId)||want[0];
    const ordered = current ? [current,...want.filter(f=>f.id!==current.id)] : [];
    const watched = films.filter(f=>f.state==='看过'&&matches(f));
    return `${header('下一场','＋ 加入片单')}<div class="next-title"><div><h1>把今晚，留给一部好电影。</h1><p>先选下一部。看完后，电影和那句话一起留在片单里。</p></div></div><div class="queue-layout"><section class="screen-ticket" id="next-feature">${current?`<div class="art-wrap">${art(current)}</div><div class="ticket-content"><p class="small">下一部 · ${esc(current.year||'年份待补')}</p><h2>${esc(current.title)}</h2><p class="reason">${esc(current.note||'还没写想看的理由，可以随时补上。')}</p><div class="actions"><button class="primary" data-watch="${esc(current.id)}">看完了，留下来</button><button data-open="${esc(current.id)}">改一句话</button></div></div>`:'<div class="empty">想看片单已经看完了。<br>收藏一部新的，给下一场留个位置。</div>'}</section><aside class="queue-panel"><h2>想看的顺序 <span>${want.length} 部</span></h2><div id="queue-list">${ordered.map((f,i)=>`<div class="queue-item ${i===0?'current':''}" data-film-id="${esc(f.id)}"><span class="queue-number">${i+1}</span><div class="item-content"><h3>${esc(f.title)}</h3><p>${esc(f.note||'还没有备注')}</p><button ${i===0?'data-open':'data-next'}="${esc(f.id)}">${i===0?'查看与修改':'换成下一部'}</button></div></div>`).join('')}</div><button class="queue-add" data-add>＋ 再留一个位置</button></aside></div><section class="watched-section"><div class="watched-heading"><h2>看过，留下了什么 <span class="small">${films.filter(f=>f.state==='看过').length} 部</span></h2>${search('找看过的片名或备注')}</div><div class="watched-list">${watched.map(f=>`<button class="watched-mini" data-open="${esc(f.id)}"><div class="art-wrap">${art(f)}</div><div><h3>${esc(f.title)} <span class="small">${esc(f.year||'')}</span></h3><p>${esc(f.note||'点开，留下你的那句话。')}</p></div></button>`).join('')}${!watched.length?'<div class="empty">这里还没有匹配的观影记录。看完下一部后，就会留在这里。</div>':''}</div></section>`;
  }
  function renderNotes() {
    const watched = films.filter(f=>f.state==='看过'&&matches(f)).reverse();
    const want = films.filter(f=>f.state==='想看'&&matches(f));
    return `${header('余味手记','＋ 添一页')}<div class="notebook-layout"><section class="journal"><div class="journal-mast"><h1>电影散场，<br>有些画面没有。</h1><p>我的电影手记<br>${films.filter(f=>f.state==='看过').length} 页余味，${films.filter(f=>f.state==='想看').length} 张期待</p></div>${search('翻片名，也翻自己的话')}<div id="journal-list">${watched.map(f=>`<article class="journal-entry" data-film-id="${esc(f.id)}"><div class="entry-illustration">${art(f)}</div><div class="entry-title"><div><h2>${esc(f.title)}</h2><p>${esc(f.year||'年份待补')} / 看过</p></div><button data-open="${esc(f.id)}">修改这一页</button></div><blockquote>${esc(f.note||'这页还没有一句话。点“修改这一页”，记下留下的画面。')}</blockquote><p class="entry-end">留给以后的自己</p></article>`).join('')}${!watched.length?'<div class="empty">这一页还空着。可以添一部看过的电影，或把右侧的期待翻成手记。</div>':''}</div></section><aside class="pinned-notes"><h2>还没开始的故事</h2><p>想看的理由，先夹在这里。</p><div id="expectations">${want.map(f=>`<article class="note-slip" data-film-id="${esc(f.id)}"><span class="small">${esc(f.year||'年份待补')} / 想看</span><h3>${esc(f.title)}</h3><p>${esc(f.note||'想看的理由，留待以后写。')}</p><div class="slip-actions"><button data-open="${esc(f.id)}">补一句</button><button data-watch="${esc(f.id)}">看过了，翻成手记</button></div></article>`).join('')}${!want.length?'<div class="empty">没有匹配的期待。<br>添一部电影，夹进来。</div>':''}</div><button data-add>＋ 夹一张新的期待</button></aside></div>`;
  }
  function render(keepFocus = false) {
    const cursor = document.activeElement?.id === 'search-films' ? document.activeElement.selectionStart : null;
    $('app').className = route;
    $('app').innerHTML = ({shelf:renderShelf,next:renderNext,notes:renderNotes})[route]();
    if (keepFocus && cursor !== null) { $('search-films').focus(); try { $('search-films').setSelectionRange(cursor,cursor); } catch {} }
  }
  function openAdd() {
    $('add-form').reset();
    $('add-error').textContent = '';
    $('add-heading').textContent = ({shelf:'收藏一部电影',next:'给片单留一个位置',notes:'添一页电影手记'})[route];
    $('add-intro').textContent = ({shelf:'先留住片名。年份与那句话都可以以后补。',next:'先放进想看片单，再决定什么时候成为下一部。',notes:'想看的理由，或看完的余味，都可以留在这一页。'})[route];
    $('save-film').textContent = ({shelf:'加入收藏',next:'加入片单',notes:'保存这一页'})[route];
    $('add-dialog').showModal();
    $('film-title').focus();
  }
  function openDetail(id) {
    const film = films.find(f=>f.id===id);
    if (!film) return;
    selectedId = id;
    $('detail-heading').textContent = film.title;
    $('detail-year').textContent = film.year || '年份待补';
    $('detail-state').value = film.state;
    $('detail-note').value = film.note;
    $('detail-error').textContent = '';
    $('toggle-watched').textContent = film.state === '想看' ? '标为看过' : '改回想看';
    $('detail-dialog').showModal();
  }
  function setWatched(id, fromDetail=false) {
    const film = films.find(f=>f.id===id);
    if (!film) return;
    if (fromDetail) film.note = $('detail-note').value.trim();
    film.state = fromDetail && film.state==='看过' ? '想看' : '看过';
    save(); render();
    if (fromDetail) $('detail-dialog').close();
    toast(film.state==='看过' ? `《${film.title}》已标为看过，备注已保留` : `《${film.title}》已放回想看`);
  }
  $('app').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id==='add-film'||button.hasAttribute('data-add')) openAdd();
    else if (button.hasAttribute('data-open')) openDetail(button.dataset.open);
    else if (button.hasAttribute('data-filter')) { filter=button.dataset.filter; render(); }
    else if (button.hasAttribute('data-watch')) setWatched(button.dataset.watch);
    else if (button.hasAttribute('data-next')) { nextId=button.dataset.next; save(); render(); toast('已换成下一部，原来的电影仍留在片单里'); }
  });
  $('app').addEventListener('input', event => { if (event.target.id==='search-films') { term=event.target.value; render(true); } });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click',()=>$(button.dataset.close).close()));
  $('add-form').addEventListener('submit', event => {
    event.preventDefault();
    const title=$('film-title').value.trim(), rawYear=$('film-year').value.trim();
    const year=rawYear?Number(rawYear):null;
    if (!title) { $('add-error').textContent='请填一个片名。'; $('film-title').focus(); return; }
    if (rawYear && (!Number.isInteger(year)||year<1888||year>2100)) { $('add-error').textContent='年份请填 1888 到 2100 之间的整数，或留空。'; return; }
    if (films.some(f=>f.title===title&&String(f.year??'')===String(year??''))) { $('add-error').textContent='同名同年份的电影已经在收藏里，可以打开原记录修改。'; return; }
    const film={id:'custom-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),title,year,state:$('film-state').value,note:$('film-note').value.trim()};
    films.push(film); filter='全部'; term=''; save(); render(); $('add-dialog').close();
    toast(`《${title}》已${({shelf:'加入收藏',next:'加入片单',notes:'保存到手记'})[route]}`);
  });
  $('detail-form').addEventListener('submit', event => {
    event.preventDefault();
    const film=films.find(f=>f.id===selectedId);
    if (!film) { $('detail-error').textContent='这部电影已不在样本里，请关闭窗口重新打开。'; return; }
    film.state=$('detail-state').value; film.note=$('detail-note').value.trim();
    save(); render(); $('detail-dialog').close(); toast(`《${film.title}》已保存修改`);
  });
  $('toggle-watched').addEventListener('click',()=>setWatched(selectedId,true));
  $('reset-demo').addEventListener('click',()=>{
    films=seeds.map(f=>({...f})); nextId='f1'; term=''; filter='全部'; save(); render(); toast('当前方案已恢复为三部原始样本');
  });
  render();
})();
