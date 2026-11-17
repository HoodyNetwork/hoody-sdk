// Ctrl-C once warns "Press Ctrl+C again to leave", twice leaves. The warning is a status-line note, and the status line
// is the screen's last row: a layer that takes the keys can hide it (the Ask sheet below 120 columns and a full-width
// drawer cover it; on the mono tier every modal's scrim does: prim/Overlay.ts scrimFill). With the palette open in mono
// the first Ctrl-C showed nothing and the second one left. While a note is up and such a layer is open, the note is
// now also drawn above every layer, on that row.
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import type { PageManifest } from '@kit/page';
import { queryClient } from '@core';
import { discoverPages, visiblePages } from '../../app/pages';
import { fixtureBoot } from '../app/boot';
import { beginTermSession, type TermSession } from '../env/session';
import type { TermBoot } from '../app/lifecycle';
import { createTermApp } from '../app/App';
import { drawTest, type TestTerm } from '../prim/testing';
import { setColourTier } from '../prim';

setDefaultTimeout(30_000);

const AGAIN = 'Press Ctrl+C again to leave';
let pages: readonly PageManifest[] = [];
let session: TermSession | null = null;
let boot: TermBoot | null = null;
let t: TestTerm | null = null;

beforeAll(async () => {
  pages = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  session = beginTermSession();
  boot = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'schedules', fx: null });
  await boot.start(session, () => {});
});
afterAll(async () => {
  await t?.dispose();
  await boot?.dispose('term-quit');
  session?.end();
  setColourTier('truecolor');
});

async function until(ok: (f: string) => boolean, ms = 4000): Promise<string> {
  const end = performance.now() + ms;
  let f = await t!.settle();
  while (!ok(f) && performance.now() < end) { await new Promise((r) => setTimeout(r, 30)); f = await t!.settle(); }
  return f;
}
const key = async (name: string, m?: { ctrl?: boolean }) => {
  t!.mockInput.pressKey(name, m);
  await new Promise((r) => setTimeout(r, 40));
  return t!.settle();
};
/** The screen's last row (the frame may end with a line break: the last two lines, as shell.term.test.tsx reads it). */
const lastRow = (f: string): string => f.split('\n').slice(-2).join('');

async function open(): Promise<string[]> {
  await t?.dispose();
  const quits: string[] = [];
  const app = createTermApp({ pages, queryClient, path: '/schedules', onQuit: () => quits.push('quit') });
  t = await drawTest(app.element, { width: 80, height: 24 });
  await until((f) => f.includes('HOODY') && !f.includes('Loading…'));
  return quits;
}

test('mono, 80x24, no layer: the first Ctrl-C shows the note on the status line (control)', async () => {
  setColourTier('mono');
  const quits = await open();
  expect(lastRow(await t!.settle())).toContain('q quit');
  const f = await key('c', { ctrl: true });
  expect(lastRow(f), f).toContain(AGAIN);
  expect(quits).toEqual([]);
});

test('mono, 80x24, palette open: the first Ctrl-C shows the note above the scrim; the second leaves', async () => {
  setColourTier('mono');
  const quits = await open();
  let f = await key('k', { ctrl: true });
  expect(f).toContain('Command palette');
  // The case: the scrim covers the status line (its key line is not on screen while the palette is open).
  expect(f, f).not.toContain('q quit');
  f = await key('c', { ctrl: true });
  expect(f).toContain('Command palette');
  expect(lastRow(f), f).toContain(AGAIN);
  expect(quits).toEqual([]);
  await key('c', { ctrl: true });
  expect(quits).toEqual(['quit']);
});
