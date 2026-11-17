// A TextField's one action. The kit draws it after the input box in the control row:
// the label above both, description and error below both, Tab reaches it after the input, and Enter in the field never
// presses it. A field without an action keeps exactly the tree it had before the slot existed, and an action that comes
// or goes never remounts the input.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import type { ActionSpec } from '../layouts/anatomy/types';
import { TextField } from './fields';
import s from './fields.module.css';
import { Form } from './more';

beforeEach(() => {
  boot();
});

const create = (over: Partial<ActionSpec> = {}): ActionSpec => ({ id: 'create', label: 'Create', onPress: vi.fn(), ...over });

function Code({ action, onSubmit }: { action?: ActionSpec; onSubmit?: () => void }) {
  const [code, setCode] = useState('');
  const field = <TextField label="Code" description="Letters and digits." errorMessage={code === 'bad' ? 'That code is taken.' : undefined} value={code} onChange={setCode} action={action} />;
  return onSubmit ? <Form onSubmit={onSubmit}>{field}</Form> : field;
}

describe('TextField without an action', () => {
  // The pinned tree: label, the control box directly under the field, then description and error. No row, no
  // container class, no extra element: every TextField in the Hub renders through this path.
  it('keeps the tree it had before the action slot', () => {
    const { container } = render(<TextField label="Name" description="Shown on the card." placeholder="atlas" />);
    const field = container.firstElementChild as HTMLElement;
    expect(field.className.split(' ')).toEqual([s.field]);
    expect([...field.children].map((c) => c.tagName + (c.className ? '.' + c.className : ''))).toEqual([
      `LABEL.${s.label}`,
      `DIV.${s.control}`,
      `SPAN.${s.description}`,
    ]);
    const box = field.children[1] as HTMLElement;
    expect([...box.children].map((c) => c.tagName)).toEqual(['INPUT']);
    expect(container.querySelector(`.${s.action}, .${s.withAction}`)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps the boxed tree with a prefix and a suffix', () => {
    const { container } = render(<TextField label="Address" prefix="https://" suffix=".hoody.page" />);
    const field = container.firstElementChild as HTMLElement;
    expect(field.className.split(' ')).toEqual([s.field]);
    const box = field.children[1] as HTMLElement;
    expect(box.className.split(' ')).toContain(s.slotBox);
    expect([...box.children].map((c) => c.tagName + '.' + c.className)).toEqual([`DIV.${s.prefix}`, `INPUT.${s.boxInput}`, `DIV.${s.suffix}`]);
  });
});

describe('TextField action', () => {
  it('follows the box as its sibling, with the label before and description and error after both', async () => {
    const user = userEvent.setup();
    const { container } = render(<Code action={create()} />);
    const field = container.firstElementChild as HTMLElement;
    expect(field.className.split(' ')).toContain(s.withAction);
    const kids = () => [...field.children].map((c) => c.className);
    expect(kids()).toEqual([s.label, s.control, s.action, s.description]);
    const action = field.children[2] as HTMLElement;
    expect(action.contains(screen.getByRole('button', { name: 'Create' }))).toBe(true);
    expect(action.children).toHaveLength(1);
    await user.type(screen.getByRole('textbox', { name: 'Code' }), 'bad');
    const error = screen.getByText('That code is taken.');
    expect(kids()).toEqual([s.label, s.control, s.action, s.description, s.error]);
    expect(action.contains(error)).toBe(false);
    // The field's own description and error stay the input's, never the button's.
    expect(screen.getByRole('textbox', { name: 'Code' })).toHaveAccessibleDescription(expect.stringContaining('Letters and digits.'));
    expect(screen.getByRole('button', { name: 'Create' })).not.toHaveAccessibleDescription(expect.stringContaining('Letters'));
  });

  it('presses on click, Space and its own Enter', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<Code action={create({ onPress })} />);
    const button = screen.getByRole('button', { name: 'Create' });
    await user.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    button.focus();
    await user.keyboard(' ');
    await user.keyboard('{Enter}');
    expect(onPress).toHaveBeenCalledTimes(3);
  });

  it('Tab reaches it right after the input', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Code action={create()} />
        <button type="button">After</button>
      </>,
    );
    await user.click(screen.getByRole('textbox', { name: 'Code' }));
    await user.tab();
    expect(screen.getByRole('button', { name: 'Create' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it('Enter in the field never presses it', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<Code action={create({ onPress })} />);
    await user.type(screen.getByRole('textbox', { name: 'Code' }), 'sunny{Enter}');
    expect(onPress).not.toHaveBeenCalled();
  });

  it('Enter in the field inside a Form submits the form, never the action', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    const onSubmit = vi.fn();
    render(<Code action={create({ onPress })} onSubmit={onSubmit} />);
    await user.type(screen.getByRole('textbox', { name: 'Code' }), 'sunny{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    // Pressing the action is not a submit either.
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('busy refuses presses and keeps its label', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<Code action={create({ onPress, busy: true })} />);
    const button = screen.getByRole('button', { name: /Create/ });
    await user.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('a disabled reason keeps it focusable, never acts, and says why', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<Code action={create({ onPress, disabledReason: 'Type a code first' })} />);
    const button = screen.getByRole('button', { name: 'Create' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Type a code first');
    await user.click(button);
    expect(onPress).not.toHaveBeenCalled();
    await user.click(screen.getByRole('textbox', { name: 'Code' }));
    await user.tab();
    expect(button).toHaveFocus();
  });

  it('a longer name reaches the button', () => {
    render(<Code action={create({ name: 'Create the code' })} />);
    expect(screen.getByRole('button', { name: 'Create the code' })).toHaveTextContent('Create');
  });

  it('is refused on a multiline field at the type level; a boolean multiline without an action still compiles', () => {
    const wide: boolean = Math.random() > 2;
    const spread = { label: 'Notes', multiline: wide };
    const maybe: ActionSpec | undefined = Math.random() > 2 ? create() : undefined;
    void (<TextField label="Notes" multiline={wide} />);
    void (<TextField {...spread} />);
    void (<TextField label="Code" action={maybe} />);
    void (<TextField label="Code" multiline={false} action={create()} />);
    // @ts-expect-error a multiline field takes no action
    void (<TextField label="Notes" multiline action={create()} />);
    // @ts-expect-error a multiline field takes no action
    void (<TextField label="Notes" multiline={true} action={create()} />);
    // @ts-expect-error a field that may be multiline takes no action
    void (<TextField label="Notes" multiline={wide} action={create()} />);
    // @ts-expect-error a field that may be multiline takes no action
    void (<TextField {...spread} action={create()} />);
  });

  // An action that appears or goes must not remount the input.
  for (const dir of ['appears', 'goes'] as const)
    it(`an action that ${dir} keeps the same input, its focus, selection and uncontrolled value`, async () => {
      const user = userEvent.setup();
      const el = (on: boolean) => <TextField label="Code" defaultValue="" action={on ? create() : undefined} />;
      const { rerender } = render(el(dir === 'goes'));
      const input = screen.getByRole('textbox', { name: 'Code' }) as HTMLInputElement;
      await user.type(input, 'sunny');
      input.setSelectionRange(1, 3);
      rerender(el(dir === 'appears'));
      expect(screen.getByRole('textbox', { name: 'Code' })).toBe(input);
      expect(input).toHaveFocus();
      expect(input.value).toBe('sunny');
      expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
      expect(screen.queryByRole('button', { name: 'Create' }) === null).toBe(dir === 'goes');
    });

  // A disabled or invalid field and either kind of action. The field's state and description stay the
  // input's; the action keeps its own (the page decides when it may act).
  for (const kind of ['button', 'reason'] as const)
    it(`a disabled, invalid field leaves its state on the input, not on a ${kind} action`, () => {
      render(
        <TextField
          label="Code"
          description="Letters and digits."
          isDisabled
          errorMessage="That code is taken."
          action={create(kind === 'reason' ? { disabledReason: 'Type a code first' } : {})}
        />,
      );
      const input = screen.getByRole('textbox', { name: 'Code' });
      expect(input).toBeDisabled();
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAccessibleDescription(expect.stringContaining('Letters and digits.'));
      const button = screen.getByRole('button', { name: 'Create' });
      expect(button).not.toHaveAttribute('aria-invalid');
      expect(button).not.toHaveAccessibleDescription(expect.stringContaining('Letters'));
      if (kind === 'reason') {
        expect(button).toHaveAccessibleDescription('Type a code first');
        expect(button).toHaveAttribute('aria-disabled', 'true');
      } else expect(button).toBeEnabled();
    });

  it('focusOnError still moves focus into the input, not the action', () => {
    const { rerender } = render(<TextField label="Code" focusOnError action={create()} />);
    screen.getByRole('button', { name: 'Create' }).focus();
    rerender(<TextField label="Code" focusOnError errorMessage="That code is taken." action={create()} />);
    expect(screen.getByRole('textbox', { name: 'Code' })).toHaveFocus();
  });
});
