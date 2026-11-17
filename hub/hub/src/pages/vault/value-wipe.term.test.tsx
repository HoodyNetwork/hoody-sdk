// The vault's shown value is short-lived in the terminal, pinned where no terminal test covered it:
// - idle: a shown value hides again after the idle time with no key press, and the held copy is dropped (the field
//   says "Not read yet"; showing it again reads it again);
// - leaving: going to another page and back leaves nothing shown and nothing held (a Show reads again);
// - JSON: Formatted and Raw draw the same value two ways, nothing else of the vault is drawn, and the tree never holds
//   any of it; Hide takes both views off the screen.
// The value is a fixture value and is compared as a boolean only (never printed by a failing expect).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, focusedNode, semanticsOf, semText, type SemNode } from '../../term/prim/semantics';
import { makeT } from '@kit';
import formStrings from '@kit/forms/forms.strings.en.json';
import shellStrings from '@shell/strings.en.json';
import { requestLog } from './fixtures';
import vaultStrings from './strings.en.json';

const t = makeT(vaultStrings);
const sh = makeT(shellStrings);
// The terminal's reveal idle (REVEAL_IDLE_MS, term/app/secret-screen.ts). Its test seam (__secretIdleSeams) lives in
// src/term/app, which a page .term test may not import by relative path (hub/page-boundaries, termRelative), so the
// idle case waits the real time: the clock is above the settle ledger's 1 s bound and runs untracked on real time.
const IDLE_MS = 60_000;
const ft = makeT(formStrings);
const ENTRY = 'deploy.notes';
// fixtures.ts: deploy.notes holds a sentence starting so; github-token holds a fixture token; app.config (jsonValues)
// holds {"retries":3,"hosts":["a.example","b.example"],"tls":{"verify":true}}.
const NOTES_PART = 'Deploy on Fridays';
const TOKEN_PART = 'fixture-token-value';
const FORMATTED = '"retries": 3';
const RAW = '{"retries":3,';
const JSON_PARTS = ['retries', 'a.example', 'b.example'];

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const norm = (x: string): string => x.replace(/\s+/g, ' ').trim();
const nodes = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  const out: SemNode[] = [];
  const walk = (ns: readonly SemNode[]): void => { for (const n of ns) { out.push(n); walk(n.children); } };
  walk(semanticsOf({ root: r.root, stdin: r.stdin }));
  return out;
};
const treeText = (p: PageSession): string => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return semText(semanticsOf({ root: r.root, stdin: r.stdin }));
};
const focused = (p: PageSession): string => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }))?.name ?? '';
};
const tabTo = async (p: PageSession, name: string): Promise<void> => {
  for (let i = 0; i < 160 && focused(p) !== name; i++) await p.keys.press('tab');
  expect(focused(p)).toBe(name);
};
const shownIn = (frame: string, part: string): boolean => norm(frame).includes(part);
const reads = (key: string): number => requestLog.filter((r) => r.method === 'GET' && r.path.endsWith(`/vault/keys/${key}`)).length;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const says = (p: PageSession, frame: string, text: string): boolean =>
  norm(frame).includes(norm(text)) || nodes(p).some((n) => norm(n.name).includes(norm(text)));
/** The value box shows: Tab to its group ("Value"), Enter. */
async function show(p: PageSession): Promise<string> {
  await tabTo(p, t('value.field'));
  await p.keys.press('enter');
  let frame = await p.settle();
  for (let i = 0; i < 40 && !nodes(p).some((n) => n.role === 'button' && norm(n.name) === t('value.hideEye')); i++) { await sleep(50); frame = await p.settle(); }
  return frame;
}
/** Presses the shell's sidebar entry named `label` (a page change, as a person makes it). */
async function go(p: PageSession, label: string): Promise<string> {
  const n = nodes(p).find((x) => norm(x.name).replace(/^[▌›]\s*/, '') === label && x.actions.includes('press'));
  expect(n).toBeDefined();
  act(n!, 'press');
  return p.settle();
}

test('idle: a shown value hides again with no key press, and is read again to show again', async () => {
  s = await renderPage({ page: 'vault', cols: 120, rows: 40, path: `/vault?sel=${ENTRY}` });
  expect(shownIn(await s.settle(), NOTES_PART)).toBe(false);
  expect(shownIn(await show(s), NOTES_PART)).toBe(true);
  expect(reads(ENTRY)).toBe(1);
  // Well inside the idle time it is still shown (no key pressed, nothing hid it early).
  await sleep(5_000);
  expect(shownIn(await s.settle(), NOTES_PART)).toBe(true);
  await sleep(IDLE_MS - 5_000 + 2_500);
  const frame = await s.settle();
  expect(shownIn(frame, NOTES_PART)).toBe(false);
  // Dropped, not only masked: the field says it holds nothing, and showing it again reads it again.
  expect(says(s, frame, ft('secret.notRead'))).toBe(true);
  expect(reads(ENTRY)).toBe(1);
  expect(shownIn(await show(s), NOTES_PART)).toBe(true);
  expect(reads(ENTRY)).toBe(2);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);

test('leaving: another page and back, the value is neither shown nor held (Show reads again)', async () => {
  s = await renderPage({ page: 'vault', cols: 120, rows: 40, path: `/vault?sel=${ENTRY}` });
  await s.settle();
  expect(shownIn(await show(s), NOTES_PART)).toBe(true);
  expect(reads(ENTRY)).toBe(1);
  let frame = await go(s, sh('keys.goHome'));
  expect(shownIn(frame, NOTES_PART)).toBe(false);
  expect(treeText(s).includes(NOTES_PART)).toBe(false);
  frame = await go(s, t('nav'));
  // Open deploy.notes again from the list when the page came back without it (a row is opened by a second press).
  for (let i = 0; i < 2 && !nodes(s).some((n) => norm(n.name) === t('value.field') && n.actions.includes('focus')); i++) {
    const lines = frame.split('\n');
    const y = lines.findIndex((l) => l.includes(` ${ENTRY} `));
    expect(y).toBeGreaterThan(-1);
    await s.click(lines[y]!.indexOf(ENTRY) + 1, y);
    frame = await s.settle();
  }
  expect(shownIn(frame, NOTES_PART)).toBe(false);
  expect(says(s, frame, ft('secret.notRead'))).toBe(true);
  // Nothing was read on the way back; a Show reads afresh.
  expect(reads(ENTRY)).toBe(1);
  expect(shownIn(await show(s), NOTES_PART)).toBe(true);
  expect(reads(ENTRY)).toBe(2);
  expect(s.failures).toEqual([]);
}, 240_000);

test('JSON: Formatted and Raw draw the value two ways, nothing else leaks, the tree holds none of it, Hide clears both', async () => {
  s = await renderPage({ page: 'vault', fx: 'jsonValues', cols: 120, rows: 40, path: '/vault?sel=app.config' });
  await s.settle();
  let frame = await show(s);
  // Formatted is the default view.
  expect(shownIn(frame, FORMATTED)).toBe(true);
  expect(shownIn(frame, RAW)).toBe(false);
  const raw = nodes(s).find((n) => n.role === 'radio' && norm(n.name) === ft('secret.raw'));
  expect(raw).toBeDefined();
  act(raw!, raw!.actions.includes('press') ? 'press' : 'click', undefined, { force: true });
  frame = await s.settle();
  expect(shownIn(frame, RAW)).toBe(true);
  expect(shownIn(frame, FORMATTED)).toBe(false);
  expect(nodes(s).some((n) => n.role === 'radio' && norm(n.name) === ft('secret.raw') && n.states.checked === true)).toBe(true);
  // Only the opened entry: another entry's value is never drawn.
  expect(shownIn(frame, TOKEN_PART)).toBe(false);
  // The tree says the field is filled, never what it holds, in either view.
  const text = treeText(s);
  for (const part of JSON_PARTS) expect(text.includes(part)).toBe(false);
  expect(text.includes(TOKEN_PART)).toBe(false);
  // Hide: neither view is left on the screen.
  const hide = nodes(s).find((n) => n.role === 'button' && norm(n.name) === t('value.hideEye'));
  expect(hide).toBeDefined();
  act(hide!, hide!.actions.includes('press') ? 'press' : 'click', undefined, { force: true });
  frame = await s.settle();
  expect(shownIn(frame, RAW)).toBe(false);
  expect(shownIn(frame, FORMATTED)).toBe(false);
  for (const part of JSON_PARTS) expect(shownIn(frame, part)).toBe(false);
  expect(s.failures).toEqual([]);
}, 240_000);
