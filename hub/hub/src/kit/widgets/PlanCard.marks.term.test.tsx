// PlanCard marks wrap as the web's .marks (flex-wrap) do. On Billing a plan the person has and the page suggests carries
// two marks, "✓ 2 of your servers" and "◆ Suggested for you": 39 cells, wider than a card in a 4-column grid (200x50)
// or at 80x24. The marks row neither shrank nor wrapped, so the second mark ran past the border ("Suggested for yo").
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { StatusPill } from '../data/Display';
import { PlanCard } from './PlanCard';

const card = (
  <PlanCard
    name="Medium"
    price={{ amount: '$29', per: '/ month' }}
    marks={<><StatusPill tone="ok">2 of your servers</StatusPill><StatusPill tone="accent">Suggested for you</StatusPill></>}
    rows={[{ id: 'mem', label: 'Memory', value: '8 GB' }]}
  />
);

for (const width of [36, 40]) {
  test(`at ${width} cells both marks are whole, inside the border, the second on its own line`, async () => {
    const t = await drawTest(card, { width, height: 14 });
    const lines = (await t.settle()).split('\n');
    const inner = lines.filter((l) => /^[│┃]/.test(l));
    // Every inside line ends at the card's right border: nothing runs past it.
    for (const l of inner) expect(l.trimEnd().slice(-1)).toMatch(/[│┃]/);
    const text = inner.map((l) => l.slice(1, -1)).join('\n');
    expect(text).toContain('2 of your servers');
    expect(text).toContain('Suggested for you');
    const at = (s: string) => inner.findIndex((l) => l.includes(s));
    expect(at('Suggested for you')).toBeGreaterThan(at('2 of your servers'));
    // The price still follows the head.
    expect(at('$29')).toBeGreaterThan(at('Suggested for you'));
  });
}
