// Which computer: the picker's trigger and every row draw the computer's
// colour mark between the state dot and the flag (`● ■ 🇸🇬 name`). The colour is the API's value as the caller passes
// it; only ComputerMark normalises it, so a hostile value draws no mark and reaches no style. The shared mapper copies
// a row's colour, so every page that spreads an API row through it shows the mark with no edit of its own.
import { render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ComputerPicker, type ComputerChoice } from './ComputerPicker';
import { useComputerChoice } from './computerChoice';

const HOSTILE = 'red;x:url()';
const ROWS: ComputerChoice[] = [
  { id: 'atlas', name: 'atlas', color: '#3b82f6', running: true, state: 'Running', flag: '🇸🇬' },
  { id: 'borealis', name: 'borealis', color: '#abc', running: false, state: 'Stopped' },
  { id: 'cedar', name: 'cedar', color: HOSTILE, running: true, state: 'Running' },
  { id: 'dune', name: 'dune', running: true, state: 'Running' },
];

const markIn = (el: Element) => el.querySelector<HTMLElement>('[data-computer-color]');
const noRawColour = (root: Element) => {
  for (const el of root.querySelectorAll<HTMLElement>('[style]')) {
    expect(el.getAttribute('style') ?? '').not.toContain('url(');
    expect(el.getAttribute('style') ?? '').not.toContain('red;');
  }
};

function renderPicker(value: string | undefined) {
  return render(<ComputerPicker label="Computer for the left pane" computers={ROWS} value={value} onChange={() => {}} />);
}
const trigger = () => screen.getByRole('button', { name: / Computer for the left pane$/ });

describe('ComputerPicker: the computer colour mark', () => {
  it('the trigger draws the picked computer’s mark after the state dot and before the flag and name', () => {
    renderPicker('atlas');
    const mark = markIn(trigger());
    expect(mark).not.toBeNull();
    expect(mark!.dataset.computerColor).toBe('#3B82F6');
    expect(mark!.style.getPropertyValue('--computer')).toBe('#3B82F6');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    const lead = mark!.parentElement!;
    const kids = [...lead.children];
    expect(kids.indexOf(mark!)).toBe(1); // the state dot first
    expect(kids[2]).toHaveTextContent('🇸🇬');
    // The mark is decoration: the trigger's name is unchanged.
    expect(trigger()).toHaveAccessibleName('atlas Running Computer for the left pane');
  });

  it('a hostile or missing colour draws no mark and puts nothing into a style', () => {
    const { container, unmount } = renderPicker('cedar');
    expect(markIn(trigger())).toBeNull();
    noRawColour(container);
    unmount();
    renderPicker('dune');
    expect(markIn(trigger())).toBeNull();
  });

  it('every row draws its own computer’s mark (3-digit values in full); hostile and missing draw none', async () => {
    renderPicker(undefined);
    await userEvent.click(trigger());
    const list = await screen.findByRole('dialog', { name: 'Computer for the left pane' });
    const row = (name: string) => within(list).getByRole('radio', { name: new RegExp(`^${name}\\b`) });
    expect(markIn(row('atlas'))?.dataset.computerColor).toBe('#3B82F6');
    expect(markIn(row('borealis'))?.dataset.computerColor).toBe('#AABBCC');
    expect(markIn(row('cedar'))).toBeNull();
    expect(markIn(row('dune'))).toBeNull();
    noRawColour(list);
  });
});

describe('useComputerChoice: the colour of the API row', () => {
  const choiceOf = () => renderHook(() => useComputerChoice()).result.current;

  it('copies the row’s colour as the API keeps it; the mark normalises it', () => {
    const choice = choiceOf();
    expect(choice({ id: 'c1', name: 'atlas', status: 'running', color: '#3b82f6' }).color).toBe('#3b82f6');
    expect(choice({ id: 'c1', name: 'atlas', status: 'running', color: HOSTILE }).color).toBe(HOSTILE);
  });

  it('a row with no colour, or a null one, gives a choice with no colour', () => {
    const choice = choiceOf();
    expect(choice({ id: 'c1', name: 'atlas', status: 'running' })).not.toHaveProperty('color');
    expect(choice({ id: 'c1', name: 'atlas', status: 'running', color: null })).not.toHaveProperty('color');
  });
});
