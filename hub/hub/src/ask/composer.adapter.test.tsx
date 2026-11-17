// Vitest: the dock's composer adapter. The box is the kit's; this file decides when Send works and what the notes
// say, from the engine's snapshot. Over the length limit nothing sends; the draft clears only when the engine took the
// message; the prefill note and the files' lines show above the box.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import kitStrings from '@kit/agent/Conversation.strings.en.json';
import { Composer } from './Composer';
import * as C from './conv';
import type { AskEngine, Snapshot } from './engine';
import { MAX_TEXT } from './logic';
import stateStrings from '@kit/states/strings.en.json';
import strings from './strings.en.json';

function mount(draft: string, o: { accept?: boolean; snap?: Record<string, unknown>; note?: string | null } = {}) {
  const send = vi.fn(() => o.accept ?? true);
  const setDraft = vi.fn();
  const eng = { autoShown: () => false, send, setAuto: () => {}, attBlock: () => null, clearAttNotes: vi.fn() } as unknown as AskEngine;
  const snap = {
    auto: { cap: false, on: false, busy: false, err: '', note: '' }, conv: C.emptyConv(), dup: null, followUps: true, gate: null,
    needLogin: false, sendable: true, att: { items: [], refused: [], dropped: false }, ...(o.snap ?? {}),
  } as unknown as Snapshot;
  render(<Composer eng={eng} snap={snap} computer="box" draft={draft} setDraft={setDraft} note={o.note ?? null} onDismissNote={() => {}} flash={false} inputRef={{ current: null }} onTyping={() => {}} />);
  return { send, setDraft };
}
const sendBtn = () => screen.getByRole('button', { name: new RegExp('^' + kitStrings['agent.send']) }) as HTMLButtonElement;

describe('Send in the dock', () => {
  it('sends the plain text and clears the draft when the engine took it', () => {
    const { send, setDraft } = mount('Hello');
    fireEvent.click(sendBtn());
    expect(send).toHaveBeenCalledWith('Hello', false);
    expect(setDraft).toHaveBeenCalledWith('');
  });
  it('keeps the draft when the engine did not take it', () => {
    const { send, setDraft } = mount('Hello', { accept: false });
    fireEvent.click(sendBtn());
    expect(send).toHaveBeenCalled();
    expect(setDraft).not.toHaveBeenCalled();
  });
  it('an empty draft and a draft past the limit cannot be sent; the limit itself can', () => {
    mount('   ');
    expect(sendBtn().disabled).toBe(true);
  });
  it('past MAX_TEXT code points: disabled, and Enter sends nothing', () => {
    const { send } = mount('x'.repeat(MAX_TEXT + 1));
    expect(sendBtn().disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
  });
  it('exactly MAX_TEXT code points sends', () => {
    const { send } = mount('x'.repeat(MAX_TEXT));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('a page\'s text that owes a new conversation waits for an unconfirmed first message: Send says so and sends nothing (C9)', () => {
    const { send } = mount('Hello', { snap: { freshHeld: true } });
    const b = screen.getByRole('button', { name: kitStrings['agent.send'] });
    expect(b).toHaveAccessibleDescription(strings['ask.freshWaitsCheck']);
    expect(b.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(b);
    expect(send).not.toHaveBeenCalled();
  });
  it('a computer that is not ready says when it will send, and cannot send', () => {
    mount('Hello', { snap: { sendable: false } });
    // The reason is Send's description, so it is reachable while Send is off; the name stays Send.
    const b = screen.getByRole('button', { name: kitStrings['agent.send'] });
    expect(b).toHaveAccessibleDescription(strings['ask.sendsWhenReady'].replace('{{computer}}', 'box'));
    expect(b.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('notes above the box', () => {
  it('the prefill note shows with a Dismiss', () => {
    mount('Hello', { note: 'From Logs · edit it, then press Enter' });
    expect(screen.getByText('From Logs · edit it, then press Enter')).toBeTruthy();
    expect(screen.getByRole('button', { name: strings['ask.dismiss'] })).toBeTruthy();
  });
  it('a refused file shows its line; Dismiss clears the notes through the engine', () => {
    mount('Hello', { snap: { att: { items: [], refused: [{ key: 'ask.attNotText', name: 'a.bin', size: 5 }], dropped: false } } });
    expect(screen.getByText(strings['ask.attNotText'].replace('{{name}}', 'a.bin').replace('{{size}}', '5 B'))).toBeTruthy();
  });
  it('the box draws no Stop, not even while a turn the agent named runs: the working bar holds the one Stop (as on the AI page)', () => {
    mount('Hello');
    expect(screen.queryByRole('button', { name: kitStrings['agent.stop'] })).toBeNull();
    cleanup();
    const u: C.UserMsg = { id: 'u1', text: 'hi', at: 1, key: 'k-u1', via: 'turn', state: 'sent', turnId: null, commandId: null, reason: '' };
    mount('Hello', { snap: { conv: C.addTurn(C.addUser(C.emptyConv('s1'), u), { turnId: 'turn-1', user: 'u1', now: 1 }) } });
    expect(screen.getByRole('textbox')).toBeTruthy();
    expect(screen.queryByRole('button', { name: kitStrings['agent.stop'] })).toBeNull();
  });
});

const userMsg = (id: string, text: string, state: C.UserMsg['state'], via: C.UserMsg['via'] = 'turn'): C.UserMsg =>
  ({ id, text, at: 1, key: 'k' + id, via, state, turnId: null, commandId: null, reason: '' });

describe('Send while an earlier message is in flight', () => {
  it('names why Send waits: the reason is its description, and Send stays off', () => {
    mount('next', { snap: { conv: C.addUser(C.emptyConv('s1'), userMsg('1', 'first', 'sending')) } });
    const b = screen.getByRole('button', { name: kitStrings['agent.send'] });
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b).toHaveAccessibleDescription(strings['ask.waitEarlier']);
  });
  it('an earlier message of unknown outcome says to check it, not to wait for a send that may never come', () => {
    mount('next', { snap: { conv: C.addUser(C.emptyConv('s1'), userMsg('1', 'first', 'unknown')) } });
    const b = screen.getByRole('button', { name: kitStrings['agent.send'] });
    // Its own sentence, never the full-journal one that shared its key once (a duplicate JSON key keeps only the last).
    expect(b).toHaveAccessibleDescription(strings['ask.checkLastFirst']);
    expect(strings['ask.checkLastFirst']).toMatch(/^Check your last message first/);
  });
  it('a request waiting on the person says the message is read after the answer (it declines nothing), whatever is in flight', () => {
    let conv = C.addTurn(C.emptyConv('s1'), { turnId: null, user: '1', now: 1000 });
    conv = C.addUser(conv, userMsg('2', 'more', 'sending', 'command'));
    mount('next', { snap: { conv, gate: { id: 'g1' } } });
    expect(screen.getByText(strings['ask.afterGateNote'])).toBeTruthy();
  });
  it('a QUESTION waiting on the person says the message is read after the answer, and never names Deny (a question card has none)', () => {
    let conv = C.addTurn(C.emptyConv('s1'), { turnId: null, user: '1', now: 1000 });
    conv = C.addUser(conv, userMsg('2', 'more', 'sending', 'command'));
    mount('next', { snap: { conv, gate: { id: 'g1', kind: 'question' } } });
    expect(screen.getByText(strings['ask.afterQuestionNote'])).toBeTruthy();
    expect(screen.queryByText(strings['ask.afterGateNote'])).toBeNull();
    expect(strings['ask.afterQuestionNote']).not.toMatch(/Deny/);
  });
  it('a follow-up still sending does not show "Your agent reads this at its next step" while Send is off', () => {
    let conv = C.addTurn(C.emptyConv('s1'), { turnId: null, user: '1', now: 1000 });
    conv = C.addUser(conv, userMsg('2', 'more', 'sending', 'command'));
    expect(C.running(C.current(conv))).toBe(true);
    expect(C.canSendMore(conv)).toBe(false);
    mount('next', { snap: { conv } });
    expect(screen.queryByText(strings['ask.followUp'])).toBeNull();
  });
  it('the note stays when Send is free (a running turn, nothing in flight)', () => {
    let conv = C.addTurn(C.emptyConv('s1'), { turnId: 'T1', user: '1', now: 1000 });
    conv = C.patchUser(C.addUser(conv, userMsg('1', 'first', 'sent')), '1', { state: 'sent', turnId: 'T1' });
    mount('next', { snap: { conv } });
    expect(screen.getByText(strings['ask.followUp'])).toBeTruthy();
  });
});

describe('the Approve automatically note keeps the rejection', () => {
  const refusal = { status: 422, code: 'bad_request' };
  it('a refused switch shows its sentence and a Details control with Copy details for support', () => {
    mount('Hello', { snap: { auto: { cap: true, on: true, busy: false, err: 'ask.autoFailOff', errE: refusal, note: '' } } });
    const note = screen.getByText(strings['ask.autoFailOff']).closest('p') as HTMLElement;
    fireEvent.click(within(note).getByRole('button', { name: stateStrings['err.details'] }));
    expect(screen.getByRole('button', { name: new RegExp(stateStrings['err.copy']) })).toBeTruthy();
  });
  it('a note with no rejection (an unread mode) shows no Details control', () => {
    mount('Hello', { snap: { auto: { cap: true, on: null, busy: false, err: 'ask.autoUnknown', note: '' } } });
    const note = screen.getByText(strings['ask.autoUnknown']).closest('p') as HTMLElement;
    expect(within(note).queryByRole('button', { name: stateStrings['err.details'] })).toBeNull();
  });
});
