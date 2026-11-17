// Bare metal detail, "Your order": the amounts are whole on one line each, at the row's end (the web's `1fr auto` grid
// with `dd { margin: 0 }`). A default dd indent would take 2 of the amount's 3 cells: "$69" would draw as "$", "6", "9"
// on three lines.
// The amount about to be paid is on the first screen of the detail at every size, with no scroll: the terminal draws the
// term picker, the order and its facts before the spec list (DetailSections.term.tsx), so a long spec sheet never pushes
// the sum below the fold. The web keeps its own order.
import { expect, test } from 'bun:test';
import { renderPage } from '../../../../scripts/term/render';

async function firstScreen(cols: number, rows: number, sel: string): Promise<string[]> {
  const s = await renderPage({ page: 'billing', cols, rows, path: `/billing?view=servers&sel=${sel}` });
  try {
    const lines = (await s.settle()).split('\n').map((l) => l.trimEnd());
    expect(s.failures).toEqual([]);
    return lines;
  } finally { s.close(); }
}

for (const [cols, rows] of [[80, 24], [120, 40], [200, 50], [320, 90]] as const) {
  test(`${cols}x${rows}: Rental and Total first payment show their amount on their own line, before the specs`, async () => {
    const lines = await firstScreen(cols, rows, 'l01');
    const rental = lines.find((l) => /\bRental\b/.test(l) && !/Rental credit/.test(l));
    const total = lines.find((l) => l.includes('Total first payment'));
    expect(rental).toMatch(/Rental\s+\$69\b/);
    expect(total).toMatch(/Total first payment\s+\$69\b/);
    // The chosen term before the order, the order before the detail's own spec rows (wide frames also have a Processor
    // column in the list, so the row is matched with its value).
    const term = lines.findIndex((l) => /\(•\) \$69 for 30 days/.test(l));
    const order = lines.findIndex((l) => /\bYour order\b/.test(l));
    const specs = lines.findIndex((l) => /\bProcessor\s+AMD Ryzen 9 5950X\b/.test(l));
    expect(term).toBeGreaterThanOrEqual(0);
    expect(order).toBeGreaterThan(term);
    if (specs >= 0) expect(specs).toBeGreaterThan(order);
    // The order's own facts (delivery, then what happens after the term) follow the total, before the specs.
    const delivery = lines.findIndex((l) => /Instant delivery\*: Usually ready/.test(l));
    if (delivery >= 0) {
      expect(delivery).toBeGreaterThan(lines.findIndex((l) => l.includes('Total first payment')));
      if (specs >= 0) expect(specs).toBeGreaterThan(delivery);
    }
  }, 120_000);
}

// At 320x90 everything is on screen, so the whole terminal order is checked there: term, order, order facts, specs.
test('320x90: term, order, delivery, then the specs', async () => {
  const lines = await firstScreen(320, 90, 'l01');
  const at = (re: RegExp) => lines.findIndex((l) => re.test(l));
  const seq = [at(/\(•\) \$69 for 30 days/), at(/Total first payment\s+\$69/), at(/Instant delivery\*: Usually ready/), at(/\bProcessor\s+AMD Ryzen 9 5950X\b/)];
  expect(seq.every((i) => i >= 0)).toBe(true);
  expect([...seq].sort((a, b) => a - b)).toEqual(seq);
}, 120_000);

// A listing with no terms has no order: the detail draws no empty "Your order"; its order facts (delivery) come first,
// then its specs.
test('120x40: a listing with no terms has no order block, its delivery fact then its specs', async () => {
  const lines = await firstScreen(120, 40, 'u01');
  const delivery = lines.findIndex((l) => /\bDelivery\s+Delivery time is not listed\./.test(l));
  const specs = lines.findIndex((l) => /\bProcessor\s+Intel Xeon E-2124\b/.test(l));
  expect(delivery).toBeGreaterThanOrEqual(0);
  expect(specs).toBeGreaterThan(delivery);
  expect(lines.some((l) => /\bYour order\b/.test(l))).toBe(false);
  expect(lines.some((l) => l.includes('Total first payment'))).toBe(false);
}, 120_000);
