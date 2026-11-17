// The computer's own page carries its colour as one band on the element that stays on
// screen, the 12 px mark beside its state, and a Colour fact (swatch + #RRGGBB text). Each says which computer THIS page
// is about: borealis' page shows borealis' colour although the shell's current computer is atlas.
import { afterEach, describe, expect, it } from 'vitest';
import { renderPage, screen, waitFor, within } from '@app/testing';
import { computerColor } from '@core';
import { computers } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const byName = (name: string) => {
  const c = computers.find((x) => x.name === name);
  if (!c) throw new Error(`no fixture ${name}`);
  return c;
};
const hex = (name: string) => computerColor({ color: byName(name).color }) as string;
const sel = (name: string) => `/computers?sel=${name}.${byName(name).id.slice(-4)}`;
const bands = () => [...document.querySelectorAll('[data-detail-accent], [data-tab-accent]')];

describe('computers: detail colour band, mark and Colour fact', () => {
  it('atlas: one header band in atlas colour; the md mark beside the state; the Colour fact reads #RRGGBB', async () => {
    await renderPage(page, { path: sel('atlas') });
    await screen.findByRole('heading', { name: 'atlas' }, { timeout: 8000 });
    const band = await waitFor(() => {
      const b = document.querySelector('header [data-detail-accent]');
      if (!b) throw new Error('no band yet');
      return b;
    });
    expect(band).toHaveAttribute('data-detail-accent', hex('atlas'));
    const header = band.closest('header') as HTMLElement;
    const mark = header.querySelector('[data-computer-color]') as HTMLElement;
    expect(mark).toHaveAttribute('data-computer-color', hex('atlas'));
    expect(mark.style.getPropertyValue('--computer')).toBe(hex('atlas'));
    const colour = (await screen.findByText(strings['detail.colour'], { selector: 'dt' }, { timeout: 8000 })).nextElementSibling as HTMLElement;
    expect(colour).toHaveTextContent(hex('atlas'));
    expect(within(colour).getByText(hex('atlas'))).toBeInTheDocument();
    expect(colour.querySelector('[data-computer-color]')).toHaveAttribute('data-computer-color', hex('atlas'));
    // the tablist still carries the computer's name
    expect(screen.getByRole('tablist', { name: 'atlas' })).toBeInTheDocument();
  });

  it('borealis (not the shell’s current computer) shows its own colour, not atlas’s', async () => {
    expect(hex('borealis')).not.toBe(hex('atlas'));
    await renderPage(page, { path: sel('borealis') });
    await screen.findByRole('heading', { name: 'borealis' }, { timeout: 8000 });
    await waitFor(() => expect(document.querySelector('header [data-detail-accent]')).toHaveAttribute('data-detail-accent', hex('borealis')));
    expect(bands().every((b) => b.getAttribute('data-detail-accent') === hex('borealis') || b.getAttribute('data-tab-accent') === hex('borealis'))).toBe(true);
  });

  describe('a hostile colour from the API', () => {
    const original = byName('cedar').color;
    afterEach(() => {
      byName('cedar').color = original;
    });

    it.each(['red;x:url()', 'url(x)', '#12345', ''])('%j: no band, no mark, no Colour row, nothing in a style', async (bad) => {
      byName('cedar').color = bad;
      await renderPage(page, { path: sel('cedar') });
      await screen.findByRole('heading', { name: 'cedar' }, { timeout: 8000 });
      await screen.findByText(strings['fact.computer'], { selector: 'dt' }, { timeout: 8000 });
      expect(bands()).toHaveLength(0);
      expect(screen.queryByText(strings['detail.colour'], { selector: 'dt' })).toBeNull();
      expect(document.body.innerHTML).not.toContain('url(x)');
      expect(document.body.innerHTML).not.toContain('x:url()');
    });
  });
});
