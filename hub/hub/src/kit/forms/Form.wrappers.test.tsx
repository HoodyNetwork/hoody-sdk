import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { ColorPicker } from './ColorPicker';
import { DateField } from './DateField';
import { DateTimeField } from './DateTimeField';
import { Form } from './more';

// A wrapper's OWN format hint ("Use a date such as ...") keeps the form's native refusal: an unfinished date, time or hex must not be
// saved. Only the PAGE's errorMessage (an old refusal still showing) stops blocking the next Save.
beforeEach(() => boot());

interface Wrapper {
  name: string;
  /** The field with the page's error (or none); `bad`/`good` set a wrong / a right value. */
  field: (page: string | undefined) => ReactElement;
  /** Type something the wrapper's own check refuses, then leave the field. */
  bad: () => Promise<void>;
  hint: string;
}

const leave = () => userEvent.tab();

function DateFieldHost({ page }: { page?: string }) {
  const [v, setV] = useState('2026-10-23');
  return <DateField label="Ends on" value={v} onChange={setV} errorMessage={page} />;
}
function DateTimeHost({ page }: { page?: string }) {
  const [v, setV] = useState<number | null>(new Date(2026, 9, 23, 9, 30).getTime());
  return <DateTimeField label="Around a time" value={v} onChange={setV} errorMessage={page} />;
}
function ColorHost({ page }: { page?: string }) {
  const [v, setV] = useState('#4ECDC4');
  return <ColorPicker label="Colour" value={v} onChange={setV} errorMessage={page} />;
}

const WRAPPERS: Wrapper[] = [
  {
    name: 'DateField',
    field: (page) => <DateFieldHost page={page} />,
    bad: async () => {
      const el = screen.getByRole('textbox', { name: 'Ends on' });
      await userEvent.click(el);
      act(() => fireEvent.change(el, { target: { value: '2026-13-45' } }));
      await leave();
    },
    hint: 'Use a date such as 2026-10-23.',
  },
  {
    name: 'DateTimeField (date part)',
    field: (page) => <DateTimeHost page={page} />,
    bad: async () => {
      const el = screen.getByRole('textbox', { name: 'Date' });
      await userEvent.click(el);
      act(() => fireEvent.change(el, { target: { value: '2026-13-45' } }));
      await leave();
    },
    hint: 'Use a date such as 2026-10-23.',
  },
  {
    name: 'DateTimeField (time part)',
    field: (page) => <DateTimeHost page={page} />,
    bad: async () => {
      const el = screen.getByRole('textbox', { name: 'Time' });
      await userEvent.click(el);
      act(() => fireEvent.change(el, { target: { value: '99:99' } }));
      await leave();
    },
    hint: 'Use a 24-hour time such as 09:30.',
  },
  {
    name: 'ColorPicker',
    field: (page) => <ColorHost page={page} />,
    bad: async () => {
      const el = screen.getByRole('textbox', { name: 'Hex code' });
      await userEvent.click(el);
      act(() => fireEvent.change(el, { target: { value: '#12345' } }));
      await leave();
    },
    hint: 'Use a hex code such as #4ECDC4 or #4CC.',
  },
];

function Page({ w, page, onSubmit }: { w: Wrapper; page?: string; onSubmit: () => void }) {
  return (
    <Form onSubmit={onSubmit}>
      {w.field(page)}
      <button type="submit">Save</button>
    </Form>
  );
}

describe('a wrapper keeps the native refusal for its own format hint', () => {
  for (const w of WRAPPERS) {
    it(`${w.name}: an unfinished value shows its hint and Save does not go through`, async () => {
      const onSubmit = vi.fn();
      render(<Page w={w} onSubmit={onSubmit} />);
      await w.bad();
      expect(await screen.findByText(w.hint)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).not.toHaveBeenCalled();
    });
  }
});

describe('a wrapper whose PAGE error is still showing does not block the next Save', () => {
  for (const w of WRAPPERS) {
    it(`${w.name}: a right value saves although the page error is still on screen`, async () => {
      const onSubmit = vi.fn();
      render(<Page w={w} page="The server said no" onSubmit={onSubmit} />);
      expect(screen.getByText('The server said no')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  }
});
