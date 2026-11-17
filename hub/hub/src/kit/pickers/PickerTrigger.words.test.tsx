// PickerTrigger: the text, the tail and the spoken state stay separate words in the text tools read. axe's Label in
// Name check joins child text with no separator, so "atlas" + "Personal" read as one word "atlasPersonal" and no
// accessible name could match it.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PickerTrigger, RealmChip } from './ComputerPicker';
import { PickerField } from './PickerField';

const realm = { name: 'Personal' };

describe('PickerTrigger keeps its words apart', () => {
  it('the name and the realm tail', () => {
    render(<PickerTrigger label="Computer in the Left pane" text="atlas" tail={<RealmChip realm={realm} />} />);
    expect(screen.getByRole('button').textContent).toBe('atlas Personal');
  });

  it('the name, the realm tail and the spoken state (after the drawn words)', () => {
    render(<PickerTrigger label="Computer in the Left pane" text="atlas" spoken="Running" tail={<RealmChip realm={realm} />} />);
    expect(screen.getByRole('button').textContent).toBe('atlas Personal Running');
  });

  it('the name alone gains no space', () => {
    render(<PickerTrigger label="Computer in the Left pane" text="Pick a computer" placeholder />);
    expect(screen.getByRole('button').textContent).toBe('Pick a computer');
  });
});

// WCAG 2.5.3 Label in Name (axe label-content-name-mismatch): the trigger's name starts with the words it shows.
describe('PickerTrigger is named by what it shows, then what it is for', () => {
  it('alone: the shown words, then its label', () => {
    render(<PickerTrigger label="Computer" text="atlas" spoken="Running" tail={<RealmChip realm={realm} />} />);
    const b = screen.getByRole('button', { name: 'atlas Personal Running Computer' });
    expect(b.getAttribute('aria-describedby')).toBeNull();
    // The label is read, never drawn: the button draws only the shown words.
    expect(b.textContent).toBe('atlas Personal Running');
  });

  it('a placeholder is shown words too', () => {
    render(<PickerTrigger label="Program" text="Pick a program" placeholder />);
    screen.getByRole('button', { name: 'Pick a program Program' });
  });

  it('inside a PickerField: the shown words, then the field label; the description still describes it', () => {
    render(
      <PickerField label="Connect from" description="The computer that opens the connection">
        <PickerTrigger label="Connect from" text="atlas" />
      </PickerField>,
    );
    const b = screen.getByRole('button', { name: 'atlas Connect from' });
    expect(b).toHaveAccessibleDescription('The computer that opens the connection');
  });

  it('a node as text never counts as already named', () => {
    render(<PickerTrigger label="Project" text={<b>web</b>} />);
    screen.getByRole('button', { name: 'web Project' });
  });
});
