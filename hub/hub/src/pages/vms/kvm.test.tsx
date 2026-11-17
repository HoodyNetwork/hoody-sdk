// Vitest: the KVM switch over its fixture states. A stopped computer's switch acts at once, a running one asks to stop it
// first (and never chains into the KVM change), turning off is confirmed, a lost or timed-out answer is held under the
// computer's lifecycle lock until a read proves it, and each definite refusal reads in the page's words. The "KVM on
// computers" view runs the same flow for any computer.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { computerLifecycle, computersList, fixtureWorld, heldChanges, lifecycleLock } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
// fixtures.ts first: it imports fixtures.kvm and calls its states(), so it must start the cycle.
import './fixtures';
import { changeKvmComputer, kvmLog, lifecycleLog, resetKvmFixtures } from './fixtures.kvm';
import page from './page';
import strings from './strings.en.json';

const WAIT = { timeout: 10000 };
const say = (key: keyof typeof strings, vars: Record<string, string | number> = {}): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), strings[key]);
const ATLAS = fixtureWorld.current.id;
const atlas = { name: 'atlas' };
const theSwitch = () => screen.findByRole('switch', { name: strings['kvm.switch'] }, WAIT);

beforeEach(() => {
  resetKvmFixtures();
  kvmLog.length = 0;
  lifecycleLog.length = 0;
});

describe('This computer: the switch', () => {
  it('stopped with KVM off: one press turns it on, then Start computer is offered and never pressed for the person', async () => {
    await renderPage(page, { state: 'kvm-stopped' });
    const sw = await theSwitch();
    expect(sw).not.toBeChecked();
    await userEvent.click(sw);
    await waitFor(() => expect(kvmLog).toEqual([{ id: ATLAS, kvm: true }]), WAIT);
    expect(await screen.findByText(say('kvm.done.on', atlas), undefined, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('switch', { name: strings['kvm.switch'] })).toBeChecked(), WAIT);
    expect(lifecycleLog).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: strings['kvm.start'] }));
    await waitFor(() => expect(lifecycleLog).toEqual([{ id: ATLAS, op: 'start' }]), WAIT);
    expect(kvmLog).toHaveLength(1);
  });

  it('running: asks to stop first, sends only the stop, then waits for the person to press the switch again', async () => {
    await renderPage(page, { state: 'kvm-running' });
    await userEvent.click(await theSwitch());
    const dialog = await screen.findByRole('alertdialog', { name: say('kvm.ask.stopOn.title', atlas) }, WAIT).catch(() => screen.findByRole('dialog', { name: say('kvm.ask.stopOn.title', atlas) }, WAIT));
    expect(kvmLog).toEqual([]);
    expect(lifecycleLog).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['kvm.ask.stop.go'] }));
    await waitFor(() => expect(lifecycleLog).toEqual([{ id: ATLAS, op: 'stop' }]), WAIT);
    expect(await screen.findByText(say('kvm.next.on', atlas), undefined, WAIT)).toBeInTheDocument();
    // No chain: the stop never sends the KVM change by itself.
    await new Promise((r) => setTimeout(r, 300));
    expect(kvmLog).toEqual([]);
    await userEvent.click(await theSwitch());
    await waitFor(() => expect(kvmLog).toEqual([{ id: ATLAS, kvm: true }]), WAIT);
  });

  it('the stop dialog judges the computer again at confirm: one that moved on while it was open gets nothing sent', async () => {
    await renderPage(page, { state: 'kvm-running' });
    await userEvent.click(await theSwitch());
    const dialog = await screen.findByRole('alertdialog', { name: say('kvm.ask.stopOn.title', atlas) }, WAIT).catch(() => screen.findByRole('dialog', { name: say('kvm.ask.stopOn.title', atlas) }, WAIT));
    // Elsewhere, the computer was stopped and KVM turned on; the list reads it.
    changeKvmComputer(ATLAS, { status: 'stopped', kvm: true });
    await computersList.invalidate();
    await waitFor(() => expect(screen.getByRole('switch', { name: strings['kvm.switch'] })).toBeChecked(), WAIT);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['kvm.ask.stop.go'] }));
    await waitFor(() => expect(screen.queryByText(say('kvm.ask.stopOn.title', atlas))).toBeNull(), WAIT);
    expect(lifecycleLog).toEqual([]);
    expect(kvmLog).toEqual([]);
  });

  it('turning off answered by a 403 with no code: words that cover both the right and holding the server', async () => {
    await renderPage(page, { state: 'kvm-forbidden-off' });
    await userEvent.click(await theSwitch());
    await userEvent.click(await screen.findByRole('button', { name: strings['kvm.ask.off.go'] }, WAIT));
    expect(await screen.findByText(strings['kvm.err.forbidden'], undefined, WAIT)).toBeInTheDocument();
    expect(strings['kvm.err.forbidden']).toMatch(/owner/);
    expect(strings['kvm.err.forbidden']).toMatch(/hold its server/);
    expect(heldChanges(lifecycleLock.lock)).toEqual([]);
  });

  it('turning off a stopped computer is confirmed first; cancel sends nothing', async () => {
    await renderPage(page, { state: 'kvm-stopped-on' });
    const sw = await theSwitch();
    expect(sw).toBeChecked();
    await userEvent.click(sw);
    const title = say('kvm.ask.off.title', atlas);
    expect(await screen.findByText(title, undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByText(title)).toBeNull(), WAIT);
    expect(kvmLog).toEqual([]);
    await userEvent.click(await theSwitch());
    await userEvent.click(await screen.findByRole('button', { name: strings['kvm.ask.off.go'] }, WAIT));
    await waitFor(() => expect(kvmLog).toEqual([{ id: ATLAS, kvm: false }]), WAIT);
  });

  it('a lost answer is held: never sent again, the lifecycle lock refuses a start, and a read that shows the old value proves nothing', async () => {
    await renderPage(page, { state: 'kvm-lost' });
    await userEvent.click(await theSwitch());
    expect(await screen.findByText(say('kvm.held.on', atlas), undefined, WAIT)).toBeInTheDocument();
    expect(heldChanges(lifecycleLock.lock).map((h) => h.identity)).toEqual([{ computer: ATLAS, op: 'kvm', kvm: true }]);
    // The switch is off-limits while held; pressing it sends nothing.
    const sw = await theSwitch();
    expect(sw).toBeDisabled();
    // The lock is the computer's lifecycle lock: another page's start of atlas is refused unsent.
    const start = await computerLifecycle.forPage('computers').run({ id: ATLAS, op: 'start' });
    expect(start.outcome).toBe('not_sent');
    expect(lifecycleLog).toEqual([]);
    // Check again reads; the row still says off, so it stays held.
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByText(say('kvm.held.on', atlas))).toBeInTheDocument();
    expect(kvmLog).toHaveLength(1);
  });

  it('a lost answer that did arrive: Check again proves it from the list and frees the computer', async () => {
    await renderPage(page, { state: 'kvm-lost-applied' });
    await userEvent.click(await theSwitch());
    expect(await screen.findByText(say('kvm.held.on', atlas), undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(screen.queryByText(say('kvm.held.on', atlas))).toBeNull(), WAIT);
    expect(heldChanges(lifecycleLock.lock)).toEqual([]);
    await waitFor(() => expect(screen.getByRole('switch', { name: strings['kvm.switch'] })).toBeChecked(), WAIT);
    expect(kvmLog).toHaveLength(1);
  });

  it('KVM_CHANGE_TIMED_OUT is held, never shown as refused', async () => {
    await renderPage(page, { state: 'kvm-timeout' });
    await userEvent.click(await theSwitch());
    expect(await screen.findByText(say('kvm.held.on', atlas), undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(say('kvm.out.on', atlas))).toBeNull();
  });

  it.each([
    ['kvm-refused', 'kvm.err.notAvailable'],
    ['kvm-forbidden', 'kvm.err.forbiddenOn'],
  ] as const)('%s: a definite refusal in the page words, nothing held, the switch free again', async (state, words) => {
    await renderPage(page, { state });
    await userEvent.click(await theSwitch());
    expect(await screen.findByText(strings[words], undefined, WAIT)).toBeInTheDocument();
    expect(screen.getByText(say('kvm.out.on', atlas))).toBeInTheDocument();
    expect(heldChanges(lifecycleLock.lock)).toEqual([]);
    expect(await theSwitch()).not.toBeDisabled();
  });

  it.each([
    ['shared', 'kvm.why.shared'],
    ['server-no', 'kvm.why.notAllowed'],
  ] as const)('%s: turning on is refused here with the reason, and nothing is sent', async (state, why) => {
    await renderPage(page, { state });
    expect(await screen.findByText(strings[why], undefined, WAIT)).toBeInTheDocument();
    expect(await theSwitch()).toBeDisabled();
  });

  it('expired with KVM on: turning off is still offered', async () => {
    await renderPage(page, { state: 'computer-expired' });
    const sw = await theSwitch();
    expect(sw).toBeChecked();
    expect(sw).not.toBeDisabled();
  });

  it('a server that was not checked: the switch is offered and the API decides', async () => {
    await renderPage(page, { state: 'server-unchecked' });
    expect(await theSwitch()).not.toBeDisabled();
  });
});

describe('KVM on computers', () => {
  it('lists every computer with what it can do (All realms: every realm\'s computers): on, off, not possible', async () => {
    await renderPage(page, { state: 'kvm-tab', path: '/vms?view=kvm', realm: 'all' });
    const table = await screen.findByRole('table', { name: strings['kvm.tab.label'] }, WAIT);
    const row = (name: string) => within(table).getByText(name).closest('tr') as HTMLElement;
    await within(table).findByText('cedar', undefined, WAIT);
    expect(within(row('atlas')).getByText(strings['kvm.pill.on'])).toBeInTheDocument();
    expect(within(row('granite')).getByText(strings['kvm.pill.on'])).toBeInTheDocument();
    expect(within(row('cedar')).getByText(strings['kvm.pill.off'])).toBeInTheDocument();
    expect(within(row('cedar')).getByRole('button', { name: say('kvm.tab.onFor', { name: 'cedar' }) })).toBeInTheDocument();
    expect(within(row('harbor')).getByText(strings['kvm.pill.no.shared'])).toBeInTheDocument();
    expect(within(row('harbor')).queryByRole('button', { name: say('kvm.tab.onFor', { name: 'harbor' }) })).toBeNull();
    expect(within(row('atlas')).getByRole('button', { name: say('kvm.tab.openFor', atlas) })).toBeInTheDocument();
    // The VMs list is not drawn in this view.
    expect(screen.queryByText(strings['host.title'])).toBeNull();
  });

  it("a row's Turn on KVM runs the flow for that computer: a stopped one changes at once", async () => {
    await renderPage(page, { state: 'kvm-tab', path: '/vms?view=kvm' });
    const table = await screen.findByRole('table', { name: strings['kvm.tab.label'] }, WAIT);
    await userEvent.click(await within(table).findByRole('button', { name: say('kvm.tab.onFor', { name: 'cedar' }) }, WAIT));
    const cedar = fixtureWorld.computer('cedar').id;
    await waitFor(() => expect(kvmLog).toEqual([{ id: cedar, kvm: true }]), WAIT);
    await waitFor(() => expect(within(within(table).getByText('cedar').closest('tr') as HTMLElement).getByText(strings['kvm.pill.on'])).toBeInTheDocument(), WAIT);
  });
});
