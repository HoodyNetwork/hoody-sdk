// Vitest: the Files page picks two panes or one by the room of its page region, never by the
// viewport alone: the sidebar and the Ask dock take width too, and a pane narrower than its picker and table is
// not usable.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

type Entry = { target: Element };
const observers: { cb: (e: Entry[]) => void; els: Set<Element> }[] = [];
let mainWidth = 1400;
// What each pane slot measures (0 = not laid out, as jsdom does by default).
let slotWidth = 0;
const saved = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const savedRO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;

let main: HTMLElement | null = null;
beforeEach(() => {
  observers.length = 0;
  slotWidth = 0;
  // The app shell owns #hub-main; the test shell does not, so the page region is put in place here.
  main = document.createElement('main');
  main.id = 'hub-main';
  document.body.append(main);
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    private o = { cb: (_e: Entry[]) => undefined as void, els: new Set<Element>() };
    constructor(cb: (e: Entry[]) => void) { this.o.cb = cb; observers.push(this.o); }
    observe(el: Element) { this.o.els.add(el); }
    unobserve(el: Element) { this.o.els.delete(el); }
    disconnect() { this.o.els.clear(); }
  };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get(this: HTMLElement) { return this.id === 'hub-main' ? mainWidth : this.id.startsWith('files-pane-') ? slotWidth : 0; } });
});
afterEach(() => {
  main?.remove();
  if (saved) Object.defineProperty(HTMLElement.prototype, 'clientWidth', saved);
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = savedRO;
});

const resize = (w: number) => {
  mainWidth = w;
  act(() => { for (const o of observers) if (main && o.els.has(main)) o.cb([{ target: main }]); });
};
const fromTo = () => screen.queryByRole('radiogroup', { name: strings['side.label'] }) ?? screen.queryByRole('group', { name: strings['side.label'] });

describe('files pane mode', () => {
  it('shows two panes while the page region has room for both, and one with From / To when it does not', async () => {
    mainWidth = 1400;
    await renderPage(page, { path: '/files?a=atlas.00a1&b=atlas.00a1' }); // a link naming pane B opens two
    expect(await screen.findByRole('region', { name: strings['pane.b'] })).toBeInTheDocument();
    expect(fromTo()).toBeNull();
    // A 1100 px window with the sidebar open, or the Ask dock: about 860 px of page region.
    resize(860);
    expect(fromTo()).not.toBeNull();
    expect(screen.queryByRole('region', { name: strings['pane.b'] })).toBeNull();
    resize(1200);
    expect(fromTo()).toBeNull();
    expect(screen.getByRole('region', { name: strings['pane.b'] })).toBeInTheDocument();
  });

  it('keeps the panes toggle where two panes do not fit side by side: Two panes stays chosen and shows From / To', async () => {
    mainWidth = 860;
    await renderPage(page, { path: '/files?a=atlas.00a1&b=atlas.00a1' });
    expect(fromTo()).not.toBeNull();
    const two = await screen.findByRole('radio', { name: strings['view.two'] });
    expect(two).toHaveAttribute('aria-checked', 'true');
    expect(two).not.toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: strings['view.one'] }));
    expect(fromTo()).toBeNull();
    expect(screen.getByRole('region', { name: strings['pane.a'] })).toBeInTheDocument();
  });

  it('keeps the split where both panes stay usable, and announces only what the grid draws', async () => {
    // Just above the two-pane width: the panes share 860 px, so each pane's 420 px allows 49-51 %, not 25-75 %.
    mainWidth = 940;
    slotWidth = 430;
    await renderPage(page, { path: '/files?a=atlas.00a1&b=atlas.00a1' }); // a link naming pane B opens two
    const split = await screen.findByRole('separator', { name: strings['split.label'] });
    expect(split).toHaveAttribute('aria-valuemin', '49');
    expect(split).toHaveAttribute('aria-valuemax', '51');
    split.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(split).toHaveAttribute('aria-valuenow', '51');
    const cols = (split.parentElement as HTMLElement).style.gridTemplateColumns;
    expect(cols).toBe('minmax(0, 51fr) auto minmax(0, 49fr)');
    await userEvent.keyboard('{ArrowLeft}');
    expect(split).toHaveAttribute('aria-valuenow', '49');
  });
});
