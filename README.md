# 🛰️ Crypto News Radar

Rastreador de **análisis fundamental en tiempo real** para criptomonedas. Escucha las noticias que mueven el mercado (Trump, regulación, ETF, macro/Fed, hacks, listings…), las clasifica por **impacto** y te avisa con **sonido + notificación** cuando hay algo de alto impacto.

Complemento del proyecto `cripto-orderflow` (flujo de órdenes): aquí está el **fundamental**, allí el **flujo**.

## Arrancar

```bash
npm install      # solo la primera vez
npm start
```
Luego abre http://localhost:4000 — o haz doble clic en **`Abrir Radar.bat`**.

## Qué hace

- **Feed en vivo** vía Server-Sent Events: las noticias aparecen solas, sin recargar.
- **Ticker BTC/ETH/SOL en vivo** en la cabecera (WebSocket de Binance; si tu red lo bloquea, cae solo a CoinGecko vía el servidor).
- **🚨 Detector de velones**: si BTC se mueve ≥0.8% en 5 minutos, suena la alerta aunque no haya salido ninguna noticia todavía (cooldown 10 min).
- **Agrupación de duplicados**: la misma historia en varios medios = una sola tarjeta con chip "🔁 N fuentes" (y una sola alerta), por similitud de titulares.
- **📊 Pulso 24h**: qué narrativa domina hoy (top categorías + nº de noticias de alto impacto).
- **Contador en la pestaña**: si estás en otra pestaña, el título muestra `(N🔴)` con los altos impactos sin ver.
- **Motor de impacto** 🔴ALTO / 🟡MEDIO / ⚪BAJO por categorías: Regulación, ETF/Flujos, Macro/Fed, Trump/Política, Exchange/Listing, Hack, Stablecoin, Adopción, Ballenas.
- **Idioma ES/EN** (botón 🌐): traduce las noticias al español en vivo (Google Translate gratis, sin key). Por defecto en español.
- **📅 Calendario macro**: próximos eventos de alto impacto (FOMC, CPI, Empleo) con hora exacta de NY y **cuenta atrás**. Avisa 15 min antes y cuando se publica.
- **Cuentas de X**: posts de Saylor, Elon, CZ, Brian Armstrong, Vitalik, Watcher Guru (vía Nitter).
- **"¿Por qué importa?"** — explicación educativa en cada noticia (por qué mueve precio).
- **Alertas**: pitido + banner + notificación de escritorio en alto impacto. Botones para silenciar.
- **Fear & Greed Index** en vivo (alternative.me).
- **Watchlist**: resalta noticias que mencionen tus monedas/términos.
- **Filtros** por categoría, búsqueda, "solo ALTO", marcar leído.
- **Hora de Nueva York** en todo (igual que tu app de order flow).

## Fuentes (todas gratis, sin API key)

Trump (trumpstruth.org) · X/Twitter (Nitter) · CoinDesk · Cointelegraph · Decrypt · The Block · Bitcoin Magazine · CryptoSlate · CryptoPotato · BeInCrypto · U.Today · Fear & Greed · Calendario macro (FOMC/BLS).

Para añadir/quitar fuentes o cuentas de X: edita `sources/feeds.js`.
Si `nitter.net` deja de funcionar, define la variable `NITTER_BASE` con otra instancia viva.

### Calendario macro (100% automático, cero mantenimiento)

`sources/calendar.js` **no tiene ninguna fecha escrita a mano**. Combina 3 fuentes gratis (sin API key), refrescadas al arrancar y **cada 24 h**:

1. **TradingView** — eventos cercanos (~1 mes) con **hora exacta confirmada** (todos los tipos).
2. **Fed oficial** (`federalreserve.gov`) — fechas de **FOMC a largo plazo** (la Fed las publica ~1.5 años antes; ya trae 2027). Se parsea la página directamente.
3. **Cálculo local** — **Empleo/NFP** (primer viernes, regla fija) y **CPI** (aproximado al día ~12) para los meses que aún no cubre TradingView.

`getCalendar()` fusiona todo por (tipo + mes) y gana la fuente más fiable: **TradingView > Fed > cálculo**. Así un CPI lejano se muestra **aproximado** (marcado con `≈`) y se vuelve **exacto solo** cuando TradingView lo confirma al acercarse. Como el cálculo local no necesita red, el calendario **nunca se queda vacío** aunque fallen las descargas.

Resultado: funciona para cualquier año futuro **sin que toques nada**.

## Configuración

Variables de entorno opcionales:
- `PORT` (default 4000)
- `POLL_MS` cada cuánto refresca los feeds en ms (default 60000)

## Estructura

```
server.js            Express + SSE + arranque
lib/impact.js        motor de clasificación de impacto
lib/store.js         dedupe + persistencia (data/)
sources/feeds.js     lista de fuentes RSS
sources/poller.js    descarga + normaliza + clasifica
sources/feargreed.js índice de miedo y codicia
public/              interfaz (index.html, style.css, app.js)
```

## Notas

- La clasificación es por palabras clave: es **contexto probabilístico**, no garantía. Úsalo para reaccionar rápido, no como señal automática de entrada.
- En el primer arranque carga el historial reciente sin disparar alertas sonoras; a partir de ahí, solo suena con lo nuevo.
