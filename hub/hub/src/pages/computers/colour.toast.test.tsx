// A colour send whose answer was lost, with the dialog closed, leaves the
// sticky "may have gone through" toast, and its Check again is the dialog's own check. An unproved read keeps the toast
// (the action hands back false) and the hold; a read that proves it hands back true and the hold ends. One send.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interpolate } from '@kit';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { colourLanded, colourSends, computers } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const toasts = vi.hoisted(() => [] as Array<{ title: string; action?: { onAction: () => unknown } }>);
vi.mock('@kit/states/Toast', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  showToast: (c: { title: string; action?: { onAction: () => unknown } }) => {
    toasts.push(c);
    return 'k';
  },
}));

const atlas = computers.find((c) => c.name === 'atlas');
if (!atlas) throw new Error('fixture atlas');
const SEL = '/computers?sel=atlas.00a1';
const TITLE = interpolate(strings['colour.title'], { name: 'atlas' });
const HELD = interpolate(strings['held.colour'], { name: 'atlas' });
const CHANGE = interpolate(strings['colour.change'], { name: 'atlas', colour: '\u0000' }).split('\u0000')[0] ?? '';

const openDialog = async () => {
  await screen.findByRole('heading', { name: strings['facts.title'] }, { timeout: 20000 });
  // The trigger says the current colour, which a proved send changes: matched on the part before it.
  const [trigger] = await screen.findAllByRole('button', { name: (n) => n.startsWith(CHANGE) });
  await userEvent.click(trigger!);
  return screen.findByRole('alertdialog', { name: TITLE });
};
/** Saves another preset, waits for the hold, closes the dialog and hands back the toast's action. */
const saveHeldThenClose = async () => {
  await renderPage(page, { path: SEL, state: 'colourLanded' });
  const d = await openDialog();
  const other = within(d).getAllByRole('radio').find((r) => r.getAttribute('aria-checked') !== 'true' && !(r as HTMLInputElement).checked);
  if (!other) throw new Error('no other preset');
  await userEvent.click(other);
  await userEvent.click(within(d).getByRole('button', { name: strings['colour.go'] }));
  expect(await within(d).findByText(HELD, {}, { timeout: 8000 })).toBeInTheDocument();
  await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog', { name: TITLE })).toBeNull());
  await waitFor(() => expect(toasts.filter((x) => x.action)).toHaveLength(1), { timeout: 8000 });
  const run = toasts.find((x) => x.action)?.action?.onAction;
  if (!run) throw new Error('no toast action');
  return run;
};

beforeEach(() => {
  toasts.length = 0;
  colourSends.length = 0;
  colourLanded.shown = false;
  delete colourLanded.as;
  delete colourLanded.on;
});

describe('computers: the colour toast\'s Check again, after the dialog closed', () => {
  it('an unproved read keeps the toast and the hold; a later proving read ends both; one send', async () => {
    const run = await saveHeldThenClose();
    let proved: unknown;
    await act(async () => { proved = await run(); });
    // false keeps the sticky toast open (kit Toast closes it only on an explicit true).
    expect(proved).toBe(false);
    const again = await openDialog();
    expect(await within(again).findByText(HELD, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(again).getByRole('button', { name: strings['colour.go'] })).toBeDisabled();
    await userEvent.click(within(again).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: TITLE })).toBeNull());

    colourLanded.shown = true;
    await act(async () => { proved = await run(); });
    expect(proved).toBe(true);
    const after = await openDialog();
    expect(await within(after).findByRole('radiogroup', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(after).queryByText(HELD)).toBeNull();
    expect(colourSends).toHaveLength(1);
  }, 60000);
});
