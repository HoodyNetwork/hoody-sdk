// displayShot.ts: a screenshot of one of a computer's displays, as a file for the chat composer's own add path.
//   - Which displays: the computer's runtime read (core computerRuntimeRoute, GET /computers/:id?runtime=true), one request per
//     press, never polled. Only a display that runs is offered (`live`, or a row that names no state): one that waits for its
//     first use would be started by a capture and show nothing, and one without its viewer cannot be captured.
//   - The capture: the display program's GET /api/v1/display/screenshot on display N of that computer (the kit route's index),
//     answered as PNG bytes of the whole screen. Read through core download: the host comes from the target alone, no
//     credential or caller header goes, the answer is bounded (SHOT_BYTES) and never followed elsewhere.
//   - The bytes stay in memory: they become one File ("display-1 YYYY-MM-DD HH-MM-SS.png") handed to the composer's host, whose
//     rules decide what is kept (how many images, how large, made smaller to fit). Nothing is stored here and nothing is sent
//     to the agent: that is the message's own Send.
//   - Never retried by itself. A failure is one of SHOT_WHY, for the composer to say.
import { api, capture, computerRuntimeRoute, defineRoute, download, type Ctx, type Target } from '@core';

/** A display number the Hub names (program ids stop at 9999). */
export const isDisplayNumber = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 9999;
/** The most a capture may weigh as it arrives; the composer's host makes a large image smaller, or refuses it. */
export const SHOT_BYTES = 24 * 1024 * 1024;
/** At most this many displays are offered (the runtime read lists at most 50). */
export const SHOT_DISPLAYS = 50;
const TITLES = 2;
const TITLE_CHARS = 60;

export const shotRoutes = {
  /** A new capture of display N (the index): the whole screen, as PNG bytes. No query: no region, no pointer, no base64. */
  capture: defineRoute<unknown>({
    method: 'GET', path: '/api/v1/display/screenshot', scope: 'kit', kit: 'display', index: isDisplayNumber,
    // A display can show secrets: a Hub shown inside another page takes no screenshot (refused unsent).
    maxBytes: SHOT_BYTES, timeoutMs: 30_000, framed: false,
  }),
};

/** A display that can be captured now: its number, how many windows it shows and the first of their titles. */
export interface ShotDisplay { n: number; windows: number; titles: string[] }

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

// A window title is another program's text: control characters, zero-width marks and direction overrides are dropped before
// it is cut, so a title cannot reorder or hide what the dialog shows.
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/gu;

/** Whether a runtime answer lists its displays at all (a list, even an empty one). */
export const listsDisplays = (answer: unknown): boolean => Array.isArray(rec(rec(rec(answer)?.data)?.runtime_info)?.displays);

/** The displays of a runtime answer that run now, by number. Anything that is not such a row is left out; not a list: none. */
export function displaysOf(answer: unknown): ShotDisplay[] {
  const list = rec(rec(rec(answer)?.data)?.runtime_info)?.displays;
  if (!Array.isArray(list)) return [];
  const found = new Map<number, ShotDisplay>();
  for (const it of list.slice(0, SHOT_DISPLAYS)) {
    const row = rec(it);
    if (!row || !isDisplayNumber(row.display) || found.has(row.display)) continue;
    // Only a display said to be live: a state this Hub does not know arrives with no state at all (the API drops it), and a
    // capture would start a display that waits for its first use.
    if (row.state !== 'live') continue;
    const wins = Array.isArray(row.windows) ? row.windows : [];
    const titles = wins.flatMap((w) => {
      const title = rec(w)?.title;
      const s = typeof title === 'string' ? title.replace(/\s+/gu, ' ').replace(HIDDEN, '').trim() : '';
      return s ? [[...s].slice(0, TITLE_CHARS).join('')] : [];
    });
    found.set(row.display, { n: row.display, windows: wins.length, titles: titles.slice(0, TITLES) });
  }
  return [...found.values()].sort((a, b) => a.n - b.n);
}

const two = (n: number): string => String(n).padStart(2, '0');
/** The file's name: the display and the local second it was taken ("display-1 YYYY-MM-DD HH-MM-SS.png"): two pictures of one
 *  display in the same minute read apart. */
export function shotName(n: number, at: Date): string {
  return `display-${n} ${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}-${two(at.getMinutes())}-${two(at.getSeconds())}.png`;
}

/** Why no screenshot was attached. `gone`: the display stopped; `unreachable`: no answer from the computer; `private`: this
 *  session may not reach it; `tooBig`: over SHOT_BYTES; `notImage`: the answer was not a PNG; `stale`: the chat's context ended
 *  (nothing is said); `framed`: the Hub is shown inside another page and refused the request unsent; `failed`: anything else.
 *  A token session refused unsent for a permission it lacks (TOKEN_LACKS) reads `private`. */
export type ShotWhy = 'gone' | 'unreachable' | 'private' | 'framed' | 'tooBig' | 'notImage' | 'stale' | 'failed';
export class ShotError extends Error {
  constructor(readonly why: ShotWhy, readonly error?: unknown) { super(why); }
}

/** A rejection of core's, as a reason. */
export function shotWhy(e: unknown): ShotWhy {
  const r = rec(e);
  if (!r) return 'failed';
  const kind = typeof r.kind === 'string' ? r.kind : '';
  const status = typeof r.status === 'number' ? r.status : 0;
  if (kind === 'stale' || r.stale === true || kind === 'aborted') return 'stale';
  if (r.code === 'FRAMED_ACTION_REFUSED') return 'framed';
  if (r.code === 'TOKEN_LACKS') return 'private';
  if (kind === 'too_large') return 'tooBig';
  if (kind === 'private' || status === 401 || status === 403) return 'private';
  if (r.code === 'DISPLAY_NOT_AVAILABLE' || status === 503) return 'gone';
  if (kind === 'unreachable' || kind === 'preflight_refused') return 'unreachable';
  return 'failed';
}

/** One context for a press: the list and the capture belong to the same account, realm and computer. */
export const shotCtx = (target: Target): Ctx => capture(target);

/** The displays of the chat's computer that run now. Rejects with a ShotError. */
export async function listDisplays(target: Target, o: { ctx: Ctx; signal?: AbortSignal }): Promise<ShotDisplay[]> {
  let answer: unknown;
  try {
    answer = await api(computerRuntimeRoute, { params: { id: target.container.id }, query: { runtime: true }, ctx: o.ctx, signal: o.signal });
  } catch (e) {
    throw new ShotError(shotWhy(e), e);
  }
  // An answer that does not list displays was not read: it is never "no display runs".
  if (!listsDisplays(answer)) throw new ShotError('failed');
  return displaysOf(answer);
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A new capture of display `n` on the chat's computer, as a PNG file. Rejects with a ShotError. */
export async function captureDisplay(target: Target, n: number, o: { ctx: Ctx; signal?: AbortSignal; now?: Date }): Promise<File> {
  let parts: Blob[];
  try {
    parts = (await download(shotRoutes.capture, { target, index: n, ctx: o.ctx, signal: o.signal, maxBytes: SHOT_BYTES })).parts;
  } catch (e) {
    throw new ShotError(shotWhy(e), e);
  }
  const blob = new Blob(parts, { type: 'image/png' });
  let head: Uint8Array;
  try { head = new Uint8Array(await blob.slice(0, PNG.length).arrayBuffer()); } catch (e) { throw new ShotError('failed', e); }
  if (head.length < PNG.length || !PNG.every((b, i) => head[i] === b)) throw new ShotError('notImage');
  return new File([blob], shotName(n, o.now ?? new Date()), { type: 'image/png' });
}
