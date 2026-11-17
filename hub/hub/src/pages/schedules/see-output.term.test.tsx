// Schedules, "See output" under a failed schedule's last result. The press asks History
// to open that run; History waited a frame, then searched its table by CSS.escape (requestAnimationFrame and CSS are
// strict globals): TERM_GLOBAL in an effect, and "This page could not be drawn" in place of the schedule.
// The table opens the run itself (DataTable openRow, as the web): the run is expanded, has the cursor and the focus,
// and is in view; the ask is handed back.
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
async function tabTo(p: PageSession, name: RegExp): Promise<void> {
  for (let i = 0; i < 160 && !name.test(focused(p)?.name ?? ''); i++) await p.keys.press('tab');
  expect(focused(p)?.name ?? '(nothing focused)').toMatch(name);
}
function clean(p: PageSession): void {
  expect(p.trapsAt).toEqual([]);
  expect(p.failures).toEqual([]);
  expect(p.errors.filter((e) => e.includes('TERM_GLOBAL'))).toEqual([]);
  expect(p.frame).not.toContain('could not be drawn');
}

test('See output keeps the schedule and its History on screen', async () => {
  s = await renderPage({ page: 'schedules', cols: 120, rows: 40 });
  await s.settle();
  await s.keys.press('down');
  await s.keys.press('enter');
  expect(await s.settle()).toContain('queue-drain: lock held by pid 4411');
  await tabTo(s, /^See output$/);
  await s.keys.press('enter');
  const frame = await s.settle();
  clean(s);
  expect(frame).toContain('History');
  expect(frame).toContain('Failed · exit 1');
  // The run is open: expanded (its whole output under it) and focused.
  expect(focused(s)).toMatchObject({ role: 'row', name: expect.stringMatching(/▾ .*Failed · exit 1/) });
  expect(frame).toContain('exit status 1');
  // The ask was handed back: a second press is a second ask, with no trap either.
  await tabTo(s, /^See output$/);
  await s.keys.press('enter');
  await s.settle();
  clean(s);
}, 240_000);
