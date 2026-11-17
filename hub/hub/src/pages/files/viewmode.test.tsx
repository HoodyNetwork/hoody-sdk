// Vitest: Files shows one pane until the viewer asks for two; the One pane / Two panes toggle in the page header
// switches, one pane keeps pane B's address so Two brings it back, a link naming pane B opens two, and the choice is
// remembered.
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import ts from './Transfer.strings.en.json';
import { panesHref, panesMode } from './viewmode';

const A = '/files?a=atlas.00a1';
const region = (k: 'a' | 'b') => screen.queryByRole('region', { name: strings[k === 'a' ? 'pane.a' : 'pane.b'] });

// The page's first render waits up to 30 s: on a busy machine it can take longer than the 5 s default, and that is load,
// not a failure. Later waits keep the default; each test's own time limit leaves room for that first wait.
const FIRST = { timeout: 30_000 } as const;
const LIMIT = { timeout: 60_000 } as const;
const firstPane = (k: 'a' | 'b') => screen.findByRole('region', { name: strings[k === 'a' ? 'pane.a' : 'pane.b'] }, FIRST);

const toggle = () => screen.queryByRole('radiogroup', { name: strings['view.label'] });
const choice = (label: string) => screen.getByRole('radio', { name: label });

async function choose(label: string) {
  await userEvent.click(await screen.findByRole('radio', { name: label }));
}

// renderPage clears registered storage at boot, so every test starts with no remembered choice.
describe('panes mode', () => {
  it('picks one pane by default, two for a link naming pane B, and the address over both', () => {
    expect(panesMode({ a: 'x' }, null)).toBe('one');
    expect(panesMode({ a: 'x' }, 'two')).toBe('two');
    expect(panesMode({ a: 'x', b: 'y' }, 'one')).toBe('two');
    expect(panesMode({ a: 'x', b: 'y', panes: 'one' }, 'two')).toBe('one');
    expect(panesMode({ a: 'x', panes: 'two' }, 'one')).toBe('two');
    expect(panesHref({ a: 'x', b: 'y', bp: '/srv' }, 'one')).toBe('/files?a=x&b=y&bp=%2Fsrv&panes=one');
    expect(panesHref({ a: 'x', b: 'y', bp: '/srv', panes: 'one' }, 'two')).toBe('/files?a=x&b=y&bp=%2Fsrv');
    expect(panesHref({ a: 'x', panes: 'one' }, 'two')).toBe('/files?a=x&panes=two');
  });
});

describe('Files panes toggle', LIMIT, () => {
  it('shows one pane at full width until the viewer asks for two', async () => {
    await renderPage(page, { path: A });
    expect(await firstPane('a')).toBeInTheDocument();
    expect(region('b')).toBeNull();
    expect(choice(strings['view.one'])).toHaveAttribute('aria-checked', 'true');
    expect(choice(strings['view.two'])).toHaveAttribute('aria-checked', 'false');
  });

  it('is a direct two-state toggle in the page header, each choice with its own icon; no View menu', async () => {
    await renderPage(page, { path: A });
    await firstPane('a');
    const group = toggle();
    expect(group).not.toBeNull();
    expect(group!.closest('header')).not.toBeNull();
    const radios = within(group!).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual([strings['view.one'], strings['view.two']]);
    // Each choice draws its own icon: a single panel and a split one.
    const icons = radios.map((r) => r.querySelector('svg')?.innerHTML ?? '');
    expect(icons[0]).not.toBe('');
    expect(icons[1]).not.toBe('');
    expect(icons[0]).not.toBe(icons[1]);
    expect(screen.queryByRole('button', { name: strings['view.label'] })).toBeNull();
    expect(screen.queryByRole('menuitemcheckbox', { name: strings['view.two'] })).toBeNull();
  });

  it('works from the keyboard: arrows move between the choices, Space picks one', async () => {
    await renderPage(page, { path: A });
    await firstPane('a');
    act(() => choice(strings['view.one']).focus());
    await userEvent.keyboard('{ArrowRight}');
    expect(choice(strings['view.two'])).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(await screen.findByRole('region', { name: strings['pane.b'] })).toBeInTheDocument();
    expect(choice(strings['view.two'])).toHaveAttribute('aria-checked', 'true');
  });

  it('shows where panes matter (Browse, Transfers), not on Storage or Use from your PC', async () => {
    const { router } = await renderPage(page, { path: A });
    await firstPane('a');
    expect(toggle()).not.toBeNull();
    for (const [tab, shown] of [['transfers', true], ['storage', false], ['pc', false]] as const) {
      act(() => router.history.push(`${A}&tab=${tab}`));
      await waitFor(() => expect(router.state.location.search).toMatchObject({ tab }));
      await waitFor(() => expect(toggle() !== null).toBe(shown));
    }
  });

  it('opens two panes from the menu, and one pane keeps pane B\'s address so Two brings it back', async () => {
    const { router } = await renderPage(page, { path: `${A}&b=atlas.00a1&bp=${encodeURIComponent('/srv')}` });
    expect(await firstPane('b')).toBeInTheDocument();
    await choose(strings['view.one']);
    await waitFor(() => expect(region('b')).toBeNull());
    expect(router.state.location.search).toMatchObject({ a: 'atlas.00a1', b: 'atlas.00a1', bp: '/srv', panes: 'one' });
    await choose(strings['view.two']);
    expect(await screen.findByRole('region', { name: strings['pane.b'] })).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ b: 'atlas.00a1', bp: '/srv' });
    expect(router.state.location.search).not.toHaveProperty('panes');
  });

  it('remembers the choice: a later visit without one opens two panes, and a link saying one pane still opens one', async () => {
    const { router } = await renderPage(page, { path: A });
    await firstPane('a');
    await choose(strings['view.two']);
    expect(await screen.findByRole('region', { name: strings['pane.b'] })).toBeInTheDocument();
    act(() => router.history.push('/files?a=atlas.00a1&ap=%2Fsrv'));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ap: '/srv' }));
    expect(await screen.findByRole('region', { name: strings['pane.b'] })).toBeInTheDocument();
    act(() => router.history.push('/files?a=atlas.00a1&panes=one'));
    await waitFor(() => expect(region('b')).toBeNull());
    expect(region('a')).not.toBeNull();
  });
});

describe('switching keeps the rest of the address', LIMIT, () => {
  it('pane B\'s search (in its box) and page (in the URL) come back as they were after One then Two', async () => {
    const { router } = await renderPage(page, { path: `${A}&b=atlas.00a1&bp=${encodeURIComponent('/srv/media')}&bq=photo&bpage=2` });
    const b = await firstPane('b');
    await waitFor(() => expect(within(b).getByRole('searchbox')).toHaveValue('photo'));
    await choose(strings['view.one']);
    await waitFor(() => expect(region('b')).toBeNull());
    // A link's ?bq is adopted and leaves the URL; the rest of pane B stays in it.
    expect(router.state.location.search).toMatchObject({ b: 'atlas.00a1', bp: '/srv/media', bpage: '2' });
    expect(router.state.location.search).not.toHaveProperty('bq');
    await choose(strings['view.two']);
    const b2 = await screen.findByRole('region', { name: strings['pane.b'] });
    await waitFor(() => expect(within(b2).getByRole('searchbox')).toHaveValue('photo'));
    expect(router.state.location.search).toMatchObject({ bpage: '2' });
    expect(router.state.location.search).not.toHaveProperty('bq');
  });

  it('a switch replaces the address: Back goes to the folder before it, Forward returns to the switched view', async () => {
    const { router } = await renderPage(page, { path: `${A}&ap=%2Fsrv` });
    await firstPane('a');
    act(() => router.history.push('/files?a=atlas.00a1&ap=%2Fsrv%2Fapp'));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ap: '/srv/app' }));
    await choose(strings['view.two']);
    expect(await screen.findByRole('region', { name: strings['pane.b'] })).toBeInTheDocument();
    act(() => router.history.back());
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ap: '/srv' }));
    // The choice is remembered, so the earlier folder opens in two panes too.
    expect(await screen.findByRole('region', { name: strings['pane.b'] })).toBeInTheDocument();
    act(() => router.history.forward());
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ap: '/srv/app', panes: 'two' }));
    expect(await screen.findByRole('region', { name: strings['pane.b'] })).toBeInTheDocument();
  });
});

describe('one pane and the other side', LIMIT, () => {
  it('offers no Copy / Move to the hidden pane B, and says how to show it', async () => {
    await renderPage(page, { path: `${A}&ap=${encodeURIComponent('/home/ada')}&b=atlas.00a1&bp=%2Ftmp&panes=one` });
    const pane = await firstPane('a');
    const r = await within(pane).findByRole('row', { name: /notes\.txt/ });
    await userEvent.click(within(r).getByRole('button', { name: /actions|more/i }));
    for (const how of ['copy', 'move'] as const) {
      const item = await screen.findByRole('menuitem', { name: new RegExp(`^${ts[`action.${how}`]}`) });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveAccessibleDescription(expect.stringContaining(strings['view.twoFirst']));
    }
  });
});
