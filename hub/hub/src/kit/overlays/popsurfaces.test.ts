// Vitest: the kit overlay surfaces read the overlay tokens. Read as text (a CSS module import gives
// class names, not rules). Each bar and band that can hold a ring-focused control sets --ring-gap to its own fill; disabled
// rows dim by colour (--pop-off), never by opacity; rows use the row metrics; group labels share one shape. The computed
// side (Playwright, both themes) is popsurfaces.spec.ts.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const KIT = path.join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(KIT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** A selector list as one comparable string: whitespace collapsed, and an attribute value's optional quotes dropped
 *  (`[aria-disabled="true"]` and `[aria-disabled=true]` are the same selector). */
export const normSel = (sel: string) =>
  sel
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/=(["'])([-\w]*)\1\]/g, '=$2]');

/** The declarations of the top-level rule whose selector list is exactly `sel`. */
function rule(file: string, sel: string): Map<string, string> | null {
  for (const m of read(file).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (normSel(m[1] ?? '') !== normSel(sel)) continue;
    const out = new Map<string, string>();
    for (const d of (m[2] ?? '').split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
    return out;
  }
  return null;
}

const BANDS: Array<[file: string, sel: string, fill: '--bar-bg' | '--pop-band', control: boolean]> = [
  ['overlays/Dialog.module.css', '.buttons', '--bar-bg', true],
  ['overlays/Popover.module.css', '.sheetHead', '--bar-bg', true],
  ['overlays/Popover.module.css', '.sheetFoot', '--bar-bg', true],
  ['overlays/Popover.module.css', '.flush > .title', '--pop-band', false],
  ['forms/more.module.css', '.search', '--pop-band', true],
  ['forms/more.module.css', '.more', '--pop-band', false],
  ['pickers/PickerPanel.module.css', '.searchRow', '--pop-band', true],
  ['pickers/PickerPanel.module.css', '.create', '--pop-band', true],
];

describe('bars and bands', () => {
  for (const [file, sel, fill, control] of BANDS) {
    it(`${file} ${sel} is painted var(${fill})${control ? ', with that ring gap and the canonical ring' : ''}`, () => {
      const r = rule(file, sel);
      expect(r, `${file} ${sel}`).not.toBeNull();
      expect(r?.get('background')).toBe(`var(${fill})`);
      if (control) {
        expect(r?.get('--ring-gap')).toBe(`var(${fill})`);
        expect(r?.get('--focus-ring')).toBe('0 0 0 2px var(--ring-gap), 0 0 0 4px var(--hx-focus)');
      }
    });
  }
  it('the dialog draws the one popover frame', () => {
    expect(rule('overlays/Dialog.module.css', '.modal')?.get('border')).toBe('var(--bw) solid var(--pop-line)');
  });
  it('every rule on a bar or band edge and every separator is --pop-sep', () => {
    expect(rule('overlays/Menu.module.css', '.sep')?.get('background')).toBe('var(--pop-sep)');
    expect(rule('data/DataTable.module.css', '.menuSep')?.get('background')).toBe('var(--pop-sep)');
    expect(rule('overlays/Dialog.module.css', '.buttons')?.get('border-block-start')).toBe('var(--bw) solid var(--pop-sep)');
    expect(rule('overlays/Dialog.module.css', '.head[data-scrolled]')?.get('border-block-end-color')).toBe('var(--pop-sep)');
    expect(rule('forms/more.module.css', '.search')?.get('border-bottom')).toBe('var(--bw) solid var(--pop-sep)');
  });
});

describe('rows', () => {
  it('menu, select and table-menu rows take the row metrics', () => {
    expect(rule('overlays/Menu.module.css', '.item')?.get('min-height')).toBe('var(--pop-row-h)');
    expect(rule('overlays/Menu.module.css', '.item')?.get('padding')).toBe('0 var(--pop-row-x)');
    expect(rule('forms/more.module.css', '.option')?.get('min-height')).toBe('var(--pop-row-h)');
    expect(rule('data/DataTable.module.css', '.menuItem')?.get('min-height')).toBe('var(--pop-row-h)');
  });
  it('rows sit the row gap apart, never after a rule or a head (the 4 px around a separator stays even)', () => {
    expect(rule('overlays/Menu.module.css', '.item + .item')?.get('margin-block-start')).toBe('var(--pop-row-gap)');
    expect(rule('forms/more.module.css', '.option + .option')?.get('margin-block-start')).toBe('var(--pop-row-gap)');
    expect(rule('data/DataTable.module.css', '.menuItem + .menuItem')?.get('margin-block-start')).toBe('var(--pop-row-gap)');
    // A flex gap on the section would also open below the separator rendered first in it.
    expect(rule('overlays/Menu.module.css', '.section')?.get('gap')).toBeUndefined();
    expect(rule('forms/more.module.css', '.listbox')?.get('gap')).toBeUndefined();
  });
  it('unavailable wins over checked: a chosen box or dot on an off row is --pop-off, no ink fill', () => {
    const pp = 'pickers/PickerPanel.module.css';
    const box = rule(pp, '.row[data-off] .box, .row[data-off] .dot, .row[data-off][data-checked] .box');
    expect(box?.get('border-color')).toBe('var(--pop-off)');
    expect(box?.get('color')).toBe('var(--pop-off)');
    expect(box?.get('background')).not.toBe('var(--hx-ink)');
    expect(rule(pp, '.row[data-off][data-checked] .dot')?.get('border')).toBe('5px solid var(--pop-off)');
    // Written after the checked rules, which have lower specificity anyway.
    const css = normSel(read(pp));
    const at = (sel: string) => css.indexOf(normSel(sel));
    expect(at('.row[data-checked] .dot')).toBeGreaterThan(-1);
    expect(at('.row[data-off][data-checked] .dot')).toBeGreaterThan(at('.row[data-checked] .dot'));
    expect(rule('forms/more.module.css', '.option[data-disabled], .option[data-disabled] .optionCheck')?.get('color')).toBe('var(--pop-off)');
  });
  it('a disabled overlay row (menu item, option, picker row) dims by colour, never by opacity', () => {
    const files = ['overlays/Menu.module.css', 'forms/more.module.css', 'pickers/PickerPanel.module.css', 'data/DataTable.module.css'];
    for (const f of files)
      for (const m of read(f).matchAll(/([^{}]+)\{([^{}]*)\}/g))
        if (/\.(item|option|row|menuItem)\[[^\]]*(disabled|unavailable|data-off(?![\w-]))/.test(m[1] ?? '')) expect(m[2] ?? '', `${f} ${(m[1] ?? '').trim()}`).not.toMatch(/opacity/);
    expect(rule('overlays/Menu.module.css', '.item[data-disabled], .item[data-unavailable], .item[data-disabled] .lead, .item[data-unavailable] .lead, .item[data-unavailable] .currentMark, .item[data-unavailable] .box')?.get('color')).toBe('var(--pop-off)');
    expect(rule('forms/more.module.css', '.option[data-disabled], .option[data-disabled] .optionCheck')?.get('color')).toBe('var(--pop-off)');
    expect(rule('pickers/PickerPanel.module.css', '.row[data-off]')?.get('color')).toBe('var(--pop-off)');
  });
  it('a reason line under an item stays readable (--hx-muted, not faint)', () => {
    expect(rule('overlays/Menu.module.css', '.reason')?.get('color')).toBe('var(--hx-muted)');
  });
  it('state colours are scoped to the row\'s own icon, never every svg inside it', () => {
    const menu = read('overlays/Menu.module.css');
    expect(menu).not.toMatch(/\.item\[data-focused\] svg/);
    expect(menu).not.toMatch(/\.danger\[data-focused\] svg/);
  });
});

/** --pop-off is a text role for inactive items only. No selector heuristic
 *  (one passed `.item:not([data-disabled])` and `.item[data-disabled] + .item`). Instead, the exact selector lists, per
 *  file, that may name var(--pop-off); a new use is added here on purpose and reviewed. --pop-off is declared only in
 *  tokens.css. */
export const POP_OFF_ALLOWED: Readonly<Record<string, readonly string[]>> = {
  'kit/overlays/Menu.module.css': [
    '.item[data-disabled], .item[data-unavailable], .item[data-disabled] .lead, .item[data-unavailable] .lead, .item[data-unavailable] .currentMark, .item[data-unavailable] .box',
    '.item[data-unavailable] .box, .item[data-unavailable] .box[data-on]',
    '.item[data-unavailable] .thumb',
  ],
  'kit/forms/more.module.css': ['.option[data-disabled], .option[data-disabled] .optionCheck'],
  // The table's own view menu draws an unavailable item as the kit Menu does.
  'kit/data/DataTable.module.css': ['.menuItem[data-disabled], .menuItem[data-disabled] .menuCheck'],
  'kit/pickers/PickerPanel.module.css': [
    '.row[data-off]',
    '.row[data-off] .box, .row[data-off] .dot, .row[data-off][data-checked] .box',
    '.row[data-off][data-checked] .dot',
  ],
  // The file chooser's list is a picker: a row that cannot be chosen reads as the picker's off row does.
  'kit/pickers/FileChooser.module.css': ['.row[data-disabled] .rowName, .row[data-disabled] .rowIcon, .row[data-disabled] .rowCell'],
};
/** The only declarations of --pop-off (light, dark), each once, in tokens.css; the rest of tokens.css is checked like any
 *  other source. */
export const POP_OFF_DEFS: Readonly<Record<string, readonly string[]>> = {
  'kit/tokens.css': ['--pop-off: var(--hx-muted-fill);', '--pop-off: var(--hx-frame);'],
};
/** Files that name --pop-off as data, not as a use: the tests about it. */
const POP_OFF_SOURCES = new Set(['kit/overlays/popsurfaces.test.ts', 'kit/overlays/popsurfaces.spec.ts', 'kit/overlays/poptokens.test.ts', 'kit/overlays/menugroup.spec.ts', 'kit/data/DataTable.states.css.test.ts']);
const uncomment = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '');

/** A source with its approved declarations taken out, each exactly once; null when one is missing or repeated. */
export function withoutDefs(text: string, defs: readonly string[] = []): string | null {
  let out = uncomment(text);
  for (const d of defs) {
    const parts = out.split(d);
    if (parts.length !== 2) return null;
    out = parts.join('');
  }
  return out;
}

/** Every place in one source file that names --pop-off outside the allowed rules: the rule's selector list, or the bare
 *  text for a file that is not CSS. */
export function popOffOutsideAllowed(css: string, allowed: readonly string[] = []): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const bad: string[] = [];
  let inRules = 0;
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const n = (m[2] ?? '').match(/--pop-off/g)?.length ?? 0;
    if (!n) continue;
    const sel = normSel(m[1] ?? '');
    if (allowed.some((a) => normSel(a) === sel) && !/--pop-off\s*:/.test(m[2] ?? '')) inRules += n;
    else bad.push(sel);
  }
  const total = text.match(/--pop-off/g)?.length ?? 0;
  if (total > inRules + bad.length) bad.push(`${total - inRules} use(s) outside a CSS rule`);
  return bad;
}

const SRC = path.join(KIT, '..');
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : sources(p);
    return /\.(css|[cm]?[jt]sx?|json|html?)$/.test(e.name) ? [p] : []; // every source kind
  });
}

describe('--pop-off only in the allowed rules', () => {
  it('judge: an enabled, negated or sibling selector naming --pop-off fails; only an exact allowed list passes', () => {
    const allowed = ['.item[data-disabled]', ':is(.a, .b)[data-disabled]'];
    expect(popOffOutsideAllowed('.item { color: var(--pop-off); }', allowed)).toEqual(['.item']);
    expect(popOffOutsideAllowed('.item:not([data-disabled]) { color: var(--pop-off); }', allowed)).toEqual(['.item:not([data-disabled])']);
    expect(popOffOutsideAllowed('.item[data-disabled] + .item { color: var(--pop-off); }', allowed)).toEqual(['.item[data-disabled] + .item']);
    expect(popOffOutsideAllowed('.item[data-disabled], .b:hover { color: var(--pop-off); }', allowed)).toEqual(['.item[data-disabled], .b:hover']);
    expect(popOffOutsideAllowed('.item[data-disabled] { color: var(--pop-off); }\n:is(.a, .b)[data-disabled] { color: var(--pop-off); }', allowed)).toEqual([]);
    expect(popOffOutsideAllowed('.item[data-disabled] { --pop-off: red; }', allowed)).toEqual(['.item[data-disabled]']);
    expect(popOffOutsideAllowed("const s = { color: 'var(--pop-off)' };")).toEqual(['const s =']);
    expect(popOffOutsideAllowed("el.style.color = 'var(--pop-off)';")).toEqual(['1 use(s) outside a CSS rule']);
    expect(popOffOutsideAllowed('/* --pop-off in a comment */ .a { color: red; }')).toEqual([]);
    // Quoting an attribute value changes nothing; a different value is still another selector.
    expect(popOffOutsideAllowed('.row[aria-disabled=true] { color: var(--pop-off); }', ['.row[aria-disabled="true"]'])).toEqual([]);
    expect(popOffOutsideAllowed('.row[aria-disabled=false] { color: var(--pop-off); }', ['.row[aria-disabled="true"]'])).toEqual(['.row[aria-disabled=false]']);
  });
  it('judge: only the approved declarations come out of tokens.css; a rule there is checked; comments never count', () => {
    const defs = POP_OFF_DEFS['kit/tokens.css'] ?? [];
    const tokens = `:root { ${defs[0]} }\n.dark { ${defs[1]} }`;
    expect(popOffOutsideAllowed(withoutDefs(tokens, defs) ?? '')).toEqual([]);
    const withRule = `${tokens}\n.item:not([data-disabled]) { color: var(--pop-off); }`;
    expect(popOffOutsideAllowed(withoutDefs(withRule, defs) ?? '')).toEqual(['.item:not([data-disabled])']);
    expect(withoutDefs(`${tokens}\n:root { ${defs[0]} }`, defs)).toBeNull();
    expect(withoutDefs(':root { --pop-off: red; }', defs)).toBeNull();
    expect(withoutDefs('/* --pop-off is reserved */ .review { color: var(--hx-ink); }')?.includes('--pop-off')).toBe(false);
  });
  it('every Hub source: --pop-off appears only in the allowed rules, and every allowed rule still names it', () => {
    const seen: Record<string, string[]> = {};
    for (const p of sources(SRC)) {
      const f = path.relative(SRC, p).split(path.sep).join('/');
      if (POP_OFF_SOURCES.has(f)) continue;
      const raw = readFileSync(p, 'utf8');
      if (!raw.includes('--pop-off')) continue; // cheap skip; the comment-stripped check below decides
      const text = withoutDefs(raw, POP_OFF_DEFS[f]);
      expect(text, `${f}: each approved --pop-off declaration exactly once`).not.toBeNull();
      if (!text?.includes('--pop-off')) continue;
      expect(popOffOutsideAllowed(text, POP_OFF_ALLOWED[f]), f).toEqual([]);
      seen[f] = [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((m) => (m[2] ?? '').includes('var(--pop-off)'))
        .map((m) => normSel(m[1] ?? ''));
    }
    expect(seen).toEqual(Object.fromEntries(Object.entries(POP_OFF_ALLOWED).map(([f, sels]) => [f, sels.map(normSel)])));
  });
});

describe('group labels: one shape', () => {
  it('no other rule overrides a label\'s padding (a first group keeps 8/12/4)', () => {
    for (const [f, cls] of [['forms/more.module.css', 'sectionHead'], ['pickers/PickerPanel.module.css', 'groupTitle'], ['data/DataTable.module.css', 'menuHead']] as const)
      for (const m of read(f).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sel = (m[1] ?? '').replace(/\s+/g, ' ').trim();
        if (sel !== `.${cls}` && new RegExp(`\\.${cls}\\b`).test(sel)) expect(m[2] ?? '', `${f} ${sel}`).not.toMatch(/padding/);
      }
  });
  const SHAPE = ['color', 'font', 'letter-spacing', 'text-transform', 'padding'];
  const labels: Array<[string, string]> = [
    ['forms/more.module.css', '.sectionHead'],
    ['pickers/PickerPanel.module.css', '.groupTitle'],
    ['data/DataTable.module.css', '.menuHead'],
  ];
  it('Select sections, PickerPanel groups and table menu heads declare the same label', () => {
    const shapes = labels.map(([f, sel]) => SHAPE.map((p) => rule(f, sel)?.get(p)));
    for (const s of shapes) expect(s).toEqual(shapes[0]);
    expect(shapes[0]).toEqual(['var(--hx-muted)', 'var(--t-label)', 'var(--tracking-caps)', 'var(--case-caps)', 'var(--sp-2) var(--pop-row-x) var(--sp-1)']);
  });
});
