// Colours reach the page through theme tokens, so nothing stays light in dark: wells, strips and headers too.
// This pins it: no stylesheet outside tokens.css writes a colour of its own, every --hx-*
// token a stylesheet reads resolves in every theme and highlight and changes in dark, and the only tokens that keep one
// value in both themes are the ones in SAME_IN_BOTH, each with its reason. The listed parts are named below by the rule
// and property that paint them, so a part whose fill stops following the theme, or moves, is noticed here.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

type Decl = { prop: string; value: string; at: string[]; sel: string[]; order: number };

/**
 * Every declaration in a stylesheet, wherever it sits on a line, custom properties included, with the at-rules and
 * selectors around it. Comments go first; quotes and brackets are respected, so a ';' or '{' inside them splits nothing.
 */
function declarations(source: string): Decl[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Decl[] = [];
  const stack: string[] = [];
  let buf = '';
  let depth = 0;
  let quote = '';
  const flush = () => {
    const m = /^\s*(--[\w-]+|[a-zA-Z-]+)\s*:([\s\S]*)$/.exec(buf);
    if (m && stack.length > 0 && !stack[stack.length - 1]!.startsWith('@')) {
      const at = stack.filter((s) => s.startsWith('@'));
      const sel = stack.filter((s) => !s.startsWith('@'));
      out.push({ prop: m[1]!.toLowerCase(), value: m[2]!.replace(/!important\s*$/i, '').trim(), at, sel, order: out.length });
    } else if (m && stack.length > 0 && /^@(media|supports|container|layer)/.test(stack[stack.length - 1]!)) {
      // a declaration directly in a conditional group rule (CSS nesting) belongs to the rule around it
      const at = stack.filter((s) => s.startsWith('@'));
      const sel = stack.filter((s) => !s.startsWith('@'));
      if (sel.length > 0) out.push({ prop: m[1]!.toLowerCase(), value: m[2]!.trim(), at, sel, order: out.length });
    }
    buf = '';
  };
  for (const ch of css) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth > 0) { buf += ch; continue; }
    if (ch === '{') { stack.push(buf.trim().replace(/\s+/g, ' ')); buf = ''; }
    else if (ch === ';') flush();
    else if (ch === '}') { flush(); stack.pop(); }
    else buf += ch;
  }
  return out;
}

/** The CSS named colours (CSS Color 4), each a fixed colour. */
const NAMED = new Set(
  ('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse ' +
    'chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta ' +
    'darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
    'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green ' +
    'greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey ' +
    'lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen ' +
    'mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive ' +
    'olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peru pink plum powderblue purple ' +
    'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey ' +
    'snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '),
);
/** The system colours: the user's own palette, right only where forced colours replace the theme. */
const SYSTEM = new Set(
  ('accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext field fieldtext graytext highlight ' +
    'highlighttext linktext mark marktext selecteditem selecteditemtext visitedtext').split(' '),
);
/**
 * Properties whose words are names, not colours (a font, an animation, a grid area): a word there that spells a colour
 * is not one. transparent and currentColor are never fixed colours: the first paints nothing, the second is the text
 * colour, which follows the theme wherever the text does; neither is in NAMED.
 */
const NAME_PROPS = new Set(
  ('font font-family animation animation-name grid grid-area grid-template grid-template-areas grid-row grid-column container container-name ' +
    'view-transition-name content counter-reset counter-increment counter-set list-style list-style-type quotes transition transition-property ' +
    'will-change anchor-name position-anchor timeline-scope scroll-timeline view-timeline font-feature-settings font-variation-settings').split(' '),
);

/** The text of a url(): a data URL decoded (percent or base64), anything else as written. */
function urlText(inner: string): string {
  const t = inner.trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
  const m = /^data:[^,]*?(;base64)?,([\s\S]*)$/i.exec(t);
  if (!m) return t;
  if (m[1]) return Buffer.from(m[2]!, 'base64').toString('utf8');
  try {
    return decodeURIComponent(m[2]!);
  } catch {
    return m[2]!.replace(/%23/gi, '#').replace(/%27/g, "'").replace(/%22/g, '"');
  }
}

/** The text of a value inside its function calls (a gradient's stops, image(), a var() fallback), at any depth. */
function insideCalls(value: string): string {
  let depth = 0;
  let out = '';
  for (const ch of value) {
    if (ch === ')') depth--;
    out += depth > 0 ? ch : ' ';
    if (ch === '(') depth++;
  }
  return out;
}

/** The colours a declaration writes out, each named; forced: the declaration is inside @media (forced-colors: active). */
function rawColours(prop: string, value: string, forced = false): string[] {
  const found: string[] = [];
  let v = value.replace(/url\(((?:"[^"]*"|'[^']*'|[^)])*)\)/gi, (_, inner: string) => {
    // an image drawn from a data URL (an SVG's fill or stroke) paints its own colours just the same
    const img = urlText(inner);
    for (const m of img.matchAll(/#([0-9a-f]{3,8})\b/gi)) found.push(`#${m[1]} in url()`);
    for (const m of img.matchAll(/(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi)) found.push(`${m[1]}() in url()`);
    for (const m of img.matchAll(/(?:fill|stroke|stop-color|flood-color|lighting-color|color)\s*[=:]\s*["']?\s*([a-z]+)/gi)) {
      const w = m[1]!.toLowerCase();
      if (NAMED.has(w) || SYSTEM.has(w)) found.push(`${w} in url()`);
    }
    return ' ';
  });
  v = v.replace(/(["'])[\s\S]*?\1/g, ' ');
  for (const m of v.matchAll(/#[0-9a-f]{3,8}\b/gi)) found.push(m[0]);
  for (const m of v.matchAll(/(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi)) found.push(`${m[1]}()`);
  // in a property of names (a font, a list style), a bare word is a name; inside a call (a gradient) it is a colour
  const words = NAME_PROPS.has(prop) ? insideCalls(v) : v;
  for (const m of words.matchAll(/(?<![\w-])([a-z]+)(?![\w(-])/gi)) {
    const w = m[1]!.toLowerCase();
    if (NAMED.has(w) || (SYSTEM.has(w) && !forced)) found.push(w);
  }
  return found;
}

/** A value split at its top-level var() calls: text, and each call's name and fallback (if any), in order. */
function varCalls(value: string): { calls: { name: string; fallback?: string }[]; parts: (string | { name: string; fallback?: string })[] } {
  const parts: (string | { name: string; fallback?: string })[] = [];
  const calls: { name: string; fallback?: string }[] = [];
  let i = 0;
  let from = 0;
  while (i < value.length) {
    const at = value.toLowerCase().indexOf('var(', i);
    if (at < 0) break;
    if (at > 0 && /[\w-]/.test(value[at - 1]!)) {
      i = at + 4;
      continue;
    }
    let d = 1;
    let j = at + 4;
    let comma = -1;
    for (; j < value.length && d > 0; j++) {
      if (value[j] === '(') d++;
      else if (value[j] === ')') d--;
      else if (value[j] === ',' && d === 1 && comma < 0) comma = j;
    }
    const name = value.slice(at + 4, comma < 0 ? j - 1 : comma).trim();
    const call = comma < 0 ? { name } : { name, fallback: value.slice(comma + 1, j - 1).trim() };
    parts.push(value.slice(from, at), call);
    calls.push(call);
    i = from = j;
  }
  parts.push(value.slice(from));
  return { calls, parts };
}

type World = Map<string, string>;

/**
 * The token scopes of a tokens stylesheet merged into one map per theme and highlight, in cascade order (specificity,
 * then source order): light :root, the highlight's :root[data-hx-hl], dark, and dark with the highlight.
 */
function worlds(tokensCss: string, highlights: string[]): { theme: 'light' | 'dark'; hl: string; map: World }[] {
  const decls = declarations(tokensCss).filter((d) => d.prop.startsWith('--') && d.at.length === 0 && d.sel.length === 1);
  const out: { theme: 'light' | 'dark'; hl: string; map: World }[] = [];
  for (const theme of ['light', 'dark'] as const)
    for (const hl of ['', ...highlights]) {
      // a rule applies with the specificity of its most specific branch that matches (attributes: :root is one class)
      const spec = (sel: string) =>
        Math.max(
          -1,
          ...sel
            .split(',')
            .map((s) => s.trim())
            .map((s) => {
              const m = /^:root((?:\[[^\]]+\])*)$/.exec(s);
              if (!m) return -1;
              const attrs = [...m[1]!.matchAll(/\[([\w-]+)="([^"]*)"\]/g)].map((a) => [a[1]!, a[2]!] as const);
              const ok =
                attrs.length === (m[1]!.match(/\[/g) ?? []).length &&
                attrs.every(([k, val]) => (k === 'data-hx-theme' ? val === theme : k === 'data-hx-hl' ? val === hl : false));
              return ok ? attrs.length : -1;
            }),
        );
      const map: World = new Map();
      for (const d of decls.filter((x) => spec(x.sel[0]!) >= 0).sort((a, b) => spec(a.sel[0]!) - spec(b.sel[0]!) || a.order - b.order))
        map.set(d.prop, d.value);
      out.push({ theme, hl, map });
    }
  return out;
}

/**
 * A value with every var() replaced by what it resolves to in the world. A name the world lacks takes its fallback; a
 * missing name with no fallback, a cycle, or a fallback that writes a colour out is a problem, named in problems.
 */
function resolve(value: string, world: World, problems: string[], seen: string[] = []): string {
  return varCalls(value)
    .parts.map((c) => {
      if (typeof c === 'string') return c;
      if (c.fallback !== undefined && rawColours('--fallback', c.fallback).length > 0) problems.push(`${c.name}: fallback ${c.fallback} is a fixed colour`);
      if (seen.includes(c.name)) {
        problems.push(`cycle ${[...seen, c.name].join(' > ')}`);
        return '';
      }
      if (world.has(c.name)) {
        // a fallback not taken here may be taken where the name is missing: it must resolve too
        if (c.fallback !== undefined) resolve(c.fallback, world, problems, seen);
        return resolve(world.get(c.name)!, world, problems, [...seen, c.name]);
      }
      if (c.fallback !== undefined) return resolve(c.fallback, world, problems, seen);
      problems.push(`${c.name} is not defined`);
      return '';
    })
    .join('');
}

/**
 * How a value fares across the worlds: problems (a missing name, a cycle, a fixed fallback, in any world), and same:
 * the highlights in which it resolves to one colour in light and dark alike. A value with no colour in it is never same.
 */
function judge(value: string, all: { theme: string; hl: string; map: World }[]): { problems: string[]; same: string[] } {
  const problems: string[] = [];
  const got = new Map<string, string>();
  for (const w of all) {
    const p: string[] = [];
    got.set(`${w.theme}|${w.hl}`, resolve(value, w.map, p).replace(/\s+/g, ' ').trim());
    problems.push(...p.map((x) => `${w.theme}${w.hl ? `/${w.hl}` : ''}: ${x}`));
  }
  const same = [...new Set(all.map((w) => w.hl))].filter((hl) => {
    const l = got.get(`light|${hl}`)!;
    return l === got.get(`dark|${hl}`) && rawColours('color', l, false).length > 0;
  });
  return { problems: [...new Set(problems)], same };
}

type RGBA = [number, number, number, number];

/** A value split at its top-level commas (or spaces), brackets respected. */
function splitTop(value: string, sep: ',' | ' '): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && (sep === ',' ? ch === ',' : /\s/.test(ch))) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * A resolved colour as sRGB 0-255 with alpha: hex, rgb()/rgba(), white, black, transparent and color-mix(in srgb, ...),
 * which is every form tokens.css uses. Anything else is null, so a check that needs the colour fails rather than guesses.
 */
function paint(text: string): RGBA | null {
  const t = text.trim().toLowerCase();
  if (t === 'white') return [255, 255, 255, 1];
  if (t === 'black') return [0, 0, 0, 1];
  if (t === 'transparent') return [0, 0, 0, 0];
  let m = /^#([0-9a-f]{3,8})$/.exec(t);
  if (m) {
    let h = m[1]!;
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = /^rgba?\(([^()]*)\)$/.exec(t);
  if (m) {
    const v = m[1]!
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((x, i) => (x.endsWith('%') ? parseFloat(x) * (i < 3 ? 2.55 : 0.01) : parseFloat(x)));
    if (v.length < 3 || v.length > 4 || v.some((x) => Number.isNaN(x))) return null;
    return [v[0]!, v[1]!, v[2]!, v[3] ?? 1];
  }
  m = /^color-mix\(\s*in\s+srgb\s*,([\s\S]*)\)$/.exec(t);
  if (m) {
    const args = splitTop(m[1]!, ',');
    if (args.length !== 2) return null;
    const parsed = args.map((a) => {
      const parts = splitTop(a, ' ');
      const pct = parts.filter((x) => /^[\d.]+%$/.test(x));
      const col = parts.filter((x) => !/^[\d.]+%$/.test(x));
      return { c: col.length === 1 ? paint(col[0]!) : null, p: pct.length === 1 ? parseFloat(pct[0]!) : undefined };
    });
    const [a, b] = parsed as [{ c: RGBA | null; p?: number }, { c: RGBA | null; p?: number }];
    if (!a.c || !b.c) return null;
    let p1 = a.p ?? (b.p !== undefined ? 100 - b.p : 50);
    let p2 = b.p ?? 100 - p1;
    const sum = p1 + p2;
    if (sum <= 0) return null;
    const mult = Math.min(sum, 100) / 100;
    p1 /= sum;
    p2 /= sum;
    const alpha = a.c[3] * p1 + b.c[3] * p2;
    const ch = (i: number) => (alpha === 0 ? 0 : (a.c![i]! * a.c![3] * p1 + b.c![i]! * b.c![3] * p2) / alpha);
    return [ch(0), ch(1), ch(2), alpha * mult];
  }
  return null;
}

/** Relative luminance (WCAG) of a colour laid over an opaque ground. */
function luminanceOver(c: RGBA, ground: RGBA): number {
  const lin = (x: number) => {
    const v = x / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const mix = (i: number) => c[i]! * c[3] + ground[i]! * (1 - c[3]);
  return 0.2126 * lin(mix(0)) + 0.7152 * lin(mix(1)) + 0.0722 * lin(mix(2));
}

/** The most a listed part's fill may light up in dark: a dark grey (#5a5a5a is 0.10), well below any light-theme ground. */
const DARK_FILL_MAX = 0.1;

/**
 * Whether a fill is dark where the theme is: in every dark world, each colour the value paints (a gradient's stops
 * included), laid over that world's page ground, stays at or under DARK_FILL_MAX. A colour that cannot be read is a
 * problem too. A value that changes in dark yet stays nearly white (a mix that is mostly white) is refused here.
 */
function darkFill(value: string, all: { theme: string; hl: string; map: World }[]): string[] {
  const problems: string[] = [];
  for (const w of all.filter((x) => x.theme === 'dark')) {
    const ground = paint(resolve('var(--hx-bg)', w.map, []));
    const where = `dark${w.hl ? `/${w.hl}` : ''}`;
    if (!ground || ground[3] !== 1) {
      problems.push(`${where}: the page ground --hx-bg cannot be read`);
      continue;
    }
    const colours: string[] = [];
    const walk = (v: string) => {
      for (const piece of splitTop(v, ',').flatMap((x) => splitTop(x, ' '))) {
        if (paint(piece)) colours.push(piece);
        else if (/^[\w-]*gradient\(/i.test(piece)) walk(piece.slice(piece.indexOf('(') + 1, -1));
        else if (rawColours('color', piece).length > 0) problems.push(`${where}: cannot read the colour ${piece}`);
      }
    };
    walk(resolve(value, w.map, []).trim());
    for (const c of colours) {
      const l = luminanceOver(paint(c)!, ground);
      if (l > DARK_FILL_MAX) problems.push(`${where}: ${c} is light (luminance ${l.toFixed(2)} over the page ground)`);
    }
  }
  return [...new Set(problems)];
}

/** A nested declaration's selector written out flat ('&' replaced by the rule around it). */
const flatSelector = (sel: string[]) => sel.reduce((acc, s) => (s.includes('&') ? s.replace(/&/g, acc) : acc ? `${acc} ${s}` : s), '');

/** Whether a selector, in any of its branches, styles the element a listed selector names (its last compound has every part). */
function styles(selector: string, part: string): boolean {
  const need = [...part.matchAll(/\.[\w-]+|\[[^\]]+\]/g)].map((m) => m[0]);
  return selector.split(',').some((b) => {
    const last = b.trim().split(/\s*[>+~]\s*|\s+/).pop() ?? '';
    return need.every((n) => (n.startsWith('.') ? new RegExp(`\\${n}(?![\\w-])`).test(last) : last.includes(n)));
  });
}

/** The properties that paint each listed property: a shorthand's longhands and its per-side forms. */
const FAMILY: Record<string, RegExp> = {
  background: /^background(-color|-image)?$/,
  border: /^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?$/,
  color: /^color$/,
  // the kit Button paints its plate and frame through these two private properties (kit/controls/Button.module.css)
  '--plate': /^--plate$/,
  '--plate-line': /^--plate-line$/,
  // the kit DataTable paints a marked row's bar and wash through these (kit/data/DataTable.module.css)
  '--mark-bar': /^--mark-bar$/,
  '--mark-wash': /^--mark-wash$/,
};

const SRC = join(import.meta.dirname, '..');
const tokensCss = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');
const HIGHLIGHTS = [...new Set([...tokensCss.matchAll(/data-hx-hl="([\w-]+)"/g)].map((m) => m[1]!))];
const ALL = worlds(tokensCss, HIGHLIGHTS);
const light = ALL.find((w) => w.theme === 'light' && w.hl === '')!.map;
const follows = (name: string) => {
  const j = judge(`var(${name})`, ALL);
  return j.problems.length === 0 && j.same.length === 0;
};

/**
 * The tokens with one value in both themes, each with why that is right in dark. A token here that gains a dark value,
 * or that no stylesheet reads any more, fails the test, so the list stays exactly the tokens that need it. "Highlight
 * accent" is the one the person picked (yellow, mint, sky, coral, lilac or chalk); it is the same in both themes.
 */
const SAME_IN_BOTH: Record<string, string> = {
  '--hx-acc': 'the highlight accent stays in both themes, always with dark text on it',
  '--hx-acc-edge': 'the line around a highlight accent fill, which is the same fill in both themes',
  '--hx-acc-ink': 'dark text on the highlight accent fill',
  '--hx-acc-text-on': 'dark text on the highlight accent fill (the selected nav row and accent chips)',
  '--hx-acc-hover': 'the primary plate under the pointer, one step darker than the highlight accent, which is the same fill in both themes',
  '--hx-acc-press': 'the pressed primary plate, one step darker than its hover, on the highlight accent fill that is the same in both themes',
  '--hx-plate-pick-bar': 'the bar of the picked plate (Guide Connect rail), the highlight accent',
  '--hx-switch-on': 'a switch that is on is the highlight accent in both themes',
  '--hx-switch-on-line': 'the dark line around the highlight-accent on-switch',
  '--hx-switch-thumb': 'the white switch thumb, on the grey or highlight-accent track in both themes',
  '--hx-switch-line': 'the mid-grey line of an off switch, readable on the light and the dark ground',
  '--hx-meter-tone': 'a meter fill is the on-switch highlight accent',
  '--hx-meter-edge': 'the line of a meter fill is the on-switch line',
  '--hx-tag-mark-edge': "the 'mark' Tag sits on the highlight accent in both themes, so its frame stays ink-dark",
  '--hx-verdict-good': 'Verdict state plate tint (the highlight accent); the plate is dark in both themes',
  '--hx-verdict-muted': 'Verdict state plate tint on the plate, dark in both themes',
  '--hx-verdict-next': 'Verdict state plate tint on the plate, dark in both themes',
  '--hx-verdict-warn': 'Verdict state plate tint on the plate, dark in both themes',
  '--hx-verdict-danger': 'Verdict state plate tint on the plate, dark in both themes',
  '--hx-verdict-seg': 'Verdict state plate segment on the plate, dark in both themes',
  '--hx-verdict-hatch': 'Verdict state plate hatch on the plate, dark in both themes',
  '--hx-on-warn': 'dark text on the warn fill, a light olive in light and the brand yellow in dark, both light enough for it',
  '--hx-tag-ok-dot': 'a status dot, the same saturated green on light and dark tags',
  '--hx-tag-bad-dot': 'a status dot, the same saturated red on light and dark tags',
  '--hx-tag-neutral-dot': 'a status dot, the same mid grey on light and dark tags',
  '--hx-count-line': 'the edge of an accent count, the highlight accent itself in both themes (only chalk in light draws a grey line)',
  '--hx-notice-danger-line': 'the danger red at 30 percent, the frame of a danger notice, a tint that reads over either ground',
  '--hx-app-ink': 'text on the app surface (--hx-app), which is dark in both themes',
  '--hx-app-muted': 'muted text on the app surface (--hx-app), which is dark in both themes',
  '--hx-app-hover': 'a white wash on the app surface (--hx-app), which is dark in both themes',
  '--hx-danger-fill': 'the saturated danger red fill (bars, dots, buttons), the same in both themes, with dark text on it (--hx-on-danger)',
  '--hx-muted-fill': 'the mid-grey dot and bar fill, 3.3:1 on the light ground and 5:1 on the dark one, never text',
  '--hx-r-red': 'a realm colour, the one the person picked for it, the same swatch in both themes',
  '--hx-r-orange': 'a realm colour, the one the person picked for it, the same swatch in both themes',
  '--hx-r-green': 'a realm colour, the one the person picked for it, the same swatch in both themes',
  '--hx-r-teal': 'a realm colour, the one the person picked for it, the same swatch in both themes',
  '--hx-r-blue': 'a realm colour, the one the person picked for it, the same swatch in both themes',
  '--hx-r-purple': 'a realm colour, the one the person picked for it, the same swatch in both themes',
};

/**
 * The declarations that write a colour of their own, each with why: '<stylesheet> <selector> { <property>: <value> }'.
 * Kept exact like SAME_IN_BOTH: an entry no longer written fails the test, and any other colour in the same rule is
 * refused as everywhere else.
 */
const FRAME_PAGE =
  "a document frame's ground is a browser tab's (color-scheme: light, Canvas and CanvasText), so a page that sets no colours shows black on white in every theme";
const OWN_COLOUR: Record<string, string> = {
  'pages/board/parts/board.module.css .framePage { background: Canvas }': FRAME_PAGE,
  'pages/board/parts/board.module.css .framePage { color: CanvasText }': FRAME_PAGE,
};

/**
 * The parts checked, each by the rules that paint it: [stylesheet, selector, property, kind?]. Each
 * must exist, and every declaration that paints it must resolve in every theme and highlight and differ in dark. A
 * background is a surface and must also be dark in dark (darkFill), unless its kind is 'mark': an ink mark, which turns
 * light in dark with the text it sits beside.
 */
const SECTION_21B: Record<string, [string, string, string, 'mark'?][]> = {
  'Questions well': [
    ['kit/layouts/Faq.module.css', '.faq', 'background'],
    ['kit/layouts/Faq.module.css', '.title', 'background'],
  ],
  'summary strips (Computers, Vault, Wallet)': [
    ['kit/data/Display.module.css', '.ss', 'background'],
    ['kit/data/Display.module.css', '.ss', 'border'],
  ],
  'slanted empty cards': [
    ['kit/states/States.module.css', '.card', 'background'],
    ['kit/layouts/CardEdge.module.css', '.edge', 'color'],
  ],
  'project and Computers card header bands': [
    ['kit/data/DataTable.module.css', '.cardHeadBand', 'background'],
    ['pages/computers/parts/ComputerCard.module.css', '.head', 'background'],
    ['pages/computers/parts/ComputerCard.module.css', '.inner', 'background'],
  ],
  'Guide Connect rail and code lines': [
    ['pages/guide/parts/guide.module.css', '.doors', 'background'],
    // The rail itself is the kit's SideTabs on the plate ground of .doors; it paints no ground of its own.
    ['pages/guide/parts/guide.module.css', '.pathLine', 'background'],
  ],
  'AI start tiles and composer': [
    // The start cells are one strip; the cell fill is the list item's, the button on it is transparent
    ['pages/ai/new/NewChat.module.css', '.suggestions > li', 'background'],
    ['kit/agent/Conversation.module.css', '.composer', 'background'],
  ],
  // Every kit button is a plate; the grey plate (secondary, ghost text actions, three-dot, icon squares) and its
  // frame at rest, under the pointer and pressed are the .button rules
  'grey plate text actions, three-dot and icon squares': [
    ['kit/controls/Button.module.css', '.button', '--plate'],
    ['kit/controls/Button.module.css', '.button', '--plate-line'],
  ],
  'Files 32 px icon buttons (toolbar size)': [['kit/controls/Button.module.css', '.button.toolbar.pressed', '--plate']],
  // An unread notification is a kit DataTable row mark (rowMark 'ink'): its bar and its wash
  'Notifications unread mark': [
    ['kit/data/DataTable.module.css', ".tr[data-mark='ink']", '--mark-bar', 'mark'],
    ['kit/data/DataTable.module.css', ".tr[data-mark='ink']", '--mark-wash', 'mark'],
  ],
  'top bar realm pickers and search': [
    ['shell/TopBar.module.css', '.context', 'background'],
    ['shell/TopBar.module.css', '.search', 'background'],
  ],
};

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : cssFiles(p);
    return n.endsWith('.css') ? [p] : [];
  });
}
const sheets = cssFiles(SRC)
  .map((p) => ({ file: relative(SRC, p), decls: declarations(readFileSync(p, 'utf8')) }))
  .filter((s) => s.file !== 'kit/tokens.css');
const hxReads = (value: string): string[] => [...value.matchAll(/var\(\s*(--hx-[\w-]+)/g)].map((m) => m[1]!);
const forcedAt = (d: Decl) => d.at.some((a) => /forced-colors\s*:\s*active/.test(a));

/** The declarations of these sheets that write a colour of their own, keyed as OWN_COLOUR is, and those it does not allow. */
function ownColours(list: { file: string; decls: Decl[] }[], allowed: Record<string, string>) {
  const own = list.flatMap((s) =>
    s.decls.flatMap((d) => (rawColours(d.prop, d.value, forcedAt(d)).length > 0 ? [{ key: `${s.file} ${d.sel.join(' ')} { ${d.prop}: ${d.value} }`, d }] : [])),
  );
  const refused = own
    .filter((o) => !(o.key in allowed) || o.d.at.length > 0)
    .map((o) => `${o.key} writes ${rawColours(o.d.prop, o.d.value, forcedAt(o.d)).join(', ')}`);
  return { own, refused };
}

/**
 * What is wrong with how a sheet paints one listed part (selector, property): every declaration that can paint it (later
 * and more specific rules, its states, its media and nested rules) must resolve, change in dark, and, for a surface's
 * background, be dark in dark.
 */
function partProblems(decls: Decl[], selector: string, prop: string, kind: 'mark' | undefined, all: { theme: string; hl: string; map: World }[]): string[] {
  const bad: string[] = [];
  for (const d of decls.filter((x) => FAMILY[prop]!.test(x.prop) && styles(flatSelector(x.sel), selector))) {
    const where = `${[...d.at, flatSelector(d.sel)].join(' ')} { ${d.prop}: ${d.value} }`;
    const j = judge(d.value, all);
    bad.push(...j.problems.map((x) => `${where}: ${x}`));
    if (j.same.length > 0) bad.push(`${where}: the same in light and dark (${j.same.map((h) => h || 'yellow').join(', ')})`);
    if ((prop === 'background' || prop === '--plate') && kind !== 'mark') bad.push(...darkFill(d.value, all).map((x) => `${where}: ${x}`));
  }
  return bad;
}

describe('colours follow the theme', () => {
  it('no stylesheet outside tokens.css writes a colour of its own (custom properties and fallbacks included)', () => {
    const { own, refused } = ownColours(sheets, OWN_COLOUR);
    expect(refused).toEqual([]);
    for (const [key, why] of Object.entries(OWN_COLOUR)) {
      expect(own.some((o) => o.key === key), `${key} still writes its own colour`).toBe(true);
      expect(why.length, `${key} has a reason`).toBeGreaterThan(20);
    }
  });

  it('every --hx-* token a stylesheet reads resolves in every theme and highlight and has a dark value, or is a named same-in-both token', () => {
    const bad = sheets.flatMap((s) =>
      [...new Set(s.decls.flatMap((d) => hxReads(d.value)))].flatMap((n) => {
        const j = judge(`var(${n})`, ALL);
        return [
          ...j.problems.map((p) => `${s.file}: ${n}: ${p}`),
          ...(j.same.length > 0 && !(n in SAME_IN_BOTH) ? [`${s.file}: ${n} is the same in light and dark (${light.get(n)})`] : []),
        ];
      }),
    );
    expect(bad).toEqual([]);
  });

  it('keeps the same-in-both list exact: each entry is the same in both themes, has a reason, and a reader', () => {
    // The realm colour classes (`.rc-<colour>` in tokens.css) are how pages read a realm swatch: they count as readers.
    const realmClassReads = [...tokensCss.matchAll(/^\.rc-[\w-]+\s*\{[^}]*\}/gm)].flatMap((m) => hxReads(m[0]));
    const read = new Set([...sheets.flatMap((s) => s.decls.flatMap((d) => hxReads(d.value))), ...realmClassReads]);
    for (const [name, why] of Object.entries(SAME_IN_BOTH)) {
      expect(light.has(name), `${name} is a token`).toBe(true);
      expect(follows(name), `${name} now follows the theme: take it off the list`).toBe(false);
      expect(judge(`var(${name})`, ALL).problems, `${name} resolves`).toEqual([]);
      expect(why.length, `${name} has a reason`).toBeGreaterThan(20);
      expect(read.has(name), `${name} is read by a stylesheet`).toBe(true);
    }
    // judged under every highlight: the accent is one colour in both themes whichever highlight is picked
    expect(HIGHLIGHTS).toEqual(['mint', 'sky', 'coral', 'lilac', 'chalk']);
    expect(judge('var(--hx-acc)', ALL).same).toEqual(['', ...HIGHLIGHTS]);
  });

  it('paints every listed part with a value that resolves and turns dark', () => {
    const bad: string[] = [];
    for (const [part, rules] of Object.entries(SECTION_21B))
      for (const [file, selector, prop, kind] of rules) {
        const sheet = sheets.find((s) => s.file === file);
        expect(sheet, `${part}: ${file} exists`).toBeDefined();
        // the rule that paints the part at rest, as written last (a later rule of the same selector wins)
        const base = sheet!.decls.filter((x) => x.at.length === 0 && x.sel.length === 1 && x.sel[0] === selector && x.prop === prop).pop();
        expect(base, `${part}: ${file} ${selector} { ${prop} }`).toBeDefined();
        expect(varCalls(base!.value).calls.length, `${part}: ${selector} ${prop} reads a token`).toBeGreaterThan(0);
        bad.push(...partProblems(sheet!.decls, selector, prop, kind, ALL).map((x) => `${part}: ${x}`));
      }
    expect(bad).toEqual([]);
  });

  // The guards above, held to cases they must refuse: a check that stops refusing any of them is weaker.
  it('refuses the cases the guards exist for', () => {
    const scan = (css: string) => declarations(css).flatMap((d) => rawColours(d.prop, d.value, forcedAt(d)));
    expect(scan('.a { --local-fill: #fff; background: var(--local-fill); }')).toEqual(['#fff']);
    expect(scan('.well { background: #fff; }')).toEqual(['#fff']);
    expect(scan('.a{color:red}')).toEqual(['red']);
    expect(scan('.a { border: 1px solid White; }')).toEqual(['white']);
    expect(scan('.a { background: color(display-p3 1 1 1); }')).toEqual(['color()']);
    expect(scan('.a { background: oklch(0.9 0 0); }')).toEqual(['oklch()']);
    expect(scan('.a { background: linear-gradient(var(--hx-bg), #fafafa); }')).toEqual(['#fafafa']);
    expect(scan('.a { background: url("data:image/svg+xml,%3Csvg fill=%27%23fff%27/%3E"); }')).toEqual(['#fff in url()']);
    expect(scan('.a { color: var(--hx-ink, #111); }')).toEqual(['#111']);
    expect(scan('.a { color: canvastext; }')).toEqual(['canvastext']);
    expect(scan('.a { .b { color: navy; } }')).toEqual(['navy']);
    // Named colours inside an SVG data URL, and inside a gradient in a property of names
    expect(scan(`.a { background-image: url("data:image/svg+xml,%3Csvg fill='white'/%3E"); }`)).toEqual(['white in url()']);
    expect(scan(`.a { mask: url('data:image/svg+xml;base64,${Buffer.from('<svg><path stroke="red"/></svg>').toString('base64')}'); }`)).toEqual(['red in url()']);
    expect(scan('.a { list-style: linear-gradient(red, white); }')).toEqual(['red', 'white']);
    // what it must let through
    expect(scan('@media (forced-colors: active) { .a { color: CanvasText; outline: 2px solid Highlight; } }')).toEqual([]);
    expect(scan('.a { color: currentColor; background: transparent; border-color: color-mix(in srgb, var(--hx-ink) 20%, transparent); }')).toEqual([]);
    expect(scan('.a { font-family: Tan, sans-serif; animation-name: red; background: var(--hx-red); }')).toEqual([]);
    expect(scan('.a:not(.red) > .b { color: var(--hx-ink); }')).toEqual([]);

    const fixture = (extra: string) =>
      worlds(
        `:root { --hx-bg: #fff; --hx-ink: #111; --hx-acc: #fd0; ${extra} } :root[data-hx-theme="dark"] { --hx-bg: #000; --hx-ink: #eee; --only-dark: #222; }
         :root[data-hx-hl="chalk"] { --hx-acc: #fff; } :root[data-hx-theme="dark"][data-hx-hl="chalk"] { --hx-acc: #ccc; }`,
        ['chalk'],
      );
    const j = (extra: string, value: string) => judge(value, fixture(extra));
    expect(j('', 'var(--hx-missing)').problems.length).toBeGreaterThan(0);
    expect(j('--x: var(--y); --y: var(--x);', 'var(--x)').problems.some((p) => p.includes('cycle'))).toBe(true);
    expect(j('--x: var(--hx-missing, #fff);', 'var(--x)').problems.some((p) => p.includes('fixed colour'))).toBe(true);
    expect(j('--x: var(--hx-bg, #fff);', 'var(--x)').problems.some((p) => p.includes('fixed colour'))).toBe(true);
    expect(j('', 'var(--only-dark)').problems.some((p) => p.startsWith('light'))).toBe(true);
    expect(j('--x: color-mix(in srgb, var(--hx-ink) 50%, #fff);', 'var(--x)').same).toEqual([]);
    expect(j('--x: #eee;', 'var(--x)').same).toEqual(['', 'chalk']);
    expect(j('', 'var(--hx-acc)').same).toEqual(['']);
    expect(j('--x: var(--hx-missing, var(--hx-bg));', 'var(--x)')).toEqual({ problems: [], same: [] });
    expect(j('--x: 4px;', 'var(--x)')).toEqual({ problems: [], same: [] });
    // A fallback not taken is still checked; a grouped selector counts its matching branch only
    expect(j('--x: var(--hx-bg, var(--hx-gone));', 'var(--x)').problems.some((p) => p.includes('--hx-gone is not defined'))).toBe(true);
    const grouped = worlds(
      `:root { --hx-bg: #fff; } :root[data-hx-theme="dark"], :root[data-hx-hl="mint"] { --hx-bg: #000; } :root[data-hx-hl="mint"] { --hx-bg: #0f0; }`,
      ['mint'],
    );
    expect(grouped.find((w) => w.theme === 'light' && w.hl === 'mint')!.map.get('--hx-bg')).toBe('#0f0');
    // A fill that changes in dark yet stays nearly white is refused; a dark fill passes
    const dk = fixture('--hx-well: #f4f4f4;').map((w) => (w.theme === 'dark' ? { ...w, map: new Map([...w.map, ['--hx-well', '#1c1c1c']]) } : w));
    expect(judge('color-mix(in srgb, white 99%, var(--hx-ink))', dk).same).toEqual([]);
    expect(darkFill('color-mix(in srgb, white 99%, var(--hx-ink))', dk).length).toBeGreaterThan(0);
    expect(darkFill('linear-gradient(var(--hx-well), #fff)', dk).length).toBeGreaterThan(0);
    expect(darkFill('var(--hx-well)', dk)).toEqual([]);
    expect(darkFill('color-mix(in srgb, var(--hx-well) 90%, var(--hx-ink))', dk)).toEqual([]);
    expect(darkFill('oklch(0.2 0 0)', dk).some((p) => p.includes('cannot read'))).toBe(true);
    // A later or state rule that paints a listed part is found
    expect(styles('.faq:hover', '.faq') && styles('.x > .faq.open', '.faq') && styles('.a, .faq', '.faq')).toBe(true);
    expect(styles('.faqItem', '.faq') || styles('.faq .title', '.faq') || styles('.ghost', '.ghost[data-words]')).toBe(false);
    expect(flatSelector(['.faq', '&:hover'])).toBe('.faq:hover');
    const part = (css: string, kind?: 'mark') => partProblems(declarations(css), '.faq', 'background', kind, dk);
    expect(part('.faq { background: var(--hx-well); }')).toEqual([]);
    expect(part('.faq { background: var(--hx-well); } .faq { background: var(--hx-acc); }').length).toBeGreaterThan(0);
    expect(part('.faq { background: var(--hx-well); } .faq:hover { background-color: var(--hx-acc); }').length).toBeGreaterThan(0);
    expect(part('.faq { background: var(--hx-well); } @media (width > 1px) { .faq { & .x, &.open { background: var(--hx-acc); } } }').length).toBeGreaterThan(0);
    expect(part('.faq { background: var(--hx-ink); }').length).toBeGreaterThan(0);
    expect(part('.faq { background: var(--hx-ink); }', 'mark')).toEqual([]);
    // An own-colour entry allows its one declaration, never the rest of its rule
    const frame = [{ file: 'f.css', decls: declarations('.p { background: Canvas; outline-color: red; }') }];
    expect(ownColours(frame, { 'f.css .p { background: Canvas }': 'x' }).refused).toEqual(['f.css .p { outline-color: red } writes red']);
  });
});
