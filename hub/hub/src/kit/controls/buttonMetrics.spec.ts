// Playwright: useButtonLabelsWidth in a real browser equals the box of the widest real kit Button drawn beside its probe
// for the same labels and look: the page's own fonts, a CJK label on its fallback face, a busy spinner, an end icon, a
// shortcut cap, the end glyph (and a button asked to draw none), a literal label, a real LinkButton, a lang="ja"
// container (no caps or tracking) and a ButtonStrip (no glyph). It follows a token change made after the first measure.
// At 1440 and on a 390 coarse pointer (the touch minimum), both themes; a long label measures wider than a short one.
// The hook and the Buttons are rendered into the running Hub (its theme and fonts) from the dev server's own modules.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

type Label = string | { label: string; icon?: string; iconEnd?: string; busy?: boolean; shortcut?: string };
type Opts = { variant?: string; size?: string; chip?: boolean; literal?: boolean; link?: boolean };
type Where = { link?: boolean; lang?: string; strip?: boolean; token?: [string, string]; reverse?: boolean };

const CASES: Array<{ what: string; labels: Label[]; opts: Opts; where?: Where }> = [
  { what: 'row sm, plain words', labels: ['Open', 'Open display', 'Stop'], opts: { variant: 'row', size: 'sm' } },
  { what: 'row sm, busy and an end icon', labels: [{ label: 'Restarting', busy: true }, { label: 'Open site', iconEnd: 'external' }, 'Stop'], opts: { variant: 'row', size: 'sm' } },
  { what: 'a shortcut cap', labels: [{ label: 'Find', shortcut: 'Mod+K' }, 'Close'], opts: { variant: 'ghost', size: 'sm' } },
  { what: 'secondary md, the end glyph', labels: ['Save', 'Save and close'], opts: {} },
  { what: 'secondary md, asked to draw no glyph', labels: ['Save', 'Save and close'], opts: { chip: false } },
  { what: 'primary sm, the end glyph', labels: ['Add', 'Add a computer'], opts: { variant: 'primary', size: 'sm' } },
  { what: 'a CJK label on its fallback face', labels: ['Open', '表示を開いて再起動する'], opts: { variant: 'row', size: 'sm' } },
  { what: 'literal data label', labels: ['atlas-srv-01', 'b'], opts: { variant: 'ghost', size: 'sm', literal: true } },
  { what: 'real LinkButtons (row sm, end icon)', labels: [{ label: 'Open site', iconEnd: 'external' }, { label: 'Open the display', iconEnd: 'external' }], opts: { variant: 'row', size: 'sm', link: true }, where: { link: true } },
  { what: 'primary sm LinkButtons (the end glyph)', labels: ['Docs', 'Read the guide'], opts: { variant: 'primary', size: 'sm', link: true }, where: { link: true } },
  { what: 'a lang="ja" container', labels: ['Open display', 'Stop'], opts: { variant: 'secondary', size: 'sm' }, where: { lang: 'ja' } },
  { what: 'inside a ButtonStrip', labels: ['Save', 'Save and close'], opts: {}, where: { strip: true } },
  { what: 'a ButtonStrip whose widest is first among the real Buttons', labels: ['Save', 'Save and close'], opts: {}, where: { strip: true, reverse: true } },
  { what: 'secondary LinkButtons inside a ButtonStrip', labels: ['Docs', 'Read the guide'], opts: { link: true }, where: { strip: true, link: true, reverse: true } },
  { what: 'a token change after the first measure', labels: ['Open', 'Open display'], opts: { variant: 'row', size: 'sm' }, where: { token: ['--fs-md', '19px'] } },
];

/** The hook's width and the widest real Button's box for one case, once the hook has settled (and again after `token`). */
async function measure(page: Page, labels: Label[], opts: Opts, where: Where = {}): Promise<{ hook: number | null; real: number; first: number; over: number }> {
  return page.evaluate(
    async ({ labels, opts, where }) => {
      // The app's own React (the dev server's pre-bundled deps, already loaded by the page), so the hook shares its instance.
      const loaded = performance.getEntriesByType('resource').map((e) => e.name);
      const dep = (name: string) => {
        const u = loaded.find((n) => new RegExp(`/deps/${name}\\.js(\\?|$)`).test(n));
        if (!u) throw new Error(`no ${name} among the loaded modules: ${loaded.filter((n) => n.includes('/deps/')).slice(0, 8).join(' ')}`);
        return u;
      };
      const cjs = <T,>(m: { default?: T } & T): T => m.default ?? m;
      const R = cjs(await import(dep('react')));
      const { createRoot } = cjs(await import(dep('react-dom_client')));
      const { useButtonLabelsWidth } = await import('/src/kit/controls/buttonMetrics.tsx' as string);
      const { Button, LinkButton } = await import('/src/kit/controls/Button.tsx' as string);
      const { ButtonStrip } = await import('/src/kit/controls/ButtonStrip.tsx' as string);
      await document.fonts.ready;
      let hook: number | null = null;
      const T = () => {
        const m = useButtonLabelsWidth(labels, opts);
        hook = m.width;
        const real = (where.reverse ? [...labels].reverse() : labels).map((l: Label, i: number) => {
          const b = typeof l === 'string' ? { label: l } : l;
          const props = { variant: opts.variant, size: opts.size, chip: opts.chip, literal: opts.literal, icon: b.icon, iconEnd: b.iconEnd, busy: b.busy, shortcut: b.shortcut };
          const el = where.link ? R.createElement(LinkButton, { ...props, href: '#/board' }, b.label) : R.createElement(Button, props, b.label);
          return where.strip ? R.createElement(R.Fragment, { key: i }, el) : R.createElement('div', { key: i, style: { inlineSize: 'max-content' } }, el);
        });
        const inner = where.strip ? R.createElement(ButtonStrip, { label: 'Actions' }, m.probe, ...real) : R.createElement('div', null, m.probe, ...real);
        return R.createElement('div', { lang: where.lang, 'data-bm-case': '' }, inner);
      };
      const host = document.createElement('div');
      document.getElementById('hub-main')!.append(host);
      const root = createRoot(host);
      root.render(R.createElement(T));
      const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
      const realNow = () =>
        Math.max(0, ...[...host.querySelectorAll('button, a')].filter((b) => !b.closest('[data-kit-probe]')).map((b) => b.getBoundingClientRect().width));
      const settle = async () => {
        let real = 0;
        for (let i = 0; i < 120; i++) {
          await frame();
          real = realNow();
          if (hook !== null && real > 0 && hook === Math.ceil(real)) break;
        }
        return real;
      };
      let real = await settle();
      const first = hook ?? -1;
      if (where.token) {
        (host.querySelector('[data-bm-case]') as HTMLElement).style.setProperty(where.token[0], where.token[1]);
        real = await settle();
      }
      const main = document.getElementById('hub-main')!;
      const over = main.scrollWidth - main.clientWidth;
      root.unmount();
      host.remove();
      return { hook, real, first, over };
    },
    { labels, opts, where },
  );
}

for (const theme of ['light', 'dark'] as const)
  for (const [width, touch] of [
    [1440, false],
    [390, true],
  ] as const)
    test.describe(`useButtonLabelsWidth at ${width}${touch ? ' coarse' : ''}, ${theme}`, () => {
      test.use(touch ? { viewport: { width, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width, height: 900 } });
      test('the width is the widest real kit Button beside the probe, rounded up, and follows later changes', async ({ page }) => {
        await gotoHub(page, '/_kit?tab=pieces', { theme });
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(touch);
        for (const c of CASES) {
          const { hook, real, first, over } = await measure(page, c.labels, c.opts, c.where);
          expect(over, `${c.what}: the mounted probe adds no page overflow`).toBeLessThanOrEqual(0);
          expect(real, `${c.what}: real Buttons drew`).toBeGreaterThan(0);
          if (c.where?.strip && !c.where.reverse) {
            // The widest real Button is later in the strip, so it lost its start border; the probe measures it first (the
            // widest any position draws): never under, over by at most that border.
            expect(hook!, `${c.what}: the hook is never under the widest real Button`).toBeGreaterThanOrEqual(Math.ceil(real));
            expect(hook!, `${c.what}: and over it by at most the start border`).toBeLessThanOrEqual(Math.ceil(real) + 2);
          } else expect(hook, `${c.what}: the hook equals the widest real Button`).toBe(Math.ceil(real));
          if (c.where?.token) expect(hook!, `${c.what}: the width grew with the token`).toBeGreaterThan(first);
        }
        const short = await measure(page, ['Open'], { variant: 'row', size: 'sm' });
        const long = await measure(page, ['Open', 'Open display'], { variant: 'row', size: 'sm' });
        expect(long.hook!, 'a long label measures wider').toBeGreaterThan(short.hook!);
        expect(await page.locator('[data-kit-probe="button-labels"]').count(), 'every probe goes with its hook').toBe(0);
      });
    });
