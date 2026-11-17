// Under the strict globals (the test preload installs them) the hook reads no browser global: the terminal has no font
// loading, so it is ready at once (the apps page's ButtonLabelsProbe crashed its live mount on `document.fonts`).
import { expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { activeStrictGlobals } from '../../term/env/strict-globals';
import { drawTest } from '../../term/prim/testing';
import { Text } from '../../term/prim';
import { useFontsReady } from './fontsReady';

function Probe() { return <Text>{useFontsReady() ? 'READY' : 'WAIT'}</Text>; }

test('useFontsReady is true at once and reads no browser global in the terminal', async () => {
  activeStrictGlobals()?.clear();
  const t = await drawTest(<Probe />, { width: 20, height: 2 });
  const f = await t.settle();
  t.renderer.destroy();
  expect(f).toContain('READY');
  expect((activeStrictGlobals()?.ledger() ?? []).map((r) => r.name)).toEqual([]);
});

test('apps (ButtonLabelsProbe measures with useFontsReady) mounts under the strict globals: no font trap, no crash', async () => {
  activeStrictGlobals()?.clear();
  const s = await renderPage({ page: 'apps', fx: 'many', cols: 120, rows: 40, settleMs: 20_000 });
  try {
    expect((activeStrictGlobals()?.ledger() ?? []).filter((r) => /fontsReady|buttonMetrics/.test(r.stack)).map((r) => r.name)).toEqual([]);
    expect(s.failures).toEqual([]);
    expect(s.frame).not.toMatch(/Something went wrong|TERM_GLOBAL/);
  } finally { s.close(); }
}, 60_000);
