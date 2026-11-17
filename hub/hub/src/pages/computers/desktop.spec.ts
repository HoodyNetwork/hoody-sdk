// Playwright: the Desktop tab in a real browser. The desktop's own address is answered here by a stand-in page with a
// text box (the fixture world has no proxy), so the frame really loads: the tab is reached by keyboard, the skeleton
// gives way on load, typing goes into the desktop while it has focus, and Leave desktop gives the keys back to the Hub.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const DESKTOP = '<!doctype html><title>stand-in desktop</title><input aria-label="desktop box" autofocus>';

test('@desktop the Desktop tab frames the desktop, keys go to it, and Leave desktop gives them back', async ({ page }) => {
  await page.route(/-desktop-\d+\./, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: DESKTOP }));
  await gotoHub(page, '/computers?sel=atlas.00a1&tab=ports');
  const ports = page.getByRole('tab', { name: strings['tab.ports'] });
  await ports.focus();
  await page.keyboard.press('ArrowRight');
  const tab = page.getByRole('tab', { name: strings['tab.desktop'] });
  await expect(tab).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tab).toHaveAttribute('aria-selected', 'true');

  const frame = page.getByTitle('atlas, desktop 1');
  await expect(frame).toHaveAttribute('src', /^https:\/\/[0-9a-f]+-c0a7150000000000000000a1-desktop-1\.[^?#/]+$/);
  await expect(page.locator('[data-desktop]')).toHaveAttribute('data-desktop', 'loaded', { timeout: 30_000 });
  await expect(frame).toBeVisible();

  // While the desktop has focus the keys are its own: the page's Stop shortcut (x) is typed into the desktop.
  const stop = page.getByRole('alertdialog', { name: 'Stop atlas?' });
  const box = page.frameLocator('iframe[title="atlas, desktop 1"]').getByLabel('desktop box');
  await box.click();
  await page.keyboard.type('hellox');
  await expect(box).toHaveValue('hellox');
  await expect(stop).toHaveCount(0);

  // Esc is not promised: a cross-origin frame keeps it. Leave desktop (pointer) gives the keys back: x is the Hub's
  // Stop shortcut again.
  await page.getByRole('button', { name: strings['desktop.leave'] }).click();
  expect(await page.evaluate(() => document.activeElement?.tagName !== 'IFRAME')).toBe(true);
  await page.keyboard.press('x');
  await expect(stop).toBeVisible();
  await stop.getByRole('button', { name: 'Cancel' }).click();
  await expect(stop).toHaveCount(0);
  await expect(box).toHaveValue('hellox');

  // Shift+Tab out of the frame reaches the Hub too (the stand-in keeps no keys; a real viewer may hold Shift+Tab, so
  // only Leave desktop is written on the page).
  await box.click();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement !== null && document.activeElement.tagName !== 'IFRAME' && document.activeElement !== document.body)).toBe(true);
  await page.keyboard.press('x');
  await expect(stop).toBeVisible();
  await stop.getByRole('button', { name: 'Cancel' }).click();
  await expect(box).toHaveValue('hellox');
});

// The desktop address redirects to its display, another origin, where the viewer runs: the frame's features must reach
// that page too (a bare allow entry would grant them only to the desktop address, the frame's src).
const VIEWER = `<!doctype html><title>stand-in viewer</title><input aria-label="viewer box"><script>
  const p = document.featurePolicy;
  document.querySelector('input').value = ['clipboard-read', 'clipboard-write', 'fullscreen', 'keyboard-map']
    .map((f) => f + '=' + (p ? p.allowsFeature(f) : 'unknown')).join(' ');
</script>`;

test('@desktop the viewer the desktop address redirects to gets the frame’s features', async ({ page }) => {
  // The platform answers the desktop address with a 302; Playwright does not route a fulfilled redirect's target, so the
  // stand-in moves the frame there itself: for the frame's policy it is the same (a page on an origin other than src).
  await page.route(/-desktop-\d+\./, (r) => {
    const to = r.request().url().replace(/-desktop-(\d+)\./, (_, n: string) => `-display-${1600 + Number(n)}.`);
    return r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><script>location.replace(${JSON.stringify(to)})</script>` });
  });
  await page.route(/-display-\d+\./, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: VIEWER }));
  await gotoHub(page, '/computers?sel=atlas.00a1&tab=desktop');
  await expect(page.locator('[data-desktop]')).toHaveAttribute('data-desktop', 'loaded', { timeout: 30_000 });
  const box = page.frameLocator('iframe[title="atlas, desktop 1"]').getByLabel('viewer box');
  await expect(box).toHaveValue('clipboard-read=true clipboard-write=true fullscreen=true keyboard-map=true');
});
