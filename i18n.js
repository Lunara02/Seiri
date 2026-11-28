/* ============================================================================
   Idiomas: español (idioma de origen) e inglés
   ----------------------------------------------------------------------------
   · El texto del código y del HTML está en español. Con el idioma en inglés, cada texto se
     busca en el diccionario (i18n-en.js) y se sustituye al vuelo.
   · Un MutationObserver traduce también lo que la app va escribiendo después (avisos, listas,
     ventanas), así que no hace falta envolver cada mensaje.
   · Los textos con números o nombres usan reglas con comodines: {0}, {1}…
   · Se carga ANTES que el resto de scripts: expone window.I18N.
   ========================================================================== */
(() => {
'use strict';

const LS_KEY = 'seiri:lang';
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'INPUT']);

let lang = 'es';
let exact = new Map();     // español -> inglés (texto completo)
let rules = [];            // [{ re, out }] para textos con partes variables
let observer = null;
const origText = new WeakMap();   // nodo de texto -> texto original en español
const origAttr = new WeakMap();   // elemento -> { atributo: original }
const ruleCache = new Map();

const squash = (s) => String(s).replace(/\s+/g, ' ').trim();

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// «Total: {0} personajes» -> /^Total: (.+?) personajes$/
function compileRule(es, en) {
  const parts = es.split(/\{(\d+)\}/);          // [texto, índice, texto, índice, …]
  // Una regla con muy poco texto fijo («{0} de {1}») coincidiría con casi cualquier frase, incluidos los
  // nombres de series o personajes del usuario: en ese caso los comodines solo aceptan números.
  const letters = parts.filter((_, k) => k % 2 === 0).join('').replace(/[^A-Za-zÁÉÍÓÚáéíóúñÑ]/g, '').length;
  const slot = letters < 7 ? '([\\d.,]+)' : '(.+?)';
  let src = '^';
  const order = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) src += esc(parts[i]);
    else { src += slot; order.push(Number(parts[i])); }
  }
  src += '$';
  return { re: new RegExp(src, 's'), order, out: en };
}

function loadDict(dict) {
  exact = new Map();
  rules = [];
  ruleCache.clear();
  for (const [es, en] of Object.entries(dict || {})) {
    const key = squash(es);
    if (/\{\d+\}/.test(key)) rules.push(compileRule(key, en));
    else exact.set(key, en);
  }
}

/* ---------------------------------------------------------------- traducción */
function translate(text) {
  if (lang !== 'en' || !text) return text;
  const lead = text.match(/^\s*/)[0];
  const trail = text.match(/\s*$/)[0];
  const core = squash(text);
  if (!core) return text;
  if (ruleCache.has(core)) return lead + ruleCache.get(core) + trail;
  let out = exact.get(core);
  if (out === undefined) {
    for (const r of rules) {
      const m = core.match(r.re);
      if (!m) continue;
      out = r.out.replace(/\{(\d+)\}/g, (_, n) => {
        const k = r.order.indexOf(Number(n));
        const raw = k >= 0 ? m[k + 1] : '';
        return translate(raw);                 // las partes variables también pueden estar traducidas
      });
      break;
    }
  }
  if (out === undefined) out = core;
  if (ruleCache.size > 4000) ruleCache.clear();
  ruleCache.set(core, out);
  return lead + out + trail;
}

function t(text, vars) {
  let s = translate(String(text));
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}

/* ---------------------------------------------------------------- DOM */
function applyTextNode(node) {
  const cur = node.nodeValue;
  if (!cur || !cur.trim()) return;
  const prev = origText.get(node);
  // Si la app no ha tocado el nodo, se parte del texto original en español; si lo cambió, el nuevo texto manda
  const src = (prev && cur === prev.shown) ? prev.es : cur;
  const shown = lang === 'en' ? translate(src) : src;
  origText.set(node, { es: src, shown });
  if (shown !== cur) node.nodeValue = shown;
}

function applyAttrs(el) {
  for (const a of ATTRS) {
    if (!el.hasAttribute || !el.hasAttribute(a)) continue;
    const cur = el.getAttribute(a);
    let rec = origAttr.get(el);
    if (!rec) { rec = {}; origAttr.set(el, rec); }
    const prev = rec[a];
    const src = (prev && cur === prev.shown) ? prev.es : cur;
    const shown = lang === 'en' ? translate(src) : src;
    rec[a] = { es: src, shown };
    if (shown !== cur) el.setAttribute(a, shown);
  }
}

function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) { applyTextNode(root); return; }
  if (root.nodeType !== 1 || SKIP_TAGS.has(root.tagName)) { if (root.nodeType === 1) applyAttrs(root); return; }
  applyAttrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType === 1 && SKIP_TAGS.has(n.tagName)) { applyAttrs(n); return NodeFilter.FILTER_REJECT; }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let n;
  while ((n = tw.nextNode())) {
    if (n.nodeType === 3) applyTextNode(n); else applyAttrs(n);
  }
}

function startObserver() {
  if (observer || !document.body) return;
  observer = new MutationObserver((muts) => {
    observer.disconnect();                                  // evita reaccionar a nuestros propios cambios
    try {
      for (const m of muts) {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') applyTextNode(m.target);
        else if (m.type === 'attributes') applyAttrs(m.target);
      }
    } finally { watch(); }
  });
  watch();
}

function watch() {
  observer.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ATTRS });
}

/* ---------------------------------------------------------------- API */
function setLang(next, opts) {
  next = next === 'en' ? 'en' : 'es';
  lang = next;
  document.documentElement.lang = next;
  try { localStorage.setItem(LS_KEY, next); } catch (e) { /* sin almacenamiento */ }
  if (observer) observer.disconnect();
  walk(document.body);
  if (document.title) document.title = lang === 'en' ? 'Seiri' : 'Seiri';
  if (observer) watch();
  if (!opts || !opts.silent) document.dispatchEvent(new CustomEvent('seiri:lang', { detail: { lang } }));
}

function getLang() { return lang; }
function locale() { return lang === 'en' ? 'en-US' : 'es-ES'; }

function init(dict) {
  loadDict(dict);
  let saved = 'es';
  try { saved = localStorage.getItem(LS_KEY) || ''; } catch (e) { /* ignorar */ }
  if (!saved) saved = /^en/i.test(navigator.language || '') ? 'en' : 'es';
  lang = saved === 'en' ? 'en' : 'es';
}

// Los cuadros de diálogo del sistema (confirm / alert) no están en el DOM: se traducen aquí, línea a línea
function translateDialog(msg) {
  const whole = translate(String(msg));
  if (whole !== String(msg) || lang !== 'en') return whole;
  return String(msg).split('\n').map(line => translate(line)).join('\n');
}
const nativeConfirm = window.confirm.bind(window);
const nativeAlert = window.alert.bind(window);
window.confirm = (m) => nativeConfirm(translateDialog(m));
window.alert = (m) => nativeAlert(translateDialog(m));

window.I18N = { t, translate, translateDialog, setLang, getLang, locale, loadDict, init, walk, startObserver };

// El diccionario (i18n-en.js) se registra con I18N.register(dict) antes de DOMContentLoaded
window.I18N.register = (dict) => { loadDict(dict); if (lang === 'en') walk(document.body); };

try { const s = localStorage.getItem(LS_KEY); if (s === 'en') lang = 'en'; } catch (e) { /* ignorar */ }
document.documentElement.lang = lang;

document.addEventListener('DOMContentLoaded', () => {
  startObserver();
  if (lang === 'en') walk(document.body);
});

})();
