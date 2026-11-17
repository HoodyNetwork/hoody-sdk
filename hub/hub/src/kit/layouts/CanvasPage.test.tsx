// CanvasPage (Board, kit half): the page name is the route-focus target and the body fills the
// page. The chrome hide/restore on Esc and on leaving the route is the shell half (useChromeHidden).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CanvasPage } from './Layouts';

describe('CanvasPage', () => {
  it('names the page with a focusable, visually hidden h1 the shell focuses on route change', () => {
    render(
      <CanvasPage title="Board">
        <div>canvas</div>
      </CanvasPage>,
    );
    const h1 = screen.getByRole('heading', { level: 1, name: 'Board' });
    expect(h1).toHaveAttribute('data-hub-title');
    expect(h1).toHaveAttribute('tabindex', '-1');
    h1.focus();
    expect(document.activeElement).toBe(h1);
  });

  it('renders no page header row: the page draws its own controls', () => {
    const { container } = render(
      <CanvasPage title="Board">
        <button type="button">Zoom in</button>
      </CanvasPage>,
    );
    expect(container.querySelector('header')).toBeNull();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
  });

  it('fills the content height edge to edge (no page padding, the body takes the rest)', () => {
    const css = readFileSync(join(__dirname, 'Layouts.module.css'), 'utf8');
    const rule = (sel: string) => css.match(new RegExp(`\\n\\${sel} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('.canvas')).toMatch(/height: 100%/);
    expect(rule('.canvas')).toMatch(/min-height: 0/);
    expect(rule('.canvas')).not.toMatch(/padding/);
    expect(rule('.canvasBody')).toMatch(/flex: 1/);
    expect(rule('.canvasBody')).toMatch(/position: relative/);
  });
});
