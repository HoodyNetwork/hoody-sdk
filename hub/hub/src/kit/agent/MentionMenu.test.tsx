// The composer's "@" file picker: the pure rules (mention.ts) and the menu in a controlled composer. The host's
// folder reads are a fake here: want(dir) is recorded and answered from a small tree.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Composer, type ComposerProps } from './Composer';
import { MENTION_MAX, mentionAt, mentionInsert, mentionMatches, mentionSplit, type ComposerMention, type MentionEntry } from './mention';
import strings from './Conversation.strings.en.json';

const S = strings as Record<string, string>;
const d = (name: string): MentionEntry => ({ name, dir: true });
const f = (name: string): MentionEntry => ({ name, dir: false });
const TREE: Record<string, MentionEntry[]> = {
  '': [d('src'), d('my docs'), f('README.md'), f('.env'), d('.git'), f('notes.txt')],
  'src/': [d('kit'), f('main.ts'), f('mail.ts')],
  'src/kit/': [f('a.ts')],
  'empty/': [],
  'dots/': [f('.hidden')],
};

describe('mention.ts', () => {
  it('mentionAt: an "@" at the draft start or after whitespace, up to the caret, with no whitespace in it', () => {
    expect(mentionAt('@', 1)).toEqual({ start: 0, query: '' });
    expect(mentionAt('see @src/ma', 11)).toEqual({ start: 4, query: 'src/ma' });
    expect(mentionAt('one\n@x', 6)).toEqual({ start: 4, query: 'x' });
    expect(mentionAt('a\t@x', 4)).toEqual({ start: 2, query: 'x' });
    expect(mentionAt('mail ada@b.c', 12), 'an email').toBeNull();
    expect(mentionAt('x/@y', 4), 'inside a path').toBeNull();
    expect(mentionAt('word@', 5), 'mid-word').toBeNull();
    expect(mentionAt('@src done', 9), 'a space after the token ends it').toBeNull();
    expect(mentionAt('@src', 0), 'the caret before the "@"').toBeNull();
    expect(mentionAt('@src/kit', 4), 'only up to the caret').toEqual({ start: 0, query: 'src' });
  });
  it('mentionSplit: the folder part and the name; a leading "/" or "~" or any ".." segment leaves the folder', () => {
    expect(mentionSplit('')).toEqual({ dir: '', name: '' });
    expect(mentionSplit('src/ma')).toEqual({ dir: 'src/', name: 'ma' });
    expect(mentionSplit('src/kit/')).toEqual({ dir: 'src/kit/', name: '' });
    for (const q of ['/', '/etc/pass', '~/x', '..', '../', '../x', 'src/../..', 'src/..', 'a/../b', '..x', '..secret/', 'a/b..c']) expect(mentionSplit(q), q).toBe('outside');
    expect(mentionSplit('.env'), 'one dot is a dotfile, inside').toEqual({ dir: '', name: '.env' });
  });
  it('mentionMatches: folders first, starts-with before contains, dotfiles only after a typed dot, at most MENTION_MAX', () => {
    expect(mentionMatches(TREE['']!, '').map((e) => e.name)).toEqual(['src', 'my docs', 'README.md', 'notes.txt']);
    expect(mentionMatches(TREE['src/']!, 'ma').map((e) => e.name)).toEqual(['main.ts', 'mail.ts']);
    expect(mentionMatches([f('xsrc'), d('src'), f('src.md')], 'src').map((e) => e.name)).toEqual(['src', 'src.md', 'xsrc']);
    expect(mentionMatches(TREE['']!, '.').map((e) => e.name)).toEqual(['.git', '.env']);
    expect(mentionMatches(TREE['']!, 'E').map((e) => e.name), 'case ignored').toEqual(['README.md', 'notes.txt']);
    const many = Array.from({ length: 80 }, (_, i) => f(`f${i}`));
    expect(mentionMatches(many, '')).toHaveLength(MENTION_MAX);
  });
  it('mentionInsert: a folder goes one level down, a file ends with a space, whitespace or a quote is quoted and closes', () => {
    expect(mentionInsert('', d('src'))).toEqual({ text: '@src/', open: true });
    expect(mentionInsert('src/', f('main.ts'))).toEqual({ text: '@src/main.ts ', open: false });
    expect(mentionInsert('', d('my docs'))).toEqual({ text: '@"my docs/" ', open: false });
    expect(mentionInsert('', f('a "b".txt'))).toEqual({ text: '@"a \\"b\\".txt" ', open: false });
  });
});

/** A controlled composer with a fake folder host: want(dir) is recorded; entries answer from TREE once `answered`. */
/** `manual`: the host answers a new folder only when the "answer" button is pressed (until then it still holds the last one's
 *  entries, as a real read does for a moment). `outside`: the host says the folder is out of the chat's folder by a link. */
function Host(o: { start?: string; read?: 'ok' | 'reading' | 'failed'; talk?: ComposerProps['talk']; asked?: Array<string | null>; manual?: boolean; outside?: boolean }) {
  const [draft, setDraft] = useState(o.start ?? '');
  const [dir, setDir] = useState<string | null>(null);
  const [answered, setAnswered] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const read = o.read ?? 'ok';
  const shown = o.manual ? answered : dir;
  const mention: ComposerMention = {
    entries: shown !== null && read === 'ok' && !o.outside ? (TREE[shown] ?? []) : [],
    dir: read === 'ok' && !o.outside ? shown : null,
    reading: read === 'reading',
    failed: read === 'failed',
    ...(o.outside ? { outside: true } : {}),
    want: (x) => { o.asked?.push(x); setDir(x); },
  };
  return (
    <>
    <button type="button" onClick={() => setAnswered(dir)}>answer</button>
    <Composer
      draft={draft} setDraft={setDraft} inputRef={inputRef} placeholder="Ask anything" max={4000} canSend={draft.trim() !== ''}
      onSend={() => {}} notes={[]} attachments={[]} onRemoveAttachment={() => {}} flash={false} onTyping={() => {}}
      talk={o.talk} mention={mention}
    />
    </>
  );
}
const box = () => screen.getByRole('textbox', { name: S['agent.composer'] }) as HTMLTextAreaElement;
const list = () => screen.queryByRole('listbox', { name: S['agent.mentionList'] });
const names = () => within(list()!).getAllByRole('option').map((o) => o.querySelector('span span')!.textContent);
/** Types `v` with the caret at its end (a change, then the caret where the browser leaves it). */
const type = (v: string) => {
  fireEvent.change(box(), { target: { value: v, selectionStart: v.length, selectionEnd: v.length } });
};
const note = () => screen.queryByRole('status')?.textContent ?? null;

describe('the "@" menu opens only at a word start', () => {
  it('an "@" at the start or after a space lists the chat folder: folders first, no dotfiles', () => {
    const asked: Array<string | null> = [];
    render(<Host asked={asked} />);
    type('@');
    expect(names()).toEqual(['src/', 'my docs/', 'README.md', 'notes.txt']);
    expect(asked.at(-1), 'the chat folder itself is read').toBe('');
    type('look at ');
    expect(list()).toBeNull();
    type('look at @RE');
    expect(names()).toEqual(['README.md']);
  });
  for (const [what, v] of [['an email', 'mail ada@'], ['a path', 'x/@'], ['a word', 'word@']] as const) {
    it(`an "@" inside ${what} is plain text: no menu, nothing read`, () => {
      const asked: Array<string | null> = [];
      render(<Host asked={asked} />);
      type(v);
      expect(list()).toBeNull();
      expect(asked.filter((x) => x !== null)).toEqual([]);
    });
  }
  it('dotfiles show only once a dot is typed; a folder of only dotfiles says how to list them', () => {
    render(<Host />);
    type('@.');
    expect(names()).toEqual(['.git/', '.env']);
    type('@dots/');
    expect(list()).toBeNull();
    expect(note()).toBe(S['agent.mentionHidden']);
  });
});

describe('the "@" menu never leaves the chat folder', () => {
  for (const v of ['@/', '@/etc/', '@../', '@src/../../', '@..', '@~/', '@..secret/']) {
    it(`"${v}" says only files in this folder, and nothing is read`, () => {
      const asked: Array<string | null> = [];
      render(<Host asked={asked} />);
      type(v);
      expect(note()).toBe(S['agent.mentionOutside']);
      expect(asked.at(-1), 'the host is told to read nothing').toBeNull();
      expect(asked.filter((x) => x !== null)).toEqual([]);
    });
  }
});

describe('picking writes the path and sends nothing', () => {
  it('a folder goes one level down (the menu stays), a file ends the token with a space and closes it', () => {
    const asked: Array<string | null> = [];
    render(<Host asked={asked} start="fix " />);
    box().focus();
    type('fix @');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(box().value).toBe('fix @src/');
    expect(asked.at(-1)).toBe('src/');
    expect(names()).toEqual(['kit/', 'main.ts', 'mail.ts']);
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    fireEvent.keyDown(box(), { key: 'Tab' });
    expect(box().value).toBe('fix @src/main.ts ');
    expect(list()).toBeNull();
    expect(document.activeElement).toBe(box());
    expect(box().selectionStart, 'the caret after what was written').toBe('fix @src/main.ts '.length);
  });
  it('text after the token is kept; a click picks too and keeps focus in the box', () => {
    render(<Host />);
    box().focus();
    fireEvent.change(box(), { target: { value: '@REA please', selectionStart: 4, selectionEnd: 4 } });
    const row = within(list()!).getByRole('option', { name: /README\.md/u });
    fireEvent.mouseDown(row);
    fireEvent.click(row);
    expect(box().value).toBe('@README.md please');
  });
  it('a pick with the caret inside the token replaces the whole token, the part after the caret too', () => {
    render(<Host />);
    box().focus();
    fireEvent.change(box(), { target: { value: '@REdme now', selectionStart: 3, selectionEnd: 3 } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(box().value).toBe('@README.md now');
  });
  it('right after going down, the last folder\'s entries are never offered as this one\'s: it reads, and Enter writes nothing', () => {
    render(<Host manual />);
    box().focus();
    type('@');
    fireEvent.click(screen.getByRole('button', { name: 'answer' }));
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(box().value).toBe('@src/');
    expect(list(), 'no rows of the chat folder under src/').toBeNull();
    expect(note()).toBe(S['agent.mentionReading']);
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(box().value, 'Enter picks nothing while it reads').toBe('@src/');
    fireEvent.click(screen.getByRole('button', { name: 'answer' }));
    expect(names()).toEqual(['kit/', 'main.ts', 'mail.ts']);
  });
  it('a folder the host says is out of the chat folder by a link says only files in this folder', () => {
    render(<Host outside />);
    type('@link/');
    expect(list()).toBeNull();
    expect(note()).toBe(S['agent.mentionOutside']);
  });
  it('a folder with a space is written quoted and closes the menu', () => {
    render(<Host />);
    type('@my');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(box().value).toBe('@"my docs/" ');
    expect(list()).toBeNull();
  });
  it('Escape closes the menu only for this token; typing on in it keeps it closed; a new "@" opens again', () => {
    render(<Host />);
    type('@s');
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(list()).toBeNull();
    type('@sr');
    expect(list(), 'the same token stays closed').toBeNull();
    type('@sr @');
    expect(list()).not.toBeNull();
  });
  it('plain arrows only: Shift/Alt/Ctrl/Meta arrows are the box\'s own', () => {
    render(<Host />);
    type('@');
    for (const mod of ['shiftKey', 'altKey', 'ctrlKey', 'metaKey']) {
      const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true, [mod]: true });
      box().dispatchEvent(ev);
      expect(ev.defaultPrevented, mod).toBe(false);
    }
    expect(within(list()!).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    for (const key of ['Enter', 'Tab']) for (const mod of ['shiftKey', 'altKey', 'ctrlKey', 'metaKey']) {
      const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, [mod]: true });
      box().dispatchEvent(ev);
      expect(box().value, `${mod}+${key} picks nothing`).toBe('@');
    }
  });
});

describe('what the menu says', () => {
  it('reading, failed, an empty folder and no match each say so', () => {
    const { unmount } = render(<Host read="reading" />);
    type('@');
    expect(note()).toBe(S['agent.mentionReading']);
    unmount();
    const b = render(<Host read="failed" />);
    type('@');
    expect(note()).toBe(S['agent.mentionFailed']);
    b.unmount();
    render(<Host />);
    type('@empty/');
    expect(note()).toBe(S['agent.mentionNone']);
    type('@zzz');
    expect(note()).toBe(S['agent.mentionNoMatch']!.replace('{{query}}', 'zzz'));
  });
  it('while Talk holds the action row there is no "@" menu', () => {
    render(<Host talk={<span>talk</span>} />);
    type('@');
    expect(list()).toBeNull();
  });
  it('leaving the box closes the menu', () => {
    render(<Host />);
    box().focus();
    type('@');
    act(() => { box().blur(); });
    expect(list()).toBeNull();
  });
});
