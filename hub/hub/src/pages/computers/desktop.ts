// A computer's desktops (the proxy's `desktop` service): desktop N is https://<project>-<computer>-desktop-<N>.<server>.
// <proxy domain>. Opening it starts terminal session and display 1600 + N with a desktop environment (hoody-terminal's
// display redirect) and lands on that display's web viewer, so opening the address is the start: there is no other
// call. Terminal and display ids stop at 9999 (Hub rule), so N runs 1..8399.
//
// Contract, in plain words:
//   - desktopsOf(body) → the desktop numbers the terminal kit's session list shows (GET /api/v1/terminal/sessions:
//     a row with desktop_mode true and a terminal id 1601..9999), sorted, without repeats; desktop 1 always first,
//     since it opens whether or not it was started before. Anything else in a row (command history included) is
//     never kept. Not a list: [1].
//   - desktopShellOf(body, n) → whether the session list shows desktop N's session (terminal id 1600 + N, desktop_mode
//     true, not a program's) and the incarnation of its shell (32 lowercase hex, else null): Stop ends exactly that
//     shell (DELETE ?incarnation=), never a later one under the same number. null when the answer is not a list (it
//     proves nothing, so Stop leaves the reset undone).
//   - desktopEnvsOf(body) → the environments GET /api/v1/system/desktop-envs lists ({id, label, installed}), or null
//     when the answer is not such a list; DESKTOP_ENVS_FALLBACK is what the picker offers until the terminal program
//     answers that route. An id is sent only when it matches DESKTOP_ENV_ID.
//   - DESKTOP_FRAME_FEATURES / DESKTOP_FRAME_SANDBOX: what a remote desktop needs inside the Hub and nothing more
//     (core's display-frame.ts holds them). desktopFrameAllow(origins) grants the features to exactly the frame's
//     origins: the desktop address and the display it redirects to (a bare feature would reach only the first, the
//     frame's src).
import { DISPLAY_FRAME_FEATURES, DISPLAY_FRAME_SANDBOX, DISPLAY_FRAME_SLOW_MS, displayFrameAllow } from '@core';
import strings from './strings.en.json';

export const DESKTOP_OFFSET = 1600;
export const DESKTOP_MAX = 9999 - DESKTOP_OFFSET;

/** The display a desktop shows (and the terminal session it runs): 1600 + N. */
export const desktopDisplay = (n: number): number => DESKTOP_OFFSET + n;

export const isDesktopNumber = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= DESKTOP_MAX;

export function desktopsOf(body: unknown): number[] {
  return [...new Set([1, ...(desktopSessionsOf(body) ?? [])])].sort((a, b) => a - b);
}

/** The desktop numbers whose session the list shows (desktop 1 only when listed), null when the answer is not a list:
 *  the Desktop tab reads a stopped desktop listed again as opened again. */
export function desktopSessionsOf(body: unknown): number[] | null {
  if (!Array.isArray(body)) return null;
  const found = new Set<number>();
  for (const it of body) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
    const r = it as Record<string, unknown>;
    if (r.desktop_mode !== true) continue;
    const raw = r.terminal_id ?? r.id;
    const s = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw : '';
    if (!/^[0-9]{1,5}$/.test(s)) continue;
    const n = Number(s) - DESKTOP_OFFSET;
    if (isDesktopNumber(n)) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

/** Whether a Stop desktop step's answer leaves the outcome unknown: a lost answer, a press core refused before sending
 *  while a Stop is already on its way (BUSY), or any answer but done to a press made after a lost answer (`again`):
 *  such a press decided nothing about the first one; a busy display (409) does not prove the first Stop missed. Only a
 *  display gone (404) settles it, which the caller reads first, as it does a session replaced (409). */
export const stopUndecided = (r: { outcome: string; code?: string }, again: boolean): boolean =>
  r.outcome === 'pending' || (r.outcome === 'not_sent' && r.code === 'BUSY') || (again && r.outcome !== 'done');

// The frame's sandbox, feature list, allow builder and slow line are core's (display-frame.ts), shared with every page
// that embeds a display viewer; the names below are this page's.
export const DESKTOP_FRAME_FEATURES = DISPLAY_FRAME_FEATURES;
export const desktopFrameAllow = displayFrameAllow;
export const DESKTOP_FRAME_SANDBOX = DISPLAY_FRAME_SANDBOX;
export const DESKTOP_SLOW_MS = DISPLAY_FRAME_SLOW_MS;

/** desktopShellOf: what the session list says about desktop N's own session. */
export type DesktopShell = { listed: false } | { listed: true; incarnation: string | null };

export function desktopShellOf(body: unknown, n: number): DesktopShell | null {
  if (!Array.isArray(body)) return null;
  if (!isDesktopNumber(n)) return { listed: false };
  const want = String(desktopDisplay(n));
  for (const it of body) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
    const r = it as Record<string, unknown>;
    if (r.desktop_mode !== true || r.daemon_program === true) continue;
    const raw = r.terminal_id ?? r.id;
    const s = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw : '';
    if (s !== want) continue;
    const inc = typeof r.incarnation === 'string' && /^[0-9a-f]{32}$/.test(r.incarnation) ? r.incarnation : null;
    return { listed: true, incarnation: inc };
  }
  return { listed: false };
}

/** A desktop environment the picker offers: the id sent as ?desktop_env=, its name, and whether the computer has it
 *  installed (null: not reported). */
export interface DesktopEnv {
  readonly id: string;
  readonly label: string;
  readonly installed: boolean | null;
}

/** An environment id the Hub puts in a desktop address: lowercase letters, digits, '-' and '_', at most 32. */
export const DESKTOP_ENV_ID = /^[a-z][a-z0-9_-]{0,31}$/;

/** The environments offered until the terminal program lists them itself: the two it accepts today.
 *  The one place they are written; whether a computer has them installed is not reported. */
export const DESKTOP_ENVS_FALLBACK: readonly DesktopEnv[] = [
  { id: 'xfce', label: strings['desktop.env.xfce'], installed: null },
  { id: 'mate', label: strings['desktop.env.mate'], installed: null },
];

/** At most this many environments are kept from a listing. */
export const DESKTOP_ENVS_MAX = 16;

export function desktopEnvsOf(body: unknown): DesktopEnv[] | null {
  const o = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const rows = Array.isArray(body) ? body : Array.isArray(o?.data) ? o.data : Array.isArray(o?.environments) ? o.environments : null;
  if (!rows) return null;
  const out: DesktopEnv[] = [];
  for (const it of rows) {
    if (out.length >= DESKTOP_ENVS_MAX) break;
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
    const r = it as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : '';
    if (!DESKTOP_ENV_ID.test(id) || out.some((e) => e.id === id)) continue;
    const name = typeof r.label === 'string' ? r.label.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 40) : '';
    out.push({ id, label: name || id, installed: typeof r.installed === 'boolean' ? r.installed : null });
  }
  return out.length > 0 ? out : null;
}
