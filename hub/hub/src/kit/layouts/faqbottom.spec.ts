// On a short page the page's questions sit at the bottom of the scroll area, in
// flow: the layout's column fills the area and the free space goes above the questions (margin-block-start: auto). No
// sticky bar; a long page is unchanged, the questions 24 px under the content. Through every layout that holds them:
// DashboardPage (the gallery `/_kit?layout=faq`), TablePage (/files, /computers), DetailPage (/billing, /referrals; no page draws a facts rail beside its questions,
// referrals/levels.test.tsx, so there is no tall-rail or facts-above case) and the
// ListDetailPage list pane (/vault, /support), at 1440 with a fine pointer and at 390 with a coarse one. A tall viewport
// makes a fixture page short; the shots are the artifacts (faqbottom-*.png).
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

interface Fit {
  /** The scroll area's content bottom minus the questions' bottom. */
  gap: number;
  /** What the boxes between the questions and the scroll area keep under them (their end padding, border and margin). */
  below: number;
  /** How far the scroll area scrolls. */
  overflow: number;
  /** The questions' top minus the bottom of the content before them. */
  above: number;
}

/** The unobscured bottom minus the element's bottom: the top of the fixed chrome over the window's lower half across the
 * element's columns (a phone's bottom bar, a floating action button), or the window's bottom when nothing covers it.
 * Measured on the real boxes, never on the scroll area's padding. */
const clearOf = (el: Locator) =>
  el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    let bottom = innerHeight;
    for (const c of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(c);
      if (cs.position !== 'fixed' || cs.visibility === 'hidden' || cs.display === 'none') continue;
      const b = c.getBoundingClientRect();
      if (b.width === 0 || b.height === 0 || b.top < innerHeight / 2 || b.top >= innerHeight) continue;
      if (b.right <= r.left || b.left >= r.right) continue;
      bottom = Math.min(bottom, b.top);
    }
    return bottom - r.bottom;
  });

/** The questions against their scroll area: the nearest ancestor that scrolls (the shell's main area, or a list pane). */
async function fit(page: Page): Promise<Fit> {
  await expect(page.locator('section#faq')).toBeVisible();
  return page.evaluate(() => {
    const faq = document.querySelector<HTMLElement>('section#faq')!;
    let area = faq.parentElement;
    while (area && !/(auto|scroll)/.test(getComputedStyle(area).overflowY)) area = area.parentElement;
    if (!area) throw new Error('no scroll area holds the questions');
    let below = parseFloat(getComputedStyle(faq).marginBottom);
    for (let e = faq.parentElement; e && e !== area; e = e.parentElement) {
      const cs = getComputedStyle(e);
      below += parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.marginBottom);
    }
    let from: HTMLElement | null = faq;
    while (from && !from.previousElementSibling) from = from.parentElement;
    const prev = from!.previousElementSibling!.getBoundingClientRect();
    const r = faq.getBoundingClientRect();
    const a = area.getBoundingClientRect();
    const end = a.top + area.clientTop + area.clientHeight - parseFloat(getComputedStyle(area).paddingBottom);
    return { gap: end - r.bottom, below, overflow: area.scrollHeight - area.clientHeight, above: r.top - prev.bottom };
  });
}

async function open(page: Page, path: string) {
  await page.goto('about:blank');
  await gotoHub(page, path, { theme: 'light' });
  await expect(page.locator('section#faq')).toBeVisible();
  // Rows and states settle (a list's rows, a detail's tabs) before anything is measured.
  await page.waitForLoadState('networkidle');
}

const short = async (page: Page, path: string, shot: string) => {
  await open(page, path);
  const f = await fit(page);
  expect(f.overflow, `${path} is short here: its scroll area does not scroll`).toBeLessThanOrEqual(1);
  expect(Math.abs(f.gap - f.below), `${path}: the questions end at the scroll area's bottom (gap ${f.gap}, kept ${f.below})`).toBeLessThanOrEqual(1);
  expect(f.above, `${path}: the free space sits above the questions, more than the 24 px gap`).toBeGreaterThan(32);
  // Against what the reader sees: the bottom bar's or the action button's top at 390, the window's bottom otherwise. The
  // questions end above it, and no further above it than what their boxes keep under them plus the action button's room
  // the shell keeps on a phone.
  const clear = await clearOf(page.locator('section#faq'));
  expect(clear, `${path}: the questions end above the bottom bar and the action button (${clear})`).toBeGreaterThanOrEqual(-1);
  expect(clear - f.below, `${path}: the questions end at the bottom of what the reader sees, not far above it (${clear}, kept ${f.below})`).toBeLessThanOrEqual(96);
  await page.screenshot({ path: test.info().outputPath(`faqbottom-${shot}.png`) });
};

const long = async (page: Page, path: string, shot: string) => {
  await open(page, path);
  const f = await fit(page);
  expect(f.overflow, `${path} is long here: its scroll area scrolls`).toBeGreaterThan(1);
  expect(Math.abs(f.above - 24), `${path}: the questions follow the content 24 px under it, as before (${f.above})`).toBeLessThanOrEqual(1);
  await page.screenshot({ path: test.info().outputPath(`faqbottom-${shot}.png`), fullPage: true });
};

test.describe.configure({ timeout: 90_000 });

test.describe('1440, fine pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('a short dashboard: the questions sit at the bottom of the scroll area', async ({ page }) => short(page, '/_kit?layout=faq', 'dashboard-1440'));
  for (const path of ['/vault', '/support']) {
    test(`${path}, a short list: the questions sit at the list pane's bottom`, async ({ page }) => short(page, path, `${path.slice(1)}-1440`));
  }
  for (const path of ['/bots', '/files', '/billing']) {
    test(`${path}, a long page: the questions follow the content, unchanged`, async ({ page }) => long(page, path, `${path.slice(1)}-long-1440`));
  }
});

// A page the fixtures fill is made short by a viewport taller than its content. Each path names its own height, with
// room over its measured content: /billing (the Plans view, billing/plans.more.test.tsx) and /referrals
// (referrals/levels.test.tsx) grew on purpose past the shared 2400.
const MADE_SHORT_1440: readonly [string, number][] = [['/files', 2400], ['/computers', 2400], ['/billing', 4100], ['/referrals', 2700]];
for (const [path, height] of MADE_SHORT_1440) {
  test.describe(`1440 x ${height}, fine pointer: pages the fixtures fill, made short`, () => {
    test.use({ viewport: { width: 1440, height } });
    test(`${path}: the questions sit at the bottom of the scroll area`, async ({ page }) => short(page, path, `${path.slice(1)}-1440x${height}`));
  });
}

test.describe('390, coarse pointer', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('a short dashboard: the questions sit above the bottom bar', async ({ page }) => short(page, '/_kit?layout=faq', 'dashboard-390'));
  for (const path of ['/vault', '/computers']) {
    test(`${path}, a long page: the questions follow the content, unchanged`, async ({ page }) => long(page, path, `${path.slice(1)}-long-390`));
  }
});

const MADE_SHORT_390: readonly [string, number][] = [['/vault', 3200], ['/files', 3200], ['/referrals', 5500]];
for (const [path, height] of MADE_SHORT_390) {
  test.describe(`390 x ${height}, coarse pointer: pages the fixtures fill, made short`, () => {
    test.use({ viewport: { width: 390, height }, hasTouch: true, isMobile: true });
    test(`${path}: the questions sit above the bottom bar`, async ({ page }) => short(page, path, `${path.slice(1)}-390x${height}`));
  });
}

// A location naming a question on a short page: the question still opens and lands in view, inside its scroll
// area and the window; the questions' new place at the bottom never pushes it off-screen.
const landed = async (page: Page, path: string, id: string, shot: string) => {
  await page.goto('about:blank');
  await gotoHub(page, `${path}#faq-${id}`, { theme: 'light' });
  const q = page.locator(`#faq-${id} button[aria-expanded]`);
  await expect(q).toHaveAttribute('aria-expanded', 'true');
  await page.waitForLoadState('networkidle');
  await expect
    .poll(
      () =>
        q.evaluate((el) => {
          let area = el.parentElement;
          while (area && !/(auto|scroll)/.test(getComputedStyle(area).overflowY)) area = area.parentElement;
          const a = area!.getBoundingClientRect();
          const r = el.getBoundingClientRect();
          // The unobscured bottom: the top of fixed chrome over the window's lower half across the question (the bottom bar
          // and the action button at 390), else the window's bottom.
          let bottom = innerHeight;
          for (const c of document.querySelectorAll('body *')) {
            const cs = getComputedStyle(c);
            if (cs.position !== 'fixed' || cs.visibility === 'hidden' || cs.display === 'none') continue;
            const b = c.getBoundingClientRect();
            if (b.width === 0 || b.height === 0 || b.top < innerHeight / 2 || b.top >= innerHeight) continue;
            if (b.right <= r.left || b.left >= r.right) continue;
            bottom = Math.min(bottom, b.top);
          }
          return r.top >= Math.max(a.top, 0) - 1 && r.bottom <= Math.min(a.top + area!.clientHeight, bottom) + 1;
        }),
      { message: `${path}#faq-${id}: the landed question is inside its scroll area, above the bottom bar and the action button` },
    )
    .toBe(true);
  await page.screenshot({ path: test.info().outputPath(`faqbottom-${shot}.png`) });
};

test.describe('a location naming a question, 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('/vault#faq-showValue, a short list: the question opens in view', async ({ page }) => landed(page, '/vault', 'showValue', 'vault-hash-1440'));
  test('/_kit?layout=faq#faq-count, a short dashboard: the question opens in view', async ({ page }) => landed(page, '/_kit?layout=faq', 'count', 'dashboard-hash-1440'));
});

test.describe('a location naming a question, 390 coarse', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('/_kit?layout=faq#faq-count, a short dashboard: the question opens in view, above the bottom bar', async ({ page }) => landed(page, '/_kit?layout=faq', 'count', 'dashboard-hash-390'));
  test('/vault#faq-showValue at 390 x 3200, made short: the question opens in view', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 3200 });
    await landed(page, '/vault', 'showValue', 'vault-hash-390x3200');
  });
});
