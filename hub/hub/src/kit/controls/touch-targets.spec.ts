// Playwright: on a coarse pointer every kit button that carries words (Button and LinkButton of any size, TextButton,
// so a Band's actions too) is a real 44px target in the layout: its own box is at least 44 x 44, it overlaps no other
// target (rows that wrap included; two icon-only buttons are judged by their own placement, not here), a touch 21px
// off its centre lands on it, wrapped rows of targets leave the 8px touch gap, and compact density does not shrink it.
// Icon-only buttons keep the size they had (none is given a minimum, none is past 44). With a fine pointer nothing
// changes: the touch tokens resolve to 0 and no kit button takes a minimum size or the touch layout.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import computers from '../../pages/computers/strings.en.json';
import firewall from '../../pages/computers/parts/Firewall.strings.en.json';
import table from '../data/DataTable.strings.en.json';
import forms from '../forms/forms.strings.en.json';
import gallery from '../gallery/strings.en.json';
import kitStrings from '../strings.en.json';

// Kit buttons by their module class (dev class names are `<file>__<class>`): words-carrying, and icon-only.
const WORDS = '[class*="Button-module__button"]:not([class*="Button-module__iconOnly"]), [class*="Link-module__textButton"]';
const ICON = '[class*="Button-module__iconOnly"]';
// A code line's copy cell (Ids CodeBlock steps and the inline CodeLine, an IconButton) is a cell of its line: as tall as
// the line on every pointer (a wrapped line makes it taller), so it is held to the 44 floor, not to an icon button's own
// square.
const LINE_CELL = '[class*="Ids-module__lineCopy"], [class*="Ids-module__codeInlineCopy"]';
// Gallery tabs that draw no kit button with words (only icon buttons or other controls): no non-empty floor there.
const NO_WORDS = new Set(['nav', 'qr']);
// A button with words is never narrower than them: at 390 on a touch screen the Data tab's only button
// with words, its table's Filters, no longer fits beside the search whole, so the toolbar's own fit (useRowFit) draws it as
// its icon there, as it already does on a fine pointer at 390 (it once showed "Filt…"). That tab waits for the icon.
const COARSE_NO_WORDS = new Set([...NO_WORDS, 'data']);
const GALLERY_TABS = ['actions', 'controls', 'data', 'forms', 'overlays', 'states', 'text', 'feedback', 'nav', 'qr', 'widgets', 'table', 'dataview', 'secure', 'pieces'];

interface Problems {
  /** Words-carrying targets under 44 x 44. */
  small: string[];
  /** Icon-only buttons given a minimum size, or grown past a 44 square. */
  icons: string[];
  /** Pairs of targets whose boxes overlap. */
  overlaps: string[];
  /** Targets that do not own the points 21px above and below their centre (covered or clipped). */
  unowned: string[];
  /** Targets stacked one over the other (their columns meet) with less than the 8px touch gap between them. */
  tight: string[];
}

/** Measures every visible kit target under `scope` (a CSS selector) on the page as it is now. Overlaps count when
 *  one of the two carries words (icon-only buttons keep their size and placement). */
async function audit(page: Page, scope: string, opts: { gaps?: boolean } = {}): Promise<Problems & { words: number }> {
  return page.evaluate(
    ({ scope, words, icon, lineCell, gaps }) => {
      const name = (el: Element) => ((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40));
      const shown = (el: HTMLElement) => {
        if (el.closest('[inert], [aria-hidden="true"]')) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && cs.display !== 'none';
      };
      // The box a finger has. Only a kit button that draws smaller than its target (the xs size draws 24; a small icon
      // button that keeps a press of its own) takes the rest from ::after, centred on it. `unowned` below proves that box takes the press, and every other control is judged by what it draws.
      const targetBox = (el: Element) => {
        const r = el.getBoundingClientRect();
        const after = getComputedStyle(el, '::after');
        const cls = [...el.classList];
        const small = cls.some((c) => /(^|_)xs(_|$)/.test(c)) || (cls.some((c) => /(^|_)sm(_|$)/.test(c)) && cls.some((c) => /(^|_)iconOnly(_|$)/.test(c)));
        if (!small || after.position !== 'absolute') return r;
        const height = Math.max(r.height, parseFloat(after.height) || 0);
        const width = Math.max(r.width, parseFloat(after.width) || 0);
        const top = r.top + (r.height - height) / 2;
        const left = r.left + (r.width - width) / 2;
        return { top, left, height, width, bottom: top + height, right: left + width };
      };
      const roots = [...document.querySelectorAll<HTMLElement>(scope)];
      const pick = (sel: string) => [...new Set(roots.flatMap((r) => [...r.querySelectorAll<HTMLElement>(sel)]))].filter(shown);
      const wordsEls = pick(words);
      const iconEls = pick(icon);
      const out = { small: [] as string[], icons: [] as string[], overlaps: [] as string[], unowned: [] as string[], tight: [] as string[], words: wordsEls.length };
      for (const el of wordsEls) {
        const r = targetBox(el);
        if (r.height < 43.5 || r.width < 43.5) out.small.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      for (const el of iconEls) {
        const r = el.getBoundingClientRect();
        if (el.matches(lineCell)) {
          // Its height follows the line; its width is the 44 square's.
          if (r.height < 43.5 || r.width < 43.5) out.small.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
          if (r.width > 44.5) out.icons.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)} wide`);
          continue;
        }
        const cs = getComputedStyle(el);
        const sized = !['0px', 'auto'].includes(cs.minHeight) || !['0px', 'auto'].includes(cs.minWidth);
        if (sized || r.height > 44.5 || r.width > 44.5) out.icons.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}${sized ? ' min' : ''}`);
      }
      // Whether scroller `sc`, an ancestor of `el`, clips it. Not when something on the way out is fixed, or absolute with no
      // positioned box inside `sc` to hold it (and `sc` itself not positioned): that target is drawn past the box. A containing
      // block this walk does not look for (a transform) reads as not clipped, which keeps that target's whole box.
      const clips = (el: Element, sc: Element) => {
        for (let e: Element | null = el; e && e !== sc; ) {
          const pos = getComputedStyle(e).position;
          if (pos === 'fixed') return false;
          if (pos !== 'absolute') {
            e = e.parentElement;
            continue;
          }
          let c: Element | null = e.parentElement;
          while (c && c !== sc && getComputedStyle(c).position === 'static') c = c.parentElement;
          if (c === sc && getComputedStyle(sc).position === 'static') return false;
          e = c;
        }
        return true;
      };
      // The scroll boxes around a target, nearest first, as page-coordinate boxes, with whether each clips it.
      const scrollersOf = (el: Element) => {
        const out: { el: Element; clips: boolean; l: number; t: number; r: number; b: number }[] = [];
        for (let p = el.parentElement; p; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (/auto|scroll/.test(cs.overflowY) || /auto|scroll/.test(cs.overflowX)) {
            const b = p.getBoundingClientRect();
            out.push({ el: p, clips: clips(el, p), l: b.left + scrollX, t: b.top + scrollY, r: b.right + scrollX, b: b.bottom + scrollY });
          }
        }
        return out;
      };
      // Page coordinates, so targets far apart on a long page compare without scrolling.
      const all = [...wordsEls.map((el) => ({ el, words: true })), ...iconEls.map((el) => ({ el, words: false }))].map(({ el, words }) => {
        const r = targetBox(el);
        return { el, words, scrollers: scrollersOf(el), l: r.left + scrollX, t: r.top + scrollY, r: r.right + scrollX, b: r.bottom + scrollY };
      });
      type Box = { l: number; t: number; r: number; b: number };
      const within = (a: Box, s: Box): Box => ({ l: Math.max(a.l, s.l), t: Math.max(a.t, s.t), r: Math.min(a.r, s.r), b: Math.min(a.b, s.b) });
      // A scroll box both targets sit in, by the DOM, clips neither, whatever it does to each: two in one box are judged whole. A
      // scroll box only one sits in clips that one if it really does: only what it shows can meet, and a row scrolled out of it is
      // drawn nowhere, so no finger reaches it there.
      const shownBoxes = (a: (typeof all)[number], b: (typeof all)[number]): [Box, Box] => {
        const own = (x: (typeof all)[number], other: (typeof all)[number]) => x.scrollers.filter((s) => s.clips && !other.scrollers.some((o) => o.el === s.el)).reduce<Box>(within, x);
        return [own(a, b), own(b, a)];
      };
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i]!;
          const b = all[j]!;
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          if (!a.words && !b.words) continue;
          const [sa, sb] = shownBoxes(a, b);
          if (sa.r <= sa.l || sa.b <= sa.t || sb.r <= sb.l || sb.b <= sb.t) continue; // wholly out of its box: it meets nothing
          const w = Math.min(sa.r, sb.r) - Math.max(sa.l, sb.l);
          const h = Math.min(sa.b, sb.b) - Math.max(sa.t, sb.t);
          if (w > 0.5 && h > 0.5) out.overlaps.push(`${name(a.el)} / ${name(b.el)}`);
          // Wrapped rows (opted in for the containers that wrap targets): one target above the other in a shared column.
          else if (gaps && w > 0.5 && h <= 0.5 && -h < 7.5) out.tight.push(`${name(a.el)} / ${name(b.el)} ${Math.round(-h)}px`);
        }
      for (const el of wordsEls) {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        const y = r.top + r.height / 2;
        const misses: string[] = [];
        for (const dy of [-21, 21])
          for (const x of [r.left + 2, r.left + r.width / 2, r.right - 2]) {
            const t = document.elementFromPoint(x, y + dy);
            if (!t || !(t === el || el.contains(t))) misses.push(`${Math.round(x - r.left)},${dy}`);
          }
        if (misses.length) out.unowned.push(`${name(el)} ${misses.join(' ')}`);
      }
      return out;
    },
    { scope, words: WORDS, icon: ICON, lineCell: LINE_CELL, gaps: opts.gaps ?? false },
  );
}

const clean: Problems = { small: [], icons: [], overlaps: [], unowned: [], tight: [] };

/** The audit finds at least one target with words under `scope` (an empty match is never clean) and no problem. */
async function expectClean(page: Page, scope: string, opts: { gaps?: boolean; empty?: boolean } = {}) {
  const { words, ...problems } = await audit(page, scope, opts);
  if (!opts.empty) expect(words, `targets with words under ${scope}`).toBeGreaterThan(0);
  expect(problems).toEqual(clean);
}

// The audit's own fixture: two scroll boxes, each a real overflow:auto box, with a target in each. A target scrolled out of
// its box is not an overlap; two that both show and meet are, and so are two in the one box wherever it is scrolled.
test.describe('the overlap audit', () => {
  const b = (name: string, css: string) => `<button class="Button-module__button" aria-label="${name}" style="position:absolute;left:0;width:60px;height:44px;${css}">x</button>`;
  const box = (top: number, h: number, inner: string) => `<div style="position:absolute;left:0;top:${top}px;width:200px;height:${h}px;overflow:auto"><div style="position:relative;height:600px">${inner}</div></div>`;
  const run = async (page: Page, html: string) => {
    await page.setContent(`<main id="root">${html}</main>`);
    return (await audit(page, '#root')).overlaps;
  };
  test('a target scrolled out of its box meets nothing below the box', async ({ page }) => {
    expect(await run(page, box(0, 100, b('Clipped', 'top:120px')) + box(110, 100, b('Below', 'top:10px')))).toEqual([]);
  });
  test('two targets that both show and meet are an overlap, in different boxes', async ({ page }) => {
    expect(await run(page, box(0, 100, b('Upper', 'top:80px')) + `<div style="position:absolute;left:0;top:90px;width:200px;height:100px;overflow:auto;background:none"><div style="position:relative;height:600px">${b('Lower', 'top:0')}</div></div>`)).toEqual(['Upper / Lower']);
  });
  test('a fixed target inside a box is drawn past it, so it still meets what is there', async ({ page }) => {
    const fixed = '<button class="Button-module__button" aria-label="Fixed" style="position:fixed;left:18px;top:130px;width:60px;height:44px">x</button>';
    expect(await run(page, box(0, 100, fixed) + b('Word', 'top:120px'))).toEqual(['Fixed / Word']);
  });
  test('an absolute target held outside a box is drawn past it too, so it still meets what is there', async ({ page }) => {
    const free = b('Free', 'left:18px;top:130px');
    expect(await run(page, `<div style="position:relative;height:400px"><div style="width:200px;height:100px;overflow:auto">${free}</div>${b('Word', 'top:120px')}</div>`)).toEqual(['Free / Word']);
  });
  test('a target wholly out of its box has no gap to measure either', async ({ page }) => {
    await page.setContent(`<main id="root" style="position:relative;height:400px">${box(0, 100, b('Clipped', 'top:104px'))}${b('Below', 'top:100px')}</main>`);
    const r = await audit(page, '#root', { gaps: true });
    expect({ overlaps: r.overlaps, tight: r.tight }).toEqual({ overlaps: [], tight: [] });
  });
  test('a word and an absolute target held by a transform, in one box out of sight: judged whole, so they meet', async ({ page }) => {
    const word = '<button class="Button-module__button" aria-label="Word" style="position:relative;display:block;width:60px;height:44px">x</button>';
    const held = '<button class="Button-module__button" aria-label="Held" style="position:absolute;left:18px;top:310px;width:24px;height:24px">x</button>';
    expect(await run(page, `<div style="width:200px;height:100px;overflow:auto"><div style="box-sizing:border-box;height:600px;padding-top:300px;transform:translateX(0)">${word}${held}</div></div>`)).toEqual(['Word / Held']);
  });
  test('two in one box are judged whole, even out of sight', async ({ page }) => {
    expect(await run(page, box(0, 100, b('First', 'top:300px') + b('Second', 'top:320px')))).toEqual(['First / Second']);
  });
});

test.describe('coarse pointer at 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const tab of GALLERY_TABS) {
    test(`gallery ${tab}: every kit button is a 44px target that overlaps no other`, async ({ page }) => {
      await gotoHub(page, `/_kit?tab=${tab}`);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      await page.waitForLoadState('networkidle');
      const none = COARSE_NO_WORDS.has(tab);
      if (!none) await page.locator(`#hub-main :is(${WORDS})`).first().waitFor({ state: 'attached' });
      else if (!NO_WORDS.has(tab)) await page.locator(`#hub-main :is(${ICON})`).first().waitFor({ state: 'attached' });
      await expectClean(page, '#hub-main', { empty: none });
    });
  }

  // On a coarse pointer IconButton sm draws its 44 press, with no hidden hit area round it.
  // The tight places are a table row's actions beside the row's own buttons and a secret's Copy beside its Show: each
  // IconButton sm there is drawn at least 44 both ways, and the audit (the press box, scroll clipping, a finger 21 px off a
  // button's centre) finds no overlap that names it and no button whose edge another press takes.
  for (const [tab, labels] of [
    ['table', [kitStrings['table.rowActions']]],
    ['secure', [forms['secret.copy'], forms['secret.show']]],
  ] as const) {
    test(`gallery ${tab}: no IconButton sm's press covers the button beside it (${labels.join(', ')})`, async ({ page }) => {
      await gotoHub(page, `/_kit?tab=${tab}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: labels[0], exact: true }).first().waitFor(); // reason: a ready wait; the gallery repeats the name per row, any one shows the tab drew
      // The IconButton sm ones among the buttons of those names (a word Copy is not one).
      const drawn = await page.evaluate((labels) => {
        const sm = (el: Element) => [...el.classList].some((c) => /(^|_)sm(_|$)/.test(c)) && [...el.classList].some((c) => /(^|_)iconOnly(_|$)/.test(c));
        return [...document.querySelectorAll('#hub-main button, #hub-main a')]
          .filter((el) => labels.includes(el.getAttribute('aria-label') ?? '') && sm(el) && el.getBoundingClientRect().width > 1)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height), after: getComputedStyle(el, '::after').position };
          });
      }, [...labels] as string[]);
      expect(drawn.length, 'IconButton sm buttons with those names').toBeGreaterThan(0);
      // Soft, so a hidden hit area is also judged by the overlap audit below, not only by its shape.
      expect.soft(drawn.filter((d) => d.w < 44 || d.h < 44 || d.after === 'absolute'), 'drawn under 44, or with a hidden hit area').toEqual([]);
      const { overlaps, unowned } = await audit(page, '#hub-main');
      expect(overlaps.filter((o) => labels.some((l) => o.split(' / ').includes(l))), 'overlaps with the IconButton sm').toEqual([]);
      expect(unowned, 'buttons whose edge another press takes').toEqual([]);
    });
  }

  // IconButton sm draws its 44 px target on a coarse pointer, and that box is its press.
  test('an IconButton sm draws 44 x 44 and owns that target: a touch 21 px off its centre, any side, lands on it', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=controls');
    const icons = page.locator('[data-cell^="iconButton.sm."] button');
    await icons.first().waitFor({ state: 'attached' });
    expect(await icons.count()).toBeGreaterThan(0);
    for (const b of await icons.all()) {
      await b.scrollIntoViewIfNeeded();
      const read = await b.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
        const at = (dx: number, dy: number) => {
          const hit = document.elementFromPoint(x + dx, y + dy);
          return !!hit && el.contains(hit);
        };
        return {
          size: [Math.round(r.width), Math.round(r.height)],
          owned: [at(0, -21), at(0, 21), at(-21, 0), at(21, 0)],
          // and no further: 30 px off the centre is past the 44 px target on every side
          past: [at(0, -30), at(0, 30), at(-30, 0), at(30, 0)],
        };
      });
      expect(read).toEqual({ size: [44, 44], owned: [true, true, true, true], past: [false, false, false, false] });
    }
  });

  // Its table's Filters is drawn as its icon at 390. It keeps its name,
  // its tooltip (shown when it takes keyboard focus) and a 44 square to press.
  test('gallery data: the table toolbar draws Filters as its icon, named, with its tooltip, and 44 square', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=data');
    const filters = page.locator('#hub-main [class*="DataTable-module__toolbar"]').first().getByRole('button', { name: /^Filters/ });
    await expect(filters).toHaveClass(/Button-module__iconOnly/);
    await expect(filters).toHaveAccessibleName(/^Filters/);
    const r = await filters.boundingBox();
    expect(r?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(r?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Shift'); // keyboard modality first, so focus opens the tooltip
    await filters.focus();
    await expect(page.getByRole('tooltip')).toHaveText(/^Filters/);
  });

  test('two xs buttons are judged by their 44 px targets: centres 50 px apart are too tight, 60 px apart are not', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=controls');
    const source = page.locator('[data-cell*="button.xs"] button').first();
    await source.waitFor({ state: 'attached' });
    const tightAt = (gap: number) =>
      page.evaluate(
        ([gap, id]) => {
          const box = document.createElement('div');
          box.id = id as string;
          box.style.cssText = `position:absolute;left:16px;top:0;display:flex;flex-direction:column;align-items:flex-start;gap:${gap}px`;
          const b = document.querySelector('[data-cell*="button.xs"] button')!;
          box.append(b.cloneNode(true), b.cloneNode(true));
          document.querySelector('#hub-main')!.append(box);
        },
        [gap, `xs-gap-${gap}`] as const,
      ).then(() => audit(page, `#xs-gap-${gap}`, { gaps: true }));
    const close = await tightAt(26);
    expect(close.small, 'an xs target is big enough on its own').toEqual([]);
    expect(close.tight.length, 'visual gap 26, target gap 6: too tight').toBe(1);
    expect((await tightAt(36)).tight, 'visual gap 36, target gap 16: fine').toEqual([]);
  });

  test('gallery secure: the code editor\'s tools and open find bar are 44px targets, their wrapped rows 8px apart', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=secure');
    const editor = page.locator('[class*="CodeEditor-module__editor"]').first();
    await editor.getByRole('button', { name: new RegExp(`^${forms['editor.find']}`) }).click();
    await expect(editor.getByRole('search')).toBeVisible();
    await expectClean(page, '[class*="CodeEditor-module__editor"]', { gaps: true });
  });

  test('gallery tables in compact density: their buttons stay 44px (compact does not shrink a touch target)', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=table');
    await page.locator('#hub-main [data-density]').first().waitFor();
    await page.waitForLoadState('networkidle');
    // Every table on the tab as compact (the attribute the view menu sets; its tokens are what is under test).
    const n = await page.evaluate(() => {
      const els = [...document.querySelectorAll('#hub-main [data-density]')];
      for (const el of els) el.setAttribute('data-density', 'compact');
      return els.length;
    });
    expect(n).toBeGreaterThan(0);
    expect(await page.locator(`[data-density="compact"] :is(${WORDS})`).count()).toBeGreaterThan(0);
    // Compact sets no control height, so --ctl-h and --ctl-h-sm read as outside it.
    const heights = await page.evaluate(() =>
      [document.querySelector('#hub-main')!, document.querySelector('[data-density="compact"]')!].map((el) => ['--ctl-h', '--ctl-h-sm'].map((p) => getComputedStyle(el).getPropertyValue(p).trim())),
    );
    expect(heights[1]).toEqual(heights[0]);
    expect(heights[1]).toEqual(['44px', '32px']);
    await expectClean(page, '[data-density="compact"]');
  });

  for (const density of ['normal', 'compact'] as const) {
    test(`Computers bulk bar (${density}): the wrapped Start, Stop, Restart and Clear are 44px and never overlap`, async ({ page }) => {
      await gotoHub(page, '/computers');
      if (density === 'compact') {
        await page.getByRole('button', { name: kitStrings['table.view'] }).click();
        await page.getByRole('menuitemradio', { name: kitStrings['table.densityCompact'] }).or(page.getByRole('menuitem', { name: kitStrings['table.densityCompact'] })).click();
      }
      await page.getByRole('button', { name: kitStrings['table.view'] }).click();
      await page.getByRole('menuitem', { name: table['select.start'] }).click();
      const rows = page.getByRole('row');
      await rows.nth(1).getByRole('checkbox').click({ force: true }); // reason: second table row (row 0 is the header)
      await rows.nth(2).getByRole('checkbox').click({ force: true }); // reason: third table row
      const bulk = page.locator('[class*="DataTable-module__bulk"]');
      const named = (n: string) => bulk.getByRole('button', { name: n, exact: true });
      const buttons = [named(computers['bulk.start']), named(computers['bulk.stop']), named(computers['bulk.restart'])];
      for (const b of buttons) await expect(b).toBeVisible();
      // The point of the test: at 390 the bar wraps, so a target sits above another.
      const tops = new Set(await Promise.all(buttons.map(async (b) => Math.round((await b.boundingBox())!.y))));
      const clear = bulk.getByRole('button', { name: new RegExp(`^${kitStrings['action.clear']}( Esc)?$`) });
      tops.add(Math.round((await clear.boundingBox())!.y));
      expect(tops.size).toBeGreaterThan(1);
      // The whole toolbar (bulk bar and view controls), its wrapped rows the touch gap apart.
      await expectClean(page, '[class*="DataTable-module__toolbar"]', { gaps: true });
    });
  }

  // Notes' group New note over its table toolbar; Logs' problem strip toggle beside the chips' More actions.
  for (const [path, ready] of [
    ['/notes', 'DataTable-module__wrap'],
    ['/logs', 'Logs-module__strip'],
  ] as const) {
    test(`${path}: the page's kit buttons with words are 44px targets that overlap no other`, async ({ page }) => {
      await gotoHub(page, path);
      await page.locator(`[class*="${ready}"]`).first().waitFor();
      await page.waitForLoadState('networkidle');
      await expectClean(page, '#hub-main');
    });
  }

  // The Firewall tab's No internet group only partly in place: its warning Band carries Finish blocking and Remove its rules.
  test('Firewall partial No internet band: Finish blocking and Remove its rules are 44px targets that overlap no other', async ({ page }) => {
    await gotoHub(page, '/computers?sel=atlas.00a1&tab=network', { state: 'netNoInternetPartial' });
    const band = page.locator('[class*="Band-module__band"]').filter({ has: page.getByRole('button', { name: firewall['ni.finish'], exact: true }) });
    await expect(band.getByRole('button', { name: firewall['ni.remove'], exact: true })).toBeVisible();
    await expect(band).toHaveCount(1);
    await page.waitForLoadState('networkidle');
    await expectClean(page, '[class*="Band-module__band"]', { gaps: true });
  });
});

// The Logs header stacks its title over its actions at 320 (the title does not fit beside them), and a stacked header
// lets its actions shrink (min-width 0, for a wrapping outcome line): a word button among them still keeps 44px.
test.describe('coarse pointer at 320', () => {
  test.use({ viewport: { width: 320, height: 844 }, hasTouch: true, isMobile: true });

  test('a stacked page header: a word button with a short label stays 44px wide', async ({ page }) => {
    // Real kit buttons from the gallery (their module classes and marks), so the header's own rules meet the same
    // elements a page would put there: a TextButton without and with an aria-label, and an IconButton.
    await gotoHub(page, '/_kit?tab=states');
    const text = page.locator('[class*="Link-module__textButton"]').first();
    await text.waitFor({ state: 'attached' });
    const textHtml = await text.evaluate((el) => el.outerHTML);
    await gotoHub(page, '/_kit?tab=actions');
    const icon = page.locator('[data-gallery="icon-buttons"]').getByRole('button', { name: gallery['icon.edit'], exact: true }).first(); // reason: the icon matrix repeats the name per row; the first is the md specimen
    await icon.waitFor();
    const iconHtml = await icon.evaluate((el) => el.outerHTML);
    const iconBox = await icon.boundingBox();

    await gotoHub(page, '/logs');
    const actions = '[class*="PageHeader-module__stacked"] [class*="PageHeader-module__actions"]';
    await page.locator(`${actions} > :is(${WORDS})`).first().waitFor();
    const r = await page.locator(actions).first().evaluate(
      (row, { textHtml, iconHtml, words }) => {
        const add = (html: string, label: string | null, text: string | null) => {
          const t = document.createElement('template');
          t.innerHTML = html;
          const el = t.content.firstElementChild as HTMLElement;
          if (text !== null) el.textContent = text;
          if (label === null) el.removeAttribute('aria-label');
          else el.setAttribute('aria-label', label);
          row.append(el);
          return el;
        };
        const texts = [add(textHtml, null, 'Go'), add(textHtml, 'Go to the logs', 'Go')];
        const iconEl = add(iconHtml, 'More', null);
        for (const el of row.querySelectorAll<HTMLElement>(`:scope > :is(${words})`)) if (!texts.includes(el)) el.textContent = 'Go';
        const w = (el: Element) => el.getBoundingClientRect().width;
        const cs = getComputedStyle(iconEl);
        return {
          words: [...row.querySelectorAll<HTMLElement>(`:scope > :is(${words})`)].map(w),
          texts: texts.map(w),
          icon: { w: w(iconEl), h: iconEl.getBoundingClientRect().height, min: cs.minWidth },
        };
      },
      { textHtml, iconHtml, words: WORDS },
    );
    expect(r.texts).toHaveLength(2);
    expect(r.words.length).toBeGreaterThan(2);
    for (const w of r.words) expect(w).toBeGreaterThanOrEqual(43.5);
    // The IconButton keeps its own square: the header's 0 minimum, the size it has elsewhere.
    expect(r.icon.min).toBe('0px');
    expect(Math.round(r.icon.w)).toBe(Math.round(iconBox!.width));
    expect(Math.round(r.icon.h)).toBe(Math.round(iconBox!.height));
  });
});

/** With a fine pointer: the touch tokens, and the kit buttons under #hub-main that have a minimum size. 0px passes:
 *  kit containers zero some buttons' minimum on purpose (row actions, chip removes). That the touch minimums sit only
 *  in coarse blocks (so a fine pointer keeps `auto`) is pinned by touch-tokens.test.ts. */
async function fineState(page: Page) {
  return page.evaluate(
    ({ words, icon, lineCell }) => {
      const free = ['0px', 'auto'];
      const root = getComputedStyle(document.documentElement);
      const els = [...document.querySelectorAll<HTMLElement>(`#hub-main :is(${words}, ${icon})`)];
      return {
        min: root.getPropertyValue('--touch-min').trim(),
        gap: root.getPropertyValue('--touch-gap').trim(),
        sized: els
          .filter((el) => {
            const cs = getComputedStyle(el);
            // A button with words takes its whole words as its minimum on every pointer: not a touch
            // minimum.
            const wordsMin = cs.minWidth === 'max-content' && el.matches(words);
            // A code line's copy cell keeps its line's height (LINE_CELL); its width is its own, never a touch minimum.
            const lineMin = el.matches(lineCell) && free.includes(cs.minWidth);
            return !(free.includes(cs.minHeight) || lineMin) || !(free.includes(cs.minWidth) || wordsMin);
          })
          .map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)),
        count: els.length,
      };
    },
    { words: WORDS, icon: ICON, lineCell: LINE_CELL },
  );
}

// 1440 desktop and a constrained 390 window, both with a mouse: nothing of the touch layout applies.
for (const width of [1440, 390]) {
  test.describe(`fine pointer at ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const tab of GALLERY_TABS) {
      test(`gallery ${tab}: the touch tokens are 0 and no kit button takes a touch minimum`, async ({ page }) => {
        await gotoHub(page, `/_kit?tab=${tab}`);
        expect(await page.evaluate(() => matchMedia('(pointer: fine)').matches)).toBe(true);
        await page.waitForLoadState('networkidle');
        // Any kit button (at 1440 the data tab draws icon buttons only): the check is that none takes a minimum.
        if (!NO_WORDS.has(tab)) await page.locator(`#hub-main :is(${WORDS}, ${ICON})`).first().waitFor({ state: 'attached' });
        const r = await fineState(page);
        if (!NO_WORDS.has(tab)) expect(r.count).toBeGreaterThan(0);
        expect({ min: r.min, gap: r.gap, sized: r.sized }).toEqual({ min: '0px', gap: '0px', sized: [] });
      });
    }
  });
}

test.describe('fine pointer at 390, rows selected', () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test('Computers bulk bar: the toolbar keeps its one-line layout (the touch wrap is coarse only)', async ({ page }) => {
    await gotoHub(page, '/computers');
    await page.getByRole('button', { name: kitStrings['table.view'] }).click();
    await page.getByRole('menuitem', { name: table['select.start'] }).click();
    const rows = page.getByRole('row');
    await rows.nth(1).getByRole('checkbox').click({ force: true }); // reason: second table row (row 0 is the header)
    await expect(page.locator('[class*="DataTable-module__bulk"]').first()).toBeVisible();
    const wrap = await page.locator('[class*="DataTable-module__toolbar"]:has(> [class*="DataTable-module__bulk"])').evaluate((el) => getComputedStyle(el).flexWrap);
    expect(wrap).toBe('nowrap');
    const r = await fineState(page);
    expect({ min: r.min, gap: r.gap, sized: r.sized }).toEqual({ min: '0px', gap: '0px', sized: [] });
  });
});
