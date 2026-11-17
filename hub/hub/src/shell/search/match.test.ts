// Jump to's matcher: folding, words and prefixes, synonyms, typos and the ranking order.
import { describe, expect, it } from 'vitest';
import { fold, prepare, search, within, type Searchable } from './match';

const E = (kind: Searchable['kind'], label: string, extra: Partial<Searchable> = {}): Searchable => ({ kind, label, ...extra });
const find = (items: Searchable[], q: string) => search(items.map(prepare), q).map((x) => x.label);

describe('match', () => {
  it('folds accents and case', () => {
    expect(fold('Pässcode ÉTÉ')).toBe('passcode ete');
    expect(find([E('section', 'Passcode lock')], 'PÄSSCODE')).toEqual(['Passcode lock']);
  });

  it('every typed word must match a word, by its start, in any order', () => {
    const items = [E('section', 'Passcode lock'), E('setting', 'Lock screen time')];
    expect(find(items, 'lock pass')).toEqual(['Passcode lock']);
    expect(find(items, 'pass time')).toEqual([]);
  });

  it('a word inside another word is no match (no substrings): "code" does not find "Passcode"', () => {
    expect(find([E('section', 'Passcode lock')], 'code')).toEqual([]);
  });

  it('synonyms: PIN finds the passcode lock, token finds API keys, log out finds Sign out', () => {
    expect(find([E('section', 'Passcode lock')], 'pin')).toEqual(['Passcode lock']);
    expect(find([E('page', 'API keys')], 'token')).toEqual(['API keys']);
    expect(find([E('command', 'Sign out', { keywords: 'signout' })], 'log out')).toEqual(['Sign out']);
    // Two-word labels as the pages write them, with no keyword to help: joined and unjoined both find them.
    for (const q of ['sign in', 'signin', 'login', 'log in', 'sign']) expect(find([E('section', 'Sign-in sessions')], q), q).toEqual(['Sign-in sessions']);
    for (const q of ['log out', 'logout', 'sign out']) expect(find([E('command', 'Sign out')], q), q).toEqual(['Sign out']);
    // The words as typed still count where they join to nothing on the entry: log out finds Log output.
    expect(find([E('setting', 'Log output')], 'log out')).toEqual(['Log output']);
    // Joined forms reach a row's section and its help words too.
    for (const q of ['signin', 'login', 'log in', 'sign in']) expect(find([E('setting', 'Days signed in', { under: 'Agent sign-in' })], q), q).toEqual(['Days signed in']);
    // The short word of a query that joins counts only whole: "sign in" is not "sign" plus anything starting with "in".
    expect(find([E('faq', 'What does sharing give?', { body: 'sign someone into invite' })], 'sign in')).toEqual([]);
  });

  it('typos: one in a short word, two in a long one, none under four letters', () => {
    expect(find([E('section', 'Passcode lock')], 'pascode')).toEqual(['Passcode lock']);
    expect(find([E('section', 'Passcode lock')], 'passcdoe')).toEqual(['Passcode lock']);
    expect(find([E('page', 'Notifications')], 'notifcatons')).toEqual(['Notifications']);
    expect(find([E('page', 'Apps')], 'aps')).toEqual([]);
    expect(within('abcd', 'abdc', 1)).toBe(true);
    expect(within('abcd', 'wxyz', 1)).toBe(false);
  });

  it('ranks an exact label first, then a label that starts with it, then label words, then the section, then body words', () => {
    const items = [
      E('faq', 'How does it work?', { body: 'passcode' }),
      E('setting', 'Remove it', { under: 'Passcode lock' }),
      E('setting', 'New passcode and more'),
      E('section', 'Passcode lock'),
      E('section', 'Passcode'),
    ];
    expect(find(items, 'passcode')).toEqual(['Passcode', 'Passcode lock', 'New passcode and more', 'Remove it', 'How does it work?']);
  });

  it('among equal matches a page comes before a section, a section before a setting, a setting before a FAQ question', () => {
    const items = [E('faq', 'Billing'), E('setting', 'Billing'), E('section', 'Billing'), E('page', 'Billing')];
    expect(search(items.map(prepare), 'billing').map((x) => x.kind)).toEqual(['page', 'section', 'setting', 'faq']);
  });

  it('an exact name beats the kind order: the setting named Lock before the page Lock screen', () => {
    expect(find([E('page', 'Lock screen'), E('setting', 'Lock')], 'lock')).toEqual(['Lock', 'Lock screen']);
  });

  it('a whole word beats its prefix, and a prefix beats a typo', () => {
    const items = [E('setting', 'Loch'), E('setting', 'Locked'), E('setting', 'Lock')];
    expect(find(items, 'lock')).toEqual(['Lock', 'Locked', 'Loch']);
  });

  it('nothing typed, nothing found; the limit holds', () => {
    expect(find([E('page', 'Home')], '  ')).toEqual([]);
    const many = Array.from({ length: 80 }, (_, i) => E('setting', `Row ${i}`));
    expect(search(many.map(prepare), 'row', 50)).toHaveLength(50);
  });
});
