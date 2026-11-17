// The Server line of a computer's Where it runs goes to that server's panel in Servers
// (links.server, `?server=<name>`), the id chip beside it keeps its own copy, and no server id stays in the URL.
import { describe, expect, it } from 'vitest';
import { fixtureWorld } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { computers } from './fixtures';
import { links } from './links';
import { serverLabel } from './logic';
import page from './page';
import strings from './strings.en.json';
import sd from './parts/ServerDetail.strings.en.json';

const atlas = computers.find((c) => c.name === 'atlas');
if (!atlas) throw new Error('fixture atlas');
const NAME = serverLabel(atlas).name;
const SERVER = fixtureWorld.servers.find((x) => x.name === NAME);
if (!NAME || !SERVER) throw new Error('fixture atlas server');
const SEL = '/computers?sel=atlas.00a1';
const serverLine = async () => {
  const h = await screen.findByRole('heading', { name: strings['ov.where'] }, { timeout: 20000 });
  const sec = h.closest('section') as HTMLElement;
  return within(sec).getByRole('link', { name: new RegExp(NAME) });
};

describe('computers: the Server line goes to the server', () => {
  it('is a link to that server\'s panel by name; the id chip stays its own control', async () => {
    await renderPage(page, { path: SEL });
    const link = await serverLine();
    expect(link.getAttribute('href')).toContain(links.server(NAME));
    expect(link.getAttribute('href')).not.toContain(SERVER.id);
    // The chip is not inside the link: copying the id never navigates.
    const chip = link.parentElement as HTMLElement;
    expect(within(link).queryByRole('button')).toBeNull();
    expect(within(chip).getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('pressing it (Enter) opens the server\'s panel in Servers and drops the key from the URL', async () => {
    const { router } = await renderPage(page, { path: SEL });
    const link = await serverLine();
    link.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: SERVER.name }, { timeout: 20000 })).toBeInTheDocument();
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).server).toBeUndefined());
    expect(router.state.location.pathname).toContain('/computers/servers');
    expect(router.state.location.href).not.toContain(SERVER.id);
  });

  it('after the panel opened from the link, closing it and going Back then Forward never reopens it or brings the key back', async () => {
    const { router } = await renderPage(page, { path: SEL });
    const link = await serverLine();
    link.focus();
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: SERVER.name }, { timeout: 20000 });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: SERVER.name })).toBeNull());
    router.history.back();
    await screen.findByRole('heading', { name: strings['ov.where'] }, { timeout: 20000 });
    router.history.forward();
    await waitFor(() => expect(router.state.location.pathname).toContain('/computers/servers'));
    await screen.findAllByText(SERVER.name, { selector: 'strong' }, { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 800));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((router.state.location.search as Record<string, unknown>).server).toBeUndefined();
  });

  // The rental's Status fact, as read in the panel.
  const statusOf = (d: HTMLElement) => [...d.querySelectorAll('dt')].find((x) => x.textContent === sd['sd.status'])?.nextElementSibling?.textContent;
  it('with rental history, the current rental opens, not the ended one', async () => {
    const rh = await renderPage(page, { path: links.server(SERVER.name), state: 'rentalHistory' });
    const d = await screen.findByRole('dialog', { name: SERVER.name }, { timeout: 20000 });
    expect(statusOf(d)).toBe(sd['sd.status.active']);
    await waitFor(() => expect((rh.router.state.location.search as Record<string, unknown>).server).toBeUndefined());
  });

  it('a list that fails to load opens nothing and still drops the key', async () => {
    const { router } = await renderPage(page, { path: links.server(SERVER.name), state: 'serversError' });
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).server).toBeUndefined(), { timeout: 20000 });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a name the list lacks opens nothing and leaves the list; the key is dropped', async () => {
    const { router } = await renderPage(page, { path: links.server('no-such-server') });
    await screen.findAllByText(SERVER.name, { selector: 'strong' }, { timeout: 20000 });
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).server).toBeUndefined());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a server known by name only (no id) is still a link to its panel, with no id chip', async () => {
    await renderPage(page, { path: SEL, state: 'serverNameOnly' });
    const link = await serverLine();
    expect(link.getAttribute('href')).toContain(links.server(NAME));
    expect(within(link.parentElement as HTMLElement).queryByRole('button')).toBeNull();
  });

  it('with no server known the line is plain text, no link', async () => {
    await renderPage(page, { path: SEL, state: 'noServer' });
    const h = await screen.findByRole('heading', { name: strings['ov.where'] }, { timeout: 20000 });
    expect(within(h.closest('section') as HTMLElement).queryByRole('link', { name: new RegExp(NAME) })).toBeNull();
  });
});
