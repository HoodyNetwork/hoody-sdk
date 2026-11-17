// CodeBlock's Copy button never sits over the code. The button has a
// column of its own at the block's end, so the code's scroller ends where the button starts, at any width and for any
// button size (44 px on a coarse pointer): no reliance on end padding the overflowing text runs through.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodeBlock } from './Ids';

const css = readFileSync(path.join(import.meta.dirname, 'Ids.module.css'), 'utf8');
const rule = (sel: string) => new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

describe('CodeBlock Copy button column', () => {
  it('the block with a Copy button is a two-column grid: code, then the button', () => {
    const { container } = render(<CodeBlock lang="shell" prompt label="Start" code="jupyter lab --no-browser --port 18888" />);
    const fig = container.querySelector('figure')!;
    expect(fig.className).toMatch(/withCopy/);
    expect(rule('.withCopy')).toMatch(/display:\s*grid/);
    expect(rule('.withCopy')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
    // a gap between the code and the button: a cut line never ends flush against it
    expect(rule('.withCopy')).toMatch(/column-gap:\s*var\(--sp-2\)/);
    // the button is the figure's own child, after the code
    const kids = [...fig.children].map((k) => k.tagName);
    expect(kids.slice(0, 2)).toEqual(['PRE', 'BUTTON']);
  });

  it('the button is laid out, never placed over the code', () => {
    expect(rule('button.codeCopy')).not.toMatch(/position:\s*absolute/);
    // the code keeps even padding: its end is the button's column, not a gutter the text overflows into
    expect(rule('.pre')).toMatch(/padding:\s*var\(--sp-3\);/);
  });

  it('a footer spans both columns; without Copy the block is one column', () => {
    expect(rule('.withCopy > .codeFooter')).toMatch(/grid-column:\s*1\s*\/\s*-1/);
    const { container } = render(<CodeBlock lang="plain" label="Log" code="x" noCopy />);
    expect(container.querySelector('figure')!.className).not.toMatch(/withCopy/);
    expect(container.querySelector('button')).toBeNull();
  });
});
