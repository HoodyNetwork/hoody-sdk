// Playwright: a subscription with a change in flight pulses its pill's dot, never the pill's words.
// The words faded with the pulse: at its lowest point they read 3.1–3.5:1 on the ok and danger grounds (measured).
// Each test steps every running animation through one cycle and reads the words as painted (opacity and grounds
// composited up to the page), so it measures what is drawn, in both themes, at desktop and phone widths.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

// The four busy rows of the 'busy-tones' fixture state: ok, danger, danger, neutral ink.
const BUSY_WORDS = [strings['subs.chipActive'], strings['subs.chipDeleting'], strings['subs.chipOnHold'], strings['subs.chipSettingUp']];

interface Reading {
  word: string;
  minOpacity: number;
  minRatio: number;
}

/** Steps all animations through a cycle; for each busy pill's words, the lowest effective opacity and contrast. */
async function readWords(page: Page): Promise<Reading[]> {
  // The subscriptions section: a table on a desktop, list rows on a phone.
  const section = page.locator('#subscriptions');
  await section.waitFor({ timeout: 15_000 });
  for (const w of BUSY_WORDS) await section.getByText(w, { exact: true }).first().waitFor({ timeout: 15_000 }); // reason: a wait only; the evaluate below picks the pill's own words
  return section.evaluate((root, words) => {
    type C = [number, number, number, number];
    const parse = (s: string): C => {
      const n = (s.match(/[\d.]+/g) ?? []).map(Number);
      return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n.length > 3 ? (n[3] ?? 1) : 1];
    };
    const over = (top: C, back: C): C => {
      const a = top[3];
      return [top[0] * a + back[0] * (1 - a), top[1] * a + back[1] * (1 - a), top[2] * a + back[2] * (1 - a), 1];
    };
    const mix = (c: C, back: C, o: number): C => [c[0] * o + back[0] * (1 - o), c[1] * o + back[1] * (1 - o), c[2] * o + back[2] * (1 - o), 1];
    const lum = (c: C) => {
      const f = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: C, b: C) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    // Paints the chain root → text element: each element's ground over its backdrop, its content inside, then the
    // element's own opacity against the backdrop. With `ink` the text colour is laid on top of the innermost ground.
    const paint = (chain: Element[], i: number, backdrop: C, ink: boolean): C => {
      const el = chain[i]!;
      const cs = getComputedStyle(el);
      const inner = over(parse(cs.backgroundColor), backdrop);
      const content = i === chain.length - 1 ? (ink ? over(parse(cs.color), inner) : inner) : paint(chain, i + 1, inner, ink);
      return mix(content, backdrop, Number(cs.opacity));
    };
    const canvas: C = getComputedStyle(document.documentElement).colorScheme.includes('dark') ? [0, 0, 0, 1] : [255, 255, 255, 1];
    const targets = (words as string[]).map((w) => {
      // The words inside a status pill: an ancestor within two levels leads with the pill's decorative dot.
      const inPill = (e: Element) => [e, e.parentElement, e.parentElement?.parentElement].some((p) => p?.firstElementChild?.getAttribute('aria-hidden') === 'true' && p.firstElementChild.textContent === '');
      const el = Array.from(root.querySelectorAll('*')).find((e) => e.childElementCount === 0 && e.textContent?.trim() === w && inPill(e));
      if (!el) throw new Error(`no element holds "${w}"`);
      const chain: Element[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e);
      return { w, chain, minOpacity: 1, minRatio: Infinity };
    });
    const anims = document.getAnimations();
    anims.forEach((a) => a.pause());
    const steps = 28;
    for (let k = 0; k <= steps; k++) {
      for (const a of anims) {
        const d = Number(a.effect?.getComputedTiming().duration) || 0;
        a.currentTime = (d * k) / steps;
      }
      for (const t of targets) {
        const op = t.chain.reduce((p, e) => p * Number(getComputedStyle(e).opacity), 1);
        t.minOpacity = Math.min(t.minOpacity, op);
        t.minRatio = Math.min(t.minRatio, ratio(paint(t.chain, 0, canvas, true), paint(t.chain, 0, canvas, false)));
      }
    }
    return targets.map((t) => ({ word: t.w, minOpacity: Math.round(t.minOpacity * 1000) / 1000, minRatio: Math.round(t.minRatio * 100) / 100 }));
  }, BUSY_WORDS);
}

/** For each busy pill's dot (the pill's first child, empty and aria-hidden), how many fading animations run on it, and
 *  every fading animation on anything else. Ties each pulse to its own pill: a stray empty hidden pulse never counts. */
async function dotPulses(page: Page): Promise<{ perDot: number[]; stray: string[] }> {
  return page.locator('#subscriptions').evaluate((root, words) => {
    const isDot = (e: Element | null | undefined): e is Element => !!e && e.getAttribute('aria-hidden') === 'true' && e.textContent === '';
    const dots = (words as string[]).map((w) => {
      const el = Array.from(root.querySelectorAll('*')).find((e) => e.childElementCount === 0 && e.textContent?.trim() === w && [e, e.parentElement, e.parentElement?.parentElement].some((p) => isDot(p?.firstElementChild)));
      const pill = el && [el, el.parentElement, el.parentElement?.parentElement].find((p) => isDot(p?.firstElementChild));
      if (!pill?.firstElementChild) throw new Error(`no pill dot for "${w}"`);
      return pill.firstElementChild;
    });
    if (new Set(dots).size !== dots.length) throw new Error('two busy words share one dot');
    const fading = document.getAnimations().filter((a) => {
      const frames = (a.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
      return Math.min(1, ...frames.map((f) => (f.opacity === undefined ? 1 : Number(f.opacity)))) < 1;
    });
    const targetOf = (a: Animation) => (a.effect as KeyframeEffect | null)?.target as Element | null;
    const describe = (e: Element | null) => (e ? `${e.tagName.toLowerCase()}${e.getAttribute('aria-hidden') === 'true' ? '[aria-hidden]' : ''} "${e.textContent?.trim().slice(0, 30) ?? ''}"` : 'no target');
    return {
      perDot: dots.map((d) => fading.filter((a) => targetOf(a) === d).length),
      stray: fading.filter((a) => !dots.includes(targetOf(a) as Element)).map((a) => describe(targetOf(a))),
    };
  }, BUSY_WORDS);
}

/** The running animations: whether each target holds words, is hidden from assistive tech, and how low it fades. */
async function pulses(page: Page) {
  return page.evaluate(() =>
    document.getAnimations().map((a) => {
      const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
      const frames = (a.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
      const low = Math.min(1, ...frames.map((f) => (f.opacity === undefined ? 1 : Number(f.opacity))));
      return { text: el?.textContent?.trim() ?? '', hidden: el?.getAttribute('aria-hidden') === 'true', low };
    }),
  );
}

for (const width of [1440, 390] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`${width} ${theme}`, () => {
      test.use({ viewport: { width, height: 900 } });

      test(`busy pills keep their words fully opaque and at 4.5:1 or more through the pulse (${width} ${theme})`, async ({ page }) => {
        await gotoHub(page, '/billing?view=wallet', { state: 'busy-tones', theme });
        const read = await readWords(page);
        expect(read.map((r) => r.word)).toEqual(BUSY_WORDS);
        for (const r of read) {
          expect(r.minOpacity, `"${r.word}" fades`).toBe(1);
          expect(r.minRatio, `"${r.word}" contrast at the pulse's lowest point`).toBeGreaterThanOrEqual(4.5);
        }
      });

      test(`only the dots pulse: each busy pill's own dot pulses once, and nothing else does (${width} ${theme})`, async ({ page }) => {
        await gotoHub(page, '/billing?view=wallet', { state: 'busy-tones', theme });
        await readWords(page);
        const { perDot, stray } = await dotPulses(page);
        expect(perDot, 'one pulse on each busy pill\'s dot').toEqual(BUSY_WORDS.map(() => 1));
        expect(stray, 'no pulse anywhere but those dots').toEqual([]);
      });
    });
  }
}

test('with reduced motion nothing pulses', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/billing?view=wallet', { state: 'busy-tones' });
  await readWords(page);
  expect((await pulses(page)).filter((p) => p.low < 1)).toEqual([]);
});
