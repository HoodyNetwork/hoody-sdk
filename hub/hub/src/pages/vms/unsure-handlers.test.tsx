// Vitest: every send and confirm handler of the Ports, Settings and Storage tabs asks parts/unsure.ts at the press, on its
// own. The render-time answer is held at "sure" here (the controls stay on, the editors stay open) while the press-time
// answer says "unsure", so each handler and update.ts base() is judged alone: nothing is sent.
import { act, renderHook, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// fixtures.ts first: it imports the VM fixture files and calls their states().
import './fixtures';
import { changeLog, resetChangeFixtures } from './fixtures.ports';
import page from './page';
import strings from './strings.en.json';
import { useVmChanges } from './update';

const press = vi.hoisted(() => ({ unsure: false }));
vi.mock('./parts/unsure', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isVmUnsure: () => press.unsure,
  useVmUnsure: () => false,
}));

vi.setConfig({ testTimeout: 45000 });
const WAIT = { timeout: 10000 };
const say = (key: keyof typeof strings, vars: Record<string, string | number> = {}): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), strings[key]);
const pause = (ms = 800) => new Promise((r) => setTimeout(r, ms));
const button = (name: string | RegExp) => screen.findByRole('button', { name }, WAIT);
const drawer = (name: string) => screen.findByRole('dialog', { name }, WAIT);
async function typeInto(el: HTMLElement, text: string) {
  await userEvent.clear(el);
  await userEvent.type(el, text);
  await userEvent.tab();
}

beforeAll(async () => { await import('./view'); }, 180000);
beforeEach(() => { resetChangeFixtures(); press.unsure = false; });

describe('each handler asks at the press', () => {
  it('Ports: Save in the editor sends nothing', async () => {
    await renderPage(page, { state: 'ports-saved', path: '/vms/win11?tab=ports' });
    await userEvent.click(await button(strings['ports.open']));
    const d = await drawer(say('ports.drawer.title', { vm: 'win11' }));
    await userEvent.click(within(d).getByRole('button', { name: strings['ports.add'] }));
    await typeInto(within(d).getByRole('textbox', { name: say('ports.row.guest', { n: 1 }) }), '8000');
    press.unsure = true;
    await userEvent.click(within(d).getByRole('button', { name: strings['ports.save'] }));
    await pause();
    expect(changeLog).toEqual([]);
  });

  it('Settings: Save sends nothing', async () => {
    await renderPage(page, { state: 'settings-saved', path: '/vms/win11?tab=settings' });
    await typeInto(await screen.findByRole('textbox', { name: strings['settings.cpus'] }, WAIT), '4');
    press.unsure = true;
    await userEvent.click(await button(strings['settings.save']));
    await pause();
    expect(changeLog).toEqual([]);
  });

  it('Storage: the eject question\'s Eject sends nothing', async () => {
    await renderPage(page, { state: 'storage-saved', path: '/vms/win11?tab=storage' });
    const table = await screen.findByRole('table', { name: say('storage.discs.label', { vm: 'win11' }) }, WAIT);
    const row = within(table).getByText(say('storage.slot', { n: 1 })).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /row actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['storage.disc.eject']}`) }, WAIT));
    const q = await screen.findByRole('alertdialog', undefined, WAIT).catch(() => screen.findByRole('dialog', undefined, WAIT));
    press.unsure = true;
    await userEvent.click(within(q).getByRole('button', { name: strings['storage.disc.eject'] }));
    await pause();
    expect(changeLog).toEqual([]);
  });

  it('Storage: Make bigger sends nothing', async () => {
    await renderPage(page, { state: 'storage-saved', path: '/vms/win11?tab=storage' });
    await userEvent.click(await button(strings['storage.grow']));
    const d = await drawer(say('storage.grow.title', { vm: 'win11' }));
    await typeInto(within(d).getByRole('textbox', { name: strings['storage.grow.size'] }), '100');
    press.unsure = true;
    await userEvent.click(within(d).getByRole('button', { name: strings['storage.grow.go'] }));
    await pause();
    expect(changeLog).toEqual([]);
  });

  it('Storage: a disc for a stopped VM sends nothing', async () => {
    await renderPage(page, { state: 'storage-saved', path: '/vms/win11?tab=storage' });
    await userEvent.click(await button(new RegExp(`^${strings['storage.disc.insert']}`)));
    const d = await drawer(say('storage.disc.title', { n: 3, vm: 'win11' }));
    await typeInto(within(d).getByRole('textbox', { name: strings['storage.disc.path'] }), '/isos/new.iso');
    press.unsure = true;
    await userEvent.click(within(d).getByRole('button', { name: strings['storage.disc.go'] }));
    await pause();
    expect(changeLog).toEqual([]);
  });

  it('Storage: a disc swapped in a running VM sends nothing', async () => {
    await renderPage(page, { state: 'storage-live', path: '/vms/web-1?tab=storage' });
    await userEvent.click(await button(new RegExp(`^${strings['storage.disc.change']}`)));
    const d = await drawer(say('storage.disc.title', { n: 1, vm: 'web-1' }));
    await typeInto(within(d).getByRole('textbox', { name: strings['storage.disc.path'] }), '/isos/new.iso');
    press.unsure = true;
    await userEvent.click(within(d).getByRole('button', { name: strings['storage.disc.go'] }));
    await pause();
    expect(changeLog).toEqual([]);
  });
});

describe('update.ts base(), the last stop of every send', () => {
  it('refuses while the name is unsure, before any request', async () => {
    const target = { project: { id: 'p'.repeat(24) }, container: { id: 'c'.repeat(24) } };
    const { result } = renderHook(() => useVmChanges(target, { name: 'win11', vmId: 'a'.repeat(16) }));
    press.unsure = true;
    let sent = true;
    act(() => { sent = result.current.update('settings', { vcpus: 4 }); });
    expect(sent).toBe(false);
    act(() => { sent = result.current.swap(0, '/isos/a.iso') || result.current.eject(0); });
    expect(sent).toBe(false);
    await waitFor(() => expect(result.current.sending).toBeNull());
    expect(changeLog).toEqual([]);
  });
});
