// Vitest: while the host still reads its "/" list, a draft that starts with "/" is held: Send waits and says why, and
// the read starts even for a "/" draft that was not typed into an empty box (pasted over text, or taken back). A command the host
// carries out itself still runs, and a draft without a leading "/" sends as before. Once the list is read, Send goes on as typed;
// a read that does not end never holds the draft for longer than SLASH_HOLD_MS. The other ways to send the draft
// wait by the same rule: the Send menu's items and a note's Send it now.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Composer, SLASH_HOLD_MS, type ComposerNote } from './Composer';
import type { MenuAction } from '../overlays/Menu';
import type { ComposerSlash } from './slash';
import strings from './Conversation.strings.en.json';

const S = strings as Record<string, string>;

function Host(o: { slash: ComposerSlash; onSend: () => void; start?: string; notes?: readonly ComposerNote[]; sendMenu?: readonly MenuAction[] }) {
  const [draft, setDraft] = useState(o.start ?? '');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  return (
    <Composer
      draft={draft} setDraft={setDraft} inputRef={inputRef} placeholder="Ask anything" max={4000} canSend={draft.trim() !== ''}
      onSend={o.onSend} notes={o.notes ?? []} sendMenu={o.sendMenu} attachments={[]} onRemoveAttachment={() => {}} flash={false} onTyping={() => {}} slash={o.slash}
    />
  );
}
const box = () => screen.getByRole('textbox', { name: S['agent.composer'] }) as HTMLTextAreaElement;
const sendBtn = () => screen.getByRole('button', { name: new RegExp('^' + S['agent.send'] + '$') }) as HTMLButtonElement;
const held = () => sendBtn().getAttribute('aria-disabled') === 'true';
const type = (v: string) => fireEvent.change(box(), { target: { value: v } });
const enter = () => fireEvent.keyDown(box(), { key: 'Enter' });
const reading = (over: Partial<ComposerSlash> = {}): ComposerSlash => ({ items: [], reading: true, open: vi.fn(), ...over });

describe('Send waits for the "/" list', () => {
  it('a "/" draft is held while the list is read: Send is disabled and says why, Enter sends nothing', () => {
    const onSend = vi.fn();
    render(<Host slash={reading()} onSend={onSend} />);
    type('/usage');
    expect(held()).toBe(true);
    expect(sendBtn()).toHaveAccessibleDescription(S['agent.slashHold']);
    fireEvent.click(sendBtn());
    enter();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('once the list is read, the same draft sends as typed', () => {
    const onSend = vi.fn();
    const { rerender } = render(<Host slash={reading()} onSend={onSend} />);
    type('/usage');
    rerender(<Host slash={{ items: [], reading: false }} onSend={onSend} />);
    expect(held()).toBe(false);
    enter();
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('a "/" draft that was not typed into an empty box (taken back, or pasted over text) starts the read', () => {
    const slash = reading();
    render(<Host slash={slash} onSend={() => {}} start="/usage" />);
    expect(slash.open).toHaveBeenCalled();
    expect(held()).toBe(true);
  });

  it('a command the host carries out itself still runs while the list is read', () => {
    const run = vi.fn();
    const onSend = vi.fn();
    render(<Host slash={reading({ items: [{ name: 'exit', description: '', hidden: true, run }] })} onSend={onSend} />);
    type('/exit');
    act(() => { fireEvent.click(sendBtn()); });
    expect(run).toHaveBeenCalledWith('');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('a draft without a leading "/" sends as before while the list is read', () => {
    const onSend = vi.fn();
    render(<Host slash={reading()} onSend={onSend} />);
    type('fix the cart total /please');
    enter();
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('a read that does not end holds a "/" draft only for SLASH_HOLD_MS: then it sends as typed', () => {
    vi.useFakeTimers();
    try {
      const onSend = vi.fn();
      render(<Host slash={reading()} onSend={onSend} />);
      type('/var/log is full on the build computer');
      expect(held()).toBe(true);
      act(() => { vi.advanceTimersByTime(SLASH_HOLD_MS - 1); });
      expect(held()).toBe(true);
      act(() => { vi.advanceTimersByTime(1); });
      expect(held()).toBe(false);
      enter();
      expect(onSend).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the Send menu\'s items wait too: while a "/" draft is held each says why and does nothing, then runs once the list is read', async () => {
    const go = vi.fn();
    const menu: MenuAction[] = [{ id: 'aat', label: 'Auto-approve this reply', onAction: go }];
    const { rerender } = render(<Host slash={reading()} onSend={() => {}} sendMenu={menu} />);
    type('/usage');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: S['agent.sendMenu'] })); });
    const item = screen.getByRole('menuitem', { name: /Auto-approve this reply/ });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(within(item).getByText(S['agent.slashHold'] as string)).toBeTruthy();
    await act(async () => { fireEvent.click(item); });
    expect(go).not.toHaveBeenCalled();
    rerender(<Host slash={{ items: [], reading: false }} onSend={() => {}} sendMenu={menu} />);
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: /Auto-approve this reply/ })); });
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('a note\'s Send it now waits too: held while the "/" draft is, it sends once the list is read', () => {
    const again = vi.fn();
    const notes: ComposerNote[] = [{ key: 'send', text: 'Not sent.', warn: true, sends: { label: 'Send it now', onPress: again } }];
    const { rerender } = render(<Host slash={reading()} onSend={() => {}} notes={notes} />);
    const btn = () => screen.getByRole('button', { name: /^Send it now/ });
    type('fix the cart total');
    expect(btn().getAttribute('aria-disabled')).not.toBe('true');
    type('/usage');
    expect(btn().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(btn());
    expect(again).not.toHaveBeenCalled();
    rerender(<Host slash={{ items: [], reading: false }} onSend={() => {}} notes={notes} />);
    fireEvent.click(btn());
    expect(again).toHaveBeenCalledTimes(1);
  });
});
