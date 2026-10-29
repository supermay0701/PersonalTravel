const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function frontend(search = '?trip=osaka-shiga-kumamoto202611', initialStorage = []) {
  const storage = new Map(initialStorage), requests = [], elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set(['hidden']), attributes = new Map();
      elements.set(id,{textContent:'',classList:{toggle(name,on){if(on ?? !classes.has(name))classes.add(name);else classes.delete(name);},add(name){classes.add(name);},remove(name){classes.delete(name);},contains:name=>classes.has(name)},style:{setProperty(){}},setAttribute:(name,value)=>attributes.set(name,value),getAttribute:name=>attributes.get(name)});
    }
    return elements.get(id);
  };
  const context = vm.createContext({
    console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    window:{location:{search}},
    document:{addEventListener(){},getElementById:element,documentElement:{style:{setProperty(){}}},querySelector:()=>null,
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

test('同步時間與離線日期一起儲存；舊快取不冒充已知同步時間',()=>{
  const f=frontend(); const trip='osaka-shiga-kumamoto202611';
  f.run("appData=getNovemberTripSeed();saveCache(TRIP_ID,appData,{synced:true})");
  const cache=JSON.parse(f.storage.get('cache_'+trip));
  assert.ok(cache._offline.syncedAt);
  assert.equal(f.run('offlineInfo().dates.length'),10);
  assert.equal(f.run('offlineInfo().dates[0]'),'2026-11-01');
  f.storage.set('cache_'+trip,JSON.stringify({...cache,_offline:{syncedAt:'2020-01-01T00:00:00.000Z',savedAt:'2020-01-01T00:00:00.000Z'}}));
  f.run('saveCache(TRIP_ID,appData,{changed:true})');
  assert.equal(f.run('offlineInfo().syncedAt'),'2020-01-01T00:00:00.000Z');
  assert.notEqual(f.run('offlineInfo().savedAt'),'2020-01-01T00:00:00.000Z');
  f.storage.set('cache_'+trip,JSON.stringify(payload('legacy')));
  assert.equal(f.run('offlineInfo().syncedAt'),'');
  f.storage.set('cache_'+trip,JSON.stringify(cache));
  f.run('appData._preview=true;saveCache(TRIP_ID,appData,{synced:true})');
  assert.equal(f.run('offlineInfo().syncedAt'),'');
  assert.equal(f.run('offlineInfo().savedAt'),'');
  assert.equal(f.run('offlineInfo().preview'),true);
});

test('版本未變仍更新最後確認時間，失敗請求不更新時間',async()=>{
  const f=frontend(), trip='osaka-shiga-kumamoto202611';
  f.storage.set('cache_'+trip,JSON.stringify({...payload('old'),_offline:{syncedAt:'2020-01-01T00:00:00.000Z'}}));
  f.storage.set('ver_'+trip,'v1');
  const request=f.run('loadData()');
  f.requests[0].resolve({status:'success',notModified:true,version:'v1'});await request;
  const timestamp=f.run('offlineInfo().syncedAt');
  assert.notEqual(timestamp,'2020-01-01T00:00:00.000Z');
  const failed=f.run('loadData()'); f.requests[1].reject(new Error('offline'));await failed;
  assert.equal(f.run('offlineInfo().syncedAt'),timestamp);
  f.context.navigator={onLine:false}; f.run('renderSyncStatus()');
  assert.equal(f.elements.get('connection-label').textContent,'離線');
  assert.equal(f.elements.get('data-status').classList.contains('is-offline'),true);
  assert.match(f.elements.get('data-status').getAttribute('aria-label'),/目前離線/);
  f.context.navigator.onLine=true; f.run('renderSyncStatus()');
  assert.equal(f.elements.get('connection-label').textContent,'連線');
  assert.equal(f.elements.get('data-status').classList.contains('is-offline'),false);
});

test('儲存失敗保留舊快取範圍與時間，也不保留新版本號',async()=>{
  const f=frontend(), trip='osaka-shiga-kumamoto202611';
  f.storage.set('cache_'+trip,JSON.stringify({...payload('old'),itinerary:[{Date:'2026-11-01'}],_offline:{syncedAt:'2020-01-01T00:00:00.000Z'}}));
  f.storage.set('ver_'+trip,'v1');
  const setter=f.context.localStorage.setItem;
  f.context.localStorage.setItem=(key,value)=>{if(key.startsWith('cache_'))throw new Error('quota');setter(key,value);};
  f.context.console={...console,warn(){}};
  const request=f.run('loadData()');
  f.requests[0].resolve({...payload('new'),itinerary:[{Date:'2026-11-02'}]});await request;
  assert.equal(f.run('offlineInfo().dates.join()'),'2026-11-01');
  assert.equal(f.run('offlineInfo().syncedAt'),'2020-01-01T00:00:00.000Z');
  assert.equal(f.run('offlineInfo().failed'),true);
  assert.equal(f.storage.has('ver_'+trip),false);
});

test('離線頁面備妥狀態必須有目前版本首頁快取，預覽路徑不冒充首頁',async()=>{
  const f=frontend();
  f.context.navigator={serviceWorker:{getRegistration:async()=>({active:{},scope:'https://example.test/travel/'})}};
  f.context.location={pathname:'/travel/index.html'};
  f.context.caches={keys:async()=>['travel-shell-v8'],open:async()=>({match:async()=>({})})};
  await f.run('checkOfflineShell()');assert.equal(f.run('offlineShellState'),'unavailable');
  f.context.caches.keys=async()=>['travel-shell-v10'];
  await f.run('checkOfflineShell()');assert.equal(f.run('offlineShellState'),'ready');
  f.context.location.pathname='/travel/.tmp/preview.html';
  await f.run('checkOfflineShell()');assert.equal(f.run('offlineShellState'),'unavailable');
});

test('分享模型只取當日公開欄位，使用航班時間並將未定時間放最後',()=>{
  const f=frontend();f.run("appData=getNovemberTripSeed();CUR=TRIPS[DEFAULT_TRIP];currentDay='第1天'");
  f.run("appData.itinerary[0].Note='PRIVATE_NOTE';appData.itinerary[0].Participants='PRIVATE_NAME';appData.flights[0].BookingRef='PRIVATE_BOOKING';appData.flights[0].DepartTime='15:10'");
  assert.equal(f.run('shareDayModel().rows[0].time'),'15:10');
  assert.match(f.run('shareDayModel().rows[0].meta'),/機場當地時間/);
  assert.doesNotMatch(f.run('JSON.stringify(shareDayModel())'),/PRIVATE_|BookingRef|Participants|Expense|MapURL/);
  assert.equal(f.run("shareDayModel('第3天').rows.at(-1).time"),'時間未定');
  assert.equal(f.run("shareDayModel('不存在').rows.length"),0);
  f.run("appData.itinerary.push({Day:'跨夜',Time:'23:30',Duration:'90',Activity:'夜間移動',Type:'train'})");
  assert.equal(f.run("shareDayModel('跨夜').rows[0].end"),'→ 01:00（翌日）');
});

test('分享圖自動分頁且超長名稱不裁切遺漏',()=>{
  const f=frontend();
  f.context.measure={font:'',measureText(text){return {width:Array.from(text).length*32};}};
  f.run("globalThis.longTitle='超長行程名稱'.repeat(200);globalThis.shareRows=Array.from({length:20},(_,i)=>({title:i===0?longTitle:'行程'+i,time:'08:00',end:'',meta:'活動'}));globalThis.sharePages=layoutSharePages(measure,shareRows)");
  assert.ok(f.run('sharePages.length > 2'));
  assert.equal(f.run("sharePages.flatMap(p=>p.rows).filter(r=>r.title===longTitle).flatMap(r=>r.titleLines).join('')"),f.run('longTitle'));
  assert.equal(f.run('sharePages.every(p=>p.height<=1060 && p.rows.length<=8)'),true);
  assert.equal(f.run("sharePages.flatMap(p=>p.rows).filter(r=>!r.continued).length"),20);
});

test('關閉分享預覽後，尚未完成的圖片不會回填或保留網址',async()=>{
  const f=frontend(); const pendingBlobs=[],revoked=[];
  f.context.document.body={style:{overflow:''}};
  const sheet=f.context.document.getElementById('travel-sheet');
  sheet.showModal=()=>{sheet.open=true;};sheet.close=()=>{sheet.open=false;f.run('finishTravelDetails()');};
  f.context.document.createElement=()=>({getContext:()=>({})});
  f.context.URL={createObjectURL:()=> 'blob:test',revokeObjectURL:url=>revoked.push(url)};
  f.context.pendingBlobs=pendingBlobs;
  f.run("appData=getNovemberTripSeed();currentDay='第2天';layoutSharePages=()=>[{},{}];drawSharePage=()=>({toBlob:callback=>pendingBlobs.push(callback)})");
  const preview=f.run('openSharePreview()');
  pendingBlobs.shift()({});await Promise.resolve();
  assert.equal(f.run('shareImages.length'),1);
  f.run('closeTravelDetails()');
  pendingBlobs.shift()({});await preview;
  assert.equal(f.run('shareImages.length'),0);
  assert.deepEqual(revoked,['blob:test']);
  assert.equal(f.elements.get('travel-sheet-body').innerHTML,'');
  assert.equal(f.context.document.body.style.overflow,'');
});

test('今日摘要以日本日期判斷，處理出發前、旅程結束與未定時間',()=>{
  const f=frontend();
  f.run('appData=getNovemberTripSeed()');
  assert.equal(f.run("todayModel(new Date('2026-10-31T14:00:00Z')).before"),true);
  assert.equal(f.run("todayModel(new Date('2026-11-01T15:01:00Z')).date"),'2026-11-02');
  assert.equal(f.run("todayModel(new Date('2026-11-11T00:00:00Z')).after"),true);
  assert.ok(f.run("todayModel(new Date('2026-11-03T12:00:00Z')).untimed.some(r=>r.item.Activity.includes('Tonkatsu'))"));
});

test('下一站倒數依台灣起飛時間，正在飛行依日本抵達時間',()=>{
  const f=frontend(); f.run('appData=getNovemberTripSeed()');
  assert.equal(f.run("todayModel(new Date('2026-11-01T06:30:00Z')).next[0].start"),Date.parse('2026-11-01T06:40:00Z'));
  assert.equal(f.run("todayModel(new Date('2026-11-01T06:45:00Z')).ongoing[0].item.FlightID"),'nov26-flight-out');
  assert.equal(f.run("todayModel(new Date('2026-11-01T09:00:00Z')).ongoing.some(r=>r.item.Type==='plane')"),false);
  f.run("appData.flights[0].DepartAirport='UNKNOWN'");
  assert.ok(f.run("Number.isNaN(itemTiming(appData.itinerary[0]).start)"));
});

test('同時出發保留所有安排，跨午夜項目仍顯示，下一站採時間順序',()=>{
  const f=frontend(); f.run(`appData.itinerary=[
    {ID:'late',Date:'2026-11-02',Time:'09:30',Activity:'稍後'},
    {ID:'a',Date:'2026-11-02',Time:'09:00',Activity:'A'},
    {ID:'b',Date:'2026-11-02',Time:'09:00',Activity:'B'},
    {ID:'night',Date:'2026-11-01',Time:'23:30',ActualEndTime:'00:30',Activity:'夜車'}];`);
  assert.equal(f.run("todayModel(new Date('2026-11-01T15:10:00Z')).ongoing[0].item.ID"),'night');
  assert.equal(f.run("todayModel(new Date('2026-11-01T23:00:00Z')).next.map(r=>r.item.ID).join(',')"),'a,b');
});

test('測試開始後未填結束時間仍提示目前安排，航班導航指向出發機場',()=>{
  const f=frontend(); f.run('appData=getNovemberTripSeed()');
  assert.ok(f.run("todayModel(new Date('2026-11-03T01:30:00Z')).ongoing.some(r=>r.item.Activity.includes('測試｜開始'))"));
  f.run("currentDay='第1天';renderTodayBrief(new Date('2026-11-01T06:30:00Z'))");
  const html=f.elements.get('today-details').innerHTML;
  assert.match(html,/出發機場地圖/);
  assert.match(html,/query=TPE%20airport/);
  assert.doesNotMatch(html,/query=.*関西/);
});

test('住宿卡連住期間可見，換飯店顯示新住宿，最後一天顯示退房',()=>{
  const f=frontend(); f.run("appData=getNovemberTripSeed(); CUR=TRIPS[DEFAULT_TRIP]");
  assert.equal(f.run("staysForDate('2026-11-03')[0].name"),'スーパーホテル大津駅前');
  f.run("currentDay='第4天';renderStayBrief(new Date('2026-11-04T00:00:00Z'))");
  assert.match(f.elements.get('stay-details').innerHTML,/今晚住宿/);
  assert.match(f.elements.get('stay-details').innerHTML,/HOTEL SOVA/);
  assert.doesNotMatch(f.elements.get('stay-details').innerHTML,/スーパーホテル/);
  assert.doesNotMatch(f.elements.get('stay-brief').innerHTML,/HOTEL SOVA|熊本県/);
  assert.match(f.elements.get('stay-brief').innerHTML,/aria-haspopup="dialog"/);
  f.run("currentDay='第10天';renderStayBrief()");
  assert.match(f.elements.get('stay-details').innerHTML,/當日退房/);
  assert.equal(f.run("staysForDate('2026-11-11').length"),0);
  f.run("appData.itinerary=appData.itinerary.filter(i=>i.ID!=='nov26-d4-06')");
  assert.equal(f.run("staysForDate('2026-11-05').length"),0);
});

test('住宿起訖與入住安排使用目前行程資料，摘要文字及網址安全顯示',()=>{
  const f=frontend(); f.run("appData=getNovemberTripSeed(); CUR=TRIPS[DEFAULT_TRIP]");
  f.run("appData.itinerary.find(i=>i.ID==='nov26-d4-06').Date='2026-11-05'");
  assert.equal(f.run("staysForDate('2026-11-04').some(s=>s.name.includes('SOVA'))"),false);
  const html=f.run(`briefItem({item:{Day:"第1天');alert(1)//",Activity:'<img onerror=alert(1)>',MapURL:'javascript:alert(1)'}}, '下一站')`);
  assert.doesNotMatch(html,/<img|href="javascript:/);
  assert.match(html,/&lt;img/);
});

test('複製住宿地址有成功回饋，剪貼簿拒絕時提供手動複製指引',async()=>{
  const f=frontend(); f.run("CUR=TRIPS[DEFAULT_TRIP];showToast=message=>globalThis.toast=message;");
  f.context.navigator={clipboard:{writeText:async text=>{f.context.copied=text;}}};
  await f.run("copyStayAddress('nov26-d2-06')");
  assert.match(f.context.copied,/滋賀県大津市京町3-2-7/);
  f.context.navigator.clipboard.writeText=async()=>{throw new Error('denied');};
  await f.run("copyStayAddress('nov26-d2-06')");
  assert.match(f.context.toast,/長按/);
});

test('精簡摘要只在旅行當天顯示，瀏覽其他日期僅提供回到今天',()=>{
  const f=frontend();f.run("appData=getNovemberTripSeed();currentDay='第1天'");
  f.run("renderTodayBrief(new Date('2026-10-21T00:00:00Z'))");
  assert.equal(f.elements.get('today-brief').innerHTML,'');
  f.run("renderTodayBrief(new Date('2026-11-01T06:30:00Z'))");
  assert.match(f.elements.get('today-brief').innerHTML,/next-strip/);
  assert.match(f.elements.get('today-brief').innerHTML,/10 分/);
  assert.doesNotMatch(f.elements.get('today-brief').innerHTML,/travel-brief|href=/);
  f.run("currentDay='第3天';renderTodayBrief(new Date('2026-11-01T06:30:00Z'))");
  assert.match(f.elements.get('today-brief').innerHTML,/回到今天/);
  assert.doesNotMatch(f.elements.get('today-brief').innerHTML,/next-strip|IT212/);
  f.run("renderTodayBrief(new Date('2026-11-11T00:00:00Z'))");
  assert.equal(f.elements.get('today-brief').innerHTML,'');
});

test('底部詳情開啟時鎖定背景，關閉清除內容與還原捲動',()=>{
  const f=frontend();f.context.document.body={style:{overflow:'auto'}};
  f.run("appData=getNovemberTripSeed();CUR=TRIPS[DEFAULT_TRIP];currentDay='第3天';renderStayBrief()");
  const dialog=f.context.document.getElementById('travel-sheet');
  dialog.showModal=()=>{dialog.open=true;};
  dialog.close=()=>{dialog.open=false;f.run('finishTravelDetails()');};
  f.run("openTravelDetails('stay')");
  assert.equal(dialog.open,true);
  assert.equal(f.context.document.body.style.overflow,'hidden');
  assert.match(f.elements.get('travel-sheet-body').innerHTML,/スーパーホテル/);
  f.run('closeTravelDetails()');
  assert.equal(dialog.open,false);
  assert.equal(f.context.document.body.style.overflow,'auto');
  assert.equal(f.elements.get('travel-sheet-body').innerHTML,'');
});

test('直接進首頁忽略舊旅行選擇，由雲端解析；指定網址仍優先',async()=>{
  const f=frontend('', [['tripChoice','tokyo2026'],['selectedTrip','tokyo2026']]);
  assert.equal(f.run('TRIP_ID'),'');
  const pending=f.run('loadData()');
  assert.equal(new URL(f.requests[0].url).searchParams.has('trip'),false);
  assert.equal(f.run('appData._preview'),true);
  f.requests[0].resolve({...payload('server'),resolvedTrip:'hokkaido202606'}); await pending;
  assert.equal(f.run('TRIP_ID'),'hokkaido202606');
  assert.equal(f.storage.get('defaultTripHint'),'hokkaido202606');
  assert.equal(frontend('?trip=tokyo2026').run('TRIP_ID'),'tokyo2026');
  assert.equal(frontend('?trip=unknown').run('TRIP_ID'),'');
});

test('首次離線首頁仍能閱讀最新行程並有有效的旅程 ID',async()=>{
  const f=frontend(''); const pending=f.run('loadData()');
  f.requests[0].reject(new Error('offline')); await pending;
  assert.equal(f.run('TRIP_ID'),'osaka-shiga-kumamoto202611');
  assert.ok(f.run('appData.itinerary.some(r=>r.Activity.includes("松本食堂"))'));
});

test('預設行程必須解鎖且雲端確認成功才儲存提示；失敗可重試',async()=>{
  const f=frontend(); f.run('showToast=()=>{};');
  await f.run('setCurrentDefaultTrip()'); assert.equal(f.requests.length,0);
  f.run("isEditMode=true;cachedApiKey='key';");
  const pending=f.run('setCurrentDefaultTrip()');
  assert.equal(f.elements.get('default-trip-btn').disabled,true);
  assert.equal(f.storage.has('defaultTripHint'),false);
  f.requests[0].resolve({status:'error',message:'金鑰錯誤'});await pending;
  assert.equal(f.storage.has('defaultTripHint'),false);
  assert.equal(f.elements.get('default-trip-btn').disabled,false);
  const saved=f.run('setCurrentDefaultTrip()');
  assert.equal(JSON.parse(f.requests[1].options.body).action,'setDefaultTrip');
  f.requests[1].resolve({status:'success',defaultTrip:'osaka-shiga-kumamoto202611'});await saved;
  assert.equal(f.storage.get('defaultTripHint'),'osaka-shiga-kumamoto202611');
});

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

test('版本輪替但內容相同不重畫，真正內容更新才重畫',async()=>{
  const f=frontend(), trip='osaka-shiga-kumamoto202611';
  f.storage.set('cache_'+trip,JSON.stringify(payload('cached')));f.storage.set('ver_'+trip,'v1');
  f.run('globalThis.renders=0;renderAll=()=>{renders++;}');
  const same=f.run('loadData()');
  assert.equal(f.run('renders'),1);
  f.requests[0].resolve({...payload('cached'),version:'v2'});await same;
  assert.equal(f.run('renders'),1);
  assert.equal(f.storage.get('ver_'+trip),'v2');
  const changed=f.run('loadData()');
  f.requests[1].resolve({...payload('changed'),version:'v3'});await changed;
  assert.equal(f.run('renders'),3);
  assert.equal(f.run('appData.itinerary[0].Activity'),'changed');
});

test('離線快取首次接管或更新只檢查快取，不強制重新整理頁面',async()=>{
  const f=frontend(), handlers={};let reloads=0, checks=0;
  f.context.setInterval=()=>{};
  f.context.window.addEventListener=()=>{};
  f.context.location={reload(){reloads++;}};
  f.context.navigator={serviceWorker:{addEventListener:(name,fn)=>handlers[name]=fn,register:async()=>({}),ready:Promise.resolve({})}};
  f.context.checkShell=()=>{checks++;};
  f.run('loadData=()=>{};checkOfflineShell=checkShell;init()');
  await Promise.resolve();await Promise.resolve();
  const before=checks;
  handlers.controllerchange();handlers.controllerchange();
  assert.equal(reloads,0);
  assert.equal(checks,before+2);
});

test('離線詳情顯示同步狀態與時間；開啟時連線變化會更新詳情',()=>{
  const f=frontend(); f.context.navigator={onLine:true};
  f.run("saveCache(TRIP_ID,getNovemberTripSeed(),{synced:true});travelSheetKind='offline';document.getElementById('travel-sheet').open=true;setDataStatus('已與 Google 試算表同步')");
  assert.match(f.elements.get('travel-sheet-body').innerHTML,/已與 Google 試算表同步/);
  assert.match(f.elements.get('travel-sheet-body').innerHTML,/最後完整同步/);
  f.context.navigator.onLine=false;f.run('renderSyncStatus()');
  assert.match(f.elements.get('travel-sheet-body').innerHTML,/目前離線/);
});

test('行程說明分頁可切換，其他旅行不顯示十一月說明',()=>{
  const f=frontend();f.context.document.querySelectorAll=()=>[];
  f.run('scheduleTravelLayout=()=>{};applyTrip(DEFAULT_TRIP);switchSection("info")');
  assert.equal(f.elements.get('trip-info-tab').classList.contains('hidden'),false);
  assert.equal(f.elements.get('section-info').classList.contains('hidden'),false);
  assert.equal(f.elements.get('section-itinerary').classList.contains('hidden'),true);
  f.run('applyTrip("tokyo2026")');
  assert.equal(f.elements.get('trip-info-tab').classList.contains('hidden'),true);
  assert.equal(f.elements.get('section-info').classList.contains('hidden'),true);
  assert.equal(f.elements.get('section-itinerary').classList.contains('hidden'),false);
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

test('航廈按旅程、航班及航線對應；公開航班無備註也可查看，其他航班不猜測',()=>{
  const f=frontend();
  f.run("renderFlights(getNovemberTripSeed().flights.map(v=>({...v,Note:''})))");
  const html=f.elements.get('flights-container').innerHTML;
  assert.equal((html.match(/第一航廈 T1/g)||[]).length,2);
  assert.match(html,/旅客航廈<\/span><span>・<\/span><span>國際線/);
  assert.match(html,/台南航空站/);
  assert.match(html,/flight-clock\">14:40/);
  assert.match(html,/各機場當地時間/);
  f.run("renderFlights([{FlightNo:'BR212',DepartAirport:'TPE',ArriveAirport:'KIX'}])");
  assert.doesNotMatch(f.elements.get('flights-container').innerHTML,/第一航廈/);
  assert.match(f.elements.get('flights-container').innerHTML,/航廈待確認/);
  f.run("TRIP_ID='tokyo2026'; renderFlights(getNovemberTripSeed().flights)");
  assert.doesNotMatch(f.elements.get('flights-container').innerHTML,/第一航廈/);
});

test('行程航班卡採 FlightInfo 時間，已關聯航班導向行程處理',()=>{
  const f=frontend();
  f.run("appData.itinerary=[{ID:'i',Type:'plane',FlightID:'f',Time:'09:00'}]; appData.flights=[{ID:'f',DepartTime:'15:00',ArriveTime:'18:00',DepartDate:'2026-11-01'}];");
  assert.equal(f.run('flightView(appData.itinerary[0]).Time'),'15:00');
  assert.match(f.run('createTransportCard(appData.itinerary[0]).children[0].innerHTML'),/15:00/);
  f.run("openFlightModal('f'); openEditModal=id=>{globalThis.linked=id;}; openLinkedFlightItinerary();");
  assert.equal(f.run('linked'),'i');
});
