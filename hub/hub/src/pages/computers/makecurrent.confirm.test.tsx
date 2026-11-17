// Make current says what it does before it does it: the head button's tooltip and the menu item's line carry one
// sentence, and a press opens a confirm for that computer (what the current computer is, three places that then work on
// it, what stays as it is). Nothing is chosen until the dialog's Make current; Cancel leaves the choice alone. atlas is
// the fixture world's current computer, so borealis offers Make current.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { interpolate } from '@kit';
import page from './page';
import strings from './strings.en.json';

const TITLE = interpolate(strings['current.ask.title'], { name: 'borealis' });
// Waits for the named row itself: the first rows can be on screen before this one is.
const rowOf = (name: string) =>
  waitFor(() => {
    const row = screen.queryAllByRole('row').find((r) => within(r).queryByText(name, { selector: 'h3, strong' }));
    if (!row) throw new Error(`${name} row`);
    return row;
  }, { timeout: 8000 });
const headButton = () => screen.findByRole('button', { name: strings['menu.makeCurrent'] }, { timeout: 8000 });
const openAsk = async () => {
  await userEvent.click(await headButton());
  return screen.findByRole('alertdialog', { name: TITLE }, { timeout: 8000 });
};

describe('computers: Make current asks first', () => {
  it('the menu item says what it does under its label', async () => {
    await renderPage(page, { path: '/computers' });
    const row = await rowOf('borealis');
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    const item = await screen.findByRole('menuitem', { name: strings['menu.makeCurrent'] });
    expect(item).toHaveAccessibleDescription(strings['menu.makeCurrent.note']);
    expect(item).toHaveTextContent(strings['menu.makeCurrent.note']);
  }, 30000);

  it('a press opens the confirm for that computer and chooses nothing', async () => {
    await renderPage(page, { path: '/computers?sel=borealis.00b2' });
    const ask = await openAsk();
    expect(ask).toHaveTextContent(interpolate(strings['current.ask.body'], { name: 'borealis' }));
    for (const k of ['current.ask.ex.pages', 'current.ask.ex.agent', 'current.ask.ex.files'] as const) expect(within(ask).getByText(interpolate(strings[k], { name: 'borealis' }), { selector: 'li' })).toBeInTheDocument();
    expect(ask).toHaveTextContent('Nothing on borealis changes.');
    expect(within(ask).getByRole('button', { name: strings['menu.makeCurrent'] })).toBeInTheDocument();
    expect(within(ask).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    // Still atlas: its row keeps the Current chip, borealis has none, and nothing was read out.
    expect(within(await rowOf('atlas')).getByText(strings['current.chip'])).toBeInTheDocument();
    expect(within(await rowOf('borealis')).queryByText(strings['current.chip'])).toBeNull();
    expect(screen.queryByText(strings['current.label'])).toBeNull();
    expect(screen.getAllByRole('status').some((x) => x.textContent === interpolate(strings['said.current'], { name: 'borealis' }))).toBe(false);
  }, 30000);

  it('Make current in the dialog switches', async () => {
    await renderPage(page, { path: '/computers?sel=borealis.00b2' });
    const ask = await openAsk();
    await userEvent.click(within(ask).getByRole('button', { name: strings['menu.makeCurrent'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(await screen.findByText(strings['current.label'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(await rowOf('borealis')).getByText(strings['current.chip'])).toBeInTheDocument();
    expect(within(await rowOf('atlas')).queryByText(strings['current.chip'])).toBeNull();
  }, 30000);

  it('Cancel and Escape leave the current computer as it was', async () => {
    await renderPage(page, { path: '/computers?sel=borealis.00b2' });
    const ask = await openAsk();
    await userEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(within(await rowOf('atlas')).getByText(strings['current.chip'])).toBeInTheDocument();
    expect(await headButton()).toBeInTheDocument();
    await openAsk();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(within(await rowOf('atlas')).getByText(strings['current.chip'])).toBeInTheDocument();
    expect(screen.queryByText(strings['current.label'])).toBeNull();
  }, 30000);
});
