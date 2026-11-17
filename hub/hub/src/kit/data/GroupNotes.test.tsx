// Vitest: one shared piece for what a list says about one of its
// computers (its read failed, it is off, it lists fewer than it has, its items are paused). In the computer's own group
// (TableGroup.note) each note is a flush Band with no name (the group header names it) and each action's name says
// which computer it acts on, since a screen reader moving between buttons does not hear the header. Outside a group (a
// notices strip above an ungrouped list) each note names its computer.
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroupNotes } from './GroupNotes';
import strings from './GroupNotes.strings.en.json';

afterEach(cleanup);

const notes = (retry = () => undefined) => [
  { id: 'failed', text: 'Its list could not be read.', tone: 'warn' as const, action: { label: 'Try again', onPress: retry } },
  { id: 'more', text: 'It has more than the list shows.' },
];

describe('GroupNotes', () => {
  it('in a group: one flush Band per note, no computer name in the words, the action named for the computer', async () => {
    const retry = vi.fn();
    const { container } = render(<GroupNotes name="atlas" notes={notes(retry)} />);
    expect(container.querySelectorAll(':scope > [data-band-flush]')).toHaveLength(2);
    expect(container.textContent).not.toContain('atlas');
    const b = screen.getByRole('button', { name: strings['groupNotes.actionOn'].replace('{{action}}', 'Try again').replace('{{name}}', 'atlas') });
    expect(b).toHaveTextContent(/^Try again$/);
    await userEvent.click(b);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('outside a group (named): each note says its computer, and the action keeps its short name', () => {
    render(<GroupNotes name="atlas" named notes={notes()} />);
    expect(screen.getByText(strings['groupNotes.named'].replace('{{name}}', 'atlas').replace('{{note}}', 'Its list could not be read.'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('a strip over several computers (of): each note names its own, and its action is named for it', () => {
    const go = vi.fn();
    render(<GroupNotes notes={[{ id: 'a', of: 'atlas', text: 'Turned off.' }, { id: 'c', of: 'cedar', text: 'Did not answer.', action: { label: 'Try again', onPress: go } }]} />);
    expect(screen.getByText('atlas: Turned off.')).toBeInTheDocument();
    expect(screen.getByText('cedar: Did not answer.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again on cedar' })).toBeInTheDocument();
  });

  it('draws nothing with no notes', () => {
    const { container } = render(<GroupNotes name="atlas" notes={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('a busy action refuses presses', async () => {
    const resume = vi.fn();
    render(<GroupNotes name="atlas" notes={[{ id: 'paused', text: '2 paused', icon: 'pause', action: { label: 'Resume', onPress: resume, busy: true, kind: 'button' } }]} />);
    await userEvent.click(screen.getByRole('button', { name: /Resume/ }));
    expect(resume).not.toHaveBeenCalled();
  });
});

// One shared piece, not copies: every list that groups by computer draws its computers' notes through it.
describe('the lists grouped by computer use GroupNotes', () => {
  const src = (rel: string) => readFileSync(path.join(__dirname, '../../pages', rel), 'utf8');
  it.each([
    ['bots/view.tsx', /function ComputerNotes\b[\s\S]*?<Band/],
    ['scripts/parts/List.tsx', /problems\.label/],
    ['ai/parts/ChatList.tsx', null],
  ] as const)('%s', (file, old) => {
    const code = src(file);
    expect(code).toMatch(/\bGroupNotes\b/);
    // The hand-built copy it replaced is gone.
    if (old) expect(code).not.toMatch(old);
  });
});
