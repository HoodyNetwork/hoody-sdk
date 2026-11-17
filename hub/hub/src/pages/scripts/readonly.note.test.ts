// Vitest: why a script cannot be changed from here, said as what is true. A list of idea-made scripts that is still being
// read, one the agent answered it could not open (`ownership_unknown`; told apart by its sign-in in owner.held.test.tsx) and one that did not answer
// are three different sentences; none is said while the script can be written.
import { describe, expect, it } from 'vitest';
import { readOnlyNote } from './parts/readOnly';
import strings from './strings.en.json';

const table = strings as Record<string, string>;
const caps = { revisions: true } as never;
const item = { managed: null };

describe('readOnlyNote', () => {
  it('says nothing for a script that can be written', () => {
    expect(readOnlyNote(item, { caps, instances: {} })).toBeNull();
  });

  it('a script made from an idea says so', () => {
    expect(readOnlyNote({ managed: { template: 'x', elsewhere: false } as never }, { caps, instances: {} })).toEqual({ title: 'code.managed', body: 'code.managedBody' });
  });

  it('an older Scripts program says read only', () => {
    expect(readOnlyNote(item, { caps: {} as never, instances: {} })).toEqual({ title: 'code.oldKit', body: 'code.oldKitBody' });
  });

  it('the owner list still being read is "checking", never "did not answer"', () => {
    expect(readOnlyNote(item, { caps, instances: null, ownerRead: { k: 'reading' } })).toEqual({ title: 'code.ownerReading', body: 'code.ownerReadingBody' });
  });

  it('the agent answering that it could not open its list names that, and never that it clears on its own', () => {
    const n = readOnlyNote(item, { caps, instances: null, ownerRead: { k: 'failed', kind: 'server', error: { code: 'ownership_unknown' } } });
    expect(n).toEqual({ title: 'code.ownerNotOpen', body: 'code.ownerNotOpenBody' });
    expect(table['code.ownerNotOpenBody']).not.toMatch(/on its own/);
    expect(table['code.ownerNotOpenBody']).not.toMatch(/did not answer|503|ownership_unknown/);
  });

  it('any other failed read keeps the did-not-answer words', () => {
    expect(readOnlyNote(item, { caps, instances: null, ownerRead: { k: 'failed', kind: 'network', error: {} } })).toEqual({ title: 'code.unknownOwner', body: 'code.unknownOwnerBody' });
  });

  it('every key it returns has its words', () => {
    for (const k of ['code.managed', 'code.managedBody', 'code.oldKit', 'code.oldKitBody', 'code.ownerReading', 'code.ownerReadingBody', 'code.ownerSignedOut', 'code.ownerSignedOutBody', 'code.ownerRejected', 'code.ownerRejectedBody', 'code.ownerNoHost', 'code.ownerNoHostBody', 'code.ownerNotOpen', 'code.ownerNotOpenBody', 'code.unknownOwner', 'code.unknownOwnerBody']) expect(table[k], k).toBeTruthy();
  });
});
