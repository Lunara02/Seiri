(() => {
'use strict';

/* ================= núcleo puro (core.js) =================
   Utilidades puras y parser robusto, definidos en core.js
   (se carga antes que este archivo). */
const {
  debounce, fmtKakera, dateStamp, escapeHtml, hexToRgba, adjustHexBg,
  norm, keyTokenRe, extractKeyInfo, cleanCharName, cleanNoteText, cleanTag,
  parseTags, makeId, normalizeImageUrl, extractMudaeId, parseExport,
  buildSmBlocks, buildDivorceBlocks, exportCommand
} = window.MudaeCore;

// ¿Corremos dentro de la app de escritorio (Electron)?
const isDesktop = !!(window.mudaeDesktop && window.mudaeDesktop.isDesktop);
// Idioma de fechas y números según el idioma de la interfaz
const LOC = () => (window.I18N ? window.I18N.locale() : 'es-ES');

/* ================= utilidades ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function setVisible(el, visible) {
  if (!el) return;
  el.hidden = !visible;
  el.classList.toggle('hidden', !visible);
}

/* Pila de modales: el scroll solo se bloquea mientras quede alguno abierto y
   Escape cierra únicamente el superior (así los modales hijos no cierran al padre). */
const modalStack = [];

function syncScrollLock() {
  document.body.style.overflow = modalStack.length ? 'hidden' : '';
}

function openModalById(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const i = modalStack.indexOf(id);
  if (i >= 0) modalStack.splice(i, 1);
  modalStack.push(id);
  setVisible(el, true);
  syncScrollLock();
}

function closeModalById(id) {
  const el = document.getElementById(id);
  if (el) setVisible(el, false);
  const i = modalStack.lastIndexOf(id);
  if (i >= 0) modalStack.splice(i, 1);
  syncScrollLock();
}

function closeTopModal() {
  while (modalStack.length) {
    const id = modalStack[modalStack.length - 1];
    const el = document.getElementById(id);
    if (!el || el.hidden) { modalStack.pop(); continue; }
    const closers = {
      importModal: closeImportModal,
      smModal: closeSm,
      batchModal: closeBatchModal,
      editModal: closeEdit,
      statsModal: closeStatsModal,
      historyModal: closeHistoryModal,
      backupsModal: closeBackupsModal,
      previewModal: closePreview,
      filtersModal: closeFiltersModal,
      duplicatesModal: closeDuplicatesModal,
      helpModal: closeHelp
    };
    const fn = closers[id];
    if (fn) fn(); else closeModalById(id);
    return true;
  }
  return false;
}

function openHelp() { openModalById('helpModal'); }
function closeHelp() { closeModalById('helpModal'); }


function download(filename, text, type = 'application/json') {
  // App de escritorio: diálogo nativo «Guardar como…»
  if (isDesktop && window.mudaeDesktop.saveAs) {
    const ext = (filename.split('.').pop() || '*').toLowerCase();
    window.mudaeDesktop.saveAs({ defaultName: filename, text, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] })
      .then(r => { if (r && r.ok) toast('Guardado: ' + r.path); else if (r && !r.canceled) toast('No se pudo guardar el archivo'); });
    return;
  }
  const blob = new Blob([text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

let toastTimer = 0;
function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado al portapapeles');
    return true;
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px';
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      toast(ok ? 'Copiado al portapapeles' : 'No se pudo copiar');
      return ok;
    } catch (err) {
      toast('Seleccione el texto manualmente para copiar');
      return false;
    }
  }
}


/* ================= estado, historial y temas ================= */
const LS_KEY = 'mudae-sorter:v1';
const LS_SETTINGS_KEY = 'mudae-sorter:settings:v2';
const DB_NAME = 'mudae-sorter-db';
const DB_VER = 3;
const BACKUP_KEY = 'mudae-sorter:backups:v1';
const BACKUP_MAX = 5;
const TAB_LS = 'mudae-sorter:tab:v1';

const THEMES = {
  mudae:  { bg: '#0f1115', accent: '#8b5cf6' },
  oled:   { bg: '#000000', accent: '#10b981' },
  cyber:  { bg: '#090d16', accent: '#06b6d4' },
  sakura: { bg: '#160c12', accent: '#ec4899' },
  ocean:  { bg: '#0a111a', accent: '#3b82f6' },
  gold:   { bg: '#12100b', accent: '#f59e0b' }
};

const DEFAULTS = {
  cardSize: 152,
  cardRadius: 12,
  cardAspect: '3/4',
  bgColor: '#0f1115',
  accentColor: '#8b5cf6',
  bgGlow: true,
  cardGlow: true,
  neonBorders: true,
  holoSheen: true,
  showNotesOnCards: false,
  pageSize: 0,
  groupBySeries: true,
  showRank: true,
  showPos: true,
  showSpheres: true,
  showKakera: true,
  showKeys: true,
  showSeries: true,
  preset: 'indigo',
  customAccent: '',
  onlyNote: false,
  pauseGifs: true,
  checkUpdates: true,
  search: '',
  series: '',
  keyFilter: 'all',
  noteFilter: '',
  saleAddValue: 100,
  autoSmOnSort: true,
  seriesAutoApply: false,
  seriesRespectPinned: true,
  compactMode: false,
  performanceMode: false,
  showTagsOnCards: false,
  themeLight: false,
  tagFilter: '',
  autoFileEnabled: false,
  autoFilePath: '',
  nitro: false,
  lang: 'es',
  setupDone: false
};

let state = {
  v: 2,
  importedAt: null,
  chars: [],
  order: [],
  origOrder: [],
  seriesOrder: [],
  origSeriesOrder: [],
  seriesMeta: [],
  warnings: [],
  seriesPinned: [],
  seriesPresets: [],
  savedFilters: [],
  importHistory: [],
  commandHistory: [],
  seriesExpanded: [],
  positionSnapshots: [],
  settings: { ...DEFAULTS }
};
let byId = new Map();
let selection = new Set();
let lastClicked = null;
let thumbs = new Map();
let thumbUrls = new Map();
let failed = new Set();
let caching = false;
let drag = null;
let lastDragEnd = 0;
let smBlocks = [];

let seriesExpanded = new Set();
let seriesExpandedReady = false;
let seriesQuery = '';
let sortDrag = null;
let sortDragEndedAt = 0;
let seriesSelected = new Set();
let previewApplyFn = null;
let cmdContext = null;
let divorceUndo = null; // último divorcio (para poder restaurar la biblioteca)
let quotaWarned = false;

/* Persistencia: IndexedDB como fuente principal, localStorage solo para ajustes.
   Mantiene la API síncrona antigua (save/readBackups) sobre una caché en memoria. */
let storageMode = 'idb';
let backupsCache = [];
let pendingSave = false;
let saving = false;
let saveFailing = false;
let lastSavedAt = 0;
let writeChain = Promise.resolve();

let galleries2 = new Map();
let galleryCurrentId2 = null;

let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 30;
const MAX_POSITION_SNAPSHOTS = 12;

function snapshotState() {
  return JSON.stringify({
    order: state.order,
    seriesOrder: state.seriesOrder,
    chars: state.chars.map(c => ({
      id: c.id,
      note: c.note,
      embedColor: c.embedColor,
      image: c.image,
      pinned: !!c.pinned,
      tags: Array.isArray(c.tags) ? c.tags.slice() : [],
      noteCustom: !!c.noteCustom,
      colorCustom: !!c.colorCustom
    }))
  });
}

function pushUndo() {
  if (!state.chars.length) return;
  // Cualquier edición nueva invalida el "deshacer divorcio" (evita restaurar
  // personajes sobre un estado que ya cambió).
  if (divorceUndo) { divorceUndo = null; updateDivorceUndoButton(); }
  const snap = snapshotState();
  if (undoStack.length && undoStack[undoStack.length - 1] === snap) return;
  undoStack.push(snap);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
  updateUndoButtons();
}

function applySnapshot(snapStr) {
  try {
    const snap = JSON.parse(snapStr);
    state.order = snap.order;
    if (Array.isArray(snap.seriesOrder)) state.seriesOrder = snap.seriesOrder;
    const map = new Map(snap.chars.map(x => [x.id, x]));
    const imgChanged = [];
    for (const c of state.chars) {
      const s = map.get(c.id);
      if (s) {
        if (s.image && s.image !== c.image) {
          c.image = s.image;
          imgChanged.push(c);
          thumbs.delete(c.id);
          const tu = thumbUrls.get(c.id);
          if (tu) { for (const u of Object.values(tu)) URL.revokeObjectURL(u); thumbUrls.delete(c.id); }
        }
        c.note = s.note;
        c.embedColor = s.embedColor;
        c.pinned = !!s.pinned;
        c.tags = Array.isArray(s.tags) ? s.tags.slice() : [];
        c.noteCustom = !!s.noteCustom;
        c.colorCustom = !!s.colorCustom;
      }
    }
    rebuildIndex();
    save();
    render();
    updateUndoButtons();
    // Las fotos que cambiaron vuelven a bajarse y a guardarse en caché
    if (imgChanged.length) {
      (async () => {
        for (const c of imgChanged) {
          try {
            const rec = await fetchThumb(c);
            thumbs.set(c.id, rec);
            setThumbUrls(c.id, rec);
            await idbPut(c.id, rec);
          } catch (e) { /* se queda la imagen remota */ }
        }
        render();
      })();
    }
  } catch (e) {}
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshotState());
  const prev = undoStack.pop();
  applySnapshot(prev);
  toast('Cambio deshecho');
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshotState());
  const next = redoStack.pop();
  applySnapshot(next);
  toast('Cambio rehecho');
}

function updateUndoButtons() {
  const u = $('#btnUndo');
  const r = $('#btnRedo');
  if (u) u.disabled = undoStack.length === 0;
  if (r) r.disabled = redoStack.length === 0;
}

function rebuildIndex() {
  byId = new Map(state.chars.map(c => {
    c.name = cleanCharName(c.name);
    if (!c.mudaeId && c.image) c.mudaeId = extractMudaeId(c.image);
    return [c.id, c];
  }));
}

function save() {
  pendingSave = true;
  // Los ajustes ocupan pocos KB: se guardan también en localStorage para que
  // el tema y las preferencias estén listos al instante, incluso sin IndexedDB.
  persistSettingsOnly();
  updateSaveBadge();
  saveDebounced();
  scheduleAutoFile();
}
const saveSoon = save;

/* ================= copia de seguridad automática en archivo (.json) =================
   Solo en la app de escritorio: escribe un proyecto completo en el archivo que
   elijas cada vez que cambian los datos (con un pequeño retardo). */
let autoFileTimer = 0;

function autoFileReady() {
  return isDesktop && state.settings.autoFileEnabled && !!state.settings.autoFilePath;
}

function updateAutoFileStatus(text, kind) {
  const el = $('#autoFileStatus');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = kind === 'err' ? 'var(--danger)' : (kind === 'ok' ? 'var(--ok)' : '');
}

function updateAutoFileUI() {
  const opt = $('#optAutoFile');
  if (opt) opt.checked = !!state.settings.autoFileEnabled;
  const pathEl = $('#autoFilePath');
  if (pathEl) {
    pathEl.value = state.settings.autoFilePath || '';
    pathEl.title = state.settings.autoFilePath || '';
  }
  const reveal = $('#btnRevealAutoFile');
  if (reveal) setVisible(reveal, isDesktop && !!state.settings.autoFilePath);
}

async function chooseAutoFile() {
  if (!isDesktop) return null;
  try {
    const def = 'mudae-coleccion-' + dateStamp() + '.json';
    const p = await window.mudaeDesktop.chooseDataFile(def);
    if (!p) return null;
    state.settings.autoFilePath = p;
    saveSoon();
    updateAutoFileUI();
    return p;
  } catch (e) { return null; }
}

async function writeAutoFileNow(silent) {
  if (!autoFileReady()) {
    if (!silent) toast('Activa la copia y elige un archivo primero');
    return false;
  }
  try {
    const json = JSON.stringify(projectData(), null, 2);
    const res = await window.mudaeDesktop.writeDataFile(state.settings.autoFilePath, json);
    if (res && res.ok) {
      updateAutoFileStatus('Guardado a las ' + new Date().toLocaleTimeString(LOC()), 'ok');
      if (!silent) toast('Copia guardada en el archivo');
      return true;
    }
    updateAutoFileStatus('No se pudo guardar: ' + ((res && res.error) || 'error'), 'err');
    if (!silent) toast('No se pudo escribir la copia');
    return false;
  } catch (e) {
    updateAutoFileStatus('No se pudo guardar', 'err');
    return false;
  }
}

function scheduleAutoFile() {
  if (!autoFileReady()) return;
  clearTimeout(autoFileTimer);
  autoFileTimer = setTimeout(() => { void writeAutoFileNow(true); }, 1200);
}

function stateData() {
  const data = projectData();
  delete data.commandHistory; // el historial se guarda aparte (puede ser muy grande)
  data.savedAt = Date.now();
  return data;
}

function persistSettingsOnly() {
  // Clave independiente: escribir aquí nunca debe destruir la copia completa
  // que se guarda en localStorage cuando IndexedDB no está disponible.
  try {
    localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify({
      v: 2,
      importedAt: state.importedAt,
      settings: state.settings
    }));
  } catch (e) {}
}

function updateSaveBadge() {
  const el = $('#saveStatus');
  if (!el) return;
  if (saveFailing) {
    el.textContent = 'Sin guardar';
    el.className = 'save-status bad';
    el.title = storageMode === 'idb'
      ? 'No se pudo escribir en IndexedDB. Exporta un proyecto .json para no perder los cambios.'
      : 'Almacenamiento del navegador lleno. Exporta un proyecto .json y libera espacio.';
    setVisible(el, true);
    return;
  }
  if (pendingSave || saving) {
    el.textContent = 'Guardando…';
    el.className = 'save-status busy';
    el.title = 'Guardando cambios en este dispositivo';
    setVisible(el, true);
    return;
  }
  if (!lastSavedAt) { setVisible(el, false); return; }
  el.textContent = 'Guardado ✓';
  el.className = 'save-status ok';
  el.title = 'Guardado a las ' + new Date(lastSavedAt).toLocaleTimeString(LOC())
    + (storageMode === 'idb' ? ' · IndexedDB' : ' · almacenamiento local (limitado)');
  setVisible(el, true);
}

function persistToLS(data) {
  try {
    const payload = data || stateData();
    // Sin IndexedDB disponible, el historial solo puede vivir aquí.
    if (storageMode === 'ls') payload.commandHistory = state.commandHistory;
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
    lastSavedAt = Date.now();
    saveFailing = false;
    saving = false;
    updateSaveBadge();
    return true;
  } catch (e) {
    saving = false;
    saveFailing = true;
    if (!quotaWarned) {
      quotaWarned = true;
      toast('Almacenamiento lleno. Exporta un proyecto .json y libera espacio.');
      const badge = $('#statQuota');
      if (badge) setVisible(badge, true);
    }
    updateSaveBadge();
    return false;
  }
}

let saveWarned = false;
function warnSaveFailure() {
  if (saveWarned) return;
  saveWarned = true;
  toast('No se pudo escribir en IndexedDB. Se usará el almacenamiento local (limitado).');
}

function persistNow() {
  const data = stateData();
  if (storageMode !== 'idb') return Promise.resolve(persistToLS(data));
  saving = true;
  updateSaveBadge();
  writeChain = writeChain.then(async () => {
    try {
      await idbPutStore('state', 'project', data);
      lastSavedAt = Date.now();
      saveFailing = false;
    } catch (e) {
      saveFailing = true;
      warnSaveFailure();
      // Si IndexedDB no acepta escrituras, pasamos a localStorage el resto de
      // la sesión para no repetir fallos y para que el historial se guarde.
      if (persistToLS(data)) storageMode = 'ls';
    } finally {
      saving = false;
      updateSaveBadge();
    }
  });
  return writeChain;
}

const saveDebounced = debounce(() => {
  pendingSave = false;
  void persistNow();
}, 250);

async function flushSave() {
  if (pendingSave) { pendingSave = false; await persistNow(); }
  try { await writeChain; } catch (e) {}
}

function saveHistory() {
  if (storageMode !== 'idb') { save(); return; }
  const hist = state.commandHistory.slice(0, 40);
  writeChain = writeChain.then(() => idbPutStore('state', 'history', hist)).catch(() => {});
}

/* ================= copias de seguridad automáticas ================= */
function projectData() {
  return {
    v: 2,
    importedAt: state.importedAt,
    chars: state.chars,
    order: state.order,
    origOrder: state.origOrder,
    seriesOrder: state.seriesOrder,
    origSeriesOrder: state.origSeriesOrder,
    seriesMeta: state.seriesMeta,
    warnings: state.warnings,
    seriesPinned: state.seriesPinned,
    seriesPresets: state.seriesPresets,
    savedFilters: state.savedFilters,
    importHistory: state.importHistory,
    commandHistory: state.commandHistory,
    seriesExpanded: state.seriesExpanded,
    positionSnapshots: state.positionSnapshots,
    settings: state.settings
  };
}

function readLegacyBackups() {
  try {
    const arr = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
    return Array.isArray(arr) ? arr.filter(b => b && b.data).slice(0, BACKUP_MAX) : [];
  } catch (e) { return []; }
}

function readBackups() {
  return Array.isArray(backupsCache) ? backupsCache : [];
}

function persistBackups() {
  if (storageMode !== 'idb') {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backupsCache));
    } catch (e) {
      if (!quotaWarned) {
        quotaWarned = true;
        toast('Sin espacio para copias automáticas. Exporta un proyecto .json para resguardar tus datos.');
      }
    }
    return;
  }
  writeChain = writeChain.then(() => idbPutStore('state', 'backups', backupsCache)).catch(() => {});
}

function writeBackups(list) {
  backupsCache = list.slice(0, BACKUP_MAX);
  persistBackups();
  return true;
}

function createBackup(reason = 'manual') {
  if (!state.chars.length) return null;
  const list = readBackups();
  const entry = {
    id: 'bk-' + Date.now().toString(36),
    at: Date.now(),
    reason,
    chars: state.chars.length,
    series: new Set(state.chars.map(c => c.series)).size,
    data: projectData()
  };
  const last = list[0];
  if (last && reason !== 'manual' && Date.now() - last.at < 5 * 60 * 1000 && last.reason === reason) {
    return last;
  }
  list.unshift(entry);
  writeBackups(list);
  updateBackupCount();
  return entry;
}

function createBackupSafe(reason) {
  try { return createBackup(reason); } catch (e) { return null; }
}

function updateBackupCount() {
  const n = readBackups().length;
  const el = $('#backupCount');
  if (el) el.textContent = n ? `(${n})` : '';
}

/* ================= instantáneas de posiciones =================
   Guardan cómo tienes ordenado el harem (personajes, series y fijados) para poder volver a ese
   orden más adelante o compararlo con el orden actual de Mudae (el de la última importación). */
function listPositionSnapshots() {
  return state.positionSnapshots.map(p => ({ id: p.id, name: p.name, at: p.at, count: p.order.length }));
}

function savePositionSnapshot(name) {
  if (!state.order.length) { toast('Primero importa tu harem'); return null; }
  const entry = {
    id: 'pos-' + Date.now().toString(36),
    name: String(name || '').trim().slice(0, 60) || ('Orden ' + new Date().toLocaleString(LOC())),
    at: Date.now(),
    order: state.order.slice(),
    seriesOrder: state.seriesOrder.slice(),
    pinned: state.chars.filter(c => c.pinned).map(c => c.id)
  };
  state.positionSnapshots = [entry, ...state.positionSnapshots].slice(0, MAX_POSITION_SNAPSHOTS);
  save();
  return entry.id;
}

function restorePositionSnapshot(id) {
  const snap = state.positionSnapshots.find(p => p.id === id);
  if (!snap) return false;
  pushUndo();
  const ids = new Set(state.chars.map(c => c.id));
  const wanted = snap.order.filter(x => ids.has(x));
  const wantedSet = new Set(wanted);
  const missing = state.chars.map(c => c.id).filter(x => !wantedSet.has(x));
  state.order = [...wanted, ...missing];
  if (Array.isArray(snap.seriesOrder)) state.seriesOrder = normalizeSeriesOrder(snap.seriesOrder);
  const pinned = new Set(snap.pinned || []);
  for (const c of state.chars) c.pinned = pinned.has(c.id);
  save();
  render();
  return true;
}

function deletePositionSnapshot(id) {
  state.positionSnapshots = state.positionSnapshots.filter(p => p.id !== id);
  save();
}

// Cuántos personajes están en un puesto distinto al que tenían en la última importación (orden de Mudae)
function orderDiff() {
  const base = state.origOrder.filter(id => byId.has(id));
  const pos = new Map(state.order.filter(id => byId.has(id)).map((id, i) => [id, i]));
  let moved = 0;
  base.forEach((id, i) => { if (pos.get(id) !== i) moved++; });
  return { moved, total: base.length };
}

/* Orden de series: conserva el orden elegido y añade las series nuevas al final (A-Z). */
function normalizeSeriesOrder(list) {
  const all = [];
  const seen = new Set();
  for (const c of state.chars) {
    if (!seen.has(c.series)) { seen.add(c.series); all.push(c.series); }
  }
  const input = Array.isArray(list) ? list : [];
  const out = [];
  const used = new Set();
  for (const name of input) {
    if (typeof name !== 'string' || !seen.has(name) || used.has(name)) continue;
    used.add(name);
    out.push(name);
  }
  const rest = all.filter(name => !used.has(name))
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  return out.concat(rest);
}

function normalizeSeriesPinned(list) {
  const valid = new Set(state.chars.map(c => c.series));
  const out = [];
  const seen = new Set();
  for (const name of (Array.isArray(list) ? list : [])) {
    if (typeof name !== 'string' || !valid.has(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function isSeriesPinned(name) {
  return Array.isArray(state.seriesPinned) && state.seriesPinned.includes(name);
}

function getSeriesOrder() {
  const normalized = normalizeSeriesOrder(state.seriesOrder);
  state.seriesOrder = normalized;
  return normalized;
}

function setProject(obj) {
  const chars = (obj.chars || []).filter(c => c && c.id && c.name && c.series).map(c => {
    // Migración: versiones anteriores dejaban tokens de llave (:bronzekey:,
    // :silverkey:,, etc.) dentro de la nota. Recuperamos su contador y
    // limpiamos la nota sin tocar notas reales.
    const legacyNote = extractKeyInfo(c.note);
    const legacyOrigNote = extractKeyInfo(c.origNote !== undefined ? c.origNote : c.note);
    return {
      ...c,
      name: cleanCharName(c.name),
      note: cleanNoteText(legacyNote.text),
      origNote: cleanNoteText(legacyOrigNote.text),
      keys: Number(c.keys) || legacyNote.keys || 0,
      embedColor: c.embedColor || '',
      origColor: c.origColor !== undefined ? c.origColor : (c.embedColor || ''),
      pinned: !!c.pinned,
      tags: Array.isArray(c.tags) ? c.tags.map(t => cleanTag(t)).filter(Boolean) : [],
      mudaeId: c.mudaeId || extractMudaeId(c.image)
    };
  });
  state = {
    v: 2,
    importedAt: obj.importedAt || Date.now(),
    chars,
    order: [],
    origOrder: Array.isArray(obj.origOrder) ? obj.origOrder : [],
    seriesOrder: Array.isArray(obj.seriesOrder) ? obj.seriesOrder : [],
    origSeriesOrder: Array.isArray(obj.origSeriesOrder) ? obj.origSeriesOrder : [],
    seriesMeta: Array.isArray(obj.seriesMeta) ? obj.seriesMeta : [],
    warnings: Array.isArray(obj.warnings) ? obj.warnings : [],
    seriesPinned: Array.isArray(obj.seriesPinned) ? obj.seriesPinned : [],
    seriesPresets: Array.isArray(obj.seriesPresets) ? obj.seriesPresets : [],
    savedFilters: Array.isArray(obj.savedFilters) ? obj.savedFilters : [],
    importHistory: Array.isArray(obj.importHistory) ? obj.importHistory : [],
    commandHistory: Array.isArray(obj.commandHistory) ? obj.commandHistory : [],
    seriesExpanded: Array.isArray(obj.seriesExpanded) ? obj.seriesExpanded : [],
    positionSnapshots: Array.isArray(obj.positionSnapshots)
      ? obj.positionSnapshots.filter(p => p && p.id && Array.isArray(p.order)).slice(0, MAX_POSITION_SNAPSHOTS) : [],
    settings: { ...DEFAULTS, ...(obj.settings || {}) },
  };
  // Notas y etiquetas ya no se usan: se limpian los filtros que pudieran quedar guardados
  state.settings.noteFilter = '';
  state.settings.onlyNote = false;
  state.settings.tagFilter = '';
  state.settings.showNotesOnCards = false;
  state.settings.showTagsOnCards = false;
  // Rediseño v6: la vista agrupada por serie pasa a ser la predeterminada (una sola vez)
  if (!state.settings.uiV6) { state.settings.uiV6 = true; state.settings.groupBySeries = true; }
  rebuildIndex();
  state.seriesOrder = normalizeSeriesOrder(state.seriesOrder);
  state.seriesPinned = normalizeSeriesPinned(state.seriesPinned);
  state.seriesPresets = state.seriesPresets.filter(p => p && p.name && Array.isArray(p.order));
  state.savedFilters = state.savedFilters.filter(f => f && f.name && f.settings);
  if (!state.origSeriesOrder.length) state.origSeriesOrder = state.seriesOrder.slice();
  state.origSeriesOrder = normalizeSeriesOrder(state.origSeriesOrder);
  const ids = new Set(state.chars.map(c => c.id));
  const wanted = Array.isArray(obj.order) ? obj.order.filter(id => ids.has(id)) : [];
  const missing = state.chars.map(c => c.id).filter(id => !wanted.includes(id));
  state.order = [...new Set([...wanted, ...missing])];
  if (!state.origOrder.length) state.origOrder = state.order.slice();
  if (state.settings.series && !state.chars.some(c => c.series === state.settings.series)) state.settings.series = '';
  seriesExpanded = new Set(state.seriesExpanded.filter(n => state.chars.some(c => c.series === n)));
  seriesExpandedReady = seriesExpanded.size > 0;
  seriesSelected = new Set();
  undoStack = [];
  redoStack = [];
  updateUndoButtons();
}

function loadStateFromLS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    if (!obj) return false;
    if (Array.isArray(obj.chars) && obj.chars.length) { setProject(obj); return true; }
    if (obj.settings) state.settings = { ...DEFAULTS, ...obj.settings };
    return false;
  } catch (e) {
    return false;
  }
}

async function initStorage() {
  try {
    await db();
    storageMode = 'idb';
  } catch (e) {
    storageMode = 'ls';
  }

  if (storageMode === 'idb') {
    try {
      const project = await idbGet('state', 'project');
      const legacyRaw = localStorage.getItem(LS_KEY);
      let legacy = null;
      try { legacy = legacyRaw ? JSON.parse(legacyRaw) : null; } catch (e) {}

      const hasProject = !!(project && Array.isArray(project.chars) && project.chars.length);
      const hasLegacy = !!(legacy && Array.isArray(legacy.chars) && legacy.chars.length);
      // Si IndexedDB falló en una sesión anterior, se guardó una copia completa
      // en localStorage. Recuperamos la más reciente de las dos.
      const legacyIsNewer = hasLegacy && (!hasProject ||
        (Number(legacy.savedAt) || 0) > (Number(project.savedAt) || 0));

      if (hasProject && !legacyIsNewer) {
        setProject(project);
      } else if (hasLegacy) {
        // Migración desde v3.0 (todo vivía en localStorage)
        setProject(legacy);
        let migratedOk = false;
        try {
          await idbPutStore('state', 'project', stateData());
          migratedOk = true;
          if (Array.isArray(legacy.commandHistory) && legacy.commandHistory.length) {
            await idbPutStore('state', 'history', legacy.commandHistory.slice(0, 40)).catch(() => {});
          }
          const migrated = readLegacyBackups();
          if (migrated.length) {
            backupsCache = migrated;
            await idbPutStore('state', 'backups', backupsCache).catch(() => {});
            try { localStorage.removeItem(BACKUP_KEY); } catch (e) {}
          }
        } catch (e) {
          migratedOk = false;
        }
        if (migratedOk) {
          try { localStorage.removeItem(LS_KEY); } catch (e) {}
          if (hasProject) toast('Datos recuperados desde la copia local más reciente');
          else toast('Datos migrados a IndexedDB (' + legacy.chars.length + ' personajes)');
        } else {
          storageMode = 'ls';
          toast('No se pudo migrar a IndexedDB; se seguirá usando el almacenamiento local');
        }
      } else if (legacy && legacy.settings) {
        state.settings = { ...DEFAULTS, ...legacy.settings };
      }

      const hist = await idbGet('state', 'history');
      if (Array.isArray(hist) && hist.length) state.commandHistory = hist.slice(0, 40);

      const bks = await idbGet('state', 'backups');
      if (Array.isArray(bks) && bks.length) {
        backupsCache = bks.filter(b => b && b.data).slice(0, BACKUP_MAX);
      } else if (!backupsCache.length) {
        backupsCache = readLegacyBackups();
        if (backupsCache.length) persistBackups();
      }

    } catch (e) {
      storageMode = 'ls';
      loadStateFromLS();
    }
  } else {
    loadStateFromLS();
    backupsCache = readLegacyBackups();
  }

  // Los ajustes se escriben al instante en localStorage; son los más recientes.
  try {
    const rawSettings = localStorage.getItem(LS_SETTINGS_KEY);
    if (rawSettings) {
      const saved = JSON.parse(rawSettings);
      if (saved && saved.settings) state.settings = { ...DEFAULTS, ...state.settings, ...saved.settings };
    }
  } catch (e) {}
  // Solo ahora, con los ajustes más recientes ya aplicados, se vuelve a escribir la copia rápida
  persistSettingsOnly();

  updateBackupCount();
  updateSaveBadge();
}

let dbPromise = null;
function openDB() {
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('sin IndexedDB'));
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('thumbs')) db.createObjectStore('thumbs');
      if (!db.objectStoreNames.contains('galleries')) db.createObjectStore('galleries');
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
const db = () => (dbPromise || (dbPromise = openDB()));
const reqP = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

async function idbAll() {
  const d = await db();
  const keys = await reqP(d.transaction('thumbs', 'readonly').objectStore('thumbs').getAllKeys());
  const out = [];
  for (const k of keys) {
    const rec = await reqP(d.transaction('thumbs', 'readonly').objectStore('thumbs').get(k));
    if (rec) out.push([k, rec]);
  }
  return out;
}
async function idbPut(id, rec) {
  const d = await db();
  const tx = d.transaction('thumbs', 'readwrite');
  tx.objectStore('thumbs').put(rec, id);
  return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
async function idbClear() {
  const d = await db();
  const tx = d.transaction('thumbs', 'readwrite');
  tx.objectStore('thumbs').clear();
  return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

async function idbGet(store, key) {
  try { const d = await db(); return reqP(d.transaction(store,'readonly').objectStore(store).get(key)); } catch(e){return null;}
}
async function idbPutStore(store, key, val) {
  // Debe propagar errores (cuota, transacción abortada) para que la capa de
  // guardado pueda avisar y usar el respaldo en localStorage.
  const d = await db();
  const tx = d.transaction(store, 'readwrite');
  tx.objectStore(store).put(val, key);
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error || new Error('Error de escritura en IndexedDB'));
    tx.onabort = () => rej(tx.error || new Error('Escritura cancelada en IndexedDB'));
  });
}
async function idbClearStore(store) {
  const d = await db();
  const tx = d.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error || new Error('Error al limpiar IndexedDB'));
    tx.onabort = () => rej(tx.error || new Error('Limpieza cancelada en IndexedDB'));
  });
}

async function loadThumbs() {
  try {
    for (const [id, rec] of await idbAll()) {
      thumbs.set(id, rec);
      setThumbUrls(id, rec);
    }
  } catch (e) {}
}

function setThumbUrls(id, rec) {
  const prev = thumbUrls.get(id);
  if (prev) for (const u of Object.values(prev)) URL.revokeObjectURL(u);
  const urls = {};
  if (rec.blob) urls.main = URL.createObjectURL(rec.blob);
  if (rec.poster) urls.poster = URL.createObjectURL(rec.poster);
  thumbUrls.set(id, urls);
}

function needsCache(c) {
  if (!c || !c.image) return false;
  const t = thumbs.get(c.id);
  return !t || t.url !== c.image;
}

function loadImage(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('imagen ilegible')); };
    img.src = url;
  });
}

async function shrink(blob, max) {
  const img = await loadImage(blob);
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) throw new Error('sin dimensiones');
  const k = Math.min(1, max / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k));
  const h = Math.max(1, Math.round(h0 * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const out = await new Promise(r => canvas.toBlob(r, 'image/webp', 0.86));
  if (!out) throw new Error('sin webp');
  return out.size < blob.size ? out : blob;
}

async function fetchThumb(c) {
  const res = await fetch(c.image, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const blob = await res.blob();
  if (!/^image\//i.test(blob.type)) throw new Error('no es imagen');
  const isGif = blob.type === 'image/gif' || /\.gif(\?|$)/i.test(c.image);
  if (isGif) {
    let poster = null;
    try { poster = await shrink(blob, 480); } catch (e) {}
    return { url: c.image, blob, poster, ts: Date.now() };
  }
  let small = blob;
  try { small = await shrink(blob, 520); } catch (e) {}
  return { url: c.image, blob: small, poster: null, ts: Date.now() };
}

async function startCaching() {
  if (caching || !state.chars.length) return;
  if (state.settings.performanceMode) {
    setVisible($('#btnRetryCache'), false);
    toast('Modo rendimiento: caché de imágenes desactivada');
    return;
  }
  const targets = state.chars.filter(c => !failed.has(c.id) && needsCache(c));
  if (!targets.length) return;

  caching = true;
  const wrap = $('#progressWrap');
  const bar = $('#progressBar');
  const label = $('#cacheLabel');
  setVisible(wrap, true);

  const total = targets.length;
  let done = 0;
  const tick = () => {
    bar.style.width = Math.round((done / total) * 100) + '%';
    label.textContent = 'Optimizando imágenes ' + done + '/' + total;
  };
  tick();

  const queue = targets.slice();
  const worker = async () => {
    while (queue.length) {
      const c = queue.shift();
      if (!c) continue;
      try {
        const rec = await fetchThumb(c);
        thumbs.set(c.id, rec);
        setThumbUrls(c.id, rec);
        failed.delete(c.id);
        try { await idbPut(c.id, rec); } catch (e) {}
      } catch (e) {
        failed.add(c.id);
      }
      done++;
      tick();
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));

  caching = false;
  setVisible(wrap, false);
  bar.style.width = '0%';
  label.textContent = '';
  const retry = $('#btnRetryCache');
  if (retry) setVisible(retry, failed.size > 0);
  render();
}

function srcFor(c) {
  const t = thumbUrls.get(c.id);
  const gif = /\.gif(\?|$)/i.test(c.image);
  if (gif && state.settings.pauseGifs && t && t.poster) return t.poster;
  if (t && t.main) return t.main;
  return c.image;
}

function initials(name) {
  return String(name).split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join('').toUpperCase();
}

function togglePin(id) {
  const c = byId.get(id);
  if (!c) return;
  pushUndo();
  c.pinned = !c.pinned;
  save();
  render();
  toast(c.pinned ? `Posición fijada: ${c.name}` : `Posición liberada: ${c.name}`);
}

const SVG_KEY = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/></svg>';
const SVG_PIN = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17v5M8 3h8l-1 7 3 4H6l3-4z"/></svg>';
const SVG_TICK = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function cardEl(c, index) {
  const keyCount = Number(c.keys) || 0;
  const card = document.createElement('article');
  card.className = 'card'
    + (selection.has(c.id) ? ' selected' : '')
    + (c.pinned ? ' is-pinned' : '')
    + (c.embedColor ? ' framed' : '')
    + (keyCount >= 10 ? ' soulmate-card' : '');
  card.dataset.id = c.id;
  card.tabIndex = 0;
  if (c.embedColor) {
    card.style.setProperty('--frame', c.embedColor);
    card.style.setProperty('--card-hex', c.embedColor);
  }
  card.title = [
    c.name,
    c.series,
    fmtKakera(c.kakera || 0) + ' ka',
    keyCount > 0 ? keyCount + (keyCount === 1 ? ' llave' : ' llaves') : '',
    Number.isInteger(index) ? 'Puesto #' + (index + 1) : '',
    c.rank ? 'Ranking #' + fmtKakera(c.rank) : '',
    Number(c.spheres) > 0 ? fmtKakera(c.spheres) + ' esferas' : '',
    c.pinned ? 'Posición fijada' : ''
  ].filter(Boolean).join(' · ');

  const media = document.createElement('div');
  media.className = 'media';
  const img = document.createElement('img');
  img.alt = c.name;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.src = srcFor(c);
  img.addEventListener('error', () => {
    media.classList.add('failed');
    media.dataset.initials = initials(c.name);
    img.remove();
  });
  media.append(img);

  const sheen = document.createElement('span');
  sheen.className = 'sheen';
  media.append(sheen);

  const tags = document.createElement('div');
  tags.className = 'tags';
  if (Number.isInteger(index) && state.settings.showPos !== false) {
    const p = document.createElement('span');
    p.className = 'tag slot' + (c.pinned ? ' pinned' : '');
    p.textContent = String(index + 1);
    p.title = 'Puesto en tu harem' + (c.pinned ? ' (fijado)' : '');
    tags.append(p);
  }
  if (tags.childElementCount) media.append(tags);
  let sphereLine = '';
  if (Number(c.spheres) > 0 && state.settings.showSpheres !== false) {
    const t = document.createElement('span');
    sphereLine = '<i class="sp-dot"></i>' + escapeHtml(fmtKakera(c.spheres)) + ' sp';
  }

  const tick = document.createElement('button');
  tick.type = 'button';
  tick.className = 'tick';
  tick.title = 'Seleccionar';
  tick.setAttribute('aria-label', 'Seleccionar');
  tick.innerHTML = SVG_TICK;
  tick.addEventListener('pointerdown', ev => ev.stopPropagation());
  media.append(tick);

  const pinBtn = document.createElement('button');
  pinBtn.type = 'button';
  pinBtn.className = 'pin-btn' + (c.pinned ? ' active' : '');
  pinBtn.title = c.pinned ? 'Soltar posición' : 'Fijar posición (no se moverá al ordenar)';
  pinBtn.setAttribute('aria-label', pinBtn.title);
  pinBtn.innerHTML = SVG_PIN;
  pinBtn.addEventListener('pointerdown', ev => ev.stopPropagation());
  pinBtn.addEventListener('click', ev => { ev.stopPropagation(); togglePin(c.id); });
  media.append(pinBtn);
  card.append(media);

  const cap = document.createElement('div');
  cap.className = 'cap';
  const name = document.createElement('b');
  name.textContent = c.name;
  const ser = document.createElement('span');
  ser.className = 'ser';
  ser.textContent = c.series;
  const meta = document.createElement('div');
  meta.className = 'meta';
  const ka = document.createElement('span');
  ka.className = 'ka';
  ka.textContent = c.kakera !== null && c.kakera !== undefined ? fmtKakera(c.kakera) + ' ka' : '';
  if (state.settings.showKakera !== false) meta.append(ka);
  if (keyCount > 0 && state.settings.showKeys !== false) {
    const k = document.createElement('span');
    k.className = 'keys';
    k.innerHTML = SVG_KEY + keyCount;
    k.title = keyCount + (keyCount === 1 ? ' llave' : ' llaves');
    meta.append(k);
  }
  if (sphereLine) {
    const s = document.createElement('span');
    s.className = 'sph-line';
    s.innerHTML = sphereLine;
    s.title = 'Esferas';
    meta.append(s);
  }
  cap.append(name);
  if (state.settings.showSeries !== false) cap.append(ser);
  if (meta.childElementCount) cap.append(meta);
  card.append(cap);
  return card;
}

/* Búsqueda avanzada: texto libre + series: serie: name: note: tag: color: key:/keys: ka: pin: has: */
function tokenizeSearch(raw) {
  const out = [];
  const re = /(?:[^\s"]+|"[^"]*")+/g;
  let m;
  while ((m = re.exec(String(raw || '')))) {
    out.push(m[0].replace(/^"|"$/g, ''));
  }
  return out;
}

function parseAdvancedQuery(raw) {
  const tokens = tokenizeSearch(raw).map(t => t.trim()).filter(Boolean);
  const positive = [];
  const negative = [];
  let duplicateOnly = false;

  for (let token of tokens) {
    let neg = false;
    if (token.startsWith('-') && token.length > 1) { neg = true; token = token.slice(1); }
    const idx = token.indexOf(':');
    const target = neg ? negative : positive;
    if (idx > 0) {
      const key = norm(token.slice(0, idx));
      const value = token.slice(idx + 1).trim();
      if (key === 'dup' || key === 'duplicado') { if (!neg) duplicateOnly = true; continue; }
      target.push({ type: 'field', key, value });
      continue;
    }
    if (norm(token) === 'dup' || norm(token) === 'duplicado') { if (!neg) duplicateOnly = true; continue; }
    target.push({ type: 'text', value: token });
  }
  return { positive, negative, duplicateOnly };
}

function parseNumQuery(value) {
  const v = String(value || '').trim().replace(',', '.');
  const m = v.match(/^(>=|<=|>|<|=)?\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return { op: m[1] || '=', num: Number(m[2]) };
}

function numMatch(n, q) {
  if (!q) return true;
  const v = Number(n) || 0;
  if (q.op === '>=') return v >= q.num;
  if (q.op === '<=') return v <= q.num;
  if (q.op === '>') return v > q.num;
  if (q.op === '<') return v < q.num;
  return v === q.num;
}

function charMatchesToken(c, token, dupKeys) {
  const value = token.value;
  const nv = norm(value);
  switch (token.key) {
    case 'series':
    case 'serie':
      return norm(c.series).includes(nv);
    case 'name':
    case 'nombre':
      return norm(c.name).includes(nv);
    case 'note':
    case 'nota':
      return norm(c.note).includes(nv);
    case 'tag':
    case 'etiqueta':
      return (c.tags || []).some(t => norm(t).includes(nv));
    case 'color':
    case 'hex':
      if (nv === 'none' || nv === 'no' || nv === 'sin') return !c.embedColor;
      return String(c.embedColor || '').toLowerCase().includes(nv.replace('#', ''));
    case 'key':
    case 'keys':
    case 'llaves':
      return numMatch(Number(c.keys) || 0, parseNumQuery(value));
    case 'ka':
    case 'kakera':
      return numMatch(Number(c.kakera) || 0, parseNumQuery(value));
    case 'sp':
    case 'esferas':
    case 'spheres':
      return numMatch(Number(c.spheres) || 0, parseNumQuery(value));
    case 'rank':
    case 'ranking':
      return c.rank ? numMatch(c.rank, parseNumQuery(value)) : false;
    case 'pin':
    case 'pinned':
    case 'fijado':
      return ['yes', 'true', '1', 'si', 'sí'].includes(nv) ? !!c.pinned : !c.pinned;
    case 'has':
    case 'tiene':
      if (nv === 'note' || nv === 'nota') return !!c.note;
      if (nv === 'key' || nv === 'keys' || nv === 'llaves') return (Number(c.keys) || 0) > 0;
      if (nv === 'color') return !!c.embedColor;
      if (nv === 'tag' || nv === 'etiqueta') return (c.tags || []).length > 0;
      return true;
    case 'dup':
    case 'duplicado':
      return Object.prototype.hasOwnProperty.call(dupKeys, c.id);
    default:
      return true;
  }
}

function buildDuplicateKeys() {
  const byName = new Map();
  const byMudae = new Map();
  const ids = new Set();
  for (const c of state.chars) {
    const nk = norm(c.name);
    if (!byName.has(nk)) byName.set(nk, []);
    byName.get(nk).push(c.id);
    if (c.mudaeId) {
      const mk = String(c.mudaeId);
      if (!byMudae.has(mk)) byMudae.set(mk, []);
      byMudae.get(mk).push(c.id);
    }
  }
  for (const arr of [...byName.values(), ...byMudae.values()]) {
    if (arr.length > 1) arr.forEach(id => ids.add(id));
  }
  const obj = {};
  for (const id of ids) obj[id] = true;
  return obj;
}

function visibleIds() {
  const parsed = parseAdvancedQuery(state.settings.search);
  const noteQ = norm(state.settings.noteFilter);
  const onlyNote = !!state.settings.onlyNote;
  const series = state.settings.series;
  const tagFilter = norm(state.settings.tagFilter || '');
  const kf = state.settings.keyFilter || 'all';
  const dupKeys = parsed.duplicateOnly ? buildDuplicateKeys() : null;
  const out = [];

  for (const id of state.order) {
    const c = byId.get(id);
    if (!c) continue;
    const keys = Number(c.keys) || 0;

    // Compatibilidad: búsqueda de texto libre sobre nombre, serie, nota, color y etiquetas
    const hay = norm(c.name) + ' ' + norm(c.series) + ' ' + norm(c.note) + ' ' + norm(c.embedColor)
      + ' ' + (c.tags || []).map(norm).join(' ');

    let ok = true;
    for (const t of parsed.positive) {
      if (t.type === 'text') { if (!hay.includes(norm(t.value))) { ok = false; break; } }
      else if (!charMatchesToken(c, t, dupKeys)) { ok = false; break; }
    }
    if (ok) {
      for (const t of parsed.negative) {
        if (t.type === 'text') { if (hay.includes(norm(t.value))) { ok = false; break; } }
        else if (charMatchesToken(c, t, dupKeys)) { ok = false; break; }
      }
    }
    if (ok && parsed.duplicateOnly && !dupKeys[c.id]) ok = false;
    if (!ok) continue;

    if (noteQ && !norm(c.note).includes(noteQ)) continue;
    if (series && c.series !== series) continue;
    if (tagFilter && !(c.tags || []).some(t => norm(t) === tagFilter)) continue;
    if (onlyNote && !c.note) continue;

    if (kf === 'with_keys' && keys < 1) continue;
    if (kf === 'no_keys' && keys > 0) continue;
    if (kf === 'keys_3' && keys < 3) continue;
    if (kf === 'keys_6' && keys < 6) continue;
    if (kf === 'keys_10' && keys < 10) continue;
    if (kf === 'keys_nocolor' && (keys < 1 || c.embedColor)) continue;

    out.push(id);
  }
  return out;
}

function render() {
  const grid = $('#grid');
  const empty = $('#empty');
  const emptyTitle = $('#emptyTitle');
  const emptyDesc = $('#emptyDesc');
  const emptyBtn = $('#btnEmptyImport');

  const ids = visibleIds();
  const posMap = new Map(state.order.map((id, i) => [id, i]));
  const metaMap = new Map((state.seriesMeta || []).map(s => [s.name, s]));

  grid.innerHTML = '';
  grid.classList.toggle('grouped', !!state.settings.groupBySeries);

  if (!state.chars.length) {
    emptyTitle.textContent = 'Aún no hay personajes';
    emptyDesc.textContent = 'Importa tu harem desde Discord para empezar.';
    setVisible(emptyBtn, true);
    setVisible(empty, true);
  } else if (!ids.length) {
    emptyTitle.textContent = 'Sin resultados';
    emptyDesc.textContent = 'Prueba con otro nombre o quita los filtros.';
    setVisible(emptyBtn, false);
    setVisible(empty, true);
  } else {
    setVisible(empty, false);
  }

  const pageSize = Number(state.settings.pageSize) || 0;

  if (state.settings.groupBySeries) {
    const groups = new Map();
    for (const id of ids) {
      const c = byId.get(id);
      if (!groups.has(c.series)) groups.set(c.series, []);
      groups.get(c.series).push(c);
    }
    const orderedNames = getSeriesOrder().filter(name => groups.has(name));
    for (const name of groups.keys()) if (!orderedNames.includes(name)) orderedNames.push(name);
    for (const seriesName of orderedNames) {
      const list = groups.get(seriesName) || [];
      if (!list.length) continue;
      const meta = metaMap.get(seriesName);
      const totalInSeries = meta && meta.total ? meta.total : (list[0]?.seriesTotal || list.length);
      const pct = totalInSeries > 0 ? Math.min(100, Math.round((list.length / totalInSeries) * 100)) : 100;
      const sumKa = list.reduce((acc, c) => acc + (Number(c.kakera) || 0), 0);
      const missing = Math.max(0, totalInSeries - list.length);

      const head = document.createElement('div');
      head.className = 'series-head' + (isSeriesPinned(seriesName) ? ' is-pinned-series' : '');
      head.innerHTML = `
        <div class="series-head-left">
          <span>${escapeHtml(seriesName)}</span>
          <span class="muted">${list.length} de ${totalInSeries}</span>
          ${missing ? `<span class="missing-badge">Faltan ${missing}</span>` : ''}
        </div>
        <div class="series-head-right">
          <span>${fmtKakera(sumKa)} ka</span>
          <div class="series-prog-bar" title="${pct}% completado"><i style="width:${pct}%"></i></div>
          <span>${pct}%</span>
        </div>
      `;
      grid.append(head);
      for (const c of list) grid.append(cardEl(c, posMap.get(c.id)));
    }
  } else {
    ids.forEach((id, idx) => {
      if (pageSize > 0 && idx % pageSize === 0) {
        const pageNum = Math.floor(idx / pageSize) + 1;
        const sliceIds = ids.slice(idx, idx + pageSize);
        const pageKa = sliceIds.reduce((s, cid) => s + (Number(byId.get(cid)?.kakera) || 0), 0);
        const div = document.createElement('div');
        div.className = 'page-divider';
        div.innerHTML = `<span>Página ${pageNum} de Mudae (#${idx + 1} a #${idx + sliceIds.length}) · ${fmtKakera(pageKa)} ka</span>`;
        grid.append(div);
      }
      const c = byId.get(id);
      if (c) grid.append(cardEl(c, posMap.get(id)));
    });
  }

  updateStats();
  updateBatchBarUI();
  updatePendingBadge();

  if (document.body.dataset.tab === 'series') renderSeriesOrganizer();
  if (typeof window.__mudaeAfterRender === 'function') window.__mudaeAfterRender();
  document.dispatchEvent(new CustomEvent('mudae:render'));
}

/* ================= ORDENAR POR SERIE ($sm series) ================= */
function computeSeriesBuckets() {
  const buckets = new Map();
  for (const name of getSeriesOrder()) buckets.set(name, []);
  for (const id of state.order) {
    const c = byId.get(id);
    if (!c) continue;
    if (!buckets.has(c.series)) buckets.set(c.series, []);
    buckets.get(c.series).push(c);
  }
  return buckets;
}

// Límite de caracteres por mensaje de Discord (Nitro permite mensajes más largos)
const cmdLimit = () => (state.settings.nitro ? 3800 : 1800);

function buildSmSeriesBlocks(seriesNames, limit = cmdLimit()) {
  const names = (seriesNames || []).map(s => String(s || '').trim()).filter(Boolean);
  const chunks = [];
  let cur = [];
  for (const name of names) {
    const joined = cur.concat(name).join(' $ ');
    if (cur.length && ('$sm series ' + joined).length > limit) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(name);
  }
  if (cur.length) chunks.push(cur);
  // Se invierten los bloques: cada comando empuja sus series al frente.
  // Ejecutados en este orden, el resultado final respeta el orden de la lista.
  return chunks.reverse().map(chunk => '$sm series ' + chunk.join(' $ '));
}

function persistSeriesExpanded() {
  state.seriesExpanded = [...seriesExpanded];
}

function toggleSeriesExpanded(name) {
  if (seriesExpanded.has(name)) seriesExpanded.delete(name);
  else seriesExpanded.add(name);
  persistSeriesExpanded();
  saveSoon();
  renderSeriesOrganizer();
}

function computeSeriesAppliedOrder() {
  const respectPinned = state.settings.seriesRespectPinned !== false;
  const all = state.order.slice();
  const pinned = new Set();
  if (respectPinned) {
    for (const id of all) if (byId.get(id)?.pinned) pinned.add(id);
  }
  const buckets = computeSeriesBuckets();
  const ranked = [];
  const rankedSet = new Set();
  for (const name of getSeriesOrder()) {
    for (const c of buckets.get(name) || []) {
      if (pinned.has(c.id) || rankedSet.has(c.id)) continue;
      ranked.push(c.id);
      rankedSet.add(c.id);
    }
  }
  for (const id of all) {
    if (!pinned.has(id) && !rankedSet.has(id)) { ranked.push(id); rankedSet.add(id); }
  }
  let k = 0;
  return all.map(id => pinned.has(id) ? id : ranked[k++]);
}

function applySeriesOrderToLibrary(opts = {}) {
  if (!state.chars.length) {
    if (!opts.quiet) toast('Primero importe su colección');
    return false;
  }
  if (opts.pushHistory !== false) pushUndo();
  state.order = computeSeriesAppliedOrder();
  save();
  render();
  fillSeriesSelect();
  if (!opts.quiet) toast('Orden de series y fotos aplicado a la biblioteca');
  return true;
}

function reorderSeriesList(ordered) {
  if (!Array.isArray(ordered) || !ordered.length) return;
  const current = getSeriesOrder();
  if (ordered.length === current.length && ordered.every((n, i) => n === current[i])) return;
  pushUndo();
  state.seriesOrder = ordered.slice();
  if (state.settings.seriesAutoApply) state.order = computeSeriesAppliedOrder();
  save();
  fillSeriesSelect();
  render();
  toast(state.settings.seriesAutoApply ? 'Orden de series aplicado a la biblioteca' : 'Orden de series actualizado');
}

function moveSeriesTo(name, targetIdx) {
  const order = getSeriesOrder().slice();
  const from = order.indexOf(name);
  if (from < 0) return;
  const to = Math.max(0, Math.min(order.length - 1, Number(targetIdx)));
  if (to === from) return;
  order.splice(from, 1);
  order.splice(to, 0, name);
  pushUndo();
  state.seriesOrder = order;
  if (state.settings.seriesAutoApply) state.order = computeSeriesAppliedOrder();
  save();
  fillSeriesSelect();
  render();
  toast(`«${name}» movida al puesto #${to + 1}`);
}

function autoSortSeries(compareFn, label) {
  if (!state.chars.length) return;
  const current = getSeriesOrder().slice();
  const pinnedNames = new Set(state.seriesPinned);
  const movable = current.filter(n => !pinnedNames.has(n));
  movable.sort(compareFn);
  let k = 0;
  const next = current.map(n => pinnedNames.has(n) ? n : movable[k++]);
  if (next.every((n, i) => n === current[i])) {
    if (!pinnedNames.size) toast('El orden no cambió');
    else toast('Solo las series fijadas se mantienen; el resto ya estaba en ese orden');
    return;
  }
  pushUndo();
  state.seriesOrder = next;
  if (state.settings.seriesAutoApply) state.order = computeSeriesAppliedOrder();
  save();
  fillSeriesSelect();
  render();
  const pinNote = pinnedNames.size ? ` (${pinnedNames.size} fijada(s) intacta(s))` : '';
  toast(label + pinNote);
}

function seriesStats() {
  const buckets = computeSeriesBuckets();
  const metaMap = new Map((state.seriesMeta || []).map(s => [s.name, s]));
  const out = new Map();
  for (const name of getSeriesOrder()) {
    const chars = buckets.get(name) || [];
    const meta = metaMap.get(name);
    const total = meta && Number(meta.total) ? Number(meta.total) : (Number(chars[0]?.seriesTotal) || chars.length || 1);
    const pct = total > 0 ? Math.min(100, Math.round((chars.length / total) * 100)) : 100;
    const sumKa = chars.reduce((s, c) => s + (Number(c.kakera) || 0), 0);
    const keys = chars.reduce((s, c) => s + (Number(c.keys) || 0), 0);
    out.set(name, { name, count: chars.length, total, pct, sumKa, keys, missing: Math.max(0, total - chars.length) });
  }
  return out;
}

function sortSeriesAz() {
  autoSortSeries((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }), 'Series ordenadas alfabéticamente (A-Z)');
}

function sortSeriesByMetric(mode) {
  const stats = seriesStats();
  const byName = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' });
  if (mode === 'count') {
    autoSortSeries((a, b) => (stats.get(b)?.count || 0) - (stats.get(a)?.count || 0) || byName(a, b), 'Series ordenadas por cantidad de personajes');
  } else if (mode === 'kakera') {
    autoSortSeries((a, b) => (stats.get(b)?.sumKa || 0) - (stats.get(a)?.sumKa || 0) || byName(a, b), 'Series ordenadas por Kakera total');
  } else if (mode === 'completion') {
    autoSortSeries((a, b) => (stats.get(b)?.pct || 0) - (stats.get(a)?.pct || 0) || byName(a, b), 'Series ordenadas por % de completado');
  } else if (mode === 'missing') {
    autoSortSeries((a, b) => (stats.get(a)?.missing || 0) - (stats.get(b)?.missing || 0) || byName(a, b), 'Series ordenadas por faltantes (menos primero)');
  } else if (mode === 'az') {
    sortSeriesAz();
  }
}

function resetSeriesOrder() {
  if (!state.origSeriesOrder.length) { toast('No hay un orden original guardado'); return; }
  pushUndo();
  state.seriesOrder = normalizeSeriesOrder(state.origSeriesOrder);
  if (state.settings.seriesAutoApply) state.order = computeSeriesAppliedOrder();
  save();
  fillSeriesSelect();
  render();
  toast('Orden de series restablecido al de la importación original');
}

function toggleSeriesPin(name) {
  if (!name) return;
  const arr = new Set(normalizeSeriesPinned(state.seriesPinned));
  if (arr.has(name)) arr.delete(name); else arr.add(name);
  state.seriesPinned = [...arr];
  saveSoon();
  renderSeriesOrganizer();
  toast(arr.has(name)
    ? `«${name}» fijada: las ordenaciones automáticas no la moverán`
    : `Pin quitado de «${name}»`);
}

function previewSeriesApply() {
  if (!state.chars.length) { toast('Primero importe su colección'); return; }
  const next = computeSeriesAppliedOrder();
  const cur = state.order.slice();
  const changed = [];
  for (let i = 0; i < Math.max(cur.length, next.length); i++) {
    if (cur[i] !== next[i]) changed.push({ from: cur[i], to: next[i], index: i });
  }
  if (!changed.length) { toast('La biblioteca ya está en ese orden'); return; }
  const rows = changed.slice(0, 80).map(ch => {
    const c = byId.get(ch.to) || byId.get(ch.from);
    return `<tr><td>#${ch.index + 1}</td><td>${escapeHtml(c ? c.name : '—')}</td><td>${escapeHtml(c ? c.series : '')}</td></tr>`;
  }).join('');
  previewApplyFn = () => applySeriesOrderToLibrary({ quiet: true, pushHistory: true });
  showPreview(
    'Vista previa · aplicar orden de series',
    `<b>${changed.length}</b> posición(es) cambiarían. ${state.settings.seriesRespectPinned !== false ? 'Los personajes fijados () conservan su puesto.' : 'Los pines NO se respetan.'}<br>
     <span class="muted">Se muestran hasta 80 posiciones.</span>`,
    `<table class="preview-table"><thead><tr><th>Puesto</th><th>Personaje que queda</th><th>Serie</th></tr></thead><tbody>${rows}</tbody></table>`
  );
}

function saveSeriesPreset() {
  if (!state.chars.length) { toast('Primero importe su colección'); return; }
  const input = $('#seriesPresetName');
  const name = (input ? input.value : '').trim() || ('Preset ' + (state.seriesPresets.length + 1));
  const entry = { id: 'sp-' + Date.now().toString(36), name: name.slice(0, 60), order: getSeriesOrder().slice(), createdAt: Date.now() };
  state.seriesPresets = [entry, ...state.seriesPresets].slice(0, 30);
  if (input) input.value = '';
  save();
  renderSeriesPresetSelect();
  toast(`Preset «${entry.name}» guardado`);
}

function renderSeriesPresetSelect() {
  const sel = $('#seriesPresetSelect');
  if (!sel) return;
  sel.innerHTML = '';
  sel.append(new Option('— Presets guardados (' + state.seriesPresets.length + ') —', ''));
  for (const p of state.seriesPresets) {
    const date = new Date(p.createdAt || Date.now());
    sel.append(new Option(p.name + ' · ' + date.toLocaleDateString(LOC()), p.id));
  }
}

function loadSeriesPreset() {
  const sel = $('#seriesPresetSelect');
  if (!sel || !sel.value) { toast('Seleccione un preset'); return; }
  const p = state.seriesPresets.find(x => x.id === sel.value);
  if (!p) return;
  pushUndo();
  state.seriesOrder = normalizeSeriesOrder(p.order);
  if (state.settings.seriesAutoApply) state.order = computeSeriesAppliedOrder();
  save();
  fillSeriesSelect();
  render();
  toast(`Preset «${p.name}» aplicado`);
}

function deleteSeriesPreset() {
  const sel = $('#seriesPresetSelect');
  if (!sel || !sel.value) { toast('Seleccione un preset para eliminar'); return; }
  const p = state.seriesPresets.find(x => x.id === sel.value);
  if (!p) return;
  if (!confirm(`¿Eliminar el preset «${p.name}»?`)) return;
  state.seriesPresets = state.seriesPresets.filter(x => x.id !== p.id);
  save();
  renderSeriesPresetSelect();
  toast('Preset eliminado');
}

function exportSeriesOrder() {
  if (!state.chars.length) { toast('Primero importe su colección'); return; }
  const data = {
    type: 'mudae-series-order',
    v: 1,
    createdAt: new Date().toISOString(),
    order: getSeriesOrder(),
    pinned: state.seriesPinned,
    presets: state.seriesPresets
  };
  download('mudae-orden-series-' + dateStamp() + '.json', JSON.stringify(data, null, 2));
  toast('Orden de series exportado');
}

function importSeriesOrderFile(e) {
  const input = e.target;
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(String(reader.result));
      const order = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.order) ? obj.order : null);
      if (!order) throw new Error('formato');
      pushUndo();
      state.seriesOrder = normalizeSeriesOrder(order);
      if (obj && Array.isArray(obj.pinned)) state.seriesPinned = normalizeSeriesPinned(obj.pinned);
      if (obj && Array.isArray(obj.presets)) {
        state.seriesPresets = obj.presets.filter(p => p && p.name && Array.isArray(p.order)).slice(0, 30);
        renderSeriesPresetSelect();
      }
      if (state.settings.seriesAutoApply) state.order = computeSeriesAppliedOrder();
      save();
      fillSeriesSelect();
      render();
      toast('Orden de series importado');
    } catch (err) {
      toast('Archivo de orden no válido');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function copyVisibleSeriesSm() {
  const names = getSeriesOrder().filter(n => !seriesQuery || norm(n).includes(norm(seriesQuery)));
  if (!names.length) { toast('No hay series visibles'); return; }
  const blocks = buildSmSeriesBlocks(names);
  showCommandsModal(
    'Orden de series · solo las visibles',
    `<b>${names.length}</b> serie(s) visibles · ${blocks.length} bloque(s)`,
    blocks,
    'Solo se incluyen las series que coinciden con el filtro de búsqueda actual.',
    { type: 'series', label: 'Orden de series · visibles' }
  );
  if (blocks.length === 1) copyText(blocks[0]);
}

function fillSeriesJump() {
  const sel = $('#seriesJump');
  if (!sel) return;
  const names = getSeriesOrder();
  const prev = sel.value;
  sel.innerHTML = '';
  sel.append(new Option('Ir a serie…', ''));
  names.forEach((n, i) => sel.append(new Option(`#${i + 1} · ${n}`, n)));
  if (prev) sel.value = prev;
}

function jumpToSeries(name) {
  if (!name) return;
  const list = $('#seriesOrderList');
  if (!list) return;
  const card = [...list.querySelectorAll('.series-card')].find(el => el.dataset.series === name);
  if (!card) { toast('Serie no encontrada en el filtro actual'); return; }
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('jump-flash');
  setTimeout(() => card.classList.remove('jump-flash'), 1200);
}

function updateSeriesBulkUI() {
  const bar = $('#seriesBulkBar');
  const count = $('#seriesBulkCount');
  if (count) count.textContent = String(seriesSelected.size);
  setVisible(bar, seriesSelected.size > 0);
}

function toggleSeriesSelected(name) {
  if (seriesSelected.has(name)) seriesSelected.delete(name);
  else seriesSelected.add(name);
  updateSeriesBulkUI();
  renderSeriesOrganizer();
}

function bulkPinSeries(shouldPin) {
  if (!seriesSelected.size) return;
  const set = new Set(normalizeSeriesPinned(state.seriesPinned));
  for (const n of seriesSelected) { if (shouldPin) set.add(n); else set.delete(n); }
  state.seriesPinned = [...set];
  save();
  renderSeriesOrganizer();
  toast(shouldPin ? `${seriesSelected.size} serie(s) fijada(s)` : `Pin quitado de ${seriesSelected.size} serie(s)`);
}

function clearSeriesSelection() {
  seriesSelected.clear();
  updateSeriesBulkUI();
  renderSeriesOrganizer();
}

function reorderSeriesChars(seriesName, orderedIds) {
  const slots = [];
  state.order.forEach((id, idx) => {
    const c = byId.get(id);
    if (c && c.series === seriesName) slots.push(idx);
  });
  if (!slots.length || slots.length !== orderedIds.length) { renderSeriesOrganizer(); return; }
  const currentIds = slots.map(i => state.order[i]);
  if (orderedIds.every((id, i) => id === currentIds[i])) return;
  pushUndo();
  const next = state.order.slice();
  slots.forEach((slot, i) => { next[slot] = orderedIds[i]; });
  state.order = next;
  save();
  render();
  toast(`Fotos de «${seriesName}» reordenadas`);
}

function renderSeriesOrganizer() {
  const list = $('#seriesOrderList');
  if (!list) return;
  const empty = $('#seriesEmpty');
  const counter = $('#seriesOrderCount');

  if (!state.chars.length) {
    list.innerHTML = '';
    setVisible(empty, true);
    if (counter) counter.textContent = '0 series';
    updateSeriesBulkUI();
    return;
  }
  setVisible(empty, false);

  const names = getSeriesOrder();
  if (!seriesExpandedReady) {
    if (names.length) seriesExpanded.add(names[0]);
    seriesExpandedReady = true;
  }
  for (const n of [...seriesExpanded]) if (!names.includes(n)) seriesExpanded.delete(n);
  for (const n of [...seriesSelected]) if (!names.includes(n)) seriesSelected.delete(n);

  const stats = seriesStats();
  const buckets = computeSeriesBuckets();
  const indexMap = new Map(names.map((n, i) => [n, i]));
  const q = norm(seriesQuery);
  const visibleNames = q ? names.filter(n => norm(n).includes(q)) : names;
  const pinnedCount = state.seriesPinned.length;

  if (counter) {
    counter.textContent = `${names.length} serie(s)`
      + (pinnedCount ? ` · ${pinnedCount} fijada(s)` : '')
      + (q ? ` · ${visibleNames.length} visibles` : '')
      + (seriesSelected.size ? ` · ${seriesSelected.size} seleccionada(s)` : '');
  }

  fillSeriesJump();
  updateSeriesBulkUI();

  list.innerHTML = '';
  if (!visibleNames.length) {
    const msg = document.createElement('div');
    msg.className = 'muted series-no-results';
    msg.textContent = 'Ninguna serie coincide con la búsqueda.';
    list.append(msg);
    return;
  }

  for (const name of visibleNames) {
    const idx = indexMap.get(name);
    const stSeries = stats.get(name) || { count: 0, total: 1, pct: 100, sumKa: 0, missing: 0 };
    const chars = (buckets.get(name) || []);
    const expanded = seriesExpanded.has(name);
    const pinned = isSeriesPinned(name);
    const selected = seriesSelected.has(name);

    const card = document.createElement('div');
    card.className = 'series-card' + (pinned ? ' is-pinned-series' : '') + (selected ? ' is-selected-series' : '');
    card.dataset.series = name;

    const head = document.createElement('div');
    head.className = 'series-row-head';
    head.title = 'Arrastra esta fila para cambiar el orden de la serie · Pulsa para desplegar sus personajes';

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'sq-check';
    check.checked = selected;
    check.title = 'Seleccionar serie para acciones en lote';
    check.setAttribute('aria-label', 'Seleccionar ' + name);
    check.addEventListener('pointerdown', ev => ev.stopPropagation());
    check.addEventListener('click', ev => ev.stopPropagation());
    check.addEventListener('change', () => toggleSeriesSelected(name));
    head.append(check);

    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.className = 'sq-pin-btn' + (pinned ? ' active' : '');
    pinBtn.innerHTML = SVG_PIN;
    pinBtn.title = pinned
      ? 'Serie fijada: las ordenaciones automáticas no la moverán. Pulsa para soltar.'
      : 'Fijar serie: las ordenaciones automáticas (A-Z, métricas) no la moverán';
    pinBtn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
    pinBtn.addEventListener('pointerdown', ev => ev.stopPropagation());
    pinBtn.addEventListener('click', ev => { ev.stopPropagation(); toggleSeriesPin(name); });
    head.append(pinBtn);

    const handle = document.createElement('span');
    handle.className = 'sq-handle';
    handle.textContent = '⠿';
    handle.title = 'Arrastrar para cambiar el orden';
    head.append(handle);

    const pos = document.createElement('span');
    pos.className = 'sq-index';
    pos.textContent = '#' + (idx + 1);
    head.append(pos);

    const tog = document.createElement('button');
    tog.type = 'button';
    tog.className = 'sq-toggle';
    tog.textContent = expanded ? '▾' : '▸';
    tog.title = expanded ? 'Contraer personajes' : 'Desplegar personajes';
    tog.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    tog.addEventListener('click', ev => { ev.stopPropagation(); toggleSeriesExpanded(name); });
    head.append(tog);

    const nameEl = document.createElement('span');
    nameEl.className = 'sq-name';
    nameEl.textContent = name;
    head.append(nameEl);

    const metaEl = document.createElement('span');
    metaEl.className = 'sq-meta';
    metaEl.textContent = `${stSeries.count}/${stSeries.total} · ${stSeries.pct}% · ${fmtKakera(stSeries.sumKa)} ka`
      + (stSeries.missing ? ` · faltan ${stSeries.missing}` : '');
    metaEl.title = `${stSeries.count} en la colección de ${stSeries.total} · ${stSeries.pct}% completado`
      + (stSeries.missing ? ` · ${stSeries.missing} por obtener` : ' · Serie completa');
    head.append(metaEl);

    const acts = document.createElement('div');
    acts.className = 'sq-actions';
    const addAct = (label, title, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn small ghost';
      b.textContent = label;
      b.title = title;
      b.addEventListener('pointerdown', ev => ev.stopPropagation());
      b.addEventListener('click', ev => { ev.stopPropagation(); fn(); });
      acts.append(b);
    };
    addAct('⏫', 'Mover al inicio', () => moveSeriesTo(name, 0));
    addAct('↑', 'Subir una posición', () => moveSeriesTo(name, idx - 1));
    addAct('↓', 'Bajar una posición', () => moveSeriesTo(name, idx + 1));
    addAct('⏬', 'Mover al final', () => moveSeriesTo(name, getSeriesOrder().length - 1));
    head.append(acts);

    head.addEventListener('click', ev => {
      if (performance.now() - sortDragEndedAt < 350) return;
      if (ev.target.closest('button, input')) return;
      toggleSeriesExpanded(name);
    });

    card.append(head);

    if (expanded) {
      const body = document.createElement('div');
      body.className = 'series-chars';
      if (!chars.length) {
        const none = document.createElement('div');
        none.className = 'muted';
        none.textContent = 'Esta serie no tiene personajes en la colección.';
        body.append(none);
      }
      chars.forEach((c, i) => {
        const tile = document.createElement('div');
        tile.className = 'series-char' + (c.pinned ? ' is-pinned' : '');
        tile.dataset.id = c.id;
        tile.title = c.name + ' · Arrastra para cambiar el orden dentro de la serie';

        const media = document.createElement('div');
        media.className = 'series-char-media';

        const img = document.createElement('img');
        img.alt = c.name;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.src = srcFor(c);
        img.addEventListener('error', () => {
          media.classList.add('failed');
          media.dataset.initials = initials(c.name);
          img.remove();
        });
        media.append(img);

        const p = document.createElement('span');
        p.className = 'sq-pos';
        p.textContent = String(i + 1);
        media.append(p);

        if (c.pinned) {
          const pin = document.createElement('span');
          pin.className = 'sq-pin';
          pin.innerHTML = SVG_PIN;
          pin.title = 'Personaje fijado';
          media.append(pin);
        }

        const nm = document.createElement('div');
        nm.className = 'series-char-name';
        nm.textContent = c.name;

        tile.append(media, nm);
        body.append(tile);
      });
      card.append(body);
    }

    list.append(card);
  }
}

function beginSortDrag(e, item, cfg) {
  if (e.button !== 0) return;
  sortDrag = {
    item,
    cfg,
    startX: e.clientX,
    startY: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    active: false,
    pointerId: e.pointerId,
  };
  window.addEventListener('pointermove', onSortDragMove);
  window.addEventListener('pointerup', onSortDragEnd);
  window.addEventListener('pointercancel', cancelSortDrag);
  window.addEventListener('blur', cancelSortDrag);
}

function onSeriesOrderPointerDown(e) {
  if (e.button !== 0) return;
  const list = $('#seriesOrderList');
  if (!list || !list.contains(e.target)) return;
  if (e.target.closest('button, input, select, textarea, a')) return;
  const card = e.target.closest('.series-card');
  if (!card) return;

  const tile = e.target.closest('.series-char');
  if (tile) {
    const body = tile.closest('.series-chars');
    if (!body) return;
    beginSortDrag(e, tile, {
      kind: 'char',
      container: body,
      selector: '.series-char',
      axis: 'xy',
      getKey: el => el.dataset.id,
      getOrder: () => [...body.children]
        .filter(el => el.classList.contains('series-char'))
        .map(el => el.dataset.id),
      onDrop: ordered => reorderSeriesChars(card.dataset.series, ordered),
    });
    return;
  }

  const head = e.target.closest('.series-row-head');
  if (!head) return;
  beginSortDrag(e, card, {
    kind: 'series',
    container: list,
    selector: '.series-card',
    axis: 'y',
    getKey: el => el.dataset.series,
    getOrder: () => getSeriesOrder(),
    onDrop: ordered => reorderSeriesList(ordered),
  });
}

function activateSortDrag() {
  const d = sortDrag;
  if (!d) return;
  const source = d.cfg.kind === 'series' ? d.item.querySelector('.series-row-head') : d.item;
  if (!source) { cleanupSortDrag(); return; }

  const itemRect = d.item.getBoundingClientRect();
  const rect = source.getBoundingClientRect();

  const ghost = source.cloneNode(true);
  ghost.classList.add('so-ghost');
  ghost.style.width = rect.width + 'px';
  ghost.style.height = rect.height + 'px';
  ghost.style.left = rect.left + 'px';
  ghost.style.top = rect.top + 'px';
  document.body.append(ghost);

  const ph = document.createElement('div');
  ph.className = 'so-placeholder';
  ph.style.width = itemRect.width + 'px';
  ph.style.height = itemRect.height + 'px';
  d.item.parentNode.insertBefore(ph, d.item);
  d.item.classList.add('so-dragging');

  document.documentElement.classList.add('is-dragging');
  d.active = true;
  d.ghost = ghost;
  d.ph = ph;
  d.offX = d.startX - rect.left;
  d.offY = d.startY - rect.top;
  d.raf = requestAnimationFrame(sortAutoScroll);
  moveSortGhost(d.lastX, d.lastY);
  updateSortPlaceholder(d.lastX, d.lastY);
}

function moveSortGhost(x, y) {
  if (!sortDrag || !sortDrag.ghost) return;
  sortDrag.ghost.style.left = (x - sortDrag.offX) + 'px';
  sortDrag.ghost.style.top = (y - sortDrag.offY) + 'px';
}

function updateSortPlaceholder(x, y) {
  const d = sortDrag;
  if (!d || !d.active) return;
  const container = d.cfg.container;
  const ph = d.ph;
  const items = [...container.children].filter(el =>
    el.matches && el.matches(d.cfg.selector) && el !== d.item && el !== ph);

  if (!items.length) {
    if (ph.parentNode !== container) container.append(ph);
    return;
  }

  let best = null;
  let bestD = Infinity;
  for (const el of items) {
    const r = el.getBoundingClientRect();
    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    const dist = dx * dx + dy * dy;
    if (dist < bestD) { bestD = dist; best = { el, r }; }
  }
  if (!best) return;

  const { el, r } = best;
  const after = d.cfg.axis === 'y'
    ? y > r.top + r.height / 2
    : ((y > r.bottom - r.height * 0.28) || (y >= r.top && y <= r.bottom && x > r.left + r.width / 2));
  const ref = after ? el.nextSibling : el;
  if (ref === ph) return;
  container.insertBefore(ph, ref);
}

function sortAutoScroll() {
  if (!sortDrag || !sortDrag.active) return;
  const y = sortDrag.lastY;
  const m = 80;
  let v = 0;
  if (y < m) v = -Math.round((m - y) / 4);
  else if (y > innerHeight - m) v = Math.round((y - (innerHeight - m)) / 4);
  if (v) window.scrollBy(0, Math.max(-24, Math.min(24, v)));
  sortDrag.raf = requestAnimationFrame(sortAutoScroll);
}

function onSortDragMove(e) {
  if (!sortDrag || e.pointerId !== sortDrag.pointerId) return;
  if (!sortDrag.active) {
    if (Math.hypot(e.clientX - sortDrag.startX, e.clientY - sortDrag.startY) < 6) return;
    activateSortDrag();
  }
  if (!sortDrag || !sortDrag.active) return;
  sortDrag.lastX = e.clientX;
  sortDrag.lastY = e.clientY;
  moveSortGhost(e.clientX, e.clientY);
  updateSortPlaceholder(e.clientX, e.clientY);
  e.preventDefault();
}

function onSortDragEnd(e) {
  if (!sortDrag) return;
  if (e && e.pointerId !== undefined && e.pointerId !== sortDrag.pointerId) return;
  if (!sortDrag.active) { cleanupSortDrag(); return; }

  const d = sortDrag;
  const cfg = d.cfg;
  const seq = [];
  for (const el of cfg.container.children) {
    if (el === d.ph) seq.push('__PH__');
    else if (el.matches && el.matches(cfg.selector) && el !== d.item) seq.push(cfg.getKey(el));
  }
  const p = seq.indexOf('__PH__');
  const anchor = p >= 0 ? (seq[p + 1] || null) : null;
  const key = cfg.getKey(d.item);
  const current = cfg.getOrder();
  const rest = current.filter(k => k !== key);
  let at = rest.length;
  if (anchor) {
    const i = rest.indexOf(anchor);
    if (i >= 0) at = i;
  }
  const next = [...rest.slice(0, at), key, ...rest.slice(at)];
  cleanupSortDrag();
  sortDragEndedAt = performance.now();
  cfg.onDrop(next);
}

function cleanupSortDrag() {
  if (!sortDrag) return;
  if (sortDrag.raf) cancelAnimationFrame(sortDrag.raf);
  if (sortDrag.ghost) sortDrag.ghost.remove();
  if (sortDrag.ph) sortDrag.ph.remove();
  if (sortDrag.item) sortDrag.item.classList.remove('so-dragging');
  document.documentElement.classList.remove('is-dragging');
  window.removeEventListener('pointermove', onSortDragMove);
  window.removeEventListener('pointerup', onSortDragEnd);
  window.removeEventListener('pointercancel', cancelSortDrag);
  window.removeEventListener('blur', cancelSortDrag);
  sortDrag = null;
}

function cancelSortDrag() {
  if (!sortDrag) return;
  cleanupSortDrag();
  sortDragEndedAt = performance.now();
}

function openSmSeries() {
  if (!state.chars.length) { toast('Primero importe su colección'); return; }
  const names = getSeriesOrder();
  if (!names.length) { toast('No hay series para ordenar'); return; }
  const blocks = buildSmSeriesBlocks(names);
  const note = blocks.length > 1
    ? 'El comando supera el límite de Discord y se dividió en bloques. Ejecútalos en el orden mostrado: cada bloque coloca sus series al frente, así que al terminar obtendrás exactamente el orden de la lista.'
    : 'Copia este comando y pégalo en Discord. Solo ordena las series; para aplicar también el orden de las fotos dentro de cada serie usa “Exportar harem completo”.';
  showCommandsModal(
    'Orden de series para Mudae',
    `<b>${names.length}</b> serie(s) · ${blocks.length} bloque(s)`,
    blocks,
    note,
    { type: 'series', label: 'Orden de series' }
  );
  if (blocks.length === 1) copyText(blocks[0]);
}

function exportFullSmFromSeries() {
  if (!state.chars.length) { toast('Primero importe su colección'); return; }
  applySeriesOrderToLibrary({ pushHistory: true, quiet: true });
  openSm('Orden del harem · por series');
}

function countBySeries() {
  const m = new Map();
  for (const c of state.chars) m.set(c.series, (m.get(c.series) || 0) + 1);
  return m;
}

function updateStats() {
  const n = state.chars.length;
  const bar = $('#statsBar');
  if (!n) {
    setVisible(bar, false);
    renderWarnings();
    return;
  }
  setVisible(bar, true);

  const seriesCount = new Set(state.chars.map(c => c.series)).size;
  $('#statCounts').innerHTML = `<b>${n}</b> personajes · <b>${seriesCount}</b> series`;

  const counts = countBySeries();
  const mism = (state.seriesMeta || []).filter(s => (counts.get(s.name) || 0) !== (Number(s.owned) || 0));
  const pill = $('#statValid');
  pill.textContent = mism.length ? mism.length + ' serie(s) con diferencia' : 'Conteo verificado';
  pill.className = 'pill ' + (mism.length ? 'bad' : 'ok');

  const withK = state.chars.filter(c => c.kakera !== null && c.kakera !== undefined && Number.isFinite(Number(c.kakera)));
  const totalK = withK.reduce((s, c) => s + Number(c.kakera), 0);
  const kEl = $('#statKakera');
  kEl.textContent = withK.length ? '' + fmtKakera(totalK) + ' ka total' : '';
  setVisible(kEl, withK.length > 0);

  const withKeys = state.chars.filter(c => (Number(c.keys) || 0) > 0);
  const totalKeys = withKeys.reduce((s, c) => s + (Number(c.keys) || 0), 0);
  const keyEl = $('#statKeys');
  keyEl.textContent = withKeys.length ? `${withKeys.length} con llaves (${totalKeys} total)` : '';
  setVisible(keyEl, withKeys.length > 0);

  const pinnedCount = state.chars.filter(c => c.pinned).length;
  const pinEl = $('#statPinned');
  if (pinEl) {
    pinEl.textContent = `${pinnedCount} fijado(s)`;
    setVisible(pinEl, pinnedCount > 0);
  }

  renderWarnings();
}

function renderWarnings() {
  const box = $('#warnBox');
  const items = [];
  const counts = countBySeries();
  for (const s of state.seriesMeta || []) {
    const got = counts.get(s.name) || 0;
    const want = Number(s.owned) || 0;
    if (got !== want) items.push(`«${s.name}»: el encabezado indica ${want} y se importaron ${got}.`);
  }
  for (const w of state.warnings || []) items.push(w);
  if (!items.length) {
    setVisible(box, false);
    box.innerHTML = '';
    return;
  }
  const ul = document.createElement('ul');
  for (const it of items) {
    const li = document.createElement('li');
    li.textContent = it;
    ul.append(li);
  }
  box.innerHTML = '<div>Avisos de importación:</div>';
  box.append(ul);
  setVisible(box, true);
}

function updateSelectionUI() {
  for (const el of $$('#grid .card')) el.classList.toggle('selected', selection.has(el.dataset.id));
  updateBatchBarUI();
  if (typeof window.__mudaeSelectionChanged === 'function') window.__mudaeSelectionChanged();
}

function updateBatchBarUI() {
  const bar = $('#batchBar');
  if (!bar) return;
  const count = selection.size;
  setVisible(bar, count > 0);
  if (count > 0) {
    $('#batchCount').textContent = count === 1 ? '1 seleccionado' : `${count} seleccionados`;
  }
}

function findCard(id) {
  for (const el of $('#grid').children) {
    if (el.classList.contains('card') && el.dataset.id === id) return el;
  }
  return null;
}

function fillSeriesSelect() {
  const sel = $('#seriesSelect');
  const names = getSeriesOrder();
  sel.innerHTML = '';
  sel.append(new Option('Todas (' + names.length + ')', ''));
  for (const name of names) sel.append(new Option(name, name));
  sel.value = state.settings.series || '';
}

// Color de texto legible sobre el acento elegido
function inkFor(hex) {
  const m = String(hex || '').replace('#', '');
  if (m.length !== 6) return '#101420';
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), bl = parseInt(m.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * bl) > 150 ? '#101420' : '#ffffff';
}

function applyVisualTheme() {
  const root = document.documentElement;
  const light = !!state.settings.themeLight;
  const perf = !!state.settings.performanceMode;
  const preset = state.settings.preset || 'indigo';
  const radius = (state.settings.cardRadius !== undefined ? state.settings.cardRadius : 8) + 'px';
  const aspect = state.settings.cardAspect || '3/4';

  // Tema (oscuro/claro) y paleta: las variables viven en seiri.css
  root.dataset.theme = light ? 'light' : 'dark';
  if (preset === 'indigo') root.removeAttribute('data-preset'); else root.dataset.preset = preset;

  // Acento personalizado (sustituye al del tema)
  const custom = /^#[0-9a-f]{6}$/i.test(state.settings.customAccent || '') ? state.settings.customAccent : '';
  for (const k of ['--accent', '--accent-ink', '--accent-soft', '--accent-glow']) root.style.removeProperty(k);
  if (custom) {
    root.style.setProperty('--accent', custom);
    root.style.setProperty('--accent-ink', inkFor(custom));
    root.style.setProperty('--accent-soft', hexToRgba(custom, 0.16));
    root.style.setProperty('--accent-glow', hexToRgba(custom, 0.55));
  }
  root.style.setProperty('--radius', radius);
  root.style.setProperty('--aspect', aspect);

  document.body.classList.remove('theme-light'); // el tema claro se aplica con data-theme (seiri.css)
  document.body.classList.toggle('compact', !!state.settings.compactMode);
  document.body.classList.toggle('perf-mode', perf);
  document.body.classList.toggle('bg-glow', !perf && state.settings.bgGlow !== false);
  document.body.classList.toggle('card-glow', !perf && state.settings.cardGlow !== false);
  document.body.classList.toggle('neon-borders', !perf && state.settings.neonBorders !== false);
  document.body.classList.toggle('holo-sheen', !perf && state.settings.holoSheen !== false);
  const metaScheme = document.querySelector('meta[name="color-scheme"]');
  if (metaScheme) metaScheme.setAttribute('content', light ? 'light' : 'dark');
}

function applySettings() {
  document.documentElement.style.setProperty('--card-w', state.settings.cardSize + 'px');
  const cardSize = $('#cardSize');
  if (cardSize) cardSize.value = state.settings.cardSize;
  const cardSizeOut = $('#cardSizeOut');
  if (cardSizeOut) cardSizeOut.textContent = state.settings.cardSize + 'px';
  const showNotesEl = $('#optShowNotes');
  if (showNotesEl) showNotesEl.checked = !!state.settings.showNotesOnCards;
  const pageSel = $('#pageSizeSelect');
  if (pageSel) pageSel.value = String(state.settings.pageSize || 0);
  const optGroup = $('#optGroup');
  if (optGroup) optGroup.checked = !!state.settings.groupBySeries;
  const optNote = $('#optNote');
  if (optNote) optNote.checked = !!state.settings.onlyNote;
  const optGifs = $('#optGifs');
  if (optGifs) optGifs.checked = !!state.settings.pauseGifs;
  const searchEl = $('#search');
  if (searchEl) searchEl.value = state.settings.search || '';
  const keyFilterEl = $('#keyFilter');
  if (keyFilterEl) keyFilterEl.value = state.settings.keyFilter || 'all';
  const noteFilterEl = $('#noteFilter');
  if (noteFilterEl) noteFilterEl.value = state.settings.noteFilter || '';
  const tagFilterEl = $('#tagFilter');
  if (tagFilterEl) tagFilterEl.value = state.settings.tagFilter || '';
  const nitroEl = $('#optNitro');
  if (nitroEl) nitroEl.checked = !!state.settings.nitro;
  const autoSmEl = $('#optAutoSmOnSort');
  if (autoSmEl) autoSmEl.checked = state.settings.autoSmOnSort !== false;
  const seriesPinnedEl = $('#optSeriesPinned');
  if (seriesPinnedEl) seriesPinnedEl.checked = state.settings.seriesRespectPinned !== false;
  const seriesAutoEl = $('#optSeriesAutoApply');
  if (seriesAutoEl) seriesAutoEl.checked = !!state.settings.seriesAutoApply;
  $('#grid').classList.toggle('grouped', !!state.settings.groupBySeries);
  applyVisualTheme();
  updateTagFilter();
  updateTagFilterList();
  renderSeriesPresetSelect();
  updateBackupCount();
  updateHistoryBadge();
  updateSavedFilterCount();
  updateAutoFileUI();
}

function selectRange(fromId, toId) {
  const ids = visibleIds();
  const a = ids.indexOf(fromId);
  const b = ids.indexOf(toId);
  if (a < 0 || b < 0) { selection = new Set([toId]); return; }
  const [s, e] = a < b ? [a, b] : [b, a];
  selection = new Set(ids.slice(s, e + 1));
}

function moveBlock(delta) {
  const ids = state.order.filter(id => selection.has(id));
  if (!ids.length) return;
  pushUndo();
  const set = new Set(ids);
  const firstIdx = Math.min(...ids.map(id => state.order.indexOf(id)));
  let before = 0;
  for (let i = 0; i < firstIdx; i++) if (!set.has(state.order[i])) before++;
  const rest = state.order.filter(id => !set.has(id));
  const at = Math.max(0, Math.min(rest.length, before + delta));
  state.order = [...rest.slice(0, at), ...ids, ...rest.slice(at)];
  save();
  render();
  findCard(ids[0])?.focus();
}

function moveToEdge(toEnd) {
  const ids = state.order.filter(id => selection.has(id));
  if (!ids.length) return;
  pushUndo();
  const set = new Set(ids);
  const rest = state.order.filter(id => !set.has(id));
  state.order = toEnd ? [...rest, ...ids] : [...ids, ...rest];
  save();
  render();
  toast(toEnd ? 'Movido al final de la colección' : 'Movido al inicio (#1)');
}

function moveToExactPosition(pos1Based) {
  const ids = state.order.filter(id => selection.has(id));
  if (!ids.length) return;
  pushUndo();
  const set = new Set(ids);
  const rest = state.order.filter(id => !set.has(id));
  const targetIdx = Math.max(0, Math.min(rest.length, (Number(pos1Based) || 1) - 1));
  state.order = [...rest.slice(0, targetIdx), ...ids, ...rest.slice(targetIdx)];
  save();
  render();
  toast(`Seleccionados movidos a la posición #${targetIdx + 1}`);
}

function onPointerDown(e) {
  // v4: capa móvil puede interceptar el toque (p. ej. abrir detalle) antes del arrastre.
  if (typeof window.__mudaePointerDownHook === 'function' && window.__mudaePointerDownHook(e)) return;
  if (e.button !== 0) return;
  const gridEl = $('#grid');
  const card = e.target.closest ? e.target.closest('.card') : null;

  if (!card || !gridEl.contains(card)) {
    if (selection.size) { selection.clear(); updateSelectionUI(); }
    return;
  }
  if (!byId.has(card.dataset.id)) return;

  const id = card.dataset.id;
  // Mayús / Ctrl: selección múltiple. El clic simple lo resuelve el manejador 'click' (abre la ficha o marca si ya hay selección).
  if (e.shiftKey && lastClicked) { selectRange(lastClicked, id); lastClicked = id; updateSelectionUI(); }
  else if (e.ctrlKey || e.metaKey) {
    if (selection.has(id)) selection.delete(id); else selection.add(id);
    lastClicked = id;
    updateSelectionUI();
  }

  // Con la vista agrupada no se reordena arrastrando (el orden de las series se cambia en la pestaña Series)
  if (state.settings.groupBySeries) return;
  // Con el dedo no se arrastra para reordenar (choca con el desplazamiento): se usa la barra de selección
  if (e.pointerType === 'touch') return;

    drag = { id, startX: e.clientX, startY: e.clientY, active: false, ids: [], pointerId: e.pointerId };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', cancelDrag);
  window.addEventListener('blur', cancelDrag);
  e.preventDefault();
}

function startDrag(e) {
  const card = findCard(drag.id);
  if (!card) { endDrag(); return; }

  const vis = new Set(visibleIds());
  let ids = state.order.filter(id => selection.has(id) && vis.has(id));
  if (!ids.includes(drag.id)) ids = [drag.id];

  const rect = card.getBoundingClientRect();
  drag.active = true;
  drag.ids = ids;
  drag.card = card;
  drag.offX = drag.startX - rect.left;
  drag.offY = drag.startY - rect.top;
  drag.lastX = drag.startX;
  drag.lastY = drag.startY;

  const ghost = card.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.classList.remove('selected');
  ghost.style.width = rect.width + 'px';
  ghost.style.height = rect.height + 'px';
  ghost.style.left = rect.left + 'px';
  ghost.style.top = rect.top + 'px';
  if (ids.length > 1) {
    const badge = document.createElement('div');
    badge.className = 'drag-count';
    badge.textContent = '×' + ids.length;
    ghost.append(badge);
  }
  document.body.append(ghost);
  drag.ghost = ghost;

  const ph = document.createElement('div');
  ph.className = 'placeholder';
  ph.style.width = rect.width + 'px';
  ph.style.height = rect.height + 'px';
  drag.placeholder = ph;
  card.parentNode.insertBefore(ph, card);
  for (const id of ids) findCard(id)?.classList.add('drag-hidden');

  document.documentElement.classList.add('is-dragging');
  moveGhost(e.clientX, e.clientY);
  updatePlaceholder(e.clientX, e.clientY);
  drag.raf = requestAnimationFrame(autoScroll);
}

function moveGhost(x, y) {
  if (!drag || !drag.ghost) return;
  drag.ghost.style.left = (x - drag.offX) + 'px';
  drag.ghost.style.top = (y - drag.offY) + 'px';
}

function updatePlaceholder(x, y) {
  const gridEl = $('#grid');
  const ph = drag.placeholder;
  const cards = [...gridEl.children].filter(el =>
    el.classList.contains('card') && !el.classList.contains('drag-hidden'));

  if (!cards.length) {
    if (ph.parentNode !== gridEl) gridEl.append(ph);
    return;
  }

  let best = null;
  let bestD = Infinity;
  for (const el of cards) {
    const r = el.getBoundingClientRect();
    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = { el, r }; }
  }
  if (!best) return;

  const { el, r } = best;
  const after = (y > r.bottom - r.height * 0.3) ||
    (y >= r.top && y <= r.bottom && x > r.left + r.width / 2);
  const ref = after ? el.nextSibling : el;
  if (ref === ph) return;
  gridEl.insertBefore(ph, ref);
}

function autoScroll() {
  if (!drag || !drag.active) return;
  const y = drag.lastY;
  const m = 90;
  let v = 0;
  if (y < m) v = -Math.round((m - y) / 4);
  else if (y > innerHeight - m) v = Math.round((y - (innerHeight - m)) / 4);
  if (v) window.scrollBy(0, Math.max(-26, Math.min(26, v)));
  drag.raf = requestAnimationFrame(autoScroll);
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (!drag.active) {
    // v4: en modo reordenar (móvil) el arrastre empieza de inmediato (umbral 0).
    const threshold = (typeof window.__mudaeDragThreshold === 'number') ? window.__mudaeDragThreshold : 6;
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < threshold) return;
    startDrag(e);
  }
  if (!drag.active) return;
  drag.lastX = e.clientX;
  drag.lastY = e.clientY;
  moveGhost(e.clientX, e.clientY);
  updatePlaceholder(e.clientX, e.clientY);
  e.preventDefault();
}

function onPointerUp(e) {
  if (!drag) return;
  if (e && e.pointerId !== undefined && e.pointerId !== drag.pointerId) return;
  if (!drag.active) { endDrag(); return; }
  lastDragEnd = Date.now();

  pushUndo();

  const seq = [];
  for (const el of $('#grid').children) {
    if (el === drag.placeholder) seq.push('__PH__');
    else if (el.classList.contains('card') && !el.classList.contains('drag-hidden')) seq.push(el.dataset.id);
  }
  const p = seq.indexOf('__PH__');
  const anchor = p >= 0 ? (seq[p + 1] || null) : null;
  const set = new Set(drag.ids);
  const rest = state.order.filter(id => !set.has(id));
  let at = rest.length;
  if (anchor) {
    const i = rest.indexOf(anchor);
    if (i >= 0) at = i;
  }
  state.order = [...rest.slice(0, at), ...drag.ids, ...rest.slice(at)];
  endDrag();
  save();
  render();
  toast('Orden actualizado');
}

function endDrag() {
  if (!drag) return;
  if (drag.raf) cancelAnimationFrame(drag.raf);
  if (drag.ghost) drag.ghost.remove();
  if (drag.placeholder) drag.placeholder.remove();
  for (const id of drag.ids) findCard(id)?.classList.remove('drag-hidden');
  document.documentElement.classList.remove('is-dragging');
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', cancelDrag);
  window.removeEventListener('blur', cancelDrag);
  drag = null;
}

function cancelDrag() {
  if (!drag) return;
  endDrag();
  render();
}

function onGridKeyDown(e) {
  const card = e.target.closest ? e.target.closest('.card') : null;
  if (!card) return;
  const id = card.dataset.id;

  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (!selection.has(id)) selection = new Set([id]);
    else if (selection.size === 1) selection.delete(id);
    else selection.add(id);
    lastClicked = id;
    updateSelectionUI();
    return;
  }
  if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    openEdit(id);
    return;
  }
  if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    togglePin(id);
    return;
  }
  if (e.key === 'Escape') {
    selection.clear();
    updateSelectionUI();
    return;
  }
  if (!e.altKey) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); ensureSelected(id); moveBlock(-1); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); ensureSelected(id); moveBlock(1); }
  else if (e.key === 'Home') { e.preventDefault(); ensureSelected(id); moveToEdge(false); }
  else if (e.key === 'End') { e.preventDefault(); ensureSelected(id); moveToEdge(true); }
}

function ensureSelected(id) {
  if (!selection.has(id)) { selection = new Set([id]); updateSelectionUI(); }
  lastClicked = id;
}

function updateExportCommandUI() {
  const code = $('#tutorialCmd');
  if (code) code.textContent = exportCommand();
}

// Diagnóstico en vivo: qué se entiende de lo pegado y qué limpieza se aplicó
function updateImportDiag() {
  const box = $('#importDiag');
  const ta = $('#importText');
  if (!box || !ta) return;
  const raw = ta.value;
  if (!raw.trim()) { box.hidden = true; box.innerHTML = ''; return; }
  let p;
  try { p = parseExport(raw); } catch (e) { box.hidden = false; box.innerHTML = '<span class="bad">No se pudo leer el texto.</span>'; return; }
  const cl = p.cleaned || {};
  const clean = [];
  if (cl.timestamps) clean.push(cl.timestamps + ' hora(s)');
  if (cl.headers) clean.push(cl.headers + ' cabecera(s) de usuario');
  if (cl.links) clean.push(cl.links + ' enlace(s) entre &lt; &gt;');
  if (cl.invisible) clean.push(cl.invisible + ' carácter(es) invisible(s)');
  if (cl.lists) clean.push(cl.lists + ' numeración(es) de lista');
  if (cl.escapes) clean.push(cl.escapes + ' escape(s) de Markdown');
  const nSeries = new Set(p.chars.map(c => c.series)).size;
  const parts = [];
  parts.push(p.chars.length
    ? '<span class="ok">✓ ' + fmtKakera(p.chars.length) + ' personajes en ' + fmtKakera(nSeries) + ' series</span>'
    : '<span class="bad">No se reconoce ningún personaje todavía</span>');
  if (clean.length) parts.push('<span class="muted">Limpieza automática de Discord: ' + clean.join(', ') + '</span>');
  const noSeries = p.chars.filter(c => c.series === 'Sin serie').length;
  if (noSeries) parts.push('<span class="warn">' + noSeries + ' personaje(s) sin serie: el texto no empieza en un encabezado de serie (se guardarán como «Sin serie»).</span>');
  if (p.skipped.length) {
    parts.push('<span class="warn">' + p.skipped.length + ' línea(s) no reconocida(s)</span>' +
      '<details><summary>Ver líneas ignoradas</summary><pre>' +
      escapeHtml(p.skipped.slice(0, 12).map(s => 'línea ' + s.line + ': ' + s.text).join('\n')) +
      (p.skipped.length > 12 ? '\n… y ' + (p.skipped.length - 12) + ' más' : '') + '</pre></details>');
  }
  box.hidden = false;
  box.innerHTML = parts.join('');
}

function openImportModal() {
  updateExportCommandUI();
  $('#importMsg').textContent = '';
  resetImportModalView();
  openModalById('importModal');
  setTimeout(() => $('#importText').focus(), 40);
}

function closeImportModal() {
  closeModalById('importModal');
}

function commitImport(chars, seriesMeta, warnings, extra = {}) {
  const seen = new Set();
  for (const c of chars) {
    let id = c.id;
    let n = 2;
    while (seen.has(id)) id = c.id + '#' + n++;
    c.id = id;
    seen.add(id);
  }
  const kept = state.order.filter(id => seen.has(id));
  const keptSet = new Set(kept);
  const added = chars.map(c => c.id).filter(id => !keptSet.has(id));

  const prev = new Map(state.chars.map(c => [c.id, c]));
  for (const c of chars) {
    const old = prev.get(c.id);
    if (!old) continue;
    if (old.noteCustom && !c.note) { c.note = old.note || ''; c.noteCustom = true; }
    if (old.colorCustom && !c.embedColor && old.embedColor) { c.embedColor = old.embedColor; c.colorCustom = true; }
    if (old.pinned) c.pinned = true;
    if (Array.isArray(old.tags) && old.tags.length) c.tags = old.tags.slice();
    if (!c.mudaeId && old.mudaeId) c.mudaeId = old.mudaeId;
  }

  // Resumen de cambios (se muestra al terminar de importar)
  const summary = { total: chars.length, added: [], updated: [], unchanged: 0, removed: [] };
  for (const c of chars) {
    const old = prev.get(c.id);
    if (!old) { summary.added.push(c.name); continue; }
    const changed =
      old.name !== c.name ||
      old.series !== c.series ||
      (old.kakera ?? null) !== (c.kakera ?? null) ||
      (old.keys || 0) !== (c.keys || 0) ||
      (old.embedColor || '') !== (c.embedColor || '') ||
      (old.image || '') !== (c.image || '') ||
      (old.seriesTotal ?? null) !== (c.seriesTotal ?? null) ||
      (old.note || '') !== (c.note || '');
    if (changed) summary.updated.push(c.name); else summary.unchanged++;
  }
  const newIds = new Set(chars.map(c => c.id));
  for (const c of state.chars) if (!newIds.has(c.id)) summary.removed.push(c.name);

  createBackupSafe('antes de importar');

  const prevSeriesOrder = state.seriesOrder;
  state.chars = chars;
  state.order = [...kept, ...added];
  state.origOrder = chars.map(c => c.id);
  state.seriesOrder = normalizeSeriesOrder(prevSeriesOrder);
  state.origSeriesOrder = seriesMeta.map(s => s.name);
  state.seriesPinned = normalizeSeriesPinned(state.seriesPinned);
  state.seriesMeta = seriesMeta;
  state.warnings = warnings;
  state.importedAt = Date.now();
  state.importHistory = [{
    at: Date.now(),
    chars: chars.length,
    series: seriesMeta.length,
    ka: chars.reduce((s, c) => s + (Number(c.kakera) || 0), 0),
    keys: chars.reduce((s, c) => s + (Number(c.keys) || 0), 0),
    skipped: Number(extra.skipped) || 0,
    warnings: warnings.slice(0, 10)
  }, ...state.importHistory].slice(0, 30);
  if (state.settings.series && !chars.some(c => c.series === state.settings.series)) state.settings.series = '';

  undoStack = [];
  redoStack = [];
  updateUndoButtons();

  rebuildIndex();
  save();
  fillSeriesSelect();
  updateTagFilter();
  applySettings();
  render();
  updateBackupCount();
  return summary;
}

function doImport() {
  const raw = $('#importText').value;
  const msg = $('#importMsg');
  const setMsg = (text, kind) => { msg.textContent = text; msg.className = 'msg ' + (kind || ''); };

  if (!raw.trim()) { setMsg('Pegue primero el texto exportado desde Discord.', 'err'); return; }

  const { chars, series, skipped } = parseExport(raw);
  if (!chars.length) {
    setMsg('No se reconoció ningún personaje. Verifique haber copiado desde la primera serie hasta el último enlace.', 'err');
    return;
  }

  const warnings = [];
  if (skipped.length) {
    warnings.push(skipped.length + ' línea(s) omitidas (ej. línea ' + skipped[0].line + ').');
  }

  const summary = commitImport(chars, series, warnings, { skipped: skipped.length });
  toast('Colección actualizada: ' + chars.length + ' personajes');
  renderImportSummary(summary);
  failed.clear();
  startCaching();
}

/* ---------- resumen tras importar ---------- */
function resetImportModalView() {
  const form = $('#importForm');
  const sum = $('#importSummary');
  if (form) setVisible(form, true);
  if (sum) { setVisible(sum, false); sum.innerHTML = ''; }
}

function renderImportSummary(s) {
  const form = $('#importForm');
  const box = $('#importSummary');
  if (!box) return;
  if (form) setVisible(form, false);
  setVisible(box, true);

  const card = (label, value, sub) =>
    `<div class="import-stat"><span>${label}</span><b>${value}</b><small>${sub}</small></div>`;
  const list = (arr, max = 80) =>
    arr.slice(0, max).map(n => `<span>${escapeHtml(n)}</span>`).join('') +
    (arr.length > max ? `<span class="more">+${arr.length - max} más…</span>` : '');

  const clean = !s.added.length && !s.updated.length && !s.removed.length;
  box.innerHTML = `
    <div class="import-summary-head">
      <h3>${clean ? 'Todo estaba al día' : 'Colección actualizada'}</h3>
      <p class="hint">Se conservaron tus notas, colores, etiquetas y fijados.</p>
    </div>
    <div class="import-stats">
      ${card('Nuevos', s.added.length, 'no estaban antes')}
      ${card('Actualizados', s.updated.length, 'cambiaron datos')}
      ${card('Sin cambios', s.unchanged, 'idénticos')}
      ${card('Desaparecidos', s.removed.length, 'ya no aparecen')}
    </div>
    <p class="hint" style="margin-top:4px">Total en la colección: <b>${s.total}</b> personajes.</p>
    ${s.added.length ? `<details class="import-detail"><summary>Nuevos (${s.added.length})</summary><div class="import-list">${list(s.added)}</div></details>` : ''}
    ${s.updated.length ? `<details class="import-detail"><summary>Actualizados (${s.updated.length})</summary><div class="import-list">${list(s.updated)}</div></details>` : ''}
    ${s.removed.length ? `<details class="import-detail"><summary>Desaparecidos (${s.removed.length})</summary><div class="import-list">${list(s.removed)}</div></details>` : ''}
    <div class="row" style="justify-content:flex-end;margin-top:14px">
      <button type="button" class="btn" id="btnImportAgain">Importar de nuevo</button>
      <button type="button" class="btn primary" id="btnImportDone">Ver colección</button>
    </div>`;

  const again = $('#btnImportAgain');
  if (again) again.addEventListener('click', () => { resetImportModalView(); setTimeout(() => $('#importText').focus(), 40); });
  const done = $('#btnImportDone');
  if (done) done.addEventListener('click', closeImportModal);
}

function exportProject() {
  if (!state.chars.length) { toast('No hay ninguna colección cargada para guardar'); return; }
  const data = projectData();
  download('mudae-coleccion-' + dateStamp() + '.json', JSON.stringify(data, null, 2));
  toast('Proyecto guardado');
}

// Abre el selector nativo (escritorio) o el <input> oculto (respaldo)
async function pickProjectFile() {
  if (isDesktop && window.mudaeDesktop.openFiles) {
    const r = await window.mudaeDesktop.openFiles({ title: 'Cargar proyecto', filters: [{ name: 'Proyecto JSON', extensions: ['json'] }] });
    if (r && r.ok && r.files[0]) loadProjectText(r.files[0].text);
    return;
  }
  $('#projFile').click();
}

function onProjectFile(e) {
  const input = e.target;
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => loadProjectText(String(reader.result));
  reader.readAsText(file);
  input.value = '';
}

function loadProjectText(text) {
  {
    {
    try {
      const obj = JSON.parse(text);
      if (!obj || !Array.isArray(obj.chars) || !obj.chars.length) throw new Error('formato');
      if (state.chars.length) createBackupSafe('antes de cargar proyecto');
      setProject(obj);
      save();
      fillSeriesSelect();
      updateTagFilter();
      applySettings();
      render();
      toast('Proyecto cargado correctamente');
      failed.clear();
      startCaching();
      updateBackupCount();
    } catch (err) {
      toast('El archivo seleccionado no es válido');
    }
    }
  }
}

function sortBy(mode) {
  if (!state.order.length) { toast('Primero importe su colección'); return; }
  pushUndo();

  const pos = new Map(state.order.map((id, i) => [id, i]));
  const unpinned = state.order.filter(id => !byId.get(id)?.pinned);

  if (mode === 'az') {
    unpinned.sort((a, b) => byId.get(a).name.localeCompare(byId.get(b).name, 'es', { sensitivity: 'base' }));
  } else if (mode === 'series') {
    unpinned.sort((a, b) => byId.get(a).series.localeCompare(byId.get(b).series, 'es', { sensitivity: 'base' }) ||
      (pos.get(a) - pos.get(b)));
  } else if (mode === 'kakera') {
    unpinned.sort((a, b) => {
      const ca = byId.get(a), cb = byId.get(b);
      const va = ca && ca.kakera !== null && ca.kakera !== undefined ? Number(ca.kakera) : -1;
      const vb = cb && cb.kakera !== null && cb.kakera !== undefined ? Number(cb.kakera) : -1;
      return vb - va || (pos.get(a) - pos.get(b));
    });
  } else if (mode === 'spheres') {
    unpinned.sort((a, b) => (Number(byId.get(b)?.spheres) || 0) - (Number(byId.get(a)?.spheres) || 0) || (pos.get(a) - pos.get(b)));
  } else if (mode === 'rank') {
    // Ranking de claim: el mejor (número más bajo) primero; sin ranking al final
    unpinned.sort((a, b) => {
      const ra = Number(byId.get(a)?.rank) || Infinity;
      const rb = Number(byId.get(b)?.rank) || Infinity;
      return (ra === rb ? 0 : ra < rb ? -1 : 1) || (pos.get(a) - pos.get(b));
    });
  } else if (mode === 'keys') {
    unpinned.sort((a, b) => {
      const ka = Number(byId.get(a)?.keys) || 0;
      const kb = Number(byId.get(b)?.keys) || 0;
      return kb - ka || (pos.get(a) - pos.get(b));
    });
  } else if (mode === 'note') {
    unpinned.sort((a, b) => {
      const na = (byId.get(a)?.note || '').trim();
      const nb = (byId.get(b)?.note || '').trim();
      if (na && !nb) return -1;
      if (!na && nb) return 1;
      return na.localeCompare(nb, 'es', { numeric: true, sensitivity: 'base' }) || (pos.get(a) - pos.get(b));
    });
  } else if (mode === 'reverse') {
    unpinned.reverse();
  } else {
    return;
  }

  let uIdx = 0;
  state.order = state.order.map(id => byId.get(id)?.pinned ? id : unpinned[uIdx++]);

  save();
  render();

  const pinnedTotal = state.chars.filter(c => c.pinned).length;
  const pinSuffix = pinnedTotal > 0 ? ` (${pinnedTotal} fijados intactos)` : '';

  const label = ({
    az: 'Ordenado alfabéticamente (A-Z)',
    series: 'Ordenado por Serie',
    kakera: 'Ordenado por Kakera',
    keys: 'Ordenado por Llaves',
    note: 'Ordenado por Notas',
    reverse: 'Orden invertido',
  }[mode] || 'Orden actualizado') + pinSuffix;

  if ($('#optAutoSmOnSort').checked) {
    closeDrawer();
    openSm('Orden del harem · ' + label);
    if (smBlocks.length === 1) copyText(smBlocks[0]);
  } else {
    toast(label);
  }
}

function pinTopN(n) {
  if (!state.order.length) return;
  pushUndo();
  state.order.forEach((id, idx) => {
    const c = byId.get(id);
    if (c && idx < n) c.pinned = true;
  });
  save();
  render();
  toast(`Se fijaron los primeros ${n} personajes`);
}

function unpinAll() {
  if (!state.chars.some(c => c.pinned)) return;
  pushUndo();
  for (const c of state.chars) c.pinned = false;
  save();
  render();
  toast('Se quitaron todos los pines');
}

function recordCommandHistory(type, blocks, label) {
  if (!Array.isArray(blocks) || !blocks.length) return;
  const entry = {
    id: 'cmd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    at: Date.now(),
    type: type || 'general',
    label: label || '',
    blocks: blocks.slice(0, 60),
    chars: blocks.reduce((s, b) => s + b.length, 0)
  };
  state.commandHistory = [entry, ...state.commandHistory].slice(0, 40);
  saveSoon();
  saveHistory();
  updateHistoryBadge();
}

function updateHistoryBadge() {
  const el = $('#cmdHistoryCount');
  if (el) el.textContent = state.commandHistory.length ? `(${state.commandHistory.length})` : '';
}

function validateCommandNames(names) {
  const warnings = [];
  const clean = [];
  const seen = new Map();
  let illegal = 0;
  for (const raw of names) {
    const name = cleanCharName(raw);
    if (!name) continue;
    if (/\$|\n|\r/.test(name)) { illegal++; continue; }
    const k = norm(name);
    seen.set(k, (seen.get(k) || 0) + 1);
    clean.push(name);
  }
  if (illegal) warnings.push(`${illegal} nombre(s) omitido(s): contienen "$" o saltos de línea y romperían el comando.`);
  const dup = [...seen.entries()].filter(([, n]) => n > 1);
  if (dup.length) warnings.push(`${dup.length} nombre(s) duplicado(s) en el alcance; Mudae podría reordenar solo uno.`);
  if (!clean.length) warnings.push('No hay nombres válidos para generar el comando.');

  for (let i = 0; i < clean.length; i += 200) {
    const cmd = '$sm ' + clean.slice(i, i + 200).join(' $ ');
    if (cmd.length > 1900) {
      warnings.push('Un bloque supera ~1900 caracteres; se dividirá automáticamente al generar.');
      break;
    }
  }
  return { names: clean, warnings };
}

function showCommandsModal(titleHtml, summaryHtml, blocks, noteHtml = '', opts = {}) {
  smBlocks = blocks;
  cmdContext = opts.context || null;
  if (opts.type) recordCommandHistory(opts.type, blocks, opts.label || '');
  $('#smTitle').innerHTML = titleHtml;
  const body = $('#smBody');
  body.innerHTML = '';

  const sum = document.createElement('div');
  sum.className = 'sm-summary';
  sum.innerHTML = summaryHtml;
  body.append(sum);

  if (Array.isArray(opts.warnings) && opts.warnings.length) {
    const warn = document.createElement('div');
    warn.className = 'cmd-warnings';
    warn.innerHTML = '<b>Validación:</b><ul>' + opts.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('') + '</ul>';
    body.append(warn);
  }

  if (noteHtml) {
    const note = document.createElement('div');
    note.className = 'sm-note';
    note.innerHTML = noteHtml;
    body.append(note);
  }

  blocks.forEach((cmd, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'sm-item';
    const head = document.createElement('div');
    head.className = 'sm-item-head';
    const label = document.createElement('span');
    label.textContent = 'Bloque ' + (i + 1) + ' · ' + cmd.length + ' caracteres';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn small';
    btn.textContent = 'Copiar';
    btn.onclick = () => copyText(cmd);
    head.append(label, btn);

    const block = document.createElement('pre');
    block.className = 'sm-block';
    block.textContent = cmd;
    wrap.append(head, block);
    body.append(wrap);
  });

  const undoSm = $('#btnUndoDivorceSm');
  if (undoSm) undoSm.hidden = !(opts.context && opts.context.kind === 'divorce' && divorceUndo);

  openModalById('smModal');
  updateHistoryBadge();
}

function commandNamesForScope(scope) {
  if (scope === 'visible') {
    return visibleIds().map(id => byId.get(id)).filter(Boolean).map(c => c.name);
  }
  if (scope === 'selection') {
    return state.order.filter(id => selection.has(id)).map(id => byId.get(id)).filter(Boolean).map(c => c.name);
  }
  return state.order.map(id => byId.get(id)).filter(Boolean).map(c => c.name);
}

function scopeLabel(scope) {
  return ({ all: 'toda la colección', visible: 'solo visibles', selection: 'selección' }[scope] || 'toda la colección');
}

function openSm(customTitle, scopeOverride) {
  if (!state.chars.length) { toast('Primero importe su colección'); return; }
  const scope = scopeOverride || (selection.size ? 'selection' : 'all');
  const rawNames = commandNamesForScope(scope);
  if (!rawNames.length) { toast('El alcance seleccionado no tiene personajes'); return; }
  const { names, warnings } = validateCommandNames(rawNames);
  const blocks = buildSmBlocks(names, cmdLimit());
  const extraNote = blocks.length > 1
    ? 'El orden es largo y se dividió en bloques encadenados. Pega cada bloque en Discord, en el orden en que aparecen.'
    : 'Copie y pegue este comando en Discord para aplicar el nuevo orden a su colección.';

  showCommandsModal(
    customTitle || 'Exportar harem · comandos de orden',
    `<b>${names.length}</b> personajes · ${blocks.length} bloque(s) · Alcance: <b>${scopeLabel(scope)}</b>`,
    blocks,
    extraNote,
    { type: 'sm', label: 'Orden del harem · ' + scopeLabel(scope), warnings, context: { kind: 'sm', title: customTitle || '', scope } }
  );
  const sc = $('#cmdScope');
  if (sc) sc.value = scope;
  updateCommandScopeOptions();
}

function updateCommandScopeOptions() {
  const sc = $('#cmdScope');
  if (!sc) return;
  const selOpt = sc.querySelector('option[value="selection"]');
  if (selOpt) selOpt.textContent = `Selección (${selection.size})`;
  const visOpt = sc.querySelector('option[value="visible"]');
  if (visOpt) visOpt.textContent = `Visibles (${visibleIds().length})`;
}

function regenerateSm() {
  if (!cmdContext) return;
  if (cmdContext.kind === 'sm') {
    const scope = $('#cmdScope') ? $('#cmdScope').value : 'all';
    openSm(cmdContext.title || undefined, scope);
  }
}

function closeSm() {
  closeModalById('smModal');
}

function getPendingChanges() {
  const noteChanges = [];
  const colorChanges = [];

  for (const c of state.chars) {
    const curNote = cleanNoteText(c.note || '');
    const origNote = cleanNoteText(c.origNote || '');
    if (c.noteCustom || curNote !== origNote) {
      noteChanges.push(c);
    }
    const curCol = (c.embedColor || '').toUpperCase();
    const origCol = (c.origColor || '').toUpperCase();
    if ((c.colorCustom || curCol !== origCol) && curCol) {
      colorChanges.push(c);
    }
  }

  const orderChanged = state.origOrder.length === state.order.length &&
    state.order.some((id, idx) => state.origOrder[idx] !== id);

  return { noteChanges, colorChanges, orderChanged };
}

function updatePendingBadge() {
  const badge = $('#pendingBadge');
  if (!badge) return;
  const { noteChanges, colorChanges, orderChanged } = getPendingChanges();
  const total = noteChanges.length + colorChanges.length + (orderChanged ? 1 : 0);
  badge.textContent = String(total);
  setVisible(badge, total > 0);
}

function openPendingCenter() {
  if (!state.chars.length) { toast('Primero importe su colección'); return; }
  const { noteChanges, colorChanges, orderChanged } = getPendingChanges();
  const blocks = [];

  const notesMap = new Map();
  for (const c of noteChanges) {
    const n = cleanNoteText(c.note || '');
    if (!notesMap.has(n)) notesMap.set(n, []);
    notesMap.get(n).push(cleanCharName(c.name));
  }
  for (const [noteText, names] of notesMap) {
    blocks.push(`$note ${names.join(' $ ')} $ ${noteText}`.trim());
  }

  const colorMap = new Map();
  for (const c of colorChanges) {
    const col = c.embedColor.toUpperCase();
    if (!colorMap.has(col)) colorMap.set(col, []);
    colorMap.get(col).push(cleanCharName(c.name));
  }
  for (const [hex, names] of colorMap) {
    blocks.push(`$ec ${names.join(' $ ')} $ ${hex}`);
  }

  if (orderChanged) {
    const sm = buildSmBlocks(state.order.map(id => byId.get(id)?.name).filter(Boolean), cmdLimit());
    blocks.push(...sm);
  }

  if (!blocks.length) {
    toast('No hay cambios pendientes de exportar en esta sesión');
    return;
  }

  showCommandsModal(
    'Centro de Comandos Pendientes',
    `<b>${noteChanges.length}</b> nota(s) modificada(s) · <b>${colorChanges.length}</b> color(es) HEX · Orden modificado: <b>${orderChanged ? 'Sí' : 'No'}</b>`,
    blocks,
    'Aquí se agrupan todas las notas, colores y cambios de orden realizados para que los pegues directamente en Discord.',
    { type: 'pending', label: 'Cambios pendientes' }
  );
}

function openBatchModal() {
  if (!selection.size) { toast('Seleccione primero uno o más personajes'); return; }
  $('#batchModalSubtitle').innerHTML = `Aplicando acciones en lote sobre <b>${selection.size}</b> personaje(s) seleccionado(s).`;
  $('#batchSaleAddInput').value = state.settings.saleAddValue || 100;
  openModalById('batchModal');
}

function closeBatchModal() {
  closeModalById('batchModal');
}

function applyBatchCommonNote() {
  const selectedChars = state.order.filter(id => selection.has(id)).map(id => byId.get(id)).filter(Boolean);
  if (!selectedChars.length) return;
  const note = cleanNoteText($('#batchNoteInput').value);
  pushUndo();
  for (const c of selectedChars) {
    c.note = note;
    c.noteCustom = true;
  }
  save();
  render();
  const names = selectedChars.map(c => cleanCharName(c.name)).join(' $ ');
  const cmd = `$note ${names} $ ${note}`.trim();
  copyText(cmd);
  closeBatchModal();
}

function applyBatchSaleCalc() {
  const selectedChars = state.order.filter(id => selection.has(id)).map(id => byId.get(id)).filter(Boolean);
  if (!selectedChars.length) return;
  const addX = Number($('#batchSaleAddInput').value) || 0;
  state.settings.saleAddValue = addX;
  pushUndo();

  const cmds = [];
  for (const c of selectedChars) {
    const baseK = Number(c.kakera) || 0;
    const total = Math.max(0, baseK + addX);
    const saleNote = `${total} ka`;
    c.note = saleNote;
    c.noteCustom = true;
    cmds.push(`$note ${cleanCharName(c.name)} $ ${saleNote}`);
  }
  save();
  render();
  closeBatchModal();
  showCommandsModal(
    'Comandos de Precio en Lote',
    `Precios calculados (+${addX} ka) para <b>${selectedChars.length}</b> personaje(s)`,
    cmds,
    'Copia cada comando o usa "Copiar todo" para pegarlos en Discord.',
    { type: 'batch-sale', label: 'Precios en lote (+' + addX + ' ka)' }
  );
}

function applyBatchEcColor() {
  const selectedChars = state.order.filter(id => selection.has(id)).map(id => byId.get(id)).filter(Boolean);
  if (!selectedChars.length) return;
  let hex = $('#batchHexInput').value.trim().toUpperCase();
  if (hex && !hex.startsWith('#')) hex = '#' + hex;
  if (!/^#[0-9A-F]{6}$/.test(hex)) { toast('Ingrese un color HEX válido'); return; }

  const withKeys = selectedChars.filter(c => (Number(c.keys) || 0) > 0);
  const targetList = withKeys.length ? withKeys : selectedChars;

  pushUndo();
  for (const c of targetList) {
    c.embedColor = hex;
    c.colorCustom = true;
  }
  save();
  render();
  const names = targetList.map(c => cleanCharName(c.name)).join(' $ ');
  copyText(`$ec ${names} $ ${hex}`);
  closeBatchModal();
}

/* ---------- divorcio ($divorce) ---------- */
function updateDivorceUndoButton() {
  const b = $('#btnUndoDivorce');
  if (b) b.hidden = !divorceUndo;
}

function divorceSelected() {
  const selectedChars = state.order.filter(id => selection.has(id)).map(id => byId.get(id)).filter(Boolean);
  if (!selectedChars.length) { toast('Seleccione al menos un personaje para divorciar'); return; }
  const n = selectedChars.length;
  const removeFromLib = $('#divorceRemoveFromLib') ? $('#divorceRemoveFromLib').checked : true;
  const ask = removeFromLib
    ? `¿Divorciar ${n} personaje(s)?\n\nSe preparará el comando de divorcio y se quitarán de la biblioteca.\nSe creará una copia de seguridad antes de continuar.`
    : `¿Preparar el divorcio de ${n} personaje(s)?\n\nNo se quitarán de la biblioteca.`;
  if (!confirm(ask)) return;

  const { names, warnings } = validateCommandNames(selectedChars.map(c => cleanCharName(c.name)));
  if (!names.length) { toast('No hay nombres válidos para el divorcio'); return; }
  const blocks = buildDivorceBlocks(names, cmdLimit());

  if (removeFromLib) {
    createBackupSafe('antes de divorciar');
    divorceUndo = {
      at: Date.now(),
      chars: state.chars.slice(),
      order: state.order.slice(),
      seriesMeta: (state.seriesMeta || []).map(s => ({ ...s }))
    };
    const removedIds = new Set(selectedChars.map(c => c.id));
    const affected = new Set(selectedChars.map(c => c.series));
    state.chars = state.chars.filter(c => !removedIds.has(c.id));
    state.order = state.order.filter(id => !removedIds.has(id));
    selection.clear();
    const counts = countBySeries();
    for (const meta of state.seriesMeta || []) {
      if (affected.has(meta.name)) meta.owned = counts.get(meta.name) || 0;
    }
    rebuildIndex();
    save();
    render();
    updateDivorceUndoButton();
  }

  showCommandsModal(
    'Divorcio · comandos para Discord',
    `<b>${names.length}</b> personaje(s) · ${blocks.length} bloque(s)` +
      (removeFromLib ? ' · <b>quitados de la biblioteca</b>' : ''),
    blocks,
    removeFromLib
      ? 'Copia este comando y pégalo en Discord. Los personajes ya se quitaron de la biblioteca; si te arrepientes, pulsa «Deshacer divorcio».'
      : 'Copia este comando y pégalo en Discord.',
    { type: 'divorce', label: 'Divorcio · ' + names.length + ' personaje(s)', warnings, context: { kind: 'divorce' } }
  );
}

function undoDivorce() {
  if (!divorceUndo) { toast('No hay ningún divorcio reciente que deshacer'); return; }
  const snap = divorceUndo;
  state.chars = snap.chars;
  state.order = snap.order;
  state.seriesMeta = snap.seriesMeta;
  divorceUndo = null;
  rebuildIndex();
  save();
  render();
  updateDivorceUndoButton();
  closeModalById('smModal');
  toast('Divorcio deshecho');
}

let editingId = null;
let sheetHex = '';        // color de marco que se está editando (todavía sin guardar)
const SWATCHES = ['#6FA8FF', '#6FE3C1', '#E8B64C', '#EF7D80', '#C58CFF', '#FF9E6B', '#F2F2F2'];

function normalizeHex(raw) {
  let v = String(raw || '').trim().toUpperCase();
  if (v && !v.startsWith('#')) v = '#' + v;
  return /^#[0-9A-F]{6}$/.test(v) ? v : '';
}

// Aplica un color al editor: campo, muestras y vista previa del marco
function setSheetHex(hex) {
  sheetHex = hex;
  const input = $('#editHex');
  if (input && document.activeElement !== input) input.value = hex;
  $$('#swatches button').forEach(b => b.classList.toggle('on', (b.dataset.c || '') === hex));
  const prev = $('#framePrev');
  if (prev) prev.style.setProperty('--fc', hex || 'transparent');
  const hr = $('#hexRead');
  if (hr) hr.textContent = hex || 'Sin color';
  const cc = byId.get(editingId);
  const dirty = !!cc && hex !== (cc.embedColor || '');
  const sb = $('#btnSaveEdit');
  if (sb) sb.hidden = !dirty;
  const note = $('#saveColorNote');
  if (note) note.textContent = dirty && hex ? 'También copia el comando para Mudae' : '';
}

// Colores dominantes de una imagen (para sugerir el color de marco)
function extractPalette(src, n = 6) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const W = 64, H = Math.max(8, Math.round(64 * img.naturalHeight / img.naturalWidth));
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const g = cv.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, W, H);
        const d = g.getImageData(0, 0, W, H).data;
        const buckets = new Map();
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 200) continue;
          const r = d[i], gg = d[i + 1], b = d[i + 2];
          const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
          const sat = mx ? (mx - mn) / mx : 0;
          if (mx < 70 || (sat < 0.2 && mx > 215) || sat < 0.12) continue;   // sin negros, blancos ni grises
          const key = ((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4);
          const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0, s: 0 };
          e.n++; e.r += r; e.g += gg; e.b += b; e.s += sat;
          buckets.set(key, e);
        }
        const cand = [...buckets.values()].map(e => ({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n, w: e.n * (0.5 + e.s / e.n) })).sort((x, y) => y.w - x.w);
        const out = [];
        for (const c of cand) {
          if (out.every(o => Math.hypot(o.r - c.r, o.g - c.g, o.b - c.b) > 60)) out.push(c);
          if (out.length >= n) break;
        }
        const hx = v => Math.round(v).toString(16).padStart(2, '0');
        resolve(out.map(o => ('#' + hx(o.r) + hx(o.g) + hx(o.b)).toUpperCase()));
      } catch (e) { resolve([]); }
    };
    img.onerror = () => resolve([]);
    img.src = src;
  });
}

async function refreshSheetPalette() {
  const c = byId.get(editingId);
  const box = $('#swatches');
  if (!c || !box) return;
  const id = editingId;
  const pal = await extractPalette(srcFor(c));
  if (editingId !== id) return;
  const list = pal.length ? pal : SWATCHES;
  const lbl = $('#swLabel');
  if (lbl) lbl.textContent = pal.length ? 'Colores de la foto' : 'Colores sugeridos';
  box.innerHTML = '<button type="button" class="none" data-c="" title="Sin color" aria-label="Sin color"></button>' +
    list.map(x => '<button type="button" style="--c:' + x + '" data-c="' + x + '" title="' + x + '" aria-label="' + x + '"><i>' + x + '</i></button>').join('');
  setSheetHex(sheetHex);
}

function updateSheetPinButton(c) {
  const pinBtn = $('#btnEditTogglePin');
  if (pinBtn) pinBtn.textContent = c.pinned ? 'Soltar posición' : 'Fijar posición';
}

function openEdit(id) {
  const c = byId.get(id);
  if (!c) return;
  editingId = id;
  if (!c.mudaeId && c.image) c.mudaeId = extractMudaeId(c.image);

  const keyCount = Number(c.keys) || 0;
  $('#editName').textContent = c.name;
  $('#editSeries').textContent = c.series;
  $('#roKakera').textContent = fmtKakera(Number(c.kakera) || 0);
  $('#roKeys').textContent = String(keyCount);
  $('#roRank').textContent = c.rank ? '#' + fmtKakera(c.rank) : '—';
  $('#roSpheres').textContent = Number(c.spheres) > 0 ? fmtKakera(c.spheres) : '—';
  $('#editCode').textContent = c.mudaeId ? 'mudae.net/character/' + c.mudaeId : 'Sin enlace';
  const lk = $('#editLink');
  if (c.mudaeId) { lk.href = 'https://mudae.net/character/' + c.mudaeId; lk.classList.remove('off'); } else { lk.removeAttribute('href'); lk.classList.add('off'); }
  updateSheetPinButton(c);

  // Color de marco: solo con al menos una llave
  const sec = $('#editHexSection');
  sec.classList.toggle('frame-lock', keyCount < 1);
  $('#frameHint').textContent = keyCount > 0
    ? 'Disponible porque ' + c.name + ' tiene ' + keyCount + (keyCount === 1 ? ' llave' : ' llaves') + '. Se dibuja alrededor de su tarjeta.'
    : 'Hace falta al menos una llave para elegir el color de marco. ' + c.name + ' no tiene llaves.';
  $('#swatches').innerHTML = '<button type="button" class="none" data-c="" title="Sin color" aria-label="Sin color"></button>';
  const prevImg = $('#framePrev img');
  if (prevImg) { prevImg.alt = c.name; prevImg.src = srcFor(c); }
  $('#editHex').value = c.embedColor || '';
  setSheetHex(c.embedColor || '');

  openModalById('editModal');
  loadSheetGallery(false);
  refreshSheetPalette();
}

function closeEdit() {
  closeModalById('editModal');
  editingId = null;
}

/* ================= GALERÍA DE MUDAE AUTOMÁTICA CON PROXY ================= */
function normalizeMudaeImg(url) {
  if (!url) return '';
  let s = String(url).trim().replace(/^['"]|['"]$/g, '');
  if (!s || s.startsWith('data:')) return '';
  if (s.startsWith('//')) s = 'https:' + s;
  else if (s.startsWith('/')) s = 'https://mudae.net' + s;
  return s;
}

// App de escritorio: petición directa a mudae.net. main.js adjunta la sesión
// guardada (Menú → Cuentas) y permite la lectura, así que no hace falta proxy.
async function fetchMudaeHtml(targetUrl) {
  const r = await fetch(targetUrl, { credentials: 'omit' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const html = await r.text();
  if (!html || !/mudae/i.test(html)) throw new Error('HTML inválido');
  return html;
}

function parseMudaeGalleryHtml(html, charId) {
  const res = [];
  const seen = new Set();

  const addUrl = (raw) => {
    const src = normalizeMudaeImg(raw);
    if (!src) return;
    if (/avatar|icon|logo|banner|favicon|emoji/i.test(src)) return;
    if (seen.has(src)) return;
    seen.add(src);
    const isGif = /\.gif(\?.*)?$/i.test(src);
    res.push({ url: src, index: res.length + 1, isGif });
  };

  try {
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    const containers = [
      doc.querySelector('#images-to-pic-tag'),
      doc.querySelector('#images-to-tag')
    ].filter(Boolean);

    const scopes = containers.length
      ? containers
      : [doc.querySelector('.character-gallery') || doc.querySelector('.gallery') || doc.body].filter(Boolean);

    for (const scope of scopes) {
      const elements = scope.querySelectorAll('img, source, a[href*="/uploads/"], [data-src], [data-original]');
      elements.forEach((el) => {
        const candidates = [
          el.getAttribute('data-original'),
          el.getAttribute('data-src'),
          el.getAttribute('data-lazy-src'),
          el.getAttribute('src'),
          el.getAttribute('href')
        ];
        for (const c of candidates) {
          if (c && /\.(?:png|jpe?g|gif|webp)(\?.*)?$/i.test(c)) {
            addUrl(c);
            break;
          }
        }
      });

      const rawMatches = scope.innerHTML.match(/(?:https?:\/\/mudae\.net)?\/uploads\/\d+\/[A-Za-z0-9_~.-]+\.(?:png|jpe?g|gif|webp)/gi) || [];
      rawMatches.forEach(addUrl);
    }

    if (containers.length && res.length) {
      if (charId) {
        const byIdOnly = res.filter(x => x.url.includes('/uploads/' + charId + '/'));
        if (byIdOnly.length) return byIdOnly.map((item, i) => ({ ...item, index: i + 1 }));
      }
      return res;
    }

    if (charId) {
      const re = new RegExp(`(?:https?:\\/\\/mudae\\.net)?\\/uploads\\/${charId}\\/[A-Za-z0-9_~.-]+\\.(?:png|jpe?g|gif|webp)`, 'gi');
      const matches = String(html).match(re) || [];
      matches.forEach(addUrl);
      const filtered = res.filter(x => x.url.includes('/uploads/' + charId + '/'));
      if (filtered.length) return filtered.map((item, i) => ({ ...item, index: i + 1 }));
    }
  } catch (e) {}

  return res;
}

// Galería de la ficha: se carga sola al abrir el personaje
async function loadSheetGallery(forceRefresh = false) {
  const id = editingId;
  const c = id ? byId.get(id) : null;
  const grid = $('#sheetGallery');
  const msg = $('#sheetGalleryMsg');
  if (!c || !grid) return;
  const still = () => editingId === id;     // la ficha pudo cerrarse o cambiar mientras se descargaba

  const showState = (text, withCurrent) => {
    grid.innerHTML = '';
    if (withCurrent && c.image) {
      const g = document.createElement('div');
      g.className = 'gi main';
      g.innerHTML = '<img alt="" referrerpolicy="no-referrer">';
      g.querySelector('img').src = srcFor(c);
      grid.append(g);
    }
    const s = document.createElement('div');
    s.className = 'gal-state';
    s.textContent = text;
    grid.append(s);
    msg.textContent = '';
  };

  if (!c.mudaeId) { showState('Este personaje no tiene código de Mudae, así que no se pueden buscar sus imágenes.', true); return; }

  if (!forceRefresh) {
    try {
      const cached = await idbGet('galleries', id + ':p');
      if (cached && Array.isArray(cached.list) && cached.list.length) {
        if (!still()) return;
        galleries2.set(id, cached.list);
        renderSheetGallery(cached.list);
        return;
      }
    } catch (e) { /* sin caché */ }
  }

  showState('Buscando imágenes…', false);
  try {
    const html = await fetchMudaeHtml('https://mudae.net/character/' + c.mudaeId);
    const list = parseMudaeGalleryHtml(html, c.mudaeId);
    if (!still()) return;
    if (!list.length) { showState('No se encontraron imágenes para este personaje.', true); return; }
    galleries2.set(id, list);
    try { await idbPutStore('galleries', id + ':p', { list, ts: Date.now() }); } catch (e) { /* sin caché */ }
    renderSheetGallery(list);
  } catch (e) {
    if (still()) showState(isDesktop ? 'No se pudo leer mudae.net. Revisa tu conexión o inicia sesión en «Cuenta de Mudae» (menú de los tres puntos).' : 'Las galerías de Mudae solo se pueden cargar desde la app de escritorio: el navegador no deja leer mudae.net.', true);
  }
}

function renderSheetGallery(list) {
  const id = editingId;
  const c = id ? byId.get(id) : null;
  const grid = $('#sheetGallery');
  const msg = $('#sheetGalleryMsg');
  if (!c || !grid) return;
  const cname = cleanCharName(c.name);
  const skipGifs = state.settings.pauseGifs !== false;

  // La imagen principal va primero y ocupa más espacio
  const mainIdx = Math.max(0, list.findIndex(it => it.url === c.image));
  const order = [mainIdx, ...list.map((_, i) => i).filter(i => i !== mainIdx)];

  grid.innerHTML = '';
  order.forEach((i, pos) => {
    const item = list[i];
    const n = item.index || (i + 1);
    const isGif = item.isGif || /\.gif(\?.*)?$/i.test(item.url);
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'gi' + (pos === 0 ? ' main' : '');
    tile.title = pos === 0 ? 'Imagen principal' : 'Usar como imagen principal';
    const badge = '<span class="n">' + (isGif ? 'GIF ' : '') + n + '</span>';
    const loadImg = () => {
      const img = document.createElement('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.loading = 'lazy';
      img.src = item.url;
      img.addEventListener('error', () => tile.classList.add('failed'));
      tile.prepend(img);
    };
    if (isGif && skipGifs) {
      tile.innerHTML = '<span class="gif-ph">GIF<small>Pulsa para cargarlo</small></span>' + badge;
      tile.dataset.pending = '1';
    } else {
      tile.innerHTML = badge;
      loadImg();
    }
    tile.addEventListener('click', async () => {
      if (tile.dataset.pending) {            // primer clic en un GIF: solo se carga
        delete tile.dataset.pending;
        tile.querySelector('.gif-ph')?.remove();
        loadImg();
        return;
      }
      if (c.image === item.url) return;
      const cmd = '$c ' + cname + '$' + n;
      const copied = await copyText(cmd);     // primero copiar (dentro del gesto del usuario)
      pushUndo();
      c.image = item.url;
      save();
      try {
        const rec = await fetchThumb(c);
        thumbs.set(c.id, rec);
        setThumbUrls(c.id, rec);
        await idbPut(c.id, rec);
      } catch (e) { /* se queda la imagen remota */ }
      const prevImg = $('#framePrev img');
      if (prevImg) prevImg.src = srcFor(c);
      if (editingId === id) refreshSheetPalette();
      render();
      if (editingId === id) renderSheetGallery(list);
      toast(copied ? 'Imagen ' + n + ' elegida. Pega en Discord el comando copiado para cambiarla también en Mudae.' : 'Imagen ' + n + ' elegida.');
    });
    grid.append(tile);
  });
  msg.textContent = list.length + (list.length === 1 ? ' imagen en Mudae' : ' imágenes en Mudae') + ' · pulsa una para usarla como principal';
}

// Guarda el color de marco editado y copia el comando para aplicarlo en Mudae
async function saveEdit() {
  const c = byId.get(editingId);
  if (!c) { closeEdit(); return; }
  const typed = ($('#editHex').value || '').trim();
  const hex = typed ? normalizeHex(typed) : '';
  if (typed && !hex) { toast('El color debe tener el formato #RRGGBB'); return; }
  if (hex && (Number(c.keys) || 0) < 1) { toast('Hace falta al menos una llave para elegir el color de marco'); return; }
  if (hex === (c.embedColor || '')) return;
  const cmd = hex ? '$ec ' + cleanCharName(c.name) + ' $ ' + hex : '';
  const copied = cmd ? await copyText(cmd) : false;   // primero copiar, dentro del gesto del usuario
  pushUndo();
  c.embedColor = hex;
  c.colorCustom = true;
  save();
  render();
  setSheetHex(hex);
  toast(!hex ? 'Color de marco quitado' : copied ? 'Color guardado. Pega en Discord el comando copiado para aplicarlo también en Mudae.' : 'Color guardado');
}

/* ================= HERRAMIENTAS DE BIBLIOTECA ================= */
function allTags() {
  const map = new Map();
  for (const c of state.chars) {
    for (const t of (c.tags || [])) {
      const k = norm(t);
      if (!map.has(k)) map.set(k, { label: t, count: 0 });
      map.get(k).count++;
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
}

function updateTagFilter() {
  const sel = $('#tagFilter');
  if (!sel) return;
  const current = state.settings.tagFilter || sel.value || '';
  sel.innerHTML = '';
  sel.append(new Option('Todas las etiquetas', ''));
  for (const t of allTags()) sel.append(new Option(`${t.label} (${t.count})`, t.label));
  const match = allTags().find(t => norm(t.label) === norm(current));
  sel.value = match ? match.label : '';
  if (!match && current) state.settings.tagFilter = '';
}

function updateTagFilterList() {
  const dl = $('#tagSuggestions');
  if (!dl) return;
  dl.innerHTML = '';
  for (const t of allTags()) {
    const opt = document.createElement('option');
    opt.value = t.label;
    dl.append(opt);
  }
}

function currentFilterSettings() {
  return {
    search: state.settings.search || '',
    series: state.settings.series || '',
    keyFilter: state.settings.keyFilter || 'all',
    noteFilter: state.settings.noteFilter || '',
    tagFilter: state.settings.tagFilter || '',
    onlyNote: !!state.settings.onlyNote,
    groupBySeries: !!state.settings.groupBySeries,
    pageSize: Number(state.settings.pageSize) || 0
  };
}

function describeFilter(f) {
  const parts = [];
  if (f.search) parts.push(`búsqueda: "${f.search}"`);
  if (f.series) parts.push(`serie: ${f.series}`);
  if (f.tagFilter) parts.push(`etiqueta: #${f.tagFilter}`);
  if (f.noteFilter) parts.push(`nota: "${f.noteFilter}"`);
  if (f.onlyNote) parts.push('solo con nota');
  if (f.keyFilter && f.keyFilter !== 'all') parts.push('llaves: ' + f.keyFilter);
  if (f.groupBySeries) parts.push('vista agrupada');
  return parts.length ? parts.join(' · ') : 'Sin filtros (todo visible)';
}

function updateSavedFilterCount() {
  const el = $('#savedFilterCount');
  if (el) el.textContent = state.savedFilters.length ? `(${state.savedFilters.length})` : '';
}

function saveCurrentFilter() {
  const input = $('#savedFilterName');
  const name = (input ? input.value : '').trim() || ('Filtro ' + (state.savedFilters.length + 1));
  const entry = {
    id: 'sf-' + Date.now().toString(36),
    name: name.slice(0, 60),
    desc: describeFilter(currentFilterSettings()),
    settings: currentFilterSettings(),
    createdAt: Date.now()
  };
  state.savedFilters = [entry, ...state.savedFilters].slice(0, 40);
  if (input) input.value = '';
  save();
  updateSavedFilterCount();
  renderSavedFilters();
  toast(`Filtro «${entry.name}» guardado`);
}

function applySavedFilter(id) {
  const f = state.savedFilters.find(x => x.id === id);
  if (!f) return;
  Object.assign(state.settings, f.settings || {});
  save();
  applySettings();
  render();
  closeFiltersModal();
  toast(`Filtro «${f.name}» aplicado`);
}

function deleteSavedFilter(id) {
  const f = state.savedFilters.find(x => x.id === id);
  if (!f) return;
  state.savedFilters = state.savedFilters.filter(x => x.id !== id);
  save();
  updateSavedFilterCount();
  renderSavedFilters();
  toast('Filtro eliminado');
}

function renderSavedFilters() {
  const box = $('#savedFiltersList');
  if (!box) return;
  box.innerHTML = '';
  if (!state.savedFilters.length) {
    box.innerHTML = '<div class="muted" style="padding:12px 0">Aún no hay filtros guardados. Configure la búsqueda y pulse “Guardar actual”.</div>';
    return;
  }
  for (const f of state.savedFilters) {
    const row = document.createElement('div');
    row.className = 'saved-filter-row';
    const info = document.createElement('div');
    info.className = 'saved-filter-info';
    info.innerHTML = `<b>${escapeHtml(f.name)}</b><span class="muted">${escapeHtml(f.desc || '')}</span>`;
    const actions = document.createElement('div');
    actions.className = 'row';
    const apply = document.createElement('button');
    apply.type = 'button'; apply.className = 'btn small primary'; apply.textContent = 'Aplicar';
    apply.onclick = () => applySavedFilter(f.id);
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn small ghost'; del.textContent = '✕';
    del.title = 'Eliminar filtro';
    del.onclick = () => deleteSavedFilter(f.id);
    actions.append(apply, del);
    row.append(info, actions);
    box.append(row);
  }
}

function findDuplicates() {
  const groups = [];
  const byName = new Map();
  const byMudae = new Map();
  for (const c of state.chars) {
    const nk = norm(c.name);
    if (!byName.has(nk)) byName.set(nk, []);
    byName.get(nk).push(c);
    if (c.mudaeId) {
      const mk = String(c.mudaeId);
      if (!byMudae.has(mk)) byMudae.set(mk, []);
      byMudae.get(mk).push(c);
    }
  }
  const seenIds = new Set();
  for (const [key, list] of byName) {
    if (list.length > 1) {
      groups.push({ reason: 'mismo nombre', key, list });
      list.forEach(c => seenIds.add(c.id));
    }
  }
  for (const [key, list] of byMudae) {
    if (list.length > 1) {
      groups.push({ reason: 'mismo ID de Mudae', key, list });
      list.forEach(c => seenIds.add(c.id));
    }
  }
  return groups;
}

function renderDuplicates() {
  const box = $('#duplicatesBody');
  if (!box) return;
  const groups = findDuplicates();
  box.innerHTML = '';
  if (!groups.length) {
    box.innerHTML = '<div class="empty" style="padding:32px"><strong>Sin duplicados detectados</strong><span>No hay personajes repetidos por nombre ni por ID de Mudae.</span></div>';
    return;
  }
  const summary = document.createElement('p');
  summary.className = 'hint';
  summary.textContent = `${groups.length} grupo(s) de posibles duplicados. Revisa si son personajes distintos con el mismo nombre o importaciones repetidas.`;
  box.append(summary);

  groups.forEach((g, gi) => {
    const card = document.createElement('div');
    card.className = 'dup-group';
    const head = document.createElement('div');
    head.className = 'dup-head';
    head.innerHTML = `<b>Grupo ${gi + 1} · ${escapeHtml(g.reason)}</b><span class="muted">${escapeHtml(String(g.key))}</span>`;
    const actions = document.createElement('div');
    actions.className = 'row';
    const sel = document.createElement('button');
    sel.type = 'button'; sel.className = 'btn small'; sel.textContent = 'Seleccionar en biblioteca';
    sel.onclick = () => {
      selection = new Set(g.list.map(c => c.id));
      closeDuplicatesModal();
      closeDrawer();
      document.dispatchEvent(new CustomEvent('mudae:goto-tab', { detail: { tab: 'lib' } }));
      setTimeout(() => updateSelectionUI(), 50);
      toast(`${g.list.length} duplicado(s) seleccionados`);
    };
    actions.append(sel);
    head.append(actions);
    card.append(head);

    const rows = document.createElement('div');
    rows.className = 'dup-rows';
    for (const c of g.list) {
      const r = document.createElement('button');
      r.type = 'button';
      r.className = 'dup-row';
      r.innerHTML = `<span class="dup-name">${escapeHtml(c.name)}</span><span class="muted">${escapeHtml(c.series)}</span><span class="pill">#${state.order.indexOf(c.id) + 1}</span><span class="muted">${fmtKakera(c.kakera)} ka</span>`;
      r.onclick = () => {
        closeDuplicatesModal();
        document.dispatchEvent(new CustomEvent('mudae:goto-tab', { detail: { tab: 'lib' } }));
        selection = new Set([c.id]);
        updateSelectionUI();
        setTimeout(() => {
          const el = findCard(c.id);
          if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('jump-flash'); setTimeout(() => el.classList.remove('jump-flash'), 1100); }
        }, 80);
      };
      rows.append(r);
    }
    card.append(rows);
    box.append(card);
  });
}

function selectDuplicates() {
  const groups = findDuplicates();
  if (!groups.length) { toast('No hay duplicados'); return; }
  const ids = new Set();
  groups.forEach(g => g.list.forEach(c => ids.add(c.id)));
  selection = ids;
  closeDuplicatesModal();
  document.dispatchEvent(new CustomEvent('mudae:goto-tab', { detail: { tab: 'lib' } }));
  setTimeout(() => updateSelectionUI(), 50);
  toast(`${ids.size} personaje(s) duplicados seleccionados`);
}

/* ---------- comparación de orden ---------- */
function orderComparison() {
  const cur = state.order.slice();
  const orig = state.origOrder.slice();
  const curPos = new Map(cur.map((id, i) => [id, i]));
  const origPos = new Map(orig.map((id, i) => [id, i]));
  const common = cur.filter(id => origPos.has(id));
  let moved = 0;
  let distance = 0;
  let biggest = null;
  for (const id of common) {
    const a = curPos.get(id);
    const b = origPos.get(id);
    const d = a - b;
    if (d !== 0) moved++;
    distance += Math.abs(d);
    if (!biggest || Math.abs(d) > Math.abs(biggest.d)) biggest = { id, d, a, b };
  }
  const added = cur.filter(id => !origPos.has(id));
  const removed = orig.filter(id => !curPos.has(id));
  return { cur, orig, moved, distance, biggest, added, removed };
}

function renderStats(tab = 'summary') {
  const body = $('#statsBody');
  if (!body) return;
  body.innerHTML = '';
  const names = getSeriesOrder();
  const chars = state.chars;
  const totalKa = chars.reduce((s, c) => s + (Number(c.kakera) || 0), 0);
  const totalKeys = chars.reduce((s, c) => s + (Number(c.keys) || 0), 0);
  const withKeys = chars.filter(c => (Number(c.keys) || 0) > 0).length;
  const pinned = chars.filter(c => c.pinned).length;
  const withNote = chars.filter(c => c.note).length;
  const withColor = chars.filter(c => c.embedColor).length;
  const tagged = chars.filter(c => (c.tags || []).length).length;
  const taggedAll = allTags().length;
  const stats = seriesStats();
  const metaTotal = [...stats.values()].reduce((s, x) => s + x.total, 0) || chars.length;
  const completion = metaTotal ? Math.round((chars.length / metaTotal) * 100) : 100;
  const dups = findDuplicates();

  if (tab === 'summary') {
    const keyBuckets = [
      ['Sin llaves', chars.filter(c => !(Number(c.keys) || 0)).length],
      ['1–2 llaves', chars.filter(c => { const k = Number(c.keys) || 0; return k >= 1 && k <= 2; }).length],
      ['3–5 llaves', chars.filter(c => { const k = Number(c.keys) || 0; return k >= 3 && k <= 5; }).length],
      ['6–9 llaves', chars.filter(c => { const k = Number(c.keys) || 0; return k >= 6 && k <= 9; }).length],
      ['10+ (Soulmate)', chars.filter(c => (Number(c.keys) || 0) >= 10).length]
    ];
    const cards = [
      ['Personajes', fmtKakera(chars.length), 'En la colección'],
      ['Series', fmtKakera(names.length), `${completion}% de completado global`],
      ['Kakera total', fmtKakera(totalKa), chars.length ? `Media ${fmtKakera(Math.round(totalKa / chars.length))} ka` : '—'],
      ['Llaves', fmtKakera(totalKeys), `${withKeys} personaje(s) con llaves`],
      ['Fijados', fmtKakera(pinned), 'Conservan su puesto al ordenar'],
      ['Etiquetas', fmtKakera(taggedAll), `${tagged} personaje(s) etiquetados`],
      ['Con nota', fmtKakera(withNote), `${chars.length - withNote} sin nota`],
      ['Con color', fmtKakera(withColor), `${chars.length - withColor} sin color HEX`]
    ];
    body.innerHTML = `<div class="stats-grid">${cards.map(([k, v, s]) => `<div class="stats-card"><span>${k}</span><b>${v}</b><small>${s}</small></div>`).join('')}</div>`;
    body.innerHTML += `<h4>Distribución de llaves</h4><div class="bar-list">${keyBuckets.map(([label, n]) => {
      const pct = chars.length ? Math.round((n / chars.length) * 100) : 0;
      return `<div class="bar-row"><span>${label}</span><div class="bar-track"><i style="width:${pct}%"></i></div><b>${n}</b></div>`;
    }).join('')}</div>`;
    body.innerHTML += `<h4>Alertas</h4><ul class="stats-list">
      <li>${dups.length ? `<b>${dups.length}</b> grupo(s) de duplicados detectados. <button type="button" class="btn small" data-open-dups>Revisar</button>` : 'Sin duplicados por nombre o ID.'}</li>
      <li>${state.warnings && state.warnings.length ? `${state.warnings.length} aviso(s) de importación pendientes de revisar.` : 'Importación sin avisos.'}</li>
      <li>${state.seriesPinned.length ? `${state.seriesPinned.length} serie(s) fijadas frente a ordenaciones automáticas.` : 'Ninguna serie fijada.'}</li>
    </ul>`;
  } else if (tab === 'series') {
    const rows = [...stats.values()].sort((a, b) => b.missing - a.missing).map((s, i) => {
      return `<tr class="${s.missing ? '' : 'complete-row'}">
        <td>${i + 1}</td>
        <td>${isSeriesPinned(s.name) ? '' : ''}${escapeHtml(s.name)}</td>
        <td>${s.count}/${s.total}</td>
        <td>${s.pct}%</td>
        <td>${s.missing ? '<b class="miss">' + s.missing + '</b>' : ''}</td>
        <td>${fmtKakera(s.sumKa)}</td>
        <td>${s.keys}</td>
      </tr>`;
    }).join('');
    const byMissing = [...stats.values()].filter(s => s.missing > 0).sort((a, b) => b.missing - a.missing).slice(0, 8);
    body.innerHTML = `<p class="hint">Completitud global: <b>${completion}%</b> · ${chars.length} de ${metaTotal} personajes potenciales.</p>
      <div class="table-wrap"><table class="stats-table"><thead><tr><th>#</th><th>Serie</th><th>Colección</th><th>%</th><th>Faltan</th><th>Kakera</th><th>Llaves</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="muted">Sin series</td></tr>'}</tbody></table></div>`;
    if (byMissing.length) {
      body.innerHTML += `<h4>Series con más faltantes</h4><div class="bar-list">${byMissing.map(s => {
        const pct = s.total ? Math.round((s.count / s.total) * 100) : 0;
        return `<div class="bar-row"><span>${escapeHtml(s.name)}</span><div class="bar-track"><i style="width:${pct}%"></i></div><b>${s.missing} faltan</b></div>`;
      }).join('')}</div>`;
    }
  } else if (tab === 'order') {
    const cmp = orderComparison();
    const biggest = cmp.biggest ? byId.get(cmp.biggest.id) : null;
    const movedRows = cmp.cur.filter(id => cmp.orig.includes(id)).map(id => {
      const c = byId.get(id);
      const a = cmp.cur.indexOf(id);
      const b = cmp.orig.indexOf(id);
      return { c, a, b, d: a - b };
    }).filter(x => x.d !== 0).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 40);
    body.innerHTML = `<div class="stats-grid">
        <div class="stats-card"><span>Orden actual vs original</span><b>${cmp.moved}</b><small>personaje(s) movidos</small></div>
        <div class="stats-card"><span>Distancia total</span><b>${cmp.distance}</b><small>posiciones acumuladas</small></div>
        <div class="stats-card"><span>Nuevos</span><b>${cmp.added.length}</b><small>no estaban al importar</small></div>
        <div class="stats-card"><span>Eliminados</span><b>${cmp.removed.length}</b><small>ya no están en la colección</small></div>
      </div>
      ${biggest ? `<p class="hint">Mayor movimiento: <b>${escapeHtml(biggest.name)}</b> (${cmp.biggest.d > 0 ? '+' : ''}${cmp.biggest.d} puestos).</p>` : ''}
      <div class="row" style="margin:8px 0 12px">
        <button type="button" class="btn small" id="btnStatsResetOrder">Restablecer solo el orden</button>
        <button type="button" class="btn small" id="btnStatsResetSeries">Restablecer orden de series</button>
        <button type="button" class="btn small" id="btnStatsExportOrder">Exportar orden actual</button>
      </div>
      <div class="table-wrap"><table class="stats-table"><thead><tr><th>Puesto actual</th><th>Puesto original</th><th>Cambio</th><th>Personaje</th><th>Serie</th></tr></thead><tbody>${movedRows.map(x => `<tr><td>#${x.a + 1}</td><td>#${x.b + 1}</td><td class="${x.d > 0 ? 'down' : 'up'}">${x.d > 0 ? '+' : ''}${x.d}</td><td>${escapeHtml(x.c ? x.c.name : '—')}</td><td>${escapeHtml(x.c ? x.c.series : '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">El orden actual coincide con el original.</td></tr>'}</tbody></table></div>`;
  } else if (tab === 'imports') {
    const rows = (state.importHistory || []).map(h => `<tr><td>${new Date(h.at).toLocaleString(LOC())}</td><td>${h.chars}</td><td>${h.series}</td><td>${h.skipped || 0}</td><td>${(h.warnings || []).length}</td></tr>`).join('');
    body.innerHTML = `<p class="hint">Se conservan las últimas ${state.importHistory.length} importaciones. Las copias automáticas se crean antes de cada importación.</p>
      <div class="table-wrap"><table class="stats-table"><thead><tr><th>Fecha</th><th>Personajes</th><th>Series</th><th>Líneas omitidas</th><th>Avisos</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">Sin importaciones registradas.</td></tr>'}</tbody></table></div>`;
  }
}

function openStatsModal(tab = 'summary') {
  if (!state.chars.length) { toast('Primero importe su colección'); return; }
  openModalById('statsModal');
  $$('#statsModal .stats-tab').forEach(b => b.classList.toggle('active', b.dataset.statsTab === tab));
  renderStats(tab);
}

function closeStatsModal() {
  closeModalById('statsModal');
}

function resetLibraryOrder() {
  if (!state.origOrder.length) { toast('No hay orden original guardado'); return; }
  if (!confirm('¿Restablecer solo el orden de la biblioteca al de la última importación? Se conservarán notas, colores, etiquetas y series.')) return;
  pushUndo();
  const ids = new Set(state.chars.map(c => c.id));
  const wanted = state.origOrder.filter(id => ids.has(id));
  const rest = state.order.filter(id => !wanted.includes(id));
  state.order = [...new Set([...wanted, ...rest])];
  save();
  render();
  toast('Orden de la biblioteca restablecido');
}

/* ---------- historial de comandos ---------- */
function openHistoryModal() {
  openModalById('historyModal');
  renderCommandHistory();
}

function closeHistoryModal() {
  closeModalById('historyModal');
}

function renderCommandHistory() {
  const box = $('#historyBody');
  if (!box) return;
  box.innerHTML = '';
  if (!state.commandHistory.length) {
    box.innerHTML = '<div class="muted" style="padding:16px 0">Aún no has generado comandos. Los comandos generados aparecerán aquí para reutilizarlos.</div>';
    return;
  }
  for (const h of state.commandHistory) {
    const item = document.createElement('div');
    item.className = 'history-item';
    const head = document.createElement('div');
    head.className = 'history-head';
    const date = new Date(h.at).toLocaleString(LOC());
    head.innerHTML = `<div><b>${escapeHtml(h.label || h.type)}</b><span class="muted"> · ${escapeHtml(date)} · ${h.blocks.length} bloque(s)</span></div>`;
    const actions = document.createElement('div');
    actions.className = 'row';
    const copy = document.createElement('button');
    copy.type = 'button'; copy.className = 'btn small primary'; copy.textContent = 'Copiar';
    copy.onclick = () => copyText(h.blocks.join('\n\n'));
    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 'btn small'; dl.textContent = 'Descargar';
    dl.title = 'Descargar .txt';
    dl.onclick = () => download('mudae-comando-' + h.id + '.txt', h.blocks.join('\n\n') + '\n', 'text/plain');
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn small ghost'; del.textContent = '✕';
    del.title = 'Eliminar entrada';
    del.onclick = () => {
      state.commandHistory = state.commandHistory.filter(x => x.id !== h.id);
      save();
      saveHistory();
      updateHistoryBadge();
      renderCommandHistory();
    };
    actions.append(copy, dl, del);
    head.append(actions);
    const preview = document.createElement('pre');
    preview.className = 'history-preview';
    preview.textContent = h.blocks[0].slice(0, 240) + (h.blocks[0].length > 240 ? '…' : '');
    item.append(head, preview);
    box.append(item);
  }
}

function clearCommandHistory() {
  if (!state.commandHistory.length) return;
  if (!confirm('¿Vaciar todo el historial de comandos?')) return;
  state.commandHistory = [];
  save();
  saveHistory();
  updateHistoryBadge();
  renderCommandHistory();
  toast('Historial vaciado');
}

/* ---------- copias de seguridad ---------- */
function openBackupsModal() {
  openModalById('backupsModal');
  renderBackups();
}

function closeBackupsModal() {
  closeModalById('backupsModal');
}

function renderBackups() {
  const box = $('#backupsBody');
  if (!box) return;
  const list = readBackups();
  box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = '<div class="muted" style="padding:12px 0">No hay copias todavía. Se crean automáticamente antes de importar o cargar un proyecto.</div>';
  }
  for (const b of list) {
    const row = document.createElement('div');
    row.className = 'backup-row';
    const info = document.createElement('div');
    info.className = 'backup-info';
    info.innerHTML = `<b>${new Date(b.at).toLocaleString(LOC())}</b>
      <span class="muted">${escapeHtml(b.reason || 'manual')} · ${b.chars} personajes · ${b.series} series</span>`;
    const actions = document.createElement('div');
    actions.className = 'row';
    const restore = document.createElement('button');
    restore.type = 'button'; restore.className = 'btn small primary'; restore.textContent = 'Restaurar';
    restore.onclick = () => restoreBackup(b.id);
    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 'btn small'; dl.textContent = 'Descargar .json';
    dl.onclick = () => download('mudae-backup-' + new Date(b.at).toISOString().slice(0, 10) + '.json', JSON.stringify(b.data, null, 2));
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn small ghost'; del.textContent = '✕';
    del.onclick = () => {
      writeBackups(readBackups().filter(x => x.id !== b.id));
      updateBackupCount();
      renderBackups();
    };
    actions.append(restore, dl, del);
    row.append(info, actions);
    box.append(row);
  }
}

function restoreBackup(id) {
  const b = readBackups().find(x => x.id === id);
  if (!b) return;
  if (!confirm(`¿Restaurar la copia del ${new Date(b.at).toLocaleString(LOC())}? Se reemplazarán los datos actuales.`)) return;
  createBackupSafe('antes de restaurar');
  setProject(b.data);
  save();
  fillSeriesSelect();
  applySettings();
  render();
  closeBackupsModal();
  failed.clear();
  startCaching();
  toast('Copia restaurada correctamente');
}

function createManualBackup() {
  if (!state.chars.length) { toast('Primero importe su colección'); return; }
  const b = createBackup('manual');
  renderBackups();
  toast(b ? 'Copia de seguridad creada' : 'No se pudo crear la copia');
}

/* ---------- vista previa genérica ---------- */
function showPreview(title, summary, bodyHtml) {
  $('#previewTitle').textContent = title;
  $('#previewSummary').innerHTML = summary;
  $('#previewBody').innerHTML = bodyHtml;
  openModalById('previewModal');
}

function closePreview() {
  closeModalById('previewModal');
  previewApplyFn = null;
}

/* ---------- modales de filtros / duplicados ---------- */
function openFiltersModal() {
  openModalById('filtersModal');
  renderSavedFilters();
  updateTagFilterList();
  setTimeout(() => $('#savedFilterName')?.focus(), 40);
}
function closeFiltersModal() {
  closeModalById('filtersModal');
}
function openDuplicatesModal() {
  openModalById('duplicatesModal');
  renderDuplicates();
}
function closeDuplicatesModal() {
  closeModalById('duplicatesModal');
}

/* ---------- etiquetas ---------- */
function applyTagsToSelection(mode) {
  const selectedChars = state.order.filter(id => selection.has(id)).map(id => byId.get(id)).filter(Boolean);
  if (!selectedChars.length) { toast('Seleccione al menos un personaje'); return; }
  const raw = $('#batchTagsInput') ? $('#batchTagsInput').value : '';
  const tags = parseTags(raw);
  if (!tags.length) { toast('Escriba al menos una etiqueta'); return; }
  pushUndo();
  for (const c of selectedChars) {
    const cur = new Set(c.tags || []);
    for (const t of tags) {
      if (mode === 'add') cur.add(t);
      else {
        const k = norm(t);
        for (const existing of [...cur]) if (norm(existing) === k) cur.delete(existing);
      }
    }
    c.tags = [...cur];
  }
  save();
  updateTagFilter();
  updateTagFilterList();
  applySettings();
  render();
  toast(mode === 'add' ? `Etiquetas añadidas a ${selectedChars.length} personaje(s)` : `Etiquetas quitadas de ${selectedChars.length} personaje(s)`);
}

function clearAllTagsFromSelection() {
  const selectedChars = state.order.filter(id => selection.has(id)).map(id => byId.get(id)).filter(Boolean);
  if (!selectedChars.length) return;
  pushUndo();
  for (const c of selectedChars) c.tags = [];
  save();
  updateTagFilter();
  updateTagFilterList();
  applySettings();
  render();
  toast('Etiquetas eliminadas de la selección');
}

/* ---------- pestañas principales (Biblioteca / Series) ---------- */
const TAB_IDS = { home: 'tabHome', lib: 'tabLib', series: 'tabSeries', photos: 'tabPhotos', friends: 'tabFriends', settings: 'tabSettings' };
function switchTab(tab) {
  if (!TAB_IDS[tab]) tab = 'lib';
  document.body.dataset.tab = tab;
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  for (const [k, id] of Object.entries(TAB_IDS)) setVisible($('#' + id), k === tab);
  document.dispatchEvent(new CustomEvent('mudae:tab', { detail: { tab } }));
  try { localStorage.setItem(TAB_LS, tab); } catch (e) {}
}
window.__mudaeSwitchTab = switchTab;

function openDrawer() {
  setVisible($('#drawerBackdrop'), true);
  $('#toolsDrawer').classList.add('open');
}
function closeDrawer() {
  $('#toolsDrawer').classList.remove('open');
  setVisible($('#drawerBackdrop'), false);
}

function bindEvents() {
  const projMenu = $('#mainMenu');
  const mainMenuBtn = $('#btnMainMenu');

  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);

  $('#btnOpenImport').addEventListener('click', openImportModal);
  $('#btnEmptyImport').addEventListener('click', openImportModal);
  $('#btnCloseImport').addEventListener('click', closeImportModal);
  $('#btnCancelImport').addEventListener('click', closeImportModal);
  $('#importModal').addEventListener('click', e => { if (e.target.id === 'importModal') closeImportModal(); });

  $('#btnCopyCmdTutorial').addEventListener('click', () => copyText(exportCommand()));

  if (mainMenuBtn) mainMenuBtn.addEventListener('click', e => {
    e.stopPropagation();
    const willOpen = projMenu.classList.contains('hidden');
    setVisible(projMenu, willOpen);
    mainMenuBtn.setAttribute('aria-expanded', String(willOpen));
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#mainMenuWrap')) {
      setVisible(projMenu, false);
      if (mainMenuBtn) mainMenuBtn.setAttribute('aria-expanded', 'false');
    }
  });

  $('#btnParse').addEventListener('click', doImport);
  $('#importText').addEventListener('input', debounce(updateImportDiag, 300));
  $('#importText').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doImport(); }
  });

  $('#btnProjExport').addEventListener('click', () => {
    setVisible(projMenu, false);
    exportProject();
  });
  $('#btnProjImport').addEventListener('click', () => {
    setVisible(projMenu, false);
    pickProjectFile();
  });
  $('#projFile').addEventListener('change', onProjectFile);

  $('#btnOpenDrawer').addEventListener('click', () => { setVisible(projMenu, false); openDrawer(); });
  $('#btnCloseDrawer').addEventListener('click', closeDrawer);
  $('#drawerBackdrop').addEventListener('click', closeDrawer);


  for (const btn of $$('[data-sort]')) {
    btn.addEventListener('click', () => sortBy(btn.dataset.sort));
  }
  $('#optNitro').addEventListener('change', e => {
    state.settings.nitro = e.target.checked;
    saveSoon();
  });
  $('#optAutoSmOnSort').addEventListener('change', e => {
    state.settings.autoSmOnSort = e.target.checked;
    saveSoon();
  });

  const seriesSearchEl = $('#seriesSearch');
  if (seriesSearchEl) {
    seriesSearchEl.addEventListener('input', e => { seriesQuery = e.target.value; renderSeriesOrganizer(); });
  }
  const btnSeriesExpandAll = $('#btnSeriesExpandAll');
  if (btnSeriesExpandAll) {
    btnSeriesExpandAll.addEventListener('click', () => {
      for (const name of getSeriesOrder()) seriesExpanded.add(name);
      renderSeriesOrganizer();
    });
  }
  const btnSeriesCollapseAll = $('#btnSeriesCollapseAll');
  if (btnSeriesCollapseAll) {
    btnSeriesCollapseAll.addEventListener('click', () => { seriesExpanded.clear(); renderSeriesOrganizer(); });
  }
  const btnSeriesCopySm = $('#btnSeriesCopySm');
  if (btnSeriesCopySm) btnSeriesCopySm.addEventListener('click', openSmSeries);
  const btnSeriesApply = $('#btnSeriesApply');
  if (btnSeriesApply) btnSeriesApply.addEventListener('click', () => applySeriesOrderToLibrary());
  const btnSeriesFullSm = $('#btnSeriesFullSm');
  if (btnSeriesFullSm) btnSeriesFullSm.addEventListener('click', exportFullSmFromSeries);
  const optSeriesPinned = $('#optSeriesPinned');
  if (optSeriesPinned) {
    optSeriesPinned.addEventListener('change', e => {
      state.settings.seriesRespectPinned = e.target.checked;
      saveSoon();
    });
  }
  const optSeriesAutoApply = $('#optSeriesAutoApply');
  if (optSeriesAutoApply) {
    optSeriesAutoApply.addEventListener('change', e => {
      state.settings.seriesAutoApply = e.target.checked;
      saveSoon();
    });
  }
  const seriesListEl = $('#seriesOrderList');
  if (seriesListEl) seriesListEl.addEventListener('pointerdown', onSeriesOrderPointerDown);

  document.addEventListener('mudae:tab', e => {
    if (e.detail && e.detail.tab === 'series') renderSeriesOrganizer();
    if (e.detail && e.detail.tab === 'lib') updateCommandScopeOptions();
  });

  document.addEventListener('mudae:goto-tab', e => {
    const tab = e.detail && e.detail.tab;
    if (!tab) return;
    if (typeof window.__mudaeSwitchTab === 'function') window.__mudaeSwitchTab(tab);
    else {
      const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
      if (btn) btn.click();
    }
  });

  /* ---------- pestañas principales ---------- */
  $$('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  /* ---------- series: orden, presets, selección, vista previa ---------- */
  const seriesSortMode = $('#seriesSortMode');
  if (seriesSortMode) {
    seriesSortMode.addEventListener('change', e => {
      const mode = e.target.value;
      if (mode === 'manual') { toast('Orden manual activado: arrastra o usa las flechas'); return; }
      sortSeriesByMetric(mode);
      seriesSortMode.value = 'manual';
    });
  }
  const seriesJump = $('#seriesJump');
  if (seriesJump) seriesJump.addEventListener('change', e => { jumpToSeries(e.target.value); e.target.value = ''; });
  const btnSeriesResetOrder = $('#btnSeriesResetOrder');
  if (btnSeriesResetOrder) btnSeriesResetOrder.addEventListener('click', resetSeriesOrder);
  const btnSeriesCopyVisible = $('#btnSeriesCopyVisible');
  if (btnSeriesCopyVisible) btnSeriesCopyVisible.addEventListener('click', copyVisibleSeriesSm);
  const btnSeriesPreview = $('#btnSeriesPreview');
  if (btnSeriesPreview) btnSeriesPreview.addEventListener('click', previewSeriesApply);
  const btnSeriesPresetSave = $('#btnSeriesPresetSave');
  if (btnSeriesPresetSave) btnSeriesPresetSave.addEventListener('click', saveSeriesPreset);
  const btnSeriesPresetLoad = $('#btnSeriesPresetLoad');
  if (btnSeriesPresetLoad) btnSeriesPresetLoad.addEventListener('click', loadSeriesPreset);
  const btnSeriesPresetDelete = $('#btnSeriesPresetDelete');
  if (btnSeriesPresetDelete) btnSeriesPresetDelete.addEventListener('click', deleteSeriesPreset);
  const seriesPresetName = $('#seriesPresetName');
  if (seriesPresetName) seriesPresetName.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveSeriesPreset(); } });
  const btnSeriesExportOrder = $('#btnSeriesExportOrder');
  if (btnSeriesExportOrder) btnSeriesExportOrder.addEventListener('click', exportSeriesOrder);
  const btnSeriesImportOrder = $('#btnSeriesImportOrder');
  if (btnSeriesImportOrder) btnSeriesImportOrder.addEventListener('click', () => $('#seriesOrderFile').click());
  const seriesOrderFile = $('#seriesOrderFile');
  if (seriesOrderFile) seriesOrderFile.addEventListener('change', importSeriesOrderFile);
  const btnSeriesBulkPin = $('#btnSeriesBulkPin');
  if (btnSeriesBulkPin) btnSeriesBulkPin.addEventListener('click', () => bulkPinSeries(true));
  const btnSeriesBulkUnpin = $('#btnSeriesBulkUnpin');
  if (btnSeriesBulkUnpin) btnSeriesBulkUnpin.addEventListener('click', () => bulkPinSeries(false));
  const btnSeriesBulkClear = $('#btnSeriesBulkClear');
  if (btnSeriesBulkClear) btnSeriesBulkClear.addEventListener('click', clearSeriesSelection);

  /* ---------- biblioteca: herramientas ---------- */
  const btnSavedFilters = $('#btnSavedFilters');
  if (btnSavedFilters) btnSavedFilters.addEventListener('click', openFiltersModal);
  const btnDuplicates = $('#btnDuplicates');
  if (btnDuplicates) btnDuplicates.addEventListener('click', () => { setVisible(projMenu, false); openDuplicatesModal(); });
  const tagFilter = $('#tagFilter');
  if (tagFilter) tagFilter.addEventListener('change', e => { state.settings.tagFilter = e.target.value; render(); saveSoon(); });

  /* ---------- estadísticas / historial / copias / filtros / duplicados / vista previa ---------- */
  $('#btnStats') && $('#btnStats').addEventListener('click', () => { setVisible(projMenu, false); openStatsModal('summary'); });
  $('#btnCloseStats') && $('#btnCloseStats').addEventListener('click', closeStatsModal);
  $('#statsModal') && $('#statsModal').addEventListener('click', e => { if (e.target.id === 'statsModal') closeStatsModal(); });
  $$('#statsTabs .stats-tab').forEach(b => b.addEventListener('click', () => {
    $$('#statsTabs .stats-tab').forEach(x => x.classList.toggle('active', x === b));
    renderStats(b.dataset.statsTab);
  }));

  $('#statsBody') && $('#statsBody').addEventListener('click', e => {
    if (e.target.closest('[data-open-dups]')) { closeStatsModal(); openDuplicatesModal(); }
    if (e.target.id === 'btnStatsResetOrder') resetLibraryOrder();
    if (e.target.id === 'btnStatsResetSeries') { closeStatsModal(); document.dispatchEvent(new CustomEvent('mudae:goto-tab', { detail: { tab: 'series' } })); setTimeout(resetSeriesOrder, 80); }
    if (e.target.id === 'btnStatsExportOrder') exportProject();
  });

  $('#btnBackups') && $('#btnBackups').addEventListener('click', () => { setVisible(projMenu, false); openBackupsModal(); });
  $('#btnCloseBackups') && $('#btnCloseBackups').addEventListener('click', closeBackupsModal);
  $('#backupsModal') && $('#backupsModal').addEventListener('click', e => { if (e.target.id === 'backupsModal') closeBackupsModal(); });
  $('#btnCreateBackup') && $('#btnCreateBackup').addEventListener('click', createManualBackup);
  $('#btnDownloadProjectBackup') && $('#btnDownloadProjectBackup').addEventListener('click', exportProject);

  $('#btnCmdHistory') && $('#btnCmdHistory').addEventListener('click', () => { setVisible(projMenu, false); openHistoryModal(); });
  $('#btnCmdHistory2') && $('#btnCmdHistory2').addEventListener('click', openHistoryModal);
  $('#btnCloseHistory') && $('#btnCloseHistory').addEventListener('click', closeHistoryModal);
  $('#btnCloseHistory2') && $('#btnCloseHistory2').addEventListener('click', closeHistoryModal);
  $('#historyModal') && $('#historyModal').addEventListener('click', e => { if (e.target.id === 'historyModal') closeHistoryModal(); });
  $('#btnClearHistory') && $('#btnClearHistory').addEventListener('click', clearCommandHistory);

  $('#btnCloseFilters') && $('#btnCloseFilters').addEventListener('click', closeFiltersModal);
  $('#filtersModal') && $('#filtersModal').addEventListener('click', e => { if (e.target.id === 'filtersModal') closeFiltersModal(); });
  $('#btnSaveFilter') && $('#btnSaveFilter').addEventListener('click', saveCurrentFilter);
  $('#savedFilterName') && $('#savedFilterName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveCurrentFilter(); } });

  $('#btnCloseDuplicates') && $('#btnCloseDuplicates').addEventListener('click', closeDuplicatesModal);
  $('#btnCloseDuplicates2') && $('#btnCloseDuplicates2').addEventListener('click', closeDuplicatesModal);
  $('#duplicatesModal') && $('#duplicatesModal').addEventListener('click', e => { if (e.target.id === 'duplicatesModal') closeDuplicatesModal(); });
  $('#btnSelectAllDuplicates') && $('#btnSelectAllDuplicates').addEventListener('click', selectDuplicates);

  $('#btnClosePreview') && $('#btnClosePreview').addEventListener('click', closePreview);
  $('#btnCancelPreview') && $('#btnCancelPreview').addEventListener('click', closePreview);
  $('#previewModal') && $('#previewModal').addEventListener('click', e => { if (e.target.id === 'previewModal') closePreview(); });
  $('#btnApplyPreview') && $('#btnApplyPreview').addEventListener('click', () => {
    const fn = previewApplyFn;
    closePreview();
    if (typeof fn === 'function') fn();
  });

  /* ---------- configuración: pestañas del panel ---------- */
  const drawerTabs = $('#drawerTabs');
  if (drawerTabs) {
    drawerTabs.addEventListener('click', e => {
      const btn = e.target.closest('.drawer-tab');
      if (!btn) return;
      const key = btn.dataset.drawerTab;
      $$('#drawerTabs .drawer-tab').forEach(b => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
      });
      $$('#toolsDrawer .drawer-pane').forEach(p => {
        const on = p.dataset.drawerPane === key;
        p.classList.toggle('active', on);
        setVisible(p, on);
      });
    });
  }

  $('#btnResetOrderOnly') && $('#btnResetOrderOnly').addEventListener('click', () => { setVisible(projMenu, false); resetLibraryOrder(); });
  $('#btnHelp') && $('#btnHelp').addEventListener('click', () => { setVisible(projMenu, false); openHelp(); });
  $('#btnCloseHelp') && $('#btnCloseHelp').addEventListener('click', closeHelp);
  $('#btnCloseHelp2') && $('#btnCloseHelp2').addEventListener('click', closeHelp);
  $('#helpModal') && $('#helpModal').addEventListener('click', e => { if (e.target.id === 'helpModal') closeHelp(); });

  /* ---------- comandos: alcance y regeneración ---------- */
  $('#btnCmdRegen') && $('#btnCmdRegen').addEventListener('click', regenerateSm);
  $('#cmdScope') && $('#cmdScope').addEventListener('change', () => {
    updateCommandScopeOptions();
    const hint = $('#cmdScopeHint');
    if (hint) hint.textContent = 'Alcance cambiado: pulsa Regenerar para recalcular el comando.';
  });
  $('#cmdScope') && $('#cmdScope').addEventListener('change', updateCommandScopeOptions);

  /* ---------- apariencia / rendimiento ---------- */
  const optLightTheme = $('#optLightTheme');
  if (optLightTheme) optLightTheme.addEventListener('change', e => { state.settings.themeLight = e.target.checked; applyVisualTheme(); saveSoon(); });
  const optCompactMode = $('#optCompactMode');
  if (optCompactMode) optCompactMode.addEventListener('change', e => { state.settings.compactMode = e.target.checked; applyVisualTheme(); render(); saveSoon(); });
  const optPerfMode = $('#optPerfMode');
  if (optPerfMode) optPerfMode.addEventListener('change', e => {
    state.settings.performanceMode = e.target.checked;
    applyVisualTheme();
    render();
    saveSoon();
    if (!e.target.checked) { failed.clear(); startCaching(); }
  });

  /* ---------- datos: copia de seguridad en archivo (escritorio) ---------- */
  const autoFileBox = $('#autoFileBox');
  const autoFileUnavailable = $('#autoFileUnavailable');
  if (isDesktop) {
    if (autoFileUnavailable) setVisible(autoFileUnavailable, false);
    if (autoFileBox) setVisible(autoFileBox, true);
  } else {
    if (autoFileBox) setVisible(autoFileBox, false);
    if (autoFileUnavailable) setVisible(autoFileUnavailable, true);
  }
  const optAutoFile = $('#optAutoFile');
  if (optAutoFile) optAutoFile.addEventListener('change', async e => {
    if (!isDesktop) return;
    if (e.target.checked && !state.settings.autoFilePath) {
      const p = await chooseAutoFile();
      if (!p) { e.target.checked = false; return; }
    }
    state.settings.autoFileEnabled = e.target.checked;
    saveSoon();
    if (e.target.checked) void writeAutoFileNow(false);
  });
  const btnChooseAutoFile = $('#btnChooseAutoFile');
  if (btnChooseAutoFile) btnChooseAutoFile.addEventListener('click', async () => {
    const p = await chooseAutoFile();
    if (p) void writeAutoFileNow(false);
  });
  const btnSaveAutoFileNow = $('#btnSaveAutoFileNow');
  if (btnSaveAutoFileNow) btnSaveAutoFileNow.addEventListener('click', () => { void writeAutoFileNow(false); });
  const btnRevealAutoFile = $('#btnRevealAutoFile');
  if (btnRevealAutoFile) btnRevealAutoFile.addEventListener('click', () => {
    if (isDesktop && state.settings.autoFilePath) window.mudaeDesktop.revealFile(state.settings.autoFilePath);
  });
  const btnRetryCache = $('#btnRetryCache');
  if (btnRetryCache) btnRetryCache.addEventListener('click', () => {
    failed.clear();
    setVisible(btnRetryCache, false);
    startCaching();
  });
  const optShowTags = $('#optShowTags');
  if (optShowTags) optShowTags.addEventListener('change', e => { state.settings.showTagsOnCards = e.target.checked; render(); saveSoon(); });

  /* ---------- etiquetas en lote ---------- */
  $('#btnBatchTagsAdd') && $('#btnBatchTagsAdd').addEventListener('click', () => applyTagsToSelection('add'));
  $('#btnBatchTagsRemove') && $('#btnBatchTagsRemove').addEventListener('click', () => applyTagsToSelection('remove'));
  $('#btnBatchTagsClear') && $('#btnBatchTagsClear').addEventListener('click', clearAllTagsFromSelection);


  $('#btnPinTop10').addEventListener('click', () => pinTopN(10));
  $('#btnPinTop15').addEventListener('click', () => pinTopN(15));
  $('#btnUnpinAll').addEventListener('click', unpinAll);

  for (const btn of $$('[data-theme]')) {
    btn.addEventListener('click', () => {
      const t = THEMES[btn.dataset.theme];
      if (!t) return;
      state.settings.bgColor = t.bg;
      state.settings.accentColor = t.accent;
      applyVisualTheme();
      saveSoon();
      toast('Tema visual aplicado');
    });
  }
  $('#customBgPicker').addEventListener('input', e => {
    state.settings.bgColor = e.target.value;
    applyVisualTheme();
    saveSoon();
  });
  $('#customAccentPicker').addEventListener('input', e => {
    state.settings.accentColor = e.target.value;
    applyVisualTheme();
    saveSoon();
  });
  $('#cardRadius').addEventListener('input', e => {
    state.settings.cardRadius = Number(e.target.value);
    applyVisualTheme();
    saveSoon();
  });
  $('#cardAspect').addEventListener('change', e => {
    state.settings.cardAspect = e.target.value;
    applyVisualTheme();
    saveSoon();
  });
  $('#optBgGlow').addEventListener('change', e => {
    state.settings.bgGlow = e.target.checked;
    applyVisualTheme();
    saveSoon();
  });
  $('#optCardGlow').addEventListener('change', e => {
    state.settings.cardGlow = e.target.checked;
    applyVisualTheme();
    saveSoon();
  });
  $('#optNeonBorders').addEventListener('change', e => {
    state.settings.neonBorders = e.target.checked;
    applyVisualTheme();
    saveSoon();
  });
  $('#optHoloSheen').addEventListener('change', e => {
    state.settings.holoSheen = e.target.checked;
    applyVisualTheme();
    saveSoon();
  });

  $('#btnQuickSm').addEventListener('click', () => openSm());
  $('#btnCloseSm').addEventListener('click', closeSm);
  $('#btnCopyAll').addEventListener('click', () => smBlocks.length && copyText(smBlocks.join('\n\n')));
  $('#btnDownloadSm').addEventListener('click', () => smBlocks.length && download('mudae-comandos-' + dateStamp() + '.txt', smBlocks.join('\n\n') + '\n', 'text/plain'));
  $('#btnCopyFirst').addEventListener('click', () => smBlocks.length && copyText(smBlocks[0]));
  $('#smModal').addEventListener('click', e => { if (e.target.id === 'smModal') closeSm(); });

  $('#btnBatchSelectAll').addEventListener('click', () => {
    selection = new Set(visibleIds());
    updateSelectionUI();
  });
  $('#btnBatchClear').addEventListener('click', () => {
    selection.clear();
    updateSelectionUI();
  });
  $('#btnBatchTop').addEventListener('click', () => moveToEdge(false));
  $('#btnBatchBottom').addEventListener('click', () => moveToEdge(true));
  const doMovePos = () => {
    const val = Number($('#batchPosInput').value);
    if (!val || val < 1) { toast('Ingrese un número de posición válido'); return; }
    moveToExactPosition(val);
  };
  $('#btnBatchMovePos').addEventListener('click', doMovePos);
  $('#batchPosInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doMovePos(); } });
  $('#btnBatchPin').addEventListener('click', () => {
    const selectedChars = state.order.filter(id => selection.has(id)).map(id => byId.get(id)).filter(Boolean);
    if (!selectedChars.length) return;
    pushUndo();
    const shouldPin = selectedChars.some(c => !c.pinned);
    for (const c of selectedChars) c.pinned = shouldPin;
    save();
    render();
    toast(shouldPin ? `${selectedChars.length} personaje(s) fijado(s)` : `Pin removido de ${selectedChars.length} personaje(s)`);
  });
  $('#btnBatchModalOpen').addEventListener('click', openBatchModal);
  const bdEl = $('#btnBatchDivorce'); if (bdEl) bdEl.addEventListener('click', divorceSelected);
  const dvEl = $('#btnDivorceSelected'); if (dvEl) dvEl.addEventListener('click', divorceSelected);
  const udEl = $('#btnUndoDivorce'); if (udEl) udEl.addEventListener('click', undoDivorce);
  const udSmEl = $('#btnUndoDivorceSm'); if (udSmEl) udSmEl.addEventListener('click', undoDivorce);
  $('#btnCloseBatchModal').addEventListener('click', closeBatchModal);
  $('#batchModal').addEventListener('click', e => { if (e.target.id === 'batchModal') closeBatchModal(); });

  $('#btnApplyBatchNote').addEventListener('click', applyBatchCommonNote);
  $('#btnApplyBatchSale').addEventListener('click', applyBatchSaleCalc);
  $('#batchColorPicker').addEventListener('input', e => { $('#batchHexInput').value = e.target.value.toUpperCase(); });
  $('#batchHexInput').addEventListener('input', e => {
    const v = e.target.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) $('#batchColorPicker').value = v;
  });
  $('#btnApplyBatchEc').addEventListener('click', applyBatchEcColor);

  $('#btnCopyBatchNamesDollar').addEventListener('click', () => {
    const names = state.order.filter(id => selection.has(id)).map(id => cleanCharName(byId.get(id)?.name)).filter(Boolean);
    if (names.length) copyText(names.join(' $ '));
  });
  $('#btnCopyBatchTradeList').addEventListener('click', () => {
    const lines = state.order.filter(id => selection.has(id)).map(id => {
      const c = byId.get(id);
      if (!c) return '';
      return `• **${cleanCharName(c.name)}** (${c.series}) — ${fmtKakera(c.kakera)} ka${c.note ? ' [' + c.note + ']' : ''}`;
    }).filter(Boolean);
    if (lines.length) copyText(lines.join('\n'));
  });

  /* ---------- ficha del personaje ---------- */
  $('#btnCloseEdit').addEventListener('click', closeEdit);
  // Comandos rápidos de la ficha: copian el comando con el nombre del personaje
  $('#editQuickCmds').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-qcmd]');
    const c = b && byId.get(editingId);
    if (!c) return;
    const cmd = b.dataset.qcmd.replace('{n}', cleanCharName(c.name)).replace('{s}', c.series);
    const ok = await copyText(cmd);
    toast(ok ? 'Comando copiado: ' + cmd : 'No se pudo copiar el comando.');
  });
  $('#btnSaveEdit').addEventListener('click', saveEdit);
  $('#btnFetchGallery').addEventListener('click', () => loadSheetGallery(true));
  $('#btnEditTogglePin').addEventListener('click', () => {
    if (!editingId) return;
    togglePin(editingId);
    const c = byId.get(editingId);
    if (c) updateSheetPinButton(c);
  });
  $('#btnEditTop').addEventListener('click', () => {
    if (!editingId) return;
    selection = new Set([editingId]);
    moveToEdge(false);
    selection.clear();
    updateSelectionUI();
    closeEdit();
  });
  $('#btnEditDivorce').addEventListener('click', () => {
    if (!editingId) return;
    const id = editingId;
    closeEdit();
    selection = new Set([id]);
    updateSelectionUI();
    divorceSelected();
  });
  $('#swatches').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) setSheetHex(b.dataset.c || '');
  });
  $('#editHex').addEventListener('input', e => {
    const v = e.target.value.trim();
    const ok = normalizeHex(v);
    if (ok) setSheetHex(ok);
    else if (!v) setSheetHex('');
  });
  $('#editLink').addEventListener('click', e => { const cc = byId.get(editingId); if (!cc || !cc.mudaeId) e.preventDefault(); });
  $('#editModal').addEventListener('click', e => { if (e.target.id === 'editModal') closeEdit(); });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if ($('#toolsDrawer').classList.contains('open')) { closeDrawer(); return; }
      if (closeTopModal()) return;
      setVisible(projMenu, false);
      if (selection.size) { selection.clear(); updateSelectionUI(); }
      return;
    }
    const isInput = /input|textarea|select/i.test(e.target.tagName);
    if (!isInput && (e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'f')) {
      e.preventDefault();
      $('#search').focus();
      $('#search').select();
    } else if (!isInput && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '/') {
      e.preventDefault();
      const searchEl = $('#search');
      if (searchEl) { searchEl.focus(); searchEl.select(); }
    } else if (!isInput && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '?') {
      e.preventDefault();
      openHelp();
    } else if (!isInput && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'F1') {
      e.preventDefault();
      openHelp();
    } else if (!isInput && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    } else if (!isInput && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (!isInput && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selection = new Set(visibleIds());
      updateSelectionUI();
    }
  });

  $('#btnReset').addEventListener('click', async () => {
    setVisible(projMenu, false);
    if (!confirm('¿Está seguro de que desea restablecer todos los datos (personajes, orden y caché de imágenes)?')) return;
    pendingSave = false;
    try { await writeChain; } catch (e) {}
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    try { localStorage.removeItem(LS_SETTINGS_KEY); } catch (e) {}
    try { localStorage.removeItem(BACKUP_KEY); } catch (e) {}
    await Promise.all([
      idbClear().catch(() => {}),
      idbClearStore('galleries').catch(() => {}),
      idbClearStore('state').catch(() => {})
    ]);
    backupsCache = [];
    thumbUrls.forEach(m => Object.values(m).forEach(u => URL.revokeObjectURL(u)));
    thumbs.clear();
    thumbUrls.clear();
    galleries2.clear();
    failed.clear();
    selection.clear();
    byId.clear();
    undoStack = [];
    redoStack = [];
    updateUndoButtons();
    state = {
      v: 2,
      importedAt: null,
      chars: [],
      order: [],
      origOrder: [],
      seriesOrder: [],
      origSeriesOrder: [],
      seriesMeta: [],
      warnings: [],
      seriesPinned: [],
      seriesPresets: [],
      savedFilters: [],
      positionSnapshots: [],
      importHistory: [],
      commandHistory: [],
      seriesExpanded: [],
      settings: { ...DEFAULTS }
    };
    seriesExpanded.clear();
    seriesExpandedReady = false;
    seriesQuery = '';
    seriesSelected.clear();
    previewApplyFn = null;
    cmdContext = null;
    quotaWarned = false;
    lastSavedAt = 0;
    saving = false;
    saveFailing = false;
    saveWarned = false;
    updateSaveBadge();
    const retryCacheBtn = $('#btnRetryCache');
    if (retryCacheBtn) setVisible(retryCacheBtn, false);
    const seriesSearchReset = $('#seriesSearch');
    if (seriesSearchReset) seriesSearchReset.value = '';
    cancelSortDrag();
    updateBackupCount();
    fillSeriesSelect();
    applySettings();
    render();
    // Persistir el estado vacío al final garantiza que ninguna escritura
    // anterior (pendiente o en curso) reviva los datos borrados.
    pendingSave = false;
    try { await persistNow(); } catch (e) {}
    toast('Todos los datos han sido restablecidos');
  });

  const gridEl = $('#grid');
  gridEl.addEventListener('pointerdown', onPointerDown);
  // Mantener pulsada una tarjeta (en el móvil) la marca o desmarca
  gridEl.addEventListener('contextmenu', (e) => {
    const card = e.target.closest ? e.target.closest('.card') : null;
    if (!card || !gridEl.contains(card) || !byId.has(card.dataset.id)) return;
    e.preventDefault();
    const id = card.dataset.id;
    if (selection.has(id)) selection.delete(id); else selection.add(id);
    lastClicked = id;
    updateSelectionUI();
  });
  gridEl.addEventListener('click', (e) => {
    if (Date.now() - lastDragEnd < 300) return;
    const card = e.target.closest ? e.target.closest('.card') : null;
    if (!card || !gridEl.contains(card) || e.target.closest('.pin-btn')) return;
    const id = card.dataset.id;
    if (!byId.has(id) || e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest('.tick') || selection.size > 0) {
      if (selection.has(id)) selection.delete(id); else selection.add(id);
      lastClicked = id;
      updateSelectionUI();
      return;
    }
    openEdit(id);
  });
  gridEl.addEventListener('keydown', onGridKeyDown);

  const applySearch = debounce(() => { render(); saveSoon(); }, 160);
  $('#search').addEventListener('input', e => { state.settings.search = e.target.value; applySearch(); });
  $('#seriesSelect').addEventListener('change', e => { state.settings.series = e.target.value; render(); saveSoon(); });
  $('#keyFilter').addEventListener('change', e => { state.settings.keyFilter = e.target.value; render(); saveSoon(); });
  $('#noteFilter').addEventListener('input', e => { state.settings.noteFilter = e.target.value; render(); saveSoon(); });
  $('#optNote').addEventListener('change', e => { state.settings.onlyNote = e.target.checked; render(); saveSoon(); });
  $('#optShowNotes').addEventListener('change', e => { state.settings.showNotesOnCards = e.target.checked; render(); saveSoon(); });
  $('#pageSizeSelect').addEventListener('change', e => { state.settings.pageSize = Number(e.target.value) || 0; render(); saveSoon(); });
  $('#optGroup').addEventListener('change', e => { state.settings.groupBySeries = e.target.checked; applySettings(); render(); saveSoon(); });
  $('#optGifs').addEventListener('change', e => { state.settings.pauseGifs = e.target.checked; render(); saveSoon(); });
  $('#cardSize').addEventListener('input', e => { state.settings.cardSize = Number(e.target.value); applySettings(); saveSoon(); });
}

async function init() {
  bindEvents();
  await initStorage();
  state.settings.search = '';
  state.settings.series = '';
  fillSeriesSelect();
  applySettings();
  render();

  let savedTab = 'home';
  try { savedTab = localStorage.getItem(TAB_LS) || 'home'; } catch (e) {}
  switchTab(savedTab);

  window.addEventListener('pagehide', () => { void flushSave(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) void flushSave(); });

  if (!state.chars.length) return;

  await loadThumbs();
  render();
  startCaching();
}

/* ================= API pública para la capa móvil (v4) ================= */
window.MudaeApp = {
  // modales / paneles
  openImportModal, closeImportModal, openDrawer, closeDrawer,
  openStatsModal, openHistoryModal, openBackupsModal, openPendingCenter,
  openHelp, openFiltersModal, openDuplicatesModal, openSm, openEdit,
  // acciones
  exportProject, undo, redo, sortBy, previewSeriesApply, applySeriesOrderToLibrary,
  resetLibraryOrder, togglePin, createManualBackup, divorceSelected, undoDivorce,
  // orden / selección
  moveBlock, moveToEdge, moveToExactPosition,
  toggleSelected(id) {
    if (selection.has(id)) selection.delete(id); else selection.add(id);
    lastClicked = id;
    updateSelectionUI();
  },
  selectAllVisible() { selection = new Set(visibleIds()); updateSelectionUI(); },
  clearSelection() { selection.clear(); updateSelectionUI(); },
  getSelectionCount() { return selection.size; },
  // consultas / ajustes
  getSettings() { return state.settings; },
  hasData() { return state.chars.length > 0; },
  isGrouped() { return !!state.settings.groupBySeries; },
  setGrouped(v) { state.settings.groupBySeries = !!v; applySettings(); render(); saveSoon(); },
  isPerformanceMode() { return !!state.settings.performanceMode; },
  setPerformanceMode(v) {
    state.settings.performanceMode = !!v;
    applyVisualTheme();
    render();
    saveSoon();
  },
  refresh() { render(); },
  notify(msg) { toast(msg); },
  // v5
  getChars() { return state.chars; },
  getState() { return state; },
  imgSrc(c) { return srcFor(c); },
  exportCommand() { return exportCommand(); },
  t(text) { return window.I18N ? window.I18N.translate(String(text)) : String(text); },
  getOrder() { return state.order; },
  // Cambia un ajuste y aplica sus efectos (tema, tamaño de tarjeta, vista agrupada…)
  setSetting(key, value) {
    state.settings[key] = value;
    if (key === 'cardSize') document.documentElement.style.setProperty('--card-w', value + 'px');
    if (key === 'groupBySeries' || key === 'showRank' || key === 'showPos' || key === 'showSpheres' || key === 'showKakera' || key === 'showKeys' || key === 'showSeries' || key === 'pageSize' || key === 'compactMode' || key === 'pauseGifs') {
      applyVisualTheme();
      render();
    } else if (key === 'performanceMode') {
      applyVisualTheme();
      render();
      if (!value) { failed.clear(); startCaching(); }
    } else {
      applyVisualTheme();
    }
    saveSoon();
    document.dispatchEvent(new CustomEvent('seiri:setting', { detail: { key, value } }));
  },
  setKeyFilter(value) {
    state.settings.keyFilter = String(value || 'all');
    const el = $('#keyFilter');
    if (el) el.value = state.settings.keyFilter;
    render();
    saveSoon();
  },
  setSearch(text) {
    state.settings.search = String(text || '');
    const el = $('#search');
    if (el) el.value = state.settings.search;
    render();
    saveSoon();
  },
  setSeriesFilter(name) {
    state.settings.series = String(name || '');
    const el = $('#seriesSelect');
    if (el) el.value = state.settings.series;
    render();
    saveSoon();
    switchTab('lib');
  },
  listPositionSnapshots, savePositionSnapshot, restorePositionSnapshot, deletePositionSnapshot, orderDiff,
  resetToMudaeOrder() { resetLibraryOrder(); },
  getEditingId() { return editingId; },
  openModal: openModalById,
  closeModal: closeModalById,
  // Carga un proyecto (o uno vacío si obj es null) conservando los ajustes visuales actuales.
  async loadProject(obj) {
    pendingSave = false;
    try { await writeChain; } catch (e) {}
    const keep = state.settings;
    setProject({ ...(obj || {}), chars: (obj && obj.chars) || [], settings: { ...keep } });
    state.settings.series = '';
    state.settings.search = '';
    selection.clear();
    failed.clear();
    galleries2.clear();
    divorceUndo = null;
    save();
    fillSeriesSelect();
    updateTagFilter();
    applySettings();
    render();
    updateBackupCount();
    updateDivorceUndoButton();
    if (state.chars.length) startCaching();
  },

  getSelection() { return Array.from(selection); },
  getById(id) { return byId.get(id); },
  save() { saveSoon(); },
  copyText, download, openEdit,
  // Para el módulo Fotos
  fetchMudaeHtml,
  idbGet, idbPutStore,
  // Cambia la imagen de varios personajes a la vez: [[idDelPersonaje, url], …] 
  async useImages(pairs) {
    const list = (pairs || []).map(([id, url]) => [byId.get(id), url]).filter(([c, url]) => c && url);
    if (!list.length) return 0;
    pushUndo();
    for (const [c, url] of list) c.image = url;
    save();
    for (const [c] of list) {
      try {
        const rec = await fetchThumb(c);
        thumbs.set(c.id, rec);
        setThumbUrls(c.id, rec);
        await idbPut(c.id, rec);
      } catch (e) { /* se queda la imagen remota */ }
    }
    render();
    return list.length;
  },
  switchTab(t) { switchTab(t); },
  serialize() { return projectData(); },
  setAutoFile(path) {
    state.settings.autoFileEnabled = true;
    state.settings.autoFilePath = path;
    updateAutoFileUI();
    saveSoon();
  },
  importText(text) {
    openImportModal();
    const el = $('#importText');
    if (el) { el.value = text; updateImportDiag(); }
  }
};

init();

})();