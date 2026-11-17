// Vitest: the computers list's State filter offers every state group a computer can be in (a starting computer
// was in no option: picking any state hid it), and a filter that matches nothing says "No computers match".
// eslint-disable-next-line no-restricted-imports -- a test harness for the list's queries, not page code
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router for a part rendered without its page, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { act, render, screen, userEvent } from '@app/testing';
import { computers } from './fixtures';
import { stateGroup } from './logic';
import { ComputersList } from './parts/ComputersList';
import strings from './strings.en.json';

async function mount(path: string, rows = [computers[0]!]) {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <ComputersList computers={rows} projects={[]} realms={[]} caps="all" currentId={undefined} loading={false} error={null} onRetry={() => {}} ops={{}} usage={undefined} servers={[]} onAction={() => {}} onBulk={() => {}} empty={null} />
      ),
    }),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
}

describe('the State filter', () => {
  it('Starting is a state you can filter by: it keeps the starting computer and hides the running one', async () => {
    const running = { ...computers[0]!, id: 'aaaaaaaaaaaaaaaaaaaaaa01', name: 'up-one', status: 'running' };
    const starting = { ...computers[0]!, id: 'aaaaaaaaaaaaaaaaaaaaaa02', name: 'boot-one', status: 'starting' };
    expect(stateGroup(starting.status)).toBe('starting');
    await mount('/computers?state=starting', [running, starting]);
    expect(await screen.findByText('boot-one')).toBeInTheDocument();
    expect(screen.queryByText('up-one')).toBeNull();
  });

  it('the State menu offers Starting beside the other states', async () => {
    await mount('/computers');
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${strings['filter.state']}`) }));
    for (const g of ['running', 'starting', 'stopped', 'problems'] as const) {
      expect(await screen.findByRole('menuitemradio', { name: strings[`filter.state.${g}`] })).toBeInTheDocument();
    }
  });

  it('matching nothing says No computers match', async () => {
    await mount('/computers?q=zzzz-no-such-computer');
    expect(await screen.findByText(strings['empty.title'])).toBeInTheDocument();
  });
});
