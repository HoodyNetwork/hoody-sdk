// "Put on Board" for a launch: the Board's own link for its place (board links boardAddPath), or why the Board can't
// show it. A marked launch (Open with, Launch an app here) gets its program board's keyed link (programBoard). The place is the launcher's own placementOf(...).now (launch/placement.ts) and the host check the Board's
// own (tileHostFits), so the Apps list and its details offer the place the launcher would place right away. (The
// launcher's other choices, such as a held Open's terminal, are its own.)
import type { Target } from '@core';
import { boardAddPath, tileHostFits, type BoardKey } from '../../board/links';
import { namesOf } from '../launch/openWith/facts';
import { placementOf, type Placement } from '../launch/placement';
import { marked, type OpenApp } from '../logic';
import type { StoredRow } from './recent';

/** Whether the Board can give this place a tile on this computer: a web port always (never judged here), a terminal
 *  or display when the Board can address its host. */
export function tileFits(target: Target, at: Placement): boolean {
  return at.kind === 'port' || tileHostFits(at.kind, at.session, { id: target.container.id, project_id: target.project.id, server_name: target.container.server_name });
}

/** A Board link for the launch's place; `refused` with that place when the Board can't show it as a tile (the
 *  details then offer the place in a new tab); null when it has no place yet (still opening, never started, ended) or
 *  no Board link. */
export type BoardOffer = { readonly to: string } | { readonly refused: Placement } | null;

export type OfferRow = Pick<OpenApp, 'state' | 'opensIn'> & Partial<Pick<OpenApp, 'p' | 'name' | 'app' | 'candidate' | 'code'>>;

// A Files script launch's candidate (recent.ts owCandidate): `other:ow-<program word>-<subject>`.
const OW_CANDIDATE = /^other:ow-([a-z0-9][a-z0-9-]{0,31})-[0-9a-f]{32}$/;
const KEY_MAX = 64;
/** A program board's name as the Board accepts it (board NAME_MAX, UTF-16 units, no control character). */
const LABEL_MAX = 32;
const CONTROLS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

const graphemes = (s: string): string[] =>
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment)
    : Array.from(s);
/** `s` cut by whole graphemes to at most `max` UTF-16 units (with "…" when cut). */
function cutUnits(s: string, max: number, mark = '…'): string {
  if (s.length <= max) return s;
  let out = '';
  for (const g of graphemes(s)) {
    if (out.length + g.length > max - mark.length) break;
    out += g;
  }
  return out + mark;
}
/** A Board name from a program or app name: controls and runs of spaces made one space, at most 32 units; null if empty. */
export function boardLabel(name: string): string | null {
  const s = name.replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim();
  return s ? cutUnits(s, LABEL_MAX).trim() || null : null;
}
/** FNV-1a over UTF-16 units, 8 hex: distinguishes long app names that share their first characters. */
function hash8(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}
/** The `app:` key of an app name: whole when it fits 64 units, else a cut of it plus a hash of the whole name. */
function appKey(app: string): string {
  const whole = 'app:' + app.replace(CONTROLS, ' ');
  if (whole.length <= KEY_MAX && whole === 'app:' + app) return whole;
  const tail = '-' + hash8(app);
  return cutUnits(whole, KEY_MAX - tail.length, '') + tail;
}

/**
 * A marked launch's program board: `ow:<template id>` (or `ow:cmd`, `ow:run`, `ow:here`) named
 * by its program, `app:<app name>` for Launch an app here. The key is found by the Board on the computer the link
 * names, so one board per program per computer. undefined: an unmarked row (today's link: the active board). null: a
 * marked row whose program cannot be told (then no keyed link either: never the active board's).
 */
export function programBoard(r: Pick<OpenApp, 'name'> & Partial<Pick<OpenApp, 'p' | 'app' | 'candidate'>>): BoardKey | null | undefined {
  if (!marked(r)) return undefined;
  if (r.p === 'apphere') {
    const app = r.app || r.name;
    // The Board keeps keys to 64 units and names to 32: a long app name keys by a cut plus a hash of the whole name
    // (two long names sharing a start get two boards), and its board is named by the row's name, cut.
    const label = boardLabel(r.name || app);
    return app && label ? { k: appKey(app), label } : null;
  }
  const word = OW_CANDIDATE.exec(r.candidate ?? '')?.[1];
  const label = boardLabel(namesOf(r.name).p);
  return word && label ? { k: 'ow:' + word, label } : null;
}

/** Where a launch shows on the Board: placementOf's place, and for an ended Files launch its terminal (the program ran
 *  as a tracked child, so terminal N outlives it until Close terminal); a leftover terminal is never a launch. */
function placeOf(r: OfferRow, run: StoredRow | undefined, opening: boolean): Placement | undefined {
  const now = placementOf(r, run, opening).now;
  if (now || !marked(r) || !run || opening || run.left || r.code === 'terminal_left') return now;
  return r.state === 'exited' ? { kind: 'terminal', session: run.terminal_id } : undefined;
}

export function boardOffer(r: OfferRow, run: StoredRow | undefined, target: Target | null | undefined, opening: boolean): BoardOffer {
  const at = placeOf(r, run, opening);
  if (!at || !target) return null;
  if (!tileFits(target, at)) return { refused: at };
  // A marked launch lands on its program's board, keyed; an unmarked one keeps the plain link.
  const board = r.name !== undefined ? programBoard({ ...r, name: r.name }) : marked(r) ? null : undefined;
  if (board === null) return null;
  let to = '';
  if (!board) to = boardAddPath(target, at);
  else if (at.kind !== 'port') to = boardAddPath(target, { kind: at.kind, session: at.session, board });
  return to ? { to } : null;
}
