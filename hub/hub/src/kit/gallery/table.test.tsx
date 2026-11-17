// Vitest: the gallery's rows-that-open demo (PickAndOpen) gives each inline verb a short visible text and a longer
// accessible name ("Start" for "Start cedar"). WCAG 2.5.3 label in name: the name must hold the visible text, so a
// person who says what they see can press it. Rendered as the gallery renders it, through its own action builder.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PickAndOpen, useTableStrings } from './table';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

function Demo() {
  const t = useTableStrings();
  return <PickAndOpen t={t} />;
}

describe('gallery PickAndOpen: label in name (WCAG 2.5.3)', () => {
  it('every inline verb with its own short text has an accessible name that holds that text', () => {
    render(<Demo />);
    const tables = screen.getAllByRole('table');
    const withActions = tables[tables.length - 1] as HTMLElement;
    const inline = within(withActions)
      .queryAllByRole('button')
      .filter((b) => b.hasAttribute('aria-label') && (b.textContent ?? '').trim() !== '');
    expect(inline.length).toBeGreaterThan(0);
    for (const b of inline) {
      const visible = (b.textContent ?? '').trim();
      const name = b.getAttribute('aria-label') ?? '';
      expect(name).not.toBe(visible);
      expect(name).toContain(visible);
    }
  });
});
