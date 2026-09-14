const FUTURES_API = 'https://fapi.binance.com';
const SPOT_API = 'https://api.binance.com';
const FUTURES_WS = 'wss://fstream.binance.com/ws';
const SPOT_WS = 'wss://stream.binance.com:9443/ws';

const STUDY_META = {
  oi: { label: 'Open interest', short: 'Futures positioning', color: '#f7cf73' },
  cvd: { label: 'CVD', short: 'Cumulative volume delta', color: '#65e0a6' },
  vwap: { label: 'Adaptive VWAP', short: 'Volatility-adjusted value', color: '#72b7ff' },
  heatmap: { label: 'Liquidity heat map', short: 'Top 20 order-book levels', color: '#d695ff' },
  aggressor: { label: 'Aggressor ratio', short: 'Buy-side / sell-side flow', color: '#ff9f68' },
  sessions: { label: 'Market sessions', short: 'UTC session clock', color: '#bd9cff' },
};

const timeframeToBinance = (value) => ({ '1': '1m', '5': '5m', '15': '15m', '60': '1h', '240': '4h' }[value] ?? '15m');

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function fmt(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(digits);
}

function svgSparkline(points, color) {
  const valid = points.filter(Number.isFinite);
  if (valid.length < 2) return '<div class="study-empty-chart">Waiting for data…</div>';
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const spread = max - min || 1;
  const coords = points.map((value, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * 100;
    const y = 31 - ((value - min) / spread) * 26;
    return `${x.toFixed(2)},${Number.isFinite(value) ? y.toFixed(2) : 31}`;
  }).join(' ');
  return `<svg class="study-sparkline" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true"><polyline points="${coords}" fill="none" stroke="${color}" stroke-width="1.8" vector-effect="non-scaling-stroke" /></svg>`;
}

function cardShell(type) {
  const meta = STUDY_META[type];
  return `<article class="study-card" data-study-card="${type}">
    <div class="study-card-heading"><div><strong>${meta.label}</strong><span>${meta.short}</span></div><em data-study-status>Loading</em></div>
    <div class="study-value" data-study-value>—</div>
    <div class="study-chart" data-study-chart>${svgSparkline([], meta.color)}</div>
    <p class="study-note" data-study-note>Connecting to Binance market data…</p>
  </article>`;
}

function adaptiveVwap(klines) {
  const bars = klines.map((row) => ({
    high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]),
  })).filter((bar) => Object.values(bar).every(Number.isFinite));
  if (!bars.length) return { current: NaN, points: [], window: 0 };
  let atr = 0;
  for (let i = 1; i < bars.length; i += 1) {
    const previous = bars[i - 1].close;
    atr += Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - previous), Math.abs(bars[i].low - previous));
  }
  const atrPercent = bars.length > 1 ? (atr / (bars.length - 1)) / bars.at(-1).close : 0;
  const window = Math.max(20, Math.min(96, Math.round(48 / (1 + atrPercent * 40))));
  const points = [];
  for (let i = Math.max(0, bars.length - 48); i < bars.length; i += 1) {
    const start = Math.max(0, i - window + 1);
    let value = 0;
    let volume = 0;
    for (let j = start; j <= i; j += 1) {
      const typical = (bars[j].high + bars[j].low + bars[j].close) / 3;
      value += typical * bars[j].volume;
      volume += bars[j].volume;
    }
    points.push(volume ? value / volume : bars[i].close);
  }
  return { current: points.at(-1), points, window };
}

function aggregateCvd(trades) {
  const values = trades.map((trade) => {
    const notional = Number(trade.p) * Number(trade.q);
    return Number.isFinite(notional) ? (trade.m ? -notional : notional) : 0;
  });
  const buckets = [];
  const size = Math.max(1, Math.ceil(values.length / 48));
  let running = 0;
  for (let i = 0; i < values.length; i += 1) {
    running += values[i];
    if ((i + 1) % size === 0 || i === values.length - 1) buckets.push(running);
  }
  return { current: running, points: buckets };
}

function aggressorRatio(trades) {
  let buy = 0;
  let sell = 0;
  const points = [];
  for (const trade of trades) {
    const notional = Number(trade.p) * Number(trade.q);
    if (!Number.isFinite(notional)) continue;
    if (trade.m) sell += notional; else buy += notional;
    points.push(sell ? buy / sell : buy ? 2 : 1);
  }
  return { buy, sell, ratio: sell ? buy / sell : NaN, points: points.slice(-48) };
}

function sessionSnapshot(now = new Date()) {
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const sessions = [
    { name: 'Asia', start: 0, end: 8, color: '#72b7ff' },
    { name: 'London', start: 8, end: 13.5, color: '#65e0a6' },
    { name: 'New York', start: 13.5, end: 21, color: '#f7cf73' },
    { name: 'Sydney', start: 21, end: 24, color: '#d695ff' },
  ];
  const active = sessions.find((session) => hour >= session.start && hour < session.end) ?? sessions[0];
  const next = sessions.find((session) => session.start > hour) ?? sessions[0];
  const minutesToNext = next.start > hour ? (next.start - hour) * 60 : (24 - hour + next.start) * 60;
  return { active, next, minutesToNext };
}

function renderSessions() {
  const { active, next, minutesToNext } = sessionSnapshot();
  return `<div class="session-strip">${['Asia', 'London', 'New York', 'Sydney'].map((name) => `<span class="${name === active.name ? 'active' : ''}">${name}</span>`).join('')}</div><div class="session-caption">Active: ${active.name} · Next: ${next.name} in ${Math.round(minutesToNext)}m · UTC</div>`;
}

function renderHeatmap(levels) {
  if (!levels?.bids?.length && !levels?.asks?.length) return '<div class="study-empty-chart">Waiting for order book…</div>';
  const asks = [...(levels.asks ?? [])].slice(0, 10).reverse();
  const bids = [...(levels.bids ?? [])].slice(0, 10);
  const rows = [...asks.map(([price, quantity]) => ({ side: 'ask', price, quantity })), ...bids.map(([price, quantity]) => ({ side: 'bid', price, quantity }))];
  const max = Math.max(...rows.map((row) => Number(row.quantity)), 1);
  return `<div class="heatmap-list">${rows.map((row) => `<div class="heatmap-row ${row.side}"><span>${Number(row.price).toPrecision(7)}</span><i style="width:${Math.max(3, (Number(row.quantity) / max) * 100)}%"></i><b>${fmt(Number(row.quantity), 3)}</b></div>`).join('')}</div>`;
}

export function createMarketStudies({ root, getSymbol, getTimeframe }) {
  const grid = root.querySelector('[data-studies-grid]');
  const controls = root.querySelectorAll('[data-study-toggle]');
  const enabled = new Set(['oi', 'cvd', 'vwap', 'heatmap', 'aggressor', 'sessions']);
  let runId = 0;
  let sockets = [];
  let intervals = [];

  function closeFeeds() {
    sockets.forEach((socket) => socket.close());
    sockets = [];
    intervals.forEach((timer) => clearInterval(timer));
    intervals = [];
  }

  function setCard(type, { status, value, chart, note }) {
    const card = grid.querySelector(`[data-study-card="${type}"]`);
    if (!card) return;
    card.querySelector('[data-study-status]').textContent = status;
    card.querySelector('[data-study-value]').textContent = value;
    card.querySelector('[data-study-chart]').innerHTML = chart;
    card.querySelector('[data-study-note]').textContent = note;
  }

  async function refresh() {
    const currentRun = ++runId;
    closeFeeds();
    grid.innerHTML = [...enabled].map(cardShell).join('');
    if (!enabled.size) {
      grid.innerHTML = '<div class="studies-disabled">Select a study above to load live market structure data.</div>';
      return;
    }
    const symbol = getSymbol();
    const marketSymbol = symbol.replace(/\.P$/i, '');
    const isPerpetual = symbol.endsWith('.P');
    const intervalName = timeframeToBinance(getTimeframe());
    const lower = marketSymbol.toLowerCase();
    const futuresSymbol = marketSymbol;
    const marketApi = isPerpetual ? FUTURES_API : SPOT_API;
    const marketWs = isPerpetual ? FUTURES_WS : SPOT_WS;

    if (enabled.has('oi')) {
      if (!isPerpetual) {
        setCard('oi', { status: 'Not applicable', value: '—', chart: svgSparkline([], STUDY_META.oi.color), note: 'Open interest is only published for a perpetual/futures contract. This selector is a live spot market.' });
      } else {
      fetchJson(`${FUTURES_API}/futures/data/openInterestHist?symbol=${futuresSymbol}&period=${intervalName}&limit=48`)
        .then((rows) => {
          if (currentRun !== runId) return;
          const points = rows.map((row) => Number(row.sumOpenInterestValue || row.sumOpenInterest));
          const latest = points.at(-1);
          const change = points.length > 1 ? ((latest - points[0]) / Math.abs(points[0] || 1)) * 100 : NaN;
          setCard('oi', { status: 'Live', value: `${fmt(latest)} USDT`, chart: svgSparkline(points, STUDY_META.oi.color), note: `Perpetual futures notional · ${Number.isFinite(change) ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}% over ${points.length} samples` : 'history unavailable'}` });
        })
        .catch(() => fetchJson(`${FUTURES_API}/fapi/v1/openInterest?symbol=${futuresSymbol}`).then((row) => {
          if (currentRun !== runId) return;
          setCard('oi', { status: 'Live', value: `${fmt(Number(row.openInterest))} contracts`, chart: svgSparkline([Number(row.openInterest)], STUDY_META.oi.color), note: 'Current futures open interest; historical series unavailable for this symbol.' });
        }).catch((error) => setCard('oi', { status: 'Unavailable', value: '—', chart: svgSparkline([], STUDY_META.oi.color), note: error.message })));
      }
    }

    if (enabled.has('cvd')) {
      fetchJson(`${marketApi}${isPerpetual ? '/fapi/v1/aggTrades' : '/api/v3/aggTrades'}?symbol=${marketSymbol}&limit=1000`)
        .then((trades) => ({ trades, source: isPerpetual ? 'futures' : 'spot' }))
        .then(({ trades, source }) => {
          if (currentRun !== runId) return;
          const cvd = aggregateCvd(trades);
          setCard('cvd', { status: 'Live', value: `${cvd.current >= 0 ? '+' : ''}${fmt(cvd.current)} USDT`, chart: svgSparkline(cvd.points, STUDY_META.cvd.color), note: `Aggressive buyer volume minus aggressive seller volume · ${source} aggregate trades.` });
          const card = grid.querySelector('[data-study-card="cvd"]');
          if (card) card.dataset.cvdValue = String(cvd.current);
        })
        .catch((error) => setCard('cvd', { status: 'Unavailable', value: '—', chart: svgSparkline([], STUDY_META.cvd.color), note: error.message }));
      
      try {
        const socket = new WebSocket(`${marketWs}/${lower}@aggTrade`);
        socket.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          const delta = (payload.m ? -1 : 1) * Number(payload.p) * Number(payload.q);
          const card = grid.querySelector('[data-study-card="cvd"]');
          if (!card || !Number.isFinite(delta)) return;
          const value = Number(card.dataset.cvdValue || 0) + delta;
          card.dataset.cvdValue = String(value);
          card.querySelector('[data-study-status]').textContent = 'Streaming';
          card.querySelector('[data-study-value]').textContent = `${value >= 0 ? '+' : ''}${fmt(value)} USDT`;
          const flowCard = grid.querySelector('[data-study-card="aggressor"]');
          if (flowCard) {
            const buy = Number(flowCard.dataset.buyNotional || 0) + (payload.m ? 0 : Math.abs(delta));
            const sell = Number(flowCard.dataset.sellNotional || 0) + (payload.m ? Math.abs(delta) : 0);
            flowCard.dataset.buyNotional = String(buy);
            flowCard.dataset.sellNotional = String(sell);
            flowCard.querySelector('[data-study-status]').textContent = 'Streaming';
            flowCard.querySelector('[data-study-value]').textContent = sell ? `${(buy / sell).toFixed(2)}x` : '—';
            flowCard.querySelector('[data-study-note]').textContent = `${fmt(buy)} buy-side / ${fmt(sell)} sell-side notional · live ${isPerpetual ? 'futures' : 'spot'} aggregate trades.`;
          }
        };
        socket.onerror = () => setCard('cvd', { status: 'REST only', value: grid.querySelector('[data-study-value]')?.textContent ?? '—', chart: grid.querySelector('[data-study-chart]')?.innerHTML ?? '', note: 'Live stream blocked; recent aggregate trades remain available.' });
        sockets.push(socket);
      } catch { /* WebSocket may be unavailable in restricted browsers. */ }
    }

    if (enabled.has('aggressor')) {
      fetchJson(`${marketApi}${isPerpetual ? '/fapi/v1/aggTrades' : '/api/v3/aggTrades'}?symbol=${marketSymbol}&limit=1000`)
        .then((trades) => {
          if (currentRun !== runId) return;
          const flow = aggressorRatio(trades);
          setCard('aggressor', { status: 'Live snapshot', value: Number.isFinite(flow.ratio) ? `${flow.ratio.toFixed(2)}x` : '—', chart: svgSparkline(flow.points, STUDY_META.aggressor.color), note: `${fmt(flow.buy)} buy-side / ${fmt(flow.sell)} sell-side notional · ${isPerpetual ? 'futures' : 'spot'} aggregate trades.` });
          const card = grid.querySelector('[data-study-card="aggressor"]');
          if (card) {
            card.dataset.buyNotional = String(flow.buy);
            card.dataset.sellNotional = String(flow.sell);
          }
        })
        .catch((error) => setCard('aggressor', { status: 'Unavailable', value: '—', chart: svgSparkline([], STUDY_META.aggressor.color), note: error.message }));
    }

    if (enabled.has('vwap')) {
      fetchJson(`${marketApi}${isPerpetual ? '/fapi/v1/klines' : '/api/v3/klines'}?symbol=${marketSymbol}&interval=${intervalName}&limit=120`)
        .then((klines) => {
          if (currentRun !== runId) return;
          const vwap = adaptiveVwap(klines);
          const close = Number(klines.at(-1)?.[4]);
          const distance = close ? ((close - vwap.current) / close) * 100 : NaN;
          setCard('vwap', { status: 'Live', value: Number.isFinite(vwap.current) ? vwap.current.toPrecision(8) : '—', chart: svgSparkline(vwap.points, STUDY_META.vwap.color), note: `Adaptive ${vwap.window}-bar window · price ${Number.isFinite(distance) ? `${distance >= 0 ? '+' : ''}${distance.toFixed(2)}%` : '—'} from VWAP` });
        })
        .catch((error) => setCard('vwap', { status: 'Unavailable', value: '—', chart: svgSparkline([], STUDY_META.vwap.color), note: error.message }));
    }

    if (enabled.has('heatmap')) {
      const loadBook = () => fetchJson(`${marketApi}${isPerpetual ? '/fapi/v1/depth' : '/api/v3/depth'}?symbol=${marketSymbol}&limit=20`)
        .then((book) => ({ book, source: isPerpetual ? 'futures' : 'spot' }))
        .then(({ book, source }) => {
        if (currentRun !== runId) return;
        setCard('heatmap', { status: 'Live', value: `${book.bids.length + book.asks.length} levels`, chart: renderHeatmap(book), note: `Top 20 ${source} levels by displayed quantity; not a historical order-book replay.` });
      }).catch((error) => setCard('heatmap', { status: 'Unavailable', value: '—', chart: renderHeatmap(), note: error.message }));
      loadBook();
      intervals.push(window.setInterval(loadBook, 3000));
      try {
        const socket = new WebSocket(`${marketWs}/${lower}@depth20@100ms`);
        socket.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          const book = { bids: payload.b ?? payload.bids, asks: payload.a ?? payload.asks };
              if (book.bids && book.asks) setCard('heatmap', { status: 'Streaming', value: `${book.bids.length + book.asks.length} levels`, chart: renderHeatmap(book), note: `Streaming top-20 ${isPerpetual ? 'futures' : 'spot'} order-book levels.` });
        };
        sockets.push(socket);
      } catch { /* fall back to REST polling */ }
    }

    if (enabled.has('sessions')) {
      setCard('sessions', { status: 'Live clock', value: sessionSnapshot().active.name, chart: renderSessions(), note: 'UTC session windows for the 24/7 crypto market; session labels update with the browser clock.' });
      const sessionTimer = window.setInterval(() => {
        if (currentRun !== runId) return;
        setCard('sessions', { status: 'Live clock', value: sessionSnapshot().active.name, chart: renderSessions(), note: 'UTC session windows for the 24/7 crypto market; session labels update with the browser clock.' });
      }, 30_000);
      intervals.push(sessionTimer);
    }
  }

  controls.forEach((control) => control.addEventListener('click', () => {
    const type = control.dataset.studyToggle;
    if (enabled.has(type)) enabled.delete(type); else enabled.add(type);
    control.classList.toggle('active', enabled.has(type));
    control.setAttribute('aria-pressed', String(enabled.has(type)));
    refresh();
  }));
  root.querySelector('[data-refresh-studies]')?.addEventListener('click', refresh);

  return { refresh, destroy: closeFeeds };
}

