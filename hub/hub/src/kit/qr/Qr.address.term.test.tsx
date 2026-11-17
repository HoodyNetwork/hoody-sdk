// Terminal QR: a secret address the person shows is drawn, and the semantics tree (agent export, snapshots,
// diagnostics) still holds none of it, only that one is there, as for a shown SecretField value. An address its caller
// made no secret reads as text.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { semanticsOf, semText, type SemNode } from '../../term/prim/semantics';
import { QrButton } from './Qr';

const URL_ = 'https://example.com/terminal/0123456789abcdef';
const PART = '0123456789abcdef';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const nodes = (): SemNode[] => semanticsOf(t!.renderer as never);
/** Every node of a tree, depth first. */
const every = (ns: readonly SemNode[]): SemNode[] => ns.flatMap((n) => [n, ...every(n.children)]);

/** Opens the QrButton's dialog (Tab to [QR], Enter) and, for a secret, shows it (`s`). */
async function openShown(secret: boolean): Promise<string> {
  t = await drawTest(<FocusRoot><OverlayHost><PaneSize><QrButton url={URL_} name="Terminal" secret={secret} /></PaneSize></OverlayHost></FocusRoot>, { width: 100, height: 45 });
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  if (secret) t.mockInput.pressKey('s');
  return t.settle();
}

// Catches the shown address drawn as a plain Text (QrPanel's `visible` branch): the tree would read it out.
test('a shown secret address is drawn; the tree holds only a secret group saying one is there', async () => {
  const f = await openShown(true);
  expect(f).toContain(URL_);
  const s = semText(nodes());
  expect(s).not.toContain(PART);
  expect(s).not.toContain('example.com');
  const secrets = every(nodes()).filter((n) => n.states.secret === true);
  expect(secrets.map((n) => [n.role, n.name, n.filled])).toEqual([['group', 'QR code: Terminal', true]]);
  expect(secrets[0]!.value).toBeUndefined();
  expect(secrets[0]!.children).toEqual([]);
});

// Pins the other side of `secret`: an address its caller made no secret is drawn at once and is text in the tree.
test('an address made no secret is drawn at once and reads as text; no node is a secret', async () => {
  const f = await openShown(false);
  expect(f).toContain(URL_);
  expect(semText(nodes())).toContain(URL_);
  expect(every(nodes()).filter((n) => n.states.secret === true)).toEqual([]);
});
