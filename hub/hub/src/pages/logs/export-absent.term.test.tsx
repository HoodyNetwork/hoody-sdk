// Logs in the terminal offers no Export. An export ends in a file saved to the device through the page's document (core
// save), which a terminal does not have (core/host-env.ts `files`): finishing one read `document`, which ends a live
// mount, and on fixtures it said "Saved" with nothing written. So the bar's ⋯ has no Export item and the x key is not
// the page's (not run, not listed); the web keeps both.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

function all(role: Role, name: string | RegExp) {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  return queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), role, { name });
}

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`the bar's ⋯ has no Export item (${cols}x${rows})`, async () => {
    s = await renderPage({ page: 'logs', path: '/logs?src=everything', cols, rows });
    await s.settle();
    const more = all('button', 'More for this view');
    expect(more.length).toBe(1);
    act(more[0]!, 'press');
    await s.settle();
    const names = all('menuitem' as Role, /./).map((n) => n.name);
    // The menu is open: Save this view is in it.
    expect(names.some((n) => n.startsWith('Save this view'))).toBe(true);
    expect(names.filter((n) => /^Export/.test(n))).toEqual([]);
    expect(s.traps).toEqual([]);
    expect(s.failures).toEqual([]);
  }, 180_000);
}

test('x opens no Export dialog', async () => {
  s = await renderPage({ page: 'logs', path: '/logs?src=everything', cols: 120, rows: 40 });
  const before = await s.settle();
  // Page keys reach the page: j moves to the next entry (the frame changes) and types nothing into the search field.
  await s.keys.press('j');
  const moved = await s.settle();
  expect(moved).not.toBe(before);
  expect(moved).toContain('/ Search');
  await s.keys.press('x');
  const frame = await s.settle();
  expect(frame).not.toContain('Export logs');
  expect(frame).not.toContain('What to export');
  expect(s.traps).toEqual([]);
  expect(s.failures).toEqual([]);
}, 180_000);
