// Vitest: ProblemList, a code check's diagnostics. One labelled list; each row a tone icon, the line number in a fixed
// mono column (spoken "Line n"), the message. With onJump a row that has a line is one press that calls it with the line;
// a row without a line is never pressable. firstRef makes the first row a script-only focus target.
import { act, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ProblemList } from './ProblemList';

const PROBLEMS = [
  { line: 12, message: "'fetch' is not defined" },
  { line: 40, message: 'Unused variable x', tone: 'warn' as const },
  { line: null, message: 'The file has no default export' },
];

describe('ProblemList', () => {
  it('is one list named by its label, a row per problem in order, line then message', () => {
    render(<ProblemList label="Problems" problems={PROBLEMS} />);
    const list = screen.getByRole('list', { name: 'Problems' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Line 12");
    expect(rows[0]).toHaveTextContent("'fetch' is not defined");
    expect(rows[2]).not.toHaveTextContent('Line');
    expect(rows.map((r) => r.getAttribute('data-tone'))).toEqual(['danger', 'warn', 'danger']);
    // Without onJump nothing is pressable.
    expect(within(list).queryByRole('button')).toBeNull();
  });

  it('with onJump: a row with a line is one button named by its line and message; it calls onJump(line) once', async () => {
    const onJump = vi.fn();
    render(<ProblemList label="Problems" problems={PROBLEMS} onJump={onJump} />);
    const list = screen.getByRole('list', { name: 'Problems' });
    const buttons = within(list).getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAccessibleName("Line 12 'fetch' is not defined");
    await userEvent.click(buttons[1]!);
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump).toHaveBeenCalledWith(40);
    // The row with no line stays text.
    expect(within(within(list).getAllByRole('listitem')[2]!).queryByRole('button')).toBeNull();
  });

  it('firstRef: the first row is a focus target (by script only, never a Tab stop); the other rows are not', () => {
    const first = createRef<HTMLLIElement>();
    render(<ProblemList label="Problems" problems={PROBLEMS} onJump={() => undefined} firstRef={first} />);
    const rows = within(screen.getByRole('list', { name: 'Problems' })).getAllByRole('listitem');
    expect(first.current).toBe(rows[0]);
    expect(rows[0]!.getAttribute('tabindex')).toBe('-1');
    expect(rows[1]!.hasAttribute('tabindex')).toBe(false);
    act(() => first.current?.focus());
    expect(document.activeElement).toBe(rows[0]);
  });

  it('without firstRef no row takes focus', () => {
    render(<ProblemList label="Problems" problems={PROBLEMS} />);
    for (const row of screen.getAllByRole('listitem')) expect(row.hasAttribute('tabindex')).toBe(false);
  });

  it('draws nothing for no problems', () => {
    const { container } = render(<ProblemList label="Problems" problems={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('the line column is mono with tabular figures; a pressed row has the kit focus ring, the touch floor and forced colours', () => {
    const css = readFileSync(join(import.meta.dirname, 'ProblemList.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = (sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.[\]()-]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    expect(rule('.line')).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(rule('.line')).toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(rule('.jump[data-focus-visible]')).toMatch(/box-shadow:\s*var\(--focus-ring\)/);
    expect(css).toMatch(/min-block-size:\s*var\(--touch-min\)/);
    expect(css).toMatch(/@media \(forced-colors: active\)/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    // Hover is told by the message's underline, never a fill of the press's own (kit.ownButtons).
    expect(rule('.jump[data-hovered] .message')).toMatch(/text-decoration:\s*underline/);
    expect(css).not.toMatch(/\.jump\[data-hovered\]\s*\{[^}]*background/);
  });
});
