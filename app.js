(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const nf = new Intl.NumberFormat('ko-KR');
  const FILTERS = [['storeFilter','점포'],['channelFilter','채널'],['weekFilter','기준주'],['brandFilter','브랜드'],['genreFilter','장르']];
  const MEMO_KEY = 'moment-room-record-memos';
  let memoReadError = '';
  function readMemos() {
    try { const value = JSON.parse(localStorage.getItem(MEMO_KEY) || '{}'); if(!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('메모 저장 형식 확인 필요'); return value; }
    catch { memoReadError = '저장된 메모를 읽지 못했습니다. 새 메모는 현재 화면에서만 유지될 수 있습니다. 보고서로 보관해 주세요.'; return {}; }
  }
  const state = {records:[], template:null, validation:[], tasks:[], weather:null, memos:readMemos(), search:'', taskArea:'', taskCategory:'', chartMode:'store', loading:false, lastReport:null};
  function errorMessage(message) { $('appError').textContent = message; $('appError').hidden = !message; }
  function toast(message) { const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),4500); }
  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  const escapeAttr=escapeHtml;
  function saveMemo(id,value) {
    const text=String(value).trim();if(text)state.memos[id]=text;else delete state.memos[id];
    try {localStorage.setItem(MEMO_KEY,JSON.stringify(state.memos));$('memoStatus').textContent=`${id} 메모를 이 브라우저에 저장했습니다.`;return true;}
    catch {$('memoStatus').textContent=`${id} 메모는 현재 화면에만 반영되었습니다. 브라우저 저장에 실패했으니 보고서로 보관해 주세요.`;return false;}
  }
  function currentFilters(){return Object.fromEntries(FILTERS.map(([id,key])=>[key,$(id).value]));}
  function filteredRecords(){return SalesData.filterRecords(state.records,currentFilters(),state.search);}
  function renderFilters(){
    const titles={점포:'전체 점포',채널:'전체 채널',기준주:'전체 기간',브랜드:'전체 브랜드',장르:'전체 장르'};
    for(const [id,key] of FILTERS){const el=$(id),old=el.value,values=[...new Set(state.records.map(r=>r[key]).filter(Boolean))].sort();el.innerHTML=`<option value="">${titles[key]}</option>`+values.map(v=>`<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('');el.value=values.includes(old)?old:'';}
  }
  function renderValidation(){
    $('validationSummary').textContent=`검증 완료 · ${nf.format(state.records.length)}행 · 필수 12열 / 채널 / 기록 ID 중복 확인`;
    $('validationDetails').innerHTML='<ul>'+state.validation.map(v=>`<li>${escapeHtml(v.file)} · ${escapeHtml(v.channel)} · ${v.count}행 · ${escapeHtml(v.message||'필수 열·채널 정상')}</li>`).join('')+'</ul><p>원본 파일은 읽기 전용으로 사용합니다. 파일을 반영하면 같은 채널의 기존 자료를 교체합니다. 같은 파일을 다시 반영해도 행이 늘어나지 않습니다. 기록별 출처와 파일·행은 상세 표에서 확인할 수 있습니다.</p>';
  }
  function renderDashboard(){
    const rows=filteredRecords(),s=SalesData.summarize(rows);
    $('salesKpi').textContent=state.records.length?`${nf.format(s.sales)}만원`:'—';$('targetKpi').textContent=state.records.length?`${nf.format(s.target)}만원`:'—';$('rateKpi').textContent=s.rate===null||!state.records.length?'—':`${(s.rate*100).toFixed(1)}%`;
    $('salesRows').textContent=`${nf.format(rows.length)}건 선택됨`;$('gapKpi').textContent=`목표 차이 ${s.sales-s.target>=0?'+':''}${nf.format(s.sales-s.target)}만원`;$('costKpi').textContent=`비용 차감액 ${nf.format(s.sales-s.cost)}만원`;
    $('recordCaption').textContent=`총 ${nf.format(rows.length)}건 · 금액 단위: 만원 · 비용 합계 ${nf.format(s.cost)}만원`;$('tableCount').textContent=`${nf.format(rows.length)}개 기록`;
    renderChart(rows);renderTable(rows);$('reportButton').disabled=!state.records.length||state.loading;
  }
  function chartGroups(rows){const key=({store:'점포',week:'기준주',channel:'채널'})[state.chartMode];return [...new Set(rows.map(r=>r[key]))].sort().map(label=>({label,...SalesData.summarize(rows.filter(r=>r[key]===label))}));}
  function renderChart(rows){
    const title=({store:'점포별',week:'주간',channel:'채널별'})[state.chartMode];$('chartTitle').textContent=`${title} 매출 비교`;$('chartDescription').textContent=`선택된 조건의 매출과 목표 · 단위: 만원`;$('salesChart').setAttribute('aria-label',`${title} 매출 비교 차트`);
    const groups=chartGroups(rows);if(!groups.length){$('salesChart').innerHTML='<div class="chart-empty">표시할 실적이 없습니다.</div>';return;}
    const max=Math.max(1,...groups.flatMap(g=>[g.sales,g.target]));
    $('salesChart').innerHTML=`<div class="chart-y">${[max,Math.round(max/2),0].map(n=>`<span>${nf.format(n)}</span>`).join('')}</div><div class="chart-plot">${groups.map(g=>`<div class="chart-group" data-label="${escapeAttr(g.label)}" data-sales="${g.sales}" data-target="${g.target}" title="${escapeAttr(g.label)} · 매출 ${nf.format(g.sales)}만원 · 목표 ${nf.format(g.target)}만원"><i class="chart-bar sales" style="height:${g.sales/max*100}%"></i><i class="chart-bar target" style="height:${g.target/max*100}%"></i><span class="chart-label">${escapeHtml(state.chartMode==='week'?g.label.slice(5):g.label)}</span></div>`).join('')}</div>`;
  }
  function renderTable(rows){
    $('recordsBody').innerHTML=rows.length?rows.map(r=>{const rate=r.목표_만원?r.매출_만원/r.목표_만원:null;return `<tr data-record-id="${escapeAttr(r.record_id)}"><td>${escapeHtml(r.record_id)}</td><td>${escapeHtml(r.기준주)}</td><td>${escapeHtml(r.점포)}</td><td>${escapeHtml(r.채널)}</td><td>${escapeHtml(r.브랜드)}</td><td>${escapeHtml(r.장르)}</td><td>${nf.format(r.매출_만원)}</td><td>${nf.format(r.목표_만원)}</td><td class="${rate===null?'':rate>=1?'positive':'negative'}">${rate===null?'—':`${(rate*100).toFixed(1)}%`}</td><td>${nf.format(r.비용_만원)}</td><td><span class="status-pill">${escapeHtml(r.상태)}</span></td><td class="note-cell"><input data-record-id="${escapeAttr(r.record_id)}" value="${escapeAttr(state.memos[r.record_id]||'')}" aria-label="${escapeAttr(r.record_id)} 메모" placeholder="메모 추가" /></td><td class="source-cell">${escapeHtml(r.출처)}<small>${escapeHtml(r.sourceFile)} · 원본 ${r.sourceRow}행 · 기준일 ${escapeHtml(r.기준일)}</small></td></tr>`;}).join(''):'<tr><td colspan="13" class="empty-state">조건에 맞는 기록이 없습니다.</td></tr>';
    $('recordsBody').querySelectorAll('input[data-record-id]').forEach(el=>el.addEventListener('input',()=>saveMemo(el.dataset.recordId,el.value)));
  }
  async function loadAll(){
    if(state.loading)return;state.loading=true;$('reportButton').disabled=true;$('dataStatus').textContent='원본을 검증하는 중';
    try{if(!window.SalesData||!window.XLSX)throw new Error('로컬 엑셀 처리 파일을 불러오지 못했습니다. 서버와 vendor 파일을 확인해 주세요.');const next=await SalesData.loadDefaults();state.records=next.records;state.template=next.template;state.validation=next.validation;renderFilters();renderValidation();renderDashboard();errorMessage('');$('dataStatus').textContent=`정상 연결 · ${state.records.length}행`;}
    catch(error){errorMessage(`${error.message}\n기존에 읽은 데이터는 유지됩니다.`);$('dataStatus').textContent='데이터 확인 필요';}
    finally{state.loading=false;$('reportButton').disabled=!state.records.length;}
    try{const r=await fetch('C_행사준비/08_행사준비.csv');if(!r.ok)throw new Error(`HTTP ${r.status}`);state.tasks=parseCsv(await r.text());renderTasks();}catch(error){$('taskList').innerHTML=`<div class="empty-state">행사 준비 자료 확인 필요: ${escapeHtml(error.message)}</div>`;}
    try{const r=await fetch('D_화면과연결/11_날씨응답_예제.json');if(!r.ok)throw new Error('날씨 예제 파일 확인 필요');state.weather=await r.json();renderWeather();}catch{$('weatherDesc').textContent='예제 자료를 불러오지 못했습니다';}
  }
  async function uploadFiles(files){
    try{const next=await SalesData.importFiles(files,state.records);state.records=next.records;state.validation=next.validation;renderFilters();renderValidation();renderDashboard();errorMessage('');$('dataStatus').textContent=`파일 반영 · ${state.records.length}행`;toast(`${files.length}개 파일을 검증해 반영했습니다.`);return true;}
    catch(error){errorMessage(`${error.message}\n기존 ${state.records.length}행과 메모는 유지됩니다.`);return false;}
  }
  function buildReport(){return SalesData.buildReport(filteredRecords(),state.memos,state.template);}
  async function reportDownload(){
    try{
      if(!state.records.length)throw new Error('통합 매출 자료가 준비되지 않았습니다.');
      const rows=filteredRecords(),book=buildReport(),stamp=new Date().toISOString().replace(/[:.]/g,'-');const filename=`매출비교_보고서_${stamp}.xlsx`;
      const bytes=XLSX.write(book,{bookType:'xlsx',type:'array'});
      if(window.showSaveFilePicker){const handle=await window.showSaveFilePicker({suggestedName:filename,types:[{description:'Excel 통합 문서',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]});const writer=await handle.createWritable();await writer.write(bytes);await writer.close();state.lastReport={filename:handle.name,count:rows.length,saved:true};toast(`${rows.length}건 보고서를 ${handle.name}에 저장했습니다.`);}
      else{const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);state.lastReport={filename,count:rows.length,saved:null};toast(`${rows.length}건 보고서 다운로드를 요청했습니다. 브라우저 다운로드 목록에서 저장을 확인해 주세요.`);}
    }catch(error){if(error.name==='AbortError'){toast('보고서 저장을 취소했습니다.');return;}errorMessage(`보고서 저장 실패: ${error.message}`);}
  }
  function parseCsv(text) {
    const rows = []; let row = [], field = '', quoted = false;
    for (let i=0; i<text.length; i++) { const c=text[i]; if (quoted) { if (c==='"' && text[i+1]==='"') { field+='"'; i++; } else if (c==='"') quoted=false; else field+=c; } else if (c==='"') quoted=true; else if (c===',') { row.push(field); field=''; } else if (c==='\n') { row.push(field.replace(/\r$/,'')); rows.push(row); row=[]; field=''; } else field+=c; }
    if (field || row.length) { row.push(field.replace(/\r$/,'')); rows.push(row); }
    const headers=rows.shift().map((x)=>x.replace(/^\uFEFF/,''));
    return rows.filter((r)=>r.some((x)=>x!=='')).map((r)=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
  }
  function renderWeather() {
    const w=state.weather;if(!w)return;$('weatherTemp').textContent=`${w.current.temp}°`;$('weatherDesc').textContent=w.current.description;$('weatherFeels').innerHTML=`체감 ${w.current.feelsLike}°<br />습도 ${w.current.humidity}%`;
    $('forecastList').innerHTML=w.forecast.slice(0,5).map((d)=>`<div class="forecast-day"><strong>${d.date.slice(5).replace('-','/')}</strong><span class="forecast-icon">${d.description.includes('비')?'☂':d.description.includes('흐림')?'☁':'☀'}</span><b>${d.min}° / ${d.max}°</b></div>`).join('');
  }
  function dueCategory(task, reference) {
    if(['완료','취소'].includes(task.상태))return null;if(!task.마감일)return '마감일 확인 필요';const due=task.마감일.slice(0,10),delta=Math.round((new Date(`${due}T00:00:00`)-new Date(`${reference}T00:00:00`))/86400000);if(delta<0)return '지연';if(delta===0)return '오늘 마감';if(delta<=2)return '마감 임박';return '이후 마감';
  }
  const taskCategories=['지연','오늘 마감','마감 임박','이후 마감','마감일 확인 필요'];
  function renderTasks() {
    if(!state.tasks.length)return;const ref=state.tasks.find((t)=>t.점검기준일)?.점검기준일||'2026-10-20';const open=state.tasks.filter((t)=>!['완료','취소'].includes(t.상태));
    $('incompleteCount').textContent=nf.format(open.length);$('taskStats').innerHTML=taskCategories.map((c)=>`<div class="task-stat ${c==='지연'?'overdue':c==='오늘 마감'?'today':c==='마감 임박'?'soon':c==='마감일 확인 필요'?'missing':''}"><span>${c}</span><strong>${open.filter((t)=>dueCategory(t,ref)===c).length}</strong></div>`).join('')+`<div class="task-stat"><span>전체 준비 항목</span><strong>${state.tasks.length}</strong></div>`;
    const areas=[...new Set(state.tasks.map((t)=>t.업무영역))];const sel=$('taskAreaFilter'),old=sel.value;sel.innerHTML='<option value="">전체 업무 영역</option>'+areas.map((x)=>`<option value="${escapeAttr(x)}">${escapeHtml(x)}</option>`).join('');sel.value=areas.includes(old)?old:'';
    let tasks=open.filter((t)=>!state.taskArea||t.업무영역===state.taskArea).filter((t)=>!state.taskCategory||dueCategory(t,ref)===state.taskCategory).sort((a,b)=>({지연:0,'오늘 마감':1,'마감 임박':2,'마감일 확인 필요':3,'이후 마감':4}[dueCategory(a,ref)]-({지연:0,'오늘 마감':1,'마감 임박':2,'마감일 확인 필요':3,'이후 마감':4}[dueCategory(b,ref)]))||a.마감일.localeCompare(b.마감일));
    $('taskList').innerHTML=tasks.length?tasks.map((t)=>`<div class="task-row"><div><div class="task-name">${escapeHtml(t.준비항목)}</div><div class="task-meta">${escapeHtml(t.업무영역)} · ${escapeHtml(t.task_id)}</div></div><div class="task-role">${escapeHtml(t.담당역할)}</div><div class="task-due">${t.마감일?escapeHtml(t.마감일):'날짜 미정'}</div><span class="task-priority ${t.우선순위==='높음'?'priority-high':t.우선순위==='보통'?'priority-medium':'priority-low'}">${escapeHtml(t.우선순위)} 우선</span><span class="task-check">${dueCategory(t,ref)}</span></div>`).join(''):'<div class="empty-state">조건에 맞는 미완료 항목이 없습니다.</div>';
    $('taskFooter').textContent=`점검 기준일 ${ref} · 완료 ${state.tasks.filter((t)=>t.상태==='완료').length}건 · 취소 ${state.tasks.filter((t)=>t.상태==='취소').length}건 · 미완료 ${open.length}건`;
  }
  function bind(){
    FILTERS.forEach(([id])=>$(id).addEventListener('change',renderDashboard));
    $('clearFilters').addEventListener('click',()=>{FILTERS.forEach(([id])=>$(id).value='');$('searchInput').value='';state.search='';renderDashboard();});
    $('searchInput').addEventListener('input',e=>{state.search=e.target.value;renderDashboard();});
    document.querySelectorAll('[data-chart-mode]').forEach(button=>button.addEventListener('click',()=>{state.chartMode=button.dataset.chartMode;document.querySelectorAll('[data-chart-mode]').forEach(b=>b.classList.toggle('selected',b===button));renderChart(filteredRecords());}));
    $('reportButton').addEventListener('click',reportDownload);$('refreshButton').addEventListener('click',loadAll);$('salesUpload').addEventListener('change',e=>{if(e.target.files.length)uploadFiles([...e.target.files]);e.target.value='';});
    $('taskAreaFilter').addEventListener('change',e=>{state.taskArea=e.target.value;renderTasks();});$('taskStats').addEventListener('click',e=>{const card=e.target.closest('.task-stat');if(!card)return;const label=card.querySelector('span').textContent;state.taskCategory=taskCategories.includes(label)?(state.taskCategory===label?'':label):'';renderTasks();});
  }
  window.SalesApp={getRecords:()=>structuredClone(state.records),getFilteredRecords:()=>structuredClone(filteredRecords()),getMemos:()=>({...state.memos}),getValidation:()=>structuredClone(state.validation),getSummary:()=>SalesData.summarize(filteredRecords()),getChartGroups:()=>chartGroups(filteredRecords()),getFilters:currentFilters,setFilters:(filters)=>{FILTERS.forEach(([id,key])=>$(id).value=filters[key]||'');renderDashboard();},setSearch:(search)=>{state.search=search;$('searchInput').value=search;renderDashboard();},saveMemo,uploadFiles,buildReport,reportDownload,getLastReport:()=>state.lastReport,reload:loadAll};
  bind();if(memoReadError)$('memoStatus').textContent=memoReadError;loadAll();
})();
