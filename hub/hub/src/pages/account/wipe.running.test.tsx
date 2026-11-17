// Remove all local data names work still running from this tab on its own line (core counts it; a confirm
// with more running than the line said is refused as 'changed').
// eslint-disable-next-line no-restricted-imports -- a router for a part rendered without its page (its FaqLink reads the location), not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { LocalWipeWarning } from '@core';
import strings from './strings.en.json';

const h = vi.hoisted(() => ({ warning: null as LocalWipeWarning | null }));
vi.mock('./data', async (orig) => ({
  ...(await orig<object>()),
  useLocalWipe: () => ({ warning: h.warning, run: () => Promise.resolve({ kind: 'failed' }), reread: () => undefined }),
}));
import { WipeDialog } from './parts/WipeSection';

const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: ['/account'] }) });
const wrapper = ({ children }: { children: ReactNode }) => <RouterContextProvider router={router}>{children}</RouterContextProvider>;
const base: LocalWipeWarning = { account: 'u1', holds: [], asks: [], payments: 'settled' };
const line = (n: number) => strings[n === 1 ? 'w.running_one' : 'w.running_other'].replace('{{count}}', String(n));

describe('the wipe confirm names running work', () => {
  it('one or more running: its line; none or absent: no line, and no tick either way', () => {
    h.warning = { ...base, running: 2 };
    const { unmount } = render(<WipeDialog open onClose={() => undefined} />, { wrapper });
    expect(screen.getByText(line(2))).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    unmount();
    h.warning = { ...base, running: 1 };
    const r2 = render(<WipeDialog open onClose={() => undefined} />, { wrapper });
    expect(screen.getByText(line(1))).toBeInTheDocument();
    r2.unmount();
    for (const w of [{ ...base, running: 0 }, base]) {
      h.warning = w;
      const r = render(<WipeDialog open onClose={() => undefined} />, { wrapper });
      expect(screen.queryByText(line(1))).not.toBeInTheDocument();
      expect(screen.queryByText(/still running from this tab/)).not.toBeInTheDocument();
      r.unmount();
    }
  });
});
