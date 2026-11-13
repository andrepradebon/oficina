/* Oficina · service worker: guarda o app no celular para abrir sem internet
   e, no Android, envia a fila em segundo plano quando o sinal volta. */
importScripts('config.js', 'sync.js');

var VERSAO = 'oficina-v2.1.0';
var FONTES = 'oficina-fontes';
var ARQUIVOS = ['./', 'index.html', 'app.js', 'sync.js', 'config.js', 'manifest.webmanifest', 'icone-192.png', 'icone-512.png', 'icone-mascara.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSAO).then(function (c) { return c.addAll(ARQUIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSAO && k !== FONTES; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // abre na hora com o que está guardado e atualiza por trás
    e.respondWith(caches.open(VERSAO).then(function (cache) {
      var chave = req.mode === 'navigate' ? 'index.html' : req;
      return cache.match(chave, { ignoreSearch: true }).then(function (guardado) {
        var daRede = fetch(req).then(function (r) {
          if (r && r.ok) cache.put(chave, r.clone());
          return r;
        }).catch(function () { return guardado; });
        return guardado || daRede;
      });
    }));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(FONTES).then(function (cache) {
      return cache.match(req).then(function (guardado) {
        var daRede = fetch(req).then(function (r) { cache.put(req, r.clone()); return r; }).catch(function () { return guardado; });
        return guardado || daRede;
      });
    }));
  }
});

self.addEventListener('sync', function (e) {
  if (e.tag !== 'enviar-fila') return;
  e.waitUntil(self.Oficina.enviarFila().then(function (r) {
    return self.clients.matchAll().then(function (cs) {
      cs.forEach(function (c) { c.postMessage({ tipo: 'fila-enviada', r: r }); });
      if (r.parou === 'rede') throw new Error('sem rede');   // o Chrome tenta de novo mais tarde
    });
  }));
});

self.addEventListener('message', function (e) {
  if (e.data === 'atualizar-agora') self.skipWaiting();
});
