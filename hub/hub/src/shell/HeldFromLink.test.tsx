// A "held on <page>" link names the page that sent a held change. It must not exist when this load hides
// that page (no page link does, as there is no classic Hub; HeldFromLink keeps its own served-only hook).
// useServedPageLink is the served-only form of usePageLink; HeldFromLink is the shared part pages use.
import { render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { PageManifest } from '@kit/page';
import { HeldFromLink } from './HeldFromLink';
import { PagesProvider, usePageLink, useServedPageLink } from './pageLinks';

const pg = (id: string, status: 'ready' | 'preview' = 'ready') =>
  ({ id, path: `/${id}`, title: id, strings: {}, status }) as unknown as PageManifest;
const served = (pages: PageManifest[]) => ({ children }: { children: ReactNode }) => <PagesProvider pages={pages}>{children}</PagesProvider>;

describe('useServedPageLink', () => {
  it('a hidden page gives null, as usePageLink does', () => {
    const wrapper = served([pg('home')]);
    expect(renderHook(() => usePageLink('keys'), { wrapper }).result.current).toBeNull();
    expect(renderHook(() => useServedPageLink('keys'), { wrapper }).result.current).toBeNull();
  });

  it('a ready page gives its Hub link', () => {
    const { result } = renderHook(() => useServedPageLink('keys'), { wrapper: served([pg('home'), pg('keys')]) });
    expect(result.current).toEqual({ kind: 'hub', href: '/keys' });
  });

  it('a preview page this load serves gives its Hub link', () => {
    const { result } = renderHook(() => useServedPageLink('programs'), { wrapper: served([pg('programs', 'preview')]) });
    expect(result.current).toEqual({ kind: 'hub', href: '/programs' });
  });

  it('an unknown page gives null', () => {
    const { result } = renderHook(() => useServedPageLink('constructor'), { wrapper: served([pg('home')]) });
    expect(result.current).toBeNull();
  });

  it('outside the shell (a page test) every page counts as served', () => {
    expect(renderHook(() => useServedPageLink('keys')).result.current).toEqual({ kind: 'hub', href: '/keys' });
  });
});

describe('HeldFromLink', () => {
  it('links to the sender page when it is served', () => {
    render(<HeldFromLink page="keys">Open Keys</HeldFromLink>, { wrapper: served([pg('keys')]) });
    expect(screen.getByRole('link', { name: 'Open Keys' })).toHaveAttribute('href', '/keys');
  });

  it('a place under the sender page keeps its path; one under another page goes to the page', () => {
    const { unmount } = render(
      <HeldFromLink page="keys" path="/keys/abc">
        Open Keys
      </HeldFromLink>,
      { wrapper: served([pg('keys')]) },
    );
    expect(screen.getByRole('link', { name: 'Open Keys' })).toHaveAttribute('href', '/keys/abc');
    unmount();
    render(
      <HeldFromLink page="keys" path="/bots/x">
        Open Keys
      </HeldFromLink>,
      { wrapper: served([pg('keys')]) },
    );
    expect(screen.getByRole('link', { name: 'Open Keys' })).toHaveAttribute('href', '/keys');
  });

  it.each(['/keys/../bots', '//keys/abc', 'keys/abc', '/keys%2f..'])('an odd place %s links to the page itself', (path) => {
    render(
      <HeldFromLink page="keys" path={path}>
        Open Keys
      </HeldFromLink>,
      { wrapper: served([pg('keys')]) },
    );
    expect(screen.getByRole('link', { name: 'Open Keys' })).toHaveAttribute('href', '/keys');
  });

  it('is absent when the sender page is hidden, showing only the fallback', () => {
    render(
      <p>
        Held elsewhere.{' '}
        <HeldFromLink page="keys" fallback="On another page.">
          Open Keys
        </HeldFromLink>
      </p>,
      { wrapper: served([pg('home')]) },
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Open Keys')).toBeNull();
    expect(screen.getByText(/On another page\./)).toBeInTheDocument();
  });

  it('with no page named it shows nothing', () => {
    const { container } = render(<HeldFromLink page="">Open</HeldFromLink>, { wrapper: served([pg('keys')]) });
    expect(container.textContent).toBe('');
  });
});
