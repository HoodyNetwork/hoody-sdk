// The rail specimen (/_kit?layout=rail, rail-specimens): the shared RailFrame/RailPane/RailNav/RailSubnav/RailFoot and its
// PaneSeparator handle drawn as the AI tab draws them, so the gallery shows the real parts. Beside the page the handle resizes
// the rail on the frame's width (usePaneWidth, clamped by useElementWidth); as the whole screen there is no handle and the
// screen list goes across.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import kitStrings from '../strings.en.json';
import strings from './rail.strings.en.json';

const RAIL = '[data-gallery-rail] nav[class*="RailPane"]';

/** What the specimen's main region shows: its width, which values its `@container content (width < 600px)` rules give (the
 *  anatomy's --gap-between-sections: --sp-5 narrow, --sp-6 wide), and whether its ActionBar folded (Import off the bar). The page region's width is there to show the region, not the page, decides. */
async function fold(page: Page) {
  const region = page.locator('[data-gallery-rail] [data-hub-content]');
  await expect(region.getByRole('button', { name: strings['fold.add'] })).toBeVisible();
  return page.evaluate((importLabel) => {
    const el = document.querySelector<HTMLElement>('[data-gallery-rail] [data-hub-content]');
    const section = el?.querySelector<HTMLElement>('[data-hub-section]');
    const bar = section?.querySelector('[data-hub-action-group]');
    const root = getComputedStyle(document.documentElement);
    const gap = section ? getComputedStyle(section).getPropertyValue('--gap-between-sections').trim() : '';
    const narrow = root.getPropertyValue('--sp-5').trim();
    const wide = root.getPropertyValue('--sp-6').trim();
    return {
      page: document.getElementById('hub-main')?.clientWidth ?? 0,
      region: el?.getBoundingClientRect().width ?? 0,
      // The anatomy's two values, told apart: anything else (equal tokens, an unset gap) is neither.
      css: narrow !== wide && gap === narrow ? 'narrow' : narrow !== wide && gap === wide ? 'wide' : `unknown (${gap})`,
      folded: !!bar && ![...bar.querySelectorAll('button')].some((b) => b.textContent?.trim() === importLabel),
    };
  }, strings['fold.import']);
}

/** The suggestion specimen's row: every suggestion's box, the list's box, how many lines the row
 *  takes and whether any label is cut. All of them must be drawn: none folds into More actions. */
async function suggestions(page: Page) {
  const list = page.locator('[data-hub-suggestions]').getByRole('list', { name: strings['suggest.label'] });
  await expect(list).toBeVisible();
  await expect(list.getByRole('button')).toHaveCount(6);
  return list.evaluate((ul) => {
    const r = ul.getBoundingClientRect();
    const buttons = [...ul.querySelectorAll('button')];
    const tops = new Set(buttons.map((b) => Math.round(b.closest('li')!.getBoundingClientRect().top)));
    return {
      list: { left: r.left, right: r.right },
      boxes: buttons.map((b) => b.getBoundingClientRect()).map((b) => ({ left: b.left, right: b.right, w: b.width, h: b.height })),
      lines: tops.size,
      cut: buttons.some((b) => {
        const l = (b.querySelector('[data-chip-label] > span') ?? b.querySelector(':scope > span') ?? b) as HTMLElement;
        return l.scrollWidth > l.clientWidth + 1;
      }),
      more: !!ul.closest('[data-hub-suggestions]')!.querySelector('[aria-haspopup="menu"]'),
    };
  });
}

test.describe('beside the page', () => {
  test.use({ viewport: { width: 1350, height: 900 } });

  // Beside the rail the six suggestions all show, inside the list, on one or more lines.
  test('every suggestion shows inside its row, none in a menu', async ({ page }) => {
    await gotoHub(page, '/_kit?layout=rail');
    const r = await suggestions(page);
    expect(r.more).toBe(false);
    expect(r.cut).toBe(false);
    for (const b of r.boxes) {
      expect(b.w).toBeGreaterThan(0);
      expect(b.left).toBeGreaterThanOrEqual(r.list.left - 0.5);
      expect(b.right).toBeLessThanOrEqual(r.list.right + 0.5);
    }
  });

  test('every part shows, and the handle resizes the rail by 16 px a key', async ({ page }) => {
    await gotoHub(page, '/_kit?layout=rail');
    const rail = page.locator(RAIL);
    await expect(rail).toHaveAttribute('aria-label', strings.label);
    await expect(rail.getByRole('link', { name: strings.newItem })).toBeVisible();
    await expect(rail.getByRole('list', { name: strings['nav.label'] })).toBeVisible();
    await expect(rail.getByRole('list', { name: strings['sub.label'] }).getByRole('link', { name: strings['sub.notes'] })).toHaveAttribute('aria-current', 'page');
    await expect(rail.getByRole('table', { name: strings['list.label'] })).toBeVisible();
    await expect(rail.getByText(strings['foot.where'])).toBeVisible();
    await expect(rail.getByRole('button', { name: strings['foot.gear'] })).toBeVisible();

    const handle = page.getByRole('separator', { name: strings.resize });
    await expect(handle).toHaveAttribute('aria-valuenow', '340');
    const before = (await rail.boundingBox())?.width ?? 0;
    await handle.focus();
    await page.keyboard.press('ArrowRight');
    await expect(handle).toHaveAttribute('aria-valuenow', '356');
    await expect.poll(async () => (await rail.boundingBox())?.width ?? 0).toBe(before + 16);
    await page.keyboard.press('End');
    // The room left beside the page column caps the rail below its own 560 max at this width only when the frame is narrow.
    const max = Number(await handle.getAttribute('aria-valuemax'));
    await expect(handle).toHaveAttribute('aria-valuenow', String(max));
    // The page says the drawn width (its subtitle's own words up to the room, which depends on the window).
    const said = strings['main.subtitle'].replace('{{rail}}', String(max)).split('{{room}}')[0] ?? '';
    await expect(page.getByText(said, { exact: false })).toBeVisible();
  });
});

test.describe('the whole screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('one slot, no handle, the screen list across', async ({ page }) => {
    await gotoHub(page, '/_kit?layout=rail&strip=1');
    const rail = page.locator(RAIL);
    await expect(rail.getByRole('list', { name: strings['sub.label'] })).toBeVisible();
    await expect(page.getByRole('separator', { name: strings.resize })).toHaveCount(0);
    const box = await rail.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
  });
});

// On a 320 px phone the screen list is wider than the screen. It scrolls inside its own strip
// with the kit's edge chevrons (as the settings strip and Tabs do), so the page itself never scrolls sideways and every
// screen can be reached.
for (const width of [320, 390]) {
  test.describe(`${width}: the screen list scrolls inside its strip`, () => {
    test.use({ viewport: { width, height: 700 }, hasTouch: true, isMobile: true });

    test(`the page does not scroll sideways and the end chevron reaches the last screen at ${width}`, async ({ page }) => {
      await gotoHub(page, '/_kit?layout=rail&strip=1');
      const list = page.locator(RAIL).getByRole('list', { name: strings['sub.label'] });
      await expect(list.getByRole('link', { name: strings['sub.notes'] })).toHaveAttribute('aria-current', 'page');
      await noSideScroll(page);
      const box = await list.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          more: el.scrollWidth - el.clientWidth,
          overflow: getComputedStyle(el).overflowX,
        };
      });
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
      // The five screens are wider than the strip: it holds the rest, scrolled by hand or by its chevron.
      expect(box.more).toBeGreaterThan(0);
      expect(box.overflow).toBe('auto');
      const chevrons = page.locator(RAIL).locator('[data-more]');
      await expect(chevrons).toHaveCount(1);
      await expect(chevrons).toHaveAttribute('data-more', 'end');
      const last = list.getByRole('link', { name: strings['sub.archive'] });
      // Before: the last screen ends past the strip's edge.
      const before = await last.evaluate((a) => a.getBoundingClientRect().right - (a.closest('[role="list"]') as HTMLElement).getBoundingClientRect().right);
      expect(before).toBeGreaterThan(1);
      // Each press scrolls a step; within a step of the edge it lands on it, and the end chevron goes.
      const end = page.locator(RAIL).locator('[data-more="end"]');
      await expect(async () => {
        if ((await end.count()) > 0) await end.click();
        await expect(end).toHaveCount(0, { timeout: 1000 });
      }).toPass({ timeout: 10_000 });
      await expect(page.locator(RAIL).locator('[data-more="start"]')).toHaveCount(1);
      const after = await last.evaluate((a) => {
        const l = (a.closest('[role="list"]') as HTMLElement).getBoundingClientRect();
        const r = a.getBoundingClientRect();
        return { inside: r.left >= l.left - 1 && r.right <= l.right + 1, right: r.right };
      });
      expect(after.inside).toBe(true);
      expect(after.right).toBeLessThanOrEqual(width);
      await noSideScroll(page);
      // Keyboard: focus on the last screen keeps it in view inside the strip, its whole focus ring drawn (the ring is a 4 px
      // shadow outside the link; the scroller clips anything past its padding box).
      await last.focus();
      const ring = await last.evaluate((a) => {
        const l = (a.closest('[role="list"]') as HTMLElement).getBoundingClientRect();
        const r = a.getBoundingClientRect();
        return { top: r.top - 4 - l.top, bottom: l.bottom - (r.bottom + 4), right: l.right - r.right };
      });
      expect(ring.top, 'the ring clears the strip top').toBeGreaterThanOrEqual(-0.5);
      expect(ring.bottom, 'the ring clears the strip bottom').toBeGreaterThanOrEqual(-0.5);
      expect(ring.right, 'the focused link is inside the strip').toBeGreaterThanOrEqual(-1);
    });
  });
}

// The main region beside the rail is a kit ContentRegion, the container its `@container content`
// rules read. Its ActionBar folds exactly when those rules apply, whatever the page region's width.
test.describe('the fold follows its region, not the page', () => {
  test.describe('1440: room for the bar', () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test('wide region: the CSS keeps its wide values and the bar keeps its secondaries', async ({ page }) => {
      await gotoHub(page, '/_kit?layout=rail');
      const s = await fold(page);
      expect(s.region).toBeGreaterThanOrEqual(600);
      expect(s).toMatchObject({ css: 'wide', folded: false });
    });
  });

  test.describe('900: a narrow region in a wide page', () => {
    test.use({ viewport: { width: 900, height: 900 } });
    test('the region under 600 px folds the bar, as its CSS does, while the page region is wider than 600 px', async ({ page }) => {
      await gotoHub(page, '/_kit?layout=rail');
      const s = await fold(page);
      expect(s.page).toBeGreaterThanOrEqual(600);
      expect(s.region).toBeLessThan(600);
      expect(s).toMatchObject({ css: 'narrow', folded: true });
      // Folded means moved, never dropped: both secondaries are in More actions.
      await page.locator('[data-gallery-rail] [data-hub-content]').getByRole('button', { name: kitStrings['action.more'] }).click();
      await expect(page.getByRole('menuitem')).toHaveText([strings['fold.import'], strings['fold.export']]);
    });
  });

  test.describe('390: the main region as the whole screen', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test('a phone-wide region: the CSS and the bar both narrow', async ({ page }) => {
      await gotoHub(page, '/_kit?layout=rail&strip=1&screen=main');
      await expect(page.locator(RAIL)).toHaveCount(0);
      const s = await fold(page);
      expect(s).toMatchObject({ css: 'narrow', folded: true });
    });

    // At a phone width the same six wrap onto more lines and every one stays on screen, whole.
    test('the suggestions wrap at a phone width and every one stays on screen', async ({ page }) => {
      await gotoHub(page, '/_kit?layout=rail&strip=1&screen=main');
      const r = await suggestions(page);
      expect(r.more).toBe(false);
      expect(r.cut).toBe(false);
      expect(r.lines).toBeGreaterThan(1);
      for (const b of r.boxes) {
        expect(b.left).toBeGreaterThanOrEqual(0);
        expect(b.right).toBeLessThanOrEqual(390);
        expect(b.right).toBeLessThanOrEqual(r.list.right + 0.5);
      }
    });

    // In the same narrow region, the bar above folds while an InlineActions row keeps its action
    // drawn, on screen and inside the region. Its label is an address longer than the row: it wraps onto more lines,
    // never runs past the edge and is never cut.
    test('an inline action stays drawn where the bar folds', async ({ page }) => {
      await gotoHub(page, '/_kit?layout=rail&strip=1&screen=main');
      const s = await fold(page);
      expect(s).toMatchObject({ css: 'narrow', folded: true });
      const use = page.locator('[data-hub-inline-actions]').getByRole('button', { name: strings['inline.use'] });
      await expect(use).toBeVisible();
      const box = await use.boundingBox();
      if (!box) throw new Error('the inline action has no box');
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      // Whole, on more than one line: the label's own box is no wider than it shows (no ellipsis) and taller than a line.
      const label = await use.evaluate((b) => {
        const l = (b.querySelector('[data-chip-label] > span') ?? b.querySelector(':scope > span') ?? b) as HTMLElement;
        return { cut: l.scrollWidth > l.clientWidth + 1, lines: Math.round(l.getBoundingClientRect().height / parseFloat(getComputedStyle(l).lineHeight)) };
      });
      expect(label.cut).toBe(false);
      expect(label.lines).toBeGreaterThan(1);
      // A short action with no chip (danger never takes one) keeps its size's height, and on this coarse pointer the
      // touch minimum: wrapping lets it grow, never shrink.
      const remove = page.locator('[data-hub-inline-actions]').getByRole('button', { name: strings['inline.remove'] });
      const h = await remove.evaluate((b) => ({
        h: b.getBoundingClientRect().height,
        touch: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--touch-min')),
        chip: b.hasAttribute('data-chip'),
      }));
      expect(h.chip).toBe(false);
      expect(h.touch).toBeGreaterThan(0);
      expect(h.h).toBeGreaterThanOrEqual(h.touch);
      // A long disabled action sits in ReasonButton's wrapper: the wrapper and its button stay inside the row too.
      const keep = page.locator('[data-hub-inline-actions]').getByRole('button', { name: strings['inline.keep'] });
      const edges = await keep.evaluate((b) => {
        const row = b.closest('[data-hub-inline-actions]') as HTMLElement;
        const item = [...row.children].find((c) => c.contains(b)) as HTMLElement;
        const r = row.getBoundingClientRect();
        return { row: r.right, item: item.getBoundingClientRect().right, button: b.getBoundingClientRect().right, wrapped: item !== b };
      });
      expect(edges.wrapped).toBe(true);
      expect(edges.item).toBeLessThanOrEqual(edges.row + 0.5);
      expect(edges.button).toBeLessThanOrEqual(edges.row + 0.5);
      await expect(page.getByRole('button', { name: 'More actions' })).toHaveCount(1);
    });
  });
});
