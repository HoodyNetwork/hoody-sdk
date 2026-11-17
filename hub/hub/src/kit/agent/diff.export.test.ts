// The kit's one line diff is reachable from pages: the barrel exports it, with context around the change.
import { describe, expect, it } from 'vitest';
import { diffRows } from '@kit';

describe('diffRows through the kit barrel', () => {
  it('marks a removed and an added line and keeps the unchanged ones around', () => {
    const d = diffRows('a\nb\nc', 'a\nB\nc');
    expect(d.rows).toEqual([{ t: '=', s: 'a' }, { t: '-', s: 'b' }, { t: '+', s: 'B' }, { t: '=', s: 'c' }]);
    expect(d).toMatchObject({ added: 1, removed: 1 });
  });
});
