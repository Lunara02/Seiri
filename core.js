/* ============================================================================
   Núcleo puro del Gestor de Colección Mudae (v4)
   ----------------------------------------------------------------------------
   Utilidades SIN dependencias del DOM ni del estado de la aplicación:
     · formato genérico (fechas, números, escape, colores),
     · normalización de texto y nombres,
     · parser robusto de las exportaciones de Mudae ($mmsaty+z+ri-c+x+ko),
     · constructores de comandos ($sm y $divorce).

   Se carga como script clásico ANTES de app.js (nada de módulos ES, para que
   siga funcionando también desde file://). Expone todo en window.MudaeCore.
   ========================================================================== */
(() => {
'use strict';

/* ---------- formato y utilidades genéricas ---------- */
const debounce = (fn, ms) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const fmtKakera = (n) => (n === null || n === undefined || !Number.isFinite(Number(n))) ? '0' : Number(n).toLocaleString((window.I18N && window.I18N.locale()) || 'es-ES');
const dateStamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hexToRgba(hex, alpha = 0.22) {
  const m = String(hex || '').replace('#', '');
  if (m.length !== 6) return `rgba(139,92,246,${alpha})`;
  const r = parseInt(m.slice(0, 2), 16) || 0;
  const g = parseInt(m.slice(2, 4), 16) || 0;
  const b = parseInt(m.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

function adjustHexBg(hex, delta) {
  const m = String(hex || '').replace('#', '');
  if (m.length !== 6) return '#161920';
  const clamp = (n) => Math.max(0, Math.min(255, n));
  const r = clamp((parseInt(m.slice(0, 2), 16) || 0) + delta);
  const g = clamp((parseInt(m.slice(2, 4), 16) || 0) + delta);
  const b = clamp((parseInt(m.slice(4, 6), 16) || 0) + delta);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/* ---------- lógica pura y parser robusto ---------- */
function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

// Emojis de llave de Mudae: :key:, :bronzekey:, :silverkey:, :goldkey:,
// :chaoskey:, :soulkey:, sus formatos custom <:bronzekey:123> y el emoji 🔑.
const KEY_TOKEN_SRC = '(?:<a?:(?:key|bronzekey|silverkey|goldkey|chaoskey|soulkey):\\d+>|:(?:key|bronzekey|silverkey|goldkey|chaoskey|soulkey):|🔑|🗝️)';

function keyTokenRe(flags = 'gi') {
  return new RegExp(KEY_TOKEN_SRC, flags);
}

// Devuelve la cantidad de llaves y el texto sin tokens ni contadores de llaves.
// Formatos: "🔑 (3)", ":bronzekey:  (1)", ":silverkey: (2) :bronzekey: (1)",
// "<:goldkey:123> (4)" o tokens sueltos sin contador (cada uno vale 1).
function extractKeyInfo(text) {
  let out = String(text || '');
  let keys = 0;
  const add = n => { keys += Math.max(0, Number(String(n).replace(/[^\d]/g, '')) || 0); };

  out = out.replace(new RegExp('(' + KEY_TOKEN_SRC + ')\\s*\\(\\s*([\\d.,]+)\\s*\\)', 'gi'), (_, _token, count) => {
    add(count);
    return ' ';
  });
  out = out.replace(new RegExp('(' + KEY_TOKEN_SRC + ')\\s*([\\d.,]+)\\b', 'gi'), (_, _token, count) => {
    add(count);
    return ' ';
  });
  out = out.replace(keyTokenRe('gi'), () => {
    keys += 1;
    return ' ';
  });

  return { keys, text: out };
}

function cleanCharName(raw) {
  return String(raw || '')
    .replace(/🚫/g, '')
    .replace(/^[-•·*\s]*#[\d.,]+\s*(?:-\s*)?/, '')
    .replace(/\s*(?:💞|💕|❤️|♥️)?\s*=>\s*.*$/, '')
    .replace(keyTokenRe('gi'), '')
    .replace(/^[·•|\-\s]+|[·•|\-\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanNoteText(raw) {
  return String(raw || '')
    .replace(keyTokenRe('gi'), ' ')
    .replace(/^[·•|\s]+|[·•|\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTag(raw) {
  return String(raw || '')
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32);
}

function parseTags(raw) {
  const out = [];
  const seen = new Set();
  for (const part of String(raw || '').split(/[,;]+/)) {
    const t = cleanTag(part);
    const k = norm(t);
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.slice(0, 12);
}

function makeId(series, name) { return norm(series) + '::' + norm(cleanCharName(name)); }

function normalizeImageUrl(url) {
  const m = String(url).match(/^https?:\/\/(?:www\.)?imgur\.com\/([A-Za-z0-9]+\.(?:gif|png|jpe?g|webp))(\?.*)?$/i);
  return m ? 'https://i.imgur.com/' + m[1] : String(url);
}

function extractMudaeId(urlOrText) {
  const m = String(urlOrText || '').match(/(?:\/uploads\/|\/character\/)(\d+)(?:\/|$)/i);
  return m ? m[1] : null;
}

// Encabezado de serie: «Nombre - 4/12». Los totales grandes llevan separador de miles
// («Marvel - 1/1.017»), por eso se aceptan puntos y comas dentro de los números.
const SERIES_HEAD_RE = /^(.+?)\s+[-\u2013\u2014]\s*(\d[\d.,]*)\s*\/\s*(\d[\d.,]*)\s*$/;

/* ---------- limpieza de lo que Discord añade al copiar ----------
   Según cómo tenga configurado Discord el usuario (modo compacto, idioma, formato de hora,
   vista previa de enlaces…) el texto copiado puede traer horas, nombres de usuario,
   caracteres invisibles o enlaces entre < >. Aquí se normaliza todo antes de leer el harem. */
const TIME_PART = String.raw`\[?\d{1,2}[:.]\d{2}(?::\d{2})?(?:\s?[ap]\.?\s?m\.?)?\]?`;
const RE_TIME_ONLY = new RegExp('^' + TIME_PART + '$', 'i');
const RE_TIME_PREFIX = new RegExp('^' + TIME_PART + '\\s+', 'i');
const RE_AUTHOR_HEAD = /^.{1,48}?\s+(?:app|bot)?\s*[—–-]\s+(?:(?:today|yesterday|hoy|ayer|heute|hier|hoje|ontem|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\b.*|(?:\S+\s+){0,3})\d{1,2}[:.]\d{2}/i;
const RE_BOT_NAME = /^(?:(?:app|bot)\s+)?(?:mudae|mudamaid)[\w-]*(?:\s+\d+)?\s*(?:app|bot)?\s*[:—–-]?\s*/i;
// Numeración de lista que Discord puede poner al copiar varios mensajes: «1. », «2. »
const RE_LIST_PREFIX = /^\d{1,3}\.\s+(?=\S)/;

function cleanDiscordText(text) {
  const stats = { invisible: 0, timestamps: 0, headers: 0, links: 0, escapes: 0, lists: 0 };
  let s = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
  s = s.replace(/[\u200b-\u200f\u2060\ufeff\u202a-\u202e]/g, () => { stats.invisible++; return ''; });
  s = s.replace(/[\u00a0\u202f\u2007\u2009]/g, ' ');
  const out = [];
  for (let line of s.split('\n')) {
    line = line.trim();
    if (!line) { out.push(''); continue; }
    if (RE_LIST_PREFIX.test(line)) { line = line.replace(RE_LIST_PREFIX, ''); stats.lists++; }
    if (RE_TIME_ONLY.test(line)) { stats.timestamps++; continue; }          // «12:41 PM» suelto
    if (/^(?:app|bot)$/i.test(line)) { stats.headers++; continue; }          // etiqueta APP / BOT
    if (RE_AUTHOR_HEAD.test(line) && !/https?:\/\//i.test(line)) { stats.headers++; continue; } // «Mudae APP — Hoy a las 12:41»
    // Modo compacto: «[12:41 PM] Mudae: texto»
    const tp = line.match(RE_TIME_PREFIX);
    if (tp && line.length > tp[0].length) {
      line = line.slice(tp[0].length).trim();
      stats.timestamps++;
    }
    // «APP Mudae:», «Mudae APP:», «Mudae:» al inicio (solo si hubo hora o lleva «:» / guion)
    const bn = line.match(RE_BOT_NAME);
    if (bn && (tp || /[:—–-]/.test(bn[0]))) {
      line = line.slice(bn[0].length).trim();
      stats.headers++;
      if (!line) continue;
    }
    // Escapes de Markdown: \_ \* \# …
    const esc = line.replace(/\\([_*~`|\\#>\[\]()<])/g, '$1');
    if (esc !== line) { stats.escapes++; line = esc; }
    // Enlaces entre < > (Discord/Mudae los usan para evitar la vista previa)
    line = line.replace(/<(https?:\/\/[^>\s]+)>/gi, (m, u) => { stats.links++; return u; });
    // Negrita/subrayado de Markdown (también en encabezados de serie)
    line = line.replace(/\*\*|__/g, '');
    out.push(line);
  }
  return { text: out.join('\n'), stats };
}

function parseExport(text) {
  const cleaned = cleanDiscordText(text);
  const rawLines = cleaned.text.split('\n');
  // Unir líneas partidas cuando el nombre está arriba y "=> usuario ... https://..." abajo
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const cur = rawLines[i].trim();
    if (!cur) continue;
    const next = (rawLines[i + 1] || '').trim();
    if (
      !/https?:\/\/\S+$/i.test(cur) &&
      !SERIES_HEAD_RE.test(cur) &&
      /^(?:💞|💕|❤️|♥️)?\s*=>/.test(next) &&
      /https?:\/\/\S+$/i.test(next)
    ) {
      lines.push(cur + ' ' + next);
      i++;
    } else {
      lines.push(cur);
    }
  }

  const chars = [];
  const series = [];
  const skipped = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const head = !/https?:\/\/\S+$/i.test(line) && line.match(SERIES_HEAD_RE);
    if (head) {
      current = {
        name: head[1].trim(),
        owned: Number(head[2].replace(/\D/g, '')),
        total: Number(head[3].replace(/\D/g, '')),
        count: 0,
      };
      series.push(current);
      continue;
    }

    // El enlace de la imagen puede venir entre < > (p. ej. «- <https://mudae.net/…png>»)
    const urlMatch = line.match(/^(.*?)\s+-\s+<?(https?:\/\/[^\s<>]+)>?\s*$/i);
    if (urlMatch) {
      let left = urlMatch[1].trim();
      // Ranking de claim (#N, flag «r» de Mudae) y personaje desactivado (🚫)
      const rankM = left.replace(/🚫/g, '').match(/^[-•·*\s]*#([\d.,]+)/);
      const rank = rankM ? (Number(rankM[1].replace(/\D/g, '')) || null) : null;
      const disabled = /🚫/.test(left);
      const right = urlMatch[2].trim();

      // Quitar guion o ranking inicial ("- #3.434Marvelous Sunday" o "#123 - Nombre")
      left = left.replace(/^[-•·*\s]*#[\d.,]+\s*(?:-\s*)?/, '').trim();

      // Quitar formato Markdown de Discord (**negrita**, __subrayado__) que rompe el reconocimiento
      left = left.replace(/\*\*|__/g, '').trim();

      // Extraer Kakera ANTES de limpiar casados (el "=> ..." borraba todo lo que iba después).
      let kakera = null;
      const NUM = '(\\d[\\d.,]*)';
      const KA_UNIT = '(?:ka\\b|kakera\\b|<a?:\\w*kakera\\w*:\\d+>|:\\w*kakera\\w*:)';
      const kaAfter = [...left.matchAll(new RegExp(NUM + '\\s*' + KA_UNIT, 'gi'))];
      const kaBefore = [...left.matchAll(new RegExp('<a?:\\w*kakera\\w*:\\d+>\\s*' + NUM, 'gi'))];
      const kaMatch = kaAfter.length ? kaAfter[kaAfter.length - 1]
        : (kaBefore.length ? kaBefore[kaBefore.length - 1] : null);
      if (kaMatch) {
        const digits = kaMatch[1].replace(/\D/g, '');
        if (digits) kakera = Number(digits);
        left = (left.slice(0, kaMatch.index) + ' ' + left.slice(kaMatch.index + kaMatch[0].length)).trim();
      }

      // Esferas ("1.200 sp", flag «z» de Mudae). Es un campo opcional: solo aparece si se pidió.
      let spheres = null;
      const spAll = [...left.matchAll(/(\d[\d.,]*)\s*sp\b/gi)];
      if (spAll.length) {
        const sm = spAll[spAll.length - 1];
        const sd = sm[1].replace(/\D/g, '');
        if (sd) spheres = Number(sd);
        left = (left.slice(0, sm.index) + ' ' + left.slice(sm.index + sm[0].length)).trim();
        // Algunas salidas añaden los beneficios tras las esferas ("… sp - 10 - url"): no forman parte del nombre
        const perkM = left.match(/\s+-\s+([A-Za-z0-9%+]{1,12})$/);
        if (perkM) left = left.slice(0, perkM.index).trim();
      }

      // Formato "NOMBRE   => dueño | nota · ($wa) · (llaves) (#HEX)"
      let forcedNote = null;
      const arrow = left.match(/^(.*?)\s*(?:💞|💕|❤️|♥️)?\s*=>\s*\S*\s*(.*)$/);
      if (arrow) {
        const tail = arrow[2].replace(/^[^|·]*/, '');
        const pm = tail.match(/^\|\s*([\s\S]*?)\s*·\s*\(\s*\$[^)]*\)([\s\S]*)$/);
        if (pm) {
          forcedNote = pm[1];
          left = (arrow[1] + ' ' + pm[2]).trim();
        } else {
          left = (arrow[1] + ' ' + tail).trim();
        }
      }

      // Extraer Color HEX (#HEX)
      let embedColor = '';
      const colMatch = left.match(/\(\s*(#[0-9a-f]{6})\s*\)/i);
      if (colMatch) {
        embedColor = colMatch[1].toUpperCase();
        left = left.replace(colMatch[0], '').trim();
      }

      // Extraer Llaves (bronce, plata, oro, caos, alma, etc.)
      const keyInfo = extractKeyInfo(left);
      let keys = keyInfo.keys;
      left = keyInfo.text.trim();

      left = left.replace(/\(\s*\$[^)]*\)/g, '').trim();
      left = left.replace(/(?:\s*[·•|]\s*)+$/g, '').trim();

      // Separar nombre y nota con "|"
      let name = left;
      let note = '';
      const barIdx = left.indexOf('|');
      if (barIdx >= 0) {
        name = left.slice(0, barIdx);
        note = left.slice(barIdx + 1);
      } else {
        const dotIdx = left.indexOf('·');
        if (dotIdx > 0 && !left.includes('=>')) {
          name = left.slice(0, dotIdx);
          note = left.slice(dotIdx + 1);
        }
      }

      name = cleanCharName(name);
      if (forcedNote !== null) note = forcedNote;
      note = cleanNoteText(note);
      if (!Number.isFinite(kakera)) kakera = null;

      if (name) {
        const seriesName = current ? current.name : 'Sin serie';
        if (current) current.count++;
        const imgUrl = normalizeImageUrl(right);
        const mudaeId = extractMudaeId(imgUrl);
        chars.push({
          id: makeId(seriesName, name),
          name,
          note,
          origNote: note,
          kakera,
          keys,
          embedColor,
          origColor: embedColor,
          pinned: false,
          series: seriesName,
          image: imgUrl,
          seriesTotal: current ? current.total : null,
          mudaeId,
          rank,
          disabled,
          spheres,
        });
        continue;
      }
    }

    skipped.push({ line: i + 1, text: line.slice(0, 160) });
  }

  return { chars, series, skipped, cleaned: cleaned.stats };
}

function buildSmBlocks(names, limit = 1800) {
  const blocks = [];
  let cur = [];
  let anchor = null;

  const flush = () => {
    if (!cur.length) return;
    const body = cur.join(' $ ');
    blocks.push(anchor ? '$smpos ' + anchor + ' $ ' + body : '$sm ' + body);
    anchor = cur[cur.length - 1];
    cur = [];
  };

  for (const raw of names) {
    const name = cleanCharName(raw);
    if (!name) continue;
    const prefix = anchor ? '$smpos ' + anchor + ' $ ' : '$sm ';
    const joined = cur.concat(name).join(' $ ');
    if (cur.length && prefix.length + joined.length > limit) flush();
    cur.push(name);
  }
  flush();
  return blocks;
}

// Comando de divorcio: $divorce nombre1 $ nombre2 $ ...
// Se divide en bloques para no superar el límite de caracteres de Discord.
function buildDivorceBlocks(names, limit = 1800) {
  const blocks = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    blocks.push('$divorce ' + cur.join(' $ '));
    cur = [];
  };
  for (const raw of names) {
    const name = cleanCharName(raw);
    if (!name) continue;
    const joined = cur.concat(name).join(' $ ');
    if (cur.length && ('$divorce ' + joined).length > limit) flush();
    cur.push(name);
  }
  flush();
  return blocks;
}

// Comando de Discord que exporta el harem: series, ruletas, llaves, ranking de claim,
// color, desactivados, Kakera, dueño y esferas (z+).
const EXPORT_COMMAND = '$mmsaty+z+ri-c+x+ko';
function exportCommand() { return EXPORT_COMMAND; }

/* ---------- API pública del núcleo ---------- */
/* Fotos que combinan («matches») de la página de un personaje de mudae.net.
   Cada <img> trae data-number (su número de foto) y data-matches (JSON con las fotos
   de otros personajes que combinan con ella). Devuelve [{ number, url, matches:[{ id, name, number, url }] }]. */
function parseMatches(html) {
  const dec = (s) => String(s).replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const attr = (tag, name) => {
    const m = tag.match(new RegExp('\\s' + name + '=(?:"([^"]*)"|\'([^\']*)\')', 'i'));
    return m ? dec(m[1] != null ? m[1] : m[2]) : '';
  };
  const okUrl = (u) => /^https:\/\/mudae\.net\/uploads\//.test(u);
  const out = [];
  const tags = String(html).match(/<img\b[^>]*\sdata-matches=[^>]*>/gi) || [];
  for (const tag of tags) {
    let list;
    try { list = JSON.parse(attr(tag, 'data-matches')); } catch (e) { continue; }
    if (!Array.isArray(list) || !list.length) continue;
    const url = attr(tag, 'data-src') || attr(tag, 'src');
    const number = Number(attr(tag, 'data-number')) || 0;
    if (!number || !okUrl(url)) continue;
    const matches = list
      .map(m => ({ id: String((m && m.id) || ''), name: String((m && m.name) || ''), number: Number(m && m.number) || 0, url: String((m && m.link) || '') }))
      .filter(m => m.id && m.number && okUrl(m.url));
    if (matches.length) out.push({ number, url, matches });
  }
  return out;
}

/* Etiquetas de cada foto de la página de un personaje: [{ number, url, tags:[…] }] */
function parseImageTags(html) {
  const dec = (s) => String(s).replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const attr = (tag, name) => {
    const m = tag.match(new RegExp('\\s' + name + '=(?:"([^"]*)"|\'([^\']*)\')', 'i'));
    return m ? dec(m[1] != null ? m[1] : m[2]) : null;
  };
  const out = new Map();
  for (const tag of String(html).match(/<img\b[^>]*\sdata-number=[^>]*>/gi) || []) {
    const raw = attr(tag, 'data-tags');
    if (raw == null) continue;
    let tags;
    try { tags = JSON.parse(raw); } catch (e) { continue; }
    if (!Array.isArray(tags)) continue;
    const number = Number(attr(tag, 'data-number')) || 0;
    const url = attr(tag, 'data-src') || attr(tag, 'src') || '';
    if (!number || !/^https:\/\/mudae\.net\/uploads\//.test(url) || out.has(number)) continue;
    out.set(number, { number, url, tags: tags.map(String) });
  }
  return [...out.values()].sort((a, b) => a.number - b.number);
}

window.MudaeCore = {
  parseMatches, parseImageTags,
  debounce, fmtKakera, dateStamp, escapeHtml, hexToRgba, adjustHexBg,
  norm, keyTokenRe, extractKeyInfo, cleanCharName, cleanNoteText, cleanTag,
  parseTags, makeId, normalizeImageUrl, extractMudaeId, parseExport,
  buildSmBlocks, buildDivorceBlocks, exportCommand, cleanDiscordText
};

})();
