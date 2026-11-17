// Vitest: where the focus goes in the password + code drawer, case by case (what was refused, what was typed since).
import { queryClient } from '@core';
import { boot, onFetch, settle, signIn } from '@core/test/env';
// eslint-disable-next-line no-restricted-imports -- test harness
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- test harness
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeSheet } from './parts/CodeSheet';
import { locks } from './parts/locks';
import strings from './strings.en.json';

const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: ['/account'] }) });
const wrap = ({ children }: { children: ReactNode }) => (
  <RouterContextProvider router={router}>
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  </RouterContextProvider>
);
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const fresh = () => {
  boot(); signIn(); queryClient.clear(); locks.clear();
  onFetch(() => ({ status: 200, body: { data: { enabled: true, verified: true, backup_codes_remaining: 8, require_for_tokens: false } } }));
};
afterEach(cleanup);
const press = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Go' })); await flush(); }); };
const describedBy = (el: HTMLElement): string =>
  (el.getAttribute('aria-describedby') ?? '').split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
const PW = 'Typed-Passw0rd-XYZ';
const CODE = '654321';

type Ans = { outcome: string; status?: number; code?: string; retryAfter?: number };
const open = async (ans: Ans | Ans[], backupOk = true) => {
  fresh();
  const list = Array.isArray(ans) ? [...ans] : null;
  const send = vi.fn(async () => (list ? list.shift() ?? { outcome: 'failed' } : ans));
  const r = render(
    <CodeSheet resizeKey="test-twofa-focus" open onClose={() => undefined} title="T" lead="lead" confirm="Go" op={backupOk ? 'off' : 'codes'} backupOk={backupOk}
      send={send as never} readBack={async () => false} onDone={() => undefined} />, { wrapper: wrap });
  await act(flush);
  const pw = () => screen.getByLabelText(strings['pw.current']) as HTMLInputElement;
  const code = () => (backupOk ? screen.getByLabelText(strings['2fa.codeOrBackup']) : (document.querySelector('input[autocomplete="one-time-code"]') ?? document.querySelector('input[inputmode="numeric"]'))) as HTMLInputElement;
  const fill = (p: string, c: string) => {
    fireEvent.change(pw(), { target: { value: p } });
    fireEvent.change(code(), { target: { value: c } });
  };
  return { send, pw, code, fill, r };
};
const go = async () => { screen.getByRole('button', { name: 'Go' }).focus(); await press(); };

describe('what a refusal blames: backup-capable drawer (Turn off / gate off)', () => {
  it('401 that names nothing: password refused, focus on the password, code not blamed', async () => {
    const s = await open({ outcome: 'failed', status: 401 });
    s.fill(PW, CODE); await go();
    expect(s.send).toHaveBeenCalledTimes(1);
    expect(s.pw()).toHaveAttribute('aria-invalid', 'true');
    expect(describedBy(s.pw())).toContain(strings['err.password']);
    expect(s.code()).not.toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(s.pw());
  });
  it('code refused by name: focus on the code, password not blamed', async () => {
    const s = await open({ outcome: 'failed', status: 401, code: 'INVALID_OTP_CODE' });
    s.fill(PW, CODE); await go();
    expect(s.code()).toHaveAttribute('aria-invalid', 'true');
    expect(describedBy(s.code())).toContain(strings['err.code']);
    expect(s.pw()).not.toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(s.code());
  });
  it('neither refused (429): a banner with minutes, no field blamed, the focus in no field by an error', async () => {
    const s = await open({ outcome: 'failed', status: 429, retryAfter: 900 });
    s.fill(PW, CODE); await go();
    expect(screen.getByText(strings['err.tooManyWait_other'].replace('{{count}}', '15'))).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/900|RATE|429/);
    expect(s.pw()).not.toHaveAttribute('aria-invalid', 'true');
    expect(s.code()).not.toHaveAttribute('aria-invalid', 'true');
  });
  it('what was typed is wiped after a refusal and is in no text', async () => {
    const s = await open({ outcome: 'failed', status: 401 });
    s.fill(PW, CODE); await go();
    expect(s.pw().value).toBe(''); expect(s.code().value).toBe('');
    expect(document.body.textContent).not.toContain(PW);
    expect(document.body.textContent).not.toContain(CODE);
  });
  it('no theft: after the password was refused, typing in the code field keeps the focus there', async () => {
    const s = await open({ outcome: 'failed', status: 401 });
    s.fill(PW, CODE); await go();
    expect(document.activeElement).toBe(s.pw());
    s.code().focus();
    await act(async () => { fireEvent.change(s.code(), { target: { value: '1' } }); fireEvent.change(s.code(), { target: { value: '12' } }); await flush(); });
    expect(document.activeElement).toBe(s.code());
    // and the other way: typing the password while both are marked
  });
  it('no theft: both empty -> focus password; typing the password does not jump to the code', async () => {
    const s = await open({ outcome: 'failed', status: 401 });
    await go();
    expect(document.activeElement).toBe(s.pw());
    await act(async () => { fireEvent.change(s.pw(), { target: { value: 'a' } }); fireEvent.change(s.pw(), { target: { value: 'ab' } }); await flush(); });
    expect(document.activeElement).toBe(s.pw());
  });
  it('SEQ both empty, then the password typed and sent with the code still missing: the focus goes to the code', async () => {
    const s = await open({ outcome: 'failed', status: 401 });
    await go();
    fireEvent.change(s.pw(), { target: { value: PW } });
    await go();
    expect(s.send).not.toHaveBeenCalled();
    expect(s.pw()).not.toHaveAttribute('aria-invalid', 'true');
    expect(s.code()).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(s.code());
  });
  it('SEQ wrong password twice: the focus goes to the password both times', async () => {
    const s = await open([{ outcome: 'failed', status: 401 }, { outcome: 'failed', status: 401 }]);
    s.fill(PW, CODE); await go();
    expect(document.activeElement).toBe(s.pw());
    s.fill(PW, CODE); await go();
    expect(s.send).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(s.pw());
  });
  it('SEQ wrong password, then wrong code: the focus follows to the code', async () => {
    const s = await open([{ outcome: 'failed', status: 401 }, { outcome: 'failed', status: 401, code: 'INVALID_OTP_CODE' }]);
    s.fill(PW, CODE); await go();
    s.fill(PW, CODE); await go();
    expect(s.pw()).not.toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(s.code());
  });
});

describe('what a refusal blames: six-digit drawer (New backup codes)', () => {
  it('both empty: focus on the password', async () => {
    const s = await open({ outcome: 'failed', status: 401 }, false);
    await go();
    expect(s.send).not.toHaveBeenCalled();
    expect(s.pw()).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(s.pw());
  });
  it('401 that names nothing: focus on the password', async () => {
    const s = await open({ outcome: 'failed', status: 401 }, false);
    s.fill(PW, CODE); await go();
    expect(s.send).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(s.pw());
  });
  it('OTP code refused by name: the code field says so', async () => {
    const s = await open({ outcome: 'failed', status: 401, code: 'INVALID_OTP_CODE' }, false);
    s.fill(PW, CODE); await go();
    expect(screen.getByText(strings['err.code'])).toBeInTheDocument();
    expect(s.pw()).not.toHaveAttribute('aria-invalid', 'true');
  });
  it('OTP code refused by name: the focus goes to the code field', async () => {
    const s = await open({ outcome: 'failed', status: 401, code: 'INVALID_OTP_CODE' }, false);
    s.fill(PW, CODE); await go();
    expect(document.activeElement).toBe(s.code());
  });
});

// The three drawers as the page builds them (view.tsx), with an answer that arrives later, as a server's does: the
// six-digit field empties itself one task after the submit, while the answer is still out.
type Drawer = { name: string; op: 'off' | 'codes' | 'gate'; backupOk: boolean; repeatRisk?: boolean };
const TURN_OFF: Drawer = { name: 'Turn off', op: 'off', backupOk: true };
const DRAWERS: readonly Drawer[] = [
  TURN_OFF,
  { name: 'New backup codes', op: 'codes', backupOk: false, repeatRisk: true },
  { name: 'Key gate off', op: 'gate', backupOk: true },
];
const later = () => {
  const queue: Array<() => void> = [];
  const send = vi.fn(() => new Promise<Ans>((resolve) => { queue.push(() => resolve(next.ans)); }));
  const next: { ans: Ans } = { ans: { outcome: 'failed' } };
  return { send, arrive: async (ans: Ans) => { next.ans = ans; await act(async () => { queue.shift()?.(); await flush(); }); } };
};
const openDrawer = async (d: Drawer) => {
  fresh();
  const s = later();
  render(
    <CodeSheet resizeKey="test-twofa-focus-drawer" open onClose={() => undefined} title="T" lead="lead" confirm="Go" op={d.op}
      backupOk={d.backupOk} repeatRisk={d.repeatRisk} send={s.send as never} readBack={async () => false} onDone={() => undefined} />, { wrapper: wrap });
  await act(flush);
  const pw = () => screen.getByLabelText(strings['pw.current']) as HTMLInputElement;
  const code = () => screen.getByLabelText(strings[d.backupOk ? '2fa.codeOrBackup' : '2fa.code']) as HTMLInputElement;
  const fill = () => {
    fireEvent.change(pw(), { target: { value: PW } });
    fireEvent.change(code(), { target: { value: CODE } });
  };
  return { ...s, pw, code, fill };
};

describe('each drawer, the answer arriving later', () => {
  for (const d of DRAWERS) {
    it(`${d.name}: both empty, the focus goes to the password and no code error is shown yet`, async () => {
      const s = await openDrawer(d);
      await go();
      expect(s.send).not.toHaveBeenCalled();
      expect(s.pw()).toHaveAttribute('aria-invalid', 'true');
      expect(describedBy(s.pw())).toContain(strings['pw.eCurrent']);
      expect(s.code()).not.toHaveAttribute('aria-invalid', 'true');
      expect(document.activeElement).toBe(s.pw());
    });
    it(`${d.name}: a wrong password with nothing typed meanwhile takes the focus to the password`, async () => {
      const s = await openDrawer(d);
      s.fill(); await go();
      expect(s.send).toHaveBeenCalledTimes(1);
      await s.arrive({ outcome: 'failed', status: 401 });
      expect(s.pw()).toHaveAttribute('aria-invalid', 'true');
      expect(describedBy(s.pw())).toContain(strings['err.password']);
      expect(document.activeElement).toBe(s.pw());
      expect(s.pw().value).toBe(''); expect(s.code().value).toBe('');
    });
    it(`${d.name}: a pending answer empties what was typed while it was out`, async () => {
      const s = await openDrawer(d);
      s.fill(); await go();
      s.pw().focus();
      fireEvent.change(s.pw(), { target: { value: 'typed-while-out' } });
      await s.arrive({ outcome: 'pending' });
      expect(s.pw().value).toBe('');
      expect(s.pw()).toBeDisabled();
      expect(document.body.textContent).not.toContain('typed-while-out');
    });
  }
  it('Turn off: a wrong password while the code was being typed, then Enter with the password empty: the focus goes to the password', async () => {
    const s = await openDrawer(TURN_OFF);
    s.fill(); await go();
    s.code().focus();
    fireEvent.change(s.code(), { target: { value: '111222' } });
    await s.arrive({ outcome: 'failed', status: 401 });
    // The password was refused while the person typed in the code field: the focus stayed there.
    expect(document.activeElement).toBe(s.code());
    expect(describedBy(s.pw())).toContain(strings['err.password']);
    await act(async () => { fireEvent.submit(s.code().closest('form')!); await flush(); });
    expect(s.send).toHaveBeenCalledTimes(1);
    expect(describedBy(s.pw())).toContain(strings['pw.eCurrent']);
    expect(document.activeElement).toBe(s.pw());
  });
  it('Turn off: a code refused by name, then sent again from the button with no code: the focus goes back to the code', async () => {
    const s = await openDrawer(TURN_OFF);
    s.fill(); await go();
    await s.arrive({ outcome: 'failed', status: 401, code: 'INVALID_OTP_CODE' });
    expect(document.activeElement).toBe(s.code());
    expect(s.code().value).toBe('');
    fireEvent.change(s.pw(), { target: { value: PW } });
    await go();
    expect(s.send).toHaveBeenCalledTimes(1);
    expect(describedBy(s.code())).toContain(strings['2fa.eCode']);
    expect(document.activeElement).toBe(s.code());
  });
});
