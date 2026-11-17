// Vitest: the "/" menu's groups, hints and host commands. Rows that carry a group are listed under its header (an
// ARIA group named by it; the header is no option, so the arrows and the row ids count only the rows); typing narrows group by
// group and keeps the header of each group that still matches. A command with `run` is the host's: with nothing to type after
// it, the pick runs it; otherwise the pick writes "/name " and Send runs it with the words. Neither sends text to the agent,
// unless the host declines (run answers false). A hidden command is never listed but is still the host's when typed and sent.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer';
import { SlashMenu } from './SlashMenu';
import { slashMatches, slashRunOf, type ComposerSlash, type SlashCommand } from './slash';
import strings from './Conversation.strings.en.json';

const S = strings as Record<string, string>;
const items = (over: Partial<Record<string, Partial<SlashCommand>>> = {}): SlashCommand[] => [
  { name: 'fork', description: 'Fork from a turn', group: 'Conversation', hint: '[turn]', ...over.fork },
  { name: 'compact', description: 'Free up room', group: 'Conversation', ...over.compact },
  { name: 'usage', description: 'Usage and cost', group: 'Session', opens: 'Opens Usage', ...over.usage },
  { name: 'todos', description: 'The TODO list', group: 'Automation', ...over.todos },
  { name: 'commit', description: 'Write a commit message', group: 'Skills', ...over.commit },
  { name: 'exit', description: '', hidden: true, ...over.exit },
];

function Host(o: { slash: ComposerSlash; onSend?: () => void; canSend?: boolean }) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  return (
    <Composer
      draft={draft} setDraft={setDraft} inputRef={inputRef} placeholder="Ask anything" max={4000} canSend={o.canSend ?? draft.trim() !== ''}
      onSend={o.onSend ?? (() => {})} notes={[]} attachments={[]} onRemoveAttachment={() => {}} flash={false} onTyping={() => {}} slash={o.slash}
    />
  );
}
const box = () => screen.getByRole('textbox', { name: S['agent.composer'] }) as HTMLTextAreaElement;
const list = () => screen.queryByRole('listbox', { name: S['agent.slashList'] });
const names = () => within(list()!).getAllByRole('option').map((o) => o.querySelector('span span')!.textContent);
// The groups in order, each found by its computed accessible name (Testing Library resolves aria-labelledby): a group whose name
// were wrong would not be found.
const groups = () => {
  const all = within(list()!).queryAllByRole('group');
  return all.map((g) => (['Conversation', 'Session', 'Automation', 'Skills', 'A'].find((n) => within(list()!).queryByRole('group', { name: n }) === g) ?? '?'));
};
const optionsIn = (name: string) => within(within(list()!).getByRole('group', { name })).getAllByRole('option').map((o) => o.querySelector('span span')!.textContent);
const type = (v: string) => fireEvent.change(box(), { target: { value: v } });
const send = () => screen.getByRole('button', { name: new RegExp('^' + S['agent.send']) });

describe('slash.ts: groups and host commands', () => {
  it('slashMatches keeps groups in the host order, matches within each group, drops an empty group, never lists a hidden one', () => {
    const all = items();
    expect(slashMatches(all, '').map((c) => c.name)).toEqual(['fork', 'compact', 'usage', 'todos', 'commit']);
    // starts-with before holds, inside its own group only: "commit" (Skills) never jumps above "compact" (Conversation)
    expect(slashMatches(all, 'co').map((c) => c.name)).toEqual(['compact', 'commit']);
    expect(slashMatches(all, 'o').map((c) => c.name)).toEqual(['fork', 'compact', 'todos', 'commit']);
    expect(slashMatches([{ name: 'xco', description: '', group: 'A' }, { name: 'cox', description: '', group: 'A' }], 'co').map((c) => c.name)).toEqual(['cox', 'xco']);
    // a starts-with in a later group never jumps above a holds in an earlier one (no global starts-first pass)
    expect(slashMatches([{ name: 'xcom', description: '', group: 'A' }, { name: 'commit', description: '', group: 'B' }], 'co').map((c) => c.name)).toEqual(['xcom', 'commit']);
    expect(slashMatches(all, 'exit')).toEqual([]);
  });
  it('slashRunOf: the whole draft names a host command by its exact name; the words after it, trimmed', () => {
    const all = items({ fork: { run: () => {} }, usage: { run: () => {} }, exit: { run: () => {} } });
    expect(slashRunOf(all, '/fork')?.cmd.name).toBe('fork');
    expect(slashRunOf(all, '/fork 3 ')?.args).toBe('3');
    expect(slashRunOf(all, '/fork  2\n')?.args).toBe('2');
    expect(slashRunOf(all, '/exit')?.cmd.name).toBe('exit');
    expect(slashRunOf(all, '/Fork 3'), 'names are exact').toBeNull();
    expect(slashRunOf(all, '/compact'), 'no run: the agent\'s').toBeNull();
    expect(slashRunOf(all, 'please /fork')).toBeNull();
    expect(slashRunOf(all, ' /fork')).toBeNull();
    expect(slashRunOf(all, '/fork/x')).toBeNull();
  });
});

describe('the menu draws its groups', () => {
  it('a header per group (an ARIA group named by it), rows under it; the arrows move over rows only, across groups', () => {
    render(<Host slash={{ items: items() }} />);
    box().focus();
    type('/');
    expect(groups()).toEqual(['Conversation', 'Session', 'Automation', 'Skills']);
    expect(names()).toEqual(['/fork', '/compact', '/usage', '/todos', '/commit']);
    expect(optionsIn('Conversation')).toEqual(['/fork', '/compact']);
    expect(optionsIn('Skills')).toEqual(['/commit']);
    expect(within(list()!).queryByRole('option', { name: /^Conversation$/ }), 'no header is an option').toBeNull();
    const opts = within(list()!).getAllByRole('option');
    expect(opts.map((o) => o.id)).toEqual(opts.map((_, i) => `${list()!.id}-${i}`));
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(opts[2]).toHaveAttribute('aria-selected', 'true');
    expect(box().getAttribute('aria-activedescendant')).toBe(opts[2]!.id);
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    expect(within(list()!).getAllByRole('option')[4]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(box().value).toBe('/commit ');
  });
  it('typing keeps the header of every group that still matches, and only those', () => {
    render(<Host slash={{ items: items() }} />);
    type('/co');
    expect(groups()).toEqual(['Conversation', 'Skills']);
    type('/us');
    expect(groups()).toEqual(['Session']);
  });
  it('a row shows its hint after the name and what it opens', () => {
    render(<Host slash={{ items: items() }} />);
    type('/');
    const [fork, , usage] = within(list()!).getAllByRole('option');
    expect(fork).toHaveTextContent('/fork[turn]');
    expect(usage).toHaveTextContent('Opens Usage');
  });
  it('an empty group name is no group, in matching and drawing alike: no empty header, one run', () => {
    render(<Host slash={{ items: [{ name: 'compact', description: '', group: '' }, { name: 'commit', description: '' }, { name: 'clear', description: '', group: 'A' }] }} />);
    type('/c');
    expect(groups()).toEqual(['A']);
    expect(names()).toEqual(['/compact', '/commit', '/clear']);
  });
  it('the menu itself reads an empty group name as none: rows "", absent, "" draw as one ungrouped run', () => {
    const rows = [{ key: 'a', label: '/a', group: '' }, { key: 'b', label: '/b' }, { key: 'c', label: '/c', group: '' }];
    render(<SlashMenu id="m" label="Commands" rows={rows} active={0} note={null} onPick={() => {}} onActive={() => {}} />);
    const lb = screen.getByRole('listbox', { name: 'Commands' });
    expect(within(lb).queryAllByRole('group')).toEqual([]);
    expect(within(lb).getAllByRole('option').map((o) => o.id)).toEqual(['m-0', 'm-1', 'm-2']);
  });
  it('a list with no group draws no header (hosts that set none look as before)', () => {
    render(<Host slash={{ items: [{ name: 'compact', description: '' }, { name: 'commit', description: '' }] }} />);
    type('/');
    expect(within(list()!).queryAllByRole('group')).toEqual([]);
    expect(names()).toEqual(['/compact', '/commit']);
  });
});

describe('host commands', () => {
  it('one with nothing to type after it runs at the pick; the draft empties and nothing is sent', () => {
    const run = vi.fn();
    const onSend = vi.fn();
    render(<Host slash={{ items: items({ usage: { run } }) }} onSend={onSend} />);
    box().focus();
    type('/us');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(run).toHaveBeenCalledWith('');
    expect(box().value).toBe('');
    expect(list()).toBeNull();
    expect(onSend).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(box());
  });
  it('one with a hint is picked into the draft; Send then runs it with the words, and sends nothing', () => {
    const run = vi.fn();
    const onSend = vi.fn();
    render(<Host slash={{ items: items({ fork: { run } }) }} onSend={onSend} />);
    type('/fo');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(run).not.toHaveBeenCalled();
    expect(box().value).toBe('/fork ');
    type('/fork 3');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(run).toHaveBeenCalledWith('3');
    expect(box().value).toBe('');
    expect(onSend).not.toHaveBeenCalled();
  });
  it('a host that declines (run answers false) lets the text go to the agent as typed', () => {
    const onSend = vi.fn();
    render(<Host slash={{ items: items({ fork: { run: () => false } }) }} onSend={onSend} />);
    type('/fork 3');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(box().value).toBe('/fork 3');
  });
  it.each(['Enter', 'click'])('a no-hint command that declines at the pick (%s) is sent once as "/name", never run again', (how) => {
    const run = vi.fn(() => false as const);
    const onSend = vi.fn();
    const seen: string[] = [];
    render(<Host slash={{ items: items({ usage: { run } }) }} onSend={() => { seen.push(box().value); onSend(); }} />);
    box().focus();
    type('/us');
    if (how === 'Enter') fireEvent.keyDown(box(), { key: 'Enter' });
    else fireEvent.click(within(list()!).getByRole('option'));
    expect(run).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(['/usage']);
    expect(list()).toBeNull();
  });
  it.each(['Enter', 'click'])('a no-hint command that declines at the pick (%s) when the chat cannot send is written as "/name ", nothing sent', (how) => {
    const run = vi.fn(() => false as const);
    const onSend = vi.fn();
    render(<Host slash={{ items: items({ usage: { run } }) }} onSend={onSend} canSend={false} />);
    box().focus();
    type('/us');
    if (how === 'Enter') fireEvent.keyDown(box(), { key: 'Enter' });
    else fireEvent.click(within(list()!).getByRole('option'));
    expect(run).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
    expect(box().value).toBe('/usage ');
    expect(list()).toBeNull();
  });
  it('a hidden command is never listed, but typed and sent it is the host\'s, never the agent\'s', () => {
    const run = vi.fn();
    const onSend = vi.fn();
    render(<Host slash={{ items: items({ exit: { run } }) }} onSend={onSend} />);
    type('/ex');
    expect(list() && within(list()!).queryAllByRole('option')).toBeFalsy();
    type('/exit');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(run).toHaveBeenCalledWith('');
    expect(onSend).not.toHaveBeenCalled();
  });
  it('Send is pressable for a host command even while the chat cannot take a message', () => {
    const run = vi.fn();
    render(<Host slash={{ items: items({ usage: { run, hint: '' } }) }} canSend={false} />);
    type('/usage');
    expect(send()).not.toBeDisabled();
    fireEvent.click(send());
    expect(run).toHaveBeenCalledWith('');
    type('hello');
    expect(send()).toBeDisabled();
  });
});
