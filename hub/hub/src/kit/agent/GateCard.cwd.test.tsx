// Vitest: an approval card names the folder a command runs in once, on its folder line ("in <folder>"), never again as
// a "cwd" key/value row. A cwd the folder line cannot show (not a string, or empty) stays a row.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GateCard, type CardProps, type GateView } from './GateCard';
import strings from './Conversation.strings.en.json';

const props = (gate: GateView): CardProps => ({
  gate, pending: false, unknown: false, agentUrl: '', typing: true, onDecide: vi.fn(), onAnswer: vi.fn(), onCheck: vi.fn(),
});
const bash = (params: Record<string, unknown>): GateView => ({ kind: 'confirm', risk: '', tool: 'bash', params });
const count = (text: string, part: string) => text.split(part).length - 1;
const allow = () => screen.getByRole('button', { name: new RegExp(strings['agent.allowOnce']) });

describe('GateCard: the folder once', () => {
  it('a command with a cwd shows the folder line and no cwd row', () => {
    const { container } = render(<GateCard {...props(bash({ command: 'rm -rf build && npm run build', cwd: '/home/ada/dash' }))} />);
    expect(container.textContent).toContain(strings['agent.inFolder'].replace('{{dir}}', '/home/ada/dash'));
    expect(count(container.textContent ?? '', '/home/ada/dash')).toBe(1);
    expect(screen.queryByText('cwd')).toBeNull();
  });

  it('other params still show as rows beside the folder line', () => {
    const { container } = render(<GateCard {...props(bash({ command: 'ls', cwd: '/home/ada', timeout: 30 }))} />);
    expect(screen.getByText('timeout')).toBeInTheDocument();
    expect(count(container.textContent ?? '', '/home/ada')).toBe(1);
  });

  it('a marked folder is still shown as written and Allow still waits for the tick', () => {
    const { container } = render(<GateCard {...props(bash({ command: './deploy', cwd: '/tmp/a  b' }))} />);
    expect(count(container.textContent ?? '', '/tmp/a⟨U+0020⟩⟨U+0020⟩b')).toBe(1);
    expect(allow()).toBeDisabled();
  });

  it('a cwd that is not a folder line (a number) stays a row', () => {
    render(<GateCard {...props(bash({ command: 'ls', cwd: 7 }))} />);
    expect(screen.getByText('cwd')).toBeInTheDocument();
  });
});
