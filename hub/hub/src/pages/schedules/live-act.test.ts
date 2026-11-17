// Vitest: the live changes send once and never again. A lost answer is "may have gone through"; only a
// read-back (the schedules read again) lifts the lock, and it never sends the change.
import { answers, bootFixtureCore, defineMutation, reply } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
import { liveAct, liveSave, liveSettle, liveSettleSave } from './live-act';
import type { SchedRow } from './logic';
import { routes } from './routes';

const ID = '3f2b8c1e-0a4d-4c55-9e1a-7b6d5a4c3b2a';
const row = (src: SchedRow['src'], ref: SchedRow['ref']): SchedRow => ({ src, key: `${src}:x`, ref }) as unknown as SchedRow;
const cron = row('cron', { user: 'user', entry: ID, revision: 'r1' });
let sent: string[];

function boot(answer: Parameters<typeof reply>[1]) {
  sent = [];
  const rec = (name: string) => reply(routes[name as 'edit'], (req) => {
    sent.push(`${req.method} ${req.path}`);
    return typeof answer === 'function' ? answer(req) : answer;
  });
  bootFixtureCore({ rules: ['edit', 'remove', 'run', 'create', 'curlToggle', 'curlEdit', 'curlRemove', 'execTrigger', 'loopPatch', 'loopRun', 'loopDelete'].map(rec) });
}

describe('live changes', () => {
  beforeEach(() => boot(answers.ok({})));

  it('sends each action exactly once and says done', async () => {
    expect((await liveAct('pause', cron, false)).outcome).toBe('done');
    expect((await liveAct('del', cron)).outcome).toBe('done');
    expect((await liveAct('run', cron)).outcome).toBe('done');
    expect((await liveAct('curl.pause', row('curl', { job: ID }), true)).outcome).toBe('done');
    expect((await liveAct('curl.del', row('curl', { job: ID }))).outcome).toBe('done');
    expect((await liveAct('loop.pause', row('loop', { sid: 's1', loop: 'loop_1a2b3c4d' }), true)).outcome).toBe('done');
    expect((await liveAct('loop.run', row('loop', { sid: 's1', loop: 'loop_1a2b3c4d' }))).outcome).toBe('done');
    expect((await liveAct('loop.del', row('loop', { sid: 's1', loop: 'loop_1a2b3c4d' }))).outcome).toBe('done');
    expect((await liveAct('exec.run', row('exec', { path: 'default/1/a.ts' }))).outcome).toBe('done');
    expect(sent).toHaveLength(9);
  });

  it('refuses a change it cannot build, without sending', async () => {
    expect((await liveAct('pause', cron)).outcome).toBe('not_sent');
    expect((await liveAct('exec.run', row('exec', { path: null }))).outcome).toBe('not_sent');
    expect(sent).toHaveLength(0);
  });

  it('a lost answer is pending, and a second press is not sent before a read-back', async () => {
    boot(answers.lost());
    expect((await liveAct('pause', cron, false)).outcome).toBe('pending');
    expect(sent).toHaveLength(1);
    const again = await liveAct('pause', cron, false);
    expect(again.outcome).toBe('not_sent');
    expect(again.code).toBe('READ_BACK_FIRST');
    expect(sent).toHaveLength(1);
  });

  it('a gateway error is pending too; a refusal is failed with its code and nothing resent', async () => {
    boot(answers.pending5xx());
    expect((await liveAct('del', cron)).outcome).toBe('pending');
    boot(answers.refused(409, 'REVISION_CONFLICT'));
    const r = await liveAct('del', row('cron', { user: 'user', entry: '4f2b8c1e-0a4d-4c55-9e1a-7b6d5a4c3b2b', revision: 'r2' }));
    expect(r.outcome).toBe('failed');
    expect(r.code).toBe('REVISION_CONFLICT');
    expect(sent).toHaveLength(1);
  });

  it('save creates once, and a lost save is pending and not resent', async () => {
    expect((await liveSave({ row: null, name: 'n', command: 'echo', schedule: '0 2 * * *', runAs: 'user' })).outcome).toBe('done');
    expect(sent).toHaveLength(1);
    boot(answers.lost());
    const a = { row: cron, name: 'n', command: '', schedule: '0 3 * * *', runAs: 'user' as const };
    expect((await liveSave(a)).outcome).toBe('pending');
    expect((await liveSave(a)).outcome).toBe('not_sent');
    expect(sent).toHaveLength(1);
  });

  it('settle after a proving re-read releases the lock; before it, the press stays refused', async () => {
    boot(answers.lost());
    const other = row('cron', { user: 'user', entry: '5f2b8c1e-0a4d-4c55-9e1a-7b6d5a4c3b2c', revision: 'r3' });
    expect((await liveAct('pause', other, true)).outcome).toBe('pending');
    expect((await liveAct('pause', other, true)).code).toBe('READ_BACK_FIRST');
    await liveSettle('pause', other, true);
    boot(answers.ok({}));
    expect((await liveAct('pause', other, true)).outcome).toBe('done');
    const a = { row: other, name: 'n', command: '', schedule: '0 5 * * *', runAs: 'user' as const };
    boot(answers.lost());
    expect((await liveSave(a)).outcome).toBe('pending');
    await liveSettleSave(a);
    boot(answers.ok({}));
    expect((await liveSave(a)).outcome).toBe('done');
  });

  it('a held script run locks that script path for every page that runs it (shared lock)', async () => {
    boot(answers.lost());
    const on = row('exec', { path: 'default/1/nightly.ts', computer: 'comp-a' });
    expect((await liveAct('exec.run', on)).outcome).toBe('pending');
    expect((await liveAct('exec.run', on)).code).toBe('READ_BACK_FIRST');
    expect(sent).toHaveLength(1);
  });

  it('a lost create holds every other create on that computer: a one-character edit is not sent', async () => {
    boot(answers.lost());
    const a = { row: null, name: 'n', command: 'echo one', schedule: '0 2 * * *', runAs: 'user' as const, computer: 'comp-a' };
    expect((await liveSave(a)).outcome).toBe('pending');
    const edited = await liveSave({ ...a, command: 'echo onf' });
    expect(edited.outcome).toBe('not_sent');
    expect(edited.code).toBe('READ_BACK_FIRST');
    expect(sent).toHaveLength(1);
    await liveSettleSave(a);
    boot(answers.ok({}));
    expect((await liveSave({ ...a, command: 'echo onf' })).outcome).toBe('done');
    expect(sent).toHaveLength(1);
  });

  it('the Scripts page sees a script run held here (the shared exec.script.run lock)', async () => {
    boot(answers.lost());
    // The Scripts page's own trigger: same lock name and key shape, no computer in its variables.
    const fromScripts = defineMutation<{ path: string }>(routes.execTrigger, {
      lock: 'exec.script.run',
      lockKey: (v) => ({ path: v.path }),
      input: (v) => ({ index: 1, recovers: true, body: { scriptPath: v.path, force: true } }),
    });
    expect((await liveAct('exec.run', row('exec', { path: 'default/1/nightly.ts', computer: 'comp-a' }))).outcome).toBe('pending');
    const there = await fromScripts.run({ path: 'default/1/nightly.ts' });
    expect(there.outcome).toBe('not_sent');
    expect(sent).toHaveLength(1);
  });

  it('one entry, one lock: a held pause blocks delete, run and an edit of that entry, not another entry', async () => {
    boot(answers.lost());
    const e = row('cron', { user: 'user', entry: ID, revision: 'r1', computer: 'comp-a' });
    expect((await liveAct('pause', e, false)).outcome).toBe('pending');
    // Delete and run are other definitions on the entry's lock (HELD_BY_OTHER); the edit is the pause's own (cronEdit).
    const outs = [await liveAct('del', e), await liveAct('run', e), await liveSave({ row: e, name: 'n', command: '', schedule: '0 4 * * *', runAs: 'user' })];
    expect(outs).toEqual([{ outcome: 'not_sent', code: 'HELD_BY_OTHER' }, { outcome: 'not_sent', code: 'HELD_BY_OTHER' }, { outcome: 'not_sent', code: 'READ_BACK_FIRST', hold: expect.any(String) }]);
    expect(sent).toHaveLength(1);
    const elsewhere = row('cron', { user: 'user', entry: '6f2b8c1e-0a4d-4c55-9e1a-7b6d5a4c3b2d', revision: 'r1', computer: 'comp-a' });
    expect((await liveAct('del', elsewhere)).outcome).toBe('pending');
    expect(sent).toHaveLength(2);
  });

  it('a held web request change blocks its other changes; a held loop change blocks the loop\'s others', async () => {
    boot(answers.lost());
    const web = row('curl', { job: ID, computer: 'comp-a' });
    expect((await liveAct('curl.pause', web, true)).outcome).toBe('pending');
    // Every other change of the job is another definition on its lock: HELD_BY_OTHER, nothing sent.
    expect((await liveAct('curl.del', web)).code).toBe('HELD_BY_OTHER');
    expect((await liveSave({ row: web, name: 'n', command: '', schedule: '0 4 * * *', runAs: 'user' })).code).toBe('HELD_BY_OTHER');
    const loop = row('loop', { sid: 's1', loop: 'loop_1a2b3c4d', computer: 'comp-a' });
    expect((await liveAct('loop.pause', loop, true)).outcome).toBe('pending');
    expect((await liveAct('loop.run', loop)).code).toBe('HELD_BY_OTHER');
    expect((await liveAct('loop.del', loop)).code).toBe('HELD_BY_OTHER');
    expect(sent).toHaveLength(2);
  });
});
