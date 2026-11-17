// "Only my IP" on a computer (Permissions tab): the Save press reads the caller's address again before it asks. An
// address other than the one shown asks nothing and sends nothing; the choice then shows the address in use now, and
// the next Save asks about that one. A read that fails asks nothing either.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { accessSends, computers, myIpServer, resetAccess } from './fixtures';
import { permissionsTesting, SLOW } from './permissions.testing';
import strings from './parts/AccessDrawer.strings.en.json';

const { openPermissions } = permissionsTesting({ renderPage, screen, userEvent, waitFor });

const THIRD = computers[2];
if (!THIRD) throw new Error('fixture computers');
const SHOWN = '203.0.113.7';
const NOW = '198.51.100.4';
const say = (k: keyof typeof strings, ip: string) => strings[k].replace('{{ip}}', ip);

async function pickMyIp() {
  const d = await openPermissions(THIRD!);
  await within(d).findByText(strings['acc.now.anyone'], undefined, { timeout: 30000 });
  await userEvent.click(within(d).getByRole('radio', { name: new RegExp(strings['acc.myIp']) }));
  await within(d).findByText(new RegExp(SHOWN.replaceAll('.', '\\.')), undefined, SLOW);
  return d;
}
const pressSave = (d: HTMLElement) => userEvent.click(within(d).getByRole('button', { name: strings['acc.save'] }));

describe('computers: Only my IP reads the address again on Save', () => {
  beforeEach(() => resetAccess());
  afterEach(() => { myIpServer.ip = null; myIpServer.fail = false; });

  it('the address changed since it was shown: nothing is asked or sent, and the next Save asks about the new one', async () => {
    const d = await pickMyIp();
    myIpServer.ip = NOW;
    await pressSave(d);
    await within(d).findByText(strings['acc.ipChanged'], undefined, SLOW);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(accessSends).toHaveLength(0);
    await within(d).findByText(new RegExp(NOW.replaceAll('.', '\\.')), undefined, SLOW);
    await pressSave(d);
    const c = await screen.findByRole('alertdialog', undefined, SLOW);
    expect(c).toHaveTextContent(say('acc.confirm.myIp', NOW));
    expect(d).not.toHaveTextContent(strings['acc.ipChanged']);
    await userEvent.click(within(c).getByRole('button', { name: strings['acc.confirm.go'] }));
    await within(d).findByText(strings['acc.saved'], undefined, SLOW);
    expect(accessSends).toHaveLength(1);
    expect(accessSends[0]?.body).toMatchObject({ groups: { 'hub-my-ip': { type: 'ip', range: `${NOW}/32` } }, default: 'deny' });
  }, 90000);

  it('the address can\'t be read on Save: nothing is asked or sent', async () => {
    const d = await pickMyIp();
    myIpServer.fail = true;
    await pressSave(d);
    await within(d).findByText(strings['acc.ipError'], undefined, SLOW);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(accessSends).toHaveLength(0);
  }, 90000);

  it('the address read on Save is the one the rules already allow: it says there is nothing to save', async () => {
    // ATLAS is Only my IP from 203.0.113.7; the address shown on opening is another one.
    const d = await openPermissions(computers[0]!, 'accessNewIp');
    await within(d).findByText(new RegExp(NOW.replaceAll('.', '\\.')), undefined, { timeout: 30000 });
    myIpServer.ip = SHOWN;
    await pressSave(d);
    await within(d).findByText(strings['acc.ipChangedSame'], undefined, SLOW);
    expect(d).not.toHaveTextContent(strings['acc.ipChanged']);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(accessSends).toHaveLength(0);
  }, 90000);

  it('the same address: the confirm names it, as before', async () => {
    const d = await pickMyIp();
    await pressSave(d);
    const c = await screen.findByRole('alertdialog', undefined, SLOW);
    expect(c).toHaveTextContent(say('acc.confirm.myIp', SHOWN));
    expect(accessSends).toHaveLength(0);
  }, 90000);
});
