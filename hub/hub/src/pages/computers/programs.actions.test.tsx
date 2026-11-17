// The Programs tab offers Launch an app
// (primary) and New program… (secondary) in one ActionBar. Both go to the Programs page, which shows the current
// computer, so this computer is made current first when it is not. An empty list carries the same two actions in its
// empty state and the bar hides (no duplicate). With the Programs page hidden there is nowhere to go: no actions.
import * as coreModule from '@core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as kitModule from '@kit';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const hidden = new Set<string>();
vi.mock('@kit', async (importOriginal) => {
  const orig = await importOriginal<typeof kitModule>();
  return {
    ...orig,
    usePageVisible: (id: string) => !hidden.has(id),
    usePageLink: (id: string) => (hidden.has(id) ? null : orig.usePageLink(id)),
  };
});
const chosen: string[] = [];
vi.mock('@core', async (importOriginal) => {
  const orig = await importOriginal<typeof coreModule>();
  return {
    ...orig,
    chooseComputer: (c: Parameters<typeof orig.chooseComputer>[0]) => {
      chosen.push(c.id);
      return orig.chooseComputer(c);
    },
  };
});
afterEach(() => {
  hidden.clear();
  chosen.length = 0;
});

const PATH = '/computers?sel=atlas.00a1&tab=programs';
const atlas = coreModule.fixtureWorld.current;
const search = (r: { router: { state: { location: { search: unknown } } } }) => r.router.state.location.search as Record<string, unknown>;
const bar = () => screen.findByRole('group', { name: strings['prog.actions'] }, { timeout: 8000 });

describe('computers: Programs tab actions', () => {
  it('Launch an app opens the Programs page apps launcher, without re-choosing the current computer', async () => {
    const r = await renderPage(page, { path: PATH });
    await screen.findByRole('table', { name: strings['prog.title'] }, { timeout: 20000 });
    const group = await bar();
    expect(within(group).getByRole('button', { name: strings['prog.newProgram'] })).toBeInTheDocument();
    chosen.length = 0;
    await userEvent.click(within(group).getByRole('button', { name: strings['prog.launchApp'] }));
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/programs'));
    expect(search(r).tab).toBe('apps');
    expect(String(search(r).launch)).toBe('1');
    expect(chosen).toEqual([]);
  }, 30000);

  it('New program… makes this computer current first, then opens the Programs page with the form asked for', async () => {
    const r = await renderPage(page, { path: PATH, computer: false });
    await screen.findByRole('table', { name: strings['prog.title'] }, { timeout: 20000 });
    const group = await bar();
    await userEvent.click(within(group).getByRole('button', { name: strings['prog.newProgram'] }));
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/programs'));
    expect(String(search(r).new)).toBe('1');
    expect(chosen).toEqual([atlas.id]);
    expect(coreModule.rememberedComputerId()).toBe(atlas.id);
  }, 30000);

  it('an empty list carries both actions in its empty state, and the bar hides', async () => {
    const r = await renderPage(page, { path: PATH, state: 'programsEmpty' });
    const empty = await screen.findByText(strings['prog.empty'], undefined, { timeout: 8000 });
    expect(screen.queryByRole('group', { name: strings['prog.actions'] })).toBeNull();
    expect(screen.getAllByRole('button', { name: strings['prog.launchApp'] })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: strings['prog.newProgram'] })).toHaveLength(1);
    expect(empty).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['prog.launchApp'] }));
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/programs'));
    expect(String(search(r).launch)).toBe('1');
  }, 30000);

  it('no actions while this load hides the Programs page', async () => {
    hidden.add('programs');
    await renderPage(page, { path: PATH });
    await screen.findByRole('table', { name: strings['prog.title'] }, { timeout: 20000 });
    expect(screen.queryByRole('group', { name: strings['prog.actions'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['prog.launchApp'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['prog.newProgram'] })).toBeNull();
  });
});
