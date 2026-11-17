// Bots, a key's one-time view in the terminal (strict globals: any DOM-global read is a trap): "Make key" draws the
// secret (SecretField: Show / Copy), the address and the codes; "I've stored it" closes the drawer and the secret goes.
// KeyShare once read `document` for the page's visibility (now hostEnv().onVisibilityChange), which stopped the page.
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../../scripts/term/render';
import { act, getByRef, semanticsOf, type SemNode } from '../../../term/prim/semantics';

let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });

const PATH = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief&tab=link&drawer=key';

test('Make key shows the key once, and closing the drawer takes it away, with no DOM global read', async () => {
  const s = await renderPage({ page: 'bots', fx: 'idle', path: PATH, cols: 120, rows: 40, strictGlobals: true });
  close = () => s.close();
  const tree = () => semanticsOf({ root: (s.renderer as never as { root: unknown }).root, stdin: (s.renderer as never as { stdin: unknown }).stdin } as never);
  const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
  const button = (name: string) => flat(tree()).find((n) => n.role === 'button' && n.name === name);
  const seen = s.traps.length;

  const make = button('Make key');
  expect(make).toBeDefined();
  act(getByRef(tree(), make!.ref)!, 'press');
  await s.settle(); await s.releaseHeld();
  let frame = await s.settle();
  expect(s.failures).toEqual([]);
  expect(frame).toContain('This is the only time');
  expect(frame).toContain('Address only');
  expect(button('Show')).toBeDefined();

  const done = button("I've stored it");
  expect(done).toBeDefined();
  act(getByRef(tree(), done!.ref)!, 'press');
  await s.settle(); await s.releaseHeld();
  frame = await s.settle();
  expect(s.failures).toEqual([]);
  expect(frame).not.toContain('This is the only time');
  expect(s.traps.slice(seen)).toEqual([]);
}, 90_000);
