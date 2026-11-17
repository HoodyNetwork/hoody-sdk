// On a phone the top bar shows the realm only as its square, so the
// vault's realm hints name the realm menu and the square rather than "the top bar". Both carry the square: the 403
// view shows pickOther on its own, without pickHint.
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';

describe('vault realm hints', () => {
  it('name the realm menu at the top, and the square on a phone', () => {
    expect(strings['partition.pickHint']).toBe('Pick a realm from the realm menu at the top to see its own entries (on a phone, tap the realm square).');
    expect(strings['partition.pickOther']).toBe('Pick another realm from the realm menu at the top to try its vault (on a phone, tap the realm square).');
  });
});
