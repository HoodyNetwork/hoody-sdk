// With text in the field Jump to shows one list, best first: a synonym or a typo finds the passcode
// lock, a page comes before a place on a page of the same name, the place shows its page, the arrow keys move the active
// row and Enter goes where it says.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { CommandPalette } from './CommandPalette';
import type { DeepEntry } from './search/types';

const DEEP: DeepEntry[] = [
  { page: 'account', kind: 'faq', label: 'What does the lock protect?', to: '#faq-lockProtects', words: 'passcode screen' },
  { page: 'account', kind: 'setting', label: 'No passcode', to: '?section=passcode', under: 'Passcode lock', words: '' },
  { page: 'account', kind: 'section', label: 'Passcode lock', to: '?section=passcode', words: '' },
  { page: 'account', kind: 'section', label: 'Billing', to: '?section=elsewhere', words: '' },
];
vi.mock('./search/deep', () => ({ loadDeep: () => Promise.resolve(DEEP) }));

const pages = [
  { id: 'billing', path: '/billing', title: 'title', strings: { title: 'Billing', nav: 'Billing' }, status: 'ready', nav: { icon: 'home', group: 'account', label: 'nav' } },
  { id: 'account', path: '/account', title: 'title', strings: { title: 'Account', nav: 'Account' }, status: 'ready', nav: { icon: 'home', group: 'account', label: 'nav' } },
] as unknown as PageManifest[];

async function open() {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <CommandPalette pages={pages} isOpen onOpenChange={() => {}} /> }),
    history: createMemoryHistory({ initialEntries: ['/billing'] }),
  });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  const navigate = vi.spyOn(router, 'navigate');
  await userEvent.click(screen.getByRole('searchbox'));
  await act(async () => {}); // the index has loaded
  return navigate;
}

const rows = () => screen.getAllByRole('menuitem').map((e) => e.textContent);
const active = () => screen.getAllByRole('menuitem').find((e) => e.getAttribute('data-focused') === 'true')?.textContent;

describe('CommandPalette ranking', () => {
  it('passcode: the section first, then its row, then the question that mentions it; each shows its page', async () => {
    await open();
    await userEvent.keyboard('passcode');
    expect(rows()).toEqual(['Passcode lockAccount', 'No passcodeAccount · Passcode lock', 'What does the lock protect?Account']);
    expect(screen.getByText('Best matches')).toBeInTheDocument();
  });

  it('a synonym (PIN) and a typo (pascode) find the passcode lock first', async () => {
    await open();
    await userEvent.keyboard('PIN');
    expect(rows()[0]).toBe('Passcode lockAccount');
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.keyboard('pascode');
    expect(rows()[0]).toBe('Passcode lockAccount');
  });

  it('a page comes before a place on a page with the same name', async () => {
    await open();
    await userEvent.keyboard('billing');
    expect(rows()).toEqual(['Billing', 'BillingAccount']);
  });

  it('the arrow keys move the active row and Enter goes there', async () => {
    const navigate = await open();
    await userEvent.keyboard('passcode');
    expect(active()).toBe('Passcode lockAccount');
    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toBe('No passcodeAccount · Passcode lock');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(navigate.mock.calls[0]?.[0]).toMatchObject({ href: '/account#faq-lockProtects' });
  });

  it('an empty field shows the groups again, with no deep rows', async () => {
    await open();
    await userEvent.keyboard('pass');
    await userEvent.clear(screen.getByRole('searchbox'));
    expect(screen.queryByText('Best matches')).toBeNull();
    expect(screen.getByText('Pages')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^Passcode lock/ })).toBeNull();
  });
});
