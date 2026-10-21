// 旅遊行程 PWA service worker
// 策略：app shell（index.html / icon / manifest）與 CDN 資源快取，讓離線也能開頁；
// GAS API 一律走網路（資料新鮮度由前端 localStorage + version 控制）。
const CACHE = 'travel-shell-v8';
const CORE = ['./', './index.html', './manifest.json', './icon.svg', './data/november2026.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith('travel-shell-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 不攔截 GAS API / 其圖片重導（避免回傳過期資料）
  if (url.hostname.includes('script.google.com') || url.hostname.includes('googleusercontent.com')) return;

  // 導覽（開啟頁面）：永遠抓最新（繞過 HTTP 快取），離線時才回退快取，避免卡在舊版
  if (req.mode === 'navigate') {
    const home = new URL('./index.html', self.location.href);
    const root = new URL('./', self.location.href);
    const isHome = url.origin === home.origin && (url.pathname === home.pathname || url.pathname === root.pathname);
    if (!isHome) return;
    e.respondWith(
      fetch(req.url, { cache: 'no-store' })
        .then(r => {
          if (r.ok && !r.redirected && (r.headers.get('content-type') || '').includes('text/html')) {
            const cp = r.clone();
            e.waitUntil(caches.open(CACHE).then(c => c.put(home.href, cp)).catch(() => {}));
          }
          return r;
        })
        .catch(() => caches.open(CACHE).then(c => c.match(home.href)))
    );
    return;
  }

  if (url.pathname.endsWith('/data/november2026.js')) {
    e.respondWith(fetch(req, {cache:'no-store'}).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return r;
    }).catch(() => caches.match(req)));
    return;
  }

  // 其他資源（Tailwind CDN、字型、icon）：先回快取，背景更新
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req)
        .then(r => { if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return r; })
        .catch(() => cached);
      return cached || net;
    })
  );
});
