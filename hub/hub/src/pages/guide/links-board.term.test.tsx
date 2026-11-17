// The Guide's outside links, the one-file Hub and Put on Board in a terminal, read as correct and pinned here.
// Words that wrap are read from the semantics tree (a text run is one node, whole), never from the frame: a wrapped
// run shares its rows with the sidebar and the page, so the frame interleaves it with their words.
//
// | # | Web | Terminal |
// |---|---|---|
// | 1 | Every link: Open opens the program in a new tab, Copy copies its whole address; the screen masks the ids | Open hands the whole address to the host's browser (openOutside), Copy gives the same address (OSC 52); the row shows the ids masked |
// | 2 | (a browser always opens it) | With no browser, Open shows the address in a toast to open by hand: never a dead press |
// | 3 | Build your own offers the Hub as one file (a browser download) | Not offered: the terminal saves no file (core/origin.ts hubFileUrl is null off a web page); the rest of the section is there |
// | 4 | Put on Board opens the Board with an Add link | The Board hands off to the web Board, and the address it gives keeps the Add link |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, getByRef, semanticsOf, type SemNode } from '../../term/prim/semantics';
import { copiesOf } from '../../term/prim/testing';
import g from './strings.en.json';
import board from '../board/parts/boardTerm.strings.en.json';
import outside from '../../kit/states/openOutside.strings.en.json';
import { toastQueue } from '../../kit/states/Toast.store';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
function press(p: PageSession, role: string, name: string): void {
  const n = flat(tree(p)).find((x) => x.role === role && x.name === name);
  expect(n, `${role} "${name}"\n${p.frame}`).toBeDefined();
  act(getByRef(tree(p), n!.ref), 'press');
}
/** A program of Every link that offers both Copy and Open (strings links.copy / links.open). */
function openable(p: PageSession): string {
  const names = flat(tree(p)).filter((n) => n.role === 'button').map((n) => n.name);
  const program = names.map((n) => /^Copy (.+) address$/.exec(n)?.[1]).find((x) => x !== undefined && names.includes(`Open ${x}`));
  expect(program, names.join('\n')).toBeDefined();
  return program!;
}
/** The long ids in an address's first host label (project, computer): what the row masks (logic.ts maskAddress). */
const idsOf = (url: string): string[] => new URL(url).hostname.split('.')[0]!.match(/[A-Za-z0-9]{12,}/g) ?? [];
/** Every name the tree draws (text runs whole, controls by name). */
const drawn = (p: PageSession): string[] => flat(tree(p)).map((n) => n.name);

test('Every link: Open hands the whole address to the browser, Copy gives the same one; the row masks the ids', async () => {
  const opened: string[] = [];
  s = await renderPage({ page: 'guide', cols: 120, rows: 40, openExternal: (u) => { opened.push(u); } });
  await s.settle();
  const program = openable(s);
  const copied = copiesOf(s.renderer);
  press(s, 'button', `Copy ${program} address`);
  await s.settle();
  press(s, 'button', `Open ${program}`);
  const f = await s.settle();
  expect(copied).toHaveLength(1);
  expect(opened).toEqual([copied[0]!]);
  expect(opened[0]).toMatch(/^https:\/\//);
  const ids = idsOf(opened[0]!);
  expect(ids.length).toBeGreaterThan(0);
  // The row is on screen (the press focused its button): its ids are drawn masked, never whole.
  for (const id of ids) {
    expect(f).toContain(`${id.slice(0, 4)}…${id.slice(-4)}`);
    expect(f).not.toContain(id);
  }
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 180_000);

test('Every link with no browser: Open shows the address in a toast, its ids masked', async () => {
  s = await renderPage({ page: 'guide', cols: 120, rows: 40 });
  await s.settle();
  const program = openable(s);
  const said = [outside['outside.copyIt'], outside['outside.copied']];
  // Control: no such toast before the press.
  expect(drawn(s).filter((n) => said.includes(n))).toEqual([]);
  press(s, 'button', `Open ${program}`);
  await s.settle();
  // The toast openOutside shows (kit/states/openOutside.ts): one of its two titles, the address as its body.
  const toast = toastQueue().visibleToasts.map((x) => x.content).find((c) => said.includes(c.title));
  expect(toast, s.frame).toBeDefined();
  const body = toast!.body ?? '';
  expect(body).toMatch(/^https:\/\//);
  // Masked (kit/states/handoff.pure.ts shownAddress): no whole id, the 4…4 form instead.
  expect(body).toContain('…');
  expect(body).not.toMatch(/[0-9a-f]{24,}/i);
  // Drawn: the title is a text run of the screen, and the address is the run right under it (kit Toast.term.tsx: the
  // body is the line below the title row; the mark and a gap sit before the title).
  const after = flat(tree(s));
  const title = after.find((n) => n.name === toast!.title);
  expect(title, s.frame).toBeDefined();
  const [tx, ty, , th] = title!.box;
  const under = after.find((n) => n.name === body && n.box[1] >= ty + th && n.box[1] <= ty + th + 1 && Math.abs(n.box[0] - tx) <= 3);
  expect(under, s.frame).toBeDefined();
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 180_000);

test('Build your own: no one-file Hub download in a terminal; the section itself is there', async () => {
  s = await renderPage({ page: 'guide', cols: 120, rows: 40 });
  await s.settle();
  const names = flat(tree(s)).map((n) => n.name);
  expect(names).toContain(g['build.see']);
  expect(names).not.toContain(g['build.file']);
  expect(names).not.toContain(g['build.fileGetName']);
  expect(s.frame).not.toContain(g['build.file']);
  expect(s.trapsAt).toEqual([]);
}, 180_000);

test('Tools: Put on Board opens the Board, which hands off to the web Board with the Add link kept', async () => {
  s = await renderPage({ page: 'guide', cols: 120, rows: 40 });
  await s.settle();
  const put = flat(tree(s)).find((n) => n.role === 'button' && /^Put .+ on Board$/.test(n.name));
  expect(put, s.frame).toBeDefined();
  // Control: the Guide draws no Board hand-off before the press.
  expect(drawn(s).some((n) => n.includes(board['term.reason']))).toBe(false);
  act(getByRef(tree(s), put!.ref), 'press');
  await s.settle();
  // The Board's terminal view is a Handoff: its reason, then the web address, which keeps the Add link.
  expect(drawn(s).some((n) => n.includes(board['term.reason'])), s.frame).toBe(true);
  expect(drawn(s).some((n) => n.startsWith('https://') && n.includes('#/board?add=')), s.frame).toBe(true);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 180_000);
