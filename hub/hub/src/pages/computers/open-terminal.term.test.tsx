// Row menu → "Open terminal" (view.tsx onAction 'openTerminal') must not call window.open: in the terminal that is a TERM_GLOBAL
// trap inside the key handler that opens nothing and says nothing. It goes through the kit's openOutside, which in a
// terminal opens the host browser or copies the address and shows it in a toast.
// Keys (120x40, fixtures; the first row has the focus): `.` (row menu), Enter ("Open terminal" is its first item).
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

test('row menu "Open terminal" hands the address on with no trap', async () => {
  s = await renderPage({ page: 'computers', cols: 120, rows: 40 });
  await s.settle();
  await s.keys.press('.');
  expect(focused(s)).toMatchObject({ role: 'menuitem', name: 'Open terminal' });
  await s.keys.press('enter');
  const frame = await s.settle();
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
  expect(s.errors.filter((e) => e.includes('TERM_GLOBAL'))).toEqual([]);
  expect(frame).not.toContain('could not be drawn');
  expect(frame).toContain('https://');
}, 240_000);
