// Motor de clasificacion de impacto fundamental.
// Asigna a cada noticia: nivel (alto/medio/bajo), categorias y "por que importa".
// Pensado como trader: lo que mueve precio AHORA pesa mas.

// peso: 3 = mueve mercado fuerte, 2 = relevante, 1 = contexto
const RULES = [
  {
    cat: "regulacion",
    label: "Regulacion",
    emoji: "⚖️",
    weight: 3,
    why: "Una decision regulatoria (SEC, demanda, ley, prohibicion) cambia las reglas del juego y suele provocar movimientos bruscos y duraderos.",
    terms: ["sec ", "lawsuit", "regulat", "ban ", "banned", "court", "ruling", "congress", "senate", "executive order", "cftc", "mica", "sue", "sued", "settlement", "subpoena", "demanda", "prohib", "regulaci", "tribunal", "ley cripto", "white house"],
  },
  {
    cat: "etf",
    label: "ETF / Flujos",
    emoji: "🏦",
    weight: 3,
    why: "Los ETF spot son el canal por donde entra (o sale) el dinero institucional. Inflows/outflows fuertes anticipan presion de compra o venta.",
    terms: ["etf", "spot etf", "blackrock", "ibit", "grayscale", "gbtc", "fidelity", "inflow", "outflow", "ark invest", "vaneck", "bitwise", "aum"],
  },
  {
    cat: "macro",
    label: "Macro / Fed",
    emoji: "🌍",
    weight: 3,
    why: "Cripto cotiza como activo de riesgo: tasas, inflacion y liquidez del dolar marcan el apetito de riesgo global. Un dato macro mueve TODO el mercado a la vez.",
    terms: ["federal reserve", "the fed", "fomc", "powell", "rate cut", "rate hike", "interest rate", "cpi ", "inflation", "recession", "jobs report", "unemployment", "tariff", "treasury", "dxy", "quantitative", "liquidity", "pce", "jerome powell"],
  },
  {
    cat: "politica",
    label: "Trump / Politica",
    emoji: "🏛️",
    weight: 3,
    why: "Las declaraciones de figuras politicas de primer nivel (Trump) mueven el sentimiento de riesgo y, cada vez mas, hablan directo de cripto/reserva estrategica.",
    terms: ["trump", "white house", "strategic reserve", "strategic bitcoin", "election", "biden", "presidential", "el-salvador", "legal tender", "nation-state"],
  },
  {
    cat: "exchange",
    label: "Exchange / Listing",
    emoji: "🔄",
    weight: 2,
    why: "Un listing en un exchange grande (Binance, Coinbase) suele dar un pump inmediato; un delisting o problema de un exchange genera panico y contagio.",
    terms: ["will list", "listing", "delisting", "binance", "coinbase", "kraken", "okx", "bybit", "upbit", "listara", "halt withdrawals", "insolvency", "bankruptcy"],
  },
  {
    cat: "hack",
    label: "Hack / Seguridad",
    emoji: "🚨",
    weight: 3,
    why: "Un hack o exploit grande destruye confianza al instante y suele tumbar el token afectado y arrastrar al sector. Riesgo de venta inmediata.",
    terms: ["hack", "exploit", "breach", "stolen", "drained", "vulnerability", "rug pull", "rugpull", "phishing", "private key", "hackeo", "robado", "exploited"],
  },
  {
    cat: "stablecoin",
    label: "Stablecoin",
    emoji: "💵",
    weight: 3,
    why: "Las stablecoins son la sangre del mercado. Un depeg de USDT/USDC seria un evento sistemico; su regulacion mueve toda la liquidez.",
    terms: ["depeg", "de-peg", "tether", "usdt", "usdc", "circle", "stablecoin", "reserves audit"],
  },
  {
    cat: "adopcion",
    label: "Adopcion",
    emoji: "🤝",
    weight: 1,
    why: "Adopcion corporativa o de paises (tesoreria en BTC, pagos, partnerships) es alcista de fondo, aunque su efecto suele ser mas lento.",
    terms: ["adoption", "partnership", "accepts bitcoin", "treasury", "microstrategy", "strategy ", "integrat", "mainstream", "payment", "tesoreria"],
  },
  {
    cat: "ballenas",
    label: "Ballenas / On-chain",
    emoji: "🐋",
    weight: 1,
    why: "Movimientos grandes de wallets (exchanges, ballenas, mineros) anticipan posible presion de venta o acumulacion.",
    terms: ["whale", "large transfer", "moved to", "dormant", "miner", "on-chain", "ballena", "transferred"],
  },
];

// Monedas para etiquetar (no suben impacto por si solas)
const COINS = [
  ["BTC", ["bitcoin", "btc", "₿"]],
  ["ETH", ["ethereum", "ether", "eth"]],
  ["SOL", ["solana", "sol "]],
  ["XRP", ["xrp", "ripple"]],
  ["BNB", ["bnb", "binance coin"]],
  ["DOGE", ["dogecoin", "doge"]],
  ["ADA", ["cardano", "ada "]],
];

function detectCoins(text) {
  const found = new Set();
  for (const [sym, kws] of COINS) {
    if (kws.some((k) => text.includes(k))) found.add(sym);
  }
  return [...found];
}

// Clasifica un item {title, body, source, sourceType}
// Devuelve {impact, score, categories:[{cat,label,emoji}], reasons:[...], coins:[...], why}
export function classify(item) {
  const text = `${item.title || ""} ${item.body || ""}`.toLowerCase();
  const cats = [];
  let maxWeight = 0;
  const reasons = [];

  for (const rule of RULES) {
    if (rule.terms.some((t) => text.includes(t))) {
      cats.push({ cat: rule.cat, label: rule.label, emoji: rule.emoji });
      reasons.push(rule.why);
      if (rule.weight > maxWeight) maxWeight = rule.weight;
    }
  }

  const coins = detectCoins(text);

  // Trump: cualquier post suyo es al menos MEDIO (sentimiento de riesgo);
  // si toca cripto/macro/regulacion, sube a ALTO por las reglas de arriba.
  if (item.sourceType === "trump") {
    if (!cats.some((c) => c.cat === "politica")) {
      cats.unshift({ cat: "politica", label: "Trump / Politica", emoji: "🏛️" });
    }
    if (maxWeight < 2) maxWeight = 2; // piso: medio
  }

  // Bonus: si toca 3+ categorias relevantes, fuerza alto
  const relevantes = cats.filter((c) => c.cat !== "ballenas" && c.cat !== "adopcion").length;
  if (relevantes >= 3 && maxWeight < 3) maxWeight = 3;

  let impact = "bajo";
  if (maxWeight >= 3) impact = "alto";
  else if (maxWeight === 2) impact = "medio";

  // Combustible adicional: palabras de urgencia
  if (/breaking|urgent|just in|alert|última hora/.test(text) && impact === "bajo") {
    impact = "medio";
  }

  return {
    impact,
    score: maxWeight,
    categories: cats,
    reasons: [...new Set(reasons)],
    coins,
  };
}
