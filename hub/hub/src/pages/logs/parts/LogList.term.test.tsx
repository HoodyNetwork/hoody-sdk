import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../../scripts/term/render';

let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });

const rowsOf = (frame: string) => frame.split('\n').filter((l) => /\d\d:\d\d:\d\d/.test(l));

/** The page and its frame once the list is drawn: in a long run (other files first) the first settle can still show
 *  "Loading…" (`frame` is the snapshot taken then; settle() answers the current one). */
async function open(): Promise<{ s: Awaited<ReturnType<typeof renderPage>>; frame: string }> {
  const s = await renderPage({ page: 'logs', cols: 120, rows: 30 });
  let frame = s.frame;
  for (let i = 0; i < 20 && rowsOf(frame).length === 0; i++) {
    await new Promise((r) => setTimeout(r, 250));
    frame = await s.settle();
  }
  return { s, frame };
}

test('the list draws its own rows on the table primitives: head, measured words, a path keeping its tail', async () => {
  const { s, frame } = await open();
  close = () => s.close();
  expect(s.failures).toEqual([]);
  expect(frame).toContain('What happened');
  const rows = rowsOf(frame);
  expect(rows.length).toBeGreaterThan(5);
  // The engine's middle cut ("ope...ownload") never appears: What gives way at its end or keeps a path's tail.
  expect(frame).not.toMatch(/\w\.\.\.\w/);
  // The cursor bar sits on the first row.
  expect(rows[0]).toMatch(/[▌›] \d\d:\d\d:\d\d/);
}, 60_000);

test('↓ moves the cursor to the next row (the page\'s active row), as the kit table does', async () => {
  const { s, frame } = await open();
  close = () => s.close();
  const before = rowsOf(frame);
  await s.keys.press('down');
  const after = rowsOf(await s.settle());
  expect(before[1]).not.toMatch(/^[^\d]*[▌›] /);
  expect(after[1]).toMatch(/[▌›] \d\d:\d\d:\d\d/);
}, 60_000);

test('at 80 columns the list sheds columns instead of cutting the result words', async () => {
  const s = await renderPage({ page: 'logs', cols: 80, rows: 24 });
  close = () => s.close();
  expect(s.failures).toEqual([]);
  expect(s.frame).not.toMatch(/Too m…|Not fo…/);
}, 60_000);

test('Result and From are as wide as the words of the rows read, so What happened keeps the room', async () => {
  const s = await renderPage({ page: 'logs', cols: 80, rows: 24 });
  close = () => s.close();
  let frame = s.frame;
  for (let i = 0; i < 20 && rowsOf(frame).length === 0; i++) {
    await new Promise((r) => setTimeout(r, 250));
    frame = await s.settle();
  }
  expect(s.failures).toEqual([]);
  // Every row read here is from Visits: From holds that word (6 cells), not "Proxy decisions" (was 16). Result stays
  // as wide as "Too many requests": a row of the list read says it, further down.
  const head = frame.split('\n').find((l) => l.includes('What happened')) ?? '';
  expect(head).toMatch(/From {1,6}What happened/);
  expect(frame).not.toMatch(/Too m…|Not fo…/);
  expect(frame).toMatch(/● Not found +Visits/);
}, 60_000);

test('What happened keeps its words at 120 columns: the Visitor column comes in only where both fit', async () => {
  const s = await renderPage({ page: 'logs', cols: 120, rows: 40 });
  close = () => s.close();
  let frame = s.frame;
  for (let i = 0; i < 20 && rowsOf(frame).length === 0; i++) {
    await new Promise((r) => setTimeout(r, 250));
    frame = await s.settle();
  }
  expect(s.failures).toEqual([]);
  expect(frame).toContain('Terminal: opened');
  expect(frame.split('\n').find((l) => l.includes('What happened')) ?? '').not.toContain('Visitor');
  await s.resize(200, 50);
  const wide = await s.settle();
  expect(wide.split('\n').find((l) => l.includes('What happened')) ?? '').toContain('Visitor');
  expect(wide).toContain('Terminal: opened');
}, 60_000);

test('Tab leaves the list and comes back to it: its rows are a stop in the focus order', async () => {
  const { s, frame } = await open();
  close = () => s.close();
  expect(rowsOf(frame).length).toBeGreaterThan(5);
  // The cursor row draws ▌ while the list has the focus and › while something else has it.
  const mark = () => (rowsOf(s.frame)[0] ?? '').match(/([▌›]) \d\d:\d\d:\d\d/)?.[1] ?? '';
  let away = false;
  let back = false;
  for (let i = 0; i < 160 && !back; i++) {
    await s.keys.press('tab');
    if (mark() === '›') away = true;
    else if (away && mark() === '▌') back = true;
  }
  expect(s.failures).toEqual([]);
  expect({ away, back }).toEqual({ away: true, back: true });
}, 90_000);
