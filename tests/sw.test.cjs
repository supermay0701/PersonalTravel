const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function worker() {
  const handlers={}, stored=new Map(), deleted=[];
  let response=new Response('<html>new home</html>',{headers:{'content-type':'text/html'}});
  const home='https://example.test/PersonalTravel/index.html';
  stored.set(home,new Response('cached home'));
  const context=vm.createContext({URL,
    self:{location:{href:'https://example.test/PersonalTravel/sw.js'},addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>{}}},
    caches:{open:async()=>({put:async(k,v)=>stored.set(k,v),match:async k=>stored.get(k)}),keys:async()=>['travel-shell-v4','travel-shell-v5','travel-shell-v6','travel-shell-v7','travel-shell-v8','unrelated-app'],delete:async k=>deleted.push(k)},
    fetch:async()=>{if(response instanceof Error) throw response; return response;}
  });
  vm.runInContext(fs.readFileSync('sw.js','utf8'),context);
  return {stored,home,deleted,setResponse:r=>response=r,
    navigate:async path=>{
      const waits=[]; let result;
      handlers.fetch({request:{url:new URL(path,home).href,method:'GET',mode:'navigate'},respondWith:p=>result=p,waitUntil:p=>waits.push(p)});
      const resolved=await result; await Promise.all(waits); return resolved;
    },
    activate:async()=>{let result;handlers.activate({waitUntil:p=>result=p});await result;}
  };
}

test('帶旅程參數的首頁更新共用快取，離線使用該首頁',async()=>{
  const w=worker();
  await w.navigate('./index.html?trip=november');
  assert.equal(await w.stored.get(w.home).clone().text(),'<html>new home</html>');
  w.setResponse(new Error('offline'));
  assert.equal(await (await w.navigate('./?trip=other')).text(),'<html>new home</html>');
});

test('其他頁面與不同來源不覆蓋或使用首頁快取',async()=>{
  const w=worker();
  for(const path of ['./preview/','./missing.html','./Hokkaido2026.html','https://other.test/PersonalTravel/index.html']) {
    assert.equal(await w.navigate(path),undefined);
  }
  assert.equal(await w.stored.get(w.home).text(),'cached home');
});

test('HTTP 錯誤、非 HTML 及重新導向不覆蓋離線首頁',async()=>{
  const w=worker();
  for(const response of [new Response('error',{status:500,headers:{'content-type':'text/html'}}),new Response('{}',{headers:{'content-type':'application/json'}}),{ok:true,redirected:true,headers:new Headers({'content-type':'text/html'})}]) {
    w.setResponse(response); await w.navigate('./index.html');
    assert.equal(await w.stored.get(w.home).clone().text(),'cached home');
  }
});

test('啟用新版只清除本應用程式的舊快取',async()=>{
  const w=worker(); await w.activate();
  assert.deepEqual(w.deleted,['travel-shell-v4','travel-shell-v5','travel-shell-v6','travel-shell-v7','travel-shell-v8']);
});
