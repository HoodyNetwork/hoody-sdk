// Ask's links to other pages and its computer menu: a served page is a router link (keeping the place), a hidden
// one draws nothing (no classic view); the menu rows read "name · server".
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider, type ShellData } from '../shell/context';
import { PagesProvider } from '../shell/pageLinks';
import { NoComputer, PickComputer } from './AskPanel';
import { useToPage, type AskPage } from './links';

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const shell = (o: Partial<ShellData> = {}): ShellData => ({ realms: [], realmId: 'r1', computers: [], ...o });

async function mount(el: ReactElement, pages: PageManifest[] | null, data: ShellData = shell()) {
  const inner = <ShellDataProvider value={data}>{el}</ShellDataProvider>;
  const Component = () => (pages ? <PagesProvider pages={pages}>{inner}</PagesProvider> : inner);
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

function To({ page, path }: { page: AskPage; path: string }) {
  const toPage = useToPage();
  return <div data-testid="to">{toPage(page, path, 'Go there')}</div>;
}

describe('Ask links to other pages', () => {
  it('a served page is a router link that keeps the place under it', async () => {
    await mount(<To page="computers" path="/computers?sel=alpha.ab12" />, [pg('computers')]);
    expect(screen.getByRole('link', { name: 'Go there' }).getAttribute('href')).toBe('/computers?sel=alpha.ab12');
  });
  it('a hidden page draws nothing (no link that lands on Not Found, no button to another Hub)', async () => {
    await mount(<To page="ai" path="/ai" />, [pg('home')]);
    expect(screen.queryByRole('link', { name: 'Go there' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Go there' })).toBeNull();
  });
  it('a path that only looks like it is under the page goes to the page itself (placeUnder)', async () => {
    await mount(<To page="computers" path="/computers/../keys" />, [pg('computers')]);
    expect(screen.getByRole('link', { name: 'Go there' }).getAttribute('href')).toBe('/computers');
  });
  it('a path outside the page goes to the page itself', async () => {
    await mount(<To page="guide" path="/elsewhere#x" />, [pg('guide')]);
    expect(screen.getByRole('link', { name: 'Go there' }).getAttribute('href')).toBe('/guide');
  });
});

describe('Pick a computer menu', () => {
  it('rows read "name · server", never a raw placeholder', async () => {
    const data = shell({ computers: [{ id: 'c1', name: 'alpha', location: 'Singapore · sg-2' }, { id: 'c2', name: 'beta' }], setComputer: () => {} });
    await mount(<PickComputer />, [pg('computers')], data);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Pick a computer/ })); });
    const rows = screen.getAllByRole('menuitem').map((el) => el.textContent ?? '');
    expect(rows.some((r) => r.includes('alpha · Singapore · sg-2'))).toBe(true);
    expect(rows.some((r) => r.includes('beta'))).toBe(true);
    expect(rows.join(' ')).not.toMatch(/[{}]/);
  });
  it('with no computer list: the Computers link only where the page has somewhere to go', async () => {
    await mount(<PickComputer />, [pg('computers')], shell());
    expect(screen.getByRole('link', { name: 'Open Computers' }).getAttribute('href')).toBe('/computers');
  });
  it('with no computer list and the Computers page hidden: nothing to press (no link, no button)', async () => {
    await mount(<PickComputer />, [pg('home')], shell());
    expect(screen.queryByRole('link', { name: 'Open Computers' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open Computers' })).toBeNull();
  });
  it('with a list but no way to choose (no setComputer): the Computers link, not the menu', async () => {
    await mount(<PickComputer />, [pg('computers')], shell({ computers: [{ id: 'c1', name: 'alpha' }] }));
    expect(screen.getByRole('link', { name: 'Open Computers' }).getAttribute('href')).toBe('/computers');
    expect(screen.queryByRole('button', { name: /Pick a computer/ })).toBeNull();
  });
});

describe('no computer yet: "none" only from a whole read that succeeded (C9)', () => {
  it('while the shell\'s list loads it shows loading, never "no computers"', async () => {
    await mount(<NoComputer realmName="Acme" />, [pg('computers')], shell({ computersRead: 'loading' }));
    expect(screen.queryByText(/Acme has no computers yet/)).toBeNull();
    expect(document.querySelector('[aria-busy="true"], [data-skeleton]')).toBeTruthy();
  });
  it('a failed read says the list did not load, with the shell\'s Try again', async () => {
    const retry = vi.fn();
    await mount(<NoComputer realmName="Acme" />, [pg('computers')], shell({ computersRead: 'unknown', retryComputers: retry }));
    expect(screen.queryByText(/Acme has no computers yet/)).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Try again/ })); });
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it('All realms offers the pick, whatever the list read says', async () => {
    await mount(<NoComputer realmName="Acme" />, [pg('computers')], shell({ realmId: 'all', computersRead: 'unknown' }));
    expect(screen.getByText('Pick a computer to ask its agent')).toBeTruthy();
    expect(screen.queryByText(/Couldn't load/)).toBeNull();
  });
  it('a whole read with no computers says none', async () => {
    await mount(<NoComputer realmName="Acme" />, [pg('computers')], shell());
    expect(screen.getByText(/Acme has no computers yet/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Get a computer' }).getAttribute('href')).toBe('/computers');
  });
  it('a whole read with no computers and the Computers page hidden offers nothing to press', async () => {
    await mount(<NoComputer realmName="Acme" />, [pg('home')], shell());
    expect(screen.getByText(/Acme has no computers yet/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Get a computer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Get a computer' })).toBeNull();
    expect(document.querySelector('.emptyActions'), 'no empty action row').toBeNull();
  });
});
