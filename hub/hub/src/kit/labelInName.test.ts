// The one Label in Name helper (PickerTrigger and the shell's switchers use it): the shown words first,
// then the purpose, read from the control's own aria-label, or from a visible label when one says it.
import { describe, expect, it } from 'vitest';
import { labelInNameProps } from './labelInName';

describe('labelInNameProps', () => {
  it('names the control by its shown words, then its own label', () => {
    expect(labelInNameProps({ shownId: 'shown', selfId: 'self', label: 'Computer' })).toEqual({ 'aria-label': 'Computer', 'aria-labelledby': 'shown self' });
  });
  it('a visible label takes the place of its own, which it then drops', () => {
    expect(labelInNameProps({ shownId: 'shown', selfId: 'self', label: 'Computer', labelId: 'field' })).toEqual({ 'aria-label': undefined, 'aria-labelledby': 'shown field' });
  });
});
