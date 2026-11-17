// Computers, "atlas is in 30 realms" at 80x24: the list is a popover taller than the screen leaves room for. The web
// panel scrolls (`max-height` + `overflow: auto`) and its search field has the focus. In the terminal the content kept
// its own 35 rows inside a 20-row panel (layout check: "measured 51x35 past its box 53x20"); and once the panel scrolled,
// the list opened with the focus nowhere (the layer's first focus was dropped by the body's first layout).
import { expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { act, semanticsOf, type SemNode } from '../../term/prim/semantics';
import { layoutFaults } from '../../term/prim/layoutcheck';
import strings from './strings.en.json';

const flat = (ns: readonly SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`the 30-realm list at ${cols}x${rows}: inside its panel, the search field focused, the last realm reachable`, async () => {
    const s = await renderPage({ page: 'computers', fx: 'realms30', cols, rows, path: '/computers?sel=atlas.00a1' });
    try {
      const r = s.renderer as unknown as { root: unknown; stdin: { emit(e: 'data', b: Buffer): unknown } };
      const tree = (): SemNode[] => flat(semanticsOf({ root: r.root, stdin: r.stdin } as never));
      const open = tree().find((x) => /^\+\d+ more: all 30 realms of atlas/.test(x.name ?? '') && x.actions.includes('press'));
      if (!open) throw new Error('no "+N more" button');
      act(open, 'press');
      await s.settle();
      for (let i = 0; i < 2; i++) { await new Promise((q) => setTimeout(q, 30)); await s.settle(); }
      expect(s.failures.length).toBe(0);
      expect(s.frame).toContain('atlas is in 30 realms');
      expect(layoutFaults(r.root as never, { cols, rows }).filter((f) => f.kind === 'cut' || f.kind === 'overdraw')).toEqual([]);
      const field = tree().find((x) => x.name === 'Search realms' && x.actions.includes('type'));
      expect(field?.states.focused, s.frame).toBe(true);
      // The end of the list: Shift+Tab from the first control wraps to the last one, and the panel follows it.
      r.stdin.emit('data', Buffer.from('\x1b[Z'));
      await s.settle();
      expect(s.frame, s.frame).toContain(strings['realm.manageAll']);
    } finally {
      s.close();
    }
  }, 240_000);
}
