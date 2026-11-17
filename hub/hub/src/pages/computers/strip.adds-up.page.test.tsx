// The summary strip as drawn: the numbers under "Computers" add up to the number beside it.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { computers } from './fixtures';
import { StatStrip } from './parts/StatStrip';
import strings from './strings.en.json';

describe('the computers summary strip, drawn', () => {
  it('a starting computer is in the split: the parts sum to the total', () => {
    const { container } = render(<StatStrip computers={[...computers]} servers={undefined} />);
    expect(container.textContent).toContain(strings['strip.computers']);
    const detail = [...container.querySelectorAll('*')].find((el) => el.children.length === 0 && /running/.test(el.textContent ?? ''));
    expect(detail, 'the split line').toBeTruthy();
    const sum = (detail!.textContent!.match(/\d+/g) ?? []).map(Number).reduce((a, b) => a + b, 0);
    expect(sum).toBe(computers.length);
    expect(detail!.textContent).toContain('1 starting');
  });
});
