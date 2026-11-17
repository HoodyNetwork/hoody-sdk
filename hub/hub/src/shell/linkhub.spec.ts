// Playwright: the Hub link the reader rebuilds keeps the page and the keys that select
// (`sel`, `b`, `computer`, `realm`). Arriving on one, on the pages that read those keys, switches no realm, opens no dialog and
// writes nothing. The two controls show the keys the reader drops do act, so the checks can see it when one gets through.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import { readLink } from '../core/linkRead';

const LAB = 'f3f3f3f3f3f3f3f3f3f3f3f3';
const REALM_NAME = 'Lab';
const SWITCHER = 'header [data-hub-switch="realm"]';
const HUB = 'https://hub.test';
/** How long a link's effect gets to show before its absence counts; a switch or drawer takes far less in fixtures. */
const SETTLE_MS = 1200;

const rebuilt = (path: string): string => {
  const hostile = `${HUB}/auth/home#${path}?open_realm=${LAB}&share=1&do=delete&add=x&connect=ssh&new=1&edit=1&drawer=1&computer=atlas&realm=${LAB}&sel=item-02&b=other`;
  const href = readLink(hostile, { proxy: '', origin: HUB })?.href ?? '';
  return href.slice(href.indexOf('#') + 1);
};

function watchWrites(page: Page): string[] {
  const writes: string[] = [];
  page.on('request', (r) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method())) writes.push(`${r.method()} ${r.url()}`);
  });
  return writes;
}

test('the reader leaves only the page and the selecting keys', () => {
  expect(rebuilt('/board')).toBe(`/board?computer=atlas&realm=${LAB}&sel=item-02&b=other`);
});

for (const path of ['/ai/c/s1', '/ai/skills', '/board', '/computers', '/files', '/keys/shared', '/logs']) {
  test(`arriving on ${path} by a rebuilt link switches no realm, opens nothing and writes nothing`, async ({ page }) => {
    const writes = watchWrites(page);
    await gotoHub(page, rebuilt(path));
    await page.waitForTimeout(SETTLE_MS);
    await expect(page.locator(SWITCHER)).not.toContainText(REALM_NAME);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}

test('control: the key the reader drops does switch the realm', async ({ page }) => {
  await gotoHub(page, `/computers?open_realm=${LAB}`);
  await expect(page.locator(SWITCHER)).toContainText(REALM_NAME);
});

test('control: the key the reader drops does open a drawer', async ({ page }) => {
  await gotoHub(page, '/keys/shared?share=1');
  await expect(page.getByRole('dialog')).toBeVisible();
});
