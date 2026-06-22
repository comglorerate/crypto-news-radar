// Calendario economico AUTOMATICO (cero mantenimiento, sin fechas hardcodeadas).
// Combina 3 fuentes gratis y sin API key, refrescadas al arrancar y cada 24h:
//   1) TradingView  -> eventos CERCANOS (~1 mes) con hora EXACTA confirmada (todos los tipos).
//   2) Fed (oficial) -> fechas de FOMC a LARGO plazo (la Fed publica ~1.5 años antes).
//   3) Calculo local -> Empleo/NFP (primer viernes, regla fija) y CPI (aprox.) para el resto.
// getCalendar() fusiona todo: por (tipo+mes) gana la fuente mas fiable (TradingView > Fed > calculo).
// Asi un CPI lejano se muestra aproximado y se vuelve exacto solito cuando TradingView lo confirma.

const WHY = {
  fomc: "Decision de tipos de la Fed (14:00 NY) + rueda de prensa de Powell. Es el evento de mayor volatilidad del mes: mueve TODO el mercado de riesgo, incluida cripto.",
  cpi: "Dato de inflacion de EEUU (08:30 NY). Define las expectativas de tipos; suele provocar un velon inmediato en BTC y altcoins.",
  nfp: "Informe de empleo / nominas no agricolas (08:30 NY). Termometro de la economia; mueve el dolar, las tasas y el apetito de riesgo global.",
  pce: "PCE: la inflacion preferida por la Fed (08:30 NY). Muy vigilada para anticipar el proximo movimiento de tipos.",
};
const META = {
  fomc: { emoji: "🏦", title: "FOMC — Decision de tipos (Fed)" },
  cpi: { emoji: "🌡️", title: "CPI — Inflacion EEUU" },
  nfp: { emoji: "💼", title: "Empleo (Nóminas no agrícolas)" },
  pce: { emoji: "📈", title: "PCE — Inflación preferida de la Fed" },
};
const PRIO = { tv: 4, fed: 3, calc_nfp: 2, calc_cpi: 1 };

// ---------- Helpers de fecha / zona horaria de Nueva York ----------
function nthWeekday(y, m0, weekday, n) {
  // weekday: 0=Dom..6=Sab. Devuelve el dia del mes del n-esimo 'weekday'.
  const firstDow = new Date(Date.UTC(y, m0, 1)).getUTCDay();
  return 1 + ((weekday - firstDow + 7) % 7) + (n - 1) * 7;
}
function isEasternDST(y, m1, d) {
  // Horario de verano EEUU: 2do domingo de marzo .. 1er domingo de noviembre.
  const start = Date.UTC(y, 2, nthWeekday(y, 2, 0, 2));   // marzo
  const end = Date.UTC(y, 10, nthWeekday(y, 10, 0, 1));   // noviembre
  const t = Date.UTC(y, m1 - 1, d);
  return t >= start && t < end;
}
function isoET(y, m1, d, hh, mm) {
  const p = (n) => String(n).padStart(2, "0");
  const off = isEasternDST(y, m1, d) ? "-04:00" : "-05:00";
  return `${y}-${p(m1)}-${p(d)}T${p(hh)}:${p(mm)}:00${off}`;
}

function build(type, iso, source) {
  return {
    id: `${type}-${iso.slice(0, 10)}`,
    type,
    emoji: META[type].emoji,
    title: META[type].title,
    why: WHY[type],
    iso,
    impact: "alto",
    approx: source === "calc_cpi",
    _prio: PRIO[source] || 0,
  };
}

// ---------- 1) TradingView (cercano, exacto) ----------
function tvType(title) {
  const t = title.toLowerCase();
  if (/fed interest rate decision/.test(t)) return "fomc";
  if (/inflation rate/.test(t)) return "cpi";
  if (/non[-\s]?farm payrolls/.test(t)) return "nfp";
  if (/pce price index/.test(t)) return "pce";
  return null;
}
async function fetchTradingView() {
  const now = Date.now();
  const from = new Date(now - 12 * 3600000).toISOString();
  const to = new Date(now + 60 * 86400000).toISOString();
  const url =
    `https://economic-calendar.tradingview.com/events?from=${from}&to=${to}` +
    `&countries=US&minImportance=1`;
  const r = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { Origin: "https://www.tradingview.com", "User-Agent": "Mozilla/5.0" },
  });
  const j = await r.json();
  if (j.status !== "ok" || !Array.isArray(j.result)) throw new Error("respuesta invalida");
  const byKey = new Map();
  for (const e of j.result) {
    if (e.importance < 1) continue;
    const type = tvType(e.title || "");
    if (!type) continue;
    const key = `${type}-${e.date.slice(0, 10)}`;
    if (!byKey.has(key)) byKey.set(key, build(type, e.date, "tv"));
  }
  return [...byKey.values()];
}

// ---------- 2) Fed oficial (FOMC, largo plazo) ----------
const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
async function fetchFedFOMC() {
  const r = await fetch("https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const html = await r.text();
  const marks = [...html.matchAll(/(\d{4})\s*FOMC Meetings/g)]
    .map((m) => ({ y: +m[1], idx: m.index }))
    .sort((a, b) => a.idx - b.idx);
  const events = [];
  for (let k = 0; k < marks.length; k++) {
    const block = html.slice(marks[k].idx, k + 1 < marks.length ? marks[k + 1].idx : html.length);
    const months = [...block.matchAll(/fomc-meeting__month[^>]*>([\s\S]*?)<\/div>/g)]
      .map((x) => x[1].replace(/<[^>]+>/g, "").trim());
    const dates = [...block.matchAll(/fomc-meeting__date[^>]*>([\s\S]*?)<\/div>/g)]
      .map((x) => x[1].replace(/<[^>]+>/g, "").trim());
    const n = Math.min(months.length, dates.length);
    for (let j = 0; j < n; j++) {
      const monthNames = months[j].toLowerCase().match(
        /january|february|march|april|may|june|july|august|september|october|november|december/g
      ) || [];
      const nums = dates[j].match(/\d+/g);
      if (!monthNames.length || !nums) continue;
      // La decision se anuncia el SEGUNDO dia de la reunion (ultimo numero del rango)
      // y, si la reunion cruza de mes, en el segundo mes.
      const mName = monthNames[monthNames.length - 1];
      const m1 = MONTHS[mName];
      const day = +nums[nums.length - 1];
      if (!m1 || !day) continue;
      events.push(build("fomc", isoET(marks[k].y, m1, day, 14, 0), "fed"));
    }
  }
  if (!events.length) throw new Error("0 reuniones parseadas");
  return events;
}

// ---------- 3) Calculo local (NFP exacto + CPI aprox.) ----------
function computeMacro(monthsAhead = 12) {
  const now = new Date();
  const baseY = now.getUTCFullYear();
  const baseM = now.getUTCMonth();
  const out = [];
  for (let i = 0; i < monthsAhead; i++) {
    const dt = new Date(Date.UTC(baseY, baseM + i, 1));
    const y = dt.getUTCFullYear();
    const m0 = dt.getUTCMonth();
    const m1 = m0 + 1;
    // NFP: primer viernes, 08:30 NY (regla muy fiable).
    // Si el 1er viernes cae dia 1 (p.ej. Año Nuevo), el informe pasa al 2do viernes.
    let nfpDay = nthWeekday(y, m0, 5, 1);
    if (nfpDay === 1) nfpDay = nthWeekday(y, m0, 5, 2);
    out.push(build("nfp", isoET(y, m1, nfpDay, 8, 30), "calc_nfp"));
    // CPI: aproximado al dia 12 ajustado a dia habil, 08:30 NY (se corrige con TradingView)
    let cpiDay = 12;
    const dow = new Date(Date.UTC(y, m0, cpiDay)).getUTCDay();
    if (dow === 0) cpiDay = 13;          // domingo -> lunes
    else if (dow === 6) cpiDay = 11;     // sabado -> viernes
    out.push(build("cpi", isoET(y, m1, cpiDay, 8, 30), "calc_cpi"));
  }
  return out;
}

// ---------- Estado + fusion ----------
let tvEvents = [];
let fedEvents = [];

export function getCalendar() {
  const candidates = [...computeMacro(12), ...fedEvents, ...tvEvents];
  // Fusion por (tipo + año-mes): gana la fuente de mayor prioridad.
  const best = new Map();
  for (const e of candidates) {
    const key = `${e.type}-${e.iso.slice(0, 7)}`;
    const prev = best.get(key);
    if (!prev || e._prio > prev._prio) best.set(key, e);
  }
  const now = Date.now();
  return [...best.values()]
    .filter((e) => Date.parse(e.iso) > now - 2 * 3600000)
    .sort((a, b) => Date.parse(a.iso) - Date.parse(b.iso))
    .slice(0, 20)
    .map(({ _prio, ...e }) => e);
}

export async function refreshCalendar() {
  const [tv, fed] = await Promise.allSettled([fetchTradingView(), fetchFedFOMC()]);
  if (tv.status === "fulfilled") tvEvents = tv.value;
  else console.warn(`[calendar] TradingView fallo: ${tv.reason?.message}`);
  if (fed.status === "fulfilled") fedEvents = fed.value;
  else console.warn(`[calendar] Fed fallo: ${fed.reason?.message}`);
  console.log(`[calendar] TradingView=${tvEvents.length} FOMC(Fed)=${fedEvents.length} + calculo local`);
}

export function startCalendar(intervalMs = 24 * 60 * 60 * 1000) {
  refreshCalendar();
  return setInterval(refreshCalendar, intervalMs);
}
