// A Claude Code chat's subscription usage limits: the claude.ai Pro/Max 5-hour
// and weekly windows, read for the composer's RateLimitChip. A 1:1 port of the TUI's rule
// (the governing window, blocked, the overage warning, the band), so the Hub
// and the TUI read the same governing window and the same colour for the same reading. The words differ by design (the TUI
// says "session limit" and "weekly limit", the Hub "5-hour window" and "Weekly window": RateLimitChip.strings.en.json).
// Change both together.
//
// The reading (protocol RateLimitState) arrives in two places, both free-form in the published schema until the
// daemon types them, so every field is read defensively:
// - event.rate_limit {state}: a new reading;
// - event.replay's rate_limit: the held reading on attach. Present means install it; absent means the daemon has
//   nothing to say, never that it was cleared.
// It is ACCOUNT state: the daemon never clears it, so the client ages each window out against its resets_at on its own
// clock. An idle chat can go hours without another frame, and a chip that outlived its window would be wrong.
// The agent reports a reading only when a window's rounded percentage or reset time moves, so a page that opens after
// both frames left the replay ring has no reading until the next one (the chip shows nothing).
//
// Window names are an enum from the agent and are only ever shown through the label map (RATE_LIMIT_WINDOWS): a name
// outside it is never shown, so an untrusted bridge cannot put text on the page.
import { isRecord, stringOrEmpty as str } from '@core';

/** The window names the Hub can label (the TUI's own labels). */
export const RATE_LIMIT_WINDOWS = ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet', 'seven_day_overage_included', 'overage'] as const;
export type RateLimitWindowName = (typeof RATE_LIMIT_WINDOWS)[number];

/** Claude Code's own warning floor (0.7): below it the CLI suppresses even an allowed_warning status. */
export const RATE_LIMIT_WARN = 0.7;
/** Nearly out: shared with the TUI's context meter (ctxCritThreshold). */
export const RATE_LIMIT_CRIT = 0.9;
/** The most windows one reading is read for (the agent sends a handful). */
const MAX_WINDOWS = 16;

export interface RateLimitWindow {
  name: string;
  /** The fraction used; meaningful only when hasUtilization. It may exceed 1 (usage past the window's cap). */
  utilization: number;
  hasUtilization: boolean;
  /** Unix seconds; 0 = not sent. */
  resetsAt: number;
  /** The window `status` describes. */
  limiting: boolean;
}

export interface RateLimitReading {
  /** allowed | allowed_warning | rejected, for the limiting window. */
  status: string;
  windows: readonly RateLimitWindow[];
  /** Paid overage is absorbing the work: an exhausted window is not blocked work. */
  usingOverage: boolean;
  overageStatus: string;
  rev: number;
  /** The daemon's session instance that counted `rev`. */
  epoch: number;
}

/** The statuses the agent sends (acp.IsRateLimitStatus). */
const STATUSES: readonly string[] = ['allowed', 'allowed_warning', 'rejected'];
/** The most a window's utilization can read (acp maxRateLimitUtilization): the daemon clamps to it before it sends. */
const RATE_LIMIT_MAX_UTILIZATION = 10;
/** The latest reset JS Date can render (8.64e15 ms, in seconds); a later one would make Intl throw. */
const MAX_RESETS_AT = 8_640_000_000_000;

const known = (name: string): name is RateLimitWindowName => (RATE_LIMIT_WINDOWS as readonly string[]).includes(name);

/** A whole number at or above 0, else null. */
const uint = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);

/** A RateLimitState as the daemon sends it (event.rate_limit's `state`, event.replay's `rate_limit`); null when it is
 *  not one, and then the held reading stays: a malformed frame never replaces a good one. The daemon validated the
 *  reading before it sent it (acp.ValidateRateLimit), so the frame is held to the same shape:
 *  - status is one of the agent's three; rev and epoch are whole numbers and present (Go sends both, never omitted;
 *    the daemon mints epochs inside the safe-integer range, nextRateLimitEpoch);
 *  - windows is absent (Go omits an empty list) or a list; null is refused; every window carries a boolean
 *    `limiting` (Go never omits it) and is an object, else the frame is refused;
 *  - a reset time JS Date cannot render, or a utilization above the daemon's clamp, in ANY supplied window (past the
 *    16 read too), means the frame did not come through that validation: the whole frame is refused, never rendered.
 *    The raw number is checked, before any whole-number conversion, so an unsafe integer cannot slip through as a
 *    merely malformed window;
 *  - a window with a malformed field, a name outside the label map, or a name already seen is dropped, as the daemon
 *    drops them; when a dropped window was limiting and no limiting window survives, its status is dropped with it
 *    ("allowed"), so a refusal about one window never colours another. */
export function parseRateLimit(raw: unknown): RateLimitReading | null {
  if (!isRecord(raw)) return null;
  const rev = uint(raw.rev);
  const epoch = uint(raw.epoch);
  if (rev === null || epoch === null || typeof raw.status !== 'string' || !STATUSES.includes(raw.status)) return null;
  if (raw.windows !== undefined && !Array.isArray(raw.windows)) return null;
  const supplied: readonly unknown[] = Array.isArray(raw.windows) ? raw.windows : [];
  for (const w of supplied) {
    // The daemon writes every window as a JSON object (RateLimitWindow, never null): anything else is a malformed frame.
    if (!isRecord(w)) return null;
    // Go always sends limiting (no omitempty): a missing or non-boolean value is a malformed frame, never false, or a
    // refusal could move to another window.
    if (typeof w.limiting !== 'boolean') return null;
    if (typeof w.resets_at === 'number' && w.resets_at > MAX_RESETS_AT) return null;
    if (typeof w.utilization === 'number' && w.utilization > RATE_LIMIT_MAX_UTILIZATION) return null;
  }
  const seen = new Set<string>();
  const windows: RateLimitWindow[] = [];
  let droppedLimiting = false;
  let keptLimiting = false;
  for (const [i, w] of supplied.entries()) {
    if (!isRecord(w)) continue;
    const limiting = w.limiting === true;
    // Past the cap a window is not read, but a limiting one still takes its status with it.
    if (i >= MAX_WINDOWS) {
      if (limiting) droppedLimiting = true;
      continue;
    }
    const resetsAt = w.resets_at === undefined ? 0 : uint(w.resets_at);
    const u = w.utilization === undefined ? 0 : w.utilization;
    if (typeof w.name !== 'string' || !known(w.name) || seen.has(w.name) || resetsAt === null || typeof u !== 'number' || !Number.isFinite(u) || u < 0) {
      if (limiting) droppedLimiting = true;
      continue;
    }
    seen.add(w.name);
    if (limiting) keptLimiting = true;
    windows.push({ name: w.name, utilization: u, hasUtilization: w.has_utilization === true, resetsAt, limiting });
  }
  const status = droppedLimiting && !keptLimiting ? 'allowed' : raw.status;
  const overageStatus = str(raw.overage_status);
  return { status, windows, usingOverage: raw.is_using_overage === true, overageStatus: STATUSES.includes(overageStatus) ? overageStatus : '', rev, epoch };
}

/** Whether `next` replaces `held` (protocol.RateLimitSupersedes): a reading from another daemon lifetime always does;
 *  within one, only a greater rev (a replay can arrive after a newer frame that was already queued). */
export function rateLimitSupersedes(held: RateLimitReading | null, next: RateLimitReading): boolean {
  if (!held) return true;
  if (next.epoch !== held.epoch) return true;
  return next.rev > held.rev;
}

export interface RateLimitShownWindow extends RateLimitWindow { name: RateLimitWindowName }

/** The reading as it can be shown at one instant: only the windows still current. */
export interface RateLimitView {
  /** The one window to show: the limiting window when the agent named one, else the busiest. */
  governing: RateLimitShownWindow;
  windows: readonly RateLimitShownWindow[];
  /** '' when the status belonged to a limiting window that has since reset. */
  status: string;
  usingOverage: boolean;
  overageStatus: string;
}

/** The reading at `nowMs`; null when nothing is current (every window reset, or none the Hub can label).
 *  The status expires with its window: a "rejected" about a 5-hour window that has reset must not colour a surviving
 *  weekly window red. It is kept while its limiting window is current, or, when none was named, while any window is. */
export function rateLimitViewAt(r: RateLimitReading | null, nowMs: number): RateLimitView | null {
  if (!r) return null;
  const now = Math.floor(nowMs / 1000);
  const windows: RateLimitShownWindow[] = [];
  let sawLimiting = false;
  let limitingCurrent = false;
  for (const w of r.windows) {
    if (!known(w.name)) continue;
    if (w.limiting) sawLimiting = true;
    if (w.resetsAt > 0 && w.resetsAt <= now) continue;
    windows.push({ ...w, name: w.name });
    if (w.limiting) limitingCurrent = true;
  }
  if (!windows.length) return null;
  let governing = windows[0]!;
  for (const w of windows) {
    if (w.limiting) { governing = w; break; }
    if (w.hasUtilization && (!governing.hasUtilization || w.utilization > governing.utilization)) governing = w;
  }
  return { governing, windows, status: !sawLimiting || limitingCurrent ? r.status : '', usingOverage: r.usingOverage, overageStatus: r.overageStatus };
}

/** The agent is refusing work: the limiting window is rejected and paid overage is not absorbing it. */
export function rateLimitBlocked(v: RateLimitView): boolean {
  return v.status === 'rejected' && !v.usingOverage;
}

export type RateLimitBand = 'normal' | 'warning' | 'critical';

/** The chip's band, by Claude Code's own severity rules. While overage absorbs the work nothing is refused, so it is
 *  never critical; a warning only when the overage itself is running out. */
export function rateLimitBand(v: RateLimitView): RateLimitBand {
  if (rateLimitBlocked(v)) return 'critical';
  if (v.usingOverage) return v.overageStatus === 'allowed_warning' ? 'warning' : 'normal';
  const g = v.governing;
  if (g.hasUtilization) {
    if (g.utilization >= RATE_LIMIT_CRIT) return 'critical';
    if (g.utilization >= RATE_LIMIT_WARN) return 'warning';
  }
  // Claude Code does not surface an allowed_warning below its floor either; with no number the status is all there is.
  if (v.status === 'allowed_warning' && (!g.hasUtilization || g.utilization >= RATE_LIMIT_WARN)) return 'warning';
  return 'normal';
}

/** Whole percent used, rounded down (a window past its cap reads over 100). */
export function rateLimitPercent(w: RateLimitWindow): number {
  return Math.floor(w.utilization * 100);
}

/** When the shown reading next changes on its own (the earliest reset still ahead, ms); null when none is ahead. */
export function rateLimitNextChange(r: RateLimitReading | null, nowMs: number): number | null {
  if (!r) return null;
  let next: number | null = null;
  for (const w of r.windows) {
    const at = w.resetsAt * 1000;
    if (w.resetsAt > 0 && at > nowMs && (next === null || at < next)) next = at;
  }
  return next;
}
