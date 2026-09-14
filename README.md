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

The chart's Indicators button exposes the installed Vela native catalog (76 studies in the current package), including moving averages, bands, channels, momentum, trend, volatility, volume, VWAP, SuperTrend, Pivot Points, and volume profile. The custom market-structure panels use Binance public REST and WebSocket market data; they do not place orders or require API keys.

