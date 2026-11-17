// Every computer has its own colour (the API gives each one, random when none was picked). The list shows it beside
// the name, as the detail header does, so a computer is recognised by its colour, not only by its realms' colours.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { renderPage, screen, waitFor } from '@app/testing';
import { ComputerDot } from './parts/Bits';
import { computerColor } from './logic';
import { computers } from './fixtures';
import page from './page';

const colorOf = (name: string) => computers.find((c) => c.name === name)?.color;
const dotIn = (el: HTMLElement) => el.querySelector('[data-computer-color]');

describe('computers: each computer shows its own colour', () => {
  it('the list draws each computer’s colour beside its name', async () => {
    await renderPage(page, { path: '/computers' });
    for (const name of ['atlas', 'borealis', 'cedar']) {
      const cell = (await screen.findByText(name, { selector: 'h3, strong' }, { timeout: 8000 })).closest('td, [role="gridcell"], [role="cell"]') as HTMLElement | null;
      if (!cell) throw new Error(`no cell for ${name}`);
      expect(colorOf(name)).toBeTruthy();
      expect(dotIn(cell)?.getAttribute('data-computer-color')).toBe(colorOf(name));
      // The colour drawn is the one the dot sets, not only its data attribute.
      expect((dotIn(cell) as HTMLElement | null)?.style.getPropertyValue('--computer')).toBe(colorOf(name));
    }
    // Two computers, two different colours: the dot is the computer's, not one shared colour.
    expect(colorOf('atlas')).not.toBe(colorOf('borealis'));
  });

  it('the detail header shows the same colour', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const h = await screen.findByRole('heading', { name: 'atlas' }, { timeout: 8000 });
    const header = h.closest('header') ?? h.parentElement;
    if (!header) throw new Error('no header');
    await waitFor(() => expect(dotIn(header as HTMLElement)?.getAttribute('data-computer-color')).toBe(colorOf('atlas')));
    expect((dotIn(header as HTMLElement) as HTMLElement).style.getPropertyValue('--computer')).toBe(colorOf('atlas'));
  });

  it('a colour is used only when it is a hex colour (anything else draws no dot)', () => {
    expect(computerColor({ color: '#3B82F6' })).toBe('#3B82F6');
    expect(computerColor({ color: '3b82f6' })).toBe('#3B82F6');
    expect(computerColor({ color: '#abc' })).toBe('#AABBCC');
    for (const bad of [undefined, '', 'blue', '#12345', 'red; background: url(x)', 'var(--x)', '#GGGGGG', ' #3B82F6']) expect(computerColor({ color: bad })).toBeNull();
    // Not a string at all (outside the API contract): no colour, never a coerced one.
    for (const bad of [123, ['#abc'], { toString: null }]) expect(computerColor({ color: bad as unknown as string })).toBeNull();
  });

  it('a computer without a usable colour draws no dot at all', () => {
    for (const color of [undefined, '', 'red; background: url(x)']) {
      const { container, unmount } = render(<ComputerDot computer={color === undefined ? {} : { color }} />);
      expect(container.querySelector('[data-computer-color]')).toBeNull();
      expect(container.innerHTML).toBe('');
      unmount();
    }
  });

  it('no row draws a dot without a colour', async () => {
    await renderPage(page, { path: '/computers' });
    const name = await screen.findByText('atlas', { selector: 'h3, strong' }, { timeout: 8000 });
    const table = name.closest('table, [role="grid"]') as HTMLElement;
    const dots = [...table.querySelectorAll('[data-computer-color]')];
    expect(dots.length).toBeGreaterThan(0);
    for (const dot of dots) expect(dot.getAttribute('data-computer-color')).toMatch(/^#[0-9A-F]{6}$/);
  });
});
