// No gates count reaches the shell (the AI tab reads its own), so while a dock conversation
// waits for the person the AI entry shows a dot with no number, drawn on the rail and in the expanded list alike, and
// its name says so ("AI, waiting for you", starting with the label drawn: Label in Name).
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider } from './context';
import { PagesProvider } from './pageLinks';
import { Sidebar } from './Sidebar';

const ask = vi.hoisted(() => ({ waiting: false }));
vi.mock('../ask', async (importActual) => ({ ...(await importActual<object>()), useAskWaiting: () => ask.waiting }));

const pg = (id: string, title: string) => ({ id, path: `/${id}`, title, nav: {}, strings: { [title]: title }, status: 'ready' }) as unknown as PageManifest;
const PAGES = [pg('home', 'Home'), pg('bots', 'Bots'), pg('ai', 'AI')];

async function sidebar(collapsed: boolean, botsWaiting = 0) {
  const Component = () => (
    <PagesProvider pages={PAGES}>
      <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], botsWaiting }}>
        <Sidebar pages={PAGES} collapsed={collapsed} onToggleCollapsed={() => {}} onNavigate={() => {}} />
      </ShellDataProvider>
    </PagesProvider>
  );
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const aiLink = () => screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/ai') as HTMLElement;

afterEach(() => {
  cleanup();
  ask.waiting = false;
});

describe('Sidebar AI waiting dot', () => {
  for (const collapsed of [false, true]) {
    it(`${collapsed ? 'rail' : 'expanded'}: a waiting dock conversation draws the always-shown needs dot, no number`, async () => {
      ask.waiting = true;
      await sidebar(collapsed);
      const link = aiLink();
      expect(link).toHaveAccessibleName('AI, waiting for you');
      const dot = link.querySelector('span[aria-hidden="true"].railDot');
      expect(dot).not.toBeNull();
      expect(dot).toHaveClass('needs', 'dotAlways');
      expect(link.querySelector('[data-count-badge]')).toBeNull();
      expect(link).toHaveTextContent(/^AI$/);
    });
  }
  it('nothing waiting: the AI entry is its label alone', async () => {
    await sidebar(false);
    const link = aiLink();
    expect(link).toHaveAccessibleName('AI');
    expect(link).not.toHaveAttribute('aria-label');
    expect(link.querySelector('.railDot')).toBeNull();
  });
  it('the dot is the AI entry\'s alone: Bots keeps its count, and no other entry gets dotAlways', async () => {
    ask.waiting = true;
    await sidebar(false, 3);
    expect(screen.getByRole('link', { name: 'Bots 3 waiting for you' }).closest('a')?.querySelector('[data-count-badge]')).toHaveTextContent('3');
    expect(document.querySelectorAll('.dotAlways')).toHaveLength(1);
  });
});
