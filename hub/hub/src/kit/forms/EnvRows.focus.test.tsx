// EnvRows focus: removing a row with its Remove button moves the focus to the row that took its place (the next one),
// else to the row before, else to Add; focus that is somewhere else when the rows change is left alone.
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, userEvent } from '@app/testing';
import { EnvRows, type EnvRow } from './EnvRows';

const labels = { key: (n: number) => `Name ${n}`, value: (n: number) => `Value ${n}`, remove: (n: number) => `Remove ${n}`, keyHint: 'NAME', valueHint: 'value', add: 'Add variable' };

function Host({ start }: { start: EnvRow[] }) {
  const [rows, setRows] = useState(start);
  return (
    <>
      <EnvRows rows={rows} label="Environment" description="Help text" labels={labels} onEdit={() => undefined} onRemove={(id) => setRows((r) => r.filter((x) => x.id !== id))} onAdd={() => undefined} />
      <button type="button" onClick={() => setRows((r) => r.slice(1))}>
        Drop first
      </button>
    </>
  );
}
const three: EnvRow[] = [
  { id: 1, key: 'A', value: 'a' },
  { id: 2, key: 'B', value: 'b' },
  { id: 3, key: 'C', value: 'c' },
];

describe('EnvRows focus on remove', () => {
  it('a middle row: focus goes to the next row (now in its place)', async () => {
    render(<Host start={three} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove 2' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name 2' }));
    expect(screen.getByRole('textbox', { name: 'Name 2' })).toHaveValue('C');
  });

  it('the last row: focus goes to the row before', async () => {
    render(<Host start={three} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove 3' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name 2' }));
    expect(screen.getByRole('textbox', { name: 'Name 2' })).toHaveValue('B');
  });

  it('the only row: focus goes to Add', async () => {
    render(<Host start={three.slice(0, 1)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove 1' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add variable' }));
  });

  it('a row removed from outside, focus elsewhere: the focus stays where it is', async () => {
    render(<Host start={three} />);
    await userEvent.click(screen.getByRole('button', { name: 'Drop first' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Drop first' }));
  });
});
