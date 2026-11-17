// Playwright: a Dialog's header (title, close x) and footer (buttons) stay in view while only the body scrolls, and a
// short confirm is no taller than before. The scroll box is
// found by what it does (overflow, and content taller than the box), so this spec also runs, and fails, on the old
// markup where the whole form scrolled. Structure and keyboard reach are in Dialog.scroll.test.tsx.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const DIALOG = '[role="dialog"], [role="alertdialog"]';
const FILES = '/files?a=atlas.00a1&ap=%2Fhome%2Fada';

const rectOf = (el: Locator) =>
  el.evaluate((n) => {
    const r = n.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  });

/** The dialog's parts, found by role rather than by class: the x's parent is the header, the cancel's parent the footer. */
function parts(dlg: Locator) {
  const x = dlg.locator('[data-dialog-close]');
  const head = x.locator('xpath=..');
  return { x, head, form: head.locator('xpath=..'), foot: dlg.locator('[data-dialog-cancel]').locator('xpath=..'), heading: dlg.locator('h2, [slot="title"]').first(), cancel: dlg.locator('[data-dialog-cancel]') };
}

/** The element that scrolls the body: `[data-dialog-scroll]`, else the one that scrolls (the whole form, in the old markup). */
async function scrollBox(dlg: Locator): Promise<Locator> {
  await dlg.evaluate((root) => {
    root.querySelectorAll('[data-spec-box]').forEach((n) => n.removeAttribute('data-spec-box'));
    const all = [root, ...Array.from(root.querySelectorAll('*'))];
    const box = root.querySelector('[data-dialog-scroll]') ?? all.find((n) => /auto|scroll/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1) ?? root;
    box.setAttribute('data-spec-box', '');
  });
  return dlg.locator('[data-spec-box]');
}

/** The page's --pop-sep, as the colour the browser computes for it. */
const popSep = (page: Page) =>
  page.evaluate(() => {
    const d = document.createElement('div');
    d.style.cssText = 'border-top: 1px solid var(--pop-sep); position: fixed';
    document.body.append(d);
    const c = getComputedStyle(d).borderTopColor;
    d.remove();
    return c;
  });

/** The Mount dialog at its tallest (Linux, with davfs2 open; it is short otherwise), on a
 *  viewport low enough that its body scrolls at every width. */
async function openMount(page: Page): Promise<Locator> {
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 640 });
  await gotoHub(page, FILES);
  await page.getByRole('region', { name: 'Left pane' }).getByRole('button', { name: /^Mount( on your device)?$/ }).click();
  const dlg = page.getByRole('dialog', { name: /^Mount .+ on your device$/ });
  await dlg.waitFor();
  // the system picker is full width: segments where the labels fit whole (1440), a Select of the same systems at 390
  const asSelect = dlg.getByRole('button', { name: / Your device$/ });
  if (page.viewportSize()!.width <= 390) {
    await expect(asSelect, 'the system picker is a Select at 390').toBeVisible();
    await asSelect.click();
    await page.getByRole('option', { name: 'Linux' }).click();
    await expect(dlg.getByRole('button', { name: 'Linux Your device' })).toBeVisible();
  } else {
    await dlg.getByText('Linux', { exact: true }).click();
    await expect(dlg.getByRole('radio', { name: 'Linux' })).toBeChecked();
  }
  await dlg.getByRole('button', { name: /^Without a desktop/ }).click();
  await dlg.getByRole('figure', { name: 'Mount with davfs2' }).waitFor();
  // Opening davfs2 may scroll it into view: the checks start from the top.
  await dlg.evaluate((d) => { for (const n of d.querySelectorAll<HTMLElement>('*')) if (n.scrollTop > 0) n.scrollTop = 0; });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return dlg;
}

async function openSample(page: Page, open: 'confirm' | 'danger-plain'): Promise<Locator> {
  await gotoHub(page, `/_kit?tab=overlays&open=${open}`);
  const dlg = page.locator(DIALOG).first();
  await dlg.waitFor();
  return dlg;
}

for (const view of [
  { name: '1440', use: { viewport: { width: 1440, height: 900 } }, end: 24, gap: 24 },
  { name: '390', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, end: 16, gap: 16 },
]) {
  test.describe(`dialog scroll box at ${view.name}`, () => {
    test.use(view.use);

    test('Mount: the header and the footer keep their place while the body scrolls under them', async ({ page }) => {
      const dlg = await openMount(page);
      const p = parts(dlg);
      const box = await scrollBox(dlg);
      // MO-1: the body overflows here, so there is something to scroll.
      expect(await box.evaluate((n) => n.scrollHeight > n.clientHeight + 1), 'MO-1 the dialog has a body that scrolls').toBe(true);
      // MO-2: at the top there is no hairline under the header.
      expect(await p.head.getAttribute('data-scrolled'), 'MO-2 no data-scrolled at the top').toBeNull();
      const line0 = await p.head.evaluate((n) => ({ w: getComputedStyle(n).borderBottomWidth, c: getComputedStyle(n).borderBottomColor }));
      expect(line0.w === '0px' || line0.c === 'rgba(0, 0, 0, 0)', 'MO-2 no visible bottom rule at the top').toBe(true);
      const before = { x: await rectOf(p.x), h: await rectOf(p.heading), c: await rectOf(p.cancel) };
      await box.evaluate((n) => { n.scrollTop = n.scrollHeight; });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      // MO-3: scrolled to the end, the x, the title and Cancel have not moved and are fully in view.
      const after = { x: await rectOf(p.x), h: await rectOf(p.heading), c: await rectOf(p.cancel) };
      const frame = await rectOf(dlg);
      const vp = page.viewportSize()!;
      for (const k of ['x', 'h', 'c'] as const) {
        for (const side of ['top', 'bottom', 'left', 'right'] as const) {
          expect(Math.abs(after[k][side] - before[k][side]), `MO-3 ${k} ${side} moved`).toBeLessThanOrEqual(0.5);
        }
        expect(after[k].top, `MO-3 ${k} inside the frame (top)`).toBeGreaterThanOrEqual(frame.top - 0.5);
        expect(after[k].bottom, `MO-3 ${k} inside the frame (bottom)`).toBeLessThanOrEqual(frame.bottom + 0.5);
        expect(after[k].top, `MO-3 ${k} inside the viewport`).toBeGreaterThanOrEqual(0);
        expect(after[k].bottom, `MO-3 ${k} inside the viewport`).toBeLessThanOrEqual(vp.height);
      }
      // MO-4: the body runs up to the footer bar.
      const foot = await rectOf(p.foot);
      expect(Math.abs((await rectOf(box)).bottom - foot.top), 'MO-4 the scroll box meets the footer').toBeLessThanOrEqual(0.5);
      // MO-5: the hairline shows, in the popover separator colour.
      expect(await p.head.getAttribute('data-scrolled'), 'MO-5 data-scrolled once scrolled').not.toBeNull();
      expect(await p.head.evaluate((n) => getComputedStyle(n).borderBottomColor), 'MO-5 hairline colour').toBe(await popSep(page));
      // MO-6: the last row ends above the footer by the end padding.
      const last = await box.evaluate((n) => n.lastElementChild!.getBoundingClientRect().bottom);
      expect(Math.abs(foot.top - last - view.end), 'MO-6 end padding above the footer').toBeLessThanOrEqual(1);
      // MO-7: back at the top the hairline is gone again.
      await box.evaluate((n) => { n.scrollTop = 0; });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      expect(await p.head.getAttribute('data-scrolled'), 'MO-7 no data-scrolled back at the top').toBeNull();
    });

    for (const open of ['confirm', 'danger-plain'] as const) {
      test(`${open}: a short confirm keeps today's spaces and does not stretch`, async ({ page }) => {
        const dlg = await openSample(page, open);
        const p = parts(dlg);
        const body = dlg.locator(`[id="${await dlg.getAttribute('aria-describedby')}"]`);
        const head = await p.head.evaluate((n) => ({ r: n.getBoundingClientRect().bottom, b: parseFloat(getComputedStyle(n).borderBottomWidth) }));
        const heading = await rectOf(p.heading);
        const b = await body.evaluate((n) => {
          const r = n.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left + parseFloat(getComputedStyle(n).paddingLeft) };
        });
        const foot = await rectOf(p.foot);
        expect(Math.abs(head.r - head.b - heading.bottom), 'CO-1 the x adds nothing under the title').toBeLessThanOrEqual(0.5);
        expect(Math.abs(b.top - heading.bottom - 8), 'CO-2 body 8 under the title').toBeLessThanOrEqual(0.5);
        expect(Math.abs(b.left - heading.left), 'CO-3 body starts where the title starts').toBeLessThanOrEqual(0.5);
        expect(Math.abs(foot.top - b.bottom - view.gap), 'CO-4 footer after the body').toBeLessThanOrEqual(0.5);
        const box = await scrollBox(dlg);
        expect(await box.evaluate((n) => Math.abs(n.scrollHeight - n.clientHeight)), 'CO-5 nothing to scroll').toBeLessThanOrEqual(1);
      });
    }
  });
}
