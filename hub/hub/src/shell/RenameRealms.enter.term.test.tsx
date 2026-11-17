// Rename realms in the terminal (RenameRealms.term.tsx): Enter in a row's name field saves that row, as the field's
// own key handler says ("Enter saves"). The dialog has no primary button, and the kit Dialog's Enter rule
// (Dialog.term onKeyFirst: Enter in a one-line field presses the primary) took the key first and pressed nothing, so
// Enter saved nothing. The realms page's fake server (pages/realms/fixtures.ts) records every write (realmSends).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Rename → type a name → Enter writes the name once; the row then carries the new name and the form is closed | 'enter saves' |
import { afterEach, expect, test } from 'bun:test';
import { fixtureWorld } from '@core';
import { renderPage, type PageSession } from '../../scripts/term/render';
import { frameShows } from '../../scripts/term/wait-text';
import { act, queryAllByRole, semanticsOf, type SemNode } from '../term/prim/semantics';
import { openMenu } from '../term/shell/menus-store';
import { realmSends } from '../pages/realms/fixtures';
import sh from './strings.en.json';

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
const dlg = (): SemNode | null => queryAllByRole(tree(), 'dialog', { name: sh['rename.title'] })[0] ?? null;
const inDlg = (): SemNode[] => { const d = dlg(); return d ? [d] : []; };
const field = () => queryAllByRole(inDlg(), 'textbox', { name: sh['rename.name'] });

const nameSends = () => realmSends.filter((x) => x.path.endsWith('/hoody.realm-aliases'));
const mapOf = (body: unknown) => JSON.parse(String((body as { value?: unknown } | null)?.value ?? '{}')) as Record<string, string>;
const [first] = fixtureWorld.realms;
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

test('enter saves', async () => {
  s = await renderPage({ page: 'realms', path: '/realms/new', cols: 120, rows: 40 });
  await openRename();
  const b = buttons(pen(first!.name), inDlg()).filter((n) => !n.states.disabled)[0];
  if (!b) throw new Error(`no enabled button "${pen(first!.name)}"`);
  act(b, 'press');
  expect(await until(() => field().length === 1)).toBe(true);
  // Typed key by key into the field (setValue clears it with End + Backspace first); the focus stays in the field.
  act(field()[0]!, 'setValue', 'Studio');
  await s.settle();
  expect(field()[0]!.states.focused === true).toBe(true);
  expect(nameSends()).toHaveLength(0);
  await s.keys.press('enter');
  expect(await until(() => shows(fill(sh['rename.done'], { name: 'Studio' })))).toBe(true);
  // Exactly one rename write, naming this realm.
  expect(nameSends()).toHaveLength(1);
  expect(mapOf(nameSends()[0]!.body)[first!.id]).toBe('Studio');
  // The form is closed and the row carries the new name (its Rename button names it); the dialog stays open.
  expect(await until(() => field().length === 0 && buttons(pen('Studio'), inDlg()).length === 1)).toBe(true);
  expect(dlg()).not.toBeNull();
  expect(nameSends()).toHaveLength(1);
  expect(s.failures).toEqual([]);
}, 240_000);
