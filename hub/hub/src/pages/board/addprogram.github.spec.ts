// Playwright: in Add a program, From GitHub is a first-class way in, and the search says what it takes. At 1440 and at
// 390 on a running computer: the From GitHub kind is whole in view without any scrolling (and, wide, the Apps kind's
// Install from GitHub too); a GitHub address pasted in the frame's search is the first result, and Enter reaches that
// repository's Ready step (About …, Start); the search field's placeholder is drawn whole (no cut words), measured with
// the field's own font.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const S = strings as Record<string, string>;

async function computerFrame(page: Page) {
  await gotoHub(page, '/board');
  await page.getByRole('button', { name: S['board.addProgram'] }).first().click(); // reason: the chips row's + (a phone, or a paged Board) has the same name, after the strip's or the empty slot's own
  const d = page.getByRole('dialog').last();
  await d.getByRole('row', { name: /^atlas/ }).click();
  await expect(d.getByRole('grid', { name: S['picker.kit'] })).toBeVisible();
  return d;
}

/** Whether the element is inside the box that scrolls it and inside the window: seen without any scrolling. */
const inView = (l: Locator) => l.evaluate((el) => {
  const r = el.getBoundingClientRect();
  let p = el.parentElement;
  while (p && !(p.scrollHeight > p.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
  const box = p ? p.getBoundingClientRect() : { top: 0, bottom: innerHeight };
  return r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && (p?.scrollTop ?? 0) === 0;
});

/** The width the placeholder needs in the field's own font (letter spacing and case included) and the room it has. */
const placeholderFit = (l: Locator) => l.evaluate((el) => {
  const input = el as HTMLInputElement;
  const cs = getComputedStyle(input, '::placeholder');
  const own = getComputedStyle(input);
  const span = document.createElement('span');
  span.textContent = input.placeholder;
  Object.assign(span.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre', font: cs.font || own.font, letterSpacing: cs.letterSpacing, textTransform: cs.textTransform, wordSpacing: cs.wordSpacing });
  document.body.append(span);
  const need = span.getBoundingClientRect().width;
  span.remove();
  const room = input.clientWidth - parseFloat(own.paddingLeft) - parseFloat(own.paddingRight);
  return { text: input.placeholder, need, room };
});

for (const [label, size, touch] of [
  ['1440', { width: 1440, height: 900 }, false],
  ['390', { width: 390, height: 844 }, true],
] as const) {
  test.describe(`${label}: From GitHub and the search's words`, () => {
    test.use({ viewport: size, hasTouch: touch, isMobile: touch });

    test('the search field says what it takes, whole', async ({ page }) => {
      const d = await computerFrame(page);
      const field = d.getByRole('searchbox');
      await expect(field).toHaveAttribute('placeholder', touch ? S['picker.searchProgramsPhone']! : S['picker.searchPrograms']!);
      const fit = await placeholderFit(field);
      expect(fit.need, `"${fit.text}" needs ${fit.need} px, the field has ${fit.room}`).toBeLessThanOrEqual(fit.room);
    });

    test('the From GitHub kind is in view without scrolling; the Apps kind offers Install from GitHub', async ({ page }) => {
      const d = await computerFrame(page);
      // The kind itself, whole inside its rail or strip (the phone strip scrolls sideways: not scrolled to reach it).
      const kind = d.locator('[data-side-tab="github"], [role="tab"]').filter({ hasText: S['browse.tab.github'] }).first();
      await expect(kind).toBeVisible();
      const whole = await kind.evaluate((el) => {
        const r = el.getBoundingClientRect();
        let p = el.parentElement;
        while (p && !(p.scrollWidth > p.clientWidth + 1 && /auto|scroll|hidden/.test(getComputedStyle(p).overflowX))) p = p.parentElement;
        const box = p ? p.getBoundingClientRect() : { left: 0, right: innerWidth };
        return r.left >= box.left - 1 && r.right <= box.right + 1 && r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight && (p?.scrollLeft ?? 0) === 0;
      });
      expect(whole, 'From GitHub is whole in view with nothing scrolled').toBe(true);
      await d.locator('[data-side-tab="apps"], [role="tab"]').filter({ hasText: S['browse.tab.apps'] }).first().click();
      const entry = d.locator('[data-card-key="github"]');
      await expect(entry).toBeVisible();
      // On a wide screen the Apps kind shows it with nothing scrolled too.
      if (!touch) expect(await inView(entry), 'Install from GitHub is in view with nothing scrolled').toBe(true);
      // A press on it opens the From GitHub kind (chosen in the rail or the strip); the head keeps its one field, which
      // now searches the library or takes an address, and says so whole.
      await entry.click();
      await expect(d.locator('[data-side-tab="github"][aria-pressed="true"], [role="tab"][aria-selected="true"]').filter({ hasText: S['browse.tab.github'] })).toHaveCount(1);
      const field = d.getByRole('searchbox');
      await expect(field).toHaveCount(1);
      await expect(field).toHaveAttribute('placeholder', touch ? S['browse.github.examplePhone']! : S['browse.github.example']!);
      const fit = await placeholderFit(field);
      expect(fit.need, `"${fit.text}" needs ${fit.need} px, the field has ${fit.room}`).toBeLessThanOrEqual(fit.room);
    });

    test('a GitHub address pasted in the search is the first result; Enter reaches its Ready step', async ({ page }) => {
      const d = await computerFrame(page);
      const field = d.getByRole('searchbox');
      await field.fill('https://github.com/Mintplex-Labs/anything-llm');
      const first = d.locator('[data-card-key]').first();
      await expect(first).toHaveAttribute('data-card-key', 'gh:address');
      await expect(first).toContainText('Mintplex-Labs/anything-llm');
      expect(await inView(first), 'the address result is in view with nothing scrolled').toBe(true);
      await field.press('Enter');
      await expect(d.getByRole('heading', { name: /^(About |AnythingLLM)/ }).first()).toBeVisible();
      await expect(d.getByRole('button', { name: /^(Start|Install)/ }).first()).toBeVisible();
    });
  });
}
