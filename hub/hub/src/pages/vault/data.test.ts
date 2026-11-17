// data.ts over core's fixture transport: the C9 contract of the vault's writes (held unless proven, per
// partition), what core keeps of a held write, and the sends that must not happen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFixtureCore, heldChanges, queryClient } from '@core';
import { resetChanges, reloadChangesForTests } from '@core/changes';
import { setView } from '@core/ctx';
import { readChanges } from '@core/change-store';
import fixtures, { REALM_A, REALM_B, importScript, requestLog, resetFixtureVaults } from './fixtures';
import { LOCK, checkHold, readValue, defsForTests, clearPartition, currentEpoch, deleteEntry, dismissHold, freshList, moveEpoch, savePut, type Change, type VaultHold } from './data';
import { heldIdentity, type Partition } from './logic';

const boot = (state: keyof typeof fixtures.states) => bootFixtureCore({ rules: fixtures.states[state] });

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  vi.stubGlobal('isSecureContext', true);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const put = (partition: Partition, key: string, o: { mode?: 'new' | 'replace'; value?: string; password?: string } = {}) =>
  savePut({ partition, key, mode: o.mode ?? 'new', value: o.value ?? 'fixture-v', password: o.password ?? '', epoch: currentEpoch() });
const holds = (): VaultHold[] =>
  heldChanges(LOCK).flatMap((change) => {
    const id = heldIdentity(change.identity);
    return id ? [{ change, id, own: true, from: change.from }] : [];
  });
const puts = () => requestLog.filter((r) => r.method === 'PUT');

describe('a read that ends before its answer is held', () => {
  it('a view change during the read is stale, not an empty value', async () => {
    boot('default');
    const p = readValue(REALM_A, 'github-token');
    setView('elsewhere');
    expect(await p).toEqual({ ok: false, problem: { kind: 'stale' } });
  });

  it('a view change during a read that is then refused is stale, not the refusal', async () => {
    boot('default');
    const p = readValue(REALM_A, 'no-such-key');
    setView('elsewhere');
    expect(await p).toEqual({ ok: false, problem: { kind: 'stale' } });
  });

  it('a read refused with the view unchanged keeps its own problem', async () => {
    boot('default');
    expect(await readValue(REALM_A, 'no-such-key')).toEqual({ ok: false, problem: { kind: 'gone' }, error: expect.objectContaining({ status: 404 }) });
  });

  it('an aborted read is stale, not a network problem', async () => {
    boot('default');
    const ac = new AbortController();
    const p = readValue(REALM_A, 'github-token', ac.signal);
    ac.abort();
    expect(await p).toEqual({ ok: false, problem: { kind: 'stale' } });
  });

  it('a truly empty value is still empty', async () => {
    boot('jsonValues');
    expect(await readValue(REALM_A, 'blank.value')).toEqual({ ok: false, problem: { kind: 'empty' } });
  });
});

describe('a write that may have gone through is held', () => {
  it('a PUT answered 502 is pending, held by its safe identity only', async () => {
    boot('unknown');
    const c = await put(REALM_A, 'new-one', { value: 'fixture-secret-value-xyz' });
    expect(c.outcome).toBe('pending');
    const [h] = holds();
    expect(h?.id).toMatchObject({ partition: REALM_A, op: 'put', key: 'new-one' });
    expect(JSON.stringify(heldChanges(LOCK))).not.toContain('fixture-secret-value-xyz');
    expect(JSON.stringify(readChanges() ?? [])).not.toContain('fixture-secret-value-xyz');
  });

  it('an encrypted PUT keeps neither the value, the password nor the envelope', async () => {
    boot('unknown');
    await put(REALM_A, 'sealed', { value: 'fixture-plain-123', password: 'fixture-pw-456' });
    const sent = (puts()[0]!.body as { value: string }).value;
    const kept = JSON.stringify([heldChanges(LOCK), readChanges() ?? []]);
    for (const s of ['fixture-plain-123', 'fixture-pw-456', sent, JSON.parse(sent).ct as string]) expect(kept).not.toContain(s);
  }, 20_000);

  it('Check again proves a PUT by its write id in a fresh list of its own partition', async () => {
    boot('appliedLost');
    const c = await put(REALM_A, 'landed');
    expect(c.outcome).toBe('pending');
    requestLog.length = 0;
    expect(await checkHold(holds()[0]!)).toBe('applied');
    expect(holds()).toEqual([]);
    expect(requestLog.filter((r) => r.path === '/vault/keys').every((r) => r.query.realm_id === REALM_A)).toBe(true);
  });

  it('a PUT that did not land stays held after Check again', async () => {
    boot('unknown');
    await put(REALM_A, 'not-landed');
    expect(await checkHold(holds()[0]!)).toBe('unproven');
    expect(holds()).toHaveLength(1);
  });

  it('a replace whose old row has another write id is not proved', async () => {
    boot('unknown');
    await put(REALM_A, 'github-token', { mode: 'replace' });
    expect(await checkHold(holds()[0]!)).toBe('unproven');
  });

  it('DELETE and Clear are never proved by a read: no read is sent, only Dismiss frees them', async () => {
    boot('unknown');
    expect((await deleteEntry(REALM_A, 'github-token')).outcome).toBe('pending');
    expect((await clearPartition(REALM_B)).outcome).toBe('pending');
    requestLog.length = 0;
    for (const h of holds()) expect(await checkHold(h)).toBe('unproven');
    expect(requestLog).toEqual([]);
    expect(holds()).toHaveLength(2);
    const del = holds().find((h) => h.id.op === 'delete')!;
    expect(await dismissHold(del)).toBe(true);
    expect(holds().map((h) => h.id.op)).toEqual(['clear']);
  });

  it('holds of two partitions are independent', async () => {
    boot('unknown');
    await put(REALM_A, 'in-a');
    await put(REALM_B, 'in-b');
    expect(holds()).toHaveLength(2);
    const a = holds().find((h) => h.id.partition === REALM_A)!;
    expect(await dismissHold(a)).toBe(true);
    expect(holds().map((h) => h.id.partition)).toEqual([REALM_B]);
  });

  it('a held partition refuses the next write unsent; another partition still writes', async () => {
    boot('unknown');
    await put(REALM_A, 'first');
    requestLog.length = 0;
    expect((await put(REALM_A, 'second')).outcome).toBe('held');
    expect((await deleteEntry(REALM_A, 'github-token')).outcome).toBe('held');
    expect((await clearPartition(REALM_A)).outcome).toBe('held');
    expect(requestLog.filter((r) => r.method !== 'GET')).toEqual([]);
    expect((await put(REALM_B, 'elsewhere')).outcome).toBe('pending');
  });

  it('a hold survives a reload and is still proved by Check again', async () => {
    boot('appliedLost');
    await put(REALM_A, 'across-reload');
    reloadChangesForTests();
    const [h] = holds();
    expect(h?.id).toMatchObject({ partition: REALM_A, op: 'put', key: 'across-reload' });
    expect(await checkHold(h!)).toBe('applied');
    expect(holds()).toEqual([]);
  });
});

describe('sends that must not happen', () => {
  it('New refuses a taken name and a hoody.* name; Replace refuses a gone entry', async () => {
    boot('default');
    expect(await put(REALM_A, 'github-token')).toEqual<Change>({ outcome: 'not_sent', why: 'exists' });
    expect(await put('', 'hoody.anything')).toEqual<Change>({ outcome: 'not_sent', why: 'reserved' });
    expect(await put(REALM_A, 'nope', { mode: 'replace' })).toEqual<Change>({ outcome: 'not_sent', why: 'gone' });
    expect(puts()).toEqual([]);
  });

  it('a moved epoch sends nothing', async () => {
    boot('default');
    const epoch = currentEpoch();
    moveEpoch();
    expect(await savePut({ partition: REALM_A, key: 'late', mode: 'new', value: 'v', password: '', epoch })).toEqual<Change>({ outcome: 'not_sent', why: 'moved' });
    expect(puts()).toEqual([]);
  });

  it('no strong randomness: an encrypted write is refused unsent', async () => {
    boot('default');
    vi.stubGlobal('isSecureContext', false);
    expect(await put(REALM_A, 'sealed', { password: 'pw' })).toEqual<Change>({ outcome: 'not_sent', why: { crypto: 'unavailable' } });
    expect(puts()).toEqual([]);
  });

  it('an unreadable list sends nothing', async () => {
    boot('error');
    expect(await put(REALM_A, 'x')).toEqual<Change>({ outcome: 'not_sent', why: 'unread' });
    expect(puts()).toEqual([]);
  });

  it('a list answer without a data array is unread, never empty: New sends nothing over a stored name', async () => {
    boot('import');
    importScript.list = () => ({ status: 200, body: { statusCode: 200, data: {} } });
    expect(await put(REALM_A, 'github-token')).toEqual<Change>({ outcome: 'not_sent', why: 'unread' });
    expect(await freshList(REALM_A)).toBeNull();
    expect(puts()).toEqual([]);
  });

  it('the value never enters the TanStack caches, in flight or after', async () => {
    boot('slowSave');
    const p = put(REALM_A, 'cached-not', { value: 'fixture-cache-probe' });
    await vi.waitFor(() => expect(puts()).toHaveLength(1));
    const probe = () => JSON.stringify([queryClient.getMutationCache().getAll().map((m) => m.state), queryClient.getQueryCache().getAll().map((q) => q.state.data)]);
    expect(probe()).not.toContain('fixture-cache-probe');
    expect((await p).outcome).toBe('done');
    expect(probe()).not.toContain('fixture-cache-probe');
  });

  it('the scrubs copy the value out and null it in the answer', () => {
    const answer = { statusCode: 200, data: { key: 'k', value: 'fixture-secret-value-xyz', metadata: null } };
    expect(defsForTests.takeValue(answer)).toBe('fixture-secret-value-xyz');
    expect(answer.data.value).toBeNull();
    expect(answer.data.key).toBe('k');
    const put = { data: { value: 'fixture-secret-value-xyz' } };
    defsForTests.dropValue(put);
    expect(put.data.value).toBeNull();
    expect(defsForTests.takeValue(null)).toBe('');
  });

  it('a write in Global sends no realm_id', async () => {
    boot('default');
    expect((await put('', 'global-one')).outcome).toBe('done');
    expect(puts()[0]!.query).toEqual({});
    expect(await freshList('')).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'global-one' })]));
  });
});
