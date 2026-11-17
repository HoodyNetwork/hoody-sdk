// New program, in the terminal at 80x24. The drawer's body scrolls there: "Run as" and what follows are below the
// fold, and Cancel and Add program stand under the body. Tab went Name, Command, Cancel, Add program and only then
// "Run as": the hidden fields were ordered by the rows they are laid out on, which are the buttons' rows and lower.
// The web's order is the form's: every field, then the buttons. The same now (term/prim/focus.ts orderY).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | 80x24: Tab reaches Name, Command, Run as in that order, and both buttons only after Run as | 'fields before buttons' |
// | 2 | Shift+Tab from Cancel goes back into the body, not to Command past the hidden fields | 'back from Cancel' |
// | 3 | 120x40 (no stop hidden): Name, Command, Run as lead the round and the buttons follow, as on the base file (this test passes there too) | 'roomy' |
// | 4 | Shift+Tab walks the same stops in exactly the reverse order, at 80x24 and at 120x40 | 'reverse' |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf, type SemNode } from '../../term/prim/semantics';
import np from './sandbox/strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const focused = (): string => focusedNode(tree())?.name ?? '';
const NAME = np['np.name'], COMMAND = np['np.command'], USER = np['np.user'];

async function open(cols: number, rows: number): Promise<void> {
  s = await renderPage({ page: 'programs', cols, rows });
  await s.settle();
  for (let i = 0; i < 200 && focused() !== 'New program'; i++) await s.keys.press('tab');
  expect(focused()).toBe('New program');
  await s.keys.press('enter');
  await s.settle();
  expect(s.frame).toContain('How it runs');
}
/** The names Tab stops on, one round from the Name field (each name once, in the order first reached). */
async function round(): Promise<string[]> {
  for (let i = 0; i < 40 && focused() !== NAME; i++) await s!.keys.press('tab');
  expect(focused()).toBe(NAME);
  const seen = [NAME];
  for (let i = 0; i < 60; i++) {
    await s!.keys.press('tab');
    const f = focused();
    if (f === NAME) break;
    if (!seen.includes(f)) seen.push(f);
  }
  return seen;
}
const at = (seen: string[], name: string): number => { const i = seen.indexOf(name); expect({ name, reached: i >= 0 }).toEqual({ name, reached: true }); return i; };

test('fields before buttons', async () => {
  await open(80, 24);
  const seen = await round();
  expect(at(seen, COMMAND)).toBeGreaterThan(at(seen, NAME));
  expect(at(seen, USER)).toBeGreaterThan(at(seen, COMMAND));
  expect(at(seen, 'Cancel')).toBeGreaterThan(at(seen, USER));
  expect(at(seen, 'Add program')).toBeGreaterThan(at(seen, USER));
  // Cancel is not the stop right after Command: the hidden fields stand between them
  expect(at(seen, 'Cancel') - at(seen, COMMAND)).toBeGreaterThan(1);
}, 240_000);

test('back from Cancel', async () => {
  await open(80, 24);
  for (let i = 0; i < 60 && focused() !== 'Cancel'; i++) await s!.keys.press('tab');
  expect(focused()).toBe('Cancel');
  await s!.keys.press('tab', { shift: true });
  expect([NAME, COMMAND]).not.toContain(focused());
}, 240_000);

test('roomy', async () => {
  await open(120, 40);
  const seen = await round();
  // no stop is hidden at this size, so the order is the one the rows give, as before the change
  expect(seen.slice(0, 3)).toEqual([NAME, COMMAND, USER]);
  expect(at(seen, USER)).toBeGreaterThan(at(seen, COMMAND));
  expect(at(seen, 'Cancel')).toBeGreaterThan(at(seen, USER));
}, 240_000);

/** Every stop of one round from Name, in order (names may repeat: two rows can both hold a "Remove"). */
async function walk(key: () => Promise<void>): Promise<string[]> {
  for (let i = 0; i < 200 && focused() !== NAME; i++) await s!.keys.press('tab');
  expect(focused()).toBe(NAME);
  const seen: string[] = [];
  for (let i = 0; i < 200; i++) {
    await key();
    const f = focused();
    if (f === NAME) break;
    seen.push(f);
  }
  return seen;
}

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`reverse ${cols}x${rows}`, async () => {
    await open(cols, rows);
    const fwd = await walk(() => s!.keys.press('tab'));
    const back = await walk(() => s!.keys.press('tab', { shift: true }));
    expect(fwd.length).toBeGreaterThan(4);
    expect(back).toEqual([...fwd].reverse());
  }, 240_000);
}
