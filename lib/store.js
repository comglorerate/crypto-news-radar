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
export function add(item) {
  const id = item.id || makeId(item);
  if (seen.has(id)) return null;
  seen.add(id);
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
