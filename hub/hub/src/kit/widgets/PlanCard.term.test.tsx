// PlanCard in the terminal: the slots in the web's order with the action last, the fold's count, loading and error,
// and the tone the page sets, which the web draws by colour: here a border colour and ground per tone, plus a heavy
// border for accent so the pointed-at card reads in mono too.
import { expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Text, colour } from '../../term/prim';
import { PlanCard, PlanGrid } from './PlanCard';

type Props = Parameters<typeof PlanCard>[0];
const full = (extra: Partial<Props> = {}) => (
  <PlanCard
    name="Pro"
    chip="Shared"
    price={{ amount: '$12', per: '/month' }}
    lead="For a team"
    rows={[{ id: 'mem', label: 'Memory', value: '8 GB' }]}
    specs={['4 cores', '8 GB memory']}
    more={['Snapshots', 'Aliases', 'Bot URLs']}
    footnote="Kept 7 days after it ends"
    marks={<Text>Yours</Text>}
    note="Renews on the 3rd"
    action={<Text>[Upgrade]</Text>}
    {...extra}
  />
);

const rgb = (c: { toInts(): number[] }) => c.toInts().slice(0, 3);
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** The top-left corner cell of the card (row 0, col 0). */
const corner = (t: TestTerm) => {
  const span = t.captureSpans().lines[0]!.spans[0]!;
  return { ch: span.text[0], fg: rgb(span.fg) };
};
/** The ground of the first inside cell of row 1 (after the left border). */
const inside = (t: TestTerm) => {
  const spans = t.captureSpans().lines[1]!.spans;
  let x = 0;
  for (const s of spans) { if (x + s.text.length > 1) return rgb(s.bg); x += s.text.length; }
  return null;
};

test('the slots in the web order, the action last, the fold counting every spec', async () => {
  const t = await drawTest(full(), { width: 50, height: 16 });
  const f = await t.settle();
  const at = ['Pro', 'Shared', 'Yours', '$12', '/month', 'For a team', 'Memory', '8 GB', '4 cores', 'Show all 5 details', 'Kept 7 days', 'Renews on', '[Upgrade]'].map((x) => f.indexOf(x));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect(at).toEqual([...at].sort((a, b) => a - b));
  expect(f).not.toContain('Snapshots');
  t.renderer.destroy();
});

test('loading draws no price, note or action; error shows the note under the error title and no action', async () => {
  let t = await drawTest(full({ state: 'loading' }), { width: 50, height: 12 });
  let f = await t.settle();
  expect(f).toContain('Pro');
  expect(f).not.toContain('$12');
  expect(f).not.toContain('[Upgrade]');
  t.renderer.destroy();
  t = await drawTest(full({ state: 'error', note: 'The catalogue did not load.' }), { width: 50, height: 12 });
  f = await t.settle();
  expect(f).toContain('The catalogue did not load.');
  expect(f).not.toContain('[Upgrade]');
  expect(f).not.toContain('$12');
  t.renderer.destroy();
});

test('each tone draws its own frame: accent heavy and blue, current on the selected ground, default the panel line', async () => {
  const seen: Record<string, { ch: string | undefined; fg: number[]; ground: number[] | null; edgeGround: number[] }> = {};
  for (const tone of ['default', 'accent', 'current'] as const) {
    const t = await drawTest(full({ tone }), { width: 50, height: 16 });
    await t.settle();
    seen[tone] = { ...corner(t), ground: inside(t), edgeGround: rgb(t.captureSpans().lines[0]!.spans[0]!.bg) };
    t.renderer.destroy();
  }
  expect(seen.default!.fg).toEqual(hex(colour('line')!));
  expect(seen.accent!.fg).toEqual(hex(colour('blue')!));
  expect(seen.current!.fg).toEqual(hex(colour('lineStrong')!));
  // In mono the accent card still differs: a heavy corner, the others a light one.
  expect(seen.accent!.ch).toBe('┏');
  expect(seen.default!.ch).toBe('┌');
  expect(seen.current!.ch).toBe('┌');
  expect(seen.current!.ground).toEqual(hex(colour('selected')!));
  expect(seen.default!.ground).not.toEqual(hex(colour('selected')!));
  // The ground stays inside the line: the border's own cells keep the page ground (a half cell outside the line otherwise).
  expect(seen.current!.edgeGround).not.toEqual(hex(colour('selected')!));
});

test('the line under the name, a price row in the price place, and the regions: flag letters, a full one in words', async () => {
  const t = await drawTest(
    <PlanCard
      name="Bare metal"
      subTitle="A server of your own"
      rows={[{ id: 'from', label: 'From', value: '$70 a month', price: true }, { id: 'mem', label: 'Memory', value: '64 GB' }]}
      regions={{ label: '2 regions', items: [{ id: 'par', flag: '🇫🇷', name: 'Paris' }, { id: 'sin', flag: '🇸🇬', name: 'Singapore', full: true }], note: 'More soon' }}
    />,
    { width: 50, height: 14 },
  );
  const f = await t.settle();
  const at = ['Bare metal', 'A server of your own', 'From', '$70 a month', 'Memory', '64 GB', '2 regions', 'FR Paris', 'SG Singapore, full', 'More soon'].map((x) => f.indexOf(x));
  expect(at.every((i) => i >= 0), f).toBe(true);
  expect(at).toEqual([...at].sort((a, b) => a - b));
  // The price row is drawn once, in the price's place: its label and value share a line.
  expect(f.split('\n').filter((l) => l.includes('From')).length).toBe(1);
  expect(f.split('\n').find((l) => l.includes('From'))).toContain('$70 a month');
  t.renderer.destroy();
});

/** The column (cell x) where each card's name starts, and the row it is drawn on. */
const nameAt = (f: string, name: string): { x: number; y: number } => {
  const lines = f.split('\n');
  const y = lines.findIndex((l) => l.includes(name));
  return { x: y < 0 ? -1 : lines[y]!.indexOf(name), y };
};

test('PlanGrid: as many equal columns as fit 33 cells a card; one column when narrow', async () => {
  const grid = (
    <PlanGrid>
      <PlanCard name="Free" price={{ amount: '$0' }} />
      <PlanCard name="Plus" price={{ amount: '$12' }} lead="For a team" />
      <PlanCard name="Pro" price={{ amount: '$29' }} />
    </PlanGrid>
  );
  let t = await drawTest(grid, { width: 110, height: 12 });
  let f = await t.settle();
  let [a, b, c] = ['Free', 'Plus', 'Pro'].map((n) => nameAt(f, n));
  expect([a!.y, b!.y, c!.y], f).toEqual([a!.y, a!.y, a!.y]);
  expect(Math.abs((b!.x - a!.x) - (c!.x - b!.x)), f).toBeLessThanOrEqual(1);
  expect(b!.x - a!.x, f).toBeGreaterThanOrEqual(33);
  // Equal heights: every card's bottom border is on one row.
  expect(f.split('\n').filter((l) => (l.match(/└/g) ?? []).length === 3).length, f).toBe(1);
  t.renderer.destroy();
  t = await drawTest(grid, { width: 60, height: 24 });
  f = await t.settle();
  [a, b, c] = ['Free', 'Plus', 'Pro'].map((n) => nameAt(f, n));
  expect(a!.y, f).toBeLessThan(b!.y);
  expect(b!.y, f).toBeLessThan(c!.y);
  expect([a!.x, b!.x, c!.x], f).toEqual([a!.x, a!.x, a!.x]);
  t.renderer.destroy();
});

test('PlanGrid wide: the last card takes a row of its own under the others, its rows side by side', async () => {
  const t = await drawTest(
    <PlanGrid wide>
      <PlanCard name="Free" price={{ amount: '$0' }} />
      <PlanCard name="Plus" price={{ amount: '$12' }} />
      <PlanCard name="Bare metal" wide rows={[{ id: 'cpu', label: 'Cores', value: '16' }, { id: 'mem', label: 'Memory', value: '64 GB' }]} />
    </PlanGrid>,
    { width: 100, height: 16 },
  );
  const f = await t.settle();
  const [a, b, w] = ['Free', 'Plus', 'Bare metal'].map((n) => nameAt(f, n));
  expect(a!.y, f).toBe(b!.y);
  expect(w!.y, f).toBeGreaterThan(a!.y);
  expect(w!.x, f).toBe(a!.x);
  expect(nameAt(f, 'Cores').y, f).toBe(nameAt(f, 'Memory').y);
  t.renderer.destroy();
});
