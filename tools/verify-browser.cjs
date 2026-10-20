const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('C:/Users/RMARKET/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');process.chdir(root);
const expected=JSON.parse(fs.readFileSync('results/verify-expected.json','utf8'));
const checks=[], errors=[];
const pass=(name)=>{checks.push({name,status:'pass'});console.log('PASS '+name)};
const filters=[['storeFilter','점포'],['channelFilter','채널'],['weekFilter','기준주'],['brandFilter','브랜드'],['genreFilter','장르']];
(async()=>{
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1000}});
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>window.SalesApp?.getRecords().length===480);
const actual=await page.evaluate(()=>SalesApp.getRecords());
for(let i=0;i<480;i++)for(const key of Object.keys(expected.rows[i]))assert.deepEqual(actual[i][key],expected.rows[i][key],`row ${i} ${key}`);
pass('browser loads exact 480 source rows and all 12 fields');
async function checkView(label,rows){
const sums={sales:rows.reduce((s,r)=>s+r.매출_만원,0),target:rows.reduce((s,r)=>s+r.목표_만원,0)};
assert.equal((await page.locator('#salesKpi').innerText()).replace(/[^0-9]/g,''),String(sums.sales));
assert.equal((await page.locator('#targetKpi').innerText()).replace(/[^0-9]/g,''),String(sums.target));
const rate=await page.locator('#rateKpi').innerText();assert.equal(rate,sums.target?`${(sums.sales/sums.target*100).toFixed(1)}%`:'—');
assert.deepEqual(await page.locator('#recordsBody tr[data-record-id]').evaluateAll(els=>els.map(e=>e.dataset.recordId)),rows.map(r=>r.record_id));
const groups=await page.locator('.chart-group').evaluateAll(els=>els.map(e=>({label:e.dataset.label,sales:+e.dataset.sales,target:+e.dataset.target})));
const stores=[...new Set(rows.map(r=>r.점포))].sort();
assert.deepEqual(groups,stores.map(label=>({label,sales:rows.filter(r=>r.점포===label).reduce((s,r)=>s+r.매출_만원,0),target:rows.filter(r=>r.점포===label).reduce((s,r)=>s+r.목표_만원,0)})));
const report=await page.evaluate(()=>{const b=SalesApp.buildReport();return XLSX.utils.sheet_to_json(b.Sheets[b.SheetNames[0]],{header:1,defval:null})});
assert.deepEqual(report[0],expected.reportHeaders);assert.equal(report.length,rows.length+1);assert.equal(report.slice(1).reduce((s,r)=>s+r[6],0),sums.sales);assert.equal(report.slice(1).reduce((s,r)=>s+r[7],0),sums.target);assert.deepEqual(report.slice(1).map(r=>r[0]),rows.map(r=>r.record_id));
pass(label+' KPI/table/chart/report match');
}
await checkView('all',expected.rows);
for(const [id,key] of filters){await page.click('#clearFilters');const value=expected.rows[17][key];await page.selectOption('#'+id,value);await checkView('filter '+key,expected.rows.filter(r=>r[key]===value));}
await page.click('#clearFilters');const sample=expected.rows[17];for(const [id,key]of filters)await page.selectOption('#'+id,sample[key]);await checkView('combined five filters',expected.rows.filter(r=>filters.every(([,key])=>r[key]===sample[key])));
await page.click('#clearFilters');
for(const [relative,label,contains]of [['A_매출비교/05_오류_열누락.xlsx','missing column','목표'],['results/verify-duplicate-within.xlsx','duplicate within','중복'],['results/verify-duplicate-cross.xlsx','duplicate cross','중복'],['results/verify-channel-mismatch.xlsx','channel mismatch','채널']]){
await page.setInputFiles('#salesUpload',path.join(root,relative));await page.waitForFunction(()=>!document.querySelector('#appError').hidden);const message=await page.locator('#appError').innerText();console.log('UPLOAD ERROR '+message);assert.ok(message.includes(contains),message);assert.equal(await page.evaluate(()=>SalesApp.getRecords().length),480);await checkView(label+' preserves 480',expected.rows);
}
await page.setInputFiles('#salesUpload',path.join(root,'A_매출비교/01_영업실적.xlsx'));await page.waitForFunction(()=>!document.querySelector('#appError').textContent);assert.equal(await page.evaluate(()=>SalesApp.getRecords().length),480);pass('normal original reimport keeps 480');
const id=expected.rows[0].record_id,memo='Verifier 저장 후 새로고침 메모';const input=page.locator('input[data-record-id="'+id+'"]');await input.fill(memo);await input.blur();await page.reload();await page.waitForFunction(()=>window.SalesApp?.getRecords().length===480);assert.equal(await page.locator('input[data-record-id="'+id+'"]').inputValue(),memo);pass('memo keyed by record_id persists reload');
await page.locator('#searchInput').fill(id);await checkView('zero target search',expected.rows.filter(r=>r.record_id===id));
const zeroReport=await page.evaluate(()=>{const b=SalesApp.buildReport();return XLSX.utils.sheet_to_json(b.Sheets[b.SheetNames[0]],{header:1,defval:null})});assert.equal(zeroReport[1][9],null);assert.equal(zeroReport[1][13],memo);assert.equal(await page.locator('#recordsBody tr[data-record-id] td').nth(8).innerText(),'—');pass('zero target screen dash, exported blank, memo');
await page.click('#clearFilters');
await page.evaluate(()=>{window.showSaveFilePicker=undefined;});
const downloadPromise=page.waitForEvent('download');await page.click('#reportButton');const download=await downloadPromise;await download.saveAs(path.join(root,'results/verify-browser-report.xlsx'));pass('actual browser download saved results/verify-browser-report.xlsx');
await page.evaluate(id=>SalesApp.saveMemo(id,''),id);
await page.screenshot({path:'results/verify-browser-desktop.png',fullPage:false});
await page.setViewportSize({width:400,height:844});await page.screenshot({path:'results/verify-browser-mobile.png',fullPage:false});pass('desktop and mobile screenshots saved');
assert.deepEqual(errors,[]);pass('no browser page errors');
}finally{await browser.close();fs.writeFileSync('results/verify-browser-results.json',JSON.stringify({checks,errors},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1});
