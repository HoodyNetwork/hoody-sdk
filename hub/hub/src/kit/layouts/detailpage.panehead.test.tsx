// Vitest: in a ListDetail pane DetailPage draws a
// DetailHeader, not a PageHeader. The page's `primary` is still its one main action, so the pane draws it as the last
// action button (after `actions`, before the ⋯ menu); `primaryQuiet` styles it there as on the full page. The leading
// element sits before the name in both. Breadcrumbs and
// `size` are full-page only: the pane draws none of them.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../controls/Button';
import { DetailPage, type DetailPageProps } from './Layouts';
import overlayStrings from '../overlays/strings.en.json';
import { DetailPaneContext } from './pane';

async function mount(el: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const PANE = { mode: 'fill' as const, listHidden: false, toggleList: () => undefined, close: () => undefined };

function Detail({ header, pane, menuLabel }: { header: DetailPageProps['header']; pane: boolean; menuLabel?: string }) {
  const page = (
    <DetailPage header={header} menu={[{ id: 'rename', label: 'Rename', onAction: () => undefined }]} menuLabel={menuLabel}>
      <p>the body</p>
    </DetailPage>
  );
  return pane ? <DetailPaneContext.Provider value={PANE}>{page}</DetailPaneContext.Provider> : page;
}

const header = () => document.querySelector('header') as HTMLElement;
const named = (el: HTMLElement) => el.getAttribute('aria-label') ?? el.textContent ?? '';

describe('DetailPage in a pane: the header', () => {
  it('header.menu is refused by the type: the ⋯ is DetailPage\'s own `menu` prop', () => {
    // @ts-expect-error menu is not a header prop of DetailPage
    const h: DetailPageProps['header'] = { title: 'atlas', menu: <span /> };
    expect(h.title).toBe('atlas');
  });

  it('menuLabel names the ⋯ menu, in the pane and on the full page; in the pane it ends the header', async () => {
    await mount(() => <Detail pane header={{ title: 'atlas' }} menuLabel="Actions for atlas" />);
    const buttons = within(header()).getAllByRole('button').map(named);
    expect(buttons.at(-1)).toMatch(/^Actions for atlas/);
    expect(buttons.some((b) => b.startsWith(overlayStrings.more))).toBe(false);
  });

  it('menuLabel names the full page\'s ⋯ menu too; it is the PageHeader menu (kept on the title row), a ghost like the pane\'s', async () => {
    await mount(() => <Detail pane={false} header={{ title: 'atlas', actions: <Button>Open</Button> }} menuLabel="Actions for atlas" />);
    const more = within(header()).getByRole('button', { name: /^Actions for atlas/ });
    expect(more.closest('[data-head-menu]')).not.toBeNull();
    expect(more.className).not.toMatch(/\bmore\b/);
    expect(within(header()).getAllByRole('button').map(named).at(-1)).toMatch(/^Actions for atlas/);
  });

  it('draws the primary as the last action button, after the page actions, and it presses', async () => {
    const onPress = vi.fn();
    await mount(() => <Detail pane header={{ title: 'Plan', actions: <Button variant="secondary">Export</Button>, primary: { label: 'Upgrade', icon: 'plus', onPress } }} />);
    const buttons = within(header()).getAllByRole('button').map(named);
    const up = buttons.indexOf('Upgrade');
    expect(up).toBeGreaterThan(buttons.indexOf('Export'));
    expect(buttons.indexOf('Export')).toBeGreaterThanOrEqual(0);
    // The ⋯ menu ends the header (DetailHeader: actions, the pane control, then the menu last), so the focus order is
    // actions, primary, pane control, menu.
    expect(buttons.at(-1)).toBe(overlayStrings.more);
    expect(buttons.indexOf(overlayStrings.more)).toBeGreaterThan(up);
    const btn = within(header()).getByRole('button', { name: 'Upgrade' });
    expect(btn.className).toMatch(/primary/);
    await act(async () => fireEvent.click(btn));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a disabled primary is disabled in the pane; primaryQuiet styles it secondary', async () => {
    await mount(() => <Detail pane header={{ title: 'Plan', primaryQuiet: true, primary: { label: 'Upgrade', onPress: () => undefined, isDisabled: true } }} />);
    const btn = within(header()).getByRole('button', { name: 'Upgrade' });
    expect(btn).toBeDisabled();
    expect(btn.className).toMatch(/secondary/);
    expect(btn.className).not.toMatch(/\bprimary/);
  });

  it('without a primary the pane header keeps only the page actions', async () => {
    await mount(() => <Detail pane header={{ title: 'Plan', actions: <Button variant="secondary">Export</Button> }} />);
    expect(within(header()).getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(within(header()).queryByRole('button', { name: 'Upgrade' })).toBeNull();
  });

  // The pane keeps `leading`, so a page can put its colour mark
  // before the name. Breadcrumbs stay full-page only.
  it('breadcrumbs are full-page only; the leading element sits before the name on the title line in the pane', async () => {
    const h = { title: 'Plan', breadcrumbs: [{ label: 'Billing', href: '#/billing' }], leading: <span data-testid="lead">L</span> };
    await mount(() => <Detail pane header={h} />);
    expect(screen.queryByRole('list', { name: 'Breadcrumbs' })).toBeNull();
    const lead = screen.getByTestId('lead');
    const title = within(header()).getByRole('heading', { level: 2, name: 'Plan' });
    // Same line, before the h2 (the mark is read before the name, as on the full page).
    expect(lead.closest('[data-detail-leading]')?.parentElement).toBe(title.parentElement);
    expect(lead.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('the body')).toBeInTheDocument();
  });

  it('without a leading element the pane title line holds no leading slot', async () => {
    await mount(() => <Detail pane header={{ title: 'Plan' }} />);
    expect(header().querySelector('[data-detail-leading]')).toBeNull();
  });

  it('the full page still draws breadcrumbs, the leading element and the primary', async () => {
    const h = { title: 'Plan', breadcrumbs: [{ label: 'Billing', href: '#/billing' }], leading: <span data-testid="lead">L</span>, primary: { label: 'Upgrade', onPress: () => undefined } };
    await mount(() => <Detail pane={false} header={h} />);
    expect(screen.getByRole('list', { name: 'Breadcrumbs' })).toBeInTheDocument();
    expect(screen.getByTestId('lead')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeInTheDocument();
  });
});
