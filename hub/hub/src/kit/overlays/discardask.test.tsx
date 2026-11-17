// The "Discard changes?" ask of a dirty Drawer: on X or Esc it comes into view, takes focus on its safe
// button and flashes, every time it is asked for, and it stays inside the visible viewport when a phone's keyboard is open.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import strings from './strings.en.json';
import { Drawer } from './Overlays';

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

const scrolled = vi.fn();
beforeEach(() => {
  scrolled.mockReset();
  // jsdom lays nothing out and has no scrollIntoView: the kit must ask for it on the ask itself.
  Element.prototype.scrollIntoView = function (this: Element, o?: unknown) {
    scrolled(this, o);
  };
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => 2000);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 300);
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  delete (window as { visualViewport?: unknown }).visualViewport;
});

const open = () =>
  inRouter(() => (
    <Drawer resizeKey="test-discardask-test" isOpen onOpenChange={() => undefined} title="Alias" dirty>
      <input aria-label="Alias" defaultValue="x" />
      <div style={{ height: 2000 }} />
    </Drawer>
  ));
const ask = () => screen.queryByRole('alert');

describe('Drawer: the discard ask cannot be missed', () => {
  it('Esc on a tall, scrolled-to-top drawer shows the ask in view, focused on its safe button and highlighted', async () => {
    await open();
    await frames();
    const body = screen.getByRole('dialog').querySelector<HTMLElement>('[data-drawer-body]')!;
    body.scrollTop = 0;
    screen.getByRole('textbox', { name: 'Alias' }).focus();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Alias' }), { key: 'Escape' });
    await frames();
    const a = ask()!;
    expect(a).toHaveTextContent(strings.discardAsk);
    expect(a).toHaveAttribute('data-attention');
    expect(scrolled).toHaveBeenCalledWith(a, expect.objectContaining({ block: 'nearest' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: strings.keepEditing }));
  });

  it('the X asks the same way, and asking again flashes it again', async () => {
    await open();
    await frames();
    fireEvent.click(screen.getAllByRole('button', { name: strings.close }).at(-1)!);
    await frames();
    const first = ask()!;
    expect(first).toHaveAttribute('data-attention');
    // Focus wandered back to the field; X once more brings the ask back and moves focus to the safe button.
    screen.getByRole('textbox', { name: 'Alias' }).focus();
    fireEvent.click(screen.getAllByRole('button', { name: strings.close }).at(-1)!);
    await frames();
    expect(ask()).not.toBe(first);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: strings.keepEditing }));
  });

  it('Keep editing hands focus back to the field', async () => {
    await open();
    await frames();
    screen.getByRole('textbox', { name: 'Alias' }).focus();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Alias' }), { key: 'Escape' });
    await frames();
    fireEvent.click(screen.getByRole('button', { name: strings.keepEditing }));
    await frames();
    expect(ask()).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Alias' }));
  });

  it('with a phone keyboard open the drawer shrinks to the visible viewport while the ask shows, and restores after', async () => {
    const vv = Object.assign(new EventTarget(), { height: 380, offsetTop: 0 });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    await open();
    await frames();
    screen.getByRole('textbox', { name: 'Alias' }).focus();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Alias' }), { key: 'Escape' });
    await frames();
    const drawer = screen.getByRole('dialog').parentElement!;
    expect(drawer.style.getPropertyValue('--drawer-vv-h')).toBe('380px');
    fireEvent.click(screen.getByRole('button', { name: strings.keepEditing }));
    await frames();
    expect(drawer.style.getPropertyValue('--drawer-vv-h')).toBe('');
  });
});
