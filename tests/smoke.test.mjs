import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vela app has a deployable HTML entrypoint', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /Vela Market Workspace/);
  assert.match(html, /src\/main\.js/);
  for (const symbol of ['BTCUSDT.P', 'SUIUSDT.P', 'PEPEUSDT', 'BONKUSDT']) {
    assert.match(html, new RegExp(symbol));
  }
  for (const study of ['oi', 'cvd', 'vwap', 'heatmap', 'aggressor', 'sessions']) {
    assert.match(html, new RegExp(`data-study-toggle="${study}"`));
  }
});

test('Vela app declares the upstream chart package', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.dependencies['@luxalgo/vela'], '^0.7.0');
});

test('Vite is configured for direct local opening of the production build', async () => {
  const config = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.match(config, /base:\s*['"]\.\/['"]/);
});

test('Live market studies use exchange market-data feeds', async () => {
  const studies = await readFile(new URL('../src/market-studies.js', import.meta.url), 'utf8');
  assert.match(studies, /openInterestHist/);
  assert.match(studies, /aggTrades/);
  assert.match(studies, /depth/);
  assert.match(studies, /aggressorRatio/);
  assert.match(studies, /sessionSnapshot/);
  assert.match(studies, /createMarketStudies/);
});

test('Vela-native market structure overlay uses chart coordinates and live payloads', async () => {
  const overlay = await readFile(new URL('../src/market-overlays.js', import.meta.url), 'utf8');
  assert.match(overlay, /registerNativeIndicator/);
  assert.match(overlay, /ctx\?\.pushData/);
  assert.match(overlay, /priceToY/);
  assert.match(overlay, /depth20/);
  assert.match(overlay, /aggTrade/);
});

test('TradingView-inspired studies are registered as removable Vela natives', async () => {
  const source = await readFile(new URL('../src/market-native-indicators.js', import.meta.url), 'utf8');
  for (const type of ['adaptive-ml-vwap', 'pvsra-volume-suite', 'cvd-candles-live']) {
    assert.match(source, new RegExp(`type: '${type}'`));
  }
  assert.match(source, /registerNativeIndicator/);
  assert.match(source, /aggTrade/);
  assert.match(source, /paneHint: 'new'/);
});

test('Chart startup does not block the shell on a slow Binance feed', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /READY_TIMEOUT_MS/);
  assert.match(main, /Live studies active/);
  assert.match(main, /Promise\.race/);
});
