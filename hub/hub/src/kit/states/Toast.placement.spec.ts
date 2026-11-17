// Playwright: toasts sit bottom-right on desktop, full width above the bottom bar on
// a phone, and never over the Agent dock's composer or an open drawer's or dialog's buttons, whether the toast or the
// overlay came first. Real layout needs a real browser; toastPlacement's arithmetic is unit-tested in
// Toast.placement.test.tsx.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import type * as ToastModule from './Toast';
import shellStrings from '../../shell/strings.en.json';

type R = { left: number; top: number; right: number; bottom: number };

// reason: fire() finds the app's Toast module among the page's resource entries; the default buffer (250) is smaller
// than the dev server's module graph, so it is raised before any page script runs.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => performance.setResourceTimingBufferSize(100_000));
});

/** Fires an error toast with an action in the page's own Toaster (the module instance the mounted app uses). */
const fire = (page: Page) =>
  page.evaluate(async () => {
    // After a hot update the dev server serves Toast.tsx as Toast.tsx?t=<time>, and importing the bare path would make
    // a second module whose toasts no mounted Toaster shows. The page's resource entries list every
    // Toast URL this document fetched, newest last, but an update inside the open document leaves the older ones
    // listed too. So try them newest first and keep the one whose toast the mounted Toaster draws.
    const urls = [
      ...new Set(
        performance
          .getEntriesByType('resource')
          .filter((e) => new URL(e.name).pathname === '/src/kit/states/Toast.tsx')
          .sort((a, b) => b.startTime - a.startTime)
          .map((e) => e.name),
      ),
    ];
    const shown = () => document.querySelectorAll('[data-hub-toasts] [role=alertdialog]').length;
    for (const url of urls) {
      const before = shown();
      const m = (await import(/* @vite-ignore */ url)) as typeof ToastModule;
      m.showToast({
        tone: 'error',
        title: 'Couldn’t restart web, the computer didn’t answer',
        body: 'Try again in a moment.',
        action: { label: 'Try again', onAction: () => false },
      });
      for (const end = performance.now() + 2000; performance.now() < end; ) {
        if (shown() > before) return;
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    throw new Error(`no loaded Toast module drew the toast; tried ${JSON.stringify(urls)}`);
  });

const rects = (page: Page, sel: string) =>
  page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)]
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
        })),
    sel,
  );
const toastBoxes = (page: Page) => rects(page, '[data-hub-toasts] [role=alertdialog]');
const overlaps = (a: R, b: R) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
/** The pairs of toast and control that overlap (empty when every control is clear). */
const covered = async (page: Page, controls: string) => {
  const ts = await toastBoxes(page);
  const cs = await rects(page, controls);
  return ts.length === 0 ? ['no toast'] : cs.flatMap((c) => ts.filter((t) => overlaps(t, c)).map(() => `${Math.round(c.left)},${Math.round(c.top)}`));
};

const DOCK_CONTROLS = '[data-hub-dock] textarea, [data-hub-dock] button';
const DIALOG_BUTTONS = '[role=dialog] button, [role=alertdialog]:not([data-hub-toasts] *) button';

/** The top bar's AI (dock) button, not a page control of that name. */
// The fixture world has a chat waiting, so the name may carry the AI dot's words after it ("AI, waiting for you").
const agentButton = (page: Page) => page.getByRole('button', { name: new RegExp(`^${shellStrings['top.ask']}(?:,|$)`) }).and(page.locator('button:not(#hub-main button)'));

async function openDock(page: Page) {
  await agentButton(page).click();
  await expect(page.locator('[data-hub-dock] textarea')).toBeVisible();
}
/** Phones have no general dock button (the bottom bar's AI tab is a page): the dock's own key opens it. */
async function openDockByKeys(page: Page) {
  await page.keyboard.press('ControlOrMeta+J');
  await expect(page.locator('[data-hub-dock] textarea')).toBeVisible();
}
async function openDrawer(page: Page) {
  await page.getByRole('button', { name: 'Create drawer', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancel' })).toBeVisible();
}

test.describe('desktop 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('with nothing open the toast sits bottom-right, 16 px from both edges', async ({ page }) => {
    await gotoHub(page, '/home');
    await fire(page);
    await expect.poll(async () => (await toastBoxes(page)).map((t) => [Math.round(1440 - t.right), Math.round(900 - t.bottom)])).toEqual([[16, 16]]);
  });

  test('with the Agent dock open the toast moves beside the dock and leaves its composer clear', async ({ page }) => {
    await gotoHub(page, '/home');
    await openDock(page);
    await fire(page);
    const [dock] = await rects(page, '[data-hub-dock]');
    await expect.poll(async () => (await toastBoxes(page)).every((t) => t.right <= dock!.left - 16 + 0.5)).toBe(true);
    expect(await covered(page, DOCK_CONTROLS)).toEqual([]);
  });

  test('a toast already shown moves aside when the dock opens after it', async ({ page }) => {
    await gotoHub(page, '/home');
    await fire(page);
    await openDock(page);
    await expect.poll(() => covered(page, DOCK_CONTROLS)).toEqual([]);
  });

  test('with a drawer open the toast rises above its footer buttons', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=overlays');
    await openDrawer(page);
    await fire(page);
    await expect.poll(() => covered(page, DIALOG_BUTTONS)).toEqual([]);
  });

  test('a control scrolled under a toast (no page change, only a scroll) lifts the toast clear of it', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=overlays');
    await openDrawer(page);
    // A scroll box in the drawer, low on the screen, its button far below the fold: nothing under the toast yet.
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.dataset.testScroll = '';
      box.style.cssText = 'position:fixed;inset-inline-end:0;inset-block-end:0;width:600px;height:420px;overflow:auto;z-index:1';
      box.innerHTML = '<div style="height:2000px"></div><button type="button" style="display:block;width:100%">Below the fold</button><div style="height:2000px"></div>';
      document.querySelector('[role=dialog]')!.append(box);
    });
    await fire(page);
    await expect.poll(() => covered(page, '[role=dialog] button')).toEqual([]);
    const [t] = await toastBoxes(page);
    // Scroll the box so its button sits right under the toast; no element or attribute changes.
    const moved = await page.evaluate((y) => {
      const box = document.querySelector<HTMLElement>('[data-test-scroll]')!;
      const btn = box.querySelector('button')!;
      box.scrollTop += btn.getBoundingClientRect().top - y;
      const r = btn.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }, t!.top + 8);
    // The scroll really put the button where the toast was (else the check below proves nothing).
    expect(overlaps(moved, t!)).toBe(true);
    await expect.poll(() => covered(page, '[data-test-scroll] button')).toEqual([]);
  });

  test('a toast already shown rises when a drawer opens over it, and settles back once it closes', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=overlays');
    await fire(page);
    await openDrawer(page);
    await expect.poll(() => covered(page, DIALOG_BUTTONS)).toEqual([]);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(async () => (await toastBoxes(page)).map((t) => Math.round(900 - t.bottom))).toEqual([16]);
  });
});

test.describe('phone 390', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test('the toast spans the width (16 px each side) and sits above the bottom bar', async ({ page }) => {
    await gotoHub(page, '/home');
    await fire(page);
    const [nav] = await rects(page, `nav[aria-label="${shellStrings['bottom.label']}"]`);
    expect(nav).toBeTruthy();
    await expect.poll(async () => (await toastBoxes(page)).map((t) => [Math.round(t.left), Math.round(390 - t.right)])).toEqual([[16, 16]]);
    expect((await toastBoxes(page)).every((t) => t.bottom <= nav!.top)).toBe(true);
  });

  test('with the Agent sheet open the toast stays clear of its composer', async ({ page }) => {
    await gotoHub(page, '/home');
    await openDockByKeys(page);
    await fire(page);
    await expect.poll(() => covered(page, '[data-hub-dock] textarea')).toEqual([]);
  });

  test('on touch the toast action and close button are at least --touch-min (44 px on a coarse pointer)', async ({ page }) => {
    await gotoHub(page, '/home');
    await fire(page);
    await expect(page.locator('[data-hub-toasts] [role=alertdialog]')).toHaveCount(1);
    const sizes = await page.evaluate(() => {
      const min = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--touch-min')) || 0;
      const buttons = [...document.querySelectorAll('[data-hub-toasts] [role=alertdialog] button')].map((b) => b.getBoundingClientRect());
      return { coarse: matchMedia('(pointer: coarse)').matches, min, buttons: buttons.map((r) => [Math.round(r.width), Math.round(r.height)] as const) };
    });
    // The phone context is a coarse pointer, where kit/tokens.css sets --touch-min to 44.
    expect(sizes.coarse).toBe(true);
    expect(sizes.min).toBe(44);
    expect(sizes.buttons).toHaveLength(2);
    for (const [w, h] of sizes.buttons) {
      expect(h).toBeGreaterThanOrEqual(sizes.min);
      expect(w).toBeGreaterThanOrEqual(sizes.min);
    }
  });

  test('with a drawer (full-screen sheet) open the toast stays clear of its footer buttons', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=overlays');
    await openDrawer(page);
    await fire(page);
    await expect.poll(() => covered(page, DIALOG_BUTTONS)).toEqual([]);
  });
});

test.describe('right to left 1440', () => {
  // The toast region takes its direction from react-aria's locale (it sets dir itself), the page from <html dir>.
  test.use({ viewport: { width: 1440, height: 900 }, locale: 'ar-EG' });

  test('right to left the toast sits bottom-left and still rises above a drawer’s buttons and keeps clear of the dock', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=overlays');
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    await fire(page);
    await expect.poll(async () => (await toastBoxes(page)).map((t) => Math.round(t.left))).toEqual([16]);
    await openDrawer(page);
    await expect.poll(() => covered(page, DIALOG_BUTTONS)).toEqual([]);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await openDock(page);
    await expect.poll(() => covered(page, DOCK_CONTROLS)).toEqual([]);
  });
});

test.describe('desktop to phone', () => {
  test.use({ viewport: { width: 800, height: 900 } });

  test('a toast at the top edge measures the phone bottom place after the breakpoint, so a scroll never drops it onto a control', async ({ page }) => {
    await gotoHub(page, '/home');
    // A full-screen dialog whose tall button no lift below can clear on desktop: the toasts go to the top edge.
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.setAttribute('role', 'dialog');
      box.dataset.testBreakpoint = '';
      box.style.cssText = 'position:fixed;inset:0;overflow:auto;z-index:1';
      box.innerHTML = '<div style="height:380px"></div><button type="button" style="display:block;width:100%;height:500px">Tall</button><div style="height:2000px"></div>';
      document.body.append(box);
    });
    await fire(page);
    const region = page.locator('[data-hub-toasts]');
    await expect(region).toHaveAttribute('data-at', 'top');
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(region).toHaveAttribute('data-at', 'top');
    await expect.poll(async () => (await toastBoxes(page)).map((t) => Math.round(t.left))).toEqual([16]);
    // Scroll the button's bottom to 8 px above where the toast would sit at the desktop bottom place (16 px): clear of
    // that place, but under the phone's (above the bottom bar). Every frame for the next 600 ms is checked: a toast
    // placed from the stale desktop place lands on the button, even if a later event happens to move it back.
    const seen = await page.evaluate(async () => {
      const region = document.querySelector('[data-hub-toasts]')!;
      const box = document.querySelector<HTMLElement>('[data-test-breakpoint]')!;
      const btn = box.querySelector('button')!;
      const want = 900 - 16 - region.getBoundingClientRect().height - 8;
      box.scrollTop += btn.getBoundingClientRect().bottom - want;
      const bottom = btn.getBoundingClientRect().bottom;
      const over: number[] = [];
      const end = performance.now() + 600;
      while (performance.now() < end) {
        await new Promise(requestAnimationFrame);
        const t = region.getBoundingClientRect();
        if (t.bottom > btn.getBoundingClientRect().top && t.top < btn.getBoundingClientRect().bottom) over.push(Math.round(t.bottom));
      }
      return { want, bottom, over };
    });
    expect(Math.round(seen.bottom)).toBe(Math.round(seen.want));
    expect(seen.over).toEqual([]);
    expect(await covered(page, '[data-test-breakpoint] button')).toEqual([]);
  });
});

test.describe('short phone 390x400', () => {
  test.use({ viewport: { width: 390, height: 400 }, hasTouch: true, isMobile: true });

  test('three toasts over a drawer sheet stay on screen (never lifted off the top)', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=overlays');
    await openDrawer(page);
    await fire(page);
    await fire(page);
    await fire(page);
    await expect.poll(async () => (await toastBoxes(page)).length).toBe(3);
    await expect.poll(async () => (await toastBoxes(page)).every((t) => t.top >= 0 && t.bottom <= 400)).toBe(true);
  });
});
