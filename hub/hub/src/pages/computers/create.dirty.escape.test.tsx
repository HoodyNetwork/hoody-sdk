// Get a computer: Escape is the other way to close the drawer, so a typed name asks before Escape drops it, as Cancel
// does (create.dirty.test.tsx): one Escape from the name field puts the question, with focus on Keep editing.
import { renderPage, screen, userEvent, within } from '@app/testing';
import ov from '@kit/overlays/strings.en.json';
import { expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const openCreate = async () => {
  await renderPage(page, { path: '/computers' });
  await userEvent.click((await screen.findAllByRole('button', { name: strings['action.get'] }, { timeout: 30000 }))[0] as HTMLElement);
  return screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
};

it('a typed computer name: Escape asks before discarding it, and the drawer stays open', async () => {
  const d = await openCreate();
  const name = within(d).getByLabelText(strings['field.name']) as HTMLInputElement;
  await userEvent.clear(name);
  await userEvent.type(name, 'my-own-name');
  await userEvent.keyboard('{Escape}');
  expect(await within(d).findByText(ov['discardAsk'], undefined, { timeout: 8000 })).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: strings['create.title'] })).toBeInTheDocument();
  expect(document.activeElement).toBe(within(d).getByRole('button', { name: ov['keepEditing'] }));
  expect(name).toHaveValue('my-own-name');
}, 40000);
