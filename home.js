/* ============================================================================
   Inicio: resumen de la colección, evolución del kakera y próximos pasos.
   También: carpeta de datos y aviso de «harem en el portapapeles».
   Se apoya en window.MudaeApp (app.js) y window.MudaeCore (core.js).
   ========================================================================== */
(() => {
'use strict';

const A = window.MudaeApp;
const C = window.MudaeCore;
const D = window.mudaeDesktop || null;
const esc = C.escapeHtml;
const fmt = C.fmtKakera;
const $ = (s, r = document) => r.querySelector(s);

const SVG_KEY = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/></svg>';
const SVG_COPY = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';

let appPaths = null;

/* ---------------------------------------------------------------- datos */
function compact(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + ' M';
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + ' k';
  return fmt(n);
}

function metrics() {
  const st = A.getState();
  const chars = st.chars || [];
  let ka = 0, keys = 0, withKeys = 0, noColor = 0;
  const bySeries = new Map();
  for (const c of chars) {
    const k = Number(c.kakera) || 0;
    ka += k;
    const ky = Number(c.keys) || 0;
    keys += ky;
    if (ky > 0) { withKeys++; if (!c.embedColor) noColor++; }
    const s = bySeries.get(c.series) || { name: c.series, n: 0, ka: 0 };
    s.n++; s.ka += k;
    bySeries.set(c.series, s);
  }
  const top = chars.slice().sort((a, b) => (Number(b.kakera) || 0) - (Number(a.kakera) || 0)).slice(0, 5);
  const series = [...bySeries.values()].sort((a, b) => b.ka - a.ka);
  return { st, chars, ka, keys, withKeys, noColor, top, series };
}

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

/* ---------------------------------------------------------------- gráfica */
function chart(points) {
  if (points.length < 2) {
    return '<p class="muted">Vuelve a importar tu harem en otro momento y aquí verás cómo evoluciona tu kakera.</p>';
  }
  const W = 640, H = 190, L = 54, R = 14, T = 16, B = 26;
  const vals = points.map(p => p.v);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.15 || hi * 0.1 || 1;
  const y0 = Math.max(0, lo - pad), y1 = hi + pad;
  const x = (i) => L + (i * (W - L - R)) / (points.length - 1);
  const y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const line = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
  const area = line + ` L${x(points.length - 1).toFixed(1)} ${H - B} L${L} ${H - B} Z`;
  const ticks = [0, 0.5, 1].map(f => y0 + (y1 - y0) * f);
  const date = (t) => new Date(t).toLocaleDateString(window.I18N ? window.I18N.locale() : 'es-ES', { day: 'numeric', month: 'short' });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Kakera a lo largo del tiempo">
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="var(--line)"/><text x="${L - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${esc(compact(t))}</text>`).join('')}
    <path d="${area}" fill="var(--accent-soft)"/>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
    ${points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3" fill="var(--bg)" stroke="var(--accent)" stroke-width="1.6"><title>${esc(date(p.at))}: ${esc(fmt(p.v))} ka</title></circle>`).join('')}
    <text x="${L}" y="${H - 6}">${esc(date(points[0].at))}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end">${esc(date(points[points.length - 1].at))}</text>
  </svg>`;
}

/* ---------------------------------------------------------------- tarjeta pequeña */
function miniCard(c) {
  const frame = c.embedColor ? ` framed" style="--frame:${esc(c.embedColor)}` : '';
  return `<article class="card${frame}" data-open="${esc(c.id)}" tabindex="0">
    <div class="media"><img src="${esc(A.imgSrc(c))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"></div>
    <div class="cap"><b>${esc(c.name)}</b><div class="meta"><span class="ka">${esc(fmt(c.kakera || 0))} ka</span>${Number(c.keys) > 0 ? `<span class="keys">${SVG_KEY}${Number(c.keys)}</span>` : ''}</div></div>
  </article>`;
}

/* ---------------------------------------------------------------- pantalla */
function renderHome() {
  const root = $('#tabHome');
  if (!root) return;
  const m = metrics();
  const cmd = A.exportCommand ? A.exportCommand() : '';

  if (!m.chars.length) {
    root.innerHTML = `<div class="welcome">
      <h1>Ordena tu harem de Mudae</h1>
      <p class="lead">Importa tu lista una vez y trabaja con ella aquí: ordénala, elige colores de marco y copia los comandos para dejarla igual en Discord.</p>
      <div class="steps-list">
        <div class="st"><i>1</i><div><b>Pide tu lista a Mudae</b><span>En Discord, ejecuta este comando. Mudae te responde por mensaje directo.</span>
          <div class="code-line"><span>${esc(cmd)}</span><button class="btn small" id="homeCopyCmd" type="button">${SVG_COPY}<span>Copiar</span></button></div></div></div>
        <div class="st"><i>2</i><div><b>Copia el mensaje</b><span>Selecciona desde el primer título de serie hasta el último personaje y cópialo.</span></div></div>
        <div class="st"><i>3</i><div><b>Impórtalo aquí</b><span>Pulsa «Importar harem» y pega el texto. Seiri avisa si algo no se entiende.</span></div></div>
      </div>
      <div class="cta-row"><button class="btn primary" id="homeImport" type="button">Importar harem</button><button class="btn" id="homeFriends" type="button">Ver la lista de un amigo</button></div>
    </div>`;
    $('#homeCopyCmd').onclick = () => A.copyText(cmd);
    $('#homeImport').onclick = () => $('#btnOpenImport').click();
    $('#homeFriends').onclick = () => A.switchTab('friends');
    return;
  }

  const hist = (m.st.importHistory || []).filter(h => Number.isFinite(h.ka));
  const last = hist[0], prev = hist[1];
  const dChars = last && prev ? last.chars - prev.chars : 0;
  const dKa = last && prev ? last.ka - prev.ka : 0;
  const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
  const profile = window.SeiriProfiles ? window.SeiriProfiles.activeName() : '';
  const when = m.st.importedAt ? window.SeiriShell.ago(m.st.importedAt) : '';

  // Tareas sugeridas (máximo 3)
  const diff = A.orderDiff();
  const todos = [];
  if (diff.moved > 0) todos.push({ t: 'Exportar el orden', d: fmt(diff.moved) + ' personajes están en otro puesto que en Mudae.', b: 'Exportar', id: 'todoExport' });
  if (m.noColor > 0) todos.push({ t: 'Elegir color de marco', d: fmt(m.noColor) + ' personajes con llaves aún no tienen color.', b: 'Revisar', id: 'todoColor' });
  if (m.st.importedAt && Date.now() - m.st.importedAt > 7 * 86400000) todos.push({ t: 'Actualizar tu harem', d: 'Lo importaste ' + when + '.', b: 'Importar', id: 'todoImport' });
  if (!todos.length) todos.push({ t: 'Todo al día', d: 'Tu orden coincide con Mudae y tus datos están recientes.', b: 'Ver biblioteca', id: 'todoLib' });

  const maxKa = Math.max(1, ...m.series.slice(0, 5).map(s => s.ka));
  root.innerHTML = `<div class="home-wrap">
    <div class="hello"><h2>${esc(greeting())}${profile ? ', ' + esc(profile) : ''}</h2>${when ? `<span class="muted">Última importación ${esc(when)}</span>` : ''}</div>
    <div class="figs">
      <div class="fig"><div class="v">${esc(fmt(m.chars.length))}</div><div class="l">personajes${dChars ? ` <span class="muted">(${esc(sign(dChars))} en la última importación)</span>` : ''}</div></div>
      <div class="fig"><div class="v">${esc(compact(m.ka))}<small>ka</small></div><div class="l">kakera en total${dKa ? ` <span class="muted">(${esc(sign(dKa))})</span>` : ''}</div></div>
      <div class="fig"><div class="v">${esc(fmt(m.series.length))}</div><div class="l">series</div></div>
      <div class="fig"><div class="v">${esc(fmt(m.withKeys))}</div><div class="l">con llaves</div></div>
    </div>
    <div class="dgrid">
      <div>
        <section class="sec"><h3>Personajes con más kakera <button class="link-btn" id="homeSeeLib" type="button">Ver biblioteca</button></h3>
          <div class="top5">${m.top.map(miniCard).join('')}</div></section>
        <section class="sec"><h3>Kakera a lo largo del tiempo</h3><div class="chart">${chart(hist.slice().reverse().map(h => ({ at: h.at, v: h.ka })))}</div></section>
      </div>
      <div>
        <section class="sec"><h3>Series con más kakera <button class="link-btn" id="homeSeeSeries" type="button">Ver series</button></h3>
          <div class="bars">${m.series.slice(0, 5).map(s => `<div class="bar-r" data-series="${esc(s.name)}"><span class="nm" title="${esc(s.name)}">${esc(s.name)}</span><span class="tr"><i style="width:${Math.max(4, Math.round(s.ka / maxKa * 100))}%"></i></span><span class="vl">${esc(fmt(s.ka))} ka</span></div>`).join('')}</div></section>
        <section class="sec"><h3>Qué hacer ahora</h3>
          <div class="todo">${todos.slice(0, 3).map(t => `<div class="t"><b>${esc(t.t)}</b><span>${esc(t.d)}</span><button class="btn small" id="${t.id}" type="button">${esc(t.b)}</button></div>`).join('')}</div></section>
        <section class="sec tm-card" id="homeTimers"></section>
      </div>
    </div></div>`;

  if (window.SeiriTimers) window.SeiriTimers.mount($('#homeTimers'));
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('homeSeeLib', () => A.switchTab('lib'));
  on('homeSeeSeries', () => A.switchTab('series'));
  on('todoExport', () => $('#btnQuickSm').click());
  on('todoColor', () => { A.setKeyFilter('keys_nocolor'); A.switchTab('lib'); });
  on('todoImport', () => $('#btnOpenImport').click());
  on('todoLib', () => A.switchTab('lib'));
  root.onclick = (e) => {
    const card = e.target.closest('[data-open]');
    if (card) return A.openEdit(card.dataset.open);
    const row = e.target.closest('[data-series]');
    if (row) A.setSeriesFilter(row.dataset.series);
  };
  root.onkeydown = (e) => {
    const card = e.target.closest && e.target.closest('[data-open]');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); A.openEdit(card.dataset.open); }
  };
}

/* ---------------------------------------------------------------- carpeta de datos */
function openDataFolder() {
  if (D && D.openFolder) D.openFolder(appPaths && appPaths.root);
}

/* ---------------------------------------------------------------- harem en el portapapeles */
// Al volver a la ventana, si lo copiado parece una exportación de Mudae, se ofrece importarla.
let clipSeen = '';
const clipKey = (t) => t.length + ':' + t.slice(0, 80) + t.slice(-80);

async function checkClipboard() {
  if (!D || !D.readClipboard) return;
  const modal = $('#importModal');
  if (modal && !modal.hidden) return;
  let text = '';
  try { text = await D.readClipboard(); } catch (e) { return; }
  if (!text || text.length < 300 || !/https?:\/\//.test(text)) return;
  const key = clipKey(text);
  if (key === clipSeen) return;
  let parsed;
  try { parsed = C.parseExport(text); } catch (e) { return; }
  if (!parsed || parsed.chars.length < 3) return;
  clipSeen = key;
  showClipBanner(text, parsed);
}

function showClipBanner(text, parsed) {
  let b = $('#clipBanner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'clipBanner';
    b.className = 'clip-banner';
    document.body.append(b);
  }
  const series = new Set(parsed.chars.map(c => c.series)).size;
  b.hidden = false;
  b.innerHTML = '<div class="ct"><b>Hay un harem en el portapapeles</b><small>' + fmt(parsed.chars.length) + ' personajes en ' + fmt(series) + ' series. ¿Quieres importarlo?</small></div>' +
    '<button class="btn primary small" id="clipYes" type="button">Importar</button><button class="btn small ghost" id="clipNo" type="button">Ahora no</button>';
  $('#clipYes').onclick = () => { b.hidden = true; A.importText(text); };
  $('#clipNo').onclick = () => { b.hidden = true; };
  clearTimeout(showClipBanner.t);
  showClipBanner.t = setTimeout(() => { b.hidden = true; }, 20000);
}

/* ---------------------------------------------------------------- arranque */
function refresh() {
  if (document.body.dataset.tab === 'home') renderHome();
}

(async function boot() {
  if (D && D.getPaths) { try { appPaths = await D.getPaths(); } catch (e) { /* sin ruta */ } }
  const btnData = $('#btnOpenData');
  if (btnData) btnData.onclick = openDataFolder;
  document.addEventListener('mudae:render', refresh);
  document.addEventListener('mudae:tab', (e) => { if (e.detail && e.detail.tab === 'home') renderHome(); });
  document.addEventListener('seiri:lang', refresh);
  let clipTimer = 0;
  window.addEventListener('focus', () => { clearTimeout(clipTimer); clipTimer = setTimeout(checkClipboard, 400); });
  setTimeout(checkClipboard, 1500);
  refresh();
})();

})();
