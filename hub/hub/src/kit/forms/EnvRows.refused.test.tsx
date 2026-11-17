// EnvRows focus: a removal the page refuses (the row is still there) leaves nothing behind, so a later change of the
// rows never moves the focus into a row.
import { describe, expect, it } from 'vitest';
import { act, render, screen, userEvent } from '@app/testing';
import { EnvRows, type EnvRow } from './EnvRows';

const labels = { key: (n: number) => `Name ${n}`, value: (n: number) => `Value ${n}`, remove: (n: number) => `Remove ${n}`, keyHint: 'NAME', valueHint: 'value', add: 'Add variable' };
const two: EnvRow[] = [
  { id: 1, key: 'A', value: 'a' },
  { id: 2, key: 'B', value: 'b' },
];
const ui = (rows: EnvRow[]) => <EnvRows rows={rows} label="Environment" description="Help text" labels={labels} onEdit={() => undefined} onRemove={() => undefined} onAdd={() => undefined} />;

describe('EnvRows refused removal', () => {
  it('a refused Remove, then a later rows change with the focus on body: the focus stays on body', async () => {
    const view = render(ui(two));
    await userEvent.click(screen.getByRole('button', { name: 'Remove 1' }));
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
    (document.activeElement as HTMLElement).blur();
    act(() => view.rerender(ui(two.slice(1))));
    expect(document.activeElement).toBe(document.body);
  });
});
