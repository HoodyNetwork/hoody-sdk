// The kit Toolbar: a labelled group of controls, never role="toolbar". React Aria disables a
// segmented control's (ToggleButtonGroup's) arrow keys inside any [role="toolbar"] (it keeps role="radiogroup"), so
// the row would leave each segment a Tab stop. As a group, the segmented control keeps its own arrows (toolbar.keys.spec.ts
// proves the keys in a browser: jsdom has no layout for React Aria's focus moves). `label` names it.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from './PageHeader';

vi.mock('../nav', () => ({ useSearchParam: () => [undefined, () => undefined] }));

describe('kit Toolbar', () => {
  it('is a group named by its label, and draws no role="toolbar"', () => {
    const { container } = render(<Toolbar label="Logs" start={<button type="button">a</button>} />);
    expect(screen.getByRole('group', { name: 'Logs' })).toBeInTheDocument();
    expect(container.querySelector('[role="toolbar"]')).toBeNull();
  });

  it('without a label it is still a group, with no name', () => {
    const { container } = render(<Toolbar start={<button type="button">a</button>} />);
    const bar = container.firstElementChild?.firstElementChild;
    expect(bar?.getAttribute('role')).toBe('group');
    expect(bar?.hasAttribute('aria-label')).toBe(false);
  });
});
