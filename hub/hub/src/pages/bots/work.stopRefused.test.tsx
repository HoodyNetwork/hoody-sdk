// Vitest: a Stop on the Work tab that fails or is refused before it is sent keeps its dialog open with the reason, so it
// never looks as if the task stopped; a stop that went through closes the dialog.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';
import kitStrings from '@kit/strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const path = `/bots?sel=${encodeURIComponent(CHIEF)}&tab=work`;

async function pressStop(state: string | null) {
  await renderPage(page, { path, ...(state && { state }) });
  const t = within(await screen.findByRole('table', { name: strings['work.title'] }));
  const row = (await t.findByText('Read deploy log')).closest('tr') as HTMLElement;
  await userEvent.click(within(row).getByRole('button', { name: /^(Row actions|More actions for )/ }));
  await userEvent.click(await screen.findByRole('menuitem', { name: strings['work.stopMenu'] }));
  const dialog = await screen.findByRole('alertdialog', { name: strings['work.stopTitle'] }).catch(() => screen.findByRole('dialog', { name: strings['work.stopTitle'] }));
  await userEvent.click(within(dialog).getByRole('button', { name: strings['work.stopGo'] }));
}

describe('stopping a task', () => {
  // The reason is the kit outcome title for the refusal: it appears only once the answer is in, so waiting for it waits
  // for the answer, and the dialog holding it is still the Stop dialog.
  for (const [state, why] of [['stopFailed', kitStrings['outcome.failed.title']], ['stopNotSent', kitStrings['outcome.notSent.title']]] as const) {
    it(`${state}: the dialog stays open and shows why`, async () => {
      await pressStop(state);
      const dialog = await screen.findByRole('alertdialog', { name: strings['work.stopTitle'] }).catch(() => screen.findByRole('dialog', { name: strings['work.stopTitle'] }));
      expect(await within(dialog).findByText(why, {}, { timeout: 10000 })).toBeVisible();
      expect(within(dialog).getByRole('button', { name: strings['work.stopGo'] })).toBeInTheDocument();
    }, 30000);
  }

  it('a stop that went through closes the dialog', async () => {
    await pressStop(null);
    await waitFor(() => expect(screen.queryByText(strings['work.stopTitle'])).toBeNull());
  }, 30000);
});
