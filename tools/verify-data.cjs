const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');process.chdir(root);
global.XLSX=require(path.join(root,'vendor/xlsx.full.min.js'));
vm.runInThisContext(fs.readFileSync('sales-data.js','utf8'));
const D=global.SalesData, expected=JSON.parse(fs.readFileSync('results/verify-expected.json','utf8'));
const checks=[];const pass=(name)=>checks.push({name,status:'pass'});
function load(name){const b=XLSX.read(fs.readFileSync(path.join(root,'A_매출비교',name)),{type:'buffer',cellDates:false});return XLSX.utils.sheet_to_json(b.Sheets['원본'],{header:1,defval:''});}
const records=D.SOURCES.flatMap(s=>D.normalizeRows(load(s.file),s));
assert.equal(records.length,480);D.validateUnique(records);
for(const s of D.SOURCES){const b=XLSX.read(fs.readFileSync(path.join(root,'A_매출비교',s.file)),{type:'buffer',cellDates:true});const rows=D.normalizeRows(XLSX.utils.sheet_to_json(b.Sheets['원본'],{header:1,defval:''}),s);assert.deepEqual(rows.map(r=>[r.기준주,r.기준일]),records.filter(r=>r.채널===s.channel).map(r=>[r.기준주,r.기준일]));}pass('Excel date serial and Date objects preserve original calendar dates');
for(const key of ['record_id','기준주','점포','브랜드','장르','채널','매출_만원','목표_만원','비용_만원','상태','출처','기준일']) assert.deepEqual(records.map(r=>r[key]),expected.rows.map(r=>r[key]),key);
assert.deepEqual(D.summarize(records),{count:480,sales:385287,target:386120,cost:230910,rate:385287/386120});pass('480 rows, every standardized field, totals, source values');
for(const key of ['点포'.replace('点','점'),'채널','기준주','브랜드','장르']){
const val=records[17][key], subset=D.filterRecords(records,{[key]:val});assert.deepEqual(subset.map(r=>r.record_id),expected.rows.filter(r=>r[key]===val).map(r=>r.record_id));pass(`filter ${key}`);
}
function file(relative){const data=fs.readFileSync(relative);return {name:path.basename(relative),arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};}
(async()=>{
const snapshot=JSON.stringify(records);
for(const [name,label] of [['A_매출비교/05_오류_열누락.xlsx','missing column'],['results/verify-duplicate-within.xlsx','duplicate within'],['results/verify-duplicate-cross.xlsx','duplicate cross'],['results/verify-channel-mismatch.xlsx','channel mismatch']]){
let err;try{await D.importFiles([file(name)],records);}catch(e){err=e;}
assert.ok(err,label);assert.equal(JSON.stringify(records),snapshot);pass(`${label}: rejected and previous 480 preserved`);}
let err;try{await D.importFiles([file('A_매출비교/01_영업실적.xlsx'),file('A_매출비교/01_영업실적.xlsx')],records);}catch(e){err=e;}assert.ok(err);pass('same file selected twice rejected');
const same=await D.importFiles([file('A_매출비교/01_영업실적.xlsx')],records);assert.equal(same.records.length,480);assert.equal(D.summarize(same.records).sales,expected.sales);pass('normal reimport replaces channel and keeps 480 rows');
const zero=records.filter(r=>r.목표_만원===0);assert.equal(D.summarize(zero).rate,null);pass('zero target aggregate rate null');
const book=D.buildReport(records,{[records[0].record_id]:'Verifier 메모'},XLSX.read(fs.readFileSync('A_매출비교/04_보고양식.xlsx'),{type:'buffer'}));
fs.writeFileSync('results/verify-module-report.xlsx',XLSX.write(book,{type:'buffer',bookType:'xlsx'}));pass('new XLSX saved with memo and zero target cells');
fs.writeFileSync('results/verify-data-results.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
