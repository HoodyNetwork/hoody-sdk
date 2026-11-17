// A custom terminal theme's colours open the kit colour picker, one per theme
// colour (text, background, cursor; the 16 terminal colours in a section of their own). A pick joins the theme and the
// JSON shows it; keys the pickers do not cover stay; text that is not a colour is refused in its own field and never
// reaches the theme; JSON that does not parse locks the pickers until fixed; emptying the last colour is the default.
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
const row = () => dialog().querySelector('[data-opt="theme"]') as HTMLElement;
const openColours = async () => {
  if (row()) return;
  await press(within(dialog()).getByRole('button', { name: /^Colours/ }));
};
const colour = (name: string) => within(row()).getByRole('group', { name });
const hexOf = (name: string) => within(colour(name)).getByRole('textbox', { name: 'Hex code' });
const typeHex = async (name: string, value: string) => {
  const hex = hexOf(name);
  await act(async () => { fireEvent.focus(hex); fireEvent.change(hex, { target: { value } }); fireEvent.blur(hex); });
};
const editor = () => within(dialog()).getByRole('textbox', { name: 'Theme JSON' });
const save = () => press(within(dialog()).getByRole('button', { name: 'Save' }));
const CUSTOM = { foreground: '#AAAAAA', background: '#111111', selectionBackground: '#333333' };

describe('a custom terminal theme: one colour picker per theme colour', () => {
  it('text, background and cursor show; the 16 terminal colours sit in their own section', async () => {
    render(<Host program="terminal" params={{ theme: CUSTOM }} onSave={vi.fn()} />);
    await openColours();
    for (const n of ['Terminal text', 'Terminal background', 'Cursor']) expect(colour(n)).toBeInTheDocument();
    expect(hexOf('Terminal text')).toHaveValue('#AAAAAA');
    const ansi = within(row()).getByRole('button', { name: /The 16 terminal colours/ });
    if (ansi.getAttribute('aria-expanded') !== 'true') await press(ansi);
    expect(hexOf('Bright magenta')).toBeInTheDocument();
  });

  it('a swatch picks the background: the theme keeps its other keys, and the JSON shows the pick', async () => {
    const onSave = vi.fn();
    render(<Host program="terminal" params={{ theme: CUSTOM }} onSave={onSave} />);
    await openColours();
    const swatch = within(within(colour('Terminal background')).getByRole('radiogroup')).getAllByRole('radio')[0]!;
    await press(swatch);
    const picked = hexOf('Terminal background').getAttribute('value') ?? '';
    expect(picked).toMatch(/^#[0-9A-F]{6}$/);
    expect(picked).not.toBe('#111111');
    expect(JSON.parse((editor() as HTMLTextAreaElement).value)).toEqual({ ...CUSTOM, background: picked });
    await save();
    expect(onSave).toHaveBeenCalledWith({ params: { theme: { ...CUSTOM, background: picked } } });
  });

  it('a typed colour joins the theme; text that is not a colour is refused in its field and never saved', async () => {
    const onSave = vi.fn();
    render(<Host program="terminal" params={{ theme: CUSTOM }} onSave={onSave} />);
    await openColours();
    await typeHex('Cursor', '#abc');
    expect(JSON.parse((editor() as HTMLTextAreaElement).value)).toEqual({ ...CUSTOM, cursor: '#AABBCC' });
    await typeHex('Cursor', 'notacolour!');
    expect(hexOf('Cursor')).toHaveAttribute('aria-invalid', 'true');
    expect(JSON.parse((editor() as HTMLTextAreaElement).value)).toEqual({ ...CUSTOM, cursor: '#AABBCC' });
    await save();
    expect(onSave).not.toHaveBeenCalled();
    await typeHex('Cursor', '#123456');
    await save();
    expect(onSave).toHaveBeenCalledWith({ params: { theme: { ...CUSTOM, cursor: '#123456' } } });
  });

  it('JSON that does not parse locks the pickers with a note; fixing it unlocks them', async () => {
    render(<Host program="terminal" params={{ theme: CUSTOM }} onSave={vi.fn()} />);
    await openColours();
    await act(async () => { fireEvent.change(editor(), { target: { value: '{' } }); });
    expect(hexOf('Terminal text')).toBeDisabled();
    expect(within(row()).getByText('Fix the theme JSON below to pick colours again.')).toBeInTheDocument();
    await act(async () => { fireEvent.change(editor(), { target: { value: '{"foreground":"#000000"}' } }); });
    expect(hexOf('Terminal text')).not.toBeDisabled();
    expect(hexOf('Terminal text')).toHaveValue('#000000');
  });

  it('a theme colour in the JSON that is not a colour is refused on the editor, and a later pick does not save it', async () => {
    const onSave = vi.fn();
    render(<Host program="terminal" params={{ theme: CUSTOM }} onSave={onSave} />);
    await openColours();
    await act(async () => { fireEvent.change(editor(), { target: { value: '{"cursor":"notacolour!","selectionBackground":"#333333"}' } }); });
    expect(editor()).toHaveAttribute('aria-invalid', 'true');
    expect(editor()).toHaveAccessibleDescription(/A theme colour is not a colour/);
    await typeHex('Terminal text', '#123456');
    await save();
    expect(onSave).not.toHaveBeenCalled();
    await typeHex('Cursor', '#000000');
    expect(editor()).not.toHaveAttribute('aria-invalid', 'true');
    await save();
    expect(onSave).toHaveBeenCalledWith({ params: { theme: { cursor: '#000000', selectionBackground: '#333333', foreground: '#123456' } } });
  });

  it('a valid theme that is too long still says so on the editor', async () => {
    render(<Host program="terminal" params={{ theme: CUSTOM }} onSave={vi.fn()} />);
    await openColours();
    await act(async () => { fireEvent.change(editor(), { target: { value: JSON.stringify({ foreground: '#000000', note: 'a'.repeat(2100) }) } }); });
    await save();
    expect(editor()).toHaveAccessibleDescription(/Too long to save/);
  });

  it('spaces alone in a colour field empty that colour: no error, saved without it', async () => {
    const onSave = vi.fn();
    render(<Host program="terminal" params={{ theme: CUSTOM }} onSave={onSave} />);
    await openColours();
    await typeHex('Terminal text', '   ');
    expect(hexOf('Terminal text')).not.toHaveAttribute('aria-invalid', 'true');
    await save();
    expect(onSave).toHaveBeenCalledWith({ params: { theme: { background: '#111111', selectionBackground: '#333333' } } });
  });

  it('emptying the last colour leaves no theme: the default', async () => {
    const onSave = vi.fn();
    render(<Host program="terminal" params={{ theme: { foreground: '#AAAAAA' } }} onSave={onSave} />);
    await openColours();
    await typeHex('Terminal text', '');
    expect((editor() as HTMLTextAreaElement).value).toBe('');
    await save();
    expect(onSave).toHaveBeenCalledWith({ params: {} });
  });
});
