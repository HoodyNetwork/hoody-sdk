// The alert engine against fake deps: baseline, fresh notices, hidden tabs, one read at a time,
// switched-off alerts, a looking person, bursts and stopped runs.
import { describe, expect, it, vi } from 'vitest';
import type { NotificationRow as Notice, Seen } from '@core/shell';
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

describe('alert engine', () => {
  it('first sight asks for a fresh summary, then takes the baseline from it and alerts nothing', async () => {
    const t = setup();
    t.st.summary = sum('a', '2026-10-23T08:00:00Z');
    t.engine.start('u1');
    expect(t.refresh).toHaveBeenCalledTimes(1);
    expect(t.st.seen.get('u1')).toBeUndefined();
    t.engine.handle();
    expect(t.st.seen.get('u1')).toEqual({ id: 'a', at: '2026-10-23T08:00:00Z' });
    await flush();
    expect(t.show).not.toHaveBeenCalled();
    expect(t.st.reads).toBe(0);
  });

  it('a newer notice alerts with its title and the fixed body, tagged by id; the baseline moves', async () => {
    const t = setup();
    t.st.seen.set('u1', { id: 'a', at: '2026-10-23T08:00:00Z' });
    t.st.rows = [n('b', '2026-10-23T08:05:00Z'), n('a', '2026-10-23T08:00:00Z')];
    t.st.summary = sum('b', '2026-10-23T08:05:00Z');
    t.engine.start('u1');
    await flush();
    expect(t.show).toHaveBeenCalledTimes(1);
    const a = t.show.mock.calls[0]?.[0];
    expect(a).toMatchObject({ title: 'T b', body: 'Open the Hub to read it.', tag: 'hub-n:b' });
    expect(JSON.stringify(t.show.mock.calls)).not.toContain('10.0.0.1');
    expect(t.st.seen.get('u1')).toEqual({ id: 'b', at: '2026-10-23T08:05:00Z' });
    expect(t.st.shown.get('u1')).toEqual(['b']);
    a.onClick();
    expect(t.openInbox).toHaveBeenCalledWith('u1');
  });

  it('never alerts the same notice twice (shown ring from any tab)', async () => {
    const t = setup();
    t.st.seen.set('u1', { id: 'a', at: '2026-10-23T08:00:00Z' });
    t.st.shown.set('u1', ['b']);
    t.st.rows = [n('b', '2026-10-23T08:05:00Z')];
    t.st.summary = sum('b', '2026-10-23T08:05:00Z');
    t.engine.start('u1');
    await flush();
    expect(t.show).not.toHaveBeenCalled();
  });

  it('more than three new notices become one "N new notices" alert; a capped read says N+', async () => {
    const t = setup();
    t.st.seen.set('u1', { id: '', at: '' });
    t.st.rows = ['e', 'd', 'c', 'b'].map((id, i) => n(id, `2026-10-23T08:0${5 - i}:00Z`));
    t.st.summary = sum('e', '2026-10-23T08:05:00Z');
    t.engine.start('u1');
    await flush();
    expect(t.show).toHaveBeenCalledTimes(1);
    expect(t.show.mock.calls[0]?.[0]).toMatchObject({ title: '4 new notices', tag: 'hub-n:e' });
  });

  it('a person who is looking gets no alert, but the notices count as handled', async () => {
    const t = setup();
    t.st.away = false;
    t.st.seen.set('u1', { id: 'a', at: '2026-10-23T08:00:00Z' });
    t.st.rows = [n('b', '2026-10-23T08:05:00Z')];
    t.st.summary = sum('b', '2026-10-23T08:05:00Z');
    t.engine.start('u1');
    await flush();
    expect(t.show).not.toHaveBeenCalled();
    expect(t.st.shown.get('u1')).toEqual(['b']);
  });

  it('a hidden tab reads nothing and handles the change when it comes to the front', async () => {
    const t = setup();
    t.st.hidden = true;
    t.st.seen.set('u1', { id: 'a', at: '2026-10-23T08:00:00Z' });
    t.st.rows = [n('b', '2026-10-23T08:05:00Z')];
    t.st.summary = sum('b', '2026-10-23T08:05:00Z');
    t.engine.start('u1');
    await flush();
    expect(t.st.reads).toBe(0);
    t.st.hidden = false;
    t.engine.visibility();
    await flush();
    expect(t.st.reads).toBe(1);
    expect(t.show).toHaveBeenCalledTimes(1);
  });

  it('alerts switched off while the read was out send nothing and move nothing', async () => {
    const t = setup();
    t.st.manual = true;
    t.st.seen.set('u1', { id: 'a', at: '2026-10-23T08:00:00Z' });
    t.st.summary = sum('b', '2026-10-23T08:05:00Z');
    t.engine.start('u1');
    t.st.on = false;
    t.st.pending?.({ state: 'ok', rows: [n('b', '2026-10-23T08:05:00Z')], capped: false });
    await flush();
    expect(t.show).not.toHaveBeenCalled();
    expect(t.st.seen.get('u1')).toEqual({ id: 'a', at: '2026-10-23T08:00:00Z' });
  });

  it('a failed read advances nothing; the next summary retries', async () => {
    const t = setup();
    t.st.manual = true;
    t.st.seen.set('u1', { id: 'a', at: '2026-10-23T08:00:00Z' });
    t.st.summary = sum('b', '2026-10-23T08:05:00Z');
    t.engine.start('u1');
    t.st.pending?.({ state: 'error', rows: [], capped: false });
    await flush();
    expect(t.st.seen.get('u1')?.id).toBe('a');
    t.engine.handle();
    expect(t.st.reads).toBe(2);
  });

  it('one read at a time: a change during a read is handled after it', async () => {
    const t = setup();
    t.st.manual = true;
    t.st.seen.set('u1', { id: 'a', at: '2026-10-23T08:00:00Z' });
    t.st.summary = sum('b', '2026-10-23T08:05:00Z');
    t.engine.start('u1');
    t.st.summary = sum('c', '2026-10-23T08:06:00Z');
    t.engine.handle();
    expect(t.st.reads).toBe(1);
    t.st.pending?.({ state: 'ok', rows: [n('b', '2026-10-23T08:05:00Z')], capped: false });
    await flush();
    expect(t.st.reads).toBe(2);
  });

  it('a stopped run, or an account no longer shown, alerts nothing from a read in flight', async () => {
    const t = setup();
    t.st.manual = true;
    t.st.seen.set('u1', { id: 'a', at: '2026-10-23T08:00:00Z' });
    t.st.summary = sum('b', '2026-10-23T08:05:00Z');
    t.engine.start('u1');
    t.engine.stop();
    t.st.pending?.({ state: 'ok', rows: [n('b', '2026-10-23T08:05:00Z')], capped: false });
    await flush();
    expect(t.show).not.toHaveBeenCalled();
    t.st.uid = 'u2';
    t.engine.start('u1');
    expect(t.st.reads).toBe(1);
  });

  it('ignores a summary of another account', async () => {
    const t = setup();
    t.st.seen.set('u1', { id: 'a', at: '' });
    t.st.summary = { ...sum('b', null), uid: 'u2' };
    t.engine.start('u1');
    await flush();
    expect(t.st.reads).toBe(0);
  });
});
