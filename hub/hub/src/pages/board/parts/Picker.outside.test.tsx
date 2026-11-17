// Outside links: a typed web address the Hub cannot frame opens in a running computer's
// browser on a press that names its host and the computer; without one (none running, two to choose from at step 1,
// or an address never sent) the pick stays a web tile, which shows its card.
import { bootFixtureCore, CoreQueryProvider } from '@core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import fixtures, { browsed, resetFixtureSessions } from '../fixtures';
import { Picker, type PickerProps } from './Picker';
import { tile } from './browse.testkit';

// A running computer's step also draws the apps launcher, which reads the page's router. These tests render the
// Picker alone and are about its own rows: the launcher never loads here (its place shows the loading rows).
vi.mock('../../apps/links', async (orig) => ({ ...(await orig<object>()), loadLauncher: () => new Promise<never>(() => {}) }));

const pc = (id: string, name: string, status = 'running') => ({ id, name, project_id: 'p1', server_name: 'n12', status }) as BoardComputer;
const atlas = pc('c1', 'atlas');
const borealis = pc('c2', 'borealis');
const cedar = pc('c3', 'cedar', 'stopped');
const picker = (p: Partial<PickerProps>) => (
  <CoreQueryProvider>
    <Picker computers={[atlas, cedar]} failed={false} onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} {...p} />
  </CoreQueryProvider>
);
const BROWSER_TILE = { project: 'p1', computer: 'c1', program: 'browser', session: 1, view: 'display' };

beforeEach(() => { resetFixtureSessions(); bootFixtureCore({ rules: fixtures.states.browserUp }); });
afterEach(() => { cleanup(); });

async function typed(p: Partial<PickerProps>, url: string) {
  const user = userEvent.setup();
  const onPick = vi.fn();
  render(picker({ ...p, onPick }));
  await user.type(screen.getByRole('searchbox'), url);
  return { user, onPick };
}

describe('Picker: outside links at step 1', () => {
  it("one running computer: the Web address tile names the host and the computer, and a press opens it there as a new tab", async () => {
    const { user, onPick } = await typed({}, 'https://Example.org/news');
    await user.click(screen.getByRole('row', { name: "Open example.org in atlas's browser" }));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(BROWSER_TILE));
    expect(browsed).toEqual(['https://example.org/news']);
  });

  it('nothing is sent before the press', async () => {
    await typed({}, 'https://example.org/');
    expect(screen.getByRole('row', { name: "Open example.org in atlas's browser" })).toBeTruthy();
    expect(browsed).toEqual([]);
  });

  it('two running computers: a web tile, nothing sent', async () => {
    const { user, onPick } = await typed({ computers: [atlas, borealis] }, 'https://example.org/');
    await user.click(screen.getByRole('row', { name: 'Open https://example.org/' }));
    expect(onPick).toHaveBeenCalledWith({ url: 'https://example.org/' });
    expect(browsed).toEqual([]);
  });

  it('no computer runs: a web tile, nothing sent', async () => {
    const { user, onPick } = await typed({ computers: [cedar] }, 'https://example.org/');
    await user.click(screen.getByRole('row', { name: 'Open https://example.org/' }));
    expect(onPick).toHaveBeenCalledWith({ url: 'https://example.org/' });
    expect(browsed).toEqual([]);
  });

  it('a private or local host: a web tile, never sent', async () => {
    for (const url of ['http://192.168.1.1/', 'http://localhost:3000/']) {
      const { user, onPick } = await typed({}, url);
      await user.click(screen.getByRole('row', { name: 'Open ' + url }));
      expect(onPick).toHaveBeenCalledWith({ url });
      cleanup();
    }
    expect(browsed).toEqual([]);
  });

  it('the browser refuses it: the web tile is placed instead', async () => {
    const { user, onPick } = await typed({}, 'https://example.net/');
    await user.click(screen.getByRole('row', { name: "Open example.net in atlas's browser" }));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith({ url: 'https://example.net/' }));
    expect(browsed).toEqual(['https://example.net/']);
  });

  it('the read of the browser fails: the web tile, nothing sent', async () => {
    bootFixtureCore({ rules: fixtures.states.browserReadFailed });
    const { user, onPick } = await typed({}, 'https://example.org/');
    await user.click(screen.getByRole('row', { name: "Open example.org in atlas's browser" }));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith({ url: 'https://example.org/' }));
    expect(browsed).toEqual([]);
  });

  it('the open answer is lost: the browser tile is placed, and the address is sent once', async () => {
    bootFixtureCore({ rules: fixtures.states.browsePending });
    const { user, onPick } = await typed({}, 'https://example.org/');
    await user.click(screen.getByRole('row', { name: "Open example.org in atlas's browser" }));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(BROWSER_TILE));
    expect(browsed).toEqual(['https://example.org/']);
  });
});

describe('Picker: outside links from a computer\'s Web address form', () => {
  it("the submit names the host and the computer; a running computer opens it as a new tab", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(picker({ computers: [atlas, borealis], onPick, start: { step: 'program', computer: 'c1' } }));
    await user.click(tile(/^Web address/));
    await user.type(await screen.findByRole('textbox', { name: 'Address' }), 'https://example.org/');
    await user.click(screen.getByRole('button', { name: "Open example.org in atlas's browser" }));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(BROWSER_TILE));
    expect(browsed).toEqual(['https://example.org/']);
  });

  it('a private host: the submit stays Add and the web tile is placed', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(picker({ onPick, start: { step: 'program', computer: 'c1' } }));
    await user.click(tile(/^Web address/));
    await user.type(await screen.findByRole('textbox', { name: 'Address' }), 'http://10.0.0.5/');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onPick).toHaveBeenCalledWith({ url: 'http://10.0.0.5/' });
    expect(browsed).toEqual([]);
  });
});
