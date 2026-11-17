// planList's cap on meta fields keeps one line short. A field that wraps takes the lines it needs, so the cap never
// drops it; among the first three it still takes its place, so a list with one wrapping field shows what it showed.
import { expect, test } from 'bun:test';
import { planList, type ListColumn } from './DataTableLayout';

const c = (id: string, extra: Partial<ListColumn> = {}): ListColumn => ({ id, role: undefined, priority: 2, pinned: false, ...extra });

test('one-line fields are still capped at three', () => {
  expect(planList([c('name', { pinned: true }), c('a'), c('b'), c('c'), c('d')]).meta).toEqual(['a', 'b', 'c']);
});

test('wrapping fields are all kept, in order', () => {
  const cols = [c('what', { pinned: true, role: 'primary' }), ...['free', 'small', 'medium', 'large', 'bare'].map((id) => c(id, { priority: 1, wraps: true }))];
  expect(planList(cols).meta).toEqual(['free', 'small', 'medium', 'large', 'bare']);
});

test('a wrapping field among the first three takes its place: the fourth field stays out', () => {
  const m = (id: string, wraps = false) => c(id, { role: 'meta', wraps });
  expect(planList([c('name', { role: 'primary' }), m('kind'), m('role', true), m('apps'), m('model')]).meta).toEqual(['kind', 'role', 'apps']);
  expect(planList([c('name', { pinned: true }), c('a'), c('w', { wraps: true }), c('b'), c('c')]).meta).toEqual(['a', 'w', 'b']);
});

test('past the cap only the wrapping fields stay', () => {
  const m = (id: string, wraps = false) => c(id, { role: 'meta', wraps });
  expect(planList([c('name', { role: 'primary' }), m('a'), m('b'), m('c'), m('d'), m('w', true)]).meta).toEqual(['a', 'b', 'c', 'w']);
});
