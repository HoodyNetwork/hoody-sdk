// Account > New backup codes in the terminal: after the send the codes are shown once, masked and never in the
// semantics tree (even after Show). Done stays locked until "I saved my backup codes" is ticked; until then Esc asks
// "Discard changes?" and Esc on the question keeps the codes. Once ticked, Done is live and Esc closes with no
// question, and the codes are gone from the frame and the tree.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf, semJson, semText, type SemNode } from '../../term/prim/semantics';
import overlay from '../../kit/overlays/strings.en.json';
import fixtures from './fixtures';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const focused = (): string | undefined => focusedNode(tree())?.name;
const flat = (x: string): string => x.replace(/\s+/g, '');
function find(nodes: readonly SemNode[], pred: (n: SemNode) => boolean): SemNode | undefined {
  for (const n of nodes) {
    if (pred(n)) return n;
    const c = find(n.children, pred);
    if (c) return c;
  }
  return undefined;
}
const CODES = fixtures.states.many.newCodes.data.codes;
const drawer = (): SemNode | undefined => find(tree(), (n) => n.role === 'dialog' && n.name === strings['2fa.newCodes']);
const done = (): SemNode | undefined => { const d = drawer(); return d ? find([d], (n) => n.role === 'button' && n.name === strings['2fa.done']) : undefined; };

async function tabTo(name: string): Promise<void> {
  for (let i = 0; i < 30 && focused() !== name; i++) await s!.keys.press('tab');
  expect(focused()).toBe(name);
}

function treeClean(): void {
  const t = tree();
  const text = flat(semText(t));
  const json = flat(JSON.stringify(semJson(t)));
  for (const c of CODES) {
    expect(text).not.toContain(c);
    expect(json).not.toContain(c);
  }
}

test('new backup codes: shown once, masked, out of the tree; Done waits for the tick; Esc asks until then', async () => {
  s = await renderPage({ page: 'account', cols: 120, rows: 40, path: '/account?sheet=codes' });
  await s.settle();
  expect(drawer()).toBeDefined();
  // Current password has the focus (autoFocus); then the 6-digit code; Enter sends.
  await s.keys.type('pw');
  await tabTo(strings['2fa.code']);
  await s.keys.type('123456');
  await s.keys.press('enter');
  await s.releaseHeld();

  // The codes are held and drawn as a secret (positive control), masked: none in the frame or the tree.
  expect(semText(tree())).toMatch(new RegExp(`group "${strings['2fa.codes']}" .*=<secret>`));
  for (const c of CODES) expect(flat(s.frame)).not.toContain(c);
  treeClean();
  expect(done()?.states.disabled).toBe(true);

  // Show: the codes are drawn (so the checks after closing are not vacuous), still not in the tree.
  await tabTo(strings['2fa.codes']);
  await s.keys.press('s');
  for (const c of CODES) expect(flat(s.frame)).toContain(c);
  treeClean();

  // Not ticked: Esc asks first; Esc on the question keeps the codes.
  await s.keys.press('escape');
  expect(s.frame).toContain(overlay.discardAsk);
  await s.keys.press('escape');
  expect(s.frame).not.toContain(overlay.discardAsk);
  expect(drawer()).toBeDefined();

  // Ticked: Done is live, and Esc closes with no question.
  await tabTo(strings['2fa.iSaved']);
  await s.keys.press('space');
  expect(done()?.states.disabled).toBeUndefined();
  await s.keys.press('escape');
  expect(s.frame).not.toContain(overlay.discardAsk);
  expect(drawer()).toBeUndefined();
  for (const c of CODES) expect(flat(s.frame)).not.toContain(c);
  treeClean();
  expect(s.failures).toEqual([]);
}, 240_000);
