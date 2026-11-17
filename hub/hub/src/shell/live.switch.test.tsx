// The realm menu's pick (LiveShellData's setRealm) goes through the shell's switchOp on the real core, so the switch
// line's Cancel and Esc can end it.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { queryClient } from '@core';
import { realm as selected, snapshot } from '@core/ctx';
import { boot, deferred, onFetch, R1, R2, settle } from '@core/test/env';
import { type ShellData, useShellData } from './context';
import { LiveShellData } from './live';
import { cancelSwitch } from './switchOp';

afterEach(() => cleanup());

it('a realm picked in the menu is cancelled from the switch line: nothing commits', async () => {
  boot({ realm: R1 });
  queryClient.clear();
  const slow = deferred();
  onFetch(async (c) => {
    // The realm probe waits; every other read answers at once.
    if (c.url.includes('/projects')) await slow.p;
    return { status: 200, body: { data: {} } };
  });
  let data: ShellData | null = null;
  function Grab() {
    data = useShellData();
    return null;
  }
  render(
    <QueryClientProvider client={queryClient}>
      <LiveShellData>
        <Grab />
      </LiveShellData>
    </QueryClientProvider>,
  );
  const pick = (data as ShellData | null)?.setRealm;
  expect(pick).toBeTypeOf('function');
  act(() => pick?.(R2));
  expect(snapshot().switching).toBe(R2);
  let cancelled = false;
  act(() => {
    cancelled = cancelSwitch();
  });
  expect(cancelled).toBe(true);
  expect(snapshot().switching).toBe(null);
  slow.res();
  await settle();
  expect(selected()).toBe(R1);
});
