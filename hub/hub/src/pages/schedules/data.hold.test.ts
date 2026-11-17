// Vitest: the page's settle and hold helpers (data.ts) outside fixture mode pass the hold of the send through to
// A proof's settle frees only the send its hold names.
import { answers, bootFixtureCore, reply } from '@core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { holdAct, holdSave, settleAct, settleSave } from './data';
import { liveAct, liveSave, liveSettle, liveSettleSave } from './live-act';
import type { SchedRow } from './logic';
import { routes } from './routes';

vi.mock('@core', async (orig) => ({ ...(await orig<typeof Core>()), fixtureModeActive: () => false }));

const row = (src: SchedRow['src'], ref: SchedRow['ref']): SchedRow => ({ src, key: `${src}:x`, ref }) as unknown as SchedRow;
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  const rec = (name: string) => reply(routes[name as 'edit'], () => answers.lost());
  bootFixtureCore({ rules: ['edit', 'remove', 'run', 'create', 'curlToggle', 'curlEdit', 'curlRemove', 'execTrigger', 'loopPatch', 'loopRun', 'loopDelete'].map(rec) });
});

describe('the page helpers pass the hold through', () => {
  it('settleAct: an older hold frees nothing, the newer one frees its send', async () => {
    const e = row('cron', { user: 'user', entry: 'cf2b8c1e-0a4d-4c55-9e1a-7b6d5a4c3b33', revision: 'r1', computer: 'comp-a' });
    const args = { act: 'pause' as const, row: e, enabled: false };
    const older = await liveAct('pause', e, false);
    await liveSettle('pause', e, false, older.hold);
    const newer = await liveAct('pause', e, false);
    expect(await holdAct(args)).toBe(newer.hold);
    settleAct(args, older.hold);
    await tick();
    expect(await holdAct(args)).toBe(newer.hold);
    settleAct(args, newer.hold);
    await tick();
    expect(await holdAct(args)).toBeUndefined();
  });

  it('settleSave: an older hold frees nothing, the newer one frees its send', async () => {
    const e = row('cron', { user: 'user', entry: 'df2b8c1e-0a4d-4c55-9e1a-7b6d5a4c3b34', revision: 'r1', computer: 'comp-a' });
    const a = { row: e, name: 'n', command: '', schedule: '0 7 * * *', runAs: 'user' as const };
    const older = await liveSave(a);
    await liveSettleSave(a, older.hold);
    const newer = await liveSave(a);
    expect(await holdSave(a)).toBe(newer.hold);
    settleSave(a, older.hold);
    await tick();
    expect(await holdSave(a)).toBe(newer.hold);
    settleSave(a, newer.hold);
    await tick();
    expect(await holdSave(a)).toBeUndefined();
  });
});
