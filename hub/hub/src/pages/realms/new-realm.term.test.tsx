// New realm in the terminal (view.tsx, logic.ts engine, fixtures.ts): the flows a person goes through, pinned on the
// fake server's record of every write (realmSends), so a test sees what was SENT, not only what was drawn.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Name, pick a computer, Create: one name write, one write of that computer, then the page goes on (no wizard left) | 'made' |
// | 2 | A reserved word or a taken name shows its rule under the field and Next stays on step 1; nothing is sent | 'name rules' |
// | 3 | A lost name answer: Check again only reads (no second write) and Try again is offered only once a read showed the name absent | 'name unknown' |
// | 4 | A held computer write: Stop tracking asks first (Cancel keeps it), confirming frees it without sending anything | 'held stop tracking' |
// | 5 | With the name's outcome unknown, choosing another page asks to stay; Cancel stays, Leave goes | 'leave guard' |
// | 6 | A shared-access session at 80x24 shows the no-access sentences whole, with no way to make a realm | 'pinned' |
// | 7 | With 24 computers picked at 80x24, Your choices shows the count and every name: scrolling the page reaches each one | 'many picked' |
import { afterEach, expect, test } from 'bun:test';
import { fixtureWorld } from '@core';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { frameShows } from '../../../scripts/term/wait-text';
import { act, queryAllByRole, semanticsOf, type SemNode } from '../../term/prim/semantics';
import { openMenu } from '../../term/shell/menus-store';
import { manyExtra, realmSends } from './fixtures';
import rs from './strings.en.json';
import ks from '../../kit/strings.en.json';
import fo from '../../kit/forms/forms.strings.en.json';
import os from '../../kit/overlays/strings.en.json';
import tsh from '../../term/shell/strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const below = (n: SemNode): SemNode[] => n.children.flatMap((c) => [c, ...below(c)]);
const fold = (x: string) => x.replace(/\s+/g, ' ').trim().toLowerCase();
const fill = (x: string, v: Record<string, string | number>) => x.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k]));
/** On screen, or in the tree (a sentence the frame wraps or a pane cuts is still read whole there). */
function shows(text: string): boolean {
  if (frameShows(s!.frame, text)) return true;
  const want = fold(text);
  return tree().flatMap((n) => [n, ...below(n)]).some((n) => fold(n.name).includes(want) || fold(n.description ?? '').includes(want));
}
async function until(ok: () => boolean, tries = 50): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    await s!.settle();
    if (ok()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  await s!.settle();
  return ok();
}
const buttons = (name: string, scope: SemNode[] = tree()) => queryAllByRole(scope, 'button', { name });
const enabled = (ns: SemNode[]) => ns.filter((n) => !n.states.disabled);
async function press(name: string, scope?: SemNode[]) {
  const b = enabled(buttons(name, scope))[0];
  if (!b) throw new Error(`no enabled button "${name}"`);
  act(b, 'press');
  await s!.settle();
}
const dialog = (title: string): SemNode | null => [...queryAllByRole(tree(), 'alertdialog', { name: title }), ...queryAllByRole(tree(), 'dialog', { name: title })][0] ?? null;
const rowWith = (hit: (name: string) => boolean): SemNode | undefined => queryAllByRole(tree(), 'row').find((r) => below(r).some((c) => hit(c.name)));

// What the fake server received: the realm-name map writes and the computer writes.
const nameSends = () => realmSends.filter((x) => x.path.endsWith('/hoody.realm-aliases'));
const computerSends = () => realmSends.filter((x) => /\/computers\//.test(x.path));
const mapOf = (body: unknown) => JSON.parse(String((body as { value?: unknown } | null)?.value ?? '{}')) as Record<string, string>;

const step = (n: number) => fill(ks['wizard.step'], { n, total: 3 });
// The first clause of each long outcome sentence (as shots.ts waits on them): enough to tell them apart.
const mayNotSave = rs['name.mayNotSave'].split(':')[0]!;
const notSeen = rs['name.notSeen'].split(',')[0]!;
const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const isAtlas = (n: string) => n.trim() === atlas.name || n.trim().endsWith(` ${atlas.name}`);

async function pick(hit: (n: string) => boolean) {
  expect(await until(() => !!rowWith(hit))).toBe(true);
  const row = rowWith(hit)!;
  const box = queryAllByRole([row], 'checkbox', { name: ks['table.selectRow'] })[0];
  // The row's checkbox is out of the Tab order (a click, as a person's); without one, the table's own Space.
  if (box) act(box, 'click', undefined, { force: true });
  else { act(row, 'focus'); await s!.settle(); await s!.keys.press('space'); }
  await s!.settle();
  expect(await until(() => rowWith(hit)?.states.selected === true)).toBe(true);
}

/** Step 1 name, step 2 (a computer picked or none), step 3 Create. */
async function create(name: string, computer: ((n: string) => boolean) | null) {
  expect(await until(() => shows(rs['name.help']))).toBe(true);
  const field = queryAllByRole(tree(), 'textbox', { name: rs['name.label'] })[0];
  expect(field).toBeDefined();
  act(field!, 'type', name);
  await s!.settle();
  await press(rs.next);
  expect(await until(() => shows(rs['pick.title']))).toBe(true);
  if (computer) await pick(computer);
  await press(rs.next);
  expect(await until(() => enabled(buttons(rs.create)).length > 0)).toBe(true);
  await press(rs.create);
}

test('made', async () => {
  s = await renderPage({ page: 'realms', path: '/realms/new', cols: 120, rows: 40 });
  await create('Studio', isAtlas);
  // A full success leaves the wizard for the new realm's Computers at once.
  expect(await until(() => computerSends().length === 1 && !shows(step(3)))).toBe(true);
  expect(nameSends()).toHaveLength(1);
  const map = mapOf(nameSends()[0]!.body);
  const id = Object.keys(map).find((k) => map[k] === 'Studio');
  expect(id).toMatch(/^[0-9a-f]{24}$/);
  // atlas joins the new realm and keeps every realm it had.
  const sent = computerSends()[0]!;
  expect(sent.path).toContain(atlas.id);
  const ids = (sent.body as { realm_ids: string[] }).realm_ids;
  expect(ids).toContain(id!);
  for (const had of atlas.realm_ids) expect(ids).toContain(had);
  expect(s.failures).toEqual([]);
}, 240_000);

test('name rules', async () => {
  s = await renderPage({ page: 'realms', path: '/realms/new', cols: 120, rows: 40 });
  expect(await until(() => shows(rs['name.help']))).toBe(true);
  const field = () => queryAllByRole(tree(), 'textbox', { name: rs['name.label'] })[0]!;
  // A word the Hub uses (the sidecar's reserved list: all, none, every, any, global).
  act(field(), 'type', 'all');
  await s.settle();
  await press(rs.next);
  expect(await until(() => shows(fill(rs['name.reserved'], { word: 'all' })))).toBe(true);
  expect(shows(step(1))).toBe(true);
  expect(shows(rs['pick.title'])).toBe(false);
  // A name another realm has (the fixture world's first realm).
  act(field(), 'setValue', fixtureWorld.realms[0]!.name);
  await s.settle();
  await press(rs.next);
  expect(await until(() => shows(rs['name.taken']))).toBe(true);
  expect(shows(step(1))).toBe(true);
  expect(shows(rs['pick.title'])).toBe(false);
  expect(realmSends).toEqual([]);
}, 240_000);

test('name unknown', async () => {
  s = await renderPage({ page: 'realms', fx: 'nameLost', path: '/realms/new', cols: 120, rows: 40 });
  await create('Studio', null);
  expect(await until(() => shows(mayNotSave))).toBe(true);
  expect(nameSends()).toHaveLength(1);
  // Unknown is not a proof the name is absent: no second write is offered yet.
  expect(buttons(rs['name.tryAgain'])).toEqual([]);
  expect(buttons(fo['outcome.retry'])).toEqual([]);
  await press(fo['outcome.check']);
  expect(await until(() => shows(notSeen))).toBe(true);
  expect(nameSends()).toHaveLength(1);
  // The read showed the name absent: now a new write may be asked for, and only that sends.
  expect(enabled(buttons(rs['name.tryAgain']))).toHaveLength(1);
  await press(rs['name.tryAgain']);
  expect(await until(() => nameSends().length === 2)).toBe(true);
  expect(mapOf(nameSends()[1]!.body)).toMatchObject(mapOf(nameSends()[0]!.body));
}, 240_000);

test('held stop tracking', async () => {
  s = await renderPage({ page: 'realms', fx: 'computerHeld', path: '/realms/new', cols: 120, rows: 40 });
  await create('Studio', isAtlas);
  expect(await until(() => enabled(buttons(rs['items.dismissHeld'])).length > 0)).toBe(true);
  expect(computerSends()).toHaveLength(1);
  await press(rs['items.dismissHeld']);
  expect(await until(() => !!dialog(rs['dismiss.title']))).toBe(true);
  await press(os.cancel, [dialog(rs['dismiss.title'])!]);
  expect(await until(() => !dialog(rs['dismiss.title']))).toBe(true);
  expect(enabled(buttons(rs['items.dismissHeld']))).toHaveLength(1);
  await press(rs['items.dismissHeld']);
  expect(await until(() => !!dialog(rs['dismiss.title']))).toBe(true);
  await press(rs['dismiss.go'], [dialog(rs['dismiss.title'])!]);
  expect(await until(() => !dialog(rs['dismiss.title']) && buttons(rs['items.dismissHeld']).length === 0)).toBe(true);
  // Freeing the hold sends nothing: the earlier write is the only one.
  expect(computerSends()).toHaveLength(1);
  expect(nameSends()).toHaveLength(1);
}, 240_000);

test('leave guard', async () => {
  s = await renderPage({ page: 'realms', fx: 'nameLost', path: '/realms/new', cols: 120, rows: 40 });
  await create('Studio', null);
  expect(await until(() => shows(mayNotSave))).toBe(true);
  // Another page through the shell's page list (New realm is not in it, so its first row is another page).
  const leave = async () => {
    openMenu('nav');
    expect(await until(() => frameShows(s!.frame, tsh['nav.title']))).toBe(true);
    await s!.keys.press('enter');
    expect(await until(() => !!dialog(rs['leave.title']))).toBe(true);
  };
  await leave();
  await press(os.cancel, [dialog(rs['leave.title'])!]);
  expect(await until(() => !dialog(rs['leave.title']))).toBe(true);
  expect(shows(mayNotSave)).toBe(true);
  expect(shows(step(3))).toBe(true);
  await leave();
  await press(rs['leave.go'], [dialog(rs['leave.title'])!]);
  expect(await until(() => !dialog(rs['leave.title']) && !shows(step(3)))).toBe(true);
  // Leaving sends nothing more.
  expect(nameSends()).toHaveLength(1);
}, 240_000);

test('pinned', async () => {
  s = await renderPage({ page: 'realms', fx: 'pinned', path: '/realms/new', cols: 80, rows: 24 });
  expect(await until(() => frameShows(s!.frame, rs['pinned.title']))).toBe(true);
  // Whole sentences on screen (the frame, not the tree): nothing cut at 80 columns.
  expect(frameShows(s.frame, rs['pinned.title'])).toBe(true);
  expect(frameShows(s.frame, rs['pinned.body'])).toBe(true);
  expect(buttons(rs.next)).toEqual([]);
  expect(buttons(rs.create)).toEqual([]);
  expect(queryAllByRole(tree(), 'textbox', { name: rs['name.label'] })).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);

test('many picked', async () => {
  s = await renderPage({ page: 'realms', fx: 'many', path: '/realms/new', cols: 80, rows: 24 });
  expect(await until(() => shows(rs['name.help']))).toBe(true);
  act(queryAllByRole(tree(), 'textbox', { name: rs['name.label'] })[0]!, 'type', 'Studio');
  await s.settle();
  await press(rs.next);
  expect(await until(() => queryAllByRole(tree(), 'checkbox', { name: ks['table.selectAll'] }).length > 0)).toBe(true);
  act(queryAllByRole(tree(), 'checkbox', { name: ks['table.selectAll'] })[0]!, 'click', undefined, { force: true });
  await s.settle();
  await press(rs.next);
  expect(await until(() => enabled(buttons(rs.create)).length > 0)).toBe(true);
  // The summary is folded at this size: open it, then walk the page down a screen at a time.
  await press(rs['summary.title']);
  const all = [...fixtureWorld.computers.map((c) => c.name), ...manyExtra.map((x) => x.name)];
  expect(all).toHaveLength(24);
  const count = fill(rs['summary.count_other'], { count: all.length });
  const seen = new Set<string>();
  let counted = false;
  for (let i = 0; i < 8; i++) {
    await s.settle();
    // On screen (the frame, not the tree: a name the frame cuts is still in the tree).
    for (const n of all) if (frameShows(s.frame, n)) seen.add(n);
    counted ||= frameShows(s.frame, count);
    await s.keys.press('pagedown');
  }
  expect(all.filter((n) => !seen.has(n))).toEqual([]);
  expect(counted).toBe(true);
  expect(s.failures).toEqual([]);
}, 240_000);
