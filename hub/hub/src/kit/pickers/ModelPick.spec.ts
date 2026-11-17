// Playwright: the one model picker from the kit gallery (/_kit?tab=modelpick) on the
// real chat catalogue (catalogue7k 'threeReady'). At 1440 and at 390 on a touch screen, for the panel, the fields and
// the chip's open panel: nothing leaves the screen sideways and axe finds nothing (WCAG 2 A/AA). At 390 every control
// the picker draws in the panel is at least 44 px tall (the kit FilterChips bar is the kit's own: its touch size is
// a kit gap, measured and reported apart). Typing a search echoes each key within 50 ms of its input event (Event Timing,
// when the browser reports it) on a built bundle only (HUB_BUNDLE=1: a minified fixtures build; a dev server's
// unbundled modules are no measure of a person's speed), and the list stays one listbox whose rows
// are only the ones drawn.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import gallery from '../gallery/modelPick.strings.en.json';
import mp from './ModelPick.strings.en.json';
import kit from '../strings.en.json';

declare const process: { env: Record<string, string | undefined> };

const FRAME = '[data-gallery="model-pick"]';
const BUNDLE = process.env.HUB_BUNDLE === '1';
const frame = (page: Page) => page.locator(FRAME);

async function open(page: Page, state: 'panel' | 'fields' | 'chip') {
  await gotoHub(page, `/_kit?tab=modelpick&mp=${state}`);
  await frame(page).waitFor({ timeout: 30_000 });
  if (state === 'chip') {
    await frame(page).getByRole('button', { name: new RegExp(`^${gallery['label.chip']}: `) }).click();
    await page.getByRole('dialog').getByRole('listbox').waitFor({ timeout: 30_000 });
  }
  if (state === 'panel') await frame(page).getByRole('listbox').waitFor({ timeout: 30_000 });
}

async function axe(page: Page, include: string) {
  const r = await new AxeBuilder({ page }).include(include).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

for (const vp of [
  { name: '1440', viewport: { width: 1440, height: 900 }, touch: false },
  { name: '390 touch', viewport: { width: 390, height: 844 }, touch: true },
]) {
  test.describe(`the model picker at ${vp.name}`, () => {
    test.use({ viewport: vp.viewport, hasTouch: vp.touch, isMobile: vp.touch });

    for (const state of ['panel', 'fields', 'chip'] as const) {
      test(`${state}: no side scroll, axe clean`, async ({ page }) => {
        test.setTimeout(120_000);
        await open(page, state);
        await noSideScroll(page);
        // The chip's panel opens in a popover (a sheet on a phone), outside the frame.
        const where = state === 'chip' ? '[role="dialog"]' : FRAME;
        expect(await axe(page, where)).toEqual([]);
      });
    }

    test('the panel is one listbox that draws only the rows in view', async ({ page }) => {
      test.setTimeout(120_000);
      await open(page, 'panel');
      expect(await frame(page).getByRole('listbox').count()).toBe(1);
      const drawn = await frame(page).getByRole('option').count();
      expect(drawn).toBeGreaterThan(0);
      expect(drawn).toBeLessThan(120);
      // At 390 the readiness control may fold into a select: the All step is measured where it shows as radios.
      const all = frame(page).getByRole('radio', { name: new RegExp(`^${mp['f.r.all']}`) });
      if ((await all.count()) > 0) await all.click();
      await expect(frame(page).getByText(/ of [0-9,]+ models$/).first()).toBeVisible(); // reason: the count line is also read out by the panel's polite status
      expect(await frame(page).getByRole('option').count()).toBeLessThan(120);
    });

    if (vp.touch) {
      test('every control in the panel is at least 44 px tall', async ({ page }) => {
        test.setTimeout(120_000);
        await open(page, 'panel');
        const short = await frame(page).evaluate((root, filters) => {
          const out: string[] = [];
          for (const el of root.querySelectorAll('button, input, [role="option"], [role="radio"], select')) {
            if (el.closest(`[role="group"][aria-label="${filters}"]`)) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.height < 44) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}" ${Math.round(r.height)}`);
          }
          return out;
        }, kit['table.filters']);
        expect(short).toEqual([]);
      });
    }

    test('typing a search echoes each key within 50 ms', async ({ page }) => {
      test.skip(!BUNDLE, 'measured on a built bundle only: run with HUB_BUNDLE=1 against a minified build');
      test.setTimeout(120_000);
      await open(page, 'panel');
      const supported = await page.evaluate(() => {
        if (!PerformanceObserver.supportedEntryTypes.includes('event')) return false;
        const w = window as unknown as { __ev: Array<{ d: number; s: number }> };
        w.__ev = [];
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (e.name === 'keydown' || e.name === 'input' || e.name === 'keyup') w.__ev.push({ d: e.duration, s: e.startTime });
        }).observe({ type: 'event', durationThreshold: 16, buffered: false } as PerformanceObserverInit);
        return true;
      });
      const box = frame(page).getByRole('searchbox', { name: mp['mp.search'] });
      await box.click();
      await box.pressSequentially('gpt 5 mini', { delay: 60 });
      await expect(box).toHaveValue('gpt 5 mini');
      test.skip(!supported, 'no Event Timing in this browser');
      // Entries under 16 ms are not reported, and the rest arrive after their paint: an empty sample means every key
      // echoed fast only if the observer is live and has delivered them. One deliberately slow key on the box itself,
      // pressed after the measured ones, must be seen; entries come in order, so once it is in, every measured
      // key's is too. The measured keys are the entries that started before it.
      const probeAt = await box.evaluate((el) => {
        el.addEventListener(
          'keydown',
          () => {
            const until = performance.now() + 40;
            while (performance.now() < until);
          },
          { once: true },
        );
        return performance.now();
      });
      await box.press('End');
      const evs = () => page.evaluate(() => (window as unknown as { __ev: Array<{ d: number; s: number }> }).__ev);
      await expect.poll(async () => (await evs()).some((e) => e.s >= probeAt && e.d >= 40), { timeout: 5_000 }).toBe(true);
      const worst = Math.max(0, ...(await evs()).filter((e) => e.s < probeAt).map((e) => e.d));
      test.info().annotations.push({ type: 'echo-worst-ms', description: String(worst) });
      expect(worst).toBeLessThanOrEqual(50);
    });

    test('a picked option moves to Current and keeps DOM focus (the real engine removes and mounts it again)', async ({ page }) => {
      test.setTimeout(120_000);
      await open(page, 'panel');
      const options = frame(page).getByRole('option');
      // A row below the first heading's few: the pick moves it to the top (Current).
      const target = options.nth(6); // reason: any ready row below the top few; its spec is read and checked, not its name
      const spec = await target.getAttribute('data-spec');
      await target.focus();
      await page.keyboard.press('Enter');
      await expect(frame(page).getByRole('option').first()).toHaveAttribute('data-spec', spec ?? ''); // reason: the first option is the Current row by position
      await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-spec') ?? null)).toBe(spec);
    });
  });
}
