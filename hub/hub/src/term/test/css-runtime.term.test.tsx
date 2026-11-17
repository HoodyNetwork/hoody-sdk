// Percent heights: a percentage of an indefinite height computes to auto.
import { expect, test } from "bun:test";

test('a percent height inside a parent of auto height computes to auto (Home realmRow ran 57200 rows)', async () => {
  const { drawTest } = await import('../prim/testing');
  const { FocusRoot } = await import('../prim');
  const { layoutFaults } = await import('../prim/layoutcheck');
  const { resolverFor } = await import('../jsx/css-table');
  const { setStyleTable } = await import('../jsx/style');
  const id = (n: string) => `pages/h/h.module.css#${n}`;
  setStyleTable(resolverFor({ version: 1, generated: '', widthClass: {}, unitModel: {}, modules: {}, classes: {
    [id('row')]: { id: id('row'), style: { height: '100%', minHeight: '100%' }, status: 'full', outcomes: [] },
    [id('fixed')]: { id: id('fixed'), style: { height: 6, flexDirection: 'column' }, status: 'full', outcomes: [] },
  } } as never));
  try {
    const t = await drawTest(<FocusRoot><div><ul><li><div className={id('row')}>Personal</div></li><li><div className={id('row')}>Lab</div></li></ul></div><div className={id('fixed')}><div className={id('row')}>full</div></div></FocusRoot>, { width: 30, height: 12 });
    const lines = t.captureCharFrame().split('\n').map((l) => l.trim());
    expect(lines.slice(0, 2)).toEqual(['\u2022 Personal', '\u2022 Lab']);
    expect(layoutFaults(t.renderer.root as never, { cols: 30, rows: 12 }).filter((f) => f.kind === 'explosion')).toEqual([]);
    // Inside a parent 6 cells tall, 100% is kept: the row is 6 tall.
    const kids = (n: { getChildren?: () => unknown[] }): unknown[] => n.getChildren?.() ?? [];
    let found: { id?: string; height: number } | null = null;
    const walk = (n: { id?: string; height: number; getChildren?: () => unknown[] }): void => { if (n.id?.startsWith('div.row') && n.height > 1) found = n; for (const c of kids(n)) walk(c as never); };
    walk(t.renderer.root as never);
    expect((found as { height: number } | null)?.height).toBe(6);
    t.renderer.destroy();
  } finally { setStyleTable(null); }
});
