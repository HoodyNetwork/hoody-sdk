// Playwright on the gallery's panel-steps specimens (/_kit?tab=pieces #panel-steps), light
// and dark:
// - Track: at 1440 the open step keeps its node beside its card, the foot's primary sits at the foot's end on the say
//   line; at 390 (coarse) the open step drops its node and takes the track's full width, its tags sit above its name,
//   the foot stacks with the primary last, full width and at least 44 px tall (rules 36-38); nothing scrolls sideways.
// - Verdict: one segment per step in one row inside the plate, at both widths.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from '../gallery/drafty.strings.en.json';

async function open(page: Page, theme: 'light' | 'dark') {
  await gotoHub(page, '/_kit?tab=pieces', { theme });
  const track = page.locator('[data-specimen="track"]');
  await track.scrollIntoViewIfNeeded();
  await expect(track.getByRole('list', { name: strings['track.label'] })).toBeVisible(); // reason: the specimen is drawn
  return track;
}

/** The open step's geometry: its node, its card, the track, its name and tags, its foot's say line and primary. */
async function geom(page: Page) {
  return page.locator('[data-specimen="track"] [data-step="privacy"]').evaluate((li) => {
    const box = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
    const card = li.querySelector('[role="region"]')!;
    const node = li.firstElementChild!;
    const track = li.closest('ol')!.getBoundingClientRect();
    const name = card.querySelector('h3')!;
    const tags = name.nextElementSibling;
    const primary = card.querySelector('[data-track-primary] button')!;
    const say = primary.closest('[data-track-primary]')!.parentElement!.previousElementSibling;
    const n = box(node)!;
    return {
      nodeShown: getComputedStyle(node).display !== 'none' && n.width > 0,
      nodeRight: n.right,
      card: box(card)!,
      track: { left: track.left, right: track.right },
      name: box(name)!,
      tags: box(tags),
      say: box(say),
      primary: box(primary)!,
    };
  });
}

async function segments(page: Page) {
  return page.locator('[data-specimen="verdict"] [data-segment]').evaluateAll((els) => {
    const plate = els[0]!.closest('[role="group"]')!.getBoundingClientRect();
    return {
      plate: { left: plate.left, right: plate.right },
      segs: els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), left: r.left, right: r.right, w: r.width })),
    };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`track and verdict at 1440, fine pointer, ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test('the open step keeps its node beside its card; the primary sits at the foot end; segments share one row', async ({ page }) => {
      await open(page, theme);
      const g = await geom(page);
      expect(g.nodeShown).toBe(true);
      expect(g.card.left).toBeGreaterThanOrEqual(g.nodeRight);
      expect(g.say).not.toBeNull();
      expect(g.primary.left).toBeGreaterThanOrEqual(g.say!.right);
      expect(Math.abs(g.primary.right - (g.card.right - 1))).toBeLessThanOrEqual(24);
      const v = await segments(page);
      expect(v.segs).toHaveLength(6);
      expect(new Set(v.segs.map((x) => x.top)).size).toBe(1);
      for (const s of v.segs) expect(s.w).toBeGreaterThan(8);
    });
  });

  test.describe(`track and verdict at 390, coarse pointer, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test('the open step drops its node and fills the track, tags above the name, the foot stacks with a full-width 44 px primary', async ({ page }) => {
      await open(page, theme);
      const g = await geom(page);
      expect(g.nodeShown).toBe(false);
      expect(Math.abs(g.card.left - g.track.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(g.card.right - g.track.right)).toBeLessThanOrEqual(1);
      expect(g.tags).not.toBeNull();
      expect(g.tags!.bottom).toBeLessThanOrEqual(g.name.top + 1);
      expect(g.primary.top).toBeGreaterThanOrEqual(g.say!.bottom);
      expect(g.primary.height).toBeGreaterThanOrEqual(44);
      expect(g.primary.width).toBeGreaterThanOrEqual(g.card.width - 2 * 24 - 2);
      const v = await segments(page);
      expect(new Set(v.segs.map((x) => x.top)).size).toBe(1);
      for (const s of v.segs) expect(s.right).toBeLessThanOrEqual(v.plate.right);
      await noSideScroll(page);
    });
  });
}

test.describe('track keyboard and the foot-primary marker', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('Enter and Space on a closed row open it, close the open one and move focus to its heading', async ({ page }) => {
    const track = await open(page, 'light');
    const home = track.locator('[data-step="home"]').getByRole('button');
    await home.focus();
    await page.keyboard.press('Enter');
    await expect(track.getByRole('region')).toHaveCount(1);
    await expect(track.getByRole('region')).toHaveAccessibleName(new RegExp(`^${strings['t.home']}`));
    await expect(track.getByRole('region').getByRole('heading')).toBeFocused();
    const privacy = track.locator('[data-step="privacy"]').getByRole('button');
    await privacy.focus();
    await page.keyboard.press('Space');
    await expect(track.getByRole('region')).toHaveCount(1);
    await expect(track.getByRole('region')).toHaveAccessibleName(new RegExp(`^${strings['t.privacy']}`));
    await expect(track.getByRole('region').getByRole('heading')).toBeFocused();
  });

  for (const [w, shown] of [
    [1440, true],
    [390, false],
  ] as const)
    test(`under a [data-foot-primary] body the step's own primary is ${shown ? 'kept on a wide track' : 'hidden on a narrow one'} (${w})`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      const track = await open(page, 'light');
      await track.evaluate((el) => el.setAttribute('data-foot-primary', ''));
      const primary = track.locator('[data-step="privacy"]').getByRole('button', { name: strings['t.privacy.primary'] });
      if (shown) await expect(primary).toBeVisible();
      else await expect(primary).toBeHidden();
    });
});
