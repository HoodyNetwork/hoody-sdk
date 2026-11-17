// Vitest: the aliases envelope, multi-token keys, read-back, and the restore and share gates.
import { describe, expect, it } from 'vitest';
import { aliasesFor, aliasesOf, isConflict, REDACTED, restoreBlock, shareBlock, splitKey, withKeys } from './logic';
import { readBack } from './parts/ops';
import type { CompScripts, ScriptItem } from './types';

const R = 'default/1/';
const comp = (o: Partial<CompScripts>): CompScripts => ({ instances: {}, agentRealm: 'a'.repeat(24), ...o }) as CompScripts;

describe('aliases', () => {
  it('reads the real list envelope: data is {aliases, count}', () => {
    const raw = { statusCode: 200, message: 'Proxy aliases retrieved successfully', data: { aliases: [{ id: 'a1', program: 'exec', index: 1, target_path: '/x' }], count: 1 } };
    expect(aliasesOf(raw).map((a) => a.id)).toEqual(['a1']);
  });
  it('only links to this script on the Exec kit, index 1', () => {
    const rows = [
      { id: 'ok', program: 'exec', index: 1, target_path: '/health' },
      { id: 'other-kit', program: 'files', index: 1, target_path: '/health' },
      { id: 'other-index', program: 'exec', index: 2, target_path: '/health' },
    ] as never;
    expect(aliasesFor(rows, `${R}health.ts`).map((a) => a.id)).toEqual(['ok']);
  });
});

describe('keys', () => {
  it('keeps every @token of a multi-token script on save', () => {
    const text = `// @token ${REDACTED}\n// @token ${REDACTED}\n// @label x\nexport default 1;\n`;
    const { body, keys } = splitKey(text);
    expect(keys).toEqual([REDACTED, REDACTED]);
    const out = withKeys(body, keys);
    expect('error' in out).toBe(false);
    if (!('error' in out)) expect(out.text.split('\n').filter((l) => l.startsWith('// @token ')).length).toBe(2);
  });
});

describe('read-back', () => {
  it('unlocks only on an explicit true from every read', async () => {
    let n = 0;
    const settle = () => { n++; };
    await readBack(settle, Promise.resolve(false));
    await readBack(settle, Promise.resolve(true), Promise.resolve(false));
    await readBack(settle, Promise.reject(new Error('x')));
    expect(n).toBe(0);
    await readBack(settle, Promise.resolve(true), Promise.resolve(true));
    expect(n).toBe(1);
  });
});

describe('gates', () => {
  it('restore needs a known owner and a chosen realm and refuses another realm\'s script', () => {
    expect(restoreBlock(comp({ instances: null }), `${R}a.ts`)).toBe('unknown');
    expect(restoreBlock(comp({ agentRealm: null }), `${R}a.ts`)).toBe('unknown');
    expect(restoreBlock(comp({ instances: { [`${R}a.ts`]: { elsewhere: true } as never } }), `${R}a.ts`)).toBe('elsewhere');
    expect(restoreBlock(comp({}), `${R}a.ts`)).toBeNull();
  });
  it('public links are off when the owner is unknown or the script is managed', () => {
    const item = (o: Partial<ScriptItem>) => ({ managed: null, ownershipUnknown: false, ...o }) as ScriptItem;
    expect(shareBlock(item({ ownershipUnknown: true }))).toBe(true);
    expect(shareBlock(item({ managed: { elsewhere: false } as never }))).toBe(true);
    expect(shareBlock(item({}))).toBe(false);
  });
  it('a stale revision is a conflict, not a plain failure', () => {
    expect(isConflict({ outcome: 'stale' })).toBe(true);
    expect(isConflict({ outcome: 'failed', code: 'BAD_REVISION' })).toBe(true);
    expect(isConflict({ outcome: 'failed', code: 'SCRIPT_BUSY' })).toBe(false);
    expect(isConflict(null)).toBe(false);
  });
});

describe('more security cases', () => {
  it('keys an instance row like the list: root-relative', async () => {
    const { instanceOf, ROOT } = await import('./logic');
    expect(instanceOf({ path: '/api/a.ts', state: 'active' })?.path).toBe(`${ROOT}api/a.ts`);
    expect(instanceOf({ path: `${ROOT}a.ts`, state: 'active' })?.path).toBe(`${ROOT}a.ts`);
  });
  it('labels an env key by a known word and leaves a file path as it is', async () => {
    const { envFromKind } = await import('./logic');
    expect(envFromKind(undefined)).toBe('script');
    expect(envFromKind('folder')).toBe('folder');
    expect(envFromKind('default/1/api/.env')).toBeNull();
  });
});

describe('a test send that may have gone through', () => {
  it('a lost answer, then a fresh read, then a second press: refused; only Dismiss lets it go', async () => {
    const { bootFixtureCore, heldChanges, useLockedChange } = await import('@core');
    const { renderHook, act } = await import('@testing-library/react');
    const { RUN_LOCK, runLockOptions, runReads, dismissRun } = await import('./data');
    bootFixtureCore({ rules: [] });
    let sent = 0;
    const lost = () => {
      sent += 1;
      return Promise.reject({ kind: 'pending' });
    };
    const v = { compId: 'c1', exec: 1, method: 'POST', route: '/orders?token=abc', body: '{"secret":"x"}' };
    const first = renderHook(() => useLockedChange(lost, runReads, RUN_LOCK, runLockOptions));
    expect((await act(() => first.result.current.run(v))).outcome).toBe('pending');
    first.unmount();
    // Core shows it by identity: no body, no token.
    expect(heldChanges(RUN_LOCK).map((h) => h.identity)).toEqual([{ compId: 'c1', method: 'POST', route: '/orders', gen: 0 }]);
    const second = renderHook(() => useLockedChange(lost, runReads, RUN_LOCK, runLockOptions));
    // A fresh read (health, anything) frees nothing: no read can prove a request.
    expect(await act(() => second.result.current.readBack())).toBe(false);
    expect(await act(() => second.result.current.run(v))).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(sent).toBe(1);
    dismissRun({ compId: 'c1', exec: 1, method: 'POST', route: '/orders' });
    await act(() => second.result.current.run(v));
    expect(sent).toBe(2);
  });
  it('the run lock has no read that could free it', async () => {
    const { sourceTable } = await import('./data');
    expect((sourceTable.changes.trigger as { reads?: unknown }).reads).toBeUndefined();
  });
});

describe('the n key and the row run toast', () => {
  it('n is off on the New page and without a computer to write to', async () => {
    const { newKeyEnabled } = await import('./logic');
    expect(newKeyEnabled(true, [])).toBe(true);
    expect(newKeyEnabled(true, ['new'])).toBe(false);
    expect(newKeyEnabled(false, [])).toBe(false);
  });
  it('a pending run is a sticky unknown toast, never a short warning', async () => {
    const { runToastFor } = await import('./logic');
    expect(runToastFor('done')).toEqual({ tone: 'ok', key: 'run.started' });
    expect(runToastFor('pending')).toEqual({ tone: 'unknown', key: 'run.pending' });
    // A definite refusal is an error (with its fix); a run never sent is info. Neither started anything.
    expect(runToastFor('failed')).toEqual({ tone: 'error', key: 'run.failed' });
    expect(runToastFor('not_sent')).toEqual({ tone: 'info', key: 'run.failed' });
    expect(runToastFor('stale')).toEqual({ tone: 'info', key: 'run.failed' });
  });
  it('a held second press is "still checking the earlier run", never "did not start" (C9)', async () => {
    const { runToastFor } = await import('./logic');
    for (const code of ['READ_BACK_FIRST', 'BUSY']) expect(runToastFor('not_sent', code)).toEqual({ tone: 'unknown', key: 'run.checking' });
  });
});

describe('a locked change can always be released', () => {
  it('every change with a lock declares reads that exist, so a read-back can free it (the run lock included)', async () => {
    const { sourceTable } = await import('./data');
    const lockedChanges = Object.entries(sourceTable.changes).filter(([, c]) => 'lock' in c || 'lockKey' in c);
    expect(lockedChanges.map(([k]) => k)).toEqual(expect.arrayContaining(['trigger', 'write', 'restore', 'comments', 'remove', 'envUpdate', 'testsPut']));
    for (const [key, c] of lockedChanges) {
      const reads = (c as { reads?: readonly string[] }).reads ?? [];
      if (key === 'trigger') continue; // a run has nothing a read can prove: only a warned Dismiss frees it
      expect(reads.length, `${key} declares reads`).toBeGreaterThan(0);
      for (const r of reads) expect(Object.keys(sourceTable.reads), `${key} reads ${r}`).toContain(r);
    }
  });
});

describe('what a fresh read proves', () => {
  type P = (id: unknown, a: readonly (readonly unknown[])[]) => string | undefined;
  const selectList = async () => { const r = ((await import('./data')).sourceTable.reads as unknown as Record<string, { select: (raw: unknown, p?: { exec: number }) => unknown }>).list!; return (raw: unknown, exec: number | undefined) => r.select(raw, exec === undefined ? undefined : { exec }); };
  const proves = async (k: string): Promise<P> => ((await import('./data')).sourceTable.changes as unknown as Record<string, { proves?: P }>)[k]!.proves!;
  it('a delete is proven only by a list that answered without the script', async () => {
    const p = await proves('remove');
    const listed = await selectList();
    const row = { path: 'default/1/a.ts', type: 'file' };
    expect(p({ path: 'default/1/a.ts' }, [[listed({ scripts: [row] }, 1)]])).toBeUndefined();
    expect(p({ path: 'default/1/a.ts' }, [[listed({ scripts: [{ ...row, path: 'default/1/b.ts' }] }, 1)]])).toBe('applied');
    expect(p({ path: 'default/1/a.ts' }, [[]])).toBeUndefined();
  });
  it("a delete in another folder is proven only by that folder's own list, never folder 1's", async () => {
    const p = await proves('remove');
    const listed = await selectList();
    // Folder 1's list (what an off-page read-back reads) does not hold folder 3's script, yet proves nothing about it.
    expect(p({ path: 'default/3/a.ts' }, [[listed({ scripts: [{ path: 'default/1/b.ts' }] }, 1)]])).toBeUndefined();
    expect(p({ path: 'default/3/a.ts' }, [[listed({ scripts: [] }, undefined)]])).toBeUndefined();
    expect(p({ path: 'default/3/a.ts' }, [[listed({ scripts: [{ path: 'default/3/a.ts' }] }, 3)]])).toBeUndefined();
    expect(p({ path: 'default/3/a.ts' }, [[listed({ scripts: [{ path: 'default/3/b.ts' }] }, 3)]])).toBe('applied');
    // A scope-relative row of folder 3 is that folder's own.
    expect(p({ path: 'default/3/a.ts' }, [[listed({ scripts: [{ path: 'a.ts' }] }, 3)]])).toBeUndefined();
    // A raw answer (not the folder read's own shape) proves nothing.
    expect(p({ path: 'default/1/a.ts' }, [[{ scripts: [{ path: 'default/1/b.ts' }] }]])).toBeUndefined();
  });
  it('a link is proven by the aliases list, and writes have no read proof', async () => {
    const p = await proves('aliasCreate');
    const al = (c: string) => [[{ data: { aliases: [{ id: 'x', target_path: '/a', program: 'exec', index: 1, computer_id: c }] } }]];
    expect(p({ compId: 'c1', target: '/a' }, [[{ data: { aliases: [] } }]])).toBeUndefined();
    expect(p({ compId: 'c1', target: '/a' }, al('c2'))).toBeUndefined();
    expect(p({ compId: 'c1', target: '/a' }, al('c1'))).toBe('applied');
    const { sourceTable } = await import('./data');
    for (const k of ['write', 'restore', 'comments', 'envUpdate', 'testsPut']) expect((sourceTable.changes as unknown as Record<string, { proves?: unknown }>)[k]!.proves).toBeUndefined();
  });
});

describe('a named link is proven by its own name', () => {
  it('another link to the same script never proves a create that carried a name; the name rides the identity as `name`, never `alias`', async () => {
    const { sourceTable } = await import('./data');
    const c = sourceTable.changes as unknown as Record<string, { lockKey: (v: unknown) => unknown; identity?: (v: unknown) => unknown; input: (v: unknown) => { body: Record<string, unknown> }; proves: (id: unknown, a: unknown[][]) => string | undefined }>;
    const row = (alias: string) => [[{ data: { aliases: [{ id: 'x', alias, target_path: '/a', program: 'exec', index: 1, computer_id: 'c1' }] } }]];
    // The lock is the computer and address only (a second name cannot be sent while the first is out); the name is the held identity.
    expect(c.aliasCreate!.lockKey({ compId: 'c1', exec: 1, target: '/a', alias: 'mine-1' })).toEqual({ compId: 'c1', target: '/a' });
    expect(c.aliasCreate!.lockKey({ compId: 'c1', exec: 1, target: '/a', alias: 'other-2' })).toEqual({ compId: 'c1', target: '/a' });
    const id = c.aliasCreate!.identity!({ compId: 'c1', exec: 1, target: '/a', alias: 'mine-1' }) as Record<string, unknown>;
    expect(id).toEqual({ compId: 'c1', target: '/a', name: 'mine-1' });
    expect('alias' in id).toBe(false);
    expect(c.aliasCreate!.proves(id, row('someone-else'))).toBeUndefined();
    expect(c.aliasCreate!.proves(id, row('mine-1'))).toBe('applied');
    // Without a name (the old press) the identity and the proof are as before.
    expect(c.aliasCreate!.identity!({ compId: 'c1', exec: 1, target: '/a' })).toEqual({ compId: 'c1', target: '/a' });
    expect(c.aliasCreate!.proves({ compId: 'c1', target: '/a' }, row('anything'))).toBe('applied');
    expect(c.aliasRemove!.proves(id, [[{ data: { aliases: [{ id: 'y' }] } }]])).toBeUndefined();
    expect(c.aliasCreate!.input({ compId: 'c1', exec: 1, target: '/a', alias: 'mine-1' }).body).toMatchObject({ computer_id: 'c1', program: 'exec', index: 1, target_path: '/a', alias: 'mine-1' });
    expect('alias' in c.aliasCreate!.input({ compId: 'c1', exec: 1, target: '/a' }).body).toBe(false);
  });
});

describe('alias changes share core\'s alias lock', () => {
  it('state and remove are keyed by the alias id under proxy.alias, and prove by it', async () => {
    const { sourceTable } = await import('./data');
    const c = sourceTable.changes as unknown as Record<string, { lock?: string; lockKey: (v: unknown) => unknown; identity?: (v: unknown) => unknown; proves: (id: unknown, a: unknown[][]) => string | undefined }>;
    expect(c.aliasState!.lock).toBe('proxy.alias');
    expect(c.aliasRemove!.lockKey({ id: 'x' })).toEqual({ alias: 'x' });
    const list = [[{ data: { aliases: [{ id: 'x', enabled: true }] } }]];
    expect(c.aliasState!.proves(c.aliasState!.identity!({ id: 'x', enabled: true }), list)).toBe('applied');
    expect(c.aliasState!.proves(c.aliasState!.identity!({ id: 'x', enabled: false }), list)).toBeUndefined();
    expect(c.aliasRemove!.proves({ alias: 'x' }, [[{ data: { aliases: [{ id: 'y' }] } }]])).toBe('applied');
  });
});

describe('alias proofs read only their own change identity', () => {
  it('a pending create never reads as a remove that happened, nor a state change', async () => {
    const { sourceTable } = await import('./data');
    const c = sourceTable.changes as unknown as Record<string, { proves: (id: unknown, a: unknown[][]) => string | undefined }>;
    const empty = [[{ data: { aliases: [{ id: 'other' }] } }]];
    const create = { compId: 'c1', target: '/a' };
    expect(c.aliasRemove!.proves(create, empty)).toBeUndefined();
    expect(c.aliasState!.proves(create, empty)).toBeUndefined();
    expect(c.aliasRemove!.proves({ alias: 'x', enabled: true }, empty)).toBeUndefined();
    expect(c.aliasCreate!.proves({ alias: 'x' }, empty)).toBeUndefined();
    expect(c.aliasRemove!.proves({ alias: 'x' }, empty)).toBe('applied');
  });
});

describe('Check again over several changes settles in one click', () => {
  it('asks only the pending ones and settles when none is left', async () => {
    const { readBackOf } = await import('./parts/ops');
    let settled = 0;
    const asked: string[] = [];
    const m = (n: string, pending: boolean, ok: boolean) => ({ pending, readBack: async () => { asked.push(n); return ok; } });
    await readBackOf(() => { settled += 1; }, m('a', false, false), m('b', true, true), m('c', false, false));
    expect(asked).toEqual(['b']);
    expect(settled).toBe(1);
    await readBackOf(() => { settled += 1; }, m('a', true, false));
    expect(settled).toBe(1);
  });
});
