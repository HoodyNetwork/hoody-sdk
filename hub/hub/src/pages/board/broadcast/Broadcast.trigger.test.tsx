// The Broadcast button: a quiet icon button with the video icon, named Broadcast (its tooltip says
// so), still the Popover's trigger; it sits in the Board strip's end group beside Focus, before Add a program.
import { bootFixtureCore, CoreQueryProvider } from '@core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Broadcast } from './Broadcast';

const mount = async () => {
  bootFixtureCore({ rules: [] });
  await act(async () => { render(<Broadcast computers={[]} />, { wrapper: CoreQueryProvider }); });
  return screen.getByRole('button', { name: 'Broadcast' });
};

describe('the Broadcast button', () => {
  it('is named Broadcast, drawn as the kit video icon with no words beside it, and quiet (ghost)', async () => {
    const b = await mount();
    expect(b).toHaveAccessibleName('Broadcast');
    expect(b.textContent).toBe('');
    expect(b.className).toMatch(/iconOnly/);
    expect(b.className).toMatch(/ghost/);
    expect(b.className).not.toMatch(/primary|secondary/);
    // The video icon: a camera body and its lens, not the share glyph.
    const svg = b.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe('M3 6h12v12H3zM15 10l6-3v10l-6-3');
  });

  it('still opens the panel, with the keyboard too', async () => {
    const b = await mount();
    const user = userEvent.setup();
    act(() => b.focus());
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Broadcast this Board' })).toBeInTheDocument();
  });

  it('says what it is in a tooltip, from the strings file', async () => {
    const b = await mount();
    const user = userEvent.setup();
    await user.tab();
    expect(b).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Broadcast');
  });
});

describe('where the strip puts it', () => {
  const strip = readFileSync(join(import.meta.dirname, '../parts/Strip.tsx'), 'utf8');
  const at = (needle: string) => {
    const i = strip.indexOf(needle);
    expect(i, needle).toBeGreaterThan(-1);
    return i;
  };
  it('the Broadcast slot comes after Focus and before the rule and Add a program, no longer right after Add a program', () => {
    expect(at('ref={slotRef}')).toBeGreaterThan(at('onPress={p.onFocus}'));
    // The rule before Add a program at the row's end (the Board menu left the end for Boards ▾ at the start).
    expect(at('ref={slotRef}')).toBeLessThan(at('className={s.stripRule}'));
    expect(at('ref={slotRef}')).toBeGreaterThan(at('items={p.layoutMenu}'));
  });
});
