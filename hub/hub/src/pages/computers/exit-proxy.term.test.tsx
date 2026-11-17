// A computer's exit IP in a terminal: each choice in "Use another exit…" draws its own fields under it (the kit
// RadioGroup `reveal`). Before the terminal drew the reveal, the drawer opened on "Your own proxy" with no host, port,
// user or password field anywhere, and "Use this exit" stayed off with no reason: an exit could not be set at all.
//  1. With no exit set, the drawer opens on "Your own proxy" with its fields; nothing is sent by opening it.
//  2. "Another computer of yours" swaps them for its own content (the picker, or why no computer can be one).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
import ex from './parts/ExitIp.strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const all = (role: Role, name: string | RegExp): SemNode[] => queryAllByRole(tree(), role, { name });
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
const says = (text: string): boolean => flat(tree()).some((n) => n.name.includes(text) || (n.description ?? '').includes(text));
async function find(role: Role, name: string | RegExp): Promise<SemNode> {
  let n = all(role, name)[0];
  for (let i = 0; i < 8 && !n; i++) { await s!.settle(); n = all(role, name)[0]; }
  expect(n, `${role} ${String(name)}`).toBeDefined();
  return n!;
}
/** With the keyboard: focused (and scrolled into view) first. */
async function press(role: Role, name: string | RegExp): Promise<void> {
  act(await find(role, name), 'press');
  await s!.settle();
}
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.placeholders.rendered).toEqual([]);
}
const NONE = ex['exit.computer.none'].split('{{')[0]!;

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: "Your own proxy" draws its host, port, user and password fields; another computer its own`, async () => {
    s = await renderPage({ page: 'computers', fx: 'netDirect', path: '/computers?sel=atlas.00a1&tab=network', cols, rows });
    await s.settle();
    clean();
    await press('button', ex['exit.change']);
    expect((await find('radio', ex['exit.pick.proxy'])).states.checked).toBe(true);
    expect(all('textbox', ex['exit.form.host']).length).toBe(1);
    expect(all('textbox', ex['exit.form.port']).length).toBe(1);
    expect(all('textbox', ex['exit.form.user']).length).toBe(1);
    expect(says(ex['exit.form.password'])).toBe(true);
    await press('radio', ex['exit.pick.computer']);
    expect((await find('radio', ex['exit.pick.computer'])).states.checked).toBe(true);
    expect(all('textbox', ex['exit.form.host']).length).toBe(0);
    expect(says(ex['exit.computer.label']) || says(NONE)).toBe(true);
    clean();
  }, 180_000);
}
