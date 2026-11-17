// A field group in a Disclosure's fold is judged against the 640 px line on the width before the fold's inset, so groups
// of one panel take one layout at the same width; and a group's title is drawn in the group heading's type, a step
// above its rows' names.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Disclosure } from '../controls/Disclosure';
import { SettingGroup, fieldLineShort } from './SettingGroup';
import { SettingRow } from './SettingRow';

const css = readFileSync(join(__dirname, 'SettingGroup.module.css'), 'utf8');

beforeEach(() => {
  boot();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the 640 px line in a fold', () => {
  it('counts the fold inset back', () => {
    expect(fieldLineShort({ width: 620, fold: 0 })).toBe(true);
    expect(fieldLineShort({ width: 620, fold: 22 })).toBe(false);
    expect(fieldLineShort({ width: 617, fold: 22 })).toBe(true);
    expect(fieldLineShort({ width: 618, fold: 22 })).toBe(false);
  });

  /** Lays the page out by hand: jsdom has no layout. `fold` is the fold's width, `inset` its inline-start padding. */
  function layout(widths: { wrap: number; fold: number; inset: number }) {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute('data-disclosure-panel')) return widths.fold;
      if (this.hasAttribute('data-setting-group') || this.parentElement?.hasAttribute('data-setting-group')) return widths.wrap;
      return 0;
    });
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
      const cs = real(el, pseudo);
      if (!(el instanceof HTMLElement) || !el.hasAttribute('data-disclosure-panel')) return cs;
      return new Proxy(cs, { get: (t, k) => (k === 'paddingInlineStart' ? `${widths.inset}px` : Reflect.get(t, k)) });
    });
  }

  const group = () => (
    <SettingGroup variant="field" title="Calls from other websites">
      <SettingRow label="Allowed website">x</SettingRow>
    </SettingGroup>
  );
  const wrap = () => document.querySelector('[data-setting-group]')!;

  it('a group whose width before the inset reaches 640 stays side by side, as the open groups beside it', () => {
    layout({ wrap: 620, fold: 642, inset: 22 });
    render(
      <Disclosure title="More settings" defaultExpanded>
        {group()}
      </Disclosure>,
    );
    expect(wrap()).toHaveAttribute('data-sg-fold');
    expect(wrap()).not.toHaveAttribute('data-stack');
  });

  it('a group whose width before the inset is under 640 stacks', () => {
    layout({ wrap: 600, fold: 622, inset: 22 });
    render(
      <Disclosure title="More settings" defaultExpanded>
        {group()}
      </Disclosure>,
    );
    expect(wrap()).toHaveAttribute('data-sg-fold');
    expect(wrap()).toHaveAttribute('data-stack');
  });

  it('outside a fold nothing changes: the CSS line judges the group, not the fold rule', () => {
    layout({ wrap: 620, fold: 0, inset: 0 });
    render(group());
    expect(wrap()).not.toHaveAttribute('data-sg-fold');
    expect(wrap()).not.toHaveAttribute('data-stack');
    // The container query's field rules hold only for a group outside a fold.
    const block = css.slice(css.indexOf('@container setting-group (width < 640px)'), css.indexOf('[data-stack] > .group {'));
    const selectors = block.match(/^ {2}[^\s@}][^{]*\{/gm) ?? [];
    expect(selectors.length).toBeGreaterThan(5);
    // Inside :where(), so the fold test adds no weight: the 400 px rules after the block (same weight) still win there.
    for (const sel of selectors) expect(sel).toMatch(/^ {2}\.fieldWrap:where\(:not\(\[data-sg-fold\]\)\) > \.field\b/);
  });
});

describe('group title', () => {
  it('is drawn in the group heading type (--t-group), not the rows\' name type', () => {
    const rule = /\n\.wrap > \[data-hub-heading\] \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/font: var\(--t-group\);/);
    expect(rule).not.toMatch(/--t-body-strong/);
  });
});
