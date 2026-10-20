(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const REF='2026-10-20', STORAGE='moment-room-task-notes-v1';
  const CATEGORIES=['지연','오늘 마감','2일 내 임박','이후','날짜 확인 필요'];
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const EVENT_START='2026-10-23', EVENT_END='2026-11-01';
  let tasks=[], notes={}, role='',category='', area='',reference=REF,weatherController,weatherData=null,activeTaskId=null;
  function csv(text) {
    const rows=[];let row=[],value='',quoted=false;
    for(let i=0;i<text.length;i++) {const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){value+='"';i++;}else if(c==='"')quoted=false;else value+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(value);value='';}else if(c==='\n'){row.push(value.replace(/\r$/,''));rows.push(row);row=[];value='';}else value+=c;}
    if(value||row.length){row.push(value.replace(/\r$/,''));rows.push(row);}
    const headers=rows.shift()?.map(h=>h.replace(/^\uFEFF/,''))||[];
    const required=['task_id','행사명','업무영역','준비항목','담당역할','마감일','상태','우선순위','확인사항','점검기준일'];
    if(required.some(h=>!headers.includes(h)))throw new Error('준비표 필수 열을 확인해 주세요.');
    const result=rows.filter(r=>r.some(v=>v!=='')).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
    const ids=new Set();
    result.forEach(t=>{if(!t.task_id||ids.has(t.task_id))throw new Error(`준비표 task_id 중복 또는 공란: ${t.task_id}`);ids.add(t.task_id);if(t.점검기준일!==REF)throw new Error(`준비표 점검기준일 확인 필요: ${t.task_id}`);if(t.마감일&&!/^\d{4}-\d{2}-\d{2}$/.test(t.마감일))throw new Error(`마감일 확인 필요: ${t.task_id}`);});
    return result;
  }
  function classify(t,ref=reference) {
    if(['완료','취소'].includes(t.상태))return null;
    if(!t.마감일)return CATEGORIES[4];
    const delta=(Date.parse(t.마감일+'T00:00:00Z')-Date.parse(ref+'T00:00:00Z'))/86400000;
    return delta<0?CATEGORIES[0]:delta===0?CATEGORIES[1]:delta<=2?CATEGORIES[2]:CATEGORIES[3];
  }
  function readNotes(){try{const data=JSON.parse(localStorage.getItem(STORAGE)||'{}');if(!data||typeof data!=='object'||Array.isArray(data))throw Error();notes=data;}catch{$('taskSaveStatus').textContent='브라우저의 기존 확인·메모를 읽지 못했습니다. 저장 공간을 확인해 주세요.';}}
  function persist(id,patch){notes[id]={...(notes[id]||{}),...patch};syncTask(id);try{localStorage.setItem(STORAGE,JSON.stringify(notes));$('taskSaveStatus').textContent=`${id} 확인·메모를 이 브라우저에 저장했습니다.`;$('taskDialogSaveStatus').textContent=`${id} 저장 완료 · 이 브라우저에 보관됩니다.`;return true;}catch{$('taskSaveStatus').textContent=`${id} 저장 실패: 현재 화면에만 반영되었습니다.`;$('taskDialogSaveStatus').textContent=`${id} 저장 실패: 현재 화면에만 반영되었습니다.`;return false;}}
  function syncTask(id){document.querySelectorAll('[data-check]').forEach(el=>{if(el.dataset.check===id)el.checked=!!notes[id]?.checked;});document.querySelectorAll('[data-memo-preview]').forEach(el=>{if(el.dataset.memoPreview===id)el.textContent=notes[id]?.memo||'메모 없음';});}
  function openTasks(){return tasks.filter(t=>classify(t)!==null);}
  function selected(){return openTasks().filter(t=>(!role||t.담당역할===role)&&(!area||t.업무영역===area)&&(!category||classify(t)===category));}
  function render(){
    const open=openTasks(), base=open.filter(t=>(!role||t.담당역할===role)&&(!area||t.업무영역===area));
    $('incompleteCount').textContent=base.length;
    $('taskStats').hidden=true;
    const rows=selected().sort((a,b)=>CATEGORIES.indexOf(classify(a))-CATEGORIES.indexOf(classify(b))||a.마감일.localeCompare(b.마감일)||a.task_id.localeCompare(b.task_id));
    $('taskList').innerHTML=CATEGORIES.map((name,i)=>{const cards=rows.filter(t=>classify(t)===name);return `<section class="board-column column-${i}" aria-label="${name}" data-board-category="${name}"><h3>${name}<span class="board-count">${cards.length}</span></h3><div class="board-cards">${cards.length?cards.map(card).join(''):'<p class="board-empty">해당 항목 없음</p>'}</div></section>`;}).join('');
    $('taskFooter').textContent=`기준일 ${reference} · 전체 ${tasks.length}건 · 완료 ${tasks.filter(t=>t.상태==='완료').length}건 · 취소 ${tasks.filter(t=>t.상태==='취소').length}건 제외 · 미완료 ${open.length}건 · 현재 ${rows.length}건 표시`;
    $('taskFilterCount').textContent=`${role||'전체 담당 역할'} · 기준일 ${reference} · 미완료 ${base.length}건 / 5개 분류 합계 ${CATEGORIES.reduce((n,c)=>n+base.filter(t=>classify(t)===c).length,0)}건`;
    $('marketingOnly').setAttribute('aria-pressed',String(role==='마케팅 담당'&&!area&&!category));
    $('operationReferenceCaption').textContent=`공유 점검 기준일 ${reference} · 확인 체크와 메모는 이 브라우저에 저장됩니다.`;
    $('boardReferenceCaption').textContent=`완료·취소 제외 · 기준일 ${reference} · 확인 체크는 원본 상태와 마감 분류를 바꾸지 않습니다.`;
    if(activeTaskId&&$('taskDialog').open)renderDetail(activeTaskId);
    renderRain();
  }
  function card(t){return `<article class="operation-task board-card" data-task-id="${escape(t.task_id)}"><button type="button" class="board-card-open" data-open-task="${escape(t.task_id)}" aria-label="${escape(t.task_id)} ${escape(t.준비항목)} 상세"><span class="board-card-id">${escape(t.task_id)} · ${escape(t.상태)}</span><strong>${escape(t.준비항목)}</strong><span class="board-card-role">${escape(t.담당역할)}</span><span class="board-card-due">마감 ${escape(t.마감일||'날짜 확인 필요')}</span></button><div class="board-card-foot"><label class="task-confirm"><input type="checkbox" data-check="${escape(t.task_id)}" ${notes[t.task_id]?.checked?'checked':''} aria-label="${escape(t.task_id)} 확인" /> 확인</label><span class="board-memo-preview" data-memo-preview="${escape(t.task_id)}">${escape(notes[t.task_id]?.memo||'메모 없음')}</span></div></article>`;}
  function renderDetail(id){
    const t=tasks.find(t=>t.task_id===id);if(!t)return;
    activeTaskId=id;
    const outside=(role&&t.담당역할!==role)||(area&&t.업무영역!==area);
    $('taskDialogTitle').textContent=t.준비항목;
    $('taskDialogContext').textContent=`공유 기준일 ${reference} · 담당 ${role||'전체'} · 업무 영역 ${area||'전체'}${outside?' · 현재 필터 밖의 관련 업무입니다.':''}`;
    $('taskDialogFacts').innerHTML=[['항목 ID',t.task_id],['마감일',t.마감일||'날짜 확인 필요'],['담당 역할',t.담당역할],['현재 분류',classify(t)||t.상태],['원본 상태',t.상태],['우선순위',t.우선순위]].map(([key,value])=>`<div><dt>${key}</dt><dd>${escape(value)}</dd></div>`).join('');
    $('taskDialogCheck').textContent=t.확인사항;
    $('taskDialogConfirm').dataset.check=id;$('taskDialogConfirm').checked=!!notes[id]?.checked;$('taskDialogConfirm').setAttribute('aria-label',`${id} 확인`);
    $('taskDialogMemo').dataset.memo=id;$('taskDialogMemo').value=notes[id]?.memo||'';$('taskDialogMemo').setAttribute('aria-label',`${id} 운영 메모`);
    $('taskDialogSaveStatus').textContent='확인·메모는 이 브라우저에 저장됩니다. 원본 상태는 유지됩니다.';
    const matches=rainMatches(weatherData);
    $('taskDialogRain').hidden=id!=='EV071'||!matches.length;
    if(id==='EV071'&&matches.length)$('taskDialogRain').textContent=`${weatherData.mode==='live'?'실제 OpenWeather 예보':'교육용 예제 · 실제 예보 아님'} · ${matches.map(d=>`${d.date} 강수확률 ${Math.round(d.pop*100)}%`).join(' / ')} · 출처: ${weatherData.source.name}`;
  }
  function openDetail(id){if(!tasks.some(t=>t.task_id===id))return;renderDetail(id);if(!$('taskDialog').open)$('taskDialog').showModal();}
  function rainMatches(w){return (w?.forecast||[]).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.date)&&d.date>=EVENT_START&&d.date<=EVENT_END&&typeof d.pop==='number'&&Number.isFinite(d.pop)&&d.pop>=0.6&&d.pop<=1);}
  function renderRain(){
    if(!weatherData){$('rainAdvisory').innerHTML='<p>행사 기간의 우천 예보를 확인하는 중입니다.</p>';return;}
    const matches=rainMatches(weatherData),live=weatherData.mode==='live',task=tasks.find(t=>t.task_id==='EV071');
    const label=live?'실제 OpenWeather 예보':'교육용 예제 · 실제 예보 아님';
    $('rainAdvisory').innerHTML=`<div class="rain-advisory-heading"><strong>행사 기간 우천 준비</strong><span class="rain-source ${live?'is-live':''}">${label}</span></div><p>행사 기간 ${EVENT_START}~${EVENT_END}와 겹치는 예보 중 강수확률 60% 이상을 연결합니다.</p>${matches.length?matches.map(d=>`<div class="rain-match" data-rain-date="${escape(d.date)}"><strong>${escape(d.date)} · 강수확률 ${Math.round(d.pop*100)}%</strong><button type="button" data-open-task="EV071" ${task?'':'disabled'}>${task?'EV071 · 우천 시 반입 동선 확정 열기':'준비표를 불러오는 중'}</button></div>`).join(''):'<p class="rain-no-match">현재 제공된 예보 범위에는 조건에 해당하는 날짜가 없습니다. 행사 전체 기간의 무강수를 뜻하지 않습니다.</p>'}<small>출처: ${escape(weatherData.source.name)} · 자료 조회 ${escape(time(weatherData.fetchedAt))} · 담당 필터를 유지한 채 관련 항목 상세를 엽니다.</small>`;
  }
  async function loadTasks(){try{const r=await fetch('C_행사준비/08_행사준비.csv');if(!r.ok)throw Error('준비표를 읽지 못했습니다.');tasks=csv(await r.text());for(const [id,key,title]of [['taskRoleFilter','담당역할','전체 담당 역할'],['taskAreaFilter','업무영역','전체 업무 영역']]){const el=$(id),old=el.value;el.innerHTML=`<option value="">${title}</option>`+[...new Set(tasks.map(t=>t[key]))].sort().map(v=>`<option value="${escape(v)}">${escape(v)}</option>`).join('');el.value=old;}render();$('operationError').hidden=true;}catch(e){$('operationError').textContent=e.message;$('operationError').hidden=false;}}
  function time(value){return value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST':'—';}
  function renderWeather(w){
    weatherData=w;renderRain();
    const live=w.mode==='live';
    $('weatherBadge').textContent=live?(w.cached?'실제 연결 · 캐시':'실제 연결'):'예제 · 실제 날씨 아님';
    $('weatherBadge').classList.toggle('is-live',live);
    $('weatherLocation').textContent=`${w.location.name} · ${w.location.note}`;
    $('weatherTemp').textContent=`${w.current.temp}°C`;$('weatherDesc').textContent=w.current.description;
    $('weatherFeels').textContent=`체감 ${w.current.feelsLike}°C · 습도 ${w.current.humidity}% · 바람 ${w.current.wind}m/s`;
    $('forecastList').innerHTML=w.forecast.map(d=>`<div class="forecast-day"><strong>${escape(d.date)}</strong><span>${escape(d.description)}</span><b>${d.min}° / ${d.max}°</b><small>강수확률 ${Math.round(d.pop*100)}%${d.slots?` · ${d.slots}구간`:''}</small></div>`).join('');
    $('weatherReason').textContent=`${live?'':'예제 전환 이유 ['+w.reason+']: '}${w.message}`;
    $('weatherSource').textContent=`출처: ${w.source.name}`;
    $('weatherTimes').textContent=`화면 조회: ${time(w.requestedAt||new Date().toISOString())} · 자료 조회: ${time(w.fetchedAt)} · 관측: ${time(w.observedAt)} · ${w.cached?'10분 이내 캐시 사용':'캐시 미사용'}`;
    $('weatherDisclaimer').textContent=live?'현재 관측과 예보 날짜는 운영 점검 기준일과 별개입니다. 최저·최고는 제공된 3시간 예보 구간을 집계한 값입니다.':'D의 11 예제 JSON입니다. 과거 날짜의 교육용 샘플이며 실제 관측·예보가 아닙니다. 자료 조회·관측 시각은 예제 원본의 시각을 유지합니다.';
  }
  async function loadWeather(){
    if(weatherController)weatherController.abort();
    const controller=new AbortController();weatherController=controller;
    $('weatherRefresh').disabled=true;
    const timer=setTimeout(()=>controller.abort(),10000);
    try{if($('weatherMode').value==='sample'){const sample=await fetch('D_화면과연결/11_날씨응답_예제.json',{signal:controller.signal});if(!sample.ok)throw Error('sample-error');renderWeather({...await sample.json(),requestedAt:new Date().toISOString(),reason:'selected-sample',message:'예제 보기를 선택했습니다. 실제 관측·예보가 아닙니다.'});return;}const r=await fetch('/api/weather',{signal:controller.signal,cache:'no-store'});if(!r.ok)throw Error('server-error');const w=await r.json();if(!['live','sample'].includes(w.mode)||!w.current||!Array.isArray(w.forecast))throw Error('server-error');renderWeather(w);}
    catch{try{const r=await fetch('D_화면과연결/11_날씨응답_예제.json',{signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error();renderWeather({...await r.json(),mode:'sample',reason:'proxy-unavailable',message:'서버 /api/weather에 연결하지 못해 예제 자료로 전환했습니다.',requestedAt:new Date().toISOString()});}catch{weatherData=null;$('weatherBadge').textContent='자료 오류';$('weatherTemp').textContent='—';$('forecastList').innerHTML='';$('weatherSource').textContent='출처: 조회 실패';$('weatherTimes').textContent='이번 요청의 날씨 자료를 확인할 수 없습니다.';$('weatherReason').textContent='서버와 예제 파일 모두 읽지 못했습니다. 서버 실행과 D 원본 경로를 확인해 주세요.';$('rainAdvisory').textContent='날씨 자료를 읽지 못해 우천 준비 연결을 표시할 수 없습니다.';}}
    finally{clearTimeout(timer);$('weatherRefresh').disabled=false;}
  }
  function view(name){const operation=name==='operations';$('salesView').hidden=operation;$('operationsView').hidden=!operation;document.querySelectorAll('[data-view]').forEach(el=>{const active=el.dataset.view===name;el.classList.toggle('active',active);if(el.getAttribute('role')==='tab')el.setAttribute('aria-selected',String(active));});$('breadcrumbView').textContent=operation?'운영':'매출 대시보드';}
  document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>{view(el.dataset.view);}));
  window.addEventListener('hashchange',()=>view(location.hash==='#operations'?'operations':'sales'));
  $('taskRoleFilter').addEventListener('change',e=>{role=e.target.value;render();});$('taskAreaFilter').addEventListener('change',e=>{area=e.target.value;render();});
  $('taskReference').addEventListener('change',e=>{const value=e.target.value;if(!/^\d{4}-\d{2}-\d{2}$/.test(value)){e.target.value=reference;return;}reference=value;render();});
  $('marketingOnly').addEventListener('click',()=>{role='마케팅 담당';area=category='';$('taskRoleFilter').value=role;$('taskAreaFilter').value='';render();});
  $('taskFilterReset').addEventListener('click',()=>{role=area=category='';reference=REF;$('taskReference').value=REF;$('taskRoleFilter').value='';$('taskAreaFilter').value='';render();});
  $('taskStats').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(b){category=category===b.dataset.category?'':b.dataset.category;render();}});
  $('taskList').addEventListener('change',e=>{if(e.target.dataset.check)persist(e.target.dataset.check,{checked:e.target.checked});});
  $('taskList').addEventListener('input',e=>{if(e.target.dataset.memo)persist(e.target.dataset.memo,{memo:e.target.value});});
  $('operationsView').addEventListener('click',e=>{const button=e.target.closest('[data-open-task]');if(button)openDetail(button.dataset.openTask);});
  $('taskDialogClose').addEventListener('click',()=>$('taskDialog').close());
  $('taskDialog').addEventListener('close',()=>{activeTaskId=null;});
  $('taskDialog').addEventListener('change',e=>{if(e.target.dataset.check)persist(e.target.dataset.check,{checked:e.target.checked});});
  $('taskDialog').addEventListener('input',e=>{if(e.target.dataset.memo)persist(e.target.dataset.memo,{memo:e.target.value});});
  $('weatherRefresh').addEventListener('click',loadWeather);
  $('weatherMode').addEventListener('change',loadWeather);
  $('refreshButton').addEventListener('click',()=>{loadTasks();loadWeather();});
  window.OperationsApp={classify,parseCsv:csv,getTasks:()=>structuredClone(tasks),getSelected:()=>structuredClone(selected()),getNotes:()=>structuredClone(notes),getReference:()=>reference,rainMatches,getWeather:()=>structuredClone(weatherData),reload:async()=>{await Promise.all([loadTasks(),loadWeather()]);}};
  readNotes();view(location.hash==='#operations'?'operations':'sales');window.OperationsApp.reload();
})();
