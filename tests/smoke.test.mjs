import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vela app has a deployable HTML entrypoint', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /Vela Market Workspace/);
  assert.match(html, /src\/main\.js/);
});

test('Vela app declares the upstream chart package', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.dependencies['@luxalgo/vela'], '^0.7.0');
});

test('Vite is configured for direct local opening of the production build', async () => {
  const config = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.match(config, /base:\s*['"]\.\/['"]/);
});
