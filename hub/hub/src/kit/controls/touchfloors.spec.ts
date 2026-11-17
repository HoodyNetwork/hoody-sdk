// Playwright: buttons whose page or kit part once set a touch floor of its own keep their sizes, now the kit Button's
// own: with a mouse their kit height (md 32, sm 28, a toolbar-size control 40), on a coarse pointer at least 44 both
// ways. Home's Ask (toolbar size, beside its 40 px field), the agent hint's trigger (Computers), the talk bar's buttons
// and the model browser's buttons (the kit gallery's voice and models tabs). Both themes. (The Free badge, RenameRealms and the hint's footer use the same kit rule and are pinned by
// touchfloors.test.ts.)
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

interface Box {
  name: string;
  w: number;
  h: number;
}

/** The kit heights with a mouse. */
/** `header`: a worded button among a PageHeader's actions is drawn at the header's height whatever its own size
 *  (kit/layouts/PageHeader.module.css, "Buttons side by side share one height"): 32 with a mouse. */
const HEIGHT = { md: 32, sm: 28, toolbar: 40, header: 32 } as const;

const PLACES: { path: string; buttons: RegExp; size: keyof typeof HEIGHT; min: number }[] = [
  { path: '/', buttons: /^Ask$/, size: 'toolbar', min: 1 },
  { path: '/computers', buttons: /^Use with your agent$/, size: 'header', min: 1 },
  { path: '/_kit?tab=voice', buttons: /^(Mute|Unmute|Stop answer|Stop speaking|End)$/, size: 'sm', min: 6 },
  { path: '/_kit?tab=models', buttons: /^(Search|Older agent)$/, size: 'sm', min: 2 },
];

async function boxes(page: Page, path: string, theme: 'light' | 'dark', names: RegExp): Promise<Box[]> {
  await page.goto('about:blank'); // gotoHub is same-document between Hub pages: start each read from a fresh load
  await gotoHub(page, path, { theme });
  const all = page.locator('#hub-main button').filter({ hasText: names });
  await all.first().waitFor({ timeout: 30_000 });
  return all.evaluateAll((bs, src) => {
    const re = new RegExp(src);
    return bs
      .filter((b) => b.getClientRects().length > 0 && re.test((b.textContent ?? '').trim()))
      .map((b) => { const r = b.getBoundingClientRect(); return { name: (b.textContent ?? '').trim(), w: Math.round(r.width), h: Math.round(r.height) }; });
  }, names.source);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`a mouse at 1440 (${theme})`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test(`each button is its kit height (${theme})`, async ({ page }) => {
      test.setTimeout(150_000);
      for (const p of PLACES) {
        const got = await boxes(page, p.path, theme, p.buttons);
        expect(got.length, `${p.path}: buttons read`).toBeGreaterThanOrEqual(p.min);
        const want = HEIGHT[p.size];
        expect.soft(got.filter((b) => b.h !== want).map((b) => `${p.path} ${b.name} ${b.w}x${b.h}`), `${p.path}: not ${want} tall`).toEqual([]);
      }
    });
  });

  test.describe(`a coarse pointer at 1024 (${theme})`, () => {
    test.use({ viewport: { width: 1024, height: 800 }, hasTouch: true, isMobile: true });
    test(`each button is at least 44 both ways (${theme})`, async ({ page }) => {
      test.setTimeout(150_000);
      for (const p of PLACES) {
        const got = await boxes(page, p.path, theme, p.buttons);
        expect(got.length, `${p.path}: buttons read`).toBeGreaterThanOrEqual(p.min);
        expect.soft(got.filter((b) => b.h < 44 || b.w < 44).map((b) => `${p.path} ${b.name} ${b.w}x${b.h}`), `${p.path}: under 44`).toEqual([]);
      }
    });
  });
}
