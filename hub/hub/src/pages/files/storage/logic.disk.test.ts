// The computer's own disk from the API's stats answer: use and size in bytes, or null (never 0) for anything that
// does not say both.
import { describe, expect, it } from 'vitest';
import { diskOf } from './logic';

const of = (root: unknown) => ({ success: true, data: { cpu: { usage_percent: 3 }, disk: { root } } });

describe('diskOf', () => {
  it.each([
    ['use and size', of({ usage: 5, total: 10 }), { used: 5, total: 10 }],
    ['an empty disk', of({ usage: 0, total: 10 }), { used: 0, total: 10 }],
    ['a full disk', of({ usage: 10, total: 10 }), { used: 10, total: 10 }],
    ['no size (0)', of({ usage: 5, total: 0 }), null],
    ['no use', of({ total: 10 }), null],
    ['no size', of({ usage: 5 }), null],
    ['use as text', of({ usage: '5', total: 10 }), null],
    ['size as text', of({ usage: 5, total: '10' }), null],
    ['a negative use', of({ usage: -1, total: 10 }), null],
    ['use above the size', of({ usage: 11, total: 10 }), null],
    ['not a number', of({ usage: Number.NaN, total: 10 }), null],
    ['no root', { data: { disk: {} } }, null],
    ['no disk', { data: {} }, null],
    ['no data', { success: true }, null],
    ['a list', [], null],
    ['nothing', null, null],
  ])('%s', (_, raw, want) => {
    expect(diskOf(raw)).toEqual(want);
  });
});
