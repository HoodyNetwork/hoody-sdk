// The terminal window title (OSC 0/2), the terminal's document.title: the ONE writer. Pages declare through
// kit/windowTitle (a chat's name, a shown secret); this component, mounted once beside the shell (app/App.tsx), turns
// the route's page, the lock and those declarations into one line and hands it to the engine (renderer
// setTerminalTitle, which writes it in order with the frames, as the engine does OSC 52 for prim/clipboard.ts).
//
//   page            "<Page> · Hoody Hub"
//   detail declared "<detail> · <Page> · Hoody Hub" (AI: "<chat name> · AI · Hoody Hub")
//   locked          "Locked · Hoody Hub"   (fixed: nothing of the page or the declarations)
//   secret shown    "Hoody Hub"            (fixed, a SecretField's reveal holds it: kit/forms/Secret.term.tsx)
//
// Every part passes cleanTitlePart: safeText's control rule (no ESC, BEL, C0, DEL or C1 byte reaches the terminal; each
// is drawn as its visible mark), line breaks and runs of white space become one space, at most TITLE_PART_MAX
// characters each and TITLE_MAX in all. The engine has no title stack (XTWINOPS 22/23), so the end writes an empty
// title: the terminal shows its own again. Nothing is written when the output is not a terminal.
import { useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useLocked } from '@core/shell';
import type { PageManifest } from '@kit/page';
import { makeT } from '@kit/strings';
import { useWindowTitleState } from '@kit/windowTitle';
import { useRenderer } from '../prim/engine';
import { safeText } from '../prim/safe';
import strings from './windowTitle.strings.en.json';

/** The most characters (code points) one part keeps: a page title or a declared detail. */
export const TITLE_PART_MAX = 60;
/** The most characters the whole title keeps. */
export const TITLE_MAX = 120;
const SEP = ' · ';
const ELLIPSIS = '…';
// Anything a terminal could obey: C0, DEL, C1. safeText leaves none; checked again before the write.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

function cut(s: string, max: number): string {
  const cps = [...s];
  return cps.length <= max ? s : cps.slice(0, Math.max(0, max - 1)).join('').trimEnd() + ELLIPSIS;
}

/** One part as the title may hold it: cleaned, one line, bounded; '' when nothing is left. */
export function cleanTitlePart(s: unknown, max = TITLE_PART_MAX): string {
  if (typeof s !== 'string') return '';
  const one = safeText(s, { line: true }).replace(/\s+/gu, ' ').trim();
  return cut(one, max);
}

// Id- and address-shaped words in a declared detail (a chat's name is untrusted text): a 24-hex id (also inside a word
// such as realm_<id>), an access-key or
// Bot-key shape, an IPv4 or IPv6 address, a host name (three or more labels joined by dots, ending in a letters-only label). Each becomes
// ELLIPSIS: a title is read by window lists and tab bars, where an id or address has no place. The page part is ours and
// is not masked. A host name has three labels or more (a computer's address does); a two-label word such as
// "Node.js" or "example.com" stays. IPv6: at least three hex groups, full or "::"-compressed; a clock time stays. An
// address joined to a word by an underscore (ip_<address>), or after a label and a colon (host:<IPv6>), is masked too.
const DETAIL_MASKS: readonly RegExp[] = [
  /(?:hdy|hbk)_[A-Za-z0-9_-]+/gu,
  /(?<![0-9a-fA-F])[0-9a-fA-F]{24}(?![0-9a-fA-F])/gu,
  /(?<![0-9A-Za-z])(?:\d{1,3}\.){3}\d{1,3}(?![0-9A-Za-z])/gu,
  /(?<![A-Za-z0-9])(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.){2,}[A-Za-z]{2,}(?![A-Za-z0-9])/gu,
];

const IPV6 = /(?:(?<![0-9A-Za-z:])|(?<=[0-9A-Za-z_]:))[0-9A-Fa-f]{0,4}(?::[0-9A-Fa-f]{0,4}){2,7}(?![0-9A-Za-z:])/gu;
const isIpv6 = (m: string): boolean => {
  const groups = m.split(':').filter((g) => g !== '').length;
  return groups >= 3 && (m.includes('::') || m.split(':').length >= 4);
};

/** A declared detail with every id- or address-shaped word replaced by "…". */
// A ZERO WIDTH JOINER, a combining mark, a variation selector, or the mark safeText draws for a control character (a
// control picture, U+FFFD) next to a printable ASCII character could split a key or an id so that the masks miss it.
// Those go before masking; an emoji's own joiners and selectors stay. A decomposed accent on an ASCII letter goes too
// (an "e" + U+0301 shows as "e"): composing it instead would let a mark inside a key or id hide it again. A mark that
// belongs to a letter or symbol of another script stays, ASCII after it or not.
const SPLITTING_MARKS = /(?<=[\x21-\x7e])[\u200d\p{M}\u2400-\u2421\ufffd]+|(?<![^\x00-\x7f])[\u200d\p{M}\u2400-\u2421\ufffd]+(?=[\x21-\x7e])/gu;

export function maskTitleDetail(s: string): string {
  return DETAIL_MASKS.reduce((t, re) => t.replace(re, ELLIPSIS), s.replace(SPLITTING_MARKS, '')).replace(IPV6, (m) => (isIpv6(m) ? ELLIPSIS : m));
}

export interface TitleFacts {
  /** The route's page title, already translated; null when no page matched. */
  readonly page: string | null;
  /** The newest declared detail (raw), or null. */
  readonly detail: string | null;
  readonly locked: boolean;
  /** A screen holds the neutral title (a secret is shown). */
  readonly neutral: boolean;
}

/** The title for these facts. Pure: the writer and the tests share it. */
export function termWindowTitle(f: TitleFacts): string {
  const brand = strings.brand;
  if (f.locked) return `${strings.locked}${SEP}${brand}`;
  if (f.neutral) return brand;
  // The detail is cleaned FIRST (safeText drops format characters such as U+200B), then masked: an id split by an
  // invisible character would pass the masks and be whole again once cleaned.
  const parts = [cleanTitlePart(typeof f.detail === 'string' ? maskTitleDetail(safeText(f.detail, { line: true })) : f.detail), cleanTitlePart(f.page)].filter((p) => p !== '');
  const text = cut([...parts, brand].join(SEP), TITLE_MAX);
  return CONTROL.test(text) ? brand : text;
}

interface TitleHost { setTerminalTitle(title: string): void }
type Out = { readonly isTTY?: boolean } | undefined;
const processOut = (): Out => (globalThis as { process?: { stdout?: Out } }).process?.stdout;
let outOf = processOut;
let observer: ((title: string) => void) | null = null;

/** Tests only: what "the output" is (a headless renderer reaches no terminal, so a test says it is one), and an
 *  observer of every title handed to the engine. */
export const __windowTitleSeams = {
  setOutput(o: Out | null): void { outOf = o === null ? processOut : () => o; },
  observe(fn: ((title: string) => void) | null): void { observer = fn; },
};

function write(r: TitleHost, title: string): void {
  if (outOf()?.isTTY !== true) return;
  observer?.(title);
  try { r.setTerminalTitle(title); } catch { /* an ended renderer: nothing to title */ }
}

/** Mounted once, inside the router (app/App.tsx). */
export function WindowTitle({ pages }: { pages: readonly PageManifest[] }): null {
  const r = useRenderer() as unknown as TitleHost;
  const current = useRouterState({ select: (s) => s.matches[s.matches.length - 1]?.staticData.pageId });
  const page = pages.find((p) => p.id === current);
  const locked = useLocked();
  const { detail, neutral } = useWindowTitleState();
  const title = termWindowTitle({ page: page ? makeT(page.strings)(page.title) : null, detail, locked, neutral });
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current === title) return;
    last.current = title;
    write(r, title);
  }, [r, title]);
  // The end: the terminal's own title again (no title stack in the engine).
  useEffect(() => () => { if (last.current !== null) write(r, ''); }, [r]);
  return null;
}
