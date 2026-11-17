// ComputerMark: the square mark that says WHICH computer (round = its state).
// The mark normalises its own colour: a raw value given straight to the prop never reaches a style.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComputerMark } from '@kit';
import s from './ComputerMark.module.css';

const markIn = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-computer-color]');

describe('ComputerMark', () => {
  it('draws the computer colour as `--computer` and `data-computer-color`, hidden from assistive tech', () => {
    const { container } = render(<ComputerMark color="#3B82F6" />);
    const m = markIn(container);
    expect(m?.getAttribute('data-computer-color')).toBe('#3B82F6');
    expect(m?.style.getPropertyValue('--computer')).toBe('#3B82F6');
    expect(m).toHaveAttribute('aria-hidden', 'true');
    expect(m?.textContent).toBe('');
  });

  it('normalises what it is given: lower case, no #, and the 3-digit form all draw #RRGGBB', () => {
    for (const [given, drawn] of [['#3b82f6', '#3B82F6'], ['3b82f6', '#3B82F6'], ['#abc', '#AABBCC']] as const) {
      const { container, unmount } = render(<ComputerMark color={given} />);
      expect(markIn(container)?.style.getPropertyValue('--computer')).toBe(drawn);
      expect(markIn(container)?.getAttribute('data-computer-color')).toBe(drawn);
      unmount();
    }
  });

  it('a hostile or missing colour, given straight to the prop, draws nothing at all (no style carries it)', () => {
    for (const color of ['red;x:url()', 'url(x)', '#fff;background:url()', 'red', '#12345', '', undefined, null]) {
      const { container, unmount } = render(<ComputerMark color={color} />);
      expect(container.innerHTML).toBe('');
      unmount();
    }
  });

  it('is a square (not the round state dot) in two sizes: sm by default, md on request', () => {
    const sm = markIn(render(<ComputerMark color="#112233" />).container);
    const md = markIn(render(<ComputerMark color="#112233" size="md" />).container);
    expect(sm).toHaveClass(s.mark as string);
    expect(sm).not.toHaveClass(s.md as string);
    expect(md).toHaveClass(s.mark as string, s.md as string);
  });

  it('the md mark normalises its colour too: a short or lower-case value draws #RRGGBB on both outputs', () => {
    for (const [given, drawn] of [['#abc', '#AABBCC'], ['3b82f6', '#3B82F6']] as const) {
      const { container, unmount } = render(<ComputerMark color={given} size="md" />);
      const md = markIn(container);
      expect(md).toHaveClass(s.md as string);
      expect(md?.getAttribute('data-computer-color')).toBe(drawn);
      expect(md?.style.getPropertyValue('--computer')).toBe(drawn);
      unmount();
    }
  });
});

// The stylesheet's own rules (jsdom computes no CSS; the browser spec ComputerMark.spec.ts measures them drawn).
describe('ComputerMark stylesheet', () => {
  const read = async (rel: string) => (await import('node:fs')).readFileSync(new URL(rel, import.meta.url), 'utf8');

  it('draws a rounded square with the ring token, and only the mark leaf is exempt from forced colours', async () => {
    const css = await read('./ComputerMark.module.css');
    const mark = /\.mark\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(mark).toMatch(/border-radius:\s*var\(--r-swatch\)/);
    expect(mark).toMatch(/background:\s*var\(--computer\)/);
    expect(mark).toMatch(/box-shadow:\s*inset 0 0 0 var\(--bw\) var\(--hx-swatch-ring\)/);
    const forced = /@media \(forced-colors: active\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(forced).toMatch(/\.mark\s*\{[^}]*forced-color-adjust:\s*none/);
    expect(forced).toMatch(/\.mark\s*\{[^}]*box-shadow:\s*inset 0 0 0 var\(--bw\) canvastext/);
    // forced-color-adjust inherits: it is on the leaf mark and nowhere else in the file.
    expect(css.match(/forced-color-adjust/g)).toHaveLength(1);
  });

  it('the ring token exists in both themes, and the swatch radius is 3 px', async () => {
    const tokens = await read('../tokens.css');
    const dark = tokens.slice(tokens.indexOf(':root[data-hx-theme="dark"] {'));
    const light = tokens.slice(0, tokens.indexOf(':root[data-hx-theme="dark"] {'));
    expect(light).toMatch(/--hx-swatch-ring:\s*rgb\(0 0 0 \/ 22%\);/);
    expect(dark.slice(0, dark.indexOf('\n}'))).toMatch(/--hx-swatch-ring:\s*rgb\(255 255 255 \/ 28%\);/);
    expect(light).toMatch(/--r-swatch:\s*3px;/);
  });
});
