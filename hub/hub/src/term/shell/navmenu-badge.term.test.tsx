// Below 100 columns the sidebar is hidden and the compact top bar has no bell, so the page list (`[`) is the one place
// left for the unread notice count: its Notifications row carries the sidebar's badge after the label (Menus.tsx
// NavMenu, from Sidebar.tsx useBadge), the same text the sidebar draws at 120 columns.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ACTIVE = /▸ (✓ )?Notifications\b/;

test('80x24: the page list\'s Notifications row shows the unread count the sidebar shows', async () => {
  s = await renderPage({ page: 'schedules', cols: 120, rows: 40 });
  await s.settle();
  // Positive control: the fixture has unread notices, and the sidebar shows their count.
  const side = /^\s*Notifications\s+(\d+\+?) │/m.exec(s.frame);
  expect(side).not.toBeNull();
  const count = side![1]!;
  await s.resize(80, 24);
  // The sidebar is gone at 80 columns.
  expect(s.frame).not.toMatch(/Notifications\s+\d+\+? │/);
  await s.keys.press('[');
  expect(s.frame).toContain('Pages');
  // Walk the list down to Notifications (the Account group is below the first rows shown).
  for (let i = 0; i < 40 && !ACTIVE.test(s.frame); i++) await s.keys.press('down');
  const row = s.frame.split('\n').find((l) => ACTIVE.test(l));
  expect(row).toBeDefined();
  expect(row!).toMatch(new RegExp(`▸ (✓ )?Notifications\\s+${esc(count)}(\\s|│|$)`));
}, 180_000);
