// A confirm that names its effects; typed, the button arms only on the exact text.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmEffect, type ConfirmEffectProps } from './ConfirmEffect';

afterEach(() => cleanup());

function Host(p: Partial<ConfirmEffectProps>) {
  const [open, setOpen] = useState(true);
  return <><button onClick={() => setOpen(true)}>reopen</button><ConfirmEffect isOpen={open} onOpenChange={setOpen} title="Tidy up?" effects={['It merges.', 'It cannot be undone.']} confirmLabel="Tidy up" onConfirm={() => undefined} {...p} /></>;
}
const dialog = () => screen.getByRole('alertdialog');

describe('ConfirmEffect', () => {
  it('names every effect and the note', () => {
    render(<Host note="It moves nothing." />);
    expect(within(dialog()).getByText('It merges.')).toBeInTheDocument();
    expect(within(dialog()).getByText('It cannot be undone.')).toBeInTheDocument();
    expect(within(dialog()).getByText('It moves nothing.')).toBeInTheDocument();
  });

  it('a plain confirm arms at once and runs the action', async () => {
    const onConfirm = vi.fn();
    render(<Host onConfirm={onConfirm} />);
    expect(within(dialog()).queryByRole('textbox')).toBeNull();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Tidy up' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('a typed confirm arms only on the exact text (outer spaces ignored)', async () => {
    const onConfirm = vi.fn();
    render(<Host confirmText="shop" onConfirm={onConfirm} />);
    const go = within(dialog()).getByRole('button', { name: 'Tidy up' });
    const box = within(dialog()).getByRole('textbox');
    expect(go).toBeDisabled();
    for (const near of ['sho', 'Shop', 'shopp', 'sh op']) {
      await userEvent.clear(box);
      await userEvent.type(box, near);
      expect(go).toBeDisabled();
    }
    await userEvent.clear(box);
    await userEvent.type(box, '  shop ');
    expect(go).toBeEnabled();
    await userEvent.click(go);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('an empty confirm text never arms', async () => {
    const onConfirm = vi.fn();
    render(<Host confirmText="" onConfirm={onConfirm} />);
    const go = within(dialog()).getByRole('button', { name: 'Tidy up' });
    expect(go).toBeDisabled();
    await userEvent.type(within(dialog()).getByRole('textbox'), '   ');
    expect(go).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('what was typed is gone when it opens again', async () => {
    render(<Host confirmText="shop" />);
    await userEvent.type(within(dialog()).getByRole('textbox'), 'shop');
    await userEvent.click(within(dialog()).getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'reopen' }));
    expect(within(dialog()).getByRole('textbox')).toHaveValue('');
    expect(within(dialog()).getByRole('button', { name: 'Tidy up' })).toBeDisabled();
  });

  it('the danger tone keeps the typed gate', async () => {
    render(<Host confirmText="shop" tone="danger" />);
    expect(within(dialog()).getByRole('button', { name: 'Tidy up' })).toBeDisabled();
  });
});
