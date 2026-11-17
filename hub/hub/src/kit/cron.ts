// Pure cron presets and the preview of an expression's next runs (one model for the
// Schedules editor and a script's schedule). pages/schedules/logic.ts re-exports them unchanged. No DOM,
// no React, no network.

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const inRange = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi;
const intIn = (s: string | undefined, lo: number, hi: number): number | null => (s !== undefined && /^\d{1,2}$/.test(s) && +s >= lo && +s <= hi ? +s : null);

// ── Presets ─────────────────────────────────────────────────────────────────────────────

export type Kit = 'cron' | 'exec' | 'curl';
export const EVERY = [5, 10, 15, 30] as const;
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export type Preset =
  | { k: 'every'; n: number }
  | { k: 'hourly'; m: number }
  | { k: 'daily'; h: number; m: number }
  | { k: 'weekdays'; h: number; m: number }
  | { k: 'weekly'; h: number; m: number; days: number[] }
  | { k: 'monthly'; d: number; h: number; m: number }
  | { k: 'reboot' }
  | { k: 'custom'; expr: string };

/** A preset's expression for a kit, or null when a field is out of range. Curl takes six fields with seconds. */
export function toExpr(kit: Kit, p: Exclude<Preset, { k: 'custom' }>): string | null {
  const curl = kit === 'curl';
  if (p.k === 'reboot') return kit === 'cron' ? '@reboot' : null;
  if (p.k === 'every' ? !(EVERY as readonly number[]).includes(p.n) : !inRange(p.m, 0, 59)) return null;
  if (p.k !== 'every' && p.k !== 'hourly' && !inRange(p.h, 0, 23)) return null;
  let dow = '*';
  let dom = '*';
  if (p.k === 'weekdays') dow = curl ? 'MON-FRI' : '1-5';
  else if (p.k === 'weekly') {
    const d = [...p.days].sort();
    if (!d.length) return null;
    for (let i = 0; i < d.length; i++) if (!inRange(d[i], 0, 6) || d[i] === d[i - 1]) return null;
    dow = d.map((x) => (curl ? DAYS[x] : String(x))).join(',');
  } else if (p.k === 'monthly') {
    if (!inRange(p.d, 1, 31)) return null;
    dom = String(p.d);
  }
  const f = p.k === 'every' ? [`*/${p.n}`, '*', '*', '*', '*'] : [String(p.m), p.k === 'hourly' ? '*' : String((p as { h: number }).h), dom, '*', dow];
  return (curl ? '0 ' : '') + f.join(' ');
}

/** The preset whose expression is exactly `expr`, else {k:'custom', expr}: a saved string is never rewritten. */
export function recognise(kit: Kit, expr: unknown): Preset {
  const e = str(expr);
  const custom: Preset = { k: 'custom', expr: e };
  let f = e.split(' ');
  let p: Exclude<Preset, { k: 'custom' }> | null = null;
  if (e === '@reboot') p = { k: 'reboot' };
  else {
    if (kit === 'curl') {
      if (f.length !== 6 || f[0] !== '0') return custom;
      f = f.slice(1);
    }
    if (f.length !== 5 || f[3] !== '*') return custom;
    const n = /^\*\/(\d+)$/.exec(f[0] ?? '');
    const m = intIn(f[0], 0, 59);
    const h = intIn(f[1], 0, 23);
    const dow = f[4] ?? '';
    if (n) p = { k: 'every', n: +(n[1] ?? 0) };
    else if (m === null) return custom;
    else if (f[1] === '*') p = { k: 'hourly', m };
    else if (h === null) return custom;
    else if (f[2] !== '*') {
      const d = intIn(f[2], 1, 31);
      if (d === null) return custom;
      p = { k: 'monthly', d, h, m };
    } else if (dow === '*') p = { k: 'daily', h, m };
    else if (dow === '1-5' || dow === 'MON-FRI') p = { k: 'weekdays', h, m };
    else {
      const days = dow.split(',').map((x) => (kit === 'curl' ? DAYS.indexOf(x) : (intIn(x, 0, 6) ?? -1)));
      p = { k: 'weekly', h, m, days };
    }
  }
  return toExpr(kit, p) === e ? p : custom;
}

// ── Preview: the next runs of an expression, computed from the fields themselves ─────────

export type CronField = 'minute' | 'hour' | 'day' | 'month' | 'weekday';
const FIELDS: readonly { f: CronField; min: number; max: number }[] = [
  { f: 'minute', min: 0, max: 59 },
  { f: 'hour', min: 0, max: 23 },
  { f: 'day', min: 1, max: 31 },
  { f: 'month', min: 1, max: 12 },
  { f: 'weekday', min: 0, max: 7 },
];

export type Preview = { ok: true; runs: number[]; never: boolean } | { ok: false; field: CronField; min: number; max: number } | { ok: false; field: null };

function fieldSet(text: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of text.split(',')) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) return null;
    const step = m[2] === undefined ? 1 : Number(m[2]);
    if (step < 1) return null;
    let lo = min;
    let hi = max;
    if (m[1] !== '*') {
      const [a, b] = (m[1] as string).split('-');
      lo = Number(a);
      hi = b === undefined ? (m[2] === undefined ? lo : max) : Number(b);
    }
    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/**
 * The next `count` runs of a five-field expression after `now`, on the computer's clock (`offset` is
 * its distance from UTC in seconds). A field out of range names itself. Day and weekday combine the
 * way cron does: when both are restricted, either matches. Names and macros are not read here
 * (field: null); the caller asks the kit instead.
 */
export function nextRuns(expr: string, now: number, offset: number, count = 5): Preview {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return { ok: false, field: null };
  const sets: Set<number>[] = [];
  for (let i = 0; i < 5; i++) {
    const spec = FIELDS[i] as (typeof FIELDS)[number];
    const text = parts[i] as string;
    if (!/^[\d*,/-]+$/.test(text)) return { ok: false, field: null };
    const s = fieldSet(text, spec.min, spec.max);
    if (!s) return { ok: false, field: spec.f, min: spec.min, max: spec.max };
    sets.push(s);
  }
  const [mins, hours, doms, months, dows0] = sets as [Set<number>, Set<number>, Set<number>, Set<number>, Set<number>];
  const dows = new Set([...dows0].map((d) => d % 7));
  const domAny = (parts[2] as string).startsWith('*');
  const dowAny = (parts[4] as string).startsWith('*');
  const runs: number[] = [];
  const clockNow = now + offset * 1000;
  const startDay = Math.floor(clockNow / 86400000);
  const hs = [...hours].sort((a, b) => a - b);
  const ms = [...mins].sort((a, b) => a - b);
  for (let day = 0; day < 1500 && runs.length < count; day++) {
    const d = new Date((startDay + day) * 86400000);
    if (!months.has(d.getUTCMonth() + 1)) continue;
    const domOk = doms.has(d.getUTCDate());
    const dowOk = dows.has(d.getUTCDay());
    if (!(domAny && dowAny ? true : domAny ? dowOk : dowAny ? domOk : domOk || dowOk)) continue;
    for (const h of hs) {
      for (const m of ms) {
        const at = (startDay + day) * 86400000 + (h * 60 + m) * 60000 - offset * 1000;
        if (at > now) runs.push(at);
        if (runs.length >= count) return { ok: true, runs, never: false };
      }
    }
  }
  return { ok: true, runs, never: runs.length === 0 };
}
