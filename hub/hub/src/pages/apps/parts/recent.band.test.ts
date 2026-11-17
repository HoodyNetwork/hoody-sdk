// The recent list keeps launches in the app-launch band (8001-9999) and launches made before in the old band
// (15001-19999), so an earlier app can still be watched and closed; any other terminal number is dropped.
import { describe, expect, it } from 'vitest';
import { readRecent } from './recent';

const row = (n: number, cmd: number) => ({
  computer: { project: 'a'.repeat(24), computer_id: 'b'.repeat(24) },
  terminal_id: n, incarnation: 'c'.repeat(32), command_id: cmd, launch_tag: 'd'.repeat(16), display: n,
  name: 'htop', opens_in: 'terminal', started_at: 1,
});

describe('recent launches by terminal number', () => {
  it('keeps the band and the old band, drops every other number', () => {
    const doc = readRecent({ v: 2, rows: [row(8001, 1), row(9999, 2), row(15001, 3), row(19999, 4), row(8000, 5), row(10000, 6), row(20000, 7), row(1, 8)], ack: [] });
    expect(doc.rows.map((r) => r.terminal_id)).toEqual([8001, 9999, 15001, 19999]);
  });
});
