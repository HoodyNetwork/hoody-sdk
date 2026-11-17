// Vitest: the choice controls' group and label extras. A Checkbox label may carry links (a press on a link follows it
// and leaves the box alone); CheckboxGroup is the labelled group of checkboxes; RadioGroup takes an accessible name
// from outside (a SettingRow label) and can show fields under the selected option (`reveal`).
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Checkbox, CheckboxGroup, Fieldset, Switch, TextField } from './fields';
import f from './fields.module.css';
import { RadioGroup } from './more';

beforeEach(() => {
  boot();
});

// A browser never activates a label for a click on a link inside it (HTML: interactive content in a label); happy-dom
// does (it clicks the control for any click through the label), and it does not start React Aria's label press from a
// test pointer either. So these cases pin what happy-dom can show: the link's click is not cancelled (it navigates);
// the box staying as it was is the browser's own label rule plus the kit stopping the label press at the link.
describe('Checkbox label with links', () => {
  const consent = (onChange: (v: boolean) => void, onLink?: (prevented: boolean) => void) => (
    <Checkbox
      onChange={onChange}
      label={
        <>
          I agree to the{' '}
          <a href="#terms" onClick={(e) => onLink?.(e.defaultPrevented)}>
            Terms of Service
          </a>
        </>
      }
    />
  );

  it('the label is the whole sentence, link words included', () => {
    render(consent(() => undefined));
    expect(screen.getByRole('checkbox', { name: 'I agree to the Terms of Service' })).toBeInTheDocument();
  });

  it("a link's click is never cancelled by the label, so the link navigates", () => {
    const seen: boolean[] = [];
    render(consent(() => undefined, (p) => seen.push(p)));
    // dispatchEvent answers false when any handler cancelled the click (React Aria's label does for every click in it).
    const notCancelled = fireEvent.click(screen.getByRole('link', { name: 'Terms of Service' }));
    expect(seen).toEqual([false]);
    expect(notCancelled).toBe(true);
  });

  it('a press on the label words still toggles the box', async () => {
    const onChange = vi.fn();
    render(consent(onChange));
    await userEvent.setup().click(screen.getByText(/I agree to the/));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('a link reached by keyboard opens with Enter, not cancelled', async () => {
    const opened = vi.fn();
    render(consent(() => undefined, opened));
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('checkbox')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(opened).toHaveBeenCalledWith(false);
  });
});

describe('CheckboxGroup', () => {
  function Group({ error }: { error?: string }) {
    const [v, setV] = useState<string[]>(['logs']);
    return (
      <CheckboxGroup label="What they can open" description="Pick at least one." errorMessage={error} value={v} onChange={setV}>
        <Checkbox value="all" label="All programs" />
        <Checkbox value="logs" label="Logs" />
      </CheckboxGroup>
    );
  }

  it('is a named group whose checkboxes share one value list', async () => {
    render(<Group />);
    const group = screen.getByRole('group', { name: 'What they can open' });
    expect(group).toHaveAccessibleDescription('Pick at least one.');
    expect(screen.getByRole('checkbox', { name: 'Logs' })).toBeChecked();
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'All programs' }));
    expect(screen.getByRole('checkbox', { name: 'All programs' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Logs' })).toBeChecked();
  });

  it('shows its error under the group and marks it invalid', () => {
    render(<Group error="Pick at least one program." />);
    expect(screen.getByText('Pick at least one program.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'What they can open' })).toHaveAttribute('data-invalid');
  });
});

describe('RadioGroup', () => {
  const options = [
    { value: 'direct', label: 'Direct' },
    { value: 'other', label: 'Use another exit' },
  ] as const;

  it('takes its name and description from outside (a SettingRow label) with no label of its own', () => {
    render(
      <>
        <span id="row-label">Exit</span>
        <span id="row-help">Where traffic leaves.</span>
        <RadioGroup aria-labelledby="row-label" aria-describedby="row-help" options={options} value="direct" onChange={() => undefined} />
      </>,
    );
    expect(screen.getByRole('radiogroup', { name: 'Exit' })).toHaveAccessibleDescription('Where traffic leaves.');
  });

  it('takes an aria-label', () => {
    render(<RadioGroup aria-label="Exit" options={options} value="direct" onChange={() => undefined} />);
    expect(screen.getByRole('radiogroup', { name: 'Exit' })).toBeInTheDocument();
  });

  function Exit() {
    const [v, setV] = useState<'direct' | 'other'>('direct');
    return (
      <RadioGroup
        label="Exit"
        value={v}
        onChange={setV}
        options={[
          { value: 'direct', label: 'Direct' },
          { value: 'other', label: 'Use another exit', reveal: <TextField label="Proxy address" /> },
        ]}
      />
    );
  }

  it('shows an option reveal only while that option is selected, right after it', async () => {
    render(<Exit />);
    expect(screen.queryByRole('textbox', { name: 'Proxy address' })).toBeNull();
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Use another exit' }));
    const field = screen.getByRole('textbox', { name: 'Proxy address' });
    const radio = screen.getByRole('radio', { name: 'Use another exit' });
    expect(radio.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The reveal is not part of the option's name.
    expect(radio).toHaveAccessibleName('Use another exit');
  });

  it('arrow keys in a revealed field move its caret, not the selection', async () => {
    render(<Exit />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Use another exit' }));
    const field = screen.getByRole('textbox', { name: 'Proxy address' });
    await user.click(field);
    await user.keyboard('ab{ArrowLeft}c');
    expect(field).toHaveValue('acb');
    await user.keyboard('{ArrowUp}{ArrowDown}{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Use another exit' })).toBeChecked();
    expect(field).toHaveFocus();
  });
});

describe('Fieldset', () => {
  it('names a set of independent controls with the field label look, and describes it', () => {
    render(
      <Fieldset label="Features" description="Each one installs on first start.">
        <Switch label="Hoody kit" />
        <Switch label="AI" />
      </Fieldset>,
    );
    const group = screen.getByRole('group', { name: 'Features' });
    expect(group.tagName).toBe('FIELDSET');
    expect(group).toHaveAccessibleDescription('Each one installs on first start.');
    expect(screen.getByText('Features')).toHaveClass(f.label as string);
    expect(screen.getAllByRole('switch')).toHaveLength(2);
  });
});

