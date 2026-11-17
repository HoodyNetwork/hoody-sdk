// Keys: each tab's main action is the header's `primary`. On a phone it is the
// floating button, as on every other page with a main action; on a wide screen it is the header's last button. The SSH
// tab has no header action (its Set/Replace sits on the key's own row), so it draws no float. While a key's detail is
// open, its Edit… is the accent: New key steps back and does not float. jsdom has no layout: the header width is given.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const atWidth = (width: number) =>
  class {
    constructor(private cb: (e: { contentRect: { width: number } }[]) => void) {}
    observe() {
      this.cb([{ contentRect: { width } }]);
    }
    unobserve() {}
    disconnect() {}
  };

const fab = () => document.querySelector('[data-hub-fab]');
const header = () => document.querySelector('header');

describe('keys: the tab primary floats on a phone', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => vi.stubGlobal('ResizeObserver', atWidth(390)));

  it('API keys: New key is the floating button, with the plus', async () => {
    await renderPage(page, { path: '/keys' });
    await waitFor(() => expect(fab()).not.toBeNull(), { timeout: 10000 });
    const b = fab()!.querySelector('button')!;
    expect(b.getAttribute('aria-label')).toBe(strings['action.new']);
    expect(b.querySelector('[data-px]')?.getAttribute('data-px')).toBe('plus');
  }, 30000);

  it('Shared access: Share this realm is the floating button, with the arrow (not a create)', async () => {
    await renderPage(page, { state: 'shared', path: '/keys/shared' });
    await waitFor(() => expect(fab()).not.toBeNull(), { timeout: 10000 });
    const b = fab()!.querySelector('button')!;
    expect(b.getAttribute('aria-label')).toBe(strings['action.share']);
    expect(b.querySelector('[data-px]')?.getAttribute('data-px')).toBe('arrow');
  }, 30000);

  it("API keys: while a key's detail is open its Edit… is the accent, so New key does not float", async () => {
    await renderPage(page, { state: 'default' });
    await waitFor(() => expect(fab()).not.toBeNull(), { timeout: 10000 });
    await userEvent.click(await screen.findByRole('row', { name: /ci-deploy/ }, { timeout: 10000 }));
    await screen.findByRole('button', { name: strings['act.edit'] });
    await waitFor(() => expect(fab()).toBeNull());
  }, 60000);

  it('SSH: no header action, no float', async () => {
    await renderPage(page, { path: '/keys/ssh' });
    await waitFor(() => expect(header()).not.toBeNull(), { timeout: 10000 });
    expect(fab()).toBeNull();
  }, 30000);
});

describe('keys: the tab primary on a wide screen', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => vi.stubGlobal('ResizeObserver', atWidth(1200)));

  it('API keys: New key is the last header button, accent, and nothing floats', async () => {
    await renderPage(page, { path: '/keys' });
    const b = await screen.findByRole('button', { name: strings['action.new'] }, { timeout: 10000 });
    expect(header()!.contains(b)).toBe(true);
    const buttons = [...header()!.querySelectorAll('button')];
    expect(buttons[buttons.length - 1]).toBe(b);
    expect(fab()).toBeNull();
  }, 30000);
});
