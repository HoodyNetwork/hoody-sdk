// Vitest: the words beside a computer's Name box say the rule the page and the API apply. The copy forms (Copy, Get a
// computer's "A copy of one of yours", New computer from a snapshot) take 3 to 100 letters, digits, dashes and underscores
// (logic.ts validName; the API's POST /computers/:id/copy name: 3-100, ^[a-zA-Z0-9-_]+$), but the help said "Letters,
// numbers and dashes, 3 to 40 characters": a 41 to 100 character name, or one with an underscore, was taken though the
// help said it was not. Rename takes any 1 to 100 characters (logic.ts cleanRename; PUT /computers/:id name: 1-100, no
// pattern), but its help named "letters, numbers, dashes and dots".
import { describe, expect, it } from 'vitest';
import { cleanRename, validName } from './logic';
import strings from './strings.en.json';

describe('the name rule in words matches the name rule in code', () => {
  it('copy: the help names underscores and the 3 to 100 range the check takes', () => {
    expect(validName('a'.repeat(100))).toBe(true);
    expect(validName('a'.repeat(101))).toBe(false);
    expect(validName('ab')).toBe(false);
    expect(validName('my_copy-2')).toBe(true);
    expect(validName('my copy')).toBe(false);
    const rule = strings['field.nameRule'];
    expect(rule).toMatch(/\b3 to 100\b/);
    expect(rule).not.toMatch(/\b40\b/);
    expect(rule).toMatch(/underscores/);
    expect(rule).toMatch(/dashes/);
  });

  it('rename: the help names no character set, only the 1 to 100 length the check takes', () => {
    expect(cleanRename('Team box #2 (new)')).toBe('Team box #2 (new)');
    expect(cleanRename('a'.repeat(100))).not.toBeNull();
    expect(cleanRename('a'.repeat(101))).toBeNull();
    expect(cleanRename('   ')).toBeNull();
    const help = strings['rename.help'];
    expect(help).toMatch(/\b1 to 100\b/);
    expect(help).not.toMatch(/letters|numbers|dashes|dots/i);
  });
});
