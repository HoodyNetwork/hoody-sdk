// The Logs computer picker's rows carry each computer's colour as the shell lists it:
// the kit picker's mark normalises it, so the row passes the value through unchanged, and adds none when there is none.
import { describe, expect, it } from 'vitest';
import { computerChoices } from './pickers';

const t = (k: string) => (k === 'pick.running' ? 'Running' : 'Stopped');

describe('computer choices: the computer colour', () => {
  it('each row keeps its computer’s colour; a row without one gets none', () => {
    const rows = computerChoices([{ id: 'a', name: 'atlas', color: '#3b82f6' }, { id: 'c', name: 'cedar', color: 'red;x:url()' }, { id: 'f', name: 'fjord' }], 'a', null, t);
    expect(rows.find((r) => r.id === 'a')?.color).toBe('#3b82f6');
    expect(rows.find((r) => r.id === 'c')?.color).toBe('red;x:url()');
    expect(rows.find((r) => r.id === 'f')).not.toHaveProperty('color');
  });
});
