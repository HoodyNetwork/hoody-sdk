// Vitest: the composer's "/" menu. It opens only on a "/" into an EMPTY draft (or the "/" button on an empty
// draft), shows the host's commands while the whole draft is one command being typed, and picking only writes "/name " into the
// draft. The box keeps focus and the keys; nothing sends itself. A "/" anywhere else is plain text.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Composer, type ComposerProps } from './Composer';
import { slashMatches, slashQuery, type ComposerSlash } from './slash';
import strings from './Conversation.strings.en.json';

const S = strings as Record<string, string>;
const CMDS: ComposerSlash = {
  items: [
    { name: 'compact', description: 'Summarise the earlier messages' },
    { name: 'commit', description: 'Write a commit message' },
    { name: 'review', description: 'Review the change', untrusted: true },
  ],
};

/** A controlled composer: the draft lives here, as in every host. */
function Host(o: { slash?: ComposerSlash | null; onSend?: () => void; onEmptyEscape?: () => void; start?: string; talk?: ComposerProps['talk'] }) {
  const [draft, setDraft] = useState(o.start ?? '');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  return (
    <Composer
      draft={draft} setDraft={setDraft} inputRef={inputRef} placeholder="Ask anything" max={4000} canSend={draft.trim() !== ''}
      onSend={o.onSend ?? (() => {})} notes={[]} attachments={[]} onRemoveAttachment={() => {}} flash={false} onTyping={() => {}}
      onEmptyEscape={o.onEmptyEscape} talk={o.talk} slash={o.slash === undefined ? CMDS : o.slash}
    />
  );
}
const box = () => screen.getByRole('textbox', { name: S['agent.composer'] }) as HTMLTextAreaElement;
const list = () => screen.queryByRole('listbox', { name: S['agent.slashList'] });
const names = () => within(list()!).getAllByRole('option').map((o) => o.querySelector('span span')!.textContent);
const type = (v: string) => fireEvent.change(box(), { target: { value: v } });
const slashBtn = () => screen.getByRole('button', { name: new RegExp('^' + S['agent.slash']) }) as HTMLButtonElement;

describe('slash.ts', () => {
  it('slashQuery: only a draft that is one command being typed', () => {
    expect(slashQuery('/')).toBe('');
    expect(slashQuery('/com')).toBe('com');
    expect(slashQuery('/compact now')).toBeNull();
    expect(slashQuery('a/b')).toBeNull();
    expect(slashQuery(' /x')).toBeNull();
    expect(slashQuery('')).toBeNull();
  });
  it('slashMatches: starts-with first, then contains, case ignored, the host order kept', () => {
    expect(slashMatches(CMDS.items, 'CO').map((c) => c.name)).toEqual(['compact', 'commit']);
    expect(slashMatches(CMDS.items, 'mi').map((c) => c.name)).toEqual(['commit']);
    expect(slashMatches(CMDS.items, 'e').map((c) => c.name)).toEqual(['review']);
    expect(slashMatches(CMDS.items, 'zz')).toEqual([]);
    expect(slashMatches(CMDS.items, '').map((c) => c.name)).toEqual(['compact', 'commit', 'review']);
  });
});

describe('the "/" menu opens only at the start of an empty draft', () => {
  it('a "/" into an empty draft lists every command; typing on narrows them', () => {
    render(<Host />);
    type('/');
    expect(names()).toEqual(['/compact', '/commit', '/review']);
    type('/rev');
    expect(names()).toEqual(['/review']);
  });
  it('a "/" after other text, inside a word or after a space never opens it', () => {
    render(<Host start="see" />);
    type('see /');
    expect(list()).toBeNull();
    type('a/b');
    expect(list()).toBeNull();
    type(' /');
    expect(list()).toBeNull();
  });
  it('a pasted "/com" into an empty draft opens it narrowed', () => {
    render(<Host />);
    type('/com');
    expect(names()).toEqual(['/compact', '/commit']);
  });
  it('a space or any text after the command closes it, and it stays closed for that draft', () => {
    render(<Host />);
    type('/com');
    type('/com ');
    expect(list()).toBeNull();
    type('/com');
    expect(list(), 'not opened again by taking the space back').toBeNull();
  });
  it('a pasted draft that is not one command never arms it: editing it down to a command later does not open it', () => {
    // "/compact now" pasted into an empty draft, then " now" deleted
    render(<Host />);
    type('/compact now');
    expect(list()).toBeNull();
    type('/compact');
    expect(list(), 'the draft was not empty when this edit was made').toBeNull();
  });
  it('without commands from the host there is no "/" button and no menu', () => {
    render(<Host slash={null} />);
    type('/');
    expect(list()).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp('^' + S['agent.slash']) })).toBeNull();
  });
});

describe('picking writes the command and sends nothing', () => {
  it('arrows move the active row (the box names it), Enter picks it: "/name " in the draft, focus kept, no send', () => {
    const onSend = vi.fn();
    render(<Host onSend={onSend} />);
    box().focus();
    type('/');
    expect(box().getAttribute('aria-activedescendant')).toBe(within(list()!).getAllByRole('option')[0]!.id);
    expect(box()).toHaveAttribute('aria-controls', list()!.id);
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    const opts = within(list()!).getAllByRole('option');
    expect(opts[1]).toHaveAttribute('aria-selected', 'true');
    expect(box().getAttribute('aria-activedescendant')).toBe(opts[1]!.id);
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    expect(within(list()!).getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(box().value).toBe('/review ');
    expect(onSend).not.toHaveBeenCalled();
    expect(list()).toBeNull();
    expect(document.activeElement).toBe(box());
    expect(box()).not.toHaveAttribute('aria-activedescendant');
  });
  it('Shift, Alt, Ctrl and Meta arrows are the box\'s own (text selection and navigation): the active row stays', () => {
    render(<Host />);
    box().focus();
    type('/');
    for (const mod of ['shiftKey', 'altKey', 'ctrlKey', 'metaKey']) {
      const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true, [mod]: true });
      box().dispatchEvent(ev);
      expect(ev.defaultPrevented, mod).toBe(false);
      expect(within(list()!).getAllByRole('option')[0], mod).toHaveAttribute('aria-selected', 'true');
    }
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(within(list()!).getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
  });
  it('the row the arrows choose is scrolled into view (a long list scrolls; Enter never picks an unseen row)', () => {
    const many: ComposerSlash = { items: Array.from({ length: 12 }, (_, i) => ({ name: `cmd${String(i).padStart(2, '0')}`, description: '' })) };
    const seen: string[] = [];
    // jsdom draws nothing and has no scrollIntoView: record which row is asked to come into view
    const had = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: function (this: Element) { seen.push(this.id); } });
    try {
      const { rerender } = render(<Host slash={many} />);
      box().focus();
      type('/');
      for (let i = 0; i < 10; i++) fireEvent.keyDown(box(), { key: 'ArrowDown' });
      const opts = within(list()!).getAllByRole('option');
      expect(opts[10]).toHaveAttribute('aria-selected', 'true');
      expect(seen.at(-1), 'the chosen row was brought into view').toBe(opts[10]!.id);
      // an unrelated render (the host draws again, a fresh list of the same rows) asks nothing: a wheel-scrolled list stays put
      const asked = seen.length;
      rerender(<Host slash={many} />);
      rerender(<Host slash={many} />);
      expect(seen.length, 'no scroll on a render that did not move the chosen row').toBe(asked);
      fireEvent.keyDown(box(), { key: 'Enter' });
      expect(box().value).toBe('/cmd10 ');
    } finally {
      if (had) Object.defineProperty(Element.prototype, 'scrollIntoView', had);
      else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
  it('Tab picks too; a click on a row picks it and the press keeps focus in the box', () => {
    render(<Host />);
    box().focus();
    type('/co');
    fireEvent.keyDown(box(), { key: 'Tab' });
    expect(box().value).toBe('/compact ');
    type('');
    type('/');
    const row = within(list()!).getAllByRole('option')[1]!;
    const down = fireEvent.mouseDown(row);
    expect(down, 'the press is held so focus stays in the box').toBe(false);
    fireEvent.click(row);
    expect(box().value).toBe('/commit ');
    expect(document.activeElement).toBe(box());
  });
  it('an untrusted skill shows its mark and can still be picked (the agent decides what it runs)', () => {
    render(<Host />);
    type('/rev');
    const row = within(list()!).getByRole('option');
    expect(row).toHaveTextContent(S['agent.slashUntrusted']!);
    expect(row).toHaveTextContent('Review the change');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(box().value).toBe('/review ');
  });
  it('Escape closes the menu only (the host never hears it); Enter then sends the text as typed', () => {
    const onSend = vi.fn();
    const onEmptyEscape = vi.fn();
    render(<Host onSend={onSend} onEmptyEscape={onEmptyEscape} />);
    type('/co');
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(list()).toBeNull();
    expect(onEmptyEscape).not.toHaveBeenCalled();
    expect(box().value).toBe('/co');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
  });
  it('nothing matches: the menu says so, and Enter sends what was typed (the agent answers it)', () => {
    const onSend = vi.fn();
    render(<Host onSend={onSend} />);
    type('/zzz');
    expect(screen.getByRole('status')).toHaveTextContent(S['agent.slashNoMatch']!.replace('{{query}}', 'zzz'));
    expect(screen.queryByRole('option')).toBeNull();
    expect(box()).not.toHaveAttribute('aria-activedescendant');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
  });
  it('a list still being read, or one that failed, says so beside what is known', () => {
    const r = render(<Host slash={{ items: [CMDS.items[0]!], reading: true }} />);
    type('/');
    expect(names()).toEqual(['/compact']);
    expect(screen.getByRole('status')).toHaveTextContent(S['agent.slashReading']!);
    r.unmount();
    render(<Host slash={{ items: [CMDS.items[0]!], failed: true }} />);
    type('/');
    expect(screen.getByRole('status')).toHaveTextContent(S['agent.slashFailed']!);
  });
  it('no commands at all: the menu says there are none', () => {
    render(<Host slash={{ items: [] }} />);
    type('/');
    expect(screen.getByRole('status')).toHaveTextContent(S['agent.slashNone']!);
  });
  it('leaving the box closes the menu', () => {
    render(<Host />);
    box().focus();
    type('/');
    act(() => { box().blur(); });
    expect(list()).toBeNull();
  });
});

describe('the "/" button', () => {
  it('on an empty draft it writes "/" and opens the menu, focus in the box; with text it waits and says why', () => {
    render(<Host />);
    expect(slashBtn()).not.toHaveAttribute('aria-disabled');
    fireEvent.click(slashBtn());
    expect(box().value).toBe('/');
    expect(names()).toEqual(['/compact', '/commit', '/review']);
    expect(document.activeElement).toBe(box());
    type('hello');
    expect(slashBtn()).toHaveAttribute('aria-disabled', 'true');
    expect(slashBtn()).toHaveAccessibleDescription(S['agent.slashEmptyOnly']!);
  });
  it('while Talk holds the action row the button is not drawn (the row is Talk\'s), and Talk\'s row is unchanged', () => {
    render(<Host talk={<button type="button">End</button>} />);
    expect(screen.queryByRole('button', { name: new RegExp('^' + S['agent.slash']) })).toBeNull();
    expect(screen.getByRole('button', { name: 'End' })).toBeInTheDocument();
  });
});
