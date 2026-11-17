// Playwright: a reopened chat shows the pictures its message was sent with (fixtures: the chat `s-pictures`, whose one message
// carried three). The agent's record names them; the picture it still has is read back and drawn as a thumbnail that opens
// larger, the one it no longer has and the one it cannot serve are named tiles that say so, and none of the record's
// "[Image: name]" lines shows as text. The same after a reload of the page, at 1440 and on a phone, with no sideways scroll.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import sv from '@kit/agent/SessionView.strings.en.json';
import kit from '@kit/agent/Conversation.strings.en.json';
import { chatLink } from './links';

const CHAT = chatLink({ computer: 'atlas.00a1', realm: 'f1f1f1f1f1f1f1f1f1f1f1f1', sid: 's-pictures' });
const ASK = 'Make the checkout banner look like this draft, not like the old one.';

test.setTimeout(120_000);

async function shown(page: Page): Promise<void> {
  await expect(page.getByText(ASK, { exact: true })).toBeVisible({ timeout: 30_000 });
  const list = page.getByRole('list', { name: sv['sv.attSent'], exact: true });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  // The picture the agent still has: a thumbnail drawn from the bytes it served (a blob address, the picture's own size).
  const thumb = list.getByRole('listitem').filter({ hasText: 'banner-draft.png' }).locator('img');
  await expect(thumb).toHaveCount(1);
  await expect.poll(() => thumb.evaluate((el) => [(el as HTMLImageElement).currentSrc.slice(0, 5), (el as HTMLImageElement).naturalWidth, (el as HTMLImageElement).naturalHeight])).toEqual(['blob:', 96, 64]);
  // The one it no longer has and the one it cannot serve: their names, what happened, and no thumbnail.
  const gone = list.getByRole('listitem').filter({ hasText: 'old-banner.png' });
  await expect(gone).toContainText(sv['sv.pic.gone']);
  await expect(gone.locator('img')).toHaveCount(0);
  const none = list.getByRole('listitem').filter({ hasText: 'logo.bmp' });
  await expect(none).toContainText(sv['sv.pic.none']);
  await expect(none.locator('img')).toHaveCount(0);
  await expect(page.getByText('[Image:', { exact: false })).toHaveCount(0);
}

for (const [name, width, height] of [['desktop', 1440, 900], ['phone', 390, 844]] as const) {
  test(`${name}: the message's pictures are back after the chat is opened again, and after a reload`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await gotoHub(page, CHAT);
    await shown(page);
    await noSideScroll(page);
    await page.reload();
    await page.locator('#hub-main').waitFor();
    await shown(page);
    await noSideScroll(page);
  });
}

test('the thumbnail opens the picture larger, as an image and nothing else, and closes again', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, CHAT);
  await shown(page);
  const list = page.getByRole('list', { name: sv['sv.attSent'], exact: true });
  await list.getByRole('button', { name: kit['agent.attOpen'].replace('{{name}}', 'banner-draft.png'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('img')).toHaveCount(1);
  expect(await dialog.locator('img').getAttribute('src')).toMatch(/^blob:/);
  await expect(dialog.locator('script, iframe, object, embed')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
