// Vitest: the frame rule and the six size thresholds. Nothing overlays the conversation.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SplitLayout, splitState } from './SplitLayout';
import { SIZE_BREAKS, isSmall, sizeClassOf, type SizeClass } from './useSizeClass';

describe('size classes: six thresholds', () => {
  it('the breaks are 600, 840, 1180, 1560 and 2400', () => {
    expect([...SIZE_BREAKS]).toEqual([600, 840, 1180, 1560, 2400]);
  });
  it.each<[number, SizeClass]>([
    [0, 'xs'], [599, 'xs'], [600, 's'], [839, 's'], [840, 'm'], [1179, 'm'], [1180, 'l'], [1559, 'l'], [1560, 'xl'], [2399, 'xl'], [2400, 'xxl'], [5000, 'xxl'],
  ])('%i px is %s', (w, c) => {
    expect(sizeClassOf(w)).toBe(c);
  });
  it('the common windows of the design land in their class (page width, not window)', () => {
    expect(sizeClassOf(968)).toBe('m'); // 1024 with the rail
    expect(sizeClassOf(1110)).toBe('m'); // 1350, sidebar expanded
    expect(sizeClassOf(1294)).toBe('l'); // 1350 with the rail
    expect(sizeClassOf(1680)).toBe('xl'); // 1920 expanded
    expect(sizeClassOf(3200)).toBe('xxl'); // 3440 expanded
  });
  it('a width that is not a number is the fallback, never a guess', () => {
    expect(sizeClassOf(Number.NaN)).toBe('l');
    expect(sizeClassOf(Number.NaN, 'xs')).toBe('xs');
    expect(sizeClassOf(-1, 's')).toBe('s');
  });
  it('xs and s are small', () => {
    expect((['xs', 's', 'm', 'l', 'xl', 'xxl'] as const).filter(isSmall)).toEqual(['xs', 's']);
  });
});

describe('splitState: the frame rule', () => {
  it('below 840 the list and the conversation take turns; Details is the whole page', () => {
    for (const c of ['xs', 's'] as const) {
      expect(splitState(c, { detailsOpen: false, screen: 'list' })).toEqual({ pane: true, main: false, details: 'none' });
      expect(splitState(c, { detailsOpen: false, screen: 'conversation' })).toEqual({ pane: false, main: true, details: 'none' });
      expect(splitState(c, { detailsOpen: true, screen: 'conversation' })).toEqual({ pane: false, main: false, details: 'sheet' });
    }
  });
  it('at m and l Details takes the pane\'s place', () => {
    for (const c of ['m', 'l'] as const) {
      expect(splitState(c, { detailsOpen: false })).toEqual({ pane: true, main: true, details: 'none' });
      expect(splitState(c, { detailsOpen: true })).toEqual({ pane: false, main: true, details: 'column' });
    }
  });
  it('at xl and xxl all three sit side by side', () => {
    for (const c of ['xl', 'xxl'] as const) {
      expect(splitState(c, { detailsOpen: true })).toEqual({ pane: true, main: true, details: 'column' });
    }
  });
  it('the conversation is never hidden by Details at m and wider', () => {
    for (const c of ['m', 'l', 'xl', 'xxl'] as const) {
      for (const open of [true, false]) expect(splitState(c, { detailsOpen: open }).main).toBe(true);
    }
  });
});

describe('SplitLayout', () => {
  it('keeps a hidden slot mounted, so its draft and scroll survive', () => {
    const { container, rerender } = render(<SplitLayout size="m" detailsOpen={false} pane={<i data-t="pane" />} main={<i data-t="main" />} details={<i data-t="details" />} />);
    const pane = container.querySelector('[data-t=pane]')?.parentElement as HTMLElement;
    expect(pane.hidden).toBe(false);
    rerender(<SplitLayout size="m" detailsOpen pane={<i data-t="pane" />} main={<i data-t="main" />} details={<i data-t="details" />} />);
    expect(container.querySelector('[data-t=pane]')).not.toBeNull();
    expect((container.querySelector('[data-t=pane]')?.parentElement as HTMLElement).hidden).toBe(true);
    expect((container.querySelector('[data-t=details]')?.parentElement as HTMLElement).hidden).toBe(false);
    expect((container.firstElementChild as HTMLElement).dataset.details).toBe('column');
  });
  it('without a details slot the rule ignores detailsOpen', () => {
    const { container } = render(<SplitLayout size="m" detailsOpen pane={<i data-t="pane" />} main={<i />} />);
    expect((container.querySelector('[data-t=pane]')?.parentElement as HTMLElement).hidden).toBe(false);
  });
});
