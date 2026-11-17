// Vitest (computer colour): a computer's page carries ONE 4 px band in its colour, on the element that
// stays on screen. In a ListDetail pane that is the sticky DetailHeader (>= 600 px of content) or, below that where the
// header scrolls away, the sticky tab bar; on a full page (whose header never sticks) it is the tab bar at every width.
// jsdom has no layout, so the width switch is pinned in the CSS text and in the DOM contract (which element carries
// the band, and when the tab bar's band is `narrow`).
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { DetailPage } from './Layouts';
import { DetailHeader } from './ListDetailPage';
import { DetailPaneContext } from './pane';

async function mount(el: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const TABS = [
  { id: 'overview', label: 'Overview', content: <p>Overview body</p> },
  { id: 'ports', label: 'Ports', content: <p>Ports body</p> },
];
const PANE = { mode: 'fill' as const, listHidden: false, toggleList: () => undefined, close: () => undefined };

function Detail({ accent, pane }: { accent?: string; pane: boolean }) {
  const page = <DetailPage header={{ title: 'web-prod-1', subtitle: 'sub' }} tabs={TABS} accent={accent} />;
  return pane ? <DetailPaneContext.Provider value={PANE}>{page}</DetailPaneContext.Provider> : page;
}

const bands = () => [...document.querySelectorAll('[data-detail-accent], [data-tab-accent]')];
const headerBand = () => document.querySelector('header [data-detail-accent]');
const tabBand = () => document.querySelector('[data-tab-accent]');

describe('DetailPage accent', () => {
  it('pane: the header carries the band (inside the header element) and the tab bar carries a narrow-only one', async () => {
    await mount(() => <Detail accent="#4ecdc4" pane />);
    expect(headerBand()).toHaveAttribute('data-detail-accent', '#4ECDC4');
    expect(headerBand()?.getAttribute('style')).toContain('--computer: #4ECDC4');
    expect(tabBand()).toHaveAttribute('data-tab-accent', '#4ECDC4');
    expect(tabBand()).toHaveAttribute('data-accent-when', 'narrow');
    // The tab band is the first child of the sticky bar element (the one with the tablist).
    const bar = tabBand()?.parentElement as HTMLElement;
    expect(bar.firstElementChild).toBe(tabBand());
    expect(bar.querySelector('[role="tablist"]')).not.toBeNull();
  });

  it('full page: no header band; the tab bar carries the band at every width', async () => {
    await mount(() => <Detail accent="#4ECDC4" pane={false} />);
    expect(document.querySelector('[data-detail-accent]')).toBeNull();
    expect(tabBand()).toHaveAttribute('data-accent-when', 'always');
    expect(bands()).toHaveLength(1);
  });

  it('the tablist keeps the computer name; the bands are aria-hidden and hold no text', async () => {
    await mount(() => <Detail accent="#4ECDC4" pane />);
    expect(screen.getByRole('tablist', { name: 'web-prod-1' })).toBeInTheDocument();
    for (const b of bands()) {
      expect(b).toHaveAttribute('aria-hidden', 'true');
      expect(b.textContent).toBe('');
    }
  });

  it('3-digit hex is expanded; the band never takes the raw value', async () => {
    await mount(() => <Detail accent="abc" pane />);
    expect(headerBand()).toHaveAttribute('data-detail-accent', '#AABBCC');
    expect(tabBand()).toHaveAttribute('data-tab-accent', '#AABBCC');
  });

  it.each(['red', '#12345', 'url(x)', '#fff;background:url(x)', 'red;x:url()', '', undefined])('hostile or missing value %j draws no band and sets no --computer', async (bad) => {
    await mount(() => <Detail accent={bad} pane />);
    expect(bands()).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain('--computer');
    expect(document.body.innerHTML).not.toContain('url(');
  });

  it('hostile value on a full page draws no band either', async () => {
    await mount(() => <Detail accent="red;x:url()" pane={false} />);
    expect(bands()).toHaveLength(0);
  });
});

describe('DetailHeader accent (the sink normalises for itself, whoever calls it)', () => {
  it('a valid colour draws one band inside the header, expanded and upper-cased', async () => {
    await mount(() => <DetailHeader title="web-prod-1" accent="abc" />);
    expect(document.querySelectorAll('header [data-detail-accent]')).toHaveLength(1);
    expect(document.querySelector('[data-detail-accent]')).toHaveAttribute('data-detail-accent', '#AABBCC');
  });

  it.each(['red', '#12345', 'url(x)', '#fff;background:url(x)', 'red;x:url()', ''])('hostile value %j drawn directly: no band, no --computer', async (bad) => {
    await mount(() => <DetailHeader title="web-prod-1" accent={bad} />);
    expect(bands()).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain('--computer');
    expect(document.body.innerHTML).not.toContain('url(');
  });
});

describe('DetailPage accent: CSS contract', () => {
  const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');
  const tabsCss = readFileSync(join(__dirname, '..', 'controls', 'Tabs.module.css'), 'utf8');

  it('the header band is hidden by the same content query that makes the header scroll away', () => {
    const css = read('ListDetailPage.module.css');
    const narrow = css.slice(css.indexOf('@container content (width < 600px)'));
    expect(narrow).toMatch(/\.detailAccent\s*\{\s*display:\s*none;/);
  });

  it('the tab bar band is hidden at 600 px or more only when it is the narrow one', () => {
    expect(tabsCss).toMatch(/@container content \(width >= 600px\)\s*\{\s*\.accent\[data-accent-when='narrow'\]\s*\{\s*display:\s*none;/);
  });

  it('the leaves opt out of forced colour adjustment and ring with CanvasText; nothing else does', () => {
    for (const css of [read('ListDetailPage.module.css'), tabsCss]) {
      expect(css).toMatch(/@media \(forced-colors: active\)\s*\{\s*\.(detailAccent|accent)\s*\{\s*forced-color-adjust:\s*none;[^}]*canvastext/);
      expect((css.match(/forced-color-adjust/g) ?? []).length).toBe(1);
    }
  });
});
