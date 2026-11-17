// The AI page makes its Claude Code setup terminal in the app-launch band (ids up to 9999); follow-ups (wait,
// write, DELETE) also reach one an earlier Hub made in the old band (15001-19999), and terminal-0 for reads.
import { describe, expect, it } from 'vitest';
import { routes } from './routes';

const idx = (r: { index?: unknown }) => r.index as (n: number) => boolean;

describe('setup terminal numbers', () => {
  it('a create only in 8001-9999', () => {
    for (const n of [8001, 9999]) expect(idx(routes.termCreate)(n)).toBe(true);
    for (const n of [0, 8000, 10000, 15001, 19999]) expect(idx(routes.termCreate)(n)).toBe(false);
  });
  it('follow-ups in the band, the old band, or terminal-0', () => {
    for (const r of [routes.termWait, routes.termWrite, routes.termDelete]) {
      for (const n of [0, 8001, 9999, 15001, 19999]) expect(idx(r)(n)).toBe(true);
      for (const n of [1, 8000, 10000, 20000]) expect(idx(r)(n)).toBe(false);
    }
  });
});
