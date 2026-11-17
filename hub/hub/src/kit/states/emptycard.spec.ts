// Playwright: the empty state is one slanted card. On a list page (Schedules, Scripts)
// it takes the table frame's place: full width directly under the header, 44 px top and bottom, 32 px sides. Both themes,
// phone and desktop width, the corner drawn by the card edge in the panel line colour on the card fill, and no sideways
// scroll. A centred card elsewhere is at most 560 px (the Tunnels "pick a computer" state). In forced colours the edge is
// still drawn. Embedded and bare tables staying plain is proven in kit/data/DataTable.emptyplace.test.tsx (no empty
// fixture shows one).
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';

const card = (page: Page) => page.locator('#hub-main [data-empty-place]');
const geometry = (page: Page) =>
  card(page).evaluate((el) => {
    const b = el.getBoundingClientRect();
    const p = el.parentElement!.getBoundingClientRect();
    const c = getComputedStyle(el);
    const page = el.closest('[data-hub-page]') ?? document.querySelector('#hub-main')!;
    const header = page.querySelector('h1[data-hub-title]')?.closest('header');
    // The tokens as this element resolves them: a probe inside the card, so the theme's values are compared.
    const probe = document.createElement('span');
    probe.style.color = 'var(--hx-panel-line)';
    probe.style.backgroundColor = 'var(--hx-card)';
    el.appendChild(probe);
    const want = { line: getComputedStyle(probe).color, card: getComputedStyle(probe).backgroundColor };
    probe.remove();
    const path = el.querySelector(':scope > svg[data-card-edge] path');
    return {
      place: el.getAttribute('data-empty-place'),
      cut: el.hasAttribute('data-card-cut'),
      edge: el.querySelector(':scope > svg[data-card-edge] path') !== null,
      left: b.left,
      width: b.width,
      top: b.top,
      parentLeft: p.left,
      parentWidth: p.width,
      parentCentre: p.left + p.width / 2,
      headerBottom: header ? header.getBoundingClientRect().bottom : null,
      padTop: parseFloat(c.paddingTop),
      padBottom: parseFloat(c.paddingBottom),
      padLeft: parseFloat(c.paddingLeft),
      fill: c.backgroundColor,
      stroke: path ? getComputedStyle(path).stroke : null,
      want,
    };
  });

for (const theme of ['light', 'dark'] as const)
  for (const width of [390, 1350]) {
    for (const path of ['/schedules', '/scripts'])
      test(`@emptycard ${path} ${theme} at ${width}: the card takes the table frame's place under the header`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await gotoHub(page, path, { state: 'empty', theme });
        await expect(card(page)).toBeVisible();
        const g = await geometry(page);
        expect(g.place).toBe('frame');
        expect(g.cut && g.edge, 'the slanted corner, drawn by the card edge').toBe(true);
        expect(Math.abs(g.left - g.parentLeft), 'flush with the list').toBeLessThanOrEqual(1);
        expect(Math.abs(g.width - g.parentWidth), 'the full width of the list').toBeLessThanOrEqual(1);
        expect(g.padTop).toBe(44);
        expect(g.padBottom).toBe(44);
        expect(g.padLeft).toBe(32);
        expect(g.fill, 'the card fill token').toBe(g.want.card);
        expect(g.stroke, 'the edge in the panel line token').toBe(g.want.line);
        expect(g.headerBottom).not.toBeNull();
        expect(g.top - g.headerBottom!, 'below the header, never under it').toBeGreaterThanOrEqual(8);
        expect(g.top - g.headerBottom!, 'directly under the header').toBeLessThanOrEqual(48);
        await noSideScroll(page);
      });

    test(`@emptycard a computer state ${theme} at ${width}: one centred card of at most 560 px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, '/tunnels', { state: 'empty', theme });
      await expect(card(page)).toBeVisible();
      const g = await geometry(page);
      expect(g.place).toBe('center');
      expect(g.cut && g.edge, 'the slanted corner, drawn by the card edge').toBe(true);
      expect(g.width).toBeLessThanOrEqual(560);
      expect(g.fill, 'the card fill token').toBe(g.want.card);
      expect(g.stroke, 'the edge in the panel line token').toBe(g.want.line);
      expect(Math.abs(g.left + g.width / 2 - g.parentCentre), 'centred in its area').toBeLessThanOrEqual(1);
      expect(g.padTop).toBe(48);
      expect(g.padBottom).toBe(48);
      expect(g.padLeft).toBe(32);
      await noSideScroll(page);
      await page.screenshot({ path: test.info().outputPath(`emptycard-tunnels-${theme}-${width}.png`) });
    });
  }

test('@emptycard the two themes give the card different fills', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  const fills: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    await gotoHub(page, '/schedules', { state: 'empty', theme });
    await expect(card(page)).toBeVisible();
    fills.push((await geometry(page)).fill);
  }
  expect(fills[0]).not.toBe(fills[1]);
});

test('@emptycard forced colours: the edge is still drawn, in a colour other than the fill', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, '/schedules', { state: 'empty' });
  await expect(card(page)).toBeVisible();
  const g = await geometry(page);
  expect(g.edge).toBe(true);
  expect(g.stroke).not.toBeNull();
  expect(g.stroke).not.toBe('none');
  expect(g.stroke).not.toBe('rgba(0, 0, 0, 0)');
  expect(g.stroke).not.toBe(g.fill);
  await page.screenshot({ path: test.info().outputPath('emptycard-forced.png') });
});
