// The Talk entry's chip shows a microphone, never the site arrow, whether Talk can start or says why not.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MicButton } from './MicButton';
import strings from './Voice.strings.en.json';

const glyph = (b: HTMLElement) => b.querySelector('[data-px]')?.getAttribute('data-px');

describe('MicButton chip', () => {
  it('Talk can start: the chip glyph is the microphone', () => {
    render(<MicButton onPress={() => undefined} />);
    const b = screen.getByRole('button', { name: strings['mic.label'] });
    expect(glyph(b)).toBe('mic');
  });
  it('Talk cannot start here: the reason button keeps the microphone too', () => {
    render(<MicButton reason="ownTab" onPress={() => undefined} />);
    const b = screen.getByRole('button', { name: strings['mic.label'] });
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(glyph(b)).toBe('mic');
  });
  it('the microphone glyph is a 14 px pixel icon on the 2 px grid that never mirrors', () => {
    render(<MicButton onPress={() => undefined} />);
    const svg = screen.getByRole('button', { name: strings['mic.label'] }).querySelector('[data-px="mic"]') as SVGElement;
    expect(svg.getAttribute('viewBox')).toBe('0 0 14 14');
    expect(svg.hasAttribute('data-px-mirror')).toBe(false);
    const d = svg.querySelector('path')?.getAttribute('d') ?? '';
    for (const n of d.match(/\d+/g) ?? []) expect(Number(n) % 2).toBe(0);
  });
});
