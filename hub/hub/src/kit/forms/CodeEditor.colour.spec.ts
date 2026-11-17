// Playwright: the CodeEditor's colour mirror lies glyph for glyph under its
// textarea in a real browser. The gallery's coloured editor (lang ts), at a desktop and a phone width, with and without
// a caller's rule of the scripts editor's shape and weight (`.x textarea { line-height … }`, one class and one type):
// both layers compute the same glyph metrics, share one box, and keep the same scroll offsets at both ends of both
// axes, after edits that add lines, with a trailing newline, and when the mirror comes back from the 64 KiB cap.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const GALLERY = '/_kit?tab=secure&part=editor';
// The scripts editor's rule (pages/scripts/parts/parts.module.css .editor textarea), made sharper on every metric.
const CALLER = '.kecCaller textarea { font-size: 12px; line-height: 1.5; letter-spacing: 1px; word-spacing: 3px; padding: 0; tab-size: 8; font-style: italic; text-indent: 4px; white-space: pre-wrap; text-align: center; }';
const METRICS = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontKerning', 'fontVariantLigatures', 'fontFeatureSettings', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'textTransform', 'tabSize', 'whiteSpace', 'textAlign', 'paddingTop', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth'] as const;
const LONG = Array.from({ length: 80 }, (_, i) => (i === 40 ? `const wide = '${'w'.repeat(400)}'; // a comment, in italics in a code block` : `const line${i} = ${i}; // note ${i}`)).join('\n');

async function open(page: Page, caller: boolean): Promise<Locator> {
  await gotoHub(page, GALLERY);
  const ta = page.getByRole('textbox', { name: 'Code' });
  await expect(ta).toBeVisible();
  // The editor's root (textarea < pane < body < editor): where a caller's className lands (CodeEditor className). A fixed
  // height, as a page's pane gives it, so the textarea scrolls instead of the editor growing with its gutter.
  await ta.evaluate((el, caller) => {
    const root = el.parentElement!.parentElement!.parentElement!;
    root.style.height = '320px';
    if (caller) root.classList.add('kecCaller');
  }, caller);
  if (caller) await page.addStyleTag({ content: CALLER });
  return ta;
}

/** Sets the textarea's text as typing would (React reads the input event). */
async function setText(ta: Locator, text: string) {
  await ta.evaluate((el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
}

/** Every glyph metric of both layers, their boxes, and their scroll offsets after a scroll to (top, left). */
async function read(ta: Locator, to?: { top: number; left: number }) {
  return ta.evaluate((el, { metrics, to }) => {
    const t = el as HTMLTextAreaElement;
    const pre = t.parentElement!.querySelector('pre');
    if (to) { t.scrollTop = to.top; t.scrollLeft = to.left; t.dispatchEvent(new Event('scroll')); }
    const cs = getComputedStyle(t);
    const ms = pre ? getComputedStyle(pre) : null;
    const diff = metrics.filter((k) => ms && cs[k as keyof CSSStyleDeclaration] !== ms[k as keyof CSSStyleDeclaration]).map((k) => `${k}: ${String(cs[k as keyof CSSStyleDeclaration])} vs ${String(ms![k as keyof CSSStyleDeclaration])}`);
    const a = t.getBoundingClientRect(), b = pre?.getBoundingClientRect();
    // Each token's glyphs keep the layer's style: no italic or weight of their own.
    const odd = pre ? [...pre.querySelectorAll('span')].filter((s) => { const x = getComputedStyle(s); return x.fontStyle !== ms!.fontStyle || x.fontWeight !== ms!.fontWeight; }).length : 0;
    return {
      mirror: !!pre, diff, odd,
      box: b ? [a.left - b.left, a.top - b.top, a.width - b.width, a.height - b.height].map((n) => Math.round(n * 100) / 100) : null,
      ta: { top: t.scrollTop, left: t.scrollLeft, maxTop: t.scrollHeight - t.clientHeight, maxLeft: t.scrollWidth - t.clientWidth },
      pre: pre ? { top: pre.scrollTop, left: pre.scrollLeft } : null,
    };
  }, { metrics: METRICS as readonly string[], to });
}

/** Right after an edit or a mirror transition, before the test scrolls anything: the mirror is already at the textarea's
    own (nonzero) offsets, so only the component's resync can have put it there. */
async function retained(ta: Locator, label: string) {
  const r = await read(ta);
  expect(r.mirror, label).toBe(true);
  expect(r.ta.top, `${label}: a vertical offset to keep`).toBeGreaterThan(0);
  expect(r.ta.left, `${label}: a horizontal offset to keep`).toBeGreaterThan(0);
  expect(r.pre, label).toEqual({ top: r.ta.top, left: r.ta.left });
  expect(r.diff, label).toEqual([]);
}

async function aligned(ta: Locator, label: string) {
  const range = await read(ta);
  expect(range.ta.maxTop, `${label}: the textarea scrolls down`).toBeGreaterThan(400);
  expect(range.ta.maxLeft, `${label}: the textarea scrolls across`).toBeGreaterThan(400);
  for (const to of [{ top: 0, left: 0 }, { top: 1e6, left: 1e6 }, { top: 1e6, left: 0 }, { top: 0, left: 1e6 }]) {
    const r = await read(ta, to);
    const at = `${label} at ${JSON.stringify(to)}`;
    expect(r.mirror, at).toBe(true);
    expect(r.diff, at).toEqual([]);
    expect(r.odd, at).toBe(0);
    expect(r.box, at).toEqual([0, 0, 0, 0]);
    // The mirror reaches every offset the textarea reaches: never clamped short at the end of either axis.
    expect(r.pre, at).toEqual({ top: r.ta.top, left: r.ta.left });
    if (to.top) expect(r.ta.top, at).toBe(r.ta.maxTop);
    if (to.left) expect(r.ta.left, at).toBe(r.ta.maxLeft);
  }
}

for (const width of [1440, 390]) {
  for (const caller of [false, true]) {
    test(`@kec1b at ${width}px${caller ? ' with a caller textarea rule' : ''} the mirror lies under the textarea`, async ({ page }) => {
      // Four aligned() passes of five reads each plus a 64 KiB text: past the default 30 s on a loaded host.
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 900 });
      const ta = await open(page, caller);
      await setText(ta, LONG);
      await aligned(ta, 'long text');
      // Edits that add lines and end on a newline, from a kept offset on both axes: the mirror follows on its own.
      await read(ta, { top: 300, left: 200 });
      await setText(ta, LONG.replace('const line10', 'const add1 = 1;\nconst add2 = 2;\nconst line10') + '\n');
      await retained(ta, 'after adding lines and a trailing newline');
      await aligned(ta, 'after adding lines and a trailing newline');
      await ta.focus();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nmore();\nand();\n');
      // Typed at the end: the caret's line is in reach (bottom), and the mirror is where the textarea went.
      const typed = await read(ta);
      expect(typed.pre, 'after typing lines').toEqual({ top: typed.ta.top, left: typed.ta.left });
      expect(typed.ta.top, 'after typing lines').toBeGreaterThan(0);
      await aligned(ta, 'after typing lines');
      // Over the cap the mirror is off; back under it, it returns where the textarea is. The over-cap text pads the last
      // line, so the line count stays the same across the transition and only `painted` can trigger the resync.
      await read(ta, { top: 1e6, left: 300 });
      await setText(ta, LONG + 'x'.repeat(64 * 1024));
      expect((await read(ta)).mirror).toBe(false);
      await read(ta, { top: 600, left: 300 });
      await setText(ta, LONG);
      await retained(ta, 'back under 64 KiB');
      await aligned(ta, 'back under 64 KiB');
    });
  }
}

/** The textarea's lines against the gutter's numbers: the same line height, and line n's top where number n's top is. */
async function gutterGap(ta: Locator) {
  return ta.evaluate((el) => {
    const t = el as HTMLTextAreaElement;
    let body = t.parentElement!;
    while (!body.querySelector(':scope > div[aria-hidden="true"]')) body = body.parentElement!;
    const nums = [...body.querySelectorAll(':scope > div[aria-hidden="true"] > div > div')] as HTMLElement[];
    const cs = getComputedStyle(t);
    const lh = parseFloat(cs.lineHeight);
    const first = t.getBoundingClientRect().top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop) - t.scrollTop;
    const off = nums.slice(0, 12).map((n, i) => Math.round((n.getBoundingClientRect().top - (first + i * lh)) * 100) / 100);
    return { lh, num: nums[0] ? nums[0].getBoundingClientRect().height : 0, count: nums.length, off };
  });
}

// A caller's textarea rule must not move the caret's lines off the gutter.
// The scripts Code tab is the real caller (`.editor textarea { line-height: 1.5 }`, no lang, so no mirror); the gallery
// editor (lang ts) gets the same rule's sharper copy.
for (const where of ['scripts', 'gallery'] as const) {
  test(`@kec1b ${where} editor: each line sits beside its line number under a caller textarea rule`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    let ta: Locator;
    if (where === 'scripts') {
      await gotoHub(page, '/scripts?sel=atlas.00a1~weather.ts&tab=code');
      ta = page.getByRole('textbox', { name: 'Script code' });
      await expect(ta).toBeVisible();
    } else {
      ta = await open(page, true);
      await setText(ta, LONG);
    }
    const g = await gutterGap(ta);
    expect(g.count, 'line numbers').toBeGreaterThan(1);
    expect(g.num, 'number height = textarea line height').toBe(g.lh);
    expect(g.off, 'line n vs number n').toEqual(g.off.map(() => 0));
  });
}
