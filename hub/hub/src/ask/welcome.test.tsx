// welcome.test.tsx: the panel is named "Agent" (the agent program's own app is "the Agent app",
// so the two never read alike), and its first-use view carries one warm note with Ways to connect, dismissible,
// remembered per browser (localStorage in try/catch; a refusing browser hides it for this page only).
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { useStrings } from '@kit';
import { ShellDataProvider, type ShellData } from '../shell/context';
import { PagesProvider } from '../shell/pageLinks';
import { FirstUse } from './AskPanel';
import { resetWelcomeForTests, WELCOME_KEY } from './welcome';
import strings from './strings.en.json';

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const shell: ShellData = { realms: [], realmId: 'r1', computers: [] };

function First() {
  const t = useStrings(strings);
  return <FirstUse computer="blog-1" path="/home" onPick={() => {}} t={t} />;
}

async function mount(pages: PageManifest[] = [pg('home'), pg('guide')]) {
  const Component = () => <PagesProvider pages={pages}><ShellDataProvider value={shell}><First /></ShellDataProvider></PagesProvider>;
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const S = strings as Record<string, string>;
const note = () => screen.queryByRole('complementary', { name: S['ask.welcomeLabel'] });

beforeEach(() => { localStorage.clear(); resetWelcomeForTests(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('the panel is called Agent', () => {
  it('the panel name, its close button and the first-use title say Agent', () => {
    expect(S['ask.label']).toBe('Agent');
    expect(S['ask.close']).toBe('Close Agent');
    expect(S['ask.back']).toBe('Close Agent');
    expect(S['ask.firstTitle']).toBe('Your agent on {{computer}}');
  });
  it('no shown string names the panel "Ask" (verbs in prompts the person sends are not names)', () => {
    const named = Object.entries(S).filter(([k, v]) => /\bAsk\b/.test(v) && !/^ask\.s\.[A-Za-z]+\.p$/.test(k) && k !== 'ask.tool.ask');
    expect(named).toEqual([]);
  });
  it('the agent program is always "the Agent app", so it never reads as this panel', () => {
    const bare = Object.entries(S).filter(([, v]) => /\bthe Agent\b(?! app)/.test(v));
    expect(bare).toEqual([]);
  });
});

describe('the welcome note', () => {
  it('first use shows one warm sentence with Ways to connect to the Guide', async () => {
    await mount();
    const n = note();
    expect(n).not.toBeNull();
    expect(n!.textContent).toContain(S['ask.welcome']);
    const link = screen.getByRole('link', { name: S['ask.welcomeLink'] });
    expect(link.getAttribute('href')).toBe('/guide#connect');
  });
  it('never warns or frames the panel as weak', () => {
    expect(S['ask.welcome']).not.toMatch(/limit|only|warn|can't|cannot|weak|basic/i);
    expect((S['ask.welcome'] ?? '').split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length).toBe(1);
  });
  it('Got it hides it and this browser remembers', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: S['ask.welcomeHide'] }));
    expect(note()).toBeNull();
    expect(localStorage.getItem(WELCOME_KEY)).toBe('1');
    cleanup();
    resetWelcomeForTests();
    await mount();
    expect(note()).toBeNull();
  });
  it('a browser that refuses storage still shows it, and Got it hides it for this page', async () => {
    // The instance, not Storage.prototype: happy-dom keeps each Storage method on the instance once it was used, so a
    // prototype spy never reaches localStorage after an earlier use. Restored by
    // hand: these spies outlive restoreAllMocks here.
    const get = vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const set = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    try {
      await mount();
      expect(get).toHaveBeenCalledWith(WELCOME_KEY);
      expect(note()).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: S['ask.welcomeHide'] }));
      expect(set).toHaveBeenCalledWith(WELCOME_KEY, '1');
      expect(note()).toBeNull();
    } finally { get.mockRestore(); set.mockRestore(); }
  });
  it('another tab dismissing it hides it here too', async () => {
    await mount();
    expect(note()).not.toBeNull();
    localStorage.setItem(WELCOME_KEY, '1');
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: WELCOME_KEY })); });
    expect(note()).toBeNull();
  });
  it('dismissed here, then the flag removed in another tab: it shows again', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: S['ask.welcomeHide'] }));
    expect(note()).toBeNull();
    localStorage.removeItem(WELCOME_KEY);
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: WELCOME_KEY })); });
    expect(note()).not.toBeNull();
  });
  it('dismissed here, then storage cleared (key null): it shows again', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: S['ask.welcomeHide'] }));
    expect(note()).toBeNull();
    localStorage.clear();
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: null })); });
    expect(note()).not.toBeNull();
  });
  it('with the Guide hidden there is no dead link, and the note can still be dismissed', async () => {
    await mount([pg('home')]);
    expect(note()).not.toBeNull();
    expect(screen.queryByRole('link', { name: S['ask.welcomeLink'] })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: S['ask.welcomeHide'] }));
    expect(note()).toBeNull();
  });
});
