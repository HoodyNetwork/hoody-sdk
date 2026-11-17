// Vitest: on a live transport the page never reads the fixture world for its computer (the terminal Hub has
// its own guard in src/term/app/live-pages.term.test.tsx). A chosen computer the shell's list does not hold reads as
// unnamed and running, never as the fixture computer of the same id.
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { chooseComputer, dropComputer, fixtureWorld } from '@core';
import { installTransport } from '@core/transport';
import type { ShellData } from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the live computer read, not page code
import { ShellDataProvider } from '@shell/context';
import { useComputer } from './data';

const base: ShellData = { realms: [], realmId: 'all', computers: [] };
const live = () => {
  const wrapper = ({ children }: { children: ReactNode }) => <ShellDataProvider value={base}>{children}</ShellDataProvider>;
  return renderHook(() => useComputer(), { wrapper }).result.current;
};

afterEach(() => { installTransport(null); dropComputer(); });

describe('programs: the live computer read', () => {
  it('reads a chosen computer the list does not hold as unnamed and running, never from fixtures', () => {
    const w = fixtureWorld.computers[0]!;
    chooseComputer(w);
    installTransport(null);
    expect(live().data).toEqual({ name: '', handle: '', running: true });
  });
});
