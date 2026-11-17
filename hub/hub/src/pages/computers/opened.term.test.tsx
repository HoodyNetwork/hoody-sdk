// What the Computers page hands outside the Hub in the terminal: every Open of a program address goes to the host's
// browser (openOutside -> TermHostServices.openExternal) WHOLE, both ids in it, while the page only ever draws it
// masked. renderPage's `openExternal` records it as the scenario `opened` expectation does (src/kit/scenario-types.ts).
// The web half of these callers is not covered here (guarded by the no-window-open rule and openOutside's own cases).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role } from '../../term/prim/semantics';

const PROJECT = '6a0000000000000000000001';
const ATLAS = 'c0a7150000000000000000a1';
const TERMINAL = `https://${PROJECT}-${ATLAS}-terminal-1.n12.fixture.invalid`;

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

async function open(path: string): Promise<string[]> {
  const opened: string[] = [];
  s = await renderPage({ page: 'computers', path, cols: 140, rows: 80, openExternal: (u) => { opened.push(u); } });
  await s.settle();
  return opened;
}

async function press(role: Role, name: string): Promise<void> {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  const found = queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), role, { name });
  expect(found.length).toBeGreaterThan(0);
  act(found[0]!, 'press');
  await s!.settle();
}

test('row menu: Open terminal opens the terminal address whole; the frame never shows the id', async () => {
  const opened = await open('/computers');
  await press('button', 'Row actions');
  await press('menuitem' as Role, 'Open terminal');
  expect(opened).toEqual([TERMINAL]);
  expect(s!.frame).not.toContain(ATLAS);
}, 180_000);

test('Run: Open a temporary terminal opens terminal-0 with ?ephemeral=true, whole', async () => {
  const opened = await open('/computers?sel=atlas.00a1&tab=run');
  await press('button', 'Open a temporary terminal');
  expect(opened).toEqual([`https://${PROJECT}-${ATLAS}-terminal-0.n12.fixture.invalid/?ephemeral=true`]);
  expect(s!.frame).not.toContain(ATLAS);
}, 180_000);

test('Overview: the Terminal use tile opens the terminal address whole', async () => {
  const opened = await open('/computers?sel=atlas.00a1&tab=overview');
  await press('button', 'Run commands in your browser.');
  expect(opened).toEqual([TERMINAL]);
  expect(s!.frame).not.toContain(ATLAS);
}, 180_000);

test('Connect: Open Terminal opens the terminal address whole', async () => {
  const opened = await open('/computers?sel=atlas.00a1&tab=connect');
  await press('button', 'Open Terminal');
  expect(opened).toEqual([TERMINAL]);
  expect(s!.frame).not.toContain(ATLAS);
}, 180_000);
