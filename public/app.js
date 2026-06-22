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
function save(k, v) { localStorage.setItem("radar_" + k, JSON.stringify(v)); }

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
function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

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

function buildCard(item) {
  const el = document.createElement("article");
  el.className = `news ${item.impact}` +
    (item.sourceType === "trump" ? " trump" : "") +
    (item.sourceType === "x" ? " x" : "");
  el.dataset.id = item.id;
  if (state.read.has(item.id)) el.classList.add("read");
  if (matchesWatch(item)) el.classList.add("hl");

  const badge = { alto: "ALTO", medio: "MEDIO", bajo: "BAJO" }[item.impact];
  const cats = (item.categories || []).map((c) => `<span class="chip">${c.emoji} ${esc(c.label)}</span>`).join("");
  const coins = (item.coins || []).map((c) => `<span class="coin">${c}</span>`).join("");
  const why = (item.reasons || []).join(" ");

  el.innerHTML = `
    <div class="news-top">
      <span class="badge ${item.impact}">${badge}</span>
      ${cats}${coins}
      <span class="src">${esc(item.source)}</span>
      <span class="time">${nyTime(item.ts)} · ${timeAgo(item.ts)}</span>
    </div>
    <h2>${esc(dispTitle(item))}</h2>
    ${item.body ? `<div class="news-body">${esc(dispBody(item))}</div>` : ""}
    ${why ? `<div class="why">💡 ${esc(why)}</div>` : ""}
    <div class="news-actions">
      ${why ? `<button class="btn-why">¿Por qué importa?</button>` : ""}
      ${item.link ? `<a href="${esc(item.link)}" target="_blank" rel="noopener">Abrir fuente ↗</a>` : ""}
      <button class="btn-read">${state.read.has(item.id) ? "No leído" : "Marcar leído"}</button>
    </div>`;

  const whyBtn = el.querySelector(".btn-why");
  if (whyBtn) whyBtn.onclick = () => el.querySelector(".why").classList.toggle("open");
  el.querySelector(".btn-read").onclick = (e) => {
    if (state.read.has(item.id)) { state.read.delete(item.id); el.classList.remove("read"); e.target.textContent = "Marcar leído"; }
    else { state.read.add(item.id); el.classList.add("read"); e.target.textContent = "No leído"; }
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

function notify(item) {
  if (!state.notif || Notification.permission !== "granted") return;
  new Notification("🔴 Alto impacto — " + item.source, { body: item.title.slice(0, 160) });
}

function onNewItem(item, isLive) {
  state.items.set(item.id, item);
  if (isLive && passesFilter(item)) {
    const card = buildCard(item);
    card.classList.add("flash");
    emptyEl.style.display = "none";
    feedEl.insertBefore(card, feedEl.firstChild);
    feedEl.querySelectorAll(".news")[251]?.remove();
    ensureTranslations([item]);
  }
  if (isLive && item.impact === "alto" && !item.isHistory) {
    beep(true); showBanner(item); notify(item);
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

function connectSSE() {
  const es = new EventSource("/events");
  const conn = document.getElementById("conn");
  es.onopen = () => { conn.classList.add("live"); document.getElementById("conn-text").textContent = "en vivo"; };
  es.onerror = () => { conn.classList.remove("live"); document.getElementById("conn-text").textContent = "reconectando…"; };
  es.onmessage = (ev) => {
    try { onNewItem(JSON.parse(ev.data), true); } catch {}
  };
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
      if (state.notif && Notification.permission === "granted")
        new Notification("📅 Evento macro inminente", { body: `${e.title} en ~15 min` });
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
setInterval(loadFearGreed, 5 * 60 * 1000);
setInterval(renderCalendar, 60 * 1000);
setInterval(checkCalAlerts, 30 * 1000);
// refresca los "hace X" cada minuto (sin re-traducir: usa cache)
setInterval(renderAll, 60000);
