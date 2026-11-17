// FormFooter `reason`: one line saying what pressing the primary does (or why it is off), in the footer's state slot.
// It never stands in for an outcome: a pending, failed or done result takes the slot, as it always did.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { Form, FormFooter } from './more';

beforeEach(() => boot());

const REASON = 'Nothing is sent until you press Connect.';

describe('FormFooter reason', () => {
  it('shows the reason while there is no outcome, dirty or not', () => {
    const { rerender } = render(
      <Form onSubmit={() => undefined}>
        <FormFooter dirty={false} onSubmit={() => undefined} submitLabel="Connect" reason={REASON} />
      </Form>,
    );
    expect(screen.getByText(REASON)).toBeInTheDocument();
    rerender(
      <Form onSubmit={() => undefined}>
        <FormFooter dirty onSubmit={() => undefined} submitLabel="Connect" reason={REASON} />
      </Form>,
    );
    expect(screen.getByText(REASON)).toBeInTheDocument();
  });

  it('gives way to an outcome: a pending result shows the C9 line, not the reason', () => {
    render(
      <Form onSubmit={() => undefined}>
        <FormFooter dirty outcome={{ kind: 'pending' }} onCheck={async () => undefined} onSubmit={() => undefined} reason={REASON} />
      </Form>,
    );
    expect(screen.queryByText(REASON)).toBeNull();
    expect(screen.getByRole('button', { name: /Check again/ })).toBeInTheDocument();
  });

  it('gives way to a failed result', () => {
    render(
      <Form onSubmit={() => undefined}>
        <FormFooter dirty outcome={{ kind: 'failed', message: 'Refused.' }} onSubmit={() => undefined} reason={REASON} />
      </Form>,
    );
    expect(screen.queryByText(REASON)).toBeNull();
  });
});
