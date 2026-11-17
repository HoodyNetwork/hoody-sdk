// A Dialog keeps its header (title, close x) and its footer (buttons) in view; only the body between them scrolls
// (even the close x stays in view while the body scrolls). happy-dom lays nothing out, so this file proves the structure
// that keeps the x in view: the x sits outside the one scroll box, the box holds everything that may be long, and the
// header's hairline follows the scroll. dialogscroll.spec.ts measures the same in a browser.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type ReactElement, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Overlays';

async function inRouter(Component: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const frames = () =>
  act(async () => {
    await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => setTimeout(r, 5));
  });

// happy-dom lays nothing out: the box "overflows" when its scrollHeight beats its clientHeight.
let tall = true;
beforeEach(() => {
  tall = true;
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => (tall ? 900 : 100));
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 100);
});
afterEach(() => vi.restoreAllMocks());

const panel = () => screen.getByRole('dialog');
const head = () => panel().querySelector<HTMLElement>('[data-dialog-head]');
const box = () => panel().querySelector<HTMLElement>('[data-dialog-scroll]');
const close = () => panel().querySelector<HTMLElement>('[data-dialog-close]');

function scrollTo(top: number) {
  const el = box();
  if (!el) throw new Error('no scroll box');
  Object.defineProperty(el, 'scrollTop', { value: top, configurable: true, writable: true });
  fireEvent.scroll(el);
}

const fields = Array.from({ length: 40 }, (_, i) => <input key={i} aria-label={`Field ${i}`} />);
const long = () => (
  <Dialog isOpen onOpenChange={() => undefined} title="Mount" body="Long body." primaryLabel="Save" onPrimary={() => undefined} outcome={{ kind: 'failed', message: 'Nope.' }}>
    {fields}
  </Dialog>
);

// ── S0: the CSS ─────────────────────────────────────────────────────────────────────
const css = readFileSync(path.join(import.meta.dirname, 'Dialog.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** The declarations of the top-level rule whose selector list is exactly `sel`. */
function rule(sel: string): Map<string, string> | null {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if ((m[1] ?? '').replace(/\s+/g, ' ').trim() !== sel) continue;
    const out = new Map<string, string>();
    for (const d of (m[2] ?? '').split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
    return out;
  }
  return null;
}

describe('Dialog scroll box: the CSS', () => {
  it('only .scroll scrolls; the header, the hint and the footer do not shrink or scroll away', () => {
    expect(rule('.form')?.has('overflow')).toBe(false);
    expect(rule('.scroll')?.get('overflow')).toBe('auto');
    expect(rule('.scroll')?.get('min-height')).toBe('0');
    for (const sel of ['.head', '.escHint', '.buttons']) expect(rule(sel)?.get('flex'), sel).toBe('none');
    expect(rule('.buttons')?.has('position')).toBe(false);
  });
  it('the header gives its hairline pixel back, so the line adds no height', () => {
    expect(rule('.head')?.get('margin-block-end')).toBe('calc(var(--bw) * -1)');
    expect(rule('.head')?.get('border-block-end')).toBe('var(--bw) solid transparent');
  });
});

describe('Dialog scroll box: the structure', () => {
  it('the close x stays in view when the body scrolls', async () => {
    await inRouter(long);
    await frames();
    const sc = box();
    const hd = head();
    expect(sc).not.toBeNull();
    expect(hd).not.toBeNull();
    // The box holds the body text, every field and the outcome; the x, the heading and the buttons are outside it.
    expect(sc?.textContent).toContain('Long body.');
    expect(sc?.querySelectorAll('input')).toHaveLength(40);
    expect(sc?.querySelector('[data-dialog-outcome]')).not.toBeNull();
    for (const outside of [close(), panel().querySelector('h2, [slot="title"]'), panel().querySelector('[data-dialog-cancel]'), panel().querySelector('[data-dialog-primary]')]) {
      expect(outside).not.toBeNull();
      expect(sc?.contains(outside)).toBe(false);
    }
    // The header is the panel's first child and the box its second.
    const form = hd?.parentElement;
    expect(form?.children[0]).toBe(hd);
    expect(form?.children[1]).toBe(sc);
    scrollTo(600);
    expect(hd?.contains(close())).toBe(true);
    expect(sc?.contains(close())).toBe(false);
  });

  it('the header takes a hairline while the body is scrolled, and drops it back at the top', async () => {
    await inRouter(long);
    await frames();
    expect(head()).not.toHaveAttribute('data-scrolled');
    scrollTo(600);
    expect(head()).toHaveAttribute('data-scrolled');
    scrollTo(0);
    expect(head()).not.toHaveAttribute('data-scrolled');
  });

  it('a dialog opens with its body at the top: no hairline left from its last time', async () => {
    let setOpen: (v: boolean) => void = () => undefined;
    function Host() {
      const [open, set] = useState(true);
      setOpen = set;
      return (
        <Dialog isOpen={open} onOpenChange={set} title="Mount" body="Body." primaryLabel="Save" onPrimary={() => undefined}>
          {fields}
        </Dialog>
      );
    }
    await inRouter(Host);
    await frames();
    scrollTo(600);
    expect(head()).toHaveAttribute('data-scrolled');
    await act(async () => setOpen(false));
    await frames();
    await act(async () => setOpen(true));
    await frames();
    expect(head()).not.toHaveAttribute('data-scrolled');
  });

  it('a scrolling text-only body takes focus; one with an enabled field, or one that does not scroll, does not', async () => {
    await inRouter(() => <Dialog isOpen onOpenChange={() => undefined} title="Read" body="Long text." primaryLabel="OK" onPrimary={() => undefined} />);
    await frames();
    expect(box()).toHaveAttribute('tabindex', '0');
  });
  it('a scrolling body with an enabled field stays out of the tab order', async () => {
    await inRouter(() => (
      <Dialog isOpen onOpenChange={() => undefined} title="Name" primaryLabel="OK" onPrimary={() => undefined}>
        <input aria-label="Name" />
      </Dialog>
    ));
    await frames();
    expect(box()).not.toHaveAttribute('tabindex');
  });
  it('a body that does not scroll stays out of the tab order', async () => {
    tall = false;
    await inRouter(() => <Dialog isOpen onOpenChange={() => undefined} title="Read" body="Short." primaryLabel="OK" onPrimary={() => undefined} />);
    await frames();
    expect(box()).not.toHaveAttribute('tabindex');
  });

  it('the tab order is the x, the body control, the fields, Cancel, then the primary', async () => {
    await inRouter(() => (
      <Dialog isOpen onOpenChange={() => undefined} title="End session" body={<button type="button">Dismiss</button>} primaryLabel="End it" onPrimary={() => undefined}>
        <input aria-label="Reason" />
      </Dialog>
    ));
    await frames();
    const order = Array.from(panel().querySelectorAll<HTMLElement>('button, input')).map((e) =>
      e.hasAttribute('data-dialog-close') ? 'close' : (e.getAttribute('aria-label') ?? e.textContent ?? ''),
    );
    expect(order).toEqual(['close', 'Dismiss', 'Reason', 'Cancel', 'End it']);
  });
});
