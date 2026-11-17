// A resize that folds the filter bar while a filter's popover is open (Notes: "Computer ▾" open at 120x40, then 80x24)
// removes the control holding the focus. The folded "Filters" button takes it; unfolded again, the first chip does.
// Never nothing focused.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });
const focused = (p: PageSession): { role: string; name: string } | null => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  const n = focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }));
  return n ? { role: n.role, name: n.name } : null;
};

test('Notes: a resize while a filter popover is open gives the focus to the folded Filters button, then back to a chip', async () => {
  s = await renderPage({ page: 'notes', cols: 120, rows: 40 });
  await s.settle();
  for (let i = 0; i < 160 && !(focused(s)?.role === 'button' && focused(s)?.name === 'Computer'); i++) await s.keys.press('tab');
  expect(focused(s)).toEqual({ role: 'button', name: 'Computer' });
  await s.keys.press('enter');
  expect(focused(s)?.role).toBe('menuitemradio');
  await s.resize(80, 24);
  expect(s.failures).toEqual([]);
  expect(focused(s)?.role).toBe('button');
  expect(focused(s)?.name).toMatch(/^Filters/);
  await s.resize(120, 40);
  expect(focused(s)?.role).toBe('button');
  expect(focused(s)?.name).toBe('Computer');
}, 240_000);
