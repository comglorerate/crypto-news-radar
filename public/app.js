// Crypto News Radar — cliente.
const feedEl = document.getElementById("feed");
const emptyEl = document.getElementById("empty");

const state = {
  items: new Map(),       // id -> item
  trans: new Map(),       // id -> {title, body} traducido
  lang: load("lang", "es"),
  filterCat: "all",
  search: "",
  onlyHigh: false,
  sound: load("sound", true),
  notif: load("notif", false),
  watchlist: load("watchlist", ""),
  read: new Set(load("read", [])),
};

function load(k, def) {
  try { const v = localStorage.getItem("radar_" + k); return v === null ? def : JSON.parse(v); }
  catch { return def; }
}
function save(k, v) {
  try { localStorage.setItem("radar_" + k, JSON.stringify(v)); } catch {}
}
// El set de "leidos" no puede crecer para siempre (cuota de localStorage)
function pruneRead() {
  while (state.read.size > 1500) {
    state.read.delete(state.read.values().next().value);   // borra el mas viejo
  }
}

/* ---------- Reloj NY ---------- */
function tickClock() {
  const t = new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York", hour12: false,
  });
  document.getElementById("ny-time").textContent = t;
}
setInterval(tickClock, 1000); tickClock();

/* ---------- Utilidades ---------- */
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "ahora";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  return Math.floor(s / 86400) + "d";
}
function nyTime(ts) {
  return new Date(ts).toLocaleTimeString("en-US", {
    timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit",
  });
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// Texto a mostrar segun idioma (usa traduccion cacheada si existe)
function dispTitle(item) {
  if (state.lang === "es" && state.trans.has(item.id)) return state.trans.get(item.id).title || item.title;
  return item.title;
}
function dispBody(item) {
  if (state.lang === "es" && state.trans.has(item.id)) {
    const t = state.trans.get(item.id);
    if (t.body) return t.body;
  }
  return item.body || "";
}

function watchTerms() {
  return state.watchlist.toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
}
function matchesWatch(item) {
  const terms = watchTerms();
  if (!terms.length) return false;
  const txt = (item.title + " " + (item.body || "")).toLowerCase();
  return terms.some((t) => txt.includes(t));
}

/* ---------- Render ---------- */
function passesFilter(item) {
  if (state.onlyHigh && item.impact !== "alto") return false;
  if (state.filterCat !== "all" && !(item.categories || []).some((c) => c.cat === state.filterCat)) return false;
  if (state.search) {
    const txt = (item.title + " " + (item.body || "") + " " + item.source).toLowerCase();
    if (!txt.includes(state.search)) return false;
  }
  return true;
}

// Solo esquemas http(s): un feed RSS malicioso no puede colar javascript:/data:
function safeLink(u) {
  return /^https?:\/\//i.test(u || "") ? u : "";
}

// Chip "x fuentes" clicable (en tactil no hay tooltip): alterna la lista inline
function wireDupChip(chip, id) {
  chip.onclick = () => {
    const src = state.items.get(id)?.alsoSources || [];
    if (!src.length) return;
    const open = chip.dataset.open === "1";
    chip.dataset.open = open ? "0" : "1";
    chip.textContent = open ? `🔁 ${src.length + 1} fuentes` : `🔁 También en: ${src.join(", ")}`;
  };
}

function buildCard(item) {
  const el = document.createElement("article");
  el.className = `news ${item.impact}` +
    (item.sourceType === "trump" ? " trump" : "") +
    (item.sourceType === "x" ? " x" : "");
  el.dataset.id = item.id;
  el.dataset.ts = item.ts;
  if (state.read.has(item.id)) el.classList.add("read");
  if (matchesWatch(item)) el.classList.add("hl");

  const badge = { alto: "ALTO", medio: "MEDIO", bajo: "BAJO" }[item.impact];
  const cats = (item.categories || []).map((c) => `<span class="chip">${c.emoji} ${esc(c.label)}</span>`).join("");
  const coins = (item.coins || []).map((c) => `<span class="coin">${c}</span>`).join("");
  const dupes = item.alsoSources?.length
    ? `<span class="chip dupes" title="También en: ${esc(item.alsoSources.join(", "))}">🔁 ${item.alsoSources.length + 1} fuentes</span>`
    : "";
  const why = (item.reasons || []).join(" ");

  el.innerHTML = `
    <div class="news-top">
      <span class="badge ${item.impact}">${badge}</span>
      ${cats}${coins}${dupes}
      <span class="src">${esc(item.source)}</span>
      <span class="time">${nyTime(item.ts)} · ${timeAgo(item.ts)}</span>
    </div>
    <h2>${esc(dispTitle(item))}</h2>
    ${item.body ? `<div class="news-body">${esc(dispBody(item))}</div>` : ""}
    ${why ? `<div class="why">💡 ${esc(why)}</div>` : ""}
    <div class="news-actions">
      ${why ? `<button class="btn-why">¿Por qué importa?</button>` : ""}
      ${safeLink(item.link) ? `<a href="${esc(safeLink(item.link))}" target="_blank" rel="noopener">Abrir fuente ↗</a>` : ""}
      <button class="btn-read">${state.read.has(item.id) ? "No leído" : "Marcar leído"}</button>
    </div>`;

  const dchip = el.querySelector(".chip.dupes");
  if (dchip) wireDupChip(dchip, item.id);

  const whyBtn = el.querySelector(".btn-why");
  if (whyBtn) whyBtn.onclick = () => el.querySelector(".why").classList.toggle("open");
  el.querySelector(".btn-read").onclick = (e) => {
    if (state.read.has(item.id)) { state.read.delete(item.id); el.classList.remove("read"); e.target.textContent = "Marcar leído"; }
    else { state.read.add(item.id); el.classList.add("read"); e.target.textContent = "No leído"; }
    pruneRead();
    save("read", [...state.read]);
  };
  return el;
}

function renderAll() {
  const items = [...state.items.values()].sort((a, b) => b.ts - a.ts).filter(passesFilter);
  feedEl.querySelectorAll(".news").forEach((n) => n.remove());
  emptyEl.style.display = items.length ? "none" : "block";
  const shown = items.slice(0, 250);
  const frag = document.createDocumentFragment();
  for (const it of shown) frag.appendChild(buildCard(it));
  feedEl.appendChild(frag);
  updateStats();
  ensureTranslations(shown.slice(0, 80));
}

/* ---------- Traduccion ES ---------- */
async function ensureTranslations(items) {
  if (state.lang !== "es") return;
  const need = items.filter((i) => !state.trans.has(i.id)).map((i) => i.id);
  if (!need.length) return;
  for (let i = 0; i < need.length; i += 20) {
    const chunk = need.slice(i, i + 20);
    try {
      const r = await fetch("/api/translate?ids=" + chunk.join(","));
      const m = await r.json();
      for (const id in m) state.trans.set(id, m[id]);
      patchTranslations(chunk);
    } catch {}
  }
}
function patchTranslations(ids) {
  if (state.lang !== "es") return;
  for (const id of ids) {
    const t = state.trans.get(id);
    if (!t) continue;
    const el = feedEl.querySelector(`.news[data-id="${CSS.escape(id)}"]`);
    if (!el) continue;
    el.querySelector("h2").textContent = t.title;
    const b = el.querySelector(".news-body");
    if (b && t.body) b.textContent = t.body;
  }
}

function updateStats() {
  const all = [...state.items.values()];
  document.getElementById("stat-alto").textContent = all.filter((i) => i.impact === "alto").length;
  document.getElementById("stat-medio").textContent = all.filter((i) => i.impact === "medio").length;
  document.getElementById("stat-total").textContent = all.length;
  renderPulse();
}

/* ---------- Pulso 24h: que narrativa domina hoy ---------- */
function renderPulse() {
  const el = document.getElementById("pulse");
  if (!el) return;
  const since = Date.now() - 24 * 3600000;
  const items = [...state.items.values()].filter((i) => i.ts > since);
  if (!items.length) { el.innerHTML = `<div class="hint">Sin noticias en las últimas 24h.</div>`; return; }
  const alto = items.filter((i) => i.impact === "alto").length;
  const byCat = new Map();
  for (const it of items) {
    for (const c of it.categories || []) {
      const e = byCat.get(c.cat) || { ...c, n: 0 };
      e.n++;
      byCat.set(c.cat, e);
    }
  }
  const top = [...byCat.values()].sort((a, b) => b.n - a.n).slice(0, 3);
  const max = top[0]?.n || 1;
  el.innerHTML =
    `<div class="pulse-head"><b>${items.length}</b> noticias · <b class="pa">${alto}</b> alto impacto</div>` +
    top.map((c) =>
      `<div class="pulse-row"><span class="pl">${c.emoji} ${esc(c.label)}</span>` +
      `<span class="pulse-bar" style="width:${Math.max(8, Math.round((c.n / max) * 70))}px"></span><b>${c.n}</b></div>`
    ).join("");
}

/* ---------- Refresco de horas en sitio (sin re-render: no cierra paneles) ---------- */
function refreshTimes() {
  feedEl.querySelectorAll(".news").forEach((el) => {
    const ts = Number(el.dataset.ts);
    const t = el.querySelector(".time");
    if (ts && t) t.textContent = `${nyTime(ts)} · ${timeAgo(ts)}`;
  });
  renderPulse();   // la ventana movil de 24h tambien avanza con el reloj
}

/* ---------- Alertas ---------- */
let audioCtx;
function beep(high) {
  if (!state.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const tones = high ? [880, 1100, 880] : [660];
    tones.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = f; o.type = "sine";
      o.connect(g); g.connect(audioCtx.destination);
      const t = now + i * 0.14;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.start(t); o.stop(t + 0.14);
    });
  } catch {}
}

function showBanner(item) {
  const b = document.getElementById("alert-banner");
  document.getElementById("ab-text").textContent = `${item.source}: ${item.title.slice(0, 110)}`;
  b.classList.remove("hidden");
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.add("hidden"), 9000);
}

// "Notification" no existe en iOS Safari fuera de PWA instalada: siempre con guarda.
function canNotify() {
  return "Notification" in window && state.notif && Notification.permission === "granted";
}

function notify(item) {
  if (!canNotify()) return;
  const n = new Notification("🔴 Alto impacto — " + item.source, { body: item.title.slice(0, 160) });
  // Clic en la notificacion: trae la pestaña al frente y resalta la noticia
  n.onclick = () => {
    window.focus();
    n.close();
    const el = feedEl.querySelector(`.news[data-id="${CSS.escape(item.id)}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("flash");
      void el.offsetWidth;            // reinicia la animacion
      el.classList.add("flash");
    }
  };
}

/* Contador de ALTO no vistos en el titulo de la pestaña (cuando estas en otra) */
const BASE_TITLE = document.title;
let unseenHigh = 0;
function bumpTabTitle() {
  if (document.visibilityState === "visible") return;
  unseenHigh++;
  document.title = `(${unseenHigh}🔴) Crypto Radar`;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    unseenHigh = 0;
    document.title = BASE_TITLE;
  }
});

// Pestaña siempre abierta: poda los mapas del cliente para no crecer sin limite.
function pruneClient() {
  if (state.items.size <= 650) return;
  const viejos = [...state.items.values()].sort((a, b) => a.ts - b.ts);
  for (const it of viejos.slice(0, state.items.size - 600)) {
    state.items.delete(it.id);
    state.trans.delete(it.id);
  }
}

function onNewItem(item, isLive) {
  // Un restart del server re-emite items que ya tenemos: no duplicar tarjeta ni alerta.
  if (state.items.has(item.id)) { state.items.set(item.id, item); return; }
  state.items.set(item.id, item);
  pruneClient();
  if (isLive && passesFilter(item)) {
    const card = buildCard(item);
    card.classList.add("flash");
    emptyEl.style.display = "none";
    // insercion ordenada por ts (los lotes SSE no siempre llegan en orden)
    let anchor = null;
    for (const n of feedEl.querySelectorAll(".news")) {
      if (Number(n.dataset.ts) <= item.ts) { anchor = n; break; }
    }
    feedEl.insertBefore(card, anchor);
    feedEl.querySelectorAll(".news")[251]?.remove();
    ensureTranslations([item]);
  }
  if (isLive && item.impact === "alto" && !item.isHistory) {
    beep(true); showBanner(item); notify(item); bumpTabTitle();
  } else if (isLive && item.impact === "medio" && matchesWatch(item) && !item.isHistory) {
    beep(false);
  }
  updateStats();
}

/* ---------- Conexión ---------- */
async function loadInitial() {
  try {
    const r = await fetch("/api/items");
    const items = await r.json();
    for (const it of items) state.items.set(it.id, it);
    renderAll();
  } catch (e) { console.warn("init", e); }
}

// Tras un corte SSE, recupera lo emitido durante la desconexion.
// Lo mas viejo de 15 min entra sin sonido (isHistory) para no armar tormenta.
async function catchUp() {
  try {
    let since = 0;
    for (const it of state.items.values()) if (it.ts > since) since = it.ts;
    if (!since) return;
    const r = await fetch("/api/items?since=" + since);
    const missed = await r.json();
    for (const it of missed.reverse()) {           // viejos primero: orden correcto
      if (it.ts < Date.now() - 15 * 60000) it.isHistory = true;
      onNewItem(it, true);
    }
  } catch {}
}

function connectSSE() {
  const es = new EventSource("/events");
  const conn = document.getElementById("conn");
  let hadSession = false;
  es.onopen = () => {
    conn.classList.add("live");
    document.getElementById("conn-text").textContent = "en vivo";
    if (hadSession) catchUp();                     // reconexion: recupera lo perdido
    hadSession = true;
  };
  es.onerror = () => { conn.classList.remove("live"); document.getElementById("conn-text").textContent = "reconectando…"; };
  es.onmessage = (ev) => {
    try { onNewItem(JSON.parse(ev.data), true); } catch {}
  };
  // Historia duplicada fusionada en el server: actualiza chip "x fuentes" e impacto
  es.addEventListener("update", (ev) => {
    try {
      const u = JSON.parse(ev.data);
      const it = state.items.get(u.id);
      if (it) {
        it.alsoSources = u.alsoSources;
        if (u.impact) it.impact = u.impact;
        if (u.categories) it.categories = u.categories;
      }
      const el = feedEl.querySelector(`.news[data-id="${CSS.escape(u.id)}"]`);
      if (!el) return;
      // sube el badge si el server subio la clasificacion
      if (u.impact) {
        el.classList.remove("alto", "medio", "bajo");
        el.classList.add(u.impact);
        const b = el.querySelector(".badge");
        if (b) {
          b.className = "badge " + u.impact;
          b.textContent = { alto: "ALTO", medio: "MEDIO", bajo: "BAJO" }[u.impact];
        }
      }
      if (!u.alsoSources?.length) return;
      let chip = el.querySelector(".chip.dupes");
      if (!chip) {
        chip = document.createElement("span");
        chip.className = "chip dupes";
        el.querySelector(".news-top .src")?.before(chip);
      }
      chip.textContent = `🔁 ${u.alsoSources.length + 1} fuentes`;
      chip.title = "También en: " + u.alsoSources.join(", ");
      chip.dataset.open = "0";
      wireDupChip(chip, u.id);
    } catch {}
  });
}

async function loadFearGreed() {
  try {
    const r = await fetch("/api/feargreed"); const d = await r.json();
    if (d && d.value != null) {
      document.getElementById("fng-value").textContent = d.value;
      document.getElementById("fng-label").textContent = d.classification || "";
      document.getElementById("fng-fill").style.left = d.value + "%";
      const v = d.value;
      const color = v < 25 ? "#ff4d5e" : v < 45 ? "#ffb13d" : v < 55 ? "#d7e0ee" : v < 75 ? "#9be37a" : "#34d399";
      document.getElementById("fng-value").style.color = color;
    }
  } catch {}
}

/* ---------- Ticker de precios en vivo + detector de velones ---------- */
const TICKER_SYMS = [["BTC", "btcusdt"], ["ETH", "ethusdt"], ["SOL", "solusdt"]];
const prices = {};              // sym -> {price, chg}
let tickerWs = null, wsAlive = false, pricePollTimer = null, lastTickerRender = 0;
const btcHist = [];             // muestras {t, p} de BTC (ventana ~6 min)
let lastBtcSample = 0, lastVelonAlert = 0;

function fmtPrice(p) {
  return p >= 1000
    ? p.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : p.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function renderTicker(force) {
  const now = Date.now();
  if (!force && now - lastTickerRender < 2000) return;   // throttle
  lastTickerRender = now;
  const el = document.getElementById("ticker");
  if (!el) return;
  el.innerHTML = TICKER_SYMS.map(([sym]) => {
    const d = prices[sym];
    if (!d) return `<span class="tk"><b>${sym}</b> —</span>`;
    const cls = d.chg >= 0 ? "tk-up" : "tk-down";
    const sign = d.chg >= 0 ? "+" : "";
    return `<span class="tk"><b>${sym}</b> $${fmtPrice(d.price)}<i class="${cls}">${sign}${d.chg.toFixed(1)}%</i></span>`;
  }).join("");
}

function onPrice(sym, price, chg) {
  prices[sym] = { price, chg };
  if (sym === "BTC") sampleBtc(price);
}

// Guarda una muestra de BTC cada ~5s y vigila movimientos bruscos.
function sampleBtc(p) {
  const now = Date.now();
  if (now - lastBtcSample < 5000) return;
  lastBtcSample = now;
  btcHist.push({ t: now, p });
  while (btcHist.length && btcHist[0].t < now - 6 * 60000) btcHist.shift();
  checkVelon(p, now);
}

// Velon: BTC se mueve >=0.8% dentro de una ventana de 5 min.
function checkVelon(p, now) {
  if (now - lastVelonAlert < 10 * 60000) return;         // cooldown 10 min
  const ref = btcHist.find((x) => x.t >= now - 5 * 60000);
  if (!ref || now - ref.t < 60000) return;               // necesita >=1 min de historia
  const pct = ((p - ref.p) / ref.p) * 100;
  if (Math.abs(pct) < 0.8) return;
  lastVelonAlert = now;
  const mins = Math.max(1, Math.round((now - ref.t) / 60000));
  const dir = pct > 0 ? "📈 sube" : "📉 cae";
  beep(true);
  showBanner({ source: "🚨 Velón BTC", title: `BTC ${dir} ${pct.toFixed(1)}% en ${mins} min — revisa el feed y tu gráfico` });
  if (canNotify()) {
    const n = new Notification("🚨 Velón en BTC", { body: `BTC ${dir} ${pct.toFixed(1)}% en ${mins} min` });
    n.onclick = () => { window.focus(); n.close(); };
  }
}

// Fuente primaria: WebSocket publico de Binance spot (tiempo real).
// Cuidados: el watchdog se cancela al primer mensaje/cierre (no mata sockets
// reconectados), los eventos de sockets viejos se ignoran, y al revivir el WS
// se apaga el poll de respaldo. Al cambiar de fuente se vacia btcHist para que
// el detector de velones nunca compare precios de dos fuentes distintas.
let wsRetryTimer = null;
let priceSource = null;   // "ws" | "poll"

function setPriceSource(src) {
  if (priceSource === src) return;
  priceSource = src;
  btcHist.length = 0;      // no mezclar series: evita velones falsos
}

function startTickerWS() {
  try {
    const streams = TICKER_SYMS.map(([, s]) => s + "@miniTicker").join("/");
    const ws = new WebSocket("wss://stream.binance.com:9443/stream?streams=" + streams);
    tickerWs = ws;
    const watchdog = setTimeout(() => {
      if (!wsAlive) { try { ws.close(); } catch {} startTickerPoll(); }
    }, 12000);
    ws.onmessage = (ev) => {
      wsAlive = true;
      clearTimeout(watchdog);
      if (pricePollTimer) { clearInterval(pricePollTimer); pricePollTimer = null; }
      if (wsRetryTimer) { clearTimeout(wsRetryTimer); wsRetryTimer = null; }
      setPriceSource("ws");
      try {
        const m = JSON.parse(ev.data).data;             // {s:"BTCUSDT", c:last, o:open24h}
        const sym = m.s.replace("USDT", "");
        onPrice(sym, +m.c, ((+m.c - +m.o) / +m.o) * 100);
        renderTicker();
      } catch {}
    };
    ws.onerror = () => { if (!wsAlive) startTickerPoll(); };
    ws.onclose = () => {
      clearTimeout(watchdog);
      if (ws !== tickerWs) return;                      // socket viejo: ignorar
      if (wsAlive) { wsAlive = false; setTimeout(startTickerWS, 5000); } // reconecta
      else startTickerPoll();
    };
  } catch { startTickerPoll(); }
}

// Respaldo: nuestro server consulta CoinGecko (para redes donde Binance no abre).
// Reintenta el WebSocket cada 5 min por si el fallo fue transitorio.
function startTickerPoll() {
  if (!wsRetryTimer) {
    wsRetryTimer = setTimeout(() => { wsRetryTimer = null; startTickerWS(); }, 5 * 60000);
  }
  if (pricePollTimer) return;
  const poll = async () => {
    try {
      const r = await fetch("/api/prices");
      const j = await r.json();
      setPriceSource("poll");
      for (const sym in j) onPrice(sym, j[sym].price, j[sym].chg);
      renderTicker(true);
    } catch {}
  };
  poll();
  pricePollTimer = setInterval(poll, 60000);
}

/* ---------- Calendario macro ---------- */
let calEvents = [];
const calAlerted = new Set(load("calAlerted", []));

function nyDateTime(ts) {
  return new Date(ts).toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}
function countdown(ms) {
  if (ms <= 0) return "ahora";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `en ${d}d ${h}h`;
  if (h > 0) return `en ${h}h ${m}m`;
  return `en ${m}m`;
}

async function loadCalendar() {
  try {
    const r = await fetch("/api/calendar");
    calEvents = await r.json();
    renderCalendar();
  } catch {}
}
function renderCalendar() {
  const now = Date.now();
  const up = calEvents
    .map((e) => ({ ...e, ts: Date.parse(e.iso) }))
    .filter((e) => e.ts > now - 3600000)
    .sort((a, b) => a.ts - b.ts)
    .slice(0, 6);
  const el = document.getElementById("cal-list");
  if (!up.length) { el.innerHTML = `<div class="hint">Sin eventos próximos.</div>`; return; }
  el.innerHTML = up.map((e) => {
    const diff = e.ts - now;
    const imminent = diff > 0 && diff < 3600000;
    const live = diff <= 0;
    const when = (e.approx ? "≈ " : "") + nyDateTime(e.ts) + " NY";
    const tip = e.approx ? e.why + " — Fecha aproximada; se confirma al acercarse." : e.why;
    return `<div class="cal-item ${imminent ? "imminent" : ""} ${live ? "live" : ""}" title="${esc(tip)}">
      <div class="cal-when">${esc(when)}</div>
      <div class="cal-title">${e.emoji} ${esc(e.title)}</div>
      <div class="cal-count">${live ? "🔴 EN CURSO" : countdown(diff)}</div>
    </div>`;
  }).join("");
}
function checkCalAlerts() {
  const now = Date.now();
  for (const e of calEvents) {
    const ts = Date.parse(e.iso);
    const diff = ts - now;
    if (diff > 0 && diff <= 15 * 60000 && !calAlerted.has(e.id + ":15")) {
      calAlerted.add(e.id + ":15"); save("calAlerted", [...calAlerted]);
      beep(true);
      showBanner({ source: "📅 Evento macro", title: `${e.title} en ~15 min (${nyDateTime(ts)} NY)` });
      if (canNotify()) {
        const n = new Notification("📅 Evento macro inminente", { body: `${e.title} en ~15 min` });
        n.onclick = () => { window.focus(); n.close(); };
      }
    }
    if (diff <= 0 && diff > -120000 && !calAlerted.has(e.id + ":0")) {
      calAlerted.add(e.id + ":0"); save("calAlerted", [...calAlerted]);
      beep(true);
      showBanner({ source: "📅 AHORA", title: `${e.title} — publicándose AHORA` });
    }
  }
}

/* ---------- Controles ---------- */
function syncLang() {
  document.getElementById("btn-lang").textContent = state.lang === "es" ? "🌐 ES" : "🌐 EN";
  document.getElementById("btn-lang").classList.toggle("on", state.lang === "es");
}
document.getElementById("btn-lang").onclick = () => {
  state.lang = state.lang === "es" ? "en" : "es";
  save("lang", state.lang); syncLang(); renderAll();
};

function syncToggles() {
  document.getElementById("btn-sound").classList.toggle("on", state.sound);
  document.getElementById("btn-notif").classList.toggle("on", state.notif);
  document.getElementById("btn-onlyhigh").classList.toggle("on", state.onlyHigh);
}

document.getElementById("btn-sound").onclick = () => { state.sound = !state.sound; save("sound", state.sound); syncToggles(); if (state.sound) beep(false); };
document.getElementById("btn-notif").onclick = async () => {
  if (!("Notification" in window)) return;          // iOS Safari sin PWA: no soportado
  if (!state.notif && Notification.permission !== "granted") {
    const p = await Notification.requestPermission(); if (p !== "granted") return;
  }
  state.notif = !state.notif; save("notif", state.notif); syncToggles();
};
document.getElementById("btn-onlyhigh").onclick = () => { state.onlyHigh = !state.onlyHigh; save("onlyHigh", state.onlyHigh); syncToggles(); renderAll(); };

document.getElementById("cat-filters").onclick = (e) => {
  const b = e.target.closest(".cat"); if (!b) return;
  document.querySelectorAll(".cat").forEach((c) => c.classList.remove("active"));
  b.classList.add("active"); state.filterCat = b.dataset.cat; renderAll();
};

document.getElementById("search").oninput = (e) => { state.search = e.target.value.toLowerCase().trim(); renderAll(); };
const wl = document.getElementById("watchlist");
wl.value = state.watchlist;
wl.oninput = (e) => { state.watchlist = e.target.value; save("watchlist", state.watchlist); renderAll(); };
document.getElementById("btn-clear-read").onclick = () => {
  [...state.items.keys()].forEach((id) => state.read.add(id));
  pruneRead();
  save("read", [...state.read]); renderAll();
};
document.getElementById("ab-close").onclick = () => document.getElementById("alert-banner").classList.add("hidden");

/* ---------- Init ---------- */
state.onlyHigh = load("onlyHigh", false);
syncToggles();
syncLang();
loadInitial();
connectSSE();
loadFearGreed();
loadCalendar();
renderTicker(true);
startTickerWS();
setInterval(loadFearGreed, 5 * 60 * 1000);
setInterval(renderCalendar, 60 * 1000);
setInterval(checkCalAlerts, 30 * 1000);
// refresca los "hace X" EN SITIO cada 30s (sin re-render: no cierra paneles ni parpadea)
setInterval(refreshTimes, 30 * 1000);
