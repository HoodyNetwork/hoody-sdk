// The composer's Claude Code usage chip: the governing subscription window,
// "5-hour window 92%, resets 16:40". It turns red when the agent refuses work (the limiting window is used up and paid
// overage is not absorbing it) or the window is nearly out, amber from Claude Code's own warning floor. The rule is
// rateLimit.ts, a port of the TUI's rate-limit rule.
// The chip is a reading, not an announcement: it has no live region, so a new or replayed reading
// changes it silently. It ages itself out: at the next window reset it re-reads the held reading, and once every
// window has reset it shows nothing. The host gives the held reading (null when there is none: not a Claude Code chat, or
// no frame yet) and mounts the chip only on a Claude Code chat.
import { useEffect, useState } from 'react';
import { StatusPill, type Tone } from '../data/Display';
import { LOCALE, useStrings } from '../strings';
import { rateLimitBand, rateLimitBlocked, rateLimitNextChange, rateLimitPercent, rateLimitViewAt, type RateLimitBand, type RateLimitReading, type RateLimitView } from './rateLimit';
import strings from './RateLimitChip.strings.en.json';

export interface RateLimitChipProps {
  reading: RateLimitReading | null;
}

type T = ReturnType<typeof useStrings<typeof strings>>;

/** setTimeout's longest wait (2^31 - 1 ms); a later reset is re-armed from there. */
const MAX_WAIT = 2147483647;
const TONE: Record<RateLimitBand, Tone> = { normal: 'neutral', warning: 'warn', critical: 'danger' };

/** The next local midnight after `nowMs`: when a reset shown with its weekday ("Tue 09:00") becomes today's ("09:00"). */
function nextMidnight(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** When the chip's text next changes on its own: the earliest window reset, or local midnight when the governing reset
 *  is shown with its weekday; null when neither is ahead. */
function nextWake(reading: RateLimitReading | null, nowMs: number): number | null {
  const reset = rateLimitNextChange(reading, nowMs);
  const v = rateLimitViewAt(reading, nowMs);
  const g = v?.governing;
  const midnight = g && g.resetsAt > 0 && new Date(g.resetsAt * 1000).toDateString() !== new Date(nowMs).toDateString() ? nextMidnight(nowMs) : null;
  if (reset === null) return midnight;
  return midnight === null ? reset : Math.min(reset, midnight);
}

/** A reset instant in the viewer's time: "16:40" today, "Mon 16:40" on another day; '' when none was sent
 *  (as the TUI formats it). */
export function rateLimitResetText(resetsAt: number, nowMs: number): string {
  if (resetsAt <= 0) return '';
  const at = new Date(resetsAt * 1000);
  // Built per call, not at load: kit modules do nothing at load (kitpure.conformance.test.ts).
  const today = at.toDateString() === new Date(nowMs).toDateString();
  return new Intl.DateTimeFormat(LOCALE, { ...(today ? {} : { weekday: 'short' as const }), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
}

/** The chip's words for a view (after the TUI's chip): a refusal names the wait, not the
 *  percentage. */
export function rateLimitText(t: T, v: RateLimitView, nowMs: number): string {
  const g = v.governing;
  const window = t(`rl.window.${g.name}` as 'rl.window.five_hour');
  const at = rateLimitResetText(g.resetsAt, nowMs);
  if (rateLimitBlocked(v)) return at ? t('rl.usedUpResets', { window, at }) : t('rl.usedUp', { window });
  if (!g.hasUtilization) return at ? t('rl.resets', { window, at }) : window;
  const percent = String(rateLimitPercent(g));
  return at ? t('rl.usedResets', { window, percent, at }) : t('rl.used', { window, percent });
}

export function RateLimitChip({ reading }: RateLimitChipProps) {
  const t = useStrings(strings);
  // Every render reads the clock, so a reading is never shown against an old instant; the timer only wakes the chip at
  // the next window reset, which drops what has expired, or at local midnight, when a weekday reset becomes today's.
  const [wake, setWake] = useState(0);
  const now = Date.now();
  useEffect(() => {
    const next = nextWake(reading, Date.now());
    if (next === null) return;
    const id = setTimeout(() => setWake((n) => n + 1), Math.min(MAX_WAIT, Math.max(0, next - Date.now()) + 50));
    return () => clearTimeout(id);
  }, [reading, wake]);
  const v = rateLimitViewAt(reading, now);
  if (!v) return null;
  return (
    <StatusPill tone={TONE[rateLimitBand(v)]} icon="clock">
      {rateLimitText(t, v, now)}
    </StatusPill>
  );
}
