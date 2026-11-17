import { afterEach, expect, test } from 'bun:test';
import { Text } from '../../../term/prim';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { SummaryLine } from './SummaryLine';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const lead = '15 schedules on atlas · next: ping-api in 3 minutes · 4 failed today';
const after = [
  { key: 'c', text: 'Computers ›', node: <Text>Computers ›</Text> },
  { key: 'p', text: '9 programs running ›', node: '9 programs running ›' },
];

test.each([40, 60, 80, 120])('at %i cells no line starts or ends on the separator, and every part is drawn once', async (width) => {
  t = await drawTest(<SummaryLine lead={lead} after={after} />, { width, height: 6 });
  const lines = (await t.settle()).split('\n').map((l) => l.trimEnd()).filter(Boolean);
  for (const l of lines) {
    expect(l.trimStart().startsWith('·')).toBe(false);
    expect(l.endsWith('·')).toBe(false);
  }
  const all = lines.join(' ');
  for (const p of ['15 schedules on atlas', 'next: ping-api in 3 minutes', '4 failed today', 'Computers ›', '9 programs running ›']) expect(all).toContain(p);
});
