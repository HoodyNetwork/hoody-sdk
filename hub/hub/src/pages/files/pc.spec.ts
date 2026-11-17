// Playwright: "Use from your PC" in a real browser. The commands show the computer id masked, axe finds
// nothing, and at phone width the commands wrap with their Copy buttons reachable (no page scroll sideways). Copy,
// Copy all and a Share Copy (on its own way, way=share) work from the keyboard and put the whole computer id on the
// clipboard. What else the PC needs shows without a click.
import AxeBuilder from '@axe-core/playwright';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import ps from './pc/pc.strings.en.json';

const PC = '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&tab=pc';
/** atlas's whole id (core/world.ts); the page shows it masked, c0a7…00a1 (a spec runs in node, so it cannot import the world). */
const ID = 'c0a7150000000000000000a1';
async function axeClean(page: Page) {
  const r = await new AxeBuilder({ page }).include('#hub-main').analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.html.slice(0, 160)}`).join(' | ')}`)).toEqual([]);
}

test('use from your PC: mount and share commands, the id masked; axe finds nothing', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoHub(page, PC);
  const mount = page.getByRole('figure', { name: 'Commands that put atlas\'s files on your PC' });
  await expect(mount).toBeVisible({ timeout: 30_000 });
  await expect(mount.getByRole('listitem').filter({ hasText: new RegExp(`^${ps['mount.whole']}`) }).locator('code')).toHaveText('hoody mount c0a7…00a1 ~/hoody/atlas');
  await expect(page.getByRole('tab', { name: ps['tab.pc'] })).toHaveAttribute('aria-selected', 'true');
  await axeClean(page);
  // the folded parts read clean too, and the id stays masked in them
  await expect(page.getByText(ps['need.rclone'])).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${ps['mount.more']}`) }).click();
  await expect(page.getByRole('figure', { name: 'More commands for atlas\'s files on your PC' })).toBeVisible();
  await expect(page.getByRole('region', { name: ps['atGlance.title'] })).toContainText('c0a7…00a1');
  expect(await page.locator('#hub-main').innerText()).not.toContain(ID);
  await axeClean(page);
});

test('use from your PC at phone width: commands wrap, Copy stays reachable, no sideways scroll', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, PC);
  const mount = page.getByRole('figure', { name: 'Commands that put atlas\'s files on your PC' });
  await expect(mount).toBeVisible({ timeout: 30_000 });
  const copy = mount.getByRole('button', { name: new RegExp(`Copy.*${ps['mount.whole']}`) });
  await copy.scrollIntoViewIfNeeded();
  await expect(copy).toBeInViewport();
  await noSideScroll(page);
});

test.describe('Copy from the keyboard', () => {
  test.use({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });

  /** Focus a Copy button, press Enter, and read the clipboard back (bounded: a copy that never lands fails here, not at the test timeout). */
  async function copyWithEnter(page: Page, button: Locator): Promise<string> {
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await button.scrollIntoViewIfNeeded();
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5_000 }).not.toBe('');
    return page.evaluate(() => navigator.clipboard.readText());
  }

  test('Copy, Copy all and a lower Share Copy put the whole id on the clipboard; the page never shows it', async ({ page }) => {
    test.setTimeout(120_000);
    await gotoHub(page, PC);
    const mount = page.getByRole('figure', { name: 'Commands that put atlas\'s files on your PC' });
    await expect(mount).toBeVisible({ timeout: 30_000 });

    expect(await copyWithEnter(page, mount.getByRole('button', { name: new RegExp(`Copy.*${ps['mount.whole']}`) }))).toBe(`hoody mount ${ID} ~/hoody/atlas`);
    const all = await copyWithEnter(page, mount.getByRole('button', { name: 'Copy all' }));
    expect(all.split('\n')[0]).toContain(`hoody mount ${ID}`);
    expect(all.split('\n').filter((l) => l.includes(ID)).length).toBeGreaterThan(1);
    // a PC folder into the computer is its own way
    await gotoHub(page, `${PC}&way=share`);
    const share = page.getByRole('figure', { name: 'Commands that put a PC folder into atlas' });
    await expect(share).toBeVisible({ timeout: 30_000 });
    expect(await copyWithEnter(page, share.getByRole('button', { name: new RegExp(`Copy.*${ps['share.readOnly']}`) }))).toBe(`hoody -c ${ID} share ~/docs --read-only`);
    expect(await page.locator('#hub-main').innerText()).not.toContain(ID);
  });
});
