// The terminal palette leaves out what a page's view would not open now (the page's manifest searchHide, read by the
// web's probes, shell/search/hide.tsx). Before, it read none: "Turn on two-step sign-in" was listed while two-step
// sign-in was on (Account then opens no Set up: logic.ts openableSheet), "Change password" on a suspended account
// (which sees only its sign-in sessions) and "New support ticket" on an access-key session (Support draws only why).
// The empty list's Commands are filtered too, not only typed results (the web filters typed results only).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Two-step on: no Turn on two-step sign-in, empty list or typed; the other Account commands stay | 'two-step on' |
// | 2 | Two-step off (positive control): Turn on two-step sign-in is listed, empty list and typed | 'two-step off' |
// | 3 | Suspended: no Change password, no Turn on two-step sign-in; Review sign-in sessions stays | 'suspended' |
// | 4 | Access-key session: no New support ticket; Open Support stays | 'access key' |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

/** The rows inside the palette's frame, trimmed: found by its title row's left stroke and the ┐ that ends the border
 *  row above it (│ is also the sidebar's rule), from the title row down to the bottom border. */
function inside(frame: string): string[] {
  const lines = frame.split('\n');
  const title = lines.findIndex((l) => l.includes('│ Command palette'));
  if (title < 1) return [];
  const left = lines[title]!.indexOf('│ Command palette');
  const right = lines[title - 1]!.indexOf('┐', left);
  if (right < 0) return [];
  const out: string[] = [];
  for (let i = title; i < lines.length && lines[i]![left] === '│'; i++) out.push(lines[i]!.slice(left + 1, right).trim());
  return out;
}

/** A row's label: the active mark and any keys at its end left off. */
const labelOf = (row: string): string => row.replace(/^▸\s*/, '').split(/\s{2,}/)[0] ?? '';
const listed = (rows: readonly string[], label: string): boolean => rows.some((r) => labelOf(r) === label);

/** Every row of the empty list: Ctrl+K, then PageDown until the list stops moving (16 rows show at a time). */
async function emptyList(p: PageSession): Promise<string[]> {
  await p.keys.press('k', { ctrl: true });
  let f = await p.settle();
  expect(f, f).toContain('Command palette');
  const seen = new Set(inside(f));
  for (let i = 0; i < 40; i++) {
    await p.keys.press('pagedown');
    const next = await p.settle();
    inside(next).forEach((r) => seen.add(r));
    if (next === f) break;
    f = next;
  }
  // The walk reached the end: the Commands section was drawn.
  expect([...seen], f).toContain('COMMANDS');
  return [...seen];
}

/** The rows the palette lists for typed text (the field is the open palette's). */
async function typedList(p: PageSession, text: string): Promise<string[]> {
  await p.keys.type(text);
  return inside(await p.settle());
}

const keyClash = (p: PageSession) => p.errors.filter((e) => /same key|unique "key"/.test(e));

test('two-step on: Turn on two-step sign-in is left out of the empty list and of typed results', async () => {
  s = await renderPage({ page: 'account', cols: 120, rows: 40 });
  await s.settle();
  const rows = await emptyList(s);
  expect(listed(rows, 'Change password'), rows.join('\n')).toBe(true);
  expect(listed(rows, 'Review sign-in sessions'), rows.join('\n')).toBe(true);
  expect(listed(rows, 'Turn on two-step sign-in'), rows.join('\n')).toBe(false);
  const typed = await typedList(s, 'two-step');
  expect(listed(typed, 'Turn on two-step sign-in'), typed.join('\n')).toBe(false);
  expect(keyClash(s)).toEqual([]);
}, 240_000);

test('two-step off: Turn on two-step sign-in is listed, empty list and typed (positive control)', async () => {
  s = await renderPage({ page: 'account', fx: 'twofa-off', cols: 120, rows: 40 });
  await s.settle();
  const rows = await emptyList(s);
  expect(listed(rows, 'Turn on two-step sign-in'), rows.join('\n')).toBe(true);
  expect(listed(rows, 'Change password'), rows.join('\n')).toBe(true);
  const typed = await typedList(s, 'two-step');
  expect(listed(typed, 'Turn on two-step sign-in'), typed.join('\n')).toBe(true);
}, 240_000);

test('suspended: Change password and Turn on two-step sign-in are left out; Review sign-in sessions stays', async () => {
  s = await renderPage({ page: 'account', fx: 'suspended', cols: 120, rows: 40 });
  await s.settle();
  const rows = await emptyList(s);
  expect(listed(rows, 'Review sign-in sessions'), rows.join('\n')).toBe(true);
  expect(listed(rows, 'Change password'), rows.join('\n')).toBe(false);
  expect(listed(rows, 'Turn on two-step sign-in'), rows.join('\n')).toBe(false);
  const typed = await typedList(s, 'password');
  expect(listed(typed, 'Change password'), typed.join('\n')).toBe(false);
}, 240_000);

test('access key: New support ticket is left out (Support draws only why); Open Support stays', async () => {
  s = await renderPage({ page: 'account', fx: 'access-key', cols: 120, rows: 40 });
  await s.settle();
  const rows = await emptyList(s);
  expect(listed(rows, 'Open Support'), rows.join('\n')).toBe(true);
  expect(listed(rows, 'New support ticket'), rows.join('\n')).toBe(false);
  const typed = await typedList(s, 'ticket');
  expect(listed(typed, 'New support ticket'), typed.join('\n')).toBe(false);
}, 240_000);
