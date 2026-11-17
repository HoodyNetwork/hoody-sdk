import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Kbd, Shortcut, formatShortcut, shortcutKeys } from './Kbd';

// Read as text (a CSS module import gives class names, not the rules).
const css = readFileSync(path.join(import.meta.dirname, 'Kbd.module.css'), 'utf8');

describe('shortcutKeys / formatShortcut', () => {
  it('maps Mod to ⌘ on Apple and Ctrl elsewhere', () => {
    expect(shortcutKeys('Mod+K', true)).toEqual(['⌘', 'K']);
    expect(shortcutKeys('Mod+K', false)).toEqual(['Ctrl', 'K']);
    expect(formatShortcut('Alt+Shift+R', false)).toBe('Alt Shift R');
    expect(formatShortcut('Alt+Shift+R', true)).toBe('⌥⇧R');
  });

  it('keeps single keys as written and reads Plus as the + key', () => {
    expect(shortcutKeys('j', false)).toEqual(['j']);
    expect(shortcutKeys('Ctrl+Plus', false)).toEqual(['Ctrl', '+']);
  });
});

describe('Kbd / Shortcut', () => {
  it('renders one kbd per key, alternatives side by side', () => {
    const { container } = render(<Shortcut keys={['j', 'k']} />);
    const keys = [...container.querySelectorAll('kbd kbd')].map((k) => k.textContent);
    expect(keys).toEqual(['j', 'k']);
  });

  it('renders a combination as nested kbd elements', () => {
    const { container } = render(<Shortcut keys="Shift+J" />);
    const outer = container.querySelectorAll(':scope > span > kbd');
    expect(outer).toHaveLength(1);
    expect(outer[0]?.querySelectorAll('kbd')).toHaveLength(2);
  });

  it('Kbd is a kbd element', () => {
    const { getByText } = render(<Kbd>?</Kbd>);
    expect(getByText('?').tagName).toBe('KBD');
  });
});

describe('Kbd contrast (axe color-contrast)', () => {
  it('never dims its text: every color is the surrounding text color, so it reads at least as well as that text', () => {
    const colors = [...css.matchAll(/(?:^|[;{\s])color:\s*([^;]+);/g)].map((m) => m[1]?.trim());
    expect(colors.length).toBeGreaterThan(0);
    for (const c of colors) expect(c).toMatch(/^(inherit|currentcolor)$/);
  });
});

describe('Kbd in a menu row or a list option', () => {
  // The rule that gives a key chip inside a button its quiet hairline (no fill) also names menu items and options, so a
  // shortcut beside a menu label never reads as a second filled button.
  const rule = (sel: string): string | null => {
    for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const sels = (m[1] ?? '').split(',').map((x) => x.replace(/\s+/g, ' ').trim());
      if (sels.includes(sel)) return m[2] ?? '';
    }
    return null;
  };
  for (const role of ['menuitem', 'menuitemradio', 'menuitemcheckbox', 'option']) {
    it(`a chip in [role=${role}] takes the hairline, no fill`, () => {
      const body = rule(`[role='${role}'] .kbd`);
      expect(body, `a rule for [role='${role}'] .kbd`).not.toBeNull();
      expect(body).toMatch(/border-color:\s*color-mix\(in srgb, currentcolor 30%, transparent\)/);
      expect(body).toMatch(/background:\s*transparent/);
    });
  }
  it('the button rule itself is unchanged', () => {
    expect(rule('button .kbd')).toMatch(/background:\s*transparent/);
  });
});
