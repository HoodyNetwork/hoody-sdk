// A VM's Screen tab in a terminal (parts/Screen.term.tsx). The screen itself is a picture in a browser frame: its place
// is a hand-off to the web Hub, never an empty box. What a terminal can do stays: the screen's own address, the reason
// a screen cannot be shown, and the keys (Ctrl+Alt+Del, Enter), one request per press; a press whose answer was lost is
// held and not sent again.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
import { keysLog } from './fixtures.screen';
import strings from './strings.en.json';

let s: PageSession | null = null;
beforeEach(() => { keysLog.length = 0; });
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const all = (role: Role, name: string | RegExp): SemNode[] => queryAllByRole(tree(), role, { name });
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
const says = (text: string): boolean => flat(tree()).some((n) => n.name.includes(text) || (n.description ?? '').includes(text));
const CAD = strings['screen.keys.ctrlAltDel'];
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.placeholders.rendered).toEqual([]);
}

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: a running VM's screen is handed to the web Hub, with its address and its keys kept`, async () => {
    s = await renderPage({ page: 'vms', fx: 'screen-keys-ok', path: '/vms/web-1?tab=screen', cols, rows });
    const frame = await s.settle();
    clean();
    expect(says(strings['term.screen.reason'])).toBe(true);
    // The hand-off names the web Hub's VMs page; the screen's own address sits above it, masked.
    expect(frame).toContain('#/vms');
    expect(says(strings['screen.address'])).toBe(true);
    expect(all('button', CAD).length).toBe(1);
    expect(all('button', strings['screen.keys.enter']).length).toBe(1);
    // Nothing of the web frame's own controls is left behind.
    expect(says(strings['screen.leave'])).toBe(false);
  }, 120_000);
}

test('Ctrl+Alt+Del is sent once per press', async () => {
  s = await renderPage({ page: 'vms', fx: 'screen-keys-ok', path: '/vms/web-1?tab=screen', cols: 120, rows: 40 });
  await s.settle();
  act(all('button', CAD)[0]!, 'press');
  await s.settle();
  expect(keysLog.length).toBe(1);
  clean();
}, 180_000);

test('a key press whose answer is lost is held: the band says to look at the screen, and no key is sent again', async () => {
  s = await renderPage({ page: 'vms', fx: 'screen-keys-lost', path: '/vms/web-1?tab=screen', cols: 120, rows: 40 });
  await s.settle();
  act(all('button', CAD)[0]!, 'press');
  await s.releaseHeld();
  await s.settle();
  expect(keysLog.length).toBe(1);
  expect(says(strings['screen.keys.heldText'].replace('{{keys}}', CAD).replace('{{vm}}', 'web-1'))).toBe(true);
  for (const name of [CAD, strings['screen.keys.enter']]) {
    const b = all('button', name)[0]!;
    expect(b.states.disabled).toBe(true);
    expect(b.description).toContain(strings['screen.keys.held']);
    act(b, 'press', undefined, { force: true });
    await s.settle();
  }
  expect(keysLog.length).toBe(1);
  clean();
}, 180_000);

test('a stopped VM: no hand-off, the tab says the screen shows while the VM runs, and the keys say why they are off', async () => {
  s = await renderPage({ page: 'vms', fx: 'screen-keys-ok', path: '/vms/win11?tab=screen', cols: 120, rows: 40 });
  await s.settle();
  clean();
  expect(says(strings['screen.none.notRunning'])).toBe(true);
  expect(says(strings['term.screen.reason'])).toBe(false);
  const b = all('button', CAD)[0]!;
  expect(b.states.disabled).toBe(true);
  expect(b.description).toContain(strings['screen.keys.notRunning']);
  act(b, 'press', undefined, { force: true });
  await s.settle();
  expect(keysLog).toEqual([]);
}, 180_000);

test('a VM made without a screen: the tab says so, with no keys and no hand-off', async () => {
  s = await renderPage({ page: 'vms', fx: 'screen-headless', path: '/vms/web-1?tab=screen', cols: 120, rows: 40 });
  await s.settle();
  clean();
  expect(says(strings['screen.none.headless'])).toBe(true);
  expect(says(strings['term.screen.reason'])).toBe(false);
  expect(all('button', CAD).length).toBe(0);
}, 180_000);

// The sibling repeats four small helpers of Screen.tsx (that file imports a stylesheet, so a terminal cannot load it
// for them). Every statement of the web helpers is in the sibling,
// so a change of the web rule that is not carried over fails here.
test('the helpers the sibling repeats say what the web file says', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const web = fs.readFileSync(path.join(import.meta.dir, 'parts/Screen.tsx'), 'utf8');
  const term = fs.readFileSync(path.join(import.meta.dir, 'parts/Screen.term.tsx'), 'utf8');
  const from = web.indexOf('export const DISPLAY_MAX');
  const to = web.indexOf('export function Screen(');
  expect(from).toBeGreaterThan(0);
  expect(to).toBeGreaterThan(from);
  const squeeze = (x: string): string => x.replace(/\s+/g, ' ');
  // The statements: every indented line of the helpers, without a leading `return` (the sibling writes one as an arrow's body).
  const statements = web.slice(from, to).split('\n').filter((l) => /^  \S/.test(l)).map((l) => squeeze(l.trim().replace(/^return /, '')));
  expect(statements.length).toBe(7);
  const flatTerm = squeeze(term);
  for (const st of statements) expect(flatTerm).toContain(st);
  expect(squeeze(term)).toContain('DISPLAY_MAX: typeof Web.DISPLAY_MAX = 9999;');
  expect(web).toContain('export const DISPLAY_MAX = 9999;');
});
