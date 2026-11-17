// The alert engine while a passcode is set: one aggregate alert with a count, the
// fixed body, no notice title; the generic text also rides along for showAlert to use if a passcode appears by
// delivery.
import { describe, expect, it, vi } from 'vitest';
import type { NotificationRow as Notice, Seen } from '@core/shell';
import { boot, UID } from '@core/test/env';
import { createAlertEngine, type EngineDeps, type Summary, type UnreadRead } from './engine';

const n = (id: string, at: string, read = false): Notice => ({ id, title: `T ${id}`, message: 'secret body 10.0.0.1', severity: 'INFO', at, read });

function setup(over: Partial<EngineDeps> = {}) {
  const st = {
    uid: 'u1' as string | null,
    summary: null as Summary | null,
    on: true,
    seen: new Map<string, Seen>(),
    shown: new Map<string, readonly string[]>(),
    hidden: false,
    away: true,
    rows: [] as Notice[],
    reads: 0,
    pending: null as null | ((r: UnreadRead) => void),
    manual: false,
  };
  const show = vi.fn();
  const refresh = vi.fn();
  const openInbox = vi.fn();
  const deps: EngineDeps = {
    shownUid: () => st.uid,
    summary: () => st.summary,
    refresh,
    readSince: () => {
      st.reads += 1;
      if (st.manual) return new Promise((res) => (st.pending = res));
      return Promise.resolve({ state: 'ok', rows: st.rows, capped: false });
    },
    alertsOn: () => st.on,
    seen: (u) => st.seen.get(u) ?? null,
    setSeen: (u, s) => st.seen.set(u, s),
    shown: (u) => st.shown.get(u) ?? [],
    setShown: (u, ids) => st.shown.set(u, ids),
    hidden: () => st.hidden,
    away: () => st.away,
    show,
    openInbox,
    text: { untitled: 'New notice', body: 'Open the Hub to read it.', many: (k) => `${k} new notices`, manyMore: (k) => `${k}+ new notices` },
    ...over,
  };
  return { st, show, refresh, openInbox, engine: createAlertEngine(deps) };
}
const sum = (latest: string | null, at: string | null): Summary => ({ uid: 'u1', unread_count: 1, latest_id: latest, latest_created_at: at });
const flush = () => new Promise((r) => setTimeout(r, 0));

const lockOn = { passcodeSet: () => true };

describe('alert engine, passcode set', () => {
  it('one new notice: "New notice", the fixed body, no notice title; tagged by its id', async () => {
    const t = setup(lockOn);
    t.st.seen.set('u1', { id: 'a', at: '2026-10-23T08:00:00Z' });
    t.st.rows = [n('b', '2026-10-23T08:05:00Z'), n('a', '2026-10-23T08:00:00Z')];
    t.st.summary = sum('b', '2026-10-23T08:05:00Z');
    t.engine.start('u1');
    await flush();
    expect(t.show).toHaveBeenCalledTimes(1);
    expect(t.show.mock.calls[0]?.[0]).toMatchObject({ title: 'New notice', body: 'Open the Hub to read it.', tag: 'hub-n:b', generic: { title: 'New notice', body: 'Open the Hub to read it.' } });
    expect(JSON.stringify(t.show.mock.calls)).not.toContain('T b');
  });

  it('two or three new notices: ONE aggregate alert with the count, never one per notice', async () => {
    const t = setup(lockOn);
    t.st.seen.set('u1', { id: '', at: '' });
    t.st.rows = ['d', 'c', 'b'].map((id, i) => n(id, `2026-10-23T08:0${5 - i}:00Z`));
    t.st.summary = sum('d', '2026-10-23T08:05:00Z');
    t.engine.start('u1');
    await flush();
    expect(t.show).toHaveBeenCalledTimes(1);
    expect(t.show.mock.calls[0]?.[0]).toMatchObject({ title: '3 new notices', tag: 'hub-n:d', generic: { title: '3 new notices' } });
    expect(JSON.stringify(t.show.mock.calls)).not.toMatch(/T [bcd]/);
  });

  it('a capped read: "N+ new notices"', async () => {
    const t = setup({ ...lockOn, readSince: () => Promise.resolve({ state: 'ok', rows: [n('c', '2026-10-23T08:05:00Z'), n('b', '2026-10-23T08:04:00Z')], capped: true }) });
    t.st.seen.set('u1', { id: '', at: '' });
    t.st.summary = sum('c', '2026-10-23T08:05:00Z');
    t.engine.start('u1');
    await flush();
    expect(t.show.mock.calls.map((c) => c[0].title)).toEqual(['2+ new notices']);
  });

  it('the passcode is read at delivery: set after the run started, the next delivery is generic', async () => {
    let set = false;
    const t = setup({ passcodeSet: () => set });
    t.st.seen.set('u1', { id: 'a', at: '2026-10-23T08:00:00Z' });
    t.st.rows = [n('b', '2026-10-23T08:05:00Z'), n('a', '2026-10-23T08:00:00Z')];
    t.st.summary = sum('b', '2026-10-23T08:05:00Z');
    t.engine.start('u1');
    await flush();
    expect(t.show.mock.calls[0]?.[0]).toMatchObject({ title: 'T b' });
    set = true;
    t.st.rows = [n('c', '2026-10-23T08:06:00Z'), n('b', '2026-10-23T08:05:00Z')];
    t.st.summary = sum('c', '2026-10-23T08:06:00Z');
    t.engine.handle();
    await flush();
    expect(t.show.mock.calls[1]?.[0]).toMatchObject({ title: 'New notice' });
  });

  it('no passcode: each alert still carries the generic text for showAlert (a passcode set by delivery)', async () => {
    const t = setup({ passcodeSet: () => false });
    t.st.seen.set('u1', { id: '', at: '' });
    t.st.rows = ['c', 'b'].map((id, i) => n(id, `2026-10-23T08:0${5 - i}:00Z`));
    t.st.summary = sum('c', '2026-10-23T08:05:00Z');
    t.engine.start('u1');
    await flush();
    expect(t.show.mock.calls.map((c) => [c[0].title, c[0].generic?.title])).toEqual([['T b', '2 new notices'], ['T c', '2 new notices']]);
  });

  it('by default the engine reads core\'s stored record for the shown account at delivery', async () => {
    boot();
    localStorage.setItem('hub_lock:' + UID, '{"v":1}');
    const t = setup();
    t.st.seen.set('u1', { id: 'a', at: '2026-10-23T08:00:00Z' });
    t.st.rows = [n('b', '2026-10-23T08:05:00Z'), n('a', '2026-10-23T08:00:00Z')];
    t.st.summary = sum('b', '2026-10-23T08:05:00Z');
    t.engine.start('u1');
    await flush();
    expect(t.show.mock.calls.map((c) => c[0].title)).toEqual(['New notice']);
    localStorage.removeItem('hub_lock:' + UID);
  });
});
