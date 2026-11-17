// A card's mark is its state and never yields. Referrals at 80 columns draws three level cards 21 cells wide (19 inside);
// the Referrer card's mark " Your level this month " is 23 cells. The tag's yield rule (a secondary tag after a name
// draws whole or nothing) dropped it, so the card the person is on showed no badge, while the web shows it on every width.
// Now its words wrap on the tint, inside the border.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Tag } from '../data/Display';
import { PlanCard } from './PlanCard';

const card = (
  <PlanCard
    name="Referrer"
    tone="current"
    marks={<Tag tone="accent">Your level this month</Tag>}
    price={{ amount: '5%' }}
    lead="On every purchase"
  />
);

for (const width of [21, 40]) {
  test(`at ${width} cells the mark shows, all its words inside the border, before the price`, async () => {
    const t = await drawTest(card, { width, height: 14 });
    const lines = (await t.settle()).split('\n');
    const inner = lines.filter((l) => /^[│┃]/.test(l));
    for (const l of inner) expect(l.trimEnd().slice(-1)).toMatch(/[│┃]/);
    const text = inner.map((l) => l.slice(1, -1).trim()).join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('Your level this');
    expect(text).toContain('month');
    const at = (s: string) => inner.findIndex((l) => l.includes(s));
    expect(at('Your level')).toBeGreaterThanOrEqual(at('Referrer'));
    expect(at('5%')).toBeGreaterThan(at('month'));
  });
}
