import { registerNativeIndicator, registerRendererLayer } from '@luxalgo/vela/plugin';

const LAYER_ID = 'vela-market-overlays';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function adaptiveVwap(bars) {
  if (!Array.isArray(bars) || bars.length < 2) return [];
  let trueRange = 0;
  for (let i = 1; i < bars.length; i += 1) {
    const bar = bars[i];
    const previous = bars[i - 1]?.close;
    if (!Number.isFinite(previous)) continue;
    trueRange += Math.max(bar.high - bar.low, Math.abs(bar.high - previous), Math.abs(bar.low - previous));
  }
  const close = bars.at(-1)?.close;
  const atrPercent = close ? (trueRange / Math.max(1, bars.length - 1)) / close : 0;
  const window = Math.max(20, Math.min(96, Math.round(48 / (1 + atrPercent * 40))));
  const values = [];
  for (let i = 0; i < bars.length; i += 1) {
    const start = Math.max(0, i - window + 1);
    let weighted = 0;
    let volume = 0;
    for (let j = start; j <= i; j += 1) {
      const bar = bars[j];
      const typical = (bar.high + bar.low + bar.close) / 3;
      weighted += typical * Math.max(0, bar.volume ?? 0);
      volume += Math.max(0, bar.volume ?? 0);
    }
    values.push(volume > 0 ? weighted / volume : bars[i].close);
  }
  return values;
}

function paintBadge(ctx, x, y, label, value, color) {
  ctx.font = '600 11px system-ui, sans-serif';
  const text = `${label} ${value}`;
  const width = ctx.measureText(text).width + 16;
  ctx.fillStyle = 'rgba(7, 13, 24, 0.84)';
  ctx.fillRect(x, y - 13, width, 20);
  ctx.fillStyle = color;
  ctx.fillText(text, x + 8, y + 1);
}

function drawHeatmap(ctx, levels, args) {
  const bids = Array.isArray(levels?.bids) ? levels.bids : [];
  const asks = Array.isArray(levels?.asks) ? levels.asks : [];
  const rows = [
    ...bids.map(([price, quantity]) => ({ side: 'bid', price: Number(price), quantity: Number(quantity) })),
    ...asks.map(([price, quantity]) => ({ side: 'ask', price: Number(price), quantity: Number(quantity) })),
  ].filter((row) => Number.isFinite(row.price) && Number.isFinite(row.quantity) && row.quantity > 0);
  if (!rows.length) return;

  const max = Math.max(...rows.map((row) => row.quantity), 1);
  const plotTop = args.bounds.top ?? 0;
  const plotBottom = plotTop + (args.bounds.height ?? args.coords.height);
  const plotWidth = args.coords.width;
  const sorted = [...rows].sort((a, b) => a.price - b.price);
  for (const row of rows) {
    const y = args.coords.priceToY(row.price, args.scale, args.bounds);
    if (!Number.isFinite(y) || y < plotTop - 24 || y > plotBottom + 24) continue;
    const index = sorted.indexOf(row);
    const neighbor = sorted[index + 1] ?? sorted[index - 1];
    const neighborY = neighbor ? args.coords.priceToY(neighbor.price, args.scale, args.bounds) : y + 9;
    const band = clamp(Math.abs(neighborY - y) * 0.8, 3, 18);
    const intensity = clamp(row.quantity / max, 0.08, 1);
    const color = row.side === 'bid' ? [42, 206, 151] : [236, 98, 130];
    const barWidth = Math.max(28, plotWidth * (0.06 + intensity * 0.28));
    ctx.fillStyle = `rgba(${color.join(',')},${(0.1 + intensity * 0.22).toFixed(3)})`;
    ctx.fillRect(0, y - band / 2, plotWidth, band);
    ctx.fillStyle = `rgba(${color.join(',')},${(0.24 + intensity * 0.5).toFixed(3)})`;
    ctx.fillRect(plotWidth - barWidth, y - band / 2, barWidth, band);
    ctx.strokeStyle = `rgba(${color.join(',')},${(0.25 + intensity * 0.55).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotWidth - barWidth, Math.round(y) + 0.5);
    ctx.lineTo(plotWidth, Math.round(y) + 0.5);
    ctx.stroke();
  }
}

function drawAdaptiveVwap(ctx, bars, args) {
  const values = adaptiveVwap(bars);
  if (!values.length) return;
  const range = args.coords.visibleLogicalRange?.() ?? { from: Math.max(0, bars.length - 160), to: bars.length - 1 };
  const start = Math.max(0, Math.floor(range.from) - 1);
  const end = Math.min(values.length - 1, Math.ceil(range.to) + 1);
  ctx.strokeStyle = '#72b7ff';
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  let started = false;
  for (let index = start; index <= end; index += 1) {
    const x = args.coords.logicalToX(index);
    const y = args.coords.priceToY(values[index], args.scale, args.bounds);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
  }
  if (started) ctx.stroke();
  ctx.globalAlpha = 1;
}

registerRendererLayer({
  id: LAYER_ID,
  placement: 'above-data',
  create() {
    let canvas;
    let context;
    return {
      mount(element) {
        canvas = element;
        context = element.getContext('2d');
      },
      render(args) {
        if (!canvas || !context) return;
        const dpr = args.coords.dpr || 1;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        const data = args.data ?? {};
        const bars = Array.isArray(args.bars) ? args.bars : [];
        context.save();
        context.beginPath();
        context.rect(0, args.bounds.top ?? 0, args.coords.width, args.bounds.height ?? args.coords.height);
        context.clip();
        if (data.heatmap) drawHeatmap(context, data.heatmap, args);
        if (data.showVwap !== false) drawAdaptiveVwap(context, bars, args);
        context.restore();

        const badgeY = (args.bounds.top ?? 0) + 58;
        let badgeX = 12;
        if (Number.isFinite(data.cvd)) {
          paintBadge(context, badgeX, badgeY, 'CVD', `${data.cvd >= 0 ? '+' : ''}${data.cvd.toFixed(0)} USDT`, '#65e0a6');
          badgeX += 116;
        }
        if (Number.isFinite(data.oi)) {
          paintBadge(context, badgeX, badgeY, 'OI', `${data.oi.toFixed(0)} contracts`, '#f7cf73');
          badgeX += 116;
        }
        if (data.heatmap) {
          const levels = (data.heatmap.bids?.length ?? 0) + (data.heatmap.asks?.length ?? 0);
          paintBadge(context, badgeX, badgeY, 'LIQUIDITY', `${levels} levels`, '#d695ff');
        }
      },
      destroy() {
        canvas = null;
        context = null;
      },
    };
  },
});

const FUTURES_API = 'https://fapi.binance.com';
const SPOT_API = 'https://api.binance.com';
const FUTURES_WS = 'wss://fstream.binance.com/ws';
const SPOT_WS = 'wss://stream.binance.com:9443/ws';

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

function signedNotional(trade) {
  const value = Number(trade?.p) * Number(trade?.q);
  return Number.isFinite(value) ? (trade.m ? -value : value) : 0;
}

function sessionName() {
  const hour = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
  if (hour < 8) return 'Asia';
  if (hour < 13.5) return 'London';
  if (hour < 21) return 'New York';
  return 'Sydney';
}

registerNativeIndicator({
  type: LAYER_ID,
  title: 'Live market structure',
  shortTitle: 'Market structure',
  paneHint: 'price',
  overlay: true,
  legend: true,
  inputsSchema: () => [],
  defaultInputs: () => ({}),
  create() {
    let ctx;
    let timer;
    let sockets = [];
    let alive = false;
    let currentCvd = NaN;
    let currentOi = NaN;
    let lastBook = null;

    const emit = (status = 'loading') => {
      ctx?.pushData({ heatmap: lastBook, cvd: currentCvd, oi: currentOi, session: sessionName(), showVwap: true });
      ctx?.setStatus(status);
    };

    const load = async () => {
      if (!alive || !ctx) return;
      const { symbol, isPerpetual } = marketIdentity(ctx.symbol);
      const api = isPerpetual ? FUTURES_API : SPOT_API;
      const bookPath = isPerpetual ? '/fapi/v1/depth' : '/api/v3/depth';
      try {
        lastBook = await json(`${api}${bookPath}?symbol=${symbol}&limit=20`);
        if (isPerpetual) {
          const row = await json(`${FUTURES_API}/fapi/v1/openInterest?symbol=${symbol}`);
          currentOi = Number(row.openInterest);
        } else {
          currentOi = NaN;
        }
        emit('live');
      } catch {
        emit(lastBook ? 'live' : 'idle');
      }
    };

    const closeSockets = () => {
      sockets.forEach((socket) => socket.close());
      sockets = [];
    };

    const connect = () => {
      const { symbol, isPerpetual } = marketIdentity(ctx?.symbol);
      if (!symbol) return;
      const ws = isPerpetual ? FUTURES_WS : SPOT_WS;
      try {
        const tradeSocket = new WebSocket(`${ws}/${symbol.toLowerCase()}@aggTrade`);
        tradeSocket.onmessage = (event) => {
          const delta = signedNotional(JSON.parse(event.data));
          if (!Number.isFinite(currentCvd)) currentCvd = 0;
          currentCvd += delta;
          emit('live');
        };
        sockets.push(tradeSocket);
        const depthSocket = new WebSocket(`${ws}/${symbol.toLowerCase()}@depth20@100ms`);
        depthSocket.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          if (payload.b && payload.a) {
            lastBook = { bids: payload.b, asks: payload.a };
            emit('live');
          }
        };
        sockets.push(depthSocket);
      } catch {
        // REST polling remains active when a browser blocks WebSockets.
      }
    };

    return {
      start(nextCtx) {
        ctx = nextCtx;
        alive = true;
        currentCvd = NaN;
        currentOi = NaN;
        lastBook = null;
        const { symbol, isPerpetual } = marketIdentity(ctx.symbol);
        const api = isPerpetual ? FUTURES_API : SPOT_API;
        const tradePath = isPerpetual ? '/fapi/v1/aggTrades' : '/api/v3/aggTrades';
        ctx.setStatus('loading');
        json(`${api}${tradePath}?symbol=${symbol}&limit=1000`).then((trades) => {
          currentCvd = trades.reduce((total, trade) => total + signedNotional(trade), 0);
          emit('live');
        }).catch(() => emit('idle'));
        load();
        connect();
        timer = setInterval(load, 3000);
      },
      onBars() { emit('live'); },
      onViewport() {},
      setInputs() {},
      suspend() {
        alive = false;
        clearInterval(timer);
        closeSockets();
      },
      resume() {
        if (ctx) {
          alive = true;
          load();
          connect();
        }
      },
      stop() {
        alive = false;
        clearInterval(timer);
        closeSockets();
        ctx = undefined;
      },
    };
  },
});

export const MARKET_OVERLAY_ID = LAYER_ID;

