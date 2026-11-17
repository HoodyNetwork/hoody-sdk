// ColorPicker: one kit colour field. A row of preset swatches (a radio group, so the
// arrow keys move between them), a hex field for an exact colour, and the browser's own picker for any
// other. The value is what the API accepts for a colour, normalised to '#RRGGBB'; '' is no colour.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ColorPicker, normalizeHexColor, PRESET_COLORS, randomPresetColor } from './ColorPicker';

// The API's curated palette (its predefined colours), in its order.
const API_PALETTE = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9', '#82E0AA', '#F8C471', '#F1948A', '#AED6F1', '#A9DFBF'];

function Host({ start, seen, isDisabled }: { start: string; seen: string[]; isDisabled?: boolean }) {
  const [v, setV] = useState(start);
  return (
    <>
      <ColorPicker
        label="Colour"
        value={v}
        isDisabled={isDisabled}
        onChange={(c) => {
          seen.push(c);
          setV(c);
        }}
      />
      <button type="button" onClick={() => setV('#45B7D1')}>
        jump
      </button>
    </>
  );
}

const hex = () => screen.getByRole('textbox', { name: 'Hex code' });
const any = () => screen.getByLabelText('Any colour');
const checked = () => screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked);

describe('normalizeHexColor', () => {
  it('takes the forms the API takes and gives #RRGGBB in capitals', () => {
    expect(normalizeHexColor('#abc')).toBe('#AABBCC');
    expect(normalizeHexColor('abc')).toBe('#AABBCC');
    expect(normalizeHexColor('#a1b2c3')).toBe('#A1B2C3');
    expect(normalizeHexColor('A1B2C3')).toBe('#A1B2C3');
    expect(normalizeHexColor('  #abc ')).toBe('#AABBCC');
  });
  it('refuses anything else', () => {
    for (const bad of ['', '#', '#ab', '#abcd', '#abcde', '#abcdef0', 'red', '#ggg', '##abc', 'rgb(1,2,3)']) expect(normalizeHexColor(bad)).toBeNull();
  });
});

describe('presets', () => {
  it('are the API palette, in its order', () => {
    expect([...PRESET_COLORS]).toEqual(API_PALETTE);
  });
  it('a random preset is always one of them, picked by the random source', () => {
    expect(randomPresetColor(() => 0)).toBe(API_PALETTE[0]);
    expect(randomPresetColor(() => 0.99999)).toBe(API_PALETTE[14]);
    expect(randomPresetColor(() => 0.5)).toBe(API_PALETTE[7]);
    for (let i = 0; i < 50; i++) expect(API_PALETTE).toContain(randomPresetColor());
  });
});

describe('ColorPicker', () => {
  it('is one named radio group of named swatches with the value checked', () => {
    render(<Host start="#4ECDC4" seen={[]} />);
    expect(screen.getByRole('radiogroup', { name: 'Colour' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(15);
    expect(checked()).toHaveLength(1);
    expect(checked()[0]).toHaveAccessibleName('Turquoise');
    expect(hex()).toHaveValue('#4ECDC4');
    expect(any()).toHaveValue('#4ecdc4');
  });

  it('a click on a swatch picks its colour', async () => {
    const seen: string[] = [];
    render(<Host start="#4ECDC4" seen={seen} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Plum' }));
    expect(seen).toEqual(['#DDA0DD']);
    expect(checked()[0]).toHaveAccessibleName('Plum');
    expect(hex()).toHaveValue('#DDA0DD');
  });

  it('arrow keys move the pick between swatches', async () => {
    const seen: string[] = [];
    render(<Host start="#4ECDC4" seen={seen} />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Turquoise' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(seen.at(-1)).toBe('#45B7D1');
    expect(checked()[0]).toHaveAccessibleName('Sky blue');
  });

  it('with a custom colour Tab still reaches the swatches', async () => {
    render(<Host start="#123456" seen={[]} />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Coral' })).toHaveFocus();
  });

  it('a typed hex code is normalised and checks its swatch when it is a preset', async () => {
    const seen: string[] = [];
    render(<Host start="#4ECDC4" seen={seen} />);
    await userEvent.clear(hex());
    await userEvent.type(hex(), 'ff6b6b');
    expect(seen.at(-1)).toBe('#FF6B6B');
    expect(checked()[0]).toHaveAccessibleName('Coral');
  });

  it('a custom colour checks no swatch and keeps its code', async () => {
    const seen: string[] = [];
    render(<Host start="#4ECDC4" seen={seen} />);
    await userEvent.clear(hex());
    await userEvent.type(hex(), '#123');
    expect(seen.at(-1)).toBe('#112233');
    expect(checked()).toHaveLength(0);
    expect(any()).toHaveValue('#112233');
  });

  it('a code that is not a colour is passed on as typed, and says so once left', async () => {
    const seen: string[] = [];
    render(<Host start="#4ECDC4" seen={seen} />);
    await userEvent.clear(hex());
    await userEvent.type(hex(), 'zz');
    expect(seen.at(-1)).toBe('zz');
    expect(screen.queryByText(/hex code such as/i)).toBeNull();
    await userEvent.tab();
    expect(screen.getByText(/hex code such as/i)).toBeInTheDocument();
    expect(checked()).toHaveLength(0);
  });

  it('the browser picker sets any colour', () => {
    const seen: string[] = [];
    render(<Host start="#4ECDC4" seen={seen} />);
    act(() => fireEvent.change(any(), { target: { value: '#123456' } }));
    expect(seen.at(-1)).toBe('#123456');
    expect(hex()).toHaveValue('#123456');
    expect(checked()).toHaveLength(0);
  });

  it('a value set from outside replaces the shown code', async () => {
    render(<Host start="#4ECDC4" seen={[]} />);
    await userEvent.click(screen.getByRole('button', { name: 'jump' }));
    expect(hex()).toHaveValue('#45B7D1');
    expect(checked()[0]).toHaveAccessibleName('Sky blue');
  });

  it('a value set from outside while the code is typed in shows once the field is left', async () => {
    render(<Host start="#4ECDC4" seen={[]} />);
    await userEvent.click(hex());
    act(() => fireEvent.click(screen.getByRole('button', { name: 'jump' })));
    expect(hex()).toHaveValue('#4ECDC4');
    act(() => fireEvent.blur(hex()));
    expect(hex()).toHaveValue('#45B7D1');
    expect(checked()[0]).toHaveAccessibleName('Sky blue');
  });

  it('text that is not a colour is passed on exactly, spaces included', async () => {
    const seen: string[] = [];
    render(<Host start="#4ECDC4" seen={seen} />);
    await userEvent.clear(hex());
    await userEvent.type(hex(), ' zz ');
    expect(seen.at(-1)).toBe(' zz ');
  });

  it('no colour checks nothing and leaves the code empty', () => {
    render(<Host start="" seen={[]} />);
    expect(checked()).toHaveLength(0);
    expect(hex()).toHaveValue('');
  });

  it('disabled locks every part', () => {
    render(<Host start="#4ECDC4" seen={[]} isDisabled />);
    for (const r of screen.getAllByRole('radio')) expect(r).toBeDisabled();
    expect(hex()).toBeDisabled();
    expect(any()).toBeDisabled();
  });

  it('accepts: text the caller takes (a CSS colour name, #RRGGBBAA) is kept as typed and not flagged; other text still is', async () => {
    const seen: string[] = [];
    const Accepting = () => {
      const [v, setV] = useState('');
      return <ColorPicker label="Colour" value={v} accepts={(t) => t === 'black'} onChange={(c) => { seen.push(c); setV(c); }} />;
    };
    render(<Accepting />);
    await act(async () => { fireEvent.focus(hex()); fireEvent.change(hex(), { target: { value: 'black' } }); fireEvent.blur(hex()); });
    expect(seen.at(-1)).toBe('black');
    expect(screen.queryByText(/hex code such as/i)).toBeNull();
    await act(async () => { fireEvent.focus(hex()); fireEvent.change(hex(), { target: { value: 'blak' } }); fireEvent.blur(hex()); });
    expect(screen.getByText(/hex code such as/i)).toBeInTheDocument();
  });

  it('accepts never hides an error the caller set', () => {
    render(<ColorPicker label="Colour" value="black" accepts={() => true} errorMessage="Not allowed here" onChange={() => {}} />);
    expect(screen.getByText('Not allowed here')).toBeInTheDocument();
  });
});

// One line, one hex control. The picker square sits inside the hex field's own box (its start), and the
// swatches and that control share one line under the label; the description describes the swatches.
describe('ColorPicker: one line', () => {
  it('the picker square is inside the hex field, before the code: one control', () => {
    render(<Host start="#4ECDC4" seen={[]} />);
    const box = hex().parentElement!;
    expect(box.contains(any())).toBe(true);
    expect(any().compareDocumentPosition(hex()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the swatches and the hex control share one line, the label above both', () => {
    render(<Host start="#4ECDC4" seen={[]} />);
    const group = screen.getByRole('radiogroup', { name: 'Colour' });
    const line = group.parentElement!;
    expect(line.contains(hex())).toBe(true);
    expect(line.contains(screen.getByText('Colour'))).toBe(false);
    expect(group.contains(hex())).toBe(false);
  });

  it('the description describes the swatches', () => {
    render(<ColorPicker label="Colour" value="" description="Shown on the Board" onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Colour' })).toHaveAccessibleDescription('Shown on the Board');
  });
});
