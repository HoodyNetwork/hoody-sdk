// "Only these IPs" on a computer (Permissions tab): a typed list of IPv4 addresses and ranges, with Add my IP. The
// list opens on the addresses the rules hold now, so none is lost unless the person deletes it. Save asks first and
// names every address, the ones no longer allowed and the caller's own address when the list leaves it out; it sends
// the version it read as If-Match, once. A refused entry is named and nothing is sent. A lost answer is held under
// the choice's own name and never sent again.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { accessSends, computers, resetAccess } from './fixtures';
import { permissionsTesting, SLOW } from './permissions.testing';
import strings from './parts/AccessDrawer.strings.en.json';

const { openPermissions } = permissionsTesting({ renderPage, screen, userEvent, waitFor });

const [ATLAS, , THIRD] = computers;
if (!ATLAS || !THIRD) throw new Error('fixture computers');
const HOME = '203.0.113.7';
const OFFICE = '198.51.100.0/24';
const ALL = { '*': true, logs: true };
const fill = (k: keyof typeof strings, v: Record<string, string | number> = {}) => Object.entries(v).reduce<string>((s, [n, x]) => s.split(`{{${n}}}`).join(String(x)), strings[k]);

// THIRD has no rules of its own (anyone); ATLAS is Only my IP from 203.0.113.7.
async function openOn(c: (typeof computers)[number], now: string, state?: string) {
  const d = await openPermissions(c, state);
  await within(d).findByText(now, undefined, { timeout: 30000 });
  return d;
}
async function pickList(d: HTMLElement) {
  await userEvent.click(within(d).getByRole('radio', { name: new RegExp(strings['acc.ips']) }));
  return (await within(d).findByLabelText(strings['acc.ips.label'], undefined, SLOW)) as HTMLTextAreaElement;
}
const save = (d: HTMLElement) => within(d).queryByRole('button', { name: strings['acc.save'] });
async function pressSave(d: HTMLElement) {
  await userEvent.click(within(d).getByRole('button', { name: strings['acc.save'] }));
  return screen.findByRole('alertdialog', undefined, SLOW);
}
const confirmInAdd = (c: HTMLElement) => userEvent.click(within(c).getByRole('button', { name: strings['acc.p.confirmGo'] }));
const confirmIn = (c: HTMLElement) => userEvent.click(within(c).getByRole('button', { name: strings['acc.confirm.go'] }));

describe('computers: Only these IPs (Permissions tab)', () => {
  beforeEach(() => resetAccess());

  it('two addresses: the confirm names both, nothing is sent before it, and the write holds one group per address', async () => {
    const d = await openOn(THIRD, strings['acc.now.anyone']);
    const field = await pickList(d);
    expect(field.value).toBe('');
    await userEvent.type(field, `${HOME}, ${OFFICE}`);
    const c = await pressSave(d);
    expect(c).toHaveTextContent(fill('acc.confirm.ips', { ips: `${HOME}, ${OFFICE}` }));
    // The caller's own address (203.0.113.7) is in the list: no lock-out line.
    expect(c).not.toHaveTextContent(/is not in the list/);
    expect(accessSends).toHaveLength(0);
    await confirmIn(c);
    await within(d).findByText(strings['acc.saved'], undefined, SLOW);
    expect(accessSends).toHaveLength(1);
    expect(accessSends[0]).toMatchObject({
      ifMatch: 'file:v0',
      body: {
        groups: { 'hub-ip-203-0-113-7-32': { type: 'ip', range: `${HOME}/32` }, 'hub-ip-198-51-100-0-24': { type: 'ip', range: OFFICE } },
        permissions: { 'hub-ip-203-0-113-7-32': ALL, 'hub-ip-198-51-100-0-24': ALL },
        default: 'deny',
      },
    });
    expect(Object.keys((accessSends[0]!.body as { groups: object }).groups)).toHaveLength(2);
    expect(d).toHaveTextContent(fill('acc.now.ips', { ips: `${HOME}, ${OFFICE}` }));
    // The saved list is the choice now, and it is what the field shows.
    expect(within(d).getByRole('radio', { name: new RegExp(strings['acc.ips']) })).toBeChecked();
  }, 60000);

  it('from Only my IP the stored address is already in the list: adding an office keeps it', async () => {
    const d = await openOn(ATLAS, fill('acc.now.myIp', { ip: HOME }));
    const field = await pickList(d);
    expect(field.value).toBe(HOME);
    // The stored address alone is no change: nothing to save yet.
    const b = save(d);
    if (b) expect(b).toBeDisabled();
    await userEvent.type(field, `, ${OFFICE}`);
    const c = await pressSave(d);
    expect(c).toHaveTextContent(fill('acc.confirm.ips', { ips: `${HOME}, ${OFFICE}` }));
    expect(c).not.toHaveTextContent(/Removed from the allowed addresses/);
    await confirmIn(c);
    await within(d).findByText(strings['acc.saved'], undefined, SLOW);
    expect(Object.keys((accessSends[0]!.body as { groups: object }).groups).sort()).toEqual(['hub-ip-198-51-100-0-24', 'hub-ip-203-0-113-7-32']);
    expect(accessSends[0]?.ifMatch).toBe('file:v4');
  }, 60000);

  it('replacing the stored address says which one goes, and that the caller\'s own address is left out', async () => {
    const d = await openOn(ATLAS, fill('acc.now.myIp', { ip: HOME }));
    const field = await pickList(d);
    await userEvent.clear(field);
    await userEvent.type(field, OFFICE);
    const c = await pressSave(d);
    expect(c).toHaveTextContent(fill('acc.confirm.ips', { ips: OFFICE }));
    expect(c).toHaveTextContent(fill('acc.confirm.ips.removed', { ips: HOME }));
    expect(c).toHaveTextContent(fill('acc.confirm.ips.out', { ip: HOME }));
    // Cancel: nothing is sent.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull(), SLOW);
    expect(accessSends).toHaveLength(0);
  }, 60000);

  it('a refused entry is named and nothing can be saved: host bits, every address, IPv6', async () => {
    const d = await openOn(THIRD, strings['acc.now.anyone']);
    const field = await pickList(d);
    await userEvent.type(field, '198.51.100.7/24 0.0.0.0/0 2001:db8::7');
    expect(d).toHaveTextContent(fill('acc.ips.err.host_bits', { entry: '198.51.100.7/24' }));
    expect(d).toHaveTextContent(fill('acc.ips.err.all', { entry: '0.0.0.0/0' }));
    expect(d).toHaveTextContent(fill('acc.ips.err.ipv6', { entry: '2001:db8::7' }));
    const b = save(d);
    if (b) {
      expect(b).toBeDisabled();
      await userEvent.click(b).catch(() => undefined);
    }
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(accessSends).toHaveLength(0);
  }, 60000);

  it('Add my IP puts the address the Hoody API sees into the list in one press, and sends nothing', async () => {
    const d = await openOn(THIRD, strings['acc.now.anyone']);
    const field = await pickList(d);
    await userEvent.click(within(d).getByRole('button', { name: /Add my IP/ }));
    await waitFor(() => expect(field.value).toBe(HOME), SLOW);
    expect(accessSends).toHaveLength(0);
    const c = await pressSave(d);
    expect(c).toHaveTextContent(fill('acc.confirm.ips', { ips: HOME }));
  }, 60000);

  it('a lost answer is held under the choice\'s name: the list and the choices lock, Check again only reads, nothing is sent twice', async () => {
    const d = await openOn(THIRD, strings['acc.now.anyone'], 'accessLost');
    const field = await pickList(d);
    await userEvent.type(field, `${HOME}, ${OFFICE}`);
    await confirmIn(await pressSave(d));
    await within(d).findByText(strings['acc.held.ips'], undefined, SLOW);
    expect(accessSends).toHaveLength(1);
    expect(within(d).getByRole('radio', { name: new RegExp(strings['acc.private']) })).toBeDisabled();
    expect(within(d).getByLabelText(strings['acc.ips.label'])).toBeDisabled();
    await userEvent.click(within(d).getAllByRole('button', { name: strings['acc.held.check'] })[0]!);
    await waitFor(() => expect(within(d).getByText(strings['acc.held.ips'])).toBeInTheDocument(), SLOW);
    expect(accessSends).toHaveLength(1);
  }, 60000);

  it('a lost answer that went through is freed only by a read holding exactly the list sent', async () => {
    const d = await openOn(THIRD, strings['acc.now.anyone'], 'accessLostApplied');
    const field = await pickList(d);
    await userEvent.type(field, `${HOME}, ${OFFICE}`);
    await confirmIn(await pressSave(d));
    // Core's read-back after the lost answer finds the two ranges at a newer version; Check again, when the band still
    // shows, runs the same read.
    const again = within(d).queryAllByRole('button', { name: strings['acc.held.check'] })[0];
    if (again) await userEvent.click(again).catch(() => undefined);
    await within(d).findByText(fill('acc.now.ips', { ips: `${HOME}, ${OFFICE}` }), undefined, { timeout: 20000 });
    await waitFor(() => expect(within(d).queryByText(strings['acc.held.ips'])).toBeNull(), SLOW);
    expect(accessSends).toHaveLength(1);
  }, 60000);

  // The two lines below are the person's only warning that something they set earlier goes.
  async function startAdd(d: HTMLElement, add: 'acc.p.addKey' | 'acc.p.addPerson', name: string) {
    await userEvent.click(within(d).getByRole('radio', { name: new RegExp(strings['acc.people']) }));
    await userEvent.click(await within(document.body).findByRole('button', { name: strings[add] }, SLOW));
    const f = await screen.findByRole('dialog', undefined, SLOW);
    await userEvent.type(within(f).getByRole('textbox', { name: strings['acc.p.name'] }), name);
    await userEvent.click(within(f).getByRole('checkbox', { name: strings['acc.p.prog.files'] }));
    await userEvent.click(within(f).getByRole('button', { name: strings['acc.p.continue'] }));
    return screen.findByRole('alertdialog', undefined, SLOW);
  }

  it('adding a key from Only my IP: the confirm names the address that stops getting in, and nothing is sent before it', async () => {
    const d = await openOn(ATLAS, fill('acc.now.myIp', { ip: HOME }));
    const c = await startAdd(d, 'acc.p.addKey', 'ci');
    expect(c).toHaveTextContent(fill('acc.p.confirmAddrGo', { ips: HOME }));
    expect(accessSends).toHaveLength(0);
  }, 60000);

  it('from people or keys to the list: the confirm says the people and keys are removed', async () => {
    const d = await openOn(THIRD, strings['acc.now.anyone']);
    await confirmInAdd(await startAdd(d, 'acc.p.addPerson', 'Ana Lopez'));
    await within(document.body).findByText(strings['acc.now.people'], undefined, SLOW);
    const done = () => screen.getByRole('button', { name: strings['acc.p.secretDone'] });
    await waitFor(() => expect(done()).not.toHaveAttribute('aria-disabled', 'true'), SLOW);
    await userEvent.click(done());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), SLOW);
    const field = await pickList(d);
    await userEvent.type(field, OFFICE);
    const c = await pressSave(d);
    expect(c).toHaveTextContent(fill('acc.confirm.ips', { ips: OFFICE }));
    expect(c).toHaveTextContent(fill('acc.confirm.ips.ended', { n: 1 }));
    // Nothing of the list is sent before the confirm.
    expect(accessSends).toHaveLength(0);
  }, 90000);
});
