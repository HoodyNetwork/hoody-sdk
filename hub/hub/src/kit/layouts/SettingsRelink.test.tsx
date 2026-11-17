// SettingsPage deep link: ?section= scrolls to its section each time it changes to a section the page has not just
// shown, not only the first time. A page that stays mounted while a command or link writes another ?section= (the
// palette's "Set up Claude Code" then "See what AI cost") must land on each. The reader's own rail jump scrolls
// smoothly itself and writes the param without a second, instant landing that would cut its scroll short.
// jsdom has no layout: #hub-main is a plain element and its scrollTo is a spy; the landing is the instant call.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage, type SettingsSection } from './Layouts';

const sections: SettingsSection[] = [
  { id: 'profile', title: 'Profile', content: <p>p</p> },
  { id: 'password', title: 'Password', content: <p>pw</p> },
  { id: 'agent', title: 'Agent sign-in', content: <p>agent</p> },
];

let scrollTo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollTo = vi.fn();
  vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(scrollTo as unknown as HTMLElement['scrollTo']);
});

afterEach(() => vi.restoreAllMocks());

async function open(start: string) {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <div id="hub-main">
          <SettingsPage header={{ title: 'Account' }} sections={sections} />
        </div>
      ),
    }),
    history: createMemoryHistory({ initialEntries: [start] }),
  });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}

const landings = () => scrollTo.mock.calls.filter((c) => (c[0] as { behavior?: string }).behavior === 'auto').length;
const jumps = () => scrollTo.mock.calls.filter((c) => (c[0] as { behavior?: string }).behavior === 'smooth').length;
const current = () => document.querySelector<HTMLElement>('[data-nav][aria-current="true"]');

describe('SettingsPage ?section= landing', () => {
  it('lands on the section of the deep link once', async () => {
    await open('/?section=password');
    expect(landings()).toBe(1);
    expect(current()).toHaveTextContent('Password');
  });

  it('lands again when the param moves to another section while the page stays mounted', async () => {
    const router = await open('/?section=password');
    await act(async () => void (await router.navigate({ to: '/', search: { section: 'agent' } })));
    expect(landings()).toBe(2);
    expect(current()).toHaveTextContent('Agent sign-in');
    await act(async () => void (await router.navigate({ to: '/', search: { section: 'password' } })));
    expect(landings()).toBe(3);
    expect(current()).toHaveTextContent('Password');
  });

  it('lands on a section after the param was cleared, even the one it showed before', async () => {
    const router = await open('/?section=agent');
    await act(async () => void (await router.navigate({ to: '/', search: {} })));
    await act(async () => void (await router.navigate({ to: '/', search: { section: 'agent' } })));
    expect(landings()).toBe(2);
  });

  it('a rail jump scrolls once, smoothly: its own ?section= write does not land again', async () => {
    await open('/?section=profile');
    expect(landings()).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: 'Agent sign-in' }));
    expect(jumps()).toBe(1);
    expect(landings()).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: 'Profile' })); // the first entry clears the param
    expect(jumps()).toBe(2);
    expect(landings()).toBe(1);
  });

  it('a landing elsewhere ends the glide: a link back to the jumped-to section within moments lands on it', async () => {
    const router = await open('/?section=profile');
    await userEvent.click(screen.getByRole('button', { name: 'Agent sign-in' }));
    await act(async () => void (await router.navigate({ to: '/', search: { section: 'password' } })));
    expect(landings()).toBe(2);
    await act(async () => void (await router.navigate({ to: '/', search: { section: 'agent' } })));
    expect(landings()).toBe(3);
  });

  it('clearing the param ends the glide: a link to the jumped-to section after it lands on it', async () => {
    const router = await open('/');
    await userEvent.click(screen.getByRole('button', { name: 'Agent sign-in' }));
    await act(async () => void (await router.navigate({ to: '/', search: {} })));
    expect(landings()).toBe(0);
    await act(async () => void (await router.navigate({ to: '/', search: { section: 'agent' } })));
    expect(landings()).toBe(1);
  });

  it('a link to a section after a rail jump lands on it', async () => {
    const router = await open('/');
    await userEvent.click(screen.getByRole('button', { name: 'Password' }));
    await act(async () => void (await router.navigate({ to: '/', search: { section: 'agent' } })));
    expect(landings()).toBe(1);
    expect(current()).toHaveTextContent('Agent sign-in');
  });
});
