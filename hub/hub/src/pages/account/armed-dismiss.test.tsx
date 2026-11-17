// Vitest: a warned Dismiss frees the holds that were shown when its warning armed, in the drawers that carry one (the
// code drawer, the set-up drawer), never a send that replaced them meanwhile, and answers "nothing was dismissed" when
// they were already settled.
import { CoreQueryProvider, queryClient } from '@core';
import { boot, onFetch, settle, signIn } from '@core/test/env';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodeSheet } from './parts/CodeSheet';
import { SetupSheet } from './parts/SetupSheet';
import { locks } from './parts/locks';
import strings from './strings.en.json';
import { useTurnOff, useTwoFactor, useVerifySetup } from './data';

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
const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name }));
    await flush();
  });
};

describe('the code drawer: a warned Dismiss over the holds shown when it armed', () => {
  type Off = ReturnType<typeof useTurnOff>;
  const hookMount = () => {
    const out: { h?: Off } = {};
    function P() {
      out.h = useTurnOff();
      return null;
    }
    return { out, view: render(<P />, { wrapper: CoreQueryProvider }) };
  };
  const armed = async () => {
    lost();
    // An earlier mount's send, left with an unknown outcome.
    const first = hookMount();
    await act(flush);
    await act(async () => {
      expect((await first.out.h!.run({ password: 'pw', code: '123456' })).outcome).toBe('pending');
      await flush();
    });
    first.view.unmount();
    locks.sent('off');
    locks.settle('off', true);
    // The drawer, reopened over it, and another tab's mount of the same change.
    function Sheet() {
      const h = useTurnOff();
      useTwoFactor();
      return <CodeSheet resizeKey="test-armed-dismiss" open onClose={() => undefined} title="Off" lead="lead" confirm="Turn off" op="off" send={(password, code) => h.run({ password, code })} readBack={h.readBack} holds={h.heldNow} dismiss={h.dismissRows} onDone={() => undefined} />;
    }
    render(<Sheet />, { wrapper: CoreQueryProvider });
    const other = hookMount();
    await act(flush);
    await click(strings['check.again']);
    expect(await screen.findByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
    return other;
  };

  it('keeps a send that replaced the shown hold held, and says nothing was dismissed', async () => {
    const other = await armed();
    // Another tab reads it, frees it and sends again: a new hold of the same change.
    await act(async () => {
      expect(await other.out.h!.dismissRows(other.out.h!.heldNow() as never)).toBe(true);
      await flush();
    });
    await act(async () => {
      expect((await other.out.h!.run({ password: 'pw', code: '123456' })).outcome).toBe('pending');
      await flush();
    });
    const replacement = other.out.h!.heldNow();
    expect(replacement).toHaveLength(1);
    await click(strings['check.startOver']);
    expect(other.out.h!.heldNow()).toEqual(replacement);
    expect(screen.getByText(strings['check.nothing'])).toBeInTheDocument();
  });

  it('says nothing was dismissed when the shown hold was already settled elsewhere', async () => {
    const other = await armed();
    await act(async () => {
      expect(await other.out.h!.dismissRows(other.out.h!.heldNow() as never)).toBe(true);
      await flush();
    });
    await click(strings['check.startOver']);
    expect(screen.getByText(strings['check.nothing'])).toBeInTheDocument();
  });

  it('an inconclusive Check again re-arms over the rows now on screen: the next Start over frees the replacement', async () => {
    const other = await armed();
    await act(async () => {
      expect(await other.out.h!.dismissRows(other.out.h!.heldNow() as never)).toBe(true);
      await flush();
    });
    await act(async () => {
      expect((await other.out.h!.run({ password: 'pw', code: '123456' })).outcome).toBe('pending');
      await flush();
    });
    const replacement = other.out.h!.heldNow();
    await click(strings['check.startOver']);
    expect(other.out.h!.heldNow()).toEqual(replacement);
    expect(screen.getByText(strings['check.nothing'])).toBeInTheDocument();
    // The person checks again (the read still cannot tell): the warning is now over the replacement, and the old note is gone.
    await click(strings['check.again']);
    expect(screen.queryByText(strings['check.nothing'])).toBeNull();
    await click(strings['check.startOver']);
    expect(other.out.h!.heldNow()).toHaveLength(0);
    expect(screen.queryByText(strings['check.nothing'])).toBeNull();
  });
});

describe('the set-up drawer: Start over frees the verify hold shown when it armed', () => {
  it('keeps a replacing verify send held and says nothing was dismissed', async () => {
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
    await click(strings['check.again']);
    expect(await screen.findByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
    await act(async () => {
      expect(await out.h!.dismissRows(out.h!.heldNow() as never)).toBe(true);
      await flush();
    });
    await act(async () => {
      expect((await out.h!.run({ code: '123456' })).outcome).toBe('pending');
      await flush();
    });
    const replacement = out.h!.heldNow();
    expect(replacement).toHaveLength(1);
    await click(strings['check.startOver']);
    expect(out.h!.heldNow()).toEqual(replacement);
    expect(screen.getByText(strings['check.nothing'])).toBeInTheDocument();
  });

  it('an inconclusive Check again re-arms over the replacement: the next Start over frees it', async () => {
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
    await click(strings['check.again']);
    expect(await screen.findByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
    await act(async () => {
      expect(await out.h!.dismissRows(out.h!.heldNow() as never)).toBe(true);
      await flush();
    });
    await act(async () => {
      expect((await out.h!.run({ code: '123456' })).outcome).toBe('pending');
      await flush();
    });
    const replacement = out.h!.heldNow();
    await click(strings['check.startOver']);
    expect(out.h!.heldNow()).toEqual(replacement);
    expect(screen.getByText(strings['check.nothing'])).toBeInTheDocument();
    await click(strings['check.again']);
    expect(screen.queryByText(strings['check.nothing'])).toBeNull();
    await click(strings['check.startOver']);
    expect(out.h!.heldNow()).toHaveLength(0);
  });
});
