// The phone bar's AI tab (it replaced the Agent button that opened the Ask dock) carries what that button showed,
// naming itself once: "AI", or the waiting words, which already start with AI, then the running count,
// as the top bar's button does. The running count is drawn before the label, so the name starts with it (WCAG 2.5.3):
// "1 AI, 1 conversation running". The count is the Ask panel's own words (activityLabel): when they already say how many
// need you, the waiting words are not said again. It is a link to /ai, never a dock toggle.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomNav } from './BottomNav';
import type * as AskPanelModule from '../ask/AskPanel';
import type * as StringsModule from '@kit/strings';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider } from './context';

// here: the gate waits on the shown computer (its activity counts it); elsewhere: on another computer only.
const ask = vi.hoisted(() => ({ waiting: false, here: true, running: 0 }));
vi.mock('../ask', async () => {
  const { activityLabel } = await vi.importActual<typeof AskPanelModule>('../ask/AskPanel');
  const { makeT } = await vi.importActual<typeof StringsModule>('@kit/strings');
  const askStrings = (await vi.importActual<{ default: Record<string, string> }>('../ask/strings.en.json')).default;
  const t = makeT(askStrings) as Parameters<typeof activityLabel>[1];
  return {
    useAskWaiting: () => ask.waiting,
    useAskActivityLabel: () => {
      if (!ask.running) return { activity: null, label: '' };
      const activity = { running: ask.running, waiting: ask.waiting && ask.here ? 1 : 0, by: {} } as unknown as Parameters<typeof activityLabel>[0];
      return { activity, label: activityLabel(activity, t) };
    },
  };
});

const page = (id: string, title: string) => ({ id, path: `/${id}`, title, strings: { [title]: title }, status: 'ready' }) as unknown as PageManifest;

async function show() {
  const Component = () => (
    <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], botsWaiting: 0 }}>
      <BottomNav pages={[page('home', 'Home'), page('ai', 'AI')]} onMore={() => undefined} moreOpen={false} />
    </ShellDataProvider>
  );
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

afterEach(() => {
  cleanup();
  ask.waiting = false;
  ask.here = true;
  ask.running = 0;
});

describe('BottomNav AI tab label', () => {
  it('waiting here: the drawn count and AI, then the count that already says who needs you (no waiting words twice)', async () => {
    ask.waiting = true;
    ask.running = 1;
    await show();
    const tab = screen.getByRole('link', { name: '1 AI, 1 conversation running, 1 needs you' });
    expect(tab).toHaveAttribute('href', '/ai');
    expect(tab).toHaveTextContent(/^1 AI$/);
    expect(Array.from(tab.querySelectorAll('span[aria-hidden="true"]'), (el) => el.textContent)).toEqual(['1']);
  });
  it('waiting on another computer: the waiting words once, then the running count here', async () => {
    ask.waiting = true;
    ask.here = false;
    ask.running = 1;
    await show();
    expect(screen.getByRole('link', { name: '1 AI, waiting for you, 1 conversation running' })).toBeInTheDocument();
  });
  it('waiting with nothing counted: the waiting words alone, and the dot drawn', async () => {
    ask.waiting = true;
    await show();
    const tab = screen.getByRole('link', { name: 'AI, waiting for you' });
    expect(tab.querySelector('span[aria-hidden="true"]')).not.toBeNull();
    expect(tab).toHaveTextContent(/^AI$/);
  });
  it('running only: the drawn count and AI, then the count in words', async () => {
    ask.running = 2;
    await show();
    expect(screen.getByRole('link', { name: '2 AI, 2 conversations running' })).toHaveTextContent(/^2 AI$/);
  });
  it('over 99 running: the name starts with the count as drawn (99+), the exact count follows in words', async () => {
    ask.running = 100;
    await show();
    expect(screen.getByRole('link', { name: '99+ AI, 100 conversations running' })).toHaveTextContent(/^99\+ AI$/);
  });
  it('nothing to say: the visible label names it, no badge and no dot', async () => {
    await show();
    const tab = screen.getByRole('link', { name: 'AI' });
    expect(tab).not.toHaveAttribute('aria-label');
    expect(tab.querySelector('span[aria-hidden="true"]')).toBeNull();
  });
  it('no button opens the dock from the phone bar any more', async () => {
    ask.waiting = true;
    await show();
    expect(screen.queryByRole('button', { name: /^AI|^Agent/ })).toBeNull();
  });
});
