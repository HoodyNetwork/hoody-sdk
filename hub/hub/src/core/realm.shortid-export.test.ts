// The shell shows a realm's short id under its name and never copies core's rule, so core/shell.ts
// re-exports realm.ts's shortId as realmShortId.
import { describe, expect, it } from 'vitest';
import { shortId } from './realm';
import * as shell from './shell';

describe('core/shell.ts realmShortId', () => {
  it('is realm.ts shortId: first four and last four characters, never the full id', () => {
    const id = 'aaaa1111bbbb2222cccc3333';
    expect((shell as Record<string, unknown>).realmShortId).toBe(shortId);
    expect(shortId(id)).toBe('aaaa…3333');
  });
});
