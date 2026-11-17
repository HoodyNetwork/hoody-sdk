// The question before leaving the Hub (q) while something is at stake: "Leave the Hub now?", footer "y leave · n or
// Esc stay". Its button read "Go on anyway" and its running-work line "If you go on": the web's words for a switch
// that goes on (LeaveConfirm, which a terminal still asks before a realm switch). The prompt's own words name what it
// does: "Leave anyway", "If you leave".
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PageManifest } from '@kit/page';
import { queryClient, registerSwitchGuard } from '@core';
import { discoverPages, visiblePages } from '../../app/pages';
import { fixtureBoot } from '../app/boot';
import { beginTermSession, type TermSession } from '../env/session';
import type { TermBoot } from '../app/lifecycle';
import { createTermApp } from '../app/App';
import { TERM_WORDS } from '../app/termWords';
import { drawTest, type TestTerm } from '../prim/testing';
import strings from './strings.en.json';

setDefaultTimeout(30_000);

const SHELL = 'shell/strings.en.json';
const web = JSON.parse(readFileSync(path.resolve(import.meta.dir, '../..', SHELL), 'utf8')) as Record<string, string>;
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
});

async function until(ok: (f: string) => boolean, ms = 4000): Promise<string> {
  const end = performance.now() + ms;
  let f = await t!.settle();
  while (!ok(f) && performance.now() < end) { await new Promise((r) => setTimeout(r, 30)); f = await t!.settle(); }
  return f;
}
const key = async (name: string) => {
  t!.mockInput.pressKey(name);
  await new Promise((r) => setTimeout(r, 40));
  return t!.settle();
};

test('q with unsaved work asks, and the button that leaves says so', async () => {
  const quits: string[] = [];
  const app = createTermApp({ pages, queryClient, path: '/schedules', onQuit: () => quits.push('quit') });
  t = await drawTest(app.element, { width: 80, height: 24 });
  await until((f) => f.includes('HOODY') && !f.includes('Loading…'));
  const LOSS = 'A draft of a new script is not saved.';
  const off = registerSwitchGuard(() => LOSS);
  try {
    await key('q');
    const f = await until((x) => x.includes(strings['leave.intro']));
    expect(f).toContain(strings['leave.intro']);
    expect(f).toContain(LOSS);
    expect(f).toContain(`[ ${web['leave.stay']} (n) ]`);
    expect(f).toContain('[ Leave anyway (y) ]');
    expect(f).not.toContain(web['leave.confirm']!);
    expect(quits).toEqual([]);
    // n stays: the prompt closes and nothing left.
    const after = await key('n');
    expect(after).not.toContain(strings['leave.intro']);
    expect(quits).toEqual([]);
  } finally { off(); }
});

test('the prompt\'s own words: the button and the running-work line say leave; the web\'s say go on', () => {
  expect(web['leave.confirm']).toBe('Go on anyway');
  expect(strings['leave.confirm']).toBe('Leave anyway');
  // The running-work line is the terminal variant of the web's (work runs from this Hub), with the action named.
  const variant = TERM_WORDS[SHELL]!;
  for (const k of ['leave.body_one', 'leave.body_other'] as const) {
    expect(variant[k]!.split('If you go on,').length).toBe(2);
    expect(strings[k]).toBe(variant[k]!.replace('If you go on,', 'If you leave,'));
  }
});
