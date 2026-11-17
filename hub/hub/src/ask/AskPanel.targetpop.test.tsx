// The dock head's "Where your agent works" popover: following one of its page links closes the popover (it stayed open
// over the page it had just opened), and a dock drawn as a phone's full-screen sheet closes too (the new page stayed
// hidden under it). Beside the page (not a phone) the dock stays open.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider, type ShellData } from '../shell/context';
import { PagesProvider } from '../shell/pageLinks';
import { Header, type HeaderProps } from './AskPanel';
import strings from './strings.en.json';

afterEach(() => { cleanup(); });

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const t = ((k: string) => (strings as Record<string, string>)[k] ?? k) as unknown as HeaderProps['t'];

async function mount(el: ReactElement) {
  const data: ShellData = { realms: [], realmId: 'r1', computers: [] };
  const Component = () => <PagesProvider pages={[pg('home'), pg('computers'), pg('ai'), pg('guide')]}><ShellDataProvider value={data}>{el}</ShellDataProvider></PagesProvider>;
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => { render(<RouterProvider router={router} />); await router.load(); });
  return router;
}
const header = (phone: boolean, onClose: () => void) => (
  <Header t={t} phone={phone} onClose={onClose} realmName="Personal" computer="atlas" computerHref="/computers?sel=atlas.ab12" eng={null} snap={null} agentUrl="" />
);
const openPop = async () => {
  const chip = screen.getByRole('button', { name: /atlas/ });
  await act(async () => { fireEvent.click(chip); });
  return screen.getByRole('link', { name: strings['ask.openComputer'] });
};

describe('a page link followed inside the target popover', () => {
  it('closes the popover and leaves a dock beside the page open', async () => {
    const onClose = vi.fn();
    await mount(header(false, onClose));
    const link = await openPop();
    expect(link.getAttribute('href')).toBe('/computers?sel=atlas.ab12');
    await act(async () => { fireEvent.click(link); });
    expect(screen.queryByRole('link', { name: strings['ask.openComputer'] })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('on a phone closes the sheet too, so the page it opened shows', async () => {
    const onClose = vi.fn();
    await mount(header(true, onClose));
    const link = await openPop();
    await act(async () => { fireEvent.click(link); });
    expect(screen.queryByRole('link', { name: strings['ask.openComputer'] })).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('every page link in it does (AI models, Ways to connect)', async () => {
    for (const key of ['ask.openModels', 'ask.welcomeLink'] as const) {
      const onClose = vi.fn();
      await mount(header(true, onClose));
      await openPop();
      await act(async () => { fireEvent.click(screen.getByRole('link', { name: strings[key] })); });
      expect(screen.queryByRole('link', { name: strings[key] })).toBeNull();
      expect(onClose).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });

  it('closing the popover another way leaves the dock alone', async () => {
    const onClose = vi.fn();
    await mount(header(true, onClose));
    await openPop();
    await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }); });
    expect(onClose).not.toHaveBeenCalled();
  });
});
