// Keys, the "shown once" panel in the terminal: after Make key the key is still held (Show and Copy key work). The
// panel is a raw `<div tabIndex={-1}>` that focuses itself on mount; a focus must never remount what is inside it, or the
// secret field's unmount dropped the key one tick after it was made ("The key is no longer shown here").
import { expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { act, getByRef, semanticsOf, type SemNode } from '../../term/prim/semantics';

const flat = (ns: readonly SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };

test('New key, Make key: the key is still there to show and copy', async () => {
  const s = await renderPage({ page: 'keys', fx: 'many', cols: 120, rows: 40 });
  try {
    const r = s.renderer as unknown as { root: unknown; stdin: unknown };
    const tree = (): SemNode[] => flat(semanticsOf({ root: r.root, stdin: r.stdin } as never));
    const find = (name: string, action: 'press' | 'type'): SemNode => {
      const n = tree().find((x) => x.name === name && !x.states.disabled && x.actions.includes(action));
      if (!n) throw new Error(`no ${action} control named "${name}"`);
      return n;
    };
    act(find('New key', 'press'), 'press');
    await s.settle();
    const name = find('Name', 'type');
    if (!name.states.focused && name.actions.includes('focus')) { act(name, 'focus'); await s.settle(); }
    act(getByRef(semanticsOf({ root: r.root, stdin: r.stdin } as never), name.ref), 'type', 'gate-key');
    await s.settle();
    act(find('Make key', 'press'), 'press');
    await s.settle();
    // Well past the deferred drop an unmount would have scheduled.
    for (let i = 0; i < 3; i++) { await new Promise((q) => setTimeout(q, 50)); await s.settle(); }
    expect(s.failures.length).toBe(0);
    expect(s.frame).toContain('shown once');
    expect(s.frame).not.toContain('no longer shown');
    const buttons = tree().filter((x) => x.role === 'button');
    expect(buttons.some((x) => x.name === 'Show' && !x.states.disabled)).toBe(true);
    expect(buttons.some((x) => x.name === 'Copy key' && !x.states.disabled)).toBe(true);
  } finally {
    s.close();
  }
}, 240_000);
