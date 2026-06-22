// Crypto News Radar — servidor: API + Server-Sent Events (push en vivo).
import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { load, list, get, bus } from "./lib/store.js";
import { startPolling } from "./sources/poller.js";
import { startFearGreed, getFearGreed } from "./sources/feargreed.js";
import { translate } from "./lib/translate.js";
import { getCalendar, startCalendar } from "./sources/calendar.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const POLL_MS = Number(process.env.POLL_MS || 60000);

const app = express();
app.use(express.static(join(__dirname, "public")));

// --- API REST ---
app.get("/api/items", (req, res) => {
  const since = Number(req.query.since || 0);
  res.json(list({ since, limit: 400 }));
});

app.get("/api/feargreed", (_req, res) => {
  res.json(getFearGreed());
});

app.get("/api/calendar", (_req, res) => {
  res.json(getCalendar());
});

// Traduccion bajo demanda: ?ids=a,b,c -> { id: {title, body} }
app.get("/api/translate", async (req, res) => {
  const target = (req.query.to || "es").slice(0, 5);
  const ids = String(req.query.ids || "").split(",").filter(Boolean).slice(0, 40);
  const out = {};
  await Promise.all(
    ids.map(async (id) => {
      const it = get(id);
      if (!it) return;
      // cachea la traduccion en el propio item para no repetir
      const tkey = "_tr_" + target;
      if (it[tkey]) { out[id] = it[tkey]; return; }
      const [title, body] = await Promise.all([
        translate(it.title, target),
        it.body ? translate(it.body, target) : Promise.resolve(""),
      ]);
      it[tkey] = { title, body };
      out[id] = it[tkey];
    })
  );
  res.json(out);
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: Date.now() });
});

// --- Server-Sent Events: push de items nuevos en vivo ---
const clients = new Set();

app.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("retry: 5000\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
});

bus.on("item", (item) => {
  const payload = `data: ${JSON.stringify(item)}\n\n`;
  for (const c of clients) {
    try { c.write(payload); } catch { clients.delete(c); }
  }
});

// keep-alive ping cada 25s para no cerrar la conexion
setInterval(() => {
  for (const c of clients) {
    try { c.write(": ping\n\n"); } catch { clients.delete(c); }
  }
}, 25000);

// --- Arranque ---
await load();
startPolling(POLL_MS);
startFearGreed();
startCalendar();

app.listen(PORT, () => {
  console.log(`\n  🛰️  Crypto News Radar en  http://localhost:${PORT}`);
  console.log(`  Polling cada ${POLL_MS / 1000}s · Ctrl+C para salir\n`);
});
