// The account menu links the referral program as "Earn · Affiliates",
// right after Billing, only while this load serves the Referrals page.
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { RouterProvider } from 'react-aria-components';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider } from './context';
import { PagesProvider } from './pageLinks';
import { AccountMenu } from './Switchers';

vi.mock('@core', () => ({ useCan: () => true }));

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const navigate = vi.fn();

function mount(node: ReactNode, pages: PageManifest[]) {
  render(
    <RouterProvider navigate={navigate}>
      <PagesProvider pages={pages}>
        <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], account: { name: 'Ada' } }}>{node}</ShellDataProvider>
      </PagesProvider>
    </RouterProvider>,
  );
}
const press = async (el: Element) => act(async () => { fireEvent.click(el); });
const names = () => Array.from(document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')).map((el) => el.textContent?.trim());

afterEach(() => {
  navigate.mockReset();
});

describe('account menu: Earn · Affiliates', () => {
  it('a served Referrals page: the item follows Billing, links /referrals and opens it inside the Hub', async () => {
    mount(<AccountMenu />, [pg('account'), pg('billing'), pg('referrals')]);
    await press(screen.getByRole('button', { name: 'Account menu' }));
    const item = screen.getByRole('menuitem', { name: 'Earn · Affiliates' });
    expect(item).toHaveAttribute('href', '/referrals');
    const list = names();
    expect(list.indexOf('Earn · Affiliates')).toBe(list.indexOf('Billing') + 1);
    await press(item);
    expect(navigate).toHaveBeenCalledWith('/referrals', undefined);
  });

  it('a hidden Referrals page: no item, and Billing is unchanged', async () => {
    mount(<AccountMenu />, [pg('account'), pg('billing')]);
    await press(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.queryByRole('menuitem', { name: 'Earn · Affiliates' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Billing' })).toHaveAttribute('href', '/billing');
  });

  it('Referrals served without Billing: the item still shows, with the separator before Appearance', async () => {
    mount(<AccountMenu />, [pg('referrals')]);
    await press(screen.getByRole('button', { name: 'Account menu' }));
    const item = screen.getByRole('menuitem', { name: 'Earn · Affiliates' });
    expect(item).toHaveAttribute('href', '/referrals');
    // The separator under the links counts Earn, so Earn alone still gets it (3 separators: here, above Language and
    // above Keyboard shortcuts).
    const seps = Array.from(document.querySelectorAll('[role="separator"]'));
    expect(seps).toHaveLength(3);
    expect(item.compareDocumentPosition(seps[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('no served account pages: no leading separator (only the ones above Language and Keyboard shortcuts)', async () => {
    mount(<AccountMenu />, []);
    await press(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.queryByRole('menuitem', { name: 'Earn · Affiliates' })).toBeNull();
    expect(document.querySelectorAll('[role="separator"]')).toHaveLength(2);
    expect(screen.getByRole('menu').firstElementChild).not.toHaveAttribute('role', 'separator');
  });
});
