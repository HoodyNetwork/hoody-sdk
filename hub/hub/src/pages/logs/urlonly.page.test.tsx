// Vitest: the Logs view lives in the URL only. An older stored record may still hold a last view
// ({ last: { source: 'helper' } }); a bare /logs opens the default view anyway, the URL stays bare, and neither opening,
// changing the view nor leaving writes a last view back. The shared storage boundary (core's partitioned box for
// hub_logs_v1) is replaced with a seeded in-memory record, so the page's reads and the controller's writes both go
// through it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, waitFor } from '@app/testing';
import type * as CoreModule from '@core';
import strings from './strings.en.json';

const rec = vi.hoisted(() => ({ value: {} as Record<string, unknown>, writes: [] as Record<string, unknown>[] }));
vi.mock('@core', async (orig) => {
  const m = await orig<typeof CoreModule>();
  return {
    ...m,
    partitioned: ((name: string, opts: Parameters<typeof m.partitioned>[1]) =>
      name !== 'hub_logs_v1'
        ? m.partitioned(name, opts)
        : {
            ...m.partitioned(name, opts),
            get: () => rec.value,
            set: (p: Record<string, unknown>) => { rec.writes.push({ ...p }); rec.value = { ...p }; return true; },
          }) as typeof m.partitioned,
  };
});
const { default: page } = await import('./page');

afterEach(() => { rec.value = {}; rec.writes = []; });

describe('Logs: no view comes back from storage', () => {
  it('a bare /logs with a stored last view opens the default view, keeps the URL bare and writes no last view', async () => {
    rec.value = { last: { source: 'helper', severity: 'failed', window: '24h' }, strip: 'closed' };
    const { router, unmount } = await renderPage(page, { path: '/logs' });
    await screen.findByRole('radiogroup', { name: strings['f.source'] });
    expect(screen.getByRole('radio', { name: strings['src.everything'] })).toBeChecked();
    expect(screen.queryByRole('radio', { name: strings['src.helper'] })).toBeNull();
    expect(router.state.location.search).toEqual({});
    // A view chosen by link, then a bare return: still nothing written, nothing restored.
    act(() => { router.history.push('/logs?src=bots'); });
    await waitFor(() => expect(screen.getByRole('radio', { name: strings['src.bots'] })).toBeChecked());
    act(() => { router.history.push('/logs'); });
    await waitFor(() => expect(screen.getByRole('radio', { name: strings['src.everything'] })).toBeChecked());
    expect(rec.writes.filter((w) => 'last' in w)).toEqual([]);
    // Leaving writes nothing either.
    unmount();
    expect(rec.writes.filter((w) => 'last' in w)).toEqual([]);
  });
});
