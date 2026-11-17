// Vitest: what the account page's 2FA drawers say when a change is refused.
//   - A plain 401 on a change that asks the password again can only be the password (a wrong code has its own code):
//     the sentence goes under the password field, never into a "password or code" banner.
//   - A lockout says its wait in minutes when the answer named one.
//   - A code typed with spaces or hyphens is sent without them; a backup code keeps its letters.
//   - Turning 2FA on for an account that has no password (it signs in with GitHub or Google) says to set one first;
//     a set-up the server no longer has says to start again, over a status read again.
//   - Cancel on the code prompt during an email change says nothing.
import { queryClient } from '@core';
import { boot, calls, onFetch, settle, signIn } from '@core/test/env';
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
import { SetupSheet } from './parts/SetupSheet';
import { locks } from './parts/locks';
import strings from './strings.en.json';

type Answer = { outcome: string; code?: string; status?: number; retryAfter?: number; cancelled?: true; data?: unknown };
const next = vi.hoisted(() => ({ setup: { outcome: 'failed' } as Answer, verify: { outcome: 'failed' } as Answer, email: { outcome: 'failed' } as Answer }));
vi.mock('./data', async (orig) => {
  const data = await orig<typeof Data>();
  return {
    ...data,
    useStartSetup: () => ({ ...data.useStartSetup(), pending: false, running: false, run: async () => ({ ...next.setup }) }),
    useVerifySetup: () => ({ ...data.useVerifySetup(), pending: false, running: false, run: async () => ({ ...next.verify }) }),
    useEmailStart: () => ({ ...data.useEmailStart(), pending: false, running: false, run: async () => ({ ...next.email }) }),
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
const statusReads = (): number => calls.filter((c) => c.method === 'GET' && STATUS.test(c.url)).length;
const fresh = (enabled = false) => {
  boot();
  signIn();
  queryClient.clear();
  locks.clear();
  onFetch((c) =>
    STATUS.test(c.url)
      ? { status: 200, body: { data: { enabled, verified: enabled, backup_codes_remaining: 8, require_for_tokens: false } } }
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

async function codeSheet(answer: Answer, o: { backupOk?: boolean; code?: string } = {}) {
  fresh(true);
  const sent: Array<{ password: string; code: string }> = [];
  render(
    <CodeSheet resizeKey="test-twofa-sheets" open onClose={() => undefined} title="Turn off" lead="lead" confirm="Go" op="off" backupOk={o.backupOk ?? true}
      send={async (password, code) => { sent.push({ password, code }); return answer as never; }} readBack={async () => false} onDone={() => undefined} />,
    { wrapper: wrap },
  );
  await act(flush);
  type(strings['pw.current'], 'not-my-password');
  type(strings['2fa.codeOrBackup'], o.code ?? '123456');
  await press('Go');
  return sent;
}

describe('the password + code drawer', () => {
  it('a plain 401 is the password: said under the password field, no banner', async () => {
    await codeSheet({ outcome: 'failed', status: 401 });
    expect(screen.getByText(strings['err.password'])).toBeInTheDocument();
    expect(screen.queryByText(strings['sheet.failedTitle'])).toBeNull();
    expect(screen.queryByText(/password or the code/)).toBeNull();
  });

  it('a wrong code is said under the code field', async () => {
    await codeSheet({ outcome: 'failed', status: 401, code: 'INVALID_OTP_CODE' });
    expect(screen.getByText(strings['err.code'])).toBeInTheDocument();
    expect(screen.queryByText(strings['err.password'])).toBeNull();
  });

  it('a lockout says the wait in minutes', async () => {
    await codeSheet({ outcome: 'failed', status: 429, retryAfter: 900 });
    expect(screen.getByText('Too many tries. Wait 15 minutes, then try again.')).toBeInTheDocument();
  });

  it('a lockout that names no wait never says "a minute"', async () => {
    await codeSheet({ outcome: 'failed', status: 429 });
    expect(screen.getByText(strings['err.tooMany'])).toBeInTheDocument();
    expect(strings['err.tooMany']).not.toMatch(/minute/);
  });

  it('an app code typed with a space or a hyphen is sent as its six digits', async () => {
    expect(await codeSheet({ outcome: 'failed', status: 401 }, { code: ' 123 456 ' })).toEqual([{ password: 'not-my-password', code: '123456' }]);
    cleanup();
    expect(await codeSheet({ outcome: 'failed', status: 401 }, { code: '123-456' })).toEqual([{ password: 'not-my-password', code: '123456' }]);
  });

  it('a backup code keeps its letters', async () => {
    expect(await codeSheet({ outcome: 'failed', status: 401 }, { code: 'ab12 cd34-ef' })).toEqual([{ password: 'not-my-password', code: 'ab12cd34ef' }]);
  });
});

function Setup() {
  return <SetupSheet open onClose={closed} onOn={() => undefined} />;
}
const closed = vi.fn();

describe('the set-up drawer, step 1 refused with a plain 400', () => {
  const start = async (password: string, enabled = false) => {
    fresh(enabled);
    closed.mockClear();
    next.setup = { outcome: 'failed', status: 400 };
    render(<Setup />, { wrapper: wrap });
    await act(flush);
    type(strings['pw.current'], password);
    const before = statusReads();
    await press(strings['2fa.next']);
    return before;
  };

  it('an account with no password is told to set one first, over a status read again', async () => {
    const before = await start('a-long-enough-password');
    expect(statusReads()).toBeGreaterThan(before);
    expect(screen.getByText(strings['err.noPassword'])).toBeInTheDocument();
    expect(screen.queryByText(strings['err.generic'])).toBeNull();
  });

  it('a password too short to be one is said to be wrong, under the field', async () => {
    await start('short');
    expect(screen.getByText(strings['err.password'])).toBeInTheDocument();
    expect(screen.queryByText(strings['err.noPassword'])).toBeNull();
  });

  it('2FA turned on meanwhile (another tab): the drawer closes over the fresh status, nothing is blamed', async () => {
    await start('a-long-enough-password', true);
    expect(closed).toHaveBeenCalled();
    expect(screen.queryByText(strings['err.noPassword'])).toBeNull();
  });

  it('another refusal keeps its own sentence', async () => {
    fresh();
    next.setup = { outcome: 'failed', status: 401 };
    render(<Setup />, { wrapper: wrap });
    await act(flush);
    type(strings['pw.current'], 'a-long-enough-password');
    await press(strings['2fa.next']);
    expect(screen.getByText(strings['err.password'])).toBeInTheDocument();
  });
});

describe('the set-up drawer, the code step refused with a plain 400', () => {
  // The held set-up secrets as the start step's answer carries them.
  const begin = async (enabled: boolean) => {
    const { holdSecret, capture } = await import('@core');
    fresh(enabled);
    closed.mockClear();
    const qr = 'data:image/png;base64,AAAA';
    next.setup = { outcome: 'done', data: holdSecret(JSON.stringify({ k: 'SETUPKEY', q: qr, c: ['aaaaaaaaaa'] }), capture()) };
    next.verify = { outcome: 'failed', status: 400, code: 'Bad Request' };
    render(<Setup />, { wrapper: wrap });
    await act(flush);
    type(strings['pw.current'], 'a-long-enough-password');
    await press(strings['2fa.next']);
    fireEvent.click(screen.getByRole('checkbox', { name: strings['2fa.iSaved'] }));
    type(strings['2fa.code'], '123456');
    const before = statusReads();
    await press(strings['2fa.confirm']);
    return before;
  };

  it('a set-up the server no longer has: the status is read again, the secrets go, and it says to start again', async () => {
    const before = await begin(false);
    expect(statusReads()).toBeGreaterThan(before);
    expect(screen.getByText(strings['err.setupStale'])).toBeInTheDocument();
    expect(screen.queryByText(strings['err.generic'])).toBeNull();
    // Back at step 1: the password is asked again, the old key is not shown.
    expect(screen.getByLabelText(strings['pw.current'])).toBeInTheDocument();
  });

  it('2FA already on (finished in another tab): the drawer closes over the fresh status', async () => {
    await begin(true);
    expect(closed).toHaveBeenCalled();
  });
});

describe('the email drawer', () => {
  it('Cancel on the code prompt says nothing: no banner, the address stays typed', async () => {
    fresh(true);
    next.email = { outcome: 'not_sent', cancelled: true };
    render(<EmailSheet open onClose={() => undefined} onSent={() => undefined} />, { wrapper: wrap });
    await act(flush);
    type(strings['e.new'], 'new@example.com');
    type(strings['e.password'], 'my-password-here');
    await press(strings['e.send']);
    expect(screen.queryByText(strings['sheet.failedTitle'])).toBeNull();
    expect(screen.queryByText(strings['err.generic'])).toBeNull();
    expect(screen.getByLabelText(strings['e.new'])).toHaveValue('new@example.com');
  });

  it('a real refusal still shows its banner', async () => {
    fresh(true);
    next.email = { outcome: 'failed', status: 429 };
    render(<EmailSheet open onClose={() => undefined} onSent={() => undefined} />, { wrapper: wrap });
    await act(flush);
    type(strings['e.new'], 'new@example.com');
    type(strings['e.password'], 'my-password-here');
    await press(strings['e.send']);
    expect(screen.getByText(strings['sheet.failedTitle'])).toBeInTheDocument();
  });
});
