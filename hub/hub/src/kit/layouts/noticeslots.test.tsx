// Vitest: explanations get a line of their own, never a place inside a row of controls.
// Toolbar and Panel have a notice slot under their controls; a page header's actions, once on their own line, let an
// outcome line among them wrap (OutcomeSlot keeps its swap; kit/layouts/r4fit.spec.ts covers the pages).
// AddressList/AddressRow are the kit's address-row composition: name, masked address and actions, laid out by the
// list's own width (container queries, checked on the stylesheet: jsdom has no layout). Gallery grids clamp their
// column minimum to the space there is.
import { render, screen } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AddressList, AddressRow } from '../data/Address';
import { Panel } from './Layouts';
import { Toolbar } from './PageHeader';

vi.mock('../nav', () => ({ useSearchParam: () => [undefined, () => undefined] }));
vi.mock('../ask', () => ({ useAskDock: () => ({ isOpen: false }) }));

const css = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

describe('PageHeader actions on their own line', () => {
  it('let an outcome line among them shrink and wrap instead of running past the header', () => {
    const sheet = css('PageHeader.module.css');
    expect(sheet).toMatch(/\.stacked \.actions\s*\{[^}]*min-width:\s*0/);
    expect(sheet).toMatch(/\.stacked \.actions > \*\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/);
  });
});

describe('Toolbar notice slot', () => {
  it('puts the notice under the controls and outside the controls\' group', () => {
    render(<Toolbar start={<button type="button">7 days</button>} end={<button type="button">Add AI credit</button>} notice={<span>Credit unavailable</span>} />);
    const bar = screen.getByRole('group');
    const note = screen.getByText('Credit unavailable');
    expect(bar.contains(note)).toBe(false);
    expect(bar.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bar.parentElement).toBe(note.parentElement?.parentElement);
  });

  it('draws no notice slot without a notice: the toolbar is the only child of the root (one root either way)', () => {
    const { container } = render(<Toolbar start={<button type="button">a</button>} />);
    const root = container.firstElementChild;
    expect(root?.children).toHaveLength(1);
    expect(root?.firstElementChild?.getAttribute('role')).toBe('group');
  });
});

describe('Panel notice slot', () => {
  it('puts the notice after the body, inside the panel, in its own padded slot', () => {
    const { container } = render(
      <Panel title="Subscriptions" flush notice={<span>Showing the first 50.</span>}>
        <table aria-label="subs" />
      </Panel>,
    );
    const section = container.querySelector('section') as HTMLElement;
    const note = screen.getByText('Showing the first 50.');
    const slot = note.parentElement as HTMLElement;
    expect(slot.parentElement).toBe(section);
    expect(section.lastElementChild).toBe(slot);
    expect(slot.classList.contains('panelNotice')).toBe(true);
    expect(css('Layouts.module.css')).toMatch(/\.panelNotice\s*\{[^}]*padding:[^}]*\}/);
  });
});

describe('AddressList / AddressRow', () => {
  const URL_ = 'https://6a0000000000000000000001-c0ffee0000000000000000aa-terminal.n12.example.test';

  it('renders a list of rows: name, masked address, actions', () => {
    render(
      <AddressList label="Program links">
        <AddressRow name={<strong>Terminal</strong>} url={URL_} open actions={<button type="button">Copy Terminal</button>} />
      </AddressList>,
    );
    const list = screen.getByRole('list', { name: 'Program links' });
    const item = screen.getByRole('listitem');
    expect(list.contains(item)).toBe(true);
    expect(item.textContent).toContain('Terminal');
    // A program address is secret by shape: its row shows the scheme and bullets, nothing of the address.
    expect(item.textContent).toContain('https://••••');
    expect(item.textContent).not.toContain('6a00');
    expect(screen.getByRole('button', { name: 'Copy Terminal' })).toBeTruthy();
  });

  it('lays the row out by the list width: one line, then name+actions over the address, then three lines', () => {
    const sheet = css('../data/Address.module.css');
    expect(sheet).toMatch(/\.list\s*\{[^}]*container:\s*addrlist\s*\/\s*inline-size/);
    expect(sheet).toMatch(/\.row\s*\{[^}]*grid-template-areas:\s*'name addr actions'/);
    expect(sheet).toMatch(/@container addrlist \(width < 640px\)\s*\{[^@]*grid-template-areas:\s*'name actions'\s*'addr addr'/);
    expect(sheet).toMatch(/@container addrlist \(width < 380px\)\s*\{[^@]*grid-template-areas:\s*'name'\s*'addr'\s*'actions'/);
  });
});

describe('gallery grids', () => {
  it('clamp every auto-fit/auto-fill column minimum to the grid width (no track wider than a phone)', () => {
    const dir = join(__dirname, '../gallery');
    const bad: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.css'))) {
      for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/repeat\(auto-(?:fit|fill),\s*minmax\(([^,]+),/g)) {
        if (!(m[1] ?? '').trim().startsWith('min(100%')) bad.push(`${f}: ${m[0]}`);
      }
    }
    // Gallery CSS files may keep plain minimums of 280 px and less: they fit the 294 px a 360 px phone leaves.
    const px = (b: string) => Number(/minmax\((\d+(?:\.\d+)?)px/.exec(b)?.[1] ?? NaN);
    expect(bad.filter((b) => !(px(b) <= 280))).toEqual([]);
  });
});
