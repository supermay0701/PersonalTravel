const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
  const metrics = {reads:0, writes:0, opens:0, locks:0};
  class Sheet {
    constructor(rows = []) { this.rows = rows; this.maxRows = 1000; this.maxCols = 26; }
    getDataRange() {
      metrics.reads++;
      return {getValues:() => this.rows.map(r=>r.slice()), getDisplayValues:() => this.rows.map(r=>r.map(v=>String(v == null ? '' : v)))};
    }
    getLastRow() { return this.rows.length; }
    getMaxRows() { return this.maxRows; }
    getMaxColumns() { return this.maxCols; }
    insertRowsAfter(_, n) { this.maxRows += n; }
    insertColumnsAfter(_, n) { this.maxCols += n; }
    getRange(row, col, count=1, width=1) {
      const range = {
        setNumberFormat:() => range,
        setValue:v => range.setValues([[v]]),
        setValues:values => {
          assert.equal(values.length, count); metrics.writes++;
          values.forEach((r,i) => { assert.equal(r.length, width); this.rows[row+i-1] ||= []; r.forEach((v,j)=>{this.rows[row+i-1][col+j-1]=v;}); });
          return range;
        }
      };
      return range;
    }
    appendRow(row) { this.rows.push(row); metrics.writes++; }
    insertRowAfter(row) { this.rows.splice(row,0,[]); }
    deleteRow(row) { this.rows.splice(row-1,1); metrics.writes++; }
  }
  const sheets = new Map(), properties = new Map(), cache = new Map();
  const ss = {getSheetByName:name=>sheets.get(name), insertSheet:name=>{const s=new Sheet();sheets.set(name,s);return s;}};
  let locked = false, busy = false, clock = Date.now(), uuid = 0;
  const context = vm.createContext({
    console, Map, Date:class extends Date {static now(){return clock;}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v)})},
    CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null, put:(k,v)=>cache.set(k,v)})},
    SpreadsheetApp:{getActiveSpreadsheet:()=>{metrics.opens++;return ss;},flush:()=>{}},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(busy)return false;locked=true;metrics.locks++;return true;}, waitLock:()=>{locked=true;},hasLock:()=>locked,releaseLock:()=>{locked=false;}})},
    Utilities:{getUuid:()=>String(++uuid).padStart(8,'0')+'-0000'},
    ContentService:{MimeType:{JSON:'json'}, createTextOutput:(text='')=>({text,setMimeType(){return this;},setContent(t){this.text=t;return this;},getContent(){return this.text;}})}
  });
  for(const file of ['data/november2026.js','Code.gs','ImportNovember.gs']) vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  const evaluate = text => vm.runInContext(text,context);
  const seed = context.getNovemberTripSeed();
  for(const [name,col] of [['Itinerary','IT_COL'],['FlightInfo','FL_COL'],['Checklist','CK_COL'],['Expense','EX_COL'],['Participants','PT_COL']]) sheets.set(name,new Sheet([evaluate(`Object.keys(${col})`)]));
  sheets.set('Auth',new Sheet([['User','Key','TripID'],['owner','all-key',''],['november','nov-key',seed.tripId],['other','other-key','other']]));
  sheets.set('Config',new Sheet([['Key','Value'],['defaultTrip','other']]));
  return {context, seed, sheets, properties, metrics, ss, evaluate,
    post:req=>JSON.parse(context.doPost({postData:{contents:JSON.stringify({apiKey:'all-key',tripId:seed.tripId,...req})}}).getContent()),
    get:params=>JSON.parse(context.doGet({parameter:params}).getContent()),
    advance:ms=>{clock+=ms;}, setBusy:v=>{busy=v;}, isLocked:()=>locked};
}

test('行程涵蓋 10 天，兩場測試時間、航班關聯與未定欄位正確',()=>{
  const {seed}=harness();
  assert.equal(new Set(seed.itinerary.map(r=>r.Date)).size,10);
  assert.equal(new Set(seed.itinerary.map(r=>r.ID)).size,seed.itinerary.length);
  for(const r of seed.itinerary) { assert.equal(r.TripID,seed.tripId); assert.equal(r.ExpenseID,''); }
  assert.equal(seed.expenses.length,0);
  assert.equal(seed.participants.length,0);
  assert.equal(seed.flights[0].DepartTime,'');
  assert.equal(seed.flights[1].ArriveTime,'');
  assert.ok(seed.itinerary.some(r=>r.Date==='2026-11-03'&&r.Time==='09:00'&&r.Activity.includes('報到')));
  assert.ok(seed.itinerary.some(r=>r.Date==='2026-11-09'&&r.Time==='08:15'&&r.Activity.includes('抵達')));
  for(const r of seed.itinerary.filter(r=>r.Type==='plane')) assert.ok(seed.flights.some(f=>f.ID===r.FlightID));
});

test('匯入重跑不重複、不覆蓋人工修改、不改預設旅行',()=>{
  const h=harness();
  const first=h.context.importNovemberTrip_(h.ss);
  assert.equal(first.Itinerary,h.seed.itinerary.length);
  assert.equal(h.metrics.writes,3);
  h.sheets.get('Itinerary').rows[1][7]='人工更新';
  h.sheets.get('Checklist').rows[1][2]='TRUE';
  const second=h.context.importNovemberTrip_(h.ss);
  assert.equal(second.Itinerary,0); assert.equal(second.Checklist,0);
  assert.equal(h.sheets.get('Itinerary').rows[1][7],'人工更新');
  assert.equal(h.sheets.get('Checklist').rows[1][2],'TRUE');
  assert.equal(h.sheets.get('Config').rows[1][1],'other');
});

test('任何表頭錯誤都在匯入寫入前停止',()=>{
  const h=harness(); h.sheets.get('Checklist').rows[0][2]='Wrong';
  assert.throws(()=>h.context.importNovemberTrip_(h.ss),/欄位順序/);
  assert.equal(h.metrics.writes,0);
});

test('匯入拒絕跨旅程 ID 衝突',()=>{
  const h=harness(); const row=Object.values(h.seed.checklist[0]); row[3]='other';
  h.sheets.get('Checklist').rows.push(row);
  assert.throws(()=>h.context.importNovemberTrip_(h.ss),/ID 與其他旅程衝突/);
  assert.equal(h.metrics.writes,0);
});

test('局部批次更新保留未提供欄位與公式，保留零和空字串',()=>{
  const h=harness(); const sheet=h.sheets.get('Expense');
  sheet.rows.push(['e','day','09:00','交通','=CUSTOM()','100','JPY','','','','other','']);
  h.context.setFields_(sheet,2,h.evaluate('EX_COL'),{Time:'10:00',Category:'餐飲',Amount:0,Payer:'',Description:undefined});
  assert.equal(sheet.rows[1][4],'=CUSTOM()'); assert.equal(sheet.rows[1][5],0);
  assert.equal(sheet.rows[1][7],''); assert.equal(h.metrics.writes,3);
});

test('匯入 API 回傳更新資料，可使用原有旅程限定金鑰',()=>{
  const h=harness(); const r=h.post({action:'importNovemberTrip',apiKey:'nov-key'});
  assert.equal(r.status,'success'); assert.equal(r.changes.itinerary.length,h.seed.itinerary.length);
  assert.equal(r.tripId,h.seed.tripId); assert.ok(r.version); assert.equal(h.isLocked(),false);
});

test('CRUD 依資料實際 TripID 驗證，防止省略或偽造旅程繞過權限',()=>{
  const h=harness(); h.context.importNovemberTrip_(h.ss); const id=h.seed.itinerary[0].ID;
  for(const tripId of [undefined,'other']) {
    const r=h.post({action:'update',id,tripId,apiKey:'other-key',note:'不應寫入'});
    assert.equal(r.status,'error');
  }
  assert.notEqual(h.sheets.get('Itinerary').rows[1][7],'不應寫入');
  assert.equal(h.post({action:'update',id,tripId:undefined,apiKey:'nov-key',note:'允許舊前端'}).status,'success');
});

test('清單明確設定狀態，重送同一請求不反向切換',()=>{
  const h=harness(); h.context.importNovemberTrip_(h.ss);
  const req={action:'toggleCheck',id:h.seed.checklist[0].ID,checked:true};
  assert.equal(h.post(req).status,'success'); assert.equal(h.post(req).status,'success');
  assert.equal(h.sheets.get('Checklist').rows[1][2],'TRUE');
});

test('未變更版本回傳輕量回應，不開啟試算表',()=>{
  const h=harness(); const first=h.get({trip:h.seed.tripId});
  const opens=h.metrics.opens, reads=h.metrics.reads;
  const second=h.get({trip:h.seed.tripId,version:first.version});
  assert.equal(second.notModified,true); assert.equal(h.metrics.opens,opens); assert.equal(h.metrics.reads,reads);
});

test('快取命中不開表；各旅程寫入不使另一旅程版本失效',()=>{
  const h=harness(); h.context.importNovemberTrip_(h.ss);
  const before=h.get({trip:'other'}); const opens=h.metrics.opens;
  h.get({trip:'other'}); assert.equal(h.metrics.opens,opens);
  h.post({action:'toggleCheck',id:h.seed.checklist[0].ID,checked:true});
  assert.equal(h.get({trip:'other'}).version,before.version);
});

test('沒有 onEdit 觸發器也會在時間桶更新後讀到人工修改',()=>{
  const h=harness(); h.context.importNovemberTrip_(h.ss); const old=h.get({trip:h.seed.tripId});
  h.sheets.get('Itinerary').rows[1][7]='人工編輯'; h.advance(300001);
  const fresh=h.get({trip:h.seed.tripId,version:old.version});
  assert.notEqual(fresh.version,old.version); assert.equal(fresh.itinerary[0].Note,'人工編輯');
});

test('寫入鎖忙碌時不更動資料；例外路徑釋放鎖並使快取失效',()=>{
  const h=harness(); h.setBusy(true);
  assert.equal(h.post({action:'importNovemberTrip'}).status,'error'); assert.equal(h.metrics.writes,0);
  h.setBusy(false); h.sheets.get('Checklist').rows[0][0]='錯誤';
  assert.equal(h.post({action:'importNovemberTrip'}).status,'error'); assert.equal(h.isLocked(),false);
  assert.ok(h.properties.get('tripGen_'+h.seed.tripId));
});

test('行程編輯仍同步航班與帳務；刪除仍清理關聯',()=>{
  const h=harness();
  const created=h.post({action:'create',type:'plane',day:'第1天',activity:'測試航班',time:'09:00',arriveTime:'12:00',flightNo:'TEST',recordExpense:true,expense:200,currency:'JPY'});
  assert.equal(created.status,'success');
  const update=h.post({action:'update',id:created.id,type:'plane',time:'10:00',arriveTime:'13:00',activity:'更新航班',recordExpense:true,expense:0});
  assert.equal(update.status,'success');
  assert.equal(update.changes.flights[0].DepartTime,'10:00');
  assert.equal(update.changes.expenses[0].Amount,'0');
  assert.equal(h.post({action:'delete',id:created.id}).changes.flights.length,0);
  assert.equal(h.sheets.get('Expense').rows.length,1);
});

test('前端與 service worker JavaScript 語法可解析',()=>{
  const html=fs.readFileSync('index.html','utf8');
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  new vm.Script(fs.readFileSync('sw.js','utf8'));
});

module.exports = {harness};
