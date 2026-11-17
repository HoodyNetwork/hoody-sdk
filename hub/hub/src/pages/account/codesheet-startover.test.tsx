// Vitest: the code drawer's Start over (2FA off, new codes, gate off) commits its answer only inside its press, as the
// password and name drawers do: a context change or a newer send of the same change before core answers leaves the lock
// held, and Start over stays.
import { bump } from '@core/ctx';
import { boot, signIn } from '@core/test/env';
import type { HeldRow } from '@core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CodeSheet } from './parts/CodeSheet';
import { locks } from './parts/locks';
import strings from './strings.en.json';

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const click = async (name: string) => {
  await act(async () => { fireEvent.click(await screen.findByRole('button', { name })); await flush(); });
};
const hold = () => { locks.sent('off'); locks.settle('off', true); };
const pending = () => locks.snapshot().get('off') === 'pending';

/** Renders the drawer over a held 2FA-off change whose Check again cannot tell; core's answer to Start over is held. */
async function armed() {
  let land!: (v: boolean) => void;
  const answer = new Promise<boolean>((r) => { land = r; });
  hold();
  render(
    <CodeSheet resizeKey="test-codesheet-startover" open onClose={() => undefined} title="t" lead="l" confirm="c" op="off"
      send={async () => ({ outcome: 'pending' }) as never} readBack={async () => false}
      holds={() => [{ hold: 'h1' } as unknown as HeldRow]} dismiss={() => answer} onDone={() => undefined} />,
  );
  await click(strings['check.again']);
  await click(strings['check.startOver']);
  return async (v: boolean) => { await act(async () => { land(v); await flush(); }); };
}

describe('the code drawer: a late Start over answer commits nothing outside its press', () => {
  beforeEach(() => { boot(); signIn(); locks.clear(); });

  it('freed in its own press: the lock settles', async () => {
    const land = await armed();
    await land(true);
    expect(pending()).toBe(false);
  });

  it('a newer send of the change before the answer: its lock stays, and so does Start over', async () => {
    const land = await armed();
    act(() => hold());
    await land(true);
    expect(pending()).toBe(true);
    expect(screen.getByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
  });

  it('a context change before the answer: the lock stays', async () => {
    const land = await armed();
    act(() => { bump('switch'); });
    await land(true);
    expect(pending()).toBe(true);
  });
});
