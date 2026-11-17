// The Add a program frame's app search (a computer's programs and apps in one frame, the apps as cards of tiles) says
// how many tiles each source added, and the chips add up to the app tiles shown; while cards sit below the frame's
// scrolling body, a fade marks its bottom edge.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

async function openFrame(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await gotoHub(page, '/board');
  await page.getByRole('button', { name: strings['board.addProgram'] }).first().click(); // reason: the chips row's + (a phone, or a paged Board) has the same name, after the strip's or the empty slot's own
  const d = page.getByRole('dialog').last();
  await d.getByRole('row', { name: /^atlas/ }).click(); // the computer's frame holds its apps: no second step
  return d;
}

for (const [w, h] of [[1350, 900], [390, 844]] as const) {
  test(`launch search at ${w}: per-source counts add up to the app tiles shown`, async ({ page }) => {
    const d = await openFrame(page, w, h);
    const box = d.getByRole('searchbox');
    // A query the fixture sources answer with tiles of their own ('firefox' would leave every source at 0).
    await box.fill('jupyter');
    const strip = d.getByRole('group', { name: 'Search sources' });
    // Every source has answered: no chip still searching.
    await expect(strip).toBeVisible();
    await expect(strip.getByText(/: searching…$/)).toHaveCount(0, { timeout: 15_000 });
    // The app tiles: every card the launcher draws for the search's sources (not Opened recently, the agents' card,
    // the Options switch, Not listed? or the Search sources card itself).
    const cards = d.locator('section[id^="launch-"]:not(#launch-recent):not(#launch-agents):not(#launch-options):not(#launch-github):not(#launch-sources)');
    await expect(cards.first()).toBeVisible();
    const n = await cards.getByRole('row').count();
    // A card says its count in its title, and the titles add up to the tiles.
    const titled = (await cards.getByRole('heading').allTextContents()).map((x) => Number(/ · (\d+)$/.exec(x)?.[1] ?? NaN));
    expect(titled.reduce((a, x) => a + x, 0)).toBe(n);
    // A chip with a count: "<source>: N", or "<source>: N (<state>)" for a failed or warming source that lists tiles.
    const chips = (await strip.locator('text=/: \\d+( \\(.*\\))?$/').allTextContents()).map((c) => ({ c, n: Number(/: (\d+)/.exec(c)![1]) }));
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.reduce((a, x) => a + x.n, 0)).toBe(n);
    // Some search source, not only the catalogue, adds tiles here.
    expect(chips.filter((x) => !x.c.startsWith('Ready to install:') && x.n > 0).length).toBeGreaterThan(0);
    // No per-tile button: the tile is the action (the one Options switch is the kind's, not a tile's).
    await expect(cards.getByRole('button')).toHaveCount(0);
  });
}

// The frame's body scrolls under its fixed head: while cards sit below its bottom edge, a fade marks that edge, in view
// (the phone sheet's included), and takes no pointer; scrolled to the end, no fade.
for (const [w, h] of [[1350, 900], [390, 844]] as const) {
  test(`frame at ${w}: a fade on the body's bottom edge, in view, while cards are below; gone at the end`, async ({ page }) => {
    const d = await openFrame(page, w, h);
    const body = d.getByRole('region', { name: strings['browse.tab.programs'] });
    await expect(body.getByRole('row').first()).toBeVisible();
    const fade = body.locator('[data-more-below]');
    await expect(fade).toHaveCount(1);
    expect(await fade.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    const atEdge = async () => {
      const edge = await body.evaluate((el) => el.getBoundingClientRect().bottom - parseFloat(getComputedStyle(el).borderBottomWidth));
      const box = await fade.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.abs(box!.y + box!.height - edge)).toBeLessThanOrEqual(1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(h);
    };
    await atEdge();
    // Half way down it still marks the bottom edge.
    await body.evaluate((el) => el.scrollTo({ top: (el.scrollHeight - el.clientHeight) / 2 }));
    await expect(fade).toHaveCount(1);
    await atEdge();
    await body.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await expect(fade).toHaveCount(0);
  });
}
