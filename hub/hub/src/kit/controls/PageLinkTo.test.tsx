import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PagesProvider } from '../../shell/pageLinks';
import { PageLinkTo } from './PageLinkTo';

const pages = [{ id: 'computers', path: '/computers' }] as never;
const served = (ui: React.ReactElement) => render(<PagesProvider pages={pages}>{ui}</PagesProvider>);

describe('PageLinkTo', () => {
  it('a served page is a router link to the href, the page taken from its first path segment', () => {
    served(<PageLinkTo href="/computers?sel=x">Open</PageLinkTo>);
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/computers?sel=x');
  });

  it('the variant reaches the link (nav and inline look different)', () => {
    const { container } = served(<><PageLinkTo href="/computers" variant="inline">A</PageLinkTo><PageLinkTo href="/computers">B</PageLinkTo></>);
    const [a, b] = [...container.querySelectorAll('a')];
    expect(a?.className).not.toBe(b?.className);
  });

  it('page overrides the segment', () => {
    served(<PageLinkTo page="computers" href="/elsewhere/x">Open</PageLinkTo>);
    expect(screen.getByRole('link', { name: 'Open' })).toBeInTheDocument();
  });

  it('a page this load does not serve renders nothing', () => {
    const { container } = served(<PageLinkTo href="/keys">Open</PageLinkTo>);
    expect(container).toBeEmptyDOMElement();
  });

  it('plain keeps the label as text when nothing is served', () => {
    const { container } = served(<PageLinkTo href="/keys" plain>Keys</PageLinkTo>);
    expect(container.textContent).toBe('Keys');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('outside an app shell every page is served (as usePageLink answers)', () => {
    render(<PageLinkTo href="/keys">Keys</PageLinkTo>);
    expect(screen.getByRole('link', { name: 'Keys' })).toHaveAttribute('href', '/keys');
  });
});
