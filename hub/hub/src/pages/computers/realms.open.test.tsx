// A realm's name on a computer is a way into its Realms drawer: the chips in the head's meta row and the names on the
// Overview's Realms line open the drawer the menu's Realms item opens. A session that may not change realms (no Realms
// item in its menu) gets plain names.
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { interpolate } from '@kit';
import page from './page';
import strings from './strings.en.json';
import { RealmChips } from './parts/Bits';
import { RealmsLine } from './parts/RealmsLine';
import type { Realm } from './types';

const drawerName = (name: string) => interpolate(strings['realmsd.title'], { name });
const openName = (realm: string, name: string) => interpolate(strings['realm.open'], { realm, name });
const head = async (name: string) => (await screen.findByRole('heading', { name, level: 2 }, { timeout: 8000 })).closest('header') as HTMLElement;
const factRow = async () => (await screen.findByText(strings['fact.realms'], { selector: 'dt' }, { timeout: 8000 })).parentElement as HTMLElement;
const realms: Realm[] = [
  { id: 'a'.repeat(24), name: 'Acme client', named: true, color: 'orange' },
  { id: 'b'.repeat(24), name: 'Lab', named: true, color: 'purple' },
];
const ids = realms.map((r) => r.id);
async function mount(el: ReactElement) {
  await renderPage({ ...page, load: () => Promise.resolve({ default: () => el }) });
}

describe('computers: a realm name opens the Realms drawer', () => {
  it('the head\'s realm chip opens the drawer the menu\'s Realms item opens', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const chip = within(await head('atlas')).getByRole('button', { name: openName('Personal', 'atlas') });
    expect(chip).toHaveTextContent('Personal');
    await userEvent.click(chip);
    const fromChip = await screen.findByRole('dialog', { name: drawerName('atlas') });
    expect(fromChip).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: drawerName('atlas') })).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: interpolate(strings['menu.actions'], { name: 'atlas' }) }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.realms'] }));
    expect(await screen.findByRole('dialog', { name: drawerName('atlas') })).toBeInTheDocument();
  }, 40000);

  it('the name on the Overview\'s Realms line opens the same drawer', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    await userEvent.click(within(await factRow()).getByRole('button', { name: openName('Personal', 'atlas') }));
    expect(await screen.findByRole('dialog', { name: drawerName('atlas') })).toBeInTheDocument();
  }, 40000);

  it('a session with no Realms item gets plain names: nothing to press in the head or on the line', async () => {
    await renderPage(page, { state: 'limited', path: '/computers?sel=atlas.00a1' });
    const hd = await head('atlas');
    expect(hd).toHaveTextContent('Personal');
    expect(within(hd).queryByRole('button', { name: openName('Personal', 'atlas') })).toBeNull();
    const row = await factRow();
    expect(row).toHaveTextContent('Personal');
    expect(within(row).queryByRole('button', { name: openName('Personal', 'atlas') })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: interpolate(strings['menu.actions'], { name: 'atlas' }) }));
    await screen.findByRole('menu');
    expect(screen.queryByRole('menuitem', { name: strings['menu.realms'] })).toBeNull();
  }, 40000);

  it('RealmChips: with `open` every shown realm is a button calling the one handler; without it none is', async () => {
    const onPress = vi.fn();
    const r = await renderPage({ ...page, load: () => Promise.resolve({ default: () => <RealmChips ids={ids} realms={realms} max={2} open={{ name: 'atlas', onPress }} /> }) });
    await userEvent.click(await screen.findByRole('button', { name: openName('Acme client', 'atlas') }));
    await userEvent.click(screen.getByRole('button', { name: openName('Lab', 'atlas') }));
    expect(onPress).toHaveBeenCalledTimes(2);
    r.unmount();
    await mount(<RealmChips ids={ids} realms={realms} max={2} />);
    await screen.findByText('Acme client');
    expect(screen.queryByRole('button')).toBeNull();
  }, 40000);

  it('RealmsLine with several realms: a chip opens the drawer where Manage is offered, the list where it is not', async () => {
    const onManage = vi.fn();
    const r = await renderPage({ ...page, load: () => Promise.resolve({ default: () => <RealmsLine ids={ids} realms={realms} shown="all" name="atlas" onManage={onManage} /> }) });
    await userEvent.click(await screen.findByRole('button', { name: openName('Lab', 'atlas') }));
    expect(onManage).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    // Every id is still one press away.
    expect(screen.getByRole('button', { name: interpolate(strings['realm.listOpen'], { label: strings['realm.ids'], count: 2, name: 'atlas' }) })).toBeInTheDocument();
    r.unmount();
    await mount(<RealmsLine ids={ids} realms={realms} shown="all" name="atlas" />);
    await userEvent.click(await screen.findByRole('button', { name: interpolate(strings['realm.chipOpen'], { realm: 'Lab', count: 2, name: 'atlas' }) }));
    expect(await screen.findByRole('dialog', { name: interpolate(strings['realm.listTitle'], { name: 'atlas', count: 2 }) })).toBeInTheDocument();
  }, 40000);
});
