// setup.test.tsx: the account setup state and its actions (zeroState, redeem, retrySetup).
import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bump } from './ctx';
import { queryClient } from './query';
import { readSetupState, redeemInvite, reinstalledOffers, resetSetup, retrySetup, retrySetupWait, setupFixtures, useSetupState, type SetupState } from './setup';
import { fixtureTransport, installTransport } from './transport';
import { boot, calls, onFetch, OTHER, R1, signIn, type Call, type Reply } from './test/env';

afterEach(() => { resetSetup(); vi.useRealTimers(); });

const isList = (c: Call) => c.url.includes('/computers?');
const isGate = (c: Call) => c.url.endsWith('/users/me/free-tier-status');
function answers(list: Reply, gate: Reply) { onFetch((c) => (isList(c) ? list : isGate(c) ? gate : { status: 404, body: {} })); }
const rows = (...r: unknown[]) => ({ status: 200, body: { data: { computers: r } } });
const gate = (d: unknown) => ({ status: 200, body: { data: d } });

describe('readSetupState', () => {
  it.each([
    ['an expired server wins', rows({ server_expired: true }), gate({ gate_enabled: true, claim_blocked_reason: 'invite_required' }), { kind: 'expired' }],
    // host_reinstalled: a reinstalled server's computer says more than an ended one, wherever it sits on the page.
    ['a reinstalled server wins', rows({ server_expired: true, status: 'host_reinstalled' }), gate({ gate_enabled: true, claim_blocked_reason: 'invite_required' }), { kind: 'reinstalled', room: null }],
    ['a reinstalled server wins over an ended one', rows({ server_expired: true, status: 'stopped' }, { server_expired: true, status: 'host_reinstalled' }), gate({ claim_blocked_reason: 'none' }), { kind: 'reinstalled', room: null }],
    ['an ended server alone stays expired', rows({ server_expired: true, status: 'stopped' }), gate({ claim_blocked_reason: 'none' }), { kind: 'expired' }],
    ['host_reinstalled without the expiry flag proves nothing', rows({ status: 'host_reinstalled' }), gate({ claim_blocked_reason: 'mailbox_already_used' }), { kind: 'mailbox' }],
    ['mailbox used', rows(), gate({ claim_blocked_reason: 'mailbox_already_used' }), { kind: 'mailbox' }],
    ['invite needed (gate on)', rows(), gate({ gate_enabled: true, claim_blocked_reason: 'invite_required', signup_code_failed: true }), { kind: 'invite', signupCodeFailed: true }],
    ['pool empty', rows(), gate({ gate_enabled: true, claim_blocked_reason: 'pool_empty' }), { kind: 'capacity' }],
  ] as const)('%s', async (_n, list, g, want) => {
    boot({ realm: R1 });
    answers(list, g);
    expect(await readSetupState()).toEqual(want);
  });
  it.each([
    ['both reads failing', { status: 500, body: {} }, { status: 503, body: {} }],
    ['only the free-tier read failing (no gate answer is no proof of provisioning)', rows(), { status: 503, body: {} }],
    ['only the containers read failing (no proof of no expired server)', { status: 500, body: {} }, gate({ gate_enabled: true, claim_blocked_reason: 'invite_required' })],
  ] as const)('%s rejects (the state stays unknown, never a guess)', async (_n, list, g) => {
    boot({ realm: R1 });
    answers(list, g);
    await expect(readSetupState()).rejects.toMatchObject({ status: expect.any(Number) });
  });
  // core-setup unknown: a state, "provisioning" included, is claimed only from a whole list read that
  // succeeded; a seen expired row proves "expired" on any page.
  const page = (r: unknown[], pagination?: unknown) => ({ status: 200, body: { data: { computers: r, ...(pagination ? { pagination } : {}) } } });
  const full = Array.from({ length: 100 }, () => ({}));
  it.each([
    ['a body without a containers list', { status: 200, body: { data: {} } }],
    ['a list with more pages and no expired row', page([{}], { totalPages: 2 })],
    ['a full page with no pagination and no expired row', page(full)],
  ] as const)('setup unknown: %s rejects (never provisioning or a gate state)', async (_n, list) => {
    boot({ realm: R1 });
    answers(list, gate({ gate_enabled: true, claim_blocked_reason: 'pool_empty' }));
    await expect(readSetupState()).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it.each([
    ['an expired row on a page that is not the whole list is still expired', page([{}, { server_expired: true }], { totalPages: 3 }), { kind: 'expired' }],
    ['a full page the pagination calls the only one is whole', page(full, { totalPages: 1 }), { kind: 'empty', freeSetup: true }],
  ] as const)('setup unknown: %s', async (_n, list, want) => {
    boot({ realm: 'all' });
    answers(list, gate({ claim_blocked_reason: 'none' }));
    expect(await readSetupState()).toEqual(want);
  });
  // A reinstalled account: its computers are gone, so where a new one can go decides Create and Rent;
  // one more read of the server list, made only then. A failed read is null, never a guess.
  const isServers = (c: Call) => /\/servers(\?|$)/.test(c.url);
  const reinstalled = rows({ server_expired: true, status: 'host_reinstalled' });
  const srv = (...r: unknown[]) => ({ status: 200, body: { data: r } });
  it.each([
    ['an active dedicated server', srv({ status: 'active', server: { id: 's1', is_vm: false } }), 'room'],
    ['a row that says no status', srv({ server: { id: 's1' } }), 'room'],
    ['a slice whose gauge says room', srv({ status: 'active', server: { id: 's1', is_vm: true, computer_capacity: { used: 1, max: 2 } } }), 'room'],
    ['a full slice and an expired server', srv({ status: 'active', server: { is_vm: true, computer_capacity: { used: 2, max: 2 } } }, { status: 'expired', server: {} }), 'none'],
    ['no server', srv(), 'none'],
    // A realm host never sends a slice's gauge: a slice without one may be full ('maybe'); a dedicated server has no cap.
    ['a free slice without its gauge (a realm host)', srv({ status: 'active', is_free_tier: true, server: { id: 'f1', is_vm: true } }), 'maybe'],
    // An admin-assigned free server is a real rental row: its flags, not the synthesized entry, say it is capped.
    ['a free server from a real rental row without its gauge', srv({ id: 'rent1', status: 'active', is_free_tier: true, server: { id: 'f1' } }), 'maybe'],
    ['a paid slice without its gauge', srv({ status: 'active', is_free_tier: false, server: { id: 'p1', is_vm: true } }), 'maybe'],
    ['a slice without its gauge beside a dedicated server', srv({ status: 'active', is_free_tier: true, server: { is_vm: true } }, { status: 'active', server: { id: 's2', is_vm: false } }), 'room'],
    ['a full free slice', srv({ status: 'active', is_free_tier: true, server: { is_vm: true, computer_capacity: { used: 1, max: 1 } } }), 'none'],
    ['a body without a list', { status: 200, body: { data: {} } }, null],
    ['a failed read', { status: 500, body: {} }, null],
  ] as const)('reinstalled room: %s', async (_n, servers, room) => {
    boot({ realm: R1 });
    onFetch((c) => (isServers(c) ? servers : isList(c) ? reinstalled : isGate(c) ? gate({ claim_blocked_reason: 'none' }) : { status: 404, body: {} }));
    expect(await readSetupState()).toEqual({ kind: 'reinstalled', room });
  });
  it('an ended server alone never reads the server list; a reinstalled one reads it on the realm host', async () => {
    boot({ realm: R1 });
    onFetch((c) => (isServers(c) ? srv() : isList(c) ? rows({ server_expired: true }) : gate({ claim_blocked_reason: 'none' })));
    await readSetupState();
    expect(calls.some(isServers)).toBe(false);
    onFetch((c) => (isServers(c) ? srv() : isList(c) ? reinstalled : gate({ claim_blocked_reason: 'none' })));
    await readSetupState();
    expect(calls.find(isServers)!.url).toContain(`${R1}.`);
  });
  it('a context that moved on during the server read fails it (stale), never a guess', async () => {
    boot({ realm: R1 });
    onFetch(async (c) => { if (isServers(c)) { bump('switch'); return srv({ status: 'active' }); } return isList(c) ? reinstalled : gate({ claim_blocked_reason: 'none' }); });
    await expect(readSetupState()).rejects.toMatchObject({ stale: true });
  });
  it('the containers read includes expired and deleting ones on the realm host; the gate on the base host', async () => {
    boot({ realm: R1 });
    answers(rows(), gate({ claim_blocked_reason: 'none' }));
    await readSetupState();
    const list = calls.find(isList)!;
    expect(list.url).toContain(`${R1}.`);
    expect(list.url).toMatch(/include_expired=true/);
    expect(list.url).toMatch(/include_deleting=true/);
    expect(calls.find(isGate)!.url.startsWith('/api/v1/')).toBe(true);
  });
  it('a context that moved on fails the read (stale), never a guess', async () => {
    boot({ realm: R1 });
    onFetch(async (c) => { if (isGate(c)) bump('switch'); return isList(c) ? rows() : gate({ claim_blocked_reason: 'none' }); });
    await expect(readSetupState()).rejects.toMatchObject({ stale: true });
  });
  it('useSetupState reads under the page context', async () => {
    boot({ realm: R1 });
    answers(rows(), gate({ gate_enabled: true, claim_blocked_reason: 'pool_empty' }));
    const seen: (SetupState | undefined)[] = [];
    function Probe() { seen.push(useSetupState().data); return null; }
    render(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>);
    await waitFor(() => expect(seen.at(-1)).toEqual({ kind: 'capacity' }));
  });
});

// "being prepared" only from a real provisioning signal. The free computer is the
// account's default one, in no realm; it is under way only once the free server is claimed (already_claimed).
describe('setup: provisioning only from a real signal', () => {
  // The account-wide list (base host, no include_expired) is told apart from setup's own containers read.
  const isAcct = (c: Call) => isList(c) && !c.url.includes('include_expired');
  function answers3(list: Reply, g: Reply, acct: Reply | (() => Reply)) {
    onFetch((c) => (isGate(c) ? g : isAcct(c) ? (typeof acct === 'function' ? acct() : acct) : isList(c) ? list : { status: 404, body: {} }));
  }
  it.each([
    ['all realms, the free server owned (already_claimed), nothing reports preparation: empty without free setup, never provisioning', 'all', gate({ gate_enabled: true, claim_blocked_reason: 'already_claimed' }), { kind: 'empty', freeSetup: false }],
    ['all realms, owned, gate off, an unready server and no job: empty, never provisioning', 'all', gate({ gate_enabled: false, claim_blocked_reason: 'already_claimed', has_free_server: true }), { kind: 'empty', freeSetup: false }],
    ['all realms, nothing claimed yet (can claim): empty, the free computer can be set up', 'all', gate({ gate_enabled: false, claim_blocked_reason: 'none' }), { kind: 'empty', freeSetup: true }],
    ['a realm, the free server claimed: empty (the free computer never lands in a realm)', R1, gate({ claim_blocked_reason: 'already_claimed' }), { kind: 'empty', freeSetup: false, accountComputers: true }],
    ['a realm, nothing claimed yet: empty, no free setup offered in a realm', R1, gate({ claim_blocked_reason: 'none' }), { kind: 'empty', freeSetup: false, accountComputers: true }],
    ['an empty pool with the gate off is capacity, never provisioning', 'all', gate({ gate_enabled: false, claim_blocked_reason: 'pool_empty' }), { kind: 'capacity' }],
    ['a realm keeps the account facts: mailbox', R1, gate({ claim_blocked_reason: 'mailbox_already_used' }), { kind: 'mailbox' }],
  ] as const)('%s', async (_n, realm, g, want) => {
    boot({ realm });
    answers3(rows(), g, rows({}));
    expect(await readSetupState()).toEqual(want);
  });
  it.each([
    ['no reason at all', gate({})],
    ['an unknown reason', gate({ claim_blocked_reason: 'later_reason' })],
    ['no data', { status: 200, body: {} }],
    ['an invite reason with the gate off (an answer that does not hold together)', gate({ gate_enabled: false, claim_blocked_reason: 'invite_required' })],
  ] as const)('%s rejects as unknown, never provisioning', async (_n, g) => {
    boot({ realm: 'all' });
    answers(rows(), g);
    await expect(readSetupState()).rejects.toMatchObject({ kind: 'unavailable' });
  });
  const acctPage = (r: unknown[], pagination?: unknown) => ({ status: 200, body: { data: { computers: r, ...(pagination ? { pagination } : {}) } } });
  it.each([
    ['a row on the account-wide list: true', acctPage([{}], { totalPages: 5 }), true],
    ['a whole, empty account-wide list: false', acctPage([]), false],
    ['an empty page that is not the whole list: unknown (null)', acctPage([], { totalPages: 2 }), null],
    ['a failed account-wide read: unknown (null)', { status: 500, body: {} }, null],
    ['an account-wide answer without a list: unknown (null)', { status: 200, body: { data: {} } }, null],
  ] as const)('accountComputers in a realm: %s', async (_n, acct, want) => {
    boot({ realm: R1 });
    answers3(rows(), gate({ claim_blocked_reason: 'none' }), acct);
    expect(await readSetupState()).toEqual({ kind: 'empty', freeSetup: false, accountComputers: want });
  });
  it('the account-wide read is page 1, limit 1 on the base host, made only for empty in a realm', async () => {
    boot({ realm: R1 });
    answers3(rows(), gate({ claim_blocked_reason: 'none' }), rows());
    await readSetupState();
    const acct = calls.filter(isAcct);
    expect(acct).toHaveLength(1);
    expect(acct[0]!.url.startsWith('/api/v1/computers?')).toBe(true);
    expect(acct[0]!.url).toMatch(/page=1/);
    expect(acct[0]!.url).toMatch(/limit=1(&|$)/);
    for (const [realm, g] of [['all', { claim_blocked_reason: 'none' }], ['all', { claim_blocked_reason: 'already_claimed' }], [R1, { claim_blocked_reason: 'mailbox_already_used' }]] as const) {
      boot({ realm });
      answers3(rows(), gate(g), rows({}));
      await readSetupState();
      expect(calls.filter(isAcct)).toHaveLength(0);
    }
  });
  it('a context that moves on during the account-wide read fails the read (stale)', async () => {
    boot({ realm: R1 });
    answers3(rows(), gate({ claim_blocked_reason: 'none' }), () => { bump('switch'); return rows({}); });
    await expect(readSetupState()).rejects.toMatchObject({ stale: true });
  });
  it('another account signed in during the account-wide read: the read rejects, never an empty answer', async () => {
    boot({ realm: R1 });
    answers3(rows(), gate({ claim_blocked_reason: 'none' }), () => { signIn(OTHER, 'sid0000000000002'); return rows({}); });
    await expect(readSetupState()).rejects.toMatchObject({ superseded: true });
  });
  it('the account-wide read refused unsent because the session was replaced (superseded, not stale): rejects', async () => {
    boot({ realm: R1 });
    const base = fixtureTransport(setupFixtures('empty'));
    installTransport({
      ...base,
      hoody: (m, url, body, opts, meta) => {
        if (url.includes('/computers') && !url.includes('include_expired')) { signIn(OTHER, 'sid0000000000002'); return Promise.reject({ status: 401, superseded: true }); }
        return base.hoody(m, url, body, opts, meta);
      },
    });
    await expect(readSetupState()).rejects.toMatchObject({ superseded: true });
  });
  it.each([
    ['provisioning', R1, {}, { kind: 'empty', freeSetup: false, accountComputers: false }],
    ['provisioning', 'all', {}, { kind: 'empty', freeSetup: false }],
    ['empty', 'all', {}, { kind: 'empty', freeSetup: true }],
    ['empty', R1, {}, { kind: 'empty', freeSetup: false, accountComputers: false }],
    ['empty', R1, { accountComputers: true }, { kind: 'empty', freeSetup: false, accountComputers: true }],
    ['expired', R1, {}, { kind: 'expired' }],
    ['reinstalled', R1, {}, { kind: 'reinstalled', room: 'none' }],
    ['reinstalled', 'all', {}, { kind: 'reinstalled', room: 'none' }],
    ['reinstalled', R1, { servers: true }, { kind: 'reinstalled', room: 'room' }],
    ['reinstalled', 'all', { servers: true }, { kind: 'reinstalled', room: 'room' }],
  ] as const)('setupFixtures(%s) on %s makes the read answer it', async (k, realm, o, want) => {
    boot({ realm });
    installTransport(fixtureTransport(setupFixtures(k, o)));
    expect(await readSetupState()).toEqual(want);
  });
});

describe('reinstalledOffers', () => {
  it.each([
    ['room', { create: true, rent: false }],
    ['maybe', { create: true, rent: true }],
    ['none', { create: false, rent: true }],
    [null, { create: false, rent: true }],
    [undefined, { create: false, rent: true }],
  ] as const)('%s', (room, want) => {
    expect(reinstalledOffers(room)).toEqual(want);
  });
});

describe('redeemInvite', () => {
  it('trimmed and upper-cased; empty is not sent', async () => {
    boot();
    onFetch(() => ({ status: 200, body: { data: { server: { id: 's' } } } }));
    expect(await redeemInvite('  ')).toEqual({ outcome: 'not_sent', reason: 'empty' });
    expect(calls.length).toBe(0);
    expect(await redeemInvite(' ab-12 ')).toEqual({ outcome: 'done', data: 'claimed' });
    expect(calls.find((c) => c.url.endsWith('/redeem-invite'))!.body).toEqual({ code: 'AB-12' });
  });
  it.each([
    [{ status: 200, body: { data: { claim_blocked_reason: 'pool_empty' } } }, { outcome: 'done', data: 'capacity' }],
    [{ status: 200, body: { data: {} } }, { outcome: 'done', data: 'refresh' }],
    [{ status: 403, body: { error: 'FREE_TIER_MAILBOX_ALREADY_USED' } }, { outcome: 'failed', reason: 'mailbox' }],
    [{ status: 429, body: { error: 'RATE' } }, { outcome: 'failed', reason: 'rate' }],
    [{ status: 400, body: { error: 'BAD' } }, { outcome: 'failed', reason: 'invalid' }],
    [{ status: 404, body: { error: 'X' } }, { outcome: 'failed', reason: 'generic' }],
    [{ status: 502, body: {} }, { outcome: 'pending' }],
  ] as const)('%j', async (ans, want) => {
    boot();
    onFetch(() => ans);
    expect(await redeemInvite('CODE')).toMatchObject(want);
  });
});

describe('retrySetup', () => {
  it('one a minute: a second press is not sent; the minute passes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    boot();
    onFetch(() => ({ status: 200, body: { data: { computer: { id: 'c' } } } }));
    expect(await retrySetup()).toEqual({ outcome: 'done', data: 'valid' });
    expect(await retrySetup()).toEqual({ outcome: 'not_sent', reason: 'cooldown' });
    expect(calls.filter((c) => c.url.endsWith('/retry-setup')).length).toBe(1);
    expect(retrySetupWait()).toBeGreaterThan(59000);
    vi.setSystemTime(Date.now() + 60001);
    expect(retrySetupWait()).toBe(0);
  });
  it.each([
    [{ status: 200, body: { data: { blocked_reason: 'support_required' } } }, { outcome: 'done', data: 'blocked' }],
    [{ status: 200, body: { data: { blocked_reason: 'admin_recovery_required' } } }, { outcome: 'done', data: 'blocked' }],
    [{ status: 200, body: { data: {} } }, { outcome: 'done', data: 'queued' }],
    [{ status: 403, body: { error: 'FREE_TIER_INVITE_REQUIRED' } }, { outcome: 'failed', reason: 'invite' }],
    [{ status: 403, body: { error: 'FREE_TIER_MAILBOX_ALREADY_USED' } }, { outcome: 'failed', reason: 'mailbox' }],
  ] as const)('%j', async (ans, want) => {
    boot();
    onFetch(() => ans);
    expect(await retrySetup()).toMatchObject(want);
  });
  it('home-setup: the minute belongs to the account that pressed; an account change resets it', async () => {
    boot();
    resetSetup();
    onFetch(() => ({ status: 200, body: { data: {} } }));
    expect(await retrySetup()).toMatchObject({ outcome: 'done' });
    expect(retrySetupWait()).toBeGreaterThan(0);
    bump('switch');
    expect(retrySetupWait()).toBeGreaterThan(0);
    bump('account');
    expect(retrySetupWait()).toBe(0);
    expect(await retrySetup()).toMatchObject({ outcome: 'done' });
    expect(calls.filter((c) => c.url.endsWith('/retry-setup')).length).toBe(2);
  });
  it('a lost answer keeps the minute (pending); a request that never went out releases it', async () => {
    boot();
    onFetch(() => ({ status: 0, body: {}, network: true }));
    expect(await retrySetup()).toMatchObject({ outcome: 'pending' });
    expect(retrySetupWait()).toBeGreaterThan(0);
    resetSetup();
    localStorage.clear(); // signed out: nothing can be sent
    expect(await retrySetup()).toMatchObject({ outcome: 'not_sent' });
    expect(retrySetupWait()).toBe(0);
  });
});
