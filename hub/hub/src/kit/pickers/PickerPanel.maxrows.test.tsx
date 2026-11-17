// PickerPanel maxRows (the create drawer's long realm list): past maxRows rows the rows scroll inside
// the panel; the search box and the "n selected" line stay outside the scroll; off by default; the row the keyboard
// lands on is scrolled into view.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PickerPanel, type PickerItem } from './PickerPanel';

const ownScroll = Element.prototype.scrollIntoView;
afterEach(() => {
  vi.restoreAllMocks();
  Element.prototype.scrollIntoView = ownScroll;
});

const items = (n: number): PickerItem[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, label: `Realm ${String(i + 1).padStart(2, '0')}` }));

function Panel({ n, maxRows }: { n: number; maxRows?: number }) {
  const [value, setValue] = useState<string[]>([]);
  return <PickerPanel label="Realms" mode="multi" items={items(n)} value={value} onChange={setValue} searchable {...(maxRows !== undefined ? { maxRows } : {})} />;
}
const list = () => screen.getByRole('group', { name: 'Realms' });

describe('PickerPanel maxRows', () => {
  it('off by default: a long list is not capped', () => {
    render(<Panel n={20} />);
    expect(list().hasAttribute('data-capped')).toBe(false);
    expect(list().style.getPropertyValue('--pp-rows')).toBe('');
  });

  it('past maxRows the rows scroll inside; the search box and the summary are outside the scroll', () => {
    render(<Panel n={20} maxRows={6} />);
    const l = list();
    expect(l.hasAttribute('data-capped')).toBe(true);
    expect(l.style.getPropertyValue('--pp-rows')).toBe('6');
    expect(l.contains(screen.getByRole('searchbox'))).toBe(false);
    expect(l.contains(screen.getByText(/selected/))).toBe(false);
    expect(screen.getAllByRole('checkbox')).toHaveLength(20);
  });

  it('a list no longer than maxRows is not capped', () => {
    render(<Panel n={6} maxRows={6} />);
    expect(list().hasAttribute('data-capped')).toBe(false);
  });

  it('the row the keyboard moves to is scrolled into view', async () => {
    const seen: string[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      seen.push(this.textContent ?? '');
    });
    render(<Panel n={20} maxRows={6} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /Realm 01/ }));
    for (let i = 0; i < 7; i++) await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toMatch(/Realm 08/);
    expect(seen.some((x) => /Realm 08/.test(x))).toBe(true);
  });
});
