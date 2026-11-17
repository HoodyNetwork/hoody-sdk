// The add button's two shapes and the plate look. Without `addMenu` "+" opens the file picker itself; with it "+" is one kit menu:
// Upload files first (the same picker), then the host's sources. `plate` is a look only: Send keeps its name and its reason.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Composer, type ComposerProps } from './Composer';
import strings from './Conversation.strings.en.json';
import s from './Conversation.module.css';

function mount(o: Partial<ComposerProps> = {}) {
  const p: ComposerProps = {
    draft: 'hello', setDraft: vi.fn(), inputRef: createRef<HTMLTextAreaElement>() as RefObject<HTMLTextAreaElement | null>,
    placeholder: 'Ask anything', max: 4000, canSend: true, onSend: vi.fn(), notes: [], attachments: [],
    onAddFiles: vi.fn(), onRemoveAttachment: vi.fn(), flash: false, onTyping: vi.fn(), ...o,
  };
  const r = render(<Composer {...p} />);
  return { p, ...r };
}
const send = () => screen.getByRole('button', { name: strings['agent.send'] });
const frame = () => screen.getByRole('textbox', { name: strings['agent.composer'] }).parentElement!;

describe('Composer add menu', () => {
  const file = new File(['x'], 'a.png', { type: 'image/png' });

  it('with addMenu: "+" opens one menu, Upload files first, then the host items in order; nothing else', () => {
    const computer = vi.fn(), notes = vi.fn();
    mount({ addMenu: [{ id: 'computer', label: 'From a computer…', onAction: computer }, { id: 'notes', label: 'Notes…', onAction: notes }] });
    fireEvent.click(screen.getByRole('button', { name: strings['agent.add'] }));
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([expect.stringContaining(strings['agent.addUpload']), expect.stringContaining('From a computer…'), expect.stringContaining('Notes…')]);
    fireEvent.click(items[2]!);
    expect(notes).toHaveBeenCalledTimes(1);
    expect(computer).not.toHaveBeenCalled();
  });

  it('Upload files opens the same file picker, whose pick goes to onAddFiles', () => {
    const { p, container } = mount({ addMenu: [{ id: 'notes', label: 'Notes…', onAction: vi.fn() }] });
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: strings['agent.add'] }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['agent.addUpload'].replace('…', '')) }));
    expect(click).toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [file] } });
    expect(p.onAddFiles).toHaveBeenCalledWith([file]);
  });

  it('without addMenu "+" is the file picker button, and no menu exists', () => {
    const { container } = mount();
    const click = vi.spyOn(container.querySelector('input[type=file]') as HTMLInputElement, 'click');
    fireEvent.click(screen.getByRole('button', { name: strings['agent.attach'] }));
    expect(click).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('button', { name: strings['agent.add'] })).toBeNull();
  });

  it('a composer that takes no files has no add menu, whatever the host passes', () => {
    mount({ onAddFiles: undefined, addMenu: [{ id: 'notes', label: 'Notes…', onAction: vi.fn() }] });
    expect(screen.queryByRole('button', { name: strings['agent.add'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['agent.attach'] })).toBeNull();
  });
});

describe('Composer plate', () => {
  it('absent: the box keeps its own look', () => {
    mount();
    expect(frame()).toHaveClass(s.composer!);
    expect(frame()).not.toHaveClass(s.plate!);
  });

  it('on: the box is the plate; Send is named Send and keeps its reason whether it can send or not', () => {
    const r = mount({ plate: true });
    expect(frame()).toHaveClass(s.composer!, s.plate!);
    expect(send()).toBeEnabled();
    r.unmount();
    mount({ plate: true, canSend: false, sendWhy: 'Pick a model first', sendQuiet: true });
    expect(frame()).toHaveClass(s.plate!);
    expect(send()).toHaveAccessibleDescription('Pick a model first');
  });
});
