// The held card's warned Dismiss is bound to the send it was opened for (C9: a hold frees only on a warned Dismiss
// of the hold that was SHOWN): another send replacing the shown one in place closes the warning, the confirm calls
// the Dismiss read at the press, and a Dismiss that freed nothing keeps the card with a note. Another page's hold:
// read-only, with a button to the sending page only when the view gives one.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import strings from '../strings.en.json';
import type { Power } from './lifecycle';
import type { T } from './text';
import { HeldCard } from './Tile';

const t: T = (key, vars) => {
  const s = (strings as Record<string, string>)[key] ?? key;
  return s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String((vars as Record<string, unknown> | undefined)?.[k] ?? ''));
};
const own = (holdId: string, dismiss: (hold?: string | null) => Promise<boolean>): Power => ({
  op: 'start', heldOp: 'start', ownHold: true, holdId, heldFrom: null, busy: true, pending: true, outcome: null,
  run: () => undefined, check: async () => false, dismiss,
});
const foreign = (page: string | null): Power => ({
  op: null, heldOp: 'stop', ownHold: false, holdId: null, heldFrom: page ? { page, path: '/' + page } : null, busy: true, pending: true, outcome: null,
  run: () => undefined, check: async () => false, dismiss: async () => false,
});
const card = (power: Power, heldFrom: { name: string; go: () => void } | null = null) => <HeldCard power={power} name="cedar" actions={null} t={t} heldFrom={heldFrom} />;

describe('HeldCard: the warned Dismiss frees the send that was shown', () => {
  it('another send replacing the shown one while the warning is open closes the warning; nothing is dismissed', async () => {
    const user = userEvent.setup();
    const first = vi.fn(async () => true), second = vi.fn(async () => true);
    const r = render(card(own('inc1#1', first)));
    await user.click(screen.getByRole('button', { name: 'Stop tracking' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    r.rerender(card(own('inc2#2', second)));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    expect(screen.getByText('Start may have gone through')).toBeInTheDocument();
  });

  it('the confirm calls the Dismiss read at the press, never a later render\'s', async () => {
    const user = userEvent.setup();
    const atPress = vi.fn(async () => true), later = vi.fn(async () => true);
    const r = render(card(own('inc1#1', atPress)));
    await user.click(screen.getByRole('button', { name: 'Stop tracking' }));
    r.rerender(card(own('inc1#1', later)));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Stop tracking' }));
    expect(atPress).toHaveBeenCalledTimes(1);
    expect(later).not.toHaveBeenCalled();
  });

  it('the confirm names the hold that was shown (no Dismiss without naming it)', async () => {
    const user = userEvent.setup();
    const dismiss = vi.fn(async (_hold?: string | null) => true);
    render(card(own('inc1#7', dismiss)));
    await user.click(screen.getByRole('button', { name: 'Stop tracking' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Stop tracking' }));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith('inc1#7');
  });

  it('a Dismiss that freed nothing keeps the card and says so; pressing Dismiss again clears the note', async () => {
    const user = userEvent.setup();
    const dismiss = vi.fn(async () => false);
    render(card(own('inc1#1', dismiss)));
    await user.click(screen.getByRole('button', { name: 'Stop tracking' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Stop tracking' }));
    expect(await screen.findByText(/Tracking did not stop: this change moved while you decided/)).toBeInTheDocument();
    expect(screen.getByText('Start may have gone through')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop tracking' }));
    expect(screen.queryByText(/Tracking did not stop/)).toBeNull();
  });
});

describe('HeldCard: another page\'s hold is read-only', () => {
  it('with a link from the view: names the sending page and opens it', async () => {
    const user = userEvent.setup();
    const go = vi.fn();
    render(card(foreign('bots'), { name: 'Bots', go }));
    expect(screen.getByText("Bots sent this to cedar's computer and the answer was lost. Check or stop tracking it there.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open in Bots' }));
    expect(go).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Stop tracking' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open in Computers' })).toBeNull();
  });

  it('without one (sender hidden, unknown or unnamed): no button, the body says the page that sent it', () => {
    render(card(foreign('computers'), null));
    expect(screen.getByText("Another page sent this to cedar's computer and the answer was lost. Check or stop tracking it on the page that sent it.")).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
