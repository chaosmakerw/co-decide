(() => {
'use strict';
const KEY='co-decide-vocab-island-v1';
const WORDS=window.ISLAND_WORDS, PLACES=window.ISLAND_PLACES;
const byId=new Map(WORDS.map(w=>[w.id,w]));
const $=s=>document.querySelector(s);
const panel=$('#study');
// 同一套岛块在手机上重新落位，避免直接把宽幅地图拉成长菱形。
const map=$('.map'),lands=[...map.querySelectorAll(':scope > g[transform]')];
const wideLand=lands.map(g=>g.getAttribute('transform'));
const routePaths=[...map.querySelectorAll('[data-route]')];
const wideRoutes=routePaths.map(p=>p.getAttribute('d'));
const baseRoute=map.querySelector(':scope > path'),wideBase=baseRoute.getAttribute('d');
const mobileMedia=matchMedia('(max-width:700px)');
function fitMap(){
  const narrow=mobileMedia.matches;
  map.setAttribute('viewBox',narrow?'0 0 620 620':'0 0 1100 620');
  const smallLand=['translate(51 380) scale(.72)','translate(216 225) scale(.72)','translate(361 435) scale(.72)','translate(507 205) scale(.72)'];
  lands.forEach((g,i)=>g.setAttribute('transform',narrow?smallLand[i]:wideLand[i]));
  const smallRoutes=['M130 385Q185 350 230 285T291 234','M291 234Q324 314 367 375T422 430','M422 430Q469 365 492 300T533 207'];
  routePaths.forEach((p,i)=>p.setAttribute('d',narrow?smallRoutes[i]:wideRoutes[i]));
  baseRoute.setAttribute('d',narrow?smallRoutes.join(' '):wideBase);
}
fitMap();mobileMedia.addEventListener('change',fitMap);
let state, rawAtRead=null, damagedRaw=null, writesBlocked=false, storageProblem='', drawerKind=null, drawerTrigger=null, wordFilter=-1, search='', toastTimer;
const dateKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dateObject=k=>new Date(`${k}T12:00:00`);
const validDate=k=>typeof k==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(k)&&dateKey(dateObject(k))===k;
const addDays=(key,n)=>{const d=dateObject(key);d.setDate(d.getDate()+n);return dateKey(d)};
const pretty=k=>dateObject(k).toLocaleDateString('zh-CN',{month:'long',day:'numeric'});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const blank=()=>({version:1,updated:Date.now(),words:{},days:{},active:null});
const plain=o=>o&&typeof o==='object'&&!Array.isArray(o);
const safeInt=(n,max=1e9)=>Number.isSafeInteger(n)&&n>=0&&n<=max;

function validate(value){
  if(!plain(value)||value.version!==1||!plain(value.words)||!plain(value.days))throw Error('这不是可读取的词屿备份。');
  const out=blank();
  if(Object.keys(value.words).length>WORDS.length||Object.keys(value.days).length>4000)throw Error('备份内容超出可读取范围。');
  for(const [id,r] of Object.entries(value.words)){
    if(!byId.has(id)||!plain(r)||!validDate(r.last)||!validDate(r.due)||!safeInt(r.reviews)||!safeInt(r.lapses)||!safeInt(r.level,4)||!safeInt(r.updated,Number.MAX_SAFE_INTEGER))throw Error('备份中的单词记录不完整。');
    out.words[id]={last:r.last,due:r.due,reviews:r.reviews,lapses:r.lapses,level:r.level,updated:r.updated};
  }
  for(const [date,d] of Object.entries(value.days)){
    if(!validDate(date)||!plain(d)||!Array.isArray(d.routes)||d.routes.length!==3||!Array.isArray(d.completed)||!Array.isArray(d.retries)||typeof d.checked!=='boolean')throw Error('备份中的每日航线不完整。');
    const routes=d.routes.map((ids,i)=>{
      if(!Array.isArray(ids)||ids.length!==3||new Set(ids).size!==3||!ids.every(id=>byId.get(id)?.place===i))throw Error('备份中的地点词条不正确。');
      return [...ids];
    });
    const allowed=routes.flat();
    if(d.completed.length>9||d.retries.length>9||!d.completed.every(id=>allowed.includes(id))||!d.retries.every(id=>allowed.includes(id)))throw Error('备份中的学习进度不正确。');
    const completed=[...new Set(d.completed)], retries=[...new Set(d.retries)];
    if(d.checked&&completed.length!==9)throw Error('打卡记录缺少对应的学习进度。');
    out.days[date]={routes,completed,retries,checked:d.checked,checkedAt:typeof d.checkedAt==='string'?d.checkedAt.slice(0,40):null};
  }
  out.updated=safeInt(value.updated,Number.MAX_SAFE_INTEGER)?value.updated:Date.now();
  const a=value.active, today=out.days[dateKey()];
  if(plain(a)&&today&&safeInt(a.place,2)&&Array.isArray(a.queue)&&a.queue.length<=3&&a.queue.every(id=>today.routes[a.place].includes(id))){
    out.active={place:a.place,queue:[...new Set(a.queue)],revealed:!!a.revealed,practice:!!a.practice};
  }
  return out;
}

function merge(incoming,current){
  const out=blank();
  for(const id of new Set([...Object.keys(incoming.words),...Object.keys(current.words)])){
    const a=incoming.words[id],b=current.words[id];
    out.words[id]=!a?b:!b?a:a.updated>b.updated?a:b;
  }
  for(const key of new Set([...Object.keys(incoming.days),...Object.keys(current.days)])){
    const a=incoming.days[key],b=current.days[key];
    if(!a||!b){out.days[key]=structuredClone(a||b);continue}
    const allowed=b.routes.flat();
    out.days[key]={routes:b.routes.map(r=>[...r]),completed:[...new Set([...a.completed,...b.completed])].filter(id=>allowed.includes(id)),retries:[...new Set([...a.retries,...b.retries])].filter(id=>allowed.includes(id)),checked:false,checkedAt:a.checkedAt||b.checkedAt};
    out.days[key].checked=(a.checked||b.checked)&&out.days[key].completed.length===9;
  }
  out.active=current.active;
  return out;
}

function load(){
  try{
    rawAtRead=localStorage.getItem(KEY);
    state=rawAtRead?validate(JSON.parse(rawAtRead)):blank();
  }catch(error){
    state=blank();
    if(rawAtRead){damagedRaw=rawAtRead;writesBlocked=true;storageProblem='damaged'}
    else{storageProblem='unavailable'}
  }
}

function save(){
  if(writesBlocked){renderStorage();return false}
  try{
    const existing=localStorage.getItem(KEY);
    if(existing&&existing!==rawAtRead){
      try{state=merge(validate(JSON.parse(existing)),state)}catch(error){
        damagedRaw=existing;writesBlocked=true;storageProblem='damaged';renderStorage();return false;
      }
    }
    state.updated=Date.now();
    const serialized=JSON.stringify(state);
    localStorage.setItem(KEY,serialized);
    rawAtRead=serialized;storageProblem='';renderStorage();return true;
  }catch(error){storageProblem='unavailable';renderStorage();return false}
}

function ensureToday(){
  const today=dateKey();
  if(state.days[today])return false;
  const routes=PLACES.map((p,i)=>{
    const candidates=WORDS.filter(w=>w.place===i);
    const due=candidates.filter(w=>state.words[w.id]&&state.words[w.id].due<=today).sort((a,b)=>state.words[a.id].due.localeCompare(state.words[b.id].due)||state.words[a.id].updated-state.words[b.id].updated);
    const fresh=candidates.filter(w=>!state.words[w.id]);
    const later=candidates.filter(w=>state.words[w.id]&&state.words[w.id].due>today).sort((a,b)=>state.words[a.id].last.localeCompare(state.words[b.id].last)||state.words[a.id].updated-state.words[b.id].updated);
    return [...due,...fresh,...later].slice(0,3).map(w=>w.id);
  });
  state.days[today]={routes,completed:[],retries:[],checked:false,checkedAt:null};
  state.active=null;save();return true;
}
const day=()=>state.days[dateKey()];
const count=i=>day().routes[i].filter(id=>day().completed.includes(id)).length;

function renderStorage(){
  const warning=$('#storage-alert');warning.hidden=!storageProblem;
  $('#recover-storage').hidden=storageProblem!=='damaged';
  if(storageProblem==='damaged'){
    $('#storage-title').textContent='原有记录暂时读不出来，已经保留原件。';
    $('#storage-message').textContent='当前为临时航线，暂不覆盖原记录。可先导出原始文件，或保留原件后重新开始。';
    $('#alert-export').textContent='导出原始记录';
  }else if(storageProblem){
    $('#storage-title').textContent='浏览器未能保存这次进度。';
    $('#storage-message').textContent='你可以继续学习；关闭页面前请导出备份。允许本地存储后，再次操作会重试保存。';
    $('#alert-export').textContent='导出当前备份';
  }
  $('#save-state').textContent=storageProblem?'尚未保存 · 请先导出备份':'进度自动保存在此浏览器';
}

function renderMap(){
  const d=day(), lit=PLACES.filter((p,i)=>count(i)===3).length;
  const today=dateKey();
  $('#today-date').textContent=`${pretty(today)}  ${dateObject(today).toLocaleDateString('zh-CN',{weekday:'long'})}`;
  $('#headline').textContent=d.checked?'今天的远行，已经留下。':d.completed.length===9?'灯塔亮了，来留下足迹。':'今天，走过九个词。';
  $('#subtitle').textContent=d.checked?'再看看熟悉的词，或让海风陪你休息一会儿。':d.completed.length===9?'三个地点都已点亮。到灯塔，完成今天的打卡。':'选一个想去的地方，先回忆，再把它点亮。';
  $('#progress').textContent=`已点亮 ${lit} / 3 个地点`;
  $('#word-progress').textContent=`今日 ${d.completed.length} / 9 词`;
  document.querySelectorAll('.journey .dots i').forEach((el,i)=>el.classList.toggle('done',i<lit));
  document.querySelectorAll('[data-node]').forEach((node,i)=>{
    const n=count(i),pending=d.routes[i].find(id=>!d.completed.includes(id));
    node.classList.toggle('done',n===3);node.classList.toggle('active',state.active?.place===i);
    node.querySelector('strong').textContent=n===3?PLACES[i].name:byId.get(pending).word;
    node.querySelector('strong').classList.toggle('long',n!==3&&byId.get(pending).word.length>8);
    node.querySelector('.place-name').textContent=n===3?'已点亮':PLACES[i].name;
    node.querySelector('.state').textContent=n===3?'✓ 3 / 3 词 · 可回看':`${n} / 3 词 · ${n?'继续走':'去看看'}`;
    node.setAttribute('aria-label',`${PLACES[i].name}，${PLACES[i].theme}，已完成 ${n} / 3 词${n===3?'，回看词语':''}`);
    node.querySelectorAll('.node-dots i').forEach((dot,j)=>dot.classList.toggle('done',j<n));
    document.querySelector(`[data-route="${i}"]`).style.strokeDashoffset=String(100-n/3*100);
  });
  const tower=$('#lighthouse');tower.disabled=d.completed.length!==9||d.checked;
  tower.classList.toggle('ready',d.completed.length===9&&!d.checked);
  tower.querySelector('.label').textContent=d.checked?`${today.slice(5).replace('-','.')} 已打卡`:d.completed.length===9?'到灯塔打卡':'终点 · 等你点亮';
  tower.setAttribute('aria-label',d.checked?'今天已在灯塔打卡':d.completed.length===9?'到灯塔打卡':'学完九个词后到灯塔打卡');
  $('.mapstage').classList.toggle('complete',d.checked);
  $('#result').hidden=!d.checked||!!state.active;
  $('#result-date').textContent=`${pretty(today)} · 今日航行`;
  $('#footer-state').textContent=d.checked?'今天已打卡。明天，继续出发。':d.completed.length===9?'三个地点已点亮，灯塔在等你。':`走完三个地点后，前往灯塔打卡。`;
  renderStorage();
}

function islandFigure(){return '<svg class="mini-island" viewBox="0 0 120 110" aria-hidden="true"><path d="m8 59 50-27 52 27-52 29Z" fill="#efb09c"/><path d="m8 59 50 29v16L8 77Z" fill="#d28b78"/><path d="m58 88 52-29v18l-52 27Z" fill="#b77869"/><path d="m49 38 3-27h15l5 27Z" fill="#fff8e8"/><path d="M47 11h25v10H47Z" fill="#f8dc87" stroke="#174f49"/><path d="m43 11 16-10 17 10Z" fill="#174f49"/><path d="m16 53 7-20 8 20Z" fill="#5b9b77"/><path d="m87 57 6-17 7 17Z" fill="#5b9b77"/><path d="m46 59 9 8 19-18" fill="none" stroke="#1b695e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>'}

function renderStudy(focus=false){
  const a=state.active;panel.hidden=!a;
  if(!a){renderMap();return}
  const p=PLACES[a.place];
  if(!a.queue.length){
    panel.innerHTML=`<button class="close" aria-label="返回地图">×</button><div class="place-clear">${islandFigure()}<div><h2>${esc(p.name)}，已点亮。</h2><p>${a.practice?'这一遍也走完了。':'三个词，都留下了自己的足迹。'}</p><div class="clear-words">${day().routes[a.place].map(id=>`<span>${esc(byId.get(id).word)}</span>`).join('')}</div></div><div class="clear-actions"><button class="primary" id="return-map">${day().completed.length===9&&!day().checked?'回地图，去灯塔':'回地图，选下一处'}</button><button class="secondary" id="practice-place">再练一遍</button></div></div>`;
    $('#return-map').onclick=()=>closeStudy(true);
    $('#practice-place').onclick=()=>{state.active={place:a.place,queue:[...day().routes[a.place]],revealed:false,practice:true};save();renderStudy(true)};
  }else{
    const w=byId.get(a.queue[0]), already=state.words[w.id], position=a.practice?`回看 · 还剩 ${a.queue.length} 词`:`已走过 ${count(a.place)} / 3 词`;
    panel.innerHTML=`<button class="close" aria-label="返回地图">×</button><div class="study-head"><small>${esc(p.name)}学习舱 · ${position}</small><h2>${esc(w.word)}</h2><div class="ipa">${esc(w.ipa)} <span class="word-kind">${already?'复习':'新词'}</span></div></div><div class="study-content">${a.revealed?`<h3 class="meaning"><small class="meaning-type">${esc(w.type)}</small> ${esc(w.meaning)}</h3><p class="example">${esc(w.example)}</p><p class="translation">${esc(w.translation)}</p>`:'<p class="prompt">先想想，这个词是什么意思？</p><p class="subprompt">给自己一点回忆的时间。<br>想到了，再看看答案。</p>'}</div><div class="study-actions">${a.revealed?'<button class="again" id="again">再想一次，稍后重来</button><button class="secondary" id="hard">有点模糊</button><button class="primary" id="known">记住了</button><p class="key-hint">按 1 重来 · 2 模糊 · 3 记住</p>':'<button class="primary" id="reveal">揭示词义</button><p class="key-hint">也可以按空格</p>'}</div>`;
    if(a.revealed){$('#again').onclick=()=>rate('again');$('#hard').onclick=()=>rate('hard');$('#known').onclick=()=>rate('known')}
    else $('#reveal').onclick=reveal;
  }
  panel.querySelector('.close').onclick=()=>closeStudy();
  renderMap();
  if(focus)(panel.querySelector('#reveal,#known,#return-map')||panel.querySelector('button'))?.focus({preventScroll:true});
}

function openPlace(i){
  if(ensureToday())toast('新的一天，新的航线已经准备好了。');
  const pending=day().routes[i].filter(id=>!day().completed.includes(id));
  pending.sort((a,b)=>Number(day().retries.includes(a))-Number(day().retries.includes(b)));
  state.active={place:i,queue:pending,revealed:false,practice:false};save();renderStudy(true);
  if(innerWidth<=700)panel.scrollIntoView({behavior:reduced()?'instant':'smooth',block:'start'});
}
const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
function closeStudy(tower=false){
  const i=state.active?.place;
  state.active=null;save();renderStudy();
  const target=tower&&day().completed.length===9&&!day().checked?$('#lighthouse'):document.querySelector(`[data-node="${i??0}"]`);
  target.focus({preventScroll:true});
  if(innerWidth<=700)$('.intro').scrollIntoView({behavior:reduced()?'instant':'smooth',block:'start'});
}
function reveal(){
  if(ensureToday()){renderStudy();renderMap();toast('日期已更新，请从今天的地图出发。');return}
  if(!state.active?.queue.length)return;
  state.active.revealed=true;save();renderStudy(true);
}
function rate(grade){
  if(ensureToday()){renderStudy();renderMap();toast('日期已更新，请从今天的地图出发。');return}
  const a=state.active;if(!a?.revealed||!a.queue.length)return;
  const id=a.queue[0],old=state.words[id]||{level:0,reviews:0,lapses:0};
  const level=grade==='known'?Math.min(4,old.level+1):0;
  const gap=grade==='known'?[1,3,7,14,30][level]:1;
  state.words[id]={level,reviews:old.reviews+1,lapses:old.lapses+(grade==='again'?1:0),last:dateKey(),due:addDays(dateKey(),gap),updated:Date.now()};
  a.queue.shift();a.revealed=false;
  if(grade==='again'){
    a.queue.push(id);if(!day().retries.includes(id))day().retries.push(id);
    toast('这个词放回了队尾。再遇见时，试着重新回忆。');
  }else{
    if(!a.practice&&!day().completed.includes(id))day().completed.push(id);
    if(grade==='hard')toast('已留下足迹，明天会再带上这个词。');
  }
  save();renderStudy(true);
}
function checkIn(){
  if(ensureToday()){renderStudy();renderMap();return}
  if(day().completed.length!==9||day().checked)return;
  day().checked=true;day().checkedAt=new Date().toISOString();state.active=null;save();renderStudy();renderMap();
  $('#result').scrollIntoView({behavior:reduced()?'instant':'smooth',block:'nearest'});
  toast(storageProblem?'今天已打卡，关闭页面前请导出备份。':'打卡已留下。明天，继续出发。');
}
function toast(message){
  clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;
  toastTimer=setTimeout(()=>{$('#toast').hidden=true},4200);
}

function openDrawer(kind,trigger){
  ensureToday();drawerKind=kind;drawerTrigger=trigger;$('#drawer').hidden=false;$('#shade').hidden=false;document.body.classList.add('drawer-open');
  $('#drawer-title').textContent=kind==='words'?'随身词册':'航行记录';renderDrawer();$('#close-drawer').focus();
}
function closeDrawer(){
  $('#drawer').hidden=true;$('#shade').hidden=true;document.body.classList.remove('drawer-open');drawerKind=null;drawerTrigger?.focus({preventScroll:true});
}
function renderDrawer(){
  if(drawerKind==='words')renderWords();else if(drawerKind==='records')renderRecords();
}
function renderWords(){
  $('#drawer-body').innerHTML=`<p class="drawer-description">${WORDS.length} 个词，放在三个熟悉的地方。<br>明天的地图会优先带上到期的词，再遇见新的词。</p><label><span class="sr-only">搜索英文或中文词义</span><input class="search-field" id="search-word" placeholder="找一个词，或一段中文意思" value="${esc(search)}" autocomplete="off"></label><div class="word-tabs" aria-label="按地点筛选"><button data-filter="-1" class="${wordFilter===-1?'selected':''}">全部</button>${PLACES.map((p,i)=>`<button data-filter="${i}" class="${wordFilter===i?'selected':''}">${esc(p.name)}</button>`).join('')}</div><p id="word-count" class="word-count"></p><div id="word-list"></div><p class="data-note">内置内容为演示词库，含常用词义和原创例句。自评用于安排再次相遇：模糊的词明天复习，记住的词依次间隔 3、7、14、30 天；这是一套简单的本地规则。</p>`;
  $('#search-word').oninput=e=>{search=e.target.value;renderWordList()};
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{wordFilter=Number(b.dataset.filter);document.querySelectorAll('[data-filter]').forEach(t=>t.classList.toggle('selected',t===b));renderWordList()});
  renderWordList();
}
function renderWordList(){
  const q=search.trim().toLowerCase();
  const list=WORDS.filter(w=>(wordFilter===-1||w.place===wordFilter)&&(!q||`${w.word} ${w.meaning}`.toLowerCase().includes(q)));
  $('#word-count').textContent=`${list.length} 个词 · 点击词条展开`;
  $('#word-list').innerHTML=list.length?list.map(w=>{
    const r=state.words[w.id], status=!r?'尚未走过':r.due<=dateKey()?'到期复习':`${pretty(r.due)}再相遇`;
    return `<details class="word-row"><summary><strong>${esc(w.word)}</strong><small>${esc(PLACES[w.place].name)} · ${status}</small></summary><div class="word-detail"><div class="ipa">${esc(w.ipa)} · ${esc(w.type)}</div><p class="meaning">${esc(w.meaning)}</p><p class="example">${esc(w.example)}</p><p class="translation">${esc(w.translation)}</p><p class="word-due">${r?`已自评 ${r.reviews} 次 · 上次 ${pretty(r.last)}`:'尚未进入学习记录'}</p></div></details>`;
  }).join(''):'<p class="empty">没有找到这个词。试试英文原形，或换一段中文词义。</p>';
}
function streak(){
  let key=dateKey(),total=0;if(!state.days[key]?.checked)key=addDays(key,-1);
  while(state.days[key]?.checked){total++;key=addDays(key,-1)}return total;
}
function renderRecords(){
  const checked=Object.values(state.days).filter(d=>d.checked).length;
  const keys=Array.from({length:28},(_,i)=>addDays(dateKey(),i-27));
  const records=Object.keys(state.days).filter(k=>state.days[k].completed.length||state.days[k].checked).sort().reverse().slice(0,30);
  $('#drawer-body').innerHTML=`<p class="drawer-description">走过的词与到访的日子，都留在这里。<br>每天走完九个词，再到灯塔亲手打卡。</p><div class="stats"><div><strong>${Object.keys(state.words).length}</strong><small>相遇过的词</small></div><div><strong>${checked}</strong><small>累计打卡天</small></div><div><strong>${streak()}</strong><small>连续打卡天</small></div></div><h3 class="drawer-subhead">最近四周的足迹</h3><div class="calendar">${keys.map(k=>`<div class="calendar-day ${state.days[k]?.checked?'checked':''} ${k===dateKey()?'today':''}" title="${k} ${state.days[k]?.checked?'已打卡':'未打卡'}"><span>${dateObject(k).getDate()}</span><small>${state.days[k]?.checked?'✦':dateObject(k).getDay()===1?`${dateObject(k).getMonth()+1}月`:'·'}</small></div>`).join('')}</div><div class="calendar-caption"><span>${pretty(keys[0])} — ${pretty(keys[27])}</span><span>深色为已打卡</span></div><h3 class="drawer-subhead">航行日记</h3>${records.length?records.map(k=>`<div class="record-row"><div>${pretty(k)}<small>${state.days[k].completed.length} / 9 词 · ${state.days[k].routes.filter((r,i)=>r.every(id=>state.days[k].completed.includes(id))).length} 个地点已点亮</small></div><span class="record-status">${state.days[k].checked?'灯塔已打卡':'航行中'}</span></div>`).join(''):'<p class="empty">还没有足迹。回到地图，选一处开始吧。</p>'}<h3 class="drawer-subhead">把行囊带在身边</h3><div class="backup-actions"><button class="primary" id="export-data">导出备份</button><button class="secondary" id="import-data">导入备份</button></div><p class="data-note">记录只保存在此浏览器，不上传、不创建账户。清理浏览器数据或换一个打开位置，可能无法读到原记录。请定期导出 JSON 备份；导入会合并已有进度，单词自评采用更新时间较新的记录。当天的地点与词条以当前航线为准。日期使用设备本地时间。</p>`;
  $('#export-data').onclick=exportData;$('#import-data').onclick=()=>$('#import-file').click();
}

function download(content,name,type='application/json'){
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function exportData(){
  download(JSON.stringify({...state,product:'co-decide-vocab-island'},null,2),`词屿备份-${dateKey()}.json`);
  toast('备份已准备下载。请妥善保留这个文件。');
}
$('#alert-export').onclick=()=>{if(damagedRaw!==null)download(damagedRaw,`词屿原始记录-${dateKey()}.json`);else exportData()};
$('#recover-storage').onclick=()=>{
  if(damagedRaw===null)return;
  try{
    localStorage.setItem(`${KEY}-preserved-${Date.now()}`,damagedRaw);
    download(damagedRaw,`词屿保留原件-${dateKey()}.json`);
    // 当前临时航线继续使用；先备份原件，再替换不可读的主记录。
    const text=JSON.stringify(state);localStorage.setItem(KEY,text);rawAtRead=text;
    damagedRaw=null;writesBlocked=false;storageProblem='';renderStorage();toast('原始记录已另存，也已准备下载。当前航线可以保存了。');
  }catch(error){toast('原件未能另存，原记录仍保持原样。请先导出原始记录。')}
};
$('#import-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  if(writesBlocked){toast('请先保留原始记录并重新开始，再导入备份。');return}
  try{
    if(file.size>2*1024*1024)throw Error('文件超过 2 MB，请选择词屿导出的 JSON 备份。');
    const imported=validate(JSON.parse(await file.text()));state=merge(imported,state);ensureToday();
    if(state.active){state.active.queue=state.active.queue.filter(id=>state.active.practice||!day().completed.includes(id));}
    save();renderStudy();renderMap();renderDrawer();toast(storageProblem?'已合并到当前页面，请导出备份保存。':'备份已合并，已有足迹也保留了。');
  }catch(error){toast(error instanceof SyntaxError?'文件不是有效的 JSON，原有进度未改变。':`${error.message} 原有进度未改变。`)}
};

document.querySelectorAll('[data-node]').forEach(b=>b.onclick=()=>openPlace(Number(b.dataset.node)));
$('#lighthouse').onclick=checkIn;
$('#open-words').onclick=e=>openDrawer('words',e.currentTarget);
$('#open-records').onclick=e=>openDrawer('records',e.currentTarget);
$('#close-drawer').onclick=closeDrawer;$('#shade').onclick=closeDrawer;
document.addEventListener('keydown',e=>{
  if(drawerKind){
    if(e.key==='Escape'){e.preventDefault();closeDrawer()}
    if(e.key==='Tab'){
      const items=[...$('#drawer').querySelectorAll('button,input,summary,[href]')].filter(el=>!el.disabled&&el.offsetParent!==null);
      const first=items[0],last=items.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
    }return;
  }
  if(e.key==='Escape'&&state.active){e.preventDefault();closeStudy();return}
  if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;
  if(!state.active?.queue.length)return;
  if((e.key===' '||e.key==='Spacebar')&&!state.active.revealed){e.preventDefault();reveal()}
  else if(state.active.revealed&&['1','2','3'].includes(e.key)){e.preventDefault();rate({1:'again',2:'hard',3:'known'}[e.key])}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ensureToday()){renderStudy();renderMap();renderDrawer();toast('新的一天，新的航线已经准备好了。')}});
window.addEventListener('storage',e=>{
  if(e.key!==KEY||!e.newValue||e.newValue===rawAtRead||writesBlocked)return;
  try{state=merge(validate(JSON.parse(e.newValue)),state);rawAtRead=e.newValue;if(state.active&&!state.active.practice)state.active.queue=state.active.queue.filter(id=>!day().completed.includes(id));renderStudy();renderMap();renderDrawer()}
  catch(error){damagedRaw=e.newValue;writesBlocked=true;storageProblem='damaged';renderStorage()}
});
load();ensureToday();renderMap();renderStudy();
})();
