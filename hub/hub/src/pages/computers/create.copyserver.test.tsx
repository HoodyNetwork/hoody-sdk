// A copy's Server list reads as the new form's: each server shows its flag, name and place in the row, drawn by the
// same helper, so one server never reads two ways in the same drawer.
import { countryFlag, definePage } from '@kit';
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { CreateDrawer } from './parts/CreateDrawer';
import { computers } from './fixtures';
import strings from './strings.en.json';
import type { Server } from './types';

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const servers: Server[] = [{ id: 's1', name: 'paris-1', place: 'Paris, France', cc: 'FR', cpu: 4, ram: 8, disk: 80, free: false, days: null, status: 'active', cap: null }];
const serverButton = (d: HTMLElement) => within(d).getByRole('button', { name: new RegExp(`${esc(strings['field.server'])}$`) });

describe('Get a computer: a copy names its server as the new form does', () => {
  it('the picked server shows flag, name and place in both forms', async () => {
    const Harness = () => <CreateDrawer isOpen servers={servers} serversError={false} projects={undefined} realms={undefined} onClose={() => {}} onDone={() => {}} canCopy computers={computers} />;
    const p = definePage({ id: 'computers', path: '/computers', title: 'title', description: 'harness', nav: { group: 'main', order: 20, icon: 'computer', label: 'nav' }, layout: 'list-detail', load: async () => ({ default: Harness }), status: 'preview', sensitive: false, strings });
    await renderPage(p, { path: '/computers' });
    const d = await screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
    const shown = `${countryFlag('FR')} paris-1 · Paris`;
    expect(shown.startsWith('paris')).toBe(false);
    await waitFor(() => expect(serverButton(d)).toHaveTextContent(shown));
    const src = computers[0]!;
    await userEvent.click(within(within(d).getByRole('radiogroup', { name: strings['create.from'] })).getByRole('radio', { name: new RegExp(`^${esc(strings['create.fromCopy'])}`) }));
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(`${esc(strings['create.copyFrom'])}$`) }));
    await userEvent.click((await screen.findAllByRole('radio', { name: new RegExp(`^${esc(src.name)}`) })).at(-1) as HTMLElement);
    await waitFor(() => expect((within(d).getByLabelText(strings['field.name']) as HTMLInputElement).value).toBe(`${src.name}-copy`));
    await waitFor(() => expect(serverButton(d)).toHaveTextContent(shown));
  }, 40000);
});
