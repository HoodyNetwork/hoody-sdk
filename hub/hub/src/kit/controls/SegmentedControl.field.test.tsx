// Vitest: SegmentedControl as a form row: a visible label with an optional InfoTip above, field
// help below that is read with the group, and no wrapper at all when none of them is asked for.
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

const ITEMS = [
  { id: 'user', label: 'User' },
  { id: 'root', label: 'Root' },
] as const;

function Row() {
  const [v, setV] = useState<'user' | 'root'>('user');
  return <SegmentedControl label="Run as" info="The account it runs as." description={v === 'root' ? 'Runs as root.' : 'Runs as user.'} value={v} onChange={setV} items={ITEMS} />;
}

describe('SegmentedControl form row', () => {
  it('draws no label or help without showLabel, description or info', () => {
    const { container } = render(<SegmentedControl label="Run as" items={ITEMS} />);
    expect(container.firstElementChild?.getAttribute('role')).toBe('radiogroup');
    expect(screen.queryByText('Run as')).toBeNull();
  });

  it('shows the label above the group, keeping one accessible name', () => {
    render(<SegmentedControl label="Run as" showLabel items={ITEMS} />);
    expect(screen.getByText('Run as')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Run as' })).toBeInTheDocument();
  });

  it('reads the help with the group and follows the choice', () => {
    render(<Row />);
    const group = screen.getByRole('radiogroup', { name: 'Run as' });
    expect(group).toHaveAccessibleDescription('Runs as user.');
    fireEvent.click(screen.getByRole('radio', { name: 'Root' }));
    expect(group).toHaveAccessibleDescription('Runs as root.');
  });

  it('keeps a caller aria-describedby beside its own help', () => {
    render(
      <>
        <span id="extra">Saved on the computer.</span>
        <SegmentedControl label="Run as" aria-describedby="extra" description="Runs as user." items={ITEMS} />
      </>,
    );
    expect(screen.getByRole('radiogroup', { name: 'Run as' })).toHaveAccessibleDescription('Saved on the computer. Runs as user.');
  });

  it('puts an InfoTip after the label', () => {
    render(<Row />);
    fireEvent.click(screen.getByRole('button', { name: /Run as/ }));
    expect(screen.getByText('The account it runs as.')).toBeInTheDocument();
  });
});
