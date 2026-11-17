// SettingsPage rail jump: the section param is written without a scroll reset. The router's scroll restore otherwise
// re-applies the position from before the click and cancels the scroll the jump just started (rail.spec.ts proves it in
// a browser; this keeps the navigate option itself pinned).
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPage, type SettingsSection } from './Layouts';

const sections: SettingsSection[] = [
  { id: 'profile', title: 'Profile', content: <p>p</p> },
  { id: 'password', title: 'Password', content: <p>pw</p> },
  { id: 'agent', title: 'Agent sign-in', content: <p>agent</p> },
];

async function open() {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <SettingsPage header={{ title: 'Account' }} sections={sections} /> }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}

describe('SettingsPage rail jump', () => {
  it('writes the section param with resetScroll false, replacing the entry', async () => {
    const router = await open();
    const navigate = vi.spyOn(router, 'navigate');
    await userEvent.click(screen.getByRole('button', { name: 'Agent sign-in' }));
    const call = navigate.mock.calls.find((c) => typeof (c[0] as { search?: unknown }).search === 'function');
    expect(call).toBeDefined();
    expect(call?.[0]).toMatchObject({ replace: true, resetScroll: false });
    expect(router.state.location.search).toMatchObject({ section: 'agent' });
  });

  it('every later click keeps resetScroll false', async () => {
    const router = await open();
    const navigate = vi.spyOn(router, 'navigate');
    for (const name of ['Password', 'Agent sign-in', 'Password']) await userEvent.click(screen.getByRole('button', { name }));
    const writes = navigate.mock.calls.filter((c) => typeof (c[0] as { search?: unknown }).search === 'function');
    expect(writes).toHaveLength(3);
    for (const w of writes) expect(w[0]).toMatchObject({ resetScroll: false });
  });
});
