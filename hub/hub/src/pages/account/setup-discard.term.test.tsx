// Account > Turn on two-step sign-in in the terminal, step 2 (the setup key, the backup codes, the code): the secrets
// are drawn masked and are never in the semantics tree, even after Show. Esc asks "Discard changes?" (the drawer holds
// secrets) with Keep editing focused; Esc on the question keeps editing; Discard closes the drawer, and the shown key
// is gone from the frame and the tree.
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
const secrets = fixtures.states.many.setup.data;
const KEY = flat(secrets.manualKey);
const TITLE = `dialog "${strings['2fa.setupTitle']}"`;

async function tabTo(name: string): Promise<void> {
  for (let i = 0; i < 30 && focused() !== name; i++) await s!.keys.press('tab');
  expect(focused()).toBe(name);
}

/** Neither the setup key nor any backup code in the tree (text and JSON); the frame is checked by the caller. */
function treeClean(): void {
  const t = tree();
  const text = flat(semText(t));
  const json = flat(JSON.stringify(semJson(t)));
  for (const v of [KEY, ...secrets.codes]) {
    expect(text).not.toContain(flat(v));
    expect(json).not.toContain(flat(v));
  }
}

test('setup step 2: secrets masked and out of the tree; Esc asks, Esc keeps editing, Discard drops them', async () => {
  s = await renderPage({ page: 'account', fx: 'twofa-off', cols: 120, rows: 40, path: '/account?sheet=setup' });
  await s.settle();
  expect(s.frame).toContain(strings['2fa.step1of2']);
  await s.keys.type('pw');
  await s.keys.press('enter');
  await s.releaseHeld();
  expect(s.frame).toContain(strings['2fa.step2of2']);

  // Held and drawn as secrets (positive controls), masked: no key and no code in the frame or the tree.
  let text = semText(tree());
  expect(text).toContain(TITLE);
  expect(text).toMatch(new RegExp(`group "${strings['2fa.manualKey']}" .*=<secret>`));
  expect(text).toMatch(new RegExp(`group "${strings['2fa.codes']}" .*=<secret>`));
  for (const v of [KEY, ...secrets.codes]) expect(flat(s.frame)).not.toContain(flat(v));
  treeClean();

  // Show the key: it is drawn (so the checks after Discard are not vacuous), and still not in the tree.
  await tabTo(strings['2fa.manualKey']);
  await s.keys.press('s');
  expect(flat(s.frame)).toContain(KEY);
  treeClean();

  // Esc: the drawer holds secrets, so it asks first, on Keep editing.
  await s.keys.press('escape');
  expect(s.frame).toContain(overlay.discardAsk);
  expect(focused()).toBe(overlay.keepEditing);
  // Esc on the question answers it the safe way: still on step 2, nothing dropped.
  await s.keys.press('escape');
  expect(s.frame).not.toContain(overlay.discardAsk);
  expect(s.frame).toContain(strings['2fa.step2of2']);
  expect(semText(tree())).toContain(TITLE);

  // Ask again, then Discard: the drawer closes and the key is gone.
  await s.keys.press('escape');
  expect(s.frame).toContain(overlay.discardAsk);
  await tabTo(overlay.discard);
  await s.keys.press('enter');
  text = semText(tree());
  expect(text).not.toContain(TITLE);
  expect(s.frame).not.toContain(strings['2fa.step2of2']);
  expect(flat(s.frame)).not.toContain(KEY);
  for (const v of secrets.codes) expect(flat(s.frame)).not.toContain(flat(v));
  treeClean();
  expect(s.failures).toEqual([]);
}, 240_000);
