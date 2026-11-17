// Playwright, measurement only: the Bot model picker on the real chat catalogue
// (catalogue7k 'freeOnly': 206 providers, 7,078 models, only Hoody Free ready), a baseline so later
// changes compare against numbers, not guesses. Skipped unless HUB_PERF=1; it asserts nothing about speed.
// Each of HUB_PERF_RUNS (5) fresh pages, CPU throttled HUB_PERF_CPU times (4) over CDP: time to the picker, DOM
// counts, then Event Timing durations for "Show models that need setup", typing a query and ten arrow keys. The
// numbers go to the run's output (perf-baseline.json) and the log; shots of the picker before and after the expand
// go beside them.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import bots from '../../pages/bots/strings.en.json';
import states from '../states/strings.en.json';
import mp from './ModelPicker.strings.en.json';

declare const process: { env: Record<string, string | undefined> };

const PERF = process.env.HUB_PERF === '1';
const RUNS = Number(process.env.HUB_PERF_RUNS ?? 5);
const CPU = Number(process.env.HUB_PERF_CPU ?? 4);
const PATH = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief&settings=model';
const MORE = new RegExp(bots['model.moreSetup'].replace(/\(\{\{count\}\}\)/, '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

interface Counts {
  radios: number;
  groups: number;
  nodes: number;
}
interface Run {
  run: number;
  toPicker: number;
  before: Counts;
  after: Counts;
  /** Longest Event Timing entry per interaction, with the number of entries (16 ms and longer) it read: ms is
   *  null ("no data") when the browser recorded none, never a zero that reads as fast. */
  expand: Timing;
  typing: Timing;
  arrows: Timing;
  expandWall: number;
}

interface Timing {
  ms: number | null;
  n: number;
}

/** Starts collecting Event Timing entries (16 ms and longer) into window.__hubEvents; false when the browser lacks Event Timing. */
const observe = (page: Page) =>
  page.evaluate(() => {
    if (!PerformanceObserver.supportedEntryTypes.includes('event')) return false;
    const w = window as unknown as { __hubEvents: Array<{ name: string; duration: number; start: number }> };
    w.__hubEvents = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__hubEvents.push({ name: e.name, duration: e.duration, start: e.startTime });
    }).observe({ type: 'event', durationThreshold: 16, buffered: false } as PerformanceObserverInit);
    return true;
  });

/** The longest event entry recorded since the last call and how many there were, then clears the list. */
const longest = (page: Page): Promise<Timing> =>
  page.evaluate(async () => {
    // Event Timing reports after the next paint: give it two frames.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 50));
    const w = window as unknown as { __hubEvents: Array<{ duration: number }> };
    const n = w.__hubEvents.length;
    const ms = n ? w.__hubEvents.reduce((m, e) => Math.max(m, e.duration), 0) : null;
    w.__hubEvents = [];
    return { ms, n };
  });

const counts = (page: Page): Promise<Counts> =>
  page.evaluate(() => {
    const list = document.querySelector('[role="radiogroup"]');
    return {
      radios: list ? list.querySelectorAll('[role="radio"]').length : 0,
      groups: list ? list.querySelectorAll('[role="group"]').length : 0,
      nodes: document.getElementsByTagName('*').length,
    };
  });

/**
 * In fixture mode the Bots page never learns its computers' addresses (its computers answer is table data, so
 * registerTargets never runs), so every agent read fails closed and the picker shows "Readiness
 * couldn't be read". The baseline measures the picker that reads: register atlas's address in the page's own module
 * (the dev server serves one instance per URL), then Try again.
 */
async function readiness(page: Page) {
  await page.evaluate(async () => {
    const data = (await import('/src/pages/bots/data.ts' as string)) as { registerTargets: (rows: unknown[]) => void };
    data.registerTargets([{ id: 'c-atlas', project_id: 'p-1', server_name: 'atlas-srv' }]);
  });
  await page.getByRole('button', { name: states['state.retry'] }).click();
  await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 120_000 });
}

test.describe('model picker baseline (HUB_PERF=1)', () => {
  test.skip(!PERF, 'evidence only: run with HUB_PERF=1');
  test.setTimeout(20 * 60_000);

  test('today: the Bot model picker on 7,078 models', async ({ browser }, info) => {
    const runs: Run[] = [];
    for (let run = 1; run <= RUNS; run++) {
      const context = await browser.newContext({ viewport: { width: 1350, height: 900 } });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
      const t0 = Date.now();
      await gotoHub(page, PATH, { state: 'models7k' });
      await page.getByRole('radiogroup').waitFor({ timeout: 120_000 });
      await readiness(page);
      const more = page.getByRole('button', { name: MORE });
      await expect(more).toBeVisible({ timeout: 120_000 });
      const toPicker = Date.now() - t0;
      expect(await observe(page), 'Event Timing is supported (else the numbers would be no data)').toBe(true);
      const before = await counts(page);
      if (run === 1) await page.screenshot({ path: info.outputPath('settings-model-7k-before-1350-light.png'), fullPage: false });

      const w0 = Date.now();
      await more.click();
      await expect(more).toBeHidden({ timeout: 300_000 });
      const expandWall = Date.now() - w0;
      const expand = await longest(page);
      const after = await counts(page);
      if (run === 1) await page.screenshot({ path: info.outputPath('settings-model-7k-after-1350-light.png'), fullPage: false });

      const dialog = page.getByRole('dialog');
      const search = dialog.getByRole('searchbox', { name: mp['mp.search'] });
      await search.click({ timeout: 60_000 });
      await longest(page);
      await search.pressSequentially('gpt', { delay: 120 });
      const typing = await longest(page);

      await dialog.getByRole('radio').first().focus({ timeout: 60_000 }); // the arrows walk from the first model the query left, whichever it is
      await longest(page);
      for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowDown');
      const arrows = await longest(page);

      runs.push({ run, toPicker, before, after, expand, typing, arrows, expandWall });
      await context.close();
    }
    // The median over the runs that have a number; null (no data) when none has.
    const median = (xs: Array<number | null>): number | null => {
      const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
      return v.length ? v[Math.floor(v.length / 2)]! : null;
    };
    const med = (k: 'toPicker' | 'expandWall' | 'expand' | 'typing' | 'arrows') =>
      median(runs.map((r) => (k === 'toPicker' || k === 'expandWall' ? r[k] : r[k].ms)));
    const summary = { cpu: CPU, runs: runs.length, median: { toPicker: med('toPicker'), expand: med('expand'), typing: med('typing'), arrows: med('arrows'), expandWall: med('expandWall') }, runsDetail: runs };
    await info.attach('perf-baseline.json', { body: JSON.stringify(summary, null, 2), contentType: 'application/json' });
    // The run's log carries the numbers too (stderr, the one console channel the lint allows).
    console.error(`PERF-BASELINE ${JSON.stringify(summary)}`);
    expect(runs).toHaveLength(RUNS);
  });
});
