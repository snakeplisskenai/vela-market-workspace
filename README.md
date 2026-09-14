# Vela Market Workspace

## Start the working app

From this folder:

```bash
pnpm install
pnpm run dev
```

Open `http://127.0.0.1:5174/`. Do not open the source `index.html` directly; Vite must resolve the Vela modules.

For a static local build:

```bash
pnpm run build
```

Then open `dist/index.html`. The build uses relative asset paths for this use case and for Vercel hosting.

## Live market studies

The selector uses Binance USDT perpetual tickers (`.P`) where the contract exists:

- BTCUSDT.P and SUIUSDT.P: perpetual candles, open interest, CVD, aggressor ratio, adaptive VWAP, and live order-book heat map.
- PEPEUSDT and BONKUSDT: live spot candles, CVD, aggressor ratio, adaptive VWAP, and live spot order-book heat map. Binance currently does not list USDT perpetual contracts for these two symbols, so open interest is marked not applicable.

The chart's Indicators button exposes the installed Vela native catalog plus the custom live market-structure indicator (80 entries in the current build), including moving averages, bands, channels, momentum, trend, volatility, volume, VWAP, SuperTrend, Pivot Points, and volume profile. It also exposes three removable Vela-native equivalents inspired by the supplied TradingView studies:

- Adaptive VWAP: adaptive volume-weighted value with dynamic lookback and deviation bands.
- PVSRA Volume Suite: live-bar volume/spread vector coloring and climax markers.
- CVD candles: a dedicated pane using bar-direction history plus live Binance aggregate trades.

Each is a first-class native indicator: add it from Indicators, configure it, hide it, or remove it from the chart. The custom indicator renders live CVD and open-interest badges, adaptive VWAP, and exchange order-book liquidity zones directly in Vela's chart coordinate system; the panels provide the detailed readouts. The custom market-structure feeds use Binance public REST and WebSocket market data; they do not place orders or require API keys.

## Pine Script and external studies

Vela's quickstart documents Pine support as an optional addon (`@luxalgo/vela-pinets` plus `pinets`). Pine scripts can calculate OHLCV studies such as adaptive VWAP and can be shown on the price chart with `overlay = true`. Pine does not directly call Binance, CoinGlass, or TradingView: `request.security` resolves through Vela's own cached data feed. That is why exchange-specific CVD, open interest, and order-book heatmap data are injected by the native market-structure indicator instead of being fetched from inside Pine.

The TradingView pages are used as behavioral references only. Their “open-source” label does not automatically grant permission to republish their Pine source; TradingView states that republishing remains subject to its House Rules. The native studies in this workspace are independent implementations, not copied Pine source, and the CVD/heatmap data remain exchange-derived rather than TradingView or CoinGlass data.

For the documentation boundaries and extension points, see the upstream [quickstart](https://github.com/LuxAlgo/Vela/blob/main/docs/user/quickstart.md), [scripting engines](https://github.com/LuxAlgo/Vela/blob/main/docs/user/scripting-engines.md), [data providers](https://github.com/LuxAlgo/Vela/blob/main/docs/user/data-providers.md), [workspace](https://github.com/LuxAlgo/Vela/blob/main/docs/user/workspace.md), and [plugin SDK](https://github.com/LuxAlgo/Vela/blob/main/docs/contributing/plugin-sdk.md) guides.
