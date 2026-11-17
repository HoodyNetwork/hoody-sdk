// The Guide's index keeps the picked doors in a terminal (kit SectionMenu.term.tsx).
//
// | # | Web | Terminal without the guard |
// |---|---|---|
// | 1 | An index pick runs SectionNav's onClick, which jumps, writes `/guide?door=…&bdoor=…#<id>` (replace) and calls preventDefault, so the link's own href is not followed | The item ran the onClick, then followed its href anyway (`#/guide#<id>`: a push with no query), so every pick reset Connect to "AI chats" and Bots to "Bot URL" |
//
// The doors are SideTabs rows (a pressed button each). The first checks are the control: the URL's doors are drawn
// picked before any press, so the later checks can only fail by losing them.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, getByRef, semanticsOf, type SemNode } from '../../term/prim/semantics';
import g from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
/** The pressed state of a door row (SideTabs.term: a button per door, pressed when picked); undefined when not drawn. */
const door = (p: PageSession, name: string): boolean | 'mixed' | undefined => {
  const n = flat(tree(p)).find((x) => x.role === 'button' && x.name === name);
  return n ? (n.states.pressed ?? false) : undefined;
};
async function pick(p: PageSession, name: string): Promise<void> {
  const entry = flat(tree(p)).find((n) => n.role === 'link' && n.name === name);
  expect(entry, `index entry ${name}\n${p.frame}`).toBeDefined();
  act(getByRef(tree(p), entry!.ref), 'press');
  await p.settle();
}

test('index picks keep the Connect door and the Bots door the URL names', async () => {
  s = await renderPage({ page: 'guide', cols: 120, rows: 40, path: '/guide?door=cli&bdoor=models#connect' });
  await s.settle();
  // Control: both doors from the URL are picked, the defaults are not.
  expect([door(s, 'CLI'), door(s, 'AI chats'), door(s, 'AI apps'), door(s, 'Bot URL')]).toEqual([true, false, true, false]);
  await pick(s, 'Skills');
  await pick(s, 'Connect');
  expect([door(s, 'CLI'), door(s, 'AI chats'), door(s, 'AI apps'), door(s, 'Bot URL')]).toEqual([true, false, true, false]);
  // The CLI door's own commands are what the Connect panel shows: its door panel (DoorPanel.tsx, a region named by the
  // door) holds the npm command. Read from the tree, not the frame: the panel's narrow column wraps the command.
  const panel = flat(tree(s)).find((n) => n.role === 'region' && n.name === g['door.cli']);
  expect(panel, s.frame).toBeDefined();
  expect(flat([panel!]).some((n) => n.name.includes('npm install -g hoody-sdk')), s.frame).toBe(true);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 180_000);

test('a pick with no doors in the URL leaves the defaults picked (control for the default rows)', async () => {
  s = await renderPage({ page: 'guide', cols: 120, rows: 40 });
  await s.settle();
  await pick(s, 'Skills');
  await pick(s, 'Connect');
  expect([door(s, 'CLI'), door(s, 'AI chats'), door(s, 'AI apps'), door(s, 'Bot URL')]).toEqual([false, true, false, true]);
}, 180_000);
