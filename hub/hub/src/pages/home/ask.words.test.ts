// Vitest: the Ask lines never say which side the Agent dock sits on. Its side follows the layout and
// the reading direction, so "on the right" is wrong for some people; the words point at Agent, not at a place.
import { expect, it } from 'vitest';
import strings from './strings.en.json';

it('no Ask string names a side', () => {
  for (const [key, text] of Object.entries(strings))
    if (key.startsWith('ask.')) expect(text, key).not.toMatch(/\b(left|right)\b/i);
});
