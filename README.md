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

The chart's Indicators button exposes the installed Vela native catalog plus the custom live market-structure indicator (77 entries in the current build), including moving averages, bands, channels, momentum, trend, volatility, volume, VWAP, SuperTrend, Pivot Points, and volume profile. The custom indicator renders live CVD and open-interest badges, adaptive VWAP, and exchange order-book liquidity zones directly in Vela's chart coordinate system; the panels provide the detailed readouts. The custom market-structure feeds use Binance public REST and WebSocket market data; they do not place orders or require API keys.

## Pine Script and external studies

Vela's quickstart documents Pine support as an optional addon (`@luxalgo/vela-pinets` plus `pinets`). Pine scripts can calculate OHLCV studies such as adaptive VWAP and can be shown on the price chart with `overlay = true`. Pine does not directly call Binance, CoinGlass, or TradingView: `request.security` resolves through Vela's own cached data feed. That is why exchange-specific CVD, open interest, and order-book heatmap data are injected by the native market-structure indicator instead of being fetched from inside Pine.

For the documentation boundaries and extension points, see the upstream [quickstart](https://github.com/LuxAlgo/Vela/blob/main/docs/user/quickstart.md), [scripting engines](https://github.com/LuxAlgo/Vela/blob/main/docs/user/scripting-engines.md), [data providers](https://github.com/LuxAlgo/Vela/blob/main/docs/user/data-providers.md), [workspace](https://github.com/LuxAlgo/Vela/blob/main/docs/user/workspace.md), and [plugin SDK](https://github.com/LuxAlgo/Vela/blob/main/docs/contributing/plugin-sdk.md) guides.

