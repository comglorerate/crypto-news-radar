// Indice de Miedo y Codicia (alternative.me, gratis sin key).
let cache = { value: null, classification: "", ts: 0 };

export async function fetchFearGreed() {
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=1", {
      signal: AbortSignal.timeout(10000),
    });
    const j = await r.json();
    const d = j?.data?.[0];
    if (d) {
      cache = {
        value: Number(d.value),
        classification: d.value_classification,
        ts: Date.now(),
      };
    }
  } catch (e) {
    console.warn("[fng] fallo:", e.message);
  }
  return cache;
}

export function getFearGreed() {
  return cache;
}

export function startFearGreed(intervalMs = 5 * 60 * 1000) {
  fetchFearGreed();
  return setInterval(fetchFearGreed, intervalMs);
}
