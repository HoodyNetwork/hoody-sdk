// Vitest: a Dismiss / Start over of an Account change names the hold that was SHOWN (core's held() rows), so a hold from
// an earlier mount (a reopened sheet is a new mount) is freed by exactly that hold, and a stale hold frees nothing and
// leaves the band with a note, never "failed". The no-argument settle of a source hook knows only its own mount's sends.
import { CoreQueryProvider, queryClient } from '@core';
import { boot, onFetch, settle, signIn } from '@core/test/env';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SetupSheet } from './parts/SetupSheet';
import { locks } from './parts/locks';
import strings from './strings.en.json';
import { useEndOthers, useEndSession, useSetGate, useTurnOff, useTwoFactor, useVerifySetup } from './data';

const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};
const lost = () => {
  boot();
  signIn();
  queryClient.clear();
  locks.clear();
  onFetch((c) => (c.method === 'GET' ? { status: 500, body: {} } : { status: 502, body: {} }));
};

type Hook = { pending: boolean; holds: readonly unknown[]; run: (v: never) => Promise<{ outcome: string }>; heldNow: () => readonly unknown[]; dismissRows: (rows: never) => Promise<boolean> };
// The warned Dismiss over the holds shown now (a sheet's snapshot, taken when its warning armed).
const dismissNow = (h: Hook) => h.dismissRows(h.heldNow() as never);
const CASES: Array<[string, () => Hook, unknown]> = [
  ['verify setup', () => useVerifySetup() as unknown as Hook, { code: '123456' }],
  ['turn off', () => useTurnOff() as unknown as Hook, { password: 'pw', code: '123456' }],
  ['token gate', () => useSetGate() as unknown as Hook, { enabled: true }],
  ['end others', () => useEndOthers() as unknown as Hook, undefined],
  ['end one', () => useEndSession() as unknown as Hook, { id: 's1' }],
];

describe.each(CASES)('%s: a hold from an earlier mount', (_name, use, vars) => {
  const mount = () => {
    const out: { h?: Hook } = {};
    function P() {
      out.h = use();
      return null;
    }
    const view = render(<P />, { wrapper: CoreQueryProvider });
    return { out, view };
  };

  it('is freed by the Dismiss that names it, and only that hold', async () => {
    lost();
    const first = mount();
    await act(flush);
    await act(async () => {
      expect((await first.out.h!.run(vars as never)).outcome).toBe('pending');
      await flush();
    });
    first.view.unmount();
    const later = mount();
    await act(flush);
    expect(later.out.h!.pending).toBe(true);
    expect(later.out.h!.holds).toHaveLength(1);
    let freed = false;
    await act(async () => {
      freed = await dismissNow(later.out.h!);
      await flush();
    });
    expect(freed).toBe(true);
    expect(later.out.h!.pending).toBe(false);
    expect(later.out.h!.holds).toHaveLength(0);
  });

  it('a stale hold frees nothing: the replacing send stays held and the answer is false', async () => {
    lost();
    const first = mount();
    await act(flush);
    await act(async () => {
      await first.out.h!.run(vars as never);
      await flush();
    });
    first.view.unmount();
    const shown = mount();
    await act(flush);
    // The rows the warning was shown over (its snapshot): they stay the same however the live holds change.
    const stale = shown.out.h!.heldNow();
    expect(stale).toHaveLength(1);
    shown.view.unmount();
    // Another mount frees that send and sends again: a new hold of the same change.
    const other = mount();
    await act(flush);
    await act(async () => {
      expect(await dismissNow(other.out.h!)).toBe(true);
      await flush();
    });
    await act(async () => {
      expect((await other.out.h!.run(vars as never)).outcome).toBe('pending');
      await flush();
    });
    const replacement = other.out.h!.holds;
    expect(replacement).toHaveLength(1);
    let freed = true;
    await act(async () => {
      freed = await other.out.h!.dismissRows(stale as never);
      await flush();
    });
    expect(freed).toBe(false);
    expect(other.out.h!.pending).toBe(true);
    expect(other.out.h!.holds).toEqual(replacement);
  });
});

describe('the set-up sheet reopened over a held verify', () => {
  it('Start over frees the verify hold the sheet showed', async () => {
    lost();
    const out: { h?: ReturnType<typeof useVerifySetup> } = {};
    function P() {
      out.h = useVerifySetup();
      return null;
    }
    const first = render(<P />, { wrapper: CoreQueryProvider });
    await act(flush);
    await act(async () => {
      await out.h!.run({ code: '123456' });
      await flush();
    });
    first.unmount();
    function Sheet() {
      useTwoFactor();
      return <SetupSheet open onClose={() => undefined} onOn={() => undefined} />;
    }
    render(
      <>
        <P />
        <Sheet />
      </>,
      { wrapper: CoreQueryProvider },
    );
    await act(flush);
    expect(out.h!.holds).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: strings['check.again'] }));
      await flush();
    });
    const startOver = await screen.findByRole('button', { name: strings['check.startOver'] });
    await act(async () => {
      fireEvent.click(startOver);
      await flush();
    });
    expect(out.h!.holds).toHaveLength(0);
    expect(screen.queryByText(strings['check.nothing'])).toBeNull();
  });
});

// Revokes of two sessions are two holds of one change (the session's id is the identity): a Dismiss about one session
// frees that session's hold and never another's, shown or not.
describe('end one: holds of different sessions', () => {
  type End = ReturnType<typeof useEndSession>;
  const mount = () => {
    const out: { h?: End } = {};
    function P() {
      out.h = useEndSession();
      return null;
    }
    const view = render(<P />, { wrapper: CoreQueryProvider });
    return { out, view };
  };
  const ids = (h: End) => h.holds.map((r) => r.identity).sort();
  const twoHeld = async () => {
    lost();
    const first = mount();
    await act(flush);
    await act(async () => {
      expect((await first.out.h!.run({ id: 'sA' })).outcome).toBe('pending');
      expect((await first.out.h!.run({ id: 'sB' })).outcome).toBe('pending');
      await flush();
    });
    first.view.unmount();
    const later = mount();
    await act(flush);
    expect(ids(later.out.h!)).toEqual(['sA', 'sB']);
    return later;
  };

  const rowsOf = (h: End, id: string) => h.heldNow().filter((r) => r.identity === id);
  it("dismissing the rows shown for B frees B's hold from an earlier mount and leaves A's held", async () => {
    const later = await twoHeld();
    let freed = false;
    await act(async () => {
      freed = await later.out.h!.dismissRows(rowsOf(later.out.h!, 'sB'));
      await flush();
    });
    expect(freed).toBe(true);
    expect(ids(later.out.h!)).toEqual(['sA']);
    expect(later.out.h!.pending).toBe(true);
  });

  it('no row shown for a session frees nothing and touches no other hold', async () => {
    const later = await twoHeld();
    await act(async () => {
      expect(await later.out.h!.dismissRows(rowsOf(later.out.h!, 'sC'))).toBe(true);
      await flush();
    });
    expect(ids(later.out.h!)).toEqual(['sA', 'sB']);
  });

  it('is true only when every selected row was freed: one stale row among live ones answers false and frees the rest', async () => {
    const later = await twoHeld();
    const stale = later.out.h!.heldNow();
    const other = mount();
    await act(flush);
    await act(async () => {
      expect(await other.out.h!.dismissRows(rowsOf(other.out.h!, 'sA'))).toBe(true);
      await flush();
    });
    let all = true;
    await act(async () => {
      all = await other.out.h!.dismissRows(stale);
      await flush();
    });
    expect(all).toBe(false);
    expect(other.out.h!.holds).toHaveLength(0);
  });
});
