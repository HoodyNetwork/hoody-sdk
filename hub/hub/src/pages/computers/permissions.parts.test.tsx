// The Permissions tab's other parts: the firewall reminder (its numbers, the move to the Network tab with the Firewall
// heading in view and focused, Back), what a sign-in that may not read rules sees, where the verdict's "why" comes
// from, and the one case that still gets a drawer: a computer this page cannot show.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { computers } from './fixtures';
import { blockingInbound } from './parts/PermissionsFirewall';
import { nowLine, permissionsFrozen, whyKey } from './parts/AccessDrawer';
import type { FwList } from './parts/Firewall.logic';
import strings from './parts/AccessDrawer.strings.en.json';
import fwStrings from './parts/Firewall.strings.en.json';
import pageStrings from './strings.en.json';
import { permissionsTesting, SLOW } from './permissions.testing';

const { openPermissions } = permissionsTesting({ renderPage, screen, userEvent, waitFor });

const [ATLAS, , THIRD] = computers;
if (!ATLAS || !THIRD) throw new Error('fixture computers');

const firewall = (panel: HTMLElement) => within(panel).getByRole('heading', { name: strings['perm.fw.title'] }).closest('section') as HTMLElement;
const fact = (sec: HTMLElement, label: string) => (within(sec).getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement);

describe('computers: the Permissions tab, firewall reminder', () => {
  it('counts only enabled inbound rules that turn traffic away, and never counts over a rule it could not read', () => {
    const l = (ingress: { action: string; state: string }[], unreadable = 0) => ({ ingress, egress: [], unreadable } as unknown as FwList);
    expect(blockingInbound(l([{ action: 'drop', state: 'enabled' }, { action: 'reject', state: 'enabled' }, { action: 'allow', state: 'enabled' }, { action: 'drop', state: 'disabled' }]))).toBe(2);
    expect(blockingInbound(l([]))).toBe(0);
    expect(blockingInbound(l([{ action: 'drop', state: 'enabled' }], 1))).toBeNull();
  });

  it('says internet access, how many rules, how many block inbound, and that everything else is allowed', async () => {
    const panel = await openPermissions(THIRD);
    const sec = firewall(panel);
    expect(sec).toHaveTextContent(strings['perm.fw.lede'].replace('{{name}}', THIRD.name));
    // The fixture firewall: one enabled inbound block, one allow, one disabled refuse; one outbound block.
    await waitFor(() => expect(fact(sec, strings['perm.fw.blocking'])).toHaveTextContent(/^1 rule$/), SLOW);
    expect(fact(sec, strings['perm.fw.internet'])).toHaveTextContent(fwStrings['ni.allowed']);
    expect(fact(sec, strings['perm.fw.rules'])).toHaveTextContent(/4/);
    expect(fact(sec, strings['perm.fw.unmatched'])).toHaveTextContent(strings['perm.fw.unmatched.value']);
  });

  it('a blocked internet switch shows as blocked', async () => {
    const panel = await openPermissions(THIRD, 'netNoInternet');
    await waitFor(() => expect(fact(firewall(panel), strings['perm.fw.internet'])).toHaveTextContent(fwStrings['ni.blockedState']), SLOW);
  });

  it('a half-set internet switch shows as partly', async () => {
    const panel = await openPermissions(THIRD, 'netNoInternetPartial');
    await waitFor(() => expect(fact(firewall(panel), strings['perm.fw.internet'])).toHaveTextContent(fwStrings['ni.partlyState']), SLOW);
  });

  it('Open firewall rules shows the Network tab with the Firewall heading focused, drops the marker from the URL, and Back returns to Permissions', async () => {
    const panel = await openPermissions(THIRD);
    const r = panel.rendered;
    await userEvent.click(within(firewall(panel)).getByRole('button', { name: strings['perm.fw.open'] }));
    await waitFor(() => expect(r.router.state.location.search).toMatchObject({ tab: 'network' }), SLOW);
    await waitFor(() => {
      const at = document.activeElement as HTMLElement | null;
      expect(at?.hasAttribute('data-hub-heading')).toBe(true);
      expect(at?.closest('section')?.id).toBe('net-firewall');
    }, SLOW);
    expect((r.router.state.location.search as Record<string, unknown>).at).toBeUndefined();
    r.router.history.back();
    await waitFor(() => expect(r.router.state.location.search).toMatchObject({ tab: 'permissions' }), SLOW);
    expect(await screen.findByRole('tab', { name: pageStrings['tab.permissions'], selected: true }, SLOW)).toBeInTheDocument();
  });
});

describe('computers: the Permissions tab, states', () => {
  it('a sign-in that may not read rules or the firewall: the list word as last listed, both parts say so, nothing to change', async () => {
    const panel = await openPermissions(ATLAS, 'limited');
    await within(panel).findByText(strings['perm.cant'], undefined, SLOW);
    expect(panel).toHaveTextContent(strings['perm.why.listed']);
    expect(panel).toHaveTextContent(strings['perm.fw.cant']);
    expect(within(panel).queryByRole('radiogroup')).toBeNull();
    expect(within(firewall(panel)).queryByText(strings['perm.fw.unmatched.value'])).toBeNull();
    expect(within(firewall(panel)).queryByRole('button', { name: strings['perm.fw.open'] })).toBeNull();
  });

  it('a computer whose server ended or was reinstalled is frozen; any other is not', () => {
    expect(permissionsFrozen({ status: 'host_reinstalled', server_expired: true })).toBe('reinstalled');
    expect(permissionsFrozen({ status: 'stopped', server_expired: true })).toBe('expired');
    expect(permissionsFrozen({ status: 'stopped', server_expired: false })).toBeUndefined();
    expect(permissionsFrozen({ status: 'running' })).toBeUndefined();
  });

  it('the why line: no rules, the stored choice, a cut add, and the reason that decides most for rules set elsewhere', () => {
    expect(whyKey({ kind: 'anyone' }, 'missing')).toBe('perm.why.none');
    expect(whyKey({ kind: 'anyone' }, undefined)).toBe('perm.why.none');
    expect(whyKey({ kind: 'anyone' }, 'default')).toBe('perm.why.hereAnyone');
    expect(whyKey({ kind: 'private' }, 'applied')).toBe('perm.why.here');
    expect(whyKey({ kind: 'people', entries: [], unfinished: true, open: true, myIp: false }, 'applied')).toBe('perm.why.unfinished');
    expect(whyKey({ kind: 'people', entries: [], unfinished: true, open: false, myIp: true }, 'applied')).toBe('perm.why.unfinished');
    expect(whyKey({ kind: 'people', entries: [], unfinished: true, open: false, myIp: false }, 'applied')).toBe('perm.why.unfinished');
    expect(whyKey({ kind: 'people', entries: [], unfinished: false, open: false, myIp: false }, 'applied')).toBe('perm.why.here');
    expect(whyKey({ kind: 'advanced', why: ['project', 'proxyOff', 'hooks'] }, 'applied')).toBe('perm.why.proxyOff');
    expect(whyKey({ kind: 'advanced', why: ['projectUnknown', 'rules'] }, 'applied')).toBe('perm.why.rules');
    expect(whyKey({ kind: 'advanced', why: [] }, 'applied')).toBe('perm.why.rules');
  });

  it('the verdict after a cut add never says a listed entry can open programs it was given none of', () => {
    const key = (m: Parameters<typeof nowLine>[0]) => nowLine(m, (k) => k);
    const empty = { name: 'ci', group: 'hub-key-ci', kind: 'key', programs: [] } as never;
    const full = { name: 'ci', group: 'hub-key-ci', kind: 'key', programs: ['files'] } as never;
    expect(key({ kind: 'people', entries: [empty], unfinished: true, open: false, myIp: false })).toBe('acc.now.cut');
    expect(key({ kind: 'people', entries: [empty], unfinished: true, open: false, myIp: true })).toBe('acc.now.cutMyIp');
    expect(key({ kind: 'people', entries: [empty], unfinished: true, open: true, myIp: false })).toBe('acc.now.anyone');
    expect(key({ kind: 'people', entries: [full], unfinished: true, open: false, myIp: true })).toBe('acc.now.peopleMyIp');
    expect(key({ kind: 'people', entries: [full], unfinished: false, open: false, myIp: false })).toBe('acc.now.people');
  });
});
