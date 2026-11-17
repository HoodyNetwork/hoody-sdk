// Syntax colour for CodeBlock (json, js/ts, yaml, http, python, diff; terminal output at the end): a small reading
// that cuts a text into tokens, each with a kind for colour. The shell reading is shellTokens in Ids.tsx instead.
// Colour only: the tokens always join back to exactly the text, and CodeBlock renders them as React text inside
// spans, never as markup (a text holding `<img …>` shows those characters). A wrong reading can only miscolour.

export const HL_LANGS = ['json', 'js', 'ts', 'yaml', 'http', 'python', 'diff'] as const;
export type HlLang = (typeof HL_LANGS)[number];

/** kw keyword or type word · str string · num number · lit true/false/null and the like · com comment · key an object
 *  key, YAML key or HTTP header name · fn a called or defined name · meta an HTTP version, a decorator, a diff hunk line ·
 *  ins / del an added / removed diff line · punct and text are not coloured. */
export type HlKind = 'kw' | 'str' | 'num' | 'lit' | 'com' | 'key' | 'fn' | 'meta' | 'ins' | 'del' | 'punct' | 'text';

export interface HlToken {
  kind: HlKind;
  text: string;
}

/** Longer texts are not read (no colour): the reading stays quick on a large output. */
export const HL_MAX = 100_000;

type Kind = HlKind | ((m: string, src: string, end: number, out: readonly HlToken[]) => HlKind);
/** A rule: its kind, a sticky pattern, and when it may start at `i` (default: anywhere). */
type Rule = readonly [Kind, RegExp, ((src: string, i: number) => boolean)?];

function push(out: HlToken[], kind: HlKind, text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.kind === kind && (kind === 'text' || kind === 'punct')) last.text += text;
  else out.push({ kind, text });
}

function lex(src: string, rules: readonly Rule[], out: HlToken[] = []): HlToken[] {
  let i = 0;
  outer: while (i < src.length) {
    for (const [kind, re, when] of rules) {
      if (when && !when(src, i)) continue;
      re.lastIndex = i;
      const m = re.exec(src);
      if (m && m[0].length > 0) {
        push(out, typeof kind === 'function' ? kind(m[0], src, i + m[0].length, out) : kind, m[0]);
        i += m[0].length;
        continue outer;
      }
    }
    push(out, 'text', src[i]!);
    i++;
  }
  return out;
}

/** The token before the white space that ends `out`. Only a short white-space token is looked through: a text token
 *  grows by merging, and testing a long one at every word would make the reading quadratic. */
function lastWord(out: readonly HlToken[]): HlToken | undefined {
  const last = out[out.length - 1];
  if (last && last.kind === 'text' && last.text.length <= 64 && /^\s+$/.test(last.text)) return out[out.length - 2];
  return last;
}

const SPACE: Rule = ['text', /\s+/y];
const DQ = /"(?:[^"\\\n]|\\.)*"?/y;
const FOLLOWED_BY_COLON = /\s*:/y;
const FOLLOWED_BY_PAREN = /\s*\(/y;
const at = (re: RegExp, src: string, end: number) => ((re.lastIndex = end), re.test(src));

// JSON: a string followed by `:` is a key.
const JSON_RULES: readonly Rule[] = [
  SPACE,
  [(_m, src, end) => (at(FOLLOWED_BY_COLON, src, end) ? 'key' : 'str'), DQ],
  ['num', /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y],
  ['lit', /(?:true|false|null)(?![\w$])/y],
  ['punct', /[{}[\],:]/y],
];

const JS_KW = new Set(
  ('async await break case catch class const continue debugger default delete do else export extends finally for from ' +
    'function get if import in instanceof let new of return set static super switch this throw try typeof var void while ' +
    'with yield as declare enum implements interface keyof namespace private protected public readonly satisfies type ' +
    'any bigint boolean never number object string symbol unknown').split(' '),
);
const JS_LIT = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);
const JS_RULES: readonly Rule[] = [
  SPACE,
  ['com', /\/\/[^\n]*/y],
  ['com', /\/\*[\s\S]*?(?:\*\/|$)/y],
  ['str', /'(?:[^'\\\n]|\\.)*'?/y],
  ['str', DQ],
  ['str', /`(?:[^`\\]|\\[\s\S])*`?/y],
  [(m, src, end) => (JS_KW.has(m) ? 'kw' : JS_LIT.has(m) ? 'lit' : at(FOLLOWED_BY_PAREN, src, end) ? 'fn' : 'text'), /[A-Za-z_$][\w$]*/y],
  ['num', /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)n?(?![\w$])/y],
  // A digit run that is not a number (`9a`) is taken whole as text, so the number rule never retries each of its digits.
  ['text', /\d[\w$]*/y],
  ['punct', /[{}()[\];,.:?=<>+\-*/%!&|^~@#]/y],
];

// YAML: read by position. A key starts a line (after its indent and any `- `); a value starts after `: `, `- `, `[`,
// `{` or `,`; a `#` starts a comment only at a line start or after white space.
// The look-back stops after 200 characters (an indent that long is not read as a line start): searching further back
// at every position would make the reading quadratic.
function yamlLineStart(src: string, i: number): boolean {
  for (let j = i - 1, n = 0; n < 200; j--, n++) {
    if (j < 0) return true;
    const c = src[j];
    if (c === '\n') return true;
    if (c !== ' ' && c !== '\t' && c !== '-') return false;
  }
  return false;
}
function yamlValueStart(src: string, i: number): boolean {
  let j = i - 1;
  while (j >= 0 && (src[j] === ' ' || src[j] === '\t')) j--;
  if (j < 0 || '[{,\n'.includes(src[j]!)) return true;
  // `: ` and `- ` need their space: `web:1.4` and `a-1` are one plain word.
  return ':-'.includes(src[j]!) && j < i - 1;
}
const yamlCommentStart = (src: string, i: number) => i === 0 || /\s/.test(src[i - 1]!);
const YAML_END = String.raw`(?=[ \t]*(?:#|\n|$|,|\]|\}))`;
const YAML_RULES: readonly Rule[] = [
  SPACE,
  ['com', /#[^\n]*/y, yamlCommentStart],
  ['punct', /---|\.\.\./y, yamlLineStart],
  ['key', /(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\n]|'')*'|[^\s#:\-"'[\]{},][^\n:#]{0,200}?)(?=[ \t]*:(?:[ \t\n]|$))/y, yamlLineStart],
  ['str', DQ],
  ['str', /'(?:[^'\n]|'')*'?/y],
  ['num', new RegExp(String.raw`-?(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)` + YAML_END, 'y'), yamlValueStart],
  ['lit', new RegExp(String.raw`(?:true|false|null|True|False|Null|TRUE|FALSE|NULL|yes|no|on|off|~)` + YAML_END, 'y'), yamlValueStart],
  ['punct', /[:\-[\]{},|>&*!]/y],
  ['text', /[^\s#:\-[\]{},]+/y],
];

const PY_KW = new Set(
  ('and as assert async await break class continue def del elif else except finally for from global if import in is ' +
    'lambda match case nonlocal not or pass raise return try while with yield self cls int str float bool bytes list ' +
    'dict set tuple object').split(' '),
);
const PY_LIT = new Set(['True', 'False', 'None']);
const PY_RULES: readonly Rule[] = [
  SPACE,
  ['com', /#[^\n]*/y],
  ['str', /(?:[rRbBuUfF]{1,2})?(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)/y],
  ['meta', /@[A-Za-z_][\w.]*/y, yamlLineStart],
  [
    (m, src, end, out) => {
      const prev = lastWord(out);
      if (prev && prev.kind === 'kw' && (prev.text === 'def' || prev.text === 'class')) return 'fn';
      return PY_KW.has(m) ? 'kw' : PY_LIT.has(m) ? 'lit' : at(FOLLOWED_BY_PAREN, src, end) ? 'fn' : 'text';
    },
    /[A-Za-z_]\w*/y,
  ],
  ['num', /(?:0[xXoObB][\da-fA-F_]+|\d[\d_]*(?:\.\d*)?(?:[eE][+-]?\d+)?j?)(?!\w)/y],
  ['text', /\d\w*/y],
  ['punct', /[{}()[\];,.:=<>+\-*/%!&|^~@]/y],
];

// HTTP: the request or status line, header lines up to the first empty line, then the body (JSON when it looks like
// JSON, plain otherwise).
const HTTP_REQ = /^([A-Z]+)( +)(\S*)( +HTTP\/[\d.]+)?/;
const HTTP_STATUS = /^(HTTP\/[\d.]+)( +)(\d{3})?/;
const HTTP_HEADER = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+)(:)/;
function httpTokens(src: string): HlToken[] {
  const out: HlToken[] = [];
  const blank = /\r?\n\r?\n/.exec(src);
  const head = blank ? src.slice(0, blank.index) : src;
  const lines = head.split('\n');
  lines.forEach((line, n) => {
    if (n > 0) push(out, 'text', '\n');
    let m: RegExpExecArray | null;
    if (n === 0 && (m = HTTP_STATUS.exec(line))) {
      push(out, 'meta', m[1]!);
      push(out, 'text', m[2]!);
      if (m[3]) push(out, 'num', m[3]);
      push(out, 'text', line.slice(m[0].length));
    } else if (n === 0 && (m = HTTP_REQ.exec(line))) {
      push(out, 'kw', m[1]!);
      push(out, 'text', m[2]! + m[3]!);
      if (m[4]) {
        const sp = /^ +/.exec(m[4])![0];
        push(out, 'text', sp);
        push(out, 'meta', m[4].slice(sp.length));
      }
      push(out, 'text', line.slice(m[0].length));
    } else if (n > 0 && (m = HTTP_HEADER.exec(line))) {
      push(out, 'key', m[1]!);
      push(out, 'punct', m[2]!);
      push(out, 'text', line.slice(m[0].length));
    } else push(out, 'text', line);
  });
  if (blank) {
    push(out, 'text', blank[0]);
    const body = src.slice(blank.index + blank[0].length);
    if (/^\s*[{[]/.test(body)) lex(body, JSON_RULES, out);
    else push(out, 'text', body);
  }
  return out;
}

// Diff (unified): `@@ -a,b +c,d @@` opens a hunk whose counts say how many old and new lines follow, so inside it a
// line starting `---` or `+++` is removed or added text, and past it they are file headers again. A hunk line without
// counts (models often write a bare `@@`) runs until a `diff …` line. Each line is one token, read once.
const HUNK = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;
const DIFF_HEAD = /^(?:diff |index |--- |\+\+\+ |---$|\+\+\+$|new file mode |deleted file mode |similarity index |rename (?:from|to) |old mode |new mode |Binary files )/;

function diffTokens(src: string): HlToken[] {
  const out: HlToken[] = [];
  let oldLeft = 0;
  let newLeft = 0;
  src.split('\n').forEach((line, n) => {
    if (n > 0) push(out, 'text', '\n');
    // Read the line without one ending \r (CRLF text), but emit it whole.
    const l = line.endsWith('\r') ? line.slice(0, -1) : line;
    const c = l[0];
    const inHunk = oldLeft > 0 || newLeft > 0;
    if (l.startsWith('diff ')) {
      oldLeft = newLeft = 0;
      push(out, 'com', line);
    } else if (inHunk && c === '-' && oldLeft > 0) {
      oldLeft--;
      push(out, 'del', line);
    } else if (inHunk && c === '+' && newLeft > 0) {
      newLeft--;
      push(out, 'ins', line);
    } else if (inHunk && (c === ' ' || l === '')) {
      oldLeft--;
      newLeft--;
      push(out, 'text', line);
    } else if (c === '\\') push(out, 'com', line);
    else if (l.startsWith('@@')) {
      const m = HUNK.exec(l);
      const close = l.indexOf('@@', 2);
      const end = m ? m[0].length : close > 0 ? close + 2 : l.length;
      oldLeft = m ? Number(m[1] ?? 1) : Infinity;
      newLeft = m ? Number(m[2] ?? 1) : Infinity;
      push(out, 'meta', line.slice(0, end));
      push(out, 'text', line.slice(end));
    } else if (DIFF_HEAD.test(l)) push(out, 'com', line);
    else if (c === '-') push(out, 'del', line);
    else if (c === '+') push(out, 'ins', line);
    else push(out, 'text', line);
  });
  return out;
}

/** The tokens of `src` read as `lang`; they always join back to exactly `src`. */
export function highlight(src: string, lang: HlLang): HlToken[] {
  if (!src) return [];
  if (src.length > HL_MAX) return [{ kind: 'text', text: src }];
  switch (lang) {
    case 'json':
      return lex(src, JSON_RULES);
    case 'js':
    case 'ts':
      return lex(src, JS_RULES);
    case 'yaml':
      return lex(src, YAML_RULES);
    case 'python':
      return lex(src, PY_RULES);
    case 'http':
      return httpTokens(src);
    case 'diff':
      return diffTokens(src);
  }
}

/** The tokens of `src` per line (split at every newline, which is dropped): a string or comment that spans lines
 *  keeps its kind on each line. */
export function highlightLines(src: string, lang: HlLang): HlToken[][] {
  const lines: HlToken[][] = [[]];
  for (const t of highlight(src, lang)) {
    const parts = t.text.split('\n');
    parts.forEach((p, j) => {
      if (j > 0) lines.push([]);
      if (p) lines[lines.length - 1]!.push({ kind: t.kind, text: p });
    });
  }
  return lines;
}

// JSON shown formatted (SecretField `json`). The formatted text is NOT
// JSON.stringify(JSON.parse(src)), which would change big numbers, drop duplicate keys and rewrite escapes: it re-indents
// the json reading's own tokens, so every string, number and literal is the source's text, and the source with the
// white space outside strings removed equals the formatted text with the same removed. The output is bounded before
// anything is built: measure walks the tokens once (linear in the input, which is at most HL_MAX) and a container deeper
// than PRETTY_MAX_DEPTH, or a formatted text longer than PRETTY_MAX_LEN, is refused before emit runs.

/** A container nested deeper than this is not formatted (the indentation would grow with the square of the depth). */
export const PRETTY_MAX_DEPTH = 64;
/** A formatted text longer than this (1 MiB) is not built. */
export const PRETTY_MAX_LEN = 1_048_576;

/** One piece of the formatter's walk: a punctuation character, or a value token (string, key, number, literal). */
type JsonAtom = string | HlToken;

/** The json reading's tokens as atoms: white space dropped, merged punctuation ('},{', ':{},') cut into characters. */
function jsonAtoms(tokens: readonly HlToken[]): JsonAtom[] {
  const atoms: JsonAtom[] = [];
  for (const t of tokens) {
    if (t.kind === 'text') continue;
    if (t.kind === 'punct') for (const c of t.text) atoms.push(c);
    else atoms.push(t);
  }
  return atoms;
}

const OPENS: Readonly<Record<string, string>> = { '{': '}', '[': ']' };
const isClose = (a: JsonAtom | undefined): boolean => a === '}' || a === ']';

/** One walk, shared by measure and emit: `put` gets every piece of the formatted text in order. */
function walkJson(atoms: readonly JsonAtom[], put: (kind: HlKind, text: string | null, indent: number) => void): number {
  let depth = 0;
  let deepest = 0;
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i]!;
    if (typeof a !== 'string') {
      put(a.kind, a.text, -1);
      continue;
    }
    const close = OPENS[a];
    if (close !== undefined) {
      if (atoms[i + 1] === close) {
        // An empty container stays `{}` or `[]` (it still counts as a level of nesting).
        put('punct', a + close, -1);
        deepest = Math.max(deepest, depth + 1);
        i++;
        continue;
      }
      depth++;
      deepest = Math.max(deepest, depth);
      put('punct', a, -1);
      put('text', null, depth);
    } else if (isClose(a)) {
      depth = Math.max(0, depth - 1);
      put('text', null, depth);
      put('punct', a, -1);
    } else if (a === ',') {
      put('punct', a, -1);
      put('text', null, depth);
    } else if (a === ':') {
      put('punct', a, -1);
      put('text', ' ', -1);
    } else {
      put('punct', a, -1);
    }
  }
  return deepest;
}

/** The formatted text's exact length and deepest nesting, without building it. A line break costs 1 + 2 × depth. */
function measureJson(atoms: readonly JsonAtom[]): { depth: number; length: number } {
  let length = 0;
  const depth = walkJson(atoms, (_k, text, indent) => {
    length += text === null ? 1 + 2 * indent : text.length;
  });
  return { depth, length };
}

/** The formatted tokens (call only after measureJson accepted the size). */
function emitJson(atoms: readonly JsonAtom[]): HlToken[] {
  const out: HlToken[] = [];
  walkJson(atoms, (kind, text, indent) => push(out, kind, text === null ? `\n${'  '.repeat(indent)}` : text));
  return out;
}

/** The formatter's two steps, as an object so a test can watch that a refused measure never reaches emit. */
export const prettyJson = { measure: measureJson, emit: emitJson };

/** The formatted tokens of a JSON object or array, or null: not a JSON object or array, longer than HL_MAX, nested
 *  deeper than PRETTY_MAX_DEPTH, or a formatted text longer than PRETTY_MAX_LEN. */
export function prettyJsonTokens(src: string): HlToken[] | null {
  const v = jsonView(src);
  return v.kind === 'json' ? v.tokens : null;
}

/**
 * How SecretField `json` shows a value. `plain`: not a JSON object or array (a scalar or invalid JSON stays plain text,
 * no guessing). `tooLong`: it starts like one but is longer than HL_MAX (never parsed). `tooBig`: valid, but nested
 * deeper than PRETTY_MAX_DEPTH or its formatted text would pass PRETTY_MAX_LEN. `json`: the formatted tokens and text.
 */
export type JsonView = { kind: 'plain' } | { kind: 'tooLong' } | { kind: 'tooBig' } | { kind: 'json'; tokens: HlToken[]; text: string };

export function jsonView(src: string): JsonView {
  const head = src.trimStart()[0];
  if (head !== '{' && head !== '[') return { kind: 'plain' };
  if (src.length > HL_MAX) return { kind: 'tooLong' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(src);
  } catch {
    return { kind: 'plain' };
  }
  if (parsed === null || typeof parsed !== 'object') return { kind: 'plain' };
  const atoms = jsonAtoms(highlight(src, 'json'));
  const m = prettyJson.measure(atoms);
  if (m.depth > PRETTY_MAX_DEPTH || m.length > PRETTY_MAX_LEN) return { kind: 'tooBig' };
  const tokens = prettyJson.emit(atoms);
  return { kind: 'json', tokens, text: tokens.map((t) => t.text).join('') };
}

// Terminal output (CodeBlock lang 'ansi'). Untrusted text: every escape, control character, bidi mark and BOM is removed,
// with the same reading as the Computers command box's cleanText (pages/computers/cmd-logic.ts); line breaks become \n.
// Only SGR 0 (reset), 1 (bold), 30-37 and 90-97 (colour) change the look; nothing of the output is ever markup.
// An OSC, DCS, SOS, PM or APC string ends at its terminator; without one it ends at the next escape or string
// introducer (a terminal cancels it there) or at the end. Its body never holds an introducer, so no start rescans the
// text after it: linear.
const RE_OSC = /(?:\x1b[\]PX^_]|[\x90\x98\x9d\x9e\x9f])[^\x07\x1b\x9c\x90\x98\x9d\x9e\x9f]*(?:\x07|\x1b\\|\x9c|(?=[\x1b\x90\x98\x9d\x9e\x9f])|$)/g;
const RE_CSI = /(?:\x1b\[|\x9b)([0-?]*)[ -/]*(?:([@-~])|$)/g;
const RE_ESC2 = /\x1b[()*+\-./][ -~]?|\x1b[ -/]*[0-~]?/g;
const RE_LINES = /\r\n|\r|\u2028|\u2029/g;
// Every control but CR and LF, which the line reading below takes on the joined text.
const RE_CTRL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff\ufff9-\ufffb]/g;

/** The eight terminal colours; the bright ones (90-97) read as the same colour. */
export const ANSI_COLOURS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'] as const;
export type AnsiColour = (typeof ANSI_COLOURS)[number];

/** A piece of terminal output as shown: text with no control in it, and its look. */
export interface AnsiToken {
  text: string;
  fg?: AnsiColour;
  bold?: boolean;
}
type Look = Omit<AnsiToken, 'text'>;

/** One SGR's parameters applied to a look: 0 (or empty) resets, 1 is bold, 30-37 and 90-97 set the colour. Every other
 *  parameter is ignored; the arguments of 38 and 48 (5;n or 2;r;g;b) are skipped, so they never read as a colour. */
function applySgr(params: string, look: Look): Look {
  let { fg, bold } = look;
  const ps = params.split(';').map((p) => (p === '' ? 0 : Number(p)));
  for (let i = 0; i < ps.length; i += 1) {
    const p = ps[i]!;
    if (p === 0) {
      fg = undefined;
      bold = undefined;
    } else if (p === 1) bold = true;
    else if (p >= 30 && p <= 37) fg = ANSI_COLOURS[p - 30];
    else if (p >= 90 && p <= 97) fg = ANSI_COLOURS[p - 90];
    else if (p === 38 || p === 48) i += ps[i + 1] === 5 ? 2 : ps[i + 1] === 2 ? 4 : 0;
  }
  return { ...(fg ? { fg } : {}), ...(bold ? { bold } : {}) };
}

const visible = (s: string): string => s.replace(RE_ESC2, '').replace(RE_CTRL, '');

/** Line breaks read on the joined text, never per piece: a CR and the LF after it are one break even with an escape
 *  between them, as cleanText reads them once the escapes are gone. A piece left empty is dropped. */
function readLines(out: AnsiToken[]): AnsiToken[] {
  for (let k = 0; k < out.length; k += 1) {
    const t = out[k]!;
    if (t.text.endsWith('\r') && (out[k + 1]?.text ?? '').startsWith('\n')) t.text = t.text.slice(0, -1);
    t.text = t.text.replace(RE_LINES, '\n');
  }
  return out.filter((t) => t.text !== '');
}

/** The tokens of terminal output: its visible text, cut where the look changes. They join back to exactly
 *  stripAnsi(src). A text longer than HL_MAX keeps no look. */
export function ansiTokens(src: string): AnsiToken[] {
  if (!src) return [];
  const out: AnsiToken[] = [];
  let look: Look = {};
  const add = (raw: string) => {
    const text = visible(raw);
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.fg === look.fg && last.bold === look.bold) last.text += text;
    else out.push({ text, ...look });
  };
  const s = src.replace(RE_OSC, '');
  const colour = src.length <= HL_MAX;
  let at = 0;
  for (const m of s.matchAll(RE_CSI)) {
    add(s.slice(at, m.index));
    at = (m.index ?? 0) + m[0].length;
    if (colour && m[2] === 'm' && /^[0-9;]*$/.test(m[1] ?? '')) look = applySgr(m[1] ?? '', look);
  }
  add(s.slice(at));
  return readLines(out);
}

/** The text of terminal output as a person sees it (and copies it): no escape, control, bidi mark or BOM. */
export function stripAnsi(src: string): string {
  return ansiTokens(src)
    .map((t) => t.text)
    .join('');
}

/** ansiTokens per line (split at every newline, which is dropped). */
export function ansiLines(src: string): AnsiToken[][] {
  const lines: AnsiToken[][] = [[]];
  for (const t of ansiTokens(src)) {
    t.text.split('\n').forEach((p, j) => {
      if (j > 0) lines.push([]);
      if (p) lines[lines.length - 1]!.push({ ...t, text: p });
    });
  }
  return lines;
}
