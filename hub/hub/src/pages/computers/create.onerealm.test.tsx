// Get a computer in All realms with exactly one realm: the Realms list is offered, so the new computer can be put in
// that realm from the form.
import { definePage } from '@kit';
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { CreateDrawer } from './parts/CreateDrawer';
import { projects } from './fixtures';
import strings from './strings.en.json';
import type { Realm, Server } from './types';

const servers: Server[] = [{ id: 's1', name: 'paris-1', place: 'Paris, France', cc: 'FR', cpu: 4, ram: 8, disk: 80, free: false, days: null, status: 'active', cap: null }];
const one: Realm[] = [{ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Solo', color: 'teal', named: true, computers: 0 }];

async function mount(realms: Realm[]) {
  const Harness = () => <CreateDrawer isOpen servers={servers} serversError={false} projects={projects} realms={realms} onClose={() => {}} onDone={() => {}} />;
  const p = definePage({ id: 'computers', path: '/computers', title: 'title', description: 'harness', nav: { group: 'main', order: 20, icon: 'computer', label: 'nav' }, layout: 'list-detail', load: async () => ({ default: Harness }), status: 'preview', sensitive: false, strings });
  await renderPage(p, { path: '/computers', realm: 'all' });
  const d = await screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 30000 });
  await userEvent.click(within(d).getByRole('button', { name: new RegExp(`^${strings['create.more']}`) }));
  return d;
}

describe('Get a computer: the Realms list in All realms', () => {
  it('one realm: the list shows it and it can be ticked', async () => {
    const d = await mount(one);
    const list = await within(d).findByRole('group', { name: strings['create.realms'] });
    const box = within(list).getByRole('checkbox', { name: /Solo/ });
    await userEvent.click(box);
    expect(box).toBeChecked();
  }, 60000);

  it('no realm: no list', async () => {
    const d = await mount([]);
    expect(within(d).queryByRole('group', { name: strings['create.realms'] })).toBeNull();
  }, 60000);
});
