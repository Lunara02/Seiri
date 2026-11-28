/* ============================================================================
   Asistente de bienvenida (primer arranque y desde Ajustes)
   Pasos: idioma, perfil, apariencia. Al terminar se muestra la aplicación.
   ========================================================================== */
(() => {
'use strict';

const A = window.MudaeApp;
const esc = window.MudaeCore.escapeHtml;
const $ = (s, r = document) => r.querySelector(s);
const D = window.mudaeDesktop || null;
const TOTAL = 4;

const EFFECTS = [
  { key: 'neonBorders', cls: 'neon', name: 'Bordes de neón', desc: 'Dibuja un borde luminoso alrededor del retrato.' },
  { key: 'holoSheen', cls: 'holo', name: 'Reflejo holográfico', desc: 'Un brillo suave que se mueve al pasar el cursor por encima.' },
  { key: 'bgGlow', cls: 'amb', name: 'Iluminación ambiental', desc: 'Un resplandor del color de acento en el fondo de la aplicación.' },
  { key: 'cardGlow', cls: 'hexg', name: 'Resplandor por color HEX', desc: 'Un halo del color de marco alrededor de cada tarjeta.' }
];

let step = 1;
let el = null;

function on(key) { const s = A.getSettings(); return s[key] !== false; }

function railStep(n, title, sub) {
  const cls = n < step ? 'done' : n === step ? 'cur' : '';
  return `<div class="stp ${cls}"><span class="c">${n < step ? '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" style="width:14px;height:14px;stroke-width:2.4"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : n}</span><div><b>${esc(title)}</b><span>${esc(sub)}</span></div></div>`;
}

function lang() { return window.I18N ? window.I18N.getLang() : 'es'; }

function draw() {
  const presets = (window.SeiriSettings && window.SeiriSettings.PRESETS) || [];
  const cur = (A.getSettings().preset) || 'indigo';
  const profName = window.SeiriProfiles ? window.SeiriProfiles.activeName() : 'Principal';
  el.innerHTML = `
    <aside class="rail">
      <div class="brand"><img class="brand-mark" src="icons/icon-256.png" alt="" width="30" height="30"><span class="brand-name">Seiri</span></div>
      <div class="steps">
        ${railStep(1, 'Idioma', lang() === 'en' ? 'English' : 'Español')}
        ${railStep(2, 'Perfil', step > 2 ? profName : 'Tu primera colección')}
        ${railStep(3, 'Cuenta de Mudae', 'Para ver las fotos')}
        ${railStep(4, 'Apariencia', 'Cómo se ven tus tarjetas')}
      </div>
      <p class="note">Todo se puede cambiar después en Ajustes. Seiri guarda tus datos solo en este equipo.</p>
    </aside>
    <section class="wbody">
      <div class="panel-step ${step === 1 ? 'cur' : ''}">
        <h1 id="wizTitle">Elige tu idioma</h1>
        <p class="lead">Podrás cambiarlo cuando quieras desde Ajustes.</p>
        <div class="choice">
          <button type="button" data-lang="es" class="${lang() === 'es' ? 'on' : ''}"><b>Español</b><span>Usar la interfaz en español</span></button>
          <button type="button" data-lang="en" class="${lang() === 'en' ? 'on' : ''}"><b>English</b><span>Use the interface in English</span></button>
        </div>
      </div>
      <div class="panel-step ${step === 2 ? 'cur' : ''}">
        <h1>Crea tu perfil</h1>
        <p class="lead">Un perfil es una colección. Si juegas en varios servidores o con varias cuentas de Mudae, crea un perfil para cada una y cámbialos cuando quieras.</p>
        <label class="lbl" for="wizProfile">Nombre del perfil</label>
        <input class="big-field" id="wizProfile" maxlength="40" value="${esc(profName === 'Principal' ? '' : profName)}" placeholder="Por ejemplo: Mi servidor de anime" autocomplete="off">
        <p class="hint" style="margin-top:10px">Puedes dejarlo vacío para usar «Principal».</p>
      </div>
      <div class="panel-step ${step === 3 ? 'cur' : ''}">
        <h1>Vincula tu cuenta de Mudae</h1>
        <p class="lead">Sin la cuenta vinculada Seiri no puede cargar las fotos de tus personajes. Inicias sesión en la web oficial de Mudae y Seiri nunca ve tu contraseña.</p>
        <div class="fx" style="grid-template-columns:1fr auto">
          <div><b>Estado</b><p id="wizAccState">Comprobando…</p></div>
          <button type="button" class="btn primary" id="wizLink" ${D ? '' : 'disabled'}>Vincular cuenta</button>
        </div>
        <p class="hint" style="margin-top:12px">${D ? 'Se abre una ventana de mudae.net: inicia sesión y ciérrala al terminar. Puedes hacerlo más tarde desde Ajustes.' : 'Solo disponible en la app de escritorio.'}</p>
      </div>
      <div class="panel-step ${step === 4 ? 'cur' : ''}">
        <h1>Apariencia</h1>
        <p class="lead">Elige una paleta y los efectos de las tarjetas. A la izquierda de cada efecto ves cómo queda.</p>
        <div class="fx" style="grid-template-columns:1fr auto">
          <div><b>Paleta</b><p>El color de acento y el tono del fondo.</p></div>
          <div class="themes">${presets.map(p => `<button type="button" class="theme-chip ${p.id === cur ? 'on' : ''}" data-preset="${p.id}" style="--c1:${p.c1};--c2:${p.c2}" title="${esc(p.name)}"><i></i>${esc(p.name)}</button>`).join('')}</div>
        </div>
        ${EFFECTS.map(f => `<div class="fx"><div class="mini ${f.cls}"><div class="pt"><img src="icons/sample-miku.png" alt=""></div></div><div><b>${esc(f.name)}</b><p>${esc(f.desc)}</p></div><input type="checkbox" class="switch" data-fx="${f.key}" ${on(f.key) ? 'checked' : ''} aria-label="${esc(f.name)}"></div>`).join('')}
      </div>
      <div class="wfoot">
        <button type="button" class="btn ghost" id="wizBack" ${step === 1 ? 'style="visibility:hidden"' : ''}>Atrás</button>
        <span class="sp"></span>
        <span class="muted">Paso ${step} de ${TOTAL}</span>
        <button type="button" class="btn primary" id="wizNext">${step === TOTAL ? 'Empezar' : 'Siguiente'}</button>
      </div>
    </section>`;
  const f = $(step === 2 ? '#wizProfile' : '#wizNext', el);
  if (f) f.focus();
  if (step === 3) accState();
}

async function accState() {
  const out = $('#wizAccState', el);
  if (!out) return;
  const T = (t) => (window.I18N ? window.I18N.translate(t) : t);
  if (!D) { out.textContent = T('Solo disponible en la app de escritorio.'); return; }
  try {
    const ms = await D.mudaeStatus();
    const o = $('#wizAccState', el);
    if (o) o.textContent = T(ms.ok && ms.loggedIn ? 'Cuenta vinculada' : 'Sin vincular');
    const b = $('#wizLink', el);
    if (b && ms.ok && ms.loggedIn) b.textContent = T('Volver a vincular');
  } catch (e) { out.textContent = T('Sin vincular'); }
}

function finish() {
  const name = (($('#wizProfile', el) || {}).value || '').trim();
  close();
  A.setSetting('setupDone', true);
  if (name && window.SeiriProfiles) window.SeiriProfiles.renameActive(name);
  A.switchTab('home');
}

function next() {
  if (step === 2) {
    const name = (($('#wizProfile', el) || {}).value || '').trim();
    if (name && window.SeiriProfiles) window.SeiriProfiles.renameActive(name);
  }
  if (step >= TOTAL) { finish(); return; }
  step++;
  draw();
}

function open() {
  if (el) return;
  step = 1;
  el = document.createElement('div');
  el.className = 'wiz';
  el.id = 'wizard';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'wizTitle');
  document.body.append(el);
  draw();
  el.addEventListener('click', (e) => {
    const l = e.target.closest('[data-lang]');
    if (l) {
      const v = l.dataset.lang;
      if (window.I18N) window.I18N.setLang(v);
      A.setSetting('lang', v);
      draw();
      return;
    }
    const p = e.target.closest('.theme-chip');
    if (p) { A.setSetting('preset', p.dataset.preset); A.setSetting('customAccent', ''); el.querySelectorAll('.theme-chip').forEach(c => c.classList.toggle('on', c === p)); return; }
    if (e.target.id === 'wizLink') {
      if (D) { Promise.resolve(D.mudaeLogin()).then(accState, accState); }
      return;
    }
    if (e.target.id === 'wizNext') next();
    else if (e.target.id === 'wizBack' && step > 1) { step--; draw(); }
  });
  el.addEventListener('change', (e) => {
    const k = e.target.dataset && e.target.dataset.fx;
    if (k) A.setSetting(k, e.target.checked);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'wizProfile') { e.preventDefault(); next(); }
  });
}

function close() {
  if (el) { el.remove(); el = null; }
}

window.SeiriSetup = { open, close };

(function boot() {
  const check = () => {
    if (!A.getSettings().setupDone) open();
  };
  // Espera a que la app haya cargado sus ajustes guardados
  document.addEventListener('mudae:render', function once() {
    document.removeEventListener('mudae:render', once);
    setTimeout(check, 50);
  });
})();

})();
