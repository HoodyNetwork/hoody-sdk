// Vitest: Remove saved views asks first, naming how many it removes; Cancel keeps them all, the confirm removes them.
import { expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import strings from './strings.en.json';

const { default: page } = await import('./page');
const table = strings as Record<string, string>;
const bar = () => screen.getByRole('group', { name: table['title'] });
const user = userEvent.setup();
const openMore = async () => user.click(within(bar()).getByRole('button', { name: table['act.barMore'] }));
const item = (label: string) => screen.queryAllByRole('menuitem').find((m) => (m.textContent ?? '').startsWith(label));

async function saveView(name: string) {
  await openMore();
  await user.click(item(table['v.save']!)!);
  const d = await screen.findByRole('dialog');
  await user.type(within(d).getByRole('textbox', { name: table['v.name'] }), name);
  await user.click(within(d).getByRole('button', { name: table['v.saveGo'] }));
  await waitFor(() => expect(screen.queryByRole('textbox', { name: table['v.name'] })).toBeNull());
}

it('Remove saved views asks first, naming the count; Cancel keeps them', async () => {
  await renderPage(page, { path: '/logs' });
  await screen.findByRole('group', { name: table['title'] }, { timeout: 15000 });
  await saveView('First');
  await saveView('Second');
  await openMore();
  await user.click(item(table['v.clear']!)!);
  const ask = await screen.findByRole('alertdialog', undefined, { timeout: 8000 });
  expect(ask.textContent).toContain(table['v.clearAsk_other']!.replace('{{n}}', '2'));
  await user.click(within(ask).getByRole('button', { name: /^Cancel$/ }));
  await openMore();
  expect(item(table['v.open']!.replace('{{name}}', 'First'))).toBeTruthy();
  expect(item(table['v.open']!.replace('{{name}}', 'Second'))).toBeTruthy();
  // Confirmed: every saved view goes.
  await user.click(item(table['v.clear']!)!);
  const again = await screen.findByRole('alertdialog', undefined, { timeout: 8000 });
  await user.click(within(again).getByRole('button', { name: table['v.clearGo'] }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  await openMore();
  await waitFor(() => expect(item(table['v.open']!.replace('{{name}}', 'First'))).toBeFalsy());
  expect(item(table['v.clear']!)).toBeFalsy();
}, 40000);
