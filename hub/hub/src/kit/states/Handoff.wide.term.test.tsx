// Big screens: the hand-off card is a card, not a frame across a 240- or 320-column terminal.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { cellWidth } from '../../term/prim/TableCells';
import { routed } from '../layouts/termHarness';
import { Handoff } from './Handoff';
import { beginTermSession } from '../../term/env/session';

let t: TestTerm | null = null;
let host: { end(): void } | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; host?.end(); host = null; });
const frameAt = async (w: number): Promise<string[]> => {
  host = beginTermSession({ webOrigin: 'https://hub.example.com' });
  t = await drawTest(routed(() => <Handoff reason="The Board shows live programs side by side in browser frames, which a terminal cannot draw." what="Board" />).element, { width: w, height: 10 });
  return (await t.settle()).split('\n').map((l) => l.trimEnd());
};

test('block card at 240 columns: at most 120 cells wide, at the start edge, text whole', async () => {
  const lines = await frameAt(240);
  const top = lines.find((l) => l.includes('┌'))!;
  expect(top.startsWith('┌')).toBe(true);
  // A regression would run the frame the whole 240 columns.
  expect(cellWidth(top)).toBe(120);
  expect(Math.max(...lines.map((l) => cellWidth(l)))).toBe(120);
  expect(lines.join('\n')).toContain('which a terminal cannot draw.');
  expect(lines.join('\n')).toContain('[c Copy link]');
  expect(lines.join('\n')).not.toContain('…');
});

test('block card at 80 columns still takes the width it is given', async () => {
  const lines = await frameAt(80);
  expect(cellWidth(lines.find((l) => l.includes('┌'))!)).toBe(80);
});
