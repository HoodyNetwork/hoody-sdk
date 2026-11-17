// Playwright: the phone tray on the gallery's menus at 390 px. It opens at the
// bottom as a dialog named by its visible title, with a 44×44 Close; scrim, Close and Escape each close it and give
// focus back to the trigger; Tab stays inside; the page does not scroll under it; above a Drawer, Escape closes only the
// tray; an `opens` item hands focus to its dialog and back to the trigger; a copy item says Copied, then closes after
// COPIED_MS, in the tray and in a popover; reduced motion has no slide; the bottom padding keeps the safe area.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/overlays.strings.en.json';
import strings from './strings.en.json';

/** Menu.tsx COPIED_MS (the spec cannot load the component module). */
const COPIED_MS = 1500;
/** A rounding allowance for measured boxes (they come back in fractions of a pixel). */
const SUBPIXEL = 0.01;
const GALLERY = '/_kit?tab=overlays';
const tray = (page: Page) => page.locator('[data-hub-tray]');
const longMenu = (page: Page) => page.getByRole('button', { name: gallery['btn.longMenu'], exact: true });

test.use({ viewport: { width: 390, height: 844 } });

async function openLong(page: Page) {
  await gotoHub(page, GALLERY);
  const btn = longMenu(page);
  await btn.scrollIntoViewIfNeeded();
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  return btn;
}

test('@traymenu the tray is a dialog named by its title, holding the named menu and a 44x44 Close', async ({ page }) => {
  await openLong(page);
  const dialog = page.getByRole('dialog', { name: gallery['menu.long.title'] });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: gallery['menu.long.title'] })).toBeVisible();
  await expect(dialog.getByRole('menu', { name: gallery['menu.long.title'] })).toBeVisible();
  // With a mouse the Close is the kit's icon hit (--icon-hit, 40); on a touch screen it is 44 (below).
  const close = dialog.getByRole('button', { name: strings.close, exact: true });
  await expect(close).toBeVisible();
  const cb = (await close.boundingBox())!;
  const hit = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--icon-hit')));
  expect(cb.width).toBeGreaterThanOrEqual(hit);
  expect(cb.height).toBeGreaterThanOrEqual(hit);
  // The safe area: the bottom padding is at least --sp-2, and reads env(safe-area-inset-bottom) through --safe-bottom.
  const pad = await tray(page).evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
  expect(pad).toBeGreaterThanOrEqual(8);
});

for (const how of ['Escape', 'Close', 'scrim'] as const) {
  test(`@traymenu ${how} closes the tray and gives focus back to the trigger`, async ({ page }) => {
    const btn = await openLong(page);
    if (how === 'Escape') await page.keyboard.press('Escape');
    if (how === 'Close') await tray(page).getByRole('button', { name: strings.close, exact: true }).click();
    if (how === 'scrim') await page.mouse.click(195, 10);
    await expect(tray(page)).toHaveCount(0);
    await expect(btn).toBeFocused();
  });
}

test('@traymenu Tab stays inside the tray and the page does not scroll under it', async ({ page }) => {
  await openLong(page);
  const before = await page.evaluate(() => window.scrollY);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-hub-tray]')), `Tab ${i + 1} stays in the tray`).toBe(true);
  }
  await page.mouse.move(195, 10);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.scrollY), 'the page under the tray stays put').toBe(before);
});

test('@traymenu above a Drawer, Escape closes only the tray', async ({ page }) => {
  await gotoHub(page, `${GALLERY}&open=drawer-sm`);
  const drawer = page.getByRole('dialog', { name: gallery['drawer.sm.title'] });
  await expect(drawer).toBeVisible();
  const btn = drawer.getByRole('button', { name: gallery['btn.drawerMenu'], exact: true });
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(tray(page)).toBeVisible();
  // The tray slides in from below: until its entry animations finish, its centre can sit under the viewport's edge.
  await tray(page).evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  const z = await page.evaluate(() => {
    const zi = (el: Element | null) => Number(getComputedStyle(el!.closest('[data-hub-tray]') ?? el!).zIndex) || 0;
    return { tray: zi(document.querySelector('[data-hub-tray]')), scrim: Number(getComputedStyle(document.querySelector('[data-hub-tray]')!.parentElement!).zIndex) || 0 };
  });
  expect(z.tray + z.scrim, 'the tray is stacked').toBeGreaterThan(0);
  const center = await page.evaluate(() => {
    const r = document.querySelector('[data-hub-tray]')!.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!el?.closest('[data-hub-tray]');
  });
  expect(center, 'the tray paints above the Drawer').toBe(true);
  await page.keyboard.press('Escape');
  await expect(tray(page)).toHaveCount(0);
  await expect(drawer, 'the Drawer stays open').toBeVisible();
  await expect(btn).toBeFocused();
});

test('@traymenu an opens item closes the tray, its dialog takes focus, and closing it returns focus to the trigger', async ({ page }) => {
  const btn = await openLong(page);
  await tray(page).getByRole('menuitem', { name: gallery['menu.rename'] }).click();
  await expect(tray(page)).toHaveCount(0);
  const dialog = page.getByRole('dialog', { name: gallery['rename.title'] });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((d) => d.contains(document.activeElement)), 'the dialog has focus').toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(btn).toBeFocused();
});

for (const where of ['tray', 'popover'] as const) {
  test(`@traymenu a copy item in a ${where} says Copied, closes after COPIED_MS, and a reopen within it stays open`, async ({ page, context }) => {
    test.slow(); // two COPIED_MS waits and three opens
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    if (where === 'popover') await page.setViewportSize({ width: 1350, height: 900 });
    const btn = await openLong(page);
    const menu = page.getByRole('menu', { name: where === 'tray' ? gallery['menu.long.title'] : gallery['btn.longMenu'] });
    if (where === 'tray') await expect(tray(page)).toBeVisible();
    else await expect(tray(page)).toHaveCount(0);
    // Timed in the page (a loaded runner polls too slowly to judge 1.5 s): the click's release, Copied, the menu gone.
    await page.evaluate((copied) => {
      const w = window as unknown as { __copy: { up?: number; shown?: boolean; gone?: number } };
      w.__copy = {};
      document.addEventListener('pointerup', () => { w.__copy.up ??= performance.now(); }, { capture: true, once: true });
      const o = new MutationObserver(() => {
        const m = document.querySelector('[role="menu"]');
        if (m && [...m.querySelectorAll('[slot="label"]')].some((l) => l.textContent === copied)) w.__copy.shown = true;
        if (w.__copy.shown && !m) { w.__copy.gone = performance.now(); o.disconnect(); }
      });
      o.observe(document.body, { childList: true, subtree: true, characterData: true });
    }, strings.copied);
    await menu.getByRole('menuitem', { name: gallery['menu.copy'] }).click();
    await expect(menu).toHaveCount(0, { timeout: COPIED_MS + 5000 });
    const t = await page.evaluate(() => (window as unknown as { __copy: { up?: number; shown?: boolean; gone?: number } }).__copy);
    expect(t.shown, 'Copied showed in the open menu').toBe(true);
    expect(t.gone! - t.up!, 'the menu stays open COPIED_MS after the choice, then closes').toBeGreaterThanOrEqual(COPIED_MS);
    // Close and reopen within COPIED_MS: the old timer must not close the reopened menu.
    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: gallery['menu.copy'] }).click();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await page.waitForTimeout(COPIED_MS + 300);
    await expect(menu, 'the reopened menu stays open').toBeVisible();
  });

  // The clipboard write is async. One that settles only after the menu closed belongs to that menu:
  // it neither marks the reopened menu Copied nor closes it. The write is held by hand (released after the reopen), so
  // it settles after Escape however slow the runner is.
  test(`@traymenu a copy in a ${where} whose clipboard write settles after Escape leaves the reopened menu open`, async ({ page, context }) => {
    test.slow(); // COPIED_MS after the release
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // A stand-in write that succeeds when released (a real one released later may be refused for lack of a gesture).
    await page.addInitScript(() => {
      const w = window as unknown as { __clip: { started: number; release?: () => void; done?: Promise<void> } };
      w.__clip = { started: 0 };
      navigator.clipboard.writeText = () => {
        w.__clip.started++;
        const held = new Promise<void>((r) => (w.__clip.release = r));
        w.__clip.done = held;
        return held;
      };
    });
    if (where === 'popover') await page.setViewportSize({ width: 1350, height: 900 });
    const btn = await openLong(page);
    const menu = page.getByRole('menu', { name: where === 'tray' ? gallery['menu.long.title'] : gallery['btn.longMenu'] });
    const clip = () => page.evaluate(() => (window as unknown as { __clip: { started: number } }).__clip.started);
    await menu.getByRole('menuitem', { name: gallery['menu.copy'] }).click();
    await expect.poll(clip, 'the write started and is held').toBe(1);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    // Release the held write and wait for it (and the menu's own continuation) to finish.
    await page.evaluate(async () => {
      const c = (window as unknown as { __clip: { release: () => void; done: Promise<void> } }).__clip;
      c.release();
      await c.done;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    const shown = await menu.innerText(); // read once, now that the write has settled
    expect(shown, 'the reopened menu is not marked Copied').not.toContain(strings.copied);
    expect(shown, 'nor marked failed').not.toContain(strings.copyFailed);
    await page.waitForTimeout(COPIED_MS + 300);
    await expect(menu, 'the reopened menu stays open').toBeVisible();
  });
}

test('@traymenu clicking the tray title or scrim of a row menu does not open or select that row', async ({ page }) => {
  // A list row opens on a click (the gallery's list-detail selects it into ?sel=). React bubbles portal events to the
  // trigger's owners: the tray keeps its clicks, double clicks and right clicks.
  await gotoHub(page, '/_kit?layout=list-fill');
  const row = page.locator('tbody tr[data-row-opens]').nth(1); // a row past the first: any row would do
  await expect(row).toBeVisible();
  const menuBtn = row.locator('[data-row-menu] button');
  await menuBtn.focus();
  await page.keyboard.press('Enter');
  await expect(tray(page)).toBeVisible();
  const before = page.url();
  const heading = tray(page).getByRole('heading');
  await heading.click();
  await heading.dblclick();
  await heading.click({ button: 'right' });
  await expect(tray(page), 'the title keeps the tray open').toBeVisible();
  expect(page.url(), 'no row opened').toBe(before);
  await page.keyboard.press('Escape');
  await expect(tray(page)).toBeHidden();
  expect(page.url(), 'still no row opened').toBe(before);
  // Control: a click on the row itself does open it.
  await row.click({ position: { x: 8, y: 8 } });
  await expect.poll(() => page.url()).toContain('sel=');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('@traymenu with reduced motion the tray does not slide', async ({ page }) => {
    await openLong(page);
    // Read the entering state on purpose: the slide only ever runs while React Aria marks the tray entering.
    const anim = await tray(page).evaluate((el) => {
      el.setAttribute('data-entering', '');
      const name = getComputedStyle(el).animationName;
      el.removeAttribute('data-entering');
      return name;
    });
    expect(anim, 'a fade at most, never the slide').not.toContain('trayIn');
  });
});

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true });
  test('@traymenu on a touch screen the tray Close is 44x44', async ({ page }) => {
    await gotoHub(page, GALLERY);
    const btn = longMenu(page);
    await btn.scrollIntoViewIfNeeded();
    await btn.tap();
    const close = tray(page).getByRole('button', { name: strings.close, exact: true });
    await expect(close).toBeVisible();
    const cb = (await close.boundingBox())!;
    // Layout boxes come back in subpixels (43.99997 for a 44 px box under some zooms): judge 44 within a rounding.
    expect(cb.width).toBeGreaterThanOrEqual(44 - SUBPIXEL);
    expect(cb.height).toBeGreaterThanOrEqual(44 - SUBPIXEL);
  });
});
