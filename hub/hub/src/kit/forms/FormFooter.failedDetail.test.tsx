// FormFooter `failedDetail`: a refusal (kind failed) shows the page's own sentence in the footer (in place of the mapped one),
// keeps the Details button for the rejection, and never shows on pending (the C9 words stay there).
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { Form, FormFooter } from './more';
import kitStrings from '../states/strings.en.json';
import formStrings from './forms.strings.en.json';

beforeEach(() => boot());

const PAGE = 'A computer with this name already exists in this project.';
const CONFLICT = { status: 409, code: 'CONFLICT', kind: 'failed' };
const footer = (props: Partial<Parameters<typeof FormFooter>[0]>) =>
  render(
    <Form onSubmit={() => undefined}>
      <FormFooter dirty onSubmit={() => undefined} submitLabel="Create" {...props} />
    </Form>,
  );

describe('FormFooter failedDetail', () => {
  it('a refusal shows the page sentence, not the mapped one, and keeps Details', () => {
    footer({ outcome: { kind: 'failed' }, error: CONFLICT, failedDetail: PAGE });
    expect(screen.getByText(PAGE)).toBeInTheDocument();
    expect(screen.queryByText(kitStrings['err.conflict'])).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('CONFLICT');
  });

  it('beats the outcome message too', () => {
    footer({ outcome: { kind: 'failed', message: 'raw server text' }, failedDetail: PAGE });
    expect(screen.getByText(PAGE)).toBeInTheDocument();
    expect(screen.queryByText('raw server text')).toBeNull();
  });

  it('only on failed: not sent and stale keep their own words', () => {
    // changed on purpose: a stale answer was dropped, not refused; not sent was never sent
    const stale = footer({ outcome: { kind: 'stale' }, failedDetail: PAGE });
    expect(screen.queryByText(PAGE)).toBeNull();
    expect(screen.getByText(formStrings['outcome.staleShort'])).toBeInTheDocument();
    stale.unmount();
    footer({ outcome: { kind: 'not_sent' }, failedDetail: PAGE });
    expect(screen.queryByText(PAGE)).toBeNull();
    expect(screen.getByText(formStrings['outcome.notSent'])).toBeInTheDocument();
  });

  it('without it the mapped sentence stays', () => {
    footer({ outcome: { kind: 'failed' }, error: CONFLICT });
    expect(screen.getByText(kitStrings['err.conflict'])).toBeInTheDocument();
  });

  it('never on pending: the pending outcome keeps pendingDetail', () => {
    footer({ outcome: { kind: 'pending' }, onCheck: async () => undefined, pendingDetail: 'Check whether it was made.', failedDetail: PAGE });
    expect(screen.queryByText(PAGE)).toBeNull();
    expect(screen.getByText('Check whether it was made.')).toBeInTheDocument();
  });

  it('never when the facts say pending (a failed kind over a 5xx after the send)', () => {
    footer({ outcome: { kind: 'failed' }, error: { pending: true, status: 500, code: 'INTERNAL_SERVER_ERROR' }, onCheck: async () => undefined, failedDetail: PAGE });
    expect(screen.queryByText(PAGE)).toBeNull();
    expect(screen.getByRole('button', { name: /Check again/ })).toBeInTheDocument();
  });
});
