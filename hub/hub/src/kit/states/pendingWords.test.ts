// One wording for "this may have gone through", whichever surface shows it. The words live in three string tables
// (the kit's, the states' and the forms'); a control that reads one table must say what its twin in another says.
// Each pair below is the same control on two surfaces: HeldBand / OutcomeBanner / Outcome line / ErrorState.
import { describe, expect, it } from 'vitest';
import forms from '../forms/forms.strings.en.json';
import kit from '../strings.en.json';
import states from './strings.en.json';

describe('pending words are the same on every surface', () => {
  it('Stop tracking: the control, the question, its body and its confirm (HeldBand = OutcomeBanner)', () => {
    expect(states['err.stopTracking']).toBe(kit['held.dismiss']);
    expect(states['outcome.pending.dismissTitle']).toBe(kit['held.dismissTitle']);
    expect(states['outcome.pending.dismissBody']).toBe(kit['held.dismissBody']);
    expect(states['outcome.pending.dismissConfirm']).toBe(kit['held.dismissGo']);
  });

  it('Check again (HeldBand, OutcomeBanner = Outcome line, FormFooter)', () => {
    expect(forms['outcome.check']).toBe(kit['outcome.pending.check']);
  });

  it('Try again (ErrorState = recipes, UnreachableState = Outcome line)', () => {
    expect(states['state.retry']).toBe(kit['action.retry']);
    expect(forms['outcome.retry']).toBe(kit['action.retry']);
  });

  it('the pending, failed, not-sent and done titles (OutcomeBanner = Outcome block)', () => {
    expect(forms['outcome.pending']).toBe(kit['outcome.pending.title']);
    expect(forms['outcome.failed']).toBe(kit['outcome.failed.title']);
    expect(forms['outcome.notSent']).toBe(kit['outcome.notSent.title']);
    expect(forms['outcome.done']).toBe(kit['outcome.done.title']);
    expect(forms['outcome.toastTitle']).toBe(kit['outcome.pending.title']);
  });
});
