// The account menu offers Account settings and Billing inside the Hub when those pages are served,
// and leaves them out when they are hidden (never a link that lands on Not Found or on another Hub).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider } from './context';
import { PagesProvider } from './pageLinks';
import { AccountMenu } from './Switchers';

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;

async function openMenu(pages: PageManifest[]) {
  render(
    <PagesProvider pages={pages}>
      <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], account: { name: 'Ada' } }}>
        <AccountMenu />
      </ShellDataProvider>
    </PagesProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
  });
}

afterEach(() => vi.restoreAllMocks());

describe('AccountMenu links', () => {
  it('served pages link inside the Hub', async () => {
    await openMenu([pg('account'), pg('billing')]);
    expect(screen.getByRole('menuitem', { name: 'Account settings' })).toHaveAttribute('href', '/account');
    expect(screen.getByRole('menuitem', { name: 'Billing' })).toHaveAttribute('href', '/billing');
  });
  it('hidden pages have no entry', async () => {
    await openMenu([pg('home')]);
    expect(screen.queryByRole('menuitem', { name: 'Billing' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Account settings' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  });
});
