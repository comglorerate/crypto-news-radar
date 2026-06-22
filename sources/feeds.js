// Definicion de fuentes RSS gratuitas (sin API key).

// Cuentas de X/Twitter de alto impacto. Se leen via Nitter (RSS, gratis).
// Si nitter.net deja de funcionar, cambia NITTER_BASE por otra instancia viva.
const NITTER_BASE = process.env.NITTER_BASE || "https://nitter.net";
const X_ACCOUNTS = [
  { handle: "saylor", name: "Michael Saylor" },
  { handle: "elonmusk", name: "Elon Musk" },
  { handle: "cz_binance", name: "CZ (Binance)" },
  { handle: "brian_armstrong", name: "Brian Armstrong (Coinbase)" },
  { handle: "VitalikButerin", name: "Vitalik Buterin" },
  { handle: "WatcherGuru", name: "Watcher Guru" },
];

export const FEEDS = [
  // Noticias cripto
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", type: "news" },
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss", type: "news" },
  { name: "Decrypt", url: "https://decrypt.co/feed", type: "news" },
  { name: "The Block", url: "https://www.theblock.co/rss.xml", type: "news" },
  { name: "Bitcoin Magazine", url: "https://bitcoinmagazine.com/feed", type: "news" },
  { name: "CryptoSlate", url: "https://cryptoslate.com/feed/", type: "news" },
  { name: "CryptoPotato", url: "https://cryptopotato.com/feed/", type: "news" },
  { name: "BeInCrypto", url: "https://beincrypto.com/feed/", type: "news" },
  { name: "U.Today", url: "https://u.today/rss", type: "news" },
  // Trump (Truth Social via archivo publico, sin key)
  { name: "Trump (Truth Social)", url: "https://trumpstruth.org/feed", type: "trump" },
  // Cuentas clave de X
  ...X_ACCOUNTS.map((a) => ({
    name: `X · @${a.handle}`,
    account: a.name,
    url: `${NITTER_BASE}/${a.handle}/rss`,
    type: "x",
  })),
];
