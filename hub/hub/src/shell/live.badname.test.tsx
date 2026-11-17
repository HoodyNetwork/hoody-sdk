// A computer row whose name, server_name or server city is not text (an object or a number in a malformed answer) never
// blanks the Hub: the shell draws such fields as React children and labels, so it reads them as none. The computer is
// named by its server's name when only that is text, else "Unnamed computer", and its location drops what is not text
// (never "[object Object]").
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { answers, bootFixtureCore, queryClient, reply } from '@core';
import { containersRoute } from '@core/shell';
import { target } from '@core/ctx';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';
import strings from './strings.en.json';

function Home() {
  return (
    <h1 data-hub-title tabIndex={-1}>
      Home
    </h1>
  );
}
const PAGES: PageManifest[] = [
  definePage({ id: 'home', path: '/home', title: 'title', layout: 'settings', load: async () => ({ default: Home }), status: 'ready', sensitive: false, strings: { title: 'Home' } }),
];
const base = { id: 'c-odd', status: 'running', project_id: 'p1' };

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  queryClient.clear();
});

async function mount(): Promise<void> {
  const router = buildRouter(PAGES, { queryClient, shell: true, history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  await screen.findByRole('heading', { level: 1, name: 'Home' });
}

describe('the shell over a computer row with fields that are not text', () => {
  it.each([
    ['an object name: named by its server', { ...base, name: { text: 'x' }, server_name: 'srv-odd' }, 'srv-odd'],
    ['a number name: named by its server', { ...base, name: 42, server_name: 'srv-odd' }, 'srv-odd'],
    ['no text name and no server name: Unnamed computer', { ...base, name: { a: 1 }, server: { city: { c: 3 } } }, strings['top.computerUnnamed']],
  ])('%s; the page draws, no root error', async (_name, row, shown) => {
    // The whole list holds only this row: the shell picks it as the computer shown and draws its name.
    bootFixtureCore({ realm: 'all', rules: [reply(containersRoute, answers.ok({ data: { computers: [row], pagination: { totalPages: 1 } } }, 200))] });
    queryClient.clear();
    await mount();
    await waitFor(() => expect(target()?.container.id).toBe('c-odd'), { timeout: 8000 });
    await waitFor(() => expect(document.body.textContent).toContain(shown), { timeout: 8000 });
    expect(document.getElementById('hub-main')).not.toBeNull();
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
    expect(document.body.textContent).not.toContain('[object Object]');
  });
});
