/* Spreadsheet input stays read only. All mutations produce new records/workbooks. */
(function (root) {
  'use strict';
  const SOURCES = [
    {file:'01_영업실적.xlsx', path:'A_매출비교/01_영업실적.xlsx', channel:'영업'},
    {file:'02_온라인실적.xlsx', path:'A_매출비교/02_온라인실적.xlsx', channel:'온라인'},
    {file:'03_팝업실적.xlsx', path:'A_매출비교/03_팝업실적.xlsx', channel:'팝업'}
  ];
  const ALIASES = {
    record_id:['record_id','레코드ID','기록번호'], 기준주:['기준주','주차','주간기준일'],
    점포:['점포','점포명','영업점'], 브랜드:['브랜드','브랜드명','행사브랜드'],
    장르:['장르','카테고리','상품군'], 채널:['채널','유통채널','판매채널'],
    매출_만원:['매출_만원','실적(만원)','매출액_만원'], 목표_만원:['목표_만원','목표매출(만원)','목표액_만원'],
    비용_만원:['비용_만원','집행비용(만원)','사용비용_만원'], 상태:['상태','진행상태','진행현황'],
    출처:['출처','근거자료','자료출처'], 기준일:['기준일','확인일','기준일자']
  };
  const REPORT_HEADERS = ['record_id','채널','기준주','점포','브랜드','장르','매출_만원','목표_만원','목표차이_만원','달성률','비용_만원','비용차감액_만원','상태','메모','출처','기준일'];
  const NUMERIC = ['매출_만원','목표_만원','비용_만원'];
  function xlsx() { if (!root.XLSX) throw new Error('XLSX 라이브러리를 불러오지 못했습니다.'); return root.XLSX; }
  function descriptor(source) {
    if (typeof source === 'string') return SOURCES.find(s => s.file === source) || {file:source};
    const file = source.file || source.name;
    return {...SOURCES.find(s => s.file === file), ...source, file};
  }
  function calendarDate(value, context) {
    let parts;
    if (typeof value === 'number' && Number.isFinite(value)) {
      const parsed = xlsx().SSF.parse_date_code(value);
      if (parsed) parts = [parsed.y,parsed.m,parsed.d];
    } else if (Object.prototype.toString.call(value) === '[object Date]' && Number.isFinite(value.getTime())) {
      parts = [value.getFullYear(),value.getMonth()+1,value.getDate()];
    } else {
      const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) parts = match.slice(1).map(Number);
    }
    if (!parts || parts[0] < 1900 || parts[0] > 9999 || parts[1] < 1 || parts[1] > 12 || parts[2] < 1 || parts[2] > 31)
      throw new Error(`${context}: 날짜 형식 오류 (${String(value)})`);
    const canonical = `${String(parts[0]).padStart(4,'0')}-${String(parts[1]).padStart(2,'0')}-${String(parts[2]).padStart(2,'0')}`;
    if (new Date(canonical+'T00:00:00Z').toISOString().slice(0,10) !== canonical) throw new Error(`${context}: 유효하지 않은 날짜 (${canonical})`);
    return canonical;
  }
  function normalizeRows(matrix, source) {
    source = descriptor(source);
    if (!matrix.length) throw new Error(`${source.file}: 빈 시트입니다.`);
    const headers = matrix[0].map(v => String(v == null ? '' : v).trim());
    const indices = {};
    const sourceIndex = SOURCES.findIndex(s => s.file === source.file);
    for (const [key, aliases] of Object.entries(ALIASES)) {
      const accepted = sourceIndex >= 0 ? [aliases[sourceIndex]] : aliases;
      const matches = headers.map((h,i) => accepted.includes(h) ? i : -1).filter(i => i >= 0);
      if (matches.length !== 1) throw new Error(`${source.file}: 필수 열 ${key} ${matches.length ? '중복' : '누락'}`);
      indices[key] = matches[0];
    }
    const records = [];
    matrix.slice(1).forEach((cells, n) => {
      if (!cells.some(v => v !== '' && v !== null && v !== undefined)) return;
      const record = {sourceFile:source.file, sourceRow:n+2};
      Object.keys(ALIASES).forEach(key => { record[key] = cells[indices[key]] ?? ''; });
      if (!String(record.record_id).trim()) throw new Error(`${source.file} ${n+2}행: record_id 공란`);
      record.record_id = String(record.record_id);
      for (const key of ['기준주','기준일']) record[key] = calendarDate(record[key],`${source.file} ${n+2}행 (${record.record_id}) ${key}`);
      for (const key of NUMERIC) {
        const v = record[key];
        if (v === '' || typeof v === 'boolean' || (typeof v !== 'number' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(v).trim())) || !Number.isFinite(Number(v)))
          throw new Error(`${source.file} ${n+2}행 (${record.record_id}): ${key} 숫자 오류`);
        record[key] = Number(v);
      }
      if (!source.channel || record.채널 !== source.channel)
        throw new Error(`${source.file} ${n+2}행 (${record.record_id}): 채널 ${record.채널}, 예상 ${source.channel || '채널 확인 필요'}`);
      records.push(record);
    });
    validateUnique(records);
    return records;
  }
  function validateUnique(records) {
    const seen = new Map();
    records.forEach(r => {
      if (seen.has(r.record_id)) {
        const first = seen.get(r.record_id);
        throw new Error(`중복 record_id ${r.record_id}: ${first.sourceFile} ${first.sourceRow}행 / ${r.sourceFile} ${r.sourceRow}행`);
      }
      seen.set(r.record_id,r);
    });
    return true;
  }
  function filterRecords(records, filters = {}, search = '') {
    const query = String(search).trim().toLocaleLowerCase();
    return records.filter(r => Object.entries(filters).every(([key,value]) => !value || value === '전체' || (Array.isArray(value) ? !value.length || value.includes(r[key]) : String(r[key]) === String(value)))
      && (!query || ['record_id','점포','브랜드','장르','채널','출처','sourceFile'].some(k => String(r[k]).toLocaleLowerCase().includes(query))));
  }
  function summarize(records) {
    const total = records.reduce((a,r) => ({sales:a.sales+r.매출_만원,target:a.target+r.목표_만원,cost:a.cost+r.비용_만원}),{sales:0,target:0,cost:0});
    return {...total,count:records.length,rate:total.target === 0 ? null : total.sales/total.target};
  }
  function rowsFrom(workbook, name, file) {
    const sheet = workbook.Sheets[name];
    if (!sheet) throw new Error(`${file}: ${name} 시트 누락`);
    return xlsx().utils.sheet_to_json(sheet,{header:1,defval:'',raw:true});
  }
  async function fetchWorkbook(path) {
    const response = await fetch(encodeURI(path));
    if (!response.ok) throw new Error(`${path}: 불러오기 실패 (${response.status})`);
    return xlsx().read(await response.arrayBuffer(),{type:'array',cellDates:false});
  }
  function checkTemplate(template) {
    const rows = rowsFrom(template,template.SheetNames[0],'04_보고양식.xlsx');
    if (rows[0]?.length !== REPORT_HEADERS.length || !REPORT_HEADERS.every((h,i) => rows[0][i] === h)) throw new Error('04_보고양식.xlsx: 16개 보고 열 순서가 다릅니다.');
    return true;
  }
  function validationFor(records) {
    return [...new Set(records.map(r => r.sourceFile))].map(file => {
      const rows = records.filter(r => r.sourceFile === file);
      return {file,channel:rows[0]?.채널,count:rows.length,valid:true,message:'필수 12열 · 채널 · ID 유일성 통과'};
    });
  }
  async function loadDefaults() {
    const workbooks = await Promise.all(SOURCES.map(s => fetchWorkbook(s.path)));
    const records = workbooks.flatMap((w,i) => {
      const rows = normalizeRows(rowsFrom(w,'원본',SOURCES[i].file),SOURCES[i]);
      if (rows.length !== 160) throw new Error(`${SOURCES[i].file}: 예상 160행, 현재 ${rows.length}행`);
      return rows;
    });
    validateUnique(records);
    const template = await fetchWorkbook('A_매출비교/04_보고양식.xlsx');
    checkTemplate(template);
    return {records,template,validation:validationFor(records)};
  }
  async function importFiles(files, existingRecords = []) {
    const incoming = []; const filenames = new Set(); const channels = new Set();
    for (const file of Array.from(files)) {
      if (filenames.has(file.name)) throw new Error(`중복 파일: ${file.name}`);
      filenames.add(file.name);
      const workbook = xlsx().read(await file.arrayBuffer(),{type:'array',cellDates:false});
      // Inspect upload headers before rejecting its sheet name, so the supplied
      // missing-column exercise reports the actual missing semantic column.
      const hasSourceSheet = Boolean(workbook.Sheets['원본']);
      const matrix = rowsFrom(workbook,hasSourceSheet ? '원본' : workbook.SheetNames[0],file.name);
      let source = SOURCES.find(s => s.file === file.name);
      if (!source) {
        const headers = (matrix[0] || []).map(String);
        const index = headers.findIndex(h => ALIASES.채널.includes(h));
        const distinct = [...new Set(matrix.slice(1).filter(r => r.some(v => v !== '')).map(r => r[index]))];
        source = {file:file.name,channel:distinct.length === 1 && SOURCES.some(s => s.channel === distinct[0]) ? distinct[0] : undefined};
      }
      const rows = normalizeRows(matrix,source);
      if (!hasSourceSheet) throw new Error(`${file.name}: 원본 시트 누락`);
      if (!rows.length) throw new Error(`${file.name}: 데이터 행이 없습니다.`);
      if (channels.has(source.channel)) throw new Error(`${file.name}: 한 번에 같은 채널 파일을 여러 개 넣을 수 없습니다 (${source.channel}).`);
      channels.add(source.channel);
      incoming.push(...rows);
    }
    validateUnique(incoming);
    const records = [...existingRecords.filter(r => !channels.has(r.채널)),...incoming];
    validateUnique(records);
    return {records,validation:validationFor(records)};
  }
  function buildReport(records, memos = {}, template) {
    if (template) checkTemplate(template);
    validateUnique(records);
    const rows = records.map(r => REPORT_HEADERS.map(key => {
      if (key === '목표차이_만원') return r.매출_만원-r.목표_만원;
      if (key === '비용차감액_만원') return r.매출_만원-r.비용_만원;
      if (key === '달성률') return r.목표_만원 === 0 ? null : r.매출_만원/r.목표_만원;
      if (key === '메모') return memos instanceof Map ? memos.get(r.record_id) || '' : memos[r.record_id] || '';
      return r[key];
    }));
    const sheet = xlsx().utils.aoa_to_sheet([REPORT_HEADERS,...rows]);
    sheet['!cols'] = REPORT_HEADERS.map((h,i) => ({wch:i === 13 ? 36 : i === 14 ? 32 : Math.max(14,h.length*2)}));
    for (let i = 1; i <= records.length; i++) {
      [6,7,8,10,11].forEach(c => { const cell=sheet[xlsx().utils.encode_cell({r:i,c})]; if(cell) cell.z='#,##0.##'; });
      const rate=sheet[xlsx().utils.encode_cell({r:i,c:9})]; if(rate) rate.z='0.0%';
    }
    sheet['!autofilter'] = {ref:`A1:P${records.length+1}`};
    const workbook = xlsx().utils.book_new();
    xlsx().utils.book_append_sheet(workbook,sheet,template?.SheetNames[0] || '보고서');
    return workbook;
  }
  root.SalesData = {SOURCES,REPORT_HEADERS,ALIASES,normalizeRows,validateUnique,filterRecords,summarize,loadDefaults,importFiles,buildReport};
})(typeof window !== 'undefined' ? window : globalThis);
