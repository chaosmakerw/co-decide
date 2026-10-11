/* Local demo: identity selection demonstrates roles, it is not authentication. */
(() => {
  'use strict';
  const D = window.LeaveDomain;
  const KEY = 'liubai-leave-v1';
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const iconPaths = {
    overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    document:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h1M14 15h1"/>',
    check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    people:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5"/>',
    shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>'
  };
  const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true">'+(iconPaths[name]||iconPaths.document)+'</svg>';
  document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML=icon(el.dataset.icon));
  const member = id => D.members.find(m => m.id===id);
  const today = new Date();
  const iso = date => `${String(date.getFullYear()).padStart(4,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const localDate = str => {const date=new Date(0);date.setFullYear(Number(str.slice(0,4)),Number(str.slice(5,7))-1,Number(str.slice(8,10)));date.setHours(12,0,0,0);return date;};
  const short = date => `${Number(date.slice(5,7))} 月 ${Number(date.slice(8,10))} 日`;
  const range = data => data.start===data.end ? short(data.start) : short(data.start)+' – '+short(data.end);
  const dateTime = value => new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  const isWorkday = date => ![0,6].includes(localDate(date).getDay());
  const covers = (data,date) => !!data && date>=data.start && date<=data.end && isWorkday(date);
  let actor='qiao', page='overview', filter='all', search='', state, storageError='', toastTimer;
  let calendarMonth=new Date(2026,9,1), editingId=null, withdrawalId=null, decisionContext=null;
  const isLead = () => member(actor).role==='lead';
  const historyData = item => item.pending?.kind==='withdraw' ? item.effective||item.pending.previous?.data : item.pending?.data||item.effective;
  const recordData = record => historyData(record) || [...record.history].reverse().map(historyData).find(Boolean);
  const myRecords = () => state.records.filter(r=>isLead()||r.ownerId===actor).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const effectiveRecords = () => state.records.filter(r=>r.effective);
  function seed(){
    let next=D.createState();
    next=D.submit(next,'tang',{type:'年假',start:'2026-10-15',end:'2026-10-15',reason:'示例：个人安排，已交接待办。'});
    next=D.decide(next,'lin',next.records[0].id,'approve','示例申请，用于预览团队日历。');
    next.records[0].id='sample-tang';
    return next;
  }
  function validateStored(value){
    try{return D.validateState(value);}
    catch{throw new Error('本地申请数据不完整或状态不一致，已停止操作。原数据保留在浏览器中，请恢复有效数据后刷新。');}
  }
  function readStored(){
    let saved;
    try{saved=localStorage.getItem(KEY);}catch{throw new Error('浏览器本地存储不可用。请允许存储后重新打开页面。');}
    if(saved===null)return null;
    let value;try{value=JSON.parse(saved);}catch{throw new Error('本地数据无法读取，已停止操作。原数据保持不变，请恢复有效数据后刷新。');}
    return validateStored(value);
  }
  try {state=readStored()||seed();if(localStorage.getItem(KEY)===null)localStorage.setItem(KEY,JSON.stringify(state));}
  catch(error){state=D.createState();storageError=error.message||'浏览器存储不可用。请允许本地存储后再使用。';}
  function mutate(operation){
    if(storageError)throw new Error(storageError);
    // Read the latest saved state before every operation, including decisions.
    const latest=readStored();
    if(!latest)throw new Error('本地数据已被外部清空，请刷新页面后再操作。');
    const next=operation(latest);
    try{localStorage.setItem(KEY,JSON.stringify(next));}catch{throw new Error('浏览器未能保存这次操作，申请尚未更新。请检查可用存储空间后重试。');}
    state=next;
    render();
  }
  function notify(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
  function errorIn(id,message){$(id).textContent=message;$(id).hidden=!message;}
  function statusClass(record){return record.pending?'pending':record.effective?'approved':record.terminal==='rejected'?'rejected':'closed';}
  function statusBadge(record){return `<span class="status ${statusClass(record)}">${escape(D.statusOf(record))}</span>`;}
  function resultText(record){
    if(!record.lastResult)return record.pending?.kind==='withdraw'?'撤回需林言确认，原安排保持不变。':record.pending?.kind==='edit'?'修改需重新确认，原已生效安排保持不变。':'等待林言确认，尚未生效。';
    const result=record.lastResult;
    const actionName={create:'申请',edit:'修改',withdraw:'撤回'}[result.action]||'申请';
    const decision=result.decision==='approve'?'已确认':'已驳回';
    return `林言${decision}${actionName}${result.comment?' · '+result.comment:''}${record.pending?' · 当前仍有待确认操作':''}`;
  }
  function actions(record){
    const buttons=[`<button class="button text" data-action="detail" data-id="${escape(record.id)}">详情</button>`];
    if(record.ownerId===actor&&!record.terminal&&record.pending?.kind!=='withdraw'){
      buttons.push(`<button class="button text" data-action="edit" data-id="${escape(record.id)}">修改</button>`);
      buttons.push(`<button class="button text" data-action="withdraw" data-id="${escape(record.id)}">申请撤回</button>`);
    }
    if(isLead()&&record.pending){
      buttons.push(`<button class="button secondary slim" data-action="reject" data-id="${escape(record.id)}">驳回</button>`);
      buttons.push(`<button class="button primary slim" data-action="approve" data-id="${escape(record.id)}">确认${record.pending.kind==='withdraw'?'撤回':record.pending.kind==='edit'?'修改':'申请'}</button>`);
    }
    return buttons.join('');
  }
  function row(record){
    const data=recordData(record), owner=member(record.ownerId);
    if(!data)return '';
    return `<article class="request-row" data-record-id="${escape(record.id)}"><div class="request-top"><div class="request-type"><span class="type-icon">${icon(data.type==='年假'?'sun':'document')}</span><div><h3>${escape(data.type)}${isLead()?' · '+escape(owner.name):''}${record.id==='sample-tang'?'<span class="sample-label">示例</span>':''}</h3><div class="sub">${record.pending?.kind==='withdraw'?'撤回请求':record.pending?.kind==='edit'?'修改请求':'请假申请'} · ${dateTime(record.createdAt)}</div></div></div>${statusBadge(record)}</div><div class="request-meta"><span>${escape(range(data))}</span><span class="sep">/</span><span>${escape(data.days)} 个工作日</span>${record.pending&&record.effective?'<span class="sep">·</span><span>原安排仍生效</span>':''}</div><div class="request-result">${escape(resultText(record))}</div><div class="request-actions">${actions(record)}</div></article>`;
  }
  function filtered(records){return records.filter(r=>{
    const match=filter==='all'||filter==='pending'&&r.pending||filter==='effective'&&r.effective||filter==='closed'&&!r.pending&&!r.effective;
    const data=recordData(r);
    return match&&(!search||`${member(r.ownerId).name} ${data?.type} ${data?.start} ${data?.end} ${D.statusOf(r)}`.includes(search));
  });}
  function empty(title='还没有请假申请',detail='需要休息时，点击「发起请假」。<br>申请进展会在这里清晰呈现。'){return `<div class="empty-state"><div class="empty-symbol">⌁</div><strong>${title}</strong><p>${detail}</p></div>`;}
  function filters(){return `<div class="filter-row">${[['all','全部'],['pending','待确认'],['effective','已生效'],['closed','已结束']].map(([id,label])=>`<button class="filter-btn ${filter===id?'active':''}" data-filter="${id}">${label}</button>`).join('')}</div>`;}
  function heading(title,subtitle,eyebrow='YOUR TEAM, YOUR TIME'){
    return `<div class="page-heading"><div><div class="date-line">${today.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'})}</div><h1>${title}</h1><p class="page-subtitle">${subtitle}</p></div>${!isLead()?`<button class="button primary" id="new-request"${storageError?' disabled':''}>${icon('plus')} 发起请假</button>`:'<span class="demo-pill">负责人工作台</span>'}</div>`;
  }
  function banner(){return `<div class="principle-banner"><span class="principle-icon">${icon('shield')}</span><div><strong>每一次安排，都有明确的确认。</strong><p>新申请先待确认；修改与撤回获确认前，原已生效安排保持不变。</p></div></div>`;}
  function overview(){
    const records=myRecords(), active=records.filter(r=>r.effective), pending=records.filter(r=>r.pending);
    const thirty=new Date(today);thirty.setDate(thirty.getDate()+30);
    const upcoming=effectiveRecords().filter(r=>r.effective.end>=iso(today)&&r.effective.start<=iso(thirty));
    const countDays=active.reduce((sum,r)=>sum+r.effective.days,0);
    const stats=[{title:isLead()?'待我确认':'待负责人确认',value:pending.length,unit:'笔',caption:isLead()?'成员的新申请、修改和撤回':'提交已送达，确认后才生效',icon:'clock'}, {title:isLead()?'团队已确认请假':'我的已确认请假',value:countDays,unit:'天',caption:'按当前生效安排累计工作日',icon:'check'}, {title:'未来 30 天团队请假',value:new Set(upcoming.map(r=>r.ownerId)).size,unit:'人',caption:'只计已确认且尚未结束的安排',icon:'people'}];
    return heading(isLead()?'让团队安排，井井有条。':'把休息安排好。',isLead()?'接住成员的每一笔申请，让安排清楚、结果可见。':'查看申请进展，为团队留出从容的空间。')+`<section class="stats-grid" aria-label="请假概况">${stats.map(s=>`<div class="stat-card"><div class="stat-top"><span>${s.title}</span><span class="stat-icon">${icon(s.icon)}</span></div><div class="stat-value">${s.value}<small>${s.unit}</small></div><p class="stat-caption">${s.caption}</p></div>`).join('')}</section><div class="overview-grid"><section class="panel"><div class="panel-heading"><div><h3>${isLead()?'申请动态':'我的申请'}</h3><p>申请、修改和撤回的进展，都在这里。</p></div><button class="button text" data-goto="${isLead()?'approvals':'requests'}">查看全部 ↗</button></div>${filters()}<div class="request-list">${filtered(records).slice(0,4).map(row).join('')||empty()}</div></section>${teamPanel()}</div>${banner()}`;
  }
  function teamPanel(){
    const start=new Date(today);start.setDate(start.getDate()-((start.getDay()+6)%7));
    const week=[];for(let i=0;i<7;i++){const date=new Date(start);date.setDate(date.getDate()+i);week.push(date);}
    const end=iso(week[6]);
    const upcoming=effectiveRecords().filter(r=>r.effective.end>=iso(today)&&r.effective.start<=end);
    return `<section class="panel"><div class="panel-heading"><div><h3>团队这一周</h3><p>${short(iso(week[0]))} – ${short(end)}</p></div><button class="button text" data-goto="calendar">${icon('calendar')}</button></div><div class="panel-body"><div class="week-strip">${week.map((date,i)=>{const key=iso(date);return `<div class="week-day${key===iso(today)?' today':''}${effectiveRecords().some(r=>covers(r.effective,key))?' has-leave':''}"><span>${['一','二','三','四','五','六','日'][i]}</span><b>${date.getDate()}</b><i class="dot"></i></div>`;}).join('')}</div>${upcoming.map(r=>`<div class="upcoming-person"><span class="avatar ${r.ownerId}">${member(r.ownerId).name[0]}</span><div class="upcoming-info"><b>${member(r.ownerId).name}</b><p>${escape(range(r.effective))}</p></div><span class="upcoming-tag">${escape(r.effective.type)}</span></div>`).join('')||'<div class="empty-state" style="padding:17px 0"><strong>本周大家都在</strong><p>没有已确认的请假安排</p></div>'}</div><div class="team-footnote">仅展示已生效请假 · 不展示个人说明</div></section>`;
  }
  function requests(){const records=myRecords();return heading(isLead()?'每笔申请，都有迹可循。':'我的请假申请',isLead()?'查看全体成员的申请与处理记录。':'查看结果，或提交需要重新确认的修改与撤回。')+`<section class="panel all-requests"><div class="panel-heading page-toolbar">${filters()}<input class="search-input" id="search-input" type="search" aria-label="搜索申请" placeholder="搜索类型、日期${isLead()?'或成员':''}" value="${escape(search)}"></div><div class="request-list" id="request-results">${filtered(records).map(row).join('')||empty('没有符合条件的申请','试试其他状态，或发起一笔新的请假。')}</div></section>${banner()}`;}
  function conflicts(record){
    const data=record.pending?.data||record.effective||record.pending?.previous?.data;
    if(!data)return [];
    return effectiveRecords().filter(r=>{
      if(r.id===record.id||r.ownerId===record.ownerId)return false;
      const start=data.start>r.effective.start?data.start:r.effective.start;
      const end=data.end<r.effective.end?data.end:r.effective.end;
      return start<=end&&D.businessDays(start,end)>0;
    });
  }
  function approvals(){
    const records=state.records.filter(r=>r.pending).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
    return heading('给每一笔申请，一个回应。','确认后才更新团队安排；驳回时请写明原因，申请人会看到结果。')+`<section class="panel"><div class="panel-heading"><h3>待我确认 <span class="list-note"> / ${records.length} 笔</span></h3><span class="list-note">林言 · 负责人</span></div><div class="request-list">${records.map(r=>{const overlap=conflicts(r);return row(r)+(overlap.length?`<div class="attention">同日缺勤提醒：与 ${escape(overlap.map(other=>member(other.ownerId).name).join('、'))} 的已生效请假有日期重叠。请结合团队安排确认。</div>`:'');}).join('')||empty('待确认事项已处理完','成员提交新的申请后，会出现在这里。')}</div><div class="team-footnote">所有申请统一确认 · 同日缺勤只提供提醒</div></section>${banner()}`;
  }
  function calendar(){
    const first=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1,12), start=new Date(first);
    start.setDate(start.getDate()-((start.getDay()+6)%7));
    const last=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,0,12);
    const cells=Math.ceil((((first.getDay()+6)%7)+last.getDate())/7)*7;
    let days='';
    for(let i=0;i<cells;i++){
      const date=new Date(start);date.setDate(date.getDate()+i);const key=iso(date);
      const records=effectiveRecords().filter(r=>covers(r.effective,key));
      days+=`<div class="calendar-day${date.getMonth()!==calendarMonth.getMonth()?' outside':''}${[0,6].includes(date.getDay())?' weekend':''}${key===iso(today)?' current':''}" data-calendar-date="${key}"><span class="day-number">${date.getDate()}</span>${records.map(r=>`<span class="calendar-event ${r.ownerId}" data-calendar-record-id="${escape(r.id)}">${member(r.ownerId).name} · ${escape(r.effective.type)}</span>`).join('')}${records.length>1?`<div class="calendar-overlap">${records.length} 人同日缺勤</div>`:''}</div>`;
    }
    return heading('把团队的时间，放在一起。','已确认的安排一目了然，个人请假说明不会出现在日历中。')+`<section class="panel"><div class="calendar-toolbar"><div class="month-picker"><h2>${calendarMonth.getFullYear()} 年 ${calendarMonth.getMonth()+1} 月</h2><button class="icon-button" data-month="-1" aria-label="上个月">‹</button><button class="icon-button" data-month="1" aria-label="下个月">›</button><button class="button secondary slim" data-month="today">本月</button></div><span class="list-note">仅显示已生效请假</span></div><div class="calendar-weekdays">${['周一','周二','周三','周四','周五','周六','周日'].map(d=>'<span>'+d+'</span>').join('')}</div><div class="calendar-days" id="calendar-days">${days}</div><div class="calendar-legend">${D.members.filter(m=>m.role==='member').map(m=>`<span><i class="legend-dot ${m.id}"></i>${m.name}</span>`).join('')}<span>周末不计请假天数</span></div></section>${banner()}`;
  }
  function render(){
    if(!isLead()&&page==='approvals')page='overview';
    document.querySelectorAll('.nav-btn').forEach(el=>{el.classList.toggle('active',el.dataset.page===page);if(el.dataset.page==='approvals')el.hidden=!isLead();});
    $('approval-count').textContent=state.records.filter(r=>r.pending).length;
    $('requests-nav-label').textContent=isLead()?'全部申请':'我的申请';
    $('sidebar-avatar').textContent=member(actor).name[0];$('top-avatar').textContent=member(actor).name[0];
    $('sidebar-avatar').className='avatar '+actor;$('top-avatar').className='avatar small '+actor;
    $('breadcrumb').textContent={overview:isLead()?'负责人概览':'我的概览',requests:isLead()?'全部申请':'我的申请',calendar:'团队日历',approvals:'待我确认'}[page];
    $('main-content').innerHTML=storageError?`<div class="form-error" role="alert">${escape(storageError)}</div>`:({overview,requests,calendar,approvals}[page])();
  }
  function openRequest(id=null){
    editingId=id;const record=id?state.records.find(r=>r.id===id):null;
    if(record&&(record.ownerId!==actor||record.terminal||record.pending?.kind==='withdraw'))return notify('当前申请不能修改。');
    const data=record?recordData(record):{type:'年假',start:'2026-10-14',end:'2026-10-16',reason:''};
    $('request-title').textContent=id?'修改请假安排':'为自己留一点时间';
    $('request-intro').textContent=record?.effective?'修改需重新确认。在获确认前，原已生效安排保持不变。':'提交后由林言确认，确认前不会计入团队请假。';
    $('submit-request').textContent=id?'提交修改':'提交申请 ↗';
    $('leave-type').value=data.type;$('start-date').value=data.start;$('end-date').value=data.end;$('leave-reason').value=data.reason;
    errorIn('request-error','');updateDuration();$('request-dialog').showModal();
  }
  function updateDuration(){
    $('reason-count').textContent=`${$('leave-reason').value.length} / 300`;
    try {const data=D.validateLeave({type:$('leave-type').value,start:$('start-date').value,end:$('end-date').value,reason:$('leave-reason').value});$('duration-preview').textContent=`共 ${data.days} 个工作日 · 确认前${editingId?'的新安排':''}不生效`;}
    catch{$('duration-preview').textContent='选择有效日期范围后计算工作日（周一至周五）';}
  }
  function showDetails(id){
    const record=state.records.find(r=>r.id===id);
    if(!record||(!isLead()&&record.ownerId!==actor))return notify('只能查看本人的申请详情。');
    const block=(label,data,className='')=>`<div class="detail-block ${className}"><h3>${label}</h3><p>${escape(data.type)} · ${escape(range(data))} · ${data.days} 个工作日</p><p>请假说明：${escape(data.reason||'未填写')}</p></div>`;
    const pending=record.pending;
    const result=record.lastResult;
    $('details-content').innerHTML=`<div class="request-top"><h3>${member(record.ownerId).name}的请假</h3>${statusBadge(record)}</div>${record.effective?block('当前已生效安排',record.effective):'<div class="detail-block"><p>当前没有生效请假。</p></div>'}${pending?pending.kind==='withdraw'?'<div class="detail-block pending-block"><h3>撤回待确认</h3><p>林言确认后才会撤回。原已生效安排暂时保留。</p></div>'+(pending.previous?.data?block('撤回确认后将一并结束的待确认安排',pending.previous.data,'pending-block'):''):block(pending.kind==='edit'?'新安排待确认':'新申请待确认',pending.data,'pending-block'):''}${record.terminal?block('本次结束的安排',recordData(record)):''}${result?`<div class="detail-block"><h3>最近处理结果</h3><p>${escape(resultText(record))}</p><p>${dateTime(result.at)}</p></div>`:''}<h3 style="margin-top:24px;font-size:12px">操作记录</h3><div class="timeline">${record.history.map(h=>`<div class="timeline-item"><b>${escape(member(h.by)?.name||h.by)} · ${escape(historyName(h))}</b><time>${dateTime(h.at)}</time>${h.comment?`<p>${escape(h.comment)}</p>`:''}${historyDateLine(h)}</div>`).join('')}</div>`;
    $('details-dialog').showModal();
  }
  function historyName(h){
    if(h.kind==='decide')return (h.decision==='approve'?'确认':'驳回')+({create:'申请',edit:'修改',withdraw:'撤回'}[h.action]||'申请');
    return {submit:'提交申请',edit:'提交修改',withdraw:'申请撤回'}[h.kind]||'更新申请';
  }
  function historyDateLine(h){
    if(h.kind==='decide'){
      if(h.effective)return '<p>处理后生效安排：'+escape(range(h.effective))+'</p>';
      if(h.pending?.data)return '<p>恢复待确认安排：'+escape(range(h.pending.data))+'</p>';
      return '<p>处理后无生效请假。</p>';
    }
    const data=historyData(h);
    return data?'<p>'+(h.kind==='withdraw'?'待撤回安排：':'提交安排：')+escape(range(data))+'</p>':'';
  }
  function openDecision(id,decision){
    const record=state.records.find(r=>r.id===id);
    if(!isLead()||!record?.pending)return notify('这笔申请已处理，请刷新后查看。');
    decisionContext={id,decision,pending:JSON.stringify(record.pending)};
    const data=recordData(record), kind=record.pending.kind;
    $('decision-title').textContent=(decision==='approve'?'确认':'驳回')+(kind==='withdraw'?'撤回请求':kind==='edit'?'修改请求':'请假申请');
    $('decision-summary').innerHTML=`<b>${member(record.ownerId).name} · ${escape(data.type)}</b><br>${escape(range(data))} · ${data.days} 个工作日<br>${escape(data.reason||'未填写说明')}${kind==='withdraw'?'<p>确认后将撤回整笔请假，移出团队日历。</p>':kind==='edit'?'<p>确认后以新安排替换原安排。</p>':'<p>确认后才会计入生效请假。</p>'}`;
    $('decision-comment-label').textContent=decision==='reject'?'驳回原因（必填）':'处理说明（选填）';
    $('decision-comment').value='';$('confirm-decision').textContent=decision==='approve'?'确认'+(kind==='withdraw'?'撤回':kind==='edit'?'修改':'申请'):'确认驳回';
    errorIn('decision-error','');$('decision-dialog').showModal();
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.close){$(button.dataset.close).close();return;}
    if(button.dataset.page||button.dataset.goto){page=button.dataset.page||button.dataset.goto;filter='all';search='';render();return;}
    if(button.id==='new-request'){openRequest();return;}
    if(button.dataset.filter){filter=button.dataset.filter;render();return;}
    if(button.dataset.month){if(button.dataset.month==='today')calendarMonth=new Date(today.getFullYear(),today.getMonth(),1);else calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+Number(button.dataset.month),1);render();return;}
    const {action,id}=button.dataset;
    if(action==='detail')showDetails(id);
    if(action==='edit')openRequest(id);
    if(action==='approve'||action==='reject')openDecision(id,action);
    if(action==='withdraw'){
      withdrawalId=id;const record=state.records.find(r=>r.id===id);
      $('withdraw-intro').textContent=record?.effective?'撤回也需要林言确认。在获确认前，原已生效的请假仍保留。':'撤回请求将交由林言确认。当前申请尚未生效；撤回被驳回时会恢复原待确认申请。';
      errorIn('withdraw-error','');$('withdraw-dialog').showModal();
    }
  });
  $('identity-select').addEventListener('change',()=>{
    actor=$('identity-select').value;filter='all';search='';document.querySelectorAll('dialog[open]').forEach(el=>el.close());
    try{state=readStored()||state;}catch(error){storageError=error.message;}
    render();notify(`已切换到${member(actor).name}，仅用于本地身份演示。`);
  });
  ['start-date','end-date','leave-type','leave-reason'].forEach(id=>$(id).addEventListener('input',updateDuration));
  $('request-form').addEventListener('submit',event=>{
    event.preventDefault();
    const input={type:$('leave-type').value,start:$('start-date').value,end:$('end-date').value,reason:$('leave-reason').value};
    try {mutate(latest=>editingId?D.edit(latest,actor,editingId,input):D.submit(latest,actor,input));$('request-dialog').close();notify(editingId?'修改已提交，等待林言确认。':'申请已提交，等待林言确认。');}
    catch(error){errorIn('request-error',error.message);}
  });
  $('confirm-withdraw').addEventListener('click',()=>{try{mutate(latest=>D.requestWithdrawal(latest,actor,withdrawalId));$('withdraw-dialog').close();notify('撤回请求已提交，获确认前原安排保持不变。');}catch(error){errorIn('withdraw-error',error.message);}});
  $('decision-form').addEventListener('submit',event=>{
    event.preventDefault();
    const context=decisionContext;
    try {mutate(latest=>{
      const current=latest.records.find(r=>r.id===context.id);
      if(JSON.stringify(current?.pending)!==context.pending)throw new Error('申请已发生变化。请关闭窗口，查看最新内容后再确认。');
      return D.decide(latest,actor,context.id,context.decision,$('decision-comment').value);
    });$('decision-dialog').close();notify(context.decision==='approve'?'已确认，申请人可以看到处理结果。':'已驳回，处理说明已展示给申请人。');}
    catch(error){errorIn('decision-error',error.message);}
  });
  document.addEventListener('input',event=>{
    if(event.target.id==='search-input'){search=event.target.value;$('request-results').innerHTML=filtered(myRecords()).map(row).join('')||empty('没有符合条件的申请','试试其他类型、日期或成员。');}
  });
  window.addEventListener('storage',event=>{if(event.key===KEY){try{const latest=readStored();if(!latest)throw new Error('本地数据已被外部清空，请刷新页面后再操作。');state=latest;render();notify('另一个本地窗口更新了申请，已同步显示。');}catch(error){storageError=error.message;render();}}});
  render();
})();
