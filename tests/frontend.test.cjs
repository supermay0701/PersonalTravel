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
    document:{getElementById:element,documentElement:{style:{setProperty(){}}},querySelector:()=>null},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
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
