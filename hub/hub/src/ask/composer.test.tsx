// The composer's Approve automatically chip: it draws the session's mode as the engine reports it (autoShown), and an
// unknown mode as "Not known", also while a write is out; never as Off.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer';
import * as C from './conv';
import type { AskEngine, Snapshot } from './engine';
import strings from './strings.en.json';

function chip(shown: boolean | null, busy: boolean, setAuto: (v: boolean) => void = () => {}) {
  const eng = { autoShown: () => shown, send: () => false, setAuto, attBlock: () => null } as unknown as AskEngine;
  const snap = {
    auto: { cap: true, on: shown, busy, err: '', note: '' }, conv: C.emptyConv(), dup: null, followUps: true, gate: null,
    needLogin: false, sendable: true, att: { items: [], refused: [], dropped: false },
  } as unknown as Snapshot;
  render(<Composer eng={eng} snap={snap} computer="box" draft="" setDraft={() => {}} note={null} onDismissNote={() => {}} flash={false} inputRef={{ current: null }} onTyping={() => {}} />);
  return screen.getByRole('switch') as HTMLInputElement;
}

describe('Approve automatically chip', () => {
  it('an unknown mode while an Off write is out shows "Not known", not a plain Off switch', () => {
    const sw = chip(null, true);
    expect(sw.checked).toBe(false);
    expect(screen.getByText('Not known')).toBeTruthy();
  });
  it('an unknown mode at rest shows "Not known"', () => {
    chip(null, false);
    expect(screen.getByText('Not known')).toBeTruthy();
  });
  it('a known Off shows neither On nor "Not known"; a known On shows On', () => {
    const off = chip(false, false);
    expect(off.checked).toBe(false);
    expect(screen.queryByText('Not known')).toBeNull();
    expect(screen.queryByText('On')).toBeNull();
  });
  it('a known On shows On', () => {
    const on = chip(true, false);
    expect(on.checked).toBe(true);
    expect(screen.getByText('On')).toBeTruthy();
  });
});

// Approve automatically starts On for a new conversation; turning it Off is one press, turning it back On
// by hand names its effect first.
describe('Approve automatically chip: Off is one press, On again asks first', () => {
  it('pressing an On chip turns it Off at once, with no dialog', () => {
    const setAuto = vi.fn();
    fireEvent.click(chip(true, false, setAuto));
    expect(setAuto).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  it('pressing an Off chip opens a confirm that names the effect; nothing is sent until Turn on', () => {
    const setAuto = vi.fn();
    fireEvent.click(chip(false, false, setAuto));
    const d = screen.getByRole('alertdialog');
    expect(within(d).getByText(strings['ask.autoConfirmTitle'])).toBeTruthy();
    expect(within(d).getByText(strings['ask.autoConfirmBody'])).toBeTruthy();
    expect(setAuto).not.toHaveBeenCalled();
    fireEvent.click(within(d).getByRole('button', { name: strings['ask.autoConfirmGo'] }));
    expect(setAuto).toHaveBeenCalledExactlyOnceWith(true);
  });
  it('Cancel leaves the chip Off and sends nothing', () => {
    const setAuto = vi.fn();
    fireEvent.click(chip(false, false, setAuto));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(setAuto).not.toHaveBeenCalled();
  });
  it('an unknown mode also asks before an On is sent', () => {
    const setAuto = vi.fn();
    fireEvent.click(chip(null, false, setAuto));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(setAuto).not.toHaveBeenCalled();
  });
});

// The composer counts, sends and compares one plain text (without the context marker's
// invisible character), so the "already waiting" warning and Send anyway still show for a pasted look-alike.
describe('one plain text for sending and the duplicate warning', () => {
  it('a draft that differs only by the invisible character still shows the warning, and Send anyway sends the plain text', async () => {
    const sent: Array<[string, boolean]> = [];
    const eng = { autoShown: () => false, send: (t: string, a: boolean) => { sent.push([t, a]); return false; }, setAuto: () => {}, attBlock: () => null } as unknown as AskEngine;
    const snap = {
      auto: { cap: true, on: false, busy: false, err: '', note: '' }, conv: C.emptyConv(), dup: { text: 'Hello', earlier: false }, followUps: true, gate: null,
      needLogin: false, sendable: true, att: { items: [], refused: [], dropped: false },
    } as unknown as Snapshot;
    render(<Composer eng={eng} snap={snap} computer="box" draft={'Hel⁠lo'} setDraft={() => {}} note={null} onDismissNote={() => {}} flash={false} inputRef={{ current: null }} onTyping={() => {}} />);
    expect(screen.getByText(strings['ask.dupSame'])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: strings['ask.sendAnyway'] }));
    expect(sent).toEqual([['Hello', true]]);
  });
});
