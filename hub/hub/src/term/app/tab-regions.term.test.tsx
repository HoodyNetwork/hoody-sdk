// Tab order by region in the real shell (prim: test/focus-region.term.test.tsx). The web's DOM
// order is sidebar, top bar, page (shell/AppShell.tsx), so Tab walks the sidebar, then the top bar, then the page,
// and F6 jumps to the next region. Before: Tab followed drawn position over the whole screen, so it interleaved the
// sidebar with the page row by row (Notes: New note was Tab stop 47 of 56; AI: 14 Tabs never reached the chat list).
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import type { PageManifest } from '@kit/page';
import { queryClient } from '@core';
import { discoverPages, visiblePages } from '../../app/pages';
import { fixtureBoot } from './boot';
import { beginTermSession, type TermSession } from '../env/session';
import type { TermBoot } from './lifecycle';
import { createTermApp } from './App';
import { drawTest, type TestTerm } from '../prim/testing';
import { semanticsOf, type SemNode } from '../prim/semantics';

setDefaultTimeout(60_000);

let pages: readonly PageManifest[] = [];
let session: TermSession | null = null;
let boot: TermBoot | null = null;
let t: TestTerm | null = null;

beforeAll(async () => {
  pages = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  session = beginTermSession();
  boot = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'notes', fx: null });
  await boot.start(session, () => {});
});
afterAll(async () => {
  await t?.dispose();
  await boot?.dispose('term-quit');
  session?.end();
});

async function open(path: string, size = { width: 120, height: 40 }): Promise<void> {
  await t?.dispose();
  t = await drawTest(createTermApp({ pages, queryClient, path, onQuit: () => {} }).element, size);
  const end = performance.now() + 8000;
  for (let f = await t.settle(); (!f.includes('HOODY') || f.includes('Loading…')) && performance.now() < end; f = await t.settle()) await new Promise((r) => setTimeout(r, 30));
}

/** The focused control and the semantic nodes around it, outermost first. */
function where(): { region: string; name: string } {
  let hit: { path: string[]; name: string } | null = null;
  const walk = (ns: SemNode[], path: string[]): void => {
    for (const n of ns) {
      const here = [...path, `${n.role}${n.id ? '#' + n.id : ''}`];
      if (n.states.focused) hit = { path, name: n.name };
      walk(n.children, here);
    }
  };
  walk(semanticsOf(t!.renderer as never), []);
  const h = hit as { path: string[]; name: string } | null;
  return { region: h ? h.path.join('>') : 'none', name: h?.name ?? '' };
}
const tab = async (shift = false) => { t!.mockInput.pressTab(shift ? { shift: true } : undefined); await t!.settle(); return where(); };
const f6 = async (shift = false) => { t!.mockInput.pressKey('F6', shift ? { shift: true } : undefined); await t!.settle(); return where(); };

const SIDEBAR = /^›|^On .+ ▾$/;
/** Puts the focus on the sidebar's first row, whatever the page focused on arrival (F6 goes round the regions). */
async function toSidebar(): Promise<void> {
  let w = await f6();
  for (let i = 0; i < 3 && w.name !== '›Home'; i++) w = await f6();
  expect(w.name).toBe('›Home');
}
/** Tabs until `stop` says so (at most `max` Tabs); the stops passed, the last one included. */
async function tabUntil(stop: (w: { region: string; name: string }) => boolean, max: number): Promise<{ region: string; name: string }[]> {
  const seq: { region: string; name: string }[] = [];
  for (let i = 0; i < max; i++) { const w = await tab(); seq.push(w); if (stop(w)) break; }
  return seq;
}

test('Notes: Tab walks the whole sidebar, then the top bar, then the page; New note is right behind the boundary; Shift+Tab is the reverse', async () => {
  await open('/notes');
  await toSidebar();
  const seq = await tabUntil((w) => w.name === 'New note', 60);
  const names = seq.map((w) => w.name);
  const account = names.indexOf('Account menu');
  expect(names[names.length - 1]).toBe('New note');
  // Every stop before the top bar is a sidebar row: none of the page's controls is interleaved.
  const realm = names.findIndex((n) => !SIDEBAR.test(n));
  expect(realm).toBeGreaterThan(10);
  expect(names.slice(realm, account + 1)).toHaveLength(3);
  // The page starts right after the top bar's last control; New note is within 3 Tabs of the boundary (was stop 47 of 56).
  expect(names.length - 1 - account).toBeLessThanOrEqual(3);
  // Shift+Tab: the same stops backwards, back to the sidebar's first row.
  const back: string[] = [];
  for (let i = 0; i < names.length; i++) back.push((await tab(true)).name);
  expect(back).toEqual([...names.slice(0, -1).reverse(), '›Home']);
});

test('Notes: F6 jumps sidebar → top bar → page (the skip link); Shift+F6 goes back', async () => {
  await open('/notes');
  await toSidebar();
  expect((await f6()).name).toMatch(/^◆ /);
  const first = await f6();
  expect(SIDEBAR.test(first.name)).toBe(false);
  const seq = [first, ...(first.name === 'New note' ? [] : await tabUntil((w) => w.name === 'New note', 3))];
  expect(seq[seq.length - 1]!.name).toBe('New note');
  expect((await f6(true)).name).toMatch(/^◆ /);
  expect((await f6(true)).name).toBe('›Home');
});

test('AI: the chat list is reached from the page boundary (14 Tabs never got there)', async () => {
  await open('/ai');
  await toSidebar();
  expect((await f6()).name).toMatch(/^◆ /);
  const first = await f6();
  expect(first.name).toBe('New chat');
  // New chat, the five tabs, Search, Filters, the computer choice, Refresh, then the list's first row.
  const seq = await tabUntil((w) => /(^|>)table$/.test(w.region) && w.name.startsWith('▌'), 12);
  const last = seq[seq.length - 1]!;
  expect(last.region).toMatch(/table$/);
  expect(last.name.startsWith('▌')).toBe(true);
});

test('a short terminal: Tab reaches every sidebar row, the ones below the fold included, and each is drawn as it is reached', async () => {
  const sidebarStops = async (size: { width: number; height: number }, folded = false): Promise<string[]> => {
    await open('/notes', size);
    await toSidebar();
    // The case: the sidebar's last rows are below the fold before Tab reaches them (24 rows, the least the shell draws
    // its frame in, leave the sidebar 22 rows; it has more).
    if (folded) expect(t!.captureCharFrame()).not.toContain('Rent servers');
    const names = ['›Home'];
    for (let i = 0; i < 60; i++) {
      const w = await tab();
      if (!SIDEBAR.test(w.name)) break;
      names.push(w.name);
      // The focused row is on the screen (the sidebar scrolls to it), never focused out of sight.
      const label = w.name.replace(/^›/, '').replace(/ ▾$/, '').replace(/\s+\d+$/, '');
      expect(t!.captureCharFrame()).toContain(label);
    }
    return names;
  };
  const tall = await sidebarStops({ width: 120, height: 40 });
  const short = await sidebarStops({ width: 120, height: 24 }, true);
  expect(tall.length).toBeGreaterThan(10);
  expect(short).toEqual(tall);
});
