// Vitest: the Ports, Settings and Storage tabs while the reads on screen do not agree on which VM holds the name
// (parts/unsure.ts). Every change of a VM goes by name, so each tab switches its changing controls off with the
// reason, closes an editor or question that is open, and a press sends nothing.
import { act, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// fixtures.ts first: it imports the VM fixture files and calls their states().
import './fixtures';
import { changeLog, resetChangeFixtures } from './fixtures.ports';
import page from './page';
import { isVmUnsure, useMarkVmUnsure } from './parts/unsure';
import strings from './strings.en.json';

vi.setConfig({ testTimeout: 45000 });
const WAIT = { timeout: 10000 };
const say = (key: keyof typeof strings, vars: Record<string, string | number> = {}): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), strings[key]);
const pause = (ms = 600) => new Promise((r) => setTimeout(r, ms));
const button = (name: string | RegExp) => screen.findByRole('button', { name }, WAIT);
const drawer = (name: string) => screen.findByRole('dialog', { name }, WAIT);
async function typeInto(el: HTMLElement, text: string) {
  await userEvent.clear(el);
  await userEvent.type(el, text);
  await userEvent.tab();
}

// Stated here as any VM screen may state it: the guard fails closed on the name alone.
function Unsure({ name }: { name: string }) {
  useMarkVmUnsure('elsewhere', name, true);
  return null;
}
const makeUnsure = async (name = 'win11') => {
  await act(async () => { render(<Unsure name={name} />); });
  expect(isVmUnsure(name)).toBe(true);
};
const reasonShown = () => expect(screen.getAllByText(strings['power.why.unread']).length).toBeGreaterThan(0);

beforeAll(async () => { await import('./view'); }, 180000);
beforeEach(() => { resetChangeFixtures(); });

describe('Ports while the name is unsure', () => {
  it('the open editor closes, Edit is off with the reason, and a press sends nothing', async () => {
    await renderPage(page, { state: 'ports-saved', path: '/vms/win11?tab=ports' });
    await userEvent.click(await button(strings['ports.open']));
    const d = await drawer(say('ports.drawer.title', { vm: 'win11' }));
    await userEvent.click(within(d).getByRole('button', { name: strings['ports.add'] }));
    await typeInto(within(d).getByRole('textbox', { name: say('ports.row.guest', { n: 1 }) }), '8000');
    await makeUnsure();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: say('ports.drawer.title', { vm: 'win11' }) })).toBeNull(), WAIT);
    const edit = await button(strings['ports.open']);
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    reasonShown();
    await userEvent.click(edit);
    await pause();
    expect(screen.queryByRole('dialog', { name: say('ports.drawer.title', { vm: 'win11' }) })).toBeNull();
    expect(changeLog).toEqual([]);
  });
});

describe('Settings while the name is unsure', () => {
  it('the form locks and says why; Save sends nothing', async () => {
    await renderPage(page, { state: 'settings-saved', path: '/vms/win11?tab=settings' });
    await typeInto(await screen.findByRole('textbox', { name: strings['settings.cpus'] }, WAIT), '4');
    await makeUnsure();
    expect(await screen.findByText(strings['power.why.unread'], undefined, WAIT)).toBeInTheDocument();
    const save = await button(strings['settings.save']);
    expect(save).toBeDisabled();
    await userEvent.click(save);
    await pause();
    expect(changeLog).toEqual([]);
  });
});

describe('Storage while the name is unsure', () => {
  it('an open eject question closes and nothing is sent', async () => {
    await renderPage(page, { state: 'storage-saved', path: '/vms/win11?tab=storage' });
    const table = await screen.findByRole('table', { name: say('storage.discs.label', { vm: 'win11' }) }, WAIT);
    const row = within(table).getByText(say('storage.slot', { n: 1 })).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /row actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['storage.disc.eject']}`) }, WAIT));
    const title = say('storage.disc.ejectTitle', { n: 1, vm: 'win11' });
    await screen.findByText(title, undefined, WAIT);
    await makeUnsure();
    await waitFor(() => expect(screen.queryByText(title)).toBeNull(), WAIT);
    await pause();
    expect(changeLog).toEqual([]);
  });

  it('the open disk editor closes, Make bigger is off with the reason, and a press sends nothing', async () => {
    await renderPage(page, { state: 'storage-saved', path: '/vms/win11?tab=storage' });
    await userEvent.click(await button(strings['storage.grow']));
    const d = await drawer(say('storage.grow.title', { vm: 'win11' }));
    await typeInto(within(d).getByRole('textbox', { name: strings['storage.grow.size'] }), '100');
    await makeUnsure();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: say('storage.grow.title', { vm: 'win11' }) })).toBeNull(), WAIT);
    const grow = await button(strings['storage.grow']);
    expect(grow).toHaveAttribute('aria-disabled', 'true');
    reasonShown();
    await userEvent.click(grow);
    await pause();
    expect(screen.queryByRole('dialog', { name: say('storage.grow.title', { vm: 'win11' }) })).toBeNull();
    expect(changeLog).toEqual([]);
  });
});
