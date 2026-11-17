// The account menu turns Performance mode on and off for this browser, as a checkbox item under Appearance;
// a toast says which, and the item shows the state.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-aria-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERF_KEY } from '@kit/perf';
import perfStrings from '@kit/perf.strings.en.json';
import { Toaster } from '@kit/states/Toast';
import { ShellDataProvider } from './context';
import { PagesProvider } from './pageLinks';
import { AccountMenu } from './Switchers';

vi.mock('@core', () => ({ useCan: () => true }));

function mount() {
  render(
    <RouterProvider navigate={vi.fn()}>
      <PagesProvider pages={[]}>
        <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], account: { name: 'Ada' } }}>
          <AccountMenu />
          <Toaster />
        </ShellDataProvider>
      </PagesProvider>
    </RouterProvider>,
  );
}
const press = async (el: Element) => act(async () => { fireEvent.click(el); });
const item = () => screen.getByRole('menuitemcheckbox', { name: perfStrings['perf.label'] });

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-hx-perf');
});
afterEach(() => document.documentElement.removeAttribute('data-hx-perf'));

describe('account menu: Performance mode', () => {
  it('a checkbox item after the theme items: pressing turns it on, says so, and the item shows checked', async () => {
    mount();
    await press(screen.getByRole('button', { name: 'Account menu' }));
    expect(item()).toHaveAttribute('aria-checked', 'false');
    const all = Array.from(document.querySelectorAll('[role^="menuitem"]')).map((el) => el.textContent?.trim());
    expect(all.indexOf(perfStrings['perf.label'])).toBeGreaterThan(all.findIndex((x) => x?.startsWith('Dark')));
    await press(item());
    expect(document.documentElement.getAttribute('data-hx-perf')).toBe('on');
    expect(localStorage.getItem(PERF_KEY)).toBe('1');
    expect(await screen.findByText(perfStrings['perf.on'])).toBeInTheDocument();
    expect(item()).toHaveAttribute('aria-checked', 'true');
  });

  it('pressing it again turns it off once (one toggle per press)', async () => {
    document.documentElement.setAttribute('data-hx-perf', 'on');
    localStorage.setItem(PERF_KEY, '1');
    mount();
    await press(screen.getByRole('button', { name: 'Account menu' }));
    expect(item()).toHaveAttribute('aria-checked', 'true');
    await press(item());
    expect(document.documentElement.hasAttribute('data-hx-perf')).toBe(false);
    expect(localStorage.getItem(PERF_KEY)).toBeNull();
    expect(await screen.findByText(perfStrings['perf.off'])).toBeInTheDocument();
  });
});
