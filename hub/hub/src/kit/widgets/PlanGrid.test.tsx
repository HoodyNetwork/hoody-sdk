// Vitest: PlanGrid, the grid PlanCards sit in. Each card spans four rows of the grid and passes them on (subgrid) to its
// parts: the head (name and chip), the marks line, the price and the body (lead, rows, regions, specs, notes, action), so
// each part lines up across the cards of one grid row whatever its neighbours hold. jsdom has no layout: the DOM shape and
// the CSS are pinned here, the measured tops in plancard.spec.ts.
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PlanCard, PlanGrid } from './PlanCard';

const css = readFileSync(join(import.meta.dirname, 'PlanCard.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.[\]()>*]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

describe('PlanGrid', () => {
  it('is one grid holding the cards as its direct items, passing data attributes and a class through', () => {
    const { container } = render(
      <PlanGrid data-plans="3" className="extra">
        <PlanCard name="Free" price={{ amount: '$0' }} />
        <PlanCard name="Small" price={{ amount: '$9' }} marks={<span>Suggested for you</span>} />
      </PlanGrid>,
    );
    const grid = container.querySelector('[data-kit="plan-grid"]')!;
    expect(grid).not.toBeNull();
    expect(grid).toHaveAttribute('data-plans', '3');
    expect(grid.className).toContain('extra');
    expect([...grid.children].map((c) => c.getAttribute('data-kit'))).toEqual(['plan-card', 'plan-card']);
  });

  it('columns fixes the count (data-cols); without it the grid fits as many 260 px columns as it can', () => {
    const { container } = render(
      <>
        <PlanGrid columns={3}>
          <PlanCard name="A" />
        </PlanGrid>
        <PlanGrid>
          <PlanCard name="B" />
        </PlanGrid>
      </>,
    );
    const [three, fit] = container.querySelectorAll('[data-kit="plan-grid"]');
    expect(three).toHaveAttribute('data-cols', 'three');
    expect(fit).not.toHaveAttribute('data-cols');
    expect(rule('.grid[data-cols=three]')).toMatch(/repeat\(3, minmax\(0, 1fr\)\)/);
    expect(rule('.grid[data-cols=two]')).toMatch(/repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.grid\[data-cols=three\] > :last-child:nth-child\(odd\)\s*\{\s*grid-column:\s*1 \/ -1;/);
  });

  it('each card puts its parts in four places: head, marks, price, body (the action at the body\'s end)', () => {
    render(
      <PlanCard
        name="Pro"
        chip="Shared"
        price={{ amount: '$12', per: '/month' }}
        lead="For a team"
        specs={['4 cores']}
        marks={<span>Yours</span>}
        note="Renews on the 3rd"
        action={<button type="button">Upgrade</button>}
      />,
    );
    const card = screen.getByRole('group', { name: 'Pro' });
    const inner = card.querySelector('[data-plan-part="head"]')!.parentElement!;
    expect([...inner.children].map((c) => c.getAttribute('data-plan-part'))).toEqual(['head', 'marks', 'price-line', 'body']);
    const body = inner.querySelector('[data-plan-part="body"]')!;
    expect(body.lastElementChild).toHaveAttribute('data-plan-part', 'action');
    expect(body.textContent).toContain('For a team');
    expect(inner.querySelector('[data-plan-part="head"]')!.textContent).toBe('ProShared');
  });

  it('a card with no body content draws no body', () => {
    render(<PlanCard name="Bare" price={{ amount: '$1' }} />);
    expect(screen.getByRole('group', { name: 'Bare' }).querySelector('[data-plan-part="body"]')).toBeNull();
  });

  it('the CSS: four rows per card, passed through the frame and its inner box, each part on its own row', () => {
    expect(rule('.grid')).toMatch(/display:\s*grid/);
    expect(rule('.grid')).toMatch(/grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 260px\), 1fr\)\)/);
    expect(rule('.grid > *')).toMatch(/grid-row:\s*span 4/);
    expect(rule('.grid > .card')).toMatch(/grid-template-rows:\s*subgrid/);
    expect(rule('.grid > .card > .inner')).toMatch(/grid-template-rows:\s*subgrid/);
    expect(rule('.grid > .card > .inner')).toMatch(/grid-row:\s*1 \/ -1/);
    expect(rule('.grid .head')).toMatch(/grid-row:\s*1/);
    expect(rule('.grid .marks')).toMatch(/grid-row:\s*2/);
    expect(rule('.grid .price')).toMatch(/grid-row:\s*3/);
    expect(rule('.grid .body')).toMatch(/grid-row:\s*4/);
  });

  it('the CSS: one column (cards stacked) drops the empty marks line and the shared rows, for both kinds of grid', () => {
    // The grid is its own inline-size container, so the fitted grid knows when its 260 px columns become one.
    expect(rule('.grid')).toMatch(/container:\s*plan-grid \/ inline-size/);
    const block = (query: string) => {
      const at = css.indexOf(query);
      if (at < 0) return '';
      let depth = 0;
      for (let i = css.indexOf('{', at); i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1);
      }
      return '';
    };
    // Two 260 px columns and the --sp-4 (16 px) gap: the width under which auto-fit draws one column.
    const fitted = block('@container plan-grid (width < 536px)');
    expect(fitted).toMatch(/\.grid:not\(\[data-cols\]\) \.marks:empty\s*\{\s*display:\s*none;/);
    expect(fitted).toMatch(/\.grid:not\(\[data-cols\]\) > \.card > \.inner\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;/);
    // The fixed-columns grid is one column under 480 px of content (its rule above).
    const fixed = block('@container content (width < 480px)');
    expect(fixed).toMatch(/\.grid\[data-cols\] \.marks:empty\s*\{\s*display:\s*none;/);
    expect(fixed).toMatch(/\.grid\[data-cols\] > \.card > \.inner\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;/);
    // Where cards sit side by side the empty line keeps its pill height, so prices of a row line up.
    expect(rule('.marks')).toMatch(/min-block-size:\s*var\(--tag-h\)/);
  });
});

// A wide card: the grid's last child, on a row of its own under the other cards.
describe('PlanGrid wide', () => {
  const wideGrid = (cards: number) =>
    render(
      <PlanGrid wide>
        {Array.from({ length: cards }, (_, i) => (
          <PlanCard key={i} name={`Plan ${i}`} price={{ amount: '$1' }} />
        ))}
        {null}
        <PlanCard
          wide
          name="Whole machine"
          subTitle="For you alone"
          rows={[
            { id: 'from', label: 'From', value: '$70 a month', price: true },
            { id: 'a', label: 'Cores', value: '8' },
            { id: 'b', label: 'Memory', value: '32 GB' },
          ]}
          action={<button type="button">Browse</button>}
        />
      </PlanGrid>,
    ).container.querySelector<HTMLElement>('[data-kit="plan-grid"]')!;

  it('marks the grid and the card, and tells the grid how many cards sit beside the wide one', () => {
    const grid = wideGrid(3);
    expect(grid).toHaveAttribute('data-wide');
    expect(grid.style.getPropertyValue('--plan-cards')).toBe('3');
    const cards = [...grid.children];
    expect(cards).toHaveLength(4);
    expect(cards.map((c) => c.hasAttribute('data-wide'))).toEqual([false, false, false, true]);
    // An empty place among the children (no state to show) is not a card.
    expect(wideGrid(1).style.getPropertyValue('--plan-cards')).toBe('1');
  });

  it('without wide the grid carries neither the mark nor the count', () => {
    const { container } = render(
      <PlanGrid>
        <PlanCard name="A" />
      </PlanGrid>,
    );
    const grid = container.querySelector<HTMLElement>('[data-kit="plan-grid"]')!;
    expect(grid).not.toHaveAttribute('data-wide');
    expect(grid.style.getPropertyValue('--plan-cards')).toBe('');
    expect(screen.getByRole('group', { name: 'A' })).not.toHaveAttribute('data-wide');
  });

  it('the wide card: what it is under its name, its price row as the price line, its other rows one list, its action inside', () => {
    wideGrid(2);
    const card = screen.getByRole('group', { name: 'Whole machine' });
    const marks = card.querySelector('[data-plan-part="marks"]')!;
    expect(marks.textContent).toBe('For you alone');
    const price = card.querySelector('[data-plan-part="price-line"]')!;
    expect(price).toHaveAttribute('data-plan-row', 'from');
    expect([...price.children].map((c) => c.textContent)).toEqual(['From', '$70 a month']);
    expect(price.querySelector('[data-plan-part="price"]')!.textContent).toBe('$70 a month');
    expect([...card.querySelectorAll('dl > div > dt')].map((d) => d.textContent)).toEqual(['Cores', 'Memory']);
    expect(card.querySelector('[data-plan-part="body"]')!.lastElementChild).toHaveAttribute('data-plan-part', 'action');
  });

  it('the CSS: the wide card takes the whole row; the others spread over no more columns than there are of them', () => {
    expect(rule('.grid > .wide')).toMatch(/grid-column:\s*1 \/ -1/);
    const cols = rule('.grid[data-wide]:not([data-cols])');
    // At least 260 px, and at least an equal share of the row for the cards beside the wide one.
    expect(cols).toMatch(/repeat\(auto-fit, minmax\(max\(min\(100%, 260px\), calc\(\(100% - \(var\(--plan-cards, 1\) - 1\) \* var\(--sp-4\)\) \/ var\(--plan-cards, 1\)/);
  });

  it('the CSS: its rows take the grid\'s columns, their gap the cards\' gap plus the two card paddings it crosses', () => {
    const wide = /@supports \(grid-template-columns: subgrid\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(wide).toMatch(/\.grid > \.card\.wide \.rows\s*\{\s*grid-template-columns:\s*subgrid;\s*column-gap:\s*calc\(var\(--sp-4\) \+ 2 \* var\(--pad-card\)\)/);
    expect(wide).toMatch(/\.grid > \.card\.wide \.body > \*\s*\{\s*grid-column:\s*1 \/ -1/);
  });
});
