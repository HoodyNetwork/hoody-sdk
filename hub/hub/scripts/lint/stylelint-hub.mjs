// Local stylelint rules of the Hub (the Hub's design rules, enforced before review).
//   hub/blue-only-link-focus  blue reaches the UI only through the link and focus tokens, and the selected-item bar
//   hub/no-dashed             dashed borders and outlines are retired, but for the nav item line and the section menu rail
//   hub/token-use             --focus-ring is a box-shadow list, not an outline; -t tint tokens are not text colours; the dark app surface needs --hx-app-ink
//   hub/page-anatomy-css      page CSS margins, heading type and kit reach beyond the layout debt rows (anatomy.cjs)
//   hub/hover-parity          what shows on :hover also shows on keyboard focus and on touch, in the same file
//   hub/no-raw-font-weight, hub/no-raw-line-height, hub/no-raw-letter-spacing, hub/no-raw-duration, hub/no-raw-shadow
//                             type, motion and shadow values come from tokens.css (kit/** in stylelint.config.mjs)
//   hub/control-size-token    a kit control's height and width come from size tokens; today's misses in control-size.debt.cjs
//   hub/focus-ring-token      kit focus is the --focus-ring shadow; an outline in the focus colour only under forced-colors
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import stylelint from 'stylelint';
import valueParser from 'postcss-value-parser';

const {
  createPlugin,
  utils: { report, ruleMessages },
} = stylelint;

const HUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKENS = path.join(HUB, 'src', 'kit', 'tokens.css');

// Link tokens colour text; focus tokens draw rings. Nothing else may be blue, bar the selected-item bar. No button is blue.
const LINK = /^--hx-link(-[\w-]+)?$/;
const FOCUS = /^(--hx-focus(-[\w-]+)?|--focus-ring(-[\w-]+)?|--ring-[\w-]+)$/;
const LINK_PROPS = /^(color|text-decoration(-color)?|caret-color|-{2}[\w-]+)$/;
// The selected-item bar is blue: this one token, by name, not a pattern.
const SELECTED_BAR = '--hx-selected-bar';
const FOCUS_PROPS = /^(outline(-[\w-]+)?|box-shadow|border(-[\w-]+)?-color|border(-(top|bottom|inline|block)(-(start|end))?)?|-{2}[\w-]+)$/;

let cache = { mtime: 0, blue: new Map() };

/** Every token of tokens.css that is blue: --hx-blue*, or one whose value reaches one (any theme). */
function blueTokens() {
  const mtime = fs.existsSync(TOKENS) ? fs.statSync(TOKENS).mtimeMs : 0;
  if (mtime === cache.mtime) return cache.blue;
  const refs = new Map();
  const text = mtime ? fs.readFileSync(TOKENS, 'utf8') : '';
  for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const list = refs.get(m[1]) ?? [];
    for (const r of m[2].matchAll(/var\(\s*(--[\w-]+)/g)) list.push(r[1]);
    refs.set(m[1], list);
  }
  const blue = new Map(); // token -> the blue token it reaches
  const visit = (name, seen) => {
    if (blue.has(name)) return blue.get(name);
    if (/^--hx-blue/.test(name)) return name;
    if (seen.has(name)) return null;
    seen.add(name);
    for (const r of refs.get(name) ?? []) {
      const hit = visit(r, seen);
      if (hit) return hit;
    }
    return null;
  };
  for (const name of refs.keys()) {
    const hit = visit(name, new Set());
    if (hit) blue.set(name, hit);
  }
  cache = { mtime, blue };
  return blue;
}

const BLUE = 'hub/blue-only-link-focus';
const blueMessages = ruleMessages(BLUE, {
  blue: (token, via) =>
    `"${token}" is blue${via !== token ? ` (via ${via})` : ''}: blue is only links in prose (<Link>, --hx-link), focus (--focus-ring) and the selected-item bar (--hx-selected-bar). ` +
    'Nav chrome is ink/--hx-muted, info is neutral, a selected surface is --hx-selected.',
  linkProp: (token, prop) => `"${token}" colours link text only (color, text-decoration); not "${prop}". For a selected or active surface use --hx-selected.`,
  focusProp: (token, prop) => `"${token}" marks focus only: outline/box-shadow/border colour, or any property inside a :focus rule; not "${prop}" here.`,
});

const blueRule = createPlugin(BLUE, (on) => (root, result) => {
  if (!on) return;
  const file = root.source?.input.file ?? '';
  if (path.resolve(file) === TOKENS) return;
  const blue = blueTokens();
  root.walkDecls((decl) => {
    for (const m of decl.value.matchAll(/var\(\s*(--[\w-]+)/g)) {
      const token = m[1];
      const prop = decl.prop.toLowerCase();
      if (token === SELECTED_BAR) continue;
      if (LINK.test(token)) {
        if (!LINK_PROPS.test(prop)) report({ ruleName: BLUE, result, node: decl, word: token, message: blueMessages.linkProp(token, prop) });
      } else if (FOCUS.test(token)) {
        const focusRule = decl.parent?.type === 'rule' && /focus/i.test(decl.parent.selector ?? '');
        if (!FOCUS_PROPS.test(prop) && !focusRule) report({ ruleName: BLUE, result, node: decl, word: token, message: blueMessages.focusProp(token, prop) });
      } else if (blue.has(token) || /^--hx-blue/.test(token)) {
        report({ ruleName: BLUE, result, node: decl, word: token, message: blueMessages.blue(token, blue.get(token) ?? token) });
      }
    }
  });
});
blueRule.ruleName = BLUE;
blueRule.messages = blueMessages;

const DASHED = 'hub/no-dashed';
const dashedMessages = ruleMessages(DASHED, {
  dashed: (prop) =>
    `"${prop}: dashed" is retired. Use a solid 1px var(--hx-line-2) hairline; empty tiles come from the kit EmptyState, missing values from CodeBlock placeholders.`,
});
// The side nav draws a dashed line between its items; a section menu's rail is
// dashed; a rail card's divider (kit DataTable) is dashed; the kit DataTable ledger (lines="dashed", e.g.
// the Sign-in sessions ledger) draws dashed row and head lines. These tokens, by name, as a direct value component of a border declaration (never inside another var()'s
// fallback), the way the blue rule allows SELECTED_BAR.
const NAV_ITEM_LINE = /^var\(\s*--hx-(?:nav-line-item|section-rail|card-rail-line|ledger-line|ledger-head-line)\s*\)$/;
/** The whitespace-separated components of a value, split outside parentheses and quoted strings (escapes honoured). */
function topLevel(value) {
  const parts = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      cur += ch;
      if (ch === '\\' && i + 1 < value.length) cur += value[++i];
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '\\' && i + 1 < value.length) {
      cur += ch + value[++i];
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && !quote && /\s/.test(ch)) {
      if (cur) parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  return cur ? [...parts, cur] : parts;
}
const dashedRule = createPlugin(DASHED, (on) => (root, result) => {
  if (!on) return;
  root.walkDecls(/^(border|outline|column-rule)/i, (decl) => {
    if (!/\bdashed\b/i.test(decl.value)) return;
    if (/^border/i.test(decl.prop) && topLevel(decl.value).some((c) => NAV_ITEM_LINE.test(c))) return;
    report({ ruleName: DASHED, result, node: decl, word: 'dashed', message: dashedMessages.dashed(decl.prop) });
  });
});
dashedRule.ruleName = DASHED;
dashedRule.messages = dashedMessages;

// Three common token slips.
const TOKEN_USE = 'hub/token-use';
const tokenMessages = ruleMessages(TOKEN_USE, {
  ringOutline: (prop) => `"${prop}: var(--focus-ring)": --focus-ring is a box-shadow list, invalid as an outline. Use box-shadow: var(--focus-ring) (or outline: 2px solid var(--hx-focus)).`,
  tintColor: (token) => `"color: var(${token})": the -t tokens are tints for backgrounds; text on them uses the matching ink (--hx-ink, --hx-<tone>-text).`,
  appInk: (token) => `background ${token} (the dark app surface) without color: var(--hx-app-ink…) in the same rule: text on it falls back to page ink and disappears.`,
});
const tokenRule = createPlugin(TOKEN_USE, (on) => (root, result) => {
  if (!on) return;
  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    if (/^outline(-color)?$/.test(prop) && /var\(--focus-ring(-inset)?\)/.test(decl.value)) {
      report({ ruleName: TOKEN_USE, result, node: decl, word: '--focus-ring', message: tokenMessages.ringOutline(prop) });
    }
    const tint = /var\((--hx-[\w-]+-t\d*)\)/.exec(decl.value);
    if (prop === 'color' && tint) report({ ruleName: TOKEN_USE, result, node: decl, word: tint[1], message: tokenMessages.tintColor(tint[1]) });
  });
  root.walkRules((rule) => {
    let surface = null;
    let ink = false;
    rule.each((n) => {
      if (n.type !== 'decl') return;
      const app = /var\((--hx-app(-2)?)\)/.exec(n.value);
      if (/^background(-color)?$/i.test(n.prop) && app) surface = { decl: n, token: app[1] };
      if (/^color$/i.test(n.prop) && /--hx-app-(ink|muted)/.test(n.value)) ink = true;
    });
    if (surface && !ink) report({ ruleName: TOKEN_USE, result, node: surface.decl, word: surface.token, message: tokenMessages.appInk(surface.token) });
  });
});
tokenRule.ruleName = TOKEN_USE;
tokenRule.messages = tokenMessages;

// Layout standard: the same import-resolving detector the vitest ratchet runs, so an editor and the gate agree.
const ANATOMY_CSS = 'hub/page-anatomy-css';
const anatomyMessages = ruleMessages(ANATOMY_CSS, {
  hit: (rule, why) => `${rule}: ${why}. Page CSS leaves margins, heading type and kit internals to the kit; the debt rows only ever shrink.`,
});
const anatomyCssRule = createPlugin(ANATOMY_CSS, (on) => (root, result) => {
  if (!on) return;
  const file = root.source?.input?.file;
  if (!file || !file.endsWith('.css')) return;
  const rel = path.relative(path.join(HUB, 'src'), file).split(path.sep).join('/');
  if (rel.startsWith('..') || !/^(pages|kit|shell|ask|app)\//.test(rel)) return;
  const anatomy = createRequire(import.meta.url)('./anatomy.cjs');
  for (const h of anatomy.lintHits(path.join(HUB, 'src'), rel)) {
    if (!anatomy.CSS_RULES.includes(h.rule)) continue;
    report({ ruleName: ANATOMY_CSS, result, node: root, message: anatomyMessages.hit(h.rule, anatomy.EXPLAIN[h.rule] || h.rule), start: { line: h.line || 1, column: h.col || 1 }, end: { line: h.line || 1, column: (h.col || 1) + 1 } });
  }
});
anatomyCssRule.ruleName = ANATOMY_CSS;
anatomyCssRule.messages = anatomyMessages;

// hub/hover-parity: a child that only :hover reveals is unreachable by keyboard and on touch. A reveal is a
// rule setting opacity, visibility, display or pointer-events through a selector where :hover (on a compound, or inside a
// positive pseudo such as :is()/:where(); never inside :not()) comes before a combinator. Its target is the last compound.
// The same file must hold two twins that reveal that target, each setting one of the reveal's properties and holding no :hover:
// a focus twin with a positive :focus-visible/:focus-within/[data-focus-visible], and a touch twin inside a non-negated
// @media (hover: none)/(pointer: coarse)/(any-hover: none) query (hiding the target there for a touch menu also counts).
// A twin names the target when its last compound equals the target with state pseudos stripped, and it either has no
// ancestors (.go:focus-visible) or the reveal's ancestors, state stripped (.row:focus-within .go for .row:hover .go). A
// selector list that also holds the selector without its :hover is a reset, not a reveal (the DataTable cards).
const HOVER_PARITY = 'hub/hover-parity';
const hoverMessages = ruleMessages(HOVER_PARITY, {
  hoverOnly: (selector, target) =>
    `"${selector}": shown on hover only: reveal it on keyboard focus and on touch (no hover) too. ` +
    `Show ${target} under :focus-within or :focus-visible, and inside @media (hover: none), with the same property, in this file.`,
});
const REVEAL_PROPS = /^(opacity|visibility|display|pointer-events)$/i;
const NO_HOVER = /\(\s*(?:hover\s*:\s*none|pointer\s*:\s*coarse|any-hover\s*:\s*none)\s*\)/i;
const STATES = new Set(['hover', 'focus', 'focus-visible', 'focus-within', 'active']);
const FOCUS_STATES = new Set(['focus-visible', 'focus-within']);
const DATA_FOCUS = /^\[\s*data-focus-visible\s*\]$/i;
const HEX = /[0-9a-f]/i;

// One tokenizer for selectors and media lists (CSS Syntax §4.3): escapes (hex with one trailing space), strings, (…) and […].
/** End of the escape at s[i] ('\'): one to six hex digits and one optional whitespace, or the next character. */
function escapeEnd(s, i) {
  let j = i + 1;
  if (j >= s.length || !HEX.test(s[j])) return Math.min(j + 1, s.length);
  for (let n = 0; j < s.length && n < 6 && HEX.test(s[j]); n++) j++;
  return j < s.length && /\s/.test(s[j]) ? j + 1 : j;
}
/** End of the string opening at s[i]. */
function stringEnd(s, i) {
  let j = i + 1;
  while (j < s.length && s[j] !== s[i]) j = s[j] === '\\' ? escapeEnd(s, j) : j + 1;
  return Math.min(j + 1, s.length);
}
/** End of the block opening at s[i] ('(' or '['), strings and escapes inside skipped. */
function blockEnd(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; ) {
    const ch = s[j];
    if (ch === '\\') j = escapeEnd(s, j);
    else if (ch === '"' || ch === "'") j = stringEnd(s, j);
    else {
      if (ch === '(' || ch === '[') depth++;
      else if ((ch === ')' || ch === ']') && --depth === 0) return j + 1;
      j++;
    }
  }
  return s.length;
}
/** The end of the token at s[i] that holds no top-level delimiter: an escape, a string, a block, or one character. */
const tokenEnd = (s, i) => (s[i] === '\\' ? escapeEnd(s, i) : s[i] === '"' || s[i] === "'" ? stringEnd(s, i) : s[i] === '(' || s[i] === '[' ? blockEnd(s, i) : i + 1);
/** A comma list split at its top-level commas. */
function splitList(s) {
  const out = [];
  let at = 0;
  for (let i = 0; i < s.length; ) {
    if (s[i] === ',') {
      out.push(s.slice(at, i).trim());
      at = ++i;
    } else i = tokenEnd(s, i);
  }
  return [...out, s.slice(at).trim()].filter(Boolean);
}
const IDENT = /[\w-]/;
/** The end of the identifier from s[i] (escapes and non-ASCII included). */
function identEnd(s, i) {
  let j = i;
  while (j < s.length && (IDENT.test(s[j]) || s.charCodeAt(j) > 127 || s[j] === '\\')) j = s[j] === '\\' ? escapeEnd(s, j) : j + 1;
  return j;
}
/** One selector as compounds and combinators: '.a:hover > .b' -> [compound, '>', compound], descendant ' '. A compound is a
 *  list of simples { text, pseudo, arg }: pseudo is a pseudo-class's lower-cased name (null otherwise), arg its (…) body. */
function parseSelector(sel) {
  const out = [];
  let cur = null;
  let comb = '';
  const add = (simple) => {
    if (!cur) {
      if (out.length) out.push(comb || ' ');
      comb = '';
      cur = [];
      out.push(cur);
    }
    cur.push(simple);
  };
  for (let i = 0; i < sel.length; ) {
    const ch = sel[i];
    if (/[\s>+~]/.test(ch)) {
      cur = null;
      if (!/\s/.test(ch)) comb = ch;
      i++;
    } else if (ch === ':') {
      const element = sel[i + 1] === ':';
      let j = identEnd(sel, i + (element ? 2 : 1));
      const name = element ? null : sel.slice(i + 1, j).toLowerCase();
      let arg = null;
      if (sel[j] === '(') {
        const end = blockEnd(sel, j);
        arg = sel.slice(j + 1, end - 1);
        j = end;
      }
      add({ text: sel.slice(i, j), pseudo: name, arg });
      i = j;
    } else {
      let j = tokenEnd(sel, i);
      if (ch === '.' || ch === '#' || IDENT.test(ch) || sel.charCodeAt(i) > 127) j = identEnd(sel, ch === '.' || ch === '#' ? i + 1 : i);
      add({ text: sel.slice(i, Math.max(j, i + 1)), pseudo: null, arg: null });
      i = Math.max(j, i + 1);
    }
  }
  return out;
}
const isCompound = (part) => typeof part !== 'string';
/** Whether a compound holds a simple that `is` matches, on itself or inside a positive pseudo's selector list (not :not()). */
const compoundHolds = (compound, is) =>
  compound.some((x) => is(x) || (x.pseudo && x.pseudo !== 'not' && x.arg !== null && splitList(x.arg).some((s) => selectorHolds(parseSelector(s), is))));
const selectorHolds = (parts, is) => parts.some((p) => isCompound(p) && compoundHolds(p, is));
const isHover = (x) => x.pseudo === 'hover' && x.arg === null;
const isFocus = (x) => (FOCUS_STATES.has(x.pseudo) && x.arg === null) || (x.pseudo === null && DATA_FOCUS.test(x.text));
/** A state simple: a state pseudo, [data-focus-visible], or :is()/:where() of states only (.row:is(:hover) is .row hovered). */
const isState = (x) =>
  (STATES.has(x.pseudo) && x.arg === null) ||
  (x.pseudo === null && DATA_FOCUS.test(x.text)) ||
  ((x.pseudo === 'is' || x.pseudo === 'where') && x.arg !== null && splitList(x.arg).every((s) => {
    const parts = parseSelector(s);
    return parts.length === 1 && parts[0].every(isState);
  }));
const serialize = (parts, keep = () => true) => parts.map((p) => (isCompound(p) ? p.filter(keep).map((x) => x.text).join('') : p)).join('');
/** A selector with state pseudos stripped from every compound (descendant combinators kept). */
const stateless = (parts) => serialize(parts, (x) => !isState(x));
/** Whether a @media prelude holds a query that matches a no-hover device and is not negated. */
const touchMedia = (params) => splitList(params).some((q) => NO_HOVER.test(q) && !/\bnot\b/i.test(q));

const hoverRule = createPlugin(HOVER_PARITY, (on) => (root, result) => {
  if (!on) return;
  const rules = [];
  root.walkRules((rule) => {
    let touch = false;
    for (let p = rule.parent; p; p = p.parent) if (p.type === 'atrule' && /^media$/i.test(p.name) && touchMedia(p.params)) touch = true;
    const props = new Set();
    let hides = false;
    for (const n of rule.nodes ?? []) {
      if (n.type !== 'decl' || !REVEAL_PROPS.test(n.prop)) continue;
      props.add(n.prop.toLowerCase());
      if (/^display$/i.test(n.prop) && /^none$/i.test(n.value.trim())) hides = true;
    }
    rules.push({ rule, touch, props, hides, selectors: rule.selectors.map((s) => ({ text: s, parts: parseSelector(s) })) });
  });
  for (const { rule, props, selectors } of rules) {
    if (!props.size) continue;
    const listed = new Set(selectors.map((s) => serialize(s.parts)));
    for (const { text, parts } of selectors) {
      // Compounds sit at even indexes; a :hover in any but the last one has a combinator after it.
      if (!parts.some((c, i) => i % 2 === 0 && i < parts.length - 1 && compoundHolds(c, isHover))) continue;
      const base = serialize(parts, (x) => !isHover(x));
      if (base !== serialize(parts) && listed.has(base)) continue;
      const target = stateless(parts.slice(-1));
      const context = stateless(parts.slice(0, -1));
      const names = (s) => !selectorHolds(s.parts, isHover) && stateless(s.parts.slice(-1)) === target && (s.parts.length === 1 || stateless(s.parts.slice(0, -1)) === context);
      const reveals = (r) => [...r.props].some((p) => props.has(p));
      const focus = rules.some((r) => reveals(r) && r.selectors.some((s) => names(s) && selectorHolds(s.parts, isFocus)));
      const touch = rules.some((r) => r.touch && (reveals(r) || r.hides) && r.selectors.some(names));
      if (focus && touch) continue;
      report({ ruleName: HOVER_PARITY, result, node: rule, word: text, message: hoverMessages.hoverOnly(text, target) });
    }
  }
});
hoverRule.ruleName = HOVER_PARITY;
hoverRule.messages = hoverMessages;

// Raw-value bans. Values are read as postcss-value-parser nodes, never as text: a comma inside cubic-bezier(),
// steps() or var() is not a layer break, and a declaration over several lines is one value. A raw value inside a var()
// fallback counts, read in the context of its position: a fallback that is the whole value (or a whole layer) is parsed
// as a full value. Other functions (cubic-bezier, steps, url…) hold no banned value. Every CSS math function is read like
// calc(), as if its values were written bare (calc(650) is a weight, calc(1.5) a line height), with one exception: a
// bare number in a product (an additive term with * or /) that has a function operand is a factor and passes
// (calc(-1 * var(--bw)), calc(var(--fw-regular) * 1)). An additive operand (calc(var(--fw) + 100)) and a var()
// fallback inside math (calc(var(--fw, 650))) stay raw. Built-in allowances: A1 a unitless line-height of 1, A2 zero times, A3 delays (only the
// duration of each layer is read).
const MATH = new Set(['calc', 'min', 'max', 'clamp', 'round', 'mod', 'rem', 'abs', 'sign', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'pow', 'sqrt', 'hypot', 'log', 'exp', '']);
const TIME = new Set(['s', 'ms']);
const WEIGHT_WORDS = new Set(['bold', 'bolder', 'lighter']);
const SIZE_WORDS = new Set(['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'xxx-large', 'larger', 'smaller']);
const DUR_VAR = /^--([\w-]*-)?dur(-|$)/;

const isFn = (n, ...names) => n.type === 'function' && names.includes(n.value.toLowerCase());
const unitOf = (n) => {
  if (n.type !== 'word') return null;
  const u = valueParser.unit(n.value);
  return u && u.number !== '' && Number.isFinite(Number(u.number)) ? { num: Number(u.number), unit: u.unit.toLowerCase() } : null;
};
/** The nodes after a var()/env() name and its comma, or null without a fallback. */
const fallbackOf = (n) => {
  const comma = n.nodes.findIndex((x) => x.type === 'div' && x.value === ',');
  return comma >= 0 ? n.nodes.slice(comma + 1) : null;
};
const meaningful = (nodes) => nodes.filter((n) => n.type !== 'space' && n.type !== 'comment');
const isMath = (n) => n.type === 'function' && MATH.has(n.value.toLowerCase());
const isMulOp = (n) => (n.type === 'word' || n.type === 'div') && (n.value === '*' || n.value === '/');
const PRODUCT_OP = /([*/])/;
/** Outside calc(), postcss-value-parser keeps an unspaced product in one node: a word ('650*1', '*2') or a function
 * named after it ('2*var', '-1*var', '2*' for a bracket). Split each into its numbers, operators and the function
 * itself, so every number is judged on its own and a var() keeps its fallback. */
function splitProducts(nodes) {
  return nodes.flatMap((n) => {
    if ((n.type !== 'word' && n.type !== 'function') || !PRODUCT_OP.test(n.value) || (n.type === 'word' && n.value.length === 1)) return [n];
    const parts = n.value.split(PRODUCT_OP);
    const name = n.type === 'function' ? parts.pop() : null;
    const out = [];
    let at = n.sourceIndex;
    for (const p of parts) {
      if (p) out.push({ type: 'word', value: p, sourceIndex: at });
      at += p.length;
    }
    if (n.type === 'function') out.push({ ...n, value: name, sourceIndex: at });
    return out;
  });
}
/** The numbers a word carries, the pieces of an unspaced product read on their own ('650*1' is 650 and 1, not 650 with
 * the unit '*1'). */
const unitsIn = (x) => (x.type === 'word' ? splitProducts([x]).map(unitOf).filter(Boolean) : []);
/** True for a var() call, also when an unspaced factor is glued to its name ('2*var'). */
const isVarCall = (x) => x.type === 'function' && x.value.split(PRODUCT_OP).pop().toLowerCase() === 'var';
const isAddOp = (n) => n.type === 'word' && (n.value === '+' || n.value === '-');

/** Calls visit(node, number | null, unit-or-keyword, factor) for every word a value shows, var() fallbacks included. A
 * fallback reads as a value of its own, never as a factor, even inside math. */
function walkRaw(nodes, visit) {
  for (const n of nodes) {
    if (n.type === 'word') {
      const u = unitOf(n);
      visit(n, u ? u.num : null, u ? u.unit : n.value.toLowerCase(), false);
    } else if (isFn(n, 'var', 'env')) walkRaw(fallbackOf(n) ?? [], visit);
    else if (isMath(n)) walkMath(n.nodes, visit);
  }
}
/** Math content, one term at a time (terms split at + and - and between arguments): in a term with a function operand,
 * a bare number is a factor. Valid math joins a number and a function in one term only by * or /, so such a term is a
 * product. */
function walkMath(nodes, visit) {
  const breaks = (n) => isAddOp(n) || (n.type === 'div' && n.value === ',');
  const terms = splitProducts(meaningful(nodes)).reduce((acc, n) => (breaks(n) ? acc.push([]) : acc[acc.length - 1].push(n), acc), [[]]);
  for (const term of terms) {
    const product = term.some((x) => x.type === 'function');
    for (const n of term) {
      if (n.type !== 'word') walkRaw([n], visit);
      else if (!isMulOp(n)) {
        const u = unitOf(n);
        visit(n, u ? u.num : null, u ? u.unit : n.value.toLowerCase(), product && u !== null && u.unit === '');
      }
    }
  }
}
const collect = (nodes, pick) => {
  const out = [];
  walkRaw(nodes, (n, num, unit, factor) => pick(num, unit, factor) && out.push(n));
  return out;
};
const layers = (nodes) => meaningful(nodes).reduce((acc, n) => (n.type === 'div' && n.value === ',' ? acc.push([]) : acc[acc.length - 1].push(n), acc), [[]]);
/** The fallback of a var()/env() that is the whole of `nodes`, else null. */
const wholeFallback = (nodes) => {
  const top = meaningful(nodes);
  return top.length === 1 && isFn(top[0], 'var', 'env') ? fallbackOf(top[0]) : null;
};

// A factor (a bare number multiplying a function operand) is never raw.
const isWeight = (num, unit, factor) => (num !== null && unit === '' && !factor) || (num === null && WEIGHT_WORDS.has(unit));
// A1: a unitless 1 is the line box of a glyph or control label. Any other number or length is raw.
const isRawLineHeight = (num, unit, factor) => num !== null && !factor && !(unit === '' && num === 1);
const isRawLength = (num, unit, factor) => num !== null && num !== 0 && !factor;
const isRawTime = (num, unit) => num !== null && TIME.has(unit) && num !== 0; // A2: zero times pass

/** A node in the font shorthand's size position: a length, percentage, unitless 0, size keyword, math with a dimension,
 * or a var() whose fallback is one of those (font: var(--font-size, 0) Arial). */
function isFontSize(n) {
  if (isFn(n, 'var', 'env')) {
    const fb = meaningful(fallbackOf(n) ?? []);
    return fb.length > 0 && isFontSize(fb[0]);
  }
  if (n.type === 'function') {
    if (!MATH.has(n.value.toLowerCase())) return false;
    let dim = false;
    valueParser.walk(n.nodes, (x) => {
      if (unitsIn(x).some((u) => u.unit !== '')) dim = true;
    });
    return dim;
  }
  const u = unitOf(n);
  if (u) return u.unit !== '' || u.num === 0;
  return n.type === 'word' && SIZE_WORDS.has(n.value.toLowerCase());
}
/** The font shorthand's parts: the nodes before the size (where the weight is) and the line height after "/". A
 * var() that is the whole value is read as a shorthand through its fallback. */
function fontParts(nodes) {
  const inner = wholeFallback(nodes);
  if (inner) return fontParts(inner);
  const top = meaningful(nodes);
  const slash = top.findIndex((n) => n.type === 'div' && n.value === '/');
  const size = slash > 0 ? slash - 1 : top.findIndex(isFontSize);
  return { beforeSize: size >= 0 ? top.slice(0, size) : top, lineHeight: slash >= 0 && top[slash + 1] ? [top[slash + 1]] : [] };
}
/** A slot of a transition/animation layer that holds a time: a time word, or a function with a time or a duration token in it. */
function holdsTime(n) {
  let hit = false;
  valueParser.walk([n], (x) => {
    if (unitsIn(x).some((u) => TIME.has(u.unit))) hit = true;
    if (isVarCall(x) && DUR_VAR.test(x.nodes[0]?.value ?? '')) hit = true;
  });
  return hit;
}
/** The raw durations of transition/animation: per layer the first time slot (A3). A var() in that slot, a whole layer or
 * a duration alone, is read through its fallback by the same rule, so a delay inside a fallback never counts. */
function durationHits(nodes) {
  return layers(nodes).flatMap((layer) => {
    const first = layer.find(holdsTime);
    if (!first) return [];
    if (isFn(first, 'var', 'env')) return durationHits(fallbackOf(first) ?? []);
    return collect([first], isRawTime);
  });
}

const RAW_BANS = [
  ['hub/no-raw-font-weight', 'a font weight', '--fw-*', (prop, nodes) => {
    if (prop === 'font-weight') return collect(nodes, isWeight);
    if (prop === 'font') return collect(fontParts(nodes).beforeSize, isWeight);
    return [];
  }],
  ['hub/no-raw-line-height', 'a line height', '--lh-*', (prop, nodes) => {
    if (prop === 'line-height') return collect(nodes, isRawLineHeight);
    if (prop === 'font') return collect(fontParts(nodes).lineHeight, isRawLineHeight);
    return [];
  }],
  ['hub/no-raw-letter-spacing', 'a letter spacing', '--tracking-*', (prop, nodes) => (prop === 'letter-spacing' ? collect(nodes, isRawLength) : [])],
  ['hub/no-raw-duration', 'a duration', '--dur-* role', (prop, nodes) => {
    if (prop === 'transition-duration' || prop === 'animation-duration') return collect(nodes, isRawTime);
    return prop === 'transition' || prop === 'animation' ? durationHits(nodes) : [];
  }],
  ['hub/no-raw-shadow', 'a shadow length', '--bw, --bw-2, --sh-* or --focus-ring*', (prop, nodes) => (prop === 'box-shadow' ? collect(nodes, isRawLength) : [])],
];
const rawRules = RAW_BANS.map(([name, what, token, find]) => {
  const messages = ruleMessages(name, {
    raw: (value, prop) => `"${value}" in ${prop} is ${what} written raw. Use a token from hub/src/kit/tokens.css (${token}).`,
  });
  const rule = createPlugin(name, (on) => (root, result) => {
    if (!on) return;
    root.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      const raw = decl.raws.value?.raw ?? decl.value;
      const hits = find(prop, valueParser(raw).nodes);
      if (!hits.length) return;
      const at = decl.prop.length + (decl.raws.between ?? '').length;
      for (const n of hits)
        report({ ruleName: name, result, node: decl, index: at + n.sourceIndex, endIndex: at + n.sourceIndex + n.value.length, message: messages.raw(n.value, prop) });
    });
  });
  rule.ruleName = name;
  rule.messages = messages;
  return rule;
});

// hub/control-size-token: a kit control's height or width comes from a size token, never a
// raw length or a spacing step. In scope: the size properties below, on a rule (nested selectors resolved, at-rules looked
// through) whose selector's last compound (after the final combinator, no pseudo-element) is itself interactive: a
// button/input/select/textarea tag, a state attribute or pseudo, a control role, a class that starts with "button", or a class
// the same file styles in a state or under one (a part). :is()/:where() count by their arguments' last compounds; :has() and
// :not() never count. A class that only marks a control another way (.textarea beside .input) is out of its reach. A hit is a
// non-zero length literal (not % or fr) or a var() of the spacing scale (--sp-*); every other var() is a size token the
// component owns. Today's hits are frozen in scripts/lint/control-size.debt.cjs, which only shrinks: a row skips one
// declaration with its exact file, at-rules, selector, property and value, and app/conformance.controlsize.test.ts fails a row
// that hits nothing or that its FROZEN list does not hold.
const CONTROL_SIZE = 'hub/control-size-token';
const controlSizeMessages = ruleMessages(CONTROL_SIZE, {
  raw: (value, prop) =>
    `"${value}" in ${prop} sizes a control raw. Use a size token (--ctl-h-*, --tb-ctl-h, --touch-min, --icon-hit, or the component's own) from hub/src/kit/tokens.css.`,
});
const SIZE_PROPS = new Set(['height', 'min-height', 'block-size', 'min-block-size', 'width', 'min-width', 'inline-size', 'min-inline-size']);
const LENGTH_UNITS = new Set(['px', 'rem', 'em', 'ch', 'ex', 'lh', 'rlh', 'vw', 'vh', 'vi', 'vb', 'vmin', 'vmax', 'svh', 'lvh', 'dvh', 'svw', 'lvw', 'dvw', 'cqw', 'cqh', 'cqi', 'cqb', 'cm', 'mm', 'q', 'in', 'pt', 'pc']);
const CONTROL_TAG = /^(button|input|select|textarea)$/i;
const STATE_ATTR = /^\[\s*data-(hovered|pressed|focus-visible|focused|disabled|selected|pending)\b/i;
const CONTROL_ROLE = /^\[\s*role\s*=\s*["']?(button|radio|tab|switch|checkbox|option|menuitem[\w-]*|spinbutton|slider)["']?\s*\]$/i;
const STATE_PSEUDO = new Set(['hover', 'focus-visible', 'active', 'disabled']);
const SP_VAR = /^--sp-/;
const isStateSimple = (x) => (x.pseudo !== null ? STATE_PSEUDO.has(x.pseudo) && x.arg === null : STATE_ATTR.test(x.text) || CONTROL_ROLE.test(x.text));
const classOf = (x) => (x.pseudo === null && x.text.startsWith('.') ? x.text.slice(1) : null);
/** The part of a CSS file path after its last "/hub/src/" (the debt rows' file key), or the whole path. */
const srcRel = (file) => {
  const p = String(file ?? '').replace(/\\/g, '/');
  const i = p.lastIndexOf('/hub/src/');
  return i >= 0 ? p.slice(i + '/hub/src/'.length) : p;
};
const squash = (s) => s.replace(/\s+/g, ' ').trim();
const lastCompound = (sel) => [...parseSelector(sel)].reverse().find(isCompound);
/** Whether a compound's own element holds a simple that `is` matches: on the compound itself, or in the last compound of an
 *  :is()/:where() argument. :has() and :not() speak of other elements, and an :is() argument's earlier compounds of its
 *  ancestors, so none of them makes the sized element a control. */
const subjectHolds = (compound, is) =>
  compound.some((x) => is(x) || ((x.pseudo === 'is' || x.pseudo === 'where') && x.arg !== null && splitList(x.arg).some((s) => {
    const last = lastCompound(s);
    return last !== undefined && subjectHolds(last, is);
  })));
/** A rule's selectors as written at the top level: a nested rule's `&` reads its parent, and one without `&` sits under it. */
function resolvedSelectors(rule) {
  const own = splitList(rule.selector);
  let up = rule.parent;
  while (up && up.type !== 'rule' && up.type !== 'root') up = up.parent;
  if (!up || up.type !== 'rule') return own;
  return resolvedSelectors(up).flatMap((p) => own.map((s) => (s.includes('&') ? s.replaceAll('&', `:is(${p})`) : `${p} ${s}`)));
}
/** The rule that owns a declaration (through any at-rules between them), or null. */
function ownerRule(decl) {
  let up = decl.parent;
  while (up && up.type !== 'rule' && up.type !== 'root') up = up.parent;
  return up?.type === 'rule' ? up : null;
}
/** The at-rules around a declaration, outermost first ('@media (pointer: coarse)'), or ''. */
function atContext(decl) {
  const out = [];
  for (let up = decl.parent; up && up.type !== 'root'; up = up.parent) if (up.type === 'atrule') out.unshift(squash(`@${up.name} ${up.params}`));
  return out.join(' ');
}
/** A debt row's key for a declaration: file, at-rules, resolved selector, property and value, whitespace squashed. */
export function controlSizeKey(file, decl) {
  const rule = ownerRule(decl);
  return [srcRel(file), atContext(decl), squash(rule ? resolvedSelectors(rule).join(', ') : ''), decl.prop.toLowerCase(), squash(decl.value)].join('|');
}
/** The classes of a compound's own element, :is()/:where() arguments' last compounds included. */
const subjectClasses = (compound) =>
  compound.flatMap((x) => (classOf(x) ? [classOf(x)] : (x.pseudo === 'is' || x.pseudo === 'where') && x.arg !== null ? splitList(x.arg).flatMap((s) => subjectClasses(lastCompound(s) ?? [])) : []));
/** The classes a file styles in a state: in a selector that holds a state on its own element, each class of the first
 *  compound that does (the control) and of every compound after it (its parts: .switch[data-selected] .track names both). */
function stateClasses(root) {
  const out = new Set();
  root.walkRules((rule) => {
    for (const sel of resolvedSelectors(rule)) {
      const parts = parseSelector(sel).filter(isCompound);
      const at = parts.findIndex((c) => subjectHolds(c, isStateSimple));
      if (at >= 0) for (const c of parts.slice(at)) for (const name of subjectClasses(c)) out.add(name);
    }
  });
  return out;
}
/** Whether one selector of a list is a control: its last compound, with no pseudo-element, holds a control simple. */
function controlSelector(sel, classes) {
  const last = lastCompound(sel);
  if (!last || last.some((x) => x.text.startsWith('::'))) return false;
  const is = (x) => isStateSimple(x) || (x.pseudo === null && CONTROL_TAG.test(x.text)) || (classOf(x) !== null && (classOf(x).startsWith('button') || classes.has(classOf(x))));
  return subjectHolds(last, is);
}
/** The raw sizes of a value: non-zero length literals (var() fallbacks included) and var(--sp-*) calls. */
function sizeHits(nodes) {
  const out = collect(nodes, (num, unit, factor) => num !== null && num !== 0 && !factor && LENGTH_UNITS.has(unit));
  valueParser.walk(nodes, (n) => {
    if (isVarCall(n) && SP_VAR.test(n.nodes[0]?.value ?? '')) out.push(n);
  });
  return out;
}
let controlDebt = null;
/** The frozen debt rows: how many declarations each key may cover (file|at-rules|selector|prop|value, whitespace squashed). */
function debtCounts() {
  if (!controlDebt) {
    controlDebt = new Map();
    for (const r of createRequire(import.meta.url)('./control-size.debt.cjs').ROWS) {
      const key = [r.file, squash(r.at ?? ''), squash(r.selector), r.prop, squash(r.value)].join('|');
      controlDebt.set(key, (controlDebt.get(key) ?? 0) + 1);
    }
  }
  return controlDebt;
}
/** Options: `{ debt: false }` reports the rows too (the ratchet test reads every hit that way). */
const controlSizeRule = createPlugin(CONTROL_SIZE, (on, options) => (root, result) => {
  if (!on) return;
  const useDebt = options?.debt !== false;
  const file = root.source?.input?.file;
  const classes = stateClasses(root);
  const spent = new Map();
  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    const rule = SIZE_PROPS.has(prop) ? ownerRule(decl) : null;
    if (!rule) return;
    if (!resolvedSelectors(rule).some((s) => controlSelector(s.trim(), classes))) return;
    const raw = decl.raws.value?.raw ?? decl.value;
    const hits = sizeHits(valueParser(raw).nodes);
    if (!hits.length) return;
    if (useDebt) {
      // A row covers one declaration: the same key again, in the same place or a new one, is a new raw size.
      const key = controlSizeKey(file, decl);
      const used = spent.get(key) ?? 0;
      if (used < (debtCounts().get(key) ?? 0)) {
        spent.set(key, used + 1);
        return;
      }
    }
    // One report per declaration (a debt row is one declaration), placed on its first raw size.
    const first = hits.reduce((a, b) => (b.sourceIndex < a.sourceIndex ? b : a));
    const text = first.type === 'function' ? valueParser.stringify(first) : first.value;
    const at = decl.prop.length + (decl.raws.between ?? '').length + first.sourceIndex;
    report({ ruleName: CONTROL_SIZE, result, node: decl, index: at, endIndex: at + text.length, message: controlSizeMessages.raw(text, prop) });
  });
});
controlSizeRule.ruleName = CONTROL_SIZE;
controlSizeRule.messages = controlSizeMessages;

// hub/focus-ring-token: kit focus has one shape, the --focus-ring box-shadow (--focus-ring-inset
// where a strip clips). An `outline` or `outline-color` whose value names a focus token (--hx-focus*, --focus-ring*, --ring-*)
// is an error outside `@media (forced-colors: active)`, which drops shadows and so draws focus as an outline (in a system
// colour). base.css's global default ring is the one other outline (turned off for it in stylelint.config.mjs). Today's
// outlines that are no focus ring (a drop target's mark) or that the rule leaves are frozen in scripts/lint/focus-ring.debt.cjs,
// keyed as the control-size debt (file|at-rules|selector|property|value), shrink-only (app/conformance.focusring.test.ts).
const FOCUS_RING = 'hub/focus-ring-token';
const focusRingMessages = ruleMessages(FOCUS_RING, {
  outline: (prop) =>
    `${prop} draws focus in the focus colour. Use box-shadow: var(--focus-ring) (var(--focus-ring-inset) where the strip clips); an outline only under @media (forced-colors: active).`,
});
const OUTLINE_PROPS = new Set(['outline', 'outline-color']);
/** Whether a media query list holds only in forced colours: every comma-separated query requires (forced-colors: active)
 *  as one of its `and` terms, and none is negated (`not ...`, or `only` aside). `(forced-colors: active), (width >= 1px)`
 *  and `not (forced-colors: active)` both match outside forced colours, so neither counts. */
const forcedOnly = (params) => {
  const queries = [];
  let depth = 0;
  let cur = '';
  for (const ch of params) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      queries.push(cur);
      cur = '';
    } else cur += ch;
  }
  queries.push(cur);
  return queries.every((q) => {
    const t = q.trim().toLowerCase();
    if (/^not\b/.test(t) || /\bor\b/.test(t)) return false;
    return t.replace(/^only\s+/, '').split(/\s+and\s+/).some((term) => /^\(\s*forced-colors\s*:\s*active\s*\)$/.test(term.trim()));
  });
};
/** Whether a declaration sits inside a media query that holds only in forced colours (at any depth). */
const inForcedColors = (decl) => {
  for (let up = decl.parent; up && up.type !== 'root'; up = up.parent)
    if (up.type === 'atrule' && up.name.toLowerCase() === 'media' && forcedOnly(up.params)) return true;
  return false;
};
let focusDebt = null;
function focusDebtCounts() {
  if (!focusDebt) {
    focusDebt = new Map();
    for (const r of createRequire(import.meta.url)('./focus-ring.debt.cjs').ROWS) {
      const key = [r.file, squash(r.at ?? ''), squash(r.selector), r.prop, squash(r.value)].join('|');
      focusDebt.set(key, (focusDebt.get(key) ?? 0) + 1);
    }
  }
  return focusDebt;
}
/** Options: `{ debt: false }` reports the rows too (the ratchet test reads every hit that way). */
const focusRingRule = createPlugin(FOCUS_RING, (on, options) => (root, result) => {
  if (!on) return;
  const useDebt = options?.debt !== false;
  const file = root.source?.input?.file;
  const spent = new Map();
  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    if (!OUTLINE_PROPS.has(prop) || inForcedColors(decl)) return;
    let hit = false;
    valueParser.walk(valueParser(decl.raws.value?.raw ?? decl.value).nodes, (n) => {
      if (isVarCall(n) && FOCUS.test(n.nodes[0]?.value ?? '')) hit = true;
    });
    if (!hit) return;
    if (useDebt) {
      const key = controlSizeKey(file, decl);
      const used = spent.get(key) ?? 0;
      if (used < (focusDebtCounts().get(key) ?? 0)) {
        spent.set(key, used + 1);
        return;
      }
    }
    report({ ruleName: FOCUS_RING, result, node: decl, message: focusRingMessages.outline(prop) });
  });
});
focusRingRule.ruleName = FOCUS_RING;
focusRingRule.messages = focusRingMessages;

export default [blueRule, dashedRule, tokenRule, anatomyCssRule, hoverRule, ...rawRules, controlSizeRule, focusRingRule];
