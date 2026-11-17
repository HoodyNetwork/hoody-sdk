// Guide follows the section the URL names: on arrival, and on every later change while it stays open (the account
// menu's "Ways to connect" reaches an open Guide by navigation, which remounts nothing and fires no hashchange).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

// A jump scrolls the page's own scroller through the kit (scrollSettingsSection); record each one.
const jumps = vi.hoisted(() => ({ scrolled: [] as string[], behaviors: [] as string[] }));
vi.mock('@kit', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  scrollSettingsSection: (el: HTMLElement | null | undefined, smooth: boolean) => {
    jumps.scrolled.push(el?.id ?? '');
    jumps.behaviors.push(smooth ? 'smooth' : 'auto');
  },
}));

let scrolled: string[] = [];
let behaviors: string[] = [];
beforeEach(() => {
  scrolled = jumps.scrolled = [];
  behaviors = jumps.behaviors = [];
});
afterEach(() => vi.restoreAllMocks());

const nav = () => screen.getByRole('navigation', { name: strings['sections.label'] });
const currentIs = (title: string) => expect(within(nav()).getByRole('link', { current: 'location' })).toHaveTextContent(title);

describe('guide sections by hash', () => {
  it('opens on the section the link names, as before: one scroll, no animation, focus left where it was', async () => {
    await renderPage(page, { path: '/guide#bots' });
    // The first render of a file loads the page cold: up to 30 s for it to appear (the cold load can be slow on a busy machine).
    await waitFor(() => expect(scrolled).toEqual(['guide-bots']), { timeout: 30_000 });
    currentIs(strings['ix.bots']);
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
    expect(scrolled).toEqual(['guide-bots']);
    expect(behaviors).toEqual(['auto']);
    expect(document.activeElement?.closest('#guide-bots')).toBeNull();
  }, 45_000);

  it('jumps on every later hash change while open, from any section', async () => {
    const { router } = await renderPage(page, { path: '/guide#bots' });
    await waitFor(() => expect(scrolled).toEqual(['guide-bots']));
    await act(async () => {
      await router.navigate({ href: '/guide#connect' } as never);
    });
    await waitFor(() => expect(scrolled).toEqual(['guide-bots', 'guide-connect']));
    currentIs(strings['ix.connect']);
    await act(async () => {
      await router.navigate({ href: '/guide?door=cli#keys' } as never);
    });
    await waitFor(() => expect(scrolled).toEqual(['guide-bots', 'guide-connect', 'guide-keys']));
    currentIs(strings['ix.keys']);
  });

  it('jumps again to a section named after the hash was cleared', async () => {
    const { router } = await renderPage(page, { path: '/guide#connect' });
    await waitFor(() => expect(scrolled).toEqual(['guide-connect']));
    await act(async () => {
      await router.navigate({ href: '/guide' } as never);
    });
    await act(async () => {
      await router.navigate({ href: '/guide#connect' } as never);
    });
    await waitFor(() => expect(scrolled).toEqual(['guide-connect', 'guide-connect']));
  });

  it('a hash naming a section that is not there does not stop the next one (Topics absent, then back to Connect)', async () => {
    const { router } = await renderPage(page, { path: '/guide#connect' });
    await waitFor(() => expect(scrolled).toEqual(['guide-connect']));
    expect(document.getElementById('guide-topics')).toBeNull();
    await act(async () => {
      await router.navigate({ href: '/guide#topics' } as never);
    });
    await act(async () => {
      await router.navigate({ href: '/guide#connect' } as never);
    });
    await waitFor(() => expect(scrolled).toEqual(['guide-connect', 'guide-connect']));
  });

  it('hash changes made while the facts still load are not lost (pick, J, absent Topics, back to the pick)', async () => {
    const { router } = await renderPage(page, { latency: 'slow' });
    await screen.findByRole('heading', { level: 2, name: strings['connect.title'] });
    await userEvent.click(within(nav()).getByRole('link', { name: strings['ix.connect'] }));
    await userEvent.keyboard('j');
    expect(scrolled).toEqual(['guide-connect', 'guide-skills']);
    await act(async () => {
      await router.navigate({ href: '/guide#topics' } as never);
    });
    await act(async () => {
      await router.navigate({ href: '/guide#connect' } as never);
    });
    expect(scrolled).toEqual(['guide-connect', 'guide-skills']);
    await waitFor(() => expect(scrolled).toEqual(['guide-connect', 'guide-skills', 'guide-connect']), { timeout: 6000 });
  });

  it('a pick made before a queued hash jump has run wins: the queued jump never runs after it', async () => {
    const { router } = await renderPage(page);
    await screen.findByRole('heading', { level: 2, name: strings['connect.title'] });
    const held: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => held.push(cb));
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((n) => {
      held[n - 1] = () => undefined;
    });
    await act(async () => {
      await router.navigate({ href: '/guide#bots' } as never);
    });
    expect(held.length).toBeGreaterThan(0);
    expect(scrolled).toEqual([]);
    await userEvent.click(within(nav()).getByRole('link', { name: strings['ix.tools'] }));
    await waitFor(() => expect(scrolled).toEqual(['guide-tools']));
    act(() => {
      for (const cb of held.splice(0)) cb(0);
    });
    expect(scrolled).toEqual(['guide-tools']);
  });

  it('a pick from the index jumps once, not again when its own hash lands', async () => {
    await renderPage(page);
    await screen.findByRole('heading', { level: 2, name: strings['connect.title'] });
    await userEvent.click(within(nav()).getByRole('link', { name: strings['ix.tools'] }));
    await waitFor(() => expect(scrolled).toEqual(['guide-tools']));
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
    expect(scrolled).toEqual(['guide-tools']);
  });

  it('a hash that names no section moves nothing', async () => {
    const { router } = await renderPage(page, { path: '/guide#nope' });
    await screen.findByRole('heading', { level: 2, name: strings['connect.title'] });
    await act(async () => {
      await router.navigate({ href: '/guide#also-nope' } as never);
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
    expect(scrolled).toEqual([]);
  });
});
