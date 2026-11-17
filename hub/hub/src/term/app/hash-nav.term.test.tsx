// A navigation to a path with a #hash (Notes → "Use with your agent" → "Skills in the Guide", every
// FAQ deep link, /guide#<section>) made @tanstack/router-core's scroll restoration call
// document.getElementById(hash)?.scrollIntoView(...) (scroll-restoration.js:186), a strict-global trap (TERM_GLOBAL)
// that exited the Hub. The terminal history turns that off on every location (history.ts) and the router brings the element
// with that id into view itself (HashAnchor, router.tsx), as the web does.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('a path with a hash draws with no trap (router hash scroll must not read document)', async () => {
  s = await renderPage({ page: 'guide', path: '/guide#skills', cols: 120, rows: 40 });
  const frame = await s.settle();
  expect(s.trapsAt).toEqual([]);
  expect(s.errors.filter((e) => e.includes('TERM_GLOBAL'))).toEqual([]);
  expect(frame).not.toContain('could not be drawn');
}, 120_000);

test('a #hash naming an element id brings that element into view (the web anchor jump)', async () => {
  // guide-bots is the raw <section id> of the Bots section (Sections.tsx), not a hash the Guide follows itself.
  s = await renderPage({ page: 'guide', cols: 120, rows: 30 });
  const top = await s.settle();
  expect(top).not.toContain('Talk to a Bot from a chat app');
  s.close(); s = null;
  s = await renderPage({ page: 'guide', path: '/guide#guide-bots', cols: 120, rows: 30 });
  let frame = await s.settle();
  for (let i = 0; i < 300 && !frame.includes('Talk to a Bot from a chat app'); i++) { await new Promise((r) => setTimeout(r, 100)); frame = await s.settle(); }
  expect(frame).toContain('Talk to a Bot from a chat app');
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 120_000);

test('Notes → Use with your agent → "Skills in the Guide" (Enter on the link) lands on Guide with no trap', async () => {
  s = await renderPage({ page: 'notes', cols: 120, rows: 40 });
  await s.settle();
  const focusedName = (): string => { const r = s!.renderer as unknown as { root: never; stdin: never }; return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }))?.name ?? ''; };
  const tabTo = async (name: RegExp): Promise<void> => { for (let i = 0; i < 150 && !name.test(focusedName()); i++) await s!.keys.press('tab'); expect(focusedName()).toMatch(name); };
  await tabTo(/Use with your agent/);
  await s.keys.press('enter');
  await tabTo(/^Skills in the Guide$/);
  await s.keys.press('enter');
  const frame = await s.settle();
  expect(frame).toContain('Guide');
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 180_000);

// Following a #hash link scrolled to the target but left the focus on the link, now off screen, and the next
// Tab jumped back up. The web moves the sequential-focus start to the target: a focusable target takes the focus (the FAQ
// answer, Faq.term.tsx), any other one starts the next Tab (focus.ts focusFrom, from HashAnchor in router.tsx).
const focusedAt = (rows: number): string => {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  const n = focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }));
  if (!n) return '(nothing focused)';
  const y = n.box[1]!;
  return y >= 0 && y < rows ? `${n.role} "${n.name}"` : `${n.role} "${n.name}" off screen at row ${y}`;
};

test('Enter on a #hash FAQ link moves the focus to the answer it opened, on screen', async () => {
  s = await renderPage({ page: 'realms', cols: 80, rows: 24 });
  await s.settle();
  for (let i = 0; i < 160 && !/More about realms/.test(focusedAt(999)); i++) await s.keys.press('tab');
  expect(focusedAt(24)).toMatch(/More about realms/);
  await s.keys.press('enter');
  let frame = await s.settle();
  for (let i = 0; i < 50 && !frame.includes('What is a realm?'); i++) { await new Promise((r) => setTimeout(r, 100)); frame = await s.settle(); }
  expect(focusedAt(24)).toMatch(/^button "What is a realm\?/);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 120_000);

test('after a #hash jump to an element that takes no focus, the next Tab starts from it', async () => {
  s = await renderPage({ page: 'guide', path: '/guide#guide-bots', cols: 120, rows: 30 });
  let frame = await s.settle();
  for (let i = 0; i < 300 && !frame.includes('Talk to a Bot from a chat app'); i++) { await new Promise((r) => setTimeout(r, 100)); frame = await s.settle(); }
  await s.keys.press('tab');
  await s.settle();
  // The Bots section's first stop is its head link (the section's own actions come before its doors).
  expect(focusedAt(30)).toBe('link "Open Bots"');
  expect(s.trapsAt).toEqual([]);
}, 120_000);
