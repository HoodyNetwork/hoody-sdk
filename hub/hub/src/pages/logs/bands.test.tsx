// Vitest: the list area's failure states render the wait the API named.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@app/testing';
import { StateBox } from './parts/Bands';
import strings from './strings.en.json';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => {
  const n = o?.count;
  const raw = table[k] ?? (n === undefined ? undefined : table[`${k}_${n === 1 ? 'one' : 'other'}`]) ?? k;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''));
}) as never;

describe('StateBox', () => {
  afterEach(cleanup);

  it('says when to try again once, without a doubled "in"', () => {
    render(<StateBox t={t} err={{ code: 'quota', retryAfterMs: 600_000 }} onRetry={() => {}} onAgentUrl={null} />);
    expect(screen.getByText('Try again in 10 minutes.')).toBeTruthy();
  });

  it('names no wait when the API gave none', () => {
    render(<StateBox t={t} err={{ code: 'quota' }} onRetry={() => {}} onAgentUrl={null} />);
    expect(screen.queryByText(/Try again in \d/)).toBeNull();
  });
});
