// A top-bar part that failed stays out only while nothing changed. A replacement part (its manifest
// loader changed under the same ids) is tried, and an account or realm switch starts every part again.
import { act, render, screen } from '@testing-library/react';
import { type ComponentType, type ReactElement, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { definePage, type PageManifest, type PageTopBar } from '@kit/page';

const core = vi.hoisted(() => {
  let snap = { account: 'acct-a', realm: 'realm-1' };
  const ls = new Set<() => void>();
  return {
    get: () => snap,
    set(next: Partial<typeof snap>) {
      snap = { ...snap, ...next };
      for (const l of ls) l();
    },
    sub(l: () => void) {
      ls.add(l);
      return () => ls.delete(l);
    },
  };
});
vi.mock('@core', async () => {
  const { useSyncExternalStore } = await import('react');
  return { useCore: () => useSyncExternalStore(core.sub, core.get, core.get) };
});

const { ContributionsProvider, contributionsOf, topBarOf } = await import('./contributions');
const { TopBarParts } = await import('./TopBarParts');

function Home() {
  return null;
}
const as = (C: ComponentType) => async () => ({ default: C });
const page = (topBar: PageTopBar): PageManifest =>
  definePage({ id: 'billing', path: '/billing', title: 'title', layout: 'settings', load: async () => ({ default: Home }), status: 'ready', sensitive: false, strings: { title: 'Billing' }, topBar });
function Badge() {
  return <button type="button">Free servers</button>;
}
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
const bar = (pages: PageManifest[]) => (
  <ContributionsProvider pages={pages}>
    <TopBarParts />
  </ContributionsProvider>
);

describe('a failed top-bar part gets another try when something changed', () => {
  it('a replacement loader under the same page and part ids is tried', async () => {
    const view = render(bar([page({ id: 'free', load: () => Promise.reject(new Error('chunk failed')) })]));
    await settle();
    expect(screen.queryByRole('button', { name: 'Free servers' })).toBeNull();
    const load = vi.fn(as(Badge));
    view.rerender(bar([page({ id: 'free', load })]));
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Free servers' })).toBeTruthy();
  });

  it('a part that threw renders again after an account switch, once it can', async () => {
    let broken = true;
    function Fragile(): ReactElement {
      if (broken) throw new Error('not ready for this account');
      return <button type="button">Free servers</button>;
    }
    render(bar([page({ id: 'fragile', load: as(Fragile) })]));
    await settle();
    expect(screen.queryByRole('button', { name: 'Free servers' })).toBeNull();
    broken = false;
    act(() => core.set({ account: 'acct-b' }));
    await settle();
    expect(screen.getByRole('button', { name: 'Free servers' })).toBeTruthy();
  });

  it('a part starts again on a realm switch: what it had open belonged to the realm left', async () => {
    function Menu() {
      const [open, setOpen] = useState(false);
      return (
        <button type="button" aria-expanded={open} onClick={() => setOpen(true)}>
          Free servers
        </button>
      );
    }
    render(bar([page({ id: 'menu', load: as(Menu) })]));
    await settle();
    act(() => screen.getByRole('button', { name: 'Free servers' }).click());
    expect(screen.getByRole('button', { name: 'Free servers' }).getAttribute('aria-expanded')).toBe('true');
    act(() => core.set({ realm: 'realm-2' }));
    await settle();
    expect(screen.getByRole('button', { name: 'Free servers' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('top-bar parts and Home widgets never share a lazy component, whatever the ids', () => {
    const billing = page({ id: 'free', load: as(Badge) });
    const first = topBarOf([billing])[0]?.Component;
    expect(first).toBeDefined();
    // A page called "topbar" whose widget id reads "billing:free": the same text as billing's part under one prefix.
    const odd = definePage({ id: 'topbar', path: '/topbar', title: 'title', layout: 'settings', load: async () => ({ default: Home }), status: 'ready', sensitive: false, strings: { title: 'Odd' }, widgets: [{ id: 'billing:free', title: 'title', load: as(Home) }] });
    expect(contributionsOf([odd]).widgets[0]?.Component).not.toBe(first);
    expect(topBarOf([billing])[0]?.Component).toBe(first);
  });

  it('definePage refuses a top-bar part with a bad id or no loader', () => {
    expect(() => page({ id: 'Free badge', load: as(Badge) })).toThrow(/bad topBar/);
    expect(() => page({ id: '', load: as(Badge) })).toThrow(/bad topBar/);
    expect(() => page({ id: 'free', load: undefined as unknown as PageTopBar['load'] })).toThrow(/bad topBar/);
    expect(page({ id: 'free-servers', load: as(Badge) }).topBar?.id).toBe('free-servers');
  });
});
