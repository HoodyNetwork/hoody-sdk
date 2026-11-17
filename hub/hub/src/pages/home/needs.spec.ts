// In the Needs-you strip the title and every line's sentence share one centre line (also when a line
// wraps or carries a body line), and each action is at the strip's far right edge and wider than its word. The
// actions are the kit secondary: Home's one primary is the Ask submit (needs.actions.test.tsx
// covers a hidden page). 675 px is
// 1350 at 200% zoom: the Hub's type tokens are px, so larger text reaches the layout as a narrower viewport.
import { expect, type Locator, type Page } from '@playwright/test';
import { gotoHub, hubUrl, test, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

// The pages the dev server serves (scripts/check.ts passes the same HUB_PAGE to Vite and to Playwright): a home-only
// server has no Computers or Bots page, so the lines show with no action. Unset means the whole Hub.
const HOME_ONLY = process.env.HUB_PAGE === 'home';

const box = async (l: Locator) => {
  const b = await l.boundingBox();
  if (!b) throw new Error('no box');
  return b;
};
const mid = async (l: Locator) => {
  const b = await box(l);
  return b.y + b.height / 2;
};

async function open(page: Page, width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await gotoHub(page, '/home', { state: 'attention' });
  const strip = page.locator('section[aria-labelledby="home-needs-title"]');
  // The fixture's two lines: a computer that needs a look and a waiting Bot.
  await expect(strip.locator('li[data-need]')).toHaveCount(2, { timeout: 20_000 });
  return strip;
}

// The text lines of an element: the client rects of a range over its contents (one per line; the element itself is a
// flex item, so its own rects are one block).
const lines = (l: Locator) => l.evaluate((el) => {
  const r = document.createRange();
  r.selectNodeContents(el);
  const ys = [...r.getClientRects()].map((x) => Math.round(x.y + x.height / 2));
  return [...new Set(ys)];
});
/** The centre of the first text line; a box with no text line fails the test (never compares against undefined). */
const firstLineMid = async (l: Locator) => {
  const [first] = await lines(l);
  if (first === undefined) throw new Error('no text line');
  return first;
};

async function checkActions(strip: Locator, width: number) {
  const actions = strip.locator('li[data-need] a[href]');
  await expect(actions).toHaveCount(2);
  for (const a of await actions.all()) await expect(a).toHaveAttribute('data-variant', 'secondary');
  const s = await box(strip);
  const padEnd = await strip.evaluate((el) => parseFloat(getComputedStyle(el).paddingInlineEnd) + parseFloat(getComputedStyle(el).borderInlineEndWidth));
  for (const a of await actions.all()) {
    await expect.poll(async () => { const b = await box(a); return Math.round(s.x + s.width - padEnd - (b.x + b.width)); }).toBe(0);
    expect((await box(a)).width).toBeGreaterThanOrEqual(width < 1000 ? 120 : 160); // clamp(120px, 30%, 160px)
    // The action and its line's first sentence line share a centre.
    const line = a.locator('xpath=ancestor::li[1]');
    expect(Math.abs((await mid(a)) - (await firstLineMid(line.locator('span[class*="needSentence"]'))))).toBeLessThanOrEqual(1.5);
  }
}

for (const width of [1350, 3440, 675, 390]) {
  test(`needs-you lines up at ${width}`, async ({ hubPage: page }) => {
    const strip = await open(page, width, width === 3440 ? 1440 : 900);
    const title = strip.locator('#home-needs-title');
    const first = strip.locator('li[data-need] span[class*="needSentence"]').first();
    // The title, the first message and its Open share one centre line at every width, the title's
    // words shown beside the lines (on a phone the gaps narrow and the message wraps).
    await expect(page.getByRole('heading', { name: strings['needs.title'] })).toBeVisible();
    expect((await box(title)).y + 1).toBeGreaterThanOrEqual((await box(strip.locator('li[data-need]').first())).y);
    await expect.poll(async () => Math.abs((await mid(title)) - (await firstLineMid(first)))).toBeLessThanOrEqual(1.5);
    if (HOME_ONLY) await expect(strip.locator('li[data-need] a[href]')).toHaveCount(0);
    else await checkActions(strip, width);
    await noSideScroll(page);
  });
}

for (const width of [1350, 390]) {
  test(`needs-you keeps the dot and the action on a wrapped line's first line at ${width}`, async ({ hubPage: page }) => {
    const strip = await open(page, width);
    const text = strip.locator('li[data-need]').first().locator('span[class*="needText"]');
    // A long first sentence that wraps, then a body line under it (as a changes line has).
    await text.evaluate((el) => {
      const s = el.querySelector('span[class*="needSentence"]')!;
      s.textContent = `${s.textContent} `.repeat(12);
      const body = document.createElement('span');
      body.style.flexBasis = '100%';
      body.textContent = 'A second line under the sentence.';
      el.appendChild(body);
    });
    const sentence = text.locator('span[class*="needSentence"]');
    expect((await lines(sentence)).length).toBeGreaterThan(1);
    const li = strip.locator('li[data-need]').first();
    const dot = li.locator('span[class*="needDot"]');
    expect(Math.abs((await mid(dot)) - (await firstLineMid(sentence)))).toBeLessThanOrEqual(1.5);
    if (width >= 600) {
      const title = strip.locator('#home-needs-title');
      await expect.poll(async () => Math.abs((await mid(title)) - (await firstLineMid(sentence)))).toBeLessThanOrEqual(1.5);
    }
    if (!HOME_ONLY) expect(Math.abs((await mid(li.locator('a[href]'))) - (await firstLineMid(sentence)))).toBeLessThanOrEqual(1.5);
    await noSideScroll(page);
  });
}

test('home keeps one primary while needs-you shows: the Ask submit', async ({ hubPage: page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  // Ask is off until a live turn is proven; the fixture build turns it on with ?ask=1 (as page.spec.ts does).
  await page.goto(hubUrl('/home', { state: 'attention' }).replace('/?', '/?ask=1&'));
  await page.locator('#hub-main').waitFor();
  const strip = page.locator('section[aria-labelledby="home-needs-title"]');
  await expect(strip.locator('li[data-need]')).toHaveCount(2, { timeout: 20_000 });
  const submit = page.locator('main form').getByRole('button', { name: strings['ask.submit'] });
  await expect(submit).toBeVisible();
  const primaries = page.locator('[data-variant="primary"]:visible');
  await expect(primaries).toHaveCount(1);
  expect(await primaries.first().evaluate((el, s) => el === s, await submit.elementHandle())).toBe(true);
});

// No design exception: "the title ("Needs you"), the message and the Open button share
// one centre line", at 2400, 1350 and 390 in both themes, also when the first message wraps onto more lines (then
// its first line is the one on the centre line). The title's words show whole at every width (hiding
// them is not allowed).
for (const theme of ['light', 'dark'] as const) {
  for (const width of [2400, 1350, 390]) {
    for (const wrapped of [false, true]) {
      test(`needs-you title, first message and Open share one centre line at ${width}, ${theme}${wrapped ? ', wrapped message' : ''}`, async ({ hubPage: page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await gotoHub(page, '/home', { state: 'attention', theme });
        const strip = page.locator('section[aria-labelledby="home-needs-title"]');
        await expect(strip.locator('li[data-need]')).toHaveCount(2, { timeout: 20_000 });
        await expect(page.getByRole('heading', { name: strings['needs.title'] })).toBeVisible();
        const li = strip.locator('li[data-need]').first(); // reason: the first line is the one beside the title
        const sentence = li.locator('span[class*="needSentence"]');
        if (wrapped) {
          await sentence.evaluate((s) => { s.textContent = `${s.textContent} `.repeat(12); });
          expect((await lines(sentence)).length).toBeGreaterThan(1);
        }
        // The title's words show whole at every width (never hidden or cut): the heading is not clipped, its text has
        // its full width on one line, and it sits before the lines, not over them.
        const shown = await strip.locator('#home-needs-title').evaluate((h, list) => {
          // The words' text node, wherever it sits in the heading (the icon before it is an svg): its line boxes.
          const walk = document.createTreeWalker(h, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent!.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
          const node = walk.nextNode()!;
          const r = document.createRange();
          r.selectNodeContents(node);
          const rects = [...r.getClientRects()].filter((x) => x.width > 0);
          const st = getComputedStyle(h);
          const hb = h.getBoundingClientRect();
          const lb = list!.getBoundingClientRect();
          return {
            unclipped: h.scrollWidth <= h.clientWidth + 0.5 && st.clipPath === 'none' && st.visibility === 'visible',
            // One line, inside the heading's box, as wide as a word ("Needs you" is two).
            whole: rects.length === 1 && rects[0]!.width > 40 && rects[0]!.left >= hb.left - 0.5 && rects[0]!.right <= hb.right + 0.5,
            beforeLines: hb.right <= lb.left + 0.5,
          };
        }, await strip.locator('ul').elementHandle());
        expect(shown).toEqual({ unclipped: true, whole: true, beforeLines: true });
        // On a phone the gaps narrow (title to lines 12 px, inside a line 8 px) so the message keeps room to wrap in.
        if (width < 600) {
          expect(await strip.evaluate((el) => getComputedStyle(el).columnGap)).toBe('12px');
          expect(await li.evaluate((el) => getComputedStyle(el).columnGap)).toBe('8px');
        }
        const title = await mid(strip.locator('#home-needs-title'));
        const message = await firstLineMid(sentence);
        expect(Math.abs(title - message)).toBeLessThanOrEqual(1.5);
        if (!HOME_ONLY) expect(Math.abs((await mid(li.locator('a[href]'))) - message)).toBeLessThanOrEqual(1.5);
        await noSideScroll(page);
      });
    }
  }
}
