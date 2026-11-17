// LinkButton.term with an http(s) href does nothing on Enter/Space/click (Button.term.tsx:105 skips
// absolute addresses and calls nothing). The web opens the address in a new tab; the terminal's one way out is
// openOutside (kit/states/openOutside.ts: host browser, else copy + a toast showing the address, never silent).
// Reachable: Notes, Tab x6 to the group's "Open Notes", Enter -> no change at all. The row action "Open note"
// (`.` ↓ Enter) on the same page does show the toast.
// (The control on Notes is the kit Link of the group row, now a LinkButton.)
import { afterEach, expect, test } from 'bun:test';
import { closeToast, toastQueue } from '../states/Toast.store';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; for (const x of [...toastQueue().visibleToasts]) closeToast(x.key); }); // leave no toast for the next file

test('Notes: Enter on the "Open Notes" link button shows the address (openOutside), never nothing', async () => {
  s = await renderPage({ page: 'notes', cols: 120, rows: 40 });
  await s.settle();
  const sem = await import('../../term/prim/semantics');
  const focused = () => { const r = s!.renderer as unknown as { root: never; stdin: never }; return sem.focusedNode(sem.semanticsOf({ root: r.root, stdin: r.stdin })); };
  for (let i = 0; i < 60 && !(focused()?.role === 'link' && focused()?.name === 'Open Notes'); i++) await s.keys.press('tab');
  expect(focused()).toMatchObject({ role: 'link', name: 'Open Notes' });
  const before = s.frame;
  await s.keys.press('enter');
  const after = await s.settle();
  expect(after).not.toBe(before);
  // The address holds the computer id: it is never drawn (one rule with ExtLink: the mask when it
  // was copied; this render has no browser and no clipboard, so the toast says it cannot be opened or copied here).
  expect(after).toContain("This private address can't be");
  expect(after).not.toMatch(/[0-9a-f]{24}/);
  expect(after).not.toMatch(/[0-9a-f]{4}…[0-9a-f]{4}/);
}, 180_000);
