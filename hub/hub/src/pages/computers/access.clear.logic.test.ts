// "Use only the project's rules": what proves a sent clear, and what a held one's Check again says. The proof
// is order-free (core reads a change's reads in parallel): only a state that reads 'missing' proves it,
// and a present document, at any version, keeps it held.
import { describe, expect, it } from 'vitest';
import { clearHeldLine, clearVerdict, ownStateOf } from './parts/access.logic';

const ID = 'c0a7150000000000000000a1';
const who = { computer: ID, from: 4, clear: true };
// The read-back's answers in change order: accessRules, accessOwn, accessScope.
const answers = (own: unknown, version = 4) => [[{ [ID]: { version } }], own === undefined ? [] : [{ [ID]: own }], [{ [ID]: 'both' }]];

describe('computers: clearing a computer\'s own rules', () => {
  it('only a missing state proves the clear; a present one at any version, or none read, proves nothing', () => {
    expect(clearVerdict(who, answers('missing', 0))).toBe('applied');
    for (const own of ['applied', 'default', 'invalid', 'unknown', undefined]) {
      for (const v of [0, 1, 4, 5]) expect(clearVerdict(who, answers(own, v))).toBeUndefined();
    }
  });

  it('reads only the state of its own computer, the last answer winning, and needs the clear identity', () => {
    expect(clearVerdict(who, [[], [{ other: 'missing' }], []])).toBeUndefined();
    expect(clearVerdict(who, [[], [{ [ID]: 'missing' }, { [ID]: 'applied' }], []])).toBeUndefined();
    expect(clearVerdict(who, [[], [{ [ID]: 'applied' }, { [ID]: 'missing' }], []])).toBe('applied');
    expect(clearVerdict({ computer: ID, from: 4 }, answers('missing'))).toBeUndefined();
    expect(clearVerdict({ computer: ID, from: '4', clear: true }, answers('missing'))).toBeUndefined();
    expect(clearVerdict(null, answers('missing'))).toBeUndefined();
    // A state read as missing in the first reply slot (the rules) proves nothing: only the state read counts.
    expect(clearVerdict(who, [[{ [ID]: 'missing' }], [], []])).toBeUndefined();
  });

  it("Check again's line: still there at the sent version, newer at any other, nothing while unknown", () => {
    expect(clearHeldLine(4, 4, 'applied')).toBe('stillThere');
    expect(clearHeldLine(4, 4, 'default')).toBe('stillThere');
    expect(clearHeldLine(4, 5, 'applied')).toBe('newer');
    // Deleted and made again (the API continues the version sequence), or any version other than the one sent on.
    expect(clearHeldLine(4, 6, 'applied')).toBe('newer');
    expect(clearHeldLine(4, 1, 'applied')).toBe('newer');
    expect(clearHeldLine(4, undefined, 'applied')).toBeNull();
    for (const own of ['missing', 'invalid', 'unknown', undefined] as const) expect(clearHeldLine(4, 4, own)).toBeNull();
  });

  it('the state is one of the five the API names; anything else is not read as one', () => {
    for (const s of ['missing', 'default', 'applied', 'invalid', 'unknown']) expect(ownStateOf(s)).toBe(s);
    for (const s of ['MISSING', '', null, undefined, 1, {}]) expect(ownStateOf(s)).toBeUndefined();
  });
});
