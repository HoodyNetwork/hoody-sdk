// Vitest: the page's view switch. DetailPage (both branches), ListDetailPage and TablePage
// draw it at the same place, under the header and above the banner, so the bar keeps its y when a switch changes the
// layout; it is a bar-only tablist whose choice goes to the page; without `views` nothing is drawn.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DetailPage, TablePage } from './Layouts';
import { ListDetailPage } from './ListDetailPage';
import { DetailPaneContext } from './pane';
import type { TabItem } from '../controls/Tabs';
import type { PageView, PageViews } from './views';

async function mount(el: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const PANE = { mode: 'fill' as const, listHidden: false, toggleList: () => undefined, close: () => undefined };

const viewsOf = (onChange: (id: string) => void = () => undefined): PageViews => ({
  label: 'View',
  value: 'plans',
  onChange,
  items: [
    { id: 'plans', label: 'Plans' },
    { id: 'servers', label: 'Servers' },
    { id: 'wallet', label: 'Wallet', isDisabled: true },
  ],
});

type Kind = 'detail' | 'pane' | 'list' | 'table';

function Page({ kind, views }: { kind: Kind; views?: PageViews }) {
  if (kind === 'table')
    return (
      <TablePage header={{ title: 'Billing' }} views={views} notice={<p>the banner</p>}>
        <p>the body</p>
      </TablePage>
    );
  if (kind === 'list')
    return <ListDetailPage mode="fill" header={{ title: 'Billing' }} views={views} banner={<p>the banner</p>} list={<p>the body</p>} detail={null} />;
  const page = (
    <DetailPage header={{ title: 'Billing' }} views={views} banner={<p>the banner</p>} notice={<p>the notice</p>}>
      <p>the body</p>
    </DetailPage>
  );
  return kind === 'pane' ? <DetailPaneContext.Provider value={PANE}>{page}</DetailPaneContext.Provider> : page;
}

/** The direct child of `root` that holds `el`. */
const slotOf = (root: Element, el: Element) => [...root.children].find((c) => c.contains(el))!;

describe('page views', () => {
  for (const kind of ['detail', 'pane', 'list', 'table'] as const) {
    it(`${kind}: header, views, banner, body, each in its own slot, in that order`, async () => {
      await mount(() => <Page kind={kind} views={viewsOf()} />);
      const title = screen.getByRole('heading', { name: 'Billing' });
      const bar = screen.getByRole('tablist', { name: 'View' });
      const banner = screen.getByText('the banner');
      const body = screen.getByText('the body');
      const page = [...document.querySelectorAll('div')].find((d) => d.contains(title) && d.contains(body) && slotOf(d, title) !== slotOf(d, body))!;
      const order = [title, bar, banner, body].map((el) => [...page.children].indexOf(slotOf(page, el)));
      expect(order.every((i) => i >= 0)).toBe(true);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(new Set(order).size).toBe(4);
    });

    it(`${kind}: a bar-only tablist; the open view is selected, a choice goes to the page, a disabled view stays shut`, async () => {
      const onChange = vi.fn();
      await mount(() => <Page kind={kind} views={viewsOf(onChange)} />);
      expect(screen.getByRole('tab', { name: 'Plans' }).getAttribute('aria-selected')).toBe('true');
      expect(screen.queryByRole('tabpanel')).toBeNull();
      await act(async () => fireEvent.click(screen.getByRole('tab', { name: 'Servers' })));
      expect(onChange).toHaveBeenCalledWith('servers');
      onChange.mockClear();
      await act(async () => fireEvent.click(screen.getByRole('tab', { name: 'Wallet' })));
      expect(onChange).not.toHaveBeenCalled();
    });

    it(`${kind}: draws nothing without views`, async () => {
      await mount(() => <Page kind={kind} />);
      expect(screen.queryByRole('tablist')).toBeNull();
      const slot = screen.getByText('the banner').parentElement!;
      expect(slot.previousElementSibling?.contains(screen.getByRole('heading', { name: 'Billing' }))).toBe(true);
    });
  }

  for (const kind of ['detail', 'list', 'table'] as const)
    it(`${kind}: a TabItem handed in as a view draws no tabpanel and no link`, async () => {
      const item: TabItem<'plans' | 'servers'> = { id: 'servers', label: 'Servers', content: <p>a panel</p>, href: '/elsewhere' };
      const views = { ...viewsOf(), items: [{ id: 'plans', label: 'Plans' }, item as unknown as PageView] };
      await mount(() => <Page kind={kind} views={views} />);
      expect(screen.queryByRole('tabpanel')).toBeNull();
      expect(screen.queryByText('a panel')).toBeNull();
      expect(screen.queryByRole('link', { name: 'Servers' })).toBeNull();
      expect(screen.getByRole('tab', { name: 'Servers' })).toBeTruthy();
    });

  it('types: a narrow view union and its state setter pass to every layout; a panel or a link is refused', () => {
    type V = 'plans' | 'servers';
    const set = (_: V) => undefined;
    const narrow: PageViews<V> = { label: 'View', value: 'plans', onChange: set, items: [{ id: 'plans', label: 'Plans' }, { id: 'servers', label: 'Servers' }] };
    const a = <DetailPage header={{ title: 'Billing' }} views={narrow}><p>x</p></DetailPage>;
    const b = <ListDetailPage mode="fill" header={{ title: 'Billing' }} views={narrow} list={null} detail={null} />;
    const c = <TablePage header={{ title: 'Billing' }} views={narrow}><p>x</p></TablePage>;
    const tab: TabItem<V> = { id: 'plans', label: 'Plans', content: <p>panel</p> };
    // @ts-expect-error a TabItem with a panel is not a view
    const bad: PageView<V> = tab;
    // @ts-expect-error a view has no link of its own
    const link: PageView<V> = { id: 'plans', label: 'Plans', href: '/x' };
    expect([a, b, c, bad, link].length).toBe(5);
  });

  it('the one-pane rule never hides the view bar', () => {
    const css = readFileSync(join(import.meta.dirname, 'ListDetailPage.module.css'), 'utf8');
    const at = css.indexOf('@container ldpage (width < 846px)');
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf('\n}\n', at))).not.toMatch(/views/);
  });
});
