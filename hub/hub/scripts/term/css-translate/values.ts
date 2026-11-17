// Value handling: var() chains, calc/min/max/clamp arithmetic, and length classification.
import valueParser from 'postcss-value-parser';
import { toPx } from './units';

export type VarLookup = (name: string) => { value: string; from: string } | undefined;

export interface Resolved {
  value: string;
  /** Custom properties met while resolving, outermost first, each with where its value came from. */
  chain: Array<{ name: string; from: string }>;
  /** Names with no value anywhere (and no fallback): usually set at run time from a style attribute. */
  unresolved: string[];
}

const MAX_DEPTH = 24;

/** Replace every var(--x[, fallback]) by its value, recursively. */
export function resolveVars(value: string, lookup: VarLookup, depth = 0, seen: ReadonlySet<string> = new Set()): Resolved {
  const chain: Resolved['chain'] = [];
  const unresolved: string[] = [];
  if (!value.includes('var(')) return { value, chain, unresolved };
  if (depth > MAX_DEPTH) return { value, chain, unresolved: ['(depth)'] };
  const parsed = valueParser(value);
  parsed.walk((node) => {
    if (node.type !== 'function' || node.value.toLowerCase() !== 'var') return undefined;
    const nameNode = node.nodes.find((n) => n.type === 'word');
    const name = nameNode?.value ?? '';
    const comma = node.nodes.findIndex((n) => n.type === 'div' && n.value === ',');
    const fallback = comma >= 0 ? valueParser.stringify(node.nodes.slice(comma + 1)).trim() : undefined;
    let replacement: string;
    const hit = seen.has(name) ? undefined : lookup(name);
    if (hit) {
      chain.push({ name, from: hit.from });
      const inner = resolveVars(hit.value, lookup, depth + 1, new Set([...seen, name]));
      chain.push(...inner.chain);
      unresolved.push(...inner.unresolved);
      replacement = inner.value;
    } else if (fallback !== undefined) {
      chain.push({ name, from: 'fallback' });
      const inner = resolveVars(fallback, lookup, depth + 1, seen);
      chain.push(...inner.chain);
      unresolved.push(...inner.unresolved);
      replacement = inner.value;
    } else {
      unresolved.push(name);
      replacement = `var(${name})`;
    }
    const n = node as unknown as { type: string; value: string; nodes?: unknown };
    n.type = 'word';
    n.value = replacement;
    delete n.nodes;
    return false;
  });
  return { value: valueParser.stringify(parsed.nodes).trim(), chain, unresolved };
}

/** The first var() name a value starts with (`var(--hx-muted)` → `--hx-muted`), else undefined. */
export function leadingVar(value: string): string | undefined {
  const m = /^\s*var\(\s*(--[\w-]+)\s*[,)]/.exec(value);
  return m?.[1];
}

export type Length =
  | { kind: 'px'; px: number }
  | { kind: 'pct'; pct: number }
  | { kind: 'zero' }
  | { kind: 'number'; n: number }
  | { kind: 'fr'; fr: number }
  /** A length on the viewport's height (vh, dvh, svh, lvh) plus an absolute part: `vh` percent of the height of the
   *  region the page is mounted in, resolved at run time (a terminal has no growing document). */
  | { kind: 'vh'; vh: number; px: number }
  | { kind: 'keyword'; kw: string }
  | { kind: 'bad'; why: string };

interface Num {
  px?: number; // absolute part in px
  pct?: number; // percent part
  vh?: number; // viewport-height part (percent of the mounted region's height)
  n?: number; // unitless
  bad?: string;
}

const VIEWPORT = /^(vw|vh|vi|vb|vmin|vmax|svh|lvh|dvh|svw|lvw|dvw|cqw|cqh|cqi|cqb|cqmin|cqmax)$/i;
/** The viewport-height units (block axis, horizontal writing): the only viewport units kept (as `vh`). */
const VIEWPORT_H = /^(vh|svh|lvh|dvh)$/i;

function numOfWord(w: string): Num {
  const u = valueParser.unit(w);
  if (!u) return { bad: `not a number: ${w}` };
  const n = Number(u.number);
  if (u.unit === '') return { n };
  if (u.unit === '%') return { pct: n };
  if (VIEWPORT_H.test(u.unit)) return { vh: n };
  if (VIEWPORT.test(u.unit)) return { bad: `${u.unit} unit (viewport/container relative)` };
  if (u.unit.toLowerCase() === 'fr') return { bad: 'fr outside a grid template' };
  const px = toPx(n, u.unit);
  if (px === undefined) return { bad: `unit ${u.unit}` };
  return { px };
}

function add(a: Num, b: Num, sign: number): Num {
  if (a.bad || b.bad) return { bad: a.bad ?? b.bad! };
  if (a.n !== undefined && b.n !== undefined) return { n: a.n + sign * b.n };
  if (a.n !== undefined || b.n !== undefined) {
    // 0 + length is fine.
    if (a.n === 0) return { px: sign * (b.px ?? 0), pct: b.pct !== undefined ? sign * b.pct : undefined, vh: b.vh !== undefined ? sign * b.vh : undefined };
    if (b.n === 0) return a;
    return { bad: 'number + length' };
  }
  return {
    px: (a.px ?? 0) + sign * (b.px ?? 0),
    pct: a.pct === undefined && b.pct === undefined ? undefined : (a.pct ?? 0) + sign * (b.pct ?? 0),
    vh: a.vh === undefined && b.vh === undefined ? undefined : (a.vh ?? 0) + sign * (b.vh ?? 0),
  };
}

function mul(a: Num, b: Num, div: boolean): Num {
  if (a.bad || b.bad) return { bad: a.bad ?? b.bad! };
  const scalar = b.n !== undefined ? b : a.n !== undefined && !div ? a : undefined;
  const other = scalar === b ? a : b;
  if (!scalar || scalar.n === undefined) return { bad: 'length x length' };
  const k = div ? 1 / scalar.n : scalar.n;
  if (other.n !== undefined) return { n: other.n * k };
  return { px: other.px === undefined ? undefined : other.px * k, pct: other.pct === undefined ? undefined : other.pct * k, vh: other.vh === undefined ? undefined : other.vh * k };
}

function isPureLen(a: Num): boolean {
  return !a.bad && a.n === undefined && (a.pct === undefined || a.pct === 0) && (a.vh === undefined || a.vh === 0);
}

/** Evaluate a list of nodes forming one arithmetic expression (calc body). */
function evalExpr(nodes: valueParser.Node[]): Num {
  const toks = nodes.filter((n) => n.type !== 'space' && n.type !== 'comment');
  // Shunting-yard over + - * / with function and paren operands.
  const out: Num[] = [];
  const ops: string[] = [];
  const prec = (o: string): number => (o === '*' || o === '/' ? 2 : 1);
  const apply = (): void => {
    const o = ops.pop()!;
    const b = out.pop();
    const a = out.pop();
    if (!a || !b) {
      out.push({ bad: 'malformed expression' });
      return;
    }
    out.push(o === '+' || o === '-' ? add(a, b, o === '+' ? 1 : -1) : mul(a, b, o === '/'));
  };
  for (const t of toks) {
    if (t.type === 'word' && (t.value === '+' || t.value === '-' || t.value === '*' || t.value === '/')) {
      while (ops.length > 0 && prec(ops[ops.length - 1]!) >= prec(t.value)) apply();
      ops.push(t.value);
    } else if (t.type === 'div' && t.value === '/') {
      while (ops.length > 0 && prec(ops[ops.length - 1]!) >= 2) apply();
      ops.push('/');
    } else out.push(evalNode(t));
  }
  while (ops.length > 0) apply();
  if (out.length !== 1) return { bad: 'malformed expression' };
  return out[0]!;
}

function args(fn: valueParser.FunctionNode): valueParser.Node[][] {
  const groups: valueParser.Node[][] = [[]];
  for (const n of fn.nodes) {
    if (n.type === 'div' && n.value === ',') groups.push([]);
    else groups[groups.length - 1]!.push(n);
  }
  return groups;
}

function evalNode(n: valueParser.Node): Num {
  if (n.type === 'word') return numOfWord(n.value);
  if (n.type === 'function') {
    const f = n.value.toLowerCase();
    if (f === '' || f === 'calc') return evalExpr(n.nodes);
    if (f === 'min' || f === 'max' || f === 'clamp') {
      const vals = args(n).map((g) => evalExpr(g));
      const bad = vals.find((v) => v.bad);
      if (bad) return bad;
      if (!vals.every(isPureLen) && !vals.every((v) => v.n !== undefined)) return { bad: `${f}() mixing % and length` };
      const key = (v: Num): number => (v.n !== undefined ? v.n : v.px ?? 0);
      let pick: Num;
      if (f === 'clamp') {
        if (vals.length !== 3) return { bad: 'clamp() arity' };
        const [lo, mid, hi] = vals as [Num, Num, Num];
        pick = key(mid) < key(lo) ? lo : key(mid) > key(hi) ? hi : mid;
        if (key(lo) > key(hi)) pick = lo;
      } else pick = vals.reduce((a, b) => ((f === 'min' ? key(b) < key(a) : key(b) > key(a)) ? b : a));
      return pick;
    }
    if (f === 'env') {
      const g = args(n);
      // env(safe-area-inset-*) and friends: a terminal has no safe area (0).
      return g.length > 1 ? evalExpr(g.slice(1).flat()) : { px: 0 };
    }
    if (f === 'var') return { bad: `unresolved ${valueParser.stringify(n)}` };
    return { bad: `${f}()` };
  }
  return { bad: `unexpected ${n.type}` };
}

/**
 * `min(P%, L)` or `max(P%, L)` (either order; each argument one value, calc allowed): a percent of the parent and an
 * absolute length, which the single-value classifier cannot keep (`mixing % and length`). A size property says it as
 * two Yoga values: the percent, bounded by the length (translate.ts). Anything else is undefined.
 */
export function percentOrLength(value: string): { f: 'min' | 'max'; pct: number; px: number } | undefined {
  const nodes = valueParser(value.trim()).nodes.filter((n) => n.type !== 'space' && n.type !== 'comment');
  const fn = nodes[0];
  if (nodes.length !== 1 || !fn || fn.type !== 'function') return undefined;
  const f = fn.value.toLowerCase();
  if (f !== 'min' && f !== 'max') return undefined;
  const vals = args(fn).map((g) => evalExpr(g));
  if (vals.length !== 2 || vals.some((v) => v.bad)) return undefined;
  const isPct = (v: Num): boolean => v.n === undefined && v.pct !== undefined && v.pct !== 0 && !v.px && !v.vh;
  const p = vals.find(isPct);
  const l = vals.find((v) => v !== p && isPureLen(v) && (v.px ?? 0) > 0);
  if (!p || !l) return undefined;
  return { f, pct: p.pct!, px: l.px! };
}

/** Classify one (var-resolved) single-value length. */
export function parseLength(value: string): Length {
  const v = value.trim();
  if (/^[a-z-]+$/i.test(v)) return { kind: 'keyword', kw: v.toLowerCase() };
  const parsed = valueParser(v);
  const nodes = parsed.nodes.filter((n) => n.type !== 'space' && n.type !== 'comment');
  if (nodes.length !== 1) return { kind: 'bad', why: `not a single value: ${v}` };
  const node = nodes[0]!;
  if (node.type === 'word') {
    const u = valueParser.unit(node.value);
    if (u && u.unit.toLowerCase() === 'fr') return { kind: 'fr', fr: Number(u.number) };
  }
  const r = evalNode(node);
  if (r.bad) return { kind: 'bad', why: r.bad };
  if (r.n !== undefined) return r.n === 0 ? { kind: 'zero' } : { kind: 'number', n: r.n };
  if (r.vh !== undefined && r.vh !== 0) {
    if (r.pct !== undefined && r.pct !== 0) return { kind: 'bad', why: 'percent and viewport height mixed' };
    return { kind: 'vh', vh: r.vh, px: r.px ?? 0 };
  }
  if (r.pct !== undefined && r.pct !== 0) {
    if (r.px !== undefined && r.px !== 0) return { kind: 'bad', why: 'percent and length mixed (calc(% ± px))' };
    return { kind: 'pct', pct: r.pct };
  }
  const px = r.px ?? 0;
  return px === 0 ? { kind: 'zero' } : { kind: 'px', px };
}

/** A unitless number, after calc()/min()/max() (z-index, flex-grow, opacity, line-clamp). */
export function parseNumber(value: string): number | undefined {
  const l = parseLength(value);
  if (l.kind === 'zero') return 0;
  if (l.kind === 'number') return l.n;
  return undefined;
}

/** Split a value into its top-level space-separated parts (functions kept whole). */
export function topParts(value: string): string[] {
  return valueParser(value)
    .nodes.filter((n) => n.type !== 'space' && n.type !== 'comment')
    .map((n) => valueParser.stringify(n));
}

/** Split on top-level commas. */
export function commaParts(value: string): string[] {
  const groups: string[][] = [[]];
  for (const n of valueParser(value).nodes) {
    if (n.type === 'div' && n.value === ',') groups.push([]);
    else groups[groups.length - 1]!.push(valueParser.stringify(n));
  }
  return groups.map((g) => g.join('').trim()).filter((g) => g.length > 0);
}
