// Vitest: the kit Composer's queued-note anatomy. A note that describes the box gives the box its words only, never the words of
// its own action ("Don't send" is a control of its own); a chip removed from the keyboard sends the focus to the message box.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../controls/Button';
import { Composer, type ComposerProps } from './Composer';
import strings from './Conversation.strings.en.json';

function mount(o: Partial<ComposerProps> = {}) {
  const p: ComposerProps = {
    draft: 'Use the staging database instead', setDraft: vi.fn(), inputRef: createRef<HTMLTextAreaElement>() as RefObject<HTMLTextAreaElement | null>,
    placeholder: 'Ask anything', max: 4000, canSend: true, onSend: vi.fn(), notes: [], attachments: [],
    onAddFiles: vi.fn(), onRemoveAttachment: vi.fn(), flash: false, onTyping: vi.fn(), ...o,
  };
  return { p, ...render(<Composer {...p} />) };
}
const box = () => screen.getByRole('textbox', { name: strings['agent.composer'] });

describe('a describing note with its own action', () => {
  it("the box's description is the note's text alone; the action stays a button of its own", () => {
    const end = <Button size="sm" variant="ghost" onPress={() => {}}>Don't send</Button>;
    mount({ notes: [{ key: 'queued', text: 'Queued. Sends when this reply ends, while this chat stays open.', status: true, describes: true, end }] });
    expect(box()).toHaveAccessibleDescription('Queued. Sends when this reply ends, while this chat stays open.');
    expect(screen.getByRole('button', { name: "Don't send" })).toBeInTheDocument();
  });
  it('a note in lines with an action describes the box by its lines only', () => {
    const end = <Button size="sm" variant="ghost" onPress={() => {}}>Dismiss</Button>;
    mount({ notes: [{ key: 'queued', text: ['Kept, not sent.', 'The reply stopped.'], describes: true, end }] });
    expect(box().getAttribute('aria-describedby')).toBeTruthy();
    expect(box()).toHaveAccessibleDescription('Kept, not sent. The reply stopped.');
  });
});

describe('removing a chip from the keyboard', () => {
  it('sends the focus to the message box', () => {
    const { p } = mount({ attachments: [{ id: 'f1', kind: 'text', name: 'ci.log', meta: '2 lines' }] });
    const x = screen.getByRole('button', { name: strings['agent.attRemove'].replace('{{name}}', 'ci.log') });
    act(() => { x.focus(); });
    fireEvent.keyDown(x, { key: 'Enter' });
    fireEvent.keyUp(x, { key: 'Enter' });
    expect(p.onRemoveAttachment).toHaveBeenCalledWith('f1');
    expect(document.activeElement).toBe(box());
  });
});
