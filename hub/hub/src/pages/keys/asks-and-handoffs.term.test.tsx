// Keys flows that are right in the terminal and had no terminal test:
// - a row's menu (its "⋯", Row actions) → Delete… opens the confirm naming that key; Cancel sends nothing;
// - a made share with "Include the token" on: no token is drawn in the frame or carried by the tree;
// - SSH key → Replace → "How do I get a key?": "Make one here" is the hand-off (its reason and the web links), never a
//   "Make a key" button the terminal could not honour;
// - New key with a typed name: Esc asks before discarding; Esc on the question keeps editing; Discard closes; nothing sent.
// Words come from the strings files.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { shotCase } from '../../../scripts/term/goldens';
import { rendererHitAt, replay, type Node as SemLike } from '../../../scripts/term/shot-replay';
import { act, getByRef, semanticsOf, semText, type SemNode } from '../../term/prim/semantics';
import { makeT } from '@kit';
import kitStrings from '@kit/strings.en.json';
import overlayStrings from '@kit/overlays/strings.en.json';
import handoffStrings from '@kit/states/Handoff.term.strings.en.json';
import sshHelpStrings from '@kit/forms/SshKeyHelp.strings.en.json';
import formTermStrings from '@kit/forms/term.strings.en.json';
import { sent } from './fixtures';
import shots from './shots';
import keysStrings from './strings.en.json';

const t = makeT(keysStrings);
const kt = makeT(kitStrings);
const ot = makeT(overlayStrings);
const ht = makeT(handoffStrings);
const st = makeT(sshHelpStrings);
const ftt = makeT(formTermStrings);
const KEY = 'ci-deploy'; // fixtures.ts: the first key of the default list
const TOKEN = /hdy_[0-9a-zA-Z_]{8,}/;
const COLS = 120;
const ROWS = 40;

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const norm = (x: string): string => x.replace(/\s+/g, ' ').trim();
const roots = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};
const nodes = (p: PageSession): SemNode[] => {
  const out: SemNode[] = [];
  const walk = (ns: readonly SemNode[]): void => { for (const n of ns) { out.push(n); walk(n.children); } };
  walk(roots(p));
  return out;
};
const under = (n: SemNode): SemNode[] => [n, ...n.children.flatMap(under)];
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const says = (p: PageSession, frame: string, text: string): boolean =>
  norm(frame).includes(norm(text)) || nodes(p).some((n) => norm(n.name).includes(norm(text)) || norm(n.description ?? '').includes(norm(text)));
async function until(p: PageSession, ok: (frame: string) => boolean): Promise<string> {
  let frame = await p.settle();
  for (let i = 0; i < 60 && !ok(frame); i++) { await sleep(100); frame = await p.settle(); }
  return frame;
}
function press(n: SemNode): void {
  if (n.actions.includes('press')) act(n, 'press');
  else act(n, 'click', undefined, { force: true });
}
const named = (pool: SemNode[], roles: readonly string[], name: string | RegExp): SemNode | undefined =>
  pool.find((n) => roles.includes(n.role) && (typeof name === 'string' ? norm(n.name) === norm(name) : name.test(norm(n.name))) && !n.states.disabled);
const dialogNamed = (p: PageSession, title: string): SemNode | undefined =>
  nodes(p).find((n) => (n.role === 'dialog' || n.role === 'alertdialog') && norm(n.name).includes(norm(title)));
/** A kit Disclosure's toggle: named by its title, a description may follow (Disclosure.term); closed, pressable. */
const foldNamed = (p: PageSession, title: string): SemNode | undefined =>
  nodes(p).find((n) => norm(n.name).startsWith(norm(title)) && n.actions.includes('press') && !n.states.disabled && n.states.expanded !== true);
/** Esc as a person presses it: a lone ESC is told from a key sequence after a short wait. */
async function escape(p: PageSession): Promise<string> {
  await p.keys.press('escape');
  await sleep(150);
  return p.settle();
}

/** Draws the keys shot `name` as the golden runner does (its state and path, then its replayed steps). */
async function drawShot(name: string): Promise<string> {
  const shot = (shots as readonly { name: string }[]).find((x) => x.name === name);
  expect(shot).toBeDefined();
  const c = shotCase(shot as never, '/keys');
  expect(c).toBeDefined();
  s = await renderPage({ page: 'keys', path: c!.path, fx: c!.fx, cols: COLS, rows: ROWS });
  await s.settle();
  const p = s;
  const r0 = p.renderer as unknown as { root: unknown; stdin?: never };
  const hitAt = rendererHitAt(p.renderer);
  const why = await replay(p, c!.steps ?? [], { tree: () => semanticsOf({ root: r0.root as never, stdin: r0.stdin as never }) as unknown as SemLike[], cols: COLS, rows: ROWS, wheel: async () => { await p.settle(); }, ...(hitAt ? { hitAt } : {}) });
  expect(why).toBeNull();
  return p.settle();
}

test('row menu → Delete… opens the confirm naming the key; Cancel sends nothing', async () => {
  s = await renderPage({ page: 'keys', cols: COLS, rows: ROWS, path: '/keys' });
  const frame = await s.settle();
  const lines = frame.split('\n');
  const y = lines.findIndex((l) => l.includes(` ${KEY} `));
  expect(y).toBeGreaterThan(-1);
  // The row's own "⋯" (a pressable that is no Tab stop): the one on the key's line.
  const dots = nodes(s).find((n) => n.role === 'button' && norm(n.name) === kt('table.rowActions') && n.box[1] === y);
  expect(dots).toBeDefined();
  act(dots!, 'click', undefined, { force: true });
  await s.settle();
  const item = named(nodes(s), ['menuitem'], t('act.delete'));
  expect(item).toBeDefined();
  press(item!);
  await s.settle();
  const confirm = dialogNamed(s, t('del.title', { name: KEY }));
  expect(confirm).toBeDefined();
  expect(named(under(confirm!), ['button'], t('del.go'))).toBeDefined();
  const cancel = named(under(confirm!), ['button'], ot('cancel'));
  expect(cancel).toBeDefined();
  press(cancel!);
  await s.settle();
  expect(dialogNamed(s, t('del.title', { name: KEY }))).toBeUndefined();
  expect(sent.remove).toBe(0);
  expect(s.failures).toEqual([]);
}, 240_000);

test('a made share with Include the token on: no token in the frame or the tree', async () => {
  await drawShot('share-review');
  const drawer = nodes(s!).find((n) => n.role === 'dialog');
  expect(drawer).toBeDefined();
  const create = named(under(drawer!), ['button'], t('share.create'));
  expect(create).toBeDefined();
  press(create!);
  let frame = await until(s!, (f) => says(s!, f, t('share.msgTitle')));
  expect(says(s!, frame, t('share.msgTitle'))).toBe(true);
  expect(sent.create).toBe(1);
  const fold = foldNamed(s!, t('share.moreTitle'));
  expect(fold).toBeDefined();
  press(fold!);
  await s!.settle();
  const sw = named(nodes(s!), ['switch'], t('share.withToken'));
  expect(sw).toBeDefined();
  expect(sw!.states.checked === true).toBe(false);
  press(sw!);
  frame = await s!.settle();
  expect(nodes(s!).some((n) => n.role === 'switch' && norm(n.name) === t('share.withToken') && n.states.checked === true)).toBe(true);
  // The token was minted (the fake server answered it) and is held, but never drawn and never in the tree.
  expect(TOKEN.test(frame)).toBe(false);
  expect(TOKEN.test(semText(roots(s!)))).toBe(false);
  expect(s!.failures).toEqual([]);
}, 240_000);

test('SSH key → Replace → How do I get a key?: "Make one here" is the hand-off, never a Make a key button', async () => {
  await drawShot('ssh-edit');
  const help = foldNamed(s!, st('sshhelp.title'));
  expect(help).toBeDefined();
  press(help!);
  const frame = await s!.settle();
  const region = nodes(s!).find((n) => n.role === 'region' && norm(n.name) === st('sshhelp.make.title'));
  expect(region).toBeDefined();
  expect(says(s!, frame, ftt('sshhelp.makeReason'))).toBe(true);
  // The hand-off's own controls, inside the region: the web links.
  const inside = under(region!);
  expect(inside.some((n) => n.role === 'group' && norm(n.name) === ht('handoff.actions'))).toBe(true);
  expect(inside.some((n) => norm(n.name) === ht('handoff.copy'))).toBe(true);
  // The web's in-browser maker is not offered here.
  expect(nodes(s!).some((n) => n.role === 'button' && norm(n.name) === st('sshhelp.make.go'))).toBe(false);
  expect(sent.setSsh).toBe(0);
  expect(s!.failures).toEqual([]);
}, 240_000);

test('New key with a typed name: Esc asks first; Esc on the question keeps editing; Discard closes; nothing sent', async () => {
  s = await renderPage({ page: 'keys', cols: COLS, rows: ROWS, path: '/keys' });
  await s.settle();
  const open = named(nodes(s), ['button'], t('action.new'));
  expect(open).toBeDefined();
  press(open!);
  await s.settle();
  const name = nodes(s).find((n) => n.role === 'textbox' && norm(n.name) === t('nk.name') && n.actions.includes('type'));
  expect(name).toBeDefined();
  if (!name!.states.focused && name!.actions.includes('focus')) { act(name!, 'focus'); await s.settle(); }
  act(getByRef(roots(s), name!.ref), 'type', 'ci');
  await s.settle();
  // Esc asks.
  let frame = await escape(s);
  expect(says(s, frame, ot('discardAsk'))).toBe(true);
  expect(named(nodes(s), ['button'], ot('keepEditing'))).toBeDefined();
  expect(named(nodes(s), ['button'], ot('discard'))).toBeDefined();
  // Esc on the question keeps editing: the drawer and the typed name stay.
  frame = await escape(s);
  expect(says(s, frame, ot('discardAsk'))).toBe(false);
  expect(dialogNamed(s, t('nk.title'))).toBeDefined();
  const kept = nodes(s).find((n) => n.role === 'textbox' && norm(n.name) === t('nk.name'));
  expect(kept).toBeDefined();
  // The typed name is kept (the field's text, when the field reports one; "ci" alone would match the list's ci-deploy).
  if (kept!.value !== undefined) expect(kept!.value).toBe('ci');
  // Asked again, Discard closes it.
  frame = await escape(s);
  expect(says(s, frame, ot('discardAsk'))).toBe(true);
  const discard = named(nodes(s), ['button'], ot('discard'));
  expect(discard).toBeDefined();
  press(discard!);
  frame = await s.settle();
  expect(dialogNamed(s, t('nk.title'))).toBeUndefined();
  expect(named(nodes(s), ['button'], t('nk.go'))).toBeUndefined();
  expect(sent.create).toBe(0);
  expect(s.failures).toEqual([]);
}, 240_000);
