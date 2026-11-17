// Vitest: the VMs page over its fixture states. What it draws in each state of the computer, and (the rule that keeps a
// shared server's computer from being asked for VMs it cannot have) which requests go to the VM program.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { VM_DETAIL_SLOTS } from './data';
import { FX, requestLog } from './fixtures';
import { POLL_FAST_MS, POLL_SLOW_MS } from './logic';
import page from './page';
import strings from './strings.en.json';

const WAIT = { timeout: 10000 };
const say = (key: keyof typeof strings, vars: Record<string, string | number> = {}): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), strings[key]);
const asked = (route: string) => requestLog.filter((r) => r.route === route).length;

beforeEach(() => { requestLog.length = 0; });

describe('the list', () => {
  it('bare metal with KVM on: what the computer can run, then its VMs with their states', async () => {
    await renderPage(page);
    const table = await screen.findByRole('table', { name: say('list.label', { name: 'atlas' }) }, WAIT);
    expect(await within(table).findByText('web-1', undefined, WAIT)).toBeInTheDocument();
    expect(within(table).getByText('batch')).toBeInTheDocument();
    expect(within(table).getAllByText(strings['state.runFailed']).length).toBe(1);
    expect(within(table).getAllByText(strings['state.createFailed']).length).toBe(1);
    expect(screen.getByText(strings['host.server.bare'])).toBeInTheDocument();
    // The KVM fact; the table's Screen column uses the same word.
    expect(screen.getAllByText(strings['host.kvm.on']).length).toBeGreaterThan(0);
    expect(screen.getByText(say('host.budget', { used: 3, max: 16 }))).toBeInTheDocument();
    expect(asked('caps')).toBeGreaterThan(0);
    expect(asked('vms')).toBeGreaterThan(0);
    // Exactly the VMs of the shown table page are read one by one: never more than one page holds, none for a row
    // that is not shown.
    const shown = within(table).getAllByRole('row').slice(1).map((r) => r.querySelector('td, th')?.textContent?.trim() ?? '');
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThanOrEqual(VM_DETAIL_SLOTS);
    const readNames = () => [...new Set(requestLog.filter((r) => r.route === 'vm').map((r) => r.path.slice(r.path.lastIndexOf('/') + 1)))].sort();
    await waitFor(() => expect(readNames()).toEqual([...shown].sort()), WAIT);
    expect(FX.VMS.details.length).toBeGreaterThan(shown.length);
  });

  it.each(['shared', 'shared-paid'])('%s server: says VMs need bare metal, shows no VM list, and never asks the VM program', async (state) => {
    await renderPage(page, { state });
    expect(await screen.findByText(say('st.shared', { name: 'atlas' }), undefined, WAIT)).toBeInTheDocument();
    expect(screen.getByText(strings['host.server.shared'])).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(document.querySelector('#vms-list')).toBeNull();
    // The list's place says what to do next: never a table, never "no VMs yet".
    const blocked = document.querySelector('#vms-blocked') as HTMLElement;
    expect(blocked).not.toBeNull();
    // The section's notHere state: the kit's empty state (no live region) with the title and the next steps, never a
    // neutral Band (role status) under the section.
    expect(within(blocked).getByText(say('blocked.shared.title', { name: 'atlas' }))).toBeInTheDocument();
    expect(within(blocked).getByText(say('blocked.shared.body', { name: 'atlas' }))).toBeInTheDocument();
    expect(within(blocked).queryByRole('status')).toBeNull();
    expect(screen.queryByText(say('list.empty.title', { name: 'atlas' }))).toBeNull();
    // Long enough for a read to have gone out had one been asked for.
    await new Promise((r) => setTimeout(r, 400));
    expect(requestLog).toEqual([]);
  });

  it.each(['computer-stopped', 'computer-expired'])('%s: says so and never asks the VM program', async (state) => {
    await renderPage(page, { state });
    const key = state === 'computer-stopped' ? 'st.stopped' : 'st.expired';
    expect(await screen.findByText(say(key, { name: 'atlas' }), undefined, WAIT)).toBeInTheDocument();
    expect(screen.getByText(say(state === 'computer-stopped' ? 'blocked.stopped.title' : 'blocked.expired.title', { name: 'atlas' }))).toBeInTheDocument();
    expect(document.querySelector('#vms-blocked')).not.toBeNull();
    await new Promise((r) => setTimeout(r, 400));
    expect(requestLog).toEqual([]);
  });

  it('no computer picked: the shared "pick a computer" state, nothing asked', async () => {
    await renderPage(page, { computer: false });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: strings.title })).toBeInTheDocument(), WAIT);
    expect(screen.queryByText(strings['host.title'])).toBeNull();
    await new Promise((r) => setTimeout(r, 400));
    expect(requestLog).toEqual([]);
  });

  it('a server kind that is not known claims nothing: the Server row says not known and why, and the VMs are read', async () => {
    await renderPage(page, { state: 'kind-not-known' });
    expect(await screen.findByText(strings['host.note.kindUnknown'], undefined, WAIT)).toBeInTheDocument();
    expect(screen.getByText(strings['host.server.unknown'])).toBeInTheDocument();
    expect(screen.queryByText(strings['host.server.shared'])).toBeNull();
    expect(screen.queryByText(strings['host.server.bare'])).toBeNull();
    expect(await screen.findByText('web-1', undefined, WAIT)).toBeInTheDocument();
  });

  it('KVM off: the list still loads and the switch row itself says nothing can start, with no second KVM fact', async () => {
    await renderPage(page, { state: 'kvm-off' });
    const kvm = await screen.findByRole('switch', { name: strings['kvm.switch'] }, WAIT);
    expect(kvm).not.toBeChecked();
    // The consequence is the switch's own description, not a loose line under the card.
    expect(kvm).toHaveAccessibleDescription(strings['host.note.kvmOff']);
    // Nothing repeats the switch.
    // (The read-only KVM row says the switch's own words, so the switch's label is the only line with them.)
    expect(screen.getAllByText(strings['host.kvm'])).toHaveLength(1);
    expect(within(document.querySelector('#vms-computer') as HTMLElement).queryByText(strings['host.kvm.off'])).toBeNull();
    expect(await screen.findByText('win11', undefined, WAIT)).toBeInTheDocument();
  });

  it('KVM on and not usable inside: says so', async () => {
    await renderPage(page, { state: 'kvm-not-inside' });
    expect(await screen.findByText(strings['host.note.notInside'], undefined, WAIT)).toBeInTheDocument();
    const kvm = screen.queryByRole('switch', { name: strings['kvm.switch'] });
    // With the switch the row's help says it; without one the same row shows the state as its value.
    if (kvm) expect(kvm).toHaveAccessibleDescription(strings['host.note.notInside']);
    else expect(screen.getByText(strings['host.kvm.notInside'])).toBeInTheDocument();
  });

  it('the VM program does not answer: one state with Check again, no VM list, and no claim that there are none', async () => {
    await renderPage(page, { state: 'unreachable' });
    expect(await screen.findByText(say('st.unreachable', { name: 'atlas' }), undefined, WAIT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['st.check'] })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(say('list.empty.title', { name: 'atlas' }))).toBeNull();
    expect(screen.getByText(strings['host.server.bare'])).toBeInTheDocument();
    // The page does not end under "This computer": the list's place says what to do next, with its own Check again.
    const blocked = document.querySelector('#vms-blocked') as HTMLElement;
    expect(blocked).not.toBeNull();
    expect(within(blocked).getByText(say('blocked.unreachable.title', { name: 'atlas' }))).toBeInTheDocument();
    expect(within(blocked).getByText(say('blocked.unreachable.body', { name: 'atlas' }))).toBeInTheDocument();
    const before = asked('caps');
    // The state's own action, inside the section: Check again, named for what it checks.
    await userEvent.click(within(blocked).getByRole('button', { name: strings['blocked.check.name'] }));
    await waitFor(() => expect(asked('caps')).toBeGreaterThan(before), WAIT);
    // A program that does not answer what it can do is not asked for its VMs.
    await new Promise((r) => setTimeout(r, 400));
    expect(asked('vms')).toBe(0);
    expect(asked('vm')).toBe(0);
  });

  it('the VM program does not answer, Images view: the same next step where the images would be', async () => {
    await renderPage(page, { state: 'unreachable', path: '/vms?view=images' });
    expect(await screen.findByText(say('blocked.images.unreachable.title', { name: 'atlas' }), undefined, WAIT)).toBeInTheDocument();
    expect(document.querySelector('#vms-images-blocked')).not.toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('no VMs: the empty state, by name, with New VM beside its words', async () => {
    await renderPage(page, { state: 'empty' });
    expect(await screen.findByText(say('list.empty.title', { name: 'atlas' }), undefined, WAIT)).toBeInTheDocument();
    // The empty list carries New VM itself (the header's is far above it); it opens the same drawer.
    const list = document.querySelector('#vms-list') as HTMLElement;
    await userEvent.click(within(list).getByRole('button', { name: strings['create.open'] }));
    expect(await screen.findByRole('dialog', { name: say('create.title', { name: 'atlas' }) }, WAIT)).toBeInTheDocument();
  });

  it('the list read fails: a failure with Try again, never "no VMs"', async () => {
    await renderPage(page, { state: 'error' });
    await screen.findByText(strings['host.server.bare'], undefined, WAIT);
    await waitFor(() => expect(asked('vms')).toBeGreaterThan(0), WAIT);
    await waitFor(() => expect(document.querySelector('#vms-list')?.getAttribute('data-hub-state')).toBe('failed'), WAIT);
    expect(screen.queryByText(say('list.empty.title', { name: 'atlas' }))).toBeNull();
    // No VM is read one by one while the list read failed.
    expect(asked('vm')).toBe(0);
  });

  it('a list read that fails is asked again at the slow pace, even while a kept row is still starting', async () => {
    await renderPage(page, { state: 'list-fails-later' });
    // The first answer holds a starting VM, so the next read comes at the fast pace; that one fails.
    await screen.findByText('cache', undefined, WAIT);
    await waitFor(() => expect(asked('vms')).toBe(2), { timeout: POLL_FAST_MS + 5000 });
    // Two more fast intervals: a read that kept the fast pace would have asked again, twice.
    await new Promise((r) => setTimeout(r, 2 * POLL_FAST_MS + 1000));
    expect(asked('vms')).toBe(2);
    expect(POLL_SLOW_MS).toBeGreaterThan(3 * POLL_FAST_MS);
  }, 30_000);
});

describe("one VM's screen", () => {
  it('reads that VM and shows its settings', async () => {
    await renderPage(page, { path: '/vms/web-1' });
    expect(await screen.findByRole('heading', { level: 1, name: 'web-1' }, WAIT)).toBeInTheDocument();
    expect(await screen.findByText(strings['vm.fact.memory'], undefined, WAIT)).toBeInTheDocument();
    expect(screen.getAllByText(strings['state.running']).length).toBeGreaterThan(0);
    expect(requestLog.filter((r) => r.route === 'vm').every((r) => r.path.endsWith('/vms/web-1'))).toBe(true);
    expect(asked('vm')).toBeGreaterThan(0);
  });

  it('a VM whose run failed shows the problem it carries', async () => {
    await renderPage(page, { path: '/vms/batch' });
    expect(await screen.findByText(`Last problem: ${strings['power.code.MemoryExceedsCgroup']}`, undefined, WAIT)).toBeInTheDocument();
    // The page's own words, never the sentence the VM program recorded.
    expect(screen.queryByText(/33024 MiB/)).toBeNull();
    expect(screen.getAllByText(strings['state.runFailed']).length).toBeGreaterThan(0);
  });

  it('a create that failed is "not created", with its reason and no settings', async () => {
    await renderPage(page, { path: '/vms/import-1' });
    expect(await screen.findByText(`Last problem: ${strings['power.code.InsufficientSpace']}`, undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(/the disk needs/)).toBeNull();
    expect(screen.getAllByText(strings['state.createFailed']).length).toBeGreaterThan(0);
    expect(screen.getByText(strings['vm.note.createFailed'])).toBeInTheDocument();
    expect(screen.queryByText(strings['vm.fact.memory'])).toBeNull();
  });

  it('a name no VM has: says so, by name', async () => {
    await renderPage(page, { path: '/vms/nope' });
    expect(await screen.findByText(say('vm.missing.title', { vm: 'nope', name: 'atlas' }), undefined, WAIT)).toBeInTheDocument();
  });

  it('an address that is no VM name is never sent to the computer, nor shown as a title', async () => {
    await renderPage(page, { path: '/vms/Not_A_Name' });
    expect(await screen.findByText(strings['vm.badName.title'], undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Not_A_Name' })).toBeNull();
    await new Promise((r) => setTimeout(r, 400));
    expect(asked('vm')).toBe(0);
  });

  it('on a shared server: the same sentence as the list, and the VM is never asked for', async () => {
    await renderPage(page, { state: 'shared', path: '/vms/web-1' });
    expect(await screen.findByText(say('st.shared', { name: 'atlas' }), undefined, WAIT)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 400));
    expect(requestLog).toEqual([]);
  });

  it('an address deeper than a VM names no screen', async () => {
    await renderPage(page, { path: '/vms/web-1/extra' });
    expect(await screen.findByText(strings['st.noScreen.title'], undefined, WAIT)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 400));
    expect(asked('vm')).toBe(0);
  });
});
