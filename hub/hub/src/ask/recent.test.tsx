// Vitest: a Recent row shows the phase of the latest store read, not the one read when
// Recent opened, and an unknown send stays "May have gone through" whatever the agent says (C9).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { makeT } from '@kit/strings';
import { Recent } from './AskPanel';
import strings from './strings.en.json';

const t = makeT(strings);
const rows = [{ k1: 'a', title: 'Tidy the folder', at: 0, ph: 'completed', current: false }];
const show = (ph: Record<string, string> | null, by: Record<string, 'running' | 'idle'> | null) =>
  render(<Recent rows={rows} act={by ? { running: 0, waiting: 0, by } : null} ph={ph} onPick={() => {}} t={t} />);

afterEach(cleanup);

describe('Recent row phase', () => {
  it('another tab\'s unknown send after a completed turn: May have gone through, with the agent running or not known', () => {
    show({ a: 'unknown' }, { a: 'running' });
    expect(screen.getByText('May have gone through')).toBeInTheDocument();
    cleanup();
    show({ a: 'unknown' }, null);   // the round's agent reads failed: the count is unknown, the phase is not
    expect(screen.getByText('May have gone through')).toBeInTheDocument();
  });
  it('a newer failed outcome is shown, never the opened Done', () => {
    show({ a: 'failed' }, null);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.queryByText('Done')).toBeNull();
  });
  it('before any round: the phase read when Recent opened', () => {
    show(null, null);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });
});
