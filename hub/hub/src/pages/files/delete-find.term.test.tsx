// Files: deleting a protected item and Find, on the fixture computer atlas.
//
// | # | Flow | Pins |
// |---|---|---|
// | 1 | hosts-link (resolves to /etc/hosts) → Row actions → Delete | a typed confirm: Delete stays off until the exact name is typed, nothing is sent while typing, one delete after the press |
// | 2 | /home → Find, "site", Enter → Open | the match lists, its Open closes the drawer and shows the folder |
//
// hosts-link is protected because it resolves into the system (fixtures.ts REAL, plan.ts protectedPath), so the plan
// asks for its name to be typed (plan.typed = the item's name).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import kit from '../../kit/strings.en.json';
import { act, queryAllByRole, semanticsOf, within, type SemNode } from '../../term/prim/semantics';
import { sentChanges } from './fixtures';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fill = (x: string, v: Record<string, string | number>): string => x.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k]));
const tree = (p: PageSession): SemNode[] => { const r = p.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(p: PageSession, ok: () => boolean, tries = 40): Promise<string> {
  let frame = await p.settle();
  for (let i = 0; i < tries && !ok(); i++) { await pause(250); frame = await p.settle(); }
  return frame;
}
const rowNamed = (p: PageSession, name: string): SemNode | undefined => queryAllByRole(tree(p), 'row').find((r) => r.name.split(/\s+/).includes(name));

test('Delete of a protected item: Delete stays off until its exact name is typed', async () => {
  s = await renderPage({ page: 'files', cols: 120, rows: 40, path: '/files?a=atlas.00a1&ap=%2Fhome%2Fada' });
  const p = s;
  await until(p, () => rowNamed(p, 'hosts-link') !== undefined);
  const row = rowNamed(p, 'hosts-link');
  expect(row).toBeDefined();
  const menu = queryAllByRole(within(row!), 'button', { name: kit['table.rowActions'] })[0];
  expect(menu).toBeDefined();
  act(menu!, 'press');
  const item = () => queryAllByRole(tree(p), 'menuitem', { name: new RegExp(`^${esc(strings['action.delete'])}`) })[0];
  await until(p, () => item() !== undefined);
  act(item()!, 'press');
  const title = fill(strings['delete.titleOne'], { name: 'hosts-link' });
  const confirm = () => queryAllByRole(tree(p), 'alertdialog', { name: title })[0];
  const typed = () => { const d = confirm(); return d ? queryAllByRole(within(d), 'textbox', { name: fill(strings['delete.typeToConfirm'], { text: 'hosts-link' }) })[0] : undefined; };
  const del = () => { const d = confirm(); return d ? queryAllByRole(within(d), 'button', { name: strings['action.delete'] })[0] : undefined; };
  // The plan reads where the item resolves and the open storages first; then it asks for the name.
  await until(p, () => typed() !== undefined);
  expect(typed()).toBeDefined();
  expect(del()?.states.disabled).toBe(true);
  act(typed()!, 'type', 'hosts-lin');
  await p.settle();
  expect(typed()?.value).toBe('hosts-lin');
  expect(del()?.states.disabled).toBe(true);
  // The field keeps the focus: the last letter goes where the others went.
  await p.keys.type('k');
  expect(typed()?.value).toBe('hosts-link');
  await until(p, () => del()?.states.disabled !== true);
  expect(del()?.states.disabled ?? false).toBe(false);
  expect(sentChanges).toEqual([]);
  act(del()!, 'press');
  await until(p, () => sentChanges.length > 0 && confirm() === undefined);
  expect(sentChanges).toEqual(['delete:/home/ada/hosts-link']);
  expect(p.failures).toEqual([]);
}, 240_000);

test('Find: type, Enter, the match lists, and Open shows its folder', async () => {
  s = await renderPage({ page: 'files', cols: 120, rows: 40, path: '/files?a=atlas.00a1&ap=%2Fhome' });
  const p = s;
  await until(p, () => rowNamed(p, 'ada') !== undefined);
  const find = queryAllByRole(tree(p), 'button', { name: strings['action.find'] })[0];
  expect(find).toBeDefined();
  act(find!, 'press');
  // The drawer's title, find.title "Find in {{folder}}", by its words before the folder.
  const [titleStart] = strings['find.title'].split('{{folder}}');
  const drawer = () => queryAllByRole(tree(p), 'dialog', { name: new RegExp(`^${esc(titleStart!)}`) })[0];
  const box = () => queryAllByRole(tree(p), 'searchbox', { name: strings['find.field'] })[0];
  await until(p, () => box() !== undefined);
  expect(drawer()).toBeDefined();
  act(box()!, 'type', 'site');
  // Let the typing land and check the field holds it before Enter: this flow is about where the match leads, not
  // about an Enter that arrives with the text.
  await p.settle();
  expect(box()?.value).toBe('site');
  await p.keys.press('enter');
  // find.openOne "Open {{name}}": the one folder below /home whose name holds "site" (projects/site).
  const [before] = strings['find.openOne'].split('{{name}}');
  const open = () => queryAllByRole(tree(p), 'button', { name: new RegExp(`^${esc(before!)}.*site$`) });
  await until(p, () => open().length > 0);
  expect(open().length).toBe(1);
  act(open()[0]!, 'press');
  const frame = await until(p, () => drawer() === undefined && rowNamed(p, 'deploy.sh') !== undefined);
  expect(drawer()).toBeUndefined();
  expect(rowNamed(p, 'deploy.sh')).toBeDefined();
  expect(frame).toContain('config.yaml');
  expect(p.failures).toEqual([]);
}, 240_000);
