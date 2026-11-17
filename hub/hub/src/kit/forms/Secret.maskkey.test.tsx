// SecretField `maskKey`: a change masks a shown secret again without dropping it (Copy and a second Show still work),
// and every wipe trigger still wipes a field that carries one.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement, useLayoutEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capture, holdSecret, type HeldSecret } from '@core';
import { bump, setView } from '@core/ctx';
import { boot } from '@core/test/env';
import { SecretField } from './Secret';

const SECRET = 'hk_9c1e5a7f3b2d8e4a6c0f1b9d7e3a5c2f';
let written: string[] = [];

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => (written.push(text), Promise.resolve()) },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

async function inRouter(Component: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}
const press = async (el: Element) => {
  await act(async () => {
    fireEvent.click(el);
  });
};
const html = () => document.body.innerHTML;
const held = (v = SECRET): HeldSecret => {
  const h = holdSecret(v, capture());
  if (!h) throw new Error('no held secret');
  return h;
};

/** Records, at each commit, whether the page then held the value (a frame drawn shown after the mask change). */
const commits: boolean[] = [];
function CommitProbe({ k }: { k: number }) {
  useLayoutEffect(() => {
    commits.push(document.body.innerHTML.includes(SECRET));
  }, [k]);
  return null;
}

/** A page that masks the field again by bumping `maskKey` (as a fold closing does), never by remounting it. */
let fold!: () => void;
function Harness({ h, onWipe, format, value }: { h?: HeldSecret; onWipe?: () => void; format?: 'single' | 'lines' | 'text'; value?: string }) {
  const [closes, setCloses] = useState(0);
  fold = () => setCloses((n) => n + 1);
  return (
    <>
      <SecretField label="Sign-in link" {...(value !== undefined ? { value } : { held: h })} format={format} onWipe={onWipe} maskKey={closes} />
      <CommitProbe k={closes} />
    </>
  );
}

describe('SecretField maskKey', () => {
  it('a change masks a shown secret again: nothing dropped, the page not told, Copy and Show still work', async () => {
    const h = held();
    const onWipe = vi.fn();
    await inRouter(() => <Harness h={h} onWipe={onWipe} />);
    await press(screen.getByRole('button', { name: 'Show' }));
    expect(html()).toContain(SECRET);
    commits.length = 0;
    await act(async () => fold());
    expect(commits).toEqual([false]);
    expect(html()).not.toContain(SECRET);
    expect(screen.getByRole('button', { name: 'Show' })).toBeInTheDocument();
    expect(document.querySelector('[data-secret]')?.getAttribute('data-secret')).toBe('masked');
    expect(h.dropped).toBe(false);
    expect(onWipe).not.toHaveBeenCalled();
    await press(screen.getByRole('button', { name: 'Copy' }));
    expect(written).toEqual([SECRET]);
    await press(screen.getByRole('button', { name: 'Show' }));
    expect(html()).toContain(SECRET);
  });

  it('a page string masks again the same way', async () => {
    await inRouter(() => <Harness value={SECRET} />);
    await press(screen.getByRole('button', { name: 'Show' }));
    expect(html()).toContain(SECRET);
    await act(async () => fold());
    expect(html()).not.toContain(SECRET);
    await press(screen.getByRole('button', { name: 'Copy' }));
    expect(written).toEqual([SECRET]);
  });

  it('backup codes mask again', async () => {
    const h = held(`${SECRET}\nhk_second_code_77`);
    await inRouter(() => <Harness h={h} format="lines" />);
    await press(screen.getByRole('button', { name: 'Show codes' }));
    expect(html()).toContain(SECRET);
    await act(async () => fold());
    expect(html()).not.toContain(SECRET);
    expect(screen.getByRole('button', { name: 'Show codes' })).toBeInTheDocument();
    expect(h.dropped).toBe(false);
  });

  it('a render with the same maskKey keeps it shown', async () => {
    const h = held();
    let poke!: () => void;
    await inRouter(() => {
      const [, set] = useState(0);
      poke = () => set((n) => n + 1);
      return <SecretField label="Sign-in link" held={h} maskKey="fold-0" />;
    });
    await press(screen.getByRole('button', { name: 'Show' }));
    await act(async () => poke());
    expect(html()).toContain(SECRET);
  });

  it('with `onRead` (shown at once when read) a change masks it again without dropping it', async () => {
    let read!: () => void;
    let h: HeldSecret | null = null;
    await inRouter(() => {
      const [v, setV] = useState<HeldSecret | null>(null);
      const [closes, setCloses] = useState(0);
      read = () => setV((h = held()));
      fold = () => setCloses((n) => n + 1);
      return <SecretField label="Value" held={v} once={false} onRead={() => read()} dropOnHide={false} maskKey={closes} />;
    });
    await act(async () => read());
    expect(html()).toContain(SECRET);
    await act(async () => fold());
    expect(html()).not.toContain(SECRET);
    expect(document.querySelector('[data-secret]')?.getAttribute('data-secret')).toBe('masked');
    expect(h!.dropped).toBe(false);
  });

  it('a function as maskKey is a key like any other: never called, rendering settles, a new function masks again', async () => {
    const h = held();
    const first = vi.fn(() => undefined);
    const second = vi.fn(() => undefined);
    let swap!: () => void;
    await inRouter(() => {
      const [k, setK] = useState<{ fn: () => undefined }>({ fn: first });
      swap = () => setK({ fn: second });
      return <SecretField label="Sign-in link" held={h} maskKey={k.fn} />;
    });
    await press(screen.getByRole('button', { name: 'Show' }));
    expect(html()).toContain(SECRET);
    await act(async () => swap());
    expect(html()).not.toContain(SECRET);
    expect(h.dropped).toBe(false);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  describe('every wipe trigger still wipes a field carrying maskKey', () => {
    const cases: Array<{ name: string; run: (router: Awaited<ReturnType<typeof inRouter>>) => unknown }> = [
      { name: 'route change', run: (router) => router.navigate({ to: '/elsewhere' as never }) },
      { name: 'realm switch', run: () => bump('switch') },
      { name: 'sign-out', run: () => bump('signout') },
      { name: 'account change', run: () => bump('account') },
      { name: 'view change', run: () => setView('keys') },
      { name: 'page hide', run: () => window.dispatchEvent(new Event('pagehide')) },
    ];
    for (const c of cases) {
      it(`${c.name}: the held secret drops and the page is told`, async () => {
        const h = held();
        const onWipe = vi.fn();
        const router = await inRouter(() => <Harness h={h} onWipe={onWipe} />);
        await press(screen.getByRole('button', { name: 'Show' }));
        await act(async () => fold());
        // shown again after the mask change: the trigger must take a REVEALED value out of the page
        await press(screen.getByRole('button', { name: 'Show' }));
        expect(html()).toContain(SECRET);
        await act(async () => {
          await c.run(router);
        });
        expect(h.dropped).toBe(true);
        expect(onWipe).toHaveBeenCalledTimes(1);
        expect(html()).not.toContain(SECRET);
        expect(screen.getByText('It is no longer shown here.')).toBeInTheDocument();
      });
    }

    it('resetKey change: a revealed value (after a mask change) drops and leaves the page', async () => {
      const h = held();
      const onWipe = vi.fn();
      let reset!: () => void;
      await inRouter(() => {
        const [closes, setCloses] = useState(0);
        const [realm, setRealm] = useState('r1');
        fold = () => setCloses((n) => n + 1);
        reset = () => setRealm('r2');
        return <SecretField label="Sign-in link" held={h} onWipe={onWipe} maskKey={closes} resetKey={realm} />;
      });
      await press(screen.getByRole('button', { name: 'Show' }));
      await act(async () => fold());
      await press(screen.getByRole('button', { name: 'Show' }));
      expect(html()).toContain(SECRET);
      await act(async () => reset());
      expect(h.dropped).toBe(true);
      expect(onWipe).toHaveBeenCalledTimes(1);
      expect(html()).not.toContain(SECRET);
    });

    it('unmount: a revealed value (after a mask change) drops and leaves the page', async () => {
      const h = held();
      let close!: () => void;
      await inRouter(() => {
        const [open, setOpen] = useState(true);
        const [closes, setCloses] = useState(0);
        fold = () => setCloses((n) => n + 1);
        close = () => setOpen(false);
        return open ? <SecretField label="Sign-in link" held={h} maskKey={closes} /> : <p>closed</p>;
      });
      await press(screen.getByRole('button', { name: 'Show' }));
      await act(async () => fold());
      await press(screen.getByRole('button', { name: 'Show' }));
      expect(html()).toContain(SECRET);
      await act(async () => close());
      // the drop is deferred past StrictMode's re-run
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(html()).not.toContain(SECRET);
      expect(h.dropped).toBe(true);
    });

    it('the tab going to the background masks it, and a later maskKey change does not bring it back', async () => {
      const h = held();
      await inRouter(() => <Harness h={h} />);
      await press(screen.getByRole('button', { name: 'Show' }));
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(html()).not.toContain(SECRET);
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      await act(async () => fold());
      expect(html()).not.toContain(SECRET);
    });
  });
});
