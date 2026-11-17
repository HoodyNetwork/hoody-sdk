// The words a person reads about who holds a chat's approvals say what it means (this window holds them, another window
// does, the hold ran out), never the mechanism behind it.
import { describe, expect, it } from 'vitest';
import approver from './Approver.strings.en.json';
import session from './SessionView.strings.en.json';

describe('approval hold words', () => {
  it('no Approver string names a lease', () => {
    for (const [k, v] of Object.entries(approver)) expect(v, k).not.toMatch(/lease/i);
  });
  it('the missing-approver reason names the window\'s hold on the approvals', () => {
    expect(session['sv.missing.approver']).not.toMatch(/lease/i);
    expect(session['sv.missing.approver']).toContain('approvals');
  });
});
