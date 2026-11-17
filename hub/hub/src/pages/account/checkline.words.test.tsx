// Vitest: the code drawer's "may have gone through" banner says what Check again can do. New backup codes
// cannot be read back, so their line says checking can't confirm the change; a change the status shows (two-step off)
// keeps the line that reads the account to see whether it is there. The set-up drawer likewise: its start, no; its verify, yes. With
// the drawer closed, the two-step section's banner (only codes or a set-up start can stay stuck there) says the same.
import { CoreQueryProvider, queryClient } from '@core';
import { boot, onFetch, settle, signIn } from '@core/test/env';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodeSheet } from './parts/CodeSheet';
import { SetupSheet } from './parts/SetupSheet';
import { TwoFactorSection } from './parts/TwoFactorSection';
import { locks, type OpName } from './parts/locks';
import strings from './strings.en.json';
import { useTurnOff, useTwoFactor, useVerifySetup } from './data';

const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};

function lost() {
  boot();
  signIn();
  queryClient.clear();
  locks.clear();
  // Every read fails, so Check again cannot settle it and the banner stays unsure.
  onFetch((c) => (c.method === 'GET' ? { status: 500, body: {} } : { status: 502, body: {} }));
}
async function checkAgain() {
  await act(flush);
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: strings['check.again'] }));
    await flush();
  });
}

async function unsureBanner(op: OpName) {
  lost();
  locks.sent(op);
  locks.settle(op, true);
  function Sheet() {
    const h = useTurnOff();
    return <CodeSheet resizeKey="test-checkline" open onClose={() => undefined} title="T" lead="lead" confirm="Go" op={op} send={(password, code) => h.run({ password, code })} readBack={async () => false} holds={h.heldNow} dismiss={h.dismissRows} onDone={() => undefined} />;
  }
  render(<Sheet />, { wrapper: CoreQueryProvider });
  await checkAgain();
}

function Setup() {
  useTwoFactor();
  return <SetupSheet open onClose={() => undefined} onOn={() => undefined} />;
}

describe('the code drawer says what Check again can do', () => {
  it('new backup codes: checking cannot confirm the change', async () => {
    await unsureBanner('codes');
    expect(await screen.findByText(strings['check.checkLineNoProof'])).toBeInTheDocument();
    expect(screen.queryByText(strings['check.checkLine'])).toBeNull();
  });

  it('two-step off: Check again reads the account to see whether it is there', async () => {
    await unsureBanner('off');
    expect(await screen.findByText(strings['check.checkLine'])).toBeInTheDocument();
    expect(screen.queryByText(strings['check.checkLineNoProof'])).toBeNull();
  });

  it('set-up start: the new secret cannot be read back, so checking cannot confirm it', async () => {
    lost();
    locks.sent('setup');
    locks.settle('setup', true);
    render(<Setup />, { wrapper: CoreQueryProvider });
    await checkAgain();
    expect(await screen.findByText(strings['check.checkLineNoProof'])).toBeInTheDocument();
    expect(screen.queryByText(strings['check.checkLine'])).toBeNull();
  });

  it('set-up verify: the status shows it, so Check again reads the account', async () => {
    lost();
    const out: { h?: ReturnType<typeof useVerifySetup> } = {};
    function P() {
      out.h = useVerifySetup();
      return null;
    }
    render(
      <>
        <P />
        <Setup />
      </>,
      { wrapper: CoreQueryProvider },
    );
    await act(flush);
    await act(async () => {
      await out.h!.run({ code: '123456' });
      await flush();
    });
    await checkAgain();
    expect(await screen.findByText(strings['check.checkLine'])).toBeInTheDocument();
    expect(screen.queryByText(strings['check.checkLineNoProof'])).toBeNull();
  });

  it.each(['codes', 'setup'] as const)('with the drawer closed, the two-step section says checking cannot confirm %s', async (op) => {
    lost();
    locks.sent(op);
    locks.settle(op, true);
    render(<TwoFactorSection onOpen={() => undefined} />, { wrapper: CoreQueryProvider });
    await checkAgain();
    expect(await screen.findByText(strings['check.checkLineNoProof'])).toBeInTheDocument();
    expect(screen.queryByText(strings['check.checkLine'])).toBeNull();
  });
});
