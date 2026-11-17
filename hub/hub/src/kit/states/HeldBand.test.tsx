import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HeldBand } from './HeldBand';
import strings from '../strings.en.json';

const TEXT = 'A snapshot named nightly may already have been taken.';

describe('HeldBand (the one band for a change that may have gone through)', () => {
  it('a warn band with the text, Check again (busy until the read settles) and Stop tracking', async () => {
    let settle: () => void = () => {};
    const onCheck = vi.fn(() => new Promise<void>((r) => { settle = r; }));
    render(<HeldBand text={TEXT} readOnly={false} onCheck={onCheck} onDismiss={() => {}} overlayId="t-held" />);
    const band = screen.getByRole('alert');
    expect(band).toHaveTextContent(TEXT);
    const check = within(band).getByRole('button', { name: strings['outcome.pending.check'] });
    await userEvent.click(check);
    expect(onCheck).toHaveBeenCalledTimes(1);
    // Busy while the read is out: a second press sends nothing.
    await userEvent.click(check);
    expect(onCheck).toHaveBeenCalledTimes(1);
    settle();
    await waitFor(async () => { await userEvent.click(check); expect(onCheck).toHaveBeenCalledTimes(2); });
    expect(within(band).getByRole('button', { name: strings['held.dismiss'] })).toBeInTheDocument();
  });

  it('Stop tracking asks first, with the kit words, and the answer calls the onDismiss the band had when asked, not a later one', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<HeldBand text={TEXT} readOnly={false} onCheck={() => {}} onDismiss={first} overlayId="t-held" />);
    await userEvent.click(screen.getByRole('button', { name: strings['held.dismiss'] }));
    const ask = screen.getByRole('alertdialog');
    expect(ask).toHaveAttribute('data-hub-overlay', 't-held');
    expect(within(ask).getByText(strings['held.dismissTitle'])).toBeInTheDocument();
    expect(within(ask).getByText(strings['held.dismissBody'])).toBeInTheDocument();
    expect(first).not.toHaveBeenCalled();
    // A later hold takes the band's place while the question is open: the answer still stops the first one only.
    rerender(<HeldBand text={TEXT} readOnly={false} onCheck={() => {}} onDismiss={second} overlayId="t-held" />);
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['held.dismissGo'] }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it("a page's own question words replace the kit's", async () => {
    render(<HeldBand text={TEXT} readOnly={false} onCheck={() => {}} onDismiss={() => {}} overlayId="t-held" dismissTitle="Own title" dismissBody="Own body" dismissGo="Own go" />);
    await userEvent.click(screen.getByRole('button', { name: strings['held.dismiss'] }));
    const ask = screen.getByRole('alertdialog');
    expect(within(ask).getByText('Own title')).toBeInTheDocument();
    expect(within(ask).getByText('Own body')).toBeInTheDocument();
    expect(within(ask).getByRole('button', { name: 'Own go' })).toBeInTheDocument();
  });

  it("another sender's hold: Check again only, and the band says where it is settled", () => {
    const { rerender } = render(<HeldBand text={TEXT} readOnly onCheck={() => {}} onDismiss={() => {}} overlayId="t-held" />);
    const band = screen.getByRole('alert');
    expect(band).toHaveTextContent(`${TEXT} ${strings['held.elsewhere']}`);
    expect(within(band).queryByRole('button', { name: strings['held.dismiss'] })).toBeNull();
    expect(within(band).getByRole('button', { name: strings['outcome.pending.check'] })).toBeInTheDocument();
    rerender(<HeldBand text={TEXT} readOnly onCheck={() => {}} onDismiss={() => {}} overlayId="t-held" elsewhere="Settle it on the other page." />);
    expect(screen.getByRole('alert')).toHaveTextContent(`${TEXT} Settle it on the other page.`);
  });
  it('elsewhere null: a read-only hold shows its text alone (a page whose text already says where it settles)', () => {
    render(<HeldBand text={TEXT} readOnly elsewhere={null} onCheck={() => {}} onDismiss={() => {}} overlayId="t-held" />);
    expect(screen.getByText(TEXT)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(strings['held.elsewhere'].slice(0, 20)))).toBeNull();
    expect(screen.queryByRole('button', { name: strings['held.dismiss'] })).toBeNull();
  });
});

describe('HeldBand: what a check said, and a hold whose send is still out', () => {
  it('note: one polite line under the text, kept in the band', () => {
    render(<HeldBand text={TEXT} readOnly={false} onCheck={() => {}} onDismiss={() => {}} overlayId="t-held" note="Not in the list yet." />);
    const band = screen.getByRole('alert');
    const note = band.querySelector('[data-held-note]');
    expect(note).toHaveTextContent('Not in the list yet.');
    expect(note).toHaveAttribute('aria-live', 'polite');
    expect(band).toHaveTextContent(TEXT);
  });

  it('no note: no empty line', () => {
    render(<HeldBand text={TEXT} readOnly={false} onCheck={() => {}} onDismiss={() => {}} overlayId="t-held" />);
    expect(screen.getByRole('alert').querySelector('[data-held-note]')).toBeNull();
  });

  it('inFlight: both actions stay focusable, say why, and do nothing', async () => {
    const onCheck = vi.fn();
    const onDismiss = vi.fn();
    render(<HeldBand text={TEXT} readOnly={false} onCheck={onCheck} onDismiss={onDismiss} overlayId="t-held" inFlight />);
    const band = screen.getByRole('alert');
    const check = within(band).getByRole('button', { name: strings['outcome.pending.check'] });
    const stop = within(band).getByRole('button', { name: strings['held.dismiss'] });
    for (const b of [check, stop]) {
      expect(b).toHaveAttribute('aria-disabled', 'true');
      expect(b).toHaveAccessibleDescription(strings['held.inFlight']);
      b.focus();
      expect(document.activeElement).toBe(b);
    }
    await userEvent.click(check);
    await userEvent.click(stop);
    expect(onCheck).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

