// Key badges on touch: on a coarse pointer without hover, a Button's or a menu item's key badge is not
// shown; keys in prose stay, and a fine pointer keeps every badge. happy-dom has no pointer media, so the stylesheet
// itself is checked, beside the markup the rule's selectors must reach.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';
import { Kbd, Shortcut } from './Kbd';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Kbd.module.css'), 'utf8');
const AT = '@media (pointer: coarse) and (hover: none)';
const block = (() => {
  const i = css.indexOf(AT);
  if (i < 0) return '';
  let depth = 0;
  for (let j = css.indexOf('{', i); j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}' && --depth === 0) return css.slice(i, j + 1);
  }
  return '';
})();
const outside = css.replace(block, '');

describe('Kbd on a coarse pointer without hover', () => {
  it('buttons and menu items hide their badge (one key and a whole shortcut) under that media only', () => {
    expect(block).not.toBe('');
    const rule = block.slice(block.indexOf('{') + 1);
    expect(rule).toMatch(/:is\(button, \[role='button'\], \[role='menuitem'\], \[role='menuitemcheckbox'\], \[role='menuitemradio'\]\) :is\(\.kbd, \.shortcut\)\s*{\s*display: none;\s*}/);
    expect(outside).not.toMatch(/display: none/);
  });

  it('prose keys are outside the rule: no selector reaches a kbd that is not in a control', () => {
    expect(block).not.toMatch(/(^|[{}\s,]):?\.kbd\s*[,{]/m);
    expect(block).not.toMatch(/(^|[{}\s,])\.shortcut\s*[,{]/m);
    expect(block).not.toMatch(/tooltip/i);
  });

  it('the markup it reaches: a Button shortcut is a .shortcut of .kbd chips inside the button, a lone Kbd keeps .kbd', () => {
    render(
      <>
        <Button shortcut="N">Add a program</Button>
        <p>Press <Kbd>?</Kbd> for keys</p>
        <Shortcut keys="Mod+K" />
      </>,
    );
    const btn = screen.getByRole('button', { name: /Add a program/ });
    const wrap = btn.querySelector('span[class*="shortcut"]');
    expect(wrap).not.toBeNull();
    expect(wrap!.querySelector('kbd[class*="kbd"]')?.textContent).toBe('N');
    const prose = screen.getByText('?');
    expect(prose.tagName).toBe('KBD');
    expect(prose.closest('button, [role="button"], [role^="menuitem"]')).toBeNull();
  });
});
