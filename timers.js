/* ============================================================================
   Seiri — temporizadores de Mudae (tarjeta de Inicio)
   ----------------------------------------------------------------------------
   Reclamo ($mu) y tiradas ($ru) son ciclos fijos: se calibran una vez escribiendo el
   tiempo que te dice Mudae y desde ahí Seiri sabe cuándo es el siguiente reinicio.
   $daily, $dk y el voto se marcan con «Lo usé» y arrancan su cuenta atrás.
   Avisa con una notificación solo mientras Seiri está abierto. No lee Discord ni
   envía nada: todo se guarda en este equipo (localStorage).
   ========================================================================== */
(() => {
'use strict';

const A = window.MudaeApp;
const KEY = 'seiri:timers';
const HOUR = 3600e3;

// Ciclos (se calibran) y cuentas atrás (se marcan con «Lo usé»)
const CYCLES = {
  claim: { name: 'Reclamo', cmd: '$mu', unit: 'h', mult: HOUR, def: 3, msg: 'Se reinició el reclamo: ya puedes reclamar.' },
  rolls: { name: 'Tiradas', cmd: '$ru', unit: 'min', mult: 60e3, def: 60, msg: 'Se reiniciaron las tiradas.' }
};
const ONESHOT = {
  daily: { name: '$daily', every: 20 * HOUR, msg: 'Tu $daily ya está disponible.' },
  dk: { name: '$dk', every: 20 * HOUR, msg: 'Tu $dk (kakera diario) ya está disponible.' },
  vote: { name: 'Voto', every: 12 * HOUR, msg: 'Ya puedes votar por Mudae otra vez ($vote).' }
};
const ORDER = ['claim', 'rolls', 'daily', 'dk', 'vote'];

const DEF = {
  enabled: false,
  claim: { ref: 0, every: 3, notify: true },
  rolls: { ref: 0, every: 60, notify: false },
  daily: { end: 0, notify: true, notified: true },
  dk: { end: 0, notify: true, notified: true },
  vote: { end: 0, notify: true, notified: true }
};

let S = load();
let calOpen = '';                // fila con el formulario de calibrar abierto
let host = null;                 // contenedor actual (tarjeta de Inicio)
let ticker = 0;
const armed = {};                // ciclo -> próximo reinicio ya programado

function load() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { o = null; }
  const s = JSON.parse(JSON.stringify(DEF));
  if (o && typeof o === 'object') {
    s.enabled = !!o.enabled;
    for (const k of ORDER) if (o[k] && typeof o[k] === 'object') Object.assign(s[k], o[k]);
  }
  return s;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* sin guardado */ } }

/* ---------------------------------------------------------------- tiempo */
// «2h 14», «2h14min», «1:05», «45 min», «45» (minutos), «30 s» → milisegundos (o null)
function parseDur(text) {
  const t = String(text || '').toLowerCase().trim();
  if (!t) return null;
  let m = t.match(/^(\d{1,3}):(\d{2})$/);
  if (m) return (Number(m[1]) * 60 + Number(m[2])) * 60e3;
  m = t.match(/^(\d+)\s*h\s*(\d+)?\s*(?:min|m)?$/);
  if (m) return (Number(m[1]) * 60 + Number(m[2] || 0)) * 60e3;
  const h = t.match(/(\d+)\s*h/), mi = t.match(/(\d+)\s*(?:min|m)\b/), s = t.match(/(\d+)\s*s\b/);
  if (h || mi || s) return ((h ? Number(h[1]) : 0) * 3600 + (mi ? Number(mi[1]) : 0) * 60 + (s ? Number(s[1]) : 0)) * 1000;
  m = t.match(/^(\d+)$/);
  if (m) return Number(m[1]) * 60e3;
  return null;
}

// Siguiente reinicio de un ciclo anclado en `ref` con periodo `period` (0 = sin calibrar)
function nextCycle(ref, period, now) {
  if (!ref || !period) return 0;
  if (ref > now) return ref;
  return ref + (Math.floor((now - ref) / period) + 1) * period;
}

function fmtLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (h > 0) return h + ' h ' + String(m).padStart(2, '0') + ' min';
  if (m > 0) return m + ' min ' + String(r).padStart(2, '0') + ' s';
  return r + ' s';
}

function periodOf(k) { return CYCLES[k] ? S[k].every * CYCLES[k].mult : ONESHOT[k].every; }

// Texto y estado de una fila en este instante
const T = (t) => (window.I18N ? window.I18N.t(t) : t);
function status(k, now) {
  if (CYCLES[k]) {
    const next = nextCycle(S[k].ref, periodOf(k), now);
    return next ? { text: T('en') + ' ' + fmtLeft(next - now), ready: false } : { text: T('Sin calibrar'), ready: false, none: true };
  }
  const left = S[k].end - now;
  return left > 0 ? { text: T('en') + ' ' + fmtLeft(left), ready: false } : { text: T('Listo'), ready: true };
}

/* ---------------------------------------------------------------- avisos */
function announce(msg) {
  try { if (A && A.notify) A.notify(msg); } catch (e) { /* sin aviso en pantalla */ }
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const text = window.I18N ? window.I18N.t(msg) : msg;
      new Notification('Seiri', { body: text, icon: 'icons/icon-192.png' });
    }
  } catch (e) { /* sin notificaciones */ }
}

function watch() {
  if (!S.enabled) return;
  const now = Date.now();
  for (const k of ORDER) {
    if (!S[k].notify) continue;
    if (CYCLES[k]) {
      const next = nextCycle(S[k].ref, periodOf(k), now);
      if (!next) { armed[k] = 0; continue; }
      if (armed[k] && now >= armed[k]) { if (now - armed[k] < 120000) announce(CYCLES[k].msg); }
      armed[k] = next;
    } else if (S[k].end && !S[k].notified && now >= S[k].end) {
      S[k].notified = true; save();
      if (now - S[k].end < 600000) announce(ONESHOT[k].msg);
    }
  }
}
setInterval(watch, 5000);

/* ---------------------------------------------------------------- tarjeta */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function rowHtml(k) {
  const now = Date.now();
  const st = status(k, now);
  const cyc = CYCLES[k];
  const name = cyc ? cyc.name + ' (' + cyc.cmd + ')' : ONESHOT[k].name;
  const btn = cyc
    ? `<button type="button" class="btn small ghost" data-tm="cal" data-k="${k}">Calibrar</button>`
    : `<button type="button" class="btn small" data-tm="used" data-k="${k}">Lo usé</button>`;
  let form = '';
  if (cyc && calOpen === k) {
    form = `<form class="tm-cal" data-k="${k}">
        <label><span>Tiempo restante según ${cyc.cmd}</span><input name="left" placeholder="${k === 'claim' ? '2h 14' : '25 min'}" autocomplete="off" required></label>
        <label><span>Se repite cada (${cyc.unit})</span><input name="every" type="number" min="1" max="${k === 'claim' ? 24 : 600}" value="${S[k].every}"></label>
        <button type="submit" class="btn small primary">Guardar</button>
        <button type="button" class="btn small ghost" data-tm="calx">Cancelar</button>
      </form>`;
  }
  return `<div class="tm-row" data-k="${k}">
      <span class="tm-n">${esc(name)}</span>
      <span class="tm-v${st.ready ? ' ready' : ''}${st.none ? ' none' : ''}" data-v="${k}">${esc(st.text)}</span>
      <label class="tm-b"><input type="checkbox" data-tm="notify" data-k="${k}"${S[k].notify ? ' checked' : ''}> avisar</label>
      ${btn}
    </div>${form}`;
}

function render() {
  if (!host || !host.isConnected) return;
  host.innerHTML = `<h3>Temporizadores <small class="muted">avisan solo con Seiri abierto</small></h3>
    <div class="tm-list">${ORDER.map(rowHtml).join('')}</div>
    <label class="tm-global"><input type="checkbox" id="tmEnabled"${S.enabled ? ' checked' : ''}> Avisarme con una notificación de escritorio</label>
    <p class="hint">Calibra el reclamo y las tiradas una vez con lo que te responden $mu y $ru en Discord. Para $daily, $dk y el voto pulsa «Lo usé» al usarlos.</p>`;
}

// Actualiza solo los textos de cuenta atrás (cada segundo mientras la tarjeta está a la vista)
function tick() {
  if (!host || !host.isConnected) { clearInterval(ticker); ticker = 0; return; }
  const now = Date.now();
  for (const k of ORDER) {
    const el = host.querySelector('[data-v="' + k + '"]');
    if (!el) continue;
    const st = status(k, now);
    if (el.textContent !== st.text) el.textContent = st.text;
    el.classList.toggle('ready', st.ready);
    el.classList.toggle('none', !!st.none);
  }
}

function onClick(e) {
  const t = e.target.closest('[data-tm]');
  if (!t) return;
  const act = t.dataset.tm, k = t.dataset.k;
  if (act === 'cal') { calOpen = calOpen === k ? '' : k; render(); const i = host.querySelector('.tm-cal input[name=left]'); if (i) i.focus(); }
  else if (act === 'calx') { calOpen = ''; render(); }
  else if (act === 'used' && ONESHOT[k]) {
    S[k].end = Date.now() + ONESHOT[k].every; S[k].notified = false; save(); render();
  }
}

function onChange(e) {
  const t = e.target;
  if (t.id === 'tmEnabled') {
    S.enabled = t.checked; save();
    if (S.enabled && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (err) { /* sin permiso */ }
    }
    return;
  }
  if (t.dataset && t.dataset.tm === 'notify') { S[t.dataset.k].notify = t.checked; save(); }
}

function onSubmit(e) {
  const f = e.target.closest('.tm-cal');
  if (!f) return;
  e.preventDefault();
  const k = f.dataset.k;
  const left = parseDur(f.elements.left.value);
  const every = Math.max(1, Math.min(CYCLES[k].unit === 'h' ? 24 : 600, Number(f.elements.every.value) || CYCLES[k].def));
  if (left === null || left <= 0) {
    f.elements.left.setCustomValidity('Escribe el tiempo como lo muestra Mudae, por ejemplo 2h 14 o 25 min.');
    f.elements.left.reportValidity();
    f.elements.left.setCustomValidity('');
    return;
  }
  S[k].every = every;
  S[k].ref = Date.now() + left;            // el momento del próximo reinicio ancla todo el ciclo
  armed[k] = 0;
  calOpen = '';
  save(); render();
}

/* Se llama desde Inicio cada vez que se dibuja */
function mount(el) {
  host = el;
  if (!el) return;
  render();
  if (!el.dataset.bound) {
    el.dataset.bound = '1';
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('submit', onSubmit);
  }
  clearInterval(ticker);
  ticker = setInterval(tick, 1000);
}

window.SeiriTimers = { mount, parseDur, nextCycle, fmtLeft, _state: () => S };
})();
