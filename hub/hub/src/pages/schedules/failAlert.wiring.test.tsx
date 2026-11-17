// Vitest: the Schedules page hands its list rows to the failure alert: useScheduleFailAlert gets the rows the page
// shows, scoped by the computer they were read from (RawSchedules.computer), never the computer selected now, which may
// already be another while the rows read from the last one still show. Its rules are failAlert.test.tsx's; here only the wiring.
import { useMemo } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen } from '@app/testing';
import type * as Data from './data';
import type { SchedRow } from './logic';
import page from './page';

const world = vi.hoisted(() => ({ calls: [] as [readonly SchedRow[] | undefined, string][] }));
vi.mock('./failAlert', () => ({ useScheduleFailAlert: (rows: readonly SchedRow[] | undefined, scope: string) => { world.calls.push([rows, scope]); } }));
// The rows were read from computer A; computer B is the one selected now.
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  return {
    ...real,
    useComputerKey: () => 'comp-B',
    useSchedules: () => {
      const r = real.useSchedules();
      const data = useMemo(() => (r.data ? { ...r.data, computer: 'comp-A' } : undefined), [r.data]);
      return { ...r, data };
    },
  };
});

describe('Schedules failure alert wiring', () => {
  it('the page passes its list rows, scoped by the computer they were read from', async () => {
    await renderPage(page);
    expect(await screen.findAllByRole('table')).not.toHaveLength(0);
    const read = world.calls.filter(([rows]) => rows !== undefined);
    expect(read.length).toBeGreaterThan(0);
    for (const [rows, scope] of read) {
      expect(rows!.length).toBeGreaterThan(0);
      expect(scope).toBe('comp-A');
    }
  });
});
