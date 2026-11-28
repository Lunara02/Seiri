/* ============================================================================
   Seiri v5 — módulo Amigos
   ----------------------------------------------------------------------------
   · Exportar tu colección (.seiri.json o página .html) para compartirla.
   · Importar listas de amigos y verlas en una vista de solo lectura,
     parecida a la Biblioteca (sin edición).
   · Extras de escritorio: copia automática por defecto, arrastrar archivos,
     atajos Ctrl+1..6.
   Se apoya en window.MudaeApp (app.js) y window.MudaeCore (core.js).
   ========================================================================== */
(() => {
'use strict';

const A = window.MudaeApp;
const C = window.MudaeCore;
const D = window.mudaeDesktop || null;
const esc = C.escapeHtml;
const norm = C.norm;
const fmt = C.fmtKakera;
const $ = (s, r = document) => r.querySelector(s);

/* ---------------------------------------------------------------- datos */
const X = { v: 2, profileName: '', friends: [], autoFileInit: false, profiles: [], activeProfile: '' };
const LS_X = 'kakera-vault:extra:v1';
const view = { sel: null, q: '', series: '', sort: 'orig', shown: 150 };

async function loadExtra() {
  let text = null;
  try {
    if (D) { const r = await D.storeRead(); if (r && r.ok) text = r.text; }
    if (!text) text = localStorage.getItem(LS_X);
  } catch (e) {}
  try {
    const o = text ? JSON.parse(text) : null;
    if (o && typeof o === 'object') {
      X.profileName = String(o.profileName || '');
      X.friends = Array.isArray(o.friends) ? o.friends : [];
      X.autoFileInit = !!o.autoFileInit;
      X.profiles = Array.isArray(o.profiles) ? o.profiles.filter(p => p && p.id && p.name) : [];
      X.activeProfile = String(o.activeProfile || '');
    }
  } catch (e) {}
}

const emitFriends = () => document.dispatchEvent(new CustomEvent('seiri:friends', { detail: { count: X.friends.length } }));

let saveTimer = 0;
function saveExtra() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const text = JSON.stringify(X);
    try { localStorage.setItem(LS_X, text); } catch (e) {}
    if (D) { try { await D.storeWrite(text); } catch (e) {} }
  }, 350);
}

const toast = (m) => A.notify(m);
const sumKa = (arr) => arr.reduce((t, c) => t + (Number(c.k) || 0), 0);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const initials = (n) => (String(n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') || '?').toUpperCase();

async function saveTextFile(defaultName, text, filters, title) {
  if (D) {
    const r = await D.saveAs({ defaultName, text, filters, title });
    if (r && r.ok) { toast('Guardado: ' + r.path); return true; }
    if (!(r && r.canceled)) toast('No se pudo guardar el archivo');
    return false;
  }
  A.download(defaultName, text, defaultName.endsWith('.html') ? 'text/html' : 'application/json');
  return true;
}

async function pickFiles(filters, title, multi) {
  if (D) {
    const r = await D.openFiles({ filters, title, multi });
    return r && r.ok ? r.files : [];
  }
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = !!multi;
    inp.accept = filters.flatMap(f => f.extensions.map(e => '.' + e)).join(',');
    inp.onchange = async () => {
      const out = [];
      for (const f of inp.files) out.push({ name: f.name, text: await f.text() });
      resolve(out);
    };
    inp.click();
  });
}

/* ---------------------------------------------------------------- exportar */
function buildProfile() {
  const byId = new Map(A.getChars().map(c => [c.id, c]));
  const ordered = [];
  const seen = new Set();
  for (const id of A.getOrder()) { const c = byId.get(id); if (c && !seen.has(id)) { ordered.push(c); seen.add(id); } }
  for (const c of A.getChars()) if (!seen.has(c.id)) ordered.push(c);
  return {
    kvault: 2,
    kind: 'profile',
    owner: X.profileName || 'Sin nombre',
    exportedAt: new Date().toISOString(),
    chars: ordered.map(c => ({
      n: c.name, s: c.series, k: Number(c.kakera) || 0, ky: Number(c.keys) || 0,
      i: c.image || '', m: c.mudaeId || '',
      r: Number(c.rank) || 0, sp: Number(c.spheres) || 0, fc: c.embedColor || ''
    }))
  };
}

function validateProfile(o) {
  if (!o || !o.kvault || !Array.isArray(o.chars)) return null;
  const chars = o.chars
    .filter(c => c && typeof c.n === 'string' && c.n)
    .map(c => ({
      n: String(c.n).slice(0, 120), s: String(c.s || 'Sin serie').slice(0, 160),
      k: Number(c.k) || 0, ky: Number(c.ky) || 0,
      i: /^https?:\/\//i.test(c.i || '') ? String(c.i) : '', m: String(c.m || ''),
      r: Number(c.r) || 0, sp: Number(c.sp) || 0, fc: /^#[0-9a-f]{6}$/i.test(c.fc || '') ? String(c.fc) : ''
    }));
  if (!chars.length) return null;
  return { owner: String(o.owner || 'Amigo').slice(0, 60), exportedAt: String(o.exportedAt || ''), chars };
}

const safeName = () => (X.profileName || 'coleccion').replace(/[^\w-]+/g, '_');

async function exportJson() {
  if (!A.getChars().length) return toast('Importa tu harem primero');
  await saveTextFile(`${safeName()}.seiri.json`, JSON.stringify(buildProfile()),
    [{ name: 'Lista de Seiri', extensions: ['json'] }], 'Guardar mi lista para compartir');
}

async function exportHtml() {
  if (!A.getChars().length) return toast('Importa tu harem primero');
  await saveTextFile(`${safeName()}-coleccion.html`, buildViewerHtml(buildProfile()),
    [{ name: 'Página web', extensions: ['html'] }], 'Guardar página para compartir');
}

// Visor autónomo: se abre en cualquier navegador, sin instalar nada.
function viewerMain() {
  const P = JSON.parse(document.getElementById('kvd').textContent);
  const q = (s) => document.querySelector(s);
  const E = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const F = (n) => Number(n).toLocaleString((window.I18N && window.I18N.locale()) || 'es-ES');
  let shown = 150;
  q('#title').textContent = 'Colección de ' + P.owner;
  q('#sub').textContent = P.chars.length + ' personajes · ' + F(P.chars.reduce((t, c) => t + (c.k || 0), 0)) + ' ka · exportado ' + (P.exportedAt || '').slice(0, 10);
  function draw() {
    const term = q('#q').value.trim().toLowerCase();
    let list = P.chars.slice();
    if (q('#o').value === 'ka') list.sort((a, b) => (b.k || 0) - (a.k || 0));
    else if (q('#o').value === 'az') list.sort((a, b) => a.n.localeCompare(b.n));
    if (term) list = list.filter(c => (c.n + ' ' + c.s).toLowerCase().includes(term));
    q('#grid').innerHTML = list.slice(0, shown).map(c =>
      '<div class="c"><div class="im">' + (c.i ? '<img loading="lazy" referrerpolicy="no-referrer" src="' + E(c.i) + '" onerror="this.remove()">' : '') +
      '<span>' + E(c.n.slice(0, 2)) + '</span></div><b>' + E(c.n) + '</b><small>' + E(c.s) + '</small>' +
      (c.k ? '<em>' + F(c.k) + ' ka' + (c.ky ? ' ·' + c.ky : '') + '</em>' : '') + '</div>').join('') || '<p class="e">Nada que mostrar.</p>';
    q('#more').hidden = list.length <= shown;
    q('#more').textContent = 'Mostrar más (' + (list.length - shown) + ')';
  }
  q('#q').oninput = () => { shown = 150; draw(); };
  q('#o').onchange = () => { shown = 150; draw(); };
  q('#more').onclick = () => { shown += 150; draw(); };
  draw();
}

function buildViewerHtml(profile) {
  const bs = '\\';
  const json = JSON.stringify(profile).replace(/</g, bs + 'u003c')
    .split(String.fromCharCode(0x2028)).join(bs + 'u2028')
    .split(String.fromCharCode(0x2029)).join(bs + 'u2029');
  const css = 'body{margin:0;background:#0f1115;color:#e7e9ee;font:14px system-ui,sans-serif}header{padding:18px 20px 8px}h1{margin:0;font-size:22px}' +
    '#sub{color:#9aa1ae;font-size:13px;margin-top:4px}.bar{display:flex;gap:8px;flex-wrap:wrap;padding:8px 20px}.bar input,.bar select{padding:8px 12px;background:#12151c;border:1px solid #272b35;border-radius:10px;color:#e7e9ee}.bar input{flex:1;max-width:420px}' +
    '#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;padding:14px 20px}.c{background:#1b1e26;border:1px solid #272b35;border-radius:12px;overflow:hidden;padding-bottom:8px}' +
    '.im{position:relative;aspect-ratio:3/4;background:#12151c;display:grid;place-items:center;color:#4b5263;font-size:28px;font-weight:800}.im img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}' +
    '.c b,.c small,.c em{display:block;padding:0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.c b{margin-top:6px;font-size:12.5px}.c small{color:#9aa1ae;font-size:11px}.c em{color:#a5b4fc;font-size:11px;font-style:normal}' +
    '#more{display:block;margin:6px auto 30px;background:#8b5cf6;color:#fff;border:0;border-radius:8px;padding:8px 16px;cursor:pointer}.e{color:#9aa1ae;padding:20px}footer{color:#6b7280;font-size:11.5px;padding:0 20px 20px}';
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Colección Mudae — ' + esc(profile.owner) + '</title><style>' + css + '</style></head><body>' +
    '<header><h1 id="title"></h1><div id="sub"></div></header>' +
    '<div class="bar"><input id="q" type="search" placeholder="Buscar personaje o serie…"><select id="o"><option value="orig">Orden original</option><option value="ka">Más Kakera</option><option value="az">A-Z</option></select></div>' +
    '<div id="grid"></div><button id="more" hidden></button>' +
    '<footer>Generado con Seiri. Solo lectura.</footer>' +
    '<script type="application/json" id="kvd">' + json + '</script><script>(' + viewerMain.toString() + ')()</script></body></html>';
}

/* ---------------------------------------------------------------- importar */
async function importFiles(files) {
  let ok = 0, bad = 0;
  for (const f of files) {
    try {
      const p = validateProfile(JSON.parse(f.text));
      if (!p) { bad++; continue; }
      const old = X.friends.find(x => norm(x.owner) === norm(p.owner));
      const rec = { id: old ? old.id : uid(), ...p, importedAt: new Date().toISOString() };
      if (old) X.friends[X.friends.indexOf(old)] = rec; else X.friends.push(rec);
      view.sel = rec.id; view.q = ''; view.series = ''; view.shown = 150;
      ok++;
    } catch (e) { bad++; }
  }
  saveExtra();
  renderFriends();
  toast(ok ? `${ok} lista(s) importada(s)` + (bad ? `, ${bad} no válida(s)` : '') : 'Archivo no válido: ¿es un .seiri.json?');
}

/* ---------------------------------------------------------------- vista (solo lectura) */
const SVG_KEY = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/></svg>';

function friendCard(c) {
  const img = c.i ? `<img src="${esc(c.i)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '';
  const frame = c.fc ? ` framed" style="--frame:${esc(c.fc)}` : '';
  return `<article class="card kv-ro${frame}" title="${esc(c.n)} · ${esc(c.s)}${c.k ? ' · ' + fmt(c.k) + ' ka' : ''}">
    <div class="media${c.i ? '' : ' failed'}" data-initials="${esc(initials(c.n))}">${img}<span class="sheen"></span>
      ${c.r ? `<span class="tag rank">#${fmt(c.r)}</span>` : ''}${c.sp ? `<span class="tag sph"><i></i>${fmt(c.sp)} sp</span>` : ''}</div>
    <div class="cap"><b>${esc(c.n)}</b><span class="ser">${esc(c.s)}</span>
      <div class="meta"><span class="ka">${c.k ? fmt(c.k) + ' ka' : ''}</span>${c.ky ? `<span class="keys">${SVG_KEY}${c.ky}</span>` : ''}</div></div></article>`;
}

function renderFriends() {
  const root = $('#tabFriends');
  emitFriends();
  if (!root) return;
  if (!X.friends.some(f => f.id === view.sel)) view.sel = X.friends.length ? X.friends[0].id : null;
  const cur = X.friends.find(f => f.id === view.sel) || null;

  let list = [], seriesList = [];
  if (cur) {
    seriesList = [...new Set(cur.chars.map(c => c.s))].sort((a, b) => a.localeCompare(b));
    list = cur.chars.map((c, i) => ({ ...c, _i: i }));
    const t = norm(view.q);
    if (t) list = list.filter(c => norm(c.n).includes(t) || norm(c.s).includes(t));
    if (view.series) list = list.filter(c => c.s === view.series);
    if (view.sort === 'ka') list.sort((a, b) => b.k - a.k);
    else if (view.sort === 'keys') list.sort((a, b) => b.ky - a.ky || b.k - a.k);
    else if (view.sort === 'az') list.sort((a, b) => a.n.localeCompare(b.n));
    else if (view.sort === 'series') list.sort((a, b) => a.s.localeCompare(b.s) || a._i - b._i);
  }

  root.innerHTML = `<div class="kv-wrap">
    <section class="kv-card">
      <h3>Compartir mi colección</h3>
      <div class="kv-row">
        <input class="input" id="kvName" placeholder="Tu nombre (se muestra a quien la reciba)" maxlength="60" value="${esc(X.profileName)}">
        <button class="btn primary" id="kvExpJson">Exportar lista</button>
        <button class="btn" id="kvExpHtml">Exportar vista web</button>
      </div>
      <p class="hint">Se comparten el nombre, la serie, el kakera, las llaves, las esferas, el ranking, el color de marco y la imagen de cada personaje.
      Tu amigo importa la lista aquí mismo; la vista web se abre en cualquier navegador.</p>
    </section>

    <section class="kv-card">
      <h3>Listas de amigos</h3>
      <div class="kv-row">
        <button class="btn primary" id="kvImp">Importar lista…</button>
        ${X.friends.length ? `<select class="input" id="kvSel">${X.friends.map(f => `<option value="${esc(f.id)}"${f.id === view.sel ? ' selected' : ''}>${esc(f.owner)} · ${f.chars.length} pj</option>`).join('')}</select>
        <button class="btn danger small" id="kvDel">Eliminar lista</button>` : '<span class="muted">También puedes arrastrar un archivo .seiri.json a esta ventana.</span>'}
      </div>
      ${cur ? `<div class="kv-stats"><span><b>${esc(cur.owner)}</b></span><span>${cur.chars.length} personajes</span><span>${fmt(sumKa(cur.chars))} ka</span><span>${seriesList.length} series</span><span>Exportada: ${esc((cur.exportedAt || '').slice(0, 10) || '—')}</span><span class="kv-pill">Solo lectura</span></div>` : ''}
    </section>

    ${cur ? `<section class="toolbar kv-toolbar">
      <input class="input grow" id="kvQ" type="search" placeholder="Buscar personaje o serie…" value="${esc(view.q)}" autocomplete="off">
      <select class="input" id="kvSer"><option value="">Todas las series</option>${seriesList.map(s => `<option value="${esc(s)}"${s === view.series ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <select class="input" id="kvSort">
        ${[['orig', 'Orden original'], ['ka', 'Más Kakera'], ['keys', 'Más llaves'], ['az', 'A-Z'], ['series', 'Por serie']].map(([v, l]) => `<option value="${v}"${v === view.sort ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
      <span class="muted">${list.length} resultados</span>
    </section>
    <div class="grid kv-grid">${list.slice(0, view.shown).map(c => friendCard(c)).join('') || '<p class="muted">Sin resultados.</p>'}</div>
    ${list.length > view.shown ? `<button class="btn" id="kvMore">Mostrar más (${list.length - view.shown})</button>` : ''}` : ''}
  </div>`;

  $('#kvName').oninput = (e) => { X.profileName = e.target.value.trim(); saveExtra(); };
  $('#kvExpJson').onclick = exportJson;
  $('#kvExpHtml').onclick = exportHtml;
  $('#kvImp').onclick = async () => {
    const files = await pickFiles([{ name: 'Lista de Seiri', extensions: ['json'] }], 'Importar lista de un amigo', true);
    if (files.length) importFiles(files);
  };
  const sel = $('#kvSel');
  if (sel) sel.onchange = () => { view.sel = sel.value; view.q = ''; view.series = ''; view.shown = 150; renderFriends(); };
  const del = $('#kvDel');
  if (del) del.onclick = () => {
    if (!cur || !confirm(`¿Eliminar la lista de ${cur.owner}?`)) return;
    X.friends = X.friends.filter(f => f.id !== cur.id);
    saveExtra(); renderFriends();
  };
  const q = $('#kvQ');
  if (q) {
    q.oninput = () => {
      view.q = q.value; view.shown = 150; renderFriends();
      const n = $('#kvQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length);
    };
    $('#kvSer').onchange = (e) => { view.series = e.target.value; view.shown = 150; renderFriends(); };
    $('#kvSort').onchange = (e) => { view.sort = e.target.value; view.shown = 150; renderFriends(); };
  }
  const more = $('#kvMore');
  if (more) more.onclick = () => { view.shown += 150; renderFriends(); };
}

// Imágenes rotas: se muestran las iniciales
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && t.closest('.kv-ro .media')) {
    const m = t.closest('.media');
    m.classList.add('failed');
    t.remove();
  }
}, true);

/* ---------------------------------------------------------------- extras de escritorio */
function setupImportButtons() {
  const paste = $('#btnPasteImport'), pick = $('#btnPickImportFile');
  if (paste) paste.onclick = async () => {
    try { A.importText(await navigator.clipboard.readText()); } catch (e) { toast('No se pudo leer el portapapeles'); }
  };
  if (pick) pick.onclick = async () => {
    const files = await pickFiles([{ name: 'Texto', extensions: ['txt'] }], 'Abrir exportación de Mudae', false);
    if (files[0]) A.importText(files[0].text);
  };
}

function setupDragDrop() {
  window.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', async (e) => {
    const list = e.dataTransfer && e.dataTransfer.files;
    if (!list || !list.length) return;
    e.preventDefault();
    const profiles = [];
    for (const f of list) {
      const text = await f.text();
      if (/\.txt$/i.test(f.name)) { A.importText(text); return; }
      if (/\.json$/i.test(f.name)) profiles.push({ name: f.name, text });
    }
    if (profiles.length) { A.switchTab('friends'); importFiles(profiles); }
  });
}

function setupShortcuts() {
  const order = ['home', 'lib', 'series', 'photos', 'friends', 'settings'];
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.altKey || e.shiftKey) return;
    const i = '123456'.indexOf(e.key);
    if (i < 0) return;
    e.preventDefault();
    A.switchTab(order[i]);
  });
}

async function setupAutoBackup() {
  // La copia automática del perfil activo vive junto a los datos de la app (portable) o en Documentos/Seiri.
  // Se comprueba en cada arranque: si la carpeta cambió de sitio o de nombre, se apunta a la nueva.
  if (!D) return;
  await new Promise(r => setTimeout(r, 1200));
  try {
    const paths = await D.getPaths();
    const p = activeProfile();
    if (!paths || !p) return;
    const expected = await autoPathFor(p);
    const st = A.getSettings();
    const stale = paths.portable && st.autoFilePath && !st.autoFilePath.startsWith(paths.docs);
    if (!st.autoFileEnabled || !st.autoFilePath || stale) {
      A.setAutoFile(expected);
      if (!X.autoFileInit) toast('Copia automática activada');
    }
    X.autoFileInit = true;
    saveExtra();
  } catch (e) { /* sin copia automática */ }
}

/* ---------------------------------------------------------------- perfiles */
// Cada perfil es una colección independiente (otro servidor u otra cuenta de Mudae).
// El perfil activo vive en la base de datos normal de la app; los demás, en archivos.
const slug = (t) => norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'perfil';
const newProfileId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const activeProfile = () => X.profiles.find(p => p.id === X.activeProfile) || X.profiles[0];

async function profRead(id) {
  try {
    if (D) { const r = await D.profileRead(id); return r && r.ok ? JSON.parse(r.text) : null; }
    const t = localStorage.getItem('kv-profile:' + id);
    return t ? JSON.parse(t) : null;
  } catch (e) { return null; }
}
async function profWrite(id, obj) {
  const text = JSON.stringify(obj);
  if (D) { const r = await D.profileWrite(id, text); if (!r || !r.ok) throw new Error((r && r.error) || 'no se pudo escribir'); }
  else localStorage.setItem('kv-profile:' + id, text);
}
async function profDelete(id) {
  if (D) await D.profileDelete(id); else { try { localStorage.removeItem('kv-profile:' + id); } catch (e) {} }
}

async function autoPathFor(p) {
  if (!D) return '';
  const paths = await D.getPaths();
  if (!paths) return '';
  if (p.id === 'main') return paths.defaultBackup;
  return paths.docs + '/coleccion-' + slug(p.name) + '-' + p.id.slice(-4) + '.json';
}

function updateProfileButton() {
  const el = $('#profileName');
  const p = activeProfile();
  if (el && p) el.textContent = p.name;
}

async function switchProfile(id) {
  const cur = activeProfile();
  const target = X.profiles.find(p => p.id === id);
  if (!target || (cur && cur.id === target.id)) return;
  try {
    if (cur) { await profWrite(cur.id, A.serialize()); cur.count = A.getChars().length; }
  } catch (e) { return toast('No se pudo guardar el perfil actual; no se cambió de perfil'); }
  const data = await profRead(target.id);
  await A.loadProject(data);
  X.activeProfile = target.id;
  saveExtra();
  const ap = await autoPathFor(target);
  if (ap) A.setAutoFile(ap);
  updateProfileButton();
  renderProfiles();
  toast('Perfil activo: ' + target.name);
}

async function createProfile(copy) {
  const input = $('#profNewName');
  const name = input.value.trim();
  if (!name) return toast('Escribe un nombre para el perfil');
  if (X.profiles.some(p => norm(p.name) === norm(name))) return toast('Ya existe un perfil con ese nombre');
  const p = { id: newProfileId(), name, count: 0 };
  try {
    if (copy) { const snap = A.serialize(); await profWrite(p.id, snap); p.count = A.getChars().length; }
    else await profWrite(p.id, { v: 2, chars: [] });
  } catch (e) { return toast('No se pudo crear el perfil'); }
  X.profiles.push(p);
  input.value = '';
  saveExtra();
  await switchProfile(p.id);
}

function renderProfiles() {
  const box = $('#profilesList');
  if (!box) return;
  const cur = activeProfile();
  if (cur) cur.count = A.getChars().length;
  box.innerHTML = X.profiles.map(p => {
    const on = cur && p.id === cur.id;
    const n = Number(p.count) || 0;
    return `<div class="pr ${on ? 'cur' : ''}" data-pid="${esc(p.id)}">
      <span class="av">${esc((p.name[0] || 'P').toUpperCase())}</span>
      <div><b>${esc(p.name)}</b><small>${n ? n + ' personajes' : 'Sin importar'}${on ? ' · perfil activo' : ''}</small></div>
      <div class="acts">
        ${on ? '' : '<button class="btn small primary" data-pact="1">Usar este perfil</button>'}
        <button class="btn small ghost" data-pren="1" title="Cambiar el nombre">Renombrar</button>
        ${on || p.id === 'main' ? '' : '<button class="btn small danger" data-pdel="1" title="Eliminar este perfil y su colección">Eliminar</button>'}
      </div></div>`;
  }).join('');
}

window.SeiriProfiles = {
  activeName() { const p = activeProfile(); return p ? p.name : 'Principal'; },
  renameActive(name) {
    const p = activeProfile();
    name = String(name || '').trim().slice(0, 40);
    if (!p || !name || X.profiles.some(x => x !== p && norm(x.name) === norm(name))) return false;
    p.name = name;
    saveExtra();
    updateProfileButton();
    return true;
  }
};

function setupProfiles() {
  if (!X.profiles.length) { X.profiles.push({ id: 'main', name: 'Principal', count: 0 }); X.activeProfile = 'main'; saveExtra(); }
  if (!X.profiles.some(p => p.id === X.activeProfile)) X.activeProfile = X.profiles[0].id;
  updateProfileButton();
  const btn = $('#btnProfile');
  if (!btn) return;
  btn.onclick = () => { renderProfiles(); A.openModal('profilesModal'); };
  $('#btnCloseProfiles').onclick = () => A.closeModal('profilesModal');
  $('#btnProfCreateEmpty').onclick = () => createProfile(false);
  $('#btnProfCreateCopy').onclick = () => createProfile(true);
  $('#profNewName').onkeydown = (e) => { if (e.key === 'Enter') createProfile(false); };
  $('#profilesList').onclick = async (e) => {
    const row = e.target.closest('[data-pid]');
    if (!row) return;
    const p = X.profiles.find(x => x.id === row.dataset.pid);
    if (!p) return;
    if (e.target.closest('[data-pact]')) {
      await switchProfile(p.id);
      A.closeModal('profilesModal');
    } else if (e.target.closest('[data-pdel]')) {
      if (!confirm('¿Eliminar el perfil «' + p.name + '» y su colección guardada? No se puede deshacer.')) return;
      await profDelete(p.id);
      X.profiles = X.profiles.filter(x => x.id !== p.id);
      saveExtra(); renderProfiles();
    } else if (e.target.closest('[data-pren]')) {
      const b = row.querySelector('b');
      const inp = document.createElement('input');
      inp.className = 'input'; inp.maxLength = 40; inp.value = p.name;
      b.replaceWith(inp); inp.focus(); inp.select();
      const done = (ok) => {
        const n = inp.value.trim();
        if (ok && n && !X.profiles.some(x => x !== p && norm(x.name) === norm(n))) { p.name = n; saveExtra(); updateProfileButton(); }
        renderProfiles();
      };
      inp.onkeydown = (ev) => { if (ev.key === 'Enter') done(true); else if (ev.key === 'Escape') done(false); };
      inp.onblur = () => done(true);
    }
  };
}

/* ---------------------------------------------------------------- posiciones guardadas */
function renderPositions() {
  const list = $('#posList');
  const status = $('#posStatus');
  if (!list) return;
  const d = A.orderDiff();
  if (status) {
    status.textContent = !d.total ? 'Aún no hay personajes importados.'
      : d.moved ? d.moved.toLocaleString() + ' de ' + d.total.toLocaleString() + ' personajes están en otro puesto que en Mudae.'
      : 'Tu orden coincide con el de Mudae.';
  }
  const snaps = A.listPositionSnapshots();
  const loc = window.I18N ? window.I18N.locale() : 'es-ES';
  list.innerHTML = snaps.length ? snaps.map(p => `<div class="snap-row" data-sid="${esc(p.id)}">
      <div><b>${esc(p.name)}</b><small>${esc(new Date(p.at).toLocaleString(loc))} · ${p.count.toLocaleString()} personajes</small></div>
      <div class="acts"><button class="btn small" data-srestore="1" title="Vuelve a este orden (puedes deshacerlo con Ctrl+Z)">Restaurar</button>
        <button class="btn small danger" data-sdel="1" title="Elimina esta posición guardada">Eliminar</button></div></div>`).join('')
    : '<p class="hint">Todavía no has guardado ninguna posición.</p>';
}

function setupPositions() {
  const open = $('#btnPositions');
  if (!open) return;
  open.onclick = () => {
    const menu = $('#mainMenu');
    if (menu) { menu.hidden = true; menu.classList.add('hidden'); }
    renderPositions();
    A.openModal('positionsModal');
  };
  $('#btnClosePositions').onclick = () => A.closeModal('positionsModal');
  $('#btnOpenBackups').onclick = () => { A.closeModal('positionsModal'); const b = $('#btnBackups'); if (b) b.click(); };
  $('#btnPosSave').onclick = () => {
    const input = $('#posName');
    const id = A.savePositionSnapshot(input.value);
    if (id) { input.value = ''; renderPositions(); toast('Orden guardado'); }
  };
  $('#posList').onclick = (e) => {
    const row = e.target.closest('[data-sid]');
    if (!row) return;
    if (e.target.closest('[data-srestore]')) {
      if (A.restorePositionSnapshot(row.dataset.sid)) { renderPositions(); toast('Orden restaurado'); }
    } else if (e.target.closest('[data-sdel]')) {
      if (confirm('¿Eliminar esta posición guardada?')) { A.deletePositionSnapshot(row.dataset.sid); renderPositions(); }
    }
  };
}

/* ---------------------------------------------------------------- cuenta de Mudae */
async function refreshAccounts() {
  const m = $('#acMudaeState');
  if (!D) {
    if (m) m.textContent = 'solo en la app de escritorio';
    return;
  }
  if (m) m.textContent = 'comprobando…';
  const ms = await D.mudaeStatus();
  if (m) m.textContent = !ms.ok ? 'error' : ms.loggedIn ? '✓ sesión activa' : ms.cookies ? 'sesión no detectada' : 'sin sesión';
}

function setupAccounts() {
  const open = $('#btnAccounts');
  if (!open) return;
  open.onclick = () => {
    const menu = $('#mainMenu');
    if (menu) { menu.hidden = true; menu.classList.add('hidden'); }
    A.openModal('accountsModal');
    refreshAccounts();
  };
  $('#btnCloseAccounts').onclick = () => A.closeModal('accountsModal');
  const need = () => { if (!D) { toast('Disponible solo en la app de escritorio'); return false; } return true; };

  $('#btnMudaeLogin').onclick = async () => {
    if (!need()) return;
    toast('Se abrió la ventana de mudae.net: inicia sesión y ciérrala al terminar');
    await D.mudaeLogin();
    refreshAccounts();
  };
  $('#btnMudaeLogout').onclick = async () => {
    if (!need()) return;
    await D.mudaeLogout();
    toast('Sesión de Mudae cerrada');
    refreshAccounts();
  };
}

/* ---------------------------------------------------------------- copia diaria */
// Una copia por día y perfil en «copias/diarias» (se conservan las 7 últimas).
async function dailyBackup() {
  if (!D || !D.backupDaily || !A.getChars().length) return;
  const p = activeProfile();
  const prefix = p ? (p.id === 'main' ? 'principal' : slug(p.name)) : 'principal';
  try { await D.backupDaily(prefix, JSON.stringify(A.serialize())); } catch (e) { /* no es crítico */ }
}

/* ---------------------------------------------------------------- arranque */
document.addEventListener('mudae:tab', (e) => {
  if (e.detail && e.detail.tab === 'friends') renderFriends();
});

(async function boot() {
  await loadExtra();
  setupImportButtons();
  setupDragDrop();
  setupShortcuts();
  setupAccounts();
  setupProfiles();
  setupPositions();
  if (document.body.dataset.tab === 'friends') renderFriends();
  setupAutoBackup();
  setTimeout(dailyBackup, 8000);
})();

})();
