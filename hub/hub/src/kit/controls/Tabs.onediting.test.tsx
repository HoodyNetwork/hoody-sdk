// Vitest: editable Tabs. `edit.onEditing` follows the in-place rename: `{ id, draft }` when it
// starts and on each keystroke, `null` when it ends (Enter or Escape). Said only on a change: nothing on mount, nothing
// when the tabs unmount with a rename open (the page knows it dropped them).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

const VIEWS = [
  { id: 'a', label: 'Overview' },
  { id: 'b', label: 'Builds' },
];

function setup() {
  const onEditing = vi.fn();
  const onRename = vi.fn();
  const r = render(<Tabs label="Board" items={VIEWS} value="a" edit={{ onRename, onEditing }} />);
  return { ...r, onEditing, onRename };
}

describe('Tabs, onEditing', () => {
  it('says nothing on mount', () => {
    const { onEditing } = setup();
    expect(onEditing).not.toHaveBeenCalled();
  });

  it('the start with the name, each keystroke with the draft, then null on Enter (the rename kept)', async () => {
    const { onEditing, onRename } = setup();
    const user = userEvent.setup();
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await user.keyboard('{F2}');
    const input = await screen.findByRole('textbox', { name: /Rename Overview/ });
    expect(onEditing).toHaveBeenLastCalledWith({ id: 'a', draft: 'Overview' });
    await user.clear(input);
    await user.type(input, 'Ops');
    expect(onEditing).toHaveBeenLastCalledWith({ id: 'a', draft: 'Ops' });
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onEditing).toHaveBeenLastCalledWith(null));
    expect(onRename).toHaveBeenCalledWith('a', 'Ops');
  });

  it('Escape ends it with null, the name not sent', async () => {
    const { onEditing, onRename } = setup();
    const user = userEvent.setup();
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await user.keyboard('{F2}');
    await user.type(await screen.findByRole('textbox', { name: /Rename Overview/ }), 'x');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onEditing).toHaveBeenLastCalledWith(null));
    expect(onRename).not.toHaveBeenCalled();
  });

  it('the same draft twice is said once; an unmount mid-rename says nothing', async () => {
    const { onEditing, unmount } = setup();
    const user = userEvent.setup();
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await user.keyboard('{F2}');
    await screen.findByRole('textbox', { name: /Rename Overview/ });
    const n = onEditing.mock.calls.length;
    expect(n).toBe(1);
    unmount();
    expect(onEditing).toHaveBeenCalledTimes(n);
  });

  it('tabs without onEditing rename as before', async () => {
    const onRename = vi.fn();
    render(<Tabs label="Board" items={VIEWS} value="a" edit={{ onRename }} />);
    const user = userEvent.setup();
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await user.keyboard('{F2}');
    await user.type(await screen.findByRole('textbox', { name: /Rename Overview/ }), '2{Enter}');
    expect(onRename).toHaveBeenCalledWith('a', 'Overview2');
  });
});

describe('Tabs, edit.maxLength', () => {
  it('cuts a typed or pasted name at the limit, as a rename dialog field does; Enter keeps the cut name', async () => {
    const onRename = vi.fn();
    render(<Tabs label="Board" items={VIEWS} value="a" edit={{ onRename, maxLength: 8 }} />);
    const user = userEvent.setup();
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await user.keyboard('{F2}');
    const input = (await screen.findByRole('textbox', { name: /Rename Overview/ })) as HTMLInputElement;
    expect(input).toHaveAttribute('maxlength', '8');
    await user.clear(input);
    await user.paste('Quarterly numbers');
    expect(input.value).toBe('Quarterl');
    await user.keyboard('{Enter}');
    expect(onRename).toHaveBeenCalledWith('a', 'Quarterl');
  });

  it('unset: no limit, as before', async () => {
    const onRename = vi.fn();
    render(<Tabs label="Board" items={VIEWS} value="a" edit={{ onRename }} />);
    const user = userEvent.setup();
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await user.keyboard('{F2}');
    const input = (await screen.findByRole('textbox', { name: /Rename Overview/ })) as HTMLInputElement;
    expect(input).not.toHaveAttribute('maxlength');
    await user.clear(input);
    await user.paste('Quarterly numbers');
    expect(input.value).toBe('Quarterly numbers');
  });
});

describe('Tabs, the renamed tab removed', () => {
  it('ends the rename without keeping its draft: the page hears null, and F2 renames another tab after', async () => {
    const onRename = vi.fn();
    const onEditing = vi.fn();
    const { rerender } = render(<Tabs label="Board" items={VIEWS} value="a" edit={{ onRename, onEditing }} />);
    const user = userEvent.setup();
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await user.keyboard('{F2}');
    await user.keyboard('X');
    expect(onEditing).toHaveBeenLastCalledWith({ id: 'a', draft: 'X' });
    rerender(<Tabs label="Board" items={VIEWS.filter((v) => v.id !== 'a')} value={VIEWS[1]!.id} edit={{ onRename, onEditing }} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(onEditing).toHaveBeenLastCalledWith(null);
    expect(onRename).not.toHaveBeenCalled();
    screen.getByRole('tab', { name: VIEWS[1]!.label }).focus();
    await user.keyboard('{F2}');
    expect(await screen.findByRole('textbox', { name: new RegExp(`Rename ${VIEWS[1]!.label}`) })).toBeInTheDocument();
  });
});
