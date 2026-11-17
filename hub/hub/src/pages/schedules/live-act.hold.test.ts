// Vitest: a proof frees only the send it is about. The hold of a send is captured when it is
// answered (or, without one, before the proving read) and the settle names it; a late read for an older send never
// frees a newer send of the same change.
import { answers, bootFixtureCore, reply } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
import { liveAct, liveHold, liveHoldSave, liveSave, liveSettle, liveSettleSave } from './live-act';
import type { SchedRow } from './logic';
import { routes } from './routes';

const row = (src: SchedRow['src'], ref: SchedRow['ref']): SchedRow => ({ src, key: `${src}:x`, ref }) as unknown as SchedRow;
let sent: string[];

function boot(answer: Parameters<typeof reply>[1]) {
  sent = [];
  const rec = (name: string) => reply(routes[name as 'edit'], (req) => {
    sent.push(`${req.method} ${req.path}`);
    return typeof answer === 'function' ? answer(req) : answer;
  });
  bootFixtureCore({ rules: ['edit', 'remove', 'run', 'create', 'curlToggle', 'curlEdit', 'curlRemove', 'execTrigger', 'loopPatch', 'loopRun', 'loopDelete'].map(rec) });
}
// Another tab of this page: it proves the older send, then sends the same change again, which is held (newer).
const answer = (a: Parameters<typeof reply>[1]) => { const keep = sent; boot(a); sent = keep; };

describe('a proof frees only the send it is about', () => {
  beforeEach(() => boot(answers.lost()));

  it('a pending answer carries the hold of that very send', async () => {
    const e = row('cron', { user: 'user', entry: '7f2b8c1e-0a4d-4c55-9e1a-7b6d5a4c3b2e', revision: 'r1', computer: 'comp-a' });
    const r = await liveAct('pause', e, false);
    expect(r.outcome).toBe('pending');
    expect(typeof r.hold).toBe('string');
    expect(await liveHold('pause', e, false)).toBe(r.hold);
  });

  it('a late read for an older send does not settle a newer send of the same change', async () => {
    const e = row('cron', { user: 'user', entry: '8f2b8c1e-0a4d-4c55-9e1a-7b6d5a4c3b2f', revision: 'r1', computer: 'comp-a' });
    const older = await liveAct('pause', e, false);
    expect(older.outcome).toBe('pending');
    // The other tab proves the older send and sends again: the newer send is held under its own hold.
    await liveSettle('pause', e, false, older.hold);
    const newer = await liveAct('pause', e, false);
    expect(newer.outcome).toBe('pending');
    expect(newer.hold).not.toBe(older.hold);
    // This tab's late read for the older send settles it again: nothing is freed.
    await liveSettle('pause', e, false, older.hold);
    const again = await liveAct('pause', e, false);
    expect(again).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(sent).toHaveLength(2);
    // The newer send's own proof frees it.
    await liveSettle('pause', e, false, newer.hold);
    answer(answers.ok({}));
    expect((await liveAct('pause', e, false)).outcome).toBe('done');
  });

  it('a READ_BACK_FIRST answer carries the hold of the send that is held', async () => {
    const e = row('cron', { user: 'user', entry: '9f2b8c1e-0a4d-4c55-9e1a-7b6d5a4c3b30', revision: 'r1', computer: 'comp-a' });
    const first = await liveAct('pause', e, false);
    const second = await liveAct('pause', e, false);
    expect(second).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST', hold: first.hold });
  });

  it('a save: the late read for an older save does not settle a newer one', async () => {
    const e = row('cron', { user: 'user', entry: 'af2b8c1e-0a4d-4c55-9e1a-7b6d5a4c3b31', revision: 'r1', computer: 'comp-a' });
    const a = { row: e, name: 'n', command: '', schedule: '0 6 * * *', runAs: 'user' as const };
    const older = await liveSave(a);
    expect(older.outcome).toBe('pending');
    expect(await liveHoldSave(a)).toBe(older.hold);
    await liveSettleSave(a, older.hold);
    const newer = await liveSave(a);
    expect(newer.outcome).toBe('pending');
    await liveSettleSave(a, older.hold);
    expect(await liveSave(a)).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
  });

  it('without a hold given, settle keeps freeing the send held now (the person\'s Dismiss when no hold is known)', async () => {
    const e = row('cron', { user: 'user', entry: 'bf2b8c1e-0a4d-4c55-9e1a-7b6d5a4c3b32', revision: 'r1', computer: 'comp-a' });
    expect((await liveAct('pause', e, false)).outcome).toBe('pending');
    await liveSettle('pause', e, false);
    answer(answers.ok({}));
    expect((await liveAct('pause', e, false)).outcome).toBe('done');
  });
});
