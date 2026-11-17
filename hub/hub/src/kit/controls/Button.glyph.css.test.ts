// The kit Button's plate, read from source: one painted background with a cut at its bottom end, sized and tinted only
// through the --plate* properties; the end glyph inside the plate after the label; the size tokens and who may set
// them; and two scans over the Hub's .tsx files (no glyph on Cancel, a pixel twin for every end icon).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PX_FROM_ICON } from '../icons';
import { webDrawn } from '../../app/conformance/termFiles';

const SRC = join(import.meta.dirname, '..', '..');
const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const read = (p: string) => noComments(readFileSync(join(SRC, p), 'utf8'));
const button = read('kit/controls/Button.module.css');
const tokens = read('kit/tokens.css');

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === 'node_modules') continue;
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.test(n)) out.push(p);
  }
  return out;
}

/** The declarations of the first rule whose selector list is exactly `sel`. */
function rule(css: string, sel: string): string {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`no rule ${sel}`);
  return m[1]!;
}
const decl = (body: string, prop: string) => new RegExp(`(?:^|;|\\s)${prop.replace(/[-]/g, '\\-')}\\s*:\\s*([^;]+);`).exec(body)?.[1]?.trim().replace(/\s+/g, ' ');

/** The CSS without its `@media <cond>` blocks (nested braces included). */
function withoutMedia(css: string, cond: string): string {
  let out = '';
  let at = 0;
  for (let i = css.indexOf(`@media ${cond}`); i >= 0; i = css.indexOf(`@media ${cond}`, at)) {
    out += css.slice(at, i);
    let depth = 0;
    let j = css.indexOf('{', i);
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}' && --depth === 0) break;
    }
    at = j + 1;
  }
  return out + css.slice(at);
}

/** Every innermost rule as its selector list (one line) and its declarations by property. */
function rulesOf(css: string): Array<{ sel: string; props: Map<string, string> }> {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => {
    const props = new Map<string, string>();
    for (const d of m[2]!.split(';')) {
      const i = d.indexOf(':');
      if (i > 0) props.set(d.slice(0, i).trim(), d.slice(i + 1).trim().replace(/\s+/g, ' '));
    }
    return { sel: m[1]!.trim().replace(/\s+/g, ' '), props };
  });
}
const all = rulesOf(button);
/** The selectors of the rules that declare a property `test` accepts, with the value each gives it. */
const declaring = (rules: typeof all, test: (prop: string) => boolean) => rules.flatMap((r) => [...r.props].filter(([p]) => test(p)).map(([p, v]) => `${r.sel} | ${p}: ${v}`));

const root = rule(tokens, ':root');
const dark = rule(tokens, ':root[data-hx-theme="dark"]');

describe('the plate', () => {
  const base = rule(button, '.button');

  it('is one painted background: the fill over the frame, both cut at --plate-cut, under a transparent 1 px border; square', () => {
    expect(decl(base, 'border')).toBe('var(--bw) solid transparent');
    expect(decl(base, 'border-radius')).toBe('0');
    // Two layers: the fill inside the border (padding-box), the frame colour under the whole box (border-box).
    const layers = decl(base, 'background')!.split(/,\s*(?=linear-gradient)/);
    expect(layers).toHaveLength(2);
    expect(layers[0]).toMatch(/^linear-gradient\(var\(--plate-angle\), transparent [^,]*var\(--plate-cut-at\)[^,]*, var\(--plate\) [^,]*var\(--plate-cut-at\).*\) padding-box$/);
    // The diagonal is painted wider than one line, with a soft outer edge: a one-line band between two hard stops breaks
    // up or vanishes on a plate of a fractional size or under browser zoom (a 105.5 px Filters button lost its corner line).
    expect(layers[0]).toBe('linear-gradient(var(--plate-angle), transparent calc(var(--plate-cut-at) - 0.414 * var(--bw) + var(--plate-cut-grow)), var(--plate) calc(var(--plate-cut-at) - 0.414 * var(--bw) + var(--plate-cut-grow))) padding-box');
    expect(layers[1]).toBe('linear-gradient(var(--plate-angle), transparent calc(var(--plate-cut-at) - var(--plate-cut-soft)), var(--plate-line) calc(var(--plate-cut-at) + var(--plate-cut-soft))) border-box');
    expect([decl(base, '--plate-cut-grow'), decl(base, '--plate-cut-soft')]).toEqual(['var(--btn-cut-line-grow)', 'var(--btn-cut-line-soft)']);
    expect([decl(root, '--btn-cut-line-grow'), decl(root, '--btn-cut-line-soft')]).toEqual(['0.7px', '0.25px']);
    // The accent plate keeps the exact one-line diagonal.
    expect([decl(rule(button, '.primary'), '--plate-cut-grow'), decl(rule(button, '.primary'), '--plate-cut-soft')]).toEqual(['0px', '0px']);
    // The cut is a 45 degree corner at the bottom end: the bottom left on a right-to-left page.
    expect(decl(base, '--plate-cut-at')).toBe('calc(var(--plate-cut) * 0.7071)');
    expect(decl(base, '--plate-angle')).toBe('315deg');
    expect(decl(rule(button, '.button:dir(rtl)'), '--plate-angle')).toBe('45deg');
  });

  it('at rest is the grey plate inside its line, at the md height and cut, padded and spaced by the button tokens', () => {
    expect(decl(base, '--plate')).toBe('var(--hx-btn-plate)');
    expect(decl(base, '--plate-line')).toBe('var(--hx-btn-line)');
    expect(decl(base, '--plate-h')).toBe('var(--btn-h)');
    expect(decl(base, '--plate-cut')).toBe('var(--btn-cut)');
    expect(decl(base, 'block-size')).toBe('var(--plate-h)');
    expect(decl(base, 'padding-inline')).toBe('var(--btn-pad)');
    expect(decl(base, 'gap')).toBe('var(--btn-gap)');
  });

  it('paints only through --plate*: no variant, size or state rule sets a background or a border colour of its own', () => {
    // Forced colours are the one other painter: there the border becomes a system line.
    const painted = declaring(rulesOf(withoutMedia(button, '(forced-colors: active)')), (p) => /^(background(-color|-image)?|border(-(block|inline)(-(start|end))?)?(-color)?)$/.test(p)).map((d) => d.split(' | ')[0]);
    // The base plate, the bubble (the same plate without a frame) and the tooltip's own box.
    expect(painted).toEqual(['.button', '.button', '.button.bubble', '.button.bubble', '.tooltip']);
    expect(decl(rule(button, '.button.bubble'), 'background')).toBe('linear-gradient(var(--plate-angle), transparent var(--plate-cut-at), var(--plate) var(--plate-cut-at))');
    expect(decl(rule(button, '.button.bubble'), 'border')).toBe('0');
  });

  it('is never clipped, lifted or drawn by a pseudo-element: no clip-path, shadow or transform on any button rule', () => {
    // A clip-path would cut the focus ring and an xs button's press area away. The two clips in the file hide text, never a
    // button: the screen-reader words, and a busy button's label under its dots (the label span; the ring is the button's).
    expect(declaring(all, (p) => p === 'clip-path').map((d) => d.split(' | ')[0])).toEqual(['.busyOver > .label', '.srOnly']);
    // The only shadows are the focus ring, a drop target's inset ring and the tooltip's.
    expect(declaring(all, (p) => p === 'box-shadow')).toEqual([
      '.button[data-focus-visible] | box-shadow: var(--focus-ring)',
      '.iconOnly[data-drop-target]:not([data-focus-visible]) | box-shadow: var(--focus-ring-inset)',
      '.tooltip | box-shadow: var(--sh-2)',
    ]);
    expect(declaring(all, (p) => /^(transform|translate|scale|rotate|filter)$/.test(p))).toEqual([]);
    // The one pseudo-element is an xs button's press area, never part of the plate.
    expect(all.filter((r) => r.sel.includes('::')).map((r) => r.sel)).toEqual(['.xs::after', '.iconOnly.xs::after']);
    expect(button).not.toMatch(/::before/);
  });

  it('the plate swaps at once: the only transition is the focus ring', () => {
    expect(declaring(all, (p) => p.startsWith('transition'))).toEqual(['.button | transition: box-shadow var(--dur-press) var(--ease-out)']);
  });

  it('hover is the darker plate inside the full-ink line, pressed one step darker', () => {
    const hover = rule(button, '.button[data-hovered]');
    expect([decl(hover, '--plate'), decl(hover, '--plate-line')]).toEqual(['var(--hx-btn-plate-hover)', 'var(--hx-btn-line-hover)']);
    const press = rule(button, '.button[data-pressed]');
    expect([decl(press, '--plate'), decl(press, '--plate-line')]).toEqual(['var(--hx-btn-plate-press)', 'var(--hx-btn-line-hover)']);
    expect([decl(root, '--hx-btn-plate'), decl(root, '--hx-btn-plate-hover'), decl(root, '--hx-btn-plate-press')]).toEqual(['#e3e3e3', '#d6d6d6', '#cacaca']);
    expect([decl(root, '--hx-btn-line'), decl(root, '--hx-btn-line-hover')]).toEqual(['#7a7a7a', '#101010']);
    expect([decl(dark, '--hx-btn-plate'), decl(dark, '--hx-btn-plate-hover'), decl(dark, '--hx-btn-plate-press')]).toEqual(['#222225', '#2d2d31', '#38383d']);
    expect([decl(dark, '--hx-btn-line'), decl(dark, '--hx-btn-line-hover')]).toEqual(['#6d6d70', '#ededed']);
  });

  it('a toggle that is on holds the pressed step: a worded one, a toolbar one', () => {
    for (const sel of ['.button.pressed:not(.iconOnly)', '.button.toolbar.pressed']) {
      const on = rule(button, sel);
      expect([decl(on, '--plate'), decl(on, '--plate-line')], sel).toEqual(['var(--hx-btn-plate-press)', 'var(--hx-btn-line-hover)']);
    }
  });

  it('primary is the accent plate in its own frame: ink in light, the accent itself on a dark page', () => {
    const rest = rule(button, '.primary');
    expect([decl(rest, '--plate'), decl(rest, '--plate-line'), decl(rest, 'color')]).toEqual(['var(--hx-acc)', 'var(--hx-btn-primary-line)', 'var(--hx-acc-ink)']);
    const hover = rule(button, '.primary[data-hovered]');
    expect([decl(hover, '--plate'), decl(hover, '--plate-line')]).toEqual(['var(--hx-acc-hover)', 'var(--hx-btn-primary-line)']);
    const press = rule(button, '.primary[data-pressed]');
    expect([decl(press, '--plate'), decl(press, '--plate-line')]).toEqual(['var(--hx-acc-press)', 'var(--hx-btn-primary-line)']);
    expect(decl(root, '--hx-btn-primary-line')).toBe('#101010');
    expect(decl(dark, '--hx-btn-primary-line')).toBe('var(--hx-acc)');
    // The primary rules sit after the family's hover and pressed steps, so they win at equal weight.
    expect(button.indexOf('.primary[data-hovered]')).toBeGreaterThan(button.indexOf('.button[data-pressed]'));
  });

  it('disabled is the one recipe, --ctl-off-opacity; a disabled primary drops to the grey plate', () => {
    const off = rule(button, ".button[data-disabled],\n.button[aria-disabled='true']:not([data-pending])");
    expect(decl(off, 'opacity')).toBe('var(--ctl-off-opacity)');
    expect(decl(root, '--ctl-off-opacity')).toBe('0.5');
    expect(declaring(all, (p) => p === 'opacity').map((d) => d.split(' | ')[0])).toEqual([".button[data-disabled], .button[aria-disabled='true']:not([data-pending])", 'from']);
    const sel = ".primary:is([data-disabled], [aria-disabled='true']):not([data-pending])";
    const primaryOff = rule(button, sel);
    expect([decl(primaryOff, '--plate'), decl(primaryOff, '--plate-line'), decl(primaryOff, 'color')]).toEqual(['var(--hx-btn-plate)', 'var(--hx-btn-line)', 'var(--hx-btn-text)']);
    // After the primary's own state rules, so it wins at equal weight.
    expect(button.indexOf(sel)).toBeGreaterThan(button.indexOf('.primary[data-pressed]'));
  });
});

describe('sizes', () => {
  it('md is 32 with a 9 px cut, sm 28 with a 7 px cut; fixed tokens that no density or pointer rule renames', () => {
    expect([decl(root, '--btn-h'), decl(root, '--btn-h-sm')]).toEqual(['32px', '28px']);
    expect([decl(root, '--btn-cut'), decl(root, '--btn-cut-sm')]).toEqual(['9px', '7px']);
    expect(decl(root, '--btn-pad')).toBe('calc(var(--sp-3) + var(--sp-half))');
    expect(decl(root, '--btn-pad-icon')).toBe('var(--sp-4)');
    expect(decl(root, '--btn-gap')).toBe('var(--sp-2)');
    // Declared once, on :root: compact density and a coarse pointer never name a button token (the Button floors itself).
    expect(tokens.match(/--btn-[\w-]+\s*:/g)).toHaveLength(root.match(/--btn-[\w-]+\s*:/g)!.length);
    const compact = /\[data-density="compact"\]\s*\{([^}]*)\}/.exec(tokens)![1]!;
    expect(compact).not.toMatch(/--btn-/);
  });

  it('each size sets only the plate height and cut: sm 28 / 7, xs the 24 px control / 7, toolbar the toolbar control / 9; md has no rule', () => {
    const size = (sel: string) => [decl(rule(button, sel), '--plate-h'), decl(rule(button, sel), '--plate-cut')];
    expect(size('.sm')).toEqual(['var(--btn-h-sm)', 'var(--btn-cut-sm)']);
    expect(size('.xs')).toEqual(['var(--ctl-h-xs)', 'var(--btn-cut-sm)']);
    expect(size('.button.toolbar')).toEqual(['var(--tb-ctl-h)', 'var(--btn-cut)']);
    expect(size('.iconOnly.more:not(.toolbar, .inStrip)')).toEqual(['var(--btn-h-sm)', 'var(--btn-cut-sm)']);
    expect(button).not.toMatch(/\.md\b/);
    // Nothing else resizes a plate, and no rule sets a height past --plate-h.
    expect(declaring(all, (p) => p === '--plate-h').map((d) => d.split(' | ')[0])).toEqual(['.button', '.sm', '.xs', '.iconOnly.more:not(.toolbar, .inStrip)', '.button.inStrip', '.button.toolbar']);
    // The plate heights set outside the kit Button, both in the page header: a small worded button among its actions takes
    // the header height (buttons side by side share one height), and the phone's floating button is 56 px.
    const head = rulesOf(read('kit/layouts/PageHeader.module.css'));
    expect(declaring(head, (p) => p === '--plate-h')).toEqual(['.actions > :is(button, a)[data-variant][data-words] | --plate-h: var(--btn-h)', '.fab > button | --plate-h: var(--fab-h)']);
    expect(declaring(head, (p) => p === '--plate-cut')).toEqual(['.actions > :is(button, a)[data-variant][data-words] | --plate-cut: var(--btn-cut)']);
    expect(declaring(all, (p) => /^(min-|max-)?height$/.test(p))).toEqual([]);
    expect(declaring(all, (p) => p === 'block-size')).toEqual([
      '.button | block-size: var(--plate-h)',
      '.glyph | block-size: var(--btn-glyph)',
      '.button.bubble | block-size: auto',
      '.iconOnly | block-size: max(var(--plate-h), var(--icon-hit))',
      '.iconOnly.xs | block-size: var(--plate-h)',
      '.srOnly | block-size: 1px',
    ]);
  });

  it('a coarse pointer floors a button with words at --touch-min by itself, at zero specificity', () => {
    const coarse = /@media \(pointer: coarse\) \{([\s\S]*?)\n\}/.exec(button)![1]!;
    expect(decl(rule(coarse, ':where(.button:not(.iconOnly, .xs))'), 'min-block-size')).toBe('var(--touch-min)');
    expect(decl(rule(coarse, ':where(.button:not(.iconOnly) > .label)'), 'min-inline-size')).toBe('calc(var(--touch-min) - 2 * var(--btn-pad))');
  });

  it('every button with words is at least its whole words; the root sets no minimum of its own', () => {
    expect(decl(base(), 'min-inline-size')).toBeUndefined();
    const words = /(?:^|\n):where\(\.button:not\(\.iconOnly, \.bubble\)\)\s*\{([^}]*)\}/.exec(button);
    expect(words, 'the whole-words rule, outside any media block').not.toBeNull();
    expect(decl(words![1]!, 'min-inline-size')).toBe('max-content');
  });

  it('the retired tokens, knobs and classes are gone from the tokens and the Button', () => {
    const RETIRED = ['--btn-h-lg', '--btn-chip-lg', '--btn-chip-sm', '--btn-pad-sm', '--btn-sh', '--btn-sh-hover', '--btn-dur', '--sh-btn', '--sh-btn-hover', '--hx-btng-chip', '--hx-btn-sep', '--hx-btn-sep-n', '--hx-btn-sep-blue', '--hx-grey-plate-line', '--hx-grey-plate-hover', '--hx-more-line', '--hx-more-bg', '--hx-more-bg-hover', '--hx-strip-bg', '--hx-strip-line', '--hx-strip-hover', '--hx-blue-2'];
    const KNOBS = ['--btn-req', '--btn-nom', '--btn-chip', '--btn-chip-nom'];
    const names = (css: string) => new Set(css.match(/--[\w-]+/g));
    expect([...RETIRED, ...KNOBS].filter((n) => names(tokens).has(n) || names(button).has(n))).toEqual([]);
    expect(button).not.toMatch(/\.(chipped|cell|sep|chip|blue|grey)\b/);
  });

  function base() {
    return rule(button, '.button');
  }
});

describe('the end glyph', () => {
  it('sits inside the plate after the label, in a 12 px box that never shrinks, 10 px from the label', () => {
    const glyph = rule(button, '.glyph');
    expect(decl(glyph, 'flex')).toBe('none');
    expect([decl(glyph, 'inline-size'), decl(glyph, 'block-size')]).toEqual(['var(--btn-glyph)', 'var(--btn-glyph)']);
    // The root's gap already separates the label and the glyph: the margin adds the rest of --btn-glyph-gap.
    expect(decl(glyph, 'margin-inline-start')).toBe('calc(var(--btn-glyph-gap) - var(--btn-gap))');
    expect([decl(root, '--btn-glyph'), decl(root, '--btn-glyph-gap')]).toEqual(['12px', '10px']);
    // The glyph draws at its own size, centred on the box: no rule stretches or squeezes its svg (the arrow was squashed
    // into 12 x 12).
    expect(all.filter((r) => /\.glyph\b.*\bsvg\b/.test(r.sel)).map((r) => r.sel)).toEqual([]);
    expect([decl(glyph, 'place-content'), decl(glyph, 'place-items')]).toEqual(['center', 'center']);
    // It takes the label's ink: no rule colours it.
    expect(all.filter((r) => r.sel.includes('.glyph')).flatMap((r) => [...r.props.keys()])).not.toContain('color');
  });

  it('the label is the one child that shrinks, with an ellipsis, when a page caps the button below its words', () => {
    const label = rule(button, '.label');
    expect(decl(label, 'overflow')).toBe('hidden');
    expect(decl(label, 'text-overflow')).toBe('ellipsis');
  });

  it('a start icon with no glyph grows the end padding, so the words sit centred beside it', () => {
    expect(decl(rule(button, '.button.iconStart'), 'padding-inline-end')).toBe('var(--btn-pad-icon)');
  });

  it('a link button draws no CSS chevron of its own (the glyph is its mark)', () => {
    expect(button).not.toMatch(/a\.button[^{]*::after/);
  });
});

describe('button sizes are the kit\'s: no consumer sets a button token', () => {
  /** `<file> :: <selector> :: <property>` for each rule that declares a --btn-* property. */
  const knobHits = (file: string, source: string): string[] =>
    rulesOf(noComments(source)).flatMap((r) => [...r.props.keys()].filter((p) => /^--btn-/.test(p)).map((p) => `${file} :: ${r.sel} :: ${p}`));
  const css = walk(SRC, /\.css$/).filter((f) => !f.endsWith(join('kit', 'tokens.css')));

  it('the scan reads every rule, inside a media block too', () => {
    const fixture = ['.a button { min-height: 44px; --btn-req: 44px; }', '.b button { min-height: 40px; }', '@media (pointer: coarse) {\n  .c > button { --btn-pad: var(--sp-5); color: red; }\n}'].join('\n');
    expect(knobHits('f.css', fixture)).toEqual(['f.css :: .a button :: --btn-req', 'f.css :: .c > button :: --btn-pad']);
    expect(css.length).toBeGreaterThan(100);
  });

  it('no CSS outside kit/tokens.css declares a --btn-* property (a height request, a padding, a retired knob)', () => {
    expect(css.flatMap((f) => knobHits(relative(SRC, f), readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('the Ask submit takes the kit height: Home asks for none', () => {
    const home = read('pages/home/parts/parts.module.css');
    expect(decl(rule(home, '.askBtn'), 'min-block-size')).toBeUndefined();
    expect(decl(rule(home, '.askBtn'), 'block-size')).toBeUndefined();
  });
});

describe('scans over the Hub', () => {
  const tsx = walk(SRC, /\.tsx$/).filter((f) => !/\.(test|spec)\.tsx$/.test(f) && !/\/zz/.test(f));
  // Every <Button …> / <LinkButton …> opening tag with its props (one level of braces is enough for the Hub).
  const tags = tsx.flatMap((f) => {
    const text = readFileSync(f, 'utf8');
    return [...text.matchAll(/<(Button|LinkButton)\b((?:[^<>{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)>([\s\S]{0,160}?)<\/\1>/g)].map((m) => ({ f: relative(SRC, f), tag: m[1]!, props: m[2]!, body: m[3]! }));
  });
  const variantOf = (p: string) => /variant="(\w+)"/.exec(p)?.[1] ?? (/variant=\{/.test(p) ? 'dynamic' : 'secondary');
  // The variants that carry the end glyph, and a variant only known at run time.
  const eligible = (p: string) => ['primary', 'secondary', 'dynamic'].includes(variantOf(p));

  it('finds the Hub buttons (the scan works)', () => expect(tags.length).toBeGreaterThan(300));

  it('no glyph on Cancel: every glyph-eligible Cancel, small ones too, says chip={false}', () => {
    // A cancel key or a cancel label passed in by prop ({cancelLabel}, {label ?? t('cancel')}).
    // Web drawing only: the terminal Button draws no glyph (termFiles.test.ts pins it), so its Cancels need no chip={false}.
    const web = webDrawn('chip.cancel', 'the end glyph is the web Button\'s pixel icon; the terminal Button draws no glyph');
    const bad = tags.filter((b) => web(b.f) && b.tag === 'Button' && eligible(b.props) && /cancel/i.test(b.body) && !/chip=\{false\}/.test(b.props));
    expect(bad.map((b) => `${b.f}: ${b.body.trim().slice(0, 40)}`)).toEqual([]);
  });

  it('a Dialog whose primary action is a Cancel says primaryChip: false', () => {
    const bad = tsx.flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => ({ f: relative(SRC, f), line, i }))
        .filter(({ line }) => /primaryLabel(?:=\{|:\s*)t\(['"][\w.]*cancel\w*['"]/i.test(line) && !/primaryChip(?:=\{|:\s*)false/.test(line))
        .map(({ f, i, line }) => `${f}:${i + 1}: ${line.trim().slice(0, 60)}`),
    );
    expect(bad).toEqual([]);
  });

  it('every end icon on a glyph-eligible button has a pixel twin for the glyph', () => {
    const ends = new Set(tags.filter((b) => eligible(b.props)).flatMap((b) => [.../iconEnd="([\w-]+)"/.exec(b.props)?.slice(1) ?? []]));
    expect([...ends].filter((n) => !(n in PX_FROM_ICON))).toEqual([]);
  });

  it('no caller asks for a retired variant (blue, grey)', () => {
    expect(tags.filter((b) => ['blue', 'grey'].includes(variantOf(b.props))).map((b) => `${b.f}: ${b.body.trim().slice(0, 40)}`)).toEqual([]);
  });
});
