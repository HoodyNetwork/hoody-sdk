// otp.test.tsx: the 2FA step-up prompt and its use by changes, secret mints and mutations.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api, onPending, outcomeOf, setOtpPrompt, type PendingNotice } from './api';
import { FIXTURE_OTP_CODE, otpCancelled, otpGate, otpPrompt, otpState, submitOtp, cancelOtp, useOtpPrompt } from './otp';
import { defineMutation, queryClient } from './query';
import { switchTo } from './realm';
import { defineRoute } from './routes';
import { mintSecret } from './secret';
import { boot, calls, onFetch, R1, R2, settle } from './test/env';
import type { FixtureRequest } from './transport';

const change = defineRoute<{ ok?: number }, { name: string }>({ method: 'POST', path: '/auth/tokens/rename', scope: 'base', body: ['name'] });
const read = defineRoute<{ ok?: number }>({ method: 'GET', path: '/auth/tokens', scope: 'base' });
const mint = defineRoute<{ data?: { token?: string } }, { name: string }>({ method: 'POST', path: '/auth/tokens', scope: 'base', body: ['name'], secret: true, codes: ['NAME_TAKEN'] });
const SECRET = 'hoody_tok_' + 'a'.repeat(32);

const settled = <T,>(p: Promise<T>) => p.then((v) => ({ ok: v, e: undefined as unknown }), (e: unknown) => ({ ok: undefined, e }));
const otpUntil = (code: string, ok: unknown) => onFetch((c) => (c.body && c.body.otp_code === code ? { status: 200, body: ok } : { status: 403, body: { error: 'OTP_REQUIRED' } }));
const useStore = () => setOtpPrompt(otpPrompt);
async function untilOpen(): Promise<void> { for (let i = 0; i < 50 && !otpState().open; i++) await settle(); }

describe('the prompt state', () => {
  it('ask opens, submit answers the trimmed code and checks until settled, then closes; each prompt has a new id', async () => {
    boot();
    const p = otpPrompt.ask();
    expect(otpState()).toEqual({ open: true, id: 1, retry: false, checking: false });
    submitOtp('  123456 ');
    expect(await p).toBe('123456');
    expect(otpState()).toEqual({ open: true, id: 1, retry: false, checking: true });
    otpPrompt.settle?.();
    expect(otpState()).toEqual({ open: false, id: 1, retry: false, checking: false });
    const q = otpPrompt.ask();
    expect(otpState().id).toBe(2);
    cancelOtp();
    expect(await q).toBeNull();
  });
  it('a blank code is a cancel', async () => {
    boot();
    const p = otpPrompt.ask();
    submitOtp('   ');
    expect(await p).toBeNull();
    expect(otpState().open).toBe(false);
  });
  it('one prompt at a time: a second ask answers null at once and leaves the first open', async () => {
    boot();
    const first = otpPrompt.ask();
    expect(await otpPrompt.ask()).toBeNull();
    expect(otpState()).toEqual({ open: true, id: 1, retry: false, checking: false });
    submitOtp('1');
    expect(await first).toBe('1');
  });
  it('submit or cancel with no prompt open changes nothing', () => {
    boot();
    submitOtp('1');
    cancelOtp();
    otpPrompt.settle?.();
    expect(otpState()).toEqual({ open: false, id: 0, retry: false, checking: false });
  });
  it('while checking another change is not asked; cancel closes the dialog; the retry ask reopens with retry', async () => {
    boot();
    const p = otpPrompt.ask();
    submitOtp('1');
    await p;
    expect(await otpPrompt.ask()).toBeNull();
    const again = otpPrompt.ask({ retry: true });
    expect(otpState()).toEqual({ open: true, id: 2, retry: true, checking: false });
    submitOtp('2');
    expect(await again).toBe('2');
    expect(otpState()).toMatchObject({ open: true, retry: true, checking: true });
    cancelOtp();
    expect(otpState()).toEqual({ open: false, id: 2, retry: false, checking: false });
  });
  it('useOtpPrompt renders open while asked and closes on submit', async () => {
    boot();
    const seen: boolean[] = [];
    let api2: ReturnType<typeof useOtpPrompt> | null = null;
    function Probe() { const s = useOtpPrompt(); api2 = s; seen.push(s.open); return null; }
    render(<Probe />);
    let p!: Promise<string | null>;
    act(() => { p = otpPrompt.ask(); });
    expect(seen.at(-1)).toBe(true);
    act(() => { api2!.submit('42'); });
    expect(await p).toBe('42');
    expect(api2!.checking).toBe(true);
    act(() => { otpPrompt.settle?.(); });
    expect(seen.at(-1)).toBe(false);
  });
});

describe('changes through the default prompt', () => {
  it('OTP_REQUIRED opens the prompt; the code is sent with the retry; a wrong code asks again', async () => {
    boot({ realm: R1 });
    useStore();
    otpUntil('222222', { ok: 1 });
    const p = api(change, { body: { name: 'x' } });
    await untilOpen();
    expect(otpState()).toMatchObject({ retry: false, checking: false });
    submitOtp('111111');
    expect(otpState()).toMatchObject({ open: true, checking: true });
    for (let i = 0; i < 50 && otpState().id < 2; i++) await settle();
    expect(otpState()).toMatchObject({ open: true, id: 2, retry: true, checking: false });
    submitOtp('222222');
    expect(await p).toEqual({ ok: 1 });
    expect(calls.map((c) => c.body.otp_code)).toEqual([undefined, '111111', '222222']);
    expect(otpState()).toMatchObject({ open: false, checking: false, retry: false });
  });
  it('a code whose change then fails another way settles the check and closes', async () => {
    boot({ realm: R1 });
    useStore();
    onFetch((c) => (c.body && c.body.otp_code ? { status: 409, body: { error: 'NAME_TAKEN' } } : { status: 403, body: { error: 'OTP_REQUIRED' } }));
    const p = settled(api(change, { body: { name: 'x' } }));
    await untilOpen();
    submitOtp('1');
    await p;
    expect(otpState()).toMatchObject({ open: false, checking: false });
  });
  it('Cancel: rejected cancelled, nothing applied, no pending notice; otpCancelled says so', async () => {
    boot({ realm: R1 });
    useStore();
    const notices: PendingNotice[] = [];
    const off = onPending((n) => notices.push(n));
    otpUntil('x', {});
    const p = settled(api(change, { body: { name: 'x' } }));
    await untilOpen();
    cancelOtp();
    const { e } = await p;
    off();
    expect(otpCancelled(e)).toBe(true);
    expect(outcomeOf(e, true)).toBe('failed');
    expect(notices).toEqual([]);
    expect(calls.length).toBe(1);
  });
  it('a realm switch closes the open prompt without an answer: no retry, and the change that went out is pending', async () => {
    boot({ realm: R1 });
    useStore();
    otpUntil('x', {});
    const p = settled(api(change, { body: { name: 'x' } }));
    await untilOpen();
    onFetch((c) => (c.url.includes('/auth/tokens/rename') ? { status: 403, body: { error: 'OTP_REQUIRED' } } : { status: 200, body: { data: {} } }));
    await switchTo(R2);
    expect(otpState().open).toBe(false);
    const { e } = await p;
    expect(otpCancelled(e)).toBe(false);
    expect(outcomeOf(e, true)).toBe('pending');
    expect(calls.filter((c) => c.url.includes('/auth/tokens/rename')).length).toBe(1);
  });
  it('reads never ask', async () => {
    boot({ realm: R1 });
    useStore();
    onFetch(() => ({ status: 403, body: { error: 'OTP_REQUIRED' } }));
    const { e } = await settled(api(read));
    expect(otpState()).toMatchObject({ open: false, id: 0 });
    expect(otpCancelled(e)).toBe(false);
  });
});

describe('secret mints behind 2FA', () => {
  it('the code goes with the retry and the secret is held; the cancelled rejection is bare', async () => {
    boot({ realm: R1 });
    useStore();
    otpUntil('123456', { data: { token: SECRET } });
    const p = mintSecret(mint, { body: { name: 'a' } }, (r) => r.data?.token);
    await untilOpen();
    submitOtp('123456');
    const { held } = await p;
    expect(held?.reveal(held.ctx)).toBe(SECRET);
    held?.drop();

    otpUntil('never', {});
    const q = settled(mintSecret(mint, { body: { name: 'b' } }, (r) => r.data?.token));
    await untilOpen();
    cancelOtp();
    const { e } = await q;
    // Sent once, so not marked not_sent; the cancel alone says nothing was applied (no server code kept).
    expect(e).toEqual({ code: null, cancelled: true, route: 'POST /auth/tokens' });
    expect(otpCancelled(e)).toBe(true);
  });
});

describe('mutations: a cancelled prompt never locks the form', () => {
  it('the hook result is failed with a cancelled error, and the next run sends again', async () => {
    boot({ realm: R1 });
    useStore();
    const rename = defineMutation(change, { input: (name: string) => ({ body: { name } }) });
    otpUntil('7', { ok: 1 });
    let hook: ReturnType<typeof rename.use> | null = null;
    function Probe() { hook = rename.use(); return null; }
    render(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>);
    let r1!: Promise<unknown>;
    act(() => { r1 = hook!.run('a'); });
    await act(async () => { await untilOpen(); cancelOtp(); });
    const res1 = (await r1) as { outcome: string; error?: unknown };
    expect(res1.outcome).toBe('failed');
    expect(otpCancelled(res1.error)).toBe(true);
    let r2!: Promise<unknown>;
    act(() => { r2 = hook!.run('b'); });
    await act(async () => { await untilOpen(); submitOtp('7'); });
    expect(((await r2) as { outcome: string }).outcome).toBe('done');
  });
});

describe('otpGate (fixtures)', () => {
  const req = (body: unknown): FixtureRequest => ({ route: change, method: 'POST', path: '/auth/tokens/rename', query: {}, body, target: null, n: 1 });
  it('OTP_REQUIRED until the body carries the fixture code, then the answer', async () => {
    const g = otpGate({ status: 200, body: { ok: 1 } });
    const call = (b: unknown) => (typeof g === 'function' ? g(req(b)) : g);
    expect(await call({ name: 'x' })).toEqual({ status: 403, body: { error: 'OTP_REQUIRED' } });
    expect(await call({ name: 'x', otp_code: '000000' })).toEqual({ status: 403, body: { error: 'OTP_REQUIRED' } });
    expect(await call({ name: 'x', otp_code: FIXTURE_OTP_CODE })).toEqual({ status: 200, body: { ok: 1 } });
    expect(await call(null)).toEqual({ status: 403, body: { error: 'OTP_REQUIRED' } });
  });
});

describe('fixture mode', () => {
  it('otpGate sees the code of the retry: the change goes through after the right code', async () => {
    const t = (await import('./fixture-boot')).bootFixtureCore();
    t.setRules([{ route: change, answer: otpGate({ body: { ok: 1 } }) } as never]);
    useStore();
    const p = api(change, { body: { name: 'x' } });
    await untilOpen();
    submitOtp(FIXTURE_OTP_CODE);
    expect(await p).toEqual({ ok: 1 });
  });
});
