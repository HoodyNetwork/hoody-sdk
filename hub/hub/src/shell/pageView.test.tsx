// The core view a page captures. The page that comes into view renders after the view
// moved, so what it captures as it mounts (in render, in its layout effects, a secret field given a value) belongs to
// its own view and is not ended by that move. What a page held for its view ends when another page shows, and a realm
// wait ending moves the view too. A page and a location that do not belong together yet move no view, so a switch
// moves it once.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { type ReactElement, useEffect, useLayoutEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capture, resetCore, setView, vgen } from '@core/ctx';
import { holdSecret, type HeldSecret } from '@core/secret';
import { SecretField } from '@kit/forms/Secret';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';
import { PageHost, ShellView, useKeepPage } from './pageHost';

const ctl = vi.hoisted(() => ({ load: null as null | (() => Promise<string[]>) }));
vi.mock('@core', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRealms: () => ({ selected: 'all', pinned: null, rows: [] }),
}));
vi.mock('@core/shell', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  realmList: () => [],
  loadRealms: () => (ctl.load ? ctl.load() : Promise.resolve([])),
  beginSwitch: () => ({ done: Promise.resolve(true), cancel: () => undefined }),
  switchRevision: () => 0,
}));

const UNKNOWN = '6a00000000000000000000e1';

/** What the page coming into view captured, by where it captured it. */
let seen: Record<string, number> = {};
function Arriving(): ReactElement {
  useState(() => (seen.render = vgen()));
  useLayoutEffect(() => {
    seen.layout = vgen();
  }, []);
  useEffect(() => {
    seen.effect = vgen();
  }, []);
  return (
    <>
      <h1 data-hub-title tabIndex={-1}>
        Arriving
      </h1>
      <SecretField label="New key" value="s3cret-at-mount" />
    </>
  );
}

/** A page kept loaded: `held` holds a secret for what core captures when called, the way a result would. */
let held: () => HeldSecret | null = () => null;
function Kept(): ReactElement {
  useKeepPage(true);
  held = () => holdSecret('s3cret-core', capture());
  return (
    <h1 data-hub-title tabIndex={-1}>
      Kept
    </h1>
  );
}
function Home(): ReactElement {
  return (
    <h1 data-hub-title tabIndex={-1}>
      Home
    </h1>
  );
}
const page = (id: string, C: () => ReactElement): PageManifest =>
  definePage({ id, path: `/${id}`, title: 'title', layout: 'settings', load: async () => ({ default: C }), status: 'ready', sensitive: false, strings: { title: id } });
const PAGES = [page('kept', Kept), page('home', Home), page('arriving', Arriving)];

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
async function open(path: string) {
  const router = buildRouter(PAGES, { queryClient: new QueryClient(), shell: true, history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  await settle();
  const go = async (href: string) => {
    await act(async () => {
      await router.navigate({ href } as never);
    });
    await settle();
  };
  return { router, go };
}
const field = () => document.querySelector('[data-secret]');
const hidden = (id: string) => document.querySelector(`[data-hub-page="${id}"]`)?.hasAttribute('data-hub-page-hidden');

beforeEach(() => {
  seen = {};
  held = () => null;
  ctl.load = null;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  resetCore();
});

describe('the page coming into view captures its own view', () => {
  it('in render, in its layout effects and its effects, and a secret field it mounts with a value stays held', async () => {
    const { go } = await open('/home');
    const before = vgen();
    await go('/arriving');
    expect(await screen.findByRole('heading', { name: 'Arriving' })).toBeInTheDocument();
    expect(seen).toEqual({ render: vgen(), layout: vgen(), effect: vgen() });
    expect(field()?.getAttribute('data-secret')).toBe('masked');
    expect(vgen()).toBe(before + 1);
  });

  it('a link to one of its own paths: one view move, and what it captured as it mounted stays its own', async () => {
    const { go } = await open('/home');
    const before = vgen();
    await go('/arriving/deep');
    expect(await screen.findByRole('heading', { name: 'Arriving' })).toBeInTheDocument();
    expect(vgen()).toBe(before + 1);
    expect(seen).toEqual({ render: vgen(), layout: vgen(), effect: vgen() });
    expect(field()?.getAttribute('data-secret')).toBe('masked');
  });

  it('after a realm wait ends: the page drawn then captures the view the wait ended in', async () => {
    const { go } = await open('/home');
    let answer: (ids: string[]) => void = () => undefined;
    ctl.load = () => new Promise<string[]>((r) => (answer = r));
    await go(`/arriving?open_realm=${UNKNOWN}`);
    expect(document.querySelector('[data-hub-realm-wait]')).not.toBeNull();
    await act(async () => answer([]));
    await settle();
    expect(await screen.findByRole('heading', { name: 'Arriving' })).toBeInTheDocument();
    expect(seen).toEqual({ render: vgen(), layout: vgen(), effect: vgen() });
    expect(field()?.getAttribute('data-secret')).toBe('masked');
  });
});

describe('what a page held for its view ends with it', () => {
  it('a secret held while the page showed is dropped once the next page shows, the page kept hidden', async () => {
    const { go } = await open('/kept');
    const shownThen = held();
    expect(shownThen?.reveal(shownThen.ctx)).toBe('s3cret-core');
    await go('/home');
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(hidden('kept')).toBe(true);
    expect(shownThen?.dropped).toBe(true);
  });

  it('a secret held while a realm wait shows does not outlive the wait', async () => {
    const { go } = await open('/kept');
    let answer: (ids: string[]) => void = () => undefined;
    ctl.load = () => new Promise<string[]>((r) => (answer = r));
    await go(`/home?open_realm=${UNKNOWN}`);
    expect(document.querySelector('[data-hub-realm-wait]')).not.toBeNull();
    expect(hidden('kept')).toBe(true);
    const during = held();
    expect(during).not.toBeNull();
    await act(async () => answer([]));
    await settle();
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    // The wait ending moved the view: what was held during the wait has ended.
    expect(during?.dropped).toBe(true);
  });
});

describe('a page and a location that do not belong together yet', () => {
  it('the router naming the next page before its location: nothing moves until they agree, then the view moves once', async () => {
    const at = (pathname: string) => ({ pathname, search: {}, searchStr: '', hash: '', href: pathname, state: {} }) as never;
    const pages = [page('one', Home), page('arriving', Arriving)];
    const views: string[] = [];
    const toView = (path: string) => {
      views.push(path);
      setView(path);
    };
    const draw = (current: string, pathname: string) => (
      <ShellView value={toView}>
        <main id="hub-main">
          <PageHost pages={pages} current={current} location={at(pathname)} render={(p) => (p.id === 'one' ? <Home /> : <Arriving />)} />
        </main>
      </ShellView>
    );
    const { rerender } = render(draw('one', '/one'));
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    await act(async () => rerender(draw('arriving', '/one')));
    expect(views).toEqual([]);
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Arriving' })).toBeNull();
    await act(async () => rerender(draw('arriving', '/arriving/deep')));
    expect(views).toEqual(['/arriving/deep']);
    expect(screen.getByRole('heading', { name: 'Arriving' })).toBeInTheDocument();
    expect(seen).toEqual({ render: vgen(), layout: vgen(), effect: vgen() });
    expect(field()?.getAttribute('data-secret')).toBe('masked');
  });
});
