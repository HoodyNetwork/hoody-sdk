// ScheduleField: one labelled field on the shared cron preset model. Each kind writes its exec expression; a saved
// expression that is not exactly a preset reads as custom and is never rewritten; the next runs are calculated in UTC;
// a SettingRow's name and help name and describe the whole group; the error sits on the part it is about.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { ScheduleField } from './ScheduleField';
import strings from './ScheduleField.strings.en.json';

const NOW = Date.UTC(2026, 10, 10, 7, 30);

beforeEach(() => {
  boot();
});

function Field({ start, spy }: { start: string | null; spy: (v: string | null) => void }) {
  const [v, setV] = useState(start);
  return (
    <ScheduleField
      label="Run on a schedule"
      value={v}
      onChange={(x) => {
        spy(x);
        setV(x);
      }}
      now={NOW}
    />
  );
}
const choose = async (name: string) => {
  await userEvent.click(screen.getByRole('button', { name: /Run on a schedule/ }));
  await userEvent.click(await screen.findByRole('option', { name }));
};

describe('ScheduleField', () => {
  it('reads a preset, and each kind writes its exec expression', async () => {
    const spy = vi.fn();
    render(<Field start="0 8 * * *" spy={spy} />);
    expect(screen.getByRole('button', { name: /Run on a schedule/ }).textContent).toContain(strings['k.daily']);
    await choose(strings['k.weekdays']);
    expect(spy).toHaveBeenLastCalledWith('0 8 * * 1-5');
    await choose(strings['k.every']);
    expect(spy).toHaveBeenLastCalledWith('*/15 * * * *');
    await choose(strings['k.monthly']);
    expect(spy).toHaveBeenLastCalledWith('0 8 1 * *');
    await choose(strings['k.off']);
    expect(spy).toHaveBeenLastCalledWith(null);
  });

  it('a saved expression that is not exactly a preset reads as custom and is never rewritten', () => {
    const spy = vi.fn();
    render(<Field start="0 9 * 1 *" spy={spy} />);
    expect(screen.getByRole('button', { name: /Run on a schedule/ }).textContent).toContain(strings['k.custom']);
    expect((screen.getByRole('textbox', { name: strings.expr }) as HTMLInputElement).value).toBe('0 9 * 1 *');
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows the next runs as calculated in UTC, or why it cannot', () => {
    const { container, rerender } = render(<ScheduleField label="S" value="30 * * * *" onChange={() => undefined} now={NOW} />);
    expect(container.textContent).toContain(strings.next.replace('{{runs}}', ['2026-11-10 08:30', '2026-11-10 09:30', '2026-11-10 10:30'].join(' · ')));
    rerender(<ScheduleField label="S" value="0 25 * * *" onChange={() => undefined} now={NOW} />);
    expect(container.textContent).toContain(strings.fieldErr.replace('{{field}}', strings['f.hour']).replace('{{min}}', '0').replace('{{max}}', '23'));
  });

  it('is one group named and described by the row; its parts keep their own short names', () => {
    render(
      <>
        <p id="row-name">Run on a schedule</p>
        <p id="row-help">When the computer runs the script.</p>
        <ScheduleField label="Run on a schedule" aria-labelledby="row-name" aria-describedby="row-help" value="0 8 * * 1" onChange={() => undefined} now={NOW} />
      </>,
    );
    const group = screen.getByRole('group', { name: 'Run on a schedule' });
    expect(group).toHaveAccessibleDescription('When the computer runs the script.');
    expect(screen.getByRole('textbox', { name: strings.time })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: strings['day.1'] })).toBeTruthy();
  });

  it('the last ticked weekday stays ticked; the error sits on the expression for custom, else on the kind', () => {
    const kind = createRef<HTMLButtonElement>();
    const { rerender } = render(<ScheduleField label="S" kindRef={kind} value="0 8 * * 1" onChange={() => undefined} errorMessage="Not a schedule." now={NOW} />);
    expect(screen.getByRole('checkbox', { name: strings['day.1'] })).toBeDisabled();
    expect(kind.current).toHaveAccessibleDescription(expect.stringContaining('Not a schedule.'));
    rerender(<ScheduleField label="S" kindRef={kind} value="0 9 * 1 *" onChange={() => undefined} errorMessage="Not a schedule." now={NOW} />);
    expect(kind.current).not.toHaveAccessibleDescription(expect.stringContaining('Not a schedule.'));
    expect(screen.getByRole('textbox', { name: strings.expr })).toHaveAccessibleDescription(expect.stringContaining('Not a schedule.'));
  });

  it('says it is not valid while the time box holds text that is not a time', async () => {
    const onValid = vi.fn();
    render(<ScheduleField label="S" value="0 8 * * *" onChange={() => undefined} onValid={onValid} now={NOW} />);
    const time = screen.getByRole('textbox', { name: strings.time });
    await userEvent.clear(time);
    await userEvent.type(time, 'soon');
    expect(onValid).toHaveBeenLastCalledWith(false);
  });
});
