import { registerNativeIndicator } from '@luxalgo/vela/plugin';

const BULL = '#39d98a';
const BEAR = '#ff5577';
const BLUE = '#72b7ff';
const PURPLE = '#d695ff';
const FUTURES_API = 'https://fapi.binance.com';
const SPOT_API = 'https://api.binance.com';
const FUTURES_WS = 'wss://fstream.binance.com/ws';
const SPOT_WS = 'wss://stream.binance.com:9443/ws';

function number(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function marketIdentity(rawSymbol) {
  const raw = String(rawSymbol ?? '').split(':').at(-1).toUpperCase();
  const isPerpetual = raw.endsWith('.P');
  return { symbol: raw.replace(/\.P$/i, ''), isPerpetual };
}

async function json(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function mean(values, from, to) {
  let total = 0;
  let count = 0;
  for (let i = Math.max(0, from); i <= to; i += 1) {
    if (Number.isFinite(values[i])) {
      total += values[i];
      count += 1;
    }
  }
  return count ? total / count : 0;
}

function std(values, from, to, average) {
  let total = 0;
  let count = 0;
  for (let i = Math.max(0, from); i <= to; i += 1) {
    if (Number.isFinite(values[i])) {
      total += (values[i] - average) ** 2;
      count += 1;
    }
  }
  return count > 1 ? Math.sqrt(total / count) : 0;
}

function adaptiveVwapOutput(bars, inputs) {
  const lookback = Math.max(20, Math.min(300, Math.round(number(inputs.lookback, 100))));
  const bandMultiplier = Math.max(0.25, Math.min(5, number(inputs.bandMultiplier, 1.5)));
  const n = bars.length;
  const values = new Array(n).fill(Number.NaN);
  const upper = new Array(n).fill(Number.NaN);
  const lower = new Array(n).fill(Number.NaN);
  const volatility = bars.map((bar, index) => {
    const previous = bars[index - 1]?.close ?? bar.close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previous), Math.abs(bar.low - previous)) / Math.max(bar.close, 1e-12);
  });

  for (let i = 0; i < n; i += 1) {
    const recentVolatility = mean(volatility, Math.max(0, i - 19), i);
    const adaptiveWindow = Math.max(20, Math.min(lookback, Math.round(lookback / (1 + recentVolatility * 55))));
    const start = Math.max(0, i - adaptiveWindow + 1);
    let weightedPrice = 0;
    let totalVolume = 0;
    for (let j = start; j <= i; j += 1) {
      const bar = bars[j];
      const volume = Math.max(0, number(bar.volume, 0));
      const typical = (bar.high + bar.low + bar.close) / 3;
      weightedPrice += typical * volume;
      totalVolume += volume;
    }
    const vwap = totalVolume > 0 ? weightedPrice / totalVolume : bars[i].close;
    const distances = bars.slice(start, i + 1).map((bar) => ((bar.close - vwap) / Math.max(vwap, 1e-12)) * vwap);
    const spread = std(distances, 0, distances.length - 1, mean(distances, 0, distances.length - 1));
    values[i] = vwap;
    upper[i] = vwap + spread * bandMultiplier;
    lower[i] = vwap - spread * bandMultiplier;
  }
  return {
    plots: [
      { key: 'vwap', title: 'Adaptive VWAP', values, color: BLUE, width: 2 },
      { key: 'upper', title: 'Upper adaptive band', values: upper, color: '#9ccfff', width: 1 },
      { key: 'lower', title: 'Lower adaptive band', values: lower, color: '#9ccfff', width: 1 },
    ],
    bands: [{ key: 'adaptive-band', from: 'upper', to: 'lower', color: 'rgba(114,183,255,0.10)' }],
  };
}

registerNativeIndicator({
  type: 'adaptive-ml-vwap',
  title: 'Adaptive VWAP (native)',
  shortTitle: 'Adaptive VWAP',
  paneHint: 'price',
  overlay: true,
  multiInstance: true,
  inputsSchema: () => [
    { key: 'lookback', title: 'Maximum lookback', type: 'int', defval: 100, min: 20, max: 300, step: 1 },
    { key: 'bandMultiplier', title: 'Band multiplier', type: 'float', defval: 1.5, min: 0.25, max: 5, step: 0.25 },
  ],
  defaultInputs: () => ({ lookback: 100, bandMultiplier: 1.5 }),
  create() {
    let ctx;
    const compute = () => ctx?.emit(adaptiveVwapOutput(ctx.bars(), inputs));
    let inputs = { lookback: 100, bandMultiplier: 1.5 };
    return {
      start(nextCtx, nextInputs) { ctx = nextCtx; inputs = nextInputs; compute(); ctx.setStatus('live'); },
      onBars: compute,
      onViewport() {},
      setInputs(nextInputs) { inputs = nextInputs; compute(); },
      suspend() {},
      resume: compute,
      stop() { ctx = undefined; },
    };
  },
});

function pvsraOutput(bars, inputs) {
  const length = Math.max(5, Math.min(100, Math.round(number(inputs.volumeLength, 10))));
  const climax = Math.max(1.1, number(inputs.climaxMultiplier, 2));
  const highVolume = Math.max(1, number(inputs.highVolumeMultiplier, 1.5));
  const values = bars.map((bar) => bar.close);
  const colors = bars.map((bar, i) => {
    const averageVolume = mean(bars.map((item) => item.volume), i - length, i - 1);
    const spread = Math.max(0, bar.high - bar.low);
    const averageSpread = mean(bars.slice(Math.max(0, i - length), i).map((item) => item.high - item.low), 0, length - 1);
    const volumeRatio = averageVolume > 0 ? bar.volume / averageVolume : 0;
    const spreadRatio = averageSpread > 0 ? spread / averageSpread : 0;
    if (volumeRatio >= climax && spreadRatio >= 1.2) return bar.close >= bar.open ? '#00e6a8' : '#ff3d71';
    if (volumeRatio >= highVolume) return bar.close >= bar.open ? '#9cf5d2' : '#ff9ab4';
    return bar.close >= bar.open ? 'rgba(57,217,138,0.65)' : 'rgba(255,85,119,0.65)';
  });
  const markers = bool(inputs.showMarkers, true) ? bars.flatMap((bar, i) => {
    const averageVolume = mean(bars.map((item) => item.volume), i - length, i - 1);
    const volumeRatio = averageVolume > 0 ? bar.volume / averageVolume : 0;
    if (volumeRatio < climax) return [];
    return [{ time: bar.time, position: bar.close >= bar.open ? 'belowBar' : 'aboveBar', shape: 'circle', color: colors[i] }];
  }) : [];
  return {
    plots: [{ key: 'vectors', title: 'PVSRA vectors', values, colors, width: 2, overlay: true }],
    markers,
  };
}

registerNativeIndicator({
  type: 'pvsra-volume-suite',
  title: 'PVSRA Volume Suite (native)',
  shortTitle: 'PVSRA',
  paneHint: 'price',
  overlay: true,
  multiInstance: true,
  inputsSchema: () => [
    { key: 'volumeLength', title: 'Volume average length', type: 'int', defval: 10, min: 5, max: 100, step: 1 },
    { key: 'climaxMultiplier', title: 'Climax volume multiplier', type: 'float', defval: 2, min: 1.1, max: 10, step: 0.1 },
    { key: 'highVolumeMultiplier', title: 'High volume multiplier', type: 'float', defval: 1.5, min: 1, max: 10, step: 0.1 },
    { key: 'showMarkers', title: 'Show climax markers', type: 'bool', defval: true },
  ],
  defaultInputs: () => ({ volumeLength: 10, climaxMultiplier: 2, highVolumeMultiplier: 1.5, showMarkers: true }),
  create() {
    let ctx;
    let inputs = { volumeLength: 10, climaxMultiplier: 2, highVolumeMultiplier: 1.5, showMarkers: true };
    const compute = () => ctx?.emit(pvsraOutput(ctx.bars(), inputs));
    return {
      start(nextCtx, nextInputs) { ctx = nextCtx; inputs = nextInputs; compute(); ctx.setStatus('live'); },
      onBars: compute,
      onViewport() {},
      setInputs(nextInputs) { inputs = nextInputs; compute(); },
      suspend() {},
      resume: compute,
      stop() { ctx = undefined; },
    };
  },
});

function signedTradeQuantity(trade) {
  const quantity = Number(trade?.q);
  if (!Number.isFinite(quantity)) return 0;
  return trade.m ? -quantity : quantity;
}

function barCvdOutput(bars, liveDelta = 0) {
  let running = 0;
  const values = bars.map((bar) => {
    const signed = bar.close >= bar.open ? Math.abs(number(bar.volume, 0)) : -Math.abs(number(bar.volume, 0));
    running += signed;
    return running;
  });
  if (values.length) values[values.length - 1] += liveDelta;
  const colors = values.map((value, index) => value >= (values[index - 1] ?? 0) ? BULL : BEAR);
  return { plots: [{ key: 'cvd', title: 'CVD', values, kind: 'histogram', colors, color: PURPLE, base: 0 }] };
}

registerNativeIndicator({
  type: 'cvd-candles-live',
  title: 'CVD candles (live)',
  shortTitle: 'CVD',
  paneHint: 'new',
  overlay: false,
  multiInstance: false,
  inputsSchema: () => [
    { key: 'reset', title: 'Reset', type: 'string', defval: 'Session', options: ['Session', 'Never'] },
  ],
  defaultInputs: () => ({ reset: 'Session' }),
  create() {
    let ctx;
    let timer;
    let socket;
    let liveDelta = 0;
    let alive = false;
    let inputs = { reset: 'Session' };

    const emit = () => {
      if (!ctx) return;
      ctx.emit(barCvdOutput(ctx.bars(), liveDelta));
      ctx.setStatus('live');
    };

    const startFeed = async () => {
      const { symbol, isPerpetual } = marketIdentity(ctx?.symbol);
      if (!symbol) return;
      const api = isPerpetual ? FUTURES_API : SPOT_API;
      const path = isPerpetual ? '/fapi/v1/aggTrades' : '/api/v3/aggTrades';
      try {
        const trades = await json(`${api}${path}?symbol=${symbol}&limit=1000`);
        liveDelta = trades.reduce((sum, trade) => sum + signedTradeQuantity(trade), 0);
        emit();
      } catch {
        ctx?.setStatus('idle');
      }
      const wsBase = isPerpetual ? FUTURES_WS : SPOT_WS;
      try {
        socket = new WebSocket(`${wsBase}/${symbol.toLowerCase()}@aggTrade`);
        socket.onmessage = (event) => {
          if (!alive) return;
          liveDelta += signedTradeQuantity(JSON.parse(event.data));
          emit();
        };
      } catch {
        // Historical bar CVD remains available if the browser blocks WebSockets.
      }
    };

    return {
      start(nextCtx, nextInputs) {
        ctx = nextCtx;
        inputs = nextInputs;
        alive = true;
        liveDelta = 0;
        ctx.setStatus('loading');
        emit();
        startFeed();
        timer = setInterval(emit, 5000);
      },
      onBars: emit,
      onViewport() {},
      setInputs(nextInputs) { inputs = nextInputs; emit(); },
      suspend() { alive = false; clearInterval(timer); socket?.close(); socket = undefined; },
      resume() { alive = true; startFeed(); emit(); },
      stop() { alive = false; clearInterval(timer); socket?.close(); socket = undefined; ctx = undefined; },
    };
  },
});

export const MARKET_INDICATOR_IDS = ['adaptive-ml-vwap', 'pvsra-volume-suite', 'cvd-candles-live'];

