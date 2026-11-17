// Vitest: the launcher's "Show N hidden" / "Hide libraries and plugins" button carries its eye as the Button's own start
// icon, beside the words with the kit's gap, never as a bare icon inside the words (there it touches the first letter).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FindResult } from './logic';
import { SourceStrip } from './parts/SourceStrip';

const view = (hidden: number): FindResult => ({ list: [], statuses: [], catalogue: 0, hidden }) as unknown as FindResult;
const strip = (hidden: number, showAll: boolean) =>
  render(<SourceStrip view={view(hidden)} showAll={showAll} onToggleAll={() => undefined} onRetry={() => undefined} />);

describe('the hidden-rows toggle', () => {
  it.each([
    ['Show 2 hidden', 2, false],
    ['Hide libraries and plugins', 2, true],
  ])('%s: the eye is the button start icon, outside its words', (name, hidden, showAll) => {
    strip(hidden, showAll);
    const button = screen.getByRole('button', { name });
    const label = button.querySelector('[data-btn-label]');
    expect(label?.textContent).toBe(name);
    expect(label?.querySelector('svg')).toBeNull();
    expect(button.querySelector(':scope > svg')).not.toBeNull();
  });
});
