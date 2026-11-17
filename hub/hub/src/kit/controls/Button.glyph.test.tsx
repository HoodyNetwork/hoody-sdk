// Which buttons carry the end glyph (the arrow, plus or another pixel icon inside the plate after the label), the
// glyph's markup, and the markup of the buttons that never carry one (glyphless ones, ghost, danger, row, xs and
// IconButton).
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from '../icons';
import { Button, IconButton, LinkButton, chipFor } from './Button';

const glyphOf = (el: HTMLElement) => el.querySelector(':scope > [data-glyph-mark]');
/** A button's children in order: the tag, marked `:label` for the label and `:glyph` for the end glyph. */
const shape = (el: HTMLElement) => [...el.children].map((c) => c.tagName.toLowerCase() + (c.hasAttribute('data-btn-label') ? ':label' : c.hasAttribute('data-glyph-mark') ? ':glyph' : ''));

describe('chipFor: which buttons carry the end glyph', () => {
  const rows: Array<[Parameters<typeof chipFor>[0], boolean]> = [
    // Every primary and secondary button at md and sm, with or without an end icon, a link too.
    [{ variant: 'primary', size: 'sm', hasEnd: false }, true],
    [{ variant: 'primary', size: 'md', hasEnd: false }, true],
    [{ variant: 'secondary', size: 'md', hasEnd: false }, true],
    [{ variant: 'secondary', size: 'sm', hasEnd: true }, true],
    [{ variant: 'secondary', size: 'sm', hasEnd: false }, true],
    [{ variant: 'secondary', size: 'sm', hasEnd: false, chip: true }, true],
    [{ variant: 'secondary', size: 'sm', hasEnd: false, link: true }, true],
    // `chip={false}` leaves it out.
    [{ variant: 'primary', size: 'md', hasEnd: false, chip: false }, false],
    [{ variant: 'secondary', size: 'md', hasEnd: true, chip: false }, false],
    [{ variant: 'secondary', size: 'md', hasEnd: false, link: true, chip: false }, false],
    // xs and toolbar never carry it, even when asked.
    [{ variant: 'primary', size: 'xs', hasEnd: false }, false],
    [{ variant: 'secondary', size: 'xs', hasEnd: false, chip: true }, false],
    [{ variant: 'primary', size: 'toolbar', hasEnd: false, chip: true }, false],
    [{ variant: 'secondary', size: 'toolbar', hasEnd: true }, false],
    // No other variant carries it, even when asked.
    [{ variant: 'ghost', size: 'md', hasEnd: true }, false],
    [{ variant: 'ghost', size: 'md', hasEnd: false, chip: true }, false],
    [{ variant: 'danger', size: 'md', hasEnd: false }, false],
    [{ variant: 'dangerSolid', size: 'md', hasEnd: false }, false],
    [{ variant: 'row', size: 'sm', hasEnd: true, link: true }, false],
    [{ variant: 'bubble', size: 'md', hasEnd: false, chip: true }, false],
  ];
  for (const [input, want] of rows) it(`${JSON.stringify(input)} -> ${want}`, () => expect(chipFor(input)).toBe(want));
});

describe('a glyph button', () => {
  it('is one plate: the label, the shortcut badge, then the glyph last; one focus target, its name is the label', () => {
    render(
      <Button variant="primary" icon="plus" shortcut="Mod+J">
        Create
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Create' });
    expect(btn).toHaveAttribute('data-glyph', '');
    const kids = [...btn.children] as HTMLElement[];
    expect(shape(btn)).toEqual(['span:label', 'span', 'span:glyph']);
    // The shortcut badge and the glyph are decoration: both hidden from the name.
    expect(kids[1]).toHaveAttribute('aria-hidden', 'true');
    expect(kids[2]).toHaveAttribute('aria-hidden', 'true');
    // The text is in the label; the start icon is replaced by the glyph, the one mark, drawn once.
    expect(within(kids[0]!).getByText('Create')).toBeInTheDocument();
    expect(kids[0]!.querySelector('svg')).toBeNull();
    expect(btn.querySelectorAll('svg')).toHaveLength(1);
    expect(kids[2]!.querySelector('svg[data-px]')).not.toBeNull();
    // The badge sits between them, in neither.
    expect(kids[1]!.querySelector('kbd')).not.toBeNull();
    expect(kids[0]!.querySelector('kbd')).toBeNull();
    expect(kids[2]!.querySelector('kbd')).toBeNull();
    expect(btn.querySelectorAll('button, a, [tabindex]')).toHaveLength(0);
    // No separator and no cells: the old cell markers are gone.
    expect(btn.outerHTML).not.toMatch(/data-chip/);
  });

  it('draws the arrow by default: the smooth chevron of the top bar menus pointing to the end, 14 x 14, mirrored right-to-left', () => {
    render(
      <>
        <Button variant="primary">Go</Button>
        <Icon name="chevron-right" />
      </>,
    );
    const svg = glyphOf(screen.getByRole('button', { name: 'Go' }))!.querySelector('svg')!;
    expect(svg.getAttribute('data-px')).toBe('arrow');
    // The kit's own chevron on its 24 grid, as a stroke in the label's ink: never the pixel arrow (viewBox 0 0 8 14).
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect([svg.getAttribute('width'), svg.getAttribute('height')]).toEqual(['14', '14']);
    expect(svg.querySelectorAll('path')).toHaveLength(1);
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('m9 5 7 7-7 7');
    expect(svg.querySelector('path')!.getAttribute('d')).toBe(document.querySelector('svg.icon path')!.getAttribute('d'));
    expect(svg.querySelector('path')).not.toHaveAttribute('fill');
    expect(svg).toHaveClass('px', 'pxSmooth', 'stroke');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('data-px-mirror');
  });

  it('a menu button\'s glyph is the smooth chevron pointing down; the plus and the $ keep their pixel shapes at their own size', () => {
    render(
      <>
        <Button iconEnd="chevron-down">Menu</Button>
        <Button chipIcon="plus">Add</Button>
        <Button variant="primary" chipIcon="dollar">Pay</Button>
      </>,
    );
    const px = (name: string) => glyphOf(screen.getByRole('button', { name }))!.querySelector('svg')!;
    const box = (el: Element) => [el.getAttribute('viewBox'), el.getAttribute('width'), el.getAttribute('height')];
    expect(box(px('Menu'))).toEqual(['0 0 24 24', '14', '14']);
    expect(px('Menu').querySelector('path')!.getAttribute('d')).toBe('m5 9 7 7 7-7');
    expect(px('Menu')).toHaveClass('pxSmooth');
    expect(box(px('Add'))).toEqual(['0 0 10 10', '10', '10']);
    expect(box(px('Pay'))).toEqual(['0 0 10 14', '10', '14']);
    for (const name of ['Add', 'Pay']) {
      expect(px(name)).not.toHaveClass('pxSmooth');
      expect(px(name).querySelector('path')!.getAttribute('fill')).toBe('currentColor');
    }
  });

  it('maps the end icon to its pixel twin as the glyph; only directional ones mirror', () => {
    render(
      <>
        <Button size="sm" iconEnd="external">Out</Button>
        <Button iconEnd="chevron-down">Menu</Button>
        <Button chipIcon="plus">Add</Button>
      </>,
    );
    const px = (name: string) => glyphOf(screen.getByRole('button', { name }))!.querySelector('svg')!;
    expect(px('Out').getAttribute('data-px')).toBe('external');
    expect(px('Out')).toHaveAttribute('data-px-mirror');
    expect(px('Menu').getAttribute('data-px')).toBe('down');
    expect(px('Menu')).not.toHaveAttribute('data-px-mirror');
    expect(px('Add').getAttribute('data-px')).toBe('plus');
    expect(px('Add')).not.toHaveAttribute('data-px-mirror');
    // The end icon is drawn once, as the glyph only (no 24-grid stroke icon after the label).
    expect(screen.getByRole('button', { name: 'Out' }).querySelectorAll('svg')).toHaveLength(1);
    expect(shape(screen.getByRole('button', { name: 'Out' }))).toEqual(['span:label', 'span:glyph']);
  });

  it('busy: the spinner takes the glyph\'s place, the label stays (no start icon), presses are refused', () => {
    render(
      <Button variant="primary" icon="plus" busy>
        Saving
      </Button>,
    );
    const btn = screen.getByRole('button', { name: /Saving/ });
    const glyph = glyphOf(btn)!;
    expect(glyph.querySelector('[data-spinner]')).not.toBeNull();
    expect(glyph.querySelector('svg')).toBeNull();
    expect(btn.querySelector('[data-btn-label] svg')).toBeNull();
    // One busy mark, in the glyph's place: none before the label.
    expect(shape(btn)).toEqual(['span:label', 'span:glyph']);
    expect(btn.querySelectorAll('[data-spinner]')).toHaveLength(1);
    expect(btn).toHaveAttribute('data-pending');
  });

  it('a LinkButton carries the glyph too and keeps its link behaviour', () => {
    render(
      <>
        <LinkButton href="https://example.invalid/" size="sm">
          Docs
        </LinkButton>
        <LinkButton href="#/x" chip={false}>
          Plain
        </LinkButton>
      </>,
    );
    const a = screen.getByRole('link', { name: 'Docs' });
    expect(a).toHaveAttribute('data-glyph', '');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(glyphOf(a)!.querySelector('svg')!.getAttribute('data-px')).toBe('arrow');
    expect(shape(a)).toEqual(['span:label', 'span:glyph']);
    expect(screen.getByRole('link', { name: 'Plain' })).not.toHaveAttribute('data-glyph');
    expect(glyphOf(screen.getByRole('link', { name: 'Plain' }))).toBeNull();
  });
});

describe('buttons without the glyph', () => {
  // Their markup: [start icon or spinner] <span label> [end icon] [shortcut badge]; no glyph mark.
  const plain = (el: HTMLElement) => {
    expect(el).not.toHaveAttribute('data-glyph');
    expect(el.querySelector('[data-glyph-mark]')).toBeNull();
    return shape(el);
  };

  it('any chip={false} button and an xs button: no glyph, the start icon and the badge stay', () => {
    render(
      <>
        <Button size="sm" icon="reload" chip={false}>Retry</Button>
        <Button size="xs" variant="primary">Tiny</Button>
        <Button size="sm" shortcut="?" chip={false}>Help</Button>
      </>,
    );
    expect(plain(screen.getByRole('button', { name: 'Retry' }))).toEqual(['svg', 'span:label']);
    expect(plain(screen.getByRole('button', { name: 'Tiny' }))).toEqual(['span:label']);
    expect(plain(screen.getByRole('button', { name: /Help/ }))).toEqual(['span:label', 'span']); // the label, then the Shortcut wrapper
  });

  it('ghost, danger, dangerSolid and row never take the glyph, even with an end icon; a danger tone neither', () => {
    render(
      <>
        <Button variant="ghost" iconEnd="chevron-down">G</Button>
        <Button variant="danger">D</Button>
        <Button variant="dangerSolid">S</Button>
        <Button variant="primary" tone="danger">T</Button>
        <LinkButton variant="row" size="sm" href="https://example.invalid/" iconEnd="external">R</LinkButton>
      </>,
    );
    for (const name of ['D', 'S', 'T']) expect(plain(screen.getByRole('button', { name }))).toEqual(['span:label']);
    expect(plain(screen.getByRole('link', { name: 'R' }))).toEqual(['span:label', 'svg']);
    expect(plain(screen.getByRole('button', { name: 'G' }))).toEqual(['span:label', 'svg']);
  });

  it('IconButton: the icon alone', () => {
    render(<IconButton icon="x" label="Close" variant="secondary" />);
    expect(plain(screen.getByRole('button', { name: 'Close' }))).toEqual(['svg']);
  });

  it('a glyphless busy button: the dots over it, after the label, never before it (Button.busyplace.test.tsx)', () => {
    render(<Button size="sm" busy chip={false}>Wait</Button>);
    const btn = screen.getByRole('button', { name: /Wait/ });
    expect(plain(btn)).toEqual(['span:label', 'span']);
    expect(btn.lastElementChild!.getAttribute('aria-hidden')).toBe('true'); // the spinner, last
    expect(btn.lastElementChild!.getAttribute('data-spinner-slot')).toBe('over');
  });
});
