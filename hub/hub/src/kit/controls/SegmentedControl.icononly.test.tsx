// iconOnly: each option with an icon draws as a square with its icon alone. Its label is still its name, hidden from
// sight, and shows in a tooltip on keyboard focus; an option without an icon keeps its words; the choice still works.
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';
import s from './SegmentedControl.module.css';
import { SR_ONLY } from './SrOnly';

afterEach(cleanup);

const css = readFileSync(join(import.meta.dirname, 'SegmentedControl.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const ITEMS = [
  { id: 'one', label: 'One pane', icon: 'menu' as const },
  { id: 'two', label: 'Two panes', icon: 'apps' as const },
];

describe('SegmentedControl iconOnly', () => {
  it('keeps each label as the option name, out of sight, beside its icon', () => {
    render(<SegmentedControl label="Panes" iconOnly items={ITEMS} value="one" onChange={() => {}} />);
    const one = screen.getByRole('radio', { name: 'One pane' });
    const two = screen.getByRole('radio', { name: 'Two panes' });
    for (const el of [one, two]) {
      expect(el.hasAttribute('data-icon-only')).toBe(true);
      expect(el.classList.contains(s.iconSegment!)).toBe(true);
      expect(el.querySelector('svg')).not.toBeNull();
      const words = [...el.querySelectorAll('span')].find((x) => x.textContent === el.textContent)!;
      expect(words.classList.contains(SR_ONLY)).toBe(true);
    }
    expect(one.getAttribute('aria-checked')).toBe('true');
  });

  it('without iconOnly the words show, and no option is marked', () => {
    render(<SegmentedControl label="Panes" items={ITEMS} value="one" onChange={() => {}} />);
    const one = screen.getByRole('radio', { name: 'One pane' });
    expect(one.hasAttribute('data-icon-only')).toBe(false);
    expect(one.querySelector(`.${SR_ONLY}`)).toBeNull();
    expect(one.querySelector(`.${s.label}`)!.textContent).toBe('One pane');
  });

  it('an option with no icon keeps its words under iconOnly', () => {
    render(<SegmentedControl label="Panes" iconOnly items={[ITEMS[0]!, { id: 'all', label: 'All' }]} value="one" onChange={() => {}} />);
    const all = screen.getByRole('radio', { name: 'All' });
    expect(all.hasAttribute('data-icon-only')).toBe(false);
    expect(all.querySelector(`.${s.label}`)!.textContent).toBe('All');
    expect(screen.getByRole('radio', { name: 'One pane' }).hasAttribute('data-icon-only')).toBe(true);
  });

  it('shows the label in a tooltip when the option takes keyboard focus', async () => {
    const user = userEvent.setup();
    render(<SegmentedControl label="Panes" iconOnly items={ITEMS} value="one" onChange={() => {}} />);
    expect(screen.queryByRole('tooltip')).toBeNull();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'One pane' }));
    expect((await screen.findByRole('tooltip')).textContent).toBe('One pane');
  });

  it('a press still makes the choice', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedControl label="Panes" iconOnly items={ITEMS} value="one" onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: 'Two panes' }));
    expect(onChange).toHaveBeenCalledWith('two');
  });

  it('a count stays the description of an icon-only option, never part of its name', () => {
    render(<SegmentedControl label="Panes" iconOnly items={[{ ...ITEMS[0]!, count: 3 }, ITEMS[1]!]} value="one" onChange={() => {}} />);
    const one = screen.getByRole('radio', { name: 'One pane' });
    const id = one.getAttribute('aria-describedby')!;
    expect(document.getElementById(id)!.textContent).toBe('3');
  });

  it('the icon-only option is a square the option height; a count widens it', () => {
    expect(css).toMatch(/\.iconSegment\s*\{[^}]*min-width:\s*var\(--tog-h\);[^}]*\}/);
    expect(css).toMatch(/\.iconSegment:not\(:has\(\.count\)\)\s*\{\s*width:\s*var\(--tog-h\);\s*padding-inline:\s*0;\s*\}/);
  });
});
