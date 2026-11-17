// The chat list's day group and the row's time words come from ONE day count: a chat 26 h old at 01:35 labelled
// "yesterday" must sit under "Yesterday", not "Last 7 days", whatever the hour. The
// group and the label (kit formatRelative) both count calendar days.
import { describe, expect, it } from 'vitest';
import { chatRows, sessionOf, whenLabel, type ChatRow, type Session } from './chats.logic';

const HOUR = 3_600_000;
const iso = (t: number) => new Date(t).toISOString();
const sess = (id: string, at: number) => sessionOf({ id, realm: 'global', cwd: '/home/ada', first_message: `do ${id}`, started_at: iso(at), last_request_at: iso(at) }) as Session;
const rowsAt = (now: number, ats: number[]): ChatRow[] =>
  chatRows({ sessions: ats.map((at, i) => sess(`s${i}`, at)), gates: [], bots: [], delegates: new Map(), states: new Map(), now });

describe('the row time and its day group agree', () => {
  it('26 h before 01:35 is two calendar days back: Last 7 days and "2 days ago", never "yesterday"', () => {
    const now = new Date(2026, 10, 12, 1, 35).getTime();
    const [r] = rowsAt(now, [now - 26 * HOUR]);
    expect(r!.group).toBe('week');
    expect(r!.when).toBe('2 days ago');
  });

  it('26 h before 02:05 is yesterday: Yesterday and "yesterday"', () => {
    const now = new Date(2026, 10, 12, 2, 5).getTime();
    const [r] = rowsAt(now, [now - 26 * HOUR]);
    expect(r!.group).toBe('yesterday');
    expect(r!.when).toBe('yesterday');
  });

  it('for every hour of the day and every age up to 8 days, the words name the group\'s day', () => {
    for (let h = 0; h < 24; h++) {
      const now = new Date(2026, 10, 12, h, 17).getTime();
      const ats = Array.from({ length: 8 * 24 }, (_, k) => now - k * HOUR - 7 * 60_000);
      for (const r of rowsAt(now, ats)) {
        const label = { at: r.at, h, group: r.group, when: r.when };
        if (r.group === 'today') expect(label.when, JSON.stringify(label)).toMatch(/now|seconds?|minutes?|hours? ago/);
        if (r.group === 'yesterday') expect(label.when, JSON.stringify(label)).toBe('yesterday');
        if (r.group === 'week') expect(label.when, JSON.stringify(label)).toMatch(/^[2-6] days ago$/);
      }
    }
  });

  it('no time: no words', () => {
    expect(whenLabel(null, Date.UTC(2026, 10, 12))).toBe('');
  });
});
