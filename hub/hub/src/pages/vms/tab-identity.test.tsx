// Vitest: a VM's tabs belong to the VM's own id, not to its name. When another VM takes the name (both reads agree, so
// nothing is "unsure"), every tab starts over: a question opened about the earlier VM is gone and sends nothing.
import { act, isOff, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { fixtureWorld } from '@core';
import { setTarget } from '@core/ctx';
import { beforeEach, expect, it } from 'vitest';
import './fixtures';
import { changeLog, replacePowerVm, resetPowerFixtures } from './fixtures.power';
import { resetSnapFixtures, snapLog } from './fixtures.snap';
import page from './page';
import strings from './strings.en.json';

const WAIT = { timeout: 10000 };
/** A button once it can be pressed: the Snapshots tab turns its actions on only after its own reads answered. */
const pressable = async (name: string) => {
  await screen.findByRole('button', { name }, WAIT);
  // Asked again each time: the tab may draw the button anew while its reads answer.
  await waitFor(() => expect(isOff(screen.getByRole('button', { name }))).toBe(false), WAIT);
  return screen.getByRole('button', { name });
};
const say = (key: keyof typeof strings, vars: Record<string, string | number> = {}): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), strings[key]);

beforeEach(() => {
  resetPowerFixtures();
  resetSnapFixtures();
  changeLog.length = 0;
});

it('a restore asked in the Snapshots tab is gone once another VM holds the name, and nothing is sent', async () => {
  await renderPage(page, { state: 'power-snap', path: '/vms/win11?tab=snapshots' });
  await userEvent.click(await pressable(say('snap.row.restoreName', { label: 'clean-install' })));
  const title = say('snap.restore.title', { label: 'clean-install' });
  await screen.findByText(title, undefined, WAIT);
  // Someone deletes the VM and makes another under its name: the list and the VM's own read both name the new one.
  replacePowerVm('win11');
  await waitFor(() => expect(screen.queryByText(title)).toBeNull(), { timeout: 40000 });
  // The new VM's tab is a fresh one: its Restore is there, with no question open.
  expect(await screen.findByRole('button', { name: say('snap.row.restoreName', { label: 'clean-install' }) }, WAIT)).toBeInTheDocument();
  expect(snapLog).toEqual([]);
  expect(changeLog).toEqual([]);
}, 60000);

it('a snapshot label typed for the earlier VM is not kept for the VM that took its name', async () => {
  await renderPage(page, { state: 'power-snap', path: '/vms/win11?tab=snapshots' });
  await userEvent.click(await pressable(strings['snap.take.open']));
  const title = say('snap.take.title', { vm: 'win11' });
  await screen.findByText(title, undefined, WAIT);
  const field = screen.getByRole('textbox', { name: strings['snap.take.field'] });
  await userEvent.clear(field);
  await userEvent.click(field);
  await userEvent.paste('for-the-old-vm');
  replacePowerVm('win11');
  // The tab starts over for the new VM: the drawer and what was typed in it are gone.
  await waitFor(() => expect(screen.queryByDisplayValue('for-the-old-vm')).toBeNull(), { timeout: 40000 });
  expect(snapLog).toEqual([]);
}, 60000);

it('a setting typed for the earlier VM is not kept for the VM that took its name', async () => {
  await renderPage(page, { state: 'power-ok', path: '/vms/win11?tab=settings' });
  const cpus = () => screen.findByRole('textbox', { name: strings['settings.cpus'] }, WAIT);
  const was = (await cpus() as HTMLInputElement).value;
  await userEvent.clear(await cpus());
  await userEvent.type(await cpus(), '7');
  await userEvent.tab();
  expect((await cpus() as HTMLInputElement).value).toBe('7');
  replacePowerVm('win11');
  // The tab starts over for the new VM: the field shows that VM's own value again, not the draft.
  await waitFor(async () => expect((await cpus() as HTMLInputElement).value).toBe(was), { timeout: 40000 });
  expect(changeLog).toEqual([]);
}, 60000);

it('a setting typed on one computer is not kept when another computer, with a VM of the same id, is shown', async () => {
  await renderPage(page, { state: 'power-two', path: '/vms/win11?tab=settings', realm: 'all' });
  const show = (name: string) => {
    const c = fixtureWorld.computer(name);
    act(() => { setTarget({ project: { id: c.project_id }, container: { id: c.id, server_name: c.server_name } }); });
  };
  const cpus = () => screen.findByRole('textbox', { name: strings['settings.cpus'] }, WAIT);
  // Both computers' reads are read once, so a switch shows the other computer at once from what was read.
  show('granite');
  const was = (await cpus() as HTMLInputElement).value;
  show('atlas');
  await cpus();
  await userEvent.clear(await cpus());
  await userEvent.type(await cpus(), '7');
  await userEvent.tab();
  expect((await cpus() as HTMLInputElement).value).toBe('7');
  // The other computer holds a VM under the same name with the same id: its tab starts over, without the draft.
  show('granite');
  await waitFor(async () => expect((await cpus() as HTMLInputElement).value).toBe(was), { timeout: 20000 });
  expect(changeLog).toEqual([]);
}, 60000);
