// Vitest: PlanCards in one grid row line up their prices whatever marks each card carries. The marks have a line of
// their own under the name on every card, one pill high even with no marks, so a card with two marks (they wrap under the
// name today) does not push its price below its neighbours'. jsdom has no layout: the DOM shape and the CSS are pinned
// here, the measured tops in plancard.spec.ts.
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PlanCard } from './PlanCard';

const css = readFileSync(join(import.meta.dirname, 'PlanCard.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.[\]()]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

describe('PlanCard marks line', () => {
  it('every ready card draws a marks line, empty when it has no marks', () => {
    const { container } = render(
      <>
        <PlanCard name="Free" price={{ amount: "$0" }} />
        <PlanCard name="Medium" price={{ amount: "$29" }} marks={<><span>2 of your servers</span><span>Suggested for you</span></>} />
      </>,
    );
    const lines = container.querySelectorAll('[data-plan-part="marks"]');
    expect(lines).toHaveLength(2);
    expect(lines[0]!.textContent).toBe('');
    expect(lines[1]!.textContent).toContain('Suggested for you');
  });

  it('the line sits under the name (a part of its own, not inside the head), starts at the card\'s start and holds one pill height', () => {
    const { container } = render(<PlanCard name="Medium" chip="Shared" marks={<span>Suggested for you</span>} />);
    const marks = container.querySelector('[data-plan-part="marks"]')!;
    expect(marks.closest('[data-plan-part="head"]')).toBeNull();
    expect(marks.previousElementSibling).toHaveAttribute('data-plan-part', 'head');
    const m = rule('.marks');
    expect(m).toMatch(/min-block-size:\s*var\(--tag-h\)/);
    expect(m).not.toMatch(/margin-inline-start:\s*auto/);
  });
});
