// Playwright: a ListDetailPage list pane in its kit state ("Pick a realm",
// the All realms case) draws the state where the list goes, inside the pane, at 390 px and at desktop width, in both
// themes. Gallery: /_kit?layout=list-fill&lstate=here. Real layout, so a real browser; the shots are artifacts.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';

const URL = '/_kit?layout=list-fill&lstate=here';
/** A computer of the gallery's fixture world: its row id, and the name its detail shows. */
const SELECTED = 'atlas';
/** The list pane's region name: the gallery page's title. */
const LIST_PANE = 'Computers';
/** A button of the gallery's first tab: drawn without a state, gone with one. */
const TAB_CONTENT = 'Create computer';

/** The list pane and the state drawn in it: their boxes, the state's colours, and whether a table is drawn. */
async function pane(page: Page) {
  return page.evaluate(() => {
    const title = [...document.querySelectorAll<HTMLElement>('#hub-main section *')].find((e) => e.childElementCount === 0 && e.textContent === 'Pick a realm');
    const pane = title?.closest<HTMLElement>('section[aria-label]');
    if (!title || !pane) throw new Error('no state in a list pane');
    const box = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), width: Math.round(r.width) };
    };
    const body = [...pane.querySelectorAll<HTMLElement>('*')].find((e) => e.childElementCount === 0 && /^These computers belong to one realm/.test(e.textContent ?? ''));
    return {
      pane: box(pane),
      title: box(title),
      body: body ? box(body) : null,
      titleColor: getComputedStyle(title).color,
      paneBg: getComputedStyle(document.body).backgroundColor,
      table: pane.querySelector('table, [role="grid"]') !== null,
    };
  });
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`${theme} ${width}: the list pane draws its state inside the pane, no table, no page scroll`, async ({ page }, info) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 860 });
      await gotoHub(page, URL, { theme });
      await expect(page.locator('#hub-main').getByText('Pick a realm', { exact: true })).toBeVisible({ timeout: 20_000 });
      const p = await pane(page);
      expect(p.table, 'the list is not drawn under the state').toBe(false);
      expect(p.body, 'the body sentence is drawn').not.toBeNull();
      for (const b of [p.title, p.body!]) {
        expect(b.left).toBeGreaterThanOrEqual(p.pane.left);
        expect(b.right).toBeLessThanOrEqual(p.pane.right);
      }
      await noSideScroll(page);
      await page.screenshot({ path: info.outputPath(`panestate-${theme}-${width}.png`) });
      info.annotations.push({ type: 'colors', description: `${p.titleColor} on ${p.paneBg}` });
    });
  }
}

test('the two themes draw the state in their own ink', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 860 });
  const ink: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    await gotoHub(page, URL, { theme });
    await expect(page.locator('#hub-main').getByText('Pick a realm', { exact: true })).toBeVisible({ timeout: 20_000 });
    ink.push((await pane(page)).titleColor);
  }
  expect(ink[0]).not.toBe(ink[1]);
});

// A selected row keeps its detail while the list pane shows its state: beside it in two panes, in place of it below
// the two-pane width (a present detail takes the whole page there, the list pane with it).
for (const mode of ['list-fill', 'list-side']) {
  test(`${mode} 1440: the state stays in the list pane beside a selected detail`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 860 });
    await gotoHub(page, `/_kit?layout=${mode}&lstate=here&sel=${SELECTED}`);
    await expect(page.locator('#hub-main').getByText('Pick a realm', { exact: true })).toBeVisible({ timeout: 20_000 });
    const detail = page.locator('#hub-main').getByRole('heading', { name: SELECTED, exact: true });
    await expect(detail).toBeVisible();
    await expect(page.locator('#hub-main').getByRole('region', { name: LIST_PANE, exact: true })).toBeVisible();
    const p = await pane(page);
    const d = await detail.boundingBox();
    expect(p.table, 'the list is not drawn under the state').toBe(false);
    expect(d?.x ?? -1, 'the detail sits beside the list pane').toBeGreaterThanOrEqual(p.pane.right);
    await noSideScroll(page);
  });
}

test('list-fill 390: a selected detail takes the page, the list pane and its state go with it', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 860 });
  await gotoHub(page, `${URL}&sel=${SELECTED}`);
  await expect(page.locator('#hub-main').getByRole('heading', { name: SELECTED, exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#hub-main').getByText('Pick a realm', { exact: true })).toBeHidden();
  await expect(page.locator('#hub-main').getByRole('region', { name: LIST_PANE, exact: true })).toBeHidden();
  const box = await page.locator('#hub-main').getByRole('heading', { name: SELECTED, exact: true }).evaluate((h) => {
    const r = h.closest('section')?.getBoundingClientRect();
    return r ? { left: r.left, right: r.right, width: r.width } : null;
  });
  expect(box, 'the heading sits in the detail pane').not.toBeNull();
  expect(box!.left, 'the detail starts inside the page').toBeGreaterThanOrEqual(0);
  expect(box!.right, 'the detail ends inside the page').toBeLessThanOrEqual(390);
  expect(box!.width, 'the detail takes the page, 16 px gutters aside').toBeGreaterThanOrEqual(390 - 2 * 16);
  await noSideScroll(page);
});

// DetailPage's slot: the state goes where the tab's content goes; the header and the tabs stay. Gallery: /_kit?dstate=here.
for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`${theme} ${width}: DetailPage draws its state in place of the tab content, header and tabs stay`, async ({ page }, info) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 860 });
      await gotoHub(page, '/_kit?dstate=here', { theme });
      const main = page.locator('#hub-main');
      await expect(main.getByText('Pick a realm', { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(main.getByRole('tablist')).toBeVisible();
      await expect(main.getByText(/^These computers belong to one realm/)).toBeVisible();
      await expect(main.getByRole('button', { name: TAB_CONTENT, exact: true })).toHaveCount(0);
      await noSideScroll(page);
      await page.screenshot({ path: info.outputPath(`detailstate-${theme}-${width}.png`) });
    });
  }
}

test('control: without a state the same page draws its first tab, so the button above is the tab content', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 860 });
  await gotoHub(page, '/_kit');
  await expect(page.locator('#hub-main').getByRole('button', { name: TAB_CONTENT, exact: true })).toBeVisible({ timeout: 20_000 });
});
