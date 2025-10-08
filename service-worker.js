const CACHE='scribbler-softweb-v2';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.json','./icon-192.png','./icon-512.png'].filter(Boolean);
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim())});
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
