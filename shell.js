/* ============================================================================
   Estructura de la aplicación: título de la vista, contadores de la barra lateral,
   pie lateral, perfil activo y menú de ordenación.
   Se apoya en window.MudaeApp (app.js).
   ========================================================================== */
(() => {
'use strict';

const A = window.MudaeApp;
const C = window.MudaeCore;
const D = window.mudaeDesktop || null;
const $ = (s, r = document) => r.querySelector(s);
const fmt = C.fmtKakera;

/* ---------- ancho de la barra lateral ---------- */
(function sideResize() {
  const KEY = 'seiri:sideW';
  const MIN = 168, MAX = 380, DEF = 208;
  const root = document.documentElement;
  const clamp = (v) => Math.max(MIN, Math.min(MAX, Math.round(v)));
  const apply = (v) => root.style.setProperty('--side-w', clamp(v) + 'px');
  const save = (v) => { try { localStorage.setItem(KEY, String(clamp(v))); } catch (e) { /* sin guardado */ } };
  try { const saved = Number(localStorage.getItem(KEY)); if (saved) apply(saved); } catch (e) { /* ancho por defecto */ }
  const bar = document.getElementById('sideResize');
  if (!bar) return;
  const width = () => document.querySelector('.side').getBoundingClientRect().width;
  bar.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    bar.setPointerCapture(e.pointerId);
    document.body.classList.add('side-dragging');
  });
  bar.addEventListener('pointermove', (e) => {
    if (!document.body.classList.contains('side-dragging')) return;
    apply(e.clientX);
  });
  const stop = (e) => {
    if (!document.body.classList.contains('side-dragging')) return;
    document.body.classList.remove('side-dragging');
    try { bar.releasePointerCapture(e.pointerId); } catch (err) { /* ya liberado */ }
    save(width());
  };
  bar.addEventListener('pointerup', stop);
  bar.addEventListener('pointercancel', stop);
  bar.addEventListener('dblclick', () => { apply(DEF); save(DEF); });
  bar.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = width() + (e.key === 'ArrowRight' ? 16 : -16);
    apply(next); save(next);
  });
})();

const TITLES = { home: 'Inicio', lib: 'Biblioteca', series: 'Series', photos: 'Fotos', friends: 'Amigos', settings: 'Ajustes' };
let version = '';
let update = null;       // { tag, url } cuando hay una versión más nueva en GitHub
let friendsCount = 0;

// «hace 3 días»: se escribe en español; el diccionario de inglés tiene reglas para estos textos
function ago(ts) {
  if (!ts) return '';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 90) return 'ahora mismo';
  if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
  if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
  const d = Math.round(s / 86400);
  return d === 1 ? 'hace 1 día' : 'hace ' + d + ' días';
}

function profileInfo() {
  const name = (window.SeiriProfiles ? window.SeiriProfiles.activeName() : (($('#profileName') || {}).textContent || 'Principal')).trim();
  return { name, initial: (name[0] || 'P').toUpperCase() };
}

function refresh() {
  const st = A.getState();
  const chars = st.chars || [];
  const series = new Set(chars.map(c => c.series)).size;

  const lib = $('#navCountLib');
  if (lib) lib.textContent = chars.length ? fmt(chars.length) : '';
  const ser = $('#navCountSeries');
  if (ser) ser.textContent = series ? fmt(series) : '';
  const fr = $('#navCountFriends');
  if (fr) fr.textContent = friendsCount ? String(friendsCount) : '';

  const total = $('#libTotal');
  if (total) {
    const shown = document.querySelectorAll('#grid .card').length;
    total.textContent = !chars.length ? '' : (shown !== chars.length ? fmt(shown) + ' de ' + fmt(chars.length) + ' personajes' : fmt(chars.length) + ' personajes en ' + fmt(series) + ' series');
  }

  const p = profileInfo();
  const av = $('#profileAv');
  if (av) av.textContent = p.initial;
  const sub = $('#profileSub');
  if (sub) sub.textContent = chars.length ? fmt(chars.length) + ' personajes' : 'Sin importar';

  const foot = $('#sideFoot');
  if (foot) {
    foot.innerHTML = '<b>' + escapeText(p.name) + '</b><br>' +
      (st.importedAt ? 'Importado ' + escapeText(ago(st.importedAt)) : 'Sin importar todavía') +
      (version ? '<br>Seiri ' + escapeText(version) : '') +
      (update ? '<br><a class="upd" href="' + escapeText(update.url) + '" target="_blank" rel="noopener">Hay una versión nueva: ' + escapeText(update.tag) + '</a>' : '');
  }
}

function escapeText(t) { return C.escapeHtml(String(t)); }

function setTitle(tab) {
  const h = $('#viewTitle');
  if (h) h.textContent = TITLES[tab] || '';
  document.body.dataset.tab = tab;
}

function setupSortMenu() {
  const btn = $('#btnSortMenu');
  const menu = $('#sortMenu');
  if (!btn || !menu) return;
  const close = () => { menu.hidden = true; menu.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    menu.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  menu.addEventListener('click', () => close());
  document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== btn) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

// Un clic en la barra lateral cambia de vista (app.js ya enlaza los .tab-btn; esto cubre el botón de perfil)
function setupProfileButtonWatcher() {
  const el = $('#profileName');
  if (el) new MutationObserver(refresh).observe(el, { childList: true, characterData: true, subtree: true });
}

/* ---------- aviso de versión nueva ----------
   Una sola consulta pública a la API de GitHub (la última versión publicada), como mucho cada 12 horas.
   No se envía nada del usuario. Se puede apagar en Ajustes. */
const UPD_KEY = 'seiri:update';
const UPD_URL = 'https://api.github.com/repos/Lunara02/Seiri/releases/latest';
function parseVer(v) { const m = String(v || '').match(/(\d+)\.(\d+)\.(\d+)/); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; }
function isNewer(a, b) {
  const x = parseVer(a), y = parseVer(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; }
  return false;
}
async function checkUpdate(opts) {
  const cur = (opts && opts.version) || version;
  if (!cur) return;
  let rec = null;
  try { rec = JSON.parse(localStorage.getItem(UPD_KEY) || 'null'); } catch (e) { rec = null; }
  const fresh = rec && Date.now() - (rec.t || 0) < 12 * 3600 * 1000 && !(opts && opts.force);
  if (!fresh) {
    try {
      const r = await fetch(UPD_URL, { headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const url = typeof j.html_url === 'string' && /^https:\/\/github\.com\//.test(j.html_url) ? j.html_url : '';
      rec = { t: Date.now(), tag: String(j.tag_name || ''), url };
      try { localStorage.setItem(UPD_KEY, JSON.stringify(rec)); } catch (e) { /* sin guardado */ }
    } catch (e) { return; }                 // sin conexión o límite de GitHub: se avisará otro día
  }
  update = rec && rec.url && isNewer(rec.tag, cur) ? { tag: rec.tag.replace(/^v/i, ''), url: rec.url } : null;
  refresh();
}

(async function boot() {
  if (D && D.getVersion) { try { version = await D.getVersion(); } catch (e) { /* sin versión */ } }
  setupSortMenu();
  setupProfileButtonWatcher();
  document.addEventListener('mudae:render', refresh);
  document.addEventListener('mudae:tab', (e) => { if (e.detail) setTitle(e.detail.tab); });
  document.addEventListener('seiri:friends', (e) => { friendsCount = (e.detail && e.detail.count) || 0; refresh(); });
  document.addEventListener('seiri:lang', refresh);
  setInterval(refresh, 60000);          // mantiene «hace N min» al día
  setTitle(document.body.dataset.tab || 'home');
  refresh();
  if (D && A.getSettings().checkUpdates !== false) setTimeout(checkUpdate, 4000);
})();

window.SeiriShell = { ago, refresh, checkUpdate, isNewer };

})();
