// AI > Workflows says under its title what a workflow is and how one runs, and the whole line
// shows: the header's subtitle is clamped to two lines (kit PageHeader `.subtitle`), so the line has
// to fit two lines at a 360 px phone, at 390 and on a desktop. The clamp clips silently, so the test reads the box itself: a
// clipped line scrolls further than it shows.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import { links } from './links';
import wfStrings from './auto/workflows/strings.en.json';

async function wholeLine(page: Page) {
  await gotoHub(page, links.workflows);
  const line = page.getByText(wfStrings['wf.desc'], { exact: true });
  await expect(line).toBeVisible();
  const box = await line.evaluate((el) => ({ scroll: el.scrollHeight, shown: el.clientHeight, line: parseFloat(getComputedStyle(el).lineHeight) }));
  expect(box.scroll, 'the two-line clamp cuts nothing off').toBeLessThanOrEqual(box.shown);
  expect(Math.round(box.shown / box.line), 'lines drawn').toBeLessThanOrEqual(2);
}

for (const v of [
  { width: 360, height: 740, touch: true },
  { width: 390, height: 844, touch: true },
  { width: 1440, height: 900, touch: false },
]) {
  test.describe(`at ${v.width} px`, () => {
    test.use({ viewport: { width: v.width, height: v.height }, hasTouch: v.touch, isMobile: v.touch });
    test('the line that says what a workflow is shows whole under the title', ({ page }) => wholeLine(page));
  });
}
