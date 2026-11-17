// Vitest: a VM's Ports, Settings and Storage tabs over their fixture states. Changes need a stopped VM and
// say so first; only changed fields are sent, each change once; the program's bounds are checked before sending; a
// definite refusal is shown in the page's words; a lost answer is held under the VM's one change lock and only a read
// of the same VM (or Stop tracking) frees it; a disc swapped in place is proved by no read; a framed Hub sends nothing.
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { heldChanges } from '@core';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// fixtures.ts first: it imports the VM fixture files and calls their states().
import './fixtures';
import { VM_LOCK } from './changes';
import { changeLog, resetChangeFixtures } from './fixtures.ports';
import { settingsVms, slowRead } from './fixtures.settings';
import { vmQ } from './data';
import page from './page';
import strings from './strings.en.json';

const mocked = vi.hoisted(() => ({ framed: false }));
vi.mock('@core', async (orig) => ({ ...(await orig<Record<string, unknown>>()), isFramed: () => mocked.framed }));

vi.setConfig({ testTimeout: 45000 });
const WAIT = { timeout: 10000 };
const say = (key: keyof typeof strings, vars: Record<string, string | number> = {}): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), strings[key]);
const pause = (ms = 400) => new Promise((r) => setTimeout(r, ms));
const button = (name: string | RegExp) => screen.findByRole('button', { name }, WAIT);
const held = () => heldChanges(VM_LOCK).map((h) => h.identity as Record<string, unknown>);
const drawer = (name: string) => screen.findByRole('dialog', { name }, WAIT);
/** The editor's footer line: the one element carrying the outcome the footer shows. */
const footerOf = (d: HTMLElement): HTMLElement => {
  const f = d.querySelector<HTMLElement>('[data-outcome="failed"]');
  if (!f) throw new Error('no failed footer');
  return f;
};
async function typeInto(el: HTMLElement, text: string) {
  await userEvent.clear(el);
  await userEvent.type(el, text);
  await userEvent.tab();
}
async function stopTracking() {
  await userEvent.click(await button(/stop tracking/i));
  const q = await screen.findByRole('alertdialog', undefined, WAIT);
  await userEvent.click(within(q).getAllByRole('button').find((b) => /stop tracking/i.test(b.textContent ?? ''))!);
  await waitFor(() => expect(held()).toEqual([]), WAIT);
}

beforeAll(async () => { await import('./view'); }, 180000);
beforeEach(() => {
  resetChangeFixtures();
  slowRead.on = false;
  mocked.framed = false;
});

// ── Ports ────────────────────────────────────────────────────────────────────────────

async function openPorts(state: string, add: { guest: string; host?: string }) {
  await renderPage(page, { state, path: '/vms/win11?tab=ports' });
  await userEvent.click(await button(strings['ports.open']));
  const d = await drawer(say('ports.drawer.title', { vm: 'win11' }));
  await userEvent.click(within(d).getByRole('button', { name: strings['ports.add'] }));
  await typeInto(within(d).getByRole('textbox', { name: say('ports.row.guest', { n: 1 }) }), add.guest);
  if (add.host !== undefined) await typeInto(within(d).getByRole('textbox', { name: say('ports.row.host', { n: 1 }) }), add.host);
  return d;
}
const savePorts = (d: HTMLElement) => userEvent.click(within(d).getByRole('button', { name: strings['ports.save'] }));

describe('Ports', () => {
  it('a running VM: its ports with a web link for tcp; editing says shut down first and opens nothing', async () => {
    await renderPage(page, { path: '/vms/web-1?tab=ports' });
    const table = await screen.findByRole('table', { name: say('ports.label', { vm: 'web-1' }) }, WAIT);
    expect(within(table).getByText('8080')).toBeInTheDocument();
    expect(within(table).getByText('2222')).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: say('ports.openLink', { port: 8080 }) })).toBeInTheDocument();
    const edit = await button(strings['ports.edit']);
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(edit);
    await pause();
    expect(screen.queryByRole('dialog', { name: say('ports.drawer.title', { vm: 'web-1' }) })).toBeNull();
    expect(changeLog).toEqual([]);
  });

  it('saving sends the whole list and nothing else, once; the next read shows it', async () => {
    const d = await openPorts('ports-saved', { guest: '8000' });
    // The port on the computer starts as the VM's port when the VM may take it there.
    expect(within(d).getByRole('textbox', { name: say('ports.row.host', { n: 1 }) })).toHaveValue('8000');
    // The row reads as the table does: the computer's port, then the VM's.
    const fields = within(d).getAllByRole('textbox').map((f) => f.getAttribute('aria-label'));
    expect(fields.indexOf(say('ports.row.host', { n: 1 }))).toBeLessThan(fields.indexOf(say('ports.row.guest', { n: 1 })));
    await savePorts(d);
    await waitFor(() => expect(changeLog).toHaveLength(1), WAIT);
    expect(changeLog[0]).toMatchObject({ route: 'update', body: { ports: [{ proto: 'tcp', host: 8000, guest: 8000 }] } });
    expect(Object.keys(changeLog[0]!.body as object)).toEqual(['ports']);
    expect(await screen.findByText(strings['ports.saved'], undefined, WAIT)).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: say('ports.label', { vm: 'win11' }) }, WAIT);
    // Both columns read 8000: the port on the computer and in the VM.
    expect(await within(table).findAllByText('8000', undefined, WAIT)).toHaveLength(2);
    expect(held()).toEqual([]);
  });

  it('a port below the computer\'s floor is refused on its row before anything is sent', async () => {
    const d = await openPorts('ports-saved', { guest: '80', host: '80' });
    await savePorts(d);
    expect(await within(d).findByText(say('ports.err.belowFloor', { floor: 1024 }), undefined, WAIT)).toBeInTheDocument();
    await pause();
    expect(changeLog).toEqual([]);
  });

  it('ports-conflict: the row names the VM holding the port; refused, nothing held', async () => {
    const d = await openPorts('ports-conflict', { guest: '80', host: '8080' });
    await savePorts(d);
    expect(await within(d).findByText(say('ports.conflict', { port: 8080, proto: strings['ports.tcp'], holder: 'web-1' }), undefined, WAIT)).toBeInTheDocument();
    expect(footerOf(d)).toHaveTextContent(strings['settings.chg.refused.PortForwardConflict']);
    expect(within(footerOf(d)).getByRole('button', { name: 'Details' })).toBeInTheDocument();
    expect(changeLog).toHaveLength(1);
    expect(held()).toEqual([]);
  });

  it('ports-conflict: after the row is changed the refusal still reads in the footer, with Details', async () => {
    const d = await openPorts('ports-conflict', { guest: '80', host: '8080' });
    await savePorts(d);
    const row = say('ports.conflict', { port: 8080, proto: strings['ports.tcp'], holder: 'web-1' });
    expect(await within(d).findByText(row, undefined, WAIT)).toBeInTheDocument();
    await typeInto(within(d).getByRole('textbox', { name: say('ports.row.host', { n: 1 }) }), '8081');
    await waitFor(() => expect(within(d).queryByText(row)).toBeNull(), WAIT);
    expect(footerOf(d)).toHaveTextContent(strings['settings.chg.refused.PortForwardConflict']);
    expect(within(footerOf(d)).getByRole('button', { name: 'Details' })).toBeInTheDocument();
    expect(changeLog).toHaveLength(1);
  });

  it('ports-busy: a refusal reads in the editor\'s footer in the page\'s words, with Details; the computer\'s facts stay', async () => {
    const d = await openPorts('ports-busy', { guest: '80', host: '8080' });
    await savePorts(d);
    const words = strings['settings.chg.refused.OperationInProgress'];
    await waitFor(() => expect(footerOf(d)).toHaveTextContent(words), WAIT);
    expect(within(footerOf(d)).getByRole('button', { name: 'Details' })).toBeInTheDocument();
    expect(within(d).getAllByText(words)).toHaveLength(1);
    expect(within(d).getByText(say('ports.floor', { floor: 1024 }))).toBeInTheDocument();
    expect(changeLog).toHaveLength(1);
    expect(held()).toEqual([]);
  });

  it('ports-held: a lost answer is held, never sent again; Check again proves nothing; only Stop tracking frees the VM', async () => {
    const d = await openPorts('ports-held', { guest: '2222' });
    await savePorts(d);
    const text = say('settings.chg.held.ports', { vm: 'win11' });
    expect(await screen.findByText(text, undefined, WAIT)).toBeInTheDocument();
    expect(held()).toHaveLength(1);
    expect(held()[0]).toMatchObject({ name: 'win11', op: 'ports' });
    expect(screen.queryByText(strings['ports.saved'])).toBeNull();
    expect(await button(strings['ports.open'])).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await pause(800);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(changeLog).toHaveLength(1);
    await stopTracking();
    expect(await button(strings['ports.open'])).not.toHaveAttribute('aria-disabled', 'true');
    expect(changeLog).toHaveLength(1);
  });

  it('ports-held-made: Check again reads the same VM, finds the new list and frees it', async () => {
    const d = await openPorts('ports-held-made', { guest: '2222' });
    await savePorts(d);
    expect(await screen.findByText(say('settings.chg.held.ports', { vm: 'win11' }), undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(held()).toEqual([]), WAIT);
    expect(changeLog).toHaveLength(1);
  });
});

// ── Settings ─────────────────────────────────────────────────────────────────────────

async function editCpus(state: string, value: string) {
  await renderPage(page, { state, path: '/vms/win11?tab=settings' });
  await typeInto(await screen.findByRole('textbox', { name: strings['settings.cpus'] }, WAIT), value);
  await userEvent.click(await button(strings['settings.save']));
}

describe('Settings', () => {
  it('a running VM: says to shut it down, before anything is typed; the fields are locked', async () => {
    await renderPage(page, { path: '/vms/web-1?tab=settings' });
    expect(await screen.findByText(strings['settings.chg.why.notStopped'], undefined, WAIT)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: strings['settings.cpus'] })).toBeDisabled();
  });

  it('settings-saved: only the changed field is sent, once, and "Saved" shows', async () => {
    await editCpus('settings-saved', '4');
    await waitFor(() => expect(changeLog).toHaveLength(1), WAIT);
    expect(changeLog[0]!.body).toEqual({ vcpus: 4 });
    expect(await screen.findByText(strings['settings.saved'], undefined, WAIT)).toBeInTheDocument();
    expect(held()).toEqual([]);
  });

  it('the program\'s bounds are checked first: nothing is sent', async () => {
    await editCpus('settings-saved', '5000');
    expect(await screen.findByText(strings['settings.err.vcpus'], undefined, WAIT)).toBeInTheDocument();
    await pause();
    expect(changeLog).toEqual([]);
  });

  it('settings-refused: the refusal in the page\'s words; nothing held, the form still as typed', async () => {
    await editCpus('settings-refused', '4');
    expect(await screen.findByText(strings['settings.chg.refused.OperationInProgress'], undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(strings['settings.saved'])).toBeNull();
    expect(held()).toEqual([]);
    expect(screen.getByRole('textbox', { name: strings['settings.cpus'] })).toHaveValue('4');
  });

  it('settings-held: held, not "Saved", never sent again; Stop tracking frees it', async () => {
    await editCpus('settings-held', '4');
    const text = say('settings.chg.held.settings', { vm: 'win11' });
    expect(await screen.findByText(text, undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(strings['settings.saved'])).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await pause(800);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(changeLog).toHaveLength(1);
    await stopTracking();
  });

  it('settings-held-made: Check again proves it from the same VM\'s fresh read', async () => {
    await editCpus('settings-held-made', '4');
    expect(await screen.findByText(say('settings.chg.held.settings', { vm: 'win11' }), undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(held()).toEqual([]), WAIT);
  });

  it('a field changed elsewhere after the tab opened follows the read; Save sends only what the person changed', async () => {
    await renderPage(page, { state: 'settings-saved', path: '/vms/win11?tab=settings' });
    const memory = await screen.findByRole('textbox', { name: strings['settings.memory'] }, WAIT);
    expect(memory).toHaveValue('4');
    // Another person gives the VM 8 GiB; the tab reads it again.
    const win = settingsVms.saved.find((v) => v.name === 'win11')!;
    (win.spec as Record<string, unknown>).memory_mib = 8192;
    await act(async () => { await vmQ.invalidate(); });
    await waitFor(() => expect(memory).toHaveValue('8'), WAIT);
    const auto = screen.getByRole('switch', { name: strings['settings.autostart'] });
    const was = (auto as HTMLInputElement).checked;
    await userEvent.click(auto);
    await userEvent.click(await button(strings['settings.save']));
    await waitFor(() => expect(changeLog).toHaveLength(1), WAIT);
    expect(changeLog[0]!.body).toEqual({ autostart: !was });
  });

  it('settings-held-made: Check again reads this VM alone; another VM\'s failing read does not keep it held', async () => {
    await renderPage(page, { state: 'settings-held-made', path: '/vms/win11?tab=settings' });
    await screen.findByRole('textbox', { name: strings['settings.cpus'] }, WAIT);
    // Another VM's read is on the page too, then that VM goes: its read now answers "not there".
    await act(async () => { await vmQ.fetch('web-1'); });
    const vms = settingsVms.madePending;
    vms.splice(vms.findIndex((v) => v.name === 'web-1'), 1);
    await typeInto(screen.getByRole('textbox', { name: strings['settings.cpus'] }), '4');
    await userEvent.click(await button(strings['settings.save']));
    expect(await screen.findByText(say('settings.chg.held.settings', { vm: 'win11' }), undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(held()).toEqual([]), WAIT);
    expect(changeLog).toHaveLength(1);
  });

  it('settings-held-slowread: Check again never takes an answer to a read asked before the change', async () => {
    await renderPage(page, { state: 'settings-held-slowread', path: '/vms/win11?tab=settings' });
    const cpus = await screen.findByRole('textbox', { name: strings['settings.cpus'] }, WAIT);
    // A slow read of the VM goes out before the change; its answer will show 4 CPUs.
    slowRead.on = true;
    const early = vmQ.fetch('win11').catch(() => null);
    await typeInto(cpus, '4');
    await userEvent.click(await button(strings['settings.save']));
    expect(await screen.findByText(say('settings.chg.held.settings', { vm: 'win11' }), undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await early;
    await pause(1500);
    expect(held()).toHaveLength(1);
    expect(changeLog).toHaveLength(1);
    await stopTracking();
  }, 60000);

  it('a framed Hub sends nothing: it says why first and Save stays off', async () => {
    mocked.framed = true;
    await renderPage(page, { state: 'settings-saved', path: '/vms/win11?tab=settings' });
    expect(await screen.findByText(strings['settings.chg.why.framed'], undefined, WAIT)).toBeInTheDocument();
    expect(await button(strings['settings.save'])).toBeDisabled();
    expect(changeLog).toEqual([]);
  });
});

// ── Storage ──────────────────────────────────────────────────────────────────────────

describe('Storage', () => {
  it('a bigger disk is sent alone and once', async () => {
    await renderPage(page, { state: 'storage-saved', path: '/vms/win11?tab=storage' });
    await userEvent.click(await button(strings['storage.grow']));
    const d = await drawer(say('storage.grow.title', { vm: 'win11' }));
    await typeInto(within(d).getByRole('textbox', { name: strings['storage.grow.size'] }), '100');
    await userEvent.click(within(d).getByRole('button', { name: strings['storage.grow.go'] }));
    await waitFor(() => expect(changeLog).toHaveLength(1), WAIT);
    expect(changeLog[0]!.body).toEqual({ disk_gib: 100 });
    expect(await screen.findByText(strings['settings.chg.done'], undefined, WAIT)).toBeInTheDocument();
  });

  it('storage-busy: a refused bigger disk reads in the editor\'s footer in the page\'s words, with Details', async () => {
    await renderPage(page, { state: 'storage-busy', path: '/vms/win11?tab=storage' });
    await userEvent.click(await button(strings['storage.grow']));
    const d = await drawer(say('storage.grow.title', { vm: 'win11' }));
    await typeInto(within(d).getByRole('textbox', { name: strings['storage.grow.size'] }), '100');
    await userEvent.click(within(d).getByRole('button', { name: strings['storage.grow.go'] }));
    const words = strings['settings.chg.refused.OperationInProgress'];
    await waitFor(() => expect(footerOf(d)).toHaveTextContent(words), WAIT);
    expect(within(footerOf(d)).getByRole('button', { name: 'Details' })).toBeInTheDocument();
    expect(within(d).getAllByText(words)).toHaveLength(1);
    expect(changeLog).toHaveLength(1);
    expect(held()).toEqual([]);
  });

  it('a smaller disk is refused before sending', async () => {
    await renderPage(page, { state: 'storage-saved', path: '/vms/win11?tab=storage' });
    await userEvent.click(await button(strings['storage.grow']));
    const d = await drawer(say('storage.grow.title', { vm: 'win11' }));
    await typeInto(within(d).getByRole('textbox', { name: strings['storage.grow.size'] }), '10');
    await userEvent.click(within(d).getByRole('button', { name: strings['storage.grow.go'] }));
    expect(await within(d).findByText(/Use more than/, undefined, WAIT)).toBeInTheDocument();
    await pause();
    expect(changeLog).toEqual([]);
  });

  it('storage-full-held: not enough disk comes back as a 5xx, so it is held, with the computer\'s reason', async () => {
    await renderPage(page, { state: 'storage-full-held', path: '/vms/win11?tab=storage' });
    await userEvent.click(await button(strings['storage.grow']));
    const d = await drawer(say('storage.grow.title', { vm: 'win11' }));
    await typeInto(within(d).getByRole('textbox', { name: strings['storage.grow.size'] }), '200');
    await userEvent.click(within(d).getByRole('button', { name: strings['storage.grow.go'] }));
    const text = `${say('settings.chg.held.disk', { vm: 'win11' })} ${strings['settings.chg.held.InsufficientSpace']}`;
    expect(await screen.findByText(text, undefined, WAIT)).toBeInTheDocument();
    expect(changeLog).toHaveLength(1);
    await stopTracking();
  });

  it('a stopped VM: ejecting asks first, then sends the drive list with that drive empty and the others in place', async () => {
    await renderPage(page, { state: 'storage-saved', path: '/vms/win11?tab=storage' });
    const table = await screen.findByRole('table', { name: say('storage.discs.label', { vm: 'win11' }) }, WAIT);
    // Both discs and the next empty drive.
    expect(within(table).getByText(say('storage.slot', { n: 3 }))).toBeInTheDocument();
    const row = within(table).getByText(say('storage.slot', { n: 1 })).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /row actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['storage.disc.eject']}`) }, WAIT));
    const q = await screen.findByRole('alertdialog', { name: say('storage.disc.ejectTitle', { n: 1, vm: 'win11' }) }, WAIT).catch(() => screen.findByRole('dialog', { name: say('storage.disc.ejectTitle', { n: 1, vm: 'win11' }) }, WAIT));
    expect(within(q).getByText(strings['storage.disc.ejectBodyStopped'])).toBeInTheDocument();
    await userEvent.click(within(q).getByRole('button', { name: strings['storage.disc.eject'] }));
    await waitFor(() => expect(changeLog).toHaveLength(1), WAIT);
    expect(changeLog[0]!.body).toEqual({ cdroms: [null, '/usr/share/virtio-win/virtio-win.iso'] });
  });

  it('storage-live-held: a disc swapped in place stays held after Check again (no read proves it); sent once', async () => {
    await renderPage(page, { state: 'storage-live-held', path: '/vms/web-1?tab=storage' });
    await userEvent.click(await button(new RegExp(`^${strings['storage.disc.change']}`)));
    const d = await drawer(say('storage.disc.title', { n: 1, vm: 'web-1' }));
    expect(within(d).getByText(strings['storage.disc.subtitleLive'])).toBeInTheDocument();
    await typeInto(within(d).getByRole('textbox', { name: strings['storage.disc.path'] }), '/isos/new.iso');
    await userEvent.click(within(d).getByRole('button', { name: strings['storage.disc.go'] }));
    const text = say('settings.chg.held.swap', { vm: 'web-1' });
    expect(await screen.findByText(text, undefined, WAIT)).toBeInTheDocument();
    expect(changeLog).toEqual([{ route: 'swap', path: expect.stringMatching(/\/vms\/web-1\/cdroms\/0$/), body: { source: '/isos/new.iso' } }]);
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await pause(800);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(held()).toHaveLength(1);
    await stopTracking();
    expect(changeLog).toHaveLength(1);
  });

  it('storage-live-held: an eject in place whose answer is lost is proved by the drive reading empty', async () => {
    await renderPage(page, { state: 'storage-live-held', path: '/vms/web-1?tab=storage' });
    const table = await screen.findByRole('table', { name: say('storage.discs.label', { vm: 'web-1' }) }, WAIT);
    const row = within(table).getByText(say('storage.slot', { n: 1 })).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /row actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['storage.disc.eject']}`) }, WAIT));
    const q = await screen.findByRole('alertdialog', undefined, WAIT).catch(() => screen.findByRole('dialog', undefined, WAIT));
    await userEvent.click(within(q).getByRole('button', { name: strings['storage.disc.eject'] }));
    expect(await screen.findByText(say('settings.chg.held.eject', { vm: 'web-1' }), undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(held()).toEqual([]), WAIT);
    expect(changeLog).toHaveLength(1);
  });

  it('storage-live-nodrive: a running VM\'s emptied drive is offered; the program\'s "no drive" refusal is said in the page\'s words, nothing held', async () => {
    await renderPage(page, { state: 'storage-live-nodrive', path: '/vms/web-1?tab=storage' });
    const table = await screen.findByRole('table', { name: say('storage.discs.label', { vm: 'web-1' }) }, WAIT);
    expect(within(table).getByText(say('storage.slot', { n: 1 }))).toBeInTheDocument();
    const insert = await button(new RegExp(`^${strings['storage.disc.insert']}`));
    expect(insert).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(insert);
    const d = await drawer(say('storage.disc.title', { n: 1, vm: 'web-1' }));
    await typeInto(within(d).getByRole('textbox', { name: strings['storage.disc.path'] }), '/isos/new.iso');
    await userEvent.click(within(d).getByRole('button', { name: strings['storage.disc.go'] }));
    await waitFor(() => expect(footerOf(d)).toHaveTextContent(strings['settings.chg.why.live.emptyAtStart']), WAIT);
    expect(within(footerOf(d)).getByRole('button', { name: 'Details' })).toBeInTheDocument();
    expect(within(d).getAllByText(strings['settings.chg.why.live.emptyAtStart'])).toHaveLength(1);
    expect(changeLog).toEqual([{ route: 'swap', path: expect.stringMatching(/\/vms\/web-1\/cdroms\/0$/), body: { source: '/isos/new.iso' } }]);
    expect(held()).toEqual([]);
  });

  it('a running VM offers no empty drive (a disc goes in only while stopped)', async () => {
    await renderPage(page, { state: 'storage-live', path: '/vms/web-1?tab=storage' });
    const table = await screen.findByRole('table', { name: say('storage.discs.label', { vm: 'web-1' }) }, WAIT);
    expect(within(table).getByText(say('storage.slot', { n: 1 }))).toBeInTheDocument();
    expect(within(table).queryByText(say('storage.slot', { n: 2 }))).toBeNull();
    expect(await button(strings['storage.grow'])).toHaveAttribute('aria-disabled', 'true');
  });
});
