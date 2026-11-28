/* ============================================================================
   Buscador con sugerencias (personajes y series)
   ----------------------------------------------------------------------------
   · Índice en memoria con los textos ya normalizados: cada pulsación solo recorre
     un array (no toca el DOM ni la base de datos).
   · Espera 90 ms tras la última tecla y descarta resultados de consultas antiguas.
   · Máximo 6 personajes y 4 series en pantalla; navegación con teclado.
   Se apoya en window.MudaeApp (app.js) y window.MudaeCore (core.js).
   ========================================================================== */
(() => {
'use strict';

const A = window.MudaeApp;
const C = window.MudaeCore;
const esc = C.escapeHtml;
const norm = C.norm;

const MAX_CHARS = 6;
const MAX_SERIES = 4;
const WAIT_MS = 90;

let index = null;
let indexKey = '';
let ticket = 0;
let items = [];
let active = -1;
let box = null;
let input = null;

/* ---------------------------------------------------------------- índice */
function ensureIndex() {
  const st = A.getState();
  const chars = st.chars || [];
  const key = chars.length + ':' + (st.importedAt || 0) + ':' + (chars[0] ? chars[0].id : '');
  if (index && key === indexKey) return index;
  const seriesMap = new Map();
  const list = chars.map(c => {
    const sn = norm(c.series);
    const entry = seriesMap.get(c.series) || { name: c.series, sn, n: 0 };
    entry.n++;
    seriesMap.set(c.series, entry);
    const nn = norm(c.name);
    return { id: c.id, name: c.name, nn, words: nn.split(' '), series: c.series, sn, ka: Number(c.kakera) || 0 };
  });
  index = { chars: list, series: [...seriesMap.values()] };
  indexKey = key;
  return index;
}

/* ---------------------------------------------------------------- puntuación */
// Más alto = mejor. 0 = no coincide.
function scoreText(q, tokens, text, words) {
  if (text === q) return 100;
  if (text.startsWith(q)) return 90;
  if (words.some(w => w.startsWith(q))) return 75;
  if (tokens.length > 1 && tokens.every(t => text.includes(t))) return 60;
  if (text.includes(q)) return 45;
  return 0;
}

const OP_RE = /^\s*(series|serie|name|nombre|personaje|character)\s*:\s*(.*)$/i;

function search(raw0) {
  let raw = raw0, op = '';
  const m = OP_RE.exec(raw0);
  if (m) { op = /^(series|serie)$/i.test(m[1]) ? 'series' : 'name'; raw = m[2]; }
  const q = norm(raw);
  if (!q && op === 'series') {
    const top = ensureIndex().series.slice().sort((a, b) => b.n - a.n).slice(0, MAX_SERIES);
    return { chars: [], series: top, seriesFirst: true, q: '' };
  }
  if (!q) return { chars: [], series: [], q: '' };
  const tokens = q.split(' ').filter(Boolean);
  const idx = ensureIndex();

  const chars = [];
  for (const c of idx.chars) {
    let s = scoreText(q, tokens, c.nn, c.words);
    if (!s && tokens.length > 1 && tokens.every(t => c.nn.includes(t) || c.sn.includes(t))) s = 30; // nombre + serie
    if (!s && c.sn.includes(q)) s = 15;                                                              // solo por serie
    if (s) chars.push({ c, s });
  }
  chars.sort((a, b) => b.s - a.s || b.c.ka - a.c.ka);

  const series = [];
  for (const s of idx.series) {
    const sc = scoreText(q, tokens, s.sn, s.sn.split(' '));
    if (sc) series.push({ s, sc });
  }
  series.sort((a, b) => b.sc - a.sc || b.s.n - a.s.n);

  const bestChar = chars.length ? chars[0].s : 0;
  const bestSeries = series.length ? series[0].sc : 0;
  return {
    chars: op === 'series' ? [] : chars.slice(0, MAX_CHARS).map(x => x.c),
    series: op === 'name' ? [] : series.slice(0, MAX_SERIES).map(x => x.s),
    seriesFirst: op === 'series' || bestSeries > bestChar,   // si lo escrito se parece más a una serie, las series van arriba
    q: raw
  };
}

/* ---------------------------------------------------------------- pintado */
// Resalta en el texto original la parte que coincide (sin acentos ni mayúsculas)
function highlight(text, raw) {
  const q = norm(raw);
  if (!q) return esc(text);
  const plain = norm(text);
  const i = plain.indexOf(q);
  // La normalización puede cambiar la longitud (acentos compuestos): solo se resalta si coincide 1 a 1
  if (i < 0 || plain.length !== text.length) return esc(text);
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
}

const ICON_CHAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/></svg>';
const ICON_SERIES = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h6"/></svg>';

function render(raw, res) {
  const t = A.t || ((s) => s);
  items = [];
  const charsHtml = () => {
    if (!res.chars.length) return '';
    let h = '<div class="sg-head">' + esc(t('Personajes')) + '</div>';
    for (const c of res.chars) {
      items.push({ kind: 'char', id: c.id });
      h += '<button type="button" class="sg-item" role="option" data-i="' + (items.length - 1) + '">' +
        '<span class="sg-ico">' + ICON_CHAR + '</span>' +
        '<span class="sg-txt"><b>' + highlight(c.name, res.q) + '</b><small>' + esc(c.series) + '</small></span>' +
        (c.ka ? '<span class="sg-ka">' + esc(C.fmtKakera(c.ka)) + ' ka</span>' : '') + '</button>';
    }
    return h;
  };
  const seriesHtml = () => {
    if (!res.series.length) return '';
    let h = '<div class="sg-head">' + esc(t('Series')) + '</div>';
    for (const s of res.series) {
      items.push({ kind: 'series', name: s.name });
      h += '<button type="button" class="sg-item" role="option" data-i="' + (items.length - 1) + '">' +
        '<span class="sg-ico">' + ICON_SERIES + '</span>' +
        '<span class="sg-txt"><b>' + highlight(s.name, res.q) + '</b><small>' + s.n + ' ' + esc(t('personajes')) + '</small></span></button>';
    }
    return h;
  };
  let html = res.seriesFirst ? seriesHtml() + charsHtml() : charsHtml() + seriesHtml();
  if (!items.length) html = '<div class="sg-empty">' + esc(t('Sin coincidencias')) + '</div>';
  box.innerHTML = html;
  active = items.length ? 0 : -1;
  paintActive();
  box.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function paintActive() {
  box.querySelectorAll('.sg-item').forEach((el, i) => {
    el.classList.toggle('on', i === active);
    el.setAttribute('aria-selected', i === active ? 'true' : 'false');
  });
  const on = box.querySelector('.sg-item.on');
  if (on) on.scrollIntoView({ block: 'nearest' });
}

function close() {
  if (!box) return;
  box.hidden = true;
  items = [];
  active = -1;
  ticket++;
  input.setAttribute('aria-expanded', 'false');
}

function choose(i) {
  const it = items[i];
  if (!it) return;
  close();
  if (it.kind === 'char') {
    A.openEdit(it.id);
  } else {
    input.value = '';
    A.setSearch('');
    A.setSeriesFilter(it.name);
  }
}

/* ---------------------------------------------------------------- eventos */
function onInput() {
  const raw = input.value;
  const my = ++ticket;
  if (!norm(raw)) { close(); return; }
  setTimeout(() => {
    if (my !== ticket) return;            // llegó una pulsación más reciente
    render(raw, search(raw));
  }, WAIT_MS);
}

function onKey(e) {
  if (box.hidden) {
    if (e.key === 'ArrowDown' && norm(input.value)) { onInput(); e.preventDefault(); }
    return;
  }
  if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) { active = (active + 1) % items.length; paintActive(); } }
  else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { active = (active - 1 + items.length) % items.length; paintActive(); } }
  else if (e.key === 'Enter') { if (active >= 0 && items[active]) { e.preventDefault(); choose(active); } }
  else if (e.key === 'Escape') { e.stopPropagation(); close(); }
}

function init() {
  input = document.getElementById('search');
  if (!input) return;
  input.removeAttribute('list');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-autocomplete', 'list');

  // El contenedor ya existe en el HTML (con el icono de lupa); si no, se crea
  let wrap = input.closest('.search-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'search-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.append(input);
  }
  box = document.createElement('div');
  box.className = 'suggest';
  box.setAttribute('role', 'listbox');
  box.hidden = true;
  wrap.append(box);

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKey);
  input.addEventListener('focus', () => { if (norm(input.value) && box.hidden) onInput(); });
  // mousedown (no click) para elegir antes de que el campo pierda el foco
  box.addEventListener('mousedown', (e) => {
    const b = e.target.closest('.sg-item');
    if (b) { e.preventDefault(); choose(Number(b.dataset.i)); }
  });
  document.addEventListener('mousedown', (e) => { if (!wrap.contains(e.target)) close(); });
  window.addEventListener('blur', close);
}

window.MudaeSuggest = { search };   // para pruebas
init();

})();
