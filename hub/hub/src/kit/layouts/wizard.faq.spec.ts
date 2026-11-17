// Playwright: on every wizard page the questions are the page's last block, under the wizard's buttons. Scrolled to the
// end at 1440 and at 390, the FAQ starts at or below the bottom of the footer (Cancel, Back, Next / Continue), so the
// sticky footer never covers its rows, and nothing in the page is drawn below the FAQ.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import realmStrings from '../../pages/realms/strings.en.json';
import scriptStrings from '../../pages/scripts/strings.en.json';

const PAGES = [
  { name: 'New realm', path: '/realms/new', button: realmStrings.next },
  { name: 'New script', path: '/scripts/new', button: scriptStrings['flow.continue'] },
];
const SIZES = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];

type Box = { top: number; bottom: number };
type Layout = { faq: Box | null; footer: Box | null; below: string[] };

async function layoutAtEnd(page: Page, button: string): Promise<Layout> {
  const next = page.getByRole('button', { name: button }).last();
  await next.waitFor({ timeout: 15_000 });
  await page.locator('[data-faq-title]').first().waitFor({ timeout: 15_000 });
  return next.evaluate((btn) => {
    const main = document.querySelector('#hub-main') as HTMLElement;
    main.scrollTop = main.scrollHeight;
    const faqEl = document.querySelector('[data-faq-title]')?.closest('section') ?? null;
    // The footer: the button's nearest sticky ancestor.
    let foot: Element | null = btn.parentElement;
    while (foot && foot !== main && getComputedStyle(foot).position !== 'sticky') foot = foot.parentElement;
    const box = (el: Element | null) => {
      if (!el || el === main) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    };
    const faq = box(faqEl);
    const below: string[] = [];
    if (faqEl && faq) {
      for (const el of Array.from(main.querySelectorAll('*'))) {
        if (el === faqEl || faqEl.contains(el) || el.contains(faqEl)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.top >= faq.bottom - 1) below.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 40)}"`);
      }
    }
    return { faq, footer: box(foot), below };
  });
}

for (const size of SIZES) {
  test.describe(`wizard questions at ${size.width}`, () => {
    test.use({ viewport: size });
    for (const p of PAGES) {
      test(`${p.name}: the FAQ is under the buttons and last`, async ({ page }) => {
        await gotoHub(page, p.path);
        const { faq, footer, below } = await layoutAtEnd(page, p.button);
        expect(faq, `${p.name} has questions`).not.toBeNull();
        expect(footer, `${p.name} has a sticky footer around its buttons`).not.toBeNull();
        expect(faq!.top, 'the FAQ starts at or below the footer bottom').toBeGreaterThanOrEqual(footer!.bottom - 0.5);
        expect(below, 'nothing is drawn below the FAQ').toEqual([]);
      });
    }
  });
}
