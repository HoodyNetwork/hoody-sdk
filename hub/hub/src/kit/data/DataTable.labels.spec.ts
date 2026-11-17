// Playwright: list-row field labels (column meta listLabel) at 390 on the kit gallery's list table.
// No gallery column opts in, so a labelled field is built from the real CSS module classes inside a
// real line 2 and measured against the shipped CSS: a label never shrinks for a long value, and a label
// wider than half its field stops there with its own ellipsis while the value stays in view. Later
// fields (their " · " separators included) never show in part. The class lookup relies on the dev
// server's readable module class names ([name]__[local], then a hash); it throws, never passes, if they change.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
interface Measure {
  line: Box;
  field: Box;
  label: { width: number; cut: boolean; styled: boolean };
  value: Box & { cut: boolean };
  later: (Box & { cut: boolean })[];
}

/** Put a labelled field first on the first list row's line 2 and measure it. */
async function measure(page: Page, label: string, value: string): Promise<Measure> {
  return page.evaluate(
    ({ labelText, valueText }) => {
      const meta = document.querySelector('[class*="listMeta"]') as HTMLElement;
      const itemCls = (meta.querySelector('[class*="listItem"]') as HTMLElement).className;
      const valueCls = (meta.querySelector('[class*="listValue"]') as HTMLElement).className;
      // No row draws a label, so its class comes from the loaded stylesheet: the dev name of the same module's
      // .listLabel (each dev name carries its own hash, so it cannot be derived from listItem's).
      const modulePrefix = /([\w-]+-module__)listItem/.exec(itemCls)?.[1];
      if (!modulePrefix) throw new Error(`no readable listItem class in "${itemCls}"`);
      // The whole dev name: listLabel, then `_` and the 5-character hash (vite.config.mts), and nothing more.
      const labelRe = new RegExp(`\\.(${modulePrefix}listLabel_[\\w-]{5})(?![\\w-])`);
      // Rules nested in @media/@container included; a cross-origin sheet (fonts) cannot be read and is skipped.
      const rules = (list: CSSRuleList): CSSRule[] => Array.from(list).flatMap((r) => [r, ...('cssRules' in r ? rules((r as CSSGroupingRule).cssRules) : [])]);
      const readable = (sheet: CSSStyleSheet) => {
        try {
          return rules(sheet.cssRules);
        } catch {
          return [];
        }
      };
      const labelCls = Array.from(document.styleSheets)
        .flatMap(readable)
        .map((rule) => labelRe.exec((rule as CSSStyleRule).selectorText ?? '')?.[1])
        .find(Boolean);
      if (!labelCls) throw new Error(`no ${modulePrefix}listLabel rule in the page's stylesheets`);
      meta.querySelector('[data-probe]')?.remove();
      const item = document.createElement('span');
      item.className = itemCls;
      item.dataset.probe = '';
      const l = document.createElement('span');
      l.className = labelCls;
      l.textContent = labelText;
      const v = document.createElement('span');
      v.className = valueCls;
      v.textContent = valueText;
      item.append(l, v);
      meta.prepend(item);
      const box = (e: Element) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      const ls = getComputedStyle(l);
      return {
        line: box(meta),
        field: box(item),
        label: { width: l.getBoundingClientRect().width, cut: l.scrollWidth > l.clientWidth + 1, styled: ls.textOverflow === 'ellipsis' && ls.overflow === 'hidden' },
        value: { ...box(v), cut: v.scrollWidth > v.clientWidth + 1 },
        later: Array.from(meta.children)
          .slice(1)
          .filter((e) => getComputedStyle(e).display !== 'none')
          .map((e) => ({ ...box(e), cut: e.scrollWidth > e.clientWidth + 1 })),
      };
    },
    { labelText: label, valueText: value },
  );
}

// Half-pixel slack: a wrapped field's top sits exactly at the line's bottom; sub-pixel widths overflow by under 1 px.
const onLine = (m: Measure, f: Box) => f.top < m.line.bottom - 0.5 && f.bottom > m.line.top + 0.5;

/** The probe sits on the visible line, and every later field is either whole on it or wholly off it. */
function lineRules(m: Measure): void {
  expect(m.line.right - m.line.left).toBeGreaterThan(150);
  expect(m.line.right - m.line.left).toBeLessThanOrEqual(390);
  expect(onLine(m, m.field)).toBe(true);
  expect(m.field.right).toBeLessThanOrEqual(m.line.right + 0.5);
  expect(m.later.length).toBeGreaterThan(0);
  for (const f of m.later.filter((f) => onLine(m, f))) {
    expect(f.cut).toBe(false);
    expect(f.right).toBeLessThanOrEqual(m.line.right + 0.5);
  }
}

async function open(page: Page): Promise<void> {
  test.setTimeout(60_000);
  await gotoHub(page, '/_kit?tab=table');
  await page.locator('[class*="listMeta"] [class*="listItem"]').first().waitFor({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

test('an over-wide label stops at half its field with an ellipsis; the value stays in view', async ({ page }) => {
  await open(page);
  const m = await measure(page, 'A label far wider than the whole phone line, which must stop halfway', 'Oct 30');
  const fieldW = m.field.right - m.field.left;
  expect(m.label.styled).toBe(true);
  expect(m.label.cut).toBe(true);
  expect(m.label.width).toBeLessThanOrEqual(fieldW / 2 + 0.5);
  expect(m.label.width).toBeGreaterThanOrEqual(fieldW / 2 - 1);
  expect(m.value.cut).toBe(false);
  expect(m.value.right - m.value.left).toBeGreaterThan(20);
  expect(m.value.right).toBeLessThanOrEqual(m.line.right + 0.5);
  lineRules(m);
});

test('a short label stays whole beside a value too long for the line', async ({ page }) => {
  await open(page);
  const m = await measure(page, 'Ends', 'A plain value far too long to fit on one phone line in any way at all');
  expect(m.label.styled).toBe(true);
  expect(m.label.cut).toBe(false);
  lineRules(m);
});

test('a short labelled field leaves room: the next field and its separator show whole', async ({ page }) => {
  await open(page);
  const m = await measure(page, 'Ends', 'Oct 30');
  expect(m.label.styled).toBe(true);
  expect(m.label.cut).toBe(false);
  expect(m.value.cut).toBe(false);
  expect(m.later.some((f) => onLine(m, f))).toBe(true);
  lineRules(m);
});
