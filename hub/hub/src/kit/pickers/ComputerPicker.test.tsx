// ComputerPicker: the trigger shows the picked computer (name, realm, state in words), the panel lists the caller's
// rows with search, a pick reaches onChange once and closes, the same pick or a disabled row changes nothing, and
// loading and a value not among the rows never show a stale name.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ComputerPicker as Picker } from './ComputerPicker';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ComputerPicker, type ComputerChoice } from './ComputerPicker';
import strings from './ComputerPicker.strings.en.json';

const ROWS: ComputerChoice[] = [
  { id: 'atlas', name: 'atlas', realm: { name: 'Personal', color: 'teal' }, running: true, state: 'Running', place: 'Singapore · sg-2', flag: '🇸🇬' },
  { id: 'borealis', name: 'borealis', realm: { name: 'Work' }, running: false, state: 'Stopped', place: 'Frankfurt · de-1' },
  { id: 'cedar', name: 'cedar', state: 'Paused', disabledReason: 'Start it first' },
];

function Host({ computers, start, seen }: { computers: ComputerChoice[] | undefined; start?: string; seen?: string[] }) {
  const [v, setV] = useState<string | undefined>(start);
  return (
    <ComputerPicker
      label="Computer for the left pane"
      computers={computers}
      value={v}
      onChange={(id) => {
        seen?.push(id);
        setV(id);
      }}
    />
  );
}
// The kit names the trigger by what it shows (the pick, or the loading / placeholder words), then its label.
const trigger = () => screen.getByRole('button', { name: /^.+ Computer for the left pane$/ });

describe('ComputerPicker', () => {
  it('shows the picked computer on the trigger: name, realm and its state in words', () => {
    render(<Host computers={ROWS} start="atlas" />);
    expect(trigger()).toHaveTextContent('atlas');
    expect(trigger()).toHaveTextContent('Personal');
    expect(trigger()).toHaveAccessibleName('atlas Personal Running Computer for the left pane');
  });

  it('picks another computer from the list, once, and closes', async () => {
    const seen: string[] = [];
    render(<Host computers={ROWS} start="atlas" seen={seen} />);
    await userEvent.click(trigger());
    const list = await screen.findByRole('dialog', { name: 'Computer for the left pane' });
    expect(within(list).getByText('Frankfurt · de-1')).toBeInTheDocument();
    expect(within(list).getByText('Stopped')).toBeInTheDocument();
    expect(within(list).getAllByText('Work').length).toBeGreaterThan(0);
    await userEvent.click(within(list).getByText('borealis'));
    expect(seen).toEqual(['borealis']);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger()).toHaveTextContent('borealis');
  });

  it('finds a computer by typing, and picks it with the keyboard', async () => {
    const seen: string[] = [];
    render(<Host computers={ROWS} seen={seen} />);
    await userEvent.click(trigger());
    const list = await screen.findByRole('dialog');
    await userEvent.type(within(list).getByRole('searchbox', { name: strings.search }), 'bor');
    expect(within(list).queryByText('atlas')).toBeNull();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(seen).toEqual(['borealis']);
  });

  it('changes nothing for the computer already picked, or for a row that is off', async () => {
    const seen: string[] = [];
    render(<Host computers={ROWS} start="atlas" seen={seen} />);
    await userEvent.click(trigger());
    let list = await screen.findByRole('dialog');
    expect(within(list).getByText('Start it first')).toBeInTheDocument();
    await userEvent.click(within(list).getByText('cedar'));
    expect(seen).toEqual([]);
    await userEvent.click(within(list).getByText('atlas'));
    expect(seen).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(trigger());
    list = await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    expect(seen).toEqual([]);
  });

  it('says it is loading, and never shows a name for a value not among the rows', () => {
    const { rerender } = render(<Host computers={undefined} start="atlas" />);
    expect(trigger()).toHaveTextContent(strings.loading);
    expect(trigger()).toBeDisabled();
    rerender(<Host computers={ROWS.slice(1)} start="atlas" />);
    expect(trigger()).toHaveTextContent(strings.placeholder);
    expect(trigger()).not.toHaveTextContent('atlas');
  });

  it('opens the error with Try again when the first read failed, instead of saying it is still loading', async () => {
    let retried = 0;
    render(<Picker label="Computer for the left pane" computers={undefined} value={undefined} onChange={() => undefined} status={{ error: new Error('down'), onRetry: () => { retried += 1; } }} />);
    expect(trigger()).toBeEnabled();
    expect(trigger()).toHaveTextContent(strings.failed);
    await userEvent.click(trigger());
    const list = await screen.findByRole('dialog');
    await userEvent.click(within(list).getByRole('button', { name: /try again/i }));
    expect(retried).toBe(1);
  });

  it('picks nothing from a panel left open after the picker was turned off', async () => {
    const seen: string[] = [];
    function Off() {
      const [off, setOff] = useState(false);
      return (
        <>
          <Picker label="Computer for the left pane" computers={ROWS} value="atlas" onChange={(id) => seen.push(id)} isDisabled={off} />
          <button type="button" onClick={() => setOff(true)}>turn off</button>
        </>
      );
    }
    render(<Off />);
    await userEvent.click(trigger());
    const list = await screen.findByRole('dialog');
    screen.getByRole('button', { name: 'turn off', hidden: true }).click();
    await userEvent.click(within(list).getByText('borealis'));
    expect(seen).toEqual([]);
  });

  it('lets a long realm give way inside the field: the name first down to a few characters, then the realm within its cap', () => {
    // jsdom draws no layout, so the rule is read from the stylesheet: the shot pieces-computer-picker shows it drawn.
    const css = readFileSync(join(import.meta.dirname, 'ComputerPicker.module.css'), 'utf8');
    const rule = (sel: string) => css.match(new RegExp(`\\.${sel} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('realm')).toMatch(/flex: 0 1 auto;/);
    expect(rule('realm')).toMatch(/min-width: 0;/);
    expect(rule('realm')).toMatch(/max-width: \d+rem;/);
    expect(rule('realmName')).toMatch(/min-width: 0;/);
    expect(rule('name')).toMatch(/min-width: [1-9]\d*ch;/);
    expect(rule('name')).toMatch(/text-align: start;/);
    expect(rule('name')).toMatch(/flex: 0 10 auto;/);
  });
});
