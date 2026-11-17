// The theme's colour and size tokens, read from tokens.css. Fills, tints, dots and borders use the design's exact
// colours; every token used as text reaches 4.5:1 on the background, the card and the secondary fill, in light and in
// dark; a button's label, icon and danger ink reach it on every step of their plate; the danger tint is translucent;
// warning reads as orange and danger as red; dark mode is derived. Sizes map through the control and button tokens.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function block(selector: string): Map<string, string> {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no block ${selector}`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
  return out;
}

const light = block(':root');
const dark = new Map([...light, ...block(':root[data-hx-theme="dark"]')]);

type RGBA = [number, number, number, number];

function resolve(theme: Map<string, string>, value: string, depth = 0): string {
  if (depth > 20) throw new Error(`token loop at ${value}`);
  const m = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!m) return value.trim();
  const v = theme.get(m[1]!);
  if (v === undefined) throw new Error(`unknown token ${m[1]}`);
  return resolve(theme, v, depth + 1);
}

function colour(theme: Map<string, string>, name: string): RGBA {
  const v = resolve(theme, `var(${name})`);
  let m = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (m) {
    let h = m[1]!;
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = /^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/.exec(v);
  if (m) {
    const a = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }
  throw new Error(`${name}: not a plain colour: ${v}`);
}

const over = ([r, g, b, a]: RGBA, [R, G, B]: RGBA): RGBA => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
const lum = ([r, g, b]: RGBA) => {
  const f = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: RGBA, b: RGBA) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};
/** OKLCH hue in degrees. */
function hue([r, g, b]: RGBA): number {
  const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return ((Math.atan2(Bb, A) * 180) / Math.PI + 360) % 360;
}
const hex = (c: RGBA) => `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}${c[3] < 1 ? Math.round(c[3] * 255).toString(16).padStart(2, '0') : ''}`;

describe('the design values, as given (light)', () => {
  const given: Array<[string, string]> = [
    ['--hx-bg', '#f0f0f0'],
    ['--hx-card', '#edeaea'],
    ['--hx-sec-bg', '#e5e5e5'],
    ['--hx-muted-fill', '#848484'],
    ['--hx-acc-text-on', '#1e1e1e'],
    ['--hx-ink', '#272727'],
    ['--hx-input-bg', '#f8f8f8'],
    ['--hx-line-strong', '#6b6b6b8f'],
    ['--hx-panel-line', '#9c9c9c'],
    ['--hx-ok-t', '#00ff7b57'],
    ['--hx-ok', '#006144'],
    ['--hx-r-red', '#ff242b'],
    ['--hx-r-orange', '#ff7b24'],
    ['--hx-r-yellow', '#ffb41e'],
    ['--hx-r-green', '#61ff81'],
    ['--hx-r-teal', '#26ffea'],
    ['--hx-r-blue', '#3092ff'],
    ['--hx-blue-shade', '#0035e6'],
    ['--hx-r-purple', '#9e2dff'],
    ['--hx-line', '#00000017'],
    ['--hx-line-2', '#1313130d'],
    // Danger takes the redder of the two given status values.
    ['--hx-danger-fill', '#fe361b'],
  ];
  for (const [name, value] of given) it(`${name} is ${value}`, () => expect(hex(colour(light, name))).toBe(value));
});

const TEXT = ['--hx-ink', '--hx-code-blue', '--hx-code-purple', '--hx-muted', '--hx-muted-text', '--hx-faint', '--hx-danger', '--hx-danger-text', '--hx-warn', '--hx-warn-text', '--hx-ok', '--hx-heading', '--hx-code-pink'];
const GROUNDS = ['--hx-bg', '--hx-card', '--hx-sec-bg', '--hx-raised', '--hx-fill', '--hx-input-bg'];

for (const [label, theme] of [['light', light], ['dark', dark]] as const) {
  describe(`text tokens read at 4.5:1 (${label})`, () => {
    for (const t of TEXT)
      for (const g of GROUNDS)
        it(`${t} on ${g}`, () => {
          const ground = colour(theme, g);
          expect(ratio(over(colour(theme, t), ground), ground)).toBeGreaterThanOrEqual(4.5);
        });
    for (const [t, tint] of [['--hx-danger-text', '--hx-danger-t'], ['--hx-warn-text', '--hx-warn-t'], ['--hx-ok', '--hx-ok-t']] as const)
      for (const g of ['--hx-bg', '--hx-card'])
        it(`${t} on its own tint over ${g}`, () => {
          const ground = over(colour(theme, tint), colour(theme, g));
          expect(ratio(colour(theme, t), ground)).toBeGreaterThanOrEqual(4.5);
        });
    // A band laid over a frame or a tile (Band `over`) paints the card under its fill: its words on each tone's fill
    // over the card. The warn and danger fills are see-through, so this is the pair a person reads.
    for (const fill of ['--hx-notice-calm', '--hx-acc-soft', '--hx-notice-warn', '--hx-notice-danger'])
      it(`--hx-notice-text on ${fill} over --hx-card`, () => {
        const ground = over(colour(theme, fill), colour(theme, '--hx-card'));
        expect(ratio(over(colour(theme, '--hx-notice-text'), ground), ground)).toBeGreaterThanOrEqual(4.5);
      });
    it('the primary text on the accent fill', () => {
      expect(ratio(colour(theme, '--hx-acc-text-on'), colour(theme, '--hx-acc'))).toBeGreaterThanOrEqual(4.5);
    });
    // A plate tinted with the soft accent (the top bar's Free badge): a button's label and icon on it, under every
    // highlight. Dark gives each highlight its own soft value; light takes the highlight's light one.
    for (const hl of ['', 'mint', 'sky', 'coral', 'lilac', 'chalk'])
      it(`a button's label and icon on --hx-acc-soft (${hl || 'default'})`, () => {
        const tinted = new Map(theme);
        if (hl) {
          for (const [k, v] of block(`:root[data-hx-hl="${hl}"]`)) tinted.set(k, v);
          if (label === 'dark') for (const [k, v] of block(`:root[data-hx-theme="dark"][data-hx-hl="${hl}"]`)) tinted.set(k, v);
        }
        for (const t of ['--hx-btn-text', '--hx-btn-icon']) expect(ratio(colour(tinted, t), colour(tinted, '--hx-acc-soft'))).toBeGreaterThanOrEqual(4.5);
      });
    // A toggle group's option text on the grey track, and the current option's on the thumb; a
    // hovered or pressed option turns ink on the track.
    it('a toggle option reads at 4.5:1 on the track, the current one on the thumb', () => {
      expect(ratio(colour(theme, '--hx-tog-text'), colour(theme, '--hx-tog-track'))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(colour(theme, '--hx-tog-ink'), colour(theme, '--hx-tog-track'))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(colour(theme, '--hx-tog-ink'), colour(theme, '--hx-tog-thumb'))).toBeGreaterThanOrEqual(4.5);
      const seg = readFileSync(join(import.meta.dirname, 'controls/SegmentedControl.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(/(?:^|\n)\.count\s*\{[^}]*color:\s*inherit/.test(seg), 'the count follows its option\'s label in every state').toBe(true);
    });
    it('the text on the danger fill', () => {
      expect(ratio(colour(theme, '--hx-on-danger'), colour(theme, '--hx-danger-fill'))).toBeGreaterThanOrEqual(4.5);
    });
  });

  // A kit button is a plate: the grey one at rest, hovered and pressed, the accent one (primary) in its three steps, and
  // the danger look on the grey plate with one darker step for hover and pressed.
  describe(`button plates (${label})`, () => {
    const PLATES = ['--hx-btn-plate', '--hx-btn-plate-hover', '--hx-btn-plate-press'];
    for (const ink of ['--hx-btn-text', '--hx-btn-icon'])
      for (const plate of PLATES)
        it(`${ink} on ${plate}`, () => {
          expect(ratio(colour(theme, ink), colour(theme, plate))).toBeGreaterThanOrEqual(4.5);
        });
    for (const plate of ['--hx-acc', '--hx-acc-hover', '--hx-acc-press'])
      it(`--hx-acc-ink on ${plate}`, () => {
        expect(ratio(colour(theme, '--hx-acc-ink'), colour(theme, plate))).toBeGreaterThanOrEqual(4.5);
      });
    for (const plate of ['--hx-btn-plate', '--hx-btn-danger-hover'])
      it(`--hx-danger on ${plate}`, () => {
        expect(ratio(colour(theme, '--hx-danger'), colour(theme, plate))).toBeGreaterThanOrEqual(4.5);
      });
    // A frameless icon button shows the plate's fill only under the pointer: its ink there is the page ink.
    for (const plate of ['--hx-btn-plate', '--hx-btn-plate-hover'])
      it(`--hx-ink on ${plate} (a frameless icon button, hovered and pressed)`, () => {
        expect(ratio(colour(theme, '--hx-ink'), colour(theme, plate))).toBeGreaterThanOrEqual(4.5);
      });
    it('each step is a visible step: hover differs from rest, pressed from hover', () => {
      for (const [a, b] of [['--hx-btn-plate', '--hx-btn-plate-hover'], ['--hx-btn-plate-hover', '--hx-btn-plate-press'], ['--hx-acc', '--hx-acc-hover'], ['--hx-acc-hover', '--hx-acc-press'], ['--hx-btn-plate', '--hx-btn-danger-hover']] as const)
        expect(hex(colour(theme, a)), `${a} / ${b}`).not.toBe(hex(colour(theme, b)));
    });
    it('the frame marks the plate off its ground: 3:1 on the background, the card, a raised layer (a dialog, a popover) and the fill, at rest and under the pointer', () => {
      for (const line of ['--hx-btn-line', '--hx-btn-line-hover'])
        for (const g of ['--hx-bg', '--hx-card', '--hx-raised', '--hx-fill']) expect(ratio(colour(theme, line), colour(theme, g)), `${line} on ${g}`).toBeGreaterThanOrEqual(3);
    });
    it('the primary frame: ink in light, the accent itself on a dark page', () => {
      expect(hex(colour(theme, '--hx-btn-primary-line'))).toBe(label === 'light' ? '#101010' : hex(colour(theme, '--hx-acc')));
    });
  });

  describe(`status roles (${label})`, () => {
    it('the danger tint is translucent (about 12%), never solid', () => {
      const a = colour(theme, '--hx-danger-t')[3];
      expect(a).toBeGreaterThan(0.05);
      expect(a).toBeLessThanOrEqual(0.2);
    });
    it('warning is more orange than danger (hue at least 10 degrees further from red)', () => {
      expect(hue(colour(theme, '--hx-warn-fill')) - hue(colour(theme, '--hx-danger-fill'))).toBeGreaterThanOrEqual(10);
      expect(hue(colour(theme, '--hx-warn-text')) - hue(colour(theme, '--hx-danger-text'))).toBeGreaterThanOrEqual(10);
    });
    it('each text shade keeps the hue of its fill (within 12 degrees)', () => {
      for (const [f, t] of [['--hx-danger-fill', '--hx-danger-text'], ['--hx-warn-fill', '--hx-warn-text']] as const)
        expect(Math.abs(hue(colour(theme, f)) - hue(colour(theme, t))), `${f}/${t}`).toBeLessThanOrEqual(12);
    });
  });
}

describe('sizes', () => {
  const px = (v: string | undefined) => Number(/^(\d+)px$/.exec(v ?? '')?.[1]);
  it('a text field is 40 px and a compact control 32 px; a button is 32 px and a small one 28 px; there is no lg size', () => {
    expect([px(light.get('--ctl-h')), px(light.get('--ctl-h-sm'))]).toEqual([40, 32]);
    expect([px(light.get('--btn-h')), px(light.get('--btn-h-sm'))]).toEqual([32, 28]);
    expect(light.has('--ctl-h-lg')).toBe(false);
    expect(light.has('--btn-h-lg')).toBe(false);
  });
  // Density never changes a control height; compact makes rows dense and nothing else.
  it('compact density makes rows dense and sets no control height', () => {
    const rule = /\[data-density="compact"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const props = [...rule.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
    expect(props).toEqual(['--row-h']);
    expect(/--row-h:\s*var\(--row-h-dense\)/.test(rule)).toBe(true);
  });
  it('a coarse pointer still raises controls to 44 px; a button is floored by its own rule, not by a token', () => {
    const coarse = /@media \(pointer: coarse\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(/--ctl-h:\s*44px/.test(coarse)).toBe(true);
    expect(/--btn-/.test(coarse)).toBe(false);
  });
});

// StatusPill and Tag read one tone map, and each tone's dot is the design's fill (warn and bad are the warning and
// danger fills).
describe('status pills and tags read the one tone map', () => {
  const pill = readFileSync(join(import.meta.dirname, 'data/Display.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  /** The declarations of every rule whose selector list names `sel`. */
  const decls = (sel: string) =>
    [...pill.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => m[1]!.split(',').map((x) => x.trim()).includes(sel)).map((m) => m[2]!).join(';');
  it.each([
    ['.ok', 'ok'], ['.tag_ok', 'ok'], ['.warn', 'warn'], ['.tag_warn', 'warn'], ['.danger', 'bad'],
    ['.neutral', 'neutral'], ['.info', 'neutral'], ['.tag_neutral', 'neutral'],
  ])('%s takes the %s fill, edge, text and dot', (sel, role) => {
    for (const part of ['bg', 'edge', 'ink', 'dot']) expect(decls(sel)).toMatch(new RegExp(`--tone-${part}:\\s*var\\(--hx-tag-${role}-${part}\\)`));
  });
  it('the pill, the tag and the dot paint only from the tone map', () => {
    expect(decls('.pill')).toMatch(/background:\s*var\(--tone-bg\)/);
    expect(decls('.tag')).toMatch(/border:\s*var\(--bw\) solid var\(--tone-edge\)/);
    expect(decls('.pill')).toMatch(/color:\s*var\(--tone-ink\)/);
    expect(decls('.dot')).toMatch(/background:\s*var\(--tone-dot\)/);
  });
  it('the warn and bad dots are the warning and danger fills', () => {
    expect(light.get('--hx-tag-warn-dot')).toBe(light.get('--hx-warn-fill'));
    expect(light.get('--hx-tag-bad-dot')).toBe(light.get('--hx-danger-fill'));
  });
});

describe('page dots and swatches take the muted fill, not the text shade', () => {
  const read = (p: string) => readFileSync(join(import.meta.dirname, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (css: string, sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.[\]():]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  const board = read('../pages/board/parts/board.module.css');
  const home = read('../pages/home/parts/home.module.css');
  it('a Board browser dot', () => expect(rule(board, '.dot')).toMatch(/background:\s*var\(--hx-muted-fill\)/));
  it('a stopped Board browser dot ring', () => expect(rule(board, '.dotStopped')).toMatch(/border:\s*var\(--bw\) solid var\(--hx-muted-fill\)/));
  it('an untinted Home realm swatch', () => expect(rule(home, '.swatch')).toMatch(/background:\s*var\(--rc, var\(--swatch-plain, var\(--hx-muted-fill\)\)\)/));
});

// A Home realm swatch takes its colour from the kit's global `.rc-<colour>` class (--rc), which wins over the plain
// shade in the swatch rule above. That only holds while every palette colour has its class and the row applies it.
describe('a realm colour reaches the Home swatch', () => {
  const src = (p: string) => readFileSync(join(import.meta.dirname, p), 'utf8');
  const palette = [...(/PALETTE\s*=\s*\[([^\]]*)\]/.exec(src('../core/realm.ts'))?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]!);
  const tintRule = (sheet: string, tint: string) => new RegExp(`(?:^|\\})\\s*\\.rc-${tint}\\s*\\{([^}]*)\\}`, 'm').exec(sheet)?.[1] ?? '';
  const missing = (sheet: string) => palette.filter((tint) => !new RegExp(`--rc:\\s*var\\(--hx-r-${tint}\\)`).test(tintRule(sheet, tint)));
  it('the palette is read', () => expect(palette).toEqual(expect.arrayContaining(['red', 'blue'])));
  it('every palette colour has its .rc-<colour> class setting --rc to its realm token', () => expect(missing(css)).toEqual([]));
  it('the check sees a class that is gone', () => expect(missing(css.replace(/(^|\})\s*\.rc-red\s*\{[^}]*\}/m, '$1'))).toEqual(['red']));
  it('every realm token is defined (dark inherits it unless it sets its own)', () => {
    for (const tint of palette) expect(light.has(`--hx-r-${tint}`), tint).toBe(true);
  });
  it('the Home realm row puts the class on its swatch', () => {
    // The row hands its tint to RealmSwatch, which puts the class on the span.
    expect(src('../pages/home/parts/RealmsCard.tsx')).toMatch(/<RealmSwatch tint=\{r\.tint\} \/>/);
    expect(src('../pages/home/parts/RealmSwatch.tsx')).toMatch(/className=\{cx\(s\.swatch,\s*tint && `rc-\$\{tint\}`\)\}/);
  });
});

describe('on a highlighted row the grey dots and swatch take the muted text shade', () => {
  const read = (p: string) => readFileSync(join(import.meta.dirname, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (css: string, sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.[\]():>=",]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  const board = read('../pages/board/parts/board.module.css');
  const home = read('../pages/home/parts/home.module.css');
  const boardRows = ':where(.active > .head, .chipBtn[aria-current="true"])';
  // The row hands the swatch its plain shade through --swatch-plain; a realm colour (--rc) still wins in the swatch rule.
  const homeRows = ['.realmRow:hover:not([aria-current])', '.realmRow[aria-current]'];
  it('the reason: the design grey falls below 3:1 on a highlighted card row in light, the muted text shade does not', () => {
    const card = colour(light, '--hx-card');
    for (const row of ['--hx-selected', '--hx-hover']) {
      const bg = over(colour(light, row), card);
      expect(ratio(colour(light, '--hx-muted-fill'), bg)).toBeLessThan(3);
      expect(ratio(colour(light, '--hx-muted'), bg)).toBeGreaterThanOrEqual(3);
    }
  });
  it('a Board browser dot on the selected header or current chip', () => expect(rule(board, `${boardRows} .dot`)).toMatch(/background:\s*var\(--hx-muted\)/));
  it('a stopped Board ring on the selected header or current chip', () => expect(rule(board, `${boardRows} .dotStopped`)).toMatch(/border-color:\s*var\(--hx-muted\)/));
  it('an untinted Home realm swatch on a hovered or current row', () => {
    for (const row of homeRows) expect(rule(home, row)).toMatch(/--swatch-plain:\s*var\(--hx-muted\)/);
  });
  it('the row rules weigh no more than the state and tint rules after them, so those still win', () => {
    const at = (css: string, sel: string) => css.search(new RegExp(`(?:^|\\})\\s*${sel.replace(/[.[\]():>=",]/g, '\\$&')}\\s*\\{`));
    expect(at(board, `${boardRows} .dot`)).toBeLessThan(at(board, '.dotLoaded'));
    expect(at(board, `${boardRows} .dot`)).toBeLessThan(at(board, '.dotSlow'));
    expect(at(board, `${boardRows} .dotStopped`)).toBeGreaterThan(at(board, '.dotStopped'));
  });
});
