// Playwright, timing evidence only: the model chooser from the kit gallery on the real chat catalogue
// (catalogue7k 'freeOnly': 206 providers, 7,078 models). Skipped unless HUB_PERF=1; it asserts that the browser gave
// data, never a speed. HUB_PERF_RUNS (5) fresh pages, CPU throttled HUB_PERF_CPU times (4) over CDP.
//   - Input echo: Event Timing (type `event`, durationThreshold 16) per typed key; a key with no entry counts as
//     under 16 ms only because support is confirmed first, and the entries per key are reported (coverage).
//   - Final results: Element Timing. The count line carries elementtiming="mc-results" and is keyed by the query, so
//     each final query paints a new element; latency = its renderTime - the final key's Event Timing startTime.
//   - Index slices: the slicer's `mc-index-slice` measures (max and p95).
//   - Scenarios: cold open with the first search during the index build; warm "gpt 5" key by key; "a"; Set up a
//     provider; open NanoGPT and press Next twice; ArrowDown x20.
// The median and p90 per scenario go to the output (modelChooser-perf.json) and the log.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/models.strings.en.json';
import mc from './ModelChooser.strings.en.json';

declare const process: { env: Record<string, string | undefined> };

const PERF = process.env.HUB_PERF === '1';
const RUNS = Number(process.env.HUB_PERF_RUNS ?? 5);
const CPU = Number(process.env.HUB_PERF_CPU ?? 4);
const FRAME = `role=region[name="${gallery.frame}"]`;

type Ms = number | null;
interface Run {
  open: Ms;
  coldResults: Ms;
  echo: { max: Ms; keys: number; entries: number };
  warmResults: Ms;
  oneLetter: Ms;
  directory: Ms;
  drillOpen: Ms;
  next: Ms;
  arrows: Ms;
  sliceMax: Ms;
  sliceP95: Ms;
  slices: number;
  buildMs: Ms;
}

/** Starts collecting Event Timing and Element Timing entries; false when the browser lacks either. */
const observe = (page: Page) =>
  page.evaluate(() => {
    const types = PerformanceObserver.supportedEntryTypes;
    if (!types.includes('event') || !types.includes('element')) return false;
    const w = window as unknown as { __ev: Array<{ name: string; duration: number; start: number }>; __el: Array<{ id: string; text: string; render: number }> };
    w.__ev = [];
    w.__el = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__ev.push({ name: e.name, duration: e.duration, start: e.startTime });
    }).observe({ type: 'event', durationThreshold: 16, buffered: false } as PerformanceObserverInit);
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as Array<{ identifier: string; renderTime: number; loadTime: number; element: Element | null }>) {
        if (e.identifier === 'mc-results') w.__el.push({ id: e.identifier, text: e.element?.textContent ?? '', render: e.renderTime || e.loadTime });
      }
    }).observe({ type: 'element', buffered: true });
    return true;
  });

/** After two frames: the entries recorded since the last call, then clears them. */
const take = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 80));
    const w = window as unknown as { __ev: Array<{ name: string; duration: number; start: number }>; __el: Array<{ text: string; render: number }> };
    const out = { ev: w.__ev, el: w.__el };
    w.__ev = [];
    w.__el = [];
    return out;
  });

/** Types `text` key by key; returns the longest key event, the key count, the entries, and the final key's start. */
async function typeKeys(page: Page, text: string) {
  const starts: number[] = [];
  let max: Ms = null;
  let entries = 0;
  for (const ch of text) {
    const before = await page.evaluate(() => performance.now());
    await page.keyboard.type(ch);
    const got = await take(page);
    const keys = got.ev.filter((e) => e.name === 'keydown' || e.name === 'keypress' || e.name === 'keyup' || e.name === 'input' || e.name === 'beforeinput');
    entries += keys.length;
    for (const k of keys) max = Math.max(max ?? 0, k.duration);
    const down = keys.find((k) => k.name === 'keydown');
    starts.push(down ? down.start : before);
  }
  return { max, keys: text.length, entries, last: starts[starts.length - 1]! };
}

/** The final query's results paint minus the final key's start, waiting for that paint. */
async function resultsAfter(page: Page, lastKey: number, query: string): Promise<Ms> {
  for (let i = 0; i < 100; i++) {
    const r = await page.evaluate((q) => {
      const w = window as unknown as { __el: Array<{ text: string; render: number }>; __allEl?: Array<{ text: string; render: number }> };
      w.__allEl = [...(w.__allEl ?? []), ...w.__el];
      w.__el = [];
      const el = document.querySelector('[elementtiming="mc-results"]');
      return { done: !!el && !el.closest('[aria-busy="true"]') && (document.querySelector<HTMLInputElement>('input[type="search"]')?.value ?? '') === q, all: w.__allEl };
    }, query);
    if (r.done && r.all.length) {
      const last = r.all[r.all.length - 1]!;
      await page.evaluate(() => ((window as unknown as { __allEl: unknown[] }).__allEl = []));
      return last.render - lastKey;
    }
    await page.waitForTimeout(50);
  }
  return null;
}

/** The longest event of a click (or key) and its paint. */
async function eventOf(page: Page, act: () => Promise<void>): Promise<Ms> {
  await take(page);
  await act();
  const got = await take(page);
  return got.ev.length ? got.ev.reduce((m, e) => Math.max(m, e.duration), 0) : null;
}

const stats = (xs: Ms[]) => {
  const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (!v.length) return { median: null, p90: null, n: 0 };
  const at = (q: number) => v[Math.min(v.length - 1, Math.ceil(q * v.length) - 1)]!;
  return { median: at(0.5), p90: at(0.9), n: v.length };
};

test.describe('model chooser timing (HUB_PERF=1)', () => {
  test.skip(!PERF, 'evidence only: run with HUB_PERF=1');
  test.setTimeout(20 * 60_000);

  test('the chooser on 7,078 models', async ({ browser }, info) => {
    const runs: Run[] = [];
    for (let run = 1; run <= RUNS; run++) {
      const context = await browser.newContext({ viewport: { width: 1350, height: 900 } });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
      // The gallery's lazy tab, the fixture and the 7k evidence load first (the gallery keeps each state's evidence),
      // so the measured open is the chooser's own mount on evidence already read, as a page hands it over.
      await gotoHub(page, '/_kit?tab=models&mc=free');
      await page.locator(FRAME).locator('[role="listbox"]').waitFor({ timeout: 120_000 });
      await page.getByRole('button', { name: gallery['mc.three'] }).click();
      await page.locator(FRAME).locator('[role="listbox"]').waitFor({ timeout: 120_000 });
      expect(await observe(page), 'Event Timing and Element Timing are supported (else the numbers would be no data)').toBe(true);

      // Cold open: switch to the 7k free-only state (a new chooser, a new index build); first search during the build.
      const t0 = await page.evaluate(() => performance.now());
      await page.getByRole('button', { name: gallery['mc.free'] }).click();
      const frame = page.locator(FRAME);
      await frame.locator('[role="listbox"]').waitFor({ timeout: 120_000 });
      const open = (await page.evaluate(() => performance.now())) - t0;
      const search = frame.getByRole('searchbox', { name: mc['mc.search'] });
      await search.click();
      const cold = await typeKeys(page, 'g');
      const coldResults = await resultsAfter(page, cold.last, 'g');

      // The index is built: its slices and its whole build.
      await page.waitForTimeout(1500);
      const slices = await page.evaluate(() => performance.getEntriesByName('mc-index-slice').map((e) => ({ d: e.duration, s: e.startTime, e: e.startTime + e.duration })));
      const ds = slices.map((x) => x.d).sort((a, b) => a - b);
      const sliceMax = ds.length ? ds[ds.length - 1]! : null;
      const sliceP95 = ds.length ? ds[Math.min(ds.length - 1, Math.ceil(0.95 * ds.length) - 1)]! : null;
      const buildMs = slices.length ? Math.max(...slices.map((x) => x.e)) - Math.min(...slices.map((x) => x.s)) : null;

      // Warm search "gpt 5" key by key.
      await search.fill('');
      await take(page);
      const warm = await typeKeys(page, 'gpt 5');
      const warmResults = await resultsAfter(page, warm.last, 'gpt 5');

      // The one-letter query "a".
      await search.fill('');
      await take(page);
      const one = await typeKeys(page, 'a');
      const oneLetter = await resultsAfter(page, one.last, 'a');
      await search.fill('');
      await take(page);

      // Set up a provider (the Directory).
      const directory = await eventOf(page, async () => {
        await frame.getByRole('button', { name: mc['mc.setupOpen'] }).click();
        await frame.getByRole('heading', { name: mc['dir.other'] }).waitFor();
      });

      // Open NanoGPT (598 models) and press Next twice.
      await frame.getByRole('button', { name: mc['dir.back'] }).click();
      await search.fill('nanogpt');
      await frame.getByRole('button', { name: /^NanoGPT/ }).waitFor({ timeout: 30_000 });
      const drillOpen = await eventOf(page, async () => {
        await frame.getByRole('button', { name: /^NanoGPT/ }).click();
        await frame.getByRole('navigation', { name: 'NanoGPT models pages' }).waitFor();
      });
      const nextButton = frame.getByRole('navigation', { name: 'NanoGPT models pages' }).getByRole('button', { name: mc['page.next'] });
      const n1 = await eventOf(page, () => nextButton.click());
      const n2 = await eventOf(page, () => nextButton.click());
      const next = n1 === null && n2 === null ? null : Math.max(n1 ?? 0, n2 ?? 0);

      // ArrowDown x20 in the drill-in's 100-row listbox.
      await frame.getByRole('option').first().focus(); // any option: the arrow walk starts from the top of the list
      const arrows = await eventOf(page, async () => {
        for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowDown');
      });

      runs.push({ open, coldResults, echo: { max: warm.max, keys: warm.keys + cold.keys + one.keys, entries: warm.entries + cold.entries + one.entries }, warmResults, oneLetter, directory, drillOpen, next, arrows, sliceMax, sliceP95, slices: slices.length, buildMs });
      await context.close();
    }
    const summary = {
      runs: RUNS,
      cpu: CPU,
      open: stats(runs.map((r) => r.open)),
      coldResults: stats(runs.map((r) => r.coldResults)),
      echo: stats(runs.map((r) => r.echo.max)),
      echoCoverage: runs.map((r) => `${r.echo.entries}/${r.echo.keys}`),
      warmResults: stats(runs.map((r) => r.warmResults)),
      oneLetter: stats(runs.map((r) => r.oneLetter)),
      directory: stats(runs.map((r) => r.directory)),
      drillOpen: stats(runs.map((r) => r.drillOpen)),
      next: stats(runs.map((r) => r.next)),
      arrows: stats(runs.map((r) => r.arrows)),
      sliceMax: stats(runs.map((r) => r.sliceMax)),
      sliceP95: stats(runs.map((r) => r.sliceP95)),
      buildMs: stats(runs.map((r) => r.buildMs)),
      raw: runs,
    };
    // The run's log carries the numbers too (stderr, the one console channel the lint allows).
    console.error(`MC-PERF ${JSON.stringify(summary)}`);
    await info.attach('modelChooser-perf.json', { body: JSON.stringify(summary, null, 2), contentType: 'application/json' });
    // No data is a failed run, never a fast one.
    expect(summary.warmResults.n, 'Element Timing gave the warm results paint').toBeGreaterThan(0);
    expect(summary.sliceMax.n, 'the slicer measured its slices').toBeGreaterThan(0);
  });
});
