// A page's searchHide (Jump to's places its view leaves out now): hidesTail reads a tail against it, and definePage
// refuses a searchHide without a load.
import { describe, expect, it } from 'vitest';
import { definePage, hidesTail } from './page';

describe('hidesTail', () => {
  it('no answer hides nothing', () => {
    for (const h of [null, undefined]) expect(hidesTail(h, '?section=passcode')).toBe(false);
  });

  it('hide: a tail starting with a listed start is hidden, any other is not', () => {
    const h = { hide: ['?section=passcode', '#faq-'] };
    expect(hidesTail(h, '?section=passcode')).toBe(true);
    expect(hidesTail(h, '#faq-lockScope')).toBe(true);
    expect(hidesTail(h, '?section=sessions')).toBe(false);
    expect(hidesTail(h, '')).toBe(false);
    expect(hidesTail({ hide: [] }, '?section=passcode')).toBe(false);
  });

  it('only: a tail starting with a listed start is kept, any other (the page path itself too) is hidden', () => {
    const h = { only: ['?tab=transfers'] };
    expect(hidesTail(h, '?tab=transfers')).toBe(false);
    expect(hidesTail(h, '?tab=storage')).toBe(true);
    expect(hidesTail(h, '')).toBe(true);
    expect(hidesTail({ only: [] }, '?tab=transfers')).toBe(true);
  });
});

describe('definePage searchHide', () => {
  const base = { id: 'x', path: '/x', title: 't', layout: 'detail', load: async () => ({ default: () => null }), status: 'ready', sensitive: false, strings: { t: 'X' } } as const;
  it('takes a load function', () => {
    expect(definePage({ ...base, searchHide: { load: async () => ({ default: () => null }) } }).searchHide).toBeDefined();
  });
  it('refuses one without', () => {
    expect(() => definePage({ ...base, searchHide: { load: 'nope' } } as never)).toThrow(/bad searchHide/);
  });
});
