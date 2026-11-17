// Vitest (New script, step 2 "Where it answers"): an account with ONE computer, bound to the draft, that cannot take a
// script now (turned off after the draft was made). The step cannot be left (Flow's whereDone needs canTake), and with
// one computer there is no picker row to carry the reason: the step said only "Computer: <name>" and Continue did
// nothing. The computer line now says why.
import { render, screen } from '@app/testing';
import { describe, expect, it } from 'vitest';
import strings from '../strings.en.json';
import { StepWhere, type StepWhereProps } from './StepWhere';

const base: StepWhereProps = {
  computers: [],
  compId: 'c1',
  computerName: 'atlas',
  onComputer: () => undefined,
  origin: 'https://exec-1.example',
  route: '/hello',
  onRoute: () => undefined,
  check: { state: 'idle' },
  onUseFree: () => undefined,
  schedule: null,
  onSchedule: () => undefined,
  link: false,
  onLink: () => undefined,
  onSubmit: () => undefined,
};
const said = (key: 'flow.where.on' | 'flow.where.onCantTake') => strings[key].replace('{{name}}', 'atlas');

describe('New script, Where: one computer that cannot take a script', () => {
  it('a computer that can take it is only named', () => {
    render(<StepWhere {...base} />);
    expect(screen.getByText(said('flow.where.on'))).toBeInTheDocument();
    expect(screen.queryByText(said('flow.where.onCantTake'))).toBeNull();
  });

  it('a computer that cannot is named with the reason and what to do', () => {
    render(<StepWhere {...base} cantTake />);
    expect(screen.getByText(said('flow.where.onCantTake'))).toBeInTheDocument();
    expect(said('flow.where.onCantTake')).toMatch(/turned off/);
    expect(screen.queryByText(said('flow.where.on'))).toBeNull();
  });
});
