// The realm "+N" after the chips (a bare "+1" says nothing): it names the other realms in the
// kit tooltip on keyboard focus and in a popover on a press (tap, click, Enter); its accessible name starts with the
// shown "+N" and says the same words.
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { DataTable, interpolate } from '@kit';
import page from './page';
import { RealmChips } from './parts/Bits';
import strings from './strings.en.json';
import type { Realm } from './types';

const realms: Realm[] = [
  { id: 'a'.repeat(24), name: 'hi', named: true, color: 'teal' },
  { id: 'b'.repeat(24), name: 'Acme client', named: true, color: 'orange' },
  { id: 'c'.repeat(24), name: 'Lab', named: true, color: 'purple' },
];
const [A, B, C] = realms.map((r) => r.id) as [string, string, string];
const GONE = 'd'.repeat(24);

async function mount(el: ReactElement) {
  await renderPage({ ...page, load: () => Promise.resolve({ default: () => el }) });
}

describe('RealmChips "+N"', () => {
  it('one extra realm: the words are "1 more realm: <name>", the name "+1 more realm: <name>", the text "+1"', async () => {
    await mount(<RealmChips ids={[A, C]} realms={realms} max={1} />);
    expect(interpolate(strings['realm.moreTip_one'], { count: 1, names: 'Lab' })).toBe('1 more realm: Lab');
    const name = interpolate(strings['realm.moreName_one'], { count: 1, names: 'Lab' });
    expect(name).toBe('+1 more realm: Lab');
    const more = await screen.findByRole('button', { name });
    expect(more).toHaveTextContent('+1');
  });

  it('two extra realms: plural words with both names in order', async () => {
    await mount(<RealmChips ids={[A, B, C]} realms={realms} max={1} />);
    expect(interpolate(strings['realm.moreTip_other'], { count: 2, names: 'Acme client, Lab' })).toBe('2 more realms: Acme client, Lab');
    const name = interpolate(strings['realm.moreName_other'], { count: 2, names: 'Acme client, Lab' });
    expect(name).toBe('+2 more realms: Acme client, Lab');
    expect(await screen.findByRole('button', { name })).toHaveTextContent('+2');
  });

  it('an unnamed realm reads as the page\'s unnamed text', async () => {
    await mount(<RealmChips ids={[A, GONE]} realms={realms} max={1} />);
    expect(await screen.findByRole('button', { name: interpolate(strings['realm.moreName_one'], { count: 1, names: strings['realm.unnamed'] }) })).toBeInTheDocument();
  });

  it('keyboard focus opens the kit tooltip with the same words', async () => {
    await mount(<RealmChips ids={[A, B, C]} realms={realms} max={1} />);
    const words = '2 more realms: Acme client, Lab';
    const more = await screen.findByRole('button', { name: `+${words}` });
    // Bounded: the chips hold no other stop, so a few tabs reach it.
    for (let i = 0; i < 10 && document.activeElement !== more; i++) await userEvent.tab();
    expect(more).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(words);
  });

  it('Enter opens the popover (the tooltip goes), Escape closes it and gives focus back to "+2"', async () => {
    await mount(<RealmChips ids={[A, B, C]} realms={realms} max={1} />);
    const words = '2 more realms: Acme client, Lab';
    const more = await screen.findByRole('button', { name: `+${words}` });
    for (let i = 0; i < 10 && document.activeElement !== more; i++) await userEvent.tab();
    await screen.findByRole('tooltip');
    await userEvent.keyboard('{Enter}');
    const pop = await screen.findByRole('dialog', { name: words });
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(pop).not.toBeInTheDocument());
    await waitFor(() => expect(more).toHaveFocus());
  });

  it('a press (tap, click, Enter) opens a popover with the same words', async () => {
    await mount(<RealmChips ids={[A, C]} realms={realms} max={1} />);
    const more = await screen.findByRole('button', { name: '+1 more realm: Lab' });
    await userEvent.click(more);
    const pop = await screen.findByRole('dialog', { name: '1 more realm: Lab' });
    expect(within(pop).getByText('1 more realm: Lab')).toBeInTheDocument();
  });

  it('inside a list row, pressing "+2" and the text of its popover never opens the row', async () => {
    // The kit row opens on a click that bubbles to it; React passes a popover's clicks up to the row it was opened
    // from (portal), so only the popover's own "not a row click" mark keeps its text from opening the computer.
    const open = vi.fn();
    const rows = [{ id: 'one', ids: [A, B, C] }];
    await mount(
      <DataTable label="Rows" data={rows} getRowId={(r) => r.id} onRowAction={open}
        columns={[{ id: 'realms', header: 'Realms', cell: ({ row }) => <RealmChips ids={row.original.ids} realms={realms} max={1} /> }]} />,
    );
    const words = '2 more realms: Acme client, Lab';
    await userEvent.click(await screen.findByRole('button', { name: `+${words}` }));
    const pop = await screen.findByRole('dialog', { name: words });
    await userEvent.click(within(pop).getByText(words));
    expect(open).not.toHaveBeenCalled();
    // The row itself still opens on its own click (the check above is not vacuous).
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(pop).not.toBeInTheDocument());
    await userEvent.click(screen.getByText('hi'));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('no "+N" when every realm has a chip', async () => {
    await mount(<RealmChips ids={[A, B]} realms={realms} max={2} />);
    await screen.findByText('Acme client');
    expect(screen.queryByRole('button', { name: /more realm/ })).toBeNull();
  });
});
