// Playwright: the Ports & aliases tab's aliases section, with long alias names on a long server name, at a wide and a
// phone width. Each alias's address shows its host name whole (wrapping, never cut); the row's one Copy copies exactly
// that host name; no second column repeats it; the own-domain Why's chevron lines up with the table's first column
// (the section's inset), and its link opens the steps in the page questions.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const SHORT = 'lively-harbor-aik27wtzxcjd0vw3';
const LONG = 'customer-portal-staging-environment-for-the-spring-release-v2.atlas.computers.example.test';
const section = (page: Page) => page.locator('section#aliases');
const row = (page: Page) => section(page).locator('[data-row-id="al-long-1"]');

async function open(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await gotoHub(page, '/programs?tab=ports', { state: 'ports-long' });
  await expect(row(page).getByText(SHORT, { exact: true })).toBeVisible();
}

for (const width of [1440, 390]) {
  test(`at ${width} px every alias shows its whole host name as its link, with one Copy of exactly that`, async ({ page }) => {
    await open(page, width);
    const sec = section(page);
    const link = sec.getByRole('link', { name: LONG });
    await expect(link).toBeVisible();
    // Whole: the link's text is the host name, and neither it nor its cell clips or cuts anything.
    await expect(link).toHaveText(LONG);
    const clipped = await link.evaluate((el) => {
      for (let n: Element | null = el; n && n.tagName !== 'TABLE' && n.tagName !== 'SECTION'; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.textOverflow === 'ellipsis' && n.scrollWidth > n.clientWidth + 1) return `${n.tagName} cut with an ellipsis`;
        if (cs.overflowX !== 'visible' && n.scrollWidth > n.clientWidth + 1) return `${n.tagName} clips its overflow`;
      }
      const r = el.getBoundingClientRect();
      return r.right > window.innerWidth + 1 ? 'past the window' : '';
    });
    expect(clipped).toBe('');
    // One Copy per alias, and it copies the host name (no scheme): what a CNAME record points at.
    await page.evaluate(() => {
      const w = window as unknown as { __copied: string[] };
      w.__copied = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (w.__copied.push(s), Promise.resolve()) } });
    });
    const copyName = `Copy the address of ${SHORT}`;
    if (width >= 1024) {
      // A table row: Copy shows on hover (and is then not in the row's menu).
      await row(page).hover();
      await row(page).getByRole('button', { name: copyName, exact: true }).click();
    } else {
      // A list row: Copy is in the row's menu.
      await row(page).getByRole('button', { name: 'Row actions', exact: true }).click();
      await page.getByRole('menuitem', { name: copyName, exact: true }).click();
    }
    await expect.poll(() => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).toEqual([`${SHORT}.atlas.computers.example.test`]);
    // Nothing shows the host name a second time: the old "Your domain points to" column is gone.
    await expect(sec.getByText('Your domain points to')).toHaveCount(0);
    await expect(sec.getByText(`${SHORT}.atlas.computers.example.test`, { exact: true })).toHaveCount(1);
  });

  test(`at ${width} px the own-domain Why sits at the section's inset, its chevron in line with the column it heads`, async ({ page }) => {
    await open(page, width);
    const sec = section(page);
    const trigger = sec.getByRole('button', { name: strings['pa.why.q'] });
    const chevron = await trigger.locator('svg').first().boundingBox(); // the trigger's one icon: its chevron
    // The fold starts where the table's first column does: at a wide width in line with the alias names, and on a phone
    // (list rows, which keep a narrower inset of their own) in line with the section's title, at the card's inset.
    const anchor = width >= 1024 ? row(page).getByText(SHORT, { exact: true }) : sec.getByRole('heading', { name: strings['pa.aliases.title'] });
    const textLeft = await anchor.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().left;
    });
    expect(chevron, 'the Why has its chevron').not.toBeNull();
    expect(Math.abs(chevron!.x - textLeft), `chevron at ${chevron!.x}, text at ${textLeft}`).toBeLessThanOrEqual(2);
    await trigger.click();
    await expect(sec.getByText(strings['pa.why.a'])).toBeVisible(); // the answer's text, its FAQ link after it
    await expect(sec.getByRole('link', { name: strings['pa.why.more'] })).toBeVisible();
  });
}
