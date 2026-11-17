// Make current shows its result where the action was (inline first, no toast): the detail
// says Current computer and the list row gets its Current chip, with no toast on top. atlas is the fixture world's
// current computer, so borealis offers Make current.
import { describe, expect, it, vi } from 'vitest';
import type * as Kit from '@kit';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const said = (name: string) => strings['said.current'].replace('{{name}}', name);
// Make current asks first (makecurrent.confirm.test.tsx): the dialog's own Make current is the press that chooses.
const confirm = async (name: string) => {
  const ask = await screen.findByRole('alertdialog', { name: strings['current.ask.title'].replace('{{name}}', name) }, { timeout: 8000 });
  await userEvent.click(within(ask).getByRole('button', { name: strings['menu.makeCurrent'] }));
};
const w = vi.hoisted(() => ({ toasts: [] as { title: unknown }[] }));
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof Kit>();
  return { ...real, showToast: (c: Parameters<typeof real.showToast>[0]) => (w.toasts.push({ title: c.title }), 'toast') };
});

describe('computers: Make current answers in place', () => {
  it('the detail and the row show Current; no toast', async () => {
    await renderPage(page, { path: '/computers?sel=borealis.00b2' });
    await userEvent.click(await screen.findByRole('button', { name: strings['menu.makeCurrent'] }, { timeout: 8000 }));
    await confirm('borealis');
    expect(await screen.findByText(strings['current.label'], {}, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['menu.makeCurrent'] })).toBeNull());
    const row = (await screen.findAllByRole('row')).find((r) => within(r).queryByText('borealis', { selector: 'h3, strong' }));
    expect(row && within(row).getByText(strings['current.chip'])).toBeInTheDocument();
    expect(w.toasts).toEqual([]);
    expect(screen.getAllByRole('status').some((x) => x.textContent === said('borealis'))).toBe(true);
  }, 30000);

  it('from the row menu by keyboard: focus goes back to the menu button and the result is read out; no toast', async () => {
    w.toasts.length = 0;
    await renderPage(page, { path: '/computers' });
    await screen.findByText('borealis', { selector: 'h3, strong' }, { timeout: 8000 });
    const row = (await screen.findAllByRole('row', {}, { timeout: 8000 })).find((r) => within(r).queryByText('borealis', { selector: 'h3, strong' }));
    if (!row) throw new Error('borealis row');
    const trigger = within(row).getByRole('button', { name: 'Row actions' });
    act(() => trigger.focus());
    await userEvent.keyboard('{Enter}');
    const item = await screen.findByRole('menuitem', { name: strings['menu.makeCurrent'] });
    // jsdom does not move focus with the menu's arrow keys: focus the item, then press Enter on it as a keyboard user.
    act(() => item.focus());
    expect(document.activeElement).toBe(item);
    await userEvent.keyboard('{Enter}');
    await confirm('borealis');
    await waitFor(() => expect(screen.getAllByRole('status').some((x) => x.textContent === said('borealis'))).toBe(true));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(within(row).getByText(strings['current.chip'])).toBeInTheDocument();
    expect(w.toasts).toEqual([]);
  }, 30000);
});
