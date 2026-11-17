// AI usage lane rules: one rule for Billing's usage table and the Servers cards. Pure: no fetch, no translator. A sentence is a string key plus its values; each page
// that shows lanes carries the `aiu.*` keys below in its own strings.

export const LANES = ['chat', 'decisions', 'search', 'speech', 'transcription'] as const;
export type Lane = (typeof LANES)[number];

export interface LaneReading {
  lane: Lane;
  off: boolean;
  /** Percent used in steps of 10; null: no reading. */
  pct: number | null;
  resets: string | null;
}

/** One lane as GET /users/me/free-ai-usage answers it (untrusted: every field is checked). */
export interface UsageLaneWire {
  status?: string;
  percent_used?: number;
  resets_at?: string;
}

export type LaneKey = 'aiu.off' | 'aiu.unknown' | 'aiu.none' | 'aiu.full' | 'aiu.fullUntil' | 'aiu.used' | 'aiu.usedUntil';

/** A lane sentence as a key plus its values (Billing's Word shape). */
export interface LaneWord {
  k: LaneKey;
  v?: Readonly<Record<string, string | number>>;
}

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const word = (k: LaneKey, v?: Readonly<Record<string, string | number>>): LaneWord => (v ? { k, v } : { k });

/**
 * A server's lane readings, in LANES order. A lane the answer leaves out or does not read as ok/off is skipped (no
 * reading is never shown as 0); a percent outside 0-100 reads as unknown; percents are shown in steps of 10.
 */
export function readLanes(ln: Readonly<Record<string, UsageLaneWire | undefined>> | null | undefined): LaneReading[] {
  const lanes: LaneReading[] = [];
  if (!ln || typeof ln !== 'object') return lanes;
  for (const l of LANES) {
    const v = ln[l];
    if (!v || typeof v !== 'object') continue;
    if (v.status === 'off') {
      lanes.push({ lane: l, off: true, pct: null, resets: null });
      continue;
    }
    if (v.status !== 'ok') continue;
    const pct = isCount(v.percent_used) && v.percent_used <= 100 ? v.percent_used - (v.percent_used % 10) : null;
    const at = typeof v.resets_at === 'string' && !Number.isNaN(new Date(v.resets_at).getTime()) ? v.resets_at : null;
    lanes.push({ lane: l, off: false, pct, resets: pct ? at : null });
  }
  return lanes;
}

/** "Mon, 3:00 PM" for a moment a usage lane drops back. */
export function clock(iso: unknown): string | null {
  const d = typeof iso === 'string' ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

/** A lane's reading in words: off, unread, or "{pct}% used" with when it drops back. */
export function laneWords(l: LaneReading): LaneWord {
  if (l.off) return word('aiu.off');
  if (l.pct === null) return word('aiu.unknown');
  if (!l.pct) return word('aiu.none');
  const at = l.resets ? clock(l.resets) : null;
  if (l.pct >= 100) return at ? word('aiu.fullUntil', { time: at }) : word('aiu.full');
  return at ? word('aiu.usedUntil', { pct: l.pct, time: at }) : word('aiu.used', { pct: l.pct });
}

/** The AI usage read's refusals in words (the old route's 403 and 429; a fixture's bad_request stands for 429). */
export function usageRefusal(kind: string | undefined): 'aiu.noAccess' | 'aiu.throttle' | 'aiu.loadErr' {
  return kind === 'forbidden' ? 'aiu.noAccess' : kind === 'bad_request' ? 'aiu.throttle' : 'aiu.loadErr';
}

/** The bar's tone class: high from 80 %, full at 100 %. */
export function laneLevel(pct: number | null): 'low' | 'high' | 'full' {
  return pct !== null && pct >= 100 ? 'full' : pct !== null && pct >= 80 ? 'high' : 'low';
}
