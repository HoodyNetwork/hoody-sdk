// computerColor: the one normaliser every computer-colour style sink reads.
// Only `#RRGGBB` ever leaves it; anything that is not a hex colour is null, never repaired into one.
import { describe, expect, it } from 'vitest';
import { computerColor } from './index';

describe('computerColor', () => {
  it('keeps the hex forms the API gives, upper-cased, and expands the 3-digit form the API keeps unexpanded', () => {
    expect(computerColor({ color: '#3B82F6' })).toBe('#3B82F6');
    expect(computerColor({ color: '#3b82f6' })).toBe('#3B82F6');
    expect(computerColor({ color: '3b82f6' })).toBe('#3B82F6');
    expect(computerColor({ color: '#abc' })).toBe('#AABBCC');
    expect(computerColor({ color: '#ABC' })).toBe('#AABBCC');
    expect(computerColor({ color: 'fff' })).toBe('#FFFFFF');
  });

  it('refuses every value that is not a hex colour (a named colour, a short or long hex, CSS that would inject a style)', () => {
    for (const bad of ['red', '#12345', '#1234567', 'url(x)', '#fff;background:url()', 'red;x:url()', 'var(--hx-blue)', '#GGGGGG', ' #3B82F6', '#3B82F6 ', '', undefined]) {
      expect(computerColor({ color: bad })).toBeNull();
    }
    // Outside the API contract (not a string): no colour, never a coerced one.
    for (const bad of [123, ['#abc'], { toString: () => '#abc' }, null]) expect(computerColor({ color: bad as unknown as string })).toBeNull();
  });

  it('pages/computers keeps reading the same function (re-export, not a copy)', async () => {
    const logic = await import('../pages/computers/logic');
    expect(logic.computerColor).toBe(computerColor);
  });
});
