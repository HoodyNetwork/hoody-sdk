// Playwright: the display tile's Options drawer as the SDK catalogue shapes it, on the program
// view's standalone tile (fixtures). Desktop size is width only (the catalogue refuses override_height); Look holds the
// viewer's colour scheme, theme and font; Fine-tune holds Image quality and Fixed quality; recording and the retry /
// give-up knobs are never offered (embed/options.ts BOARD_REFUSED). Wide drawer and phone sheet.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

async function openOptions(page: Page): Promise<Locator> {
  await gotoHub(page, '/board/open/atlas.00a1/display-1');
  await expect(page.getByRole('group', { name: /^display-1 · atlas/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Tile menu' }).click();
  await page.getByRole('menuitem', { name: 'Options…' }).click();
  const drawer = page.getByRole('dialog', { name: 'Options for display-1' });
  await expect(drawer).toBeVisible();
  return drawer;
}

const section = (d: Locator, name: string) => d.getByRole('button', { name: new RegExp('^' + name) });
async function expand(d: Locator, name: string): Promise<void> {
  const s = section(d, name);
  if ((await s.getAttribute('aria-expanded')) !== 'true') await s.click();
  await expect(s).toHaveAttribute('aria-expanded', 'true');
}

/** Every element of the drawer body stays inside the drawer horizontally (no clipped or overflowing control). */
async function contained(d: Locator): Promise<void> {
  const out = await d.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return [...el.querySelectorAll<HTMLElement>('[data-opt] input, [data-opt] button, [data-opt] [role="radiogroup"]')]
      .filter((n) => n.getBoundingClientRect().width > 0)
      .filter((n) => { const r = n.getBoundingClientRect(); return r.left < box.left - 0.5 || r.right > box.right + 0.5; })
      .map((n) => n.closest('[data-opt]')?.getAttribute('data-opt'));
  });
  expect(out).toEqual([]);
}

for (const width of [1440, 390]) {
  test(`display options: width-only size, Look, Fine-tune and no recording or retry rows (${width} px)`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const d = await openOptions(page);

    await expand(d, 'Desktop');
    await d.getByRole('radio', { name: 'Fixed' }).click();
    await expect(d.getByRole('textbox', { name: 'Width' })).toBeVisible();
    await expect(d.getByRole('textbox', { name: 'Height' })).toHaveCount(0);

    await expand(d, 'Look');
    await expect(d.locator('[data-opt="colorScheme"]')).toContainText('Colour scheme');
    await expect(d.locator('[data-opt="theme"]')).toBeVisible();
    await expect(d.getByRole('textbox', { name: 'Font' })).toBeVisible();
    await contained(d);
    await page.screenshot({ path: info.outputPath(`display-look-${width}.png`) });

    await expand(d, 'Quality');
    await d.getByText('Choose the settings yourself.').click(); // the Custom card (its radio input is visually hidden)
    await expect(d.getByRole('radio', { name: /Custom/ })).toBeChecked();
    await expect(d.getByRole('textbox', { name: 'Fixed quality' })).toBeVisible();
    await expect(d.locator('[data-opt="quality_mode"]')).toBeVisible();
    await contained(d);
    await page.screenshot({ path: info.outputPath(`display-finetune-${width}.png`) });

    await expand(d, 'Input');
    await expect(d.getByRole('textbox', { name: 'Mouse wheel speed' })).toBeVisible();
    await expect(d.getByRole('textbox', { name: 'Touchpad scroll speed' })).toBeVisible();

    await expand(d, 'Advanced');
    await expect(d.getByRole('radiogroup', { name: "Watch this device's clipboard" })).toBeVisible();
    await contained(d);

    for (const id of ['record', 'record_codec', 'record_format', 'record_fps', 'reconnect_count', 'slow_retry_delay', 'slow_retry_max_ms', 'soft_giveup_attempts', 'soft_giveup_ms', 'override_height', 'web_notifications', 'notification_connection_type']) {
      await expect(d.locator(`[data-opt="${id}"]`), id).toHaveCount(0);
    }
  });
}
