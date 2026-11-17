// Vitest: the controller over the fixture world: reads, errors, paging and the view switch.
import { describe, expect, it } from 'vitest';
import { createLogs, type Computer, type Logs, type Snapshot } from './controller';
import fixtures from './fixtures';
import { DEFAULT_VIEW, type Tx } from './logic';
import { fixtureApi, type World } from './world';

const computer: Computer = { id: 'c0a7150000000000000000a1', projectId: '6a0000000000000000000001', name: 'atlas', running: true };
const t: Tx = (key) => key;
const worldOf = (state: keyof typeof fixtures.states): World => (fixtures.states[state] as { world: { data: World } }).world.data;
const store = () => { let p = {}; return { read: () => p, write: (n: object) => { p = n; return true; } }; };

function open(state: keyof typeof fixtures.states, initial = DEFAULT_VIEW): Logs {
  const l = createLogs({ api: fixtureApi({ ...worldOf(state), delayMs: 0 }), computer, initial, prefs: store(), t, visible: () => true, online: () => true });
  l.setView(initial); // the page does the same once the URL is read
  return l;
}
async function until(l: Logs, ok: (s: Snapshot) => boolean): Promise<Snapshot> {
  for (let i = 0; i < 400; i++) {
    const s = l.get();
    if (ok(s)) return s;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timed out waiting for the snapshot');
}

describe('logs controller', () => {
  it('reads the newest rows first with their counts', async () => {
    const l = open('quiet');
    const s = await until(l, (x) => !x.loading && x.items.length > 0);
    const data = s.items.filter((i) => i.kind !== 'div');
    expect(data.length).toBeGreaterThan(10);
    expect(data[0]!.t).toBeGreaterThanOrEqual(data[data.length - 1]!.t);
    l.dispose();
  });

  it('shows problem groups for a burst of failures', async () => {
    const l = open('many');
    const s = await until(l, (x) => !!x.groups && x.groups.groups.length > 0);
    expect(s.groups!.groups[0]!.count).toBeGreaterThanOrEqual(40);
    l.dispose();
  });

  it('answers a private computer with the private state, not an empty list', async () => {
    const l = open('private');
    const s = await until(l, (x) => !!x.err);
    expect(s.err!.code).toBe('private');
    l.dispose();
  });

  it('answers an unreachable computer as blocked, with no rows', async () => {
    const l = open('blocked');
    const s = await until(l, (x) => !!x.err);
    expect(['blocked', 'unreachable']).toContain(s.err!.code);
    expect(s.items.filter((i) => i.kind !== 'div' && i.kind !== 'changes')).toHaveLength(0);
    l.dispose();
  });

  it('a rate limit that stays is shown after the one retry', async () => {
    const l = open('rate');
    const s = await until(l, (x) => !!x.err);
    expect(s.err!.code).toBe('rate_limited');
    expect(s.err!.retryAfterMs).toBeGreaterThanOrEqual(0);
    l.dispose();
  });

  it('Try again after a quota stop sends a new read', async () => {
    const base = fixtureApi({ ...worldOf('quota'), delayMs: 0 });
    let sent = 0;
    const api = { ...base, kit: (...a: Parameters<typeof base.kit>) => { sent++; return base.kit(...a); } };
    const l = createLogs({ api, computer, initial: DEFAULT_VIEW, prefs: store(), t, visible: () => true, online: () => true });
    l.setView(DEFAULT_VIEW);
    await until(l, (x) => x.err?.code === 'quota');
    const first = sent;
    l.refresh();
    await until(l, (x) => x.err?.code === 'quota' && sent > first);
    expect(sent).toBeGreaterThan(first);
    l.dispose();
  });

  it('a quota stop carries how long to wait', async () => {
    const l = open('quota');
    const s = await until(l, (x) => !!x.err);
    expect(s.err!.code).toBe('quota');
    expect(s.err!.retryAfterMs).toBe(600_000);
    l.dispose();
  });

  it('switching to Changes reads the changes list', async () => {
    const l = open('many');
    await until(l, (x) => !x.loading && x.items.length > 0);
    l.setView({ ...DEFAULT_VIEW, source: 'changes' });
    const s = await until(l, (x) => x.v.source === 'changes' && !x.loading && x.items.some((i) => i.kind === 'changes'));
    expect(s.items.some((i) => i.kind === 'changes')).toBe(true);
    l.dispose();
  });

  it('saves a view by name and refuses an empty name', async () => {
    const l = open('quiet');
    await until(l, (x) => !x.loading);
    expect(l.saveView('  ')).toBe('name');
    expect(l.saveView('Failures')).toBe(true);
    expect(l.get().saved.map((x) => x.name)).toContain('Failures');
    l.dispose();
  });

  it('keeps no last view: a record from before URL-only views loses it on the next write', async () => {
    let rec: Record<string, unknown> = { last: { source: 'bots' }, strip: 'closed' };
    const prefs = { read: () => rec, write: (n: object) => { rec = n as Record<string, unknown>; return true; } };
    const l = createLogs({ api: fixtureApi({ ...worldOf('quiet'), delayMs: 0 }), computer, initial: DEFAULT_VIEW, prefs, t, visible: () => true, online: () => true });
    await until(l, (x) => !x.loading);
    expect(l.saveView('Failures')).toBe(true);
    expect(rec).not.toHaveProperty('last');
    expect(rec.strip).toBe('closed');
    expect('remember' in l).toBe(false);
    l.dispose();
  });

  it('says nothing was saved when the browser refuses the write, and keeps what was there', async () => {
    const refusing = { read: () => ({}), write: () => false };
    const l = createLogs({ api: fixtureApi({ ...worldOf('quiet'), delayMs: 0 }), computer, initial: DEFAULT_VIEW, prefs: refusing, t, visible: () => true, online: () => true });
    await until(l, (x) => !x.loading);
    expect(l.saveView('Failures')).toBe('kept');
    expect(l.get().saved).toEqual([]);
    expect(l.clearViews()).toBe(false);
    l.dispose();
  });

  it('Live adds rows at the top, or behind the pill while a row is open', async () => {
    const l = createLogs({ api: fixtureApi({ ...worldOf('live'), delayMs: 0, liveEveryMs: 30, liveMax: 2 }), computer, initial: DEFAULT_VIEW, prefs: store(), t, visible: () => true, online: () => true });
    l.setView(DEFAULT_VIEW);
    await until(l, (x) => !x.loading && x.items.length > 0);
    l.setReading(true);
    l.toggleLive();
    const s = await until(l, (x) => x.newCount > 0);
    expect(s.liveOn).toBe(true);
    l.dispose();
  });
});
