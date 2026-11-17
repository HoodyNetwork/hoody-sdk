// Vitest: one hold store for every New note. A create held through holds.ts by another
// surface (the Board's Add a program › Notes › New page uses this hook) is offered by the Notes page's own New note as
// held: Check again, and never a second send: no Create, and no way to send it again is drawn (the dialog has no primary
// while the outcome is pending, which it always is while a create is held).
// 1c: while the held create's record says its send is out, New note offers no Check again and no Stop tracking.
// 1e: Stop tracking lets go of the note it warned about only (a hold put in its place since is kept).
// A New note opened before another surface held a create
// for its computer shows that hold live (Check again, no Create) and never writes over it.
import { fixtureWorld } from '@core';
import { render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import { useNotesKept } from './holds';
import page from './page';
import strings from './strings.en.json';

/** Another surface holding a create on every computer, as the Board's New page does before its send. */
const seen: { holds: () => Record<string, { id: string }> } = { holds: () => ({}) };
function Elsewhere({ sending = false, id = 'd4e5f6a7b8c9d0e1f2a3b4c5', name = 'From the Board' }: { sending?: boolean; id?: string; name?: string }) {
  const { hold, storeRef } = useNotesKept();
  useEffect(() => { seen.holds = () => storeRef.current.holds; });
  useEffect(() => {
    const note = { id, parentId: 'c3d4e5f6a7b8c9d0e1f2a3b4', name, ...(sending ? { phase: 'sending' as const, sentAt: Date.now() } : {}) };
    for (const c of fixtureWorld.computers) hold(c.id, note);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, []);
  return null;
}

// The held create shows in the Title field itself, disabled: the name that is out, where it was typed.
const heldTitle = () => screen.getByLabelText(strings['new.field']) as HTMLInputElement;

describe('the shared hold store', () => {
  it("a create held elsewhere is held on the Notes page: New note offers Check again, not Create, and no second send", async () => {
    await renderPage(page, {});
    await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
    render(<Elsewhere />);
    await userEvent.click((await screen.findAllByRole('button', { name: strings['action.new'] }))[0] as HTMLElement);
    await waitFor(() => expect(heldTitle()).toHaveValue('From the Board'));
    expect(heldTitle()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['new.create'] })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send again' })).toBeNull();
  });

  it('an open Stop tracking warning closes when a send starts elsewhere, and the hold stays', async () => {
    await renderPage(page, {});
    await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
    render(<Elsewhere />);
    await userEvent.click((await screen.findAllByRole('button', { name: strings['action.new'] }))[0] as HTMLElement);
    await userEvent.click(await screen.findByRole('button', { name: strings['new.allowAgainShort'] }));
    expect(await screen.findByText(strings['new.allowAgainBody'])).toBeInTheDocument();
    render(<Elsewhere sending />);
    await waitFor(() => expect(screen.queryByText(strings['new.allowAgainBody'])).toBeNull());
    expect(screen.getByRole('button', { name: strings['new.allowAgainShort'] })).toBeDisabled();
    expect(heldTitle()).toHaveValue('From the Board');
    expect(heldTitle()).toBeDisabled();
  });

  it('a create whose send is out elsewhere: no Check again and no Stop tracking on the Notes page', async () => {
    await renderPage(page, {});
    await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
    render(<Elsewhere sending />);
    await userEvent.click((await screen.findAllByRole('button', { name: strings['action.new'] }))[0] as HTMLElement);
    expect(await screen.findByText(strings['new.sendingOut'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
    expect(screen.getByRole('button', { name: strings['new.allowAgainShort'] })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Send again' })).toBeNull();
  });

  it('a hold put there after New note opened is shown live: no Create, and that hold is never written over', async () => {
    await renderPage(page, {});
    await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
    await userEvent.click((await screen.findAllByRole('button', { name: strings['action.new'] }))[0] as HTMLElement);
    await userEvent.type(await screen.findByLabelText(strings['new.field']), 'Mine');
    render(<Elsewhere />);
    await waitFor(() => expect(heldTitle()).toHaveValue('From the Board'));
    expect(heldTitle()).toBeDisabled();
    expect(screen.queryByRole('button', { name: strings['new.create'] })).toBeNull();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(fixtureWorld.computers.every((x) => seen.holds()[x.id]?.id === 'd4e5f6a7b8c9d0e1f2a3b4c5')).toBe(true);
  });

  it('the warning opens for A, A is replaced by B (not sending), confirm: B is kept', async () => {
    await renderPage(page, {});
    await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
    render(<Elsewhere />);
    await userEvent.click((await screen.findAllByRole('button', { name: strings['action.new'] }))[0] as HTMLElement);
    await userEvent.click(await screen.findByRole('button', { name: strings['new.allowAgainShort'] }));
    await screen.findByText(strings['new.allowAgainBody']);
    const B = 'e5f6a7b8c9d0e1f2a3b4c5d6';
    render(<Elsewhere id={B} name="Another" />);
    const all = () => fixtureWorld.computers.map((x) => seen.holds()[x.id]?.id);
    await waitFor(() => expect(all().every((id) => id === B)).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: strings['new.allowAgainConfirm'] }));
    await new Promise((r) => setTimeout(r, 100));
    expect(all().every((id) => id === B)).toBe(true);
  });
});
