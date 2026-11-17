// The spoken mark on an Activity row: from the row's own `voice`, nothing else.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LogRow } from './data';
import { LogItem } from './parts/ActivityTab';

const row = (o: Partial<LogRow>): LogRow => ({ seq: 1, kind: 'user', text: 'hello', at: '2026-11-07T00:00:00Z', sender: null, voice: null, ...o }) as unknown as LogRow;
const voice = (o: object = {}) => ({ origin: 'ws', durationMs: 12500, lang: 'en', conn: 'K', utt: 1, ...o });
const draw = (r: LogRow) => render(<ul><LogItem row={r} /></ul>);

describe('the spoken mark', () => {
  it('a row with voice shows origin, duration and language', () => {
    draw(row({ voice: voice() as never }));
    expect(screen.getByText(/Spoken · 0:12 · en/)).toBeTruthy();
  });
  it('no language: no dangling separator', () => {
    draw(row({ voice: voice({ lang: null }) as never }));
    expect(screen.getByText(/Spoken · 0:12 ·/)).toBeTruthy();
    expect(screen.queryByText(/0:12 · en/)).toBeNull();
  });
  it('a phone call says so', () => {
    draw(row({ voice: voice({ origin: 'twilio', lang: null }) as never }));
    expect(screen.getByText(/Phone call · 0:12/)).toBeTruthy();
  });
  it('a row without voice has no mark, even one sent through the voice door', () => {
    draw(row({ sender: { via: 'voice' } as never }));
    expect(screen.queryByText(/0:12|Spoken/)).toBeNull();
  });
  it('a Bot row has no mark', () => {
    draw(row({ kind: 'bot', voice: voice() as never }));
    expect(screen.queryByText(/Spoken/)).toBeNull();
  });
});
