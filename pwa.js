/* Versión web instalable: registra el service worker. En la app de escritorio no hace nada. */
(() => {
'use strict';
if (window.mudaeDesktop || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
const A = () => window.MudaeApp;
window.addEventListener('load', () => {
  let had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo sin conexión */ });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Si ya había una versión y llega otra, se avisa para recargar
    if (had && A() && A().notify) A().notify('Seiri se actualizó. Recarga la página para usar la versión nueva.');
    had = true;
  });
});
})();
