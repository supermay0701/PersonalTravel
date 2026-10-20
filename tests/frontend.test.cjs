const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function frontend() {
  const storage = new Map(), requests = [], elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id,{textContent:'',classList:{toggle(){},add(){},remove(){}},style:{setProperty(){}},setAttribute(){}});
    return elements.get(id);
  };
  const context = vm.createContext({
    console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    window:{location:{search:'?trip=osaka-shiga-kumamoto202611'}},
    document:{getElementById:element,documentElement:{style:{setProperty(){}}},querySelector:()=>null,
      createElement:tag=>({tagName:tag,children:[],dataset:{},style:{setProperty(){}},setAttribute(){},appendChild(child){this.children.push(child);}})},
    localStorage:{get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    fetch:(url, options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve:body=>resolve({ok:true,json:async()=>body}),reject}))
  });
  vm.runInContext(fs.readFileSync('data/november2026.js','utf8'),context);
  const html=fs.readFileSync('index.html','utf8');
  const source=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const API_BASE'))[1];
  vm.runInContext(source,context);
  vm.runInContext('renderAll = () => {}; tryRestoreAuth = () => {};',context);
  return {context,storage,requests,elements,run:code=>vm.runInContext(code,context)};
}
const payload = label => ({status:'success',version:label,itinerary:[{ID:label,Day:'第1天',Activity:label}],flights:[],checklist:[],participants:[],expenses:[]});

test('雲端空表先顯示文件預覽，不誤存為已同步資料',async()=>{
  const f=frontend(); const pending=f.run('loadData()');
  assert.equal(f.run('appData._preview'),true);
  f.requests[0].resolve({...payload('empty'),itinerary:[]}); await pending;
  assert.equal(f.run('appData._preview'),true);
  assert.equal(f.storage.has('ver_osaka-shiga-kumamoto202611'),false);
});

test('快速切換旅程，較慢的舊回應不能覆蓋目前旅程',async()=>{
  const f=frontend(); const first=f.run('loadData()');
  f.run("TRIP_ID = 'tokyo2026'"); const second=f.run('loadData()');
  f.requests[1].resolve(payload('tokyo')); await second;
  f.requests[0].resolve(payload('november')); await first;
  assert.equal(f.run('appData.itinerary[0].ID'),'tokyo');
  assert.equal(f.run('TRIP_ID'),'tokyo2026');
});

test('寫入使較早 GET 回應失效，儲存後不多發 GET',async()=>{
  const f=frontend(); f.run("TRIP_ID='tokyo2026'");
  const get=f.run('loadData()'); const post=f.run("apiPost({action:'update',id:'i',apiKey:'test'})");
  const result={status:'success',tripId:'tokyo2026',changes:{itinerary:[{ID:'new'}]}};
  f.requests[1].resolve(result); f.context.result=await post; f.run('refreshAfterWrite(result)');
  f.requests[0].resolve(payload('old')); await get;
  assert.equal(f.run('appData.itinerary[0].ID'),'new'); assert.equal(f.requests.length,2);
  assert.equal(f.storage.has('ver_tokyo2026'),false);
});

test('舊版 GAS 寫入回應可退回強制重新讀取',()=>{
  const f=frontend(); f.run('loadData = force => { globalThis.forceRefresh = force; }; refreshAfterWrite({status:"success"});');
  assert.equal(f.context.forceRefresh,true);
});

test('有完整快取才傳條件版本；未變更回應保留內容',async()=>{
  const f=frontend(), trip='osaka-shiga-kumamoto202611';
  f.storage.set('cache_'+trip,JSON.stringify(payload('cached')));f.storage.set('ver_'+trip,'v1');
  const pending=f.run('loadData()'); assert.match(f.requests[0].url,/version=v1/);
  f.requests[0].resolve({status:'success',notModified:true,version:'v1'}); await pending;
  assert.equal(f.run('appData.itinerary[0].ID'),'cached');
});

test('文件預覽無法透過一般編輯寫入雲端',async()=>{
  const f=frontend(); f.run('appData._preview=true');
  const result=await f.run("apiPost({action:'update',id:'i'})");
  assert.equal(result.status,'error');assert.equal(f.requests.length,0);
});

test('交通卡使用目前資料的時間與備註，並保留費用及參與者',()=>{
  const f=frontend();
  f.run("appData.participants=[{Name:'A'},{Name:'B'}]; globalThis.item={...getNovemberTripSeed().itinerary.find(i=>i.ID==='nov26-d4-02'),Time:'11:19',Duration:'34',Note:'改搭班次 <確認>',Expense:'500',Currency:'JPY',Participants:'A'};");
  const html=f.run('createTransportCard(item).children[0].innerHTML');
  assert.match(html,/11:19/); assert.match(html,/11:53/); assert.doesNotMatch(html,/11:34/);
  assert.match(html,/改搭班次 &lt;確認&gt;/); assert.match(html,/¥500/); assert.match(html,/pt-badge/);
  assert.match(html,/JR 西日本/); assert.match(html,/Google Maps/);
});

test('交通卡只有編輯模式提供編輯按鈕，點擊帶入原行程 ID',()=>{
  const f=frontend();
  f.run("globalThis.item=getNovemberTripSeed().itinerary.find(i=>i.ID==='nov26-d4-04');");
  assert.equal(f.run('createTransportCard(item).children.length'),1);
  f.run("isEditMode=true; openEditModal=id=>{globalThis.editedId=id;}; globalThis.card=createTransportCard(item); card.children[1].onclick();");
  assert.equal(f.run('card.children.length'),2); assert.equal(f.run('editedId'),'nov26-d4-04');
});

test('其他旅程不套用熊本官方資訊，未定時間與跨時區航班保持原值',()=>{
  const f=frontend();
  assert.equal(f.run("getTransportInfo({TripID:'tokyo2026',Type:'subway',Activity:'市電'}).links.length"),0);
  assert.equal(f.run("getTransportInfo({TripID:'osaka-shiga-kumamoto202611',Type:'taxi',Activity:'JR 新快速'}).links.length"),0);
  assert.match(f.run("createTransportCard({ID:'unknown',Type:'taxi'}).children[0].innerHTML"),/時間未定/);
  const flight=f.run("createTransportCard(getNovemberTripSeed().itinerary.find(i=>i.ID==='nov26-d10-05')).children[0].innerHTML");
  assert.match(flight,/12:40/);assert.match(flight,/14:25/);assert.match(flight,/各機場當地時間/);
});


test('活動與交通卡的已記帳金額只讀取 Expense，缺少關聯不退回舊金額',()=>{
  const f=frontend();
  f.run("appData.expenses=[{ID:'e',Amount:'200',Currency:'TWD'}]; globalThis.item={ID:'i',Type:'activity',ExpenseID:'e',Expense:'100',Currency:'JPY'};");
  assert.equal(f.run('expenseView(item).Expense'),'200');
  assert.match(f.run('createActivityCard(item,0).innerHTML'),/NT\$200/);
  assert.match(f.run('createTransportCard(item).children[0].innerHTML'),/NT\$200/);
  f.run('appData.expenses=[]');
  assert.equal(f.run('expenseView(item).Expense'),'');
  assert.equal(f.run("expenseView({Expense:'100',Currency:'JPY'}).Expense"),'100');
});

test('行程編輯顯示最新帳務值，費用入口開啟正確關聯',()=>{
  const f=frontend();
  f.run("renderPayerSelect=()=>{}; renderParticipantCheckboxes=()=>{}; renderTransportIcons=()=>{}; appData.itinerary=[{ID:'i',ExpenseID:'e',Expense:'100',Currency:'JPY'}]; appData.expenses=[{ID:'e',Amount:'200',Currency:'TWD'}]; openEditModal('i');");
  assert.equal(f.elements.get('edit-expense').value,'200');
  assert.equal(f.elements.get('edit-currency').value,'TWD');
  assert.equal(f.elements.get('edit-expense').disabled,true);
  f.run('openExpenseModal=id=>{globalThis.openedExpense=id;}; editLinkedExpense();');
  assert.equal(f.run('openedExpense'),'e');
  f.run("appData.itinerary=[{ID:'j',Expense:'50',Currency:'JPY'}]; openEditModal('j');");
  assert.equal(f.elements.get('edit-expense').disabled,false);
});


test('私人資料只留記憶體，登出清除畫面資料且拒絕晚到回應',async()=>{
  const f=frontend();
  f.run("appData={itinerary:[{ID:'i',ExpenseID:'e',Expense:'100',Participants:'A'}],flights:[{ID:'f',BookingRef:'PRIVATE_BOOKING',Note:'PRIVATE_NOTE'}],expenses:[{ID:'e',Amount:'100'}],participants:[{Name:'A'}],checklist:[]}; saveCache(TRIP_ID,appData); isEditMode=true; cachedApiKey='local-key';");
  const cache=JSON.parse(f.storage.get('cache_osaka-shiga-kumamoto202611'));
  assert.equal(cache.expenses.length,0);assert.equal(cache.itinerary[0].Expense,'');
  assert.doesNotMatch(JSON.stringify(cache),/PRIVATE_/);
  const pending=f.run("apiPost({action:'readPrivate',apiKey:cachedApiKey})");
  f.run('toggleEditMode()');
  assert.equal(f.run('appData.expenses.length'),0);
  assert.equal(f.run('appData.flights[0].BookingRef'),'');
  f.requests[0].resolve({status:'success',data:{expenses:[{Amount:'100'}]}});
  assert.equal((await pending).status,'stale');
});

test('第一次載入清除所有舊版私人快取，保留其他網站設定',()=>{
  const f=frontend(); f.storage.set('cache_old','PRIVATE'); f.storage.set('ver_old','v1'); f.storage.set('tripChoice','tokyo2026');
  f.run('clearLegacyPrivateCaches()');
  assert.equal(f.storage.has('cache_old'),false);assert.equal(f.storage.has('ver_old'),false);
  assert.equal(f.storage.get('tripChoice'),'tokyo2026');
});

test('活動航班清單的 HTML 特殊字元安全顯示，危險網址不產生連結',()=>{
  const f=frontend();f.context.bad='<img src=x onerror=alert(1)>';
  const html=f.run("createActivityCard({ID:'i',Activity:bad,Time:bad,Duration:bad,Expense:bad,MapURL:'javascript:alert(1)',ImageURL:'data:text/html,test'},0).innerHTML");
  assert.doesNotMatch(html,/<img src=x|javascript:|data:text/);
  assert.match(html,/&lt;img/);
  f.run("renderFlights([{ID:'f',FlightNo:bad,BookingRef:bad,Note:bad}]); renderChecklist([{ID:'c',Item:bad}]);");
  assert.doesNotMatch(f.elements.get('flights-container').innerHTML,/<img src=x/);
  assert.doesNotMatch(f.elements.get('checklist-container').innerHTML,/<img src=x/);
  assert.equal(f.run("safeUrl('javascript:alert(1)')"),'');
});

test('行程航班卡採 FlightInfo 時間，已關聯航班導向行程處理',()=>{
  const f=frontend();
  f.run("appData.itinerary=[{ID:'i',Type:'plane',FlightID:'f',Time:'09:00'}]; appData.flights=[{ID:'f',DepartTime:'15:00',ArriveTime:'18:00',DepartDate:'2026-11-01'}];");
  assert.equal(f.run('flightView(appData.itinerary[0]).Time'),'15:00');
  assert.match(f.run('createTransportCard(appData.itinerary[0]).children[0].innerHTML'),/15:00/);
  f.run("openFlightModal('f'); openEditModal=id=>{globalThis.linked=id;}; openLinkedFlightItinerary();");
  assert.equal(f.run('linked'),'i');
});
