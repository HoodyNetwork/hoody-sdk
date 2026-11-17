// Output safety: the ONE choke point between a string and the terminal. Text from user data or the server can carry
// bytes a terminal obeys (ESC, CSI, OSC 52 clipboard writes, OSC 8 links, title sets, alt-screen switches, DECRQSS
// probes) or characters that make the screen lie (bidi overrides, invisible format characters). Every string the engine
// draws passes safeText: the loader routes the React host's text instances and every string prop it sets on an engine
// instance (content, title, value, placeholder, ...) through it (scripts/term/loader.ts, "fork delta 3"), so a prim, the
// compat runtime and a sibling all get it whether or not they remember to. This module imports nothing.
//
// Rules (tested by prim/safe.term.test.ts against a corpus):
// - C0 controls (U+0000-001F) except LF become their Unicode control picture (U+2400 + code: ␛ for ESC, ␇ for BEL,
//   ␀ for NUL), DEL (U+007F) becomes ␡, so a reader sees WHAT was removed, never a font glitch, and nothing is obeyed:
//   "\x1b]52;c;..." draws "␛]52;c;...". C1 controls (U+0080-009F, which include the 8-bit CSI, OSC, DCS, APC, PM and
//   SOS introducers) have no control picture and become U+FFFD. Each mark is one single-width cell.
// - TAB becomes one space; CR LF becomes LF; a lone CR becomes LF (CR alone would let text overwrite its own line).
// - LINE / PARAGRAPH SEPARATOR (U+2028/2029) become LF.
// - Format characters (Unicode Cf: bidi embeddings, overrides and isolates, LRM/RLM/ALM, zero-width space, word
//   joiner, BOM, soft hyphen, invisible operators, interlinear annotation, tag characters, ...) are removed, except
//   ZERO WIDTH JOINER, which emoji sequences need. Variation selectors are not Cf and stay.
// - `line: true` (a title, an input value, a placeholder, a URL label): LF becomes a space too.
const BAD = /\r\n?|[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]|(?!\u200d)\p{Cf}/gu;
const QUICK = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]|(?!\u200d)\p{Cf}/u;

const REPLACEMENT = '\ufffd';

/** The visible mark of a removed control character: its control picture (C0, DEL), else U+FFFD (C1). */
export function controlMark(c: number): string {
  if (c <= 0x1f) return String.fromCodePoint(0x2400 + c);
  if (c === 0x7f) return '\u2421';
  return REPLACEMENT;
}

function fix(m: string): string {
  if (m === '\t') return ' ';
  if (m === '\r' || m === '\r\n' || m === '\u2028' || m === '\u2029') return '\n';
  const c = m.codePointAt(0)!;
  if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return controlMark(c);
  return ''; // a format character
}

/** The string as it may be drawn. Cheap when there is nothing to change (one test, no copy). */
export function safeText(s: string, o?: { line?: boolean }): string {
  let out = QUICK.test(s) ? s.replace(BAD, fix) : s;
  if (o?.line && out.includes('\n')) out = out.replace(/\n/g, ' ');
  return out;
}

/** Any value a host prop may hold: strings are made safe, anything else is returned as it is. */
export function safeProp(v: unknown, line: boolean): unknown {
  return typeof v === 'string' ? safeText(v, { line }) : v;
}

/** Engine instance props that hold text the terminal draws, and whether each is one line. The loader's host-config
 *  delta sanitizes exactly these; a new text-bearing prop on a prim must be added here. */
export const TEXT_PROPS: Readonly<Record<string, boolean>> = {
  content: false, title: true, bottomTitle: true, value: true, placeholder: true, initialValue: false,
};

/** One host prop as the engine may get it: text props made safe (StyledText chunks too), a link only with a URL
 *  safeLinkUrl accepts as a web URL (else no link: the text stays, the escape is never written). */
export function safeHostProp(key: string, v: unknown): unknown {
  if (key in TEXT_PROPS) {
    if (typeof v === 'string') return safeText(v, { line: TEXT_PROPS[key] });
    if (v && typeof v === 'object' && Array.isArray((v as { chunks?: unknown }).chunks)) {
      for (const c of (v as { chunks: { text?: unknown; link?: unknown }[] }).chunks) {
        if (typeof c.text === 'string') c.text = safeText(c.text);
        if (c.link !== undefined) c.link = safeHostProp('link', c.link);
      }
    }
    return v;
  }
  if (key === 'href') { const u = safeLinkUrl(v); return u?.kind === 'web' ? u.url : undefined; }
  if (key === 'link') {
    const u = v && typeof v === 'object' ? safeLinkUrl((v as { url?: unknown }).url) : null;
    return u?.kind === 'web' ? { url: u.url } : undefined;
  }
  return v;
}

const FILTERED = new Set([...Object.keys(TEXT_PROPS), 'href', 'link']);
/** The filter the React host calls (fork delta / patch "host-text-filter"). */
export const HOST_TEXT_FILTER = {
  text: (s: unknown): string => (typeof s === 'string' ? safeText(s) : String(s)),
  prop: safeHostProp,
  props<T extends Record<string, unknown>>(p: T): T {
    let out: Record<string, unknown> | null = null;
    for (const k in p) {
      if (!FILTERED.has(k)) continue;
      const v = safeHostProp(k, p[k]);
      if (v !== p[k]) (out ??= { ...p })[k] = v;
    }
    return (out ?? p) as T;
  },
};

/** True when `s` holds nothing safeText would change (for asserts and tests). */
export const isSafeText = (s: string): boolean => !QUICK.test(s);

// ---- Links -------------------------------------------------------------------------------------------------------

/** The longest URL a link may carry (the engine's native link slot is bounded too; longer = no link, text stays). */
export const MAX_LINK_URL = 2048;

/**
 * The URL a link may point at, or null: only absolute http(s) URLs (no credentials) and the Hub's own routes (a path
 * starting with one "/"). Everything else (javascript:, data:, file:, mailto:, ssh:, relative paths, protocol-relative
 * "//host", backslash tricks, anything with a control or space) is refused. A link is only ever followed by the person
 * choosing to (a press or a terminal's own link gesture): nothing here opens a URL.
 */
export function safeLinkUrl(href: unknown): { kind: 'web'; url: string } | { kind: 'route'; path: string } | null {
  if (typeof href !== 'string' || href.length === 0 || href.length > MAX_LINK_URL) return null;
  if (!isSafeText(href) || /[\s\\]/.test(href)) return null;
  if (href.startsWith('/') && !href.startsWith('//')) return { kind: 'route', path: href };
  let u: URL;
  try { u = new URL(href); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password || !u.hostname) return null;
  return { kind: 'web', url: u.href };
}

// ---- Clipboard ---------------------------------------------------------------------------------------------------

/** Most a copy may write (terminals cap OSC 52 near 100 kB of base64; this keeps well under). */
export const MAX_COPY_BYTES = 64 * 1024;

/** Text as it may be copied: controls other than LF and TAB removed (a paste into a shell must not carry ESC or CR
 *  tricks), format characters removed. null when it is empty or larger than MAX_COPY_BYTES. */
export function safeCopyText(s: unknown): string | null {
  if (typeof s !== 'string' || s.length === 0) return null;
  const t = s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]|(?!\u200d)\p{Cf}/gu, '');
  if (t.length === 0 || new TextEncoder().encode(t).length > MAX_COPY_BYTES) return null;
  return t;
}

/**
 * Every DIAGNOSTIC sink (render reports, captured console lines, runner stderr, gate messages, error details shown as
 * text): the same neutralisation as safeText but keeping \n and \t, then a length cap. An error message that carries
 * server or user text can never move the cursor, set a title, write the clipboard or open a link in the terminal that
 * reads the report.
 */
export function safeDiagnostic(text: unknown, maxLen = 4000): string {
  let s = typeof text === 'string' ? text : String(text);
  s = s.replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, (m) => controlMark(m.codePointAt(0)!))
    .replace(/(?!\u200d)\p{Cf}/gu, '');
  if (s.length > maxLen) s = s.slice(0, maxLen) + ` \u2026[+${s.length - maxLen}]`;
  return s;
}
