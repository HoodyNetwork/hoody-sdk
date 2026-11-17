// "Open firewall rules" (a computer's Permissions tab) in a terminal: the Network tab opens on its Firewall section,
// and the next Tab goes into that section, as the web focuses the section's heading (permissions.parts.test.tsx). The
// terminal's focusSection only scrolled: the pressed button went with its tab, nothing had the focus, and the next Tab
// started over at the sidebar, a whole shell away from the rules the person asked for.
// 200x50: a detail pane wide enough that the section's secondary actions are drawn, not folded into its ⋯ menu.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, focusedNode, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
import perm from './parts/AccessDrawer.strings.en.json';
import fw from './parts/Firewall.strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
const all = (role: Role, name: string | RegExp): SemNode[] => queryAllByRole(tree(), role, { name });
/** The Network tab's Firewall section (the Permissions tab's reminder has the same title, but goes with its tab). */
const firewall = (): SemNode | undefined => all('region', fw['fw.title'])[0];
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.placeholders.rendered).toEqual([]);
}

test('"Open firewall rules": the Network tab opens on the firewall, nothing keeps the focus, and Tab goes into the section', async () => {
  s = await renderPage({ page: 'computers', path: '/computers?sel=atlas.00a1&tab=permissions', cols: 200, rows: 50 });
  await s.settle();
  clean();
  const open = all('button', perm['perm.fw.open'])[0];
  expect(open, perm['perm.fw.open']).toBeDefined();
  act(open!, 'press');
  // The tab changes, then the section lands (Network.tsx asks again every 100 ms until it is drawn).
  for (let i = 0; i < 8 && !firewall(); i++) await s.settle();
  await s.settle();
  const sec = firewall();
  expect(sec, 'the Firewall section').toBeDefined();
  expect(all('button', perm['perm.fw.open']).length).toBe(0);
  // Brought into view: its title is on screen.
  expect(sec!.box[1]).toBeGreaterThanOrEqual(0);
  expect(sec!.box[1]).toBeLessThan(50);
  // The web focuses the section's heading, which no terminal control is: nothing has the focus.
  expect(focusedNode(tree())).toBeNull();
  await s.keys.press('tab');
  await s.settle();
  const now = focusedNode(tree());
  const inside = flat(firewall()!.children).some((n) => n.states.focused);
  expect(inside, `focused: ${now?.role} "${now?.name}"`).toBe(true);
  clean();
}, 240_000);
