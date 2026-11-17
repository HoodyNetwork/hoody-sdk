// Open in AI from a page with unsaved work, in the terminal dock: the press asks to leave first. Nothing closes while it
// asks; Stay leaves the page and the dock as they were; going on closes the dock once the AI page shows the conversation.
// In a file of its own: one page session sends per process.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../scripts/term/render';
import { focusedNode, getByRole, queryByRole, semanticsOf } from '../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (p: PageSession) => { const r = p.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const focused = (p: PageSession): string => focusedNode(tree(p))?.name ?? '';
/** Clicks the first place the frame shows `text`. */
async function clickText(p: PageSession, text: string): Promise<void> {
  const lines = (await p.settle()).split('\n');
  const y = lines.findIndex((l) => l.includes(text));
  expect(y, `"${text}" is not on screen`).toBeGreaterThanOrEqual(0);
  await p.click(lines[y]!.indexOf(text) + 1, y);
  await p.settle();
}
/** Waits (a few seconds at most) for the frame to show `text`; returns the last frame either way. */
async function shows(p: PageSession, text: string): Promise<string> {
  let f = await p.settle();
  for (let i = 0; i < 20 && !f.includes(text); i++) { await new Promise((r) => setTimeout(r, 250)); f = await p.settle(); }
  return f;
}
async function tabTo(p: PageSession, name: RegExp): Promise<void> {
  for (let i = 0; i < 160 && !name.test(focused(p)); i++) await p.keys.press('tab');
  expect(focused(p) || '(nothing focused)').toMatch(name);
}

test('a leave question holds the move: Stay keeps the dock open where it was; going on closes it once the AI page shows the conversation', async () => {
  s = await renderPage({ page: 'home', cols: 140, rows: 44 });
  await s.settle();
  await tabTo(s, /^Ask$/);
  await s.keys.press('enter');
  await s.settle();
  await tabTo(s, /^Message to your agent$/);
  await s.keys.type('Build me a dashboard');
  await s.keys.press('enter');
  for (let i = 0; i < 80 && getByRole(tree(s), 'button', { name: 'Open in AI' }).states.disabled; i++) { await new Promise((r) => setTimeout(r, 250)); await s.settle(); }
  for (let i = 0; i < 80 && getByRole(tree(s), 'button', { name: 'New conversation' }).states.disabled; i++) { await new Promise((r) => setTimeout(r, 250)); await s.settle(); }
  expect(getByRole(tree(s), 'button', { name: 'Open in AI' }).states.disabled).toBeFalsy();

  // A page with unsaved work: a new script with its first words typed.
  await clickText(s, ' Scripts ');
  await clickText(s, 'New script');
  await s.keys.type('Count the visits');
  let f = await s.settle();
  expect(f).toContain('Count the visits');
  const dockOpen = (): boolean => queryByRole(tree(s!), 'button', { name: 'Close Agent' }) !== null;

  // The press asks to leave first; nothing closes while it asks, and Stay leaves the page and the dock as they were.
  await clickText(s, 'Open in AI');
  f = await shows(s, 'Leave New script?');
  expect(f).toContain('Leave New script?');
  expect(dockOpen()).toBe(true);
  await tabTo(s, /^Stay$/);
  await s.keys.press('enter');
  for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 250)); await s.settle(); }
  f = await s.settle();
  expect(f).not.toContain('Leave New script?');
  expect(f).toContain('Step 1 of 5');
  expect(f).toContain('Count the visits');
  expect(dockOpen(), 'a cancelled move closed the dock').toBe(true);

  // Going on: the dock closes once the AI page shows the conversation.
  await clickText(s, 'Open in AI');
  await shows(s, 'Leave New script?');
  await tabTo(s, /^Leave$/);
  await s.keys.press('enter');
  for (let i = 0; i < 40 && dockOpen(); i++) { await new Promise((r) => setTimeout(r, 250)); await s.settle(); }
  f = await s.settle();
  expect(dockOpen()).toBe(false);
  expect(f).not.toContain('Step 1 of 5');
  expect(f).toContain('Build me a dashboard');
  expect(s.errors.filter((e) => e.includes('TERM_GLOBAL'))).toEqual([]);
}, 240_000);
