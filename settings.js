/* ============================================================================
   Página de Ajustes
   Cada opción: nombre, una frase que explica qué hace y un control.
   Los valores viven en window.MudaeApp.getSettings(); se cambian con MudaeApp.setSetting().
   ========================================================================== */
(() => {
'use strict';

const A = window.MudaeApp;
const C = window.MudaeCore;
const esc = C.escapeHtml;
const $ = (s, r = document) => r.querySelector(s);

const PRESETS = [
  { id: 'indigo', name: 'Índigo', c1: '#0f1216', c2: '#8197ff' },
  { id: 'hanami', name: 'Hanami', c1: '#150e38', c2: '#ff4f93' },
  { id: 'oceano', name: 'Océano', c1: '#121b22', c2: '#4cc3ff' },
  { id: 'esmeralda', name: 'Esmeralda', c1: '#121c18', c2: '#4fd6a1' },
  { id: 'ambar', name: 'Ámbar', c1: '#1b1710', c2: '#f0b24a' },
  { id: 'grafito', name: 'Grafito', c1: '#161a20', c2: '#c9cfdb' }
];

/* Esquema declarativo. type: toggle | range | seg | select | themes | color | button */
const SECTIONS = [
  { title: 'Apariencia', desc: 'Cómo se ve Seiri y sus tarjetas.', opts: [
    { type: 'seg', key: 'themeLight', name: 'Tema', desc: 'Fondo oscuro o claro.', choices: [[false, 'Oscuro'], [true, 'Claro']] },
    { type: 'themes', key: 'preset', name: 'Paleta', desc: 'Cambia el color de acento y el tono del fondo.' },
    { type: 'color', key: 'customAccent', name: 'Color de acento propio', desc: 'Sustituye el acento de la paleta por el color que elijas.' },
    { type: 'toggle', key: 'neonBorders', name: 'Bordes de neón', desc: 'Dibuja un borde luminoso alrededor del retrato, con el color de marco del personaje o el acento.' },
    { type: 'toggle', key: 'holoSheen', name: 'Reflejo holográfico', desc: 'Pasa un brillo suave por la tarjeta al colocar el cursor encima.' },
    { type: 'toggle', key: 'bgGlow', name: 'Iluminación ambiental', desc: 'Añade un resplandor del color de acento en el fondo de la aplicación.' },
    { type: 'toggle', key: 'cardGlow', name: 'Resplandor por color HEX', desc: 'Rodea cada tarjeta con un halo del color de marco que le pusiste.' }
  ] },
  { title: 'Visualización', desc: 'Qué datos aparecen en la biblioteca y cómo.', opts: [
    { type: 'range', key: 'cardSize', name: 'Tamaño de las tarjetas', desc: 'Con tarjetas más pequeñas caben más personajes por fila.', min: 100, max: 220, step: 4, unit: 'px' },
    { type: 'range', key: 'cardRadius', name: 'Redondeo de las tarjetas', desc: 'Qué tan curvas son las esquinas de los retratos.', min: 0, max: 20, step: 1, unit: 'px' },
    { type: 'toggle', key: 'groupBySeries', name: 'Agrupar por serie', desc: 'Muestra un título con el total de kakera sobre cada serie. Para reordenar arrastrando personajes, desactívalo.' },
    { type: 'toggle', key: 'showSeries', name: 'Mostrar la serie', desc: 'Pone el nombre de la serie debajo del nombre del personaje.' },
    { type: 'toggle', key: 'showKakera', name: 'Mostrar el kakera', desc: 'Pone el valor en kakera de cada personaje debajo de su nombre.' },
    { type: 'toggle', key: 'showKeys', name: 'Mostrar las llaves', desc: 'Pone cuántas llaves tiene el personaje junto al kakera.' },
    { type: 'toggle', key: 'showPos', name: 'Mostrar el puesto', desc: 'Pone el número de puesto de cada personaje en tu harem sobre el retrato. Sirve para ordenar más rápido.' },
    { type: 'toggle', key: 'showSpheres', name: 'Mostrar las esferas', desc: 'Indica cuántas esferas tiene el personaje, junto al kakera.' },
    { type: 'toggle', key: 'compactMode', name: 'Modo compacto', desc: 'Tarjetas más pequeñas y sin el nombre de la serie debajo.' },
    { type: 'select', key: 'pageSize', name: 'Separar por páginas de Mudae', desc: 'En la vista sin agrupar, marca dónde empezaría cada página de tu harem en Mudae.', numeric: true,
      choices: [[0, 'No separar'], [10, '10 por página'], [15, '15 por página'], [20, '20 por página'], [25, '25 por página']] }
  ] },
  { title: 'Orden y exportación', desc: 'Cómo se generan los comandos que pegas en Discord.', opts: [
    { type: 'toggle', key: 'nitro', name: 'Tengo Discord Nitro', desc: 'Los comandos se parten en bloques más largos (hasta 3800 caracteres en vez de 1800), así que hay menos mensajes que pegar.' },
    { type: 'toggle', key: 'autoSmOnSort', name: 'Mostrar los comandos al ordenar', desc: 'Después de ordenar tu harem se abre la ventana con los comandos listos para copiar.' },
    { type: 'toggle', key: 'seriesRespectPinned', name: 'Respetar los personajes fijados', desc: 'Al aplicar el orden de las series, los personajes con la posición fijada no se mueven.' },
    { type: 'toggle', key: 'seriesAutoApply', name: 'Aplicar al mover una serie', desc: 'Cada vez que cambias de sitio una serie, el orden se aplica enseguida a la biblioteca.' }
  ] },
  { title: 'Rendimiento', desc: 'Para equipos con pocos recursos.', opts: [
    { type: 'toggle', key: 'performanceMode', name: 'Modo rendimiento', desc: 'Desactiva los efectos visuales y la caché de imágenes. Ayuda si la biblioteca va lenta.' },
    { type: 'toggle', key: 'pauseGifs', name: 'Pausar los GIF', desc: 'Los GIF se muestran quietos hasta que los abres; ahorra memoria.' }
  ] },
  { title: 'Idioma', desc: 'Idioma de la interfaz.', opts: [
    { type: 'seg', key: 'lang', name: 'Idioma', desc: 'Cambia todos los textos de Seiri al instante.', choices: [['es', 'Español'], ['en', 'English']], custom: 'lang' }
  ] },
  { title: 'Perfiles y datos', desc: 'Tus colecciones y dónde se guardan.', opts: [
    { type: 'button', name: 'Perfil activo', desc: 'Cada perfil es una colección distinta, por ejemplo un servidor o una cuenta de Mudae.', label: 'Gestionar perfiles', click: () => $('#btnProfile').click(), dyn: 'profile' },
    { type: 'button', name: 'Posiciones guardadas', desc: 'Guarda cómo tienes ordenado el harem y vuelve a ese orden cuando quieras.', label: 'Abrir', click: () => $('#btnPositions').click() },
    { type: 'button', name: 'Cuenta de Mudae', desc: 'Inicia sesión para ver las galerías de imágenes de cada personaje, también las que exigen cuenta.', label: 'Abrir', click: () => $('#btnAccounts').click() },
    { type: 'button', name: 'Carpeta de datos', desc: 'Tu colección y sus copias de seguridad se guardan en tu equipo. Ábrela para copiarlas o moverlas.', label: 'Abrir carpeta', click: () => $('#btnOpenData').click() },
    { type: 'toggle', key: 'checkUpdates', name: 'Avisar de versiones nuevas', desc: 'Al abrir Seiri pregunta en GitHub cuál es la última versión y, si hay una más nueva, lo indica abajo en la barra lateral. No envía tus datos. Solo en la app de escritorio.' },
    { type: 'button', name: 'Asistente de bienvenida', desc: 'Vuelve a ver la configuración inicial: idioma, perfil y efectos.', label: 'Repetir', click: () => window.SeiriSetup && window.SeiriSetup.open() },
    { type: 'button', name: 'Borrar todos los datos', desc: 'Elimina la colección, el orden y las imágenes guardadas de este equipo. No se puede deshacer.', label: 'Borrar', danger: true, click: () => $('#btnReset').click() }
  ] }
];

/* ---------------------------------------------------------------- controles */
function valueOf(key) {
  const s = A.getSettings();
  if (key === 'lang') return window.I18N ? window.I18N.getLang() : 'es';
  if (key === 'cardRadius') return s.cardRadius !== undefined ? s.cardRadius : 8;
  if (key === 'pageSize') return Number(s.pageSize) || 0;
  if (key === 'preset') return s.preset || 'indigo';
  if (key === 'customAccent') return s.customAccent || '';
  if (['bgGlow', 'cardGlow', 'neonBorders', 'holoSheen', 'showPos', 'showSpheres', 'showKakera', 'showKeys', 'showSeries', 'autoSmOnSort', 'checkUpdates', 'seriesRespectPinned'].includes(key)) return s[key] !== false;
  if (key === 'cardSize') return Number(s.cardSize) || 144;
  return s[key];
}

function control(o, i) {
  const v = valueOf(o.key);
  switch (o.type) {
    case 'toggle':
      return `<input type="checkbox" class="switch" data-k="${o.key}" ${v ? 'checked' : ''} aria-label="${esc(o.name)}">`;
    case 'range':
      return `<input type="range" data-k="${o.key}" min="${o.min}" max="${o.max}" step="${o.step}" value="${v}" aria-label="${esc(o.name)}"><span class="muted num" data-out="${o.key}">${v} ${o.unit}</span>`;
    case 'seg':
      return `<div class="seg" data-k="${o.key}">${o.choices.map(([val, label]) => `<button type="button" data-v="${esc(String(val))}" class="${String(val) === String(v) ? 'on' : ''}">${esc(label)}</button>`).join('')}</div>`;
    case 'select':
      return `<select class="input" data-k="${o.key}" aria-label="${esc(o.name)}">${o.choices.map(([val, label]) => `<option value="${val}" ${String(val) === String(v) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
    case 'themes':
      return `<div class="themes" data-k="preset">${PRESETS.map(p => `<button type="button" class="theme-chip ${p.id === v ? 'on' : ''}" data-v="${p.id}" style="--c1:${p.c1};--c2:${p.c2}" title="${esc(p.name)}"><i></i>${esc(p.name)}</button>`).join('')}</div>`;
    case 'color':
      return `<input type="color" class="color-in" data-k="customAccent" value="${v || '#8197ff'}" aria-label="${esc(o.name)}"><button type="button" class="btn small ghost" data-clear="customAccent" ${v ? '' : 'disabled'}>Quitar</button>`;
    case 'button':
      return `<button type="button" class="btn small ${o.danger ? 'danger' : ''}" data-btn="${i}">${esc(o.label)}</button>`;
    default:
      return '';
  }
}

function previewHtml() {
  const st = A.getSettings();
  const size = Number(st.cardSize) || 144;
  const pos = st.showPos !== false ? '<span class="tag slot">12</span>' : '';
  const tags = pos ? '<div class="tags">' + pos + '</div>' : '';
  const sph = st.showSpheres !== false ? '<span class="sph-line"><i class="sp-dot"></i>1.000 sp</span>' : '';
  const meta = (st.showKakera !== false ? '<span class="ka">459 ka</span>' : '') + (st.showKeys !== false ? '<span class="keys"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/></svg>6</span>' : '') + sph;
  return '<h3>Vista previa</h3><p>Así se ve una tarjeta con tus ajustes.</p>' +
    '<article class="card framed" style="--frame:#8b5cf6"><div class="media"><img src="icons/sample-miku.png" alt=""><span class="sheen"></span>' + tags + '</div>' +
    '<div class="cap"><b>Hatsune Miku</b>' + ((st.compactMode || st.showSeries === false) ? '' : '<span class="ser">Vocaloid</span>') +
    (meta ? '<div class="meta">' + meta + '</div>' : '') + '</div></article>' +
    '<div class="size-note">' + size + ' px de ancho</div>';
}

function refreshPreview() {
  const p = $('#tabSettings .set-prev');
  if (p) p.innerHTML = previewHtml();
}

function render() {
  const root = $('#tabSettings');
  if (!root) return;
  let n = 0;
  const btns = [];
  root.innerHTML = `<div class="set-wrap"><div class="set-in">${SECTIONS.map(sec => `
    <section class="sgrp">
      <div><h2>${esc(sec.title)}</h2><p>${esc(sec.desc)}</p></div>
      <div>${sec.opts.map(o => {
        const idx = n++;
        btns[idx] = o;
        const sub = o.dyn === 'profile' ? `<p class="muted">Ahora: <b>${esc(window.SeiriProfiles ? window.SeiriProfiles.activeName() : '')}</b></p>` : '';
        return `<div class="opt"><div><b>${esc(o.name)}</b><p>${esc(o.desc)}</p>${sub}</div><div class="ctl">${control(o, idx)}</div></div>`;
      }).join('')}</div>
    </section>`).join('')}</div><aside class="set-prev">${previewHtml()}</aside></div>`;
  root._opts = btns;
}

function onChange(e) {
  const t = e.target;
  const key = t.dataset && t.dataset.k;
  if (!key) return;
  setTimeout(refreshPreview, 30);
  if (t.type === 'checkbox') A.setSetting(key, t.checked);
  else if (t.type === 'range') {
    A.setSetting(key, Number(t.value));
    const out = $('#tabSettings [data-out="' + key + '"]');
    if (out) out.textContent = t.value + ' px';
  } else if (t.type === 'color') {
    A.setSetting('customAccent', t.value);
    const clr = $('#tabSettings [data-clear="customAccent"]');
    if (clr) clr.disabled = false;
  } else if (t.tagName === 'SELECT') A.setSetting(key, Number(t.value));
}

function onClick(e) {
  const root = $('#tabSettings');
  const chip = e.target.closest('.theme-chip');
  if (chip) {
    A.setSetting('preset', chip.dataset.v);
    A.setSetting('customAccent', '');
    setTimeout(refreshPreview, 30);
    root.querySelectorAll('.theme-chip').forEach(c => c.classList.toggle('on', c === chip));
    const clr = root.querySelector('[data-clear="customAccent"]');
    if (clr) clr.disabled = true;
    return;
  }
  const clear = e.target.closest('[data-clear]');
  if (clear) { A.setSetting('customAccent', ''); render(); return; }
  const segBtn = e.target.closest('.seg button');
  if (segBtn) {
    const seg = segBtn.parentElement;
    const key = seg.dataset.k;
    const raw = segBtn.dataset.v;
    if (key === 'lang') {
      if (window.I18N) window.I18N.setLang(raw);
      A.setSetting('lang', raw);
    } else {
      A.setSetting(key, raw === 'true' ? true : raw === 'false' ? false : raw);
    }
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === segBtn));
    return;
  }
  const btn = e.target.closest('[data-btn]');
  if (btn) {
    const o = root._opts[Number(btn.dataset.btn)];
    if (o && o.click) o.click();
  }
}

(function boot() {
  const root = $('#tabSettings');
  if (!root) return;
  root.addEventListener('change', onChange);
  root.addEventListener('input', (e) => { if (e.target.type === 'range') onChange(e); });
  root.addEventListener('click', onClick);
  document.addEventListener('mudae:tab', (e) => { if (e.detail && e.detail.tab === 'settings') render(); });
  document.addEventListener('seiri:lang', () => { if (document.body.dataset.tab === 'settings') render(); });
  window.SeiriSettings = { render, PRESETS };
})();

})();
