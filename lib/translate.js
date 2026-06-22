// Traduccion gratis via endpoint publico de Google (sin API key).
// Con cache en memoria y limitador de concurrencia para no saturar.

const cache = new Map();      // texto original -> traduccion (o promesa)
let active = 0;
const queue = [];
const MAX_CONCURRENT = 5;

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const { fn, res } = queue.shift();
    active++;
    Promise.resolve()
      .then(fn)
      .then(res, () => res(null))
      .finally(() => { active--; pump(); });
  }
}
function schedule(fn) {
  return new Promise((res) => { queue.push({ fn, res }); pump(); });
}

async function doTranslate(text, target) {
  const q = text.slice(0, 1800);
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" +
    encodeURIComponent(target) + "&dt=t&q=" + encodeURIComponent(q);
  const r = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const j = await r.json();
  const out = (j[0] || []).map((seg) => seg[0]).join("");
  return out || text;
}

export async function translate(text, target = "es") {
  if (!text || text.length < 2) return text;
  const key = target + "::" + text;
  if (cache.has(key)) return cache.get(key);
  const p = schedule(() => doTranslate(text, target)).then((r) => r || text);
  cache.set(key, p);             // cachea la promesa para deduplicar en paralelo
  const result = await p;
  cache.set(key, result);        // luego cachea el valor final
  return result;
}
