// 自己的页面：先走网络，断网用缓存 —— 在线时永远是最新版
// 谷歌字体：先用缓存，没有再去网上拿一次存起来 —— 断网时手写字体也在
const CACHE = 'g318-v2';
const FONTS = 'g318-fonts-v1';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(FONTS).then(c =>
        c.match(e.request).then(hit => hit || fetch(e.request).then(res => {
          if (res && (res.ok || res.type === 'opaque')) c.put(e.request, res.clone());
          return res;
        }))
      ).catch(() => caches.match(e.request))
    );
    return;
  }

  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
