import { describe, expect, it } from 'vitest';
import { RE24, isRealmId, isRealmOrGlobal } from './realm-id';

const ID = '0123456789abcdef01234567';

describe('realm id checks', () => {
  // [value, isRealmId, isRealmOrGlobal]
  const table: ReadonlyArray<readonly [unknown, boolean, boolean]> = [
    [ID, true, true],
    ['abcdefabcdefabcdefabcdef', true, true],
    ['global', false, true],
    ['all', false, false],
    ['', false, false],
    [ID.toUpperCase(), false, false],
    [ID + '0', false, false],
    [ID.slice(1), false, false],
    [' ' + ID, false, false],
    [ID + '\n', false, false],
    [ID.replace('0', 'g'), false, false],
    ['Global', false, false],
    [null, false, false],
    [undefined, false, false],
    [123, false, false],
    [[ID], false, false],
    [{ toString: () => ID }, false, false],
  ];
  for (const [v, id, scope] of table) {
    it(`${typeof v === 'string' ? JSON.stringify(v) : Object.prototype.toString.call(v)}: id ${id}, scope ${scope}`, () => {
      expect(isRealmId(v)).toBe(id);
      expect(isRealmOrGlobal(v)).toBe(scope);
    });
  }

  it('the RE24 pattern has no flag, so test() keeps no state between calls', () => {
    expect(RE24.global).toBe(false);
    expect(RE24.test(ID)).toBe(true);
    expect(RE24.test(ID)).toBe(true);
  });
});
