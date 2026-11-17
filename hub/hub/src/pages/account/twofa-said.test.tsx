// Vitest: what the account drawers say and where the focus goes after a refusal.
//   - A wrong password on Turn off / New backup codes / the key gate: the sentence is the password field's own
//     description and the focus moves into that field, so it is read out.
//   - The set-up's first step refused with a plain 400: the sentence claims nothing about the account ("If you sign in
//     with GitHub or Google only..."), and when the status could not be read again it is the general sentence.
//   - Too many tries on an email change, a password change and the key gate says the wait in minutes when the answer
//     named one.
import { queryClient } from '@core';
import { boot, onFetch, settle, signIn } from '@core/test/env';
// eslint-disable-next-line no-restricted-imports -- a test harness for the hooks, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router for a part rendered without its page (a link in it reads the location), not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import { CodeSheet } from './parts/CodeSheet';
import { EmailSheet } from './parts/EmailSheet';
import { PasswordSheet } from './parts/PasswordSheet';
import { SetupSheet } from './parts/SetupSheet';
import { TwoFactorSection } from './parts/TwoFactorSection';
import { locks } from './parts/locks';
import strings from './strings.en.json';

type Answer = { outcome: string; code?: string; status?: number; retryAfter?: number };
const next = vi.hoisted(() => ({ setup: { outcome: 'failed' } as Answer, email: { outcome: 'failed' } as Answer, password: { outcome: 'failed' } as Answer, gate: { outcome: 'failed' } as Answer }));
vi.mock('./data', async (orig) => {
  const data = await orig<typeof Data>();
  return {
    ...data,
    useStartSetup: () => ({ ...data.useStartSetup(), pending: false, running: false, run: async () => ({ ...next.setup }) }),
    useEmailStart: () => ({ ...data.useEmailStart(), pending: false, running: false, run: async () => ({ ...next.email }) }),
    useChangePassword: () => ({ ...data.useChangePassword(), pending: false, running: false, run: async () => ({ ...next.password }) }),
    useSetGate: () => ({ ...data.useSetGate(), pending: false, running: false, run: async () => ({ ...next.gate }) }),
  };
});

const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: ['/account'] }) });
const wrap = ({ children }: { children: ReactNode }) => (
  <RouterContextProvider router={router}>
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  </RouterContextProvider>
);
const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};
const STATUS = /\/users\/auth\/2fa\/status(\?|$)/;
const statusDown = { on: false };
const fresh = (enabled = false) => {
  boot();
  signIn();
  queryClient.clear();
  locks.clear();
  statusDown.on = false;
  onFetch((c) =>
    STATUS.test(c.url)
      ? statusDown.on
        ? { status: 500, body: { error: 'INTERNAL', message: 'down' } }
        : { status: 200, body: { data: { enabled, verified: enabled, backup_codes_remaining: 8, require_for_tokens: false } } }
      : { status: 200, body: { data: { id: 'u', username: 'ada', alias: 'Ada', email: 'ada@example.com' } } },
  );
};
afterEach(cleanup);

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
    await flush();
  });
};
const WAIT_15 = strings['err.tooManyWait_other'].replace('{{count}}', '15');
/** The words an input is described by (its help and its error line). */
const describedBy = (el: HTMLElement): string =>
  (el.getAttribute('aria-describedby') ?? '').split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ');

describe('a wrong password on the password + code drawer', () => {
  it('is the password field\'s own description, and the focus moves into that field', async () => {
    fresh(true);
    render(
      <CodeSheet resizeKey="test-twofa-said" open onClose={() => undefined} title="Turn off" lead="lead" confirm="Go" op="off" backupOk
        send={async () => ({ outcome: 'failed', status: 401 }) as never} readBack={async () => false} onDone={() => undefined} />,
      { wrapper: wrap },
    );
    await act(flush);
    type(strings['pw.current'], 'not-my-password');
    type(strings['2fa.codeOrBackup'], '123456');
    // As a person does it: the focus is on the button when it is pressed.
    screen.getByRole('button', { name: 'Go' }).focus();
    await press('Go');
    const field = screen.getByLabelText(strings['pw.current']);
    expect(describedBy(field)).toContain(strings['err.password']);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(field);
  });
});

describe('the password + code drawer sent with both fields empty', () => {
  it('the password says what is missing and takes the focus; the code says so once the password is filled', async () => {
    fresh(true);
    const send = vi.fn();
    render(
      <CodeSheet resizeKey="test-twofa-said-empty" open onClose={() => undefined} title="Turn off" lead="lead" confirm="Go" op="off" backupOk
        send={send as never} readBack={async () => false} onDone={() => undefined} />,
      { wrapper: wrap },
    );
    await act(flush);
    screen.getByRole('button', { name: 'Go' }).focus();
    await press('Go');
    expect(send).not.toHaveBeenCalled();
    const password = screen.getByLabelText(strings['pw.current']);
    const code = screen.getByLabelText(strings['2fa.codeOrBackup']);
    expect(password).toHaveAttribute('aria-invalid', 'true');
    // One refused field at a time: the code's error waits, so that it is new, and takes the focus, when its turn comes.
    expect(code).not.toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(password);
    fireEvent.change(password, { target: { value: 'a-password-typed' } });
    screen.getByRole('button', { name: 'Go' }).focus();
    await press('Go');
    expect(send).not.toHaveBeenCalled();
    expect(password).not.toHaveAttribute('aria-invalid', 'true');
    expect(code).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(code);
  });

  it('only the code missing: the focus goes to the code', async () => {
    fresh(true);
    render(
      <CodeSheet resizeKey="test-twofa-said-code" open onClose={() => undefined} title="Turn off" lead="lead" confirm="Go" op="off" backupOk
        send={(async () => ({ outcome: 'failed' })) as never} readBack={async () => false} onDone={() => undefined} />,
      { wrapper: wrap },
    );
    await act(flush);
    type(strings['pw.current'], 'my-password-here');
    screen.getByRole('button', { name: 'Go' }).focus();
    await press('Go');
    expect(document.activeElement).toBe(screen.getByLabelText(strings['2fa.codeOrBackup']));
  });
});

describe('a refusal that arrives while the person types in the other field', () => {
  // The answer is held until the test lets it go, as a slow server would.
  const slow = (answer: Answer) => {
    let go: () => void = () => undefined;
    const send = () => new Promise<Answer>((resolve) => { go = () => resolve(answer); });
    return { send, arrive: async () => { await act(async () => { go(); await flush(); }); } };
  };
  const open = async (send: () => Promise<Answer>) => {
    fresh(true);
    render(
      <CodeSheet resizeKey="test-twofa-said-slow" open onClose={() => undefined} title="Turn off" lead="lead" confirm="Go" op="off" backupOk
        send={send as never} readBack={async () => false} onDone={() => undefined} />,
      { wrapper: wrap },
    );
    await act(flush);
    type(strings['pw.current'], 'not-my-password');
    type(strings['2fa.codeOrBackup'], '123456');
    screen.getByRole('button', { name: 'Go' }).focus();
    await press('Go');
  };

  it('a wrong password: the focus stays in the code field and what was typed there stays', async () => {
    const s = slow({ outcome: 'failed', status: 401 });
    await open(s.send);
    const code = screen.getByLabelText(strings['2fa.codeOrBackup']);
    code.focus();
    fireEvent.change(code, { target: { value: '13579' } });
    await s.arrive();
    const password = screen.getByLabelText(strings['pw.current']);
    expect(document.activeElement).toBe(code);
    expect(code).toHaveValue('13579');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(describedBy(password)).toContain(strings['err.password']);
  });

  it('a wrong code: the focus stays in the password field the person is typing in', async () => {
    const s = slow({ outcome: 'failed', status: 401, code: 'INVALID_OTP_CODE' });
    await open(s.send);
    const password = screen.getByLabelText(strings['pw.current']);
    password.focus();
    fireEvent.change(password, { target: { value: 'my-real-pass' } });
    await s.arrive();
    expect(document.activeElement).toBe(password);
    expect(password).toHaveValue('my-real-pass');
    expect(screen.getByLabelText(strings['2fa.codeOrBackup'])).toHaveAttribute('aria-invalid', 'true');
  });

  it('nothing typed meanwhile (Enter in the code field sent it): the focus goes to the refused password', async () => {
    const s = slow({ outcome: 'failed', status: 401 });
    await open(s.send);
    screen.getByLabelText(strings['2fa.codeOrBackup']).focus();
    await s.arrive();
    expect(document.activeElement).toBe(screen.getByLabelText(strings['pw.current']));
  });
});

describe('the set-up drawer, step 1 refused with a plain 400', () => {
  const start = async (o: { readFails: boolean }) => {
    fresh(false);
    next.setup = { outcome: 'failed', status: 400 };
    render(<SetupSheet open onClose={() => undefined} onOn={() => undefined} />, { wrapper: wrap });
    await act(flush);
    type(strings['pw.current'], 'a-long-enough-password');
    statusDown.on = o.readFails;
    await press(strings['2fa.next']);
  };

  it('claims nothing about the account: it may have no password, said as "if"', async () => {
    await start({ readFails: false });
    expect(strings['err.noPassword']).toMatch(/^That didn't work\. If you /);
    expect(strings['err.noPassword']).not.toMatch(/this account has none/);
    expect(screen.getByText(strings['err.noPassword'])).toBeInTheDocument();
  });

  it('the status could not be read again: the general sentence, nothing about passwords', async () => {
    await start({ readFails: true });
    expect(screen.getByText(strings['err.generic'])).toBeInTheDocument();
    expect(screen.queryByText(strings['err.noPassword'])).toBeNull();
  });
});

describe('too many tries says the wait the answer named', () => {
  it('an email change', async () => {
    fresh(true);
    next.email = { outcome: 'failed', status: 429, retryAfter: 900 };
    render(<EmailSheet open onClose={() => undefined} onSent={() => undefined} />, { wrapper: wrap });
    await act(flush);
    type(strings['e.new'], 'new@example.com');
    type(strings['e.password'], 'my-password-here');
    await press(strings['e.send']);
    expect(screen.getByText(WAIT_15)).toBeInTheDocument();
    expect(screen.queryByText(strings['err.tooMany'])).toBeNull();
  });

  it('a password change; with no wait named the short sentence stays', async () => {
    const run = async (a: Answer) => {
      fresh(true);
      next.password = a;
      render(<PasswordSheet open onClose={() => undefined} onChanged={() => undefined} onUnsure={() => undefined} />, { wrapper: wrap });
      await act(flush);
      type(strings['pw.current'], 'Old-password-1234');
      type(strings['pw.new'], 'New-password-5678');
      type(strings['pw.again'], 'New-password-5678');
      await press(strings['pw.save']);
    };
    await run({ outcome: 'failed', status: 429, retryAfter: 900 });
    expect(screen.getByText(WAIT_15)).toBeInTheDocument();
    cleanup();
    await run({ outcome: 'failed', status: 429 });
    expect(screen.getByText(strings['err.tooMany'])).toBeInTheDocument();
  });

  it('the key gate switched on', async () => {
    fresh(true);
    next.gate = { outcome: 'failed', status: 429, retryAfter: 900 };
    render(<TwoFactorSection onOpen={() => undefined} />, { wrapper: wrap });
    await act(flush);
    await act(async () => {
      fireEvent.click(await screen.findByRole('switch', { name: strings['2fa.gateSwitch'] }));
      await flush();
    });
    expect(await screen.findByText(WAIT_15)).toBeInTheDocument();
    expect(screen.queryByText(strings['err.tooMany'])).toBeNull();
  });
});
