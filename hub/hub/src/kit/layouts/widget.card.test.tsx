// A Widget is the card frame Panel draws, placed on the dashboard grid: the same frame, head band, body and notice
// classes, with its own modifiers for what differs (a one-line head, a body that scrolls). Nothing a Panel prop
// promises is dropped by a Widget.
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Panel, Widget } from './Layouts';

const css = readFileSync(join(import.meta.dirname, 'Layouts.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** The declarations of the rule whose whole selector is `sel`. */
function rule(sel: string): string {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|})\\s*${esc}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
}

describe('Widget draws the Panel card', () => {
  it('its notice is drawn after the body, as a Panel draws it', () => {
    render(
      <Widget title="Usage" notice="Only the last 5 are shown.">
        rows
      </Widget>,
    );
    const note = screen.getByText('Only the last 5 are shown.');
    expect(note.className).toMatch(/panelNotice/);
    expect(note.previousElementSibling?.className).toMatch(/widgetBody/);
  });

  it('a flush Widget rules its notice off from the rows, as a flush Panel does', () => {
    render(
      <Widget title="Usage" flush notice="note">
        rows
      </Widget>,
    );
    expect(screen.getByText('note').className).toMatch(/panelNoticeFlush/);
  });

  it('root, head, title and body carry the panel classes plus the widget modifiers', () => {
    render(<Widget title="Usage">rows</Widget>);
    const root = document.querySelector('section')!;
    expect(root.className).toMatch(/\bpanel\b|_panel_/);
    expect(root.className).toMatch(/widget/);
    const head = root.querySelector('header')!;
    expect(head.className).toMatch(/panelHead/);
    expect(head.className).toMatch(/widgetHead/);
    expect(root.querySelector('h2')!.className).toMatch(/panelTitle/);
    expect(root.querySelector('h2')!.className).toMatch(/widgetTitle/);
    const body = root.querySelector('header + div')!;
    expect(body.className).toMatch(/panelBody/);
    expect(body.className).toMatch(/widgetBody/);
  });

  it('a Panel carries none of the widget modifiers', () => {
    render(<Panel title="Keys">rows</Panel>);
    expect(document.querySelector('section')!.innerHTML + document.querySelector('section')!.className).not.toMatch(/widget/);
  });
});

describe('the widget classes are modifiers: the frame, band, fill and padding are written once, on the panel classes', () => {
  it('no rule gives .widget a frame or fill of its own', () => {
    expect(rule('.widget')).toBe('');
  });
  it.each(['.widgetHead', '.widgetTitle', '.widgetBody'])('%s sets no colour, fill, rule or padding', (sel) => {
    const body = rule(sel);
    expect(body).not.toBe('');
    expect(body).not.toMatch(/(?:^|[;\s])(?:background|border[\w-]*|padding[\w-]*|color|font|--card-edge|--sg-[\w-]+)\s*:/);
  });
  it('the widget modifiers come after the panel rules they adjust (equal weight, so order decides)', () => {
    const at = (sel: string) => new RegExp(`(?:^|})\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`).exec(css)?.index ?? -1;
    for (const [mod, base] of [['.widgetHead', '.panelHead'], ['.widgetTitle', '.panelTitle'], ['.widgetBody', '.panelBody']] as const) {
      expect(at(base), base).toBeGreaterThan(-1);
      expect(at(mod), `${mod} after ${base}`).toBeGreaterThan(at(base));
    }
  });
});
