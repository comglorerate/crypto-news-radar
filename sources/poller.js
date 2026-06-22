// Poller de fuentes RSS: descarga, normaliza, clasifica y guarda.
import Parser from "rss-parser";
import { FEEDS } from "./feeds.js";
import { classify } from "../lib/impact.js";
import { add, isFirstRun } from "../lib/store.js";

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "Mozilla/5.0 (CryptoNewsRadar)" },
});

function stripHtml(s = "") {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(feed, entry) {
  const title = stripHtml(entry.title || "");
  let body = stripHtml(entry.contentSnippet || entry.content || entry.summary || "");
  if (body.length > 400) body = body.slice(0, 400) + "…";
  // Para Trump el "titulo" del feed suele ser la fecha; usamos el contenido como texto.
  let displayTitle = title;
  if (feed.type === "trump") {
    displayTitle = body && body.length > 3 ? body : title;
    body = "";
  }
  // Para X/Nitter el <title> ya ES el texto del tweet; el body es HTML repetido.
  if (feed.type === "x") {
    body = "";
  }
  const ts = entry.isoDate ? Date.parse(entry.isoDate) : Date.now();
  return {
    title: displayTitle,
    body,
    source: feed.name,
    sourceType: feed.type,
    link: entry.link || entry.guid || "",
    guid: entry.guid || entry.link || "",
    ts: Number.isFinite(ts) ? ts : Date.now(),
  };
}

async function pollFeed(feed) {
  try {
    const res = await parser.parseURL(feed.url);
    const firstRun = isFirstRun();
    let nuevos = 0;
    for (const entry of (res.items || []).slice(0, 25)) {
      const item = normalize(feed, entry);
      if (!item.title || item.title.length < 4) continue;
      const cls = classify(item);
      const added = add({
        ...item,
        ...cls,
        // En el primer arranque no disparamos alerta sonora (es historial)
        isHistory: firstRun,
      });
      if (added) nuevos++;
    }
    if (nuevos) console.log(`[poll] ${feed.name}: ${nuevos} nuevos`);
  } catch (e) {
    console.warn(`[poll] ${feed.name} fallo: ${e.message}`);
  }
}

export async function pollAll() {
  await Promise.all(FEEDS.map(pollFeed));
}

export function startPolling(intervalMs = 60000) {
  pollAll();
  return setInterval(pollAll, intervalMs);
}
