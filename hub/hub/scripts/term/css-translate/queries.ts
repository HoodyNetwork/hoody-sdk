// @media / @container / @supports evaluation for one terminal "width class".
//
// Policy: a terminal is narrow, keyboard-driven and motionless. Every width/height feature (viewport or any container,
// named or not) is compared against ONE assumed size, the width class (default `narrow`); container queries use the
// same width as the viewport (a simplification: an inner container is narrower in reality; the report counts them).
// hover: none (no hover), pointer: fine (no touch target growth), prefers-reduced-motion: reduce, forced-colors: none,
// prefers-color-scheme: dark (the dark theme is the default), print: false. @supports is false (the branch is a browser
// workaround). An unknown feature is false and reported.
import { UNIT, toPx } from './units';
import type { WidthClass } from './types';

export const WIDTH_CLASSES: Record<string, WidthClass> = {
  // Cols sit between breakpoints the CSS uses (no `width < N` lands on the edge): 56 cols = 448 px (between 440 and
  // 480), 100 cols = 800 px (between 768 and 840), 160 cols = 1280 px (between 1180 and 1400).
  narrow: { name: 'narrow', cols: 56, rows: 40 },
  medium: { name: 'medium', cols: 100, rows: 40 },
  wide: { name: 'wide', cols: 160, rows: 50 },
};

export interface QueryEnv {
  /** The viewport's width (@media). */
  widthPx: number;
  heightPx: number;
  /** The width @container conditions are judged by (the page pane's); absent: the viewport's. */
  containerWidthPx?: number;
}

export function envFor(w: WidthClass): QueryEnv {
  return { widthPx: w.cols * UNIT.CELL_W_PX, heightPx: w.rows * UNIT.CELL_H_PX, ...(w.containerCols !== undefined ? { containerWidthPx: w.containerCols * UNIT.CELL_W_PX } : {}) };
}

export interface QueryResult {
  value: boolean;
  /** Features that were not understood (each made its test false). */
  unknown: string[];
}

const DISCRETE: Record<string, (v: string | undefined) => boolean> = {
  hover: (v) => v === 'none',
  'any-hover': (v) => v === 'none',
  pointer: (v) => v === 'fine',
  'any-pointer': (v) => v === 'fine',
  'prefers-reduced-motion': (v) => v === 'reduce',
  'forced-colors': (v) => v === 'none',
  'prefers-color-scheme': (v) => v === 'dark',
  'prefers-contrast': (v) => v === 'no-preference',
  orientation: (v) => v === 'landscape',
};

function lengthPx(s: string): number | undefined {
  const m = /^(-?[\d.]+)([a-z%]*)$/i.exec(s.trim());
  if (!m) return undefined;
  return toPx(Number(m[1]), m[2] ?? '');
}

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
    case '=':
      return a === b;
    default:
      return false;
  }
}

const FLIP: Record<string, string> = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=' };

/** One parenthesised feature, without the parentheses. */
function feature(src: string, env: QueryEnv, unknown: string[]): boolean {
  const s = src.trim();
  const dim = (name: string): number | undefined => {
    const n = name.toLowerCase();
    if (n === 'width' || n === 'inline-size') return env.widthPx;
    if (n === 'height' || n === 'block-size') return env.heightPx;
    if (n === 'aspect-ratio') return env.widthPx / env.heightPx;
    return undefined;
  };
  // Range form: `width < 600px`, `600px <= width`, `768px <= width < 840px`.
  const range = /^([^<>=]+?)\s*(<=|>=|<|>|=)\s*([^<>=]+?)(?:\s*(<=|>=|<|>|=)\s*([^<>=]+?))?$/.exec(s);
  if (range && !s.includes(':')) {
    const [, a, op1, b, op2, c] = range;
    const da = dim(a!);
    const db = dim(b!);
    if (op2 && c !== undefined) {
      const mid = dim(b!);
      const lo = lengthPx(a!);
      const hi = lengthPx(c);
      if (mid === undefined || lo === undefined || hi === undefined) return (unknown.push(s), false);
      return compare(lo, op1!, mid) && compare(mid, op2, hi);
    }
    if (da !== undefined) {
      const v = lengthPx(b!);
      if (v === undefined) return (unknown.push(s), false);
      return compare(da, op1!, v);
    }
    if (db !== undefined) {
      const v = lengthPx(a!);
      if (v === undefined) return (unknown.push(s), false);
      return compare(db, FLIP[op1!]!, v);
    }
    unknown.push(s);
    return false;
  }
  const colon = s.indexOf(':');
  const name = (colon < 0 ? s : s.slice(0, colon)).trim().toLowerCase();
  const value = colon < 0 ? undefined : s.slice(colon + 1).trim().toLowerCase();
  const mm = /^(min|max)-(width|height|inline-size|block-size)$/.exec(name);
  if (mm && value !== undefined) {
    const d = dim(mm[2]!)!;
    const v = lengthPx(value);
    if (v === undefined) return (unknown.push(s), false);
    return mm[1] === 'min' ? d >= v : d <= v;
  }
  const disc = DISCRETE[name];
  if (disc) return disc(value);
  unknown.push(s);
  return false;
}

/** Split on a top-level separator (comma or the word `or`/`and`), respecting parentheses. */
function splitTop(s: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0) {
      sep.lastIndex = i;
      const m = sep.exec(s);
      if (m && m.index === i) {
        out.push(cur);
        cur = '';
        i += m[0].length;
        continue;
      }
    }
    cur += ch;
    i++;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter((x) => x.length > 0);
}

/** A condition: `(a) and (b)`, `(a) or (b)`, `not (a)`, nested parentheses. */
function condition(src: string, env: QueryEnv, unknown: string[]): boolean {
  const s = src.trim();
  if (/^not\s/i.test(s)) return !condition(s.replace(/^not\s+/i, ''), env, unknown);
  const ors = splitTop(s, /\s+or\s+/iy);
  if (ors.length > 1) return ors.some((p) => condition(p, env, unknown));
  const ands = splitTop(s, /\s+and\s+/iy);
  if (ands.length > 1) return ands.every((p) => condition(p, env, unknown));
  if (s.startsWith('(') && s.endsWith(')')) {
    const inner = s.slice(1, -1).trim();
    // `((a) and (b))` nests a condition; `(width < 600px)` is a feature.
    if (inner.startsWith('(') || /^not\s/i.test(inner)) return condition(inner, env, unknown);
    return feature(inner, env, unknown);
  }
  // Media types.
  const t = s.toLowerCase();
  if (t === 'all' || t === 'screen') return true;
  if (t === 'print' || t === 'speech') return false;
  unknown.push(s);
  return false;
}

export function evalMedia(params: string, env: QueryEnv): QueryResult {
  const unknown: string[] = [];
  const value = splitTop(params, /,/y).some((q) => {
    let s = q.trim();
    let negate = false;
    if (/^only\s/i.test(s)) s = s.replace(/^only\s+/i, '');
    if (/^not\s+(all|screen|print)/i.test(s)) {
      negate = true;
      s = s.replace(/^not\s+/i, '');
    }
    s = s.replace(/^(all|screen)\s+and\s+/i, '');
    const v = condition(s, env, unknown);
    return negate ? !v : v;
  });
  return { value, unknown };
}

/** `@container [name] <condition>`. */
export function evalContainer(params: string, env: QueryEnv): QueryResult & { name?: string } {
  const unknown: string[] = [];
  const m = /^([a-z_][\w-]*)\s+(?=\(|not\s)/i.exec(params.trim());
  const name = m && m[1]!.toLowerCase() !== 'not' ? m[1] : undefined;
  const cond = name ? params.trim().slice(m![0].length) : params;
  const value = condition(cond, env.containerWidthPx === undefined ? env : { ...env, widthPx: env.containerWidthPx }, unknown);
  return { value, unknown, ...(name ? { name } : {}) };
}

export function evalSupports(_params: string): QueryResult {
  return { value: false, unknown: [] };
}
