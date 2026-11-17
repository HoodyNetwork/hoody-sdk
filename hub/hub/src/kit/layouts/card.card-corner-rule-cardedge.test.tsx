// Every outermost card has the 16 px slanted bottom-right corner, drawn by one 1 px SVG
// path in the card's own border colour over a transparent CSS border, the card clipped to the same outline; a card in a
// card stays square, and so does a card that holds a table. Card-table rows get the Home card body padding.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatTile } from '../data/Display';
import { Panel, SettingsPage, Widget, WizardPage } from './Layouts';
import { CARD_CUT, CardEdge, CardScope, cutRingPath } from './CardEdge';
import { cutFramePath } from './CutFrame';

const SRC = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the first rule whose whole selector is `sel` (it starts the file or follows a closing brace). */
function rule(css: string, sel: string): string {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|})\\s*${esc}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`no rule ${sel}`);
  return m[1]!;
}
const decl = (body: string, prop: string) => new RegExp(`(?:^|;|\\s)${prop.replace(/[-]/g, '\\-')}\\s*:\\s*([^;]+);`).exec(body)?.[1]?.trim();

let fire: Array<() => void> = [];
function sized(w: () => number, h: () => number) {
  fire = [];
  // Only an observed element's change reaches the callback, as in a browser.
  vi.stubGlobal('ResizeObserver', class {
    private cb: (e: unknown[]) => void;
    constructor(cb: (e: unknown[]) => void) {
      this.cb = cb;
    }
    observe() {
      fire.push(() => this.cb([]));
    }
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(w);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(h);
}

async function inRouter(Component: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the card corner rule (CardEdge.module.css, tokens.css)', () => {
  const css = read('kit/layouts/CardEdge.module.css');
  it('the corner is 16 px, one token and one constant', () => {
    expect(decl(rule(read('kit/tokens.css'), ':root'), '--card-cut')).toBe('16px');
    expect(CARD_CUT).toBe(16);
  });
  it('a marked card is clipped to the slanted outline and keeps its border width with a transparent colour', () => {
    const body = rule(css, ':global([data-card-cut][data-card-cut]:not(:has(table, [data-table-frame])))');
    expect(decl(body, 'clip-path')).toBe('polygon(0 0, 100% 0, 100% calc(100% - var(--card-cut)), calc(100% - var(--card-cut)) 100%, 0 100%)');
    expect(decl(body, 'border-color')).toBe('transparent');
    // Placement never at the strong rule's weight: a sticky card stays sticky.
    expect(decl(body, 'position')).toBeUndefined();
    expect(decl(body, 'overflow')).toBeUndefined();
  });
  it('a marked card is relative and clips at its border box by default at no specificity, so its own placement wins', () => {
    expect(decl(rule(css, ':global(:where([data-card-cut]))'), 'position')).toBe('relative');
    const clip = rule(css, ':global(:where([data-card-cut]:not(:has(table, [data-table-frame]))))');
    expect(decl(clip, 'overflow')).toBe('clip');
    expect(decl(clip, 'overflow-clip-margin')).toBe('var(--bw)');
  });
  it('a card that holds a table draws no edge', () => {
    expect(decl(rule(css, ':global([data-card-cut]:has(table, [data-table-frame])) > .edge'), 'display')).toBe('none');
  });
  it('the edge lies over the border box, ignores the pointer, and strokes 1 px in --card-edge', () => {
    const e = rule(css, '.edge');
    expect(decl(e, 'inset-block-start')).toBe('calc(-1 * var(--bw))');
    expect(decl(e, 'inset-inline-start')).toBe('calc(-1 * var(--bw))');
    expect(decl(e, 'pointer-events')).toBe('none');
    expect(decl(e, 'color')).toBe('var(--card-edge, var(--hx-panel-line))');
    expect(decl(rule(css, '.edge path'), 'stroke-width')).toBe('1px');
    expect(decl(rule(css, '.edge path'), 'fill')).toBe('none');
  });
  it('a focused card row shows its ring inside the frame instead of an outline it would clip', () => {
    expect(decl(rule(css, '.edge .ring'), 'display')).toBe('none');
    expect(decl(rule(css, ':global(tr[data-card-cut]:focus-visible) .ring'), 'display')).toBe('inline');
    expect(decl(rule(css, ':global(tr[data-card-cut]:focus-visible) .ring'), 'stroke')).toBe('var(--hx-focus)');
    expect(decl(rule(read('kit/data/DataTable.module.css'), '.cards .tr[data-card-cut]:focus-visible'), 'outline')).toBe('none');
  });
  it('a pressable card (PickCard) shows the same ring while it has visible focus', () => {
    const sel = ':global([data-card-ring]:is(:focus-visible, [data-focus-visible])) .ring';
    expect(decl(rule(css, sel), 'display')).toBe('inline');
    expect(decl(rule(css, sel), 'stroke')).toBe('var(--hx-focus)');
  });
});

describe('each card frames itself in --card-edge, its former border colour', () => {
  const lay = read('kit/layouts/Layouts.module.css');
  const dt = read('kit/data/DataTable.module.css');
  const disp = read('kit/data/Display.module.css');
  // The layouts cards share one frame rule (Panel, which a Widget and an AnatomySection draw too, the settings section
  // and the two summary rails): one edge colour, one border, one fill.
  const FRAME = '.panel,\n.settingsSection,\n.settingsSummaryCard,\n.wizardSummary';
  it('the layouts cards are one frame rule on the card body fill', () => {
    const body = rule(lay, FRAME);
    expect(decl(body, 'background')).toBe('var(--card-body)');
    expect(decl(body, 'border-radius')).toBe('var(--r-1)');
    // No card restates the frame: its own rule sets no edge colour, border or fill.
    for (const sel of ['.panel', '.settingsSection', '.settingsSummaryCard', '.wizardSummary']) {
      const own = rule(lay, sel);
      for (const prop of ['--card-edge', 'border', 'border-color', 'background']) expect(decl(own, prop), `${sel} ${prop}`).toBeUndefined();
    }
    expect(lay).not.toMatch(/(?:^|})\s*\.widget\s*\{/);
  });
  it.each([
    ['Panel, Widget, settings section, both summaries', lay, FRAME, 'var(--hx-panel-line)'],
    ['Panel danger', lay, '.panelDanger', 'var(--hx-danger-fill)'],
    ['settings danger', lay, '.settingsDanger', 'var(--hx-danger-fill)'],
    ['StatTile', disp, '.stat', 'var(--hx-panel-line)'],
    ['card row', dt, '.cards .tr', 'var(--hx-panel-line)'],
    ['selected card row', dt, '.cards .selected,\n.cards .active', 'var(--hx-selected-bar)'],
  ])('%s', (_n, css, sel, colour) => {
    const body = rule(css, sel);
    expect(decl(body, '--card-edge')).toBe(colour);
    expect(decl(body, 'border') ?? decl(body, 'border-color')).toMatch(/var\(--card-edge\)$/);
  });
  it('a headless Widget keeps its natural height with the edge as a child (no :only-child)', () => {
    expect(decl(rule(lay, '.widget:not(:has(> .widgetHead)) > .widgetBody'), 'max-height')).toBe('none');
    expect(lay).not.toMatch(/\.widgetBody:only-child/);
  });
  it('a card row clips at its border box, so the edge over its border shows', () => {
    const body = rule(dt, '.cards .tr');
    expect(decl(body, 'overflow')).toBe('clip');
    expect(decl(body, 'overflow-clip-margin')).toBe('var(--bw)');
  });
  it('a card row pads like the Home card body: 16 top, 20 sides, 20 bottom; its band bleeds over all of the bottom', () => {
    expect(decl(rule(dt, '.cards .tr > td.cardCell'), 'padding')).toBe('var(--sp-4) var(--pad-card) var(--pad-card)');
    expect(decl(rule(dt, '.cardCell'), 'padding')).toBe('var(--sp-4) var(--pad-card) var(--pad-card)');
    expect(decl(rule(dt, '.cardBottom'), 'margin')).toBe('auto calc(-1 * var(--pad-card)) calc(-1 * var(--pad-card))');
  });
});

describe('CardEdge', () => {
  it('draws the shared outline at its card size and redraws it on a resize', () => {
    let w = 420;
    sized(() => w, () => 300);
    const { container } = render(
      <div data-testid="card">
        <CardEdge />
      </div>,
    );
    const svg = container.querySelector('svg[data-card-edge]')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('path')!.getAttribute('d')).toBe(cutFramePath(420, 300, 16));
    expect(svg.getAttribute('width')).toBe('420');
    w = 600;
    act(() => fire.forEach((f) => f()));
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('M0.5 0.5H599.5V283.5L583.5 299.5H0.5Z');
    expect(svg.querySelectorAll('path')).toHaveLength(1);
  });
  it('never writes a style on its card: placement and clipping are CSS only, so a class change is never masked', () => {
    let w = 300;
    sized(() => w, () => 120);
    const { getByTestId } = render(
      <div data-testid="card" className="static-like">
        <CardEdge />
      </div>,
    );
    const card = getByTestId('card');
    expect(card.getAttribute('style')).toBeNull();
    w = 500;
    act(() => fire.forEach((f) => f()));
    card.className = 'sticky-like'; // a class switch at the same size: nothing of CardEdge's stands in its way
    act(() => fire.forEach((f) => f()));
    expect(card.getAttribute('style')).toBeNull();
  });
  it('a card inside a card draws none; a card row always draws, with its focus ring', () => {
    sized(() => 300, () => 120);
    const { container } = render(
      <CardScope>
        <div>
          <CardEdge />
        </div>
        <table>
          <tbody>
            <tr>
              <td>
                <CardEdge row />
              </td>
            </tr>
          </tbody>
        </table>
      </CardScope>,
    );
    const edges = container.querySelectorAll('svg[data-card-edge]');
    expect(edges).toHaveLength(1);
    expect(edges[0]!.closest('td')).not.toBeNull();
    expect(edges[0]!.querySelectorAll('path')[1]!.getAttribute('d')).toBe(cutRingPath(300, 120, 16));
  });
  it('the ring is the outline moved in by its centre line, the slant moved in by the same distance', () => {
    expect(cutRingPath(300, 120, 16)).toBe('M2 2H298V103.172L283.172 118H2Z');
  });
});

describe('the kit cards carry the corner', () => {
  it('Panel, Widget, StatTile: outermost marked with an edge; nested Panel square', () => {
    sized(() => 400, () => 200);
    render(
      <>
        <Panel title="Outer">
          <Panel title="Inner">x</Panel>
        </Panel>
        <Widget title="Usage">y</Widget>
        <StatTile label="Computers" value="3" />
      </>,
    );
    const outer = screen.getByRole('heading', { name: 'Outer' }).closest('section')!;
    const inner = screen.getByRole('heading', { name: 'Inner' }).closest('section')!;
    expect(outer.hasAttribute('data-card-cut')).toBe(true);
    expect(outer.firstElementChild?.matches('svg[data-card-edge]')).toBe(true);
    expect(inner.hasAttribute('data-card-cut')).toBe(false);
    expect(inner.querySelector(':scope > svg[data-card-edge]')).toBeNull();
    const widget = screen.getByRole('heading', { name: 'Usage' }).closest('section')!;
    expect(widget.hasAttribute('data-card-cut')).toBe(true);
    expect(widget.querySelector(':scope > svg[data-card-edge]')).not.toBeNull();
    const stat = screen.getByText('Computers').closest('[data-card-cut]')!;
    expect(stat.querySelector(':scope > svg[data-card-edge]')).not.toBeNull();
  });
  it('settings sections and the summary card are marked; a Panel in a section is square', async () => {
    sized(() => 400, () => 200);
    await inRouter(() => <SettingsPage header={{ title: 'Settings' }} sections={[{ id: 'a', title: 'General', content: <Panel title="Nested">n</Panel> }]} summary={<p>Summary text</p>} />);
    const sec = screen.getByRole('heading', { name: 'General' }).closest('section')!;
    expect(sec.hasAttribute('data-card-cut')).toBe(true);
    expect(sec.querySelector(':scope > svg[data-card-edge]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Nested' }).closest('section')!.hasAttribute('data-card-cut')).toBe(false);
    const sum = screen.getByText('Summary text').closest('[data-card-cut]')!;
    expect(sum.querySelector(':scope > svg[data-card-edge]')).not.toBeNull();
  });
  it("a wizard's summary rail is the same card: marked, with its edge, and a card inside it is square", async () => {
    sized(() => 300, () => 200);
    await inRouter(() => (
      <WizardPage header={{ title: 'New script' }} steps={[{ id: 'a', label: 'What' }]} current={0} summary={<Panel title="So far">s</Panel>}>
        <p>step</p>
      </WizardPage>
    ));
    const sum = screen.getByRole('heading', { name: 'So far' }).closest('aside')!;
    expect(sum.className).toMatch(/wizardSummary/);
    expect(sum.hasAttribute('data-card-cut')).toBe(true);
    expect(sum.querySelector(':scope > svg[data-card-edge]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'So far' }).closest('section')!.hasAttribute('data-card-cut')).toBe(false);
  });
  it('below 1180 the wizard summary leaves its sticky place for relative, never static: it stays its edge\'s containing block', () => {
    const lay = read('kit/layouts/Layouts.module.css');
    const block = /@container content \(width < 1180px\) \{([\s\S]*?)\n\}\n/.exec(lay)![1]!;
    const own = /\.wizardSummary \{([^}]*)\}/.exec(block)![1]!;
    expect(decl(own, 'position')).toBe('relative');
    expect(decl(own, 'inset-block-start')).toBe('auto');
    expect(lay).not.toMatch(/\.wizardSummary[^{]*\{[^}]*position:\s*static/);
  });
});
