// Navigation blockers in the terminal router (history.ts): TanStack's memory history skips useBlocker without a
// `document`; the terminal history asks every blocker before a push or replace, as the browser history does.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A page with unsaved work (LeaveGuard active) asks before a jump to another page; staying keeps the page, leaving goes | 'leave asks first' |
// | 2 | With the guard off, the same jump goes at once | 'no guard, no question' |
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import { createElement, useState } from 'react';
import type { PageManifest } from '@kit/page';
import { LeaveGuard } from '@kit/overlays/LeaveGuard';
import { queryClient } from '@core';
import { discoverPages, visiblePages } from '../../app/pages';
import { fixtureBoot } from './boot';
import { beginTermSession, type TermSession } from '../env/session';
import type { TermBoot } from './lifecycle';
import { createTermApp } from './App';
import { drawTest, type TestTerm } from '../prim/testing';

setDefaultTimeout(30_000);

let pages: readonly PageManifest[] = [];
let session: TermSession | null = null;
let boot: TermBoot | null = null;
let t: TestTerm | null = null;
const asked: string[] = [];
let answer: 'stay' | 'leave' = 'stay';
let guard = true;

function Dirty() {
  const [n] = useState(0);
  return createElement('box', null,
    createElement('text', null, `Unsaved draft ${n}`),
    createElement(LeaveGuard, { active: guard, onBlock: (proceed: () => void, reset: () => void) => { asked.push(answer); if (answer === 'leave') proceed(); else reset(); } }));
}

beforeAll(async () => {
  const all = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  pages = all.map((p) => (p.id !== 'demo' ? p : ({ ...p, load: async () => ({ default: Dirty }) } as unknown as PageManifest)));
  session = beginTermSession();
  boot = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'demo', fx: null });
  await boot.start(session, () => {});
});
afterAll(async () => {
  await t?.dispose();
  await boot?.dispose('term-quit');
  session?.end();
});

async function until(ok: (f: string) => boolean, ms = 4000): Promise<string> {
  const end = performance.now() + ms;
  let f = await t!.settle();
  while (!ok(f) && performance.now() < end) { await new Promise((r) => setTimeout(r, 30)); f = await t!.settle(); }
  return f;
}

async function openDemo() {
  await t?.dispose();
  const app = createTermApp({ pages, queryClient, path: '/demo', onQuit: () => {} });
  t = await drawTest(app.element, { width: 120, height: 40 });
  await until((f) => f.includes('Unsaved draft'));
  return app;
}
const path = (app: ReturnType<typeof createTermApp>) => app.router.state.location.pathname;

test('leave asks first', async () => {
  guard = true;
  asked.length = 0;
  const app = await openDemo();
  answer = 'stay';
  void app.router.navigate({ to: '/schedules' } as never); // a held navigation's promise settles only when a load runs
  await until(() => asked.length > 0);
  expect(asked).toEqual(['stay']);
  expect(path(app)).toBe('/demo');
  expect(await t!.settle()).toContain('Unsaved draft');
  answer = 'leave';
  void app.router.navigate({ to: '/schedules' } as never); // a held navigation's promise settles only when a load runs
  await until(() => path(app) === '/schedules');
  expect(asked).toEqual(['stay', 'leave']);
  expect(path(app)).toBe('/schedules');
});

test('no guard, no question', async () => {
  guard = false;
  asked.length = 0;
  const app = await openDemo();
  void app.router.navigate({ to: '/schedules' } as never); // a held navigation's promise settles only when a load runs
  await until(() => path(app) === '/schedules');
  expect(asked).toEqual([]);
  expect(path(app)).toBe('/schedules');
});
