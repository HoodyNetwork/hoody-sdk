// Plans at 80x24 and 120x40 in a terminal, as dense as the web: "Plans for" names its subject (the server
// choices, beside it in the kit setting row's field frame, or on the next line), one blank row at most before the first
// plan card, and no blank rows between the card's lines. The web PlanCard once drew two blank rows above the card and one
// between each line, so 24 rows showed three facts. PlanCard.term.tsx draws it dense.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

/** What item E asks of a frame; [] when it holds. Reads from the plan card's own column on, so the sidebar never counts. */
function planDensityProblems(frame: string): string[] {
  const lines = frame.split('\n');
  const out: string[] = [];
  const label = strings['plans.for'];
  const forAt = lines.findIndex((l) => new RegExp(`(^|[│ ])${label}(\\s*[│█▀]?\\s*$|\\s{2,}\\((•| )\\))`).test(l.trimEnd()));
  if (forAt < 0) return ['"Plans for" not drawn'];
  const x = lines[forAt]!.indexOf(label);
  const col = (l: string | undefined) => (l ?? '').slice(x);
  // The setting row's field frame ("│ " before the label) puts the label 2 cells right of the cards' edge.
  const cardX = lines[forAt]!.slice(Math.max(0, x - 2), x) === '│ ' ? x - 2 : x;
  const beside = /^\s{2,}\((•| )\)/.test(col(lines[forAt]).slice(label.length));
  if (!beside && !/^\((•| )\)/.test(col(lines[forAt + 1]))) out.push(`"Plans for" is not followed by its choices: "${col(lines[forAt + 1]).trim()}"`);
  const top = lines.findIndex((l, i) => i > forAt && /^[┌┏]/.test(l.slice(cardX)));
  if (top < 0) return [...out, 'no plan card drawn after the choices'];
  const lead = lines.findIndex((l, i) => i > forAt && col(l).startsWith(strings['plans.forNewLine'].slice(0, 20)));
  const blanksAbove = lines.slice(lead + 1, top).filter((l) => col(l).replace(/[█▀\s]/g, '') === '').length;
  if (blanksAbove > 1) out.push(`${blanksAbove} blank rows above the first plan card`);
  // The Free card's first four inside rows: no blank row among them, its name first.
  const inside = lines.slice(top + 1, top + 5).map((l) => l.slice(cardX).replace(/^[│┃]/, '').replace(/[│┃][^│┃]*$/, '').trim());
  if (inside.some((t) => t === '')) out.push(`blank rows inside the plan card: ${JSON.stringify(inside)}`);
  if (!inside[0]?.startsWith(strings['plans.free'])) out.push(`the card does not start with its name: ${JSON.stringify(inside)}`);
  return out;
}

// The check itself fails on the loose frame the page once drew (rows 13-22 of billing banned.80x24), so it can tell.
const OLD_11_11 = [
  ' Plans for',
  ' ( ) n12 · Small',
  ' (•) A new server',
  ' Get buys a new server. Pick one of yours to upgrade it instead.',
  '',
  '',
  '   Free                                                          ✓ Your plan',
  '',
  '   $0 / month',
].join('\n');
test('the check finds the earlier frame wrong', () => {
  expect(planDensityProblems(OLD_11_11).length).toBeGreaterThan(0);
});

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: Plans for, its choices, then a dense plan card`, async () => {
    s = await renderPage({ page: 'billing', cols, rows });
    const frame = await s.settle();
    expect(s.failures).toEqual([]);
    expect(planDensityProblems(frame)).toEqual([]);
    // At 24 rows the first card row already shows both cards' names and prices, and the free server (the field frame
    // above it takes the row the cards' first fact had; PageDown reaches it, below).
    if (rows === 24) {
      for (const w of ['ash-3']) expect(frame).toContain(w);
      expect(planWithPrice(frame.split('\n'), 'Free', '$0')).toBe(true);
      expect(planWithPrice(frame.split('\n'), 'Small', '$12')).toBe(true);
    }
  }, 120_000);
}

/** A plan card's name line, then its price on the next line in the same card. */
function planWithPrice(lines: string[], name: string, price: string): boolean {
  return lines.some((l, i) => {
    const m = new RegExp(`[│┃] ${name}\\b`).exec(l);
    return m !== null && (lines[i + 1] ?? '').slice(m.index, m.index + 40).includes(`${price} / month`);
  });
}

// Every plan the page sells, with its price, is reached from the first 80x24 screen by PageDown alone (the cards sit in
// the page scroll), and so is the first card's fact row that the first screen leaves out.
test('80x24: PageDown reaches every plan with its price, and the first card facts', async () => {
  s = await renderPage({ page: 'billing', cols: 80, rows: 24 });
  const frames = [await s.settle()];
  for (let i = 0; i < 3; i++) { await s.keys.press('pagedown'); frames.push(await s.settle()); }
  expect(s.failures).toEqual([]);
  for (const [name, price] of [['Free', '$0'], ['Small', '$12'], ['Medium', '$29'], ['Large', '$59']] as const) {
    expect(frames.some((f) => planWithPrice(f.split('\n'), name, price)), `${name} ${price}`).toBe(true);
  }
  expect(frames.some((f) => /[│┃] Computers\s+3\b/.test(f))).toBe(true);
}, 120_000);
