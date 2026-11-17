// Playwright ("Mono caps tag"): a StatusPill is one 20 px tag with square corners, its words in Geist
// Mono 10.5 px capitals, a 6 px square dot, and one tone map (ok green, warn yellow, bad red, neutral grey: fill, edge,
// text and dot). A Tag takes the same box and tone map in plain Geist 11 px: it may hold a name a person typed, so it is
// never set in capitals. In light the values are the design's; dark pairs are derived, and in both themes a
// tag's words are 4.5:1 or more on its own fill. The Logs Result cell's "Failed" is a readable tag inside its column.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/strings.en.json';
import pieces from '../gallery/kit3.strings.en.json';
import logs from '../../pages/logs/strings.en.json';
import todos from '../../pages/ai/auto/todos/List.strings.en.json';
import { links as aiLinks } from '../../pages/ai/links';
import { choosePresentation } from '@app/e2e-toolbar';

/** The design's light values (fill / edge / text / dot), as the browser reports them. */
const LIGHT = {
  ok: ['rgb(214, 248, 226)', 'rgb(127, 207, 159)', 'rgb(11, 90, 54)', 'rgb(20, 163, 90)'],
  warn: ['rgb(241, 243, 214)', 'rgb(206, 213, 115)', 'rgb(91, 99, 0)', 'rgb(166, 179, 0)'],
  bad: ['rgb(255, 224, 218)', 'rgb(238, 146, 130)', 'rgb(183, 25, 2)', 'rgb(254, 54, 27)'],
  neutral: ['rgb(237, 237, 237)', 'rgb(196, 196, 196)', 'rgb(96, 96, 96)', 'rgb(156, 156, 156)'],
} as const;
type Role = keyof typeof LIGHT;

interface Read {
  text: string;
  height: number;
  radii: string[];
  family: string;
  size: string;
  transform: string;
  weight: string;
  tracking: string;
  padStart: string;
  padEnd: string;
  borderWidth: string;
  borderStyle: string;
  fill: string;
  edge: string;
  ink: string;
  /** Contrast of the words against the tag's own fill, laid over the page under it. */
  contrast: number;
  /** The words fit: nothing is clipped inside the tag. */
  fits: boolean;
  /** No ancestor that hides its overflow (a table cell, a list column) cuts the tag. */
  uncut: boolean;
  /** The dot (null when the tag has none): its size, corners and colour. */
  dot: { w: number; h: number; radius: string; fill: string } | null;
}

/** The tags whose words are `texts`, looked for inside `scope` (a selector; the page's main area by default). */
async function readTags(page: Page, texts: string[], scope = '#hub-main'): Promise<Read[]> {
  return page.evaluate(([want, within]) => {
    const probe = document.createElement('span');
    document.body.append(probe);
    const rgba = (c: string): [number, number, number, number] => {
      probe.style.color = '';
      probe.style.color = c;
      const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(probe).color);
      const p = (m?.[1] ?? '0,0,0').split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
    };
    const over = (top: number[], under: number[]) => [0, 1, 2].map((i) => top[i]! * top[3]! + under[i]! * (1 - top[3]!)).concat(1);
    const lum = (c: number[]) => {
      const f = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
    };
    const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
    /** What is painted under an element: its ancestors' backgrounds, bottom up. */
    const ground = (el: Element) => {
      const stack: string[] = [];
      for (let e: Element | null = el.parentElement; e; e = e.parentElement) stack.push(getComputedStyle(e).backgroundColor);
      let c = [255, 255, 255, 1];
      for (const b of stack.reverse()) c = over(rgba(b), c);
      return c;
    };
    const out: Read[] = [];
    const all = [...document.querySelectorAll<HTMLElement>(`${within} span`)];
    for (const text of want) {
      // The tag: the innermost drawn flex span whose words are `text` (a page's own wrapper around it may match too).
      const hits = all.filter((e) => (e.textContent ?? '').trim() === text && e.getBoundingClientRect().height > 0 && getComputedStyle(e).display.includes('flex'));
      const el = hits.find((e) => !hits.some((o) => o !== e && e.contains(o)));
      if (!el) { out.push({ text, height: 0 } as Read); continue; }
      const cs = getComputedStyle(el);
      const fill = over(rgba(cs.backgroundColor), ground(el));
      const dotEl = [...el.children].find((c) => c.getAttribute('aria-hidden') === 'true' && c.tagName === 'SPAN') as HTMLElement | undefined;
      const ds = dotEl ? getComputedStyle(dotEl) : null;
      const r = dotEl?.getBoundingClientRect();
      out.push({
        text,
        height: el.getBoundingClientRect().height,
        radii: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius],
        family: cs.fontFamily,
        size: cs.fontSize,
        transform: cs.textTransform,
        weight: cs.fontWeight,
        tracking: cs.letterSpacing,
        padStart: cs.paddingInlineStart,
        padEnd: cs.paddingInlineEnd,
        borderWidth: cs.borderTopWidth,
        borderStyle: cs.borderTopStyle,
        fill: cs.backgroundColor,
        edge: cs.borderTopColor,
        ink: cs.color,
        contrast: ratio(over(rgba(cs.color), fill), fill),
        fits: el.scrollWidth <= el.clientWidth + 0.5,
        uncut: (() => {
          const box = el.getBoundingClientRect();
          for (let e: Element | null = el.parentElement; e; e = e.parentElement) {
            const o = getComputedStyle(e);
            if (!/hidden|clip/.test(o.overflowX)) continue;
            const c = e.getBoundingClientRect();
            if (box.left < c.left - 0.5 || box.right > c.right + 0.5) return false;
          }
          return true;
        })(),
        dot: ds && r ? { w: r.width, h: r.height, radius: ds.borderTopLeftRadius, fill: ds.backgroundColor } : null,
      });
    }
    probe.remove();
    return out;
  }, [texts, scope] as const);
}

function expectPill(r: Read, at: string): void {
  expect.soft(r.height, `${at}: 20 px tall`).toBe(20);
  expect.soft(r.radii, `${at}: square corners`).toEqual(['0px', '0px', '0px', '0px']);
  expect.soft(r.family, `${at}: Geist Mono`).toMatch(/^"?Geist Mono"?/);
  expect.soft(r.size, `${at}: 10.5 px`).toBe('10.5px');
  expect.soft(r.transform, `${at}: capitals`).toBe('uppercase');
  expect.soft(r.weight, `${at}: medium`).toBe('500');
  expect.soft(r.tracking, `${at}: 0.04em tracking`).toBe('0.42px');
  expect.soft([r.padStart, r.padEnd], `${at}: 7 px sides`).toEqual(['7px', '7px']);
  expect.soft([r.borderWidth, r.borderStyle], `${at}: a 1 px edge`).toEqual(['1px', 'solid']);
  expect.soft(r.contrast, `${at}: words on the tag's fill`).toBeGreaterThanOrEqual(4.5);
  expect.soft(r.fits, `${at}: the words fit`).toBe(true);
  expect.soft(r.uncut, `${at}: not cut by its cell or column`).toBe(true);
}

function expectDot(r: Read, at: string): void {
  expect.soft(r.dot, `${at}: has a dot`).not.toBeNull();
  if (!r.dot) return;
  expect.soft([r.dot.w, r.dot.h, r.dot.radius], `${at}: a 6 px square dot`).toEqual([6, 6, '0px']);
}

function expectTone(r: Read, role: Role, at: string): void {
  const [fill, edge, ink, dot] = LIGHT[role];
  expect.soft([r.fill, r.edge, r.ink], `${at}: the ${role} fill, edge and text`).toEqual([fill, edge, ink]);
  if (r.dot) expect.soft(r.dot.fill, `${at}: the ${role} dot`).toBe(dot);
}

const PILLS: [string, Role | 'accent', boolean][] = [
  [gallery['pill.neutral'], 'neutral', false],
  [gallery['pill.ok'], 'ok', true],
  [gallery['pill.danger'], 'bad', true],
  [gallery['pill.info'], 'neutral', true],
  [gallery['pill.accent'], 'accent', false],
];

for (const theme of ['light', 'dark'] as const) {
  test(`a StatusPill is the 20 px mono caps tag with a 6 px square dot, in its tone (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 900 });
    await gotoHub(page, '/_kit?tab=data', { theme });
    await expect(page.getByText(gallery['pill.ok'], { exact: true }).first()).toBeVisible(); // reason: Healthy is also a Facts value on this tab; either drawn means the tab is up
    const rows = await readTags(page, [...PILLS.map(([t]) => t), gallery['pill.warn']]);
    for (const [i, [text, role, dot]] of PILLS.entries()) {
      const r = rows[i]!;
      expectPill(r, `${theme} ${text}`);
      if (dot) expectDot(r, `${theme} ${text}`);
      if (theme === 'light' && role !== 'accent') expectTone(r, role, `${theme} ${text}`);
    }
    // Degraded carries an icon, not a dot: the box and the warn tone still hold.
    const warn = rows[PILLS.length]!;
    expectPill(warn, `${theme} ${gallery['pill.warn']}`);
    if (theme === 'light') expectTone(warn, 'warn', `${theme} ${gallery['pill.warn']}`);
    // Dark: each tone is its own pair, never the light fill.
    if (theme === 'dark') for (const [i, [text, role]] of PILLS.entries()) if (role !== 'accent') expect.soft(rows[i]!.fill, `dark ${text}: a dark fill`).not.toBe(LIGHT[role][0]);
  });

  test(`a Tag takes the same box and tone in plain Geist 11 px, never capitals (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 900 });
    await gotoHub(page, '/_kit?tab=pieces', { theme });
    await expect(page.getByText(pieces['tag.plain'], { exact: true }).first()).toBeVisible(); // reason: Included is on several plan cards; one drawn means the tab is up
    const [plain, accent] = await readTags(page, [pieces['tag.plain'], pieces['plan.next']]);
    for (const r of [plain!, accent!]) {
      const at = `${theme} ${r.text}`;
      expect.soft(r.height, `${at}: 20 px tall`).toBe(20);
      expect.soft(r.radii, `${at}: square corners`).toEqual(['0px', '0px', '0px', '0px']);
      expect.soft(r.family, `${at}: plain Geist`).not.toMatch(/Mono/);
      expect.soft(r.size, `${at}: 11 px`).toBe('11px');
      expect.soft(r.transform, `${at}: as written`).toBe('none');
      expect.soft([r.padStart, r.padEnd], `${at}: 7 px sides`).toEqual(['7px', '7px']);
      expect.soft(r.contrast, `${at}: words on the tag's fill`).toBeGreaterThanOrEqual(4.5);
      expect.soft(r.fits, `${at}: the words fit`).toBe(true);
    }
    if (theme === 'light') expectTone(plain!, 'neutral', `${theme} ${plain!.text}`);
  });

  for (const width of [1350, 2400, 390]) {
    test(`the Logs Result cell's Failed is a readable tag inside its column at ${width} (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, '/logs?src=everything&sev=failed', { theme });
      await expect(page.getByText(logs['out.failed'], { exact: true }).first()).toBeVisible(); // reason: every failed row carries it; the first drawn means the list is up
      const [r] = await readTags(page, [logs['out.failed']]);
      expectPill(r!, `${theme} ${width} Failed`);
      expectDot(r!, `${theme} ${width} Failed`);
      if (theme === 'light') expectTone(r!, 'bad', `${theme} ${width} Failed`);
      // Every outcome tag in the list keeps its words whole and lies inside its column, both edges.
      const cells = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#hub-main button[data-key] > span:nth-child(2)')].map((c) => {
        const p = c.firstElementChild as HTMLElement | null;
        return p ? { text: (p.textContent ?? '').trim(), fits: p.scrollWidth <= p.clientWidth + 0.5, inside: ((pr, cr) => pr.left >= cr.left - 0.5 && pr.right <= cr.right + 0.5)(p.getBoundingClientRect(), c.getBoundingClientRect()) } : null;
      }).filter((x) => x !== null));
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.filter((c) => !c.fits || !c.inside), `${theme} ${width}: outcome tags cut or past their column`).toEqual([]);
    });

    // The Failed list holds one outcome only, so this list (every severity) proves each outcome
    // the default fixture serves is drawn, the widest ("Too many requests") among them, and then checks each one's
    // geometry. Problem (another 4xx) and Turned away (a script's) are not in the default fixture.
    test(`every Logs outcome the fixture serves is drawn whole inside its column at ${width} (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, '/logs?src=everything', { theme });
      const want = [logs['out.ok'], logs['out.notFound'], logs['out.tooMany'], logs['out.failed'], logs['out.refused']];
      for (const w of want) await expect(page.getByText(w, { exact: true }).first()).toBeVisible(); // reason: each outcome drawn, not just some
      const cells = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#hub-main button[data-key] > span:nth-child(2)')].map((c) => {
        const p = c.firstElementChild as HTMLElement | null;
        return p ? { text: (p.textContent ?? '').trim(), fits: p.scrollWidth <= p.clientWidth + 0.5, inside: ((pr, cr) => pr.left >= cr.left - 0.5 && pr.right <= cr.right + 0.5)(p.getBoundingClientRect(), c.getBoundingClientRect()) } : null;
      }).filter((x) => x !== null));
      expect([...new Set(cells.map((c) => c.text))].sort(), `${theme} ${width}: the outcomes in the Result column`).toEqual([...want].sort());
      expect(cells.filter((c) => !c.fits || !c.inside), `${theme} ${width}: outcome tags cut or past their column`).toEqual([]);
    });
  }

  test(`the Computers cards' state is the StatusPill: ok for running, bad for failed (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 1000 });
    await gotoHub(page, '/computers', { theme });
    await choosePresentation(page.locator('#hub-main'), 'cards');
    const state = (name: string, tone: string): Locator => page.getByRole('article', { name, exact: true }).locator(`[data-tone="${tone}"]`);
    for (const [name, tone, role] of [['atlas', 'run', 'ok'], ['ember', 'fail', 'bad']] as const) {
      const at = state(name, tone);
      await expect(at).toBeVisible({ timeout: 15_000 });
      await at.evaluate((e, n) => e.setAttribute('data-d12-card', n), name);
      const [r] = await readTags(page, [(await at.textContent())!.trim()], `[data-d12-card="${name}"]`);
      expectPill(r!, `${theme} ${name} card`);
      expectDot(r!, `${theme} ${name} card`);
      if (theme === 'light') expectTone(r!, role, `${theme} ${name} card`);
    }
  });

  for (const width of [1350, 390]) {
    test(`a TODO's Waiting state keeps its whole words in its column, one proposed run or several, at ${width} (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, `${aiLinks.todos}?tab=waiting`, { theme });
      const two = todos['waiting.proposals_other'].replace('{{count}}', '2');
      await expect(page.getByText(two, { exact: true })).toBeVisible({ timeout: 20_000 });
      for (const r of await readTags(page, [two, todos['tab.waiting']])) {
        expectPill(r, `${theme} ${width} ${r.text}`);
        if (theme === 'light') expectTone(r, 'warn', `${theme} ${width} ${r.text}`);
      }
      // The other supported words, one run and the longest count, set in the same tag in its cell: whole and uncut too.
      const one = todos['waiting.proposals_one'];
      const many = todos['waiting.proposals_other'].replace('{{count}}', '99');
      for (const words of [one, many]) {
        await page.getByText(two, { exact: true }).evaluate((e, w) => { e.setAttribute('data-d12-words', ''); (e.lastChild as Text).data = w; }, words);
        const [r] = await readTags(page, [words]);
        expectPill(r!, `${theme} ${width} ${words}`);
        await page.locator('[data-d12-words]').evaluate((e, w) => { (e.lastChild as Text).data = w; }, two);
      }
    });
  }
}
