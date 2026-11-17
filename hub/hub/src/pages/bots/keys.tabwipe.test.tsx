// Vitest: a key rotated on the Link and keys tab shows its secret there, once. Leaving the tab drops it as a route change
// does: coming back shows no secret field, no Done, no address to copy and no code, and nothing brings the key back.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
// The secret field's group is named by its label, "Copy the key “<name>” now".
const SECRET_FIELD = new RegExp(`^${strings['secret.title'].split('{{name}}')[0]}`);
const secretField = () => screen.queryByRole('group', { name: SECRET_FIELD });
const done = () => screen.queryByRole('button', { name: strings['secret.done'] });
const copyAddress = () => screen.queryByRole('button', { name: strings['keyShare.copyAddress'] });
const showCode = () => screen.queryByRole('button', { name: strings['keyShare.qrShow'] });

async function rotateLastKey() {
  // The keys table's own row menus (the Bot list's and the Addresses table's are other tables).
  const menus = within(screen.getByRole('table', { name: /^\d+ keys?$/ })).getAllByRole('button', { name: 'Row actions' });
  await userEvent.click(menus[menus.length - 1]!);
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['key.rotate']}`) }));
  const ask = await screen.findByRole('alertdialog', { name: strings['key.rotateTitle'] });
  await userEvent.click(within(ask).getByRole('button', { name: strings['key.rotate'] }));
}

describe('a rotated key and the Bot page tabs', () => {
  beforeAll(async () => {
    await import('./view');
  }, 30000);

  it('another tab drops the shown key: back on Link and keys there is no secret, no Done, no address and no code', async () => {
    await renderPage(page, { state: 'idle', path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link` });
    await screen.findByText(strings['keys.new']);
    await rotateLastKey();
    // The key is on screen first (the positive control: the fixture answers the rotate with a secret).
    expect(await screen.findByRole('button', { name: strings['secret.done'] })).toBeInTheDocument();
    expect(secretField()).toBeInTheDocument();
    expect(copyAddress()).toBeInTheDocument();
    expect(showCode()).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: strings['tab.activity'] }));
    await userEvent.click(screen.getByRole('tab', { name: strings['tab.link'] }));
    await screen.findByText(strings['keys.new']);
    await waitFor(() => expect(done()).toBeNull());
    expect(secretField()).toBeNull();
    expect(copyAddress()).toBeNull();
    expect(showCode()).toBeNull();
  }, 30000);

  it.each(['tab.apps', 'tab.work'] as const)('every tab counts, not only Activity: %s drops it too', async (away) => {
    await renderPage(page, { state: 'idle', path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link` });
    await screen.findByText(strings['keys.new']);
    await rotateLastKey();
    expect(await screen.findByRole('button', { name: strings['secret.done'] })).toBeInTheDocument();
    // The tab may carry a count badge after its label.
    await userEvent.click(screen.getByRole('tab', { name: new RegExp(`^${strings[away]}`) }));
    await userEvent.click(screen.getByRole('tab', { name: strings['tab.link'] }));
    await screen.findByText(strings['keys.new']);
    await waitFor(() => expect(done()).toBeNull());
    expect(secretField()).toBeNull();
  }, 30000);
});
