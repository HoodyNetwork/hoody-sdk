import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { TextField } from './fields';
import { Combobox, Form, NumberField, RadioGroup, Select, SecretInput, TimeField } from './more';

// A page owns its validation: it sets an error on Save and may keep it until the next Save. That old error must not block the next
// submit: the browser's own validation would refuse it (an invalid field refuses the submit) and nothing would reach the page.
// A field with NO page error keeps the form's native validation (a required field still refuses an empty submit).
beforeEach(() => boot());

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
] as const;

interface Kind {
  name: string;
  /** The field, showing `bad`; `value` is empty until `fix` runs. */
  field: (p: { bad: string | undefined; value: string; set: (v: string) => void }) => ReactElement;
  fix: () => Promise<void>;
}

const typeF = async () => void (await userEvent.type(screen.getByLabelText('F'), 'x'));

const KINDS: Kind[] = [
  { name: 'TextField', field: (p) => <TextField label="F" value={p.value} onChange={p.set} errorMessage={p.bad} />, fix: typeF },
  { name: 'TextField multiline', field: (p) => <TextField label="F" multiline value={p.value} onChange={p.set} errorMessage={p.bad} />, fix: typeF },
  { name: 'SecretInput', field: (p) => <SecretInput label="F" value={p.value} onChange={p.set} errorMessage={p.bad} reveal={false} />, fix: typeF },
  // Hidden, the multiline textarea is read-only (it takes no part in validation); once shown it is a normal field.
  {
    name: 'SecretInput multiline (shown)',
    field: (p) => <SecretInput label="F" multiline value={p.value} onChange={p.set} errorMessage={p.bad} />,
    fix: async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Show what you typed' }));
      await typeF();
    },
  },
  {
    name: 'NumberField',
    field: (p) => <NumberField label="F" value={p.value === '' ? Number.NaN : Number(p.value)} onChange={(v) => p.set(Number.isFinite(v) ? String(v) : '')} errorMessage={p.bad} />,
    fix: async () => void (await userEvent.type(screen.getByRole('textbox', { name: 'F' }), '5')),
  },
  {
    name: 'Select',
    field: (p) => <Select label="F" options={OPTIONS} value={(p.value || undefined) as 'a' | undefined} onChange={p.set} errorMessage={p.bad} />,
    fix: async () => {
      await userEvent.click(screen.getByRole('button', { name: /F/ }));
      await userEvent.click(await screen.findByRole('option', { name: 'Alpha' }));
    },
  },
  {
    name: 'Combobox',
    field: (p) => <Combobox label="F" options={OPTIONS} value={(p.value || undefined) as 'a' | undefined} onChange={p.set} errorMessage={p.bad} />,
    fix: async () => {
      await userEvent.click(screen.getByRole('combobox', { name: /F/ }));
      await userEvent.click(await screen.findByRole('option', { name: 'Alpha' }));
    },
  },
  {
    name: 'RadioGroup',
    field: (p) => <RadioGroup label="F" options={OPTIONS} value={(p.value || undefined) as 'a' | undefined} onChange={p.set} errorMessage={p.bad} />,
    fix: async () => void (await userEvent.click(screen.getByRole('radio', { name: 'Alpha' }))),
  },
  {
    name: 'TimeField',
    field: (p) => <TimeField label="F" value={p.value} onChange={p.set} errorMessage={p.bad} />,
    fix: async () => void (await userEvent.type(screen.getByLabelText('F'), '09:30')),
  },
];

function Page({ kind, onSend }: { kind: Kind; onSend: () => void }) {
  const [value, set] = useState('');
  const [bad, setBad] = useState<string | undefined>();
  return (
    <Form
      onSubmit={() => {
        if (!value) return setBad('Fill this in');
        setBad(undefined);
        onSend();
      }}
    >
      {kind.field({ bad, value, set })}
      <button type="submit">Save</button>
    </Form>
  );
}

describe('a page error that is still showing does not block the next Save', () => {
  for (const kind of KINDS) {
    it(kind.name, async () => {
      const onSend = vi.fn();
      render(<Page kind={kind} onSend={onSend} />);
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Fill this in')).toBeInTheDocument();
      expect(onSend).not.toHaveBeenCalled();
      await kind.fix();
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Fill this in')).not.toBeInTheDocument();
    });
  }

  it('the old error is still shown (aria-invalid) while it is there, and a Save that is still wrong shows it again', async () => {
    const onSend = vi.fn();
    render(<Page kind={KINDS[0]!} onSend={onSend} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText('F')).toHaveAttribute('aria-invalid', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText('Fill this in')).toBeInTheDocument();
  });

  // The page keeps the visible refusal: a required field that still holds the page's error stays marked invalid with its message on
  // screen when it is saved empty, and the Save reaches the page (which refuses it in its own words). Nothing is refused silently.
  for (const [name, field] of [
    ['TextField', <TextField key="t" label="F" isRequired value="" onChange={() => undefined} errorMessage="Fill this in" />],
    ['SecretInput', <SecretInput key="s" label="F" isRequired value="" onChange={() => undefined} errorMessage="Fill this in" reveal={false} />],
  ] as const) {
    it(`an empty required ${name} that still shows the page error: Save reaches the page and the error stays visible`, async () => {
      const onSubmit = vi.fn();
      render(
        <Form onSubmit={onSubmit}>
          {field}
          <button type="submit">Save</button>
        </Form>,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Fill this in')).toBeInTheDocument();
      expect(screen.getByLabelText('F')).toHaveAttribute('aria-invalid', 'true');
    });
  }

  it('a server field error from fieldErrors still shows on its field', async () => {
    render(
      <Form onSubmit={() => undefined} fieldErrors={{ name: 'Already taken' }}>
        <TextField label="F" name="name" value="x" onChange={() => undefined} />
      </Form>,
    );
    expect(await screen.findByText('Already taken')).toBeInTheDocument();
    expect(screen.getByLabelText('F')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('a field with no page error keeps the native refusal', () => {
  it('a TimeField whose typed text is no time refuses the submit', async () => {
    const onSend = vi.fn();
    render(
      <Form onSubmit={onSend}>
        <TimeField label="F" value="zz" onChange={() => undefined} />
        <button type="submit">Save</button>
      </Form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByLabelText('F')).toBeInvalid();
  });

  it('an empty required TextField refuses the submit and shows itself invalid', async () => {
    const onSend = vi.fn();
    render(
      <Form onSubmit={onSend}>
        <TextField label="F" value="" onChange={() => undefined} isRequired />
        <button type="submit">Save</button>
      </Form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByLabelText('F')).toBeInvalid();
  });

  it('an empty required SecretInput refuses the submit', async () => {
    const onSend = vi.fn();
    render(
      <Form onSubmit={onSend}>
        <SecretInput label="F" value="" onChange={() => undefined} isRequired reveal={false} />
        <button type="submit">Save</button>
      </Form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSend).not.toHaveBeenCalled();
  });
});
