// A Panel or Widget takes its card tone as a prop. The tone recolours the frame
// through --card-edge, so the corner edge (CardEdge) draws the same colour, and warn also tints the card. Pages pass
// `tone`; they never set --card-edge or a frame colour themselves.
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Panel, Widget } from './Layouts';

const SRC = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const lay = read('kit/layouts/Layouts.module.css');

/** The declarations of the rule whose whole selector is `sel`. */
function rule(css: string, sel: string): string {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|})\\s*${esc}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`no rule ${sel}`);
  return m[1]!;
}
const decl = (body: string, prop: string) => new RegExp(`(?:^|;|\\s)${prop.replace(/[-]/g, '\\-')}\\s*:\\s*([^;]+);`).exec(body)?.[1]?.trim();
const at = (sel: string) => new RegExp(`(?:^|})\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`).exec(lay)?.index ?? -1;
const card = () => document.querySelector('section')!;

describe('card tone rules (Layouts.module.css)', () => {
  it('warn frames the card in the warn fill through --card-edge and tints it', () => {
    const body = rule(lay, '.panelWarn');
    expect(decl(body, '--card-edge')).toBe('var(--hx-warn-fill)');
    expect(decl(body, 'border-color')).toBe('var(--card-edge)');
    expect(decl(body, 'background')).toBe('var(--hx-warn-t)');
  });
  it('danger frames the card in the danger fill through --card-edge, with no tint', () => {
    const body = rule(lay, '.panelDanger');
    expect(decl(body, '--card-edge')).toBe('var(--hx-danger-fill)');
    expect(decl(body, 'border-color')).toBe('var(--card-edge)');
    expect(decl(body, 'background')).toBeUndefined();
  });
  it('the tone rules come after the card frame rule (a Panel and a Widget draw it), so a tone wins over the frame at equal weight', () => {
    const frame = at('.panel,\n.settingsSection,\n.settingsSummaryCard,\n.wizardSummary');
    expect(frame, 'the card frame rule').toBeGreaterThan(-1);
    for (const tone of ['.panelWarn', '.panelDanger']) {
      expect(at(tone), `${tone} after the frame`).toBeGreaterThan(frame);
      expect(at(tone), `${tone} after .panel`).toBeGreaterThan(at('.panel'));
    }
  });
});

describe('Panel and Widget map their tone to one class', () => {
  it.each([
    ['Panel', (tone?: 'default' | 'warn' | 'danger') => <Panel tone={tone}>x</Panel>],
    ['Widget', (tone?: 'default' | 'warn' | 'danger') => <Widget tone={tone}>x</Widget>],
  ])('%s', (_n, make) => {
    const { unmount, rerender } = render(make());
    const cls = () => card().className;
    expect(cls()).not.toMatch(/panelWarn|panelDanger/);
    rerender(make('default'));
    expect(cls()).not.toMatch(/panelWarn|panelDanger/);
    rerender(make('warn'));
    expect(cls()).toMatch(/panelWarn/);
    expect(cls()).not.toMatch(/panelDanger/);
    rerender(make('danger'));
    expect(cls()).toMatch(/panelDanger/);
    expect(cls()).not.toMatch(/panelWarn/);
    // The card keeps its own frame class and its corner edge.
    expect(card().querySelector(':scope > svg[data-card-edge]')).not.toBeNull();
    unmount();
  });
});

describe('pages pass the tone instead of colouring the frame', () => {
  it('home has no page warn frame left', () => {
    const home = read('pages/home/parts/parts.module.css');
    expect(home).not.toMatch(/\.warnPanel\b/);
    expect(home).not.toMatch(/--card-edge/);
    expect(read('pages/home/parts/SetupPanel.tsx')).toMatch(/tone=\{kind === 'stalled' \? 'warn' : undefined\}/);
  });
});
