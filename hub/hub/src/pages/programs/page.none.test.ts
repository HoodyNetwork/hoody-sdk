// With no computer shown ("All computers"), this page needs one: it shows the shared none state
// (shell ComputerRequired) and sends no read of a computer meanwhile (no polling with nothing to poll).
// eslint-disable-next-line no-restricted-imports -- a test harness for the page's hook, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook, renderPage, screen, waitFor } from '@app/testing';
import { chooseNoComputer, queryClient } from '@core';
import { useOverview } from './data';
import page from './page';
import strings from './strings.en.json';

describe('programs with no computer shown', () => {
  it('shows the none state and sends no computer read', async () => {
    const { queryClient } = await renderPage(page, { computer: false });
    expect(await screen.findByText(strings['st.title.noComputer'])).toBeInTheDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const sent = queryClient
      .getQueryCache()
      .findAll()
      .filter((q) => q.state.dataUpdatedAt > 0 || q.state.errorUpdatedAt > 0 || q.state.fetchStatus !== 'idle')
      .map((q) => JSON.stringify(q.queryKey));
    expect(sent).toEqual([]);
  });

  it('a refresh asked once the computer is cleared (an action settling meanwhile) reads nothing', async () => {
    // The page booted on a computer with its fixture answers; the hook reads beside it, as the page's own action does.
    await renderPage(page);
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
    const view = renderHook(() => useOverview(), { wrapper });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    // The action's callback holds the refresh of the render it started in.
    const before = view.result.current.refetch;
    let fetches = 0;
    const stop = queryClient.getQueryCache().subscribe((e) => {
      if (e.type === 'updated' && e.action.type === 'fetch') fetches += 1;
    });
    act(() => {
      chooseNoComputer();
    });
    await act(async () => {
      await before();
      await view.result.current.refetch();
      await new Promise((r) => setTimeout(r, 20));
    });
    stop();
    expect(fetches).toBe(0);
  });
});
