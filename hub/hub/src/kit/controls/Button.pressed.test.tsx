// A worded Button as a toggle (`pressed`): aria-pressed on the element and the pressed class, and the CSS gives a worded
// toggle the toolbar's pressed step (press plate, dark frame), never a page's own background.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';

describe('Button pressed', () => {
  it('marks the toggle for assistive tech and the stylesheet while on', () => {
    render(<Button variant="ghost" pressed>Ask</Button>);
    const b = screen.getByRole('button', { name: 'Ask' });
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.className).toMatch(/\bpressed\b/);
  });

  it('says off when off, and nothing when it is not a toggle', () => {
    render(
      <>
        <Button pressed={false}>Off</Button>
        <Button>Plain</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Off' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Off' }).className).not.toMatch(/\bpressed\b/);
    expect(screen.getByRole('button', { name: 'Plain' }).hasAttribute('aria-pressed')).toBe(false);
  });

  it('draws the pressed step: the press plate and the dark frame, shared with an open toolbar control', () => {
    const css = readFileSync(join(import.meta.dirname, 'Button.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const m = /(?:^|\})\s*\.button\.pressed:not\(\.iconOnly\)\s*\{([^}]*)\}/.exec(css);
    const open = /(?:^|\})\s*\.button\.toolbar\.pressed\s*\{([^}]*)\}/.exec(css);
    expect(m, 'the worded toggle rule').not.toBeNull();
    expect(open, 'the open toolbar control rule').not.toBeNull();
    const body = m?.[1] ?? '';
    expect(body.replace(/\s+/g, ' ').trim(), 'the same step as an open toolbar control').toBe((open?.[1] ?? '').replace(/\s+/g, ' ').trim());
    expect(body).toMatch(/--plate:\s*var\(--hx-btn-plate-press\);/);
    expect(body).toMatch(/--plate-line:\s*var\(--hx-btn-line-hover\);/);
    expect(body).not.toMatch(/background/);
  });
});
