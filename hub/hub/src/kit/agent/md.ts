// md.ts: the reply's markdown, parsed into a small safe node set. No HTML ever: the
// renderer draws these nodes as React text. Text arrives already cleaned (code.ts clean: controls and bidi removed;
// zero-width characters can stay, parseMd checks past them); fences come from code.ts segments, so a half-written
// fence is an open code block, never raw backticks that flash.
//
//   blocks   paragraph, heading (#..######; drawn at body size in the dock), bullet and numbered lists (one
//            level; deeper items keep their indent as text), blockquote, table (a header row and a | --- | row),
//            rule, fenced code;
//   inline   `code`, **bold** / __bold__, *italic* / _italic_, [text](url) with http/https only, ![alt](url)
//            as a link (never an image), bare https:// links, Linux paths (`/etc/hosts`, `~/.bashrc`, `/app/x.ts:12`; paths.ts:
//            in prose, and an inline code span that is wholly one path; never in a link's label or a fenced block). Anything
//            else stays text.
//
// Every link goes through the reader (core/linkRead.ts): an address that could make a program act when opened is drawn as
// text with a note (`blocked`), credentials are gone, a Hub page has its fixed shape, and a label naming another host shows
// the real one after it.
import { hostEnv, labelNamesOtherHost, maskAddress, proxyDomain, readLink, type LinkEnv, type LinkRead } from '@core';
import { scrubSecrets, segments } from './code';
import { pathAt, wholePath } from './paths';

export type Inline =
  | { k: 'text'; s: string }
  | { k: 'code'; s: string; read?: LinkRead }
  | { k: 'b'; c: Inline[] }
  | { k: 'i'; c: Inline[] }
  /** `read`: what the reader made of it (a host marks by it); `bare`: written as a bare address, not `[words](url)`. */
  | { k: 'a'; href: string; host: string; c: Inline[]; read?: LinkRead; bare?: boolean }
  | { k: 'blocked'; c: Inline[] }
  /** A Linux path (paths.ts): `s` as written, `target` the same with its `:line[:col]`; `code`: written as an inline code span. */
  | { k: 'path'; s: string; target: string; code?: boolean };

export type MdBlock =
  | { k: 'p'; c: Inline[] }
  /** A heading, with its level as written (1 for #, up to 6). */
  | { k: 'h'; level: number; c: Inline[] }
  | { k: 'ul'; items: Inline[][] }
  | { k: 'ol'; start: number; items: Inline[][] }
  | { k: 'quote'; c: MdBlock[] }
  | { k: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { k: 'hr' }
  | { k: 'code'; s: string; lang: string; open: boolean };

const httpUrl = (raw: string): URL | null => {
  const s = raw.trim();
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
};
// URL() decodes %XX in a host name and maps full-width letters to ASCII, so a key the written text hides from a scrub can
// surface in the href or the host tooltip: the normalised address is what is checked.
// It also percent-encodes an invisible character inside a key, which the scrub reads past only once decoded. Each run of escapes is
// decoded on its own, never failing: one malformed escape elsewhere must not leave the rest encoded.
// One decoder for every run (scrub-encoded-stream-cost: a new one per run was most of the cost on text full of escapes), made at the
// first use: a kit module does nothing at load (kitpure).
let utf8: TextDecoder | undefined;
const decodeRun = (run: string): string => (utf8 ??= new TextDecoder()).decode(Uint8Array.from(run.slice(1).split('%'), (h) => parseInt(h, 16)));
// The marked decode, for the key check only, beside the plain one: a run that decodes to a word character just before a key
// (`%41sk%2D…`, "Ask-…") would glue to it, where no key can start, so a zero-width space goes between the two; the scrub reads past
// the break between key characters. Only where a decoded run ending in a word character meets a word
// character: never after an ESC, a 0x9B, an intermediate or a string terminator, where a break would end the
// scrub's reading of an escape inside a key (code.ts INVISIBLE, START's lookbehinds and the READERS: clean's skipEscape/skipCsi and
// stripAnsi). So the only escape it can fall inside is a CSI (ESC [ or C1 0x9B), between two parameter digits or before the final
// byte (`%1B%5B3%31m`): MARKED_ESC is the CSI grammar with breaks allowed there, and the breaks it finds are taken out again.
// It can never follow the ESC itself or sit in a string terminator, and an OSC/DCS body, which the scrub reads past
// whatever it holds, needs no repair. Its repeats never share a character (a break between the parameters and the intermediates
// belongs to the parameters), so a long sequence with no end is read in linear time. The plain decode is checked too
// (decodesToKey).
const RUN_END = '\u200b';
const MARKED_ESC = /(?:\u001b\[|\u009b)[0-?\u200b]*(?:[ -/][ -/\u200b]*)?[@-~]/g;
const WORD_END = /\w$/, WORD_START = /^\w/;
const decoded = (href: string, marked = false): string => {
  const d = href.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run, at: number, all: string) => {
    const r = decodeRun(run);
    return marked && WORD_END.test(r) && WORD_START.test(all.charAt(at + run.length)) ? r + RUN_END : r;
  });
  return marked ? d.replace(MARKED_ESC, (e) => e.replaceAll(RUN_END, '')) : d;
};
// Decoded again while that changes it, at most DECODE_ROUNDS times: a key written %252D (encoded twice) shows after two decodes.
const DECODE_ROUNDS = 4;
/** Whether the text, decoded once or more (DECODE_ROUNDS), shows a key. The text as written is not part of the question. */
const decodesToKey = (s: string): boolean => {
  let t = s;
  for (let i = 0; i < DECODE_ROUNDS && t.includes('%'); i++) {
    const d = decoded(t);
    if (d === t) return false;
    if (scrubSecrets(d) !== d) return true;
    const seen = decoded(t, true);
    if (seen !== d && scrubSecrets(seen) !== seen) return true;
    t = d;
  }
  return false;
};
/** The text with what decodes to a key shown as [hidden]: a scrub of the written text leaves such a key one decode
 *  away. The smallest part that holds it goes: a word (split at the scrub's own breaks, space, tab and line break), else a line (an
 *  encoded escape sequence the scrub reads past can hold a space), else the whole text (a reader can run a sequence across a
 *  line break). Each part is checked with what its written text shows hidden, so a key written plainly, which the caller's scrub hides
 *  in place, never takes its word, its line or the text with it (a key joined by markup beside an
 *  ordinary escape). The whole text is checked first: text whose escapes decode to no key needs no look at its parts. */
function hideEncoded(s: string): string {
  if (!s.includes('%')) return s;
  const encodedKey = (t: string): boolean => t.includes('%') && decodesToKey(scrubSecrets(t));
  if (!encodedKey(s)) return s;
  const words = s.split(/([ \t\r\n]+)/).map((w) => (encodedKey(w) ? '[hidden]' : w)).join('');
  if (!encodedKey(words)) return words;
  const lines = words.split('\n').map((l) => (encodedKey(l) ? '[hidden]' : l)).join('\n');
  return encodedKey(lines) ? '[hidden]' : lines;
}
/** The text with every key hidden as the Prose hides it: written (scrubSecrets) or percent-encoded (hideEncoded). What a reply gives
 *  away outside the Prose (Copy, what a screen reader is told) goes through it too, so it never holds a key the page hides. */
export function hideSecrets(s: string): string {
  return scrubSecrets(hideEncoded(s));
}
const showsSecret = (u: URL) =>
  scrubSecrets(u.href) !== u.href || scrubSecrets(u.hostname) !== u.hostname || decodesToKey(u.href);

/** An http(s) URL as a link target, or null (javascript:, data:, relative paths and the rest are text, and so is an address
 *  that shows a secret once normalised). */
export function safeHref(raw: string): { href: string; host: string } | null {
  const u = httpUrl(raw);
  return u && !showsSecret(u) ? { href: u.href, host: u.hostname } : null;
}

/** The text of an address safeHref refused: one that shows a secret once normalised is shown normalised and scrubbed, so
 *  neither its written nor its decoded form appears; any other stays as written. When what is shown still decodes to a key (an escape
 *  inside it), the whole address is hidden: scrubbing the encoded text would leave the key one decode away. */
function refusedText(raw: string): string {
  const u = httpUrl(raw);
  if (!u || !showsSecret(u)) return raw;
  u.username = '';
  u.password = '';
  const shown = scrubSecrets(u.href);
  return decodesToKey(shown) ? '[hidden]' : shown;
}

const MAX_DEPTH = 4;

// The page's origin through the host (core/host-env: the browser's address on the web, none in a terminal unless one is lent), read
// per call, never the global `location` (a terminal host traps it).
const linkEnv = (): LinkEnv => ({ proxy: proxyDomain(), origin: hostEnv().pageAddress?.origin ?? '' });

/** A link's label as plain marks: the one link is the outer one, so anything inside that reads as a link is its words. */
const unlinked = (c: readonly Inline[]): Inline[] => c.flatMap((x): Inline[] => {
  if (x.k === 'a' || x.k === 'blocked') return unlinked(x.c);
  // A path in a label is its words: the link is the one action there.
  if (x.k === 'path') return [x.code ? { k: 'code', s: x.s } : { k: 'text', s: x.s }];
  return x.k === 'b' || x.k === 'i' ? [{ k: x.k, c: unlinked(x.c) }] : [x];
});

/** The nodes of one safe address. `label` null is a bare address, shown as written unless what it opens differs. */
function linkNodes(written: string, h: { href: string; host: string }, label: Inline[] | null): Inline[] {
  const r = readLink(h.href, linkEnv());
  // safeHref took it, so the reader does too; the fallback keeps the link as safeHref read it.
  const href = r?.href ?? h.href;
  const host = r?.host ?? h.host;
  const shown: Inline[] = label ?? [{ k: 'text', s: href === h.href && !r?.credentials ? written : href }];
  // A bare address drawn as text holds the computer's ids as written: masked, as the Link would have shown them.
  if (r?.text) return [{ k: 'blocked', c: label ?? [{ k: 'text', s: maskAddress(href) }] }];
  const out: Inline[] = [{ k: 'a', href, host, c: shown, ...(r ? { read: r } : {}), bare: label === null }];
  // Words naming another host get the real one after them; a computer's host holds its ids, masked as the address would be.
  if (label && labelNamesOtherHost(plain(label), host)) out.push({ k: 'text', s: ` (${maskAddress(host)})` });
  return out;
}

/** Inline code. One that is wholly one safe http(s) address keeps its look and carries the reader's read (a host marks it); one the
 *  reader draws as text carries none. An address holding a user name or password is shown as the reader read it, without them,
 *  as a bare link is (linkNodes). One that is wholly an address safeHref refuses is shown as a refused bare address is
 *  (refusedText): one that shows a secret loses its user name and password with the secret. */
function codeNode(code: string): Inline {
  const p = wholePath(code);
  if (p) return { k: 'path', s: code, target: p.target, code: true };
  const whole = /^https?:\/\/\S+$/i.test(code);
  const h = whole ? safeHref(code) : null;
  if (whole && !h) return { k: 'code', s: refusedText(code) };
  const r = h ? readLink(h.href, linkEnv()) : null;
  const shown = r?.credentials ? r.href : code;
  return r && !r.text ? { k: 'code', s: shown, read: r } : { k: 'code', s: shown };
}

/** Inline markup of one run of text. */
/** Where a `[text](...)` link's closing `)` is, `from` being just past the `(`. Parentheses count only inside the address
 *  (up to its first whitespace): the `)` that balances them ends it, so `https://h/orders/a(b)?q=1` is read whole (CommonMark).
 *  Otherwise (a title after the address, or the address's own parentheses never balance: `[x](https://h/a(b)`) the
 *  first `)` from `from`, as before; -1 when there is none. */
function destEnd(s: string, from: number): number {
  let depth = 0;
  for (let j = from; j < s.length; j++) {
    const c = s[j] as string;
    if (c === '(') depth++;
    else if (c === ')') {
      if (depth === 0) return j;
      depth--;
    } else if (/\s/.test(c)) break; // the same whitespace the target is split on below, so the scan never passes it
  }
  return s.indexOf(')', from);
}

/** `around`: when `s` is an emphasis's inside, the character before it and the text after it, so a path at its edge is judged as
 *  written (paths.ts). */
export function inline(s: string, depth = 0, around: { before?: string; after?: string } = {}): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ k: 'text', s: buf }); buf = ''; } };
  let i = 0;
  const n = s.length;
  while (i < n) {
    const ch = s[i] as string;
    if (ch === '\\' && i + 1 < n && /[\\`*_[\]()!#|>-]/.test(s[i + 1] as string)) { buf += s[i + 1]; i += 2; continue; }
    if (ch === '`') {
      const e = s.indexOf('`', i + 1);
      if (e > i + 1) { flush(); out.push(codeNode(s.slice(i + 1, e))); i = e + 1; continue; }
    }
    if (depth < MAX_DEPTH && (ch === '*' || ch === '_')) {
      const dbl = s[i + 1] === ch;
      const mark = dbl ? ch + ch : ch;
      const from = i + mark.length;
      const e = s.indexOf(mark, from + 1);
      // `_` inside a word (snake_case) is text.
      const wordy = ch === '_' && ((i > 0 && /\w/.test(s[i - 1] as string)) || (e >= 0 && /\w/.test(s[e + mark.length] ?? '')));
      if (e > from && !wordy && !/\s/.test(s[from] as string) && !/\s/.test(s[e - 1] as string)) {
        flush();
        const edge = { before: i > 0 ? s[i - 1] : around.before, after: e + mark.length < n ? s.slice(e + mark.length) : around.after };
        out.push({ k: dbl ? 'b' : 'i', c: inline(s.slice(from, e), depth + 1, edge) });
        i = e + mark.length;
        continue;
      }
    }
    if (ch === '[' || (ch === '!' && s[i + 1] === '[')) {
      const at = ch === '!' ? i + 1 : i;
      const close = s.indexOf('](', at + 1);
      const end = close >= 0 ? destEnd(s, close + 2) : -1;
      if (close > at && end > close && s.slice(at + 1, close).indexOf('\n') < 0) {
        const dest = s.slice(close + 2, end);
        const target = dest.split(/\s+/)[0] ?? '';
        const h = safeHref(target);
        const label = s.slice(at + 1, close);
        flush();
        if (h) out.push(...linkNodes(h.href, h, label ? unlinked(inline(label, depth + 1)) : null));
        // A refused target's label is read as a safe link's is, so an address in it is checked the same way.
        else if (label) out.push(...unlinked(inline(label, depth + 1)));
        else out.push({ k: 'text', s: refusedText(target) + dest.slice(target.length) });
        i = end + 1;
        continue;
      }
    }
    if ((ch === 'h' || ch === 'H') && /^https?:\/\//i.test(s.slice(i, i + 8)) && (i === 0 || /[\s(]/.test(s[i - 1] as string))) {
      const m = /^[^\s<>)\]]+/.exec(s.slice(i)) as RegExpExecArray;
      const url = m[0].replace(/[.,;:!?'"]+$/, '');
      const h = safeHref(url);
      if (h) { flush(); out.push(...linkNodes(url, h, null)); i += url.length; continue; }
      const shown = refusedText(url);
      if (shown !== url) { buf += shown; i += url.length; continue; }
    }
    if (ch === '/' || (ch === '~' && s[i + 1] === '/')) {
      const p = pathAt(s, i, around);
      if (p) { flush(); out.push({ k: 'path', s: p.target, target: p.target }); i = p.end; continue; }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const NUM = /^\s{0,3}(\d{1,9})[.)]\s+(.*)$/;
const HEAD = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const TSEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function cells(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\' && t[i + 1] === '|') { cur += '|'; i++; continue; }
    if (t[i] === '|') { out.push(cur.trim()); cur = ''; continue; }
    cur += t[i];
  }
  out.push(cur.trim());
  return out;
}

function textBlocks(text: string, depth: number): MdBlock[] {
  const lines = text.split('\n');
  const out: MdBlock[] = [];
  let para: string[] = [];
  const endPara = () => { if (para.length) { out.push({ k: 'p', c: inline(para.join('\n')) }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (!line.trim()) { endPara(); continue; }
    let m: RegExpExecArray | null;
    if ((m = HEAD.exec(line))) { endPara(); out.push({ k: 'h', level: (m[1] as string).length, c: inline(m[2] as string) }); continue; }
    if (RULE.test(line)) { endPara(); out.push({ k: 'hr' }); continue; }
    if (depth < MAX_DEPTH && QUOTE.test(line)) {
      endPara();
      const q: string[] = [];
      while (i < lines.length && (m = QUOTE.exec(lines[i] as string))) { q.push(m[1] as string); i++; }
      i--;
      out.push({ k: 'quote', c: textBlocks(q.join('\n'), depth + 1) });
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TSEP.test(lines[i + 1] as string)) {
      endPara();
      const head = cells(line).map((c) => inline(c));
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && (lines[i] as string).includes('|') && (lines[i] as string).trim()) { rows.push(cells(lines[i] as string).map((c) => inline(c))); i++; }
      i--;
      out.push({ k: 'table', head, rows });
      continue;
    }
    const bm = BULLET.exec(line), nm = NUM.exec(line);
    if (bm || nm) {
      endPara();
      const ordered = !bm;
      const items: string[] = [];
      const start = nm ? Number(nm[1]) : 1;
      for (; i < lines.length; i++) {
        const l = lines[i] as string;
        const b = BULLET.exec(l), o = NUM.exec(l);
        if (ordered ? o : b) { items.push(((ordered ? o?.[2] : b?.[1]) ?? '') as string); continue; }
        // A continuation line (indented, not blank) belongs to the item above.
        if (l.trim() && /^\s{2,}/.test(l) && items.length) { items[items.length - 1] += '\n' + l.trim(); continue; }
        break;
      }
      i--;
      const parsed = items.map((x) => inline(x));
      out.push(ordered ? { k: 'ol', start, items: parsed } : { k: 'ul', items: parsed });
      continue;
    }
    para.push(line);
  }
  endPara();
  return out;
}

/** A block's inline nodes, unless the text they show holds a secret the raw text kept apart (markup or an escape between its
 *  parts; scrubSecrets reads past invisible characters itself), or a word of it decodes to one (%XX, in a code span too): then that
 *  text, scrubbed, as one text node. The block loses its formatting; the secret never shows. */
function shownSafe(c: Inline[]): Inline[] {
  const seen = plain(c);
  const safe = hideSecrets(seen);
  return safe === seen ? c : [{ k: 'text', s: safe }];
}

function guardBlock(b: MdBlock): MdBlock {
  switch (b.k) {
    case 'p':
    case 'h':
      return { ...b, c: shownSafe(b.c) };
    case 'ul':
    case 'ol':
      return { ...b, items: b.items.map(shownSafe) };
    case 'quote':
      return { ...b, c: b.c.map(guardBlock) };
    case 'table':
      return { ...b, head: b.head.map(shownSafe), rows: b.rows.map((r) => r.map(shownSafe)) };
    default:
      return b;
  }
}

/** The reply's blocks, top to bottom. Each text block (shownSafe) and each fence is checked as it shows, and decoded. */
export function parseMd(text: string): MdBlock[] {
  const out: MdBlock[] = [];
  for (const sg of segments(text)) {
    if (sg.k === 'code') {
      // The fence's tag is drawn as the block's label: a tag that shows a key, written or encoded, is dropped.
      const lang = hideSecrets(sg.lang) === sg.lang ? sg.lang : '';
      out.push({ k: 'code', s: hideSecrets(sg.s), lang, open: sg.open });
    } else out.push(...textBlocks(sg.s, 0).map(guardBlock));
  }
  return out;
}

/** The plain text of inline nodes (a link's label, a table cell for its title). */
export function plain(c: readonly Inline[]): string {
  return c.map((x) => (x.k === 'text' || x.k === 'code' || x.k === 'path' ? x.s : plain(x.c))).join('');
}
