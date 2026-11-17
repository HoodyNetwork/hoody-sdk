// An alias needs nothing running: the Ports & aliases tab's "Aliases and domains" section has its own Create alias,
// shown whatever the computer listens on (nothing, still loading, a failed read). It opens Computers' alias drawer with
// no port (links.alias without one: alias=new), where the person types any port. A port row's Create alias stays the
// shortcut for a port that listens now. A token without the alias permission gets neither.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Core from '@core';
import page from './page';
import strings from './strings.en.json';

const caps = vi.hoisted(() => ({ aliases: true }));
vi.mock('@core', async (orig) => {
  const core = await orig<typeof Core>();
  return { ...core, useCan: (cap: string) => (cap === 'resources.proxy_aliases' ? caps.aliases : core.useCan(cap)) };
});

const PATH = '/programs?tab=ports';
const aliasSection = async () => {
  const h = await screen.findByRole('heading', { name: strings['pa.aliases.title'] });
  return h.closest('section') as HTMLElement;
};
/** The section's own button: named exactly "Create alias" (a port row's is "Create alias for port N"). */
const sectionCreate = (sec: HTMLElement) => within(sec).queryByRole('button', { name: strings['pa.ports.alias'] });
const rowOffers = () => screen.queryAllByRole('button', { name: /^Create alias for port/ });

describe('Programs: Create alias without a listening port', () => {
  afterEach(() => {
    caps.aliases = true;
  });

  it('nothing listening and no alias yet: the section offers Create alias, and its empty text asks for no running port', async () => {
    const { router } = await renderPage(page, { state: 'ports-empty', path: PATH });
    expect(await screen.findByText(strings['pa.ports.empty'])).toBeInTheDocument();
    const sec = await aliasSection();
    expect(await within(sec).findByText(strings['pa.aliases.emptyBody'])).toBeInTheDocument();
    expect(strings['pa.aliases.emptyBody']).not.toMatch(/port above/);
    expect(rowOffers()).toEqual([]);
    const create = sectionCreate(sec);
    expect(create).not.toBeNull();
    await userEvent.click(create!);
    // Computers' alias drawer for this computer, with no port: the person types one there.
    await waitFor(() => expect(router.state.location.pathname).toBe('/computers'));
    const q = new URLSearchParams(router.state.location.search);
    expect(q.get('alias')).toBe('new');
    expect(String(q.get('sel'))).toMatch(/^[^.]+\.[0-9a-z]{4}$/i);
  });

  it('with ports listening the section button is there too, beside the port rows\' own', async () => {
    await renderPage(page, { path: PATH });
    await screen.findByRole('table', { name: strings['pa.aliases.title'] });
    expect(sectionCreate(await aliasSection())).not.toBeNull();
    expect(rowOffers().length).toBeGreaterThan(0);
  });

  it('the listeners still loading, or their read failed: the section still offers it', async () => {
    for (const state of ['ports-loading', 'ports-error']) {
      const view = await renderPage(page, { state, path: PATH });
      const sec = await aliasSection();
      await waitFor(() => expect(sectionCreate(sec), state).not.toBeNull());
      view.unmount();
    }
  });

  it('a token without the alias permission: no Create alias anywhere on the tab', async () => {
    caps.aliases = false;
    await renderPage(page, { state: 'ports-empty', path: PATH });
    expect(await screen.findByText(strings['pa.aliases.lacks'])).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^Create alias/ })).toEqual([]);
  });
});
