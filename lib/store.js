// Almacen en memoria con dedupe y persistencia simple a disco.
import { EventEmitter } from "node:events";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const ITEMS_FILE = join(DATA_DIR, "items.json");

const MAX_ITEMS = 600;

export const bus = new EventEmitter();

let items = [];           // mas reciente primero
const seen = new Set();   // ids ya vistos (evita duplicados y re-alertas)

export function makeId(item) {
  const key = item.link || item.guid || `${item.source}:${item.title}`;
  return createHash("sha1").update(key).digest("hex").slice(0, 16);
}

// --- Deteccion de historias duplicadas entre fuentes (misma noticia en
// CoinDesk + Cointelegraph + ...): similitud de titulares por tokens. ---
const STOP = new Set([
  "the", "a", "an", "of", "to", "in", "on", "for", "and", "as", "is", "at",
  "by", "with", "after", "amid", "over", "from", "its", "his", "her", "their",
  "this", "that", "are", "be", "has", "have", "was", "will", "how", "why",
  "what", "new", "says", "amid", "could", "more", "into", "up", "down",
]);
function titleTokens(s = "") {
  const out = new Set();
  for (const w of s.toLowerCase().replace(/[^a-z0-9$\s]/g, " ").split(/\s+/)) {
    if (w.length > 2 && !STOP.has(w)) out.add(w);
  }
  return out;
}
function jaccard(a, b) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

// Busca una noticia reciente de OTRA fuente que cuente la misma historia.
function findDuplicate(item) {
  if (item.sourceType !== "news" || (item.title || "").length < 35) return null;
  const toks = titleTokens(item.title);
  if (toks.size < 4) return null;
  for (const prev of items.slice(0, 150)) {
    if (prev.sourceType !== "news") continue;
    if (prev.source === item.source) continue;
    if (Math.abs(prev.ts - item.ts) > 48 * 3600000) continue;
    const ptoks = titleTokens(prev.title);
    if (ptoks.size < 4) continue;
    if (jaccard(toks, ptoks) >= 0.55) return prev;
  }
  return null;
}

export async function load() {
  try {
    const raw = await readFile(ITEMS_FILE, "utf8");
    items = JSON.parse(raw);
    for (const it of items) seen.add(it.id);
    console.log(`[store] cargados ${items.length} items previos`);
  } catch {
    items = [];
  }
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await mkdir(DATA_DIR, { recursive: true });
      await writeFile(ITEMS_FILE, JSON.stringify(items.slice(0, MAX_ITEMS)), "utf8");
    } catch (e) {
      console.error("[store] error guardando:", e.message);
    }
  }, 4000);
}

// Agrega item si es nuevo. Devuelve el item agregado o null.
// Si es la misma historia que ya tenemos de otra fuente, la FUSIONA
// (chip "x fuentes" en la tarjeta existente) en vez de duplicar tarjeta+alerta.
export function add(item) {
  const id = item.id || makeId(item);
  if (seen.has(id)) return null;
  seen.add(id);

  const dup = findDuplicate(item);
  if (dup) {
    dup.alsoSources = dup.alsoSources || [];
    let changed = false;
    if (!dup.alsoSources.includes(item.source)) {
      dup.alsoSources.push(item.source);
      changed = true;
    }
    // Si la version nueva viene clasificada mas fuerte, sube la existente
    // (que un duplicado ALTO no se trague en silencio bajo una version BAJO).
    if ((item.score || 0) > (dup.score || 0)) {
      dup.score = item.score;
      dup.impact = item.impact;
      dup.categories = item.categories;
      dup.reasons = item.reasons;
      if (item.coins?.length) dup.coins = [...new Set([...(dup.coins || []), ...item.coins])];
      changed = true;
    }
    if (changed) {
      scheduleSave();
      bus.emit("update", {
        id: dup.id,
        alsoSources: dup.alsoSources,
        impact: dup.impact,
        categories: dup.categories,
      });
    }
    return null;
  }

  const full = { ...item, id };
  items.unshift(full);
  if (items.length > MAX_ITEMS) items.length = MAX_ITEMS;
  scheduleSave();
  bus.emit("item", full);
  return full;
}

export function list({ since = 0, limit = 300 } = {}) {
  return items.filter((it) => it.ts > since).slice(0, limit);
}

export function get(id) {
  return items.find((it) => it.id === id) || null;
}

export function isFirstRun() {
  return items.length === 0;
}
