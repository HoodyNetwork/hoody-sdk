// Rename reads where the item resolves before it can be sent. When that read fails, the dialog says why Rename is
// off and offers Check again, which only reads again: nothing is sent, and the dialog is never left dead and silent.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { resetFiles, sentChanges } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const ADA = '/files?a=atlas.00a1&ap=%2Fhome%2Fada';
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const table = async () => within(await screen.findByRole('region', { name: strings['pane.a'] })).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
const dialog = () => screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));

async function rowAction(name: RegExp, action: string) {
  const r = await within(await table()).findByRole('row', { name });
  await userEvent.click(within(r).getByRole('button', { name: /actions|more/i }));
  await userEvent.click(await screen.findByRole('menuitem', { name: action }));
}

beforeAll(async () => {
  await import('./view');
}, 120_000);
beforeEach(() => resetFiles());

describe('rename: where it resolves could not be read', () => {
  it('says so, offers Check again, and sends nothing', async () => {
    await renderPage(page, { path: ADA, state: 'realFails' });
    await rowAction(/notes\.txt/, strings['action.rename']);
    const d = await dialog();
    expect(await within(d).findByText(strings['rename.checkFailed'], {}, { timeout: 8000 })).toBeInTheDocument();
    const again = within(d).getByRole('button', { name: strings['action.checkAgain'] });
    const field = within(d).getByRole('textbox', { name: strings['name.label'] });
    await userEvent.clear(field);
    await userEvent.type(field, 'notes2.txt');
    expect(within(d).getByRole('button', { name: strings['action.rename'] })).toBeDisabled();
    await userEvent.click(again);
    // Still refused after the read again fails; the dialog stays, and nothing went out.
    expect(await within(d).findByText(strings['rename.checkFailed'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(sentChanges).toEqual([]);
  });
});
