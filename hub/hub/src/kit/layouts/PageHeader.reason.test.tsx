// PageHeader `primary` with `disabledReason`: an off primary that says why stays focusable and carries the reason as its
// description, as any kit Button does. Without a reason it is plainly disabled, as before.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageHeader, PrimaryButton } from './PageHeader';

vi.mock('../nav', () => ({ useSearchParam: () => [undefined, () => undefined] }));
vi.mock('../ask', () => ({ useAskDock: () => ({ isOpen: false }) }));

const REASON = 'No computer can take a new note right now.';

describe('PageHeader primary: the reason it is off', () => {
  it('an off primary with a reason is soft-disabled and described by the reason', () => {
    render(<PageHeader title="Notes" primary={{ label: 'New note', onPress: () => undefined, isDisabled: true, disabledReason: REASON }} />);
    const b = screen.getByRole('button', { name: 'New note' });
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.hasAttribute('disabled')).toBe(false);
    expect(b).toHaveAccessibleDescription(REASON);
  });

  it('an off primary without a reason stays plainly disabled, with no description', () => {
    render(<PageHeader title="Notes" primary={{ label: 'New note', onPress: () => undefined, isDisabled: true }} />);
    const b = screen.getByRole('button', { name: 'New note' });
    expect(b).toBeDisabled();
    expect(b).not.toHaveAccessibleDescription();
  });

  it('an enabled primary never shows the reason', () => {
    render(<PrimaryButton action={{ label: 'New note', onPress: () => undefined, disabledReason: REASON }} />);
    const b = screen.getByRole('button', { name: 'New note' });
    expect(b).toBeEnabled();
    expect(b).not.toHaveAccessibleDescription();
  });
});
