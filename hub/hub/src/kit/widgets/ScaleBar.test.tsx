import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SCALE_STEPS, scaleSteps } from './ScaleBar.pure';
import { ScaleBar } from './Widgets';

describe('scaleSteps', () => {
  it('up to ten steps: one step per unit of the scale, the value lit', () => {
    expect(scaleSteps(1, 5)).toEqual({ steps: 5, lit: 1 });
    expect(scaleSteps(2, 5)).toEqual({ steps: 5, lit: 2 });
    expect(scaleSteps(5, 5)).toEqual({ steps: 5, lit: 5 });
    expect(scaleSteps(3, 10)).toEqual({ steps: 10, lit: 3 });
  });
  it('a larger scale is drawn in ten steps, a value above 0 never lights none', () => {
    expect(scaleSteps(20, 40)).toEqual({ steps: SCALE_STEPS, lit: 5 });
    expect(scaleSteps(1, 100)).toEqual({ steps: SCALE_STEPS, lit: 1 });
    expect(scaleSteps(100, 100)).toEqual({ steps: SCALE_STEPS, lit: SCALE_STEPS });
  });
  it('out-of-range and unreadable values stay on the scale', () => {
    expect(scaleSteps(9, 5)).toEqual({ steps: 5, lit: 5 });
    expect(scaleSteps(0, 5)).toEqual({ steps: 5, lit: 0 });
    expect(scaleSteps(-3, 5)).toEqual({ steps: 5, lit: 0 });
    expect(scaleSteps(Number.NaN, 5)).toEqual({ steps: 5, lit: 0 });
    expect(scaleSteps(1, Number.NaN)).toEqual({ steps: 1, lit: 1 });
    expect(scaleSteps(1, 0)).toEqual({ steps: 1, lit: 1 });
  });
});

describe('ScaleBar', () => {
  it('is one image named in words, one box per step, the value lit', () => {
    render(<ScaleBar value={2} max={5} label="AI allowance: 2 times the Free plan" />);
    const img = screen.getByRole('img', { name: 'AI allowance: 2 times the Free plan' });
    const steps = [...img.children];
    expect(steps).toHaveLength(5);
    expect(steps.map((s) => /scaleLit/.test(s.className))).toEqual([true, true, false, false, false]);
    // Not a usage meter: no value range for a reader to misread as a share used.
    expect(img).not.toHaveAttribute('aria-valuenow');
  });
});
