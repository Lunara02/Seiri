/* ============================================================================
   Seiri — pestaña Fotos
   ----------------------------------------------------------------------------
   Dos vistas, con los datos de las páginas de mudae.net de tus personajes
   (se revisan una a una, con pausa, y quedan guardados en tu PC):
   · Matching: fotos que combinan entre los personajes que tienes, agrupadas por
     conjunto (si tienes a las cinco hermanas, cada foto sale con las cinco).
   · Etiquetas: qué etiquetas tienen las fotos de tus personajes, qué significa
     cada una y qué fotos las tienen (por ejemplo «Christmas»).
   Se apoya en window.MudaeApp (app.js) y window.MudaeCore (core.js).
   ========================================================================== */
(() => {
'use strict';

const A = window.MudaeApp;
const C = window.MudaeCore;
const D = window.mudaeDesktop || null;
const esc = C.escapeHtml;
const norm = C.norm;
const $ = (s, r = document) => r.querySelector(s);

const STORE = 'galleries';
const KEY = (id) => 'm:' + id;
const TAGKEY = (name) => 'tag:' + norm(name);
const REC_V = 2;                           // versión del registro guardado (v2 incluye las etiquetas)
const FRESH_MS = 14 * 24 * 3600 * 1000;    // una revisión guardada se considera vigente 14 días
const INFO_MS = 60 * 24 * 3600 * 1000;     // el significado de una etiqueta cambia muy poco
const PAUSE_MS = 700;                      // pausa entre páginas de mudae.net
const PAGE = 12;                           // conjuntos o personajes por tanda
const TAG_LIST_MAX = 150;                  // etiquetas mostradas en la lista

const matchData = new Map();               // mudaeId -> [{ number, url, matches }]
const imgData = new Map();                 // mudaeId -> [{ number, url, tags }]
const infoMem = new Map();                 // nombre normalizado -> información de la etiqueta
const S = {
  view: 'match', running: false, stop: false, done: 0, total: 0, fail: 0, note: '', loaded: false,
  q: '', series: '', charId: '', limit: PAGE,
  tags: [], tagQ: '', tagChar: '', tagLimit: PAGE, info: null
};
let groups = [];
let root = null;

const T = (t) => (A && A.t ? A.t(t) : t);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const cmdOf = (c, n) => '$c ' + C.cleanCharName(c.name) + '$' + n;

// Categorías de etiqueta de Mudae en español (las que no estén aquí se muestran tal cual)
const CAT_ES = {
  'Seasonal': 'Estacional', 'Outfit': 'Atuendo', 'Facial Expression': 'Expresión facial', 'Position': 'Pose',
  'Accessory': 'Accesorio', 'Source': 'Fuente', 'Visual Style': 'Estilo visual', 'Physical Feature': 'Rasgo físico',
  'Alternative Appearance': 'Apariencia alternativa', 'Food': 'Comida', 'Environmental': 'Entorno', 'Action': 'Acción',
  'Image Rating': 'Nivel de la imagen', 'Flower': 'Flor', 'Framing': 'Encuadre', 'Event': 'Evento'
};

/* ---------------------------------------------------------------- datos */
function harem() {
  const m = new Map();
  for (const c of A.getChars()) if (c.mudaeId) m.set(String(c.mudaeId), c);
  return m;
}

const checkedIds = new Set();              // personajes cuyo registro guardado ya se intentó leer
async function loadCached() {
  const chars = A.getChars().filter(c => c.mudaeId);
  for (const c of chars) {
    const id = String(c.mudaeId);
    if (matchData.has(id) || checkedIds.has(id)) continue;
    checkedIds.add(id);
    try {
      const rec = await A.idbGet(STORE, KEY(id));
      if (rec && Array.isArray(rec.list)) matchData.set(id, rec.list);
      if (rec && Array.isArray(rec.imgs)) imgData.set(id, rec.imgs);
    } catch (e) { /* sin caché */ }
  }
  S.loaded = true;
}

/* Une las fotos que combinan entre sí (cada foto es un nodo «personaje#número») y
   agrupa los conjuntos por los personajes que contienen. */
function computeGroups() {
  const h = harem();
  const parent = new Map();
  const nodes = new Map();
  const find = (k) => { let r = k; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(k) !== r) { const n = parent.get(k); parent.set(k, r); k = n; } return r; };
  const add = (c, num, url) => {
    const k = c.mudaeId + '#' + num;
    if (!nodes.has(k)) { nodes.set(k, { c, num, url }); parent.set(k, k); }
    return k;
  };
  for (const [id, images] of matchData) {
    const self = h.get(id);
    if (!self) continue;
    for (const img of images) {
      let ka = null;
      for (const m of img.matches) {
        const other = h.get(m.id);
        if (!other || other === self) continue;
        if (!ka) ka = add(self, img.number, img.url);
        const kb = add(other, m.number, m.url);
        const ra = find(ka), rb = find(kb);
        if (ra !== rb) parent.set(ra, rb);
      }
    }
  }
  const comps = new Map();
  for (const [k, n] of nodes) {
    const r = find(k);
    if (!comps.has(r)) comps.set(r, []);
    comps.get(r).push(n);
  }
  const byKey = new Map();
  for (const members of comps.values()) {
    const ids = [...new Set(members.map(n => String(n.c.mudaeId)))].sort();
    if (ids.length < 2) continue;
    const key = ids.join('|');
    if (!byKey.has(key)) byKey.set(key, { key, ids, chars: ids.map(i => h.get(i)), items: [] });
    members.sort((x, y) => ids.indexOf(String(x.c.mudaeId)) - ids.indexOf(String(y.c.mudaeId)) || x.num - y.num);
    byKey.get(key).items.push(members);
  }
  groups = [...byKey.values()];
  for (const g of groups) {
    g.items.sort((x, y) => x[0].num - y[0].num);
    g.maxTiles = Math.max(...g.items.map(m => m.length));
  }
  groups.sort((x, y) => y.ids.length - x.ids.length || y.items.length - x.items.length || x.chars[0].name.localeCompare(y.chars[0].name));
}

function visibleGroups() {
  const words = norm(S.q).split(/\s+/).filter(Boolean);
  return groups.filter(g => {
    if (S.charId && !g.ids.includes(S.charId)) return false;
    if (S.series && !g.chars.some(c => c.series === S.series)) return false;
    if (!words.length) return true;
    const hay = norm(g.chars.map(c => c.name + ' ' + c.series).join(' '));
    return words.every(w => hay.includes(w));
  });
}

/* ---------------------------------------------------------------- etiquetas */
function tagScope() {
  return A.getChars().filter(c => c.mudaeId && imgData.has(String(c.mudaeId))
    && (!S.series || c.series === S.series)
    && (!S.tagChar || String(c.mudaeId) === S.tagChar));
}

// Fotos del ámbito actual que tienen TODAS las etiquetas elegidas
function taggedMatches() {
  const out = [];
  for (const c of tagScope()) {
    const imgs = imgData.get(String(c.mudaeId)).filter(i => S.tags.every(t => i.tags.includes(t)));
    if (imgs.length) out.push({ c, imgs });
  }
  out.sort((x, y) => y.imgs.length - x.imgs.length || x.c.name.localeCompare(y.c.name));
  return out;
}

// Etiquetas que aparecen en esas fotos (sin las ya elegidas), de más a menos fotos
function tagStats() {
  const stats = new Map();
  for (const c of tagScope()) {
    for (const i of imgData.get(String(c.mudaeId))) {
      if (!S.tags.every(t => i.tags.includes(t))) continue;
      for (const t of i.tags) {
        if (S.tags.includes(t)) continue;
        let s = stats.get(t);
        if (!s) { s = { name: t, photos: 0, chars: new Set() }; stats.set(t, s); }
        s.photos++; s.chars.add(c.id);
      }
    }
  }
  return [...stats.values()].sort((a, b) => b.photos - a.photos || a.name.localeCompare(b.name));
}

async function tagInfo(name) {
  const k = TAGKEY(name);
  if (infoMem.has(k)) return infoMem.get(k);
  try {
    const rec = await A.idbGet(STORE, k);
    if (rec && rec.name && Date.now() - (rec.ts || 0) < INFO_MS) { infoMem.set(k, rec); return rec; }
  } catch (e) { /* se pide de nuevo */ }
  if (!D) throw new Error('solo escritorio');
  // 1) la lista de etiquetas da categoría y subcategoría; 2) la página de la etiqueta, la definición y los alias
  const list = await A.fetchMudaeHtml('https://mudae.net/search?type=pictag&name=' + encodeURIComponent(name) + '&sort=nbr&desc=true');
  const ld = new DOMParser().parseFromString(list, 'text/html');
  const a = [...ld.querySelectorAll('a[href^="/pictag/"]')].find(x => norm(x.textContent) === norm(name));
  const info = { name, category: '', subcategory: '', definition: '', aliases: [], path: '', ts: Date.now() };
  if (a) {
    const href = a.getAttribute('href') || '';
    if (/^\/pictag\/\d+\//.test(href)) info.path = href;
    const cells = [...(a.closest('tr') ? a.closest('tr').querySelectorAll('td') : [])].map(td => td.textContent.trim());
    // columnas: número, nombre, categoría, subcategoría, cantidad de imágenes
    if (cells.length >= 4) { info.category = cells[2]; info.subcategory = cells[3] === 'No Subcategory' ? '' : cells[3]; }
  }
  if (info.path) {
    await sleep(400);
    const page = await A.fetchMudaeHtml('https://mudae.net' + info.path);
    const pd = new DOMParser().parseFromString(page, 'text/html');
    const meta = ((pd.querySelector('meta[name="description"]') || {}).content || '').trim();
    if (meta && !/^Find about all .* images in Mudae!?$/i.test(meta)) info.definition = meta;
    const main = pd.querySelector('main');
    const text = main ? main.textContent.replace(/\s+/g, ' ') : '';
    const am = text.match(/Aliases?\s*list update\s*(.*?)\s*(?:Characters with|Filters)/i);
    if (am && am[1]) info.aliases = am[1].split('|').map(s => s.trim()).filter(Boolean).slice(0, 8);
  }
  infoMem.set(k, info);
  try { await A.idbPutStore(STORE, k, info); } catch (e) { /* sin caché */ }
  return info;
}

/* ---------------------------------------------------------------- revisión */
async function scan(force, only) {
  if (S.running) return;
  if (!D) { S.note = 'Solo disponible en la app de escritorio.'; renderTop(); return; }
  const scope = only || A.getChars().filter(c => c.mudaeId && (!S.series || c.series === S.series));
  if (!scope.length) { S.note = 'Ningún personaje tiene código de Mudae. Importa tu harem con el comando de la guía.'; renderTop(); return; }
  S.running = true; S.stop = false; S.done = 0; S.total = scope.length; S.fail = 0; S.note = '';
  let consecutive = 0;
  let sinceRender = 0;
  renderTop();
  for (const c of scope) {
    if (S.stop) break;
    const id = String(c.mudaeId);
    let fromCache = false;
    if (!force) {
      try {
        const rec = await A.idbGet(STORE, KEY(id));
        if (rec && rec.v === REC_V && Array.isArray(rec.list) && Array.isArray(rec.imgs) && Date.now() - (rec.ts || 0) < FRESH_MS) {
          matchData.set(id, rec.list); imgData.set(id, rec.imgs); fromCache = true;
        }
      } catch (e) { /* se descarga */ }
    }
    if (!fromCache) {
      try {
        const html = await A.fetchMudaeHtml('https://mudae.net/character/' + id);
        const list = C.parseMatches(html);
        const imgs = C.parseImageTags(html);
        matchData.set(id, list); imgData.set(id, imgs);
        try { await A.idbPutStore(STORE, KEY(id), { v: REC_V, list, imgs, ts: Date.now() }); } catch (e) { /* sin caché */ }
        consecutive = 0;
      } catch (e) {
        S.fail++; consecutive++;
        if (consecutive >= 4) { S.note = 'No se pudo leer mudae.net varias veces seguidas. Revisa tu conexión o vincula tu cuenta de Mudae (menú de los tres puntos) y vuelve a intentarlo.'; break; }
      }
      await sleep(PAUSE_MS);
    }
    S.done++;
    if (++sinceRender >= 8) { sinceRender = 0; computeGroups(); renderTop(); renderBody(); }
  }
  S.running = false;
  computeGroups();
  if (!S.note && S.stop) S.note = 'Revisión detenida. Lo ya revisado queda guardado.';
  if (!S.note && S.fail) S.note = S.fail + ' personaje(s) no se pudieron leer; vuelve a revisar para completarlos.';
  renderTop();
  renderBody();
}

/* ---------------------------------------------------------------- vista */
function haremSeries() {
  const set = new Set();
  for (const c of A.getChars()) if (c.mudaeId) set.add(c.series);
  return [...set].sort((x, y) => x.localeCompare(y));
}

function fillSeries() {
  const sel = $('#phSeries', root);
  if (!sel) return;
  sel.innerHTML = '<option value="">Todas las series</option>' + haremSeries().map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  sel.value = S.series;
  S.series = sel.value;
}

function renderShell() {
  root.innerHTML = `
    <div class="ph-wrap" data-view="${S.view}">
      <section class="ph-intro">
        <h2>Fotos</h2>
        <div class="ph-tabs" role="tablist">
          <button type="button" role="tab" class="ph-tab" data-act="view" data-view="match">Fotos que combinan</button>
          <button type="button" role="tab" class="ph-tab" data-act="view" data-view="tags">Etiquetas</button>
        </div>
        <p class="ph-desc" id="phDesc"></p>
      </section>
      <section class="ph-bar">
        <label class="ph-field"><span>Serie</span><select class="input" id="phSeries"></select></label>
        <label class="ph-field grow only-match"><span>Buscar</span><input class="input" id="phSearch" type="search" placeholder="Personaje o serie (puedes escribir varias palabras)" autocomplete="off" list="phNames"></label>
        <label class="ph-field grow only-tags"><span>Buscar etiqueta</span><input class="input" id="phTagSearch" type="search" placeholder="Por ejemplo: Christmas, Wink, Swimsuit" autocomplete="off"></label>
        <label class="ph-field only-tags"><span>Personaje</span><input class="input" id="phTagChar" type="search" placeholder="Todos" autocomplete="off" list="phNames"></label>
        <datalist id="phNames"></datalist>
        <div class="ph-btns">
          <button type="button" class="btn primary" id="phScan"></button>
          <button type="button" class="btn ghost" id="phRescan" title="Vuelve a leer mudae.net aunque ya esté guardado">Revisar de nuevo</button>
        </div>
      </section>
      <div class="ph-chip-row" id="phChip"></div>
      <div class="ph-status" id="phStatus" aria-live="polite"></div>
      <div id="phBody"></div>
    </div>`;
  fillSeries();
  $('#phSearch', root).value = S.q;
  $('#phTagSearch', root).value = S.tagQ;
  const tc = S.tagChar ? harem().get(S.tagChar) : null;
  $('#phTagChar', root).value = tc ? tc.name : '';
  const dl = $('#phNames', root);
  dl.innerHTML = A.getChars().filter(c => c.mudaeId).slice(0, 1500).map(c => `<option value="${esc(c.name)}"></option>`).join('');
}

function renderTop() {
  if (!root || !$('#phStatus', root)) return;
  const wrap = $('.ph-wrap', root);
  wrap.dataset.view = S.view;
  for (const b of root.querySelectorAll('.ph-tab')) { const on = b.dataset.view === S.view; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); }
  $('#phDesc', root).textContent = T(S.view === 'match'
    ? 'Mudae marca qué fotos de un personaje combinan con las de otros. Aquí ves esos conjuntos con todos los personajes que tienes, y puedes ponerles esas fotos a todos de una vez.'
    : 'Cada foto de Mudae tiene etiquetas (Christmas, Wink, Swimsuit…). Elige una o varias para ver qué fotos de tus personajes las tienen; pulsa «?» para saber qué significa cada una.');
  const btn = $('#phScan', root);
  const re = $('#phRescan', root);
  btn.hidden = !D; re.hidden = !D;           // en el navegador no se puede leer mudae.net
  btn.textContent = T(S.running ? 'Detener' : 'Buscar en mudae.net');
  btn.classList.toggle('danger', S.running);
  re.disabled = S.running;
  const chip = $('#phChip', root);
  const fc = S.view === 'match' && S.charId ? harem().get(S.charId) : null;
  chip.innerHTML = fc ? `<span class="ph-chip">Personaje: <b>${esc(fc.name)}</b><button type="button" data-act="clearchar" aria-label="Quitar filtro">×</button></span>` : '';
  const st = $('#phStatus', root);
  let html = '';
  if (S.running) {
    const pct = S.total ? Math.round((S.done / S.total) * 100) : 0;
    html = `<div class="ph-prog"><i style="width:${pct}%"></i></div><span>Revisando ${S.done} de ${S.total} personajes…</span>`;
  } else if (S.view === 'match' && matchData.size) {
    const vis = visibleGroups();
    const photos = vis.reduce((s, g) => s + g.items.length, 0);
    html = `<span>Conjuntos: ${vis.length} · Fotos que combinan: ${photos} · Personajes revisados: ${matchData.size}</span>`;
  } else if (S.view === 'tags' && imgData.size) {
    html = `<span>Personajes revisados: ${imgData.size}</span>`;
  } else if (matchData.size && !imgData.size) {
    html = '<span>Para ver las etiquetas hay que revisar de nuevo: pulsa «Revisar de nuevo» (tarda unos minutos y queda guardado).</span>';
  } else if (!D) {
    html = '<span>Leer mudae.net solo funciona en la app de escritorio: el navegador del móvil no lo permite. Usa esta pestaña en el PC.</span>';
  } else if (!D) {
    html = '<span>Leer mudae.net solo funciona en la app de escritorio: el navegador del móvil no lo permite. Usa esta pestaña en el PC.</span>';
  } else {
    html = '<span>Aún no se ha revisado ningún personaje. Pulsa «Buscar en mudae.net»: tarda unos minutos la primera vez y queda guardado.</span>';
  }
  if (S.note) html += `<span class="ph-note">${esc(S.note)}</span>`;
  st.innerHTML = html;
}

/* ---- vista: fotos que combinan ---- */
function itemHtml(g, gi, ii) {
  const members = g.items[ii];
  const used = new Map();
  for (const n of members) if (!used.has(n.c.id)) used.set(n.c.id, n);
  const inUse = [...used.values()].every(n => n.c.image === n.url);
  const tiles = members.map((n, ti) => `<figure data-act="copy" data-g="${gi}" data-i="${ii}" data-t="${ti}" title="${esc(cmdOf(n.c, n.num))}">
      <img src="${esc(n.url)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      <figcaption>#${n.num}</figcaption><span class="ph-who">${esc(n.c.name)}</span></figure>`).join('');
  return `<div class="ph-item${inUse ? ' on' : ''}">
      <div class="ph-imgs" style="--n:${members.length}">${tiles}</div>
      <div class="ph-act">
        ${inUse ? '<span class="ph-badge">En uso</span>' : `<button type="button" class="btn small primary" data-act="use" data-g="${gi}" data-i="${ii}">Usar todas</button>`}
        <span class="ph-hint">Pulsa una foto para copiar su comando</span>
      </div>
    </div>`;
}

function matchBodyHtml() {
  const vis = visibleGroups();
  if (!vis.length) {
    return matchData.size ? '<div class="ph-empty">No hay fotos que combinen entre tus personajes con estos filtros.</div>' : '';
  }
  const shown = vis.slice(0, S.limit);
  return '<div class="ph-list">' + shown.map((g) => {
    const gi = groups.indexOf(g);
    const names = g.chars.length > 4
      ? g.chars.slice(0, 4).map(c => esc(c.name)).join(' · ') + ` · +${g.chars.length - 4}`
      : g.chars.map(c => esc(c.name)).join(' · ');
    const allSeries = [...new Set(g.chars.map(c => c.series))];
    const series = allSeries.slice(0, 3).map(esc).join(' · ') + (allSeries.length > 3 ? ' · +' + (allSeries.length - 3) : '');
    return `<article class="ph-pair">
      <header><b>${names}</b><small>${series}</small><em>${g.items.length} foto(s)</em></header>
      <div class="ph-photos" style="--n:${g.maxTiles}">${g.items.map((_, ii) => itemHtml(g, gi, ii)).join('')}</div>
    </article>`;
  }).join('') + (vis.length > shown.length ? `<button type="button" class="btn ghost ph-more" data-act="more">Mostrar más (${vis.length - shown.length})</button>` : '') + '</div>';
}

/* ---- vista: etiquetas ---- */
function infoCardHtml() {
  const i = S.info;
  if (!i) return '';
  if (i.state === 'loading') return `<aside class="ph-info"><b>${esc(i.name)}</b><p>Buscando el significado en mudae.net…</p></aside>`;
  if (i.state === 'err') return `<aside class="ph-info"><b>${esc(i.name)}</b><p>No se pudo leer el significado. Revisa tu conexión y vuelve a pulsar «?».</p><button type="button" class="btn small ghost" data-act="infoclose">Cerrar</button></aside>`;
  const d = i.data;
  const cat = d.category ? esc(T(CAT_ES[d.category] || d.category)) + (d.subcategory ? ' › ' + esc(d.subcategory) : '') : '';
  return `<aside class="ph-info">
      <div class="ph-info-h"><b>${esc(d.name)}</b>${cat ? `<span class="ph-cat">${cat}</span>` : ''}<button type="button" class="ph-x" data-act="infoclose" aria-label="Cerrar">×</button></div>
      <p>${d.definition ? esc(d.definition) : T('Mudae aún no tiene una definición escrita para esta etiqueta.')}</p>
      ${d.definition ? '<p class="ph-hint">Definición tal como la escribe Mudae (en inglés).</p>' : ''}
      ${d.aliases && d.aliases.length ? `<p class="ph-hint">También se escribe: ${d.aliases.map(esc).join(' · ')}</p>` : ''}
      ${d.path ? `<a class="ph-link" href="https://mudae.net${esc(d.path)}" target="_blank" rel="noopener">Abrir la etiqueta en mudae.net</a>` : ''}
    </aside>`;
}

function tagsBodyHtml() {
  if (!imgData.size) return '';
  const q = norm(S.tagQ);
  const stats = tagStats().filter(s => !q || norm(s.name).includes(q));
  const results = taggedMatches();
  const selChips = S.tags.length
    ? `<div class="ph-sel">${S.tags.map(t => `<span class="ph-tagchip on"><button type="button" data-act="droptag" data-tag="${esc(t)}" title="Quitar">${esc(t)} ×</button><button type="button" class="q" data-act="taginfo" data-tag="${esc(t)}" title="¿Qué significa?">?</button></span>`).join('')}<button type="button" class="btn small ghost" data-act="cleartags">Quitar todas</button></div>`
    : '';
  const list = stats.slice(0, TAG_LIST_MAX).map(s => `<span class="ph-tagchip"><button type="button" data-act="pickTag" data-tag="${esc(s.name)}" title="${s.photos} foto(s) en ${s.chars.size} personaje(s)">${esc(s.name)} <i>${s.photos}</i></button><button type="button" class="q" data-act="taginfo" data-tag="${esc(s.name)}" title="¿Qué significa?">?</button></span>`).join('');
  const more = stats.length > TAG_LIST_MAX ? `<p class="ph-hint">Se muestran las ${TAG_LIST_MAX} más usadas de ${stats.length}. Escribe arriba para buscar una concreta.</p>` : '';
  let res = '';
  if (S.tags.length) {
    const total = results.reduce((s, r) => s + r.imgs.length, 0);
    const shown = results.slice(0, S.tagLimit);
    res = `<h3 class="ph-h3">Fotos con ${S.tags.map(esc).join(' + ')} <small>${total} foto(s) en ${results.length} personaje(s)</small></h3>` +
      (results.length ? shown.map(r => `<article class="ph-char">
          <header><b>${esc(r.c.name)}</b><small>${esc(r.c.series)}</small><em>${r.imgs.length} foto(s)</em></header>
          <div class="ph-thumbs">${r.imgs.map(i => `<figure class="${r.c.image === i.url ? 'cur' : ''}" data-act="copyphoto" data-c="${esc(r.c.id)}" data-n="${i.number}" title="${esc(cmdOf(r.c, i.number))} — ${esc(i.tags.join(', '))}">
              <img src="${esc(i.url)}" alt="" loading="lazy" referrerpolicy="no-referrer"><figcaption>#${i.number}</figcaption>
              ${r.c.image === i.url ? '<span class="ph-badge s">En uso</span>' : `<button type="button" class="ph-use" data-act="usephoto" data-c="${esc(r.c.id)}" data-n="${i.number}">Usar</button>`}
            </figure>`).join('')}</div></article>`).join('')
        + (results.length > shown.length ? `<button type="button" class="btn ghost ph-more" data-act="moretags">Mostrar más (${results.length - shown.length})</button>` : '')
        : '<div class="ph-empty">Ningún personaje tiene fotos con esa combinación de etiquetas.</div>');
  } else {
    res = '<div class="ph-empty">Elige una etiqueta de la lista para ver las fotos que la tienen.</div>';
  }
  return `${infoCardHtml()}${selChips}
    <div class="ph-taglist">${list || '<span class="ph-hint">No hay etiquetas con ese nombre.</span>'}</div>${more}
    <div class="ph-results">${res}</div>`;
}

function renderBody() {
  if (!root) return;
  const box = $('#phBody', root);
  if (!box) return;
  box.innerHTML = S.view === 'match' ? matchBodyHtml() : tagsBodyHtml();
}

function findPhoto(charId, num) {
  const c = A.getById(charId);
  if (!c) return null;
  const img = (imgData.get(String(c.mudaeId)) || []).find(i => i.number === num);
  return img ? { c, img } : null;
}

async function openInfo(name) {
  S.info = { name, state: 'loading' };
  renderBody();
  try {
    const data = await tagInfo(name);
    if (S.info && S.info.name === name) S.info = { name, state: 'ok', data };
  } catch (e) {
    if (S.info && S.info.name === name) S.info = { name, state: 'err' };
  }
  renderBody();
}

async function onClick(e) {
  if (e.target.id === 'phScan') { if (S.running) S.stop = true; else scan(false); return; }
  if (e.target.id === 'phRescan') { scan(true); return; }
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  if (act === 'view') { S.view = t.dataset.view; S.info = null; renderTop(); renderBody(); return; }
  if (act === 'more') { S.limit += PAGE; renderBody(); return; }
  if (act === 'moretags') { S.tagLimit += PAGE; renderBody(); return; }
  if (act === 'clearchar') { S.charId = ''; renderTop(); renderBody(); return; }
  if (act === 'pickTag') { if (!S.tags.includes(t.dataset.tag)) S.tags.push(t.dataset.tag); S.tagLimit = PAGE; renderBody(); return; }
  if (act === 'droptag') { S.tags = S.tags.filter(x => x !== t.dataset.tag); S.tagLimit = PAGE; renderBody(); return; }
  if (act === 'cleartags') { S.tags = []; renderBody(); return; }
  if (act === 'taginfo') { openInfo(t.dataset.tag); return; }
  if (act === 'infoclose') { S.info = null; renderBody(); return; }
  if (act === 'copyphoto' || act === 'usephoto') {
    const p = findPhoto(t.dataset.c, Number(t.dataset.n));
    if (!p) return;
    const cmd = cmdOf(p.c, p.img.number);
    if (act === 'copyphoto') {
      const ok = await A.copyText(cmd);
      A.notify(ok ? 'Comando copiado. Pégalo en Discord.' : 'No se pudo copiar el comando.');
      return;
    }
    const n = await A.useImages([[p.c.id, p.img.url]]);
    if (!n) return;
    const ok = await A.copyText(cmd);
    A.notify(ok ? 'Foto cambiada aquí. Pega en Discord el comando copiado para cambiarla también en Mudae.' : 'Foto cambiada aquí.');
    renderBody();
    return;
  }
  const g = groups[Number(t.dataset.g)];
  const members = g && g.items[Number(t.dataset.i)];
  if (!g || !members) return;
  if (act === 'copy') {
    const n = members[Number(t.dataset.t)];
    const ok = await A.copyText(cmdOf(n.c, n.num));
    A.notify(ok ? 'Comando copiado. Pégalo en Discord.' : 'No se pudo copiar el comando.');
    return;
  }
  if (act === 'use') {
    const first = new Map();
    for (const n of members) if (!first.has(n.c.id)) first.set(n.c.id, n);
    const list = [...first.values()];
    const n = await A.useImages(list.map(x => [x.c.id, x.url]));
    if (!n) return;
    const ok = await A.copyText(cmdOf(list[0].c, list[0].num));
    A.notify(ok
      ? 'Fotos cambiadas aquí. Copié el comando de ' + list[0].c.name + '; pégalo en Discord y pulsa cada foto para copiar los demás.'
      : 'Fotos cambiadas aquí.');
    renderBody();
  }
}

async function render() {
  root = $('#tabPhotos');
  if (!root) return;
  if (!root.dataset.init) {
    root.dataset.init = '1';
    renderShell();
    root.addEventListener('click', onClick);
    root.addEventListener('change', (e) => {
      if (e.target.id === 'phSeries') { S.series = e.target.value; S.limit = PAGE; S.tagLimit = PAGE; renderTop(); renderBody(); }
    });
    root.addEventListener('input', (e) => {
      const id = e.target.id;
      if (id === 'phSearch') {
        S.q = e.target.value;
        S.limit = PAGE;
        // Si lo escrito es exactamente el nombre de un personaje, se filtra por él
        const hit = A.getChars().find(c => c.mudaeId && norm(c.name) === norm(S.q));
        if (hit) { S.charId = String(hit.mudaeId); S.q = ''; e.target.value = ''; }
        renderTop(); renderBody();
      } else if (id === 'phTagSearch') {
        S.tagQ = e.target.value; renderBody();
      } else if (id === 'phTagChar') {
        const v = e.target.value;
        const hit = A.getChars().find(c => c.mudaeId && norm(c.name) === norm(v));
        S.tagChar = hit ? String(hit.mudaeId) : '';
        if (!v || hit) { S.tagLimit = PAGE; renderBody(); }
      }
    });
  } else {
    fillSeries();
  }
  renderTop();
  await loadCached();                      // solo lee los personajes que aún no se habían leído
  computeGroups();
  renderTop();
  renderBody();
}

/* Abre la pestaña mostrando solo lo de un personaje (desde su ficha) */
async function showFor(charId, view) {
  const c = A.getById(charId);
  if (!c) return;
  S.view = view === 'tags' ? 'tags' : 'match';
  S.q = ''; S.series = ''; S.limit = PAGE; S.tagLimit = PAGE; S.tags = []; S.tagQ = ''; S.info = null;
  S.charId = S.view === 'match' && c.mudaeId ? String(c.mudaeId) : '';
  S.tagChar = S.view === 'tags' && c.mudaeId ? String(c.mudaeId) : '';
  if (root && root.dataset.init) {
    $('#phSearch', root).value = '';
    $('#phTagSearch', root).value = '';
    $('#phTagChar', root).value = S.view === 'tags' ? c.name : '';
  }
  A.switchTab('photos');
  await render();
  if (root) { $('#phTagChar', root).value = S.view === 'tags' ? c.name : ''; $('#phSearch', root).value = ''; }
  if (!c.mudaeId) { S.note = 'Este personaje no tiene código de Mudae, así que no se pueden buscar sus fotos.'; renderTop(); return; }
  // Si todavía no se ha revisado este personaje, se revisa solo a él (una página)
  if (!imgData.has(String(c.mudaeId)) && D && !S.running) await scan(false, [c]);
}

document.addEventListener('mudae:tab', (e) => { if (e.detail && e.detail.tab === 'photos') render(); });
document.addEventListener('click', (e) => {
  const id = e.target && e.target.id;
  if (id !== 'btnEditMatches' && id !== 'btnEditTags') return;
  const cid = A.getEditingId();
  if (!cid) return;
  A.closeModal('editModal');
  showFor(cid, id === 'btnEditTags' ? 'tags' : 'match');
});

window.SeiriPhotos = { render, showFor };
})();
