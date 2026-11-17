// The header's capability line: the host's tag and sentence, shown as given under where the chat runs, with Change when the host
// offers one. Absent, nothing is drawn (what a chat can do is never guessed).
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConvHeader } from './ConvHeader';
import strings from './ConvHeader.strings.en.json';

const base = { size: 'l' as const, title: 'Fix tests', meta: { computer: 'atlas', realm: 'Personal', status: 'idle' as const }, detailsOpen: false, onDetails: () => {} };

describe('ConvHeader capability line', () => {
  it('absent: no line', () => {
    const { container } = render(<ConvHeader {...base} />);
    expect(container.querySelector('[data-capability]')).toBeNull();
    expect(screen.queryByRole('button', { name: strings['head.change'] })).toBeNull();
  });

  it('draws the tag and the sentence as the host wrote them; Change calls the host', () => {
    const onChange = vi.fn();
    const { container } = render(<ConvHeader {...base} capability={{ tag: 'Chat only', text: 'No tools: it cannot read files or run commands.', onChange }} />);
    const line = container.querySelector('[data-capability]')!;
    expect(line.textContent).toContain('Chat only');
    expect(line.textContent).toContain('No tools: it cannot read files or run commands.');
    fireEvent.click(screen.getByRole('button', { name: strings['head.change'] }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('without a way to change it there is no Change', () => {
    render(<ConvHeader {...base} capability={{ tag: 'Works on atlas', text: 'Reads and edits files.' }} />);
    expect(screen.queryByRole('button', { name: strings['head.change'] })).toBeNull();
  });
});
