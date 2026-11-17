// Vitest: at any page width the page shows exactly one Add funds and the wallet band none (a copy in the
// band would make two on narrower pages). The one left is the page header's: a header button on wide content,
// the floating button on phone-width content (the kit header switches by its own measured width, driven here).
// The real layout widths are proved by page.spec.ts.
import { act } from '@testing-library/react';
import { renderPage, waitFor, within } from '@app/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import page from './page';
import strings from './strings.en.json';

// Every observer here reports this width for what it observes, like a real layout at that width.
const layout = vi.hoisted(() => ({ width: 1200, observers: new Set<() => void>() }));

beforeEach(() => {
  layout.width = 1200;
  layout.observers = new Set();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private fire: (() => void) | null = null;
      constructor(private cb: (entries: unknown[], o: unknown) => void) {}
      observe(el: Element) {
        this.fire = () => this.cb([{ target: el, contentRect: { width: layout.width, height: 600 } }], this);
        layout.observers.add(this.fire);
        this.fire();
      }
      unobserve() {}
      disconnect() {
        if (this.fire) layout.observers.delete(this.fire);
        this.fire = null;
      }
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const up = async () => {
  await renderPage(page, { path: '/billing?view=wallet' });
  await waitFor(() => expect(document.querySelector('[data-card="wallet"]')).not.toBeNull(), { timeout: 20000 });
  const band = document.querySelector('[data-card="wallet"]') as HTMLElement;
  await within(band).findByText(strings.wallet);
  return band;
};
const resize = (w: number) =>
  act(() => {
    layout.width = w;
    [...layout.observers].forEach((fire) => fire());
  });
const addFunds = (el: HTMLElement) => within(el).queryAllByRole('button', { name: strings.addFunds });
const header = () => document.querySelector('header') as HTMLElement;
const once = (band: HTMLElement, inHeader: boolean) => {
  expect(addFunds(band)).toHaveLength(0);
  expect(addFunds(document.body)).toHaveLength(1);
  expect(addFunds(header())).toHaveLength(inHeader ? 1 : 0);
};

describe('one Add funds at every page width', () => {
  it('wide content: the header button, none in the band', async () => {
    const band = await up();
    once(band, true);
  });

  it('phone-width content: the floating button instead, still one', async () => {
    layout.width = 390;
    const band = await up();
    await waitFor(() => once(band, false));
  });

  it('a resize either way keeps one', async () => {
    const band = await up();
    once(band, true);
    await resize(390);
    await waitFor(() => once(band, false));
    await resize(1200);
    await waitFor(() => once(band, true));
  });
});
