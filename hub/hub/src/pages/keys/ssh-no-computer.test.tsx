// Keys > SSH key with no computer in the top bar: the shell's no-computer state (shell/ComputerRequired). With
// computers listed it asks for the pick in the tab's own words; with none at all it says so, with Get a computer; while
// the shell's list is not known it never says either.
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab (its parts read the location), not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { bootFixtureCore, queryClient } from '@core';
import type { ShellData } from '@kit';
import type { PageManifest } from '@kit/page';
import type * as Nav from '@kit/nav';
// eslint-disable-next-line no-restricted-imports -- the shell's data and link providers, a test harness, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- the shell's data and link providers, a test harness, not page code
import { PagesProvider } from '@shell/pageLinks';
// eslint-disable-next-line no-restricted-imports -- the shell's own words, to find its state, not page code
import shellStrings from '@shell/strings.en.json';
import { describe, expect, it, vi } from 'vitest';
import { SshTab } from './parts/SshTab';
import strings from './strings.en.json';

const go = vi.fn();
vi.mock('@kit/nav', async (orig) => ({ ...(await orig<typeof Nav>()), useGo: () => go }));

const served = (...ids: string[]) => ids.map((id) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest);
const shell = (d: Partial<ShellData>): ShellData => ({ realms: [], realmId: 'all', computers: [], ...d });

async function open(d: Partial<ShellData>) {
  bootFixtureCore({ rules: [], target: null });
  queryClient.clear();
  const router = createRouter({ routeTree: createRootRoute({ component: SshTab }), history: createMemoryHistory({ initialEntries: ['/keys/ssh'] }) });
  await act(async () => {
    render(
      <PagesProvider pages={served('keys', 'computers')}>
        <ShellDataProvider value={shell(d)}>
          <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>
        </ShellDataProvider>
      </PagesProvider>,
    );
    await router.load();
  });
}

describe('Keys > SSH key with no computer chosen', () => {
  it('computers listed: the tab\'s own pick words and Open Computers', async () => {
    await open({ computers: [{ id: 'c1', name: 'atlas' }] });
    expect(await screen.findByText(strings['ssh.noComputer.title'])).toBeInTheDocument();
    expect(screen.getByText(strings['ssh.noComputer.body'])).toBeInTheDocument();
    expect(screen.getByRole('link', { name: strings['ssh.noComputer.action'] })).toBeInTheDocument();
    expect(screen.queryByText(shellStrings['cr.empty.title'])).toBeNull();
  });

  it('no computer at all: "No computers yet" and one Get a computer to the Computers page\'s drawer', async () => {
    go.mockClear();
    await open({});
    expect(await screen.findByText(shellStrings['cr.empty.title'])).toBeInTheDocument();
    expect(screen.queryByText(strings['ssh.noComputer.title'])).toBeNull();
    expect(screen.queryByRole('link', { name: strings['ssh.noComputer.action'] })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: shellStrings['cr.getComputer'] }));
    expect(go).toHaveBeenCalledWith('/computers?get=1');
  });

  it('the list still loading: neither words', async () => {
    await open({ computersRead: 'loading' });
    expect(screen.queryByText(shellStrings['cr.empty.title'])).toBeNull();
    expect(screen.queryByText(strings['ssh.noComputer.title'])).toBeNull();
  });
});
