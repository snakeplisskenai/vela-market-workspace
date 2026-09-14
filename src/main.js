import { VelaWorkspace } from '@luxalgo/vela/workspace';
import { BinanceProvider } from '@luxalgo/vela/providers/binance';
import './styles.css';

const status = document.querySelector('#status');
const symbol = document.querySelector('#symbol');
const timeframe = document.querySelector('#timeframe');
const chartRoot = document.querySelector('#chart');
let chart;

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
    await chart.ready?.();
    setStatus('Live market data', 'online');
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
