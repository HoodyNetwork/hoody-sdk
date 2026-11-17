// Who can open a computer's programs, in its Permissions tab. "Only my IP" shows the caller's address
// with its place and network, the IPv4-only rule and the lock-out warning; rules set elsewhere are shown read-only
// with no credential on the page.
import { describe, expect, it } from 'vitest';
import { fixtureWorld, queryClient } from '@core';
import { maskId } from '@kit';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { computers, myIpServer } from './fixtures';
import { permissionsTesting } from './permissions.testing';
import strings from './parts/AccessDrawer.strings.en.json';
import pageStrings from './strings.en.json';
import kitStates from '@kit/states/strings.en.json';

const { openPermissions } = permissionsTesting({ renderPage, screen, userEvent, waitFor });

const [ATLAS, SECOND, THIRD] = computers;
if (!ATLAS || !SECOND || !THIRD) throw new Error('fixture computers');

const openDrawer = openPermissions;

describe('computers: who can open (Permissions tab)', () => {
  it('the drawer’s own rule reads as Only my IP: the address, its place and network, IPv4 only, the lock-out warning', async () => {
    const d = await openDrawer(ATLAS);
    await within(d).findByText(strings['acc.now.myIp'].replace('{{ip}}', '203.0.113.7'));
    expect(within(d).getByRole('radio', { name: new RegExp(strings['acc.myIp']) })).toBeChecked();
    expect(within(d).getByRole('radio', { name: new RegExp(strings['acc.people']) })).toBeEnabled();
    // Every choice says what it means for someone who holds a program's address.
    for (const k of ['acc.anyoneHelp', 'acc.myIpHelp', 'acc.peopleHelp', 'acc.privateHelp'] as const) expect(d).toHaveTextContent(strings[k]);
    await waitFor(() => expect(d).toHaveTextContent('Singapore'));
    expect(d).toHaveTextContent(strings['acc.ipNote']);
    expect(d).toHaveTextContent(strings['acc.lockout']);
    expect(within(d).getByRole('button', { name: strings['acc.save'] })).toBeInTheDocument();
  });

  it('the open default reads as Anyone; picking Only my IP reads the address only then', async () => {
    const d = await openDrawer(THIRD);
    await within(d).findByText(strings['acc.now.anyone']);
    expect(within(d).getByRole('radio', { name: new RegExp(strings['acc.anyone']) })).toBeChecked();
    expect(d).not.toHaveTextContent(strings['acc.lockout']);
    await userEvent.click(within(d).getByRole('radio', { name: new RegExp(strings['acc.myIp']) }));
    await waitFor(() => expect(d).toHaveTextContent(strings['acc.lockout']));
  });

  it('the shut document reads as Private: nobody gets in by address, the link stops working', async () => {
    const d = await openDrawer(THIRD, 'accessShut');
    await within(d).findByText(strings['acc.now.private']);
    expect(within(d).getByRole('radio', { name: new RegExp(strings['acc.private']) })).toBeChecked();
    expect(d).not.toHaveTextContent(strings['acc.now.advanced']);
  });

  it('over IPv6, Only my IP says it cannot let you in and shows no lock-out warning', async () => {
    const d = await openDrawer(THIRD, 'accessV6');
    await within(d).findByText(strings['acc.now.anyone']);
    await userEvent.click(within(d).getByRole('radio', { name: new RegExp(strings['acc.myIp']) }));
    await waitFor(() => expect(d).toHaveTextContent(strings['acc.ipv6'].replace('{{ip}}', '2001:db8::7')));
    expect(d).not.toHaveTextContent(strings['acc.lockout']);
  });

  it('rules set elsewhere are shown read-only, with no choice offered and no credential on the page', async () => {
    const d = await openDrawer(SECOND);
    await within(d).findByText(strings['acc.now.advanced']);
    expect(within(d).queryByRole('radio')).toBeNull();
    expect(d).toHaveTextContent(strings['sum.projectToo']);
    // The plain summary, read from the rules: only the password group gets in, everyone else is kept out.
    expect(d).toHaveTextContent(strings['sum.only_one'].replace('{{groups}}', 'team'));
    expect(d).toHaveTextContent(strings['acc.adv.kind.password']);
    expect(d).toHaveTextContent(strings['sum.hooks_one'].replace('{{count}}', '1'));
    expect(document.body.textContent).not.toContain('fixture-password-not-shown');
    expect(document.body.textContent).not.toContain('hooks.example');
    expect(d).toHaveTextContent(strings['acc.adv.some'].replace('{{program}}', 'http'));
    expect(d).not.toHaveTextContent(strings['acc.adv.none'].replace('{{program}}', 'http'));
    // A Hoody program is named in its words, as the people list names it; a port name stays as written.
    expect(d).toHaveTextContent(strings['acc.adv.some'].replace('{{program}}', strings['acc.p.prog.terminal']));
    expect(d.textContent).not.toMatch(/terminal \(some\)/);
  });

  it('a group named after an id shows masked, never whole', async () => {
    const id = fixtureWorld.projects[1]!.id;
    const d = await openDrawer(SECOND, 'accessIdGroup');
    await within(d).findByText(strings['acc.now.advanced']);
    expect(document.body.textContent).not.toContain(id);
    expect(d).toHaveTextContent(maskId(id));
  });

  it('a project rule the list does not show yet: the fresh read makes the choice read-only', async () => {
    const d = await openDrawer(ATLAS, 'accessScopeMoved');
    await within(d).findByText(strings['acc.now.advanced']);
    expect(within(d).queryByRole('radio')).toBeNull();
    expect(d).toHaveTextContent(strings['sum.projectToo']);
    // Its own IP rule stays shown, as what its own rules say.
    expect(d).toHaveTextContent(strings['sum.ownLead']);
    expect(d).toHaveTextContent('203.0.113.7/32');
  });

  it('reopening: a re-read that fails shows the error, never the earlier answer as current', async () => {
    const d = await openDrawer(THIRD, 'accessOnce');
    await within(d).findByText(strings['acc.now.anyone']);
    // Leaving the tab and coming back is a new opening: it reads again.
    await userEvent.click(screen.getByRole('tab', { name: pageStrings['tab.overview'] }));
    await waitFor(() => expect(screen.getByRole('tab', { name: pageStrings['tab.overview'] })).toHaveAttribute('aria-selected', 'true'));
    await userEvent.click(screen.getByRole('tab', { name: pageStrings['tab.permissions'] }));
    const again = await screen.findByRole('tabpanel');
    await within(again).findByText(strings['acc.error']);
    expect(again).not.toHaveTextContent(strings['acc.now.anyone']);
  });

  it('the open default under a project with rules: says what its own rules say and that the project can change who gets in, never "anyone"', async () => {
    const d = await openDrawer(THIRD, 'accessScopeMoved');
    await within(d).findByText(strings['sum.projectToo']);
    expect(d).toHaveTextContent(strings['sum.ownLead']);
    // A computer with no document of its own sets no default: its own rules do not say, the project decides.
    expect(d).toHaveTextContent(strings['sum.noDefault']);
    expect(d).not.toHaveTextContent(strings['sum.anyone']);
  });

  it('rules that cannot be read say so, with a way to try again', async () => {
    const d = await openDrawer(ATLAS, 'accessError');
    await within(d).findByText(strings['acc.error']);
    // The refused read's facts are one press away.
    await userEvent.click(within(d).getByRole('button', { name: kitStates['err.details'] }));
    expect(await screen.findByRole('dialog', { name: kitStates['err.detailsTitle'] })).toHaveTextContent('GET /computers/{id}/proxy/permissions');
  });

  it('Only my IP with an address that cannot be read says so, with its Details', async () => {
    const d = await openDrawer(THIRD);
    await within(d).findByText(strings['acc.now.anyone']);
    myIpServer.fail = true;
    try {
      await userEvent.click(within(d).getByRole('radio', { name: new RegExp(strings['acc.myIp']) }));
      await within(d).findByText(strings['acc.ipError']);
      await userEvent.click(within(d).getByRole('button', { name: kitStates['err.details'] }));
      expect(await screen.findByRole('dialog', { name: kitStates['err.detailsTitle'] })).toHaveTextContent('GET /ip');
    } finally {
      myIpServer.fail = false;
    }
  });

  it('Only my IP after a re-read of the address fails: the earlier address is not saved; it says so and Save is off', async () => {
    const d = await openDrawer(THIRD);
    await within(d).findByText(strings['acc.now.anyone']);
    await userEvent.click(within(d).getByRole('radio', { name: new RegExp(strings['acc.myIp']) }));
    await within(d).findByText(/Singapore/);
    const save = () => within(d).getByRole('button', { name: strings['acc.save'] });
    await waitFor(() => expect(save()).toBeEnabled());
    // The address is read again and the read fails: the cache keeps the earlier answer.
    myIpServer.fail = true;
    try {
      await act(async () => { await queryClient.refetchQueries(); });
      expect(await within(d).findByText(strings['acc.ipError'])).toBeInTheDocument();
      expect(d).not.toHaveTextContent('203.0.113.7');
      await waitFor(() => expect(save()).toBeDisabled());
      await userEvent.click(save());
      expect(screen.queryByRole('alertdialog')).toBeNull();
    } finally {
      myIpServer.fail = false;
    }
  });

  it('a credential that may not manage access rules is told so: no choice, and the rules are never asked for', async () => {
    const d = await openDrawer(ATLAS, 'limited');
    await within(d).findByText(strings['perm.cant'], undefined, { timeout: 8000 });
    expect(within(d).queryByRole('radio')).toBeNull();
    expect(within(d).queryByRole('button', { name: strings['acc.save'] })).toBeNull();
  });
});
