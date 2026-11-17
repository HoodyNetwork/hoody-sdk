// Surface conformance. Kit surfaces draw from the surface tokens in kit/tokens.css:
//   - G3: a rule that lifts something with --sh-pop is a registered popover (menu, popover, picker, switcher list, QR)
//     or a named non-popover surface (dialogs, toasts, the palette). Every declaration of a popover's border, background
//     or shadow, in any rule, @media copy or nested rule whose subject is the popover, uses --pop-line, --pop-bg and
//     --sh-pop. A focused item (`[data-focused]`) fills --pop-hover, and each popover's focused-item rule exists.
//   - Popover text (--hx-ink, --hx-muted, --hx-faint) stays at 4.5:1 or more on the focused fill, light and dark.
//   - G5: DataTable's column tables draw a --col-line divider between data columns as a background layer (a border
//     would take a pixel from the cell's content and cut text sized to the column); no column cell takes an inline
//     border, no rule as specific as the divider changes the layer, and no other module draws its own cell divider.
//   - G1/G4: the kit's card surfaces (Panel, Widget, a settings section, the summary card, a card-table row, a stat)
//     fill with --card-body and pad with --pad-card; Panel and Widget heads are the --card-head band.
//   - The surface tokens are palette references (no new grey: a new shade needs the designer's approval).
//   - Those tokens (and the popover text colours) are defined only at the theme roots of kit/tokens.css, never in a
//     component or another stylesheet, so the contrast and palette judges read every definition there is.
// A selector is read by its subject (the last compound): :not() adds nothing, :is()/:where() count every alternative
// inside them, and attributes, classes and pseudo-classes beside the subject class are its qualifiers.
// The judges are pure functions over CSS text, so the mutants at the end prove each one catches the overrides it is
// meant to catch (an @media copy, a nested rule, a comma or :is() alternative, a qualified subject, a border longhand,
// an indirect token, a later copy of a selector, a deleted rule), and the controls prove legitimate CSS stays green.
import { readdirSync, readFileSync } from 'node:fs';
import { join, posix, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssRules, splitTop, type Rule } from './conformance/cssScan';

type Files = Readonly<Record<string, string>>;
const SRC = join(import.meta.dirname, '..');
const REAL: Files = Object.fromEntries(
  readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(sep).join('/'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => [f, readFileSync(join(SRC, f), 'utf8')]),
);

const norm = (sel: string) => sel.replace(/\s+/g, ' ').trim();
/** One alternative per :is()/:where() branch (outside :not()), so each branch keeps its own context, exemptions and
 *  combinators: `.a:is(:hover, [x])` is judged as `.a:hover` and `.a[x]`. */
function expandAlt(alt: string, depth = 0): string[] {
  if (depth > 6) return [alt];
  for (let i = 0; i < alt.length;) {
    if (alt.startsWith(':not(', i)) { i = closing(alt, i + 4) + 1; continue; }
    const wrap = /^:(?:is|where|matches|-webkit-any|-moz-any)\(/.exec(alt.slice(i));
    if (wrap) {
      const j = closing(alt, i + wrap[0].length - 1);
      return splitTop(alt.slice(i + wrap[0].length, j)).flatMap((b) => expandAlt(alt.slice(0, i) + b.trim() + alt.slice(j + 1), depth + 1));
    }
    if (alt[i] === '(' || alt[i] === '[') { i = closing(alt, i) + 1; continue; }
    i++;
  }
  return [alt];
}
const altsOf = (r: Rule) => splitTop(r.sel).flatMap((a) => expandAlt(norm(a))).map(norm);
const rulesIn = (files: Files, f: string): Rule[] => cssRules(files[f] ?? '');
/** The compound selectors of one alternative, in order. */
function compoundsOf(alt: string): string[] {
  const parts: string[] = [];
  let depth = 0, cur = '';
  for (const ch of alt.trim()) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && /[\s>+~]/.test(ch)) { if (cur) parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}
/** The last compound selector of one alternative (the element it styles), with its pseudo-classes and attributes. */
const lastCompound = (alt: string): string => compoundsOf(alt).at(-1) ?? '';

/** What the subject of one alternative can match. */
interface Subject { classes: Set<string>; elems: Set<string>; attrs: string[]; pseudos: string[]; pseudoElement: boolean }
const OPENS = new Set(['is', 'where', 'matches', '-webkit-any', '-moz-any']);
const PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter', 'marker', 'placeholder', 'backdrop', 'selection']);
function closing(t: string, i: number): number {
  const open = t[i], close = open === '(' ? ')' : ']';
  let depth = 0;
  for (let j = i; j < t.length; j++) {
    if (t[j] === open) depth++;
    else if (t[j] === close && --depth === 0) return j;
  }
  return t.length;
}
function subjectOf(compound: string, out: Subject): Subject {
  for (let i = 0; i < compound.length;) {
    const rest = compound.slice(i);
    if (rest[0] === '[') {
      const j = closing(compound, i);
      out.attrs.push((compound.slice(i + 1, j).split(/[~|^$*]?=/)[0] ?? '').trim());
      i = j + 1;
      continue;
    }
    const cls = /^([.#])([\w-]+)/.exec(rest);
    if (cls) {
      if (cls[1] === '.') out.classes.add(cls[2] as string);
      i += cls[0].length;
      continue;
    }
    const pseudo = /^(::?)([\w-]+)/.exec(rest);
    if (pseudo) {
      const name = pseudo[2] as string;
      i += pseudo[0].length;
      if (pseudo[1] === '::' || PSEUDO_ELEMENTS.has(name)) out.pseudoElement = true;
      if (compound[i] === '(') {
        const j = closing(compound, i);
        const inner = compound.slice(i + 1, j);
        i = j + 1;
        if (name === 'not') continue; // a negation never adds what it names
        if (OPENS.has(name)) {
          for (const alt of splitTop(inner)) subjectOf(lastCompound(alt), out);
          continue;
        }
      }
      if (!out.pseudoElement || !PSEUDO_ELEMENTS.has(name)) out.pseudos.push(name);
      continue;
    }
    const el = /^(?:[a-zA-Z][\w-]*|\*)/.exec(rest);
    if (el) {
      out.elems.add(el[0].toLowerCase());
      i += el[0].length;
      continue;
    }
    i++;
  }
  return out;
}
const subject = (alt: string): Subject => subjectOf(lastCompound(alt), { classes: new Set(), elems: new Set(), attrs: [], pseudos: [], pseudoElement: false });
const styles = (alt: string, cls: string) => { const sub = subject(alt); return !sub.pseudoElement && sub.classes.has(cls); };
/** The subject is exactly `.cls`, with no qualifier. */
const bare = (alt: string, cls: string) => { const sub = subject(alt); return !sub.pseudoElement && sub.classes.size === 1 && sub.classes.has(cls) && sub.elems.size === 0 && sub.attrs.length === 0 && sub.pseudos.length === 0; };
const varsIn = (v: string) => [...v.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1] as string);

// A value that draws no border: a zero width, none or hidden.
const LINE_STYLE = /\b(?:solid|dashed|dotted|double|groove|ridge|inset|outset)\b/;
const NO_LINE = /(?:^|[\s,(])(?:0(?:\.0+)?(?:px|r?em)?|none|hidden)(?=$|[\s,)])/;
const isShorthand = (prop: string) => !/-(?:color|width|style)$/.test(prop);
/** Why a border declaration fails to draw a visible `token` line, or null when it draws one. Longhands count. */
function borderProblem(prop: string, value: string, token: string): string | null {
  if (prop.endsWith('-width')) return NO_LINE.test(value) ? 'a zero width hides the line' : null;
  if (prop.endsWith('-style')) return /\b(?:none|hidden)\b/.test(value) ? 'no style hides the line' : null;
  if (prop.endsWith('-color')) return value.includes(`var(${token})`) ? null : `use var(${token})`;
  // A shorthand resets what it omits: it needs the token, a width that is not zero and a visible style.
  return value.includes(`var(${token})`) && LINE_STYLE.test(value) && !NO_LINE.test(value) ? null : `a visible var(${token}) line (width, style and colour)`;
}

// ── G3: popovers ────────────────────────────────────────────────────────────────────────────────────────────────
/** [file, class]: the popover surfaces. Every rule styling one of them is judged. */
const POPOVERS: readonly (readonly [string, string])[] = [
  ['kit/overlays/Menu.module.css', 'popover'],
  ['kit/overlays/Menu.module.css', 'tray'], // the phone tray: a popover surface below 600 px
  ['kit/overlays/Popover.module.css', 'popover'],
  ['kit/forms/more.module.css', 'popover'],
  ['shell/Switchers.module.css', 'popover'],
  ['kit/data/DataTable.module.css', 'popover'],
  ['kit/qr/Qr.module.css', 'popover'],
  ['kit/overlays/InfoTip.module.css', 'pop'], // the InfoTip popover (no items)
  ['kit/agent/SlashMenu.module.css', 'menu'], // the composer's "/" menu, drawn above the draft box (no trigger)
];
/** The focused-item rule each popover module with items must have. */
const FOCUSED: readonly (readonly [string, string])[] = [
  ['kit/overlays/Menu.module.css', 'item'],
  ['kit/forms/more.module.css', 'option'],
  ['shell/Switchers.module.css', 'item'],
  ['kit/data/DataTable.module.css', 'menuItem'],
  ['kit/agent/SlashMenu.module.css', 'item'],
];
/** "<file> <selector>": surfaces that use the popover lift but are not popovers. */
const NOT_POPOVER = new Set([
  'kit/overlays/Dialog.module.css .modal', // dialogs: their own frame
  'kit/qr/Qr.module.css .modal', // the enlarged QR dialog
  'shell/CommandPalette.module.css .modal', // the palette is a dialog
  'kit/states/Toast.module.css .toast', // toasts float over the page, not from a trigger
  'kit/states/Toast.module.css .toast[data-focus-visible]',
  'ask/Ask.module.css .pillWrap > *', // the Ask pill floats over the page
  'app/DevToolbar.module.css .bar', // dev-only toolbar
]);
const BORDER_PROP = /^border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-(?:color|width|style))?$/;
const TOKENS = 'kit/tokens.css';
/** --sh-pop and every custom property that carries it, however indirectly. */
function liftVars(files: Files): Set<string> {
  const lift = new Set(['--sh-pop']);
  const decls = Object.keys(files).flatMap((f) => rulesIn(files, f).flatMap((r) => r.decls));
  for (let grew = true; grew;) {
    grew = false;
    for (const d of decls)
      if (d.prop.startsWith('--') && !lift.has(d.prop) && varsIn(d.value).some((v) => lift.has(v))) {
        lift.add(d.prop);
        grew = true;
      }
  }
  return lift;
}
const BG_PROP = /^background(?:-color)?$/;

export function judgePopovers(files: Files): string[] {
  const bad: string[] = [];
  const registered = (f: string, alt: string) => POPOVERS.some(([pf, cls]) => pf === f && styles(alt, cls));
  const lift = liftVars(files);
  const lifts = (v: string) => varsIn(v).some((x) => lift.has(x));
  for (const f of Object.keys(files))
    for (const r of rulesIn(files, f))
      // A lift: a shadow that carries --sh-pop, or (outside the theme roots) a custom property that does.
      if (r.decls.some((d) => (d.prop === 'box-shadow' || (d.prop.startsWith('--') && f !== TOKENS)) && lifts(d.value)))
        for (const alt of altsOf(r)) if (!NOT_POPOVER.has(`${f} ${alt}`) && !registered(f, alt)) bad.push(`${f} ${alt}: lifted with --sh-pop but not a registered popover`);
  for (const [f, cls] of POPOVERS) {
    if (files[f] === undefined) { bad.push(`${f}: missing`); continue; }
    let border = false, bg = false, lifted = false;
    for (const r of rulesIn(files, f))
      for (const alt of altsOf(r).filter((a) => styles(a, cls)))
        for (const d of r.decls) {
          if (BORDER_PROP.test(d.prop)) {
            const problem = borderProblem(d.prop, d.value, '--pop-line');
            if (problem) bad.push(`${f} ${alt} ${d.prop}: ${d.value} (${problem})`);
            else if (isShorthand(d.prop) && bare(alt, cls)) border = true; // only an unconditional, complete frame proves it
          }
          if (BG_PROP.test(d.prop)) {
            if (d.value.includes('var(--pop-bg)')) bg ||= bare(alt, cls);
            else bad.push(`${f} ${alt} ${d.prop}: ${d.value} (use var(--pop-bg))`);
          }
          if (d.prop === 'box-shadow') {
            if (lifts(d.value)) lifted ||= bare(alt, cls);
            else bad.push(`${f} ${alt} box-shadow: ${d.value} (use var(--sh-pop))`);
          }
        }
    if (!border || !bg || !lifted) bad.push(`${f} .${cls}: needs a --pop-line border, a --pop-bg background and --sh-pop`);
  }
  return bad;
}

// Hover can coincide with focus and would hide it; a press (--hx-press) is deliberate feedback and may.
const POINTER_STATES = { pseudos: new Set(['hover']), attrs: new Set(['data-hovered']) };
export function judgeFocused(files: Files): string[] {
  const bad: string[] = [];
  for (const [f, cls] of FOCUSED) {
    let proved = false;
    for (const r of rulesIn(files, f))
      for (const alt of altsOf(r).filter((a) => styles(a, cls))) {
        const sub = subject(alt);
        const focused = sub.attrs.includes('data-focused');
        // A hovered item can be focused at the same time; unless it excludes focus, it must not paint over it.
        const overlaps = !focused && !/:not\(\s*\[data-focused\]\s*\)/.test(alt) && (sub.pseudos.some((p) => POINTER_STATES.pseudos.has(p)) || sub.attrs.some((a) => POINTER_STATES.attrs.has(a)));
        for (const d of r.decls.filter((x) => BG_PROP.test(x.prop))) {
          if (!focused && !overlaps) continue;
          if (d.value.includes('var(--pop-hover)')) proved ||= focused && sub.classes.size === 1 && sub.pseudos.length === 0;
          else bad.push(`${f} ${alt} ${d.prop}: ${d.value} (${focused ? 'a focused popover item fills var(--pop-hover)' : 'a hovered item may be focused too: fill var(--pop-hover) or exclude [data-focused]'})`);
        }
      }
    if (!proved) bad.push(`${f} .${cls}[data-focused]: missing its var(--pop-hover) fill`);
  }
  return bad;
}

// ── Popover text contrast on the focused fill ───────────────────────────────────────────────────────────────────
type RGBA = readonly [number, number, number, number];
function tokenMap(text: string, sel: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of cssRules(text)) if (altsOf(r).some((a) => a.replace(/'/g, '"') === sel)) for (const d of r.decls) if (d.prop.startsWith('--')) m.set(d.prop, d.value.trim());
  return m;
}
function resolveToken(name: string, map: ReadonlyMap<string, string>, depth = 0): string {
  const v = map.get(name);
  if (v === undefined || depth > 20) throw new Error(`token ${name} is not defined`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  return ref ? resolveToken(ref[1] as string, map, depth + 1) : v;
}
function parseColor(v: string): RGBA {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (hex) {
    const raw = hex[1] as string;
    const h = raw.length <= 4 ? [...raw].map((c) => c + c).join('') : raw;
    const n = (i: number) => Number.parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[/,]\s*([\d.]+)(%?))?\s*\)$/.exec(v);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : rgb[5] ? Number(rgb[4]) / 100 : Number(rgb[4])];
  throw new Error(`not a colour: ${v}`);
}
const over = (fg: RGBA, bg: RGBA): RGBA => [fg[0] * fg[3] + bg[0] * (1 - fg[3]), fg[1] * fg[3] + bg[1] * (1 - fg[3]), fg[2] * fg[3] + bg[2] * (1 - fg[3]), 1];
const lum = (c: RGBA) => {
  const ch = (x: number) => { const s = x / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
};
const contrast = (a: RGBA, b: RGBA) => { const hi = Math.max(lum(a), lum(b)), lo = Math.min(lum(a), lum(b)); return (hi + 0.05) / (lo + 0.05); };
const POP_TEXT = ['--hx-ink', '--hx-muted', '--hx-faint'] as const;

export function judgeFocusContrast(files: Files): string[] {
  const text = files['kit/tokens.css'] ?? '';
  const light = tokenMap(text, ':root');
  const dark = new Map([...light, ...tokenMap(text, ':root[data-hx-theme="dark"]')]);
  const bad: string[] = [];
  for (const [theme, map] of [['light', light], ['dark', dark]] as const) {
    const fill = over(parseColor(resolveToken('--pop-hover', map)), parseColor(resolveToken('--pop-bg', map)));
    for (const t of POP_TEXT) {
      const ratio = contrast(over(parseColor(resolveToken(t, map)), fill), fill);
      if (ratio < 4.5) bad.push(`${theme}: ${t} on the focused popover fill is ${ratio.toFixed(2)}:1 (needs 4.5:1)`);
    }
  }
  return bad;
}

// ── G5: column dividers ─────────────────────────────────────────────────────────────────────────────────────────
const DT = 'kit/data/DataTable.module.css';
const DIVIDERS = ['.table:not(.list) .thead th:not(.thCheck) + th:not(.thActions)', '.table:not(.list) .tr > td:not(.tdCheck) + td:not(.tdActions)'];
const CELL_CLASSES = new Set(['td', 'th', 'tdCheck', 'thCheck', 'tdActions', 'thActions']);
const NO_LINE_CELLS = new Set(['tdCheck', 'thCheck', 'tdActions', 'thActions']); // the checkbox and actions columns
const NO_COLUMNS = /\.(?:list|cards|icons)(?![\w-])/; // presentations without columns
const INLINE_BORDER = /^border(?:-inline(?:-start|-end)?|-left|-right)?(?:-(?:color|width|style))?$/;
const withoutNot = (alt: string) => alt.replace(/:not\([^()]*\)/g, '');
const isCell = (sub: Subject) => !sub.pseudoElement && (sub.elems.has('td') || sub.elems.has('th') || [...sub.classes].some((c) => CELL_CLASSES.has(c)));
/** The alternative's subject follows a sibling combinator (`a + b`, `a ~ b`): a divider between neighbours. */
const afterSibling = (alt: string) => /[+~]\s*$/.test(alt.trim().slice(0, alt.trim().length - lastCompound(alt).length));

type Spec = readonly [number, number, number];
const addSpec = (a: Spec, b: Spec): Spec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const identEnd = (t: string, i: number) => { let j = i; while (j < t.length && /[\w-]/.test(t[j]!)) j++; return j; };
/** Selectors Level 4 specificity [ids, classes + attributes + pseudo-classes, elements] of a selector list: the strongest
 *  alternative. :is()/:not()/:has()/:matches() count their strongest argument, :where() counts nothing, :nth-child(… of S)
 *  counts one plus S. It is taken from each original alternative BEFORE :is() branch expansion and carried to every
 *  branch, because the browser applies the whole selector's specificity to every element it matches. */
function specificity(sel: string): Spec {
  return splitTop(sel).map((alt) => compoundsSpec(alt.trim())).reduce((m: Spec, x) => (atLeast(x, m) ? x : m), [0, 0, 0]);
}
function compoundsSpec(t: string): Spec {
  let s: Spec = [0, 0, 0];
  for (let i = 0; i < t.length;) {
    const c = t[i]!;
    if (c === '#') { s = addSpec(s, [1, 0, 0]); i = identEnd(t, i + 1); continue; }
    if (c === '.') { s = addSpec(s, [0, 1, 0]); i = identEnd(t, i + 1); continue; }
    if (c === '[') { s = addSpec(s, [0, 1, 0]); i = closing(t, i) + 1; continue; }
    if (c === ':') {
      if (t[i + 1] === ':') { s = addSpec(s, [0, 0, 1]); i = identEnd(t, i + 2); if (t[i] === '(') i = closing(t, i) + 1; continue; }
      const j = identEnd(t, i + 1);
      const name = t.slice(i + 1, j).toLowerCase();
      if (t[j] === '(') {
        const k = closing(t, j);
        const arg = t.slice(j + 1, k);
        const of = /\sof\s/.exec(arg);
        if (name === 'where') { /* zero */ } else if (OPENS.has(name) || name === 'not' || name === 'has') s = addSpec(s, specificity(arg));
        else if (/^nth-(?:last-)?child$/.test(name) && of) s = addSpec(addSpec(s, [0, 1, 0]), specificity(arg.slice(of.index + of[0].length)));
        else s = addSpec(s, [0, 1, 0]);
        i = k + 1;
        continue;
      }
      s = addSpec(s, PSEUDO_ELEMENTS.has(name) ? [0, 0, 1] : [0, 1, 0]); // legacy one-colon ::before and kin count as elements
      i = j;
      continue;
    }
    if (/[a-zA-Z_-]/.test(c)) { s = addSpec(s, [0, 0, 1]); i = identEnd(t, i); continue; }
    i++;
  }
  return s;
}
const atLeast = (a: Spec, b: Spec): boolean => (a[0] !== b[0] ? a[0]! > b[0]! : a[1] !== b[1] ? a[1]! > b[1]! : a[2]! >= b[2]!);
const LAYER_PROP = /^background(?:-(?:image|size|position(?:-[xy])?|repeat|clip|origin))?$/;
const rtlOf = (alt: string) => `${alt}:dir(rtl)`;
const DIVIDER_SPEC = specificity(DIVIDERS[1]!);

export function judgeDividers(files: Files): string[] {
  const bad: string[] = [];
  const dt = rulesIn(files, DT);
  const declsAt = (alt: string) => dt.filter((r) => altsOf(r).includes(alt)).flatMap((r) => r.decls);
  for (const want of [...DIVIDERS, ...DIVIDERS.map(rtlOf)])
    for (const x of declsAt(want).filter((y) => y.prop === 'background'))
      bad.push(`${DT} ${want} background: ${x.value} (the shorthand resets the --col-line layer: set longhands only)`);
  for (const want of DIVIDERS) {
    const d = declsAt(want);
    const v = (prop: string) => d.filter((x) => x.prop === prop).map((x) => x.value).at(-1) ?? '';
    if (!/^linear-gradient\(\s*var\(--col-line\)\s*,\s*var\(--col-line\)\s*\)$/.test(v('background-image')) || v('background-repeat') !== 'no-repeat' || !/^var\(--bw\) 100%$/.test(v('background-size')) || !/^left\b/.test(v('background-position')))
      bad.push(`${DT} ${want}: missing its --col-line divider layer`);
    if (!/^right\b/.test(declsAt(rtlOf(want)).filter((x) => x.prop === 'background-position').map((x) => x.value).at(-1) ?? ''))
      bad.push(`${DT} ${rtlOf(want)}: missing the right-to-left divider position`);
  }
  for (const r of dt)
    for (const [alt, spec] of splitTop(r.sel).flatMap((o) => expandAlt(norm(o)).map((a) => [norm(a), specificity(norm(o))] as const))) {
      const sub = subject(alt);
      if (!isCell(sub) || NO_COLUMNS.test(withoutNot(alt))) continue;
      const lineless = [...sub.classes].some((c) => NO_LINE_CELLS.has(c));
      for (const d of r.decls.filter((x) => INLINE_BORDER.test(x.prop))) {
        if (d.prop.endsWith('-color') || NO_LINE.test(d.value) || /\b(?:none|hidden)\b/.test(d.value)) continue;
        bad.push(lineless
          ? `${DT} ${alt} ${d.prop}: ${d.value} (no divider on the checkbox or actions column)`
          : `${DT} ${alt} ${d.prop}: ${d.value} (a column cell takes no inline border: it narrows the content; the divider is the background layer)`);
      }
      if (lineless || DIVIDERS.includes(alt) || !atLeast(spec, DIVIDER_SPEC)) continue;
      for (const d of r.decls.filter((x) => LAYER_PROP.test(x.prop))) {
        if (DIVIDERS.some((w) => rtlOf(w) === alt) && d.prop === 'background-position' && /^right\b/.test(d.value)) continue;
        bad.push(`${DT} ${alt} ${d.prop}: ${d.value} (as specific as the divider, so it changes the --col-line layer)`);
      }
    }
  for (const f of Object.keys(files).filter((x) => x !== DT))
    for (const r of rulesIn(files, f))
      for (const alt of altsOf(r).filter((a) => afterSibling(a) && isCell(subject(a))))
        for (const d of r.decls.filter((x) => (INLINE_BORDER.test(x.prop) && !x.prop.endsWith('-color') && !NO_LINE.test(x.value)) || (/^background(?:-image)?$/.test(x.prop) && /gradient\(/.test(x.value))))
          bad.push(`${f} ${alt} ${d.prop}: ${d.value} (draws its own cell divider: DataTable owns them)`);
  return bad;
}

const LAY = 'kit/layouts/Layouts.module.css';
/** `edge`: a framed card: its frame names its colour in --card-edge, the colour its corner edge draws. */
interface CardRule { file: string; ctx?: string; cls: string; bg?: string; pad?: boolean; line?: string; edge?: boolean }
const CARDS: readonly CardRule[] = [
  { file: LAY, cls: 'panel', bg: '--card-body', edge: true },
  { file: LAY, cls: 'settingsSection', bg: '--card-body', pad: true, edge: true },
  { file: LAY, cls: 'settingsSummaryCard', bg: '--card-body', pad: true, edge: true },
  { file: LAY, cls: 'panelHead', bg: '--card-head', pad: true, line: '--card-head-line' },
  { file: LAY, cls: 'panelBody', pad: true },
  { file: LAY, cls: 'panelNotice', pad: true },
  { file: DT, ctx: 'cards', cls: 'tr', bg: '--card-body', edge: true },
  { file: DT, cls: 'cardCell', pad: true },
  { file: 'kit/data/Display.module.css', cls: 'stat', bg: '--card-body', pad: true, edge: true },
  // A card's own state recolours its frame through --card-edge too.
  { file: LAY, cls: 'panelWarn', edge: true },
  { file: LAY, cls: 'panelDanger', edge: true },
  { file: LAY, cls: 'settingsDanger', edge: true },
  { file: DT, ctx: 'cards', cls: 'selected', edge: true },
  { file: DT, ctx: 'cards', cls: 'active', edge: true },
];
const CARD_EDGE_CSS = 'kit/layouts/CardEdge.module.css';
/** [stylesheet, class] of every class a page passes to a shared card (Panel, Widget, StatTile) from its own module: a
 * frame colour there must go through --card-edge as well, or the corner edge draws the kit's colour over it. */
export function cardConsumers(tsx: Readonly<Record<string, string>>): (readonly [string, string])[] {
  const out: (readonly [string, string])[] = [];
  for (const [f, text] of Object.entries(tsx)) {
    const modules = new Map([...text.matchAll(/import (\w+) from '(\.{1,2}\/[^']+\.module\.css)'/g)].map((m) => [m[1] as string, posix.join(posix.dirname(f), m[2] as string)]));
    for (const m of text.matchAll(/<(?:Panel|Widget|StatTile)\b[^>]*?className=\{([^}]*)\}/gs))
      for (const [, mod, cls] of (m[1] ?? '').matchAll(/\b(\w+)\.(\w+)/g)) {
        const css = modules.get(mod as string);
        if (css) out.push([css, cls as string]);
      }
  }
  return out;
}
const CARD_CONSUMERS = cardConsumers(
  Object.fromEntries(
    readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .map((f) => f.split(sep).join('/'))
      .filter((f) => f.endsWith('.tsx') && !f.includes('.test.') && !f.startsWith('kit/gallery/'))
      .map((f) => [f, readFileSync(join(SRC, f), 'utf8')]),
  ),
);
const INLINE_PAD = /^padding(?:-inline(?:-start|-end)?|-left|-right)?$/;
/** Every declaration that can colour a card's frame (a width or style longhand cannot). */
const FRAME_COLOUR = /^border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?$/;
const HEAD_LINE = /^border(?:-block(?:-end)?|-bottom)?(?:-(?:color|width|style))?$/; // every declaration that reaches the bottom edge
/** Top-level space-separated components of a value (a var() or calc() stays whole). */
function components(value: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of value.trim()) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && /\s/.test(ch)) { if (cur) out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
/** The inline-axis parts a padding declaration sets. */
function inlinePads(prop: string, value: string): string[] {
  const v = components(value);
  if (prop === 'padding') return v.length >= 4 ? [v[1] ?? '', v[3] ?? ''] : [v[v.length === 1 ? 0 : 1] ?? ''];
  if (prop === 'padding-inline') return v.length >= 2 ? [v[0] ?? '', v[1] ?? ''] : [v[0] ?? ''];
  return [value];
}
/** States that may change a card's fill (never its padding or rule): pointer, focus and selection. */
const STATE_PSEUDOS = new Set(['hover', 'focus', 'focus-visible', 'focus-within', 'active']);
const STATE_ATTRS = new Set(['data-selected', 'aria-selected', 'data-focused', 'data-active', 'data-pressed']);
const STATE_CLASSES = new Set(['selected', 'active']);
const inState = (sub: Subject) => sub.pseudos.some((p) => STATE_PSEUDOS.has(p)) || sub.attrs.some((a) => STATE_ATTRS.has(a)) || [...sub.classes].some((c) => STATE_CLASSES.has(c));

/** A position value that computes to static: position is not inherited, so initial and unset give static. revert and
 *  revert-layer are a conservative flag (they may expose an earlier cascade value); inherit is not flagged
 *  for now. */
const STATIC = /^(?:static|initial|unset|revert|revert-layer)$/i;
/** A declared value without its !important. */
const bareValue = (value: string) => value.replace(/!\s*important\s*$/i, '').trim();
/** The :has() and :not() calls at the top level of a selector text (outside other parentheses and attributes). */
function relationalCalls(text: string): { fn: 'has' | 'not'; inner: string; from: number; to: number }[] {
  const out: { fn: 'has' | 'not'; inner: string; from: number; to: number }[] = [];
  for (let i = 0; i < text.length;) {
    const fn = /^:(not|has)\(/.exec(text.slice(i));
    if (fn) {
      const open = i + fn[0].length - 1, j = closing(text, open);
      out.push({ fn: fn[1] as 'has' | 'not', inner: text.slice(open + 1, j), from: i, to: j + 1 });
      i = j + 1;
    } else i += text[i] === '[' || text[i] === '(' ? closing(text, i) - i + 1 : 1;
  }
  return out;
}
/** The selector text without its :has() and :not() calls: what its own compounds name. */
const withoutRelational = (text: string) => relationalCalls(text).reduceRight((t, c) => t.slice(0, c.from) + t.slice(c.to), text);
/** The DataTable presentations besides cards; .table is on every one of them, cards included. */
const OTHER_PRESENTATIONS = /\.(?:list|icons)(?![\w-])/;
/** The alternative can style a row of the `ctx` presentation. :has() and :not() arguments never count as naming a
 *  presentation. It names ctx in its own compounds (unless one compound both names it and negates exactly it, which
 *  matches nothing), or it is kept to no other presentation and negates no ctx. */
const reachesPresentation = (alt: string, ctx: string) => {
  const named = new RegExp(`\\.${ctx}(?![\\w-])`);
  const exactly = (b: string) => b.trim() === `.${ctx}`;
  const negates = (c: string) => relationalCalls(c).some((x) => x.fn === 'not' && splitTop(x.inner).some(exactly));
  if (compoundsOf(alt).some((c) => named.test(withoutRelational(c)) && negates(c))) return false;
  const own = withoutRelational(alt);
  if (named.test(own)) return true;
  return !OTHER_PRESENTATIONS.test(own) && !relationalCalls(alt).some((x) => x.fn === 'not' && named.test(x.inner));
};
/** The compound is kept to a box that is never cut (CardEdge.module.css), where no edge is drawn: a :has() whose every
 *  branch is exactly a descendant table or [data-table-frame], or a :not() with a branch exactly [data-card-cut]. */
const TABLE_BRANCH = /^(?:table|\[\s*data-table-frame\s*\])$/;
const CARD_MARK = /^\[\s*data-card-cut\s*\]$/;
const uncutBox = (compound: string) =>
  relationalCalls(compound).some((c) => {
    const branches = splitTop(c.inner).map((b) => b.trim());
    return c.fn === 'has' ? branches.length > 0 && branches.every((b) => TABLE_BRANCH.test(b)) : branches.some((b) => CARD_MARK.test(b));
  });

export function judgeCards(files: Files, consumers: readonly (readonly [string, string])[] = CARD_CONSUMERS): string[] {
  const bad: string[] = [];
  const recolours = (d: { prop: string; value: string }) => FRAME_COLOUR.test(d.prop) && !/^(?:0|none)$/.test(d.value.trim()) && !d.value.includes('var(--card-edge)');
  for (const [f, cls] of consumers)
    for (const r of rulesIn(files, f))
      for (const alt of altsOf(r).filter((a) => styles(a, cls)))
        for (const d of r.decls.filter(recolours))
          bad.push(`${f} ${alt} ${d.prop}: ${d.value} (a shared card's frame: colour it with --card-edge, the corner edge draws it, the card frame rule)`);
  // A card root is its corner edge's containing block and clips at its border box (CardEdge.module.css, at no
  // specificity): a kit or page class never puts it back to static or hides, scrolls or autos its overflow, which would
  // drop the edge's placement or clip the edge. Use relative (offsets auto) and clip instead. Every rule that can reach
  // a card counts: a card-row rule need not spell .cards (s.table is on every presentation, DataTable.tsx), so only a
  // rule kept to another presentation or to an uncut box (which draws no edge) is outside this judge.
  const roots: (readonly [string, string, string | undefined])[] = [...CARDS.filter((c) => c.edge).map((c) => [c.file, c.cls, c.ctx] as const), ...consumers.map(([f, cls]) => [f, cls, undefined] as const)];
  for (const [f, cls, ctxName] of roots)
    for (const r of rulesIn(files, f))
      for (const alt of altsOf(r).filter((a) => styles(a, cls) && (!ctxName || reachesPresentation(a, ctxName)) && !uncutBox(lastCompound(a))))
        for (const d of r.decls)
          if ((d.prop === 'position' && STATIC.test(bareValue(d.value))) || (/^overflow(?:-[xy]|-block|-inline)?$/.test(d.prop) && /\b(?:hidden|auto|scroll)\b/.test(d.value)))
            bad.push(`${f} ${alt} ${d.prop}: ${d.value} (a card root keeps its edge: relative with offsets auto, overflow clip, the card frame rule)`);
  // Only the one shared rule styles a card by its mark; anything else recolouring through it is a second frame colour.
  for (const f of Object.keys(files).filter((x) => x !== CARD_EDGE_CSS))
    for (const r of rulesIn(files, f))
      for (const alt of altsOf(r).filter((a) => a.includes('[data-card-cut')))
        for (const d of r.decls.filter((x) => x.prop === '--card-edge' || FRAME_COLOUR.test(x.prop)))
          bad.push(`${f} ${alt} ${d.prop}: ${d.value} (a card's frame colour belongs to its class, never to the card mark, the card frame rule)`);
  for (const c of CARDS) {
    const seen = { bg: false, pad: false, line: false, edge: false };
    const ctx = c.ctx ? new RegExp(`\\.${c.ctx}(?![\\w-])`) : null;
    const inCtx = (alt: string) => !ctx || ctx.test(withoutNot(alt));
    for (const r of rulesIn(files, c.file))
      // Every rule whose subject can be the card counts, qualified or not; only the bare one proves the card has it.
      for (const alt of altsOf(r).filter((a) => styles(a, c.cls) && inCtx(a))) {
        const proves = bare(alt, c.cls);
        const stated = inState(subject(alt));
        for (const d of r.decls) {
          if (c.bg && BG_PROP.test(d.prop) && !stated) {
            if (d.value.includes(`var(${c.bg})`)) seen.bg ||= proves;
            else bad.push(`${c.file} ${alt} ${d.prop}: ${d.value} (use var(${c.bg}))`);
          }
          if (c.pad && INLINE_PAD.test(d.prop)) {
            if (inlinePads(d.prop, d.value).every((part) => part.includes('var(--pad-card)'))) seen.pad ||= proves;
            else bad.push(`${c.file} ${alt} ${d.prop}: ${d.value} (pad with var(--pad-card))`);
          }
          if (c.line && HEAD_LINE.test(d.prop)) {
            const problem = borderProblem(d.prop, d.value, c.line);
            if (problem) bad.push(`${c.file} ${alt} ${d.prop}: ${d.value} (${problem})`);
            else if (d.prop === 'border-block-end' && isShorthand(d.prop)) seen.line ||= proves;
          }
          // The corner edge draws --card-edge over a transparent border, so a frame coloured any other way (a state
          // included) would show two colours. The bare card names its own.
          if (c.edge && d.prop === '--card-edge') seen.edge ||= proves;
          if (c.edge && recolours(d))
            bad.push(`${c.file} ${alt} ${d.prop}: ${d.value} (colour the frame with var(--card-edge): the corner edge draws it, the card frame rule)`);
        }
      }
    const missing = [c.bg && !seen.bg && 'fill', c.pad && !seen.pad && 'padding', c.line && !seen.line && 'rule', c.edge && !seen.edge && 'edge colour (--card-edge)'].filter(Boolean);
    if (missing.length > 0) bad.push(`${c.file} .${c.cls}: missing its card ${missing.join(', ')}`);
  }
  return bad;
}

const SURFACE_TOKENS = ['--card-body', '--card-head', '--card-head-line', '--pop-line', '--pop-bg', '--pop-hover', '--col-line'];
/** The palette shades the surface tokens may name. A new one is a new grey: it needs the designer's approval first. */
const APPROVED_PALETTE = new Set(['--hx-input-bg', '--hx-card', '--hx-raised', '--hx-line', '--hx-line-2', '--hx-panel-line', '--hx-selected', '--hx-hover']);
/** Defined only at the theme roots of kit/tokens.css (the phone @media :root included), so every judge sees every value. */
const ROOT_ONLY = [...SURFACE_TOKENS, '--sh-pop', '--pad-card', '--pad-card-y', ...POP_TEXT];
// Performance mode is a root too: it empties --sh-pop with the other shadows, in both themes.
const THEME_ROOTS = new Set([':root', ':root[data-hx-theme="dark"]', ':root[data-hx-perf="on"]']);

const SPACING = new Set(['--pad-card', '--pad-card-y']); // the phone :root may redefine these; colours it may not
/** ROOT_ONLY and every palette token their values reach, read from the theme roots of kit/tokens.css. */
function rootOnly(files: Files): Set<string> {
  const defs = new Map<string, string[]>();
  for (const r of rulesIn(files, TOKENS))
    if (altsOf(r).every((a) => THEME_ROOTS.has(a.replace(/'/g, '"')))) for (const d of r.decls) defs.set(d.prop, [...(defs.get(d.prop) ?? []), d.value]);
  const out = new Set<string>();
  const walk = (name: string) => {
    if (out.has(name)) return;
    out.add(name);
    for (const v of defs.get(name) ?? []) for (const ref of varsIn(v)) if (defs.has(ref)) walk(ref);
  };
  for (const t of ROOT_ONLY) walk(t);
  return out;
}

export function judgeTokens(files: Files): string[] {
  const bad: string[] = [];
  const guarded = rootOnly(files);
  // A colour defined twice under one theme root is conditional (a media query): the contrast judge reads one value, so
  // it is refused rather than judged wrongly.
  const count = new Map<string, number>();
  for (const r of rulesIn(files, TOKENS))
    for (const d of r.decls.filter((x) => guarded.has(x.prop) && !SPACING.has(x.prop)))
      for (const a of altsOf(r)) count.set(`${a.replace(/'/g, '"')} ${d.prop}`, (count.get(`${a.replace(/'/g, '"')} ${d.prop}`) ?? 0) + 1);
  for (const [k, n] of count) if (n > 1) bad.push(`${TOKENS} ${k}: defined ${n} times under one theme root (a conditional colour the judges cannot read)`);
  for (const f of Object.keys(files))
    for (const r of rulesIn(files, f))
      for (const d of r.decls.filter((x) => guarded.has(x.prop)))
        if (f !== TOKENS || !altsOf(r).every((a) => THEME_ROOTS.has(a.replace(/'/g, '"'))))
          bad.push(`${f} ${r.sel.trim()} ${d.prop}: defined outside the theme roots of ${TOKENS}`);
  const all = cssRules(files[TOKENS] ?? '').flatMap((r) => r.decls);
  for (const name of SURFACE_TOKENS) {
    const defs = all.filter((d) => d.prop === name).map((d) => d.value.trim());
    if (defs.length === 0) bad.push(`${name}: not defined`);
    for (const v of defs) {
      const ref = /^var\((--hx-[\w-]+)\)$/.exec(v);
      if (!ref || !APPROVED_PALETTE.has(ref[1] as string)) bad.push(`${name}: ${v} (one of the approved palette shades only: no new grey)`);
    }
  }
  return bad;
}

/** PlanCard's price type (K-b): display type a page may not set, so only the tokens define it
 *  and only the card's price (`.amount`'s font) reads it. Any other read, in the card file too, is flagged, so a stray
 *  custom property cannot keep the judge quiet while the price uses something else. The read must also be the
 *  effective one: the last `.amount` font shorthand, with no type longhand after it in a `.amount`
 *  rule, and none in a more specific rule naming `.amount` wherever it sits (it wins over source order), nor in a rule
 *  that reaches the price element without a class of its own (`[data-plan-part="price"]`, `.card span`): one whose
 *  last compound names no class and whose classes are only the price's ancestors. An `!important` type declaration that
 *  can reach the price wins over source order and specificity, so it is flagged wherever it sits. */
const PLAN_CARD = 'kit/widgets/PlanCard.module.css';
const PRICE_OVERRIDES = new Set(['font-size', 'font-weight', 'font-family', 'font-style', 'font-stretch', 'line-height']);
const PRICE_PATH = new Set(['card', 'inner', 'price']);
const reachesPrice = (alt: string): boolean => {
  const last = compoundsOf(alt).pop() ?? '';
  return !/\.[\w-]/.test(last) && [...alt.matchAll(/\.([\w-]+)/g)].every((m) => PRICE_PATH.has(m[1] as string));
};
export function judgePriceType(files: Files): string[] {
  const bad: string[] = [];
  let effective: 'none' | 'price' | 'other' = 'none';
  const overrides: string[] = [];
  for (const f of Object.keys(files))
    for (const r of rulesIn(files, f)) {
      const sel = r.sel.trim();
      const onAmount = f === PLAN_CARD && /\.amount\b/.test(sel);
      for (const d of r.decls) {
        if (f === PLAN_CARD && /!\s*important/i.test(d.value) && (d.prop === 'font' || PRICE_OVERRIDES.has(d.prop)) && (onAmount || altsOf(r).some(reachesPrice)))
          overrides.push(`${sel} ${d.prop} !important`);
        if (d.prop === '--t-price' && f !== TOKENS) bad.push(`${f} ${sel} --t-price: defined outside ${TOKENS}`);
        if (onAmount && d.prop === 'font') {
          if (sel === '.amount') effective = /var\(\s*--t-price\b/.test(d.value) ? 'price' : 'other';
          else overrides.push(`${sel} font`);
        } else if (onAmount && PRICE_OVERRIDES.has(d.prop)) {
          if (sel !== '.amount') overrides.push(`${sel} ${d.prop}`);
          else if (effective === 'price') effective = 'other';
        } else if (f === PLAN_CARD && (d.prop === 'font' || PRICE_OVERRIDES.has(d.prop)) && altsOf(r).some(reachesPrice)) {
          overrides.push(`${sel} ${d.prop}`);
        }
        if (!/var\(\s*--t-price\b/.test(d.value)) continue;
        if (!(f === PLAN_CARD && sel === '.amount' && d.prop === 'font'))
          bad.push(`${f} ${sel} ${d.prop}: ${d.value} (--t-price is PlanCard's price only, as .amount's font: use the kit PlanCard)`);
      }
    }
  if (effective !== 'price') bad.push(`${PLAN_CARD}: .amount's effective font is not var(--t-price) (the price left the price type)`);
  for (const o of overrides) bad.push(`${PLAN_CARD} ${o}: a more specific rule overrides the price type, or reaches the price without .amount`);
  return bad;
}

// ── The real tree ───────────────────────────────────────────────────────────────────────────────────────────────
describe('surfaces: the kit draws from the surface tokens', () => {
  it('finds every registered popover and card file (the scan reads the files)', () => {
    for (const f of [...POPOVERS.map(([x]) => x), ...CARDS.map((c) => c.file), 'kit/tokens.css']) expect(REAL[f], f).toBeDefined();
  });
  it('finds the page classes passed to the shared cards (the consumer scan reads the pages)', () => {
    expect(CARD_CONSUMERS).toContainEqual(['pages/home/parts/parts.module.css', 'setupPanel']);
    expect(CARD_CONSUMERS).toContainEqual(['pages/home/parts/home.module.css', 'welcomeCard']);
    expect(CARD_CONSUMERS).toContainEqual(['pages/computers/parts/parts.module.css', 'tileBars']);
  });
  it('every popover draws the one frame', () => expect(judgePopovers(REAL)).toEqual([]));
  it('a focused popover item fills --pop-hover', () => expect(judgeFocused(REAL)).toEqual([]));
  it('popover text keeps 4.5:1 on the focused fill, light and dark', () => expect(judgeFocusContrast(REAL)).toEqual([]));
  it('column tables draw the --col-line dividers and nothing overrides them', () => expect(judgeDividers(REAL)).toEqual([]));
  it('card surfaces fill, band and pad from the card tokens, frames in --card-edge', () => expect(judgeCards(REAL)).toEqual([]));
  it('the surface tokens are palette references, never a new colour', () => expect(judgeTokens(REAL)).toEqual([]));
  it('K-b: only PlanCard sets the price type', () => expect(judgePriceType(REAL)).toEqual([]));
  it('the non-popover rows are still needed', () => {
    const lifted = new Set(
      Object.keys(REAL).flatMap((f) =>
        rulesIn(REAL, f)
          .filter((r) => r.decls.some((d) => d.prop === 'box-shadow' && d.value.includes('var(--sh-pop)')))
          .flatMap((r) => altsOf(r).map((a) => `${f} ${a}`)),
      ),
    );
    expect([...NOT_POPOVER].filter((k) => !lifted.has(k)), 'stale rows: remove them').toEqual([]);
  });
});

// ── Mutants: each override the judges exist for is caught ───────────────────────────────────────────────────────
const MENU = 'kit/overlays/Menu.module.css';
const HOME_PARTS = 'pages/home/parts/parts.module.css';
const HOME_CARD = 'pages/home/parts/home.module.css';
const withText = (f: string, text: string): Files => ({ ...REAL, [f]: text });
const append = (f: string, css: string): Files => withText(f, `${REAL[f] ?? ''}\n${css}\n`);
const replaceIn = (f: string, from: RegExp, to: string): Files => {
  const t = REAL[f] ?? '';
  if (!from.test(t)) throw new Error(`mutant anchor not found in ${f}: ${from}`);
  return withText(f, t.replace(from, to));
};
const MUTANTS: readonly (readonly [string, (f: Files) => string[], () => Files])[] = [
  ['an @media copy strips a popover frame', judgePopovers, () => append(MENU, '@media (width < 600px) { .popover { border: 0; background: red; } }')],
  ['a nested rule strips a popover frame', judgePopovers, () => append(MENU, ".popover { &[data-placement='top'] { border-color: red; } }")],
  ['a popover-like lift outside the registry', judgePopovers, () => ({ ...REAL, 'pages/x/x.module.css': '.menu { border: 1px solid red; box-shadow: var(--sh-pop); }' })],
  ['a comma alternative changes the focused fill', judgeFocused, () => append(MENU, '.item[data-focused], .item[data-selected] { background: var(--hx-hover); }')],
  ['the focused-item rule is deleted', judgeFocused, () => replaceIn(MENU, /\.item\[data-focused\] \{\s*background: var\(--pop-hover\);/, '.item[data-focused] {')],
  ['dark focus on the 7% selected fill', judgeFocusContrast, () => append('kit/tokens.css', ':root[data-hx-theme="dark"] { --pop-hover: var(--hx-selected); }')],
  ['a later copy of the divider selector removes it', judgeDividers, () => append(DT, '.table:not(.list) .tr > td:not(.tdCheck) + td:not(.tdActions) { background-image: none; }')],
  ['the divider rule is deleted', judgeDividers, () => replaceIn(DT, /background-image: linear-gradient\(var\(--col-line\), var\(--col-line\)\);/, '')],
  ['a page draws its own cell divider', judgeDividers, () => ({ ...REAL, 'pages/x/x.module.css': '.grid td + td { border-left: 1px solid red; }' })],
  ['a nested rule re-fills a Panel', judgeCards, () => append(LAY, '.panel { & { background: red; padding: 0; } }')],
  ['a selected card row colours its frame past the corner edge', judgeCards, () => append(DT, '.cards .tr.selected { border-color: var(--hx-selected-bar); }')],
  ['a danger Panel colours its frame past the corner edge', judgeCards, () => append(LAY, '.panelDanger { border-color: red; }')],
  ['a danger Panel loses its edge colour', judgeCards, () => replaceIn(LAY, /\.panelDanger \{\s*--card-edge: var\(--hx-danger-fill\);/, '.panelDanger {')],
  ['a page recolours every marked card', judgeCards, () => ({ ...REAL, 'pages/x/x.module.css': '[data-card-cut] { --card-edge: red; }' })],
  ['a page colours a marked card frame by the mark', judgeCards, () => ({ ...REAL, 'pages/x/x.module.css': '.x[data-card-cut] { border-color: blue; }' })],
  ['a warn card colours its frame past the corner edge', judgeCards, () => replaceIn(LAY, /(\.panelWarn \{[^}]*?)border-color: var\(--card-edge\);/, '$1border-color: var(--hx-warn-fill);')],
  ['a warn card loses its edge colour', judgeCards, () => replaceIn(LAY, /\.panelWarn \{\s*--card-edge: var\(--hx-warn-fill\);/, '.panelWarn {')],
  ['a page Widget colours its frame past the corner edge', judgeCards, () => append(HOME_PARTS, '.setupPanel { border-color: var(--hx-warn-fill); }')],
  ['a narrow settings summary goes back to static', judgeCards, () => append(LAY, '@media (width < 600px) { .hasWide .settingsSummaryCard { position: static; } }')],
  ['a card row hides its overflow again', judgeCards, () => append(DT, '.cards .tr { overflow: hidden; }')],
  ['a page card class goes back to static', judgeCards, () => replaceIn(HOME_PARTS, /(\.askCard \{\s*)min-height: 0;/, '$1position: static;\n  min-height: 0;')],
  ['a page card class hides its overflow', judgeCards, () => replaceIn(HOME_CARD, /(\.welcomeCard \{[^}]*?)overflow: clip;/, '$1overflow: hidden;')],
  // A base-row rule reaches card rows without spelling.cards, and
  // !important or a CSS-wide keyword still computes static.
  ['a base row rule puts card rows back to static', judgeCards, () => append(DT, '.tr { position: static; }')],
  ['a table row rule puts card rows back to static', judgeCards, () => append(DT, '.table .tr { position: static; }')],
  ['a page card class goes static with !important', judgeCards, () => replaceIn(HOME_PARTS, /(\.setupPanel \{\s*)min-height: 0;/, '$1position: static !important;\n  min-height: 0;')],
  ['a base row rule unsets the card row position', judgeCards, () => append(DT, '.tr { position: unset; }')],
  ['a cut card that holds no table hides its overflow', judgeCards, () => append(LAY, '.panel:not(:has(table)) { overflow: hidden; }')],
  // An exemption needs a proof the box is uncut; relational arguments name no presentation.
  ['a cut card with a non-table descendant hides its overflow', judgeCards, () => append(LAY, '.panel:has(:not(table)) { overflow: hidden; }')],
  ['a cut card with a table or other content hides its overflow', judgeCards, () => append(LAY, '.panel:has(table, .content) { overflow: hidden; }')],
  ['a cut card followed by a table hides its overflow', judgeCards, () => append(LAY, '.panel:has(+ table) { overflow: hidden; }')],
  ['a cut card with another mark value goes back to static', judgeCards, () => append(LAY, '.panel:not([data-card-cut="other"]) { position: static; }')],
  ['a cut card without a special mark hides its overflow', judgeCards, () => append(LAY, '.panel:not([data-card-cut].special) { overflow: hidden; }')],
  ['a card row holding a list descendant goes back to static', judgeCards, () => append(DT, '.tr:has(.list) { position: static; }')],
  ['a page class given to a Widget colours its frame', (f) => judgeCards(f, [['pages/x/x.module.css', 'tone']]), () => ({ ...REAL, 'pages/x/x.module.css': '.tone { border: 1px solid red; }' })],
  ['an @media copy strips a settings card', judgeCards, () => append(LAY, '@media (width < 600px) { .settingsSection { padding: 0; background: transparent; } }')],
  ['a context rule re-pads a card cell', judgeCards, () => append(DT, '.cards .tr > .cardCell { padding-inline: 0; }')],
  // K-b: the price type stays PlanCard's.
  ['a page sets its own price in the price type', judgePriceType, () => ({ ...REAL, 'pages/x/x.module.css': '.price { font: var(--t-price); }' })],
  ['a page redefines the price type', judgePriceType, () => ({ ...REAL, 'pages/x/x.module.css': ':root { --t-price: 300 40px/44px serif; }' })],
  ['PlanCard stops reading the price type', judgePriceType, () => replaceIn(PLAN_CARD, /font: var\(--t-price\);/, 'font: var(--t-display);')],
  ['the price leaves the price type while a stray custom property keeps a read', judgePriceType, () =>
    withText(PLAN_CARD, `${(REAL[PLAN_CARD] ?? '').replace(/font: var\(--t-price\);/, 'font: var(--t-display);')}\n.card { --keep: var(--t-price); }\n`)],
  // The read stays but is not the effective font.
  ['a later .amount rule overrides the price weight', judgePriceType, () => append(PLAN_CARD, '.amount { font-weight: 600; }')],
  ['a later .amount font shorthand replaces the price type', judgePriceType, () => append(PLAN_CARD, '.amount { font: var(--t-display); }')],
  ['a more specific rule resizes the price', judgePriceType, () => append(PLAN_CARD, '.price .amount { font-size: 12px; }')],
  ['an attribute rule reaches the price and overrides its weight', judgePriceType, () => append(PLAN_CARD, '[data-plan-part="price"] { font-weight: 600; }')],
  ['a tone rule reaches the price through its element', judgePriceType, () => append(PLAN_CARD, '.card[data-tone="accent"] .price > span { font-size: 12px; }')],
  ['an earlier !important weight beats the price type', judgePriceType, () => withText(PLAN_CARD, `.amount { font-weight: 600 !important; }\n${REAL[PLAN_CARD] ?? ''}`)],
  ['a surface token takes a new grey', judgeTokens, () => append('kit/tokens.css', ':root { --pop-bg: #fafafa; }')],
  // Cases: wrappers, qualified subjects, longhands, indirect tokens, other stylesheets.
  ['an :is() alternative re-fills a popover', judgePopovers, () => append(MENU, ':is(.popover, .other) { background: red; }')],
  ['a qualified :where() alternative strips a popover border', judgePopovers, () => append(MENU, ':where(.popover, .other)[data-placement] { border: 0; }')],
  ['border longhands hide a popover frame', judgePopovers, () => append(MENU, '.popover { border-width: 0; border-style: none; }')],
  ['a zero-width border keeps the frame token', judgePopovers, () => append(MENU, '.popover { border: 0 solid var(--pop-line); }')],
  ['a lift through a custom property', judgePopovers, () => ({ ...REAL, 'pages/x/x.module.css': '.menu { --lift: var(--sh-pop); box-shadow: var(--lift); background: red; }' })],
  ['another stylesheet redefines a surface token', judgeTokens, () => ({ ...REAL, 'pages/x/x.module.css': ':root { --pop-bg: #fafafa; }' })],
  ['another stylesheet restores the dark 7% focus fill', judgeTokens, () => ({ ...REAL, 'pages/x/x.module.css': ':root[data-hx-theme="dark"] { --pop-hover: var(--hx-selected); }' })],
  ['a focused item redefines --pop-hover', judgeTokens, () => append(MENU, '.item[data-focused] { --pop-hover: red; }')],
  ['a popover redefines --pop-bg', judgeTokens, () => append(MENU, '.popover { --pop-bg: red; }')],
  ['a surface token names a new palette grey', judgeTokens, () => append('kit/tokens.css', ':root { --hx-new-grey: #fafafa; --card-body: var(--hx-new-grey); }')],
  ['a qualified @media settings card is stripped', judgeCards, () => append(LAY, '@media (width < 600px) { .settingsSection[data-hub-here] { padding: 0; background: red; } }')],
  ['a two-class settings card is stripped', judgeCards, () => append(LAY, '.settingsSection.settingsDanger { padding: 0; background: red; }')],
  ['a head band loses its rule through a longhand', judgeCards, () => append(LAY, '.panelHead { border-block-end-width: 0; }')],
  ['an :is() cell rule removes the divider', judgeDividers, () => append(DT, '.table:not(.list) .tbody .tr > :is(td, th):not(.tdCheck):not(.tdActions) { background: none; }')],
  ['a later :is() copy of the divider removes it', judgeDividers, () => append(DT, '.table:not(.list) .tr > td:not(.tdCheck) + :is(td):not(.tdActions) { background-image: none; }')],
  ['a page draws a qualified cell divider', judgeDividers, () => ({ ...REAL, 'pages/x/x.module.css': '.grid td.cell + td.cell { border-inline-start: 1px solid red; }' })],
  // More cases: branch-shared exemptions, wrapped combinators, block-axis and shorthand edges, palette
  // dependencies, conditional colours, partial frames, placement-only proof, hover over focus.
  ['a checkbox branch exempts data cells', judgeDividers, () => append(DT, '.table:not(.list) .tr > td:not(.tdCheck) + :is(td, .tdCheck):not(.tdActions) { background-image: none; }')],
  ['a checkbox class branch exempts .td cells', judgeDividers, () => append(DT, '.table:not(.list) .tr > td:not(.tdCheck) + :is(.td, .tdCheck):not(.tdActions) { background-image: none; }')],
  ['a wrapped sibling divider in a page', judgeDividers, () => ({ ...REAL, 'pages/x/x.module.css': ':is(.grid td + td, .grid th + th) { border-inline-start: var(--bw) solid var(--hx-line); }' })],
  ['a hover branch exempts the jump-target fill', judgeCards, () => append(LAY, '.settingsSection:is(:hover, [data-hub-here]) { background: var(--hx-raised); }')],
  ['a hover branch exempts another card', judgeCards, () => append(LAY, ':is(.settingsSection, .settingsSummaryCard:hover) { background: red; }')],
  ['the block shorthand erases a head rule', judgeCards, () => append(LAY, '.panelHead { border-block: 0; }')],
  ['the block width erases a head rule', judgeCards, () => append(LAY, '.panelHead { border-block-width: 0; }')],
  ['a padding shorthand zeroes the inline inset', judgeCards, () => append(LAY, '.settingsSection { padding: var(--pad-card) 0; }')],
  ['another stylesheet re-points a palette dependency', judgeTokens, () => ({ ...REAL, 'pages/x/x.module.css': ':root[data-hx-theme="dark"] { --hx-hover: var(--hx-selected); }' })],
  ['another stylesheet redefines a palette dependency', judgeTokens, () => ({ ...REAL, 'pages/x/x.module.css': ':root[data-hx-theme="dark"] { --hx-hover: rgb(255 255 255 / 7%); }' })],
  ['a phone-only dark focus fill', judgeTokens, () => append('kit/tokens.css', '@media (width < 600px) { :root[data-hx-theme="dark"] { --pop-hover: var(--hx-selected); } } @media (width >= 600px) { :root[data-hx-theme="dark"] { --pop-hover: var(--hx-hover); } }')],
  ['a frame without a style', judgePopovers, () => append(MENU, '.popover { border: var(--bw) var(--pop-line); }')],
  ['a frame reduced to its colour', judgePopovers, () => replaceIn(MENU, /border: var\(--bw\) solid var\(--pop-line\);/, 'border-color: var(--pop-line);')],
  ['the frame moves to one placement', judgePopovers, () => replaceIn(MENU, /^\.popover \{/m, ".popover[data-placement='top'] {")],
  ['hover paints over a focused item', judgeFocused, () => append(MENU, '.item:hover { background: var(--hx-hover); }')],
  // The divider is a background layer; a border on a column cell narrows the content.
  ['a column cell takes a width-stealing divider border again', judgeDividers, () => append(DT, '.table:not(.list) .tr > td + td { border-inline-start: var(--bw) solid var(--col-line); }')],
  ['a more specific shorthand fill hides the divider layer', judgeDividers, () => append(DT, '.table:not(.list) .tbody .tr > td:not(.tdCheck) + td:not(.tdActions) { background: var(--hx-hover); }')],
  ['the divider layer is sized away', judgeDividers, () => replaceIn(DT, /background-size: var\(--bw\) 100%;/, 'background-size: 0 0;')],
  ['the right-to-left copy moves the line off the cell', judgeDividers, () => replaceIn(DT, /background-position: right top;/, 'background-position: left -10px;')],
  // An exact-selector shorthand, and:is() taking its strongest argument's specificity.
  ['a background shorthand on the body divider selector', judgeDividers, () => append(DT, '.table:not(.list) .tr > td:not(.tdCheck) + td:not(.tdActions) { background: var(--hx-hover); }')],
  ['a background shorthand on the header divider selector', judgeDividers, () => append(DT, '.table:not(.list) .thead th:not(.thCheck) + th:not(.thActions) { background: var(--hx-fill); }')],
  ['an :is() whose strongest branch is exempt lifts a cell fill over the divider', judgeDividers, () => append(DT, '.table:not(.list) .tr > :is(td, .tdCheck:hover):not(.tdActions) { background: var(--hx-hover); }')],
  ['a page draws a gradient cell divider', judgeDividers, () => ({ ...REAL, 'pages/x/x.module.css': '.grid td + td { background-image: linear-gradient(red, red); }' })],
];

/** Legitimate CSS each judge must accept (the judges govern their elements and states, nothing more). */
const CONTROLS: readonly (readonly [string, (f: Files) => string[], () => Files])[] = [
  // Rules kept to another presentation, or to a box that is never cut, are outside the root judge.
  ['a list row rule may set static', judgeCards, () => append(DT, '.list .tr { position: static; }')],
  ['an icons row rule may set static', judgeCards, () => append(DT, '.icons .tr { position: static; }')],
  ['a row rule that excludes cards may set static', judgeCards, () => append(DT, '.table:not(.cards) .tr { position: static; }')],
  ['a row rule naming cards and negating exactly cards may set static', judgeCards, () => append(DT, '.table.cards:not(.cards) .tr { position: static; }')],
  ['a panel holding a table or a table frame may scroll', judgeCards, () => append(LAY, '.panel:has(table, [data-table-frame]) { overflow: auto; }')],
  ['a panel that is unmarked or special may hide its overflow', judgeCards, () => append(LAY, '.panel:not([data-card-cut], .special) { overflow: hidden; }')],
  ['a panel holding a table may scroll', judgeCards, () => append(LAY, '.panel:has(table) { overflow: auto; }')],
  ['a panel holding a table frame may scroll sideways', judgeCards, () => append(LAY, '.panel:has([data-table-frame]) { overflow-x: scroll; }')],
  ['an unmarked panel may hide its overflow', judgeCards, () => append(LAY, '.panel:not([data-card-cut]) { overflow: hidden; }')],
  ['an unfocused item may clear its fill', judgeFocused, () => append(MENU, '.item:not([data-focused]) { background: transparent; }')],
  ['the checkbox column draws no divider', judgeDividers, () => append(DT, '.tdCheck { border-inline-start: 0; }')],
  ['a selected card row takes the selection fill', judgeCards, () => append(DT, '.cards .tr[data-selected] { background: var(--hx-selected); }')],
  ['a hovered card row takes the hover fill', judgeCards, () => append(DT, '.cards .tr:hover { background: var(--hx-hover); }')],
  ['a placed popover sets its origin', judgePopovers, () => append(MENU, ".popover[data-placement='top'] { transform-origin: bottom; }")],
  ['a page table borders its own cells without a sibling divider', judgeDividers, () => ({ ...REAL, 'pages/x/x.module.css': '.md td { border: 1px solid var(--hx-line); }' })],
  ['a component reads a surface token', judgeTokens, () => ({ ...REAL, 'pages/x/x.module.css': '.x { background: var(--pop-bg); }' })],
  ['a focused item decorates a pseudo-element', judgeFocused, () => append(MENU, '.item[data-focused]::before { content: ""; background: var(--hx-ink); }')],
  ['an unregistered sheet button has its own focus fill', judgeFocused, () => append('kit/forms/more.module.css', '.sheetButton[data-focused] { background: var(--hx-hover); }')],
  ['hover that excludes focus', judgeFocused, () => append(MENU, '.item:hover:not([data-focused]) { background: var(--hx-hover); }')],
  ['a placed popover adds to the base frame', judgePopovers, () => append(MENU, ".popover[data-placement='top'] { border-block-end-width: var(--bw); }")],
  ['a hovered row keeps its less specific fill under the divider', judgeDividers, () => append(DT, '.tr:hover > td { background: var(--hx-hover); }')],
  ['a :where() context adds nothing to a weaker fill', judgeDividers, () => append(DT, ':where(.table:not(.list) .tbody .tr.tr) > td + td { background: var(--hx-hover); }')],
  ['a sticky first column fills its own cell', judgeDividers, () => append(DT, '.table .tr > td:first-child { background: var(--hx-card); }')],
];

/** The findings a change adds to the real tree's own. */
const added = (judge: (f: Files) => string[], files: Files) => {
  const before = new Set(judge(REAL));
  return judge(files).filter((x) => !before.has(x));
};

describe('surfaces: the judges catch overrides (mutants)', () => {
  for (const [name, judge, files] of MUTANTS) it(name, () => expect(added(judge, files()).length, name).toBeGreaterThan(0));
});

describe('surfaces: the judges accept legitimate CSS (controls)', () => {
  for (const [name, judge, files] of CONTROLS) it(name, () => expect(added(judge, files()), name).toEqual([]));
});
