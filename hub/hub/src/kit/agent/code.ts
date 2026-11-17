// code.ts: how the Ask panel reads code and tool input, without DOM.
// Everything a model or a tool produced is untrusted text:
//   - It is cleaned first (clean(): ANSI and OSC sequences, control characters, bidi controls and, in code,
//     invisible formatting characters are removed; the length is capped), and only ever reaches the page as
//     React text children. No HTML sink exists in the panel.
//   - The highlighter is a set of single-pass tokenizers: every scan moves forward, none backtracks, none uses
//     a backtracking regular expression over the input, and the input is capped (MAX_SHOW to show, HL_MAX to
//     colour), so a huge or adversarial text cannot hang the page. A block shows its first lines until
//     "Show all".
//   - Token classes name a kind (k keyword, s string…).
// The models at the end (gateInput, stepModel, inlineParts) decide what the React parts draw.
// The kit file itself, not the @kit barrel: this module stays free of React and the rest of the kit.
import { type ColouredLang, codeLangOfPath, codeLangOfWord } from '@kit/data/codeLang';
import { stripAnsi } from '@kit/data/highlight';

export const MAX_SHOW = 200000; // characters shown at most, per block (the rest is counted, not drawn)
export const HL_MAX = 60000; // characters coloured; the remainder of a longer block stays plain
export const PEEK_LINES = 12; // a collapsed block shows this many lines
export const COLLAPSE_LINES = 14; // a block with more lines (or more than COLLAPSE_CHARS) collapses
export const COLLAPSE_CHARS = 2400;
export const DIFF_ROWS = 600; // rows of a diff drawn when expanded
const LCS_CELLS = 250000; // the largest changed region (lines x lines) given a real diff; beyond it: removed, then added

function set(s: string): Record<string, 1> {
  const o: Record<string, 1> = Object.create(null) as Record<string, 1>;
  for (const w of s.split(' ')) o[w] = 1;
  return o;
}
function has(o: Record<string, 1>, k: string): boolean {
  return o[k] === 1;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

// ── clean ──────────────────────────────────────────────────────────────────
// Strips what a terminal would have interpreted: CSI (ESC [ …) and OSC/DCS/PM/APC (ESC ] … BEL|ST, never
// reaching past the end of its line: an unterminated one must not swallow the text after it), other escapes,
// C0 controls except \n and \t, DEL, C1, bidi embedding/override/isolate controls. CR and CRLF become \n. With
// code:true the invisible formatting characters go too (zero-width, LRM/RLM, BOM). The bound applies after
// that, to what shows (bounded); the cut count is the characters left after it.
const NEEDS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
const NEEDS_CODE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;
// CSI after its introducer: parameters, intermediates, one final byte.
function skipCsi(s: string, j: number): number {
  const n = s.length;
  while (j < n && s.charCodeAt(j) >= 0x30 && s.charCodeAt(j) <= 0x3f) j++;
  while (j < n && s.charCodeAt(j) >= 0x20 && s.charCodeAt(j) <= 0x2f) j++;
  if (j < n && s.charCodeAt(j) >= 0x40 && s.charCodeAt(j) <= 0x7e) j++;
  return j;
}
function skipEscape(s: string, i: number): number {
  const n = s.length, c1 = s.charCodeAt(i + 1);
  let j: number;
  if (c1 === 91) return skipCsi(s, i + 2);
  if (c1 === 93 || c1 === 80 || c1 === 88 || c1 === 94 || c1 === 95) { // OSC, DCS, SOS, PM, APC
    j = i + 2;
    while (j < n) {
      const c = s.charCodeAt(j);
      if (c === 7) return j + 1;
      if (c === 27 && s.charCodeAt(j + 1) === 92) return j + 2;
      if (c === 10) return j;
      j++;
    }
    return n;
  }
  if (c1 >= 0x20 && c1 <= 0x2f) { // nF: intermediates, one final byte
    j = i + 2;
    while (j < n && s.charCodeAt(j) >= 0x20 && s.charCodeAt(j) <= 0x2f) j++;
    return j < n ? j + 1 : n;
  }
  if (c1 >= 0x30 && c1 <= 0x7e) return i + 2; // Fp, Fe, Fs: one more byte
  return i + 1; // a lone ESC
}
// One thing a reader cannot see inside a key: a colour or title sequence, a control other than tab and a line break (both readers
// turn a CR into a line, and a line break is not read past), a format or unassigned character, a combining mark, a blank filler. An
// escape can match as a sequence or as a lone control, but what a sequence starts with, `[` or `]`, cannot continue a key, so that
// second reading dies in one step and the patterns below stay linear. Every other escape form is left to the readers: see scrubSecrets.
const INVISIBLE = String.raw`(?:\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b\n]*(?:\u0007|\u001b\\)|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{M}\u115f\u1160\u3164\uffa0\u2800])`;
const GAP = `${INVISIBLE}*`;
// A key starts at a word boundary, or right after an escape of any form, whose last byte is often a letter or digit.
const START = String.raw`(?:\b|(?<=(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~])|(?<=\u001b[ -/]*[0-~]))`;
const KEY_CHAR = '[A-Za-z0-9_-]';
const spaced = (word: string) => [...word].join(GAP);
const PREFIX = `(?:${[spaced('sk'), spaced('hk'), `${spaced('xox')}${GAP}[bap]`, spaced('bot')].join('|')})${GAP}`;
const KEY_BODY = `(?:${GAP}${KEY_CHAR}){12,}\\b`;
// An underscore is a word character, so it needs its own start: a key glued to a word by one, in the dash form only, since names
// such as run_bot_configuration_file have the underscore form's shape; and a chat-bot token, whose id and colon nothing else has.
const KEY = new RegExp(`${START}${PREFIX}[-_]${KEY_BODY}|(?<=_)${PREFIX}-${KEY_BODY}`, 'gu');
const CHAT_BOT_TOKEN = new RegExp(`(?:${START}|(?<=_))\\d(?:${GAP}\\d){5,11}${GAP}:(?:${GAP}${KEY_CHAR}){30,}\\b`, 'gu');
const UNSEEN_ALL = new RegExp(INVISIBLE, 'gu');
// The other token families the agent's memory scrub knows (as pages/logs/scrub.ts ports it; code.families.test.ts fails
// when that list gains a token family this one lacks). Each reads as KEY does: what a reader cannot see may sit between any two of
// its characters, and it starts at a word boundary, after an escape or after an underscore. A token glued to a letter or a digit
// (`xghp_…`) is not looked for: kebab and camel names would match (an accepted gap). Each pattern reads only the
// shortest body that scrub accepts; a body that may run on is then taken to its end by a scan (`tokenEnd`), so no pattern repeats
// a group past a fixed count (see RUN_MAX: one engine stops matching quietly) and each start reads its run once.
const body = (cls: string, min: number, max: number = min) => `(?:${GAP}${cls}){${min},${max}}`;
const ALNUM = '[A-Za-z0-9]';
const WORD = '[A-Za-z0-9_]';
/** A literal, with what a reader cannot see allowed between its characters. */
const spacedLit = (word: string) => [...word].map((c) => c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join(GAP);
/** One part of a token read by a scan after its pattern: a run of `cls` (`min` to `max` characters), what a reader cannot see allowed
 *  between them. `hide` marks where the hidden part starts (a webhook keeps its address). */
interface Step { cls: string; min: number; max?: number; hide?: true }
/** A family: the characters it can start with, the pattern up to its shortest body, what its body may run on with, and the parts
 *  whose length that scrub leaves open, read by a scan (`stepsEnd`) rather than a pattern. */
interface TokenFamily { first: string; head: string; more?: string; steps?: readonly Step[]; keep?: true }
const TOKEN_FAMILIES: ReadonlyArray<TokenFamily> = [
  { first: 'h', head: `${spaced('hdy_')}${body(ALNUM, 20, 32)}${GAP}_${body(ALNUM, 16)}`, more: ALNUM },
  { first: 'h', head: `${spaced('hbk_')}${body(ALNUM, 20)}`, more: ALNUM },
  { first: 'g', head: `${spaced('gh')}${GAP}[opusr]${GAP}_${body(ALNUM, 36)}`, more: ALNUM },
  { first: 'g', head: `${spaced('github_pat_')}${body(WORD, 22)}`, more: WORD },
  { first: 'x', head: `${spaced('xox')}${GAP}[baprse]${GAP}-${body('[A-Za-z0-9-]', 10)}`, more: '[A-Za-z0-9-]' },
  {
    first: 'x',
    head: `${spaced('xapp-')}${GAP}\\d${GAP}-${body(ALNUM, 1, 15)}${GAP}-`,
    steps: [{ cls: '\\d', min: 6 }, { cls: '-', min: 1, max: 1 }, { cls: ALNUM, min: 20 }],
  },
  { first: '[pra]', head: `(?:${['pk', 'rk', 'ak'].map(spaced).join('|')})${GAP}-${GAP}${ALNUM}${body(KEY_CHAR, 19)}`, more: KEY_CHAR },
  { first: 'r', head: `${spaced('rk_')}${GAP}(?:${spaced('live')}|${spaced('test')})${GAP}_${body(ALNUM, 10)}`, more: ALNUM },
  { first: 'A', head: `A${GAP}(?:${['KI', 'SI', 'BI', 'CC'].map(spaced).join('|')})${GAP}A${body('[0-9A-Z]', 16)}(?!${GAP}[0-9A-Z])` },
  { first: 'A', head: `${spaced('AIza')}${body(KEY_CHAR, 35)}` },
  { first: 'n', head: `${spaced('npm_')}${body(ALNUM, 36)}` },
  { first: 'g', head: `${spaced('glpat-')}${body(KEY_CHAR, 20)}`, more: KEY_CHAR },
  { first: 'd', head: `${spaced('dop_v1_')}${body(ALNUM, 64)}` },
  { first: 'S', head: `${spaced('SG')}${GAP}\\.${body('[A-Za-z0-9_.-]', 32)}`, more: '[A-Za-z0-9_.-]' },
  { first: 'S', head: `${spaced('SK')}${body('[0-9a-fA-F]', 32)}(?!${GAP}${WORD})` },
  { first: 'h', head: `${spaced('hf_')}${body(ALNUM, 20)}`, more: ALNUM },
  { first: 'h', head: `${spaced('hv')}${GAP}[sbr]${GAP}\\.${body(KEY_CHAR, 24)}`, more: KEY_CHAR },
  { first: 'w', head: `${spaced('whsec_')}${body('[A-Za-z0-9+/=]', 24)}`, more: '[A-Za-z0-9+/=]' },
  { first: 'b', head: `${spaced('bot')}${body('\\d', 8, 10)}${GAP}:${body(KEY_CHAR, 35)}(?!${GAP}${KEY_CHAR})` },
  { first: '[MNO]', head: `[MNO]${body(ALNUM, 23, 27)}${GAP}\\.${body(KEY_CHAR, 6)}${GAP}\\.${body(KEY_CHAR, 27, 40)}` },
  // A webhook's address shows; its secret part goes.
  {
    first: 'h',
    head: spacedLit('hooks.slack.com/services/T'),
    steps: [
      { cls: '[A-Z0-9]', min: 6 },
      { cls: '\\/', min: 1, max: 1 },
      { cls: 'B', min: 1, max: 1 },
      { cls: '[A-Z0-9]', min: 6 },
      { cls: '\\/', min: 1, max: 1 },
      { cls: ALNUM, min: 20, hide: true },
    ],
    keep: true,
  },
  {
    first: 'd',
    head: `${spacedLit('discord')}(?:${GAP}${spacedLit('app')})?${GAP}${spacedLit('.com/api/webhooks/')}`,
    steps: [{ cls: '\\d', min: 15, max: 25 }, { cls: '\\/', min: 1, max: 1 }, { cls: KEY_CHAR, min: 50, hide: true }],
    keep: true,
  },
];
// The webhook families (`keep`) run first: their secret may hold `_hf_` or `-ak-`, and a family run before them would hide that
// piece alone, leaving too little for the webhook to match and the rest of its secret showing.
const TOKEN_PATTERNS = [...TOKEN_FAMILIES.filter((f) => f.keep), ...TOKEN_FAMILIES.filter((f) => !f.keep)].map((f) => ({
  find: new RegExp(`(?=${f.first})${f.keep ? '' : `(?:${START}|(?<=_))`}${f.head}`, 'gu'),
  more: f.more === undefined ? null : new RegExp(f.more, 'uy'),
  steps: (f.steps ?? []).map((st) => ({ ...st, re: new RegExp(st.cls, 'uy') })),
}));
const INVISIBLE_AT = new RegExp(INVISIBLE, 'uy');
/** The first character a reader shows at or after i: what it cannot see is passed over, one unit at a time. */
function shownAt(s: string, from: number): number {
  let i = from;
  for (;;) {
    INVISIBLE_AT.lastIndex = i;
    const g = INVISIBLE_AT.exec(s);
    if (!g || g[0].length === 0) return i;
    i += g[0].length;
  }
}
/** Where a token's scanned parts end, and where its hidden part starts, or null when they do not follow. Each run is greedy: a
 *  part's characters cannot start the next part, so nothing is read twice. */
function stepsEnd(s: string, from: number, steps: ReadonlyArray<Step & { re: RegExp }>): { end: number; hide: number } | null {
  let end = from;
  let hide = -1;
  for (const st of steps) {
    if (st.hide) hide = shownAt(s, end);
    let n = 0;
    while (st.max === undefined || n < st.max) {
      const j = shownAt(s, end);
      st.re.lastIndex = j;
      if (j >= s.length || !st.re.test(s)) break;
      end = j + 1;
      n++;
    }
    if (n < st.min) return null;
  }
  return { end, hide };
}
/** Where a token's body that may run on ends: past every character it may hold, and what a reader cannot see between them. */
function tokenEnd(s: string, from: number, more: RegExp): number {
  let end = from;
  for (let i = from; i < s.length; ) {
    INVISIBLE_AT.lastIndex = i;
    const g = INVISIBLE_AT.exec(s);
    if (g && g[0].length > 0) {
      i += g[0].length;
      continue;
    }
    more.lastIndex = i;
    if (!more.test(s)) break;
    end = ++i;
  }
  return end;
}
/** The text with each span [from, to) as a marker. Spans are in order and do not overlap. */
function hideSpans(s: string, spans: ReadonlyArray<readonly [number, number]>): string {
  if (spans.length === 0) return s;
  let out = '';
  let last = 0;
  for (const [a, b] of spans) {
    out += `${s.slice(last, a)}[hidden]`;
    last = b;
  }
  return out + s.slice(last);
}
function hideFamilies(text: string): string {
  let s = text;
  for (const { find, more, steps } of TOKEN_PATTERNS) {
    const spans: Array<[number, number]> = [];
    find.lastIndex = 0;
    for (let m = find.exec(s); m; m = find.exec(s)) {
      const after = m.index + m[0].length;
      const read = steps.length > 0 ? stepsEnd(s, after, steps) : { end: more ? tokenEnd(s, after, more) : after, hide: -1 };
      if (!read) {
        find.lastIndex = m.index + 1;
        continue;
      }
      spans.push([read.hide >= 0 ? read.hide : m.index, read.end]);
      find.lastIndex = read.end;
    }
    s = hideSpans(s, spans);
  }
  return s;
}
// A private key block, from its first line to its last, or when it has none to the end of the body that follows its first line (see
// pemOpenEnd): a scan for each line, never one pattern across the block. A line's label (`OPENSSH PRIVATE KEY`) has no length bound, as in the agent's scrub: it is read by a scan.
// It runs before hideLongRuns, which would replace a label of RUN_MAX characters and so hide the line from the scan: being
// scans only, it needs no run bound.
const PEM_BEGIN = new RegExp(spaced('-----BEGIN '), 'gu');
const PEM_END = new RegExp(spaced('-----END '), 'gu');
const PEM_LABEL = /[A-Z0-9 ]/y;
const PEM_NAMED = /PRIVATE KEY(?: BLOCK)?$/;
/** The end of a key line whose label starts at `from` (the label, `PRIVATE KEY` or `PRIVATE KEY BLOCK` last, then five dashes), or -1. */
function pemLineEnd(s: string, from: number): number {
  let label = '';
  let end = from;
  for (;;) {
    const j = shownAt(s, end);
    PEM_LABEL.lastIndex = j;
    if (j >= s.length || !PEM_LABEL.test(s)) break;
    label += s[j];
    end = j + 1;
  }
  if (!PEM_NAMED.test(label)) return -1;
  for (let n = 0; n < 5; n++) {
    const j = shownAt(s, end);
    if (s[j] !== '-') return -1;
    end = j + 1;
  }
  return end;
}
const PEM_B64 = /[A-Za-z0-9+/=]/;
// A line break as a reader shows one: LF, a bare CR, U+2028 and U+2029 (NEL is read as invisible, so a body joined by it is one line).
const PEM_BREAK = /[\n\r\u2028\u2029]/;
const PEM_BREAK_G = /[\n\r\u2028\u2029]/g;
const PEM_HEADER = /(?:Proc-Type|DEK-Info):[^\n\r\u2028\u2029]*/y;
/** A run this long of base64 characters makes a line a key body's, whatever is around it. */
const PEM_RUN = 16;
/** Lines a scan found no body in, each from `from` to its break at `end`: the rest of a block's first line, and the line that ended
 *  the block. The next first line is on one of them or on a line no scan has read, so it reads the same without a scan. */
interface PemSpan { from: number; end: number }
/** `dead`: from the end of a first line to just before the line that ended its block, all blank between: a later first line that
 *  ends in it has the same lines after it, so it ends there too, unread again. */
interface PemSeen { first: PemSpan; last: PemSpan; dead: PemSpan }
const inSpan = (at: number, x: PemSpan) => at >= x.from && at <= x.end;
/** The line from `at`: where it ends (at its line break, or the end of the text), whether it holds PEM_RUN base64 characters in a row
 *  (what a reader cannot see allowed between them), whether it is base64 alone (spaces around it), and whether it is blank. A body
 *  line may carry a line number, a quote mark, a diff marker or escaped line breaks around its base64. */
function pemLine(s: string, at: number, into: PemSpan, seen: PemSeen): { end: number; body: boolean; pure: boolean; blank: boolean } {
  for (const x of [seen.first, seen.last])
    if (inSpan(at, x)) {
      into.from = x.from; // a later first line on this line reads it from here too
      into.end = x.end;
      return { end: x.end, body: false, pure: false, blank: false };
    }
  let run = 0;
  let phase = 0; // base64 alone: 0 space before it, 1 in it, 2 space after it, 3 no
  for (let i = at; ; ) {
    const j = shownAt(s, i);
    if (j >= s.length || PEM_BREAK.test(s[j] as string)) {
      into.from = at;
      into.end = j;
      return { end: j, body: false, pure: phase === 1 || phase === 2, blank: phase === 0 };
    }
    const c = s[j] as string;
    if (PEM_B64.test(c)) {
      if (++run >= PEM_RUN) {
        PEM_BREAK_G.lastIndex = j;
        const brk = PEM_BREAK_G.exec(s);
        return { end: brk ? brk.index : s.length, body: true, pure: false, blank: false };
      }
      phase = phase < 2 ? 1 : 3;
    } else {
      run = 0;
      if (c === ' ' || c === '\t') {
        if (phase === 1) phase = 2;
      } else phase = 3;
    }
    i = j + 1;
  }
}
/** Where the line after the break at `at` starts (a CR and LF together are one break). */
const pemNext = (s: string, at: number): number => (s[at] === '\r' && s[at + 1] === '\n' ? at + 2 : at + 1);
/** Where a block with no last line ends: after the body lines that follow its first line (the rest of that line too when it holds a
 *  body: a JSON-escaped or space-joined block; a short line of base64 alone too: a key's last line, or its first one still streaming), the Proc-Type
 *  and DEK-Info lines an encrypted key has before its body, and blank lines that a body line follows. A first line quoted in prose or code so hides alone, the text after it kept;
 *  a body in any shape a reader still reads as key lines is hidden, and over-hiding wins over showing. */
function pemOpenEnd(s: string, from: number, seen: PemSeen): number {
  const first = pemLine(s, from, seen.first, seen);
  if (!first.body && first.end >= seen.dead.from && first.end <= seen.dead.end) return from;
  let body = first.body;
  let end = body ? first.end : from;
  let stop = s.length;
  for (let at = first.end; at < s.length; ) {
    // Blank lines first, then the next line is read the same way wherever in the blank run the scan began: a header (before the
    // body), a body line, or a line of base64 alone. So a first line that ends inside a blank run a scan found no body after ends
    // there too (`seen.dead`), even one hidden in an OSC, which reads as blank.
    let start = pemNext(s, at);
    let line = pemLine(s, start, seen.last, seen);
    let gap = false;
    while (line.blank && line.end < s.length) {
      gap = true;
      start = pemNext(s, line.end);
      line = pemLine(s, start, seen.last, seen);
    }
    if (!body && !line.body) {
      PEM_HEADER.lastIndex = start;
      if (PEM_HEADER.test(s)) {
        end = at = PEM_HEADER.lastIndex;
        continue;
      }
    }
    // A line of base64 alone continues it too (a key's short last line, or its first line still streaming), except after
    // a blank line that follows the body (`\n\nDone` shows).
    if (!line.body && !(line.pure && !(body && gap))) {
      stop = start;
      break;
    }
    body = true;
    end = at = line.end;
  }
  if (end === from) {
    seen.dead.from = first.end;
    seen.dead.end = Math.max(first.end, stop - 1);
  }
  return end;
}
function hidePems(s: string): string {
  if (!s.includes('-')) return s;
  const spans: Array<[number, number]> = [];
  // Once a search finds no last line, none after it can: later blocks skip the search, so each part of the text is read once.
  let lastLines = true;
  const seen: PemSeen = { first: { from: -1, end: -1 }, last: { from: -1, end: -1 }, dead: { from: -1, end: -1 } };
  PEM_BEGIN.lastIndex = 0;
  for (let m = PEM_BEGIN.exec(s); m; m = PEM_BEGIN.exec(s)) {
    const head = pemLineEnd(s, m.index + m[0].length);
    if (head < 0) continue;
    let end = -1;
    if (lastLines) {
      PEM_END.lastIndex = head;
      for (let e = PEM_END.exec(s); e; e = PEM_END.exec(s)) {
        const close = pemLineEnd(s, e.index + e[0].length);
        if (close >= 0) {
          end = close;
          break;
        }
      }
      if (end < 0) lastLines = false;
    }
    if (end < 0) end = pemOpenEnd(s, head, seen);
    spans.push([m.index, end]);
    PEM_BEGIN.lastIndex = end;
  }
  return hideSpans(s, spans);
}
// A JWT (eyJ…, three runs joined by dots, each of 10 or more characters) is found by a scan too: tried from each eyJ, a pattern
// reads the rest of the run every time, quadratic on `eyJ-eyJ-…` (pages/logs/scrub.ts jwtSpans). Within one dot-separated part only
// its first eyJ that can start a token matters: a later one has a shorter first part and the same two after it.
const JWT_RUN = new RegExp(`(?:[A-Za-z0-9_.-]|${INVISIBLE})+`, 'gu');
const START_AT = new RegExp(`${START}|(?<=_)`, 'uy');
const startsAt = (s: string, i: number): boolean => {
  START_AT.lastIndex = i;
  return START_AT.test(s);
};
function hideJwts(s: string): string {
  if (!s.includes('J')) return s;
  const spans: Array<[number, number]> = [];
  JWT_RUN.lastIndex = 0;
  for (let m = JWT_RUN.exec(s); m; m = JWT_RUN.exec(s)) {
    const r = m[0];
    if (!r.includes('.') || !r.includes('J')) continue;
    // The run as a reader sees it, and where each character it shows stands in the text.
    let v = '';
    const at: number[] = [];
    for (let i = 0; i < r.length; ) {
      INVISIBLE_AT.lastIndex = i;
      const g = INVISIBLE_AT.exec(r);
      if (g && g[0].length > 0) {
        i += g[0].length;
        continue;
      }
      v += r[i];
      at.push(m.index + i);
      i++;
    }
    const parts = v.split('.');
    const from: number[] = [];
    for (let k = 0, o = 0; k < parts.length; o += parts[k]!.length + 1, k++) from.push(o);
    for (let k = 0; k + 2 < parts.length; k++) {
      const head = parts[k]!;
      let j = head.indexOf('eyJ');
      while (j >= 0 && !startsAt(s, at[from[k]! + j]!)) j = head.indexOf('eyJ', j + 1);
      if (j < 0 || head.length - j - 3 < 10 || parts[k + 1]!.length < 10 || parts[k + 2]!.length < 10) continue;
      spans.push([at[from[k]! + j]!, at[from[k + 2]! + parts[k + 2]!.length - 1]! + 1]);
      k += 2;
    }
  }
  return hideSpans(s, spans);
}
// What only a terminal reader takes out: an escape or a C1 control.
const TERMINAL = /[\u001b\u0080-\u009f]/;
// A reader takes a control out and the word break with it: `note\u0007sk-` reads as one word, where no key can start. So the text is read
// with a mark before each control: the readers keep it, a key may start after it and read across it (it is a format character).
const CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const BREAK = '\u200b';
// The two ways the Hub shows terminal text. They differ on an open string sequence and on a C1 string introducer.
const READERS: ReadonlyArray<(s: string) => string> = [(s) => clean(s).text, stripAnsi];

// The key patterns repeat a group per key character. JavaScriptCore (Safari, every iOS browser) gives up on such a group after about 97k
// rounds and reports no match, without throwing, so a key after a run that long would show. A run of RUN_MAX characters that a key could
// span is hidden whole before the patterns run, so it fails closed in every engine. A key cannot cross a space, tab or line break, except
// inside a colour or title sequence (INVISIBLE), so the run is measured as the pattern reads it. A scan, not a pattern: a pattern that counts
// this far would meet the same limit.
const RUN_MAX = 40000;
const isBreak = (c: number): boolean => c === 32 || c === 9 || c === 10 || c === 13;
/** The end of a colour sequence (ESC [ …) or a closed title sequence (ESC ] … BEL|ESC \\) at i, as INVISIBLE reads them, or i. */
function sequenceEnd(s: string, i: number): number {
  if (s.charCodeAt(i) !== 27) return i;
  const n = s.length;
  if (s.charCodeAt(i + 1) === 91) {
    let j = i + 2;
    while (j < n && s.charCodeAt(j) >= 0x30 && s.charCodeAt(j) <= 0x3f) j++;
    while (j < n && s.charCodeAt(j) >= 0x20 && s.charCodeAt(j) <= 0x2f) j++;
    return j < n && s.charCodeAt(j) >= 0x40 && s.charCodeAt(j) <= 0x7e ? j + 1 : i;
  }
  if (s.charCodeAt(i + 1) === 93) {
    for (let j = i + 2; j < n; j++) {
      const c = s.charCodeAt(j);
      if (c === 7) return j + 1;
      if (c === 27) return s.charCodeAt(j + 1) === 92 ? j + 2 : i;
      if (c === 10) return i;
    }
  }
  return i;
}
function hideLongRuns(s: string): string {
  if (s.length < RUN_MAX) return s;
  let out = '';
  let from = 0;
  let start = 0;
  let units = 0;
  const close = (end: number) => {
    if (units >= RUN_MAX) {
      out += `${s.slice(from, start)}[hidden]`;
      from = end;
    }
    units = 0;
  };
  for (let i = 0; i < s.length; ) {
    if (isBreak(s.charCodeAt(i))) {
      close(i);
      start = ++i;
      continue;
    }
    const e = sequenceEnd(s, i);
    i = e > i ? e : i + 1;
    units++;
  }
  close(s.length);
  return from === 0 ? s : out + s.slice(from);
}
// A key whose tail a token family hid first keeps a start too short for KEY (`sk-12345678_hf_…`: the family starts after the
// underscore): that start goes with the family's marker. Read back from each marker (a lookbehind), so a run is read once.
const KEY_STUB = new RegExp(`(?<=((?:${START}${PREFIX}[-_]|(?<=_)${PREFIX}-)(?:${GAP}${KEY_CHAR})+${GAP}))\\[hidden\\]`, 'gu');
function hideKeyStubs(s: string): string {
  let out = '';
  let last = 0;
  for (const m of s.matchAll(KEY_STUB)) {
    const from = m.index - (m[1]?.length ?? 0);
    if (from < last) continue;
    out += `${s.slice(last, from)}[hidden]`;
    last = m.index + m[0].length;
  }
  return last === 0 ? s : out + s.slice(last);
}
const hideKeys = (s: string): string =>
  hideKeyStubs(hideFamilies(hideJwts(hideLongRuns(hidePems(s)))).replace(KEY, '[hidden]')).replace(CHAT_BOT_TOKEN, '[hidden]');

/** The text with what a reader cannot see taken out, as the terminal reader shows it, for a check that reads text as it shows. Never
 *  for showing: it drops colours and the invisible parts of joined emoji. */
export function shownText(s: string): string {
  return stripAnsi(s).replace(UNSEEN_ALL, '');
}

/** Hides anything shaped like a token or key (API keys, Slack, GitHub, AWS and the other token families the agent's memory scrub
 *  knows, JWTs, private key blocks, chat-bot tokens) before text is shown, however it is shown
 *  afterwards: what a reader cannot see may sit inside the key, and the text around a key keeps its bytes (but an escape introducer
 *  right before the marker, see `unglued`). A key split by a real
 *  space or line break is not rejoined. Text that still holds an escape is then read as each reader shows it: a key only a reader
 *  shows, or one a removed control glues to the word before it, comes back as that reading, scrubbed, without its colours. The Hub's one pattern: pages scrub with it, and Prose checks
 *  every link address with it after the browser normalises it. A run of RUN_MAX characters with no space, tab or line break is hidden
 *  whole, key-shaped or not: past it one engine stops matching quietly. Should a pattern still throw, the whole text is hidden: nothing
 *  shows unchecked. So clean a text only after scrubbing it too: cleaning can glue a key to the word before it, where no key can start. */
export function scrubSecrets(s: string): string {
  try {
    const pem = TERMINAL.test(s) ? readerPem(s) : undefined;
    if (pem !== undefined) return pem;
    const out = hideKeys(s);
    if (!TERMINAL.test(out)) return out;
    // Each reader reads the text marked (a BREAK before every control, so a removed control cannot glue a key to the word
    // before it) and as written: an nF escape takes any byte as its final one, so in the marked text it can take a BREAK
    // and open a string the written text does not.
    const marked = out.replace(CONTROLS, `${BREAK}$&`);
    for (const text of [marked, out])
      for (const read of READERS) {
        const seen = read(text);
        const hidden = hideKeys(seen);
        if (hidden === seen) continue;
        const shown = hidden.replaceAll(BREAK, '');
        return settledOr(unglued(shown, s), shown);
      }
    return settledOr(unglued(out, s), out);
  } catch {
    return '[hidden]';
  }
}

/** A private key block a reader shows in the text as given (an escape inside its first or last line, which the raw scan cannot
 *  read) comes back as that reading, scrubbed, before hideLongRuns can take a long label out of the line and leave the key body
 *  showing. Undefined when no reader shows such a block. */
const readerPem = (s: string): string | undefined => {
  const marked = s.replace(CONTROLS, `${BREAK}$&`);
  for (const text of [marked, s])
    for (const read of READERS) {
      const seen = read(text);
      if (hidePems(seen) === seen) continue;
      const shown = hideKeys(seen).replaceAll(BREAK, '');
      return settledOr(unglued(shown, s), shown);
    }
  return undefined;
};

/** An `unglued` change is kept only when no reader, marked or not, reads a key in the result; else the text stays as the scrub
 *  wrote it (the marker may then be read into an escape, never a key shown). Dropping an opener can show text both readers had
 *  swallowed, before the marker or after it (an open string runs past the marker), where only the raw pattern looked.
 *  A constant number of linear passes, only when `unglued` changed something. */
const settledOr = (u: string, was: string): string => {
  if (u === was) return u;
  const m = u.replace(CONTROLS, `${BREAK}$&`);
  for (const text of [m, u])
    for (const read of READERS) {
      const v = read(text);
      if (hideKeys(v) !== v) return was;
    }
  return u;
};

/** A marker the scrub wrote must read as `[hidden]` whatever stood before the key.
 *  A terminal-style reader would otherwise take part of it into an escape: a lone ESC or CSI
 *  (U+009B), or an open CSI with its parameter and intermediate bytes (`ESC [ 3 1`), ends on the marker's first byte
 *  (`ESC [ h`, `ESC [ [`), and an opened string (ESC ] OSC, ESC P DCS, ESC X/^/_, or their C1 forms) not ended before the
 *  marker swallows it. The open escape right before the marker goes. An ESC-opened string goes with its text up to the
 *  marker, when both readers had swallowed that text (checked by reading it both ways): it was checked only raw, and showing it could show a key the raw
 *  pattern misses (`sk\u009b1m-…`, joined once the C1 CSI is cleaned).
 *  A C1-opened string loses only its opener: the non-code reader usually shows its text. Either way `settledOr` keeps a
 *  change only when no reader reads a key in the result. In rare mixed escapes a reader may lose a shown character next to
 *  a marker (cosmetic). Text that already
 *  held the marker's words and an escape is left as the scrub wrote it (`raw`), so no byte of that text is dropped. */
const unglued = (out: string, raw: string): string => {
  if (!out.includes('[hidden]') || (raw.includes('[hidden]') && TERMINAL.test(raw))) return out;
  const parts = out.split('[hidden]');
  for (let i = 0; i < parts.length - 1; i++) parts[i] = unopened(parts[i]!);
  return parts.join('[hidden]');
};

/** The text before a marker without the escape it would leave open on the marker (see `unglued`). One backward pass
 *  each, so a hostile run of openers stays linear. A complete escape (`ESC 7`, `ESC [ 0 m`) is kept; an ESC with only
 *  intermediate bytes before the marker (`ESC space`) is open and goes. A string opened on an earlier line is ended by
 *  the line break for the readers, so the scan stops there and keeps its opener. */
function unopened(p: string): string {
  let e = p.length;
  while (e > 0 && p.charCodeAt(e - 1) >= 0x20 && p.charCodeAt(e - 1) <= 0x2f) e--;
  const mid = e; // ESC then intermediates only: still open
  while (e > 0 && p.charCodeAt(e - 1) >= 0x30 && p.charCodeAt(e - 1) <= 0x3f) e--;
  if (e > 0 && p.charCodeAt(e - 1) === 0x9b) p = p.slice(0, e - 1);
  else if (e > 1 && p.charCodeAt(e - 1) === 0x5b && p.charCodeAt(e - 2) === 0x1b) p = p.slice(0, e - 2);
  else if (mid > 0 && mid < p.length && p.charCodeAt(mid - 1) === 0x1b) p = p.slice(0, mid - 1);
  else if (p.endsWith('\u001b')) p = p.slice(0, -1);
  for (let i = p.length - 1; i >= 0; i--) {
    const c = p.charCodeAt(i);
    if (c === 0x07 || c === 0x9c || c === 0x0a) break;
    if (c === 0x90 || c === 0x98 || c === 0x9d || c === 0x9e || c === 0x9f) return p.slice(0, i) + p.slice(i + 1);
    if (c === 0x1b) {
      const n = p[i + 1]; // a lone ESC at the end went above; one left here is followed by something
      if (n === undefined || !']PX^_'.includes(n)) return p;
      // Only an opener both readers took as one, with its text swallowed: an ESC an earlier escape consumed (`ESC space
      // ESC ]`) opens nothing, and its text shows. Then nothing goes.
      const q = p.slice(0, i);
      return READERS.every((read) => read(p) === read(q)) ? q : p;
    }
  }
  return p;
}

export function clean(text: unknown, max?: number, o?: { code?: boolean }): { text: string; cut: number } {
  const s = dropUnshown(typeof text === 'string' ? text : '', !!(o && o.code));
  return max && s.length > max ? bounded(s, max) : { text: s, cut: 0 };
}

/** A bound counts what a reader sees: characters that never show (Default_Ignorable: zero-width spaces and joiners,
 *  word joiners, variation selectors, tag characters, soft hyphens, fillers) do not use it up, so no padding of them hides the text
 *  after it. Once a text is over its bound, a run of them keeps at most its first RUN_KEEP code points (no joined emoji or tag flag
 *  needs more), and all runs together keep at most `max` units, so the result is at most twice the bound; the run right after the
 *  last character shown stays with it (a variation selector or joiner at the cut). A text within its bound keeps every character.
 *  The cut is every unit of the cleaned text the result leaves out (after the bound, and taken by a run's limit), never splitting a
 *  surrogate pair. */
const RUN_KEEP = 8;
const IGNORABLE = /\p{Default_Ignorable_Code_Point}+/gu;
function bounded(text: string, max: number): { text: string; cut: number } {
  let spare = max;
  const s = text.replace(IGNORABLE, (r) => {
    let i = 0;
    for (let n = 0; n < RUN_KEEP && i < r.length; n++) {
      const w = (r.codePointAt(i) as number) > 0xffff ? 2 : 1;
      if (w > spare) break;
      spare -= w;
      i += w;
    }
    return r.slice(0, i);
  });
  let seen = 0, at = 0;
  IGNORABLE.lastIndex = 0;
  for (let m = IGNORABLE.exec(s); m; m = IGNORABLE.exec(s)) {
    if (seen + m.index - at > max) break;
    seen += m.index - at;
    at = m.index + m[0].length;
  }
  let end = at + max - seen;
  if (end >= s.length) return { text: s, cut: text.length - s.length };
  const e = s.charCodeAt(end - 1);
  if (e >= 0xd800 && e <= 0xdbff) end--;
  return { text: s.slice(0, end), cut: text.length - end };
}

function dropUnshown(s: string, code: boolean): string {
  if (!(code ? NEEDS_CODE : NEEDS).test(s)) return s;
  const n = s.length, parts: string[] = [];
  let i = 0, from = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 27 || c === 0x9b) {
      parts.push(s.slice(from, i));
      i = c === 27 ? skipEscape(s, i) : skipCsi(s, i + 1);
      from = i;
      continue;
    }
    if (c === 13) {
      parts.push(s.slice(from, i));
      if (s.charCodeAt(i + 1) === 10) { i++; from = i; } else { parts.push('\n'); from = i + 1; i++; }
      continue;
    }
    if (c === 0x2028 || c === 0x2029) { parts.push(s.slice(from, i), '\n'); i++; from = i; continue; }
    if (c < 9 || (c > 10 && c < 32) || (c >= 0x7f && c <= 0x9f) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) ||
        (code && (c === 0xad || c === 0x61c || c === 0x180e || (c >= 0x200b && c <= 0x200f) || (c >= 0x2060 && c <= 0x2064) || c === 0xfeff))) {
      parts.push(s.slice(from, i));
      i++; from = i;
      continue;
    }
    i++;
  }
  parts.push(s.slice(from));
  return parts.join('');
}

// ── as written ─────────────────────────────────────────────────────────────
// The text as it runs, for a command or path a person approves or trusts: what
// clean() drops or changes (escapes and what follows them, controls, CR, bidi and line separators), and every other character a person
// can't see or tell from a space (Default_Ignorable, format, private use, lone surrogates, non-ASCII spaces, the braille blank), each as a
// visible mark: ⟨ESC⟩, ⟨BEL⟩, ⟨CR⟩, ⟨U+200B⟩. The agent runs the text as written and sh reads each of these as an ordinary byte, so a
// cleaned reading can show something else: `echo hi \x1b]0;x; curl … | sh; #\x07` cleans to `echo hi ` and runs curl, `ls\x1b;id`
// cleans to `lsid` and runs id. Also marked: a tab (it draws as spaces: `cat 'a<TAB>b'` and `cat 'a  b'` open different files),
// U+FFFC and U+FFFD (drawn as a box or a blank, by font), a combining mark with no letter or digit to sit on (at the start,
// after a space or a sign: an accent alone can pass for a speck), and a combining mark on a letter or digit that NFC
// would compose: `cafe\u0301` draws as `café`, a different name. A mark NFC keeps (an accent with no composed form, a
// script's vowel sign) stays as written. Only marks are added: every visible character stays. A line break stays as it is, for text
// drawn with its line breaks kept (code, the trust review); `line`, for text drawn on one line where spaces collapse (a path, a
// folder, a parameter), marks it too, and every ASCII space at either end or next to another: `/tmp/a  b` and `/tmp/a b` name
// different paths. `marked`: one was added, so what a screen shows of the text alone differs from what runs. Homoglyphs of other
// scripts (Cyrillic а for Latin a) are not marked: they are visible characters. A written ⟨ is marked too (⟨U+27E8⟩), so every ⟨
// shown opens a mark and a text that spells one (`a⟨TAB⟩b`) never reads as the tab it names. Mark runs are read
// first, whole: a variation selector inside one takes the run with it (`a\ufe0f\u0301`), never leaving the next mark unread.
const MARK_NAME: Readonly<Record<number, string>> = { 0: 'NUL', 7: 'BEL', 8: 'BS', 9: 'TAB', 10: 'LF', 11: 'VT', 12: 'FF', 13: 'CR', 27: 'ESC', 32: 'U+0020', 127: 'DEL' };
const AS_WRITTEN = /(?<![\p{L}\p{N}\p{M}])\p{M}+|(?<=[\p{L}\p{N}])\p{M}+|[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2800\u27e8\ufffc\ufffd\p{Default_Ignorable_Code_Point}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cs}]|(?! )\p{Zs}/gu;
const AS_WRITTEN_LINE = new RegExp(`${AS_WRITTEN.source}|\\n|^ +| +$| {2,}`, 'gu');
const MARKS_ONLY = /^\p{M}+$/u, AFTER_BASE = /[\p{L}\p{N}]$/u, HAS_IGNORABLE = /\p{Default_Ignorable_Code_Point}/u;
const asMark = (c: string): string => {
  const n = c.codePointAt(0) as number;
  return `⟨${MARK_NAME[n] ?? `U+${n.toString(16).toUpperCase().padStart(4, '0')}`}⟩`;
};
// Which code units show as marks. The pattern finds what can't be seen or can pass for something else; a run of combining marks on a
// letter or digit is left to the second pass unless it holds a variation selector or a grapheme joiner (those draw nothing: always
// marked). The second pass reads each grapheme that NFC would change: two texts NFC makes equal can draw alike, so whatever NFC
// would change shows as marks. That covers a decomposed accent (`cafe\u0301` for `café`), decomposed Hangul
// (U+1100 U+1161 for 가), a singleton like U+2126 OHM SIGN for Ω and CJK compatibility ideographs. The grapheme's first code point
// stays as written when NFC keeps it alone (`e` of `e\u0301`, `ᄀ` of `ᄀ`+`ᅡ`); every later one is marked. A mark NFC keeps (q\u0301, a
// Devanagari vowel sign) stays as written.
// `tabs`: a tab stays as written (a file's content and an edit's sides hold tabs as text; a command marks them).
let graphemes: Intl.Segmenter | undefined;
export function asWritten(text: unknown, o?: { line?: boolean; tabs?: boolean }): { text: string; marked: boolean } {
  const s = typeof text === 'string' ? text : '';
  const shown = new Uint8Array(s.length);
  for (const m of s.matchAll(o?.line ? AS_WRITTEN_LINE : AS_WRITTEN)) {
    const run = m[0], at = m.index;
    if (o?.tabs && run === '\t') continue;
    if (MARKS_ONLY.test(run) && !HAS_IGNORABLE.test(run) && AFTER_BASE.test(s.slice(Math.max(0, at - 2), at))) continue;
    shown.fill(1, at, at + run.length);
  }
  if (s.normalize('NFC') !== s) {
    graphemes ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' }); // made at the first use: a kit module does nothing at load (kitpure)
    for (const { segment: g, index } of graphemes.segment(s)) {
      if (g.normalize('NFC') === g) continue;
      const first = String.fromCodePoint(g.codePointAt(0) as number);
      shown.fill(1, first.normalize('NFC') === first ? index + first.length : index, index + g.length);
    }
  }
  if (!shown.includes(1)) return { text: s, marked: false };
  let t = '';
  for (let i = 0; i < s.length;) {
    const c = String.fromCodePoint(s.codePointAt(i) as number);
    t += shown[i] ? asMark(c) : c;
    i += c.length;
  }
  return { text: t, marked: true };
}
/** A one-line value a person approves (a path, a folder, a parameter): keys hidden, then as written in `line` mode, bounded at `max`.
 *  `marked` as asWritten, read on the raw text too; `blind` when marked and the scrub hid something (it reads a key across an escape,
 *  taking the text between with it) or the marks pushed it past `max` (cut, ending in "…"): it cannot be read whole here. An unmarked
 *  value is cleaned and bounded (the cut is silent). */
export function asLine(raw: string, max: number, o?: { long?: boolean }): { text: string; marked: boolean; blind: boolean; long?: true } {
  const shown = scrubSecrets(raw), w = asWritten(shown, { line: true }), c = clean(w.text, max, { code: true });
  const m = w.marked || asWritten(raw, { line: true }).marked;
  if (!m && c.cut === 0 && !o?.long) return { text: c.text, marked: false, blind: false };
  // Past its bound (or `long`: a copy of it was cut before it got here) it is shown whole up to MAX_SHOW and Allow waits for the tick, so no
  // tail reaches Allow unseen; past MAX_SHOW it is cut with "…" and blind (gateBounds.test.tsx).
  const all = c.cut > 0 ? clean(w.text, MAX_SHOW, { code: true }) : c;
  const text = all.cut > 0 ? `${all.text}…` : all.text, blind = all.cut > 0 || (m && shown !== raw);
  return m ? { text, marked: true, blind } : { text, marked: true, blind, long: true };
}

// ── languages ──────────────────────────────────────────────────────────────
export type Family = 'js' | 'json' | 'sh' | 'py' | 'css' | 'html' | 'md' | 'diff' | 'text';
const ALIAS: Record<string, Family> = Object.create(null) as Record<string, Family>;
const LABEL: Record<string, string> = Object.create(null) as Record<string, string>;
([['js', 'js javascript jsx mjs cjs node', 'JavaScript'], ['js', 'ts typescript tsx mts cts', 'TypeScript'], ['json', 'json jsonc json5', 'JSON'],
  ['sh', 'sh bash shell zsh ksh console', 'Shell'], ['py', 'py python', 'Python'], ['css', 'css scss less', 'CSS'],
  ['html', 'html htm xml svg vue', 'HTML'], ['md', 'md markdown', 'Markdown'], ['diff', 'diff patch', 'Diff']] as const).forEach((r) => {
  for (const t of r[1].split(' ')) { ALIAS[t] = r[0]; LABEL[t] = r[2]; }
});
/** {fam: tokenizer family or 'text', label: shown name}. The fence tag wins; the file extension is the fallback. */
export function langOf(tag: unknown, path?: unknown): { fam: Family; label: string } {
  let t = String(tag || '').toLowerCase().replace(/^\.+/, '');
  if (t.length > 24) t = '';
  if (t && ALIAS[t]) return { fam: ALIAS[t] as Family, label: LABEL[t] as string };
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(path || '').slice(-40));
  const e = m ? (m[1] as string).toLowerCase() : '';
  if (e && ALIAS[e]) return { fam: ALIAS[e] as Family, label: LABEL[e] as string };
  const shown = /^[a-z0-9+#._-]{1,24}$/.test(t) ? t : e && /^[a-z0-9]{1,8}$/.test(e) ? e : '';
  return { fam: 'text', label: shown };
}

/** The languages the kit CodeBlock colours (its `lang`); any other block shows plain. The table is the kit's
 *  (kit/data/codeLang.ts), shared with Files' previews. */
export type KitLang = ColouredLang;
/** The kit CodeBlock language for a block: the fence tag's, else the file extension's (as langOf); 'plain' when neither names one. */
export function kitLang(tag: unknown, path?: unknown): KitLang | 'plain' {
  return codeLangOfWord(tag) ?? codeLangOfPath(path) ?? 'plain';
}

// ── tokenizers ─────────────────────────────────────────────────────────────
// Each takes (s, add) and calls add(cls, text) for the whole of s, in order. cls: '' plain, k keyword, s string,
// n number or literal, c comment, f function / tag / selector, a attribute / key / flag, t type or variable,
// i inserted, d deleted. Plain text between tokens is added as one run.
export type TokenClass = '' | 'k' | 's' | 'n' | 'c' | 'f' | 'a' | 't' | 'i' | 'd' | 'p';
export type Token = [TokenClass, string];
type Add = (cls: TokenClass, text: string) => void;

function isDigit(c: number): boolean { return c >= 48 && c <= 57; }
function isIdStart(c: number): boolean { return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36; }
function isIdPart(c: number): boolean { return isIdStart(c) || isDigit(c); }
function isNum(c: number): boolean { return isIdPart(c) || c === 46; }
function isSpace(c: number): boolean { return c === 32 || c === 9 || c === 10; }
function lineEnd(s: string, i: number): number { const j = s.indexOf('\n', i); return j < 0 ? s.length : j; }
// The end of the string literal opened at i with quote q: past the closing quote, at the newline of an
// unterminated single-line string (multi: it may run on), or at the end. A backslash skips the next character.
function quoted(s: string, i: number, q: number, multi: boolean): number {
  const n = s.length;
  let j = i + 1;
  while (j < n) {
    const c = s.charCodeAt(j);
    if (c === 92) { j += 2; continue; }
    if (c === q) return j + 1;
    if (c === 10 && !multi) return j;
    j++;
  }
  return n;
}
// The shared frame: tok(cls, to) closes the pending plain run, adds s[i..to) as cls and moves on.
interface Frame { i: number; p: number; n: number; tok: (cls: TokenClass, to: number) => void; end: () => void }
function frame(s: string, add: Add): Frame {
  const f: Frame = {
    i: 0, p: 0, n: s.length,
    tok: (cls, to) => {
      if (f.p < f.i) add('', s.slice(f.p, f.i));
      add(cls, s.slice(f.i, to));
      f.i = f.p = to;
    },
    end: () => { if (f.p < f.n) add('', s.slice(f.p)); },
  };
  return f;
}

const JS_KW = set('break case catch class const continue debugger default delete do else enum export extends finally for function if import in instanceof let new of return super switch this throw try typeof var void while with yield async await static get set interface type implements namespace declare readonly abstract as from public private protected keyof infer satisfies');
const JS_LIT = set('true false null undefined NaN Infinity');
function tokJS(s: string, add: Add): void {
  const f = frame(s, add), n = f.n;
  let c: number, d: number, j: number;
  while (f.i < n) {
    c = s.charCodeAt(f.i);
    if (c === 47) {
      d = s.charCodeAt(f.i + 1);
      if (d === 47) { f.tok('c', lineEnd(s, f.i)); continue; }
      if (d === 42) { j = s.indexOf('*/', f.i + 2); f.tok('c', j < 0 ? n : j + 2); continue; }
    } else if (c === 34 || c === 39) { f.tok('s', quoted(s, f.i, c, false)); continue; }
    else if (c === 96) { f.tok('s', quoted(s, f.i, c, true)); continue; }
    else if (isDigit(c) || (c === 46 && isDigit(s.charCodeAt(f.i + 1)))) {
      j = f.i + 1;
      while (j < n && isNum(s.charCodeAt(j))) j++;
      f.tok('n', j); continue;
    } else if (isIdStart(c)) {
      j = f.i + 1;
      while (j < n && isIdPart(s.charCodeAt(j))) j++;
      const w = s.slice(f.i, j);
      if (has(JS_KW, w)) f.tok('k', j);
      else if (has(JS_LIT, w)) f.tok('n', j);
      else if (s.charCodeAt(j) === 40) f.tok('f', j);
      else if (c >= 65 && c <= 90 && w.length > 1) f.tok('t', j);
      else f.i = j;
      continue;
    }
    f.i++;
  }
  f.end();
}

function tokJSON(s: string, add: Add): void {
  const f = frame(s, add), n = f.n;
  let c: number, j: number, k: number;
  while (f.i < n) {
    c = s.charCodeAt(f.i);
    if (c === 34) {
      j = quoted(s, f.i, 34, false);
      k = j;
      while (k < n && k - j < 64 && isSpace(s.charCodeAt(k))) k++;
      f.tok(s.charCodeAt(k) === 58 ? 'a' : 's', j); continue;
    }
    if (isDigit(c) || (c === 45 && isDigit(s.charCodeAt(f.i + 1)))) {
      j = f.i + 1;
      while (j < n && (isDigit(s.charCodeAt(j)) || s.charCodeAt(j) === 46 || s.charCodeAt(j) === 101 || s.charCodeAt(j) === 69 || s.charCodeAt(j) === 43 || s.charCodeAt(j) === 45)) j++;
      f.tok('n', j); continue;
    }
    if (c >= 97 && c <= 122) {
      j = f.i + 1;
      while (j < n && s.charCodeAt(j) >= 97 && s.charCodeAt(j) <= 122) j++;
      const w = s.slice(f.i, j);
      if (w === 'true' || w === 'false' || w === 'null') f.tok('k', j); else f.i = j;
      continue;
    }
    f.i++;
  }
  f.end();
}

const SH_KW = set('if then else elif fi for while until do done case esac in function select time');
const SH_KEEP = set('if then else elif while until do time ! { sudo env xargs nohup exec command'); // the next word is still a command
function shWordEnd(c: number): boolean {
  return isSpace(c) || c === 59 || c === 124 || c === 38 || c === 60 || c === 62 || c === 40 || c === 41 || c === 96 || c === 34 || c === 39 || c === 36;
}
function tokSH(s: string, add: Add): void {
  const f = frame(s, add), n = f.n;
  let cmd = true, c: number, j: number, d: number;
  while (f.i < n) {
    c = s.charCodeAt(f.i);
    if (c === 10 || c === 59 || c === 124 || c === 40 || c === 41 || c === 96 || c === 38) {
      if (c === 38 && f.i > 0 && (s.charCodeAt(f.i - 1) === 62 || s.charCodeAt(f.i - 1) === 60)) { f.i++; continue; } // 2>&1
      cmd = c !== 41; f.i++; continue;
    }
    if (c === 32 || c === 9 || c === 60 || c === 62) { f.i++; continue; }
    if (c === 35 && (f.i === 0 || shWordEnd(s.charCodeAt(f.i - 1)))) { f.tok('c', lineEnd(s, f.i)); continue; }
    if (c === 39) { j = s.indexOf("'", f.i + 1); f.tok('s', j < 0 ? n : j + 1); cmd = false; continue; }
    if (c === 34) { f.tok('s', quoted(s, f.i, 34, true)); cmd = false; continue; }
    if (c === 92) { f.i += 2; continue; }
    if (c === 36) {
      d = s.charCodeAt(f.i + 1);
      if (d === 40) { f.i += 2; cmd = true; continue; }
      if (d === 123) { j = s.indexOf('}', f.i + 2); const le = lineEnd(s, f.i); f.tok('t', j < 0 || j > le ? le : j + 1); continue; }
      if (isIdStart(d) || isDigit(d) || d === 64 || d === 42 || d === 35 || d === 63 || d === 33) {
        j = f.i + 2;
        if (isIdStart(d)) while (j < n && isIdPart(s.charCodeAt(j))) j++;
        f.tok('t', j); continue;
      }
      f.i++; continue;
    }
    j = f.i;
    while (j < n && !shWordEnd(s.charCodeAt(j))) { if (s.charCodeAt(j) === 92) j++; j++; }
    if (j > n) j = n;
    if (j === f.i) { f.i++; continue; }
    const w = s.slice(f.i, j);
    if (cmd) {
      let eq = 0;
      while (eq < w.length && isIdPart(w.charCodeAt(eq))) eq++;
      // NAME=value: the name is a variable, an unquoted value is plain
      if (eq > 0 && eq < w.length && w.charCodeAt(eq) === 61 && !isDigit(w.charCodeAt(0))) { f.tok('t', f.i + eq); f.i = j; continue; }
      if (has(SH_KW, w)) { f.tok('k', j); cmd = has(SH_KEEP, w); continue; }
      f.tok('f', j); cmd = has(SH_KEEP, w); continue;
    }
    if (c === 45 && w.length > 1) f.tok('a', j);
    else if (isDigit(c) && /^[0-9.]+$/.test(w.length > 40 ? '' : w)) f.tok('n', j);
    else f.i = j;
  }
  f.end();
}

const PY_KW = set('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case');
const PY_LIT = set('True False None');
function pyPrefix(s: string, a: number, b: number): boolean {
  for (let k = a; k < b; k++) if ('rRbBfFuU'.indexOf(s.charAt(k)) < 0) return false;
  return b - a <= 2;
}
// The end of the Python string whose prefix starts at a and whose opening quote q is at b (triple-quoted: to
// the matching triple).
function pyString(s: string, _a: number, b: number, q: number): number {
  const qs = String.fromCharCode(q), n = s.length;
  if (s.charCodeAt(b + 1) === q && s.charCodeAt(b + 2) === q) {
    const j = s.indexOf(qs + qs + qs, b + 3);
    return j < 0 ? n : j + 3;
  }
  return quoted(s, b, q, false);
}
function tokPY(s: string, add: Add): void {
  const f = frame(s, add), n = f.n;
  let c: number, j: number, after: TokenClass = '';
  while (f.i < n) {
    c = s.charCodeAt(f.i);
    if (c === 35) { f.tok('c', lineEnd(s, f.i)); continue; }
    if (c === 34 || c === 39) { f.tok('s', pyString(s, f.i, f.i, c)); continue; }
    if (isDigit(c) || (c === 46 && isDigit(s.charCodeAt(f.i + 1)))) {
      j = f.i + 1;
      while (j < n && isNum(s.charCodeAt(j))) j++;
      f.tok('n', j); continue;
    }
    if (c === 64 && (f.i === 0 || s.charCodeAt(f.i - 1) === 10)) {
      j = f.i + 1;
      while (j < n && (isIdPart(s.charCodeAt(j)) || s.charCodeAt(j) === 46)) j++;
      f.tok('f', j); continue;
    }
    if (isIdStart(c)) {
      j = f.i + 1;
      while (j < n && isIdPart(s.charCodeAt(j))) j++;
      const q = s.charCodeAt(j);
      if ((q === 34 || q === 39) && pyPrefix(s, f.i, j)) { f.tok('s', pyString(s, f.i, j, q)); continue; }
      const w = s.slice(f.i, j);
      if (after) { f.tok(after, j); after = ''; continue; }
      if (has(PY_KW, w)) { f.tok('k', j); after = w === 'def' ? 'f' : w === 'class' ? 't' : ''; }
      else if (has(PY_LIT, w)) f.tok('n', j);
      else if (q === 40) f.tok('f', j);
      else f.i = j;
      continue;
    }
    f.i++;
  }
  f.end();
}

function tokCSS(s: string, add: Add): void {
  const f = frame(s, add), n = f.n;
  let depth = 0, c: number, d: number, j: number;
  while (f.i < n) {
    c = s.charCodeAt(f.i);
    if (c === 47 && s.charCodeAt(f.i + 1) === 42) { j = s.indexOf('*/', f.i + 2); f.tok('c', j < 0 ? n : j + 2); continue; }
    if (c === 34 || c === 39) { f.tok('s', quoted(s, f.i, c, false)); continue; }
    if (c === 123) { depth++; f.i++; continue; }
    if (c === 125) { if (depth > 0) depth--; f.i++; continue; }
    if (c === 64 && isIdStart(s.charCodeAt(f.i + 1))) {
      j = f.i + 1;
      while (j < n && (isIdPart(s.charCodeAt(j)) || s.charCodeAt(j) === 45)) j++;
      f.tok('k', j); continue;
    }
    if (depth > 0 && c === 33 && isIdStart(s.charCodeAt(f.i + 1))) {
      j = f.i + 1;
      while (j < n && isIdPart(s.charCodeAt(j))) j++;
      f.tok('k', j); continue;
    }
    if (depth > 0 && c === 35) {
      j = f.i + 1;
      while (j < n && j - f.i <= 9 && /[0-9a-fA-F]/.test(s.charAt(j))) j++;
      if (j - f.i === 4 || j - f.i === 5 || j - f.i === 7 || j - f.i === 9) { f.tok('n', j); continue; }
      f.i++; continue;
    }
    if (isDigit(c) || (c === 46 && isDigit(s.charCodeAt(f.i + 1))) || (depth > 0 && (c === 45 || c === 43) && isDigit(s.charCodeAt(f.i + 1)))) {
      j = f.i + 1;
      while (j < n && (isDigit(s.charCodeAt(j)) || s.charCodeAt(j) === 46)) j++;
      while (j < n && (isIdStart(s.charCodeAt(j)) || s.charCodeAt(j) === 37)) j++;
      f.tok('n', j); continue;
    }
    if (isIdStart(c) || c === 45 || (depth === 0 && (c === 46 || c === 35) && isIdStart(s.charCodeAt(f.i + 1)))) {
      j = f.i + 1;
      while (j < n && (isIdPart(s.charCodeAt(j)) || s.charCodeAt(j) === 45)) j++;
      if (depth === 0) { f.tok('f', j); continue; }
      d = j;
      while (d < n && d - j < 16 && (s.charCodeAt(d) === 32 || s.charCodeAt(d) === 9)) d++;
      if (s.charCodeAt(d) === 58) f.tok('a', j);
      else if (s.charCodeAt(j) === 40) f.tok('f', j);
      else f.i = j;
      continue;
    }
    f.i++;
  }
  f.end();
}

function tokHTML(s: string, add: Add): void {
  const f = frame(s, add), n = f.n;
  let j: number, k: number, c: number;
  while (f.i < n) {
    j = s.indexOf('<', f.i);
    if (j < 0) break;
    f.i = j;
    c = s.charCodeAt(j + 1);
    if (c === 33 && s.charCodeAt(j + 2) === 45 && s.charCodeAt(j + 3) === 45) { k = s.indexOf('-->', j + 4); f.tok('c', k < 0 ? n : k + 3); continue; }
    if (c === 33 || c === 63) { k = s.indexOf('>', j + 2); f.tok('c', k < 0 ? n : k + 1); continue; }
    const close = c === 47, ns = j + (close ? 2 : 1);
    if (!isIdStart(s.charCodeAt(ns))) { f.i = j + 1; continue; }
    f.i = ns;
    k = ns + 1;
    while (k < n && (isIdPart(s.charCodeAt(k)) || s.charCodeAt(k) === 45 || s.charCodeAt(k) === 58)) k++;
    const name = s.slice(ns, k).toLowerCase();
    f.tok('f', k);
    let selfClose = false;
    while (f.i < n) { // the attributes, up to the tag's closing >
      c = s.charCodeAt(f.i);
      if (c === 62) { f.i++; break; }
      if (c === 47 && s.charCodeAt(f.i + 1) === 62) { selfClose = true; f.i += 2; break; }
      if (isSpace(c) || c === 47) { f.i++; continue; }
      if (c === 34 || c === 39) { f.tok('s', quoted(s, f.i, c, true)); continue; }
      k = f.i + 1;
      while (k < n && !isSpace(s.charCodeAt(k)) && s.charCodeAt(k) !== 61 && s.charCodeAt(k) !== 62 && s.charCodeAt(k) !== 47) k++;
      f.tok('a', k);
      if (s.charCodeAt(f.i) === 61) {
        f.i++;
        c = s.charCodeAt(f.i);
        if (c === 34 || c === 39) f.tok('s', quoted(s, f.i, c, true));
        else { k = f.i; while (k < n && !isSpace(s.charCodeAt(k)) && s.charCodeAt(k) !== 62) k++; if (k > f.i) f.tok('s', k); }
      }
    }
    if (!close && !selfClose && (name === 'script' || name === 'style')) { // embedded code: coloured by its own tokenizer
      k = s.indexOf('</' + name, f.i);
      if (k < 0) k = n;
      if (f.p < f.i) add('', s.slice(f.p, f.i));
      (name === 'script' ? tokJS : tokCSS)(s.slice(f.i, k), add);
      f.i = f.p = k;
    }
  }
  f.end();
}

function tokMDInline(s: string, add: Add): void {
  const n = s.length;
  let i = 0, p = 0, j: number, k: number;
  function tok(cls: TokenClass, a: number, b: number) { if (p < a) add('', s.slice(p, a)); add(cls, s.slice(a, b)); i = p = b; }
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 96) { j = s.indexOf('`', i + 1); if (j > 0) { tok('s', i, j + 1); continue; } }
    else if (c === 42 && s.charCodeAt(i + 1) === 42) { j = s.indexOf('**', i + 2); if (j > 0) { tok('t', i, j + 2); continue; } }
    else if (c === 91) {
      j = s.indexOf('](', i + 1);
      if (j > 0) { k = s.indexOf(')', j + 2); if (k > 0) { tok('f', i, j + 1); tok('s', i, k + 1); continue; } }
    }
    i++;
  }
  if (p < n) add('', s.slice(p));
}
function tokMD(s: string, add: Add): void {
  const n = s.length;
  let i = 0, fence = false;
  while (i < n) {
    const e = lineEnd(s, i), line = s.slice(i, e);
    let sp = 0;
    while (sp < 3 && line.charCodeAt(sp) === 32) sp++;
    const c = line.charCodeAt(sp), t = line.slice(sp, sp + 3);
    if (t === '```' || t === '~~~') { fence = !fence; add('c', line); }
    else if (fence) add('', line);
    else if (c === 35) { let h = sp; while (line.charCodeAt(h) === 35) h++; if (h - sp <= 6 && (h === line.length || line.charCodeAt(h) === 32)) add('k', line); else tokMDInline(line, add); }
    else if (c === 62) add('c', line);
    else if ((c === 45 || c === 42 || c === 43) && line.charCodeAt(sp + 1) === 32) { add('n', line.slice(0, sp + 2)); tokMDInline(line.slice(sp + 2), add); }
    else tokMDInline(line, add);
    if (e < n) add('', '\n');
    i = e + 1;
  }
}

function tokDiff(s: string, add: Add): void {
  const n = s.length;
  let i = 0;
  while (i < n) {
    const e = lineEnd(s, i), line = s.slice(i, e), c = line.charCodeAt(0);
    let cls: TokenClass = '';
    if (line.slice(0, 3) === '+++' || line.slice(0, 3) === '---' || line.slice(0, 4) === 'diff' || line.slice(0, 5) === 'index') cls = 'c';
    else if (c === 43) cls = 'i';
    else if (c === 45) cls = 'd';
    else if (c === 64 && line.charCodeAt(1) === 64) cls = 'k';
    add(cls, e < n ? line + '\n' : line);
    i = e + 1;
  }
}

const FAMILIES: Readonly<Record<string, (s: string, add: Add) => void>> = { js: tokJS, json: tokJSON, sh: tokSH, py: tokPY, css: tokCSS, html: tokHTML, md: tokMD, diff: tokDiff };
/** [[cls, text], ...] covering text exactly. Only the first HL_MAX characters (to a line end) are coloured; an
 *  unknown family, or the remainder, is plain. */
export function tokenize(fam: unknown, text: unknown): Token[] {
  const s = typeof text === 'string' ? text : '', out: Token[] = [];
  let last: Token | null = null;
  function add(cls: TokenClass, t: string) {
    if (!t) return;
    if (last && last[0] === cls) { last[1] += t; return; }
    last = [cls, t]; out.push(last);
  }
  const tk = typeof fam === 'string' && Object.prototype.hasOwnProperty.call(FAMILIES, fam) ? FAMILIES[fam] : null;
  if (!tk) { add('', s); return out; }
  if (s.length > HL_MAX) {
    let cut = s.lastIndexOf('\n', HL_MAX);
    if (cut < HL_MAX / 2) cut = HL_MAX;
    tk(s.slice(0, cut), add);
    add('', s.slice(cut));
  } else tk(s, add);
  return out;
}

// ── text structure ─────────────────────────────────────────────────────────
export type Segment = { k: 'text'; s: string } | { k: 'code'; s: string; lang: string; open: boolean };
// segments(text): fenced code blocks (``` or ~~~, up to three leading spaces) and the text between them. A fence
// that never closes runs to the end (open: true, as a reply is while it streams).
function fenceOf(line: string): { ch: string; len: number; tag: string; rest: string } | null {
  let i = 0;
  while (i < 3 && line.charCodeAt(i) === 32) i++;
  const c = line.charAt(i);
  if (c !== '`' && c !== '~') return null;
  let j = i;
  while (line.charAt(j) === c) j++;
  if (j - i < 3) return null;
  const info = line.slice(j).replace(/^[ \t]+/, '');
  if (c === '`' && info.indexOf('`') >= 0) return null;
  const tag = (/^[^\s]*/.exec(info.slice(0, 64)) as RegExpExecArray)[0];
  return { ch: c, len: j - i, tag, rest: line.slice(j).replace(/[ \t]+$/, '') };
}
export function segments(text: unknown): Segment[] {
  const s = typeof text === 'string' ? text : '', n = s.length, out: Segment[] = [];
  let i = 0, buf: string[] = [], code: { ch: string; len: number; tag: string; lines: string[] } | null = null;
  function flushText() { if (buf.length) { out.push({ k: 'text', s: buf.join('\n') }); buf = []; } }
  while (i <= n) {
    let e = s.indexOf('\n', i);
    if (e < 0) e = n;
    const line = s.slice(i, e), fc = fenceOf(line);
    if (code) {
      if (fc && fc.ch === code.ch && fc.len >= code.len && fc.rest === '') { out.push({ k: 'code', s: code.lines.join('\n'), lang: code.tag, open: false }); code = null; }
      else code.lines.push(line);
    } else if (fc) {
      flushText();
      code = { ch: fc.ch, len: fc.len, tag: fc.tag, lines: [] };
    } else buf.push(line);
    if (e >= n) break;
    i = e + 1;
  }
  if (code) out.push({ k: 'code', s: code.lines.join('\n'), lang: code.tag, open: true });
  else flushText();
  return out;
}

// ── diff ───────────────────────────────────────────────────────────────────
export interface DiffRow { t: '=' | '-' | '+'; s: string }
export interface DiffParts { rows: DiffRow[]; added: number; removed: number }
// diffRows(oldText, newText, same?): the changed middle (common leading and trailing lines trimmed, three lines of
// context kept), diffed by LCS when it is small, else removed lines then added. same, one entry per line of each side, is what the
// lines are compared on when what they show is not (a key hidden alike in two different lines); the rows still show the text.
export function diffRows(a: string, b: string, same?: { a: string[]; b: string[] }): DiffParts {
  const A = a === '' ? [] : a.split('\n'), B = b === '' ? [] : b.split('\n'); // no text is no lines
  const ok = !!same && same.a.length === A.length && same.b.length === B.length;
  const KA = ok && same ? same.a : A, KB = ok && same ? same.b : B;
  let pre = 0;
  const m = Math.min(A.length, B.length);
  while (pre < m && KA[pre] === KB[pre]) pre++;
  let suf = 0;
  while (suf < m - pre && KA[A.length - 1 - suf] === KB[B.length - 1 - suf]) suf++;
  const MA = A.slice(pre, A.length - suf), MB = B.slice(pre, B.length - suf), rows: DiffRow[] = [];
  const SA = KA.slice(pre, A.length - suf), SB = KB.slice(pre, B.length - suf);
  let added = 0, removed = 0, k: number;
  for (k = Math.max(0, pre - 3); k < pre; k++) rows.push({ t: '=', s: A[k] as string });
  if (MA.length * MB.length <= LCS_CELLS) {
    const w = MB.length + 1, L = new Uint32Array((MA.length + 1) * w);
    let x: number, y: number;
    for (x = MA.length - 1; x >= 0; x--) for (y = MB.length - 1; y >= 0; y--) {
      L[x * w + y] = SA[x] === SB[y] ? (L[(x + 1) * w + y + 1] as number) + 1 : Math.max(L[(x + 1) * w + y] as number, L[x * w + y + 1] as number);
    }
    x = 0; y = 0;
    while (x < MA.length || y < MB.length) {
      if (x < MA.length && y < MB.length && SA[x] === SB[y]) { rows.push({ t: '=', s: MA[x] as string }); x++; y++; }
      else if (x < MA.length && (y === MB.length || (L[(x + 1) * w + y] as number) >= (L[x * w + y + 1] as number))) { rows.push({ t: '-', s: MA[x++] as string }); removed++; }
      else { rows.push({ t: '+', s: MB[y++] as string }); added++; }
    }
  } else {
    for (const l of MA) rows.push({ t: '-', s: l });
    for (const l of MB) rows.push({ t: '+', s: l });
    added = MB.length; removed = MA.length;
  }
  for (k = 0; k < Math.min(3, suf); k++) rows.push({ t: '=', s: A[A.length - suf + k] as string });
  return { rows, added, removed };
}
// The daemon's own tagged edit detail ("H +1 -1 lines", "C l r text", "R l text", "A r text"), when a call came
// without its old and new text. null when the text is not that format.
export function taggedRows(d: string): DiffParts | null {
  if (!/^H [+-]\d/.test(d)) return null;
  const rows: DiffRow[] = [], ls = d.split('\n');
  let added = 0, removed = 0;
  for (let i = 1; i < ls.length; i++) {
    const line = ls[i] as string;
    const m = /^([CRA]) (?:\d+ )?(?:\d+ )?/.exec(line);
    if (!m) continue;
    const t = line.slice(m[0].length);
    if (m[1] === 'R') { rows.push({ t: '-', s: t }); removed++; } else if (m[1] === 'A') { rows.push({ t: '+', s: t }); added++; } else rows.push({ t: '=', s: t });
  }
  return rows.length ? { rows, added, removed } : null;
}

// ── block helpers ──────────────────────────────────────────────────────────
export function lineCount(s: string): number {
  let c = 1, i = -1;
  while ((i = s.indexOf('\n', i + 1)) >= 0) c++;
  return c;
}
/** The first PEEK_LINES lines, at most COLLAPSE_CHARS characters. */
export function peekOf(s: string): string {
  let i = -1;
  for (let k = 0; k < PEEK_LINES; k++) { i = s.indexOf('\n', i + 1); if (i < 0) break; }
  let t = i < 0 ? s : s.slice(0, i);
  if (t.length > COLLAPSE_CHARS) { t = t.slice(0, COLLAPSE_CHARS); const e = t.charCodeAt(t.length - 1); if (e >= 0xd800 && e <= 0xdbff) t = t.slice(0, -1); }
  return t;
}
/** A code block's model: cleaned text, language, whether it collapses (and how many lines it has) and the cut. */
export function blockModel(src: unknown, tag: unknown, path?: unknown): { text: string; fam: Family; label: string; lines: number; long: boolean; cut: number } {
  const c = clean(src, MAX_SHOW, { code: true }), text = c.text.replace(/\n+$/, ''), lg = langOf(tag, path);
  const lines = lineCount(text);
  return { text, fam: lg.fam, label: lg.label, lines, long: lines > COLLAPSE_LINES || text.length > COLLAPSE_CHARS, cut: c.cut };
}

/** Inline `code` in a run of text: the backticks stay (the text is what the model wrote), the span is mono. */
export function inlineParts(s: string): Array<string | { code: string }> {
  const out: Array<string | { code: string }> = [], n = s.length;
  let i = 0;
  while (i < n) {
    const a = s.indexOf('`', i);
    if (a < 0) break;
    const e = s.indexOf('`', a + 1), nl = s.indexOf('\n', a + 1);
    if (e < 0 || (nl >= 0 && nl < e) || e === a + 1) { out.push(s.slice(i, a + 1)); i = a + 1; continue; }
    if (a > i) out.push(s.slice(i, a));
    out.push({ code: s.slice(a, e + 1) });
    i = e + 1;
  }
  if (i < n) out.push(s.slice(i));
  return out;
}

/** The reply's model: cleaned prose split into text and fenced-code segments, and the cut. */
export function replyModel(text: unknown): { segs: Segment[]; cut: number } {
  const c = clean(scrubSecrets(str(text)), MAX_SHOW), segs = segments(c.text);
  return { segs: segs.length ? segs : [{ k: 'text', s: c.text }], cut: c.cut };
}

// A copy of the params fit to show, own keys only, null-prototype objects, daemon-private keys (_x) dropped at the top. A key or token in a
// name or a value is hidden first (scrubSecrets, before cleaning can join one split by what can't be seen); two names hidden alike stay
// two entries. By default every key and string is then cleaned (an escape sequence in a value would otherwise reach the page as \u001b in
// the JSON) and depth and size are bounded; `whole` (a workflow's save card) keeps every other key and value as it is, unbounded, but for a key or token in a name or a
// value, which this copy hides (scrubSecrets, before the escapes, so a key split by what can't be seen is hidden too; the save keeps its
// bytes), and prettyJSON then writes what can't be seen as escapes.
// `left.cut` is set when the bounded copy left anything out (a string or a key past its bound, entries past `left.n`, a level past 12):
// a copy that is not the whole input must not pass for it (gateBounds.test.tsx).
function shownValue(v: unknown, depth: number, left: { n: number; cut?: boolean }, whole = false): unknown {
  if (typeof v === 'string') {
    if (whole) return scrubSecrets(v);
    const c = clean(scrubSecrets(v), 20000, { code: true });
    if (c.cut > 0) left.cut = true;
    return c.text;
  }
  if (!v || typeof v !== 'object') return v;
  if (!whole && (depth > 12 || left.n <= 0)) { left.cut = true; return '…'; }
  if (Array.isArray(v)) {
    const out: unknown[] = [];
    let i = 0;
    for (; i < v.length && (whole || left.n-- > 0); i++) out.push(shownValue(v[i], depth + 1, left, whole));
    if (i < v.length) left.cut = true;
    return out;
  }
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const ks = Object.keys(v);
  let i = 0;
  for (; i < ks.length && (whole || left.n-- > 0); i++) {
    const k = ks[i] as string;
    if (depth === 0 && k.charAt(0) === '_') continue;
    let name = scrubSecrets(k);
    if (!whole) { const c = clean(name, 200, { code: true }); if (c.cut > 0) left.cut = true; name = c.text; }
    out[unclaimed(out, name)] = shownValue((v as Record<string, unknown>)[k], depth + 1, left, whole);
  }
  if (i < ks.length) left.cut = true;
  return out;
}
/** `k`, or when `o` has it already (two names hidden alike), `k #2`, `k #3`…: every entry of the whole JSON stays. */
function unclaimed(o: Record<string, unknown>, k: string): string {
  if (!(k in o)) return k;
  let n = 2;
  while (`${k} #${n}` in o) n++;
  return `${k} #${n}`;
}
// In the whole JSON, what a person can't see or tell from a space is written as JSON's own escape, as JSON.stringify already does below 0x20:
// the text means the same, and the escapes hide or drop nothing. ASCII space and the layout's newlines stay.
const UNSEEN = /(?! )[\x7f-\x9f\p{Default_Ignorable_Code_Point}\p{Cf}\p{Zl}\p{Zp}\p{Zs}\p{Co}]/gu;
const asEscape = (c: string): string => Array.from({ length: c.length }, (_, i) => `\\u${c.charCodeAt(i).toString(16).padStart(4, '0')}`).join('');
export function prettyJSON(p: unknown, whole = false): string {
  return jsonOf(p, whole).j;
}
/** prettyJSON, and whether its bounded copy left anything out (never in `whole`). '' when it cannot be built. */
function jsonOf(p: unknown, whole: boolean): { j: string; cut: boolean } {
  const left: { n: number; cut?: boolean } = { n: 5000 };
  try {
    const j = JSON.stringify(shownValue(p, 0, left, whole), null, 2) ?? ''; // reason: shown only by Reply.tsx FoldedCode (via the gate card's code Part, tag json), which passes the kit CodeBlock lang from kitLang
    return { j: whole ? j.replace(UNSEEN, asEscape) : j, cut: !!left.cut };
  } catch { return { j: '', cut: false }; }
}

// ── the confirm card's tool input ──────────────────────────────────────────
/** One part of a confirm card's input, in order. `key` names a part's own expanded state. */
export type InputPart =
  | { k: 'warn'; text: string }
  /** `marked`: the text is shown as written (asWritten), with marks for what a screen would hide or change: the card says so.
   *  `blind`: marked, and still not shown exactly (a key hidden in it, or cut): it cannot be allowed from the card. */
  | { k: 'path'; text: string; marked?: true; blind?: true; long?: true }
  | { k: 'code'; key: string; src: string; tag: string; path?: string; wrap?: boolean; marked?: true; blind?: true; long?: true }
  | { k: 'diff'; key: string; parts: DiffParts; path: string; cut: number; marked?: true; blind?: true; long?: true }
  /** `marked`/`blind` as for a path: the value shown as written (asLine). */
  | { k: 'kv'; name: string; value: string; marked?: true; blind?: true; long?: true }
  | { k: 'rich'; text: string }
  | { k: 'wfNote'; note: 'new' | 'replaces' | 'mayReplace' | 'noRun' | 'together' | 'goesOn' | 'unreached' | 'noQuestion' | 'askBackground' | 'askBackgroundFails' | 'input' | 'whole' }
  | { k: 'wfStep'; n: number; id: WfName; kind: WfStepKind; arg: string }
  /** One route out of a step, decided from the saved text, never from what the card shows of it: `end` (the id is exactly `stop`: this path
   *  ends, and any other route goes on), `falls` (an answer with no step of its own: the steps under Otherwise), else `to`, the step's id, and
   *  `n`, its number (0 for none). `test`: its condition. `answer`: the question's answer it belongs to (null: the step's own route);
   *  `otherwise`: a question's own next steps. */
  | { k: 'wfNext'; end: boolean; falls: boolean; to: WfName; n: number; test: WfName; answer: WfName | null; otherwise: boolean }
  | { k: 'wfMore'; n: number; marked?: true; blind?: true };
/** A step id, an answer's title or a condition as a save card shows it. `odd`: cleaning would change it or leave nothing, or it holds a
 *  character a person can't see or can't tell from another (a control, a bidi or other format character, a non-ASCII space, the braille
 *  blank, an ASCII space at either end), or, in an answer's title, a double quote: it shows as written instead, in JSON's quotes with the
 *  escapes the definition below uses (the braille blank too), and the card marks it. Otherwise cleaned, bounded, marked when cut. */
export interface WfName { text: string; odd: boolean; why?: WfOdd }
/** Why a name shows as written, when nothing in it is hidden: it is empty or only spaces, it has an
 *  ASCII space at either end, or it is an answer's title holding a double quote. Absent: it holds a character shown as its code. */
export type WfOdd = 'blank' | 'edge' | 'quote';
/** What one workflow step does, as a save card says it. */
export type WfStepKind = 'bash' | 'agent' | 'fork' | 'ask' | 'tool' | 'workflow' | 'foreach' | 'other';
const WRITE = set('write_file write_minified_file'), EDIT = set('edit_file edit_minified_file');
// The key/value rows for the params a tool kind does not show itself ("mode": "0755"). Daemon-private keys (_x)
// never show. A key or token in a name or a value is hidden before it is cleaned.
function extras(p: Record<string, unknown>, skip: readonly string[]): InputPart[] {
  const rows: InputPart[] = [];
  for (const k of Object.keys(p)) {
    if (k.charAt(0) === '_' || skip.includes(k)) continue;
    const v = p[k];
    let t: string, long = false;
    if (typeof v === 'string') t = v;
    // Hidden before it is written as JSON: JSON writes a control or a lone surrogate as an escape (\u0007), which no key pattern reads through.
    // A bounded copy that left something out is replaced by the whole one; a copy that cannot be built, bounded or
    // whole, is blind, never an empty row.
    else {
      const left: { n: number; cut?: boolean } = { n: 5000 };
      let failed = false;
      try { t = JSON.stringify(shownValue(v, 1, left)) ?? ''; } catch { t = ''; failed = true; }
      if (left.cut && !failed) {
        try { t = JSON.stringify(shownValue(v, 1, left, true)) ?? ''; } catch { t = ''; }
        failed = !t;
      }
      if (failed) { rows.push({ k: 'kv', name: clean(scrubSecrets(k), 80).text, value: '…', marked: true, blind: true }); continue; }
      long = !!left.cut;
    }
    const name = clean(scrubSecrets(k), 80).text, a = asLine(t, 300, { long });
    rows.push(a.marked ? { k: 'kv', name, value: a.text, ...markOf(a) } : { k: 'kv', name, value: a.text });
  }
  return rows;
}
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const WF_STEPS_SHOWN = 30;
/** A key or token in it hidden, then cleaned and bounded, with a mark when it was cut: the definition below keeps it whole. */
// How many times capped() cut: workflowParts reads it around the steps view it draws (a cut name or field there sends the reader to the
// whole JSON, which is then shown unfolded and needs the tick).
let cappedCuts = 0;
function capped(v: unknown, max: number, o?: { code?: boolean }): string {
  const c = clean(typeof v === 'string' ? scrubSecrets(v) : v, max, o);
  if (c.cut > 0) cappedCuts++;
  return c.cut > 0 ? `${c.text}…` : c.text;
}
const UNSEEN_ONE = new RegExp(UNSEEN.source, 'u');
/** A C0 or C1 control or DEL, as the agent's firstControlChar finds them. */
function hasControl(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return true;
  }
  return false;
}
/** What the agent's strings.TrimSpace trims (Go's unicode.IsSpace). Not JS trim: that also trims U+FEFF, and keeps U+0085. */
const GO_SPACE = '\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000';
const GO_BLANK = new RegExp(`^[${GO_SPACE}]*$`), GO_EDGE = new RegExp(`^[${GO_SPACE}]|[${GO_SPACE}]$`);
const GO_TRIM = new RegExp(`^[${GO_SPACE}]+|[${GO_SPACE}]+$`, 'g');
/** Go's strings.TrimSpace: a lone U+FEFF stays (and then shows marked), a U+0085 goes. */
const goTrim = (s: string): string => s.replace(GO_TRIM, '');
// Names that read alike: an ASCII space at either end (`deploy` and `deploy `), or U+2800, the braille blank, which draws as a space and is
// neither a space nor a format character to UNSEEN.
const LOOKALIKE = /^ | $|\u2800/, BRAILLE_BLANK = /\u2800/g;
const EDGE_SPACE = /^ | $/, BRAILLE_BLANK_ONE = /\u2800/;
// A double quote inside an answer's title would close the card's own quotes around it (`Answer “No”, then”`).
const QUOTE = /["\u201c\u201d\u201e\u201f\uff02]/;
/** A condition as the agent runs it: a blank one (by its TrimSpace) always passes, any other runs as written (evaluateExecuteIfWith). */
const runsAs = (c: string): string => (GO_BLANK.test(c) ? '' : c);
const REGEX_SYNTAX = /[\\^$.*+?()[\]{}|/]/g;
/** Go's strings.EqualFold: the same under simple Unicode case folding, which a case-insensitive `u` pattern also matches by. */
function foldEq(a: string, b: string): boolean {
  return new RegExp(`^${a.replace(REGEX_SYNTAX, '\\$&')}$`, 'iu').test(b);
}
// A key or token in a name is hidden first, so `odd` and the escapes read what the card shows.
// `quoted`: the card shows it inside its own quotes (an answer's title).
function wfName(saved: string, max: number, o?: { code?: boolean; quoted?: boolean }): WfName {
  const v = scrubSecrets(saved);
  if (v.trim() !== '' && !hasControl(v) && !UNSEEN_ONE.test(v) && !LOOKALIKE.test(v) && !(o?.quoted && QUOTE.test(v))
    && clean(v, undefined, o).text === v) return { text: capped(v, max, o), odd: false };
  const text = capped(JSON.stringify(v).replace(UNSEEN, asEscape).replace(BRAILLE_BLANK, asEscape), 2 * max);
  if (hasControl(v) || UNSEEN_ONE.test(v) || BRAILLE_BLANK_ONE.test(v)) return { text, odd: true };
  const why: WfOdd | null = v.trim() === '' ? 'blank' : EDGE_SPACE.test(v) ? 'edge' : o?.quoted && QUOTE.test(v) ? 'quote' : null;
  return why ? { text, odd: true, why } : { text, odd: true };
}
interface WfRef { id: string; test: string }
/** `options`: a question's answers (the agent reads them on nothing else); `refs`: every route the step names, options on any step
 *  included, which the agent checks all the same. */
interface WfStep { id: string; s: Record<string, unknown>; next: WfRef[]; options: { title: string; to: WfRef[] }[]; refs: WfRef[] }
const own = (o: Record<string, unknown>, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
/** A route list in every shape the agent takes (its normalizeStepRefList and lintRefList): one id, one reference, or a list of either, each
 *  id a string and each condition, when there is one, a string. null for any other shape (null included), which the agent refuses, so the
 *  card shows the JSON alone. A step listed twice runs when any of its entries passes (the agent checks each, then its realRefs keeps one),
 *  and a stop listed twice ends the path when any applies: one route only when every entry's condition runs alike (runsAs), else null. */
function wfRefs(v: unknown): WfRef[] | null {
  if (v === undefined) return [];
  const refs: WfRef[] = [], runs = new Map<string, string>();
  for (const x of Array.isArray(v) ? v : [v]) {
    const r = obj(x);
    const id = typeof x === 'string' ? x : str(r?.id);
    if (!id || (r && own(r, 'execute_if') && typeof r.execute_if !== 'string')) return null;
    const test = str(r?.execute_if), was = runs.get(id);
    if (was !== undefined) {
      if (was !== runsAs(test)) return null;
      continue;
    }
    runs.set(id, runsAs(test));
    refs.push({ id, test: goTrim(test) });
  }
  return refs;
}
function wfStepOf(id: string, raw: unknown): WfStep | null {
  const s = obj(raw);
  if (!s || !id) return null;
  const next = wfRefs(s.next_steps);
  // The agent checks options on every step (lintWorkflowStepShapes, validateWorkflowRefs) but reads them only on a question.
  const asks = s.type === 'tool' && s.tool === 'ask_question_to_user';
  const opts: unknown[] | null = s.options === undefined ? [] : Array.isArray(s.options) ? s.options : null;
  if (!next || !opts) return null;
  const options: WfStep['options'] = [], refs = [...next];
  for (const o of opts) {
    const r = obj(o), to = r && wfRefs(r.steps);
    if (!r || !to || (own(r, 'title') && typeof r.title !== 'string')) return null;
    for (const x of to) refs.push(x);
    if (!asks) continue;
    // On an answer, a stop that applies ends the run whatever else that answer lists. Rows of routes can't say that: the card shows the JSON alone.
    if (to.length > 1 && to.some((x) => x.id === 'stop')) return null;
    options.push({ title: str(r.title), to });
  }
  // The agent trims the person's answer and takes the first answer whose title matches it under strings.EqualFold. An answer equal to an
  // earlier one that way is never reached, nor one whose title that trim would change: the card shows the JSON alone.
  if (options.some((o, i) => GO_EDGE.test(o.title) || options.slice(0, i).some((e) => foldEq(e.title, o.title)))) return null;
  return { id, s, next, options, refs };
}
/** A saved workflow's steps with their ids, from either shape the agent takes (an array, or a map keyed by id, whose own id, when it has
 *  one, is that key); null when it is neither, any step can't be read, two steps share an id, or an id is one the agent refuses, so the
 *  card shows the JSON alone rather than half a workflow. */
function wfStepsOf(d: Record<string, unknown>): WfStep[] | null {
  const raw = d.steps;
  const rows = Array.isArray(raw) ? raw.map((s) => wfStepOf(str(obj(s)?.id), s))
    : Object.entries(obj(raw) ?? {}).map(([id, s]) => (obj(s) && own(obj(s)!, 'id') && obj(s)!.id !== id ? null : wfStepOf(id, s)));
  if (rows.length === 0 || !rows.every(Boolean)) return null;
  const steps = rows as WfStep[];
  // The agent's validateWorkflow refuses a step named stop or holding a control character (its firstControlChar).
  if (steps.some((x) => x.id === 'stop' || hasControl(x.id))) return null;
  return new Set(steps.map((x) => x.id)).size === steps.length ? steps : null;
}
/** The steps in the order a run reaches them (entry first, then what each one leads to), and which those are; the rest come last. */
function wfRunOrder(steps: readonly WfStep[], entry: string): { order: WfStep[]; reached: Set<string> } {
  const byId = new Map(steps.map((x) => [x.id, x]));
  const reached = new Set<string>();
  const order: WfStep[] = [];
  const queue = [entry];
  while (queue.length > 0) {
    const id = queue.shift() as string, x = byId.get(id);
    if (!x || reached.has(id)) continue;
    reached.add(id);
    order.push(x);
    queue.push(...x.next.map((r) => r.id), ...x.options.flatMap((o) => o.to.map((r) => r.id)));
  }
  return { order: order.concat(steps.filter((x) => !reached.has(x.id))), reached };
}
function wfStepParts(x: WfStep, n: number, num: ReadonlyMap<string, number>, reached: boolean): InputPart[] {
  const { s } = x;
  const type = str(s.type);
  const kind: WfStepKind = type === 'bash' ? 'bash'
    : type === 'agent' ? (s.fork_from ? 'fork' : 'agent')
    : type === 'tool' ? (s.tool === 'ask_question_to_user' ? 'ask' : 'tool')
    : type === 'workflow' ? 'workflow' : type === 'foreach' ? 'foreach' : 'other';
  const arg = str(kind === 'agent' ? s.agent : kind === 'fork' ? s.fork_from : kind === 'tool' ? s.tool : kind === 'workflow' || kind === 'foreach' ? s.workflow : kind === 'other' ? s.type : '');
  // Where a route goes is read from the saved id itself (exactly `stop` ends this path), never from the shown copy, which drops what can't be seen.
  const NONE: WfName = { text: '', odd: false };
  const route = (r: WfRef | 'falls', answer: WfName | null, otherwise: boolean): InputPart => (r === 'falls'
    ? { k: 'wfNext', end: false, falls: true, to: NONE, n: 0, test: NONE, answer, otherwise }
    : { k: 'wfNext', end: r.id === 'stop', falls: false, to: r.id === 'stop' ? NONE : wfName(r.id, 80), n: num.get(r.id) ?? 0, test: r.test ? wfName(r.test, 300, { code: true }) : NONE, answer, otherwise });
  const out: InputPart[] = [{ k: 'wfStep', n, id: wfName(x.id, 80), kind, arg: capped(arg, 80) }];
  const answersFan = x.options.some((o) => o.to.length > 1);
  if (!reached) out.push({ k: 'wfNote', note: 'unreached' });
  // A key or token in a command, its input, a prompt or a question is hidden on the card only.
  if (kind === 'bash' && typeof s.command === 'string') out.push(commandPart(`step-${n}`, s.command));
  // The input is what a shell step reads on stdin: with `sh` as the command it is the script that runs, so it shows as written as the
  // command does; a prompt and a question too, since what the step agent or the person is told is that text.
  if (kind === 'bash' && str(s.input)) out.push({ k: 'wfNote', note: 'input' }, { ...commandPart(`step-${n}-input`, str(s.input)), tag: '' });
  // A prompt and a question show as written (plain text, never Markdown, which would hide a link's address or draw headings and code).
  if ((kind === 'agent' || kind === 'fork' || kind === 'workflow' || kind === 'foreach') && str(s.prompt)) out.push({ ...commandPart(`step-${n}-prompt`, str(s.prompt)), tag: '' });
  if (kind === 'foreach' && str(s.list)) out.push({ k: 'kv', name: 'list', value: capped(s.list, 300, { code: true }) });
  if (kind === 'ask') {
    out.push(str(s.question) ? { ...commandPart(`step-${n}-question`, str(s.question)), tag: '' } : { k: 'wfNote', note: 'noQuestion' });
    out.push({ k: 'wfNote', note: x.next.length > 0 ? 'askBackground' : 'askBackgroundFails' });
    if (answersFan) out.push({ k: 'wfNote', note: 'together' });
    for (const o of x.options) {
      const title = wfName(o.title, 80, { quoted: true });
      // An answer with no step of its own goes on to the question's next steps; with none, this path ends.
      const to: (WfRef | 'falls')[] = o.to.length > 0 ? o.to : [x.next.length > 0 ? 'falls' : { id: 'stop', test: '' }];
      for (const r of to) out.push(route(r, title, false));
    }
  }
  if (str(s.output)) out.push({ k: 'kv', name: 'output', value: capped(s.output, 300, { code: true }) });
  if (s.continue_on_error === true || (type === 'bash' && s.capture_exit_code === true)) out.push({ k: 'wfNote', note: 'goesOn' });
  if (x.next.length > 1 && !answersFan) out.push({ k: 'wfNote', note: 'together' });
  for (const r of x.next) out.push(route(r, null, kind === 'ask'));
  return out;
}
/** The save card of a workflow, in the person's order: its name and summary, whether it replaces anything (the agent's own guards say), that
 *  saving doesn't run it, each step with where a run goes from it, then the whole definition. A shape the agent refuses, a missing or unknown
 *  step included, shows as JSON alone, whole as well. */
function workflowParts(p: Record<string, unknown>): InputPart[] | null {
  const d = obj(p.definition);
  const steps = d && wfStepsOf(d);
  if (!d || !steps) return null;
  const entry = str(obj(d.entry_point)?.id) || str(d.entry_point);
  if (!steps.some((x) => x.id === entry)) return null;
  const known = new Set(steps.map((x) => x.id));
  if (steps.some((x) => x.refs.some((r) => r.id !== 'stop' && !known.has(r.id)))) return null;
  const { order, reached } = wfRunOrder(steps, entry);
  const num = new Map(order.map((x, i) => [x.id, i + 1]));
  const out: InputPart[] = [];
  const cutsBefore = cappedCuts;
  if (str(p.name)) out.push({ k: 'kv', name: 'name', value: capped(p.name, 200, { code: true }) });
  if (str(d.summary)) out.push({ k: 'kv', name: 'summary', value: capped(d.summary, 300) });
  for (const raw of Array.isArray(d.params) ? d.params : []) {
    const q = obj(raw);
    if (q && str(q.name)) out.push({ k: 'kv', name: 'input', value: capped(q.name, 80) + (q.required === true ? ' (required)' : '') });
  }
  out.push({ k: 'wfNote', note: p.expected_absent === true ? 'new' : str(p.expected_revision) ? 'replaces' : 'mayReplace' });
  out.push({ k: 'wfNote', note: 'noRun' });
  order.slice(0, WF_STEPS_SHOWN).forEach((x, i) => out.push(...wfStepParts(x, i + 1, num, reached.has(x.id))));
  const viewCut = cappedCuts !== cutsBefore || steps.length > WF_STEPS_SHOWN;
  // A step past the ones shown is read too: one holding a mark is not on the card, so the card is blind and Allow stays shut
  // (a 31st `sh` step with a hidden curl in its input, for example).
  if (steps.length > WF_STEPS_SHOWN) {
    const unseen = order.slice(WF_STEPS_SHOWN).some((x) => wfStepParts(x, 0, num, true).some((q) => (q.k === 'code' || q.k === 'path' || q.k === 'kv') && !!q.marked));
    out.push(unseen ? { k: 'wfMore', n: steps.length - WF_STEPS_SHOWN, marked: true, blind: true } : { k: 'wfMore', n: steps.length - WF_STEPS_SHOWN });
  }
  const jp = jsonPart(p, true, viewCut);
  if (jp) out.push({ k: 'wfNote', note: 'whole' }, jp);
  return out;
}
/** One side of an edit as its diff draws it: the text with any key hidden, then cleaned and cut (cut: what was left out), and for each
 *  line drawn the line as written, which the diff compares on: two different keys hidden alike are still a change. The line as written is
 *  never drawn. Should hiding move a line break (a reader's view), the drawn lines are what is compared. */
// `marked`: either side holds a mark, so both show as written (tabs kept); blind when the key scrub hid text or the side is cut.
function editSide(raw: string, marked: boolean): { text: string; same: string[]; cut: number; blind: boolean } {
  const hid = scrubSecrets(raw);
  const view = (t: string): string => (marked ? asWritten(t, { tabs: true }).text : clean(t, undefined, { code: true }).text);
  const c = clean(marked ? view(hid) : hid, MAX_SHOW, { code: true });
  const lines = (t: string): string[] => (t === '' ? [] : t.split('\n'));
  const show = lines(c.text), as = lines(view(raw));
  const blind = marked && (hid !== raw || c.cut > 0);
  if (as.length !== lines(view(hid)).length) return { text: c.text, same: show, cut: c.cut, blind };
  // The last line drawn may be cut: compared on what it was and what it shows, so two sides cut apart differ.
  const same = show.map((l, i) => (c.cut > 0 && i === show.length - 1 ? `${as[i] as string}\n${l}` : (as[i] as string)));
  return { text: c.text, same, cut: c.cut, blind };
}
/** A file's content as written, tabs kept (what a later `sh file` runs). Unmarked: the hidden text. Marked
 *  when the raw or the hidden text holds a mark; blind when marked and the key scrub hid text or the marks push it past MAX_SHOW. */
function asContent(raw: string): { text: string; marked: boolean; blind: boolean } {
  const hid = scrubSecrets(raw), w = asWritten(hid, { tabs: true });
  const marked = w.marked || asWritten(raw, { tabs: true }).marked;
  return { text: marked ? w.text : hid, marked, blind: marked && (hid !== raw || w.text.length > MAX_SHOW) };
}
// `long`: marked only because it is shown past where the card would cut it (gateBounds.test.tsx), not for a character it holds.
const markOf = (m: { marked: boolean; blind: boolean; long?: true }): { marked?: true; blind?: true; long?: true } =>
  (m.marked ? { marked: true, ...(m.blind ? { blind: true as const } : {}), ...(m.long ? { long: true as const } : {}) } : {});
/** The detail as written, cleaned, past the daemon's leading notices: what a preview is compared on. Not cut at MAX_SHOW: the drawn
 *  detail is scrubbed before its cut, so a cut here could end inside a notice the drawn text has already passed. */
function rawBody(said: string): string {
  const l = clean(said, undefined, { code: true }).text.split('\n');
  let i = 0;
  while (i < l.length && (l[i] as string).indexOf('⚠') === 0) i++;
  return l.slice(i).join('\n').replace(/^\n+|\n+$/g, '');
}
/** A command the agent runs with sh: a key or token in it hidden, drawn and copied alike, then shown as written (asWritten). Marked when
 *  the command as written holds anything a screen would hide or change, read on the raw text too: scrubbing never unmarks it. Blind
 *  when it is marked and the scrub hid something: the scrub reads a key across an escape, so `sk<ESC>]0;x;id; #<BEL>-…` hides `;id`
 *  with the key, and no mark is left to show it. */
function commandPart(key: string, raw: string): Extract<InputPart, { k: 'code' }> {
  const hid = scrubSecrets(raw), w = asWritten(hid);
  if (!w.marked && !asWritten(raw).marked) return { k: 'code', key, src: w.text, tag: 'sh', wrap: true };
  return hid !== raw ? { k: 'code', key, src: w.text, tag: 'sh', wrap: true, marked: true, blind: true } : { k: 'code', key, src: w.text, tag: 'sh', wrap: true, marked: true };
}
/** A write or edit path, drawn on one line (asLine, bound 600). */
function pathPart(raw: string): InputPart {
  const a = asLine(raw, 600);
  return { k: 'path', text: a.text, ...markOf(a) };
}
/** The parts of a confirm card's tool input, by meaning: write_file shows path and content as code, edit_file a
 *  diff, bash the command as shell, upsert_workflow the workflow step by step above its JSON, anything else indented
 *  JSON. A daemon preview of the same text is not shown twice. g: {tool, params, detail}. Every value a part draws or copies has
 *  a key or token in it hidden before it is cleaned; the params themselves are never changed (the card sends only a decision). */
export function gateInput(g: { tool?: unknown; params?: unknown; detail?: unknown }): InputPart[] {
  const name = str(g.tool);
  const p = g.params && typeof g.params === 'object' && !Array.isArray(g.params) ? (g.params as Record<string, unknown>) : null;
  // The detail is scrubbed before it is cleaned, for every tool (a workflow save's included): cleaning drops what can't be seen, which can
  // join a key split by a zero-width character or a variation selector, and the warn lines and tagged diff rows below are drawn without
  // another scrub. Whether it only repeats the input is still read on the detail as written (rawBody): scrubbing can make two texts alike.
  const said = str(g.detail);
  const kids: InputPart[] = [], d = clean(scrubSecrets(said), MAX_SHOW, { code: true }).text, lines = d.split('\n');
  let i = 0;
  while (i < lines.length && (lines[i] as string).indexOf('⚠') === 0) kids.push({ k: 'warn', text: lines[i++] as string }); // the daemon's own notices
  const body = lines.slice(i).join('\n').replace(/^\n+|\n+$/g, '');
  let shown = false, preview = false;
  // preview: the daemon's detail is only a shorter copy of what the input shows (a fenced start of the content,
  // the tagged diff, the command); any other detail text still shows below it. Read on the detail as written. A file's preview is known by
  // its shape alone, not checked against the content.
  if (p && has(WRITE, name) && typeof p.content === 'string') {
    const wp = scrubSecrets(str(p.path));
    if (wp) kids.push(pathPart(str(p.path)));
    const ct = asContent(p.content);
    kids.push({ k: 'code', key: 'content', src: ct.text, tag: '', path: wp, ...markOf(ct) });
    kids.push(...extras(p, ['path', 'content']));
    shown = true; preview = rawBody(said).indexOf('```') === 0;
  } else if (p && has(EDIT, name) && (typeof p.old_string === 'string' || typeof p.new_string === 'string')) {
    const ep = scrubSecrets(str(p.path));
    if (ep) kids.push(pathPart(str(p.path)));
    // The rows are built from the hidden text, so no row, and no copy of them, holds a key; they are compared on the text as written.
    const em = asWritten(str(p.old_string), { tabs: true }).marked || asWritten(str(p.new_string), { tabs: true }).marked;
    const ca = editSide(str(p.old_string), em), cb = editSide(str(p.new_string), em);
    // Past the cap the rows show only what fits, and the card says what it left out.
    const dr = diffRows(ca.text, cb.text, { a: ca.same, b: cb.same });
    // A marked line the diff trims as unchanged context is not on the card: blind. Every ⟨ shown opens a mark (a written
    // one is marked too), so a line holding one is a marked line.
    // Counted per side and per line, so a marked line drawn once does not stand for a second copy trimmed.
    const trimmed = em && ([['-', ca.text], ['+', cb.text]] as const).some(([side, t]) => {
      const left = new Map<string, number>();
      for (const l of t === '' ? [] : t.split('\n')) if (l.includes('⟨')) left.set(l, (left.get(l) ?? 0) + 1);
      for (const r of dr.rows) if ((r.t === '=' || r.t === side) && left.has(r.s)) left.set(r.s, (left.get(r.s) as number) - 1);
      return [...left.values()].some((n) => n > 0);
    });
    // A side past MAX_SHOW is cut: the card says how much it left out, and it cannot be allowed here (gateBounds.test.tsx).
    const cut = ca.cut + cb.cut;
    kids.push({ k: 'diff', key: 'edit', parts: dr, path: ep, cut, ...markOf({ marked: em || cut > 0, blind: ca.blind || cb.blind || trimmed || cut > 0, ...(em ? {} : { long: true as const }) }) });
    kids.push(...extras(p, ['path', 'old_string', 'new_string']));
    shown = true; preview = !!taggedRows(rawBody(said));
  } else if (p && name === 'bash' && typeof p.command === 'string') {
    kids.push(commandPart('command', p.command));
    kids.push(...extras(p, ['command']));
    const cmd = clean(p.command, undefined, { code: true }).text.replace(/\n+$/, ''), rb = rawBody(said), sg = segments(rb);
    const only = sg[0];
    shown = true; preview = rb === cmd || (sg.length === 1 && !!only && only.k === 'code' && only.s === cmd);
  } else if (p && name === 'upsert_workflow') {
    const wf = workflowParts(p);
    if (wf) { kids.push(...wf); shown = true; }
  }
  if (shown) {
    if (body && !preview) kids.push({ k: 'rich', text: body });
    return kids;
  }
  const tg = body ? taggedRows(body) : null;
  if (tg) kids.push({ k: 'diff', key: 'tagged', parts: tg, path: '', cut: 0 });
  else if (body) kids.push({ k: 'rich', text: body });
  if (p) {
    const jp = jsonPart(p, name === 'upsert_workflow');
    if (jp) kids.push(jp);
  }
  return kids;
}
/** A tool's input as JSON, for every tool the card has no own view of and for a workflow's save. Text that runs can sit anywhere in it,
 *  not only where a view draws it (a workflow parameter's default used as `$(input.x)`, a route's params, a program's or a
 *  cron entry's command). When any key or string holds a mark, the whole JSON (prettyJSON whole, which writes what
 *  a screen can't show as a \u escape, cutting nothing) has what an escape does not cover (a change NFC would make, a lone combining mark,
 *  a written ⟨) marked over it as written (tabs are \t already): marked, so never folded and Allow waits for the tick; blind when a key
 *  scrub hid part of a marked string, or past 64 levels. A workflow's (always whole) is also blind when a definition key would be read by
 *  the daemon as another field (foldAlias). A JSON that cannot be built (V8 runs out of stack near 4500 levels) is a blind part, never no
 *  part: the card never loses its marks. Null only when nothing is left to show. */
function jsonPart(p: Record<string, unknown>, wf: boolean, cutAbove = false): Extract<InputPart, { k: 'code' }> | null {
  const alias = wf && foldAlias(p.definition, 0, false), chars = alias || leafMarked(p, 0);
  // The bounded copy, when it is the one shown: one that left something out gives way to the whole JSON, shown unfolded behind the tick
  // (so a 20000-character comment cannot hide the curl after it). `cutAbove`: a workflow whose steps view cut a
  // name or a field, or left steps out; its JSON is the place to read them.
  const b = wf || chars ? null : jsonOf(p, false);
  const long = cutAbove || !!b?.cut;
  const j = b && !b.cut ? b.j : prettyJSON(p, true);
  if (!j) return Object.keys(p).some((k) => k.charAt(0) !== '_') ? { k: 'code', key: 'json', src: '', tag: 'json', marked: true, blind: true } : null;
  if (j === '{}') return null;
  // The size is checked on the JSON as drawn, whatever cut or not: many strings each under every bound can still add up past MAX_SHOW,
  // and a workflow's whole JSON is never bounded. Past it the JSON is cut with "…" and blind.
  if (!chars && !long && j.length <= MAX_SHOW) return { k: 'code', key: 'json', src: j, tag: 'json' };
  const all = chars ? asWritten(j, { tabs: true }).text : j, over = all.length > MAX_SHOW;
  const src = over ? `${clean(all, MAX_SHOW, { code: true }).text}…` : all;
  const blind = alias || (chars && scrubHidMark(p, 0)) || over;
  return { k: 'code', key: 'json', src, tag: 'json', ...markOf({ marked: true, blind, ...(chars ? {} : { long: true as const }) }) };
}
// Every json name of the daemon's workflow definition (the workflow, its steps, params, step references, options, inputs and
// retry rule), and the fields whose value is a map, whose own keys are names a person chose.
const WF_FIELDS = set('name description default required type enum id params execute_if entry_point steps summary labels system created_at updated_at max_concurrency env timeout_sec outputs title has_user_input model effort next_steps input_params tool agent workflow list concurrency fork_from prompt command input output output_header deny_tools read_only stream silent json_output output_schema display_key explanation question options category forward_output_as capture_exit_code continue_on_error max_iterations retry max backoff_ms');
const WF_MAPS = set('steps env outputs input_params output_schema params');
// Go's encoding/json matches a struct field's name case-insensitively (EqualFold: ſ is s, K is k), even with DisallowUnknownFields, so
// `ſteps` or `Steps` in a definition is saved as its steps while the card draws `steps` (the daemon does not refuse
// it itself). Folded per code point, upper then lower, which also folds ı: a key read as a field it does not spell is blind, failing closed.
const foldKey = (k: string): string => Array.from(k, (c) => { const u = c.toUpperCase(); return (Array.from(u).length === 1 ? u : c).toLowerCase(); }).join('');
function foldAlias(v: unknown, depth: number, keysChosen: boolean): boolean {
  if (!v || typeof v !== 'object') return false;
  if (depth > 64) return true;
  if (Array.isArray(v)) return v.some((x) => foldAlias(x, depth + 1, false));
  return Object.entries(v).some(([k, x]) => {
    const f = foldKey(k);
    if (!keysChosen && !has(WF_FIELDS, k) && has(WF_FIELDS, f)) return true;
    return foldAlias(x, depth + 1, !keysChosen && has(WF_MAPS, f) && !!x && typeof x === 'object' && !Array.isArray(x));
  });
}
// A key scrub hid part of a marked key or string (the marks of what it hid are not shown), or the value is past 64 levels.
function scrubHidMark(v: unknown, depth: number): boolean {
  if (typeof v === 'string') return scrubSecrets(v) !== v && asWritten(v, { tabs: true }).marked;
  if (!v || typeof v !== 'object') return false;
  if (depth > 64) return true;
  if (Array.isArray(v)) return v.some((x) => scrubHidMark(x, depth + 1));
  return Object.entries(v).some(([k, x]) => scrubHidMark(k, depth + 1) || scrubHidMark(x, depth + 1));
}
// Any key or string in it holds a mark (asWritten, tabs kept: JSON writes a tab as \t). Past 64 levels it counts as marked: fails closed.
function leafMarked(v: unknown, depth: number): boolean {
  if (typeof v === 'string') return asWritten(v, { tabs: true }).marked;
  if (!v || typeof v !== 'object') return false;
  if (depth > 64) return true;
  if (Array.isArray(v)) return v.some((x) => leafMarked(x, depth + 1));
  return Object.entries(v).some(([k, x]) => asWritten(k, { tabs: true }).marked || leafMarked(x, depth + 1));
}

// ── a step row's summary ───────────────────────────────────────────────────
const FILE_TOOLS = set('read_file read_minified_file write_file write_minified_file edit_file edit_minified_file delete_file');
export type StepModel = null | { k: 'sh'; tokens: Token[] } | { k: 'path'; path: string; rest: string } | { k: 'text'; text: string };
/** A bash command is shell (the "$ " prompt kept, dim), a file tool's path is mono, anything else is text. */
export function stepModel(name: string, summary: unknown): StepModel {
  // Keys hidden first: cleaning can glue a key to the word before it.
  const s = clean(typeof summary === 'string' ? scrubSecrets(summary) : summary, 1500, { code: true }).text.replace(/\n+/g, ' ');
  if (!s) return null;
  if (name === 'bash' && s.indexOf('$ ') === 0) return { k: 'sh', tokens: [['p', '$ '] as Token].concat(tokenize('sh', s.slice(2))) };
  if (has(FILE_TOOLS, name)) {
    const m = /^(.*?)( \([^()]*\))?$/.exec(s) as RegExpExecArray;
    return { k: 'path', path: m[1] as string, rest: m[2] ?? '' };
  }
  return { k: 'text', text: s };
}
