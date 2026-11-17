// Rename realms in the terminal (RenameRealms.term.tsx), opened from the realm menu's last row as a person does. The
// realm names live in one vault key; the New realm page's fake server (pages/realms/fixtures.ts) answers it and
// records every write (realmSends), so each test counts what was sent.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Rename → type → Save writes the name once; the dialog stays open and says it was renamed | 'save' |
// | 2 | Esc in the name field closes the form only: the dialog stays, the row's Rename button is back, nothing sent | 'esc' |
// | 2b | Esc outside the open form (another row's Rename button, Close) closes the dialog, as with no form open | 'esc outside …' |
// | 3 | A lost answer: pending with the row's "sent, no answer" note, other Rename buttons off; Check again only reads and says it did not apply | 'lost' |
// | 4 | A row draws its realm's name once and a whole [Rename] button, a 64-character name included (80 columns); the button is still named "Rename <name>" | 'row' |
//
// Enter in the name field is not pinned here: the dialog's own Enter rule (Dialog.term onKeyFirst) takes Enter in a
// one-line field before the field's key handler, and this dialog has no primary button.
import { afterEach, expect, test } from 'bun:test';
import { fixtureWorld } from '@core';
import { renderPage, type PageSession } from '../../scripts/term/render';
import { frameShows } from '../../scripts/term/wait-text';
import { act, queryAllByRole, semanticsOf, type SemNode } from '../term/prim/semantics';
import { openMenu } from '../term/shell/menus-store';
import { realmSends } from '../pages/realms/fixtures';
import sh from './strings.en.json';
import fo from '../kit/forms/forms.strings.en.json';
import tsh from '../term/shell/strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const below = (n: SemNode): SemNode[] => n.children.flatMap((c) => [c, ...below(c)]);
const fold = (x: string) => x.replace(/\s+/g, ' ').trim().toLowerCase();
const fill = (x: string, v: Record<string, string | number>) => x.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k]));
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
const dlg = (): SemNode | null => queryAllByRole(tree(), 'dialog', { name: sh['rename.title'] })[0] ?? null;
const inDlg = (): SemNode[] => { const d = dlg(); return d ? [d] : []; };

const nameSends = () => realmSends.filter((x) => x.path.endsWith('/hoody.realm-aliases'));
const mapOf = (body: unknown) => JSON.parse(String((body as { value?: unknown } | null)?.value ?? '{}')) as Record<string, string>;
const [first, other] = fixtureWorld.realms;
const pen = (name: string) => fill(sh['rename.pen'], { name });

/** The realm menu ends with Rename realms, right above its footer rows (Share…, New realm…): End, then up past them. */
async function openRename() {
  openMenu('realm');
  expect(await until(() => frameShows(s!.frame, sh['top.renameRealms']))).toBe(true);
  const f = s!.frame;
  const footer = [sh['top.shareRealm'], sh['top.shareARealm'], `+ ${sh['top.newRealm']}`].filter((x) => frameShows(f, x)).length;
  await s!.keys.press('end');
  for (let i = 0; i < footer; i++) await s!.keys.press('up');
  await s!.keys.press('enter');
  expect(await until(() => !!dlg() && buttons(pen(first!.name), inDlg()).length === 1)).toBe(true);
}

async function rename(to: string) {
  await press(pen(first!.name), inDlg());
  expect(await until(() => queryAllByRole(inDlg(), 'textbox', { name: sh['rename.name'] }).length === 1)).toBe(true);
  act(queryAllByRole(inDlg(), 'textbox', { name: sh['rename.name'] })[0]!, 'setValue', to);
  await s!.settle();
  await press(sh['rename.save'], inDlg());
}

test('save', async () => {
  s = await renderPage({ page: 'realms', path: '/realms/new', cols: 120, rows: 40 });
  await openRename();
  await rename('Studio');
  expect(await until(() => shows(fill(sh['rename.done'], { name: 'Studio' })))).toBe(true);
  expect(nameSends()).toHaveLength(1);
  expect(mapOf(nameSends()[0]!.body)[first!.id]).toBe('Studio');
  // The dialog stays for the next rename; the form is closed.
  expect(dlg()).not.toBeNull();
  expect(queryAllByRole(inDlg(), 'textbox', { name: sh['rename.name'] })).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);

test('esc', async () => {
  s = await renderPage({ page: 'realms', path: '/realms/new', cols: 120, rows: 40 });
  await openRename();
  await press(pen(first!.name), inDlg());
  const field = () => queryAllByRole(inDlg(), 'textbox', { name: sh['rename.name'] });
  expect(await until(() => field().length === 1)).toBe(true);
  act(field()[0]!, 'focus');
  await s.settle();
  await s.keys.press('escape');
  expect(await until(() => field().length === 0)).toBe(true);
  expect(dlg()).not.toBeNull();
  expect(enabled(buttons(pen(first!.name), inDlg()))).toHaveLength(1);
  expect(realmSends).toEqual([]);
}, 240_000);

// Escape on the form's other controls (the colour choice, Save, Cancel) cancels the form too; it closed the whole
// dialog there, while the web's form takes it on any of its controls.
for (const [what, find] of [
  ['the colour choice', () => queryAllByRole(inDlg(), 'radiogroup', { name: sh['rename.color'] })],
  ['Save', () => enabled(buttons(sh['rename.save'], inDlg()))],
  ['Cancel', () => enabled(buttons(sh['rename.cancel'], inDlg()))],
] as const) {
  test(`esc on ${what} closes the form, not the dialog`, async () => {
    s = await renderPage({ page: 'realms', path: '/realms/new', cols: 120, rows: 40 });
    await openRename();
    await press(pen(first!.name), inDlg());
    const field = () => queryAllByRole(inDlg(), 'textbox', { name: sh['rename.name'] });
    expect(await until(() => field().length === 1 && find().length === 1)).toBe(true);
    act(find()[0]!, 'focus');
    await s.settle();
    await s.keys.press('escape');
    expect(await until(() => field().length === 0)).toBe(true);
    expect(dlg()).not.toBeNull();
    expect(enabled(buttons(pen(first!.name), inDlg()))).toHaveLength(1);
    expect(realmSends).toEqual([]);
  }, 240_000);
}

// Escape belongs to the form only while the focus is in it. On another row's Rename button or on Close it is the
// dialog's: it cancelled the open form there and left the dialog open, so closing took two presses.
for (const [what, find] of [
  ["another row's Rename button", () => enabled(buttons(pen(other!.name), inDlg()))],
  ['Close', () => enabled(buttons(sh['rename.close'], inDlg()))],
] as const) {
  test(`esc outside the open form, on ${what}, closes the dialog`, async () => {
    s = await renderPage({ page: 'realms', path: '/realms/new', cols: 120, rows: 40 });
    await openRename();
    await press(pen(first!.name), inDlg());
    const field = () => queryAllByRole(inDlg(), 'textbox', { name: sh['rename.name'] });
    expect(await until(() => field().length === 1 && find().length === 1)).toBe(true);
    act(find()[0]!, 'focus');
    await s.settle();
    await s.keys.press('escape');
    expect(await until(() => dlg() === null)).toBe(true);
    expect(realmSends).toEqual([]);
  }, 240_000);
}

test('lost', async () => {
  s = await renderPage({ page: 'realms', fx: 'nameLost', path: '/realms/new', cols: 120, rows: 40 });
  await openRename();
  await rename('Studio');
  expect(await until(() => shows(fo['outcome.pending']) && shows(sh['rename.held']))).toBe(true);
  expect(nameSends()).toHaveLength(1);
  // One rename held at a time: every Rename button waits for it.
  expect(buttons(pen(other!.name), inDlg())).toHaveLength(1);
  expect(enabled(buttons(pen(other!.name), inDlg()))).toEqual([]);
  // No way out before a read found the old name.
  expect(buttons(sh['rename.stopWaiting'], inDlg())).toEqual([]);
  await press(fo['outcome.check'], inDlg());
  // The read found the old name: not yet, the hold stays (the write may still land); the check sent nothing.
  expect(await until(() => shows(sh['rename.notYet'].slice(0, 40)))).toBe(true);
  expect(nameSends()).toHaveLength(1);
  expect(enabled(buttons(pen(other!.name), inDlg()))).toEqual([]);
  // Stop tracking frees the pens with words that it may still go through; nothing is sent.
  await press(sh['rename.stopWaiting'], inDlg());
  expect(await until(() => shows(sh['rename.left'].slice(0, 40)))).toBe(true);
  expect(enabled(buttons(pen(other!.name), inDlg()))).toHaveLength(1);
  expect(buttons(fo['outcome.check'], inDlg())).toEqual([]);
  expect(nameSends()).toHaveLength(1);
}, 240_000);

test('row', async () => {
  s = await renderPage({ page: 'realms', path: '/realms/new', cols: 80, rows: 24 });
  await openRename();
  const rowOf = (text: string) => s!.frame.split('\n').find((l) => l.includes(text)) ?? '';
  const count = (line: string, text: string) => line.split(text).length - 1;
  // A short name: once in its row, then the button with the verb alone.
  const short = rowOf(other!.name);
  expect(count(short, other!.name)).toBe(1);
  expect(short).toContain(`[${tsh['rename.go']}]`);
  // The longest name the Hub takes.
  const long = 'Northern-hemisphere-production-and-staging-realm-for-the-team-64';
  expect(long).toHaveLength(64);
  await rename(long);
  expect(await until(() => buttons(pen(long), inDlg()).length === 1)).toBe(true);
  const b = buttons(pen(long), inDlg())[0]!;
  const row = s.frame.split('\n')[b.box[1]] ?? '';
  // The row leads with the start of the name (cut with …), and the whole button stands inside the dialog.
  expect(row).toContain(long.slice(0, 20));
  expect(row).toContain('…');
  expect(row).toContain(`[${tsh['rename.go']}]`);
  const d = dlg()!;
  expect(b.box[0] + b.box[2]).toBeLessThanOrEqual(d.box[0] + d.box[2] - 1);
  expect(s.failures).toEqual([]);
}, 240_000);
