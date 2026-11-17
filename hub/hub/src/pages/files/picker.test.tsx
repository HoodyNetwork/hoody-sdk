// Vitest: each pane picks its own computer with the kit ComputerPicker: the list
// shows each computer's state in words, a pick sets only that pane's computer, and the top bar's computer stays.
import { beforeAll, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const paneLabel = (pane: 'pane.a' | 'pane.b') => fill(strings['pick.label'], { pane: strings[pane] });
// The kit names a picker by the words it shows (the computer, its state, its realm), then the pane it is for.
const shownThen = (shown: string, pane: 'pane.a' | 'pane.b') => (name: string) => name.startsWith(`${shown} `) && name.endsWith(` ${paneLabel(pane)}`);
// The first render of the page waits for its lazy parts: a loaded host can take seconds.
const pickerOf = (pane: 'pane.a' | 'pane.b', name = 'atlas') => screen.findByRole('button', { name: shownThen(name, pane) }, { timeout: 8000 });

// Load the page's view once before the first test, so that test is not timed on the import.
beforeAll(async () => {
  await import('./view');
}, 120_000);

describe('files computer picker', () => {
  it('shows the picked computer and its state, and picks a computer for one pane only', async () => {
    const { router } = await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fsrv&b=atlas.00a1' });
    const a = await pickerOf('pane.a');
    await waitFor(() => expect(a).toHaveTextContent('atlas'));
    expect(a).toHaveAccessibleName(new RegExp(`^atlas .*${strings['pick.running']}`));
    await userEvent.click(await pickerOf('pane.b'));
    const list = await screen.findByRole('dialog', { name: paneLabel('pane.b') });
    const rows = within(list).getAllByRole('radio');
    expect(rows.length).toBeGreaterThan(1);
    expect(within(list).getAllByText(new RegExp(strings['pick.stopped'])).length).toBeGreaterThan(0);
    // cedar is stopped: still pickable (the pane then says to start it).
    await userEvent.click(within(list).getByText('cedar'));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ b: 'cedar.00c3' }));
    expect(router.state.location.search).toMatchObject({ a: 'atlas.00a1', ap: '/srv' });
  });

  // WCAG 2.5.3 Label in Name (axe label-content-name-mismatch): the picker's name starts with the words it shows,
  // then says which pane it is for.
  it('names each picker by what it shows first, then its pane: the computer, or Pick a computer', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fsrv&b=nowhere.0000' });
    const a = await pickerOf('pane.a');
    await waitFor(() => expect(a).toHaveTextContent('atlas'));
    expect(a).toHaveAccessibleName(new RegExp(`^atlas (.+ )?${strings['pick.running']} ${paneLabel('pane.a')}$`));
    const b = await screen.findByRole('button', { name: `${strings['pick.placeholder']} ${paneLabel('pane.b')}` });
    expect(b).toHaveTextContent(strings['pick.placeholder']);
  });
});
