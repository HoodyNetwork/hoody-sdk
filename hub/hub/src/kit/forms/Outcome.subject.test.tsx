// The leave toast names what the change was to (Toast.tsx copy policy): usePendingToast's and
// OutcomeSlot's `subject` goes into the title; without one the kit's bare title stays (KNOWN_COPY until callers pass it).
import { act, render } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import type { OutcomeLike } from '../outcome';
import strings from './forms.strings.en.json';
import { OutcomeSlot, usePendingToast } from './Outcome';

const toasts = vi.hoisted(() => [] as Array<{ title: string; tone?: string }>);
vi.mock('../states/Toast', () => ({
  showToast: (c: { title: string; tone?: string }) => {
    toasts.push(c);
    return 'k';
  },
  closeToast: () => undefined,
}));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  toasts.length = 0;
});

const PENDING: OutcomeLike = { kind: 'pending' };

function Hook({ subject }: { subject?: string }) {
  usePendingToast(PENDING, () => undefined, true, null, true, subject);
  return null;
}

function Host({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(true);
  return (
    <>
      {shown && children}
      <button type="button" onClick={() => setShown(false)}>
        leave
      </button>
    </>
  );
}

async function leave(node: ReactNode): Promise<string[]> {
  const { getByText } = render(<Host>{node}</Host>);
  await act(async () => getByText('leave').click());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return toasts.map((x) => x.title);
}

describe('the leave toast names its subject', () => {
  it('usePendingToast: the subject is in the title', async () => {
    expect(await leave(<Hook subject="the alias of Production" />)).toEqual(['Your change to the alias of Production may have gone through']);
  });

  it('OutcomeSlot: its subject reaches the toast', async () => {
    expect(
      await leave(
        <OutcomeSlot outcome="pending" onCheck={() => undefined} subject="the name of Build box">
          {null}
        </OutcomeSlot>,
      ),
    ).toEqual(['Your change to the name of Build box may have gone through']);
  });

  it('no subject: the kit title as before', async () => {
    expect(await leave(<Hook />)).toEqual([strings['outcome.toastTitle']]);
  });

  it('a subject of only spaces counts as none', async () => {
    expect(await leave(<Hook subject="   " />)).toEqual([strings['outcome.toastTitle']]);
  });
});
