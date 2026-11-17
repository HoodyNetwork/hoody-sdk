// `literal`: Button, LinkButton and TextButton mark a data label with data-literal, and Button.module.css resets the
// theme's case and tracking under selectors that outweigh both rules that set them (.button 0,1,0 and .button.toolbar
// 0,2,0), so the reset wins wherever it sits in the file.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, LinkButton } from './Button';
import { TextButton } from './Link';

const css = readFileSync(join(import.meta.dirname, 'Button.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('literal', () => {
  it('Button (with and without the glyph), LinkButton (with and without it) and TextButton render data-literal only when asked', () => {
    render(
      <>
        <Button literal chip={false}>plain-on</Button>
        <Button>plain-off</Button>
        <Button literal variant="primary" chip>glyph-on</Button>
        <LinkButton literal href="/x" variant="ghost">link-on</LinkButton>
        <LinkButton literal href="/y" variant="primary" chip>link-glyph-on</LinkButton>
        <LinkButton href="/z">link-off</LinkButton>
        <TextButton literal>text-on</TextButton>
        <TextButton>text-off</TextButton>
      </>,
    );
    for (const name of ['plain-on', 'glyph-on', 'text-on']) expect(screen.getByRole('button', { name }), name).toHaveAttribute('data-literal', '');
    for (const name of ['link-on', 'link-glyph-on']) expect(screen.getByRole('link', { name }), name).toHaveAttribute('data-literal', '');
    for (const name of ['plain-off', 'text-off']) expect(screen.getByRole('button', { name }), name).not.toHaveAttribute('data-literal');
    expect(screen.getByRole('link', { name: 'link-off' })).not.toHaveAttribute('data-literal');
    expect(screen.getByRole('button', { name: 'glyph-on' })).toHaveAttribute('data-glyph', '');
    expect(screen.getByRole('link', { name: 'link-glyph-on' })).toHaveAttribute('data-glyph', '');
    expect(screen.getByRole('button', { name: 'plain-on' })).not.toHaveAttribute('data-glyph');
    expect(screen.getByRole('link', { name: 'link-on' })).not.toHaveAttribute('data-glyph');
  });

  // .button sets the family's case and tracking at (0,1,0) and .button.toolbar the toolbar tracking at (0,2,0): the reset
  // names both, at (0,2,0) and (0,3,0).
  it('the reset rule names both selectors and resets case and tracking', () => {
    const m = /\.button\[data-literal\],\s*\.button\.toolbar\[data-literal\]\s*\{([^}]*)\}/.exec(css);
    expect(m, 'the `.button[data-literal], .button.toolbar[data-literal]` rule').not.toBeNull();
    const body = m?.[1] ?? '';
    expect(body).toMatch(/text-transform:\s*none/);
    expect(body).toMatch(/letter-spacing:\s*normal/);
  });

  it('every other rule that sets a case or a tracking is one the reset outweighs, or the bubble (never in capitals itself)', () => {
    const setters = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((r) => /(^|[;\s])(letter-spacing|text-transform)\s*:/.test(r[2]!)).map((r) => r[1]!.trim().replace(/\s+/g, ' '));
    expect(setters).toEqual(['.button', '.button[data-literal], .button.toolbar[data-literal]', '.button.bubble', '.button.toolbar']);
  });
});
