// Playwright: the kit parts that draw a ghost button of their own (a toast's action and close, CopyButton, the
// calendar's month arrows, a CodeBlock's Copy all, a SearchField's clear), through the gallery's real components, draw
// as the kit's ghost buttons. A mouse at 1440: the kit size (sm 28, md 32, xs 24), the kit ghost under the pointer (a
// button with words darkens its plate inside a full-ink frame; a frameless icon button takes the plate's fill, no line; the
// calendar's arrows too, not the popover's own hover) and the kit focus ring (--focus-ring). A coarse pointer at 1024:
// the kit's touch size (sm and md 44 both ways; xs 24 drawn with its press reaching 44 through ::after). The step
// line's copy cell keeps its own size and tinted fill; an IdChip's copy keeps its 20 in the chip's line, its press
// reaching 44 on a coarse pointer through ::after. Both themes.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

async function open(page: Page, tab: string, theme: 'light' | 'dark') {
  await page.goto('about:blank'); // gotoHub is same-document between Hub pages: start each read from a fresh load
  await gotoHub(page, `/_kit?tab=${tab}`, { theme });
}

const size = (l: Locator) => l.evaluate((b) => { const r = b.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; });
const height = (l: Locator) => l.evaluate((b) => Math.round(b.getBoundingClientRect().height));

/** A token's computed value for one property, read on a probe beside the element (so its theme and scope apply). */
const token = (l: Locator, prop: 'background-color' | 'box-shadow', value: string) =>
  l.evaluate((b, [p, v]) => {
    const probe = document.createElement('span');
    probe.style.setProperty(p, v);
    b.parentElement?.appendChild(probe);
    const got = getComputedStyle(probe).getPropertyValue(p);
    probe.remove();
    return got;
  }, [prop, value] as const);
const style = (l: Locator, prop: string) => l.evaluate((b, p) => getComputedStyle(b).getPropertyValue(p), prop);

/** What a plate paints, read off the screen (the plate is a painted background, so background-color says nothing): its
 *  fill 2 px inside the start line at mid height, and its top line. One screenshot of the plate as the browser snaps it
 *  to whole pixels, decoded in the page. */
async function plate(page: Page, l: Locator): Promise<{ fill: string; line: string }> {
  const r = (await l.boundingBox())!;
  const clip = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.x + r.width) - Math.round(r.x), height: Math.round(r.y + r.height) - Math.round(r.y) };
  const b64 = (await page.screenshot({ clip, animations: 'disabled' })).toString('base64');
  return page.evaluate(
    async ({ src, w, h }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${src}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      // The image may be at the device's pixel ratio: scale each page pixel into it.
      const at = (x: number, y: number) => {
        const [r, g, b] = ctx.getImageData(Math.floor((x * img.naturalWidth) / w), Math.floor((y * img.naturalHeight) / h), 1, 1).data;
        return `rgb(${r}, ${g}, ${b})`;
      };
      return { fill: at(2, h >> 1), line: at(w >> 1, 0) };
    },
    { src: b64, w: clip.width, h: clip.height },
  );
}

/** Hovered with the mouse, it paints the kit ghost's hover: a button with words the darker plate inside the full-ink
 *  frame; a frameless icon button, which paints nothing at rest, the plate's fill inside its edge, and still no frame
 *  line (its edge shows what it showed at rest). */
async function hoverIsKit(page: Page, l: Locator, what: string, kind: 'words' | 'icon') {
  await page.mouse.move(1, 1);
  await expect(l, `${what}: at rest`).not.toHaveAttribute('data-hovered', 'true');
  const rest = await plate(page, l);
  if (kind === 'icon') expect(rest.fill, `${what}: no plate at rest`).toBe(rest.line);
  await l.hover();
  await expect(l, `${what}: under the pointer`).toHaveAttribute('data-hovered', 'true');
  const fill = await token(l, 'background-color', kind === 'words' ? 'var(--hx-btn-plate-hover)' : 'var(--hx-btn-plate)');
  await expect.poll(async () => (await plate(page, l)).fill, { message: `${what}: the kit ghost hover fill` }).toBe(fill);
  const p = await plate(page, l);
  if (kind === 'words') expect(p.line, `${what}: the full-ink frame`).toBe(await token(l, 'background-color', 'var(--hx-btn-line-hover)'));
  else expect(p.line, `${what}: frameless, no line round the fill`).toBe(rest.line);
  await page.mouse.move(1, 1);
}

/** Focused from the keyboard, its ring is the kit's. */
async function ringIsKit(page: Page, l: Locator, what: string) {
  await page.keyboard.press('Tab'); // React Aria counts a Tab (not a lone modifier) as keyboard use
  await l.focus();
  await expect(l, `${what}: focus-visible`).toHaveAttribute('data-focus-visible', 'true');
  const want = await token(l, 'box-shadow', 'var(--focus-ring)');
  await expect.poll(() => style(l, 'box-shadow'), { message: `${what}: the kit focus ring` }).toBe(want);
  await l.blur();
}

/** The points a finger could press around the element's centre line, `out` px past each edge: what is under each. */
const pressOut = (l: Locator, out: number) =>
  l.evaluate((b, o) => {
    b.scrollIntoView({ block: 'center', inline: 'center' }); // every probed point on the screen (elementFromPoint is null off it)
    const r = b.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const pts: Array<[number, number]> = [[r.left - o, cy], [r.right + o, cy], [cx, r.top - o], [cx, r.bottom + o]];
    return pts.map(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit === b || b.contains(hit) ? true : `${hit?.tagName ?? 'nothing'}.${String(hit?.className ?? '').slice(0, 60)}`;
    });
  }, out);

/** A calendar month arrow: React Aria also draws a hidden, untabbable button of the same name for screen readers. */
const arrow = (dialog: Locator, name: string, slot: string) =>
  dialog.getByRole('button', { name, exact: true }).and(dialog.locator(`[slot="${slot}"]`));

/** Its classes are the kit Button's ghost at that size (md has no size class). */
async function kitGhostClasses(l: Locator, sz: 'sm' | 'md', what: string) {
  const cls = (await l.getAttribute('class')) ?? '';
  expect(cls, `${what}: the kit Button`).toMatch(/Button-module__button_/);
  expect(cls, `${what}: the kit ghost`).toMatch(/Button-module__ghost_/);
  if (sz === 'sm') expect(cls, `${what}: the kit sm`).toMatch(/Button-module__sm_/);
  else expect(cls, `${what}: the kit md`).not.toMatch(/Button-module__(sm|xs)_/);
}

const toastButtons = (page: Page) => {
  const first = page.locator('#hub-main [class*="Toast-module__toast"]').filter({ has: page.getByRole('button', { name: 'Dismiss' }) }).first(); // toasts stack; the newest toast with a Dismiss carries the shared action and close parts
  // The action is the toast's last button before the close (an error toast's Details comes before it).
  return { action: first.locator('button:not([slot="close"])').last(), close: first.getByRole('button', { name: 'Dismiss' }) };
};

for (const theme of ['light', 'dark'] as const) {
  test.describe(`a mouse at 1440 (${theme})`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test(`the toast action and close are the kit ghost sm (${theme})`, async ({ page }) => {
      test.setTimeout(150_000);
      await open(page, 'toasts', theme);
      const { action, close } = toastButtons(page);
      await close.waitFor({ timeout: 30_000 });
      await kitGhostClasses(action, 'sm', 'toast action');
      await kitGhostClasses(close, 'sm', 'toast close');
      expect(await height(action), 'action: Button sm').toBe(28);
      expect(await size(close), 'close: IconButton sm').toBe('28x28');
      await hoverIsKit(page, action, 'toast action', 'words');
      await hoverIsKit(page, close, 'toast close', 'icon');
      await ringIsKit(page, close, 'toast close');
    });

    test(`CopyButton and the calendar arrows are the kit ghost sm (${theme})`, async ({ page }) => {
      test.setTimeout(150_000);
      await open(page, 'pieces', theme);
      // The gallery's Copy buttons panel names them by what they copy (address, token).
      const copy = page.locator('#hub-main').getByRole('button', { name: /^(address|token)$/ });
      await copy.first().waitFor({ timeout: 30_000 });
      const sizes = await copy.evaluateAll((bs) => bs.filter((b) => b.getClientRects().length > 0).map((b) => ({ icon: b.className.includes('iconOnly'), md: !/Button-module__sm_/.test(b.className), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) })));
      expect(sizes.length, 'copy buttons read').toBeGreaterThanOrEqual(3);
      for (const b of sizes) {
        expect.soft(b.h, `copy ${JSON.stringify(b)}`).toBe(b.md ? 32 : 28);
        if (b.icon) expect.soft(b.w, `copy ${JSON.stringify(b)}`).toBe(b.md ? 32 : 28);
      }
      const plain = copy.and(page.locator('[class*="Button-module__iconOnly"]')).first();
      await hoverIsKit(page, plain, 'copy icon', 'icon');
      await ringIsKit(page, plain, 'copy icon');

      await page.locator('#hub-main').getByRole('button', { name: 'Pick a date' }).first().click(); // the specimen grid draws a date field per state; any trigger opens the same kit calendar (mouse)
      const dialog = page.getByRole('dialog').last();
      const prev = arrow(dialog, 'Previous', 'previous');
      const next = arrow(dialog, 'Next', 'next');
      await next.waitFor();
      expect(await size(prev)).toBe('28x28');
      expect(await size(next)).toBe('28x28');
      await hoverIsKit(page, next, 'calendar Next (the kit hover, not the popover\'s)', 'icon');
      const heading = dialog.getByRole('heading');
      const before = await heading.textContent();
      await next.click();
      await expect(heading, 'Next pages the month').not.toHaveText(before ?? '');
    });

    test(`a step line's copy cell keeps its own size and tinted fill; Copy all is the kit ghost sm (${theme})`, async ({ page }) => {
      test.setTimeout(150_000);
      await open(page, 'text', theme);
      const all = page.locator('#hub-main').getByRole('button', { name: 'Copy all' }).first(); // each CodeBlock specimen has its own Copy all; one stands for the shared CodeBlock header part
      await all.waitFor({ timeout: 30_000 });
      await kitGhostClasses(all, 'sm', 'Copy all');
      expect(await height(all), 'Copy all: Button sm').toBe(28);
      const cell = page.locator('#hub-main [class*="Ids-module__stepLine"] > button').first();
      const w = await cell.evaluate((b) => Math.round(b.getBoundingClientRect().width));
      expect(w, 'the cell is --codeline-copy-w wide').toBe(36);
      await cell.hover();
      await expect.poll(() => style(cell, 'background-image'), { message: 'hover tints the cell fill' }).toMatch(/gradient/);
      await page.mouse.move(1, 1);
    });

    test(`the SearchField clear is the kit IconButton xs, its press the box it draws (${theme})`, async ({ page }) => {
      test.setTimeout(150_000);
      await open(page, 'controls', theme);
      const box = page.locator('#hub-main').getByRole('searchbox').first(); // the controls grid draws a SearchField per state and size; the first is the default (mouse)
      await box.waitFor({ timeout: 30_000 });
      await box.fill('needle');
      const clear = page.locator('#hub-main').getByRole('button', { name: 'Clear search' }).first(); // only the field typed into shows a clear; the first match is that field's clear (mouse)
      expect(await size(clear)).toBe('24x24');
      expect((await pressOut(clear, 4)).map((x) => x === true), 'no press past the box with a mouse').toEqual([false, false, false, false]);
      await hoverIsKit(page, clear, 'search clear', 'icon');
      await clear.click();
      await expect(box, 'the clear empties the field').toHaveValue('');
    });

    test(`an IdChip's copy is drawn 20 in the chip's line, its press the box it draws (${theme})`, async ({ page }) => {
      test.setTimeout(150_000);
      await open(page, 'data', theme);
      const copy = page.locator('#hub-main dl').getByRole('button', { name: 'Copy full reference', exact: true }); // the facts' reference chip (the chip group below has its own test)
      await copy.waitFor({ timeout: 30_000 });
      expect(await size(copy), 'the chip copy').toBe('20x20');
      expect((await pressOut(copy, 2)).map((x) => x === true), 'no press past the box with a mouse').toEqual([false, false, false, false]);
    });
  });

  test.describe(`a coarse pointer at 1024 (${theme})`, () => {
    test.use({ viewport: { width: 1024, height: 800 }, hasTouch: true, isMobile: true });

    test(`the toast, copy and calendar buttons are at least 44 both ways (${theme})`, async ({ page }) => {
      test.setTimeout(150_000);
      await open(page, 'toasts', theme);
      const { action, close } = toastButtons(page);
      await close.waitFor({ timeout: 30_000 });
      expect(await height(action), 'toast action').toBeGreaterThanOrEqual(44);
      expect(await size(close), 'toast close').toBe('44x44');
      await open(page, 'pieces', theme);
      // The gallery's Copy buttons panel names them by what they copy (address, token).
      const copy = page.locator('#hub-main').getByRole('button', { name: /^(address|token)$/ });
      await copy.first().waitFor({ timeout: 30_000 });
      const small = await copy.evaluateAll((bs) => bs.filter((b) => b.getClientRects().length > 0).map((b) => b.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
      expect(small, 'copy buttons under 44').toBe(0);
      await page.locator('#hub-main').getByRole('button', { name: 'Pick a date' }).first().tap(); // the specimen grid draws a date field per state; any trigger opens the same kit calendar (touch)
      const next = arrow(page.getByRole('dialog').last(), 'Next', 'next');
      await next.waitFor();
      expect(await size(next), 'calendar Next').toBe('44x44');
    });

    test(`the SearchField clear draws 24 and its press reaches 44 (${theme})`, async ({ page }) => {
      test.setTimeout(150_000);
      await open(page, 'controls', theme);
      const box = page.locator('#hub-main').getByRole('searchbox').first(); // the controls grid draws a SearchField per state and size; the first is the default (touch)
      await box.waitFor({ timeout: 30_000 });
      await box.fill('needle');
      const clear = page.locator('#hub-main').getByRole('button', { name: 'Clear search' }).first(); // only the field typed into shows a clear; the first match is that field's clear (touch)
      expect(await size(clear)).toBe('24x24');
      const out = await pressOut(clear, 9);
      expect([out[2], out[3]], 'the press reaches 9 px above and below the drawn 24 (44 tall)').toEqual([true, true]);
      expect(out[0], 'and 9 px before it (44 wide)').toBe(true);
    });

    test(`an IdChip's copy keeps its drawn 20 and its press reaches 44 both ways, no wider (${theme})`, async ({ page }) => {
      test.setTimeout(150_000);
      await open(page, 'data', theme);
      const copy = page.locator('#hub-main dl').getByRole('button', { name: 'Copy full reference', exact: true }); // the facts' reference chip (the chip group below has its own test)
      await copy.waitFor({ timeout: 30_000 });
      expect(await size(copy), 'drawn in the chip line').toBe('20x20');
      expect(await pressOut(copy, 11), 'the press reaches 11 px past each edge (44 with the 20 drawn)').toEqual([true, true, true, true]);
      expect((await pressOut(copy, 14)).map((x) => x === true), 'and no further than 12').toEqual([false, false, false, false]);
    });
  });
}

const CHIP_IDS = ['6512a0f0c4e3b1d2a0f19c01', '6512a0f0c4e3b1d2a0f19c02', '6512a0f0c4e3b1d2a0f19c03', '6512a0f0c4e3b1d2a0f19c04'];

// A phone: the gallery's wrapping group of four IdChips 4 px apart (as the key inspector's realm chips). Each chip's
// press reaches 44 around its copy, and the chips keep that reach apart, so a tap anywhere in a chip's press copies that
// chip's id, never a neighbour's (a tap that copies the wrong ID is a wrong result).
for (const theme of ['light', 'dark'] as const) {
  test.describe(`a phone, narrow and coarse at 390 (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test(`IdChips 4 px apart: each tap in a chip's press copies its own id (${theme})`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.addInitScript(() => {
        const w = window as unknown as { copied: string[] };
        w.copied = [];
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t: string) => (w.copied.push(t), Promise.resolve()) } });
      });
      await open(page, 'data', theme);
      const group = page.locator('#hub-main [class*="Stack-module__wrap"]').filter({ has: page.locator('[class*="Ids-module__chip_"]') });
      const copies = group.getByRole('button', { name: 'Copy full reference', exact: true });
      await expect(copies).toHaveCount(CHIP_IDS.length, { timeout: 30_000 });
      const rects = await copies.evaluateAll((bs) => {
        bs[0]?.scrollIntoView({ block: 'center' });
        return bs.map((b) => { const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
      });
      const rows = new Set(rects.map((r) => Math.round(r.y)));
      expect(rows.size, 'the chips wrap: neighbours beside and below').toBeGreaterThan(1);
      const chipGap = await group.evaluate((g) => { const [a, b] = [...g.children].map((c) => c.getBoundingClientRect()); return a && b && Math.round(b.top) === Math.round(a.top) ? Math.round(b.left - a.right) : null; });
      expect(chipGap, 'two chips beside each other: the group gap 4 px plus the chip press reach 12').toBe(16);
      for (const [i, r] of rects.entries()) {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        // The centre, 11 px past each edge and the press's four corners (inside the 44 press: 12 past the drawn 20).
        const [l, t, rt, b] = [r.x - 11, r.y - 11, r.x + r.w + 11, r.y + r.h + 11];
        const pts: Array<[number, number]> = [[cx, cy], [l, cy], [rt, cy], [cx, t], [cx, b], [l, t], [rt, t], [l, b], [rt, b]];
        for (const [x, y] of pts) {
          await page.evaluate(() => { (window as unknown as { copied: string[] }).copied.length = 0; });
          await page.touchscreen.tap(x, y);
          await expect.poll(() => page.evaluate(() => (window as unknown as { copied: string[] }).copied.slice()), { message: `chip ${i + 1}: a tap at ${Math.round(x)},${Math.round(y)} copies its own id` }).toEqual([CHIP_IDS[i]]);
        }
      }
    });
  });
}
