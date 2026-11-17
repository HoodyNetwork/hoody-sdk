// RadioGroup and CheckboxGroup `columns={2}`: the choices sit in a grid of two columns where the group has room and one
// where it does not, never three; without the prop the list is the one column it always was.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { Checkbox, CheckboxGroup } from './fields';
import { RadioGroup } from './RadioGroup';

const OPTS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie' },
];
const noop = () => undefined;
const listOf = (role: 'radio' | 'checkbox') => screen.getAllByRole(role)[0]!.closest('label')!.parentElement!;
const two = (el: Element) => /cols2/.test(el.className);

beforeEach(() => boot());
afterEach(cleanup);

describe('choice groups in two columns', () => {
  it('RadioGroup: the radios\' list takes the two-column class only with columns={2}, and never as cards', () => {
    render(<RadioGroup label="Size" options={OPTS} value="a" onChange={noop} columns={2} />);
    expect(two(listOf('radio'))).toBe(true);
    expect(listOf('radio').children.length).toBe(3);
    cleanup();
    render(<RadioGroup label="Size" options={OPTS} value="a" onChange={noop} />);
    expect(two(listOf('radio'))).toBe(false);
    cleanup();
    render(<RadioGroup label="Size" options={OPTS} value="a" onChange={noop} variant="cards" columns={2} />);
    expect(two(listOf('radio'))).toBe(false);
  });

  it('CheckboxGroup: the boxes\' list takes the two-column class only with columns={2}', () => {
    const boxes = OPTS.map((o) => <Checkbox key={o.value} value={o.value} label={o.label} />);
    render(<CheckboxGroup label="Rights" columns={2}>{boxes}</CheckboxGroup>);
    expect(two(listOf('checkbox'))).toBe(true);
    cleanup();
    render(<CheckboxGroup label="Rights">{boxes}</CheckboxGroup>);
    expect(two(listOf('checkbox'))).toBe(false);
  });

  for (const file of ['fields.module.css', 'more.module.css']) {
    it(`${file}: a grid whose columns are at least half the group wide (two at most), one when the group is narrow`, () => {
      const css = readFileSync(join(__dirname, file), 'utf8');
      const at = css.indexOf('.cols2 {');
      expect(at).toBeGreaterThan(-1);
      const rule = css.slice(at, css.indexOf('}', at));
      expect(rule).toMatch(/display: grid/);
      expect(rule).toContain('repeat(auto-fit, minmax(min(100%, max(calc(4 * var(--sp-10)), calc(50% - var(--sp-5)))), 1fr))');
      expect(rule).toMatch(/column-gap: var\(--sp-5\)/);
    });
  }
});
