// A colour option (the terminal's and an agent tile's Background) opens the kit colour picker: a
// swatch picks, a typed colour is kept as typed (hex, #RRGGBBAA or a CSS name, as the program takes), the browser's
// own picker is offered, and Back to default clears it to the theme's.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EmbedValue } from '../embed/build';
import type { Catalog, TileProgram } from '../embed/catalog';
import catalog from '../embed/catalog.ui.json';
import { OptionsPanel, type Saved } from './index';

const CAT = catalog as unknown as Catalog;

function Host({ program, params, onSave }: { program: TileProgram; params?: Record<string, EmbedValue>; onSave: (s: Saved) => void }) {
  const [open, setOpen] = useState(true);
  return <OptionsPanel isOpen={open} onOpenChange={setOpen} cat={CAT} onRetry={() => undefined} program={program} tileName={`${program}-2`} computerName="atlas" params={params} running onSave={onSave} />;
}
const press = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };
const dialog = () => screen.getByRole('dialog');
const openColours = async () => {
  const sec = within(dialog()).getByRole('button', { name: /^Colours/ });
  if (sec.getAttribute('aria-expanded') !== 'true') await press(sec);
};
const background = () => within(dialog()).getByRole('radiogroup', { name: 'Background' });
const save = () => press(within(dialog()).getByRole('button', { name: 'Save' }));

describe('a colour option opens the kit colour picker', () => {
  for (const program of ['terminal', 'agent'] as const) {
    it(`${program}: a swatch picks the background; the browser's own picker is offered`, async () => {
      const onSave = vi.fn();
      render(<Host program={program} onSave={onSave} />);
      await openColours();
      const swatches = within(background()).getAllByRole('radio');
      expect(swatches.length).toBeGreaterThan(1);
      expect(within(dialog()).getByLabelText('Any colour')).toHaveAttribute('type', 'color');
      await press(swatches[0]!);
      await save();
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ backgroundColor: expect.stringMatching(/^#[0-9A-F]{6}$/) }) }));
    });
  }

  for (const [typed, kept] of [['#1e1e1e', '#1E1E1E'], ['#abc', '#AABBCC'], ['#00000080', '#00000080'], ['black', 'black']] as const) {
    it(`a typed colour: ${typed} is saved as ${kept}, and not refused`, async () => {
      const onSave = vi.fn();
      render(<Host program="terminal" onSave={onSave} />);
      await openColours();
      const hex = within(dialog()).getByRole('textbox', { name: 'Hex code' });
      await act(async () => { fireEvent.focus(hex); fireEvent.change(hex, { target: { value: typed } }); fireEvent.blur(hex); });
      expect(within(dialog()).queryByText('Use a hex code such as #4ECDC4 or #4CC.')).toBeNull();
      expect(hex).toHaveValue(kept);
      await save();
      expect(onSave).toHaveBeenCalledWith({ params: { backgroundColor: kept } });
    });
  }

  it('the browser\'s own picker sets the background', async () => {
    const onSave = vi.fn();
    render(<Host program="agent" onSave={onSave} />);
    await openColours();
    await act(async () => { fireEvent.change(within(dialog()).getByLabelText('Any colour'), { target: { value: '#123456' } }); });
    await save();
    expect(onSave).toHaveBeenCalledWith({ params: { backgroundColor: '#123456' } });
  });

  it('emptying the hex field clears a set background to the theme\'s', async () => {
    const onSave = vi.fn();
    render(<Host program="terminal" params={{ backgroundColor: '#141414' }} onSave={onSave} />);
    await openColours();
    const hex = within(dialog()).getByRole('textbox', { name: 'Hex code' });
    await act(async () => { fireEvent.focus(hex); fireEvent.change(hex, { target: { value: '' } }); fireEvent.blur(hex); });
    await save();
    expect(onSave).toHaveBeenCalledWith({ params: {} });
  });

  it('the row\'s help describes the swatches', async () => {
    render(<Host program="terminal" onSave={vi.fn()} />);
    await openColours();
    expect(background()).toHaveAccessibleDescription(/background/i);
  });

  it('a set background shows in the picker and Back to default clears it to the theme\'s', async () => {
    const onSave = vi.fn();
    render(<Host program="terminal" params={{ backgroundColor: '#141414' }} onSave={onSave} />);
    await openColours();
    expect(within(dialog()).getByRole('textbox', { name: 'Hex code' })).toHaveValue('#141414');
    const row = dialog().querySelector('[data-opt="backgroundColor"]') as HTMLElement;
    await press(within(row).getByRole('button', { name: 'Back to default' }));
    expect(within(dialog()).getByRole('textbox', { name: 'Hex code' })).toHaveValue('');
    await save();
    expect(onSave).toHaveBeenCalledWith({ params: {} });
  });
});
