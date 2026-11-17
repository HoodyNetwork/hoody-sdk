// Keys, the "shown once" panel in the terminal: right after Make key, `c` copies the key (the panel's own key on the
// web, MintPanels.tsx ShownPanel). The panel opens with the focus on itself, a raw `<div tabIndex={-1}>` whose focus
// target takes no keys, and the web handler clicks a `<button>` that the terminal's Copy word is not, so `c` did
// nothing. Now the field's own copy (kit SecretField `copyPrimary`) takes a `c` its layer's focused control leaves: the
// same press as the [Copy key] word, through the screen's copy rule. The key is compared as a boolean, never printed.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | New key, Make key, then `c`: exactly one copy, holding the key; the key is never in the frame | 'Make key, then c copies the key once' |
import { expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { copiesOf } from '../../term/prim/testing';
import { act, getByRef, semanticsOf, type SemNode } from '../../term/prim/semantics';

const flat = (ns: readonly SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };

test('Make key, then c copies the key once', async () => {
  const s = await renderPage({ page: 'keys', fx: 'many', cols: 120, rows: 40 });
  try {
    const r = s.renderer as unknown as { root: unknown; stdin: unknown };
    const tree = (): SemNode[] => flat(semanticsOf({ root: r.root, stdin: r.stdin } as never));
    const find = (name: string, action: 'press' | 'type'): SemNode => {
      const n = tree().find((x) => x.name === name && !x.states.disabled && x.actions.includes(action));
      if (!n) throw new Error(`no ${action} control named "${name}"`);
      return n;
    };
    // Make a key as mint-shown.term.test.tsx does.
    act(find('New key', 'press'), 'press');
    await s.settle();
    const name = find('Name', 'type');
    if (!name.states.focused && name.actions.includes('focus')) { act(name, 'focus'); await s.settle(); }
    act(getByRef(semanticsOf({ root: r.root, stdin: r.stdin } as never), name.ref), 'type', 'gate-key');
    await s.settle();
    act(find('Make key', 'press'), 'press');
    await s.settle();
    for (let i = 0; i < 3; i++) { await new Promise((q) => setTimeout(q, 50)); await s.settle(); }
    expect(s.frame).toContain('shown once');
    expect(tree().some((x) => x.role === 'button' && x.name === 'Copy key' && !x.states.disabled)).toBe(true);

    const copied = copiesOf(s.renderer);
    await s.keys.press('c');
    for (let i = 0; i < 3; i++) { await new Promise((q) => setTimeout(q, 50)); await s.settle(); }
    expect(copied.length).toBe(1);
    const key = copied[0] ?? '';
    expect(key.startsWith('hdy_') && key.length > 12).toBe(true);
    expect(s.frame.replace(/\s+/g, '').includes(key)).toBe(false);
    expect(s.frame).not.toContain('no longer shown');
    expect(s.failures.length).toBe(0);
  } finally {
    s.close();
  }
}, 240_000);
