// A copy form keeps what the person typed and picked when the server list is read again behind it: the fields are
// set once per source computer, the server is picked again only when the one shown left the list, and a server that
// left the list is never sent.
import { definePage } from '@kit';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { CreateDrawer } from './parts/CreateDrawer';
import { computers, copySends, projects } from './fixtures';
import strings from './strings.en.json';
import type { Server } from './types';

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sv = (id: string, name: string): Server => ({ id, name, place: 'Paris, France', cc: 'FR', cpu: 4, ram: 8, disk: 80, free: false, days: null, status: 'active', cap: null });
const src = computers[0]!;
const A = sv(src.server_id ?? 's-a', 'paris-1');
const B = sv('s-b', 'paris-2');
const C = sv('s-c', 'paris-3');
const serverButton = (d: HTMLElement) => within(d).getByRole('button', { name: new RegExp(`${esc(strings['field.server'])}$`) });
const nameField = (d: HTMLElement) => within(d).getByLabelText(strings['field.name']) as HTMLInputElement;

async function mount() {
  const Harness = () => {
    const [list, setList] = useState<Server[]>([A, B]);
    return (
      <>
        <button type="button" onClick={() => setList([A, B, C])}>more-servers</button>
        <button type="button" onClick={() => setList([A])}>fewer-servers</button>
        <output data-testid="count">{list.length}</output>
        <CreateDrawer isOpen servers={list} serversError={false} projects={projects} realms={undefined} onClose={() => {}} onDone={() => {}} canCopy computers={computers} />
      </>
    );
  };
  const p = definePage({ id: 'computers', path: '/computers', title: 'title', description: 'harness', nav: { group: 'main', order: 20, icon: 'computer', label: 'nav' }, layout: 'list-detail', load: async () => ({ default: Harness }), status: 'preview', sensitive: false, strings });
  await renderPage(p, { path: '/computers' });
  const d = await screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 30000 });
  await userEvent.click(within(within(d).getByRole('radiogroup', { name: strings['create.from'] })).getByRole('radio', { name: new RegExp(`^${esc(strings['create.fromCopy'])}`) }));
  await userEvent.click(within(d).getByRole('button', { name: new RegExp(`${esc(strings['create.copyFrom'])}$`) }));
  await userEvent.click((await screen.findAllByRole('radio', { name: new RegExp(`^${esc(src.name)}`) })).at(-1) as HTMLElement);
  await waitFor(() => expect(nameField(d).value).toBe(`${src.name}-copy`));
  return d;
}
const press = (label: string, n: number) => {
  act(() => { fireEvent.click(screen.getByText(label)); });
  return waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent(String(n)));
};

beforeEach(() => {
  copySends.length = 0;
});

describe('Copy form: the server list read again behind it', () => {
  it('a longer list keeps the typed name and the picked server', async () => {
    const d = await mount();
    await userEvent.clear(nameField(d));
    await userEvent.type(nameField(d), 'my-own-name');
    await userEvent.click(serverButton(d));
    await userEvent.click(await screen.findByRole('option', { name: /paris-2/ }));
    await waitFor(() => expect(serverButton(d)).toHaveTextContent('paris-2'));
    await press('more-servers', 3);
    expect(nameField(d).value).toBe('my-own-name');
    expect(serverButton(d)).toHaveTextContent('paris-2');
  }, 60000);

  it('the picked server leaving the list: another is picked, the typed name stays, and the one sent is in the list', async () => {
    const d = await mount();
    await userEvent.clear(nameField(d));
    await userEvent.type(nameField(d), 'my-own-name');
    await userEvent.click(serverButton(d));
    await userEvent.click(await screen.findByRole('option', { name: /paris-2/ }));
    await waitFor(() => expect(serverButton(d)).toHaveTextContent('paris-2'));
    await press('fewer-servers', 1);
    await waitFor(() => expect(serverButton(d)).toHaveTextContent('paris-1'));
    expect(nameField(d).value).toBe('my-own-name');
    await userEvent.click(within(d).getByRole('button', { name: strings['copyd.go'] }));
    await waitFor(() => expect(copySends.length).toBe(1));
    // The server sent is the one the form switched to, which is in the list.
    expect((copySends[0] as { target_server_id?: string }).target_server_id).toBe(A.id);
  }, 60000);
});
