// Playwright: on a phone no button label is cut ("CHECK A...", "ADD PER...", "KEEP E..."), a footer whose buttons
// cannot share a row stacks them with the action on top, and a tab badge pushed off a strip puts a dot on that side's
// chevron. Real boxes, so a real browser: the Bot page's drawers and footers at 390 and 320, and the Programs toolbar.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import conv from '@kit/agent/Conversation.strings.en.json';

const BOT = (x = '') => `/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief${x}`;

type Step = { click: string } | { waitFor: string } | { fill: [string, string] } | { press: string };
const APPROVE: Step[] = [{ click: 'role=button[name="Chats"]' }, { click: 'role=button[name="Approve"]' }, { waitFor: 'text=Approve group' }];
const PLACES: Array<[string, string, string | undefined, Step[]]> = [
  ['gate recovery', BOT(), 'gateRecovery', [{ click: `role=button[name="${conv['agent.allowOnce']}"]` }, { waitFor: 'role=button[name="Check again"]' }]],
  ['add a person', BOT('&tab=apps&app=ch-tg'), 'idle', [{ click: 'role=button[name="People"]' }, { click: 'role=button[name="Add a person"]' }, { waitFor: 'text=Add person' }]],
  // A group that asks to join (channelGroupAsks): its Approve is the row's inline action (a muted group's sits in Row actions).
  ['approve a group', BOT('&tab=apps&app=ch-tg'), 'channelGroupAsks', APPROVE],
  ['chat settings', BOT('&tab=apps&app=ch-tg'), 'idle', [{ click: 'role=button[name="Chats"]' }, { click: 'role=button[name="Chat settings"] >> nth=0' }, { waitFor: 'text=Message formatting' }]],
  ['new key, discard ask', BOT('&tab=link&drawer=key'), 'idle', [{ fill: ['role=textbox >> nth=0', 'x'] }, { press: 'Escape' }, { waitFor: 'role=button[name="Keep editing"]' }]],
  ['programs toolbar', '/programs', undefined, [{ waitFor: '[role=tablist]' }]],
  ['bot settings footer', BOT('&settings=workers'), 'workersRouting', [{ waitFor: 'role=button[name="Cancel"]' }]],
  // The kit's pending banner with both actions (Check again, Stop tracking), as Bots and Computers draw it: the gate
  // recovery shows its Check again on the gate card, so this is the place that draws the banner's action row.
  ['outcome banners', '/_kit?tab=states&part=outcomes', undefined, [{ waitFor: 'role=button[name="Check again"]' }]],
];

async function open(page: Page, path: string, state: string | undefined, steps: Step[]) {
  await gotoHub(page, path, state ? { state } : {});
  for (const s of steps) {
    if ('click' in s) await page.locator(s.click).first().click();
    else if ('waitFor' in s) await page.locator(s.waitFor).first().waitFor({ timeout: 15_000 });
    else if ('fill' in s) await page.locator(s.fill[0]).first().fill(s.fill[1]);
    else await page.keyboard.press(s.press);
  }
  // Fonts settle the label widths.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/**
 * Every drawn button whose words are cut (a box narrower than its text that clips it) or spill past its own frame, with
 * its label. Visually hidden text (a 1 px clip for screen readers) is not drawn, so it is skipped. The segmented
 * options (SegmentedControl, not a Button) are outside this set: the Link tab's are a follow-up for its own page.
 */
async function cutButtons(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const b of document.querySelectorAll<HTMLElement>('button, a[role=button], [role=tab]')) {
      if (b.closest('[class*="SegmentedControl-module__track"]')) continue;
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(b).visibility === 'hidden') continue;
      // A table's inline group header is ruled to ellipsize its name (the rule:
      // "the extra keeps the name's line at every width: the label gives way first, ending in an ellipsis, the count
      // staying"), so that name's own overflow is exempt while it ends in that ellipsis. Everything else is checked as for
      // any button: the name or the count clipped by the button or spilling past it, a name cut without an ellipsis.
      const ruled =
        /DataTable-module__groupBtn/.test(b.className) && !/DataTable-module__groupBtnStacked/.test(b.className)
          ? b.querySelector<HTMLElement>(':scope > [class*="DataTable-module__groupLabel"]')
          : null;
      const ellipsized = !!ruled && getComputedStyle(ruled).textOverflow === 'ellipsis';
      const boxes = [b, ...b.querySelectorAll<HTMLElement>('span')].filter((x) => x.clientWidth > 1 && !(ellipsized && x === ruled));
      const clipped = boxes.some((x) => x.scrollWidth > x.clientWidth + 1 && getComputedStyle(x).overflowX !== 'visible');
      const spilled = [...b.querySelectorAll<HTMLElement>('span')].some((x) => {
        const t = x.getBoundingClientRect();
        return x.clientWidth > 1 && (t.right > r.right + 1 || t.left < r.left - 1);
      });
      if (clipped || spilled) out.push((b.textContent ?? '').trim() || b.getAttribute('aria-label') || '?');
    }
    return out;
  });
}

/** Every drawn button inside an outcome banner whose box goes past the banner's own edges (a row of actions that does
 *  not wrap spills out, and the banner clips it, so the page never scrolls sideways). */
async function pastBanner(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const o of document.querySelectorAll<HTMLElement>('[data-outcome]')) {
      const r = o.getBoundingClientRect();
      if (r.width === 0) continue;
      for (const b of o.querySelectorAll<HTMLElement>('button')) {
        const x = b.getBoundingClientRect();
        if (x.width > 0 && (x.right > r.right + 1 || x.left < r.left - 1)) out.push((b.textContent ?? '').trim() || '?');
      }
    }
    return out;
  });
}

/** Every drawn kit text button narrower than the 44 px touch target (coarse pointer). */
async function underTouch(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[class*="Button-module__button"]:not([class*="Button-module__iconOnly"])')]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.width < 43.5;
      })
      .map((b) => `${(b.textContent ?? '').trim()} ${Math.round(b.getBoundingClientRect().width)}`),
  );
}

/** Footers (a drawer's foot, a dialog's buttons, the discard ask) whose buttons wrapped with the last one below the first. */
async function actionBelow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const row of document.querySelectorAll<HTMLElement>('footer, [role=dialog] [class*="buttons"], [class*="askButtons"], [class*="footerActions"]')) {
      const bs = [...row.querySelectorAll<HTMLElement>(':scope > button')].filter((b) => b.getBoundingClientRect().height > 0);
      if (bs.length < 2) continue;
      const first = bs[0]!.getBoundingClientRect();
      const last = bs[bs.length - 1]!.getBoundingClientRect();
      if (last.top >= first.bottom - 1) out.push(bs.map((b) => b.textContent?.trim()).join(' / '));
    }
    return out;
  });
}

for (const width of [390, 320]) {
  test.describe(`phone at ${width}`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });

    for (const [name, path, state, steps] of PLACES) {
      test(`${name}: every button label shows whole, no page scrolls sideways, and a stacked footer puts its action on top`, async ({ page }) => {
        await open(page, path, state, steps);
        expect(await cutButtons(page)).toEqual([]);
        expect(await pastBanner(page)).toEqual([]);
        await noSideScroll(page);
        expect(await actionBelow(page)).toEqual([]);
        expect(await underTouch(page)).toEqual([]);
      });
    }
  });
}

test.describe('a footer too narrow for its buttons', () => {
  test.use({ viewport: { width: 320, height: 844 }, hasTouch: true, isMobile: true });

  test('the discard ask stacks Discard above Keep editing, each the full row, when they cannot share it', async ({ page }) => {
    await open(page, BOT('&tab=link&drawer=key'), 'idle', [{ fill: ['role=textbox >> nth=0', 'x'] }, { press: 'Escape' }, { waitFor: 'role=button[name="Keep editing"]' }]);
    // Narrow the ask row below the two labels' widths (as a longer translation would): they must wrap, action first.
    await page.locator('[class*="askButtons"]').first().evaluate((el) => {
      (el as HTMLElement).style.maxInlineSize = '200px';
    });
    const keep = await page.getByRole('button', { name: 'Keep editing' }).boundingBox();
    const discard = await page.getByRole('button', { name: 'Discard' }).boundingBox();
    expect(keep && discard).toBeTruthy();
    expect(discard!.y + discard!.height).toBeLessThanOrEqual(keep!.y + 1);
    expect(await cutButtons(page)).toEqual([]);
  });
});

test.describe('rows that cannot hold their buttons', () => {
  test.use({ viewport: { width: 320, height: 844 }, hasTouch: true, isMobile: true });

  test('a form footer stacks its actions, the submit on top, when its row is narrower than their words', async ({ page }) => {
    await open(page, BOT('&settings=workers'), 'workersRouting', [{ waitFor: 'role=button[name="Cancel"]' }]);
    const row = page.locator('[class*="footerActions"]').first();
    await row.evaluate((el) => {
      (el as HTMLElement).style.maxInlineSize = '120px';
    });
    const boxes = await row.evaluate((el) => [...el.querySelectorAll(':scope > button')].map((b) => ({ t: b.textContent?.trim(), r: b.getBoundingClientRect().toJSON() as DOMRect })));
    expect(boxes.length, JSON.stringify(boxes)).toBeGreaterThanOrEqual(2);
    const first = boxes[0]!.r;
    const last = boxes[boxes.length - 1]!.r;
    expect(last.bottom, JSON.stringify(boxes)).toBeLessThanOrEqual(first.top + 1);
    expect(await cutButtons(page)).toEqual([]);
  });

  test('a Home idea with a long unbroken computer name wraps inside its plate and stays in its row', async ({ page }) => {
    await open(page, '/', undefined, [{ waitFor: '[class*="bubble"]' }]);
    const r = await page.locator('button[class*="bubble"]').first().evaluate((b) => {
      const label = b.querySelector('span')!;
      label.textContent = 'Ask about computer averyveryveryverylongcomputernamewithnobreakatallanywhere today';
      const row = b.parentElement!.getBoundingClientRect();
      const box = b.getBoundingClientRect();
      const words = label.getBoundingClientRect();
      return { wordsLeft: words.left, wordsRight: words.right, left: box.left, right: box.right, rowRight: row.right, side: ((m) => (m ? m.scrollWidth - m.clientWidth : -1))(document.getElementById('hub-main')), height: Math.round(label.getBoundingClientRect().height) };
    });
    expect(r.right, JSON.stringify(r)).toBeLessThanOrEqual(r.rowRight + 1);
    // The words stay inside the plate (they wrap; they never spill past it).
    expect(r.wordsRight, JSON.stringify(r)).toBeLessThanOrEqual(r.right + 1);
    expect(r.wordsLeft, JSON.stringify(r)).toBeGreaterThanOrEqual(r.left - 1);
    expect(r.height, JSON.stringify(r)).toBeGreaterThan(20); // more than one line: it wrapped
    expect(r.side, JSON.stringify(r)).toBeGreaterThanOrEqual(0);
    expect(r.side, JSON.stringify(r)).toBeLessThanOrEqual(1);
  });
});

test.describe('a Select whose picked value is longer than its field', () => {
  test.use({ viewport: { width: 320, height: 844 }, hasTouch: true, isMobile: true });

  test('wraps the value inside its trigger, which grows to hold it; a value that fits keeps the one line at the field height', async ({ page }) => {
    await open(page, BOT('&settings=workers'), 'workersRouting', [{ waitFor: 'role=button[name="Cancel"]' }]);
    // Each field 200 px wide, so the long value needs a second line at any pane width (a narrower scrollbar, a wider
    // drawer) and the short one still fits on one.
    await page.evaluate(() => {
      for (const b of document.querySelectorAll<HTMLElement>('button[class*="more-module__selectBtn"]')) b.style.inlineSize = '200px';
    });
    const r = await page.evaluate(() => {
      const all = [...document.querySelectorAll<HTMLElement>('button[class*="more-module__selectBtn"]')].filter((b) => b.getBoundingClientRect().width > 0);
      // The drawn lines of a box's words: the distinct tops of its text's line boxes.
      const lineCount = (el: HTMLElement) => {
        const rg = document.createRange();
        rg.selectNodeContents(el);
        return new Set([...rg.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size;
      };
      const m = (b: HTMLElement) => {
        const box = b.getBoundingClientRect();
        const words = b.querySelector<HTMLElement>('[class*="more-module__selectValue"]')!;
        const w = words.getBoundingClientRect();
        return { text: (b.textContent ?? '').trim(), h: box.height, min: parseFloat(getComputedStyle(b).minHeight), left: box.left, right: box.right, wl: w.left, wr: w.right, cut: words.scrollWidth > words.clientWidth + 1, lines: lineCount(words) };
      };
      return all.map(m);
    });
    const long = r.find((x) => x.text.includes("Claude Code default"));
    const short = r.find((x) => !x.text.includes("Claude Code default"));
    expect(long, JSON.stringify(r)).toBeTruthy();
    expect(short, JSON.stringify(r)).toBeTruthy();
    expect(long!.cut, JSON.stringify(long)).toBe(false);
    expect(long!.wr, JSON.stringify(long)).toBeLessThanOrEqual(long!.right + 1);
    expect(long!.lines, JSON.stringify(long)).toBe(2);
    expect(long!.h, JSON.stringify(r)).toBeGreaterThan(short!.h); // the trigger grew for its second line
    expect(Math.abs(short!.h - short!.min), JSON.stringify(short)).toBeLessThanOrEqual(1); // one line: the field height
  });
});

test.describe('a short label on a coarse pointer', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  /** Set the first drawn button matching `sel` whose only child is its label to "I" (one letter); its width, or -1 when none. */
  const okWidth = (page: Page, sel: string) =>
    page.evaluate((sel) => {
      const b = [...document.querySelectorAll<HTMLElement>(sel)].find((x) => x.getBoundingClientRect().width > 0 && x.children.length === 1 && /Button-module__label/.test(x.children[0]!.className));
      if (!b) return -1;
      b.children[0]!.textContent = 'I';
      // Its own width, not a share of its row: a phone footer's buttons grow.
      b.style.flex = '0 0 auto';
      return b.getBoundingClientRect().width;
    }, sel);
  // A button that is its label alone: no icon-only, no end glyph (its glyph is a second child), no toolbar control, no bubble.
  const PLAIN = ':not([class*="Button-module__iconOnly"]):not([data-glyph]):not([class*="Button-module__toolbar"]):not([class*="Button-module__bubble"])';

  test('a small text button whose label is one letter is still a 44 px target', async ({ page }) => {
    await open(page, BOT(), 'gateRecovery', [{ click: `role=button[name="${conv['agent.allowOnce']}"]` }, { waitFor: 'role=button[name="Check again"]' }]);
    const w = await okWidth(page, `[class*="Button-module__sm"]${PLAIN}`);
    expect(w, 'a drawn small button with only its label').toBeGreaterThan(0);
    expect(w).toBeGreaterThanOrEqual(43.5);
  });

  test('a default text button whose label is one letter is still a 44 px target', async ({ page }) => {
    await open(page, BOT('&tab=apps&app=ch-tg'), 'channelGroupAsks', APPROVE);
    const w = await okWidth(page, `[class*="Button-module__button"]:not([class*="Button-module__sm"])${PLAIN}`);
    expect(w, 'a drawn default button with only its label').toBeGreaterThan(0);
    expect(w).toBeGreaterThanOrEqual(43.5);
  });
});

test.describe('a page that caps its own button', () => {
  test.use({ viewport: { width: 1350, height: 800 } });

  // With and without the end glyph: the glyph keeps its place after the cut label, inside the frame.
  for (const kind of ['plain', 'glyph'] as const) {
    test(`${kind}: with its own minimum under a cap the label ellipsizes inside the frame; a cap alone keeps the words whole`, async ({ page }) => {
      // The glyph kind is the Bots list's New Bot (its plus): while a Bot is open the page shows no primary of its own.
      if (kind === 'glyph') await open(page, '/bots', undefined, [{ waitFor: 'role=button[name="New Bot"]' }]);
      else await open(page, BOT(), 'idle', [{ waitFor: '[role=tablist]' }]);
      const r = await page.evaluate((kind) => {
        const sel = kind === 'glyph' ? '[class*="Button-module__button"][data-glyph]' : '[class*="Button-module__button"]:not([data-glyph]):not([class*="Button-module__iconOnly"]):not([class*="Button-module__bubble"])';
        const b = [...document.querySelectorAll<HTMLElement>(sel)].find((x) => x.getBoundingClientRect().width > 90 && x.querySelector('[class*="Button-module__label"]'));
        if (!b) return null;
        const label = b.querySelector<HTMLElement>('[class*="Button-module__label"]')!;
        b.style.flex = '0 0 auto';
        b.style.maxWidth = '60px';
        const capOnly = { b: b.getBoundingClientRect().width, words: label.scrollWidth, shown: label.clientWidth };
        b.style.minWidth = '0';
        const box = b.getBoundingClientRect();
        const l = label.getBoundingClientRect();
        const g = b.querySelector('[data-glyph-mark]')?.getBoundingClientRect();
        return { capOnly, own: { b: box.width, right: box.right, labelRight: l.right, cut: label.scrollWidth > label.clientWidth, glyphRight: g ? g.right : null, glyphLeft: g ? g.left : null } };
      }, kind);
      expect(r, 'a drawn button with words').not.toBeNull();
      // A cap alone: the minimum (its words) wins, nothing is cut.
      expect(r!.capOnly.b).toBeGreaterThan(60);
      expect(r!.capOnly.words).toBeLessThanOrEqual(r!.capOnly.shown + 1);
      // Its own minimum under the cap: 60 wide, the words cut with an ellipsis inside the frame, never spilling.
      expect(r!.own.b).toBeLessThanOrEqual(60.5);
      expect(r!.own.cut).toBe(true);
      expect(r!.own.labelRight).toBeLessThanOrEqual(r!.own.right + 1);
      if (kind === 'glyph') {
        expect(r!.own.glyphLeft, 'the glyph stays after the cut label').toBeGreaterThanOrEqual(r!.own.labelRight - 0.5);
        expect(r!.own.glyphRight, 'and inside the frame').toBeLessThanOrEqual(r!.own.right + 1);
      }
    });
  }
});

test.describe('tab badges past the strip', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a badge wholly past an edge of a tab strip marks that side’s chevron with a dot; one in view marks none', async ({ page }) => {
    await gotoHub(page, BOT(), { state: 'working' });
    await page.locator('[role=tablist]').first().waitFor({ timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const strips = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[role=tablist]')].map((l) => {
        const scroller = l.parentElement!;
        const box = scroller.getBoundingClientRect();
        const strip = scroller.parentElement!;
        const past = { start: false, end: false };
        for (const b of l.querySelectorAll<HTMLElement>('[class*="Tabs-module__badge"]')) {
          const r = b.getBoundingClientRect();
          if (r.right <= box.left + 1) past.start = true;
          else if (r.left >= box.right - 1) past.end = true;
        }
        const dot = (side: string) => strip.querySelector(`:scope > [data-more="${side}"]`)?.hasAttribute('data-attention') ?? false;
        return { name: l.getAttribute('aria-label'), past, dots: { start: dot('start'), end: dot('end') }, badges: l.querySelectorAll('[class*="Tabs-module__badge"]').length };
      }),
    );
    expect(strips.length).toBeGreaterThan(0);
    for (const s of strips) expect(s.dots, JSON.stringify(s)).toEqual(s.past);
    // The Bot strip at 390 has a badge pushed past an edge: this proof is not vacuous.
    expect(strips.some((s) => s.past.start || s.past.end), JSON.stringify(strips)).toBe(true);
  });
});
