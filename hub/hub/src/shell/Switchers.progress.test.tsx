// Realm switch progress on the realm triggers: while core checks a realm the person picked, a trigger keeps the
// realm the page shows (its dot and name), takes a busy mark in place of its caret, says where the Hub is going in
// its name, and stays pressable (a newer pick supersedes the running switch). The shell shows a switch only once it
// has run SWITCH_SHOW_MS, and never once the generation moved under it with no switch started since. A run is keyed
// on core's switchRevision, which every started switch moves (mocked here: `pick` is core's beginSwitch as the
// shell sees it, the revision moved and `switching` set).
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFixtureCore, queryClient } from '@core';
import { bump, setSwitching } from '@core/ctx';
import type * as CoreShell from '@core/shell';
import { ShellDataProvider, type ShellData, useShellData } from './context';
import { LiveShellData, SWITCH_SHOW_MS } from './live';
import { PhoneContext, RealmSwitcher } from './Switchers';

let rev = 0;
vi.mock('@core/shell', async (orig) => ({ ...(await orig<typeof CoreShell>()), switchRevision: () => rev }));
const pick = (target: string) => {
  rev += 1;
  setSwitching(target);
};

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const C = 'c'.repeat(24);
const base: ShellData = { realms: [{ id: A, name: 'Alpha', color: 'red' }, { id: B, name: 'Beta', color: 'blue' }], realmId: A, computers: [], setRealm: () => undefined };

const at = (data: Partial<ShellData>) =>
  render(
    <ShellDataProvider value={{ ...base, ...data }}>
      <RealmSwitcher />
      <PhoneContext />
    </ShellDataProvider>,
  );

describe('realm triggers while a switch runs', () => {
  it('no switch: the realm shown, no busy mark', () => {
    at({});
    const realm = screen.getByRole('button', { name: / Realm$/ });
    expect(realm.querySelector('[data-hub-switch-busy]')).toBeNull();
    expect(realm).toHaveTextContent('Alpha');
    expect(realm.querySelector('.rc-red')).not.toBeNull();
    const chip = screen.getByRole('button', { name: / Realm and computer$/ });
    expect(chip.querySelector('[data-hub-switch-busy]')).toBeNull();
  });

  it('switching to another realm: the realm the page shows stays, busy, and the name says where the Hub is going', () => {
    at({ switchingTo: B });
    const realm = screen.getByRole('button', { name: / Realm, switching to Beta$/ });
    expect(realm).not.toHaveAttribute('aria-disabled');
    expect(realm).toHaveTextContent('Alpha');
    expect(realm).not.toHaveTextContent('Beta');
    expect(realm.querySelector('.rc-red')).not.toBeNull();
    expect(realm.querySelector('.rc-blue')).toBeNull();
    expect(realm.querySelector('[data-hub-switch-busy]')).not.toBeNull();
    const chip = screen.getByRole('button', { name: / Realm and computer, switching to Beta$/ });
    expect(chip).not.toHaveAttribute('aria-disabled');
    expect(chip).toHaveTextContent('Alpha');
    expect(chip.querySelector('.rc-red')).not.toBeNull();
    expect(chip.querySelector('[data-hub-switch-busy]')).not.toBeNull();
  });

  it('switching to All realms says so; the trigger still shows the realm the page shows', () => {
    at({ switchingTo: 'all' });
    const realm = screen.getByRole('button', { name: / Realm, switching to All realms$/ });
    expect(realm).toHaveTextContent('Alpha');
  });

  it('the phone chip with a computer keeps the computer and still marks the switch', () => {
    at({ switchingTo: B, computers: [{ id: 'c1', name: 'Box' }], computerId: 'c1' });
    const chip = screen.getByRole('button', { name: / Realm and computer, switching to Beta$/ });
    expect(chip).toHaveTextContent('Box');
    expect(chip.querySelector('[data-hub-switch-busy]')).not.toBeNull();
  });
});

function Probe() {
  return <p data-testid="to">{useShellData().switchingTo ?? '-'}</p>;
}

describe('LiveShellData: which of core’s switches the shell shows', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    queryClient.clear();
    bootFixtureCore({ rules: [] });
  });
  afterEach(() => {
    act(() => setSwitching(null));
    vi.useRealTimers();
  });
  const mount = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <LiveShellData>
          <Probe />
        </LiveShellData>
      </QueryClientProvider>,
    );
  const shown = () => screen.getByTestId('to').textContent;
  const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

  it('a switch shows only once it has run SWITCH_SHOW_MS, and clears at once when it ends', async () => {
    mount();
    expect(SWITCH_SHOW_MS).toBe(300);
    act(() => pick(B));
    expect(shown()).toBe('-');
    await wait(SWITCH_SHOW_MS - 1);
    expect(shown()).toBe('-');
    await wait(1);
    expect(shown()).toBe(B);
    act(() => setSwitching(null));
    expect(shown()).toBe('-');
  });

  it('a newer pick before the line shows keeps the first pick\'s delay', async () => {
    mount();
    act(() => pick(B));
    await wait(200);
    act(() => pick(C));
    await wait(SWITCH_SHOW_MS - 200 - 1);
    expect(shown()).toBe('-');
    await wait(1);
    expect(shown()).toBe(C);
  });

  it('a fast switch never shows', async () => {
    mount();
    act(() => pick(B));
    await wait(200);
    act(() => setSwitching(null));
    await wait(SWITCH_SHOW_MS * 3);
    expect(shown()).toBe('-');
  });

  it('a newer pick while one shows follows at once; a new switch after one ended waits again', async () => {
    mount();
    act(() => pick(B));
    await wait(SWITCH_SHOW_MS);
    act(() => pick(C));
    expect(shown()).toBe(C);
    act(() => setSwitching(null));
    act(() => pick(B));
    expect(shown()).toBe('-');
    await wait(SWITCH_SHOW_MS);
    expect(shown()).toBe(B);
  });

  // A suspension bumps the generation while the probe still runs: core clears that probe's `switching` only when it
  // ends (realm.ts stale()). A committed switch clears it before its bump.
  it('a switch whose generation moved shows no longer; a newer pick after it shows again', async () => {
    mount();
    act(() => pick(B));
    await wait(SWITCH_SHOW_MS);
    expect(shown()).toBe(B);
    act(() => void bump('suspended'));
    expect(shown()).toBe('-');
    await wait(SWITCH_SHOW_MS * 3);
    expect(shown()).toBe('-');
    act(() => pick(C));
    await wait(SWITCH_SHOW_MS);
    expect(shown()).toBe(C);
  });

  // A retry of the same realm after the dead probe is a new switch (the revision moves), so it shows.
  it('a retry of the same realm after a dead probe shows', async () => {
    mount();
    act(() => pick(B));
    await wait(SWITCH_SHOW_MS);
    act(() => void bump('suspended'));
    expect(shown()).toBe('-');
    act(() => pick(B));
    await wait(SWITCH_SHOW_MS);
    expect(shown()).toBe(B);
  });

  it('a probe that dies before it shows never shows, and a retry waits its delay', async () => {
    mount();
    act(() => pick(B));
    await wait(100);
    act(() => void bump('suspended'));
    await wait(SWITCH_SHOW_MS * 3);
    expect(shown()).toBe('-');
    act(() => setSwitching(null));
    act(() => pick(B));
    await wait(SWITCH_SHOW_MS - 1);
    expect(shown()).toBe('-');
    await wait(1);
    expect(shown()).toBe(B);
  });
});
