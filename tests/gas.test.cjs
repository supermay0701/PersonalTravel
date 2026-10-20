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
  assert.equal(seed.flights[0].FlightNo,'IT212');
  assert.equal(seed.flights[0].DepartTime,'14:40');
  assert.equal(seed.flights[0].ArriveTime,'17:55');
  assert.equal(seed.flights[1].DepartTime,'12:40');
  assert.equal(seed.flights[1].ArriveTime,'14:25');
  assert.ok(seed.itinerary.some(r=>r.Date==='2026-11-03'&&r.Time==='09:00'&&r.Activity.includes('報到')));
  assert.ok(seed.itinerary.some(r=>r.Date==='2026-11-09'&&r.Time==='08:15'&&r.Activity.includes('抵達')));
  for(const r of seed.itinerary.filter(r=>r.Type==='plane')) {
    const flight = seed.flights.find(f=>f.ID===r.FlightID);
    assert.ok(flight);
    assert.equal(r.Time,flight.DepartTime);
    assert.equal(r.ActualEndTime,flight.ArriveTime);
  }
});

test('既有資料更新只改註解與航班指定欄位，保留勾選、訂位與其他旅程',()=>{
  const h=harness(); h.context.importNovemberTrip_(h.ss);
  const itinerary=h.sheets.get('Itinerary').rows, flights=h.sheets.get('FlightInfo').rows, checklist=h.sheets.get('Checklist').rows;
  itinerary[1][2]=''; itinerary[1][4]='18:00'; itinerary[1][7]='舊註解'; itinerary[1][13]='旅伴';
  itinerary[3][2]='19:40'; // 使用者自行調整的非航班時間不覆寫
  flights[1][1]=''; flights[1][6]=''; flights[1][9]='KEEP-BOOKING';
  checklist[1][1]='舊文字'; checklist[1][2]='TRUE';
  itinerary.push(['other-id','','','','','','其他行程','保留','','','','','other']);
  const count=h.context.refreshNovemberTripDetails_(h.ss);
  assert.equal(count.Itinerary,1); assert.equal(count.FlightInfo,1); assert.equal(count.Checklist,1);
  assert.equal(itinerary[1][2],'14:40'); assert.equal(itinerary[1][4],'17:55');
  assert.equal(itinerary[1][13],'旅伴'); assert.equal(itinerary[3][2],'19:40');
  assert.equal(flights[1][9],'KEEP-BOOKING'); assert.equal(checklist[1][2],'TRUE');
  assert.equal(itinerary.at(-1)[7],'保留');
  const writes=h.metrics.writes;
  h.context.refreshNovemberTripDetails_(h.ss);
  assert.equal(h.metrics.writes,writes);
});

test('更新前若缺少航班或 ID 衝突，所有資料保持原樣',()=>{
  const h=harness(); h.context.importNovemberTrip_(h.ss);
  h.sheets.get('Itinerary').rows[1][7]='舊註解';
  h.sheets.get('FlightInfo').rows[1][11]='other';
  const writes=h.metrics.writes;
  assert.throws(()=>h.context.refreshNovemberTripDetails_(h.ss),/唯一的旅程記錄/);
  assert.equal(h.metrics.writes,writes);
  assert.equal(h.sheets.get('Itinerary').rows[1][7],'舊註解');
});

test('交通修訂採先晚餐再入住，轉乘與機場巴士時間銜接正確',()=>{
  const {seed}=harness(), row=id=>seed.itinerary.find(r=>r.ID===id);
  assert.equal(row('nov26-d1-06').Time,'20:20');
  assert.equal(row('nov26-d1-07').Time,'20:40');
  assert.equal(row('nov26-d1-04').Time,'21:40');
  assert.equal(row('nov26-d1-05').Time,'22:00');
  assert.equal(row('nov26-d1-08').Type,'activity');
  assert.equal(row('nov26-d4-02').Time,'11:34');
  assert.equal(row('nov26-d4-02').Duration,'34');
  assert.equal(row('nov26-d4-03').Time,'12:08');
  assert.equal(row('nov26-d4-03').Duration,'75');
  assert.equal(row('nov26-d10-02').Duration,'10');
  assert.equal(row('nov26-d10-03').Time,'08:25');
  assert.equal(row('nov26-d10-03').Duration,'46');
  assert.equal(row('nov26-d10-04').Time,'09:15');
});

test('交通修訂限定指定 ID，保留航班、其他註解、費用與勾選',()=>{
  const h=harness(); h.context.importNovemberTrip_(h.ss);
  const rows=h.sheets.get('Itinerary').rows;
  const dinner=rows.find(r=>r[0]==='nov26-d1-07');
  dinner[2]='21:45'; dinner[7]='先入住再吃飯'; dinner[8]='1000'; dinner[13]='旅伴';
  const unrelated=rows.find(r=>r[0]==='nov26-d3-01'); unrelated[7]='自訂早餐提醒';
  h.sheets.get('FlightInfo').rows[1][9]='KEEP-BOOKING';
  h.sheets.get('Checklist').rows[24][1]='舊順序'; h.sheets.get('Checklist').rows[24][2]='TRUE';
  const flights=JSON.stringify(h.sheets.get('FlightInfo').rows);
  const count=h.context.refreshNovemberTransportPlan_(h.ss);
  assert.equal(count.Itinerary,1); assert.equal(count.Checklist,1);
  assert.equal(dinner[2],'20:40'); assert.equal(dinner[8],'1000'); assert.equal(dinner[13],'旅伴');
  assert.equal(unrelated[7],'自訂早餐提醒'); assert.equal(h.sheets.get('Checklist').rows[24][2],'TRUE');
  assert.equal(JSON.stringify(h.sheets.get('FlightInfo').rows),flights);
  const writes=h.metrics.writes; h.context.refreshNovemberTransportPlan_(h.ss); assert.equal(h.metrics.writes,writes);
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

test('行程編輯同步航班並保留帳務；刪除仍清理關聯',()=>{
  const h=harness();
  const created=h.post({action:'create',type:'plane',day:'第1天',activity:'測試航班',time:'09:00',arriveTime:'12:00',flightNo:'TEST',recordExpense:true,expense:200,currency:'JPY'});
  assert.equal(created.status,'success');
  const update=h.post({action:'update',id:created.id,type:'plane',time:'10:00',arriveTime:'13:00',activity:'更新航班',recordExpense:true,expense:0});
  assert.equal(update.status,'success');
  assert.equal(update.changes.flights[0].DepartTime,'10:00');
  assert.equal(update.changes.expenses[0].Amount,'200');
  const expenseUpdate=h.post({action:'updateExpense',id:update.changes.expenses[0].ID,amount:0});
  assert.equal(expenseUpdate.changes.expenses[0].Amount,'0');
  assert.equal(h.post({action:'delete',id:created.id}).changes.flights.length,0);
  assert.equal(h.sheets.get('Expense').rows.length,1);
});

test('前端與 service worker JavaScript 語法可解析',()=>{
  const html=fs.readFileSync('index.html','utf8');
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  new vm.Script(fs.readFileSync('sw.js','utf8'));
});

module.exports = {harness};


test('帳務修改後儲存舊行程，不覆寫金額、幣別或分攤資料',()=>{
  const h=harness();
  const created=h.post({action:'create',day:'第1天',activity:'晚餐',recordExpense:true,expense:'100',currency:'JPY'});
  const id=created.changes.expenses[0].ID;
  h.post({action:'updateExpense',id,amount:'200',currency:'TWD',description:'實際晚餐',participants:'A,B',payer:'A',category:'餐飲'});
  const before=JSON.stringify(h.sheets.get('Expense').rows);
  const result=h.post({action:'update',id:created.id,note:'只改備註',activity:'舊名稱',recordExpense:true,expense:'100',currency:'JPY',participants:'A',payer:'B'});
  assert.equal(result.status,'success');
  assert.equal(JSON.stringify(h.sheets.get('Expense').rows),before);
  assert.equal(result.changes.expenses[0].Amount,'200');
  const unlinked=h.post({action:'update',id:created.id,recordExpense:false,expense:'100'});
  assert.equal(unlinked.changes.expenses.length,0);
  assert.equal(unlinked.changes.itinerary[0].ExpenseID,'');
  assert.equal(unlinked.changes.itinerary[0].Expense,'');
});


test('公開讀取及快取不含帳務與訂位；私人讀取需旅程授權',()=>{
  const h=harness(); h.context.importNovemberTrip_(h.ss);
  h.post({action:'createExpense',amount:'123',description:'PRIVATE_EXPENSE',payer:'PRIVATE_PAYER'});
  h.post({action:'updateFlight',id:h.seed.flights[0].ID,bookingRef:'PRIVATE_BOOKING',note:'PRIVATE_NOTE'});
  for(let i=0;i<2;i++) {
    const result=h.get({trip:h.seed.tripId});
    assert.equal(result.expenses.length,0);
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE_/);
  }
  for(const apiKey of ['', 'invalid', 'other-key']) {
    assert.equal(h.post({action:'readPrivate',apiKey}).status,'error');
  }
  const result=h.post({action:'readPrivate',apiKey:'nov-key'});
  assert.equal(result.data.expenses[0].Amount,'123');
  assert.equal(result.data.flights[0].BookingRef,'PRIVATE_BOOKING');
  assert.equal(h.post({action:'verify',apiKey:'nov-key'}).data.expenses.length,1);
});

test('無預設設定時只回傳最新旅程，舊版版本號無法命中公開快取',()=>{
  const h=harness();h.context.importNovemberTrip_(h.ss);h.sheets.get('Config').rows=[['Key','Value']];
  h.sheets.get('Itinerary').rows.push(['old','','','','','','舊行程','','','','','','other','','','','2026-01-01']);
  const home=h.get({});
  assert.equal(home.resolvedTrip,h.seed.tripId);
  assert.ok(home.itinerary.length > 0);
  assert.ok(home.itinerary.every(r=>r.TripID===h.seed.tripId));
  const result=h.get({trip:h.seed.tripId,version:'1.0.123'});
  assert.equal(result.notModified,undefined);
  assert.match(result.version,/^secure-v2\./);
});

test('預設行程需目標旅程密碼、驗證存在並儲存至 Config；網址參數優先',()=>{
  const h=harness(); h.context.importNovemberTrip_(h.ss);
  const before=h.metrics.writes;
  for(const apiKey of ['','wrong','other-key']) assert.equal(h.post({action:'setDefaultTrip',apiKey}).status,'error');
  assert.equal(h.metrics.writes,before);
  assert.equal(h.post({action:'setDefaultTrip',tripId:'unknown'}).status,'error');
  assert.equal(h.sheets.get('Config').rows[1][1],'other');
  assert.equal(h.get({}).resolvedTrip,'other');
  const saved=h.post({action:'setDefaultTrip',apiKey:'nov-key'});
  assert.equal(saved.defaultTrip,h.seed.tripId);
  assert.equal(saved.changes,undefined);
  assert.equal(h.get({}).resolvedTrip,h.seed.tripId);
  assert.equal(h.get({trip:'other'}).itinerary.length,0);
  assert.equal(h.isLocked(),false);
});

test('缺少 Config 可建立；有設定時保留選擇，未設定時依旅程首日找最新',()=>{
  const h=harness();h.context.importNovemberTrip_(h.ss);h.sheets.delete('Config');
  assert.equal(h.get({}).resolvedTrip,h.seed.tripId);
  h.sheets.get('Itinerary').rows.push(['future','','','','','','未來','','','','','','future','','','','2027-01-01']);
  assert.equal(h.get({}).resolvedTrip,'future');
  assert.equal(h.post({action:'setDefaultTrip'}).status,'success');
  assert.equal(h.get({}).resolvedTrip,h.seed.tripId);
});

test('大津修訂保留原 ID、帳務與其他行程，新增項目可重跑且順序正確',()=>{
  const h=harness(); h.context.importNovemberTrip_(h.ss);
  const sheet=h.sheets.get('Itinerary');
  sheet.rows=sheet.rows.filter(r=>!/^nov26-d2-[a-z]/.test(r[0]));
  const train=sheet.rows.find(r=>r[0]==='nov26-d2-04');
  train[5]='taxi'; train[8]='1500';train[13]='旅伴';train[15]='existing-expense';
  const breakfast=sheet.rows.find(r=>r[0]==='nov26-d3-01'); breakfast[7]='保留提醒';
  const others=JSON.stringify(['Expense','FlightInfo','Checklist','Config'].map(n=>h.sheets.get(n).rows));
  const result=h.context.refreshNovemberOtsuPlan_(h.ss);
  assert.equal(result.Itinerary,11);
  assert.equal(train[5],'train');assert.equal(train[8],'1500');assert.equal(train[13],'旅伴');assert.equal(train[15],'existing-expense');
  assert.equal(breakfast[7],'保留提醒');
  assert.equal(JSON.stringify(['Expense','FlightInfo','Checklist','Config'].map(n=>h.sheets.get(n).rows)),others);
  const writes=h.metrics.writes;h.context.refreshNovemberOtsuPlan_(h.ss);assert.equal(h.metrics.writes,writes);
  const day=h.seed.itinerary.filter(r=>r.Day==='第2天').sort((a,b)=>a.Time.localeCompare(b.Time));
  const order=['天孫神社參拜','午餐｜松本食堂','島ノ関駅 → 大津市役所前站｜京阪電車','確認皇子山入口、輕度伸展','琵琶湖疏水散步','三尾神社參拜','大津港散步','晚餐｜滋賀大津ふぐ料理（待預約）','Fresco 超市 大津店｜採買'];
  assert.deepEqual(Array.from(day.filter(r=>order.includes(r.Activity)),r=>r.Activity),order);
  assert.equal(day.find(r=>r.ID==='nov26-d2-07').Time,'18:15');
  assert.match(h.seed.itinerary.find(r=>r.ID==='nov26-d3-07').Note,/如果不順就吃飯店附近/);
});

test('大津修訂先驗證所有 ID，衝突或缺少舊資料時不寫入',()=>{
  for (const corrupt of ['conflict','missing']) {
    const h=harness();h.context.importNovemberTrip_(h.ss);
    const rows=h.sheets.get('Itinerary').rows;
    if(corrupt==='conflict') rows.find(r=>r[0]==='nov26-d2-fresco')[12]='other';
    else rows.splice(rows.findIndex(r=>r[0]==='nov26-d2-07'),1);
    const before=h.metrics.writes;
    assert.throws(()=>h.context.refreshNovemberOtsuPlan_(h.ss),/唯一的旅程記錄/);
    assert.equal(h.metrics.writes,before);
  }
});

test('格式驗證在寫入前拒絕非法時間、金額、日期、網址及公式',()=>{
  const h=harness();
  for(const patch of [{time:'25:00'},{time:'<img src=x>'},{expense:'1x'},{duration:-1},{date:'2026-02-30'},{mapUrl:'javascript:alert(1)'},{imageUrl:'data:text/html,test'},{activity:'=IMPORTXML("url","*")'},{type:'invalid'},{currency:'USD'}]) {
    const before=h.metrics.writes;
    assert.equal(h.post({action:'create',activity:'測試',...patch}).status,'error');
    assert.equal(h.metrics.writes,before);
  }
});

test('航班與行程雙向同步時間日期，已關聯航班不可單獨刪除',()=>{
  const h=harness();h.context.importNovemberTrip_(h.ss);
  const item=h.seed.itinerary.find(i=>i.Type==='plane');
  let result=h.post({action:'updateFlight',id:item.FlightID,departTime:'15:00',arriveTime:'18:00',departDate:'2026-11-02'});
  assert.equal(result.changes.itinerary.find(i=>i.ID===item.ID).Time,'15:00');
  assert.equal(result.changes.itinerary.find(i=>i.ID===item.ID).Date,'2026-11-02');
  const before=h.metrics.writes;
  assert.equal(h.post({action:'deleteFlight',id:item.FlightID}).status,'error');
  assert.equal(h.metrics.writes,before);
  result=h.post({action:'update',id:item.ID,type:'plane',time:'16:00',arriveTime:'19:00',departDate:'2026-11-03'});
  assert.equal(result.changes.flights.find(f=>f.ID===item.FlightID).DepartTime,'16:00');
  assert.equal(result.changes.itinerary.find(i=>i.ID===item.ID).Date,'2026-11-03');
  h.sheets.get('Itinerary').rows.find(r=>r[0]===item.ID)[2]='STALE';
  assert.equal(h.get({trip:h.seed.tripId}).itinerary.find(i=>i.ID===item.ID).Time,'16:00');
  result=h.post({action:'update',id:item.ID,type:'activity'});
  assert.equal(result.changes.itinerary.find(i=>i.ID===item.ID).FlightID,'');
  assert.equal(result.changes.flights.some(f=>f.ID===item.FlightID),false);
  const independent=h.post({action:'createFlight',flightNo:'LOCAL'});
  assert.equal(h.post({action:'deleteFlight',id:independent.id}).status,'success');
});
