import { VelaWorkspace } from '@luxalgo/vela/workspace';
import { BinanceProvider } from '@luxalgo/vela/providers/binance';
import { createMarketStudies } from './market-studies.js';
import { MARKET_OVERLAY_ID } from './market-overlays.js';
import './market-native-indicators.js';
import './styles.css';

const status = document.querySelector('#status');
const symbol = document.querySelector('#symbol');
const timeframe = document.querySelector('#timeframe');
const chartRoot = document.querySelector('#chart');
const studies = createMarketStudies({ root: document.querySelector('#studies'), getSymbol: () => symbol.value, getTimeframe: () => timeframe.value });
const nativeCatalog = document.querySelector('[data-native-catalog]');
let chart;
const READY_TIMEOUT_MS = 8_000;

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function setStatus(text, state) {
  status.textContent = text;
  status.dataset.state = state;
}

async function mountChart() {
  chart?.destroy?.();
  chartRoot.replaceChildren();
  setStatus('Connecting to Binance…', 'loading');
  try {
    chart = new VelaWorkspace(chartRoot, {
      layout: false,
      symbol: symbol.value,
      timeframe: timeframe.value,
      live: true,
      theme: 'dark',
      providers: { binance: () => new BinanceProvider() },
      // Keep the host controls authoritative. The library can persist state,
      // but restoring a previous symbol would override this selector on remount.
      persist: false,
    });

    const mountedChart = chart;
    // Do not make the whole shell wait forever for a candle request. Binance
    // streams can be slow or unavailable from a particular browser/network,
    // while the native catalog and the direct market-study feeds can still
    // initialise independently.
    const readyPromise = Promise.resolve(chart.ready?.());
    chart.chart?.addNativeIndicator?.(MARKET_OVERLAY_ID);
    studies.refresh();
    const readyState = await Promise.race([
      readyPromise.then(() => 'ready').catch(() => 'error'),
      wait(READY_TIMEOUT_MS).then(() => 'timeout'),
    ]);
    if (mountedChart !== chart) return;

    const catalog = await Promise.race([
      Promise.resolve(chart.chart?.availableNativeIndicators?.()).catch(() => []),
      wait(2_000).then(() => []),
    ]);
    if (nativeCatalog && Array.isArray(catalog)) {
      nativeCatalog.textContent = `${catalog.length} built-in Vela studies available from the chart’s Indicators menu.`;
    }
    if (readyState === 'ready') {
      setStatus('Live market data', 'online');
    } else {
      setStatus('Live studies active · waiting for candle feed', 'loading');
      readyPromise.then(() => {
        if (mountedChart === chart) setStatus('Live market data', 'online');
      }).catch(() => {
        if (mountedChart === chart) setStatus('Live studies active · candle feed unavailable', 'offline');
      });
    }
  } catch (error) {
    console.error(error);
    setStatus('Chart unavailable — check network access', 'offline');
    chartRoot.innerHTML = '<div class="empty"><strong>Unable to load live data.</strong><span>The shell is healthy; Binance may be blocked or unavailable.</span></div>';
  }
}

symbol.addEventListener('change', mountChart);
timeframe.addEventListener('change', mountChart);
document.querySelector('#reload').addEventListener('click', mountChart);
mountChart();
