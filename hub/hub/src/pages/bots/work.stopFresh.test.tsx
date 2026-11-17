// Vitest: each Stop on the Work tab asks afresh for its own task. A refused stop of one task, then Cancel, leaves
// nothing behind for the next task's Stop: no "Also close it" tick, no refusal from the earlier ask.
import { renderPage, screen, userEvent, within } from '@app/testing';
import { beforeAll, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';
import kitStrings from '@kit/strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const dialogNow = () => screen.findByRole('alertdialog', { name: strings['work.stopTitle'] }).catch(() => screen.findByRole('dialog', { name: strings['work.stopTitle'] }));

async function openStop(task: string) {
  const t = within(await screen.findByRole('table', { name: strings['work.title'] }));
  const row = (await t.findByText(task)).closest('tr') as HTMLElement;
  await userEvent.click(within(row).getByRole('button', { name: /^(Row actions|More actions for )/ }));
  await userEvent.click(await screen.findByRole('menuitem', { name: strings['work.stopMenu'] }));
  return dialogNow();
}

it('a refused stop of one task, cancelled, leaves the next task\'s Stop clean', async () => {
  await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=work`, state: 'stopFailed' });
  const first = await openStop('Read deploy log');
  await userEvent.click(within(first).getByRole('checkbox', { name: strings['work.alsoClose'] }));
  await userEvent.click(within(first).getByRole('button', { name: strings['work.stopGo'] }));
  await within(first).findByText(kitStrings['outcome.failed.title'], {}, { timeout: 10000 });
  await userEvent.click(within(first).getByRole('button', { name: /^Cancel$/ }));
  const second = await openStop('Draft reply to a reader');
  expect(within(second).getByRole('checkbox', { name: strings['work.alsoClose'] })).not.toBeChecked();
  expect(within(second).queryByText(kitStrings['outcome.failed.title'])).toBeNull();
}, 40000);
