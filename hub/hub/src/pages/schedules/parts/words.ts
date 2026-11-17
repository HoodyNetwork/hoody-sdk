// Words for the keyed values logic.ts returns. Nothing here decides anything; it only spells.
import { formatRelative, type Tone, type Translate } from '@kit';
import { LOCALE } from '@kit';
import type { Kit, Label, Last, Next, Preset, SchedRow, SourceKey, SourceState } from '../logic';
import { clock, recognise } from '../logic';
import type strings from '../strings.en.json';

export type T = Translate<typeof strings>;

export const pad = (n: number): string => String(n).padStart(2, '0');
const at = (h: number, m: number): string => `${pad(h)}:${pad(m)}`;

export function labelText(t: T, l: Label): string {
  switch (l.k) {
    case 'timer': return t('label.timer', { name: l.name });
    case 'name': case 'cmd': case 'script': return l.name;
    case 'unnamed': return t('label.unnamed');
    case 'web': return l.host ? t('label.webHost', { method: l.method, host: l.host }) : t('label.web');
    case 'loop': return t('label.loop');
  }
}

/** "5 minutes", "2 hours": the whole units an interval is made of. */
function durationText(t: T, msec: number): string {
  const s = Math.max(1, Math.round(msec / 1000));
  if (s < 60) return t('dur.s', { count: s });
  const m = Math.round(s / 60);
  if (m < 60) return t('dur.min', { count: m });
  const h = Math.round(m / 60);
  if (h < 48) return t('dur.h', { count: h });
  return t('dur.d', { count: Math.round(h / 24) });
}

const weekday = (d: number): string => new Intl.DateTimeFormat(LOCALE, { weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(2023, 0, 1 + d));

/** The schedule in words: "Every day at 08:00". The expression itself goes in a tooltip. */
export function scheduleText(t: T, r: SchedRow): string {
  if (r.sched.every !== undefined) return t('p.interval', { d: durationText(t, r.sched.every) });
  const p: Preset | undefined = r.sched.preset;
  if (!p) return r.sched.human || r.sched.expr || '';
  return p.k === 'custom' ? r.sched.human || p.expr : presetText(t, p);
}

function presetText(t: T, p: Exclude<Preset, { k: 'custom' }>): string {
  switch (p.k) {
    case 'reboot': return t('p.reboot');
    case 'every': return t('p.every', { d: t('dur.min', { count: p.n }) });
    case 'hourly': return t('p.hourly', { m: pad(p.m) });
    case 'daily': return t('p.daily', { at: at(p.h, p.m) });
    case 'weekdays': return t('p.weekdays', { at: at(p.h, p.m) });
    case 'weekly': return t('p.weekly', { days: p.days.map(weekday).join(', '), at: at(p.h, p.m) });
    case 'monthly': return t('p.monthly', { d: p.d, at: at(p.h, p.m) });
  }
}

/** What an expression typed in the editor means, in words: every minute, every n minutes (only when n divides 60: cron
 *  steps restart each hour, so `*\/7` is not every 7 minutes), or a preset as the list names it. Anything else is null
 *  (the editor still shows its next runs). A web request must already be in the shape logic.problem accepts (single
 *  spaces) with a leading seconds field of 0, so no words show beside its format error. */
export function exprText(t: T, kit: Kit, expr: string): string | null {
  const e = kit === 'curl' ? expr.trim() : expr.trim().replace(/\s+/g, ' ');
  const f = kit === 'curl' ? (/^0 (\S+ \S+ \S+ \S+ \S+)$/.exec(e)?.[1] ?? null) : e;
  if (f === null) return null;
  if (f === '* * * * *') return t('p.everyMinute');
  const n = /^\*\/(\d{1,2}) \* \* \* \*$/.exec(f);
  if (n) {
    const k = Number(n[1]);
    return k >= 1 && k < 60 && 60 % k === 0 ? t('p.every', { d: t('dur.min', { count: k }) }) : null;
  }
  const p = recognise(kit, e);
  return p.k === 'custom' ? null : presetText(t, p);
}

export interface Zone {
  /** The computer's offset from UTC in seconds, when known. */
  offset: number | null;
  /** Your own IANA zone. */
  mine: string;
}

const NEXT_KEYS = ['paused', 'expired', 'reboot', 'tz', 'never', 'needs', 'none', 'off', 'unknown', 'running', 'error', 'ended', 'stopped'] as const;

/** "in 3 minutes · 14:00 computer time" with your own clock when the two differ. */
export function timeText(t: T, when: number, now: number, zone: Zone, source: 'system' | 'utc' = 'system'): string {
  const rel = formatRelative(when, now);
  const far = Math.abs(when - now) >= 20 * 3600000;
  const src = clock(when, source === 'utc' ? 'utc' : zone.offset ?? 'utc', LOCALE, far);
  const mine = clock(when, zone.mine, LOCALE, far);
  if (src === null) return mine === null ? rel : t('next.atLocal', { rel, local: mine });
  const label = source === 'utc' ? 'UTC' : zone.offset === null ? 'UTC' : t('zone.computer');
  return mine !== null && mine !== src ? t('next.atBoth', { rel, at: src, zone: label, local: mine }) : t('next.at', { rel, at: src, zone: label });
}

export function nextText(t: T, r: SchedRow, now: number, zone: Zone): string {
  const n: Next = r.next;
  if ('at' in n) return runLine(t, n.at, now, zone, r.sched.zone);
  if (r.state && n.k === r.state.k) return loopText(t, r);
  return (NEXT_KEYS as readonly string[]).includes(n.k) ? t(`next.${n.k}` as 'next.paused') : t('next.unknown');
}

/** The short next-run line for table cells: relative time, then the clock. */
export function nextShort(t: T, r: SchedRow, now: number, zone: Zone): { rel: string; clock: string | null } | null {
  if (!('at' in r.next)) return null;
  const src = clock(r.next.at, r.sched.zone === 'utc' ? 'utc' : zone.offset ?? 'utc', LOCALE, Math.abs(r.next.at - now) >= 20 * 3600000);
  void t;
  return { rel: formatRelative(r.next.at, now), clock: src };
}

export function loopText(t: T, r: SchedRow): string {
  const s = r.state;
  if (!s) return '';
  if (s.k === 'ended') return t('loop.ended', { count: s.n ?? 0 });
  if (s.k === 'stopped' && s.why) return t(`loop.stopped.${s.why}` as 'loop.stopped.met');
  return t(`loop.${s.k}` as 'loop.paused');
}

const LAST_KNOWN = [
  'worked', 'failed', 'running', 'lost', 'no_reports', 'results_down', 'needs_cron', 'chat', 'timeout', 'skipped', 'load_error', 'incompatible', 'problem',
  'started', 'not_started', 'ended_at', 'not_yet', 'none_since', 'unknown',
] as const;

/** `when` writes a last result's time ("Today 05:18"): the two results that are a time ("Last started …", "Last run
 *  ended …") name it, never an unfilled placeholder. With no time known they say what they can without one. */
export function lastText(t: T, l: Last, when: (at: number) => string): string {
  if (l.k === 'started') return l.at != null ? t('last.started', { at: when(l.at) }) : t('last.unknown');
  if (l.k === 'ended_at') return l.at != null ? t('last.ended_at', { at: when(l.at) }) : t('last.ended');
  if (l.k === 'failed' && l.n != null) return t('last.failedN', { n: l.n });
  if (l.k === 'running' && l.n && l.n > 1) return t('last.runningN', { n: l.n });
  if (l.k === 'skipped' && l.why) return t(`last.skipped.${l.why}` as 'last.skipped.off');
  return (LAST_KNOWN as readonly string[]).includes(l.k) ? t(`last.${l.k}` as 'last.worked') : t('last.unknown');
}

export function lastTone(l: Last): Tone {
  switch (l.k) {
    case 'worked': case 'chat': return 'ok';
    case 'failed': case 'lost': case 'timeout': case 'load_error': case 'problem': return 'danger';
    case 'running': return 'info';
    case 'skipped': case 'incompatible': case 'results_down': case 'needs_cron': return 'warn';
    default: return 'neutral';
  }
}

export function kindText(t: T, r: SchedRow): string {
  return t(`kind.${r.src}` as 'kind.cron');
}

const SRC_NAME = { cron: 'src.cron', exec: 'src.exec', curl: 'src.curl', loop: 'src.loop' } as const;

/** Why a source was not read completely, in one sentence. null when it was, and for a stopped program (Curl, the
 *  system scheduler) with no schedule of it known: a stopped program can't be listed, so its line would
 *  blame it on a computer that may have none. A source whose schedules may still run unseen keeps its line (C9). */
export function sourceNote(t: T, key: SourceKey, s: { state: SourceState; complete: boolean; count: number }): string | null {
  if (s.complete) return null;
  if (s.state === 'stopped' && s.count === 0) return null;
  const what = t(SRC_NAME[key]);
  switch (s.state) {
    case 'private': return t('n.private', { what });
    case 'old': return key === 'cron' ? t('n.cronOld') : key === 'exec' ? t('n.exec.old') : t('n.daemonOld', { what });
    case 'off': return key === 'exec' ? t('n.exec.off') : t('n.curlOff');
    case 'stopped': return key === 'cron' ? t('line.cron_stopped') : key === 'curl' ? t('line.curl_stopped') : t('n.agentStopped');
    case 'signed_out': return t('n.agentSignedOut');
    case 'down': case 'failed':
      return key === 'cron' ? t('line.cron_down') : key === 'exec' ? t('n.exec.failed') : key === 'curl' ? t('n.curlFailed') : t('n.loopFailed');
    case 'ok': return t('n.partial', { what });
    default: return t('n.notChecked', { what });
  }
}

/** The last result in a table cell: the short word, never a sentence. The inspector has the full text. */
export function lastShort(t: T, l: Last, when: (at: number) => string): string {
  switch (l.k) {
    case 'chat': return t('last.chatShort');
    case 'no_reports': return t('last.noReportsShort');
    case 'failed': return t('last.failedShort');
    case 'skipped': return t('last.skippedShort');
    case 'none_since': case 'not_yet': case 'not_started': return t('last.noRunShort');
    default: return lastText(t, l, when);
  }
}

/** One line for a next run: "in 4 min · 05:18", with "· your 04:18" only when the two clocks differ. */
export function runLine(t: T, when: number, now: number, zone: Zone, source: 'system' | 'utc' = 'system'): string {
  const rel = formatRelative(when, now);
  const far = Math.abs(when - now) >= 20 * 3600000;
  const at = clock(when, source === 'utc' ? 'utc' : zone.offset ?? zone.mine, LOCALE, far) ?? '';
  const local = clock(when, zone.mine, LOCALE, far);
  return local !== null && local !== at && source !== 'utc' ? t('next.rowMine', { rel, at, local }) : t('next.row', { rel, at });
}

/** "Today 06:14", "Yesterday 06:14", "Oct 21 06:14" on the computer's clock. */
export function whenText(t: T, at: number, now: number, zone: Zone): string {
  const z = zone.offset ?? zone.mine;
  const time = clock(at, z, LOCALE, false) ?? '';
  const day = (ms: number) => Math.floor((ms + (typeof z === 'number' ? z * 1000 : 0)) / 86400000);
  const delta = day(now) - day(at);
  if (delta === 0) return t('hist.today', { at: time });
  if (delta === 1) return t('hist.yesterday', { at: time });
  const date = (clock(at, z, LOCALE, true) ?? '').replace(/[,\s]*\d{2}:\d{2}$/, '');
  return t('hist.on', { date, at: time });
}

/** "58 s", "1 min 12 s". */
export function tookText(t: T, ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? t('hist.tookS', { s }) : t('hist.tookMS', { m: Math.floor(s / 60), s: s % 60 });
}
