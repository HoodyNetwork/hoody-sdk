// Playwright (installable): the manifest index.html names is served with its type
// and parses, every icon it lists loads as a PNG of its stated size, and Chromium finds nothing that stops the Hub
// installing (CDP Page.getInstallabilityErrors, the DevTools manifest check).
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

test('@install the manifest loads, its icons load, and Chromium reports the Hub installable', async ({ page }) => {
  await gotoHub(page, '/home');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/auth/pwa/manifest.webmanifest');
  const res = await page.request.get(new URL(href!, page.url()).href);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/manifest+json');
  const manifest = (await res.json()) as { icons: { src: string; sizes: string }[] };
  expect(manifest.icons.length).toBe(4);
  for (const icon of manifest.icons) {
    const size = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return `${img.naturalWidth}x${img.naturalHeight}`;
    }, icon.src);
    expect(size, icon.src).toBe(icon.sizes);
  }
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: { errorId: string }[] };
  expect(installabilityErrors.map((e) => e.errorId)).toEqual([]);
});
