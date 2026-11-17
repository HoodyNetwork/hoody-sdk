// Vitest (New script, step 2 "Where it answers"): what Continue / Build it says when the step is not done because a box is
// empty. Before this the press only set the flow's `missing` flag, which this step never received: an emptied address,
// a custom schedule with nothing typed, or the public link switched on with an empty name left a button that could be
// pressed and did nothing. Custom also could not be typed at all: an empty schedule read as "off", so the select drew
// Weekly and no box.
import { render, screen } from '@app/testing';
import { describe, expect, it } from 'vitest';
import { LinkNameField, type LinkName } from '../parts/LinkName';
import strings from '../strings.en.json';
import { StepWhere, type StepWhereProps } from './StepWhere';

const base: StepWhereProps = {
  computers: [],
  compId: 'c1',
  computerName: 'atlas',
  onComputer: () => undefined,
  origin: 'https://exec-1.example',
  route: '',
  onRoute: () => undefined,
  check: { state: 'idle' },
  onUseFree: () => undefined,
  schedule: null,
  onSchedule: () => undefined,
  link: false,
  onLink: () => undefined,
  onSubmit: () => undefined,
};
const address = () => screen.getByRole('textbox', { name: strings['new.address'] });

describe('New script, Where: an empty address', () => {
  it('says nothing until the press, then names the address at its field', () => {
    const { rerender } = render(<StepWhere {...base} />);
    expect(screen.queryByText(strings['flow.where.addressMissing'])).toBeNull();
    expect(address()).not.toHaveAttribute('aria-invalid', 'true');
    rerender(<StepWhere {...base} missing />);
    expect(screen.getByText(strings['flow.where.addressMissing'])).toBeInTheDocument();
    expect(address()).toHaveAttribute('aria-invalid', 'true');
  });

  it('a bad address keeps its own words after the press', () => {
    render(<StepWhere {...base} route="no slash" missing />);
    expect(screen.getByText(strings['new.addressBad'])).toBeInTheDocument();
    expect(screen.queryByText(strings['flow.where.addressMissing'])).toBeNull();
  });
});

describe('New script, Where: a custom schedule with nothing typed', () => {
  const cron = () => screen.queryByRole('textbox', { name: strings['flow.where.cron'] });

  it('Custom just picked (an empty schedule) shows its box, with no error yet', () => {
    render(<StepWhere {...base} schedule="" />);
    expect(cron()).not.toBeNull();
    expect(screen.queryByText(strings['flow.where.cronMissing'])).toBeNull();
    expect(screen.queryByText(strings['flow.where.cronBad'])).toBeNull();
  });

  it('after the press the empty box says to enter the schedule; a bad one keeps its own words', () => {
    const { rerender } = render(<StepWhere {...base} schedule="" missing />);
    expect(screen.getByText(strings['flow.where.cronMissing'])).toBeInTheDocument();
    expect(cron()).toHaveAttribute('aria-invalid', 'true');
    rerender(<StepWhere {...base} schedule="every day" missing />);
    expect(screen.getByText(strings['flow.where.cronBad'])).toBeInTheDocument();
    expect(screen.queryByText(strings['flow.where.cronMissing'])).toBeNull();
  });

  it('a preset shows no box and no error, pressed or not', () => {
    render(<StepWhere {...base} schedule="0 8 * * 1" missing />);
    expect(screen.queryByText(strings['flow.where.cronMissing'])).toBeNull();
    expect(screen.queryByText(strings['flow.where.cronBad'])).toBeNull();
  });
});

describe('the link name field: an empty name', () => {
  const empty: LinkName = { name: '', setName: () => undefined, another: () => undefined, problem: 'rule', valid: false, typed: false };
  const box = () => screen.getByRole('textbox', { name: strings['link.name'] });

  it('is not an error while typing, and is one once the form was sent on', () => {
    const { rerender } = render(<LinkNameField link={empty} />);
    expect(box()).not.toHaveAttribute('aria-invalid', 'true');
    rerender(<LinkNameField link={empty} missing />);
    expect(box()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(strings['link.rule'])).toBeInTheDocument();
  });
});
