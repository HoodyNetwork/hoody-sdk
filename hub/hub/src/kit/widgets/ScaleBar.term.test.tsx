import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { ScaleBar } from './Widgets';

test('ScaleBar: one block per step, the value lit, a long scale in ten', async () => {
  const t = await drawTest(<><ScaleBar value={1} max={5} label="a" /><ScaleBar value={2} max={5} label="b" /><ScaleBar value={5} max={5} label="c" /><ScaleBar value={20} max={40} label="d" /></>, { width: 20, height: 4 });
  const f = (await t.settle()).split('\n').slice(0, 4).map((l) => l.trimEnd());
  expect(f).toEqual(['█░░░░', '██░░░', '█████', '█████░░░░░']);
  t.renderer.destroy();
});
