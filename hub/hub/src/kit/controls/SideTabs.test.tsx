// SideTabs: a named group of toggle rows; a press or Arrow keys, Home and End pick a row and move focus to it, and in a
// right-to-left page Left and Right swap. The look (flat rows, one rule between rows, the picked row's bar and join) is
// pinned from the stylesheet.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SideTabs } from './SideTabs';

type Id = 'cli' | 'sdk' | 'http' | 'ssh';
const ITEMS = [
  { id: 'cli', label: 'CLI' },
  { id: 'sdk', label: 'SDK' },
  { id: 'http', label: 'HTTP API' },
  { id: 'ssh', label: 'SSH' },
] as const;

function Harness({ start = 'sdk', onChange }: { start?: Id; onChange?: (id: Id) => void }) {
  const [value, setValue] = useState<Id>(start);
  return (
    <SideTabs
      label="Ways in"
      items={ITEMS}
      value={value}
      onChange={(id) => {
        onChange?.(id);
        setValue(id);
      }}
    />
  );
}

const picked = () => screen.getAllByRole('button', { pressed: true });

describe('SideTabs', () => {
  it('is a named group of toggle rows, exactly one pressed', () => {
    render(<Harness />);
    const group = screen.getByRole('group', { name: 'Ways in' });
    expect(group.querySelectorAll('button')).toHaveLength(4);
    expect(picked()).toHaveLength(1);
    expect(picked()[0]).toHaveTextContent('SDK');
    expect(screen.getByRole('button', { name: 'CLI' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('picks a row on press', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'SSH' }));
    expect(onChange).toHaveBeenCalledWith('ssh');
    expect(picked()[0]).toHaveTextContent('SSH');
  });

  it('Arrow keys, Home and End pick and move focus; the ends stop', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    screen.getByRole('button', { name: 'SDK' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(picked()[0]).toHaveTextContent('HTTP API');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'HTTP API' }));
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(picked()[0]).toHaveTextContent('CLI');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'CLI' }));
    onChange.mockClear();
    await userEvent.keyboard('{ArrowUp}');
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.keyboard('{End}');
    expect(picked()[0]).toHaveTextContent('SSH');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'SSH' }));
    await userEvent.keyboard('{Home}');
    expect(picked()[0]).toHaveTextContent('CLI');
    await userEvent.keyboard('{ArrowRight}');
    expect(picked()[0]).toHaveTextContent('SDK');
  });

  it('swaps Left and Right in a right-to-left page', async () => {
    render(
      <div dir="rtl" style={{ direction: 'rtl' }}>
        <Harness />
      </div>,
    );
    screen.getByRole('button', { name: 'SDK' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(picked()[0]).toHaveTextContent('HTTP API');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(picked()[0]).toHaveTextContent('CLI');
  });
});

describe('SideTabs look', () => {
  const css = readFileSync(join(import.meta.dirname, 'SideTabs.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (sel: string) => {
    const at = css.indexOf(`${sel} {`);
    expect(at, sel).toBeGreaterThanOrEqual(0);
    return css.slice(at, css.indexOf('}', at));
  };

  it('draws flat rows: no plate frame, no cut, no radius, one rule between rows', () => {
    expect(css).not.toMatch(/--plate(-line|-cut|-angle)?\s*:/);
    expect(css).not.toMatch(/--hx-btn-/);
    const row = rule('.row');
    expect(row).toMatch(/border:\s*0;/);
    expect(row).toMatch(/border-block-end:\s*var\(--bw\) solid var\(--hx-plate-rule\)/);
    expect(row).toMatch(/border-radius:\s*0;/);
    expect(row).toMatch(/background:\s*none;/);
    expect(rule('.row:last-child')).toMatch(/border-block-end-color:\s*transparent/);
  });

  it('the rail has its fill and its end line', () => {
    const rail = rule('.rail');
    expect(rail).toMatch(/background:\s*var\(--hx-plate-rail-bg\)/);
    expect(rail).toMatch(/border-inline-end:\s*var\(--bw\) solid var\(--hx-plate-line\)/);
  });

  it('the picked row takes the panel fill and the bar, and covers the rail line', () => {
    const on = rule(".row[data-picked]");
    expect(on).toMatch(/background:\s*var\(--hx-plate-bg\)/);
    expect(on).toMatch(/box-shadow:\s*inset var\(--plate-pick-bar\) 0 0 var\(--hx-plate-pick-bar\)/);
    expect(on).toMatch(/inline-size:\s*calc\(100% \+ var\(--bw\)\)/);
    expect(rule(".row[data-picked][data-focus-visible]")).toMatch(/var\(--plate-pick-bar\).*var\(--focus-ring\)/);
  });

  it('keeps a touch target, a forced-colours bar and focus outline', () => {
    expect(rule('.row')).toMatch(/min-block-size:\s*max\(var\(--plate-row-h\), var\(--touch-min\)\)/);
    const forced = css.slice(css.indexOf('@media (forced-colors: active)'));
    expect(forced).toMatch(/border-inline-start-color:\s*canvastext/);
    expect(forced).toMatch(/outline:\s*var\(--bw-2\) solid highlight/);
  });
});
