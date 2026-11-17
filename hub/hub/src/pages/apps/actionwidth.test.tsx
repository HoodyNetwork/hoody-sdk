// The Open table's Action column is as wide as the widest control any row can draw, measured from kit Buttons drawn the way RowPrimary draws them (kit
// useButtonLabelsWidth), plus the cell's 24 px, never a canvas guess at Geist Mono. jsdom lays nothing out, so a probe
// control's width here is a stub; the real boxes are openaction.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { act, renderPage, screen, waitFor, within } from '@app/testing';
import { fixtureStore } from '@app/fixtures';
import { LinkButton } from '@kit';
import type { Action } from './logic';
import { harness } from './launch/harness';
import { LINK_ACTIONS } from './launch/RowPrimary';
import { ACTION_KEY } from './parts/words';
import strings from './strings.en.json';

/** The probe controls' stub widths, by label: anything not named draws 50 px. A busy control (React Aria's
 *  data-pending) takes its label's `busyWide` width when one is given, so idle and busy can differ. */
let wide: Record<string, number> = {};
let busyWide: Record<string, number> = {};

beforeEach(() => {
  wide = {};
  busyWide = {};
  fixtureStore.set({ state: null, latency: 'instant' });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: (entries: unknown[], o: unknown) => void) {}
      observe(el: Element) {
        this.cb([{ target: el, contentRect: { width: 1440, height: 800 } }], this);
      }
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const probed = this.tagName !== 'SPAN' && this.closest('[data-kit-probe]') !== null;
    const label = (this.textContent ?? '').trim();
    const w = !probed ? 0 : this.hasAttribute('data-pending') && busyWide[label] !== undefined ? busyWide[label] : (wide[label] ?? 50);
    return { width: w, height: 0, x: 0, y: 0, top: 0, left: 0, right: w, bottom: 0, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'fonts');
});

/** The Open table's Action column width, as its <col> gives it. */
function actionCol(): string {
  const table = screen.getByRole('table', { name: strings['tab.open'] });
  const heads = [...table.querySelectorAll('thead tr:first-child > th')];
  const at = heads.findIndex((h) => within(h as HTMLElement).queryByText(strings['col.action']) !== null);
  expect(at, 'an Action column header').toBeGreaterThanOrEqual(0);
  return (table.querySelectorAll('colgroup > col')[at] as HTMLElement).style.width;
}

const probeControls = () => [...document.querySelectorAll<HTMLElement>('[data-kit-probe] :is(button, a)')];

describe('Apps, Opened apps: the Action column is its widest control', () => {
  it('takes the widest measured control plus the cell padding (a link: Open display)', async () => {
    wide = { [strings['act.screen']]: 400 };
    await renderPage(harness, { path: '/apps' });
    await waitFor(() => expect(actionCol()).toBe('424px'), { timeout: 4000 });
  });

  it('takes a Button the same way (Open without extra words), and follows the widest', async () => {
    wide = { [strings['act.screen']]: 200, [strings['act.plain']]: 333 };
    await renderPage(harness, { path: '/apps' });
    await waitFor(() => expect(actionCol()).toBe('357px'), { timeout: 4000 });
  });

  it('measures every action as RowPrimary draws it: links as links, the others idle and busy', async () => {
    await renderPage(harness, { path: '/apps' });
    await waitFor(() => expect(probeControls().length).toBeGreaterThan(0), { timeout: 4000 });
    const all = probeControls();
    for (const k of ['act.open', 'act.terminal', 'act.screen', 'act.address'] as const) {
      const own = all.filter((e) => e.textContent?.trim() === strings[k]);
      expect(own.map((e) => e.tagName), k).toEqual(['A']);
    }
    for (const k of ['act.check', 'act.retry', 'act.plain', 'act.stop', 'act.remove'] as const) {
      const own = all.filter((e) => e.textContent?.trim() === strings[k]);
      expect(own.map((e) => e.tagName), k).toEqual(['BUTTON', 'BUTTON']);
      // One idle, one busy (the spinner in the icon's place): two different controls.
      expect(new Set(own.map((e) => e.innerHTML)).size, k).toBe(2);
    }
    // The probe is no control anyone reaches: hidden from assistive tech and inert.
    for (const p of document.querySelectorAll('[data-kit-probe]')) expect(p).toHaveAttribute('aria-hidden', 'true');
  });

  it('measures every action a row can draw: each link with its external icon, every other action idle and busy', async () => {
    // The external icon as the kit draws it on a LinkButton, to compare the probes' end icon with.
    const ref = render(<LinkButton size="sm" variant="row" href="#/" iconEnd="external">x</LinkButton>);
    const external = ref.container.querySelector('svg')?.outerHTML;
    ref.unmount();
    expect(external, 'the kit draws an end icon').toBeTruthy();
    await renderPage(harness, { path: '/apps' });
    await waitFor(() => expect(probeControls().length).toBeGreaterThan(0), { timeout: 4000 });
    const all = probeControls();
    const acts = (Object.keys(ACTION_KEY) as Action[]).filter((x) => x !== 'wait');
    expect(acts.length, 'every action').toBeGreaterThan(9);
    for (const x of acts) {
      const label = (strings as Record<string, string>)[ACTION_KEY[x]]!;
      const own = all.filter((e) => e.textContent?.trim() === label);
      if (LINK_ACTIONS.has(x)) {
        expect(own.map((e) => e.tagName), x).toEqual(['A']);
        expect(own[0]!.querySelector('svg')?.outerHTML, `${x}: the external icon`).toBe(external);
      } else {
        expect(own.map((e) => e.tagName), x).toEqual(['BUTTON', 'BUTTON']);
        expect(own.map((e) => e.hasAttribute('data-pending')).sort(), `${x}: one idle, one busy`).toEqual([false, true]);
      }
    }
  });

  it('a busy control that is wider than every idle one sets the column on its own', async () => {
    busyWide = { [strings['act.stopAgain']]: 380 };
    await renderPage(harness, { path: '/apps' });
    await waitFor(() => expect(actionCol()).toBe('404px'), { timeout: 4000 });
  });

  it('keeps the kit floor until the fonts are in, then takes the measure', async () => {
    let settle = () => {};
    const ready = new Promise<void>((r) => (settle = r));
    Object.defineProperty(document, 'fonts', { configurable: true, value: { status: 'loading', ready } });
    wide = { [strings['act.screen']]: 400 };
    await renderPage(harness, { path: '/apps' });
    await waitFor(() => expect(actionCol()).toBe('120px'), { timeout: 4000 });
    await act(async () => {
      settle();
      await ready;
    });
    await waitFor(() => expect(actionCol()).toBe('424px'), { timeout: 4000 });
  });
});
