// hub_apps_recent_v2 rows name their computer as computer:{project, computer_id} (the SDK's handle spelling).
// Rows an older Hub wrote have computer:{project, computer} or computer:{project, container}. Read: computer_id,
// then computer, then container, the first one present deciding (an unusable one is dropped, never rescued by an older
// one). Write: computer_id only. A row of any spelling reopens the same app on the same computer.
import { describe, expect, it } from 'vitest';
import { FakeKits } from '@core/run-open/fakeKits';
import { createRunOpen } from '@core/run-open/index';
import { fromHandle, readRecent, recentKey, toHandle, type RecentDoc } from './recent';

const P = 'a'.repeat(24), C1 = 'b'.repeat(24), C2 = 'c'.repeat(24);
const row = (computer: unknown) => ({
  name: 'Editor', opens_in: 'terminal', computer, terminal_id: 15001, incarnation: 'a1'.repeat(16), command_id: 3, launch_tag: 'a1b2c3d4e5f60718', display: 15001, started_at: 1_700_000_000_000,
});
const doc = (...rows: unknown[]) => ({ v: 2, rows, ack: [] });
const one = (computer: unknown) => readRecent(doc(row(computer))).rows;

describe('recent rows: the stored computer spelling (computer_id over computer)', () => {
  it('reads a new row (computer.computer_id)', () => {
    expect(one({ project: P, computer_id: C1 })[0]!.computer).toEqual({ project: P, computer_id: C1 });
  });
  it('reads an older row (computer.computer) and the oldest (computer.container) as the same computer', () => {
    expect(one({ project: P, computer: C1 })[0]!.computer).toEqual({ project: P, computer_id: C1 });
    expect(one({ project: P, container: C1 })[0]!.computer).toEqual({ project: P, computer_id: C1 });
  });
  it('one document holding the same launch under all three spellings keeps one row', () => {
    const d = readRecent(doc(row({ project: P, container: C1 }), row({ project: P, computer: C1 }), row({ project: P, computer_id: C1 })));
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0]!.computer).toEqual({ project: P, computer_id: C1 });
  });
  it('the three spellings of one launch are one row: the same key and the same handle', () => {
    const [a, b, c] = [one({ project: P, computer_id: C1 })[0]!, one({ project: P, computer: C1 })[0]!, one({ project: P, container: C1 })[0]!];
    expect(new Set([recentKey(a), recentKey(b), recentKey(c)]).size).toBe(1);
    expect(toHandle(b)).toEqual(toHandle(a));
    expect(toHandle(c)).toEqual(toHandle(a));
    expect(toHandle(a).computer).toEqual({ project: P, computer_id: C1 });
  });
  it('the newest spelling present wins: computer_id over computer over container', () => {
    expect(one({ project: P, computer_id: C2, computer: C1, container: C1 })[0]!.computer).toEqual({ project: P, computer_id: C2 });
    expect(one({ project: P, computer: C2, container: C1 })[0]!.computer).toEqual({ project: P, computer_id: C2 });
  });
  it('the newest spelling present decides: an unusable one is dropped, not rescued by an older one', () => {
    expect(one({ project: P, computer_id: 1, computer: C1 })).toEqual([]);
    expect(one({ project: P, computer_id: 'not a label!', container: C1 })).toEqual([]);
    expect(one({ project: P, computer: 1, container: C1 })).toEqual([]);
  });
  it('a row naming no computer under any spelling is dropped', () => {
    expect(one({ project: P })).toEqual([]);
    expect(one({ project: P, computer_id: 'not a label!' })).toEqual([]);
  });
  it('writes computer_id only, and what is written reads back to the same document', () => {
    for (const old of [{ project: P, computer: C1 }, { project: P, container: C1 }]) {
      const d: RecentDoc = readRecent(doc(row(old)));
      const w = JSON.parse(JSON.stringify(d)) as { rows: { computer: Record<string, unknown> }[] };
      expect(w.rows[0]!.computer).toEqual({ project: P, computer_id: C1 });
      expect(readRecent(w)).toEqual(d);
    }
  });
});

describe('an old row and a new row reopen the same app through the shared core', () => {
  const send = (k: FakeKits) => (t: Parameters<FakeKits['send']>[0], method: string, path: string, q?: Record<string, string | number | boolean>, b?: unknown) =>
    k.send(t, method, path, q as Record<string, string>, b) as ReturnType<NonNullable<Parameters<typeof createRunOpen>[0]>['send']>;

  it('a row written now carries computer_id: the core handle of a fresh launch, stored', async () => {
    const k = new FakeKits();
    const m = createRunOpen({ send: send(k), now: k.now, sleep: k.sleep, random: k.random, computer: { project: P, computer_id: C1 } });
    const r = await m.open({ app: 'htop' });
    expect(r.ok).toBe(true);
    expect(r.handle?.computer).toEqual({ project: P, computer_id: C1 });
    const stored = fromHandle(r.handle!, { name: 'htop' }, 1_700_000_000_000);
    const w = JSON.parse(JSON.stringify({ v: 2, rows: [stored], ack: [] })) as { rows: { computer: Record<string, unknown> }[] };
    expect(w.rows[0]!.computer).toEqual({ project: P, computer_id: C1 });
  });

  it('the stored row of that launch, under each spelling, reads the same running app (never wrong_computer)', async () => {
    const k = new FakeKits();
    const m = createRunOpen({ send: send(k), now: k.now, sleep: k.sleep, random: k.random, computer: { project: P, computer_id: C1 } });
    const r = await m.open({ app: 'htop' });
    expect(r.ok, 'the launch succeeded').toBe(true);
    const stored = fromHandle(r.handle!, { name: 'htop' }, 1_700_000_000_000)!;
    const fresh = await m.status(toHandle(stored));
    expect({ ok: fresh.ok, state: fresh.state, code: fresh.code }, 'the new row reads a running app').toEqual({ ok: true, state: 'running', code: 'running_plain' });
    for (const spelling of ['computer', 'container'] as const) {
      const raw = JSON.parse(JSON.stringify(stored)) as Record<string, unknown>;
      raw.computer = { project: P, [spelling]: C1 };
      const old = readRecent(doc(raw)).rows[0]!;
      expect(recentKey(old), `${spelling}: the same launch`).toBe(recentKey(stored));
      const s = await m.status(toHandle(old));
      expect([s.code, s.state], `${spelling}: the same answer as the new row`).toEqual([fresh.code, fresh.state]);
    }
    const other = readRecent(doc({ ...(JSON.parse(JSON.stringify(stored)) as object), computer: { project: P, computer_id: C2 } })).rows[0]!;
    expect((await m.status(toHandle(other))).code, 'a row of another computer stays refused').toBe('wrong_computer');
  });
});
