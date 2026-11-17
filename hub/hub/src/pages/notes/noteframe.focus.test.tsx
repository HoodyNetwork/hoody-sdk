// Vitest: a note made just now takes the keyboard into its frame when Notes has drawn it, but never from a person who
// did anything (a press, a key) since the frame appeared. Any other note's frame never takes focus.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoteFrame } from './parts/NoteFrame';

const SRC = 'https://notes.fixture.invalid/notebook/a1b2c3d4e5f6a7b8c9d0e1f2/0f0e0d0c0b0a090807060504?sidebar=hidden';
const frame = () => document.querySelector('iframe') as HTMLIFrameElement;
const show = (focus: boolean) =>
  render(
    <>
      <button type="button">Elsewhere</button>
      <NoteFrame src={SRC} title="Q4 plan" tabUrl={SRC} focus={focus} />
    </>,
  );

describe('NoteFrame focus', () => {
  it('a new note: the frame takes focus on load when the person did nothing since it appeared', () => {
    show(true);
    // Focus given back to what opened the dialog is not the person's move.
    screen.getByRole('button', { name: 'Elsewhere' }).focus();
    fireEvent.load(frame());
    expect(document.activeElement).toBe(frame());
  });

  it.each(['pointerDown', 'keyDown'] as const)('a new note: after a %s anywhere, at once or later, the frame never takes focus', (how) => {
    show(true);
    const other = screen.getByRole('button', { name: 'Elsewhere' });
    // Right after the frame appeared (well inside any settle time), the person goes elsewhere.
    fireEvent[how](other, how === 'keyDown' ? { key: 'Tab' } : {});
    other.focus();
    fireEvent.load(frame());
    expect(document.activeElement).toBe(other);
    // Once decided, a later load does not take it either.
    other.blur();
    fireEvent.load(frame());
    expect(document.activeElement).not.toBe(frame());
  });

  it('any other note: the frame never takes focus', () => {
    show(false);
    fireEvent.load(frame());
    expect(document.activeElement).not.toBe(frame());
  });
});
