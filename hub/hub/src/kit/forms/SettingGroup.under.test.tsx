// A field group whose label fits beside the field but not beside field + a row's actions stays side by side, and those
// rows' actions go under their field (data-sg-under on the group). `crowdedActions="stack"` keeps the earlier
// arrangement: the whole group stacks. Under the 640 px line the group stacks as before.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Button } from '../controls/Button';
import { SettingGroup, SettingSwitch, actionsGoUnder, type SettingGroupProps } from './SettingGroup';
import { SettingRow } from './SettingRow';

const css = readFileSync(join(__dirname, 'SettingGroup.module.css'), 'utf8');

beforeEach(() => {
  boot();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Lays the group out by hand (jsdom has no layout): its width, the field track, gaps, row inset, and each action part. */
function layout(width: number, part = 150) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-setting-group') || this.parentElement?.hasAttribute('data-setting-group') || this.hasAttribute('data-sg-row') ? width : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const w = this.parentElement?.hasAttribute('data-sg-actions') || this.hasAttribute('data-sg-control') ? part : 0;
    return { width: w, height: 0, x: 0, y: 0, top: 0, left: 0, right: w, bottom: 0, toJSON: () => ({}) } as DOMRect;
  });
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
    const cs = real(el, pseudo);
    return new Proxy(cs, {
      get: (t, k) => {
        if (k === 'columnGap') return '24px';
        if (k === 'paddingInlineStart' || k === 'paddingInlineEnd') return el instanceof HTMLElement && el.hasAttribute('data-sg-row') ? '16px' : '0px';
        if (k === 'getPropertyValue') return (n: string) => (n === '--setting-field-w' ? '360px' : t.getPropertyValue(n));
        const v = Reflect.get(t, k);
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
  });
}

const group = (extra: Partial<SettingGroupProps> = {}) => (
  <SettingGroup variant="field" title="Access" {...extra}>
    <SettingRow label="Key" help="Callers send this key." actions={<><Button size="sm">Make a new key</Button><Button size="sm">Remove</Button></>}>
      Set (hidden)
    </SettingRow>
  </SettingGroup>
);
const wrap = () => document.querySelector('[data-setting-group]')!;

describe('a row whose actions crowd the label', () => {
  it('goes under only when the label fits beside the field without them', () => {
    const m = { content: 900, padStart: 16, padEnd: 16, value: 360, gap: 24 };
    expect(actionsGoUnder({ ...m, action: 308, kept: 0 })).toBe(true);
    expect(actionsGoUnder({ ...m, action: 100, kept: 0 })).toBe(false); // fits with them: nothing moves
    expect(actionsGoUnder({ ...m, action: 308, kept: 308 })).toBe(false); // a switch row's cluster stays: the group stacks
    expect(actionsGoUnder({ ...m, content: 600, action: 308, kept: 0 })).toBe(false); // short even without them
  });

  it('the group stays side by side and the actions go under the field', () => {
    layout(900);
    render(group());
    expect(wrap()).toHaveAttribute('data-sg-under');
    expect(wrap()).not.toHaveAttribute('data-stack');
  });

  it('crowdedActions="stack" keeps the earlier arrangement: the whole group stacks', () => {
    layout(900);
    render(group({ crowdedActions: 'stack' }));
    expect(wrap()).not.toHaveAttribute('data-sg-under');
    expect(wrap()).toHaveAttribute('data-stack');
  });

  it('a group with room for everything changes nothing', () => {
    layout(1200);
    render(group());
    expect(wrap()).not.toHaveAttribute('data-sg-under');
    expect(wrap()).not.toHaveAttribute('data-stack');
  });

  it('under the 640 px line the group stacks as before', () => {
    layout(620);
    render(group());
    expect(wrap()).not.toHaveAttribute('data-sg-under');
  });

  it('a switch row whose cluster crowds the label still stacks the group (its switch has no field to sit under)', () => {
    layout(900);
    render(
      <SettingGroup variant="field" title="Access">
        <SettingSwitch label="On" isSelected onChange={() => undefined} actions={<Button size="sm">More</Button>} />
      </SettingGroup>,
    );
    expect(wrap()).not.toHaveAttribute('data-sg-under');
    expect(wrap()).toHaveAttribute('data-stack');
  });

  it('CSS: under, a field row\'s actions sit in the field column on the next line, start-aligned, and the outcome after them', () => {
    const rule = (sel: string) => {
      const i = css.indexOf(`${sel} {`);
      return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
    };
    const action = rule('.fieldWrap[data-sg-under] > .field > .row:not(.switchRow, .noValue) > .action');
    expect(action).toMatch(/grid-column: 2;/);
    expect(action).toMatch(/grid-row: 2;/);
    expect(action).toMatch(/justify-self: start;/);
    expect(rule('.fieldWrap[data-sg-under] > .field > .row:not(.switchRow, .noValue) > .outcome')).toMatch(/grid-row: 3;/);
  });
});
