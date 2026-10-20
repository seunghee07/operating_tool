import json,pathlib
from openpyxl import load_workbook
root=pathlib.Path(__file__).resolve().parents[1]
expected=json.loads((root/'results/verify-expected.json').read_text(encoding='utf-8'))
checks=[]
for name in ['verify-module-report.xlsx','verify-browser-report.xlsx']:
    book=load_workbook(root/'results'/name,data_only=True)
    ws=book.active
    rows=list(ws.values)
    assert list(rows[0])==expected['reportHeaders']
    assert len(rows)==481
    source={r['record_id']:r for r in expected['rows']}
    assert sum(r[6] for r in rows[1:])==expected['sales']
    assert sum(r[7] for r in rows[1:])==expected['target']
    assert sum(r[10] for r in rows[1:])==expected['cost']
    for row in rows[1:]:
        ref=source[row[0]]
        for col,key in [(1,'채널'),(2,'기준주'),(3,'점포'),(4,'브랜드'),(5,'장르'),(6,'매출_만원'),(7,'목표_만원'),(10,'비용_만원'),(12,'상태'),(14,'출처'),(15,'기준일')]:
            assert row[col]==ref[key],(name,row[0],key,row[col],ref[key])
        assert row[8]==row[6]-row[7]
        assert row[11]==row[6]-row[10]
        if ref['목표_만원']==0: assert row[9] is None
        else: assert abs(row[9]-row[6]/row[7])<1e-12
    assert rows[1][13] is not None and 'Verifier' in rows[1][13]
    checks.append({'file':name,'rows':480,'headerColumns':16,'sales':expected['sales'],'target':expected['target'],'cost':expected['cost'],'zeroTargetBlank':2,'memo':rows[1][13],'status':'pass'})
(root/'results/verify-xlsx-results.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(checks,ensure_ascii=False))
