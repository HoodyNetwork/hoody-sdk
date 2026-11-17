// A kit field's description that first appears
// after mount is its input's accessible description at once, and stops being it when it goes. React Aria re-looks for the
// description slot only when Boolean(description) changes, and the kit drew the slot itself without telling it, so a
// late description was never linked until validity changed. Each kit field that draws its own description is checked.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement, useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { TextField } from './fields';
import { Combobox, NumberField, RadioGroup, Select } from './more';
import { SecretInput } from './Secret';

beforeEach(() => {
  boot();
});

async function show(Component: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
];
const LATE = 'Shown after the field mounted';

type Field = (description: string | undefined) => ReactElement;
const FIELDS: Array<{ name: string; field: Field; target: () => HTMLElement }> = [
  { name: 'TextField', field: (d) => <TextField label="Name" description={d} />, target: () => screen.getByRole('textbox', { name: 'Name' }) },
  { name: 'TextField multiline', field: (d) => <TextField label="Notes" multiline description={d} />, target: () => screen.getByRole('textbox', { name: 'Notes' }) },
  { name: 'SecretInput', field: (d) => <SecretInput label="Token" value="" onChange={() => {}} description={d} />, target: () => screen.getByLabelText('Token') },
  { name: 'SecretInput multiline', field: (d) => <SecretInput label="Key" multiline value="" onChange={() => {}} description={d} />, target: () => screen.getByLabelText('Key') },
  { name: 'NumberField', field: (d) => <NumberField label="Count" description={d} />, target: () => screen.getByRole('textbox', { name: 'Count' }) },
  { name: 'Select', field: (d) => <Select label="Pick" options={OPTIONS} value="a" onChange={() => {}} description={d} />, target: () => screen.getByRole('button', { name: /Pick/ }) },
  { name: 'Combobox', field: (d) => <Combobox label="Find" options={OPTIONS} value="a" onChange={() => {}} description={d} />, target: () => screen.getByRole('combobox', { name: 'Find' }) },
  { name: 'RadioGroup', field: (d) => <RadioGroup label="Mode" options={OPTIONS} value="a" onChange={() => {}} description={d} />, target: () => screen.getByRole('radiogroup', { name: 'Mode' }) },
];

describe('a kit field description that comes after mount is linked at once', () => {
  it.each(FIELDS)('$name: a late description becomes the accessible description, and goes with it', async ({ field, target }) => {
    function Harness() {
      const [d, setD] = useState<string | undefined>(undefined);
      return (
        <>
          {field(d)}
          <button type="button" onClick={() => setD((x) => (x ? undefined : LATE))}>
            toggle
          </button>
        </>
      );
    }
    await show(Harness);
    expect(target()).not.toHaveAccessibleDescription(LATE);
    act(() => fireEvent.click(screen.getByRole('button', { name: 'toggle' })));
    const id = screen.getByText(LATE).id;
    expect(id).not.toBe('');
    expect(target()).toHaveAccessibleDescription(LATE);
    expect(target().getAttribute('aria-describedby')?.split(' ')).toContain(id);
    act(() => fireEvent.click(screen.getByRole('button', { name: 'toggle' })));
    expect(screen.queryByText(LATE)).toBeNull();
    expect(target()).not.toHaveAccessibleDescription(LATE);
    // Unlinked, not just pointing at nothing: the removed slot's id leaves aria-describedby.
    expect(target().getAttribute('aria-describedby')?.split(' ') ?? []).not.toContain(id);
  });

  it('a description present from the first render is still linked', async () => {
    await show(() => <TextField label="Name" description="From the start" />);
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription('From the start');
  });
});
