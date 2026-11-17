// A crash or stopped frame is never stored as a golden, a stored one fails until refreshed, and a frame holding a
// fixture secret is refused (golden-guard.ts). Drives the real page gate on the `api` page
// (one case, two sizes) in a scratch golden directory.
import { afterAll, describe, expect, test } from 'bun:test';
// This file pins the fixture clock (freezeClock in a test): it gives the real clock back to the next file of the process.
afterAll(async () => { (await import('./clock')).thawClock(); });
import fs from 'node:fs';
import path from 'node:path';
import { frameRefusal, type SecretTools } from './golden-guard';
import { crashShown } from './goldens';

const TMP = path.join(import.meta.dir, '..', '..', '.term-cache', 'tmp', `golden-guard-${process.pid}`);
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

const CRASH = ' ≡  HOODY  API\n ✗ This page could not be drawn.\n ReferenceError: document is not defined\n In: View < PageView\n';

describe('frameRefusal', () => {
  const sec: SecretTools = { needles: ['hdy_SECRETSECRETSECRET12'], hitOf: (n, h) => (h.includes(n) ? 'exact' : null), redact: (t, ns) => [...ns].reduce((a, n) => a.split(n).join('«secret»'), t) };
  test('error screens, the stopped line and secrets are refused; a page is not', () => {
    expect(frameRefusal(CRASH, crashShown, null)?.kind).toBe('crash');
    expect(frameRefusal('hoody hub: stopped: ResizeObserver is not available in the terminal (TERM_GLOBAL)\n', crashShown, null)?.kind).toBe('crash');
    const s = frameRefusal(' Token  hdy_SECRETSECRETSECRET12\n', crashShown, sec)!;
    expect(s.kind).toBe('secret');
    expect(s.why).not.toContain('hdy_');
    expect(frameRefusal(' ≡  HOODY  API\n Keys and tokens\n', crashShown, sec)).toBeNull();
  });
});

test('the page gate never stores a crash frame and fails a stored one', async () => {
  const { runPageGoldens, casesOf } = await import('./goldens');
  const { renderPage } = await import('./render');
  const { freezeClock } = await import('./clock');
  freezeClock();
  const dir = path.join(TMP, 'api');
  fs.mkdirSync(dir, { recursive: true });
  const [first] = await casesOf('api');
  const files = ['80x24', '120x40'].map((sz) => path.join(dir, `${first!.name}.${sz}.txt`));
  let crash = true;
  const render: Parameters<typeof runPageGoldens>[1]['render'] = async (o) => {
    const s = await renderPage(o);
    if (crash) Object.defineProperty(s, 'frame', { value: CRASH, configurable: true });
    return s;
  };
  // --update with the page crashing: nothing stored, the crash goes to the allowance.
  const up = await runPageGoldens('api', { update: true, strict: false, render, dir });
  expect(files.map((f) => fs.existsSync(f))).toEqual([false, false]);
  expect(Object.keys(up.crashes)).toContain(first!.name);
  // A crash frame stored by hand (as the old goldens are) fails the check, whether the page crashes or draws.
  for (const f of files) fs.writeFileSync(f, CRASH);
  const red = await runPageGoldens('api', { update: false, strict: false, render, dir });
  expect(red.problems.filter((p) => p.rule === 'golden-crash-stored').length).toBe(2);
  crash = false;
  const drawn = await runPageGoldens('api', { update: false, strict: false, render, dir });
  expect(drawn.problems.filter((p) => p.rule === 'golden-crash-stored').length).toBe(2);
  // Refreshed: the page frame replaces it and the check is clean of it.
  await runPageGoldens('api', { update: true, strict: false, render, dir });
  for (const f of files) expect(crashShown(fs.readFileSync(f, 'utf8'))).toBeNull();
  const green = await runPageGoldens('api', { update: false, strict: false, render, dir });
  expect(green.problems.filter((p) => p.rule.startsWith('golden'))).toEqual([]);
}, 600_000);

test('an unsettled case fails naming what is pending; a declared loading state does not, unless it settles', async () => {
  const { runPageGoldens, casesOf } = await import('./goldens');
  const { renderPage } = await import('./render');
  const dir = path.join(TMP, 'api-loading');
  fs.mkdirSync(dir, { recursive: true });
  const names = (await casesOf('api')).map((c) => c.name);
  let settled = false;
  const render: Parameters<typeof runPageGoldens>[1]['render'] = async (o) => {
    const s = await renderPage(o);
    Object.defineProperty(s, 'settled', { value: settled, configurable: true });
    Object.defineProperty(s, 'pendingText', { value: 'query ["api","catalog"] (fetching)', configurable: true });
    return s;
  };
  const a = await runPageGoldens('api', { update: true, strict: false, render, dir, loading: [] });
  const un = a.problems.filter((p) => p.rule === 'unsettled');
  expect(un.length).toBeGreaterThanOrEqual(2);
  expect(un[0]!.message).toStartWith('unsettled: query ["api","catalog"] (fetching)');
  const b = await runPageGoldens('api', { update: true, strict: false, render, dir, loading: names });
  expect(b.problems.filter((p) => p.rule === 'unsettled' || p.rule === 'loading-settled')).toEqual([]);
  settled = true;
  const c = await runPageGoldens('api', { update: false, strict: false, render, dir, loading: names });
  expect(c.problems.filter((p) => p.rule === 'loading-settled').length).toBe(un.length);
}, 600_000);

test('the real secrets helpers: a page\'s fixture secret in a frame is refused, and problem text is redacted', async () => {
  const { secretToolsFor } = await import('./golden-guard');
  const sec = await secretToolsFor('keys');
  expect(sec.needles.length).toBeGreaterThan(0);
  const n = sec.needles[0]!;
  expect(frameRefusal(`token  ${n}\n`, crashShown, sec)?.kind).toBe('secret');
  expect(frameRefusal('Keys\nNo keys yet\n', crashShown, sec)).toBeNull();
  expect(sec.redact(`frame differs at: ${n}`, sec.needles)).not.toContain(n);
}, 300_000);
