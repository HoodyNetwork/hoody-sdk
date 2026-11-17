// Playwright: the Usage tiles (and the Connect cards, which share the grid) fit their panel. The tiles sit in the
// Overview's Status and usage section, under its facts and the usage switch. Nothing in the section
// reaches past its right edge or scrolls sideways: at real widths in both themes, and in a panel squeezed to 200 px
// (narrower than a tile's preferred 240 px), which is the case the old fixed minimum overflowed.
// The server panel's Usage rows (CPU, memory, disk meters with their readings) are measured the same way, with a
// fixture answering the server's runtime read.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';
import sd from './parts/ServerDetail.strings.en.json';

type Theme = 'light' | 'dark';

/** How far any descendant of `box` reaches past its right edge, and whether the box scrolls sideways. A card clips at
 *  its border box and its frame line lies on that border, so scrollWidth counts the border it covers; whether the box
 *  scrolls is read by scrolling it (a box that clips cannot be), then putting it back. */
async function overflow(box: Locator, part?: Locator): Promise<{ past: number; scrolls: boolean; what: string }> {
  const only = part ? await part.elementHandle() : null;
  return box.evaluate((el, only) => {
    const was = el.scrollLeft;
    el.scrollLeft = el.scrollWidth;
    const scrolls = el.scrollLeft > 1;
    el.scrollLeft = was;
    const right = el.getBoundingClientRect().right;
    let past = 0;
    let what = '';
    // With a part, only it and what is inside it are measured, still against the box's edge.
    for (const d of only ? [only, ...Array.from(only.querySelectorAll('*'))] : Array.from(el.querySelectorAll('*'))) {
      const r = d.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right - right > past) {
        past = r.right - right;
        what = `${d.tagName.toLowerCase()}.${String((d as HTMLElement).className)}: ${(d.textContent ?? '').slice(0, 40)}`;
      }
    }
    return { past, scrolls, what };
  }, only);
}

/** Evidence: the section and the whole window, into HUB_SHOTS_DIR when it is set. */
async function shot(page: Page, sec: Locator, name: string): Promise<void> {
  const dir = process.env.HUB_SHOTS_DIR;
  if (!dir) return;
  await page.screenshot({ path: `${dir}/usage-${name}-page.png` });
  await sec.screenshot({ path: `${dir}/usage-${name}.png` });
}

/** Squeeze one section of the detail to `px` wide, as the narrowest panel would. */
async function squeeze(page: Page, section: string, px: number): Promise<void> {
  await page.addStyleTag({ content: `section#${section} { width: ${px}px !important; max-width: ${px}px !important; }` });
}

async function computerUsage(page: Page, theme: Theme, widenList: boolean, px?: number): Promise<Locator> {
  await gotoHub(page, '/computers?sel=atlas.00a1', { theme });
  if (widenList) {
    const sep = page.getByRole('separator', { name: /Resize list/ });
    if (await sep.count()) {
      await sep.focus();
      await page.keyboard.press('End');
    }
  }
  if (px) await squeeze(page, 'status', px);
  const section = page.locator('section#status');
  await section.getByText(strings['usage.show'], { exact: true }).click();
  // The Disk tile's meter (the facts above the tiles have a Disk row of their own).
  await expect(section.getByRole('meter', { name: new RegExp(`^${strings['usage.disk'].split('{{')[0]}`) })).toBeVisible();
  await expect(section.getByText(/ of \d+ GB$/).first()).toBeVisible(); // reason: any one size line shows the tiles have their readings
  return section;
}

/** The server panel of n12 (the fixtures' rented dedicated server) with its three usage rows drawn, optionally squeezed. */
async function serverUsage(page: Page, theme: Theme, px?: number): Promise<Locator> {
  await gotoHub(page, '/computers/servers', { theme });
  await page.getByRole('row', { name: /^n12\b/ }).click();
  const head = page.getByRole('dialog').getByRole('heading', { name: sd['sd.usage'], exact: true });
  await expect(head).toBeVisible();
  const section = head.locator('xpath=ancestor::section[1]');
  for (const reading of ['CPU 37%', 'Memory 61%', 'Disk 48%']) await expect(section.getByText(reading, { exact: true })).toBeVisible();
  if (px) await section.evaluate((el, w) => el.style.setProperty('width', `${w}px`, 'important'), px);
  return section;
}

for (const theme of ['light', 'dark'] as const) {
  for (const [w, h] of [[820, 800], [900, 800], [1024, 800], [1440, 900], [390, 844]] as const) {
    test(`@usage the computer's Usage tiles fit at ${w} (${theme}, list widest)`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const sec = await computerUsage(page, theme, true);
      await shot(page, sec, `computer-${w}-${theme}`);
      const o = await overflow(sec);
      expect(o.scrolls, o.what).toBe(false);
      expect(o.past, o.what).toBeLessThanOrEqual(1);
    });
    test(`@usage the server panel's Usage rows fit at ${w} (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const sec = await serverUsage(page, theme);
      await shot(page, sec, `server-${w}-${theme}`);
      const o = await overflow(sec);
      expect(o.scrolls, o.what).toBe(false);
      expect(o.past, o.what).toBeLessThanOrEqual(1);
    });
  }

  test(`@usage the server panel's Usage rows fit a 200 px panel (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const sec = await serverUsage(page, theme, 200);
    await shot(page, sec, `server-200-${theme}`);
    const o = await overflow(sec);
    expect(o.scrolls, o.what).toBe(false);
    expect(o.past, o.what).toBeLessThanOrEqual(1);
  });

  test(`@usage the computer's Usage tiles fit a 200 px panel (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const sec = await computerUsage(page, theme, false, 200);
    await shot(page, sec, `computer-200-${theme}`);
    // The tiles: the box that holds all three meters (the section's facts above them are not what this squeeze is about).
    const o = await overflow(sec, sec.locator("xpath=.//*[@role='meter'][1]/ancestor::div[count(.//*[@role='meter']) >= 3][1]"));
    expect(o.scrolls, o.what).toBe(false);
    expect(o.past, o.what).toBeLessThanOrEqual(1);
  });

  test(`@usage the Connect SSH section fits a 200 px panel (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHub(page, '/computers?sel=atlas.00a1&tab=connect', { theme });
    // The SSH section is a kit section: found by its id, its facts and folds inside.
    await page.addStyleTag({ content: 'section#connect-ssh { width: 200px !important; max-width: 200px !important; }' });
    const sec = page.locator('section#connect-ssh');
    await expect(sec.locator('dd').first()).toBeVisible(); // reason: the key fact shows the section is drawn
    await shot(page, sec, `connect-200-${theme}`);
    const o = await overflow(sec);
    expect(o.scrolls, o.what).toBe(false);
    expect(o.past, o.what).toBeLessThanOrEqual(1);
  });
}
