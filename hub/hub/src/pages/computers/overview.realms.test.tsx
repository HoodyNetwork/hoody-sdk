// The Overview's Realms fact is one line (a few chips, then a list with every id), a realm with no alias shows its id
// once; the other pages are rows of "On <name>", Access is one line with a link to the Permissions tab (never a Change access control), Usage off is one
// line, and the header's title line holds only the state.
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { interpolate, maskId } from '@kit';
import page from './page';
import strings from './strings.en.json';
import { RealmsLine, realmEntries } from './parts/RealmsLine';
import type { Realm } from './types';

const hex = (n: number) => n.toString(16).padStart(24, 'a');
const many: Realm[] = Array.from({ length: 30 }, (_, i) => ({ id: hex(i + 1), name: i < 10 ? `Realm ${String(i + 1).padStart(2, '0')}` : maskId(hex(i + 1)), named: i < 10, color: 'teal' }));
const ids = many.map((r) => r.id);

async function mount(el: ReactElement) {
  await renderPage({ ...page, load: () => Promise.resolve({ default: () => el }) });
}
// The opener's name starts with its visible words: "Show ids" while every realm has a chip, "+N more" past three.
const line = (n: number) =>
  interpolate(strings['realm.listOpen'], { name: 'atlas', count: n, label: n > 3 ? interpolate(strings['realm.more'], { count: n - 3 }) : strings['realm.ids'] });

describe('Overview: realms on one line', () => {
  it('orders the realm the top bar shows first, then aliased ones A-Z, then the rest by id', () => {
    const r = realmEntries([hex(30), hex(3), hex(1), hex(2)], many, hex(2));
    expect(r.map((e) => e.id)).toEqual([hex(2), hex(1), hex(3), hex(30)]);
    expect(r[3]!.alias).toBeNull();
  });

  it('a realm with no alias shows its short id once, with its copy button (never name and id chip both)', async () => {
    await mount(<RealmsLine ids={[hex(20)]} realms={many} shown="all" name="atlas" onManage={() => {}} />);
    expect(await screen.findAllByText(maskId(hex(20)))).toHaveLength(1);
    expect(screen.getByRole('button', { name: strings['realm.manage'] })).toBeInTheDocument();
  });

  it('one aliased realm: its name and its id chip, no list to open', async () => {
    await mount(<RealmsLine ids={[hex(1)]} realms={many} shown="all" name="atlas" />);
    expect(await screen.findByText('Realm 01')).toBeInTheDocument();
    expect(screen.getByText(maskId(hex(1)))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: line(1) })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['realm.manage'] })).toBeNull();
  });

  it('three realms: three chips and Show ids, which lists each with its id', async () => {
    await mount(<RealmsLine ids={ids.slice(0, 3)} realms={many} shown="all" name="atlas" />);
    const open = await screen.findByRole('button', { name: line(3) });
    expect(open).toHaveTextContent(strings['realm.ids']);
    expect(screen.queryByText(maskId(hex(1)))).toBeNull();
    await userEvent.click(open);
    const list = await screen.findByRole('dialog', { name: interpolate(strings['realm.listTitle'], { name: 'atlas', count: 3 }) });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText(maskId(hex(2)))).toBeInTheDocument();
    expect(within(list).queryByRole('searchbox')).toBeNull();
  });

  it('thirty realms: three chips and "+27 more"; the list searches by alias or whole id, and Manage realms hands over', async () => {
    const onManage = vi.fn();
    await mount(<RealmsLine ids={ids} realms={many} shown="all" name="atlas" onManage={onManage} />);
    const open = await screen.findByRole('button', { name: line(30) });
    expect(open).toHaveTextContent(interpolate(strings['realm.more'], { count: 27 }));
    await userEvent.click(open);
    const list = await screen.findByRole('dialog', { name: interpolate(strings['realm.listTitle'], { name: 'atlas', count: 30 }) });
    expect(within(list).getAllByRole('listitem')).toHaveLength(30);
    expect(within(list).getAllByText(strings['realm.noAlias'])).toHaveLength(20);
    const search = within(list).getByRole('searchbox', { name: strings['realm.search'] });
    await userEvent.type(search, hex(25));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
    await userEvent.clear(search);
    await userEvent.type(search, 'realm 07');
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
    await userEvent.type(search, 'zz');
    expect(await within(list).findByText(strings['realm.searchNone'])).toBeInTheDocument();
    await userEvent.click(within(list).getByRole('button', { name: strings['realm.manageAll'] }));
    expect(onManage).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('each chip opens the same list from the keyboard, Escape gives focus back to that chip, and its name starts with its words', async () => {
    await mount(<RealmsLine ids={ids} realms={many} shown="all" name="atlas" />);
    const chip = await screen.findByRole('button', { name: interpolate(strings['realm.chipOpen'], { realm: 'Realm 02', count: 30, name: 'atlas' }) });
    expect(chip).toHaveTextContent('Realm 02');
    chip.focus();
    await userEvent.keyboard('{Enter}');
    const list = await screen.findByRole('dialog', { name: interpolate(strings['realm.listTitle'], { name: 'atlas', count: 30 }) });
    expect(within(list).getAllByRole('listitem')).toHaveLength(30);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(chip).toHaveFocus());
  });

  it('"· Manage" is one piece, so a wrapped line never strands the separator', async () => {
    await mount(<RealmsLine ids={ids} realms={many} shown="all" name="atlas" onManage={() => {}} />);
    const manage = await screen.findByRole('button', { name: strings['realm.manage'] });
    expect(manage.parentElement?.className).toMatch(/realmManage/);
    expect(manage.parentElement?.textContent?.startsWith('·')).toBe(true);
  });

  it('with no realm, "· Add to a realm" is one piece too', async () => {
    await mount(<RealmsLine ids={[]} realms={many} shown="all" name="atlas" onManage={() => {}} />);
    const add = await screen.findByRole('button', { name: strings['realm.add'] });
    expect(add.parentElement?.className).toMatch(/realmManage/);
    expect(add.parentElement?.textContent?.startsWith('·')).toBe(true);
  });

  it('without the realms right the list is read-only: no Manage on the line or in the list', async () => {
    await mount(<RealmsLine ids={ids} realms={many} shown="all" name="atlas" />);
    expect(screen.queryByRole('button', { name: strings['realm.manage'] })).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: line(30) }));
    const list = await screen.findByRole('dialog');
    expect(within(list).queryByRole('button', { name: strings['realm.manageAll'] })).toBeNull();
  });
});

describe('Overview: many realms on the page', () => {
  it('keyboard opens the list from "+N more", Manage realms opens the real drawer for this computer, and closing it returns focus', async () => {
    await renderPage(page, { state: 'realms30', path: '/computers?sel=atlas.00a1' });
    const opener = await screen.findByRole('button', { name: /^\+\d+ more: all 30 realms of atlas/ }, { timeout: 8000 });
    opener.focus();
    await userEvent.keyboard('{Enter}');
    const list = await screen.findByRole('dialog', { name: interpolate(strings['realm.listTitle'], { name: 'atlas', count: 30 }) });
    await userEvent.click(within(list).getByRole('button', { name: strings['realm.manageAll'] }));
    const drawer = await screen.findByRole('dialog', { name: interpolate(strings['realmsd.title'], { name: 'atlas' }) }, { timeout: 5000 });
    expect(screen.queryByRole('dialog', { name: interpolate(strings['realm.listTitle'], { name: 'atlas', count: 30 }) })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(drawer).not.toBeInTheDocument());
    // The list's Manage realms is gone with the list, so focus comes back to the button that opened the list.
    await waitFor(() => expect(screen.getByRole('button', { name: /^\+\d+ more: all 30 realms of atlas/ })).toHaveFocus());
  }, 40000);
});

describe('Overview: sections', () => {
  it('Access is read here and changed on the Permissions tab; Usage off is the switch row and one line under the status facts, the shared note its description', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const access = (await screen.findByRole('heading', { name: strings['fact.access'] }, { timeout: 8000 })).closest('section') as HTMLElement;
    // No Change access control and no "How access works" in the Overview: one link to the computer's Permissions tab.
    expect(within(access).queryByRole('button', { name: strings['fact.accessOpen'] })).toBeNull();
    expect(screen.queryByRole('button', { name: /how access works/i })).toBeNull();
    const perms = within(access).getByRole('link', { name: strings['fact.accessLink'] });
    expect(perms.getAttribute('href') ?? '').toContain('tab=permissions');
    expect(perms.getAttribute('href') ?? '').toContain('sel=atlas');
    // The SSH key has one place to change it, the Connect tab: the Overview links there and offers no Replace or Add.
    expect(within(access).queryByRole('button', { name: new RegExp(`^(${strings['ssh.key.replace']}|${strings['ssh.key.set']})$`) })).toBeNull();
    const toKey = within(access).getByRole('link', { name: strings['ov.keyLink.replace'] });
    expect(toKey.getAttribute('href') ?? '').toContain('tab=connect');
    expect(toKey.getAttribute('href') ?? '').toContain('sel=atlas');
    const status = screen.getByRole('heading', { name: strings['ov.status'] }).closest('section') as HTMLElement;
    // The switch is a row of the body, not in the head.
    const sw = within(status).getByRole('switch', { name: strings['usage.show'] });
    expect(sw.closest('header')).toBeNull();
    expect(within(status).getByText(strings['usage.off'])).toBeInTheDocument();
    expect(within(status).getByText(interpolate(strings['usage.shared'], { server: 'n12' }))).toBeVisible();
  }, 40000);

  it('the other pages are rows of "On <name>" after Open on, with counts for the tabs; never a loose "Also:" line', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const nav = await screen.findByRole('navigation', { name: interpolate(strings['goto.title'], { name: 'atlas' }) }, { timeout: 8000 });
    const on = screen.getByRole('heading', { name: interpolate(strings['on.title'], { name: 'atlas' }) }).closest('section') as HTMLElement;
    expect(on.contains(nav)).toBe(true);
    expect(nav.textContent).not.toMatch(/^Also:/);
    const uses = screen.getByRole('heading', { name: interpolate(strings['uses.title'], { name: 'atlas' }) }).closest('section') as HTMLElement;
    expect(uses.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // atlas keeps 3 snapshots and 1 address of its own (its list row): the rows say so and open those tabs.
    const backups = within(nav).getByRole('link', { name: interpolate(strings['on.backups.count_other'], { count: 3 }) });
    expect(backups.getAttribute('href') ?? '').toContain('tab=backups');
    expect(within(nav).getByRole('link', { name: interpolate(strings['on.addresses.count_one'], { count: 1 }) }).getAttribute('href') ?? '').toContain('tab=ports');
    expect(within(nav).getByRole('link', { name: strings['on.files'] })).toBeInTheDocument();
  }, 40000);

  it('on the current computer the section says nothing about making it current', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    await screen.findByRole('navigation', { name: interpolate(strings['goto.title'], { name: 'atlas' }) }, { timeout: 8000 });
    expect(screen.queryByText(/your current computer\.$/)).toBeNull();
  }, 40000);

  it('borealis is not current: the section names the pages that make it current (Schedules), not Files', async () => {
    await renderPage(page, { path: '/computers?sel=borealis.00b2' });
    await screen.findByRole('navigation', { name: interpolate(strings['goto.title'], { name: 'borealis' }) }, { timeout: 8000 });
    const on = screen.getByRole('heading', { name: interpolate(strings['on.title'], { name: 'borealis' }) }).closest('section') as HTMLElement;
    const note = within(on).getByText(/your current computer\.$/);
    expect(note).toHaveTextContent(strings['goto.schedules']);
    expect(note).not.toHaveTextContent(strings['goto.files']);
    expect(note).toHaveTextContent('borealis');
  }, 40000);

  it('the header title line holds the state only; server and Current computer are on the line under it', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const h = await screen.findByRole('heading', { name: 'atlas', level: 2 }, { timeout: 8000 });
    const titleLine = h.parentElement as HTMLElement;
    expect(within(titleLine).queryByText('n12')).toBeNull();
    expect(within(titleLine).queryByText(strings['current.chip'])).toBeNull();
    const header = h.closest('header') ?? (titleLine.parentElement as HTMLElement);
    expect(within(header).getByText(strings['current.label'])).toBeInTheDocument();
    expect(within(header).getByText('n12')).toBeInTheDocument();
  }, 40000);
});
