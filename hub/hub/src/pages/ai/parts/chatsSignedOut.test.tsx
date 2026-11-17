// AI › Chats › This computer when the computer's agent lost its platform login (GET /sessions answers 503
// restriction_unknown): the list's place holds the shared agent sign-in with its own button,
// never the generic "This didn't load" (kit agent.ts: a signed-out agent is not an outage). Real core on the fixture
// transport (fixtures.chats.ts `signedOut`). Replaced in '@core': the sign-in (signInAgent) and Check again's status read
// (checkAgentLogin). Pinned (C9): a sign-in that may have gone through holds across the list
// reading again and a scope switch, so the place never offers a second one.
import { bootFixtureCore, chooseComputer, fixtureWorld, queryClient } from '@core';
import kitStrings from '@kit/strings.en.json';
import signIn from '@app/agentSignIn.strings.en.json';
// eslint-disable-next-line no-restricted-imports -- a router harness for the list, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Core from '@core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import pane from './Pane.strings.en.json';
import { resetChatScopeForTests } from './allChats';
import { ChatList } from './ChatList';
import { useChats, useChatsAt, type ChatsAt } from './data';
import { chatRules } from './fixtures.chats';

const w = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return {
    ...real,
    // The answer was lost: "may have been signed in" (core's agent-signin: unknown, never "not signed in").
    signInAgent: async () => { w.calls.push('signIn'); return { kind: 'unknown' }; },
    // The agent's status still says signed out (the refusal stands).
    checkAgentLogin: async () => { w.calls.push('check'); return 'login'; },
  };
});

const atlas = fixtureWorld.computers[0]!;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');

beforeEach(() => {
  w.calls = [];
  // The pane takes the page region's width, as in Pane.test.tsx.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1300 });
});
afterEach(() => {
  cleanup();
  resetChatScopeForTests();
  queryClient.clear();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

async function show(signedOut: boolean) {
  function List({ at }: { at: ChatsAt }) {
    return <ChatList at={at} chats={useChats(at)} handle={`atlas.${atlas.id.slice(-4)}`} computerName="atlas" />;
  }
  function Harness() {
    const at = useChatsAt();
    return at ? <List at={at} /> : null;
  }
  bootFixtureCore({ rules: chatRules({ signedOut: { on: signedOut } }) });
  act(() => chooseComputer(atlas));
  const router = createRouter({ routeTree: createRootRoute({ component: Harness }), history: createMemoryHistory({ initialEntries: ['/ai'] }) });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
}

it("a signed-out agent: the sign-in takes the list's place, never \"This didn't load\"", async () => {
  await show(true);
  await waitFor(() => expect(screen.getByText(fill(signIn['signin.need.own'], { computer: 'atlas' }))).toBeInTheDocument());
  expect(screen.getByRole('button', { name: signIn['signin.press'] })).toBeInTheDocument();
  expect(screen.queryByText(kitStrings['state.errorTitle'])).toBeNull();
});

it('a signed-in agent: the chats list, no sign-in', async () => {
  await show(false);
  await waitFor(() => expect(document.querySelectorAll('tr[data-row-id]').length).toBeGreaterThan(0));
  expect(screen.queryByRole('button', { name: signIn['signin.press'] })).toBeNull();
});

/** Every refused read so far (each re-read of the list that the agent refuses again adds one). */
const refusals = () => queryClient.getQueryCache().getAll().reduce((n, q) => n + q.state.errorUpdateCount, 0);
/** `go`, then the list's read answered again (refused) and nothing is still reading. */
async function readsAgain(go: () => Promise<unknown> | void) {
  const before = refusals();
  await go();
  await waitFor(() => expect(refusals()).toBeGreaterThan(before));
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
}
/** The place holds the earlier sign-in: "may have been signed in" with Check again, never the sign-in button. */
async function held() {
  expect(await screen.findByText(signIn['signin.unknown.own'])).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: signIn['signin.press'] })).toBeNull();
}

it('a sign-in whose answer was lost holds while the list reads again and across a scope switch: never a second sign-in (C9)', async () => {
  const user = userEvent.setup();
  await show(true);
  await user.click(await screen.findByRole('button', { name: signIn['signin.press'] }));
  await held();
  // Check again: the agent's status, then the list's own read (its refusal clears while that read runs).
  await readsAgain(() => user.click(screen.getByRole('button', { name: signIn['signin.check'] })));
  expect(w.calls).toContain('check');
  await held();
  // Refresh or the list's interval: the list's read again.
  await readsAgain(() => queryClient.refetchQueries());
  await held();
  // All computers and back: This computer's list is drawn again.
  await user.click(screen.getByRole('button', { name: pane['scope.toAll'] }));
  act(() => resetChatScopeForTests());
  await held();
  expect(w.calls.filter((c) => c === 'signIn')).toHaveLength(1);
});
