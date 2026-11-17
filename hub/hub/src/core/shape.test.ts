import { describe, expect, it } from 'vitest';
import { isPlainRecord, isRecord, isRecordOrArray, recordOrEmpty, recordOrNull, recordOrUndefined, stringOrEmpty } from './shape';

class Thing {}

const plain: unknown[] = [{}, { a: 1 }, Object.create(null), new Thing()];
const arrays: unknown[] = [[], [1], new Array(3)];
const exotic: unknown[] = [new Map(), new Set(), new Date(0), /x/];
const nonObjects: unknown[] = [null, undefined, 0, 1, NaN, '', 'x', true, false, Symbol('s'), () => 1, 1n];

// [value kind, isRecord, isRecordOrArray, isPlainRecord]
const table: ReadonlyArray<readonly [string, readonly unknown[], boolean, boolean, boolean]> = [
  ['plain objects and class instances', plain, true, true, true],
  ['arrays', arrays, false, true, false],
  ['Map, Set, Date, RegExp', exotic, true, true, false],
  ['null, primitives, functions', nonObjects, false, false, false],
];

describe('shape guards', () => {
  for (const [kind, values, rec, recArr, plainRec] of table) {
    it(`${kind}: isRecord ${rec}, isRecordOrArray ${recArr}, isPlainRecord ${plainRec}`, () => {
      for (const v of values) {
        expect(isRecord(v)).toBe(rec);
        expect(isRecordOrArray(v)).toBe(recArr);
        expect(isPlainRecord(v)).toBe(plainRec);
      }
    });
  }
});

describe('shape fallbacks', () => {
  it('return the same record when isRecord accepts, else the fallback', () => {
    for (const v of [...plain, ...exotic]) {
      expect(recordOrEmpty(v)).toBe(v);
      expect(recordOrNull(v)).toBe(v);
      expect(recordOrUndefined(v)).toBe(v);
    }
    for (const v of [...arrays, ...nonObjects]) {
      expect(recordOrEmpty(v)).toEqual({});
      expect(recordOrNull(v)).toBeNull();
      expect(recordOrUndefined(v)).toBeUndefined();
    }
  });

  it('each recordOrEmpty fallback is a fresh object', () => {
    expect(recordOrEmpty(null)).not.toBe(recordOrEmpty(null));
  });
});

describe('stringOrEmpty', () => {
  it('returns a string as it is, including the empty and a whitespace one', () => {
    for (const v of ['x', '', ' ', '0', 'a\nb']) expect(stringOrEmpty(v)).toBe(v);
  });

  it('turns every other value into the empty string, never its text', () => {
    for (const v of [null, undefined, 0, 1, NaN, true, false, 1n, Symbol('s'), () => 'x', ...plain, ...arrays, ...exotic, new String('x')]) {
      expect(stringOrEmpty(v)).toBe('');
    }
  });

  it('reads as one function over a map, which hands it an index too', () => {
    expect(['a', 1, null, 'b'].map(stringOrEmpty)).toEqual(['a', '', '', 'b']);
  });
});
