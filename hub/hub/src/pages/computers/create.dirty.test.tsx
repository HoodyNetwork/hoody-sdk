// Get a computer: what the person typed or picked outside More options is guarded too. A typed name asks (Cancel) before the
// drawer drops it; while the inline New project form is open, Get computer waits (it would send under the old project
// and drop the project being typed).
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import fo from '@kit/forms/forms.strings.en.json';
import ov from '@kit/overlays/strings.en.json';
import { expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const openCreate = async () => {
  await renderPage(page, { path: '/computers' });
  await userEvent.click((await screen.findAllByRole('button', { name: strings['action.get'] }, { timeout: 30000 }))[0] as HTMLElement);
  return screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
};
const offer = (d: HTMLElement) => within(d).findByRole('button', { name: new RegExp(`^(${strings['create.newProject']}|${strings['proj.new']})$`) }, { timeout: 8000 });

it('a typed computer name: Cancel asks before discarding it', async () => {
  const d = await openCreate();
  const name = within(d).getByLabelText(strings['field.name']) as HTMLInputElement;
  await userEvent.clear(name);
  await userEvent.type(name, 'my-own-name');
  await userEvent.click(within(d).getByRole('button', { name: fo['form.cancel'] }));
  expect(await within(d).findByText(ov['discardAsk'], undefined, { timeout: 8000 })).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: strings['create.title'] })).toBeInTheDocument();
}, 40000);

it('the New project form open: Get computer is off and says why', async () => {
  const d = await openCreate();
  const go = within(d).getByRole('button', { name: strings['create.go'] });
  await waitFor(() => expect(go).toBeEnabled(), { timeout: 8000 });
  await userEvent.click(await offer(d));
  await userEvent.type(within(d).getByRole('textbox', { name: strings['newp.name'] }), 'Side work');
  expect(within(d).getByRole('button', { name: strings['create.go'] })).toBeDisabled();
  // Off with its reason shown, never silently.
  expect(within(d).getByText(strings['create.newProjectOpen'])).toBeInTheDocument();
}, 40000);
