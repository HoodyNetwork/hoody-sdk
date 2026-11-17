// The top bar's AI button (the Ask dock's), with the panel closed, names itself once. The running count is the Ask
// panel's own words (activityLabel); when they already say how many need you, the waiting words are not said again.
// A gate waiting on another computer only (the shown computer's activity does not count it) keeps the waiting words.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as AskPanelModule from '../ask/AskPanel';
import type * as StringsModule from '@kit/strings';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider } from './context';
import { PagesProvider } from './pageLinks';
import { TopBar } from './TopBar';

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

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;

async function show() {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <PagesProvider pages={[pg('home')]}><TopBar onOpenPalette={() => {}} onOpenShortcuts={() => {}} /></PagesProvider> }),
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  });
  await act(async () => {
    render(
      <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [] }}>
        <RouterProvider router={router} />
      </ShellDataProvider>,
    );
    await router.load();
  });
}

afterEach(() => {
  cleanup();
  ask.waiting = false;
  ask.here = true;
  ask.running = 0;
});

describe('TopBar AI name', () => {
  it('waiting here: AI, then the count that already says who needs you (no waiting words twice)', async () => {
    ask.waiting = true;
    ask.running = 1;
    await show();
    expect(screen.getByRole('button', { name: 'AI, 1 conversation running, 1 needs you' })).toBeInTheDocument();
  });
  it('the panel open: no running count, so a gate waiting here says the waiting words', async () => {
    ask.waiting = true;
    ask.running = 1;
    await show();
    const button = screen.getByRole('button', { name: 'AI, 1 conversation running, 1 needs you' });
    await act(async () => { button.click(); });
    try {
      expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(button).toHaveAccessibleName('AI, waiting for you');
    } finally {
      await act(async () => { button.click(); });
    }
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });
  it('waiting on another computer: the waiting words once, then the running count here', async () => {
    ask.waiting = true;
    ask.here = false;
    ask.running = 2;
    await show();
    expect(screen.getByRole('button', { name: 'AI, waiting for you, 2 conversations running' })).toBeInTheDocument();
  });
  it('waiting with nothing running: the waiting words alone', async () => {
    ask.waiting = true;
    await show();
    expect(screen.getByRole('button', { name: 'AI, waiting for you' })).toBeInTheDocument();
  });
  it('running only: AI, then the count', async () => {
    ask.running = 1;
    await show();
    expect(screen.getByRole('button', { name: 'AI, 1 conversation running' })).toBeInTheDocument();
  });
  it('nothing to say: AI', async () => {
    await show();
    expect(screen.getByRole('button', { name: 'AI' })).toBeInTheDocument();
  });
});
