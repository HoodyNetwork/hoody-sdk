// The pure rules of kit links (Link.tsx on the web, Link.term.tsx in the terminal): what is a web address, what holds
// an id and is shown masked, which hrefs are Hub paths, and how plain text is cut into words and addresses. No React,
// no DOM.
import { maskAddress } from '@core';

/** Two Hub stand-ins, one per scheme, on hosts no address has (the href rule: hubPath below). */
const HUB_BASES = ['http://hub-a.invalid/p/', 'https://hub-b.invalid/p/'] as const;

/** Whether `href` is a Hub path: it parses against BOTH Hub stand-ins and in both stays on that stand-in's origin. A form
 *  one scheme reads as relative and the other as another host (`http:host`), one that names a host (`//host`, a
 *  placeholder host spelled out) and one the parser refuses (a bad port, a space in the host) are not: they leave the Hub,
 *  or fail closed as if they did. */
function hubPath(href: string): boolean {
  return HUB_BASES.every((base) => {
    try {
      return new URL(href, base).origin === new URL(base).origin;
    } catch {
      return false;
    }
  });
}

/** Whether a Link's href is the secret button: it is not a Hub path, and it holds an id as written or as either Hub
 *  stand-in's parser reads it (holdsId), or its parsed address is secret by shape. */
export const secretHref = (href: string): boolean => {
  if (hubPath(href)) return false;
  if (holdsId(href)) return true;
  return HUB_BASES.some((base) => {
    try {
      const abs = new URL(href, base).href;
      return holdsId(abs) || secretShape(abs);
    } catch {
      return false;
    }
  });
};

/**
 * The address when it is an absolute http or https URL, exactly as given; '' for anything else (empty, malformed,
 * scheme-relative, javascript:, data:, surrounding spaces). Open and the QR code take this string; Copy takes the url as
 * given, which is the same string whenever it is valid.
 */
export function webAddress(url: string): string {
  if (!url || url !== url.trim() || !/^https?:\/\//i.test(url)) return '';
  try {
    // The prefix fixes the scheme; the parse refuses what no browser would open (no host, a space in it, ...).
    new URL(url);
    return url;
  } catch {
    return '';
  }
}

/** The scheme and authority of each http(s) address in a text (up to the path, query or fragment). */
const AUTHORITY = /https?:\/\/[^/?#\s]*/gi;

/** Whether a text holds a 24-hex id, the run core maskAddress hides. The one rule for "secret"; there is no second pattern. */
export const hasId = (text: string): boolean => maskAddress(text) !== text;

/**
 * One layer of percent-encoding undone, for detection only (never shown). A malformed escape anywhere must not hide the
 * valid ones: when the whole text does not decode, each run of %XX escapes is decoded on its own as UTF-8, a bad
 * sequence becoming U+FFFD, so an encoded fullwidth or other compatibility-form id beside a bad escape still decodes.
 */
function decodeOnce(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    // TextDecoder (not fatal) reads a malformed sequence as U+FFFD, which ends a run; made here, not at load (kit modules do nothing at load).
    const utf8 = new TextDecoder('utf-8');
    return text.replace(/(?:%[0-9a-f]{2})+/gi, (run) => utf8.decode(Uint8Array.from(run.slice(1).split('%'), (h) => parseInt(h, 16))));
  }
}

/** The most percent-encoding layers undone (an address inside an address is often encoded again). Past it, a text whose
 *  escapes still change it is judged as holding an id (holdsId fails closed), so no depth of encoding can hide one. */
const DECODE_LAYERS = 8;

/** TAB, LF and CR: the URL parser drops them from the whole address BEFORE it undoes any escape, so `%\t61` is `a` to a
 *  browser, and so is `%\t61` that only appears once an outer layer (`%2509` → `%\t`) is undone, when the inner address
 *  is parsed in its turn. */
const URL_DROPPED = /[\t\n\r]/g;

/**
 * Every layer of a text's percent-encoding, the text first, then each one undone, until nothing changes or
 * DECODE_LAYERS were undone. `settled` is false when one more step would still change the text.
 *
 * The browser walk (`browser`): each step is what a browser does to an address before it reads one layer of it, done
 * at EVERY layer: drop TAB, LF and CR, then undo one layer. The plain walk (the text as written, one layer undone per
 * step) is kept beside it: both are judged, so neither reading of a text is a way past the rule.
 *
 * A step that changes the text makes it strictly shorter (a dropped character; each %XX of three characters becoming
 * at most one UTF-16 unit, a bad byte one U+FFFD), so the walk is bounded by the text's length as well as by
 * DECODE_LAYERS.
 */
function layers(text: string, browser: boolean): { all: string[]; settled: boolean } {
  const step = (t: string): string => decodeOnce(browser ? t.replace(URL_DROPPED, '') : t);
  const all = [text];
  let out = text;
  for (let i = 0; i < DECODE_LAYERS; i += 1) {
    const next = step(out);
    if (next === out) return { all, settled: true };
    all.push(next);
    out = next;
  }
  return { all, settled: step(out) === out };
}

/** The text as the last layer of the browser walk reads it (TAB, LF and CR dropped and one layer undone at every step,
 *  up to DECODE_LAYERS). For detection only, never shown. */
export function decoded(text: string): string {
  const { all } = layers(text, true);
  return all[all.length - 1] ?? text;
}

/**
 * Whether an address grants access by its shape: the host of it, or of any address inside it (a redirect target, in the
 * query or the path, plain or percent-encoded), holds a 24-hex id (a program address, a share link). Judged on the
 * written text, on the decoded text and on each parsed hostname (a percent-encoded character inside an id cannot hide it).
 * One secret part makes the whole address secret.
 */
export function secretShape(url: string): boolean {
  const web = webAddress(url);
  if (!web) return false;
  for (const text of [web, decoded(web)]) {
    for (const m of text.matchAll(AUTHORITY)) {
      if (hasId(m[0])) return true;
      try {
        if (hasId(new URL(`${m[0]}/`).hostname)) return true;
      } catch {
        /* an authority the parser refuses has no host to judge */
      }
    }
  }
  return false;
}

/** What a secret address shows: its scheme and bullets, nothing of the address itself. */
export const BULLETS = '••••';

/** The bidi controls (ALM, LRM, RLM, the embeddings and overrides, the isolates). None is ever shown: one could reorder
 *  what shows. Only these: the other format characters are part of what people write (ZWJ in an emoji sequence, ZWNJ in
 *  Persian and Indic words, tag characters in a flag, the Arabic number sign), so they show as written. Detection
 *  (SKIPPED, seen) still reads past every format character, so keeping them shown never hides an id. */
export const BIDI = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

/** What a run of hex digits reads past: the characters the URL parser strips (TAB, LF, CR) or ignores
 *  (format characters, default-ignorable code points such as fillers and variation selectors), and combining marks (a
 *  hex digit with a mark on it still reads as that digit). Nothing else: a space or any punctuation ends a run. */
const SKIPPED = /[\t\n\r\p{Cf}\p{Default_Ignorable_Code_Point}\p{M}]/gu;

/** A run of 24 hex digits: the shape of a host id. */
const HEX_RUN = /[0-9a-f]{24}/i;

/** A text as a run reads it: the skipped characters removed, then NFKC (a fullwidth, mathematical or other
 *  compatibility form reads as its plain letter or digit), then the skipped ones NFKC made removed again. */
export function seen(text: string): string {
  return text.replace(SKIPPED, '').normalize('NFKC').replace(SKIPPED, '');
}

/**
 * Whether a text shows a 24-hex id: in the text as a run reads it (seen), written or with its
 * percent-encoding undone, 24 consecutive hex digits. Any character a run does not skip ends it and never cancels it, so
 * 24 hex digits glued to other letters (`x<id>g`) hold, and words never merge across a space. No parser and no position:
 * an id in a host, a path or prose, in any case, split by anything invisible, or reversed by a bidi control (a run
 * reversed is a run) holds. A commit hash holds too (accepted).
 *
 * Every percent layer is judged, not only the last (a later layer could turn a revealed digit pair into a byte), and a
 * text still changing after DECODE_LAYERS layers holds (fail closed): the depth of encoding is never a way past the
 * rule, whatever is encoded (a separator inside the id, the id itself, a compatibility form). Both walks are judged (see
 * layers): the text as written, and the browser walk, which drops TAB, LF and CR before every layer it undoes, so a
 * TAB inside an escape (`%\t61`), written or revealed by an outer layer (`%25%0961`), is no way past either.
 */
export function holdsId(text: string): boolean {
  return [false, true].some((browser) => {
    const { all, settled } = layers(text, browser);
    return !settled || all.some((layer) => HEX_RUN.test(seen(layer)));
  });
}

/**
 * The one rule for every string a link shows (string children, title, aria-label, name, the visible address, autolinked
 * text): the text with its bidi controls removed (BIDI), or, when it holds an id (holdsId), `mask` in its place, whole.
 */
export function safeShown(text: string, mask: string = BULLETS): string {
  return holdsId(text) ? mask : text.replace(BIDI, '');
}

export const maskedLabel = (web: string): string => `${/^https/i.test(web) ? 'https' : 'http'}://${BULLETS}`;

/** Every 8-character run of a text, lower case. */
function runs(text: string): Set<string> {
  const out = new Set<string>();
  const lower = text.toLowerCase();
  for (let i = 0; i + 8 <= lower.length; i += 1) out.add(lower.slice(i, i + 8));
  return out;
}

/**
 * Whether a label given for a secret address holds any 8-character run of the address (as written, decoded or parsed).
 * A label is plain words ("Program rules"); one that repeats the address would put it on screen.
 */
export function leaksAddress(label: string, web: string): boolean {
  const mine = runs(label);
  if (mine.size === 0) return false;
  const forms = [web, decoded(web)];
  try {
    forms.push(new URL(web).href);
  } catch {
    /* webAddress already parsed it */
  }
  for (const f of forms) for (const r of runs(f)) if (mine.has(r)) return true;
  // As a person reads it: only the letters and digits count (seen), so no separator, invisible or not, and no fullwidth
  // or compatibility form hides a repeat.
  const read = runs(skeleton(label));
  for (const f of forms) for (const r of runs(skeleton(f))) if (read.has(r)) return true;
  return false;
}

function skeleton(text: string): string {
  return seen(text).toLowerCase().replace(/[^0-9a-z]/g, '');
}

/** Diagnostics already printed (dev only), by kind: each is said once. */
const warned = new Set<string>();

/** A dev-only note, once per kind. It never carries any part of an address. */
export function devNote(kind: string, text: string): void {
  if (!import.meta.env.DEV || warned.has(kind)) return;
  warned.add(kind);
  console.error(`hub ExtLink: ${text}`);
}

/** Forget the diagnostics already said, so each kind can be said once more. For tests: the state is per module. */
export function resetExtLinkNotes(): void {
  warned.clear();
}

// A bare http(s) URL in running text. trimUrl takes the punctuation that closes the sentence back out of it.
const URL_RUN = /https?:\/\/[^\s<>"'`]+/gi;
// Everything up to the next space: a quote ends a URL_RUN, yet inside userinfo it is still part of the address.
const WIDE_RUN = /https?:\/\/[^\s<>]+/gi;
const QUOTE = /['"`]/;
// An `@` before the path, query or fragment (a backslash ends the authority too): the address carries userinfo.
const USERINFO = /^https?:\/\/[^/\\?#]*@/i;
const SCHEME = /https?:\/\//gi;

/**
 * The pieces of a run, each with its offset: the run is cut before every scheme that a quote precedes within the
 * current piece, so a quoted address after another is never read as part of it. A scheme with no quote before it
 * (an archive link's inner address) stays inside its piece, as URL_RUN reads it.
 */
function* pieces(run: string): Generator<[number, string]> {
  let from = 0;
  // Linear: each character is read for a quote once, carried over from scheme to scheme until the piece is cut.
  let read = 0;
  let quoted = false;
  for (const m of run.matchAll(SCHEME)) {
    const i = m.index ?? 0;
    if (!quoted) quoted = QUOTE.test(run.slice(read, i));
    read = i;
    if (i > from && quoted) {
      yield [from, run.slice(from, i)];
      from = i;
      quoted = false;
    }
  }
  yield [from, run.slice(from)];
}

/**
 * Each address of a text with its offset. A piece holding a quote and userinfo is one address (`whole`), so the host
 * after the quote is never cut off from it; any other piece is split at its quotes, as running text uses them.
 */
function* addresses(text: string): Generator<{ url: string; start: number; whole: boolean }> {
  for (const w of text.matchAll(WIDE_RUN)) {
    for (const [off, piece] of pieces(w[0])) {
      const base = (w.index ?? 0) + off;
      const wide = trimUrl(piece);
      if (QUOTE.test(wide) && USERINFO.test(wide)) {
        yield { url: wide, start: base, whole: true };
        continue;
      }
      for (const m of piece.matchAll(URL_RUN)) yield { url: trimUrl(m[0]), start: base + (m.index ?? 0), whole: false };
    }
  }
}
const PAIRS: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };

/** A URL's end without the punctuation that closes the sentence around it; a closing bracket stays when the URL opened it. */
function trimUrl(raw: string): string {
  // Bracket balance of the whole run, counted once; each bracket trimmed off the end only lowers its own count.
  const left: Record<string, number> = { '(': 0, '[': 0, '{': 0 };
  const right: Record<string, number> = { ')': 0, ']': 0, '}': 0 };
  for (const c of raw) {
    if (c in left) left[c] = (left[c] ?? 0) + 1;
    else if (c in right) right[c] = (right[c] ?? 0) + 1;
  }
  let end = raw.length;
  while (end > 0) {
    const c = raw.charAt(end - 1);
    const open = PAIRS[c];
    if (open !== undefined) {
      if ((right[c] ?? 0) <= (left[open] ?? 0)) break;
      right[c] = (right[c] ?? 0) - 1;
    } else if (!/[.,;:!?'"`]/.test(c)) break;
    end -= 1;
  }
  return raw.slice(0, end);
}

/** The one shape autolink anchors: scheme, a host with no `@`, `/`, `\`, `?` or `#`, then an optional path with no `\`. */
const PLAIN_SHAPE = /^https?:\/\/[^/\\?#@\s]+(?:\/[^?#\\\s]*)?$/i;

/**
 * Whether an address is left as plain text by autolink: it has a query or a fragment, or is not the plain shape above
 * (userinfo, even empty; extra or backslash separators, which the URL parser reads differently from the written text), or the parser
 * finds credentials in it (a token can ride in any of them). A path may hold an `@`.
 */
function hasExtras(url: string): boolean {
  if (url.includes('?') || url.includes('#') || !PLAIN_SHAPE.test(url)) return true;
  try {
    const u = new URL(url);
    return u.username !== '' || u.password !== '';
  } catch {
    return true;
  }
}

/** One piece of autolinked text: words as they show, or an address to draw as an ExtLink (`key`: its offset). */
export type AutoPiece = string | { url: string; key: number };

/**
 * autolink's reading of a text (Link.tsx draws it with the web ExtLink, Link.term.tsx with the terminal one): a string
 * when nothing in it is a link (the mask, or the text, with masked addresses in place), else the pieces in order.
 * Plain text where every http(s) URL without userinfo, a query or a fragment is an ExtLink. A text that holds an id
 * anywhere (holdsId) comes back as the mask, whole. Otherwise its bidi controls are removed (BIDI), and a URL with
 * userinfo, a query or a fragment stays plain text; when it is secret (asked for, or by shape) that text is its scheme
 * and bullets, never the address. A quote inside userinfo does not end the address.
 */
export function autolinkPieces(text: string, o: { secret?: boolean } = {}): string | AutoPiece[] {
  if (holdsId(text)) return BULLETS;
  const shown = text.replace(BIDI, '');
  const out: AutoPiece[] = [];
  let links = 0;
  let at = 0;
  const text0 = (to: number) => {
    if (to > at) out.push(shown.slice(at, to));
  };
  for (const { url, start, whole } of addresses(shown)) {
    if (start < at) continue;
    const web = webAddress(url);
    if (whole) {
      // Never a link; masked when secret. One the parser refuses is judged on its written and decoded text.
      if (o.secret !== true && (web ? !secretShape(web) : !hasId(url) && !hasId(decoded(url)))) continue;
      text0(start);
      out.push(maskedLabel(url));
      at = start + url.length;
      continue;
    }
    if (!web) continue;
    const extras = hasExtras(url);
    if (extras && o.secret !== true && !secretShape(web)) continue;
    text0(start);
    if (extras) {
      out.push(maskedLabel(web));
    } else {
      out.push({ url, key: start });
      links += 1;
    }
    at = start + url.length;
  }
  if (out.length === 0) return shown;
  text0(shown.length);
  if (links === 0) return out.join('');
  return out;
}
