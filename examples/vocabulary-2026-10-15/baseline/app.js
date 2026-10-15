(() => {
  'use strict';
  const KEY = 'shici.v1.local';
  const VERSION = 1;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const parseDate = (key) => new Date(`${key}T12:00:00`);
  const shiftDate = (key, days) => { const d = parseDate(key); d.setDate(d.getDate()+days); return localDate(d); };
  const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(+parseDate(s)) && localDate(parseDate(s)) === s;
  const categories = ['日常生活','工作学习','情绪表达','旅行出行','人与关系','思考成长'];
  const source = [
    ['日常生活', `habit|n.|习惯|A small habit can make a big difference.
routine|n.|日常安排；惯例|Reading is part of my morning routine.
cozy|adj.|舒适温暖的|This little room feels cozy in winter.
prepare|v.|准备|I prepare lunch before I leave home.
borrow|v.|借入|May I borrow your umbrella?
repair|v.|修理|We need to repair the old chair.
grocery|n.|食品杂货|There is a grocery store near my home.
recipe|n.|食谱；方法|This recipe needs only three ingredients.
tidy|adj.|整洁的|I like to keep my desk tidy.
fresh|adj.|新鲜的；清新的|Let's get some fresh air.
quiet|adj.|安静的|The street is quiet early in the morning.
balance|n./v.|平衡；使平衡|She tries to balance work and rest.`],
    ['工作学习', `focus|v./n.|集中注意力；重点|I focus better in a quiet room.
achieve|v.|实现；达到|We can achieve more by working together.
deadline|n.|截止日期|The deadline for the report is Friday.
improve|v.|改善；提高|Practice will improve your speaking skills.
organize|v.|组织；整理|Let's organize our notes before the meeting.
review|v./n.|复习；审查|I review new words every evening.
explain|v.|解释|Could you explain the first step?
purpose|n.|目的|What is the purpose of this exercise?
effort|n.|努力|Your effort will make a difference.
feedback|n.|反馈|Helpful feedback makes learning easier.
solution|n.|解决办法|We found a simple solution to the problem.
progress|n./v.|进步；进展|Small steps lead to steady progress.`],
    ['情绪表达', `grateful|adj.|感激的|I am grateful for your help.
curious|adj.|好奇的|Children are curious about the world.
relieved|adj.|如释重负的|I felt relieved when the exam was over.
confident|adj.|自信的|She sounds more confident than before.
patient|adj./n.|耐心的；病人|Be patient with yourself when learning.
nervous|adj.|紧张的|I was nervous before my first speech.
delighted|adj.|高兴的|We were delighted to hear the good news.
disappointed|adj.|失望的|He was disappointed with the result.
hopeful|adj.|抱有希望的|I feel hopeful about the coming year.
calm|adj./v.|平静的；使平静|Take a deep breath and stay calm.
proud|adj.|自豪的|You can be proud of your progress.
anxious|adj.|焦虑的；渴望的|She felt anxious about the long journey.`],
    ['旅行出行', `journey|n.|旅行；旅程|Every journey begins with a first step.
destination|n.|目的地|Our final destination is a small seaside town.
departure|n.|出发；离开|Please arrive an hour before departure.
arrival|n.|到达|We had a warm meal on arrival.
explore|v.|探索|We spent the afternoon exploring the city.
scenery|n.|风景|The mountain scenery was beautiful.
reserve|v.|预订；保留|I'd like to reserve a room for two nights.
luggage|n.|行李|Please keep your luggage with you.
platform|n.|站台；平台|The train leaves from platform three.
direction|n.|方向；指示|Are we walking in the right direction?
nearby|adj./adv.|附近的；在附近|There is a quiet park nearby.
souvenir|n.|纪念品|I bought a postcard as a souvenir.`],
    ['人与关系', `support|v./n.|支持|Friends support each other in difficult times.
trust|v./n.|信任|Trust grows through honest conversations.
respect|v./n.|尊重|We should respect different opinions.
share|v.|分享|Would you like to share your idea?
encourage|v.|鼓励|My teacher encouraged me to try again.
promise|n./v.|承诺；答应|I made a promise to call her tomorrow.
invite|v.|邀请|We invited our neighbors to dinner.
neighbor|n.|邻居|Our neighbor has a friendly dog.
companion|n.|同伴|A good book can be a wonderful companion.
generous|adj.|慷慨的|It was generous of you to offer help.
honest|adj.|诚实的|An honest answer is always helpful.
apologize|v.|道歉|I called to apologize for being late.`],
    ['思考成长', `discover|v.|发现|You may discover something new today.
consider|v.|考虑|Please consider all the options carefully.
reflect|v.|反思；反映|Take a moment to reflect on your day.
adapt|v.|适应；改编|It takes time to adapt to a new place.
persist|v.|坚持|If you persist, the task will become easier.
attempt|n./v.|尝试|My first attempt was not perfect.
challenge|n./v.|挑战|Learning a language is a rewarding challenge.
opportunity|n.|机会|Every mistake is an opportunity to learn.
potential|n./adj.|潜力；潜在的|You have the potential to do great things.
perspective|n.|观点；视角|Travel can give us a new perspective.
gradually|adv.|逐渐地|The weather gradually became warmer.
worthwhile|adj.|值得做的|A short daily review is worthwhile.`]
  ];
  const builtin = source.flatMap(([category, rows]) => rows.split('\n').map(row => {const [word,pos,meaning,example] = row.split('|'); return {id:`base-${word}`,word,pos,meaning,example,category,updatedAt:0};}));
  const defaultState = () => ({version:VERSION, revision:0, updatedAt:Date.now(), settings:{goal:10,showExample:true}, customWords:[], progress:{}, days:{}});
  let state, damagedRaw = null, storageUnavailable = false, page = 'today', session = null;
  let today = localDate(), calendarMonth = new Date(new Date().getFullYear(),new Date().getMonth(),1), selectedDay = today, toastTimer;
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const int = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  const stamp = n => Number.isFinite(n) && n >= 0 && n <= 8640000000000000;
  const string = (s,max,required=false) => typeof s === 'string' && s.length <= max && (!required || s.trim().length>0);
  const wordId = s => typeof s === 'string' && /^(base-[a-z]+|user-[a-zA-Z0-9-]+)$/.test(s) && s.length<100;
  function normalize(raw) {
    if (!object(raw) || raw.version !== VERSION || !object(raw.settings) || !int(raw.settings.goal,1,100) || typeof raw.settings.showExample !== 'boolean' || !Array.isArray(raw.customWords) || !object(raw.progress) || !object(raw.days)) throw new Error('备份格式或版本不匹配。');
    if (raw.customWords.length>10000 || Object.keys(raw.progress).length>11000 || Object.keys(raw.days).length>20000) throw new Error('备份记录过多，无法安全读取。');
    const out = defaultState(); out.settings={goal:raw.settings.goal,showExample:raw.settings.showExample}; out.revision=int(raw.revision,0,Number.MAX_SAFE_INTEGER)?raw.revision:0;
    out.updatedAt=stamp(raw.updatedAt)?raw.updatedAt:0;
    const ids = new Set(), names = new Set();
    out.customWords = raw.customWords.map(w => {
      if (!object(w)||!wordId(w.id)||!w.id.startsWith('user-')||!string(w.word,80,true)||!string(w.meaning,300,true)||!string(w.pos,30)||!string(w.example,600)||!string(w.category,40,true)||!stamp(w.updatedAt)||ids.has(w.id)||names.has(w.word.trim().toLowerCase())) throw new Error('自定义单词格式有误或存在重复。');
      ids.add(w.id); names.add(w.word.trim().toLowerCase());
      return {id:w.id,word:w.word.trim(),pos:w.pos,meaning:w.meaning.trim(),example:w.example,category:w.category,updatedAt:w.updatedAt};
    });
    for (const [id,p] of Object.entries(raw.progress)) {
      if (!wordId(id)||!object(p)||!int(p.stage,0,100000)||!int(p.interval,0,365)||!validDate(p.due)||!validDate(p.lastStudied)||!stamp(p.updatedAt)||!int(p.reviews,1,1000000)) throw new Error('学习进度格式有误。');
      out.progress[id]={stage:p.stage,interval:p.interval,due:p.due,lastStudied:p.lastStudied,updatedAt:p.updatedAt,reviews:p.reviews};
    }
    for (const [key,d] of Object.entries(raw.days)) {
      if (!validDate(key)||!object(d)||!int(d.goal,1,100)||!Array.isArray(d.doneIds)||d.doneIds.length>11000||!d.doneIds.every(wordId)||!(d.checkedInAt===null||stamp(d.checkedInAt))||!stamp(d.updatedAt)) throw new Error('打卡记录格式有误。');
      const doneIds=[...new Set(d.doneIds)];
      if(d.checkedInAt!==null&&doneIds.length<d.goal) throw new Error('打卡记录与完成数量不一致。');
      out.days[key]={goal:d.goal,doneIds,checkedInAt:d.checkedInAt,updatedAt:d.updatedAt};
    }
    return out;
  }
  try { const raw=localStorage.getItem(KEY); state=raw?normalize(JSON.parse(raw)):defaultState(); }
  catch(error) { state=defaultState(); try {damagedRaw=localStorage.getItem(KEY);}catch{storageUnavailable=true;} if(damagedRaw===null)storageUnavailable=true; }
  function notify(message) { $('toast').textContent=message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500); }
  function storageBanner() {
    const node=$('storage-warning'); node.hidden=!damagedRaw&&!storageUnavailable;
    if(damagedRaw) {node.innerHTML='检测到无法读取的本机记录，原始内容已保留。请先导出原始数据，再恢复备份或启用新记录。<button id="download-raw">导出原始数据</button><button id="fresh-start">启用新记录</button><button id="recover-backup">恢复备份</button>'; $('download-raw').onclick=()=>download(damagedRaw,`拾词-原始记录-${today}.json`); $('fresh-start').onclick=()=>confirmDialog('启用新记录','这会替换当前无法读取的本机记录。请先导出原始数据，确认后开始一份空白记录。',()=>{if(save(s=>Object.assign(s,defaultState()),{recover:true}))notify('已启用新记录');}); $('recover-backup').onclick=()=>$('backup-file').click();}
    else if(storageUnavailable){node.innerHTML='浏览器暂时无法保存记录，当前数据仅在此页面暂存。关闭前请导出备份。<button id="export-unsaved">导出当前备份</button>'; $('export-unsaved').onclick=exportData;}
  }
  function save(mutator, options={}) {
    if(damagedRaw&&!options.recover){notify('请先导出原始数据，再恢复备份或启用新记录');return false;}
    let next=structuredClone(state);
    if(!storageUnavailable&&!options.recover){
      try{const latest=localStorage.getItem(KEY);if(latest){const parsed=normalize(JSON.parse(latest)); if(parsed.revision>next.revision)next=parsed;}}
      catch{notify('本机记录发生异常，已停止写入以保护原记录');try{damagedRaw=localStorage.getItem(KEY);}catch{storageUnavailable=true;}storageBanner();return false;}
    }
    mutator(next); next.revision++;next.updatedAt=Date.now();
    try{localStorage.setItem(KEY,JSON.stringify(next));storageUnavailable=false;}catch{storageUnavailable=true;}
    state=next;if(options.recover)damagedRaw=null;storageBanner();render();return true;
  }
  const words = () => [...builtin,...state.customWords];
  const wordById = id => words().find(w=>w.id===id);
  const dayRecord = (s=state,key=today) => s.days[key]||{goal:s.settings.goal,doneIds:[],checkedInAt:null,updatedAt:0};
  const master = p => p&&p.stage>=3&&p.interval>=7;
  const dueWords = () => words().filter(w=>state.progress[w.id]&&state.progress[w.id].due<=today);
  const newWords = () => words().filter(w=>!state.progress[w.id]);
  const checkedDates = () => Object.keys(state.days).filter(k=>state.days[k].checkedInAt!==null&&k<=today).sort();
  function streak(){const dates=new Set(checkedDates());let d=dates.has(today)?today:shiftDate(today,-1), n=0;while(dates.has(d)){n++;d=shiftDate(d,-1);}return n;}
  function longestStreak(){let max=0,current=0,last=null;for(const key of checkedDates()){current=last&&shiftDate(last,1)===key?current+1:1;max=Math.max(max,current);last=key;}return max;}
  function setPage(next){page=next;document.querySelectorAll('.page').forEach(n=>n.hidden=n.id!==`page-${page}`);document.querySelectorAll('[data-page]').forEach(n=>n.classList.toggle('active',n.dataset.page===page));$('page-kicker').textContent=({today:'DAILY PRACTICE',library:'WORD COLLECTION',calendar:'SMALL STEPS, REAL GROWTH',settings:'YOUR LEARNING RHYTHM'})[page];render();window.scrollTo(0,0);}
  function render(){
    $('current-date').textContent=new Date().toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'});
    $('library-count').textContent=words().length;
    if(page==='today')renderToday();if(page==='library')renderLibrary();if(page==='calendar')renderCalendar();if(page==='settings'){$('daily-goal').value=state.settings.goal;$('show-example').checked=state.settings.showExample;}
  }
  function renderToday(){
    const d=dayRecord(), done=d.doneIds.length, checked=d.checkedInAt!==null;
    $('due-number').innerHTML=`${dueWords().length}<small>词</small>`;$('new-number').innerHTML=`${newWords().length}<small>词</small>`;$('mastered-number').innerHTML=`${words().filter(w=>master(state.progress[w.id])).length}<small>词</small>`;
    $('streak-top').textContent=streak();$('goal-done').textContent=done;$('goal-denominator').textContent=`/ ${d.goal} 词`;$('goal-ring').style.setProperty('--percent',`${Math.min(100,done/d.goal*100)}%`);
    $('goal-status').textContent=checked?'已打卡':done>=d.goal?'已达标':'进行中';$('goal-caption').textContent=checked?'今天的努力，已经留下足迹':done>=d.goal?'目标完成，给今天盖个章吧':done?`再学 ${d.goal-done} 个词，就完成今天的目标`:'从第一个单词开始吧';
    $('checkin-button').disabled=checked||done<d.goal;$('checkin-button').textContent=checked?'✓ 今日已打卡':done>=d.goal?'完成今日打卡':'完成目标后打卡';
    const weekday=(parseDate(today).getDay()+6)%7,start=shiftDate(today,-weekday);
    $('week-strip').innerHTML=Array.from({length:7},(_,i)=>{const key=shiftDate(start,i),d=dayRecord(state,key);return `<div class="week-day ${key===today?'today':''} ${d.checkedInAt!==null?'checked':''}"><span>${['周一','周二','周三','周四','周五','周六','周日'][i]}</span><b>${d.checkedInAt!==null?'✓':parseDate(key).getDate()}</b><span class="day-count">${d.doneIds.length?`${d.doneIds.length} 词`:key>today?'待续':'—'}</span></div>`;}).join('');
    renderCard();
  }
  function renderCard(){
    const area=$('learning-area');
    if(!session){const d=dayRecord(),remaining=Math.max(0,d.goal-d.doneIds.length);area.innerHTML=`<section class="word-card"><div class="card-top"><span>YOUR DAILY WORD MOMENT</span><span>今天的积累，从这里开始</span></div><div class="session-start"><div class="sprout">❧</div><h2>${d.checkedInAt!==null?'你已经把坚持，留在了今天。':'留一点时间，给更好的自己。'}</h2><p>${dueWords().length?`有 ${dueWords().length} 个词在等你复习，先和老朋友见个面。`:'从常用生活词开始，让下次表达多一种可能。'}</p><button id="start-learning" class="button">${d.checkedInAt!==null?'再学几个词':'开始今日学习'} <span>→</span></button><button id="new-only" class="text-button">只学新词</button><div class="subline">${remaining?`距离今日目标还有 ${remaining} 个词`:'今日目标已完成，继续学习由你决定'}</div></div></section>`;$('start-learning').onclick=()=>startSession('mix');$('new-only').onclick=()=>startSession('new');return;}
    if(session.index>=session.queue.length){
      area.innerHTML=`<section class="word-card session-complete"><div class="complete-icon">✓</div><h2>这一轮，认真学完了。</h2><p>你又为自己积累了 ${session.completed.size} 个单词。</p><div class="finish-status"><span>新学 ${session.newCount} 词</span><span>复习 ${session.reviewCount} 词</span></div><button class="button" id="session-again">再来一轮 →</button><button class="button secondary" id="session-done">回到今日</button></section>`;$('session-again').onclick=()=>startSession(session.mode);$('session-done').onclick=()=>{session=null;renderToday();};return;
    }
    const w=wordById(session.queue[session.index]);if(!w){session.index++;renderCard();return;}
    const shown=session.revealed;const p=state.progress[w.id];
    area.innerHTML=`<section class="word-card"><div class="session-progress"><div style="width:${session.index/session.queue.length*100}%"></div></div><div class="card-top"><span>${p?'温故 · 复习':'知新 · 新词'} <b>${session.index+1} / ${session.queue.length}</b></span><button id="end-session" class="text-button">结束本轮</button></div><div class="card-body"><span class="card-category">${esc(w.category)}</span><h2 class="english-word" lang="en">${esc(w.word)}</h2><span class="word-type">${esc(w.pos)}</span>${shown?`<div class="word-meaning">${esc(w.meaning)}</div>${state.settings.showExample&&w.example?`<p class="example" lang="en">${esc(w.example)}</p>`:''}`:'<p class="recall-hint">试着回想一下，它是什么意思？</p>'}</div><div class="card-actions">${shown?`<div class="ratings"><button class="rating-button" data-rating="0">再想想<small>本轮再见 · 1</small></button><button class="rating-button" data-rating="1">有点模糊<small>明天再见 · 2</small></button><button class="rating-button" data-rating="2">记住了<small>${nextInterval(p,2)} 天后 · 3</small></button><button class="rating-button" data-rating="3">很熟悉<small>${nextInterval(p,3)} 天后 · 4</small></button></div>`:'<button id="reveal-card" class="button reveal-button">翻开，看看答案</button><span class="key-hint">也可以按空格键翻开</span>'}</div></section>`;
    if(!shown)$('reveal-card').onclick=()=>{session.revealed=true;renderCard();};document.querySelectorAll('[data-rating]').forEach(b=>b.onclick=()=>rate(Number(b.dataset.rating)));
    $('end-session').onclick=()=>confirmDialog('结束这一轮？','已经学过的单词和今日进度都已保存。下次可以继续学习。',()=>{session=null;renderToday();},'结束本轮');
  }
  function startSession(mode){
    if(damagedRaw){notify('请先处理顶部的本机记录提醒');return;}
    const due=dueWords(),fresh=newWords();const remaining=Math.max(1,dayRecord().goal-dayRecord().doneIds.length);const limit=Math.min(20,Math.max(10,remaining));
    const picked=mode==='review'?due.slice(0,limit):mode==='new'?fresh.slice(0,limit):[...due,...fresh].slice(0,limit);
    if(!picked.length){notify(mode==='review'?'当前没有到期复习，明天再来看看':mode==='new'?'词库都学过了，可以添加自己的单词':'当前没有待学习单词，可以添加新词或到期后复习');return;}
    session={mode,queue:picked.map(w=>w.id),index:0,revealed:false,completed:new Set(),newCount:0,reviewCount:0,initialNew:new Set(picked.filter(w=>!state.progress[w.id]).map(w=>w.id)),repeats:{}};if(page!=='today')setPage('today');else renderToday();
  }
  function nextInterval(p,rating){if(rating===0)return 0;if(rating===1)return 1;if(rating===2)return Math.min(365,Math.max(1,(p?.interval||0)*2||1));return Math.min(365,Math.max(3,(p?.interval||0)*3));}
  function rate(rating){
    if(!session||!session.revealed||!int(rating,0,3))return;
    const id=session.queue[session.index],now=Date.now(),already=session.completed.has(id);const old=state.progress[id];const interval=nextInterval(old,rating);
    const ok=save(s=>{const prior=s.progress[id];s.progress[id]={stage:rating<=1?0:(prior?.stage||0)+1,interval:nextInterval(prior,rating),due:shiftDate(today,nextInterval(prior,rating)),lastStudied:today,updatedAt:now,reviews:(prior?.reviews||0)+1};const day=structuredClone(dayRecord(s));if(rating>0&&!day.doneIds.includes(id))day.doneIds.push(id);day.updatedAt=now;s.days[today]=day;});
    if(!ok)return;
    if(rating===0){if((session.repeats[id]||0)<2){session.queue.push(id);session.repeats[id]=(session.repeats[id]||0)+1;}else notify('这个词留在今日复习中，休息一下再来巩固');}
    if(rating>0&&!already){session.completed.add(id);if(session.initialNew.has(id))session.newCount++;else session.reviewCount++;}
    session.index++;session.revealed=false;renderToday();
  }
  function checkin(){const d=dayRecord();if(d.checkedInAt!==null||d.doneIds.length<d.goal)return;const ok=save(s=>{const day=structuredClone(dayRecord(s));if(day.checkedInAt===null&&day.doneIds.length>=day.goal){day.checkedInAt=Date.now();day.updatedAt=Date.now();s.days[today]=day;}});if(!ok)return;openDialog('今天，也为自己坚持了一次。',`<div class="checkin-celebrate"><div class="complete-icon">❧</div><h3>今日打卡成功</h3><p>${esc(today)} · 学习 ${dayRecord().doneIds.length} 个词<br>你已连续打卡 ${streak()} 天，每一步都算数。</p><div class="modal-actions"><button id="celebrate-done" class="button">把这份积累留住</button></div></div>`);$('celebrate-done').onclick=closeDialog;}
  function renderLibrary(){
    const category=$('category-filter'),current=category.value;const cats=[...new Set(words().map(w=>w.category))];category.innerHTML='<option value="all">全部分类</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');category.value=cats.includes(current)?current:'all';
    const q=$('word-search').value.trim().toLowerCase(),status=$('status-filter').value;
    const list=words().filter(w=>{const p=state.progress[w.id];return(!q||`${w.word} ${w.meaning} ${w.example}`.toLowerCase().includes(q))&&(category.value==='all'||w.category===category.value)&&(status==='all'||status==='new'&&!p||status==='learning'&&p&&!master(p)||status==='mastered'&&master(p));});
    $('result-count').textContent=`${list.length} 个单词`;
    $('word-list').innerHTML=list.length?list.map(w=>{const p=state.progress[w.id];return `<div class="word-row"><div><strong lang="en">${esc(w.word)}</strong><small>${esc(w.pos)} · ${esc(w.category)}</small></div><span class="meaning">${esc(w.meaning)}</span><span class="word-status">${!p?'尚未学习':master(p)?'已经掌握':p.due<=today?'等待复习':'正在巩固'}</span><button class="text-button" data-word="${esc(w.id)}">查看 ↗</button></div>`;}).join(''):'<div class="empty-state">没有找到匹配的单词，换个关键词试试。</div>';
    document.querySelectorAll('[data-word]').forEach(b=>b.onclick=()=>showWord(b.dataset.word));
  }
  function showWord(id){const w=wordById(id);if(!w)return;const p=state.progress[id];openDialog('单词小档案',`<div class="word-detail"><span class="card-category">${esc(w.category)}</span><h3 class="english-word" lang="en">${esc(w.word)}</h3><span class="word-type">${esc(w.pos)}</span><p class="word-meaning">${esc(w.meaning)}</p><p class="example" lang="en">${esc(w.example)}</p><p class="word-status">${p?`已练习 ${p.reviews} 次 · 下次复习 ${p.due}`:'尚未学习'}</p></div><div class="modal-actions">${id.startsWith('user-')?'<button id="delete-word" class="text-button danger">删除此自定义单词</button>':''}<button id="practice-word" class="button">练习这个词 →</button></div>`);$('practice-word').onclick=()=>{closeDialog();session={mode:'single',queue:[id],index:0,revealed:false,completed:new Set(),newCount:0,reviewCount:0,initialNew:new Set(p?[]:[id]),repeats:{}};setPage('today');};if($('delete-word'))$('delete-word').onclick=()=>confirmDialog('删除这个单词？','单词将从词库移除。历史学习数量与打卡足迹会保留。',()=>{save(s=>{s.customWords=s.customWords.filter(x=>x.id!==id);});notify('自定义单词已删除');},'确认删除');}
  function renderCalendar(){
    $('total-checkins').textContent=checkedDates().length;$('longest-streak').textContent=longestStreak();$('total-studied').textContent=Object.values(state.days).reduce((n,d)=>n+d.doneIds.length,0);
    $('calendar-month').textContent=`${calendarMonth.getFullYear()} 年 ${calendarMonth.getMonth()+1} 月`;
    const first=localDate(calendarMonth),offset=(calendarMonth.getDay()+6)%7,days=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,0).getDate();
    $('calendar-days').innerHTML='<span></span>'.repeat(offset)+Array.from({length:days},(_,i)=>{const key=shiftDate(first,i),d=dayRecord(state,key);return `<button class="calendar-day ${key===today?'today':''} ${key===selectedDay?'selected':''} ${d.checkedInAt!==null?'checked':d.doneIds.length?'partial':''}" data-day="${key}" ${key>today?'disabled':''} aria-label="${key}，${d.checkedInAt!==null?'已打卡':d.doneIds.length?`学习 ${d.doneIds.length} 词`:'无学习记录'}">${i+1}</button>`;}).join('');
    document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{selectedDay=b.dataset.day;renderCalendar();});
    const d=dayRecord(state,selectedDay);$('day-detail').textContent=`${selectedDay}　${d.checkedInAt!==null?'✓ 已打卡':d.doneIds.length?'有学习记录，尚未打卡':'还没有学习记录'}${d.doneIds.length?` · 完成 ${d.doneIds.length} / ${d.goal} 词`:''}`;
  }
  function openDialog(title,html){$('modal-title').textContent=title;$('modal-body').innerHTML=html;if(!$('modal').open)$('modal').showModal();}
  function closeDialog(){$('modal').close();}
  function confirmDialog(title,message,action,label='确认'){openDialog(title,`<p class="modal-body-note">${esc(message)}</p><div class="modal-actions"><button id="confirm-cancel" class="button secondary">取消</button><button id="confirm-action" class="button">${esc(label)}</button></div>`);$('confirm-cancel').onclick=closeDialog;$('confirm-action').onclick=()=>{closeDialog();action();};}
  function uid(){return 'user-'+(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`);}
  function addWordDialog(){openDialog('把你的新词，放进词库',`<form id="word-form" class="modal-form"><label>英文单词或短语<input name="word" type="text" maxlength="80" required placeholder="例如：take a break"></label><label>中文释义<input name="meaning" type="text" maxlength="300" required placeholder="例如：休息一下"></label><label>英文例句（选填）<textarea name="example" maxlength="600" placeholder="例如：Let's take a break."></textarea></label><div id="word-error" class="form-error" role="alert"></div><div class="modal-actions"><button class="button" type="submit">添加到我的词库</button></div></form>`);$('word-form').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target),word=fd.get('word').trim(),meaning=fd.get('meaning').trim();if(!word||!meaning){$('word-error').textContent='请填写单词和中文释义。';return;}if(words().some(w=>w.word.toLowerCase()===word.toLowerCase())){$('word-error').textContent='这个单词已经在词库里了。';return;}if(state.customWords.length>=10000){$('word-error').textContent='自定义词库已达上限，请先备份并整理。';return;}const ok=save(s=>{s.customWords.push({id:uid(),word,meaning,pos:'',example:fd.get('example').trim(),category:'我的单词',updatedAt:Date.now()});});if(ok){closeDialog();notify('新词已放入词库');}};}
  function batchDialog(){openDialog('一次放进更多新词',`<p class="modal-help">每行一个词，用竖线分隔：英文 | 中文 | 英文例句（选填）。一次最多 200 行，已存在的单词会跳过。</p><form id="batch-form" class="modal-form"><label>粘贴单词<textarea id="batch-words" rows="8" maxlength="150000" placeholder="sunrise | 日出 | We watched the sunrise.\npeaceful | 宁静的"></textarea></label><div id="batch-error" class="form-error" role="alert"></div><div class="modal-actions"><button class="button" type="submit">添加这些单词</button></div></form>`);$('batch-form').onsubmit=e=>{e.preventDefault();const rows=$('batch-words').value.split(/\r?\n/).filter(x=>x.trim());if(!rows.length||rows.length>200){$('batch-error').textContent='请输入 1–200 行单词。';return;}const existing=new Set(words().map(w=>w.word.toLowerCase()));const add=[];let skipped=0;for(let i=0;i<rows.length;i++){const cells=rows[i].split('|').map(x=>x.trim());if(cells.length<2||cells.length>3||!cells[0]||!cells[1]||cells[0].length>80||cells[1].length>300||(cells[2]||'').length>600){$('batch-error').textContent=`第 ${i+1} 行格式有误，请使用「英文 | 中文 | 例句」，英文和中文必填。`;return;}if(existing.has(cells[0].toLowerCase())){skipped++;continue;}existing.add(cells[0].toLowerCase());add.push({id:uid(),word:cells[0],meaning:cells[1],example:cells[2]||'',pos:'',category:'我的单词',updatedAt:Date.now()});}if(state.customWords.length+add.length>10000){$('batch-error').textContent='添加后超过 10000 个自定义单词上限。';return;}if(save(s=>s.customWords.push(...add))){closeDialog();notify(`已添加 ${add.length} 个词${skipped?`，跳过 ${skipped} 个重复词`:''}`);}};}
  function download(content,name){const url=URL.createObjectURL(new Blob([content],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function exportData(){download(JSON.stringify({app:'shici',formatVersion:VERSION,exportedAt:new Date().toISOString(),state},null,2),`拾词-学习备份-${today}.json`);notify('备份已导出，请妥善保存');}
  function mergeStates(local,incoming){
    const merged=structuredClone(local);const byId=new Map(merged.customWords.map(w=>[w.id,w]));const canonical=new Map(builtin.map(w=>[w.word.toLowerCase(),w.id]));for(const w of merged.customWords)canonical.set(w.word.toLowerCase(),w.id);const remap={};
    for(const w of incoming.customWords){const sameName=canonical.get(w.word.toLowerCase());if(sameName&&sameName!==w.id){remap[w.id]=sameName;continue;}const old=byId.get(w.id);if(old){if(w.updatedAt>old.updatedAt)byId.set(w.id,w);}else{byId.set(w.id,w);canonical.set(w.word.toLowerCase(),w.id);}}
    merged.customWords=[...byId.values()];
    for(const [sourceId,p] of Object.entries(incoming.progress)){const id=remap[sourceId]||sourceId;if(!merged.progress[id]||p.updatedAt>merged.progress[id].updatedAt)merged.progress[id]=p;}
    for(const [key,d] of Object.entries(incoming.days)){const inc={...d,doneIds:[...new Set(d.doneIds.map(id=>remap[id]||id))]};const old=merged.days[key];if(!old){merged.days[key]=inc;continue;}const newer=d.updatedAt>old.updatedAt?inc:old;const checked=[old,inc].filter(v=>v.checkedInAt!==null).sort((a,b)=>a.checkedInAt-b.checkedInAt)[0];merged.days[key]={goal:checked?checked.goal:newer.goal,doneIds:[...new Set([...old.doneIds,...inc.doneIds])],checkedInAt:checked?checked.checkedInAt:null,updatedAt:Math.max(old.updatedAt,inc.updatedAt)};}
    return normalize(merged);
  }
  async function importFile(file){
    if(!file)return;if(file.size>8*1024*1024){notify('备份超过 8 MB，请选择较小的有效备份');return;}
    let incoming;try{const data=JSON.parse(await file.text());if(data.app!=='shici'||data.formatVersion!==VERSION)throw new Error('请使用拾词导出的 JSON 备份。');incoming=normalize(data.state);}catch(error){notify(`无法恢复：${error instanceof SyntaxError?'文件不是有效的 JSON':error.message}`);return;}
    openDialog('恢复这份学习备份？',`<p class="modal-body-note">${damagedRaw?'当前异常记录会被替换，请确认已经导出原始数据。':'会与本机记录合并，不会因备份缺少某项而清除本机记录。'}目标设置继续使用本机当前值。</p><div class="backup-summary">自定义单词 ${incoming.customWords.length} 个<br>单词进度 ${Object.keys(incoming.progress).length} 条<br>打卡记录 ${Object.values(incoming.days).filter(d=>d.checkedInAt!==null).length} 天</div><div id="restore-error" class="form-error" role="alert"></div><div class="modal-actions"><button id="restore-cancel" class="button secondary">取消</button><button id="restore-confirm" class="button">确认恢复</button></div>`);$('restore-cancel').onclick=closeDialog;$('restore-confirm').onclick=()=>{try{const base=damagedRaw?defaultState():state;const combined=mergeStates(base,incoming);const ok=save(s=>{const revision=s.revision;Object.assign(s,combined);s.revision=revision;},{recover:!!damagedRaw});if(ok){session=null;closeDialog();render();notify('备份已恢复，学习记录已合并');}}catch(error){$('restore-error').textContent=`无法合并：${error.message}`;}};
  }
  document.querySelector('.brand').onclick=e=>{e.preventDefault();setPage('today');};
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>setPage(b.dataset.page));document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>setPage(b.dataset.go));
  $('review-start').onclick=()=>startSession('review');$('checkin-button').onclick=checkin;
  $('word-search').oninput=renderLibrary;$('category-filter').onchange=renderLibrary;$('status-filter').onchange=renderLibrary;
  $('add-word').onclick=addWordDialog;$('batch-import').onclick=batchDialog;
  $('modal-close').onclick=closeDialog;$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
  $('month-prev').onclick=()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);renderCalendar();};$('month-next').onclick=()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);renderCalendar();};
  $('goal-form').onsubmit=e=>{e.preventDefault();const n=Number($('daily-goal').value);if(!int(n,1,100)){notify('每日目标需要是 1–100 之间的整数');return;}if(save(s=>{s.settings.goal=n;if(s.days[today]&&s.days[today].checkedInAt===null)s.days[today].goal=n;}))notify(`每日目标已设为 ${n} 个词`);};
  $('show-example').onchange=()=>{const on=$('show-example').checked;save(s=>s.settings.showExample=on);};
  $('export-data').onclick=exportData;$('import-data').onclick=()=>$('backup-file').click();$('backup-file').onchange=async e=>{await importFile(e.target.files[0]);e.target.value='';};
  $('reset-data').onclick=()=>confirmDialog('清空本机学习数据？','将删除本机全部学习进度、打卡和自定义单词。建议先导出备份；内置词库会保留。',()=>{if(save(s=>{const revision=s.revision;Object.assign(s,defaultState());s.revision=revision;})){session=null;render();notify('本机学习数据已清空');}},'确认清空');
  document.addEventListener('keydown',e=>{if(e.repeat||$('modal').open||['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement?.tagName)||e.ctrlKey||e.metaKey||e.altKey||page!=='today'||!session||session.index>=session.queue.length)return;if(e.code==='Space'&&!session.revealed){e.preventDefault();session.revealed=true;renderCard();}else if(session.revealed&&['1','2','3','4'].includes(e.key)){e.preventDefault();rate(Number(e.key)-1);}});
  function refreshExternal(){if(damagedRaw||storageUnavailable)return;try{const raw=localStorage.getItem(KEY);if(raw){const latest=normalize(JSON.parse(raw));if(latest.revision>state.revision){state=latest;render();}}}catch{}}
  window.addEventListener('storage',e=>{if(e.key===KEY)refreshExternal();});window.addEventListener('focus',refreshExternal);
  setInterval(()=>{const current=localDate();if(current!==today){today=current;session=null;selectedDay=today;calendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);render();notify('新的一天开始了，今日目标已更新');}},30000);
  storageBanner();render();
})();
