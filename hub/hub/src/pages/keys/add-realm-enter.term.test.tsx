// Keys in a terminal, New key, Pick realms: Enter in "Add a realm by its id" adds the realm typed, as on the web
// (enter-realm.test.tsx). A terminal field hands no key to a wrapper around it, so the Enter is read by the field
// itself (KeyFields.tsx, the TextField's onKeyDown); read anywhere else, the field's own Enter sends the form, the realm
// is not added and the drawer says "Add or clear the realm you typed."
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, getByRef, semanticsOf, type SemNode } from '../../term/prim/semantics';
import { REALM_B, createBodies, sent } from './fixtures';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const flat = (ns: readonly SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
const HINT = strings['e.realmDraft.pending'];

test('New key: Enter in "Add a realm by its id" ticks that realm, sends nothing and leaves no pending hint', async () => {
  s = await renderPage({ page: 'keys', fx: 'many', cols: 120, rows: 40 });
  const p = s;
  const r = p.renderer as unknown as { root: unknown; stdin: unknown };
  const tree = (): SemNode[] => flat(semanticsOf({ root: r.root, stdin: r.stdin } as never));
  const find = (match: (n: SemNode) => boolean, what: string, action: 'press' | 'type'): SemNode => {
    const n = tree().find((x) => match(x) && !x.states.disabled && x.actions.includes(action));
    if (!n) throw new Error(`no ${action} control: ${what}`);
    return n;
  };
  const named = (name: string) => (n: SemNode) => n.name === name;
  const acme = (): SemNode | undefined => tree().find((n) => n.role === 'checkbox' && n.name.startsWith('Acme client'));
  // The fixtures open the page in a realm, where New key is bound to it (no realm choice): show all realms first.
  const all = tree().find((n) => n.name === strings['band.showAll'] && n.actions.includes('press'));
  if (all) { act(all, 'press'); await p.settle(); }
  act(find(named(strings['action.new']), 'New key', 'press'), 'press');
  await p.settle();
  const name = find(named(strings['nk.name']), 'Name', 'type');
  act(getByRef(semanticsOf({ root: r.root, stdin: r.stdin } as never), name.ref), 'type', 'ci');
  await p.settle();
  act(find((n) => n.role === 'radio' && n.name === strings['nk.pick'], 'Pick realms', 'press'), 'press');
  await p.settle();
  // Positive control: the realm is listed and not ticked yet.
  expect(acme()?.states.checked).toBe(false);
  act(find(named(strings['nk.add']), 'Add a realm by its id', 'type'), 'type', REALM_B);
  await p.settle();
  expect(find(named(strings['nk.add']), 'Add a realm by its id', 'type').value).toBe(REALM_B);
  await p.keys.press('enter');
  // Past the drawer's preliminary read a send would have made (as enter-realm.test.tsx waits).
  for (let i = 0; i < 3; i++) { await new Promise((q) => setTimeout(q, 50)); await p.settle(); }
  const frame = await p.settle();
  expect(p.failures).toEqual([]);
  expect(acme()?.states.checked).toBe(true);
  const field = find(named(strings['nk.add']), 'Add a realm by its id', 'type');
  expect(field.value ?? '').toBe('');
  expect(field.states.invalid).toBeUndefined();
  expect(frame.replace(/\s+/g, ' ')).not.toContain(HINT);
  // The drawer stays open and nothing was made.
  expect(tree().some((n) => n.name === strings['nk.go'])).toBe(true);
  expect(sent.create).toBe(0);
  expect(createBodies).toHaveLength(0);
}, 240_000);
