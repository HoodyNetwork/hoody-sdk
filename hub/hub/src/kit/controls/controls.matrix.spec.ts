// Playwright: the control matrix. The gallery's controls tab draws one specimen per cell of the control
// spec (kit/controlSpec.ts), at default density and inside a compact area. Each test opens it in one theme with one
// pointer and measures every cell at both densities against its target: the visual height (border box), the hit area
// a touch lands on (elementFromPoint around the centre, so a ::before extension counts and a covered edge does not),
// the top border colour (its width and style too), the background and text colours, the box-shadow once keyboard focus
// has taken (and no outline beside it), the opacity. Hover cells are hovered with the mouse; focus cells press Tab first
// (React Aria's keyboard modality: a lone Shift does not count) and check the focused element before reading the ring.
// A cell must meet its target unless a CONTROL_DEBT row holds it in that context; a debt cell must still read the row's
// `now` (a worse value fails too), and a debt row whose miss is gone fails (the list only shrinks: a fix removes its row
// in the same change). A specimen that is missing, a focus that does not take or a target that resolves to nothing (an
// undeclared token, a `none` ring) fails whatever the debt list says.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import { CONTROL_SPEC, DENSITIES, FOCUS_AT, cellKey, debtFor, measureOf, measuredIn, targetIn, type Ctx, type Pointer, type Target, type Theme } from '../controlSpec';

interface Probe {
  key: string;
  density: string;
  sel: string;
  focusSel: string | null;
  prop: string;
  hover: boolean;
  focus: boolean;
  /** The target, then the debt row's `now` when one holds the cell here. */
  targets: Target[];
}
interface Reading {
  key: string;
  density: string;
  got: string;
  /** Per target: what it resolved to, and whether the reading meets it. */
  wants: { want: string; ok: boolean }[];
  /** A fault no debt row can hold: no specimen, focus that did not take, a target that resolves to nothing. */
  fault: string | null;
}

const at = (p: Pick<Probe, 'density' | 'key'>, sel: string) => `[data-spec-density="${p.density}"] [data-cell="${p.key}"] ${sel}`;

/** Read probes in the page as it is now (hovered, focused or at rest). */
function read(page: Page, probes: Probe[]): Promise<Reading[]> {
  return page.evaluate(async (list) => {
    const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const out: Reading[] = [];
    for (const p of list) {
      const cell = document.querySelector<HTMLElement>(`[data-spec-density="${p.density}"] [data-cell="${p.key}"]`);
      const el = cell?.querySelector<HTMLElement>(p.sel);
      const base = { key: p.key, density: p.density };
      if (!cell || !el) {
        out.push({ ...base, got: 'missing', wants: [], fault: `no ${p.sel} in the specimen` });
        continue;
      }
      let fault: string | null = null;
      if (p.focus) {
        const target = p.focusSel ? cell.querySelector<HTMLElement>(p.focusSel) : el;
        target?.focus();
        // RAC sets data-focused / data-focus-visible in a React update: read after two frames.
        await frames();
        const active = document.activeElement;
        // A react-aria element (data-rac) draws its ring from data-focus-visible, which only keyboard modality sets; the
        // browser's own :focus-visible also matches a scripted focus after a click, so it is the test only for a native one.
        const rac = target?.closest('[data-rac]');
        const visible = !!target && (rac && cell.contains(rac) ? !!target.closest('[data-focus-visible]') : target.matches(':focus-visible'));
        if (!target || active !== target) fault = `focus did not take (active: ${active?.tagName ?? 'none'})`;
        else if (!visible) fault = 'focused, but not as keyboard focus (no data-focus-visible / :focus-visible)';
      }
      const cs = getComputedStyle(el);
      // Every var() a target names must be declared under the cell's context, or the probe below would read an
      // inherited or initial value and compare equal by accident.
      const undeclared = (t: unknown) => (typeof t === 'string' ? [...t.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]!).filter((n) => getComputedStyle(cell).getPropertyValue(n).trim() === '') : []);
      const resolve = (t: unknown): string => {
        const probe = document.createElement('span');
        cell.appendChild(probe);
        let v: string;
        if (p.prop === 'focusShadow') {
          probe.style.boxShadow = String(t);
          v = getComputedStyle(probe).boxShadow;
        } else if (p.prop === 'background') {
          probe.style.backgroundColor = String(t);
          v = getComputedStyle(probe).backgroundColor;
        } else {
          probe.style.color = String(t);
          v = getComputedStyle(probe).color;
        }
        probe.remove();
        return v;
      };
      let got = '';
      let meets: (t: unknown) => { want: string; ok: boolean };
      if (p.prop === 'height' || p.prop === 'hit') {
        let w = 0;
        let h = 0;
        if (p.prop === 'height') {
          h = Math.round(el.getBoundingClientRect().height * 10) / 10;
          got = String(h);
        } else {
          el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const owns = (x: number, y: number) => {
            const hit = document.elementFromPoint(x, y);
            return !!hit && (hit === el || el.contains(hit));
          };
          const reach = (dx: number, dy: number) => {
            let n = 0;
            while (n < 60 && owns(cx + dx * (n + 1), cy + dy * (n + 1))) n++;
            return n;
          };
          if (owns(cx, cy)) {
            w = reach(-1, 0) + reach(1, 0) + 1;
            h = reach(0, -1) + reach(0, 1) + 1;
          }
          got = `${w}x${h}`;
        }
        meets = (t) => {
          // A hit is two-sided: a debt row reads it as `<w>x<h>`, so a narrower reading is a change; a bare number is a
          // height only.
          if (p.prop === 'hit' && typeof t === 'string') {
            const m = /^(\d+)x(\d+)$/.exec(t);
            return m ? { want: t, ok: Math.abs(w - Number(m[1])) < 0.6 && Math.abs(h - Number(m[2])) < 0.6 } : { want: `bad target ${t}`, ok: false };
          }
          if (typeof t === 'number' && p.prop === 'hit') return { want: `bad target ${t} (a hit is { min } or '<w>x<h>')`, ok: false };
          if (typeof t === 'number') return { want: String(t), ok: Math.abs(h - t) < 0.6 };
          if (t && typeof t === 'object' && 'min' in t) {
            const min = (t as { min: number }).min;
            return { want: `>=${min}`, ok: h >= min - 0.5 && (p.prop === 'height' || w >= min - 0.5) };
          }
          return { want: `bad target ${String(t)}`, ok: false };
        };
      } else if (p.prop === 'opacity') {
        got = cs.opacity;
        meets = (t) => ({ want: String(t), ok: typeof t === 'number' && Math.abs(Number(cs.opacity) - t) < 0.01 });
      } else {
        if (p.prop === 'borderColor') got = cs.borderTopStyle === 'none' || parseFloat(cs.borderTopWidth) === 0 ? 'no border' : cs.borderTopColor;
        else if (p.prop === 'background') got = cs.backgroundColor;
        else if (p.prop === 'color') {
          // The visible ink: the element that draws the first visible text inside the measured one (a Select's picked
          // label sets its own colour), else the element itself (an input draws its value).
          const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let ink: Element = el;
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            const r = document.createRange();
            r.selectNodeContents(n);
            if (n.textContent?.trim() && r.getClientRects().length > 0 && n.parentElement) {
              ink = n.parentElement;
              break;
            }
          }
          got = getComputedStyle(ink).color;
        }
        else got = cs.boxShadow + (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? ` + outline ${cs.outlineStyle} ${cs.outlineWidth}` : '');
        meets = (t) => {
          // A debt reading may name an outline beside its shadow: `<shadow> + outline <style> <width>`.
          const [head, outline] = String(t).split(' + outline ');
          const want = resolve(head) + (outline ? ` + outline ${outline}` : '');
          return { want, ok: got === want };
        };
      }
      const wants = p.targets.map((t) => {
        const bad = undeclared(t);
        const m = meets(t);
        if (bad.length && !fault) fault = `target ${String(t)} names undeclared ${bad.join(' ')}`;
        if (p.prop === 'focusShadow' && (m.want === 'none' || m.want === '') && !fault) fault = `target ${String(t)} resolves to no ring`;
        return m;
      });
      if (p.focus) (p.focusSel ? cell.querySelector<HTMLElement>(p.focusSel) : el)?.blur();
      out.push({ ...base, got, wants, fault });
    }
    return out;
  }, probes);
}

for (const theme of ['light', 'dark'] as Theme[])
  for (const pointer of ['fine', 'coarse'] as Pointer[])
    test.describe(`control matrix: ${theme}, ${pointer} pointer`, () => {
      if (pointer === 'coarse') test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

      test('every cell meets its target, or its debt row says what it reads instead', async ({ page }) => {
        // Reduced motion: no colour or ring transition is caught halfway.
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await gotoHub(page, '/_kit?tab=controls', { theme });
        await page.locator('[data-spec-density="compact"] [data-cell]').first().waitFor();
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(pointer === 'coarse');
        const probes: Probe[] = DENSITIES.flatMap((density) => {
          const ctx = `${theme}.${pointer}.${density}` as Ctx;
          return CONTROL_SPEC.filter((c) => measuredIn(c, ctx)).map((c) => {
            const debt = debtFor(cellKey(c), ctx);
            return {
              key: cellKey(c),
              density,
              sel: measureOf(c),
              focusSel: c.state === 'focus' ? (FOCUS_AT[c.control] ?? null) : null,
              prop: c.prop,
              hover: c.state === 'hover',
              focus: c.state === 'focus',
              targets: debt ? [targetIn(c, ctx), debt.now] : [targetIn(c, ctx)],
            };
          });
        });
        const still = probes.filter((p) => !p.hover);
        // Keyboard modality first (a Tab press), so a programmatic focus is keyboard focus; hover reads come after, as
        // a mouse move ends keyboard modality.
        await page.keyboard.press('Tab');
        const readings = await read(page, still);
        for (const p of probes.filter((x) => x.hover)) {
          const target = page.locator(at(p, p.sel)).first();
          await target.scrollIntoViewIfNeeded();
          await target.hover();
          readings.push(...(await read(page, [p])));
          await page.mouse.move(0, 0);
        }
        expect(readings.length, 'every probe read').toBe(probes.length);
        expect(readings.filter((r) => r.fault).map((r) => `${r.density} ${r.key}: ${r.fault}`), `${theme} ${pointer}: faults no debt row can hold`).toEqual([]);
        const misses: string[] = [];
        const stale: string[] = [];
        const moved: string[] = [];
        for (const r of readings) {
          const ctx = `${theme}.${pointer}.${r.density}` as Ctx;
          const debt = debtFor(r.key, ctx);
          const [target, now] = r.wants;
          const line = `${r.density} ${r.key}: got ${r.got}, want ${target?.want}`;
          if (!target?.ok && !debt) misses.push(line);
          if (target?.ok && debt) stale.push(`${line} (debt row ${debt.fixBy} can leave)`);
          if (!target?.ok && debt && !now?.ok) moved.push(`${line}; debt row says now ${now?.want} (${debt.today})`);
        }
        expect(misses, `${theme} ${pointer}: cells that miss their target with no debt row`).toEqual([]);
        expect(stale, `${theme} ${pointer}: debt rows whose miss is gone`).toEqual([]);
        expect(moved, `${theme} ${pointer}: debt cells that no longer read what their row says`).toEqual([]);
      });
    });
