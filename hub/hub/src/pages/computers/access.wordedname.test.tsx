// Vitest (WCAG 2.5.3 label in name): the worded padlock (the Computers card footer)
// shows a short word for its access state; its accessible name must contain those shown words, so a speech user who
// says what they see reaches it. The icon-only padlock keeps its long name ("Access of <name>: <state>").
import { describe, expect, it } from 'vitest';
import { render, screen } from '@app/testing';
import { AccessLock } from './parts/Bits';
import { computers } from './fixtures';
import { access } from './logic';
import strings from './strings.en.json';

const base = computers[0]!;
// One computer per access state, from the fields access() reads.
const states = [
  ['set', { proxy_permissions_scope: 'computer', has_proxy_permissions: true }],
  ['open', { proxy_permissions_scope: 'none', has_proxy_permissions: false }],
  ['unchecked', { proxy_permissions_scope: 'unknown', has_proxy_permissions: null }],
  ['unknown', { proxy_permissions_scope: undefined, has_proxy_permissions: undefined }],
] as const;
// The worded name per state: the long name where the shown word is the long state (set, unchecked, open); unknown
// shows a short word of its own, so its name is that word then the state's sentence.
const longName = (state: string) => `Access of cedar: ${strings[`access.${state}` as keyof typeof strings]}`;
const expected: Record<string, string> = {
  set: longName('set'),
  unchecked: longName('unchecked'),
  unknown: `Access of cedar: ${strings['access.short.unknown']}. ${strings['access.unknown.body'].replace('{{name}}', 'cedar')}`,
  open: longName('open'),
};
// axe's label-content-name-mismatch compares words: lower case, punctuation and symbols dropped, spaces folded.
const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

describe('computers: the worded padlock is named with the words it shows', () => {
  for (const [state, fields] of states) {
    it(`state ${state}: the name contains the shown words, and still names the computer`, () => {
      const c = { ...base, ...fields, name: 'cedar' } as typeof base;
      expect(access(c).state).toBe(state);
      const { unmount } = render(<AccessLock computer={c} worded />);
      const b = screen.getByRole('button');
      const shown = words(b.textContent ?? '');
      // A card button always says something: a bare dash read as an empty "– ›" button on every card.
      expect(shown, 'the button shows words, never a bare dash').toMatch(/\p{L}/u);
      expect(shown).toBe(words(strings[`access.short.${state}`]));
      const name = b.getAttribute('aria-label') ?? b.textContent ?? '';
      if (shown) expect(words(name), 'the shown words are inside the name').toContain(shown);
      expect(name, 'the exact name: the long name, or the shown word then what the state means').toBe(expected[state]);
      unmount();
    });
  }

  it('the icon-only padlock keeps its long name', () => {
    const c = { ...base, proxy_permissions_scope: 'none', has_proxy_permissions: false, name: 'cedar' } as typeof base;
    render(<AccessLock computer={c} />);
    expect(screen.getByRole('button', { name: `Access of cedar: ${strings['access.open']}` })).toBeInTheDocument();
  });
});
