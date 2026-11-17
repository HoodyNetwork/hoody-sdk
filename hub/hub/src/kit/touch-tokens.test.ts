// Read from the CSS: the touch tokens are 0 with a fine pointer and 44 / 8 with a coarse one; no density rule
// (or any other rule outside the coarse block) names them, so compact cannot shrink a touch target; every button with
// words takes them as a minimum in both directions, at zero specificity (a page's own minimum still wins) and only
// inside a coarse-pointer block (a fine pointer keeps the automatic flex minimum), and icon-only buttons do not (they
// keep their --icon-hit square). The DataTable bulk toolbar wraps on a coarse pointer only.
// The real sizes and overlaps are measured in controls/touch-targets.spec.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const KIT = import.meta.dirname;
const read = (p: string) => readFileSync(join(KIT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = read('tokens.css');

/** The declarations of the first rule whose selector list is exactly `selector`, inside `within` when given. */
function block(css: string, selector: string): Map<string, string> {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no block ${selector}`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
  return out;
}

function coarseBlock(css: string): string {
  const at = css.indexOf('@media (pointer: coarse) {');
  if (at < 0) throw new Error('no coarse block');
  return css.slice(at, css.indexOf('}', css.indexOf('{', css.indexOf('{', at) + 1)) + 1);
}

/** True when `at` lies inside an open `@media (pointer: coarse) {` block of `css`. */
function insideCoarse(css: string, at: number): boolean {
  let open = css.lastIndexOf('@media (pointer: coarse) {', at);
  while (open >= 0) {
    let depth = 0;
    for (let i = css.indexOf('{', open); i < at; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    if (depth > 0) return true;
    open = css.lastIndexOf('@media (pointer: coarse) {', open - 1);
  }
  return false;
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
  });
}

describe('touch tokens', () => {
  it('are 0 by default, so a fine pointer keeps every size and gap', () => {
    const root = block(tokens, ':root');
    expect(root.get('--touch-min')).toBe('0px');
    expect(root.get('--touch-gap')).toBe('0px');
  });

  it('are 44px and 8px on a coarse pointer', () => {
    const coarse = block(coarseBlock(tokens), ':root');
    expect(coarse.get('--touch-min')).toBe('44px');
    expect(coarse.get('--touch-gap')).toBe('8px');
  });

  it('are set nowhere else in the Hub: no density rule (or any other) can shrink them', () => {
    const setters: string[] = [];
    for (const f of cssFiles(join(KIT, '..'))) {
      let css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      if (f === join(KIT, 'tokens.css')) {
        // The two allowed places: the :root defaults and the coarse block's :root.
        css = css.replace(coarseBlock(css), '');
        const at = css.indexOf(':root {');
        css = css.slice(0, at) + css.slice(css.indexOf('}', at) + 1);
      }
      if (/--touch-(min|gap)\s*:/.test(css)) setters.push(relative(join(KIT, '..'), f));
    }
    expect(setters).toEqual([]);
  });
});

describe('who takes the touch minimum', () => {
  const button = read('controls/Button.module.css');
  const link = read('controls/Link.module.css');

  it('every Button and LinkButton with words, in both directions; icon-only ones are left out', () => {
    const rule = button.match(/:where\(\.button:not\(\.iconOnly, \.xs\)\)\s*\{([^}]*)\}/);
    expect(rule, 'a :where(.button:not(.iconOnly, .xs)) rule').not.toBeNull();
    expect(insideCoarse(button, rule!.index!), 'only on a coarse pointer').toBe(true);
    expect(rule![1]).toMatch(/min-block-size:\s*var\(--touch-min\)/);
    // The width minimum is the button's whole words on every pointer (its own rule, outside the coarse block); the
    // label's floor (a calc of --touch-min, one per padding) keeps a one-letter button 44 wide, and a bubble (its words
    // wrap) keeps the plain 44.
    expect(rule![1]).not.toMatch(/min-inline-size/);
    const words = /(?:^|\n):where\(\.button:not\(\.iconOnly, \.bubble\)\)\s*\{([^}]*)\}/.exec(button);
    expect(words, 'the whole-words rule').not.toBeNull();
    expect(insideCoarse(button, words!.index!), 'every pointer').toBe(false);
    expect(words![1]).toMatch(/min-inline-size:\s*max-content/);
    // Each padding has its floor, inside the coarse block: md and sm pad --btn-pad a side (sm has no padding of its
    // own), a toolbar control --sp-3, xs --sp-1.
    const floor = (sel: string, pad: string) => {
      const m = new RegExp(`:where\\(${sel.replace(/[.()]/g, '\\$&')}:not\\(\\.iconOnly\\) > \\.label\\)\\s*\\{\\s*min-inline-size:\\s*calc\\(var\\(--touch-min\\) - 2 \\* var\\(${pad}\\)\\);`).exec(button);
      expect(m, `the ${sel} label floor for ${pad}`).not.toBeNull();
      expect(insideCoarse(button, m!.index), `${sel}: only on a coarse pointer`).toBe(true);
    };
    const padOf = (sel: string) => button.match(new RegExp(`(?:^|\\n)${sel.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    floor('.button', '--btn-pad');
    expect(padOf('.button')).toMatch(/padding-inline:\s*var\(--btn-pad\);/);
    expect(padOf('.sm'), 'sm keeps the default padding, so the default floor').not.toMatch(/padding/);
    floor('.button.toolbar', '--sp-3');
    expect(padOf('.button.toolbar')).toMatch(/padding-inline:\s*var\(--sp-3\);/);
    // xs draws 24 and takes the rest of its press from ::after, so it has no height minimum (the rule above leaves it
    // out); its width minimum is the floor for its --sp-1 padding.
    floor('.button.xs', '--sp-1');
    expect(padOf('.xs')).toMatch(/padding-inline:\s*var\(--sp-1\);/);
    // No other Button rule takes it: an icon-only button must not grow past --icon-hit. The uses are the rule's
    // height, the bubble's width, one label floor per padding, a shrink button's box width (coarse only, so a squeezed
    // slot cuts the label, never the press), and xs's press reach: --xs-press-out, the kit token's own sum taken from
    // the box as drawn (--plate-h, which is --ctl-h-xs for xs), which its two ::after insets read.
    const floors = button.match(/> \.label\)\s*\{\s*min-inline-size:\s*calc\(var\(--touch-min\)/g)?.length ?? 0;
    expect(floors).toBeGreaterThanOrEqual(3);
    expect(button.match(/var\(--touch-min\)/g)?.length).toBe(4 + floors);
    expect(padOf('.xs')).toMatch(/--plate-h:\s*var\(--ctl-h-xs\);/);
    expect(padOf('.xs')).toMatch(/--xs-press-out:\s*max\(0px, calc\(\(var\(--touch-min\) - var\(--plate-h\)\) \/ 2 \+ var\(--bw\)\)\);/);
    expect(button.match(/--xs-press-out\s*:/g)?.length, 'the reach is set once, on xs').toBe(1);
    expect(button.match(/inset-(?:block|inline): calc\(-1 \* var\(--xs-press-out\)\);/g)?.length, "xs's two ::after insets").toBe(2);
    for (const m of button.matchAll(/([^{}]+)\{[^{}]*min-(?:block|inline)-size:\s*var\(--touch-min\)/g)) expect([':where(.button:not(.iconOnly, .xs))', ':where(.button.bubble)', '.shrink']).toContain(m[1]!.replace(/\/\*[\s\S]*?\*\//g, '').trim());
  });

  it('a strip button pads --sp-3 a side and has the label floor for that padding, so a one-letter strip button is 44 wide on a coarse pointer', () => {
    const strip = button.match(/(?:^|\n)\.button\.inStrip\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(strip).toMatch(/padding-inline:\s*var\(--sp-3\);/);
    const m = /:where\(\.button\.inStrip:not\(\.iconOnly\) > \.label\)\s*\{\s*min-inline-size:\s*calc\(var\(--touch-min\) - 2 \* var\(--sp-3\)\);/.exec(button);
    expect(m, 'the strip label floor: the default one is for --btn-pad (14 px), a strip button pads 12').not.toBeNull();
    expect(insideCoarse(button, m!.index), 'only on a coarse pointer').toBe(true);
  });

  it('an IconButton is a square of its plate height or its --icon-hit, whichever is larger, and takes no hidden hit area', () => {
    const drawn = button.match(/(?:^|\n)\.iconOnly\s*\{([^}]*)\}/);
    expect(drawn, 'the .iconOnly rule').not.toBeNull();
    expect(drawn![1]).toMatch(/inline-size:\s*max\(var\(--plate-h\),\s*var\(--icon-hit\)\)/);
    expect(drawn![1]).toMatch(/block-size:\s*max\(var\(--plate-h\),\s*var\(--icon-hit\)\)/);
    // sm is the 28 px plate, the default --icon-hit; a coarse pointer raises --icon-hit to 44, so every size but xs is 44.
    expect(button.match(/(?:^|\n)\.sm\s*\{([^}]*)\}/)![1]).toMatch(/--plate-h:\s*var\(--btn-h-sm\)/);
    expect(block(tokens, ':root').get('--btn-h-sm')).toBe('28px');
    expect(block(tokens, ':root').get('--icon-hit')).toBe('28px');
    expect(block(coarseBlock(tokens), ':root').get('--icon-hit')).toBe('44px');
    // Only xs reaches past its drawn box (its own ::after press); no other icon button has a hit area or a margin.
    expect(button.match(/[^\s{}]*::after/g)).toEqual(['.xs::after', '.iconOnly.xs::after']);
    expect(button, 'no margin rule for an icon button').not.toMatch(/\.iconOnly[^{}]*\{[^}]*margin/);
  });

  it("a button's height is its plate height, floored by the Button itself on a coarse pointer: no height formula, no request knob", () => {
    const base = button.match(/(?:^|\n)\.button\s*\{([^}]*)\}/)![1]!;
    expect(base).toMatch(/block-size:\s*var\(--plate-h\);/);
    expect(base).toMatch(/--plate-h:\s*var\(--btn-h\);/);
    expect(block(tokens, ':root').get('--btn-h')).toBe('32px');
    // The size tokens are fine-pointer heights that no pointer rule changes; the retired knobs are gone.
    expect([...block(coarseBlock(tokens), ':root').keys()].filter((k) => k.startsWith('--btn-'))).toEqual([]);
    expect(button).not.toMatch(/--btn-(req|nom|chip|chip-nom)\b/);
    expect(button).not.toMatch(/--plate-h:[^;]*--touch-min/);
  });

  it('every TextButton (so a Band action), in both directions, at zero specificity', () => {
    const rule = link.match(/:where\(\.textButton\)\s*\{([^}]*)\}/);
    expect(rule, 'a :where(.textButton) rule').not.toBeNull();
    expect(insideCoarse(link, rule!.index!), 'only on a coarse pointer').toBe(true);
    // Its words are centred in the larger box on a coarse pointer only; the plain rule keeps its alignment.
    expect(rule![1]).toMatch(/justify-content:\s*center/);
    expect(link.match(/\.textButton\s*\{([^}]*)\}/)![1]).not.toMatch(/justify-content/);
    expect(rule![1]).toMatch(/min-block-size:\s*var\(--touch-min\)/);
    expect(rule![1]).toMatch(/min-inline-size:\s*var\(--touch-min\)/);
  });

  it('a stacked PageHeader keeps the minimum for its word buttons (its own min-width 0 would drop it), coarse only', () => {
    const header = read('layouts/PageHeader.module.css');
    const rule = header.match(/\.stacked \.actions > :is\(\[data-variant\], \[data-text-button\]\)\s*\{([^}]*)\}/);
    expect(rule, 'the stacked word-button rule').not.toBeNull();
    expect(rule![1]).toMatch(/min-width:\s*min\(var\(--touch-min\), 100%\)/);
    expect(insideCoarse(header, rule!.index!)).toBe(true);
  });

  // The toggles take the minimum as their own box, coarse only, never a hit area over a neighbour.
  it('Switch, Checkbox and Radio are --touch-min tall on a coarse pointer, and a bare Switch or Checkbox --touch-min wide', () => {
    const fields = read('forms/fields.module.css');
    const more = read('forms/more.module.css');
    /** The body of the rule whose selector list is exactly `sel` (text as written), and where it starts, or null. */
    const rule = (css: string, sel: string, from = 0) => {
      const at = css.indexOf(`${sel} {`, from);
      return at < 0 ? null : { at, body: css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at)) };
    };
    const tall = rule(fields, '.switch,\n  .checkbox');
    expect(tall, 'the Switch and Checkbox coarse rule').not.toBeNull();
    expect(insideCoarse(fields, tall!.at)).toBe(true);
    expect(tall!.body).toMatch(/min-block-size:\s*var\(--touch-min\)/);
    const bare = rule(fields, '.switch:not(:has(> .switchLabel)),\n  .checkbox:not(:has(> .checkText))');
    expect(bare, 'the bare toggle rule').not.toBeNull();
    expect(insideCoarse(fields, bare!.at)).toBe(true);
    expect(bare!.body).toMatch(/min-inline-size:\s*var\(--touch-min\)/);
    const coarseRadio = rule(more, '  .radio', more.indexOf('@media (pointer: coarse) {'));
    expect(coarseRadio, 'the Radio coarse rule').not.toBeNull();
    expect(insideCoarse(more, coarseRadio!.at)).toBe(true);
    expect(coarseRadio!.body).toMatch(/min-block-size:\s*var\(--touch-min\)/);
    // No hit area outside the box: the toggles grow; none of their parts carries a touch extension, and no raw 44.
    for (const [name, css] of [['fields', fields], ['more', more]] as const) {
      expect(css.match(/\.(?:box|track|thumb|radioDot)::(?:before|after)/g), `${name}: no pseudo hit area on a toggle part`).toBeNull();
      expect(css, name).not.toMatch(/\b44px\b/);
    }
  });

  it('the DataTable bulk toolbar wraps on a coarse pointer only', () => {
    const table = read('data/DataTable.module.css');
    const at = table.indexOf('.toolbar:has(> .bulk) {');
    expect(at, 'a .toolbar:has(> .bulk) rule').toBeGreaterThan(-1);
    expect(table.indexOf('.toolbar:has(> .bulk) {', at + 1)).toBe(-1);
    expect(insideCoarse(table, at)).toBe(true);
  });
});

describe('--hit-narrow (a width-based thumb target)', () => {
  it('a table holds its coarse checks: the column is the 44 square, a compact row stays 44, a selecting rail widens its lead', () => {
    const dt = read('data/DataTable.module.css');
    expect(dt).toContain('.colCheck {\n  width: max(40px, var(--touch-min));');
    const coarse = dt.slice(dt.indexOf('.thead th.thCheck,\n  .tr > td.tdCheck {'));
    expect(coarse.startsWith('.thead th.thCheck,\n  .tr > td.tdCheck {\n    padding-inline: 0;')).toBe(true);
    expect(dt).toContain("[data-density='compact'] .tr > .tdCheck > label {\n    min-block-size: calc(var(--touch-min) - var(--bw));");
    expect(dt).toContain(".railLead:has([data-rail-lead] input[type='checkbox']) {\n    --rail-cols: max(var(--rail-lead), var(--touch-min)) minmax(0, 1fr) auto;");
  });

  it('is 44px in :root, outside the coarse block: it follows the width, not the pointer', () => {
    expect(block(tokens, ':root').get('--hit-narrow')).toBe('44px');
    expect(block(coarseBlock(tokens), ':root').has('--hit-narrow')).toBe(false);
  });

  // The `{ ... }` span of every `header {` block in css, found by brace depth (a regex cannot tell where a query ends).
  const querySpans = (css: string, header: string): Array<[number, number]> => {
    const spans: Array<[number, number]> = [];
    for (let at = css.indexOf(header); at !== -1; at = css.indexOf(header, at + 1)) {
      let depth = 0;
      for (let i = css.indexOf('{', at); i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) {
          spans.push([at, i]);
          break;
        }
      }
    }
    return spans;
  };
  const ruleIn = (css: string, header: string, rule: string): string | null => {
    for (const [from, to] of querySpans(css, header)) {
      const body = css.slice(from, to);
      const at = body.indexOf(rule);
      if (at !== -1) return body.slice(at + rule.length, body.indexOf('}', at));
    }
    return null;
  };

  it('is what the narrow-width blocks use, no raw 44px left in them; none sets a kit button\'s height', () => {
    // A dialog's phone footer leaves its buttons to the kit: a coarse pointer floors them at 44 by the Button's own rule.
    const dialog = read('overlays/Dialog.module.css');
    const phone = querySpans(dialog, '@media (width < 600px) {').map(([from, to]) => dialog.slice(from, to)).join('\n');
    expect(phone.length, "the Dialog's phone block").toBeGreaterThan(0);
    expect(phone).not.toMatch(/44px/);
    expect(phone).not.toMatch(/--btn-[\w-]+\s*:/);
    expect(phone).not.toMatch(/:global\(button\)\s*\{[^}]*(?:min-)?(?:height|block-size)\s*:/);
    const row = read('pickers/PickerPanel.module.css').match(/\.narrow \.row \{([^}]*)\}/);
    expect(row, 'the PickerPanel .narrow .row rule').not.toBeNull();
    expect(row![1]).toMatch(/min-height:\s*var\(--hit-narrow\)/);
    const footer = ruleIn(read('layouts/ListDetailPage.module.css'), '@container content (width < 600px) {', '.detailFooter {');
    expect(footer, 'the ListDetailPage .detailFooter rule, inside its container query').not.toBeNull();
    expect(footer).toMatch(/--ctl-h:\s*var\(--hit-narrow\)/);
    expect(footer).not.toMatch(/44px/);
  });
});
