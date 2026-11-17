// Get a computer: the name `rand` (any case) is refused before anything is sent (the API would make up another name,
// which no read-back of the sent name finds), and a create whose answer was lost is proved only by a computer the
// list did not show at the press: one already there under that name (a refused duplicate) proves nothing.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { heldChanges } from '@core';
import { DEFAULT_FORM, type CreateForm, check } from './create-logic';
import { computers } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import type { Server } from './types';

const SV = (p: Partial<Server> & { id: string }): Server => ({ name: p.id, place: 'Paris, France', cc: 'FR', cpu: 4, ram: 8, disk: 80, free: false, days: null, status: 'active', cap: null, ...p });
const servers = [SV({ id: 's1' })];
const form = (p: Partial<CreateForm> = {}): CreateForm => ({ ...DEFAULT_FORM, name: 'my-box', server: 's1', ...p });

describe('create: the name rand', () => {
  it('typed or suggested, in any case, it is refused with its own words', () => {
    for (const name of ['rand', 'RAND', 'Rand']) {
      const r = check(form({ name }), servers);
      expect(!r.ok && r.errors.name).toBe('nameReserved');
    }
    const s = check(form({ name: '', suggestion: 'Rand' }), servers);
    expect(!s.ok && s.errors.name).toBe('nameReserved');
    expect(strings['create.error.nameReserved']).toBeTruthy();
  });
  it('a name that holds the word among others is a name', () => {
    for (const name of ['rand-1', 'random', 'grand']) expect(check(form({ name }), servers).ok).toBe(true);
  });
  it('nothing typed and no suggestion still asks the API to make a name up', () => {
    const r = check(form({ name: '', suggestion: '' }), servers);
    expect(r.ok && r.body.name).toBe('rand');
  });
  it('the drawer shows the words and sends nothing', async () => {
    await renderPage(page, { state: 'pendingOps' });
    await screen.findByRole('table', {}, { timeout: 8000 });
    await userEvent.click(screen.getAllByRole('button', { name: strings['action.get'] })[0]!);
    const d = await screen.findByRole('dialog');
    const name = within(d).getByLabelText(strings['field.name']);
    await userEvent.clear(name);
    await userEvent.type(name, 'RAND');
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    expect((await within(d).findAllByText(strings['create.error.nameReserved'])).length).toBeGreaterThan(0);
    expect(heldChanges('computer.create')).toEqual([]);
  }, 40000);
});

describe('create: a lost answer is proved only by a computer the list did not show at the press', () => {
  it('a name the project already lists stays held after Check again: the listed computer proves nothing', async () => {
    const atlas = computers.find((c) => c.name === 'atlas')!;
    await renderPage(page, { state: 'pendingOps' });
    await screen.findByRole('table', {}, { timeout: 8000 });
    await userEvent.click(screen.getAllByRole('button', { name: strings['action.get'] })[0]!);
    const d = await screen.findByRole('dialog');
    const name = within(d).getByLabelText(strings['field.name']);
    await userEvent.clear(name);
    await userEvent.type(name, 'atlas');
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    const held = strings['held.create'].replace('{{name}}', 'atlas');
    expect(await within(d).findByText(held, {}, { timeout: 8000 })).toBeInTheDocument();
    // `before` is every id the list showed at the press, the listed atlas among them.
    expect(heldChanges('computer.create')).toMatchObject([{ identity: { project: atlas.project_id, name: 'atlas', before: expect.arrayContaining([atlas.id]) } }]);
    await userEvent.click(within(d).getByRole('button', { name: strings['held.check'] }));
    // The fixture list answers within its latency; a read that proved the create would have freed the hold by now.
    await new Promise((res) => setTimeout(res, 1000));
    expect(within(d).getByText(held)).toBeInTheDocument();
    expect(heldChanges('computer.create')).toHaveLength(1);
  }, 40000);
});
