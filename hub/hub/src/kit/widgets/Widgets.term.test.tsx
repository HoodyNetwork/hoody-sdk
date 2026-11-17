import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Meter, Sparkline, WidgetProgress, WidgetRow, WidgetStat, WidgetTitle } from './Widgets';

test('Meter lights whole blocks; warn and danger carry their mark', async () => {
  const t = await drawTest(<><Meter value={10} label="CPU" /><Meter value={0.1} label="x" /><Meter value={80} label="x" /><Meter value={95} label="x" /><Meter indeterminate label="x" /></>, { width: 20, height: 6 });
  const f = (await t.settle()).split('\n');
  expect(f[0]).toBe('█░░░░░░░░░'.padEnd(20));
  expect(f[1]?.startsWith('█░░░░░░░░░')).toBe(true);
  expect(f[2]?.trimEnd()).toBe('████████░░ !');
  expect(f[3]?.trimEnd()).toBe('██████████ ✗');
  expect(f[4]?.trimEnd()).toBe('▒▒▒▒▒▒▒▒▒▒');
  t.renderer.destroy();
});

test('Sparkline draws one block per point on the web scale', async () => {
  const t = await drawTest(<Sparkline points={[0, 1, 2, 3, 4, 5, 6, 7]} label="x" />, { width: 20, height: 1 });
  expect((await t.settle()).trimEnd()).toBe('▁▂▃▄▅▆▇█');
  t.renderer.destroy();
});

test('title, row, stat and progress', async () => {
  const t = await drawTest(
    <>
      <WidgetTitle count={3} note="1 failed today" noteTone="danger">Bots</WidgetTitle>
      <WidgetRow label="nightly" tone="ok" meta="in 2h" pill={{ tone: 'danger', text: 'Failed' }} />
      <WidgetStat value="12" caption="failed in the last hour" tone="warn" />
      <WidgetProgress done={2} total={4} />
    </>,
    { width: 50, height: 8 },
  );
  const f = await t.settle();
  expect(f).toContain('Bots 3 ✗ 1 failed today');
  expect(f).toMatch(/✓ nightly\s+in 2h ✗ Failed/);
  expect(f).toContain('! 12');
  expect(f).toContain('█████░░░░░ 2 of 4');
  t.renderer.destroy();
});
