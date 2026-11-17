// Tabs toolbarRow (the Board strip): a bar that shares its row with toolbar controls. The tabs stand on the
// line, --sp-2 taller than the controls; each tab and the before/after slots keep --sp-2 under them, so the open tab's
// label and the slots sit on the controls' line; a grey tab adds its lift less a border, so its label sits there too.
// Off by default.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs } from './Tabs';

const css = readFileSync(join(__dirname, 'Tabs.module.css'), 'utf8');
const rule = (sel: string) => new RegExp(`\\n${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
const ITEMS = [
  { id: 'a', label: 'Main' },
  { id: 'b', label: 'Ops' },
] as const;
const bar = () => document.querySelector('[data-toolbar-row]');

describe('Tabs toolbarRow', () => {
  it('marks the bar only when asked', () => {
    const { unmount } = render(<Tabs label="Boards" items={ITEMS} value="a" toolbarRow />);
    expect(bar()).not.toBeNull();
    unmount();
    render(<Tabs label="Boards" items={ITEMS} value="a" />);
    expect(bar()).toBeNull();
  });

  it('the strip is the controls height plus --sp-2; tabs and slots keep --sp-2 under them', () => {
    expect(rule('.bar[data-toolbar-row] .list')).toMatch(/height: calc\(max\(var\(--tb-ctl-h, var\(--ctl-h-sm\)\), var\(--touch-min, 0px\)\) \+ var\(--sp-2\)\);/);
    expect(rule('.bar[data-toolbar-row] .tab,\n.bar[data-toolbar-row] .tabMenu')).toMatch(/padding-block-end: var\(--sp-2\);/);
    // A grey tab starts --tabs-lift lower and has no top border: the same centre line as the open tab's label.
    expect(rule('.bar[data-toolbar-row] .tab:not([data-selected])')).toMatch(/padding-block-end: calc\(var\(--sp-2\) \+ var\(--tabs-lift\) - var\(--bw\)\);/);
    expect(rule('.tab[data-selected]')).toMatch(/padding-block-start: 0;/);
    // The plain bar keeps its own height.
    expect(rule('.list')).toMatch(/height: var\(--tabs-h\);/);
  });
});
