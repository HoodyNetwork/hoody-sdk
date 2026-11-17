// Vitest: the account page's live change hooks and core's lock: Check again (readBack) releases a pending change
// only after a fresh good read; a failed read keeps it pending, and nothing is sent while it is.
import { queryClient } from '@core';
import { boot, calls, onFetch, settle, signIn } from '@core/test/env';
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router for a part rendered without its page (its FaqLink reads the location), not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { TwoFactorSection } from './parts/TwoFactorSection';
import { locks } from './parts/locks';
import strings from './strings.en.json';
import { useStartSetup, useEndOthers, useNewCodes, useSessionPages, useSessions, useSetGate, useTurnOff, useTwoFactor, useVerifySetup, useChangePassword, useProfile, useEndSession } from './data';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: ['/account'] }) });
const wrap = ({ children }: { children: ReactNode }) => (
  <RouterContextProvider router={router}>
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  </RouterContextProvider>
);
const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};

describe('account change hooks on a live page', () => {
  it('Check again releases a pending change only after a good read, and the next submit is then sent', async () => {
    boot();
    signIn();
    queryClient.clear();
    let statusOk = true;
    let gateOn = false;
    onFetch((c) => {
      if (c.method === 'PUT') return { status: 502, body: {} };
      return statusOk ? { status: 200, body: { data: { enabled: true, verified: true, backup_codes_remaining: 8, require_for_tokens: gateOn } } } : { status: 500, body: {} };
    });
    let gate!: ReturnType<typeof useSetGate>;
    function Probe() {
      gate = useSetGate();
      useTwoFactor();
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);

    statusOk = false;
    let r = { outcome: '' } as { outcome: string; code?: string };
    await act(async () => {
      r = await gate.run({ enabled: true });
      await flush();
    });
    expect(r.outcome).toBe('pending');
    expect(gate.pending).toBe(true);

    // Pending: a press sends nothing.
    const before = calls.filter((c) => c.method === 'PUT').length;
    await act(async () => {
      r = await gate.run({ enabled: true });
      await flush();
    });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(before);

    // A failed read keeps it pending.
    let ok = true;
    await act(async () => {
      ok = await gate.readBack();
      await flush();
    });
    expect(ok).toBe(false);
    expect(gate.pending).toBe(true);

    // A good read that still shows the old state proves nothing (the request may still be running): it stays pending.
    statusOk = true;
    await act(async () => {
      ok = await gate.readBack();
      await flush();
    });
    expect(ok).toBe(false);
    expect(gate.pending).toBe(true);

    // A good read showing the asked state releases it, and the next submit is sent (not READ_BACK_FIRST).
    gateOn = true;
    await act(async () => {
      ok = await gate.readBack();
      await flush();
    });
    expect(ok).toBe(true);
    expect(gate.pending).toBe(false);
    await act(async () => {
      r = await gate.run({ enabled: true });
      await flush();
    });
    expect(r.code).not.toBe('READ_BACK_FIRST');
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(before + 1);
  });
});

describe('account 2FA read-back and codes', () => {
  it('a cancelled status refetch (old cached data) does not release a pending minted change', async () => {
    boot();
    signIn();
    queryClient.clear();
    onFetch((c) => {
      if (c.method === 'POST') return { status: 502, body: {} };
      return { status: 200, delayMs: 150, body: { data: { enabled: true, verified: true, backup_codes_remaining: 8, require_for_tokens: false } } };
    });
    let codes!: ReturnType<typeof useNewCodes>;
    function Probe() {
      codes = useNewCodes();
      useTwoFactor();
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
      await flush();
    });
    // The pending answer starts its own read-back at once; another fetch cancels that read mid-flight.
    await act(async () => {
      await codes.run({ password: 'x', code: '123456' });
      await new Promise((r) => setTimeout(r, 40));
      await queryClient.cancelQueries();
      await new Promise((r) => setTimeout(r, 400));
      await flush();
    });
    expect(codes.pending).toBe(true);
  });

  it('a wrong password or code on new codes comes back with its own code', async () => {
    boot();
    signIn();
    queryClient.clear();
    onFetch((c) => (c.method === 'POST' ? { status: 401, body: { error: 'INVALID_OTP_CODE' } } : { status: 200, body: { data: { enabled: true, verified: true, backup_codes_remaining: 8, require_for_tokens: false } } }));
    let codes!: ReturnType<typeof useNewCodes>;
    function Probe() {
      codes = useNewCodes();
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    let r: { outcome: string; code?: string } = { outcome: '' };
    await act(async () => {
      r = await codes.run({ password: 'x', code: '123456' });
      await flush();
    });
    expect(r).toMatchObject({ outcome: 'failed', code: 'INVALID_OTP_CODE' });
  });
});

describe('session revoke read-back', () => {
  it('Check again releases the revoke only after the session lists were read, and a failed list read keeps it pending', async () => {
    boot();
    signIn();
    queryClient.clear();
    let listsOk = true;
    onFetch((c) => {
      if (c.method === 'POST') return { status: 502, body: {} };
      return listsOk ? { status: 200, body: { data: { sessions: [], next_cursor: '' } } } : { status: 500, body: {} };
    });
    let end!: ReturnType<typeof useEndOthers>;
    function Probe() {
      end = useEndOthers();
      useSessions('active');
      useSessions('ended');
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    listsOk = false;
    await act(async () => {
      await end.run();
      await flush();
    });
    expect(end.pending).toBe(true);
    let ok = true;
    await act(async () => {
      ok = await end.readBack();
      await flush();
    });
    expect(ok).toBe(false);
    expect(end.pending).toBe(true);
    listsOk = true;
    await act(async () => {
      ok = await end.readBack();
      await flush();
    });
    expect(ok).toBe(true);
    expect(end.pending).toBe(false);
  });
});

describe('minted changes lock by operation, not by credentials', () => {
  it('after an unknown new-codes outcome, a try with another code is refused until read back', async () => {
    boot();
    signIn();
    queryClient.clear();
    onFetch((c) => {
      if (c.method === 'POST') return { status: 502, body: {} };
      return { status: 500, body: {} };
    });
    let codes!: ReturnType<typeof useNewCodes>;
    function Probe() {
      codes = useNewCodes();
      useTwoFactor();
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    let r: { outcome: string; code?: string } = { outcome: '' };
    await act(async () => {
      r = await codes.run({ password: 'pw', code: '111111' });
      await flush();
    });
    expect(r.outcome).toBe('pending');
    const posts = calls.filter((c) => c.method === 'POST').length;
    await act(async () => {
      r = await codes.run({ password: 'pw', code: '222222' });
      await flush();
    });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(posts);
  });
});

describe('sessions beyond the first page', () => {
  it('loads the next page by cursor and merges it; no more offered at the end', async () => {
    boot();
    signIn();
    queryClient.clear();
    const row = (id: string) => ({ id, active: true, current: false, client: 'c' + id });
    onFetch((c) => {
      const cursor = new URL(c.url, 'http://x').searchParams.get('cursor');
      if (!cursor) return { status: 200, body: { data: { sessions: [row('a'), row('b')], next_cursor: 'c2' } } };
      return { status: 200, body: { data: { sessions: [row('c')], next_cursor: '' } } };
    });
    let pages!: ReturnType<typeof useSessionPages>;
    function Probe() {
      pages = useSessionPages('active');
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    expect(pages.sessions?.map((x) => x.id)).toEqual(['a', 'b']);
    expect(pages.hasMore).toBe(true);
    await act(async () => {
      pages.more();
      await flush();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
      await flush();
    });
    expect(pages.sessions?.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(pages.hasMore).toBe(false);
  });
});

describe('2FA turn-on and turn-off are wired live', () => {
  it('verify-setup and turn-off are sent (not "not wired") with their bodies', async () => {
    boot();
    signIn();
    queryClient.clear();
    onFetch((c) =>
      c.method === 'GET'
        ? { status: 200, body: { data: { enabled: true, verified: true, backup_codes_remaining: 8, require_for_tokens: false } } }
        : { status: 200, body: { data: { token: null, refreshToken: null, session_id: 's', sessions_revoked: true } } },
    );
    let v!: ReturnType<typeof useVerifySetup>;
    let o!: ReturnType<typeof useTurnOff>;
    function Probe() {
      v = useVerifySetup();
      o = useTurnOff();
      useTwoFactor();
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    let r: { outcome: string; code?: string } = { outcome: '' };
    await act(async () => {
      r = await v.run({ code: '123456' });
      await flush();
    });
    expect(r.outcome).toBe('done');
    await act(async () => {
      r = await o.run({ password: 'pw', code: '123456' });
      await flush();
    });
    expect(r.outcome).toBe('done');
    const sent = calls.filter((c) => c.method !== 'GET');
    expect(sent.map((c) => c.method + ' ' + c.url)).toEqual(['POST /api/v1/users/auth/2fa/verify-setup', 'DELETE /api/v1/users/auth/2fa']);
    expect(sent[0]?.body).toEqual({ code: '123456' });
    expect(sent[1]?.body).toEqual({ password: 'pw', code: '123456' });
  });
});

describe('the password change locks by operation, not by credentials', () => {
  it('after an unknown outcome, a try with another new password is refused and sends nothing', async () => {
    boot();
    signIn();
    queryClient.clear();
    onFetch((c) => (c.method === 'PUT' ? { status: 502, body: {} } : { status: 500, body: {} }));
    let pw!: ReturnType<typeof useChangePassword>;
    function Probe() {
      pw = useChangePassword();
      useProfile();
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    let r: { outcome: string; code?: string } = { outcome: '' };
    await act(async () => {
      r = await pw.run({ current: 'old', password: fake('New-Pass', '-1234') });
      await flush();
    });
    expect(r.outcome).toBe('pending');
    const puts = calls.filter((c) => c.method === 'PUT').length;
    await act(async () => {
      r = await pw.run({ current: 'old', password: fake('Other-Pass', '-5678') });
      await flush();
    });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(puts);
  });
});

describe('sessions pages: merge, retry, malformed status', () => {
  const row = (id: string) => ({ id, active: true, current: false, client: 'c' + id });
  async function mount(handler: Parameters<typeof onFetch>[0]) {
    boot();
    signIn();
    queryClient.clear();
    onFetch(handler);
    const out: { pages?: ReturnType<typeof useSessionPages> } = {};
    function Probe() {
      out.pages = useSessionPages('active');
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    return out as { pages: ReturnType<typeof useSessionPages> };
  }
  const more = async (o: { pages: ReturnType<typeof useSessionPages> }) => {
    await act(async () => {
      o.pages.more();
      await flush();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
      await flush();
    });
  };

  it('a row that moved between pages is listed once', async () => {
    const o = await mount((c) => {
      const cursor = new URL(c.url, 'http://x').searchParams.get('cursor');
      return { status: 200, body: { data: cursor ? { sessions: [row('b'), row('c')], next_cursor: '' } : { sessions: [row('a'), row('b')], next_cursor: 'c2' } } };
    });
    await more(o);
    expect(o.pages.sessions?.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('refetch retries a later page that failed', async () => {
    let fail = true;
    const o = await mount((c) => {
      const cursor = new URL(c.url, 'http://x').searchParams.get('cursor');
      if (!cursor) return { status: 200, body: { data: { sessions: [row('a')], next_cursor: 'c2' } } };
      return fail ? { status: 500, body: {} } : { status: 200, body: { data: { sessions: [row('c')], next_cursor: '' } } };
    });
    await more(o);
    expect(o.pages.moreError).toBeTruthy();
    fail = false;
    await act(async () => {
      await o.pages.refetch();
      await flush();
    });
    await act(flush);
    expect(o.pages.sessions?.map((x) => x.id)).toEqual(['a', 'c']);
  });
});

describe('a malformed two-step status is unknown, never off', () => {
  it('answers null when the fields are missing', async () => {
    boot();
    signIn();
    queryClient.clear();
    onFetch(() => ({ status: 200, body: { data: {} } }));
    let q!: ReturnType<typeof useTwoFactor>;
    function Probe() {
      q = useTwoFactor();
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    expect(q.data).toBeNull();
  });
});

describe('a change still out when the page remounts', () => {
  it('a new hook sees it running, and a second press is refused as busy, not as a failure', async () => {
    boot();
    signIn();
    queryClient.clear();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    onFetch(async (c) => {
      if (c.method === 'PUT') {
        await gate;
        return { status: 200, body: { data: {} } };
      }
      return { status: 200, body: { data: { enabled: true, verified: true, backup_codes_remaining: 8, require_for_tokens: false } } };
    });
    const out: { a?: ReturnType<typeof useSetGate>; b?: ReturnType<typeof useSetGate> } = {};
    function A() {
      out.a = useSetGate();
      return null;
    }
    function B() {
      out.b = useSetGate();
      return null;
    }
    const first = render(<A />, { wrapper: wrap });
    await act(flush);
    let sent!: Promise<unknown>;
    await act(async () => {
      sent = out.a!.run({ enabled: true });
      await flush();
    });
    first.unmount();
    render(<B />, { wrapper: wrap });
    await act(flush);
    expect(out.b!.running).toBe(true);
    let r2 = { outcome: '' } as { outcome: string; code?: string };
    await act(async () => {
      r2 = await out.b!.run({ enabled: true });
    });
    expect(r2).toMatchObject({ outcome: 'not_sent' });
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    release();
    await act(async () => {
      await sent;
      await flush();
    });
  });
});

describe('the 2FA changes lock by operation, not by credentials', () => {
  it('after an unknown turn-off, a try with another code is refused until read back', async () => {
    boot();
    signIn();
    queryClient.clear();
    // The reads fail too: the lock is released only by a fresh good read, so none has happened.
    onFetch(() => ({ status: 502, body: {} }));
    let h!: ReturnType<typeof useTurnOff>;
    function P() {
      h = useTurnOff();
      useTwoFactor();
      return null;
    }
    render(<P />, { wrapper: wrap });
    await act(flush);
    await act(async () => {
      await h.run({ password: 'pw', code: '111111' });
      await flush();
    });
    const sends = calls.filter((c) => c.method !== 'GET').length;
    let r = { outcome: '' } as { outcome: string; code?: string };
    await act(async () => {
      r = await h.run({ password: 'pw', code: '222222' });
      await flush();
    });
    expect(r).toMatchObject({ outcome: 'not_sent' });
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(sends);
  });
});

describe('a read-back frees a change only by what it proves', () => {
  async function pendingHook<H>(use: () => H, send: (h: H) => Promise<unknown>, statusBody: () => unknown, fail: (m: string) => boolean) {
    boot();
    signIn();
    queryClient.clear();
    let reads = false;
    onFetch((c) => (fail(c.method) ? { status: 502, body: {} } : reads ? { status: 200, body: { data: statusBody() } } : { status: 502, body: {} }));
    const out: { h?: H } = {};
    function P() {
      out.h = use();
      useTwoFactor();
      return null;
    }
    render(<P />, { wrapper: wrap });
    await act(flush);
    await act(async () => {
      await send(out.h as H);
      await flush();
    });
    reads = true;
    return out as { h: H };
  }

  it('turn-off: a status that still says on proves nothing, only one that says off frees it', async () => {
    let enabled = true;
    const o = await pendingHook(useTurnOff, (h) => h.run({ password: 'pw', code: '1' }), () => ({ enabled, verified: enabled, require_for_tokens: false }), (m) => m !== 'GET');
    let ok = true;
    await act(async () => {
      ok = await o.h.readBack();
      await flush();
    });
    expect(ok).toBe(false);
    expect(o.h.pending).toBe(true);
    enabled = false;
    await act(async () => {
      ok = await o.h.readBack();
      await flush();
    });
    expect(ok).toBe(true);
    expect(o.h.pending).toBe(false);
  });

  it('verify set-up: a status that is still not enabled proves nothing, only an enabled one frees it', async () => {
    let enabled = false;
    const o = await pendingHook(useVerifySetup, (h) => h.run({ code: '123456' }), () => ({ enabled, verified: enabled, require_for_tokens: false }), (m) => m !== 'GET');
    let ok = true;
    await act(async () => {
      ok = await o.h.readBack();
      await flush();
    });
    expect(ok).toBe(false);
    expect(o.h.pending).toBe(true);
    enabled = true;
    await act(async () => {
      ok = await o.h.readBack();
      await flush();
    });
    expect(ok).toBe(true);
    expect(o.h.pending).toBe(false);
  });

  it('new codes: no read can prove it, so only Start over frees it', async () => {
    const o = await pendingHook(useNewCodes, (h) => h.run({ password: 'pw', code: '123456' }), () => ({ enabled: true, verified: true, require_for_tokens: false }), (m) => m !== 'GET');
    let ok = true;
    await act(async () => {
      ok = await o.h.readBack();
      await flush();
    });
    expect(ok).toBe(false);
    expect(o.h.pending).toBe(true);
    await act(async () => {
      o.h.dismissShown();
      await flush();
    });
    expect(o.h.pending).toBe(false);
  });
});

describe('ending one session: the active list alone proves it', () => {
  it('with the id gone from the active list, Check again frees it (the ended list is never mounted)', async () => {
    boot();
    signIn();
    queryClient.clear();
    const row = (id: string) => ({ id, active: true, current: false, client: 'c' + id });
    let gone = false;
    let down = false;
    onFetch((c) => {
      if (c.method === 'DELETE') return { status: 502, body: {} };
      if (down) return { status: 502, body: {} };
      return { status: 200, body: { data: { sessions: gone ? [row('b')] : [row('a'), row('b')], next_cursor: '' } } };
    });
    const out: { h?: ReturnType<typeof useEndSession> } = {};
    function P() {
      out.h = useEndSession();
      useSessionPages('active');
      return null;
    }
    render(<P />, { wrapper: wrap });
    await act(flush);
    down = true;
    await act(async () => {
      await out.h!.run({ id: 'a' });
      await flush();
    });
    expect(out.h!.pending).toBe(true);
    // The revoke did apply (its answer was lost); only the active list can say so.
    gone = true;
    down = false;
    let ok = false;
    await act(async () => {
      ok = await out.h!.readBack();
      await flush();
    });
    expect(ok).toBe(true);
    expect(out.h!.pending).toBe(false);
  });
});

describe('answers that cannot be trusted prove nothing', () => {
  const row = (id: string, active = true) => ({ id, active, current: false, client: 'c' + id });
  const cursorOf = (c: { url: string }) => new URL(c.url, 'http://x').searchParams.get('cursor');

  it('a status missing verified or require_for_tokens is unknown, never off', async () => {
    for (const body of [{ enabled: true, require_for_tokens: false }, { enabled: true, verified: true }]) {
      boot();
      signIn();
      queryClient.clear();
      onFetch(() => ({ status: 200, body: { data: body } }));
      let q!: ReturnType<typeof useTwoFactor>;
      function Probe() {
        q = useTwoFactor();
        return null;
      }
      const { unmount } = render(<Probe />, { wrapper: wrap });
      await act(flush);
      expect(q.data ?? null).toBeNull();
      unmount();
    }
  });

  it('a sessions answer without a list is a failed read, and a revoke stays pending on it', async () => {
    boot();
    signIn();
    queryClient.clear();
    let mode: 'ok' | 'down' | 'empty' = 'ok';
    onFetch((c) => {
      if (c.method === 'DELETE') return { status: 502, body: {} };
      if (mode === 'down') return { status: 502, body: {} };
      return { status: 200, body: { data: mode === 'empty' ? {} : { sessions: [row('a'), row('b')], next_cursor: '' } } };
    });
    const out: { h?: ReturnType<typeof useEndSession>; s?: ReturnType<typeof useSessionPages> } = {};
    function P() {
      out.h = useEndSession();
      out.s = useSessionPages('active');
      return null;
    }
    render(<P />, { wrapper: wrap });
    await act(flush);
    mode = 'down';
    await act(async () => {
      await out.h!.run({ id: 'a' });
      await flush();
    });
    expect(out.h!.pending).toBe(true);
    mode = 'empty';
    let ok = true;
    await act(async () => {
      ok = await out.h!.readBack();
      await flush();
    });
    expect(ok).toBe(false);
    expect(out.h!.pending).toBe(true);
  });

  it('a lost set-up start is unknown: no status read frees it, only a warned Start over', async () => {
    boot();
    signIn();
    queryClient.clear();
    let down = true;
    // What the server stores at set-up: not enabled, not verified.
    onFetch((c) => (down && c.method !== 'GET' ? { status: 502, body: {} } : c.method === 'GET' ? { status: 200, body: { data: { enabled: false, verified: false, require_for_tokens: false, backup_codes_remaining: 8 } } } : { status: 502, body: {} }));
    const out: { h?: ReturnType<typeof useStartSetup> } = {};
    function P() {
      out.h = useStartSetup();
      useTwoFactor();
      return null;
    }
    render(<P />, { wrapper: wrap });
    await act(flush);
    await act(async () => {
      await out.h!.run({ password: 'pw' });
      await flush();
    });
    expect(out.h!.pending).toBe(true);
    down = false;
    let ok = true;
    await act(async () => {
      ok = await out.h!.readBack();
      await flush();
    });
    expect(ok).toBe(false);
    expect(out.h!.pending).toBe(true);
    await act(async () => {
      out.h!.dismissShown();
      await flush();
    });
    expect(out.h!.pending).toBe(false);
  });

  it('a session list whose chain moved (a new sign-in) cannot prove a revoke applied', async () => {
    boot();
    signIn();
    queryClient.clear();
    let moved = false;
    let down = false;
    onFetch((c) => {
      if (c.method === 'DELETE') return { status: 502, body: {} };
      if (down) return { status: 502, body: {} };
      const cur = cursorOf(c);
      if (!cur) return { status: 200, body: { data: { sessions: moved ? [row('n'), row('x')] : [row('x'), row('y')], next_cursor: moved ? 'c9' : 'c2' } } };
      if (cur === 'c2') return { status: 200, body: { data: { sessions: [row('z')], next_cursor: '' } } };
      // 'y' (the session being ended) sits between the new page 1 and the old cursor: in no page read.
      return { status: 200, body: { data: { sessions: [row('q')], next_cursor: '' } } };
    });
    const out: { h?: ReturnType<typeof useEndSession>; s?: ReturnType<typeof useSessionPages> } = {};
    function P() {
      out.h = useEndSession();
      out.s = useSessionPages('active');
      return null;
    }
    render(<P />, { wrapper: wrap });
    await act(flush);
    await act(async () => {
      out.s!.more();
      await flush();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
      await flush();
    });
    down = true;
    await act(async () => {
      await out.h!.run({ id: 'y' });
      await flush();
    });
    expect(out.h!.pending).toBe(true);
    moved = true;
    down = false;
    let ok = true;
    await act(async () => {
      ok = await out.h!.readBack();
      await flush();
    });
    expect(ok).toBe(false);
    expect(out.h!.pending).toBe(true);
  });

  it('an ended-list hit proves a revoke when the active pages cannot', async () => {
    boot();
    signIn();
    queryClient.clear();
    let down = false;
    onFetch((c) => {
      if (c.method === 'DELETE') return { status: 502, body: {} };
      if (down) return { status: 502, body: {} };
      const ended = new URL(c.url, 'http://x').searchParams.get('state') === 'ended';
      return { status: 200, body: { data: ended ? { sessions: [row('a', false)], next_cursor: '' } : { sessions: [row('b')], next_cursor: 'c2' } } };
    });
    const out: { h?: ReturnType<typeof useEndSession> } = {};
    function P() {
      out.h = useEndSession();
      useSessionPages('active');
      useSessions('ended');
      return null;
    }
    render(<P />, { wrapper: wrap });
    await act(flush);
    down = true;
    await act(async () => {
      await out.h!.run({ id: 'a' });
      await flush();
    });
    expect(out.h!.pending).toBe(true);
    down = false;
    let ok = false;
    await act(async () => {
      ok = await out.h!.readBack();
      await flush();
    });
    expect(ok).toBe(true);
    expect(out.h!.pending).toBe(false);
  });

  it('a refusal keeps its HTTP status', async () => {
    boot();
    signIn();
    queryClient.clear();
    onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: { enabled: true, verified: true, require_for_tokens: false } } } : { status: 429, body: {} }));
    const out: { h?: ReturnType<typeof useTurnOff> } = {};
    function P() {
      out.h = useTurnOff();
      return null;
    }
    render(<P />, { wrapper: wrap });
    await act(flush);
    let r!: Awaited<ReturnType<NonNullable<typeof out.h>['run']>>;
    await act(async () => {
      r = await out.h!.run({ password: 'pw', code: '123456' });
      await flush();
    });
    expect(r.status).toBe(429);
  });
});

describe('the 2FA section frees a change no read can prove only by a warned Start over', () => {
  it('new codes: Check again cannot tell, then Start over frees it with the drawer closed', async () => {
    boot();
    signIn();
    queryClient.clear();
    locks.clear();
    onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: { enabled: true, verified: true, require_for_tokens: false, backup_codes_remaining: 8 } } } : { status: 502, body: {} }));
    const out: { h?: ReturnType<typeof useNewCodes> } = {};
    function Hook() {
      out.h = useNewCodes();
      return null;
    }
    render(
      <>
        <Hook />
        <TwoFactorSection onOpen={() => undefined} />
      </>,
      { wrapper: wrap },
    );
    await act(flush);
    // The send's answer was lost; the sheet's own lock is set as the sheet does.
    await act(async () => {
      const ep = locks.sent('codes');
      const r = await out.h!.run({ password: 'pw', code: '123456' });
      locks.settle('codes', r.outcome === 'pending', ep);
      await flush();
    });
    expect(locks.get('codes')).toBe('pending');
    expect(screen.queryByRole('button', { name: strings['check.startOver'] })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: strings['check.again'] }));
      await flush();
    });
    expect(locks.get('codes')).toBe('pending');
    const startOver = await screen.findByRole('button', { name: strings['check.startOver'] });
    await act(async () => {
      fireEvent.click(startOver);
      await flush();
    });
    expect(locks.get('codes')).toBeUndefined();
    expect(out.h!.pending).toBe(false);
  });
});

describe('a session still listed active proves nothing about the request that ends it', () => {
  async function pendingEnd<H>(use: () => H, send: (h: H) => Promise<unknown>, rows: () => unknown[]) {
    boot();
    signIn();
    queryClient.clear();
    let down = false;
    onFetch((c) => {
      if (c.method !== 'GET') return { status: 502, body: {} };
      if (down) return { status: 502, body: {} };
      return { status: 200, body: { data: { sessions: rows(), next_cursor: '' } } };
    });
    const out: { h?: H } = {};
    function P() {
      out.h = use();
      useSessionPages('active');
      return null;
    }
    render(<P />, { wrapper: wrap });
    await act(flush);
    down = true;
    await act(async () => {
      await send(out.h as H);
      await flush();
    });
    down = false;
    return out as { h: H };
  }
  const row = (id: string, current = false) => ({ id, active: true, current, client: 'c' + id });

  it('one session: still on the active list stays pending; gone from it frees it', async () => {
    let gone = false;
    const o = await pendingEnd(useEndSession, (h) => h.run({ id: 'a' }), () => (gone ? [row('b')] : [row('a'), row('b')]));
    expect(o.h.pending).toBe(true);
    let ok = true;
    await act(async () => {
      ok = await o.h.readBack();
      await flush();
    });
    expect(ok).toBe(false);
    expect(o.h.pending).toBe(true);
    gone = true;
    await act(async () => {
      ok = await o.h.readBack();
      await flush();
    });
    expect(ok).toBe(true);
    expect(o.h.pending).toBe(false);
  });

  it('all others: another active session stays pending; only the current one left frees it', async () => {
    let gone = false;
    const o = await pendingEnd(useEndOthers, (h) => h.run(), () => (gone ? [row('me', true)] : [row('me', true), row('x')]));
    expect(o.h.pending).toBe(true);
    let ok = true;
    await act(async () => {
      ok = await o.h.readBack();
      await flush();
    });
    expect(ok).toBe(false);
    expect(o.h.pending).toBe(true);
    gone = true;
    await act(async () => {
      ok = await o.h.readBack();
      await flush();
    });
    expect(ok).toBe(true);
    expect(o.h.pending).toBe(false);
  });
});
