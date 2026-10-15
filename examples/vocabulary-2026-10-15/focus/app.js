(() => {
'use strict';
const KEY = 'co-decide-vocab-focus-v1';
const TARGET = 6;
const INTERVALS = [1, 3, 7, 14, 30];
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dateObj = s => new Date(s+'T12:00:00');
const addDays = (s,n) => { const d=dateObj(s);d.setDate(d.getDate()+n);return localDay(d); };
const validDay = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(dateObj(s).getTime()) && localDay(dateObj(s))===s;
const stampDate = s => {const d=dateObj(s);return `${d.getMonth()+1} 月 ${d.getDate()} 日`;};
const fresh = () => ({schema:1,custom:[],progress:{},sessions:{},practice:null,view:'daily',updatedAt:Date.now(),recoveries:[]});
const validText = (v,n,required=false) => typeof v==='string' && v.length<=n && (!required || v.trim().length>0);
let state=fresh(), rawOriginal='', storageMode='normal', dirty=false, today=localDay(), drawerKind='', libraryFilter='all', librarySearch='', monthCursor=today.slice(0,7), noticeTimer=0;
const builtinIds = new Set(FOCUS_WORDS.map(w=>w.id));
function allWords(s=state){return [...FOCUS_WORDS,...s.custom];}
function wordById(id){return allWords().find(w=>w.id===id);}
function validSession(s,ids){
 if(!s || !validDay(s.date) || !Array.isArray(s.ids) || !s.ids.length || s.ids.length>500 || new Set(s.ids).size!==s.ids.length || s.ids.some(id=>!ids.has(id)))return false;
 if(!Array.isArray(s.remaining)||!Array.isArray(s.completed)||!Array.isArray(s.difficult))return false;
 if([...s.remaining,...s.completed,...s.difficult].some(id=>!s.ids.includes(id)))return false;
 if(new Set(s.remaining).size!==s.remaining.length || new Set(s.completed).size!==s.completed.length || s.remaining.some(id=>s.completed.includes(id)) || s.remaining.length+s.completed.length!==s.ids.length)return false;
 return typeof s.revealed==='boolean' && Number.isFinite(s.updatedAt) && Number.isInteger(s.attempts) && s.attempts>=0 && (s.completedAt===null || (Number.isFinite(s.completedAt)&&s.remaining.length===0));
}
function validate(s){
 if(!s||s.schema!==1||!Array.isArray(s.custom)||s.custom.length>500||!s.progress||typeof s.progress!=='object'||Array.isArray(s.progress)||!s.sessions||typeof s.sessions!=='object'||Array.isArray(s.sessions))return false;
 const ids=new Set(builtinIds), names=new Set(FOCUS_WORDS.map(w=>w.word.toLowerCase()));
 for(const w of s.custom){if(!w||!validText(w.id,100,true)||ids.has(w.id)||!/^custom-/.test(w.id)||!validText(w.word,60,true)||!validText(w.meaning,100,true)||!validText(w.example,240)||!validText(w.translation,240)||!validText(w.ipa,70)||!validText(w.type,25)||names.has(w.word.toLowerCase()))return false;ids.add(w.id);names.add(w.word.toLowerCase());}
 for(const [id,p] of Object.entries(s.progress)){if(!ids.has(id)||!p||!Number.isInteger(p.step)||p.step<0||p.step>5||!Number.isInteger(p.misses)||p.misses<0||!validDay(p.due)||!(p.lastLearned===null||validDay(p.lastLearned))||!Number.isFinite(p.updatedAt))return false;}
 for(const [day,sess] of Object.entries(s.sessions)){if(!validDay(day)||!validSession(sess,ids)||sess.date!==day)return false;}
 if(s.practice!==null && !validSession(s.practice,ids))return false;
 if(s.view!=='daily'&&s.view!=='practice')return false;
 if(s.recoveries!==undefined && (!Array.isArray(s.recoveries)||s.recoveries.some(r=>!r||typeof r.raw!=='string'||!Number.isFinite(r.savedAt))))return false;
 return Number.isFinite(s.updatedAt);
}
try{rawOriginal=localStorage.getItem(KEY)||'';if(rawOriginal){const parsed=JSON.parse(rawOriginal);if(!validate(parsed))throw new Error('invalid data');state=parsed;}}catch(e){storageMode=rawOriginal?'corrupt':'unavailable';}
function download(text,name,type='application/json'){
 const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function exportBackup(){download(JSON.stringify({app:'静读',format:'co-decide-vocab-focus-v1',exportedAt:new Date().toISOString(),data:state},null,2),`静读备份-${localDay()}.json`);}
function renderSaveAlert(){
 const alert=$('#save-alert');alert.hidden=!dirty&&storageMode==='normal';
 if(alert.hidden){$('#local-state').textContent='进度自动保存在此浏览器';return;}
 $('#local-state').textContent='本页有尚未保存的进度';
 alert.innerHTML=storageMode==='corrupt'?'<span>上次记录暂时读不到，原记录没有被覆盖。本次学习暂存在此页，刷新前请下载备份。</span><button id="raw-download">下载原始记录</button><button id="temp-export">下载本页备份</button>':'<span>本次进度暂未保存，仍保留在此页。刷新前请重试保存或下载备份。</span><button id="save-retry">重试保存</button><button id="temp-export">下载备份</button>';
 if($('#raw-download'))$('#raw-download').onclick=()=>download(rawOriginal,`静读原始记录-${localDay()}.txt`,'text/plain');
 if($('#save-retry'))$('#save-retry').onclick=()=>{persist();render();};
 $('#temp-export').onclick=exportBackup;
}
function persist(){
 state.updatedAt=Date.now();
 if(storageMode==='corrupt'){dirty=true;renderSaveAlert();return false;}
 try{localStorage.setItem(KEY,JSON.stringify(state));storageMode='normal';dirty=false;renderSaveAlert();return true;}catch(e){storageMode='unavailable';dirty=true;renderSaveAlert();return false;}
}
function createSession(ids,kind='daily'){
 return {date:today,kind,ids:[...ids],remaining:[...ids],completed:[],difficult:[],revealed:false,attempts:0,completedAt:null,updatedAt:Date.now()};
}
function chooseDaily(){
 const words=allWords(),due=words.filter(w=>state.progress[w.id]&&state.progress[w.id].due<=today).sort((a,b)=>state.progress[a.id].due.localeCompare(state.progress[b.id].due));
 const unseen=words.filter(w=>!state.progress[w.id]);
 const picked=[...due,...unseen].slice(0,TARGET);
 if(picked.length<TARGET){const ids=new Set(picked.map(w=>w.id));const familiar=words.filter(w=>!ids.has(w.id)).sort((a,b)=>(state.progress[a.id]?.due||today).localeCompare(state.progress[b.id]?.due||today));picked.push(...familiar.slice(0,TARGET-picked.length));}
 return picked.map(w=>w.id);
}
function ensureToday(){
 const previous=today,current=localDay();if(current!==today){today=current;state.view='daily';state.practice=null;monthCursor=today.slice(0,7);}
 if(!state.sessions[today]){state.sessions[today]=createSession(chooseDaily());persist();}
 if(state.practice?.date!==today){state.practice=null;state.view='daily';}
 return previous!==today;
}
function activeSession(){return state.view==='practice'&&state.practice?state.practice:state.sessions[today];}
function say(message){clearTimeout(noticeTimer);$('#notice').textContent=message;}
function art(scene){
 const drawings={
 sea:'<path d="M8 49h264M25 57h76m80 0h65M59 46l27-29 27 29M72 32h28m60 15V7m0 0 33 33h-33m-10 7h50l-11 9h-28l-11-9Z"/><circle cx="223" cy="19" r="10"/>',
 tree:'<path d="M8 50h264M29 58h57m113 0h44M85 49V14m0 4-17 15m17-7 18 12M159 49V9m0 13-23 13m23-17 21 13"/><path d="M64 29Q46 9 64 7q1-15 16-4 20-12 24 6 22 7 9 24M134 29q-16-21 3-22 11-17 27-3 20-2 20 17 17 8 4 15"/><circle cx="230" cy="17" r="9"/>',
 hill:'<path d="M8 50h264M28 58h49m106 0h59M30 50 91 8l55 42M112 25l33-22 62 47M71 22l21 14 16-15M136 10l10 12 12-10"/><path d="m125 50 17-8-7-9 15-9m66 25 11-18 16 18"/><circle cx="238" cy="13" r="8"/>',
 sun:'<path d="M8 49h264M31 57h74m75 0h64M48 49q20-22 40 0m113 0q18-17 36 0"/><circle cx="144" cy="25" r="17"/><path d="M144 2v-4m0 49v-4m-24-18h-6m54 0h6m-47-17-5-5m39 39 5 5m-5-39 5-5m-39 39-5 5"/>'
 };return `<svg class="landscape" viewBox="0 0 280 64" fill="none" stroke="currentColor" stroke-width="1.35" aria-hidden="true">${drawings[scene]||drawings.sea}</svg>`;
}
function renderRail(){
 const d=dateObj(today);$('#date').innerHTML=`<span class="month">${d.getMonth()+1} 月</span><strong>${d.getDate()}</strong><span>星期${'日一二三四五六'[d.getDay()]}</span>`;
 const start=addDays(today,-((d.getDay()+6)%7));$('#week').innerHTML=Array.from({length:7},(_,i)=>{const day=addDays(start,i),checked=Boolean(state.sessions[day]?.completedAt);return `<div class="week-day${day===today?' current':''}${checked?' checked':''}" title="${stampDate(day)}${checked?'，已打卡':''}"><span>${'一二三四五六日'[i]}</span><i></i></div>`;}).join('');
 $('#week-title').textContent=state.sessions[today]?.completedAt?'今天的打卡，已留下。':'本周 · 今天尚未打卡';
}
function renderWord(session){
 const word=wordById(session.remaining[0]);if(!word)return;
 const p=state.progress[word.id],isReview=Boolean(p&&p.lastLearned),practice=state.view==='practice';
 const hasAgain=session.difficult.includes(word.id),size=word.word.length>14?' very-long':word.word.length>8?' long':'';
 $('#reading').innerHTML=`<p class="question">先想想，它是什么意思？</p><div class="word-label"><span>${practice?'自由温习':isReview?'复习词':'新词'}</span>${hasAgain?'<span>再见一次</span>':''}</div><h1 class="word${size}" id="current-word">${esc(word.word)}</h1><div class="ipa">${esc(word.ipa)}<small>${esc(word.type)}</small></div>${art(word.scene)}<div class="answer${session.revealed?' open':''}" ${session.revealed?'':'aria-hidden="true"'}><h2>${esc(word.meaning)}</h2>${word.example?`<p class="example">${esc(word.example)}</p>`:''}${word.translation?`<p class="translation">${esc(word.translation)}</p>`:''}</div><div class="actions">${session.revealed?'<button class="secondary" id="again">还想再练</button><button class="primary" id="known">记住了</button>':'<button class="primary" id="reveal">看看词义</button>'}</div><p class="word-hint">${practice?'温习不会重复增加今天的打卡。':'不熟悉的词会留在这一组，等会儿再见。'}</p>`;
 if($('#reveal'))$('#reveal').onclick=reveal;
 if($('#again'))$('#again').onclick=()=>rate(false);
 if($('#known'))$('#known').onclick=()=>rate(true);
}
function renderComplete(session){
 const practice=state.view==='practice';const learned=session.ids.map(wordById).filter(Boolean);
 const difficult=session.difficult.length;
 $('#reading').innerHTML=`<h1 class="end-title">${practice?'又熟悉了一点。':'今天，也记住了一点。'}</h1><p class="end-copy">${practice?`这一轮温习的 ${learned.length} 个词，已经全部走过。`:`今天的 ${learned.length} 个词，已经全部完成。<br>今日打卡${dirty?'暂存在此页':'已为你记下'}。`}</p><div class="seal"><strong>${practice?'温习完成':'已打卡'}</strong><span>${stampDate(today)}</span></div><div class="end-words">${learned.map(w=>`<div>${esc(w.word)}<small>${esc(w.meaning)}</small></div>`).join('')}</div><p class="end-details">${difficult?`${difficult} 个词多练了一次，明天会优先复习。`:'今天记住的词，会在之后的学习中再见。'}</p><div class="actions">${practice?'<button class="primary" id="back-daily">回到今日打卡</button>':`<button class="secondary" id="review-today">再看今天的词</button>${difficult?'<button class="primary" id="review-hard">再练易忘词</button>':''}`}</div>${!practice?'<button class="text-button" id="view-records">看看学习足迹</button>':''}`;
 if($('#back-daily'))$('#back-daily').onclick=goDaily;
 if($('#review-today'))$('#review-today').onclick=()=>startPractice(session.ids);
 if($('#review-hard'))$('#review-hard').onclick=()=>startPractice(session.difficult);
 if($('#view-records'))$('#view-records').onclick=()=>openDrawer('records');
}
function render(){
 ensureToday();renderRail();const session=activeSession(),practice=state.view==='practice';
 $('#position').textContent=`${practice?'温习':'今日'} ${session.ids.length} 词 · 已记住 ${session.completed.length} 词`;
 $('#fill').style.width=(session.completed.length/session.ids.length*100)+'%';
 if(session.completedAt)renderComplete(session);else renderWord(session);
 $('#notice').textContent=session.completedAt?(practice?'每一次回来，都是一次巩固。':'明天再见。今天的努力已经留下。'):(practice?'按自己的节奏温习，今天的打卡已经保留。':'先回忆，再看答案。完成今天的词，打卡就会自然发生。');
 $('.keyboard-help').hidden=Boolean(session.completedAt);renderSaveAlert();
}
function reveal(){
 if(ensureToday()){render();say('新的一天开始了，今天这一组已为你准备好。');return;}const session=activeSession();if(session.completedAt||session.revealed)return;
 session.revealed=true;session.updatedAt=Date.now();persist();
 const answer=$('.answer');answer.removeAttribute('aria-hidden');answer.classList.add('open');
 $('.actions').innerHTML='<button class="secondary" id="again">还想再练</button><button class="primary" id="known">记住了</button>';
 $('#again').onclick=()=>rate(false);$('#known').onclick=()=>rate(true);$('#known').focus({preventScroll:true});
}
function rate(known){
 if(ensureToday()){render();say('新的一天开始了，请先回忆今天的第一个词。');return;}const session=activeSession();if(!session.revealed||session.completedAt||!session.remaining.length)return;
 const id=session.remaining.shift(),now=Date.now();session.revealed=false;session.attempts++;session.updatedAt=now;
 const old=state.progress[id]||{step:0,misses:0,lastLearned:null,due:today,updatedAt:now};
 if(known){session.completed.push(id);if(old.lastLearned!==today){old.step=Math.min(old.step+1,5);old.lastLearned=today;old.due=addDays(today,INTERVALS[Math.max(0,old.step-1)]);}if(session.difficult.includes(id)){old.step=1;old.lastLearned=today;old.due=addDays(today,1);}old.updatedAt=now;state.progress[id]=old;
 }else{session.remaining.push(id);if(!session.difficult.includes(id))session.difficult.push(id);old.misses++;old.step=0;old.due=today;old.updatedAt=now;state.progress[id]=old;}
 if(!session.remaining.length)session.completedAt=now;
 persist();render();const read=$('#reading');read.classList.remove('swap');void read.offsetWidth;read.classList.add('swap');
 if(!known)say(session.remaining.length===1?'只剩这个词了。再回想一次，记住后今天就完成了。':'这个词先留在本轮，等会儿再回想一次。');
 if($('#reveal'))$('#reveal').focus({preventScroll:true});
}
function startPractice(ids){
 const unique=[...new Set(ids)].filter(wordById);if(!unique.length)return;
 state.practice=createSession(unique,'practice');state.view='practice';persist();closeDrawer();render();window.scrollTo({top:0,behavior:'instant'});
}
function goDaily(){state.view='daily';persist();closeDrawer();render();}
let drawerOpener=null;
function openDrawer(kind){
 drawerKind=kind;drawerOpener=document.activeElement;$('#drawer-title').textContent=kind==='library'?'词库':kind==='records'?'学习足迹':'今天这一组';
 if(kind==='library')renderLibrary();else if(kind==='records')renderRecords();else renderToday();
 if(!$('#drawer').open)$('#drawer').showModal();$('#drawer').scrollTop=0;$('#drawer-close').focus({preventScroll:true});
}
function closeDrawer(){if($('#drawer').open)$('#drawer').close();}
$('#drawer').addEventListener('close',()=>{drawerKind='';if(drawerOpener?.isConnected)drawerOpener.focus({preventScroll:true});});
$('#drawer').addEventListener('click',e=>{if(e.target===$('#drawer')&&e.clientX<$('#drawer').getBoundingClientRect().left)closeDrawer();});
$('#drawer-close').onclick=closeDrawer;
$('#home').onclick=goDaily;
$('#library-open').onclick=()=>openDrawer('library');
$('#records-open').onclick=()=>openDrawer('records');
$('#today-overview').onclick=()=>openDrawer('today');
function renderToday(){
 const session=state.sessions[today];$('#drawer-body').innerHTML=`<p class="section-intro">${stampDate(today)}，${session.ids.length} 个词。优先复习到期的词，再遇见新词；不熟悉的词会回到本轮末尾。</p>${session.ids.map(id=>{const w=wordById(id),done=session.completed.includes(id);return `<div class="today-row${done?' done':''}"><div><strong>${esc(w.word)}</strong><p>${done?esc(w.meaning):'先留一点回忆的空间'}</p></div><span>${done?'✓ 已记住':session.difficult.includes(id)?'还要再练':'等待回忆'}</span></div>`}).join('')}<div class="drawer-bottom"><button class="primary" id="continue-today">${session.completedAt?'回到今日打卡':'继续今日学习'}</button></div>`;$('#continue-today').onclick=goDaily;
}
function statusText(w){const p=state.progress[w.id];if(!p)return '还未开始';if(!p.lastLearned)return '本轮还需回练';if(p.due<=today)return '今天待复习';return `${stampDate(p.due)} 再见`;}
function renderLibrary(){
 $('#drawer-body').innerHTML=`<p class="section-intro">内置 ${FOCUS_WORDS.length} 个示例词，适合先建立每天的小习惯。也可以慢慢加入自己的词。今天这一组固定为 ${state.sessions[today].ids.length} 个词，自添词会进入之后的学习。</p><button class="add-toggle" id="add-toggle" aria-expanded="false">＋ 加入自己的词</button><form class="add-form" id="add-form" hidden><label>英文单词<input id="add-word" name="word" required maxlength="60" autocomplete="off" placeholder="例如：serene"></label><label>中文词义<input id="add-meaning" name="meaning" required maxlength="100" placeholder="例如：宁静的；安详的"></label><label>英文例句（选填）<textarea id="add-example" name="example" maxlength="240" placeholder="一句你自己能理解的例句"></textarea></label><label>例句中文（选填）<input id="add-translation" name="translation" maxlength="240"></label><p class="form-note">只需单词和词义就能加入。请自行核对输入内容。</p><button class="primary" id="add-submit" type="submit">加入词库</button><p class="form-status" id="add-status" role="status"></p></form><p class="form-status" id="library-message" role="status"></p><input class="search" id="word-search" type="search" placeholder="找一个词，或搜索中文词义" aria-label="搜索词库" value="${esc(librarySearch)}"><div class="filters" role="group" aria-label="筛选词库">${[['all','全部'],['due','待复习'],['new','未开始'],['custom','自添词']].map(([id,label])=>`<button class="chip${libraryFilter===id?' active':''}" data-filter="${id}" aria-pressed="${libraryFilter===id}">${label}</button>`).join('')}</div><div id="library-list" class="library-list"></div>`;
 $('#add-toggle').onclick=()=>{const hidden=$('#add-form').hidden;$('#add-form').hidden=!hidden;$('#add-toggle').setAttribute('aria-expanded',hidden);if(hidden)$('#add-word').focus();};
 $('#add-form').onsubmit=addWord;
 $('#word-search').oninput=e=>{librarySearch=e.target.value;renderLibraryList();};
 document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{libraryFilter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',x===b)});renderLibraryList();});
 renderLibraryList();
}
function renderLibraryList(){
 const query=librarySearch.trim().toLowerCase();const filtered=allWords().filter(w=>{const p=state.progress[w.id];return (!query||`${w.word} ${w.meaning}`.toLowerCase().includes(query))&&(libraryFilter==='all'||libraryFilter==='due'&&p&&p.due<=today||libraryFilter==='new'&&!p||libraryFilter==='custom'&&w.source==='自添词');});
 $('#library-list').innerHTML=filtered.length?filtered.map(w=>`<div class="library-row"><div><strong>${esc(w.word)}</strong><small>${esc(w.source)}</small><p>${esc(w.meaning)}<br>${esc(statusText(w))}</p></div><button data-practice="${esc(w.id)}" aria-label="温习 ${esc(w.word)}">温习</button></div>`).join(''):'<p class="empty">这里暂时没有词。换个搜索词，或加入一个自己的词。</p>';
 document.querySelectorAll('[data-practice]').forEach(b=>b.onclick=()=>startPractice([b.dataset.practice]));
}
function addWord(event){
 event.preventDefault();const form=new FormData(event.target),word=String(form.get('word')).trim(),meaning=String(form.get('meaning')).trim(),example=String(form.get('example')).trim(),translation=String(form.get('translation')).trim();const status=$('#add-status');status.classList.add('error');
 if(!/^[a-zA-Z][a-zA-Z '\-]{0,59}$/.test(word)){status.textContent='单词请使用英文字母，可含空格、短横线和撇号，最多 60 个字符。';return;}
 if(!meaning||meaning.length>100){status.textContent='请填写 1 到 100 个字的词义。';return;}
 if(allWords().some(w=>w.word.toLowerCase()===word.toLowerCase())){status.textContent='这个词已经在词库里，可以直接搜索并温习。';return;}
 if(state.custom.length>=500){status.textContent='自添词已达 500 个，请先下载一份备份。';return;}
 const id='custom-'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2));state.custom.push({id,word,meaning,example,translation,ipa:'',type:'',scene:'sea',source:'自添词',updatedAt:Date.now()});const saved=persist();event.target.reset();status.classList.remove('error');status.textContent=saved?'已经加入词库。可以现在温习，也会进入之后的学习。':'已经加入本页，尚未保存。请按页顶提示保存或下载备份。';librarySearch='';$('#word-search').value='';renderLibraryList();
}
function completedDays(){return Object.keys(state.sessions).filter(day=>state.sessions[day].completedAt).sort();}
function currentStreak(){const set=new Set(completedDays());let day=set.has(today)?today:addDays(today,-1),count=0;while(set.has(day)){count++;day=addDays(day,-1);}return count;}
function renderRecords(){
 const days=completedDays(),count=Object.values(state.progress).filter(p=>p.lastLearned).length;
 $('#drawer-body').innerHTML=`<p class="section-intro">每次完整走过今天这一组，就留下一天的足迹。多练几轮，也只算一次当天打卡。</p><div class="stats"><div><strong>${days.length}</strong><span>累计打卡 / 天</span></div><div><strong>${currentStreak()}</strong><span>连续打卡 / 天</span></div><div><strong>${count}</strong><span>已经遇见 / 词</span></div></div><div class="month-heading"><button id="prev-month" aria-label="上个月">‹</button><h3 id="month-name"></h3><button id="next-month" aria-label="下个月">›</button></div><div class="calendar" id="calendar"></div><p class="cal-note">深蓝圆点是已完成的日子，细圆圈是今天。没有完成的日子保持空白。</p><section class="history-list"><h3>最近留下的日子</h3>${days.length?days.slice(-14).reverse().map(day=>`<div class="history-row"><span>${stampDate(day)}</span><small>${state.sessions[day].ids.length} 词完成${state.sessions[day].difficult.length?` · ${state.sessions[day].difficult.length} 词回练`:''}</small></div>`).join(''):'<p class="empty">今天的第一枚印记，还在等你。完成这一组词，它就会出现在这里。</p>'}</section><section class="backup"><h3>留一份自己的备份</h3><p>学习记录和自添词保存在当前浏览器。换浏览器、清理浏览数据或换电脑前，下载一份备份；之后可恢复合并，已有记录不会因为备份里没有而被清空。</p><div class="backup-actions"><button id="export">下载备份</button><button id="restore">恢复备份</button></div><p class="form-status" id="backup-status" role="status"></p></section>`;
 $('#export').onclick=exportBackup;$('#restore').onclick=()=>$('#import-file').click();
 $('#prev-month').onclick=()=>moveMonth(-1);$('#next-month').onclick=()=>moveMonth(1);renderCalendar();
}
function moveMonth(n){const d=dateObj(monthCursor+'-01');d.setMonth(d.getMonth()+n);monthCursor=localDay(d).slice(0,7);renderCalendar();}
function renderCalendar(){
 const first=dateObj(monthCursor+'-01'),length=new Date(first.getFullYear(),first.getMonth()+1,0).getDate(),offset=(first.getDay()+6)%7;$('#month-name').textContent=`${first.getFullYear()} 年 ${first.getMonth()+1} 月`;
 $('#calendar').innerHTML=[...'一二三四五六日'].map(n=>`<span class="cal-label">${n}</span>`).join('')+Array.from({length:offset},()=>'<span class="cal-day blank"></span>').join('')+Array.from({length},(_,i)=>{const day=monthCursor+'-'+String(i+1).padStart(2,'0'),checked=Boolean(state.sessions[day]?.completedAt);return `<span class="cal-day${checked?' checked':''}${day===today?' today':''}" title="${stampDate(day)}${checked?'，已打卡':''}" aria-label="${stampDate(day)}${checked?'，已打卡':''}">${i+1}</span>`;}).join('');
}
function remapSession(sess,map){const s=clone(sess);for(const key of ['ids','remaining','completed','difficult'])s[key]=[...new Set(s[key].map(id=>map[id]||id))];s.remaining=s.remaining.filter(id=>!s.completed.includes(id));if(!s.remaining.length&&!s.completedAt)s.completedAt=s.updatedAt;return s;}
function mergeSession(a,b){
 if(!a)return b;if(!b)return a;if(a.completedAt&&!b.completedAt)return a;if(b.completedAt&&!a.completedAt)return b;
 if(a.ids.length===b.ids.length&&a.ids.every(id=>b.ids.includes(id))){const newest=a.updatedAt>=b.updatedAt?a:b,merged=clone(newest);merged.completed=[...new Set([...a.completed,...b.completed])];merged.difficult=[...new Set([...a.difficult,...b.difficult])];merged.remaining=newest.remaining.filter(id=>!merged.completed.includes(id));for(const id of merged.ids)if(!merged.completed.includes(id)&&!merged.remaining.includes(id))merged.remaining.push(id);if(!merged.remaining.length)merged.completedAt=Math.max(a.completedAt||0,b.completedAt||0,a.updatedAt,b.updatedAt);merged.revealed=false;return merged;}
 return a.updatedAt>=b.updatedAt?a:b;
}
function mergeStates(current,incoming){
 const result=clone(current),map={},byName=new Map(allWords(result).map(w=>[w.word.toLowerCase(),w.id]));
 for(const w of incoming.custom){const existing=byName.get(w.word.toLowerCase());if(existing){map[w.id]=existing;const index=result.custom.findIndex(x=>x.id===existing);if(index>=0&&(w.updatedAt||0)>(result.custom[index].updatedAt||0))result.custom[index]={...clone(w),id:existing};}else{result.custom.push(clone(w));byName.set(w.word.toLowerCase(),w.id);}}
 for(const [id,p] of Object.entries(incoming.progress)){const mapped=map[id]||id;if(!result.progress[mapped]||p.updatedAt>result.progress[mapped].updatedAt)result.progress[mapped]=clone(p);}
 for(const [day,sess] of Object.entries(incoming.sessions))result.sessions[day]=mergeSession(result.sessions[day],remapSession(sess,map));
 if(incoming.practice&&(!result.practice||incoming.practice.updatedAt>result.practice.updatedAt)){result.practice=remapSession(incoming.practice,map);if(incoming.view==='practice'&&incoming.practice.date===today)result.view='practice';}
 result.recoveries=[...(result.recoveries||[]),...(incoming.recoveries||[])];result.updatedAt=Date.now();return result;
}
$('#import-file').onchange=async event=>{
 const file=event.target.files[0];event.target.value='';if(!file)return;let message='';
 try{if(file.size>2*1024*1024)throw new Error('备份文件超过 2 MB，请选择静读导出的文件。');const parsed=JSON.parse(await file.text());if(parsed.format!=='co-decide-vocab-focus-v1'||!validate(parsed.data))throw new Error('这不是有效的静读备份，现有记录没有改变。');
 const next=mergeStates(state,parsed.data);if(next.custom.length>500||!validate(next))throw new Error('合并后的词库超出范围，现有记录没有改变。');
 if(storageMode==='corrupt'&&rawOriginal)next.recoveries.push({raw:rawOriginal,savedAt:Date.now()});state=next;storageMode='normal';const saved=persist();ensureToday();render();message=saved?'备份已合并。自添词、已完成的日子和较新的进度都已保留。':'备份已合并到本页，但还未保存，请按页顶提示下载备份或重试。';
 }catch(e){message=e instanceof SyntaxError?'备份文件无法读取，现有记录没有改变。':e.message;}
 if(drawerKind==='records'){renderRecords();$('#backup-status').textContent=message;}
};
document.addEventListener('keydown',event=>{
 if($('#drawer').open||event.ctrlKey||event.altKey||event.metaKey||event.repeat||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
 const session=activeSession();if(session.completedAt)return;
 if(event.code==='Space'&&event.target.tagName!=='BUTTON'&&!session.revealed){event.preventDefault();reveal();}
 if(session.revealed&&event.key==='1'){event.preventDefault();rate(false);}else if(session.revealed&&event.key==='2'){event.preventDefault();rate(true);}
});
window.addEventListener('storage',event=>{if(event.key!==KEY||!event.newValue||dirty)return;try{const incoming=JSON.parse(event.newValue);if(validate(incoming)){state=mergeStates(state,incoming);render();say('另一窗口的学习进度已同步。');if(drawerKind==='records')renderRecords();}}catch(e){/* Keep the current valid page state. */}});
function checkDate(){if(localDay()!==today){ensureToday();render();if($('#drawer').open)openDrawer(drawerKind);}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkDate();});window.addEventListener('focus',checkDate);
ensureToday();render();
})();
