// usePendingToast's Check again: the toast's action hands back what the check
// returns, so the Toast can keep the sticky "may have gone through" toast until the read proves it (`true`).
import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorInfo, type ErrorInfo } from '@core';
import { boot } from '@core/test/env';
import type { OutcomeLike } from '../outcome';
import { usePendingToast } from './Outcome';

const toasts = vi.hoisted(() => [] as Array<{ action?: { onAction: () => unknown } }>);
vi.mock('../states/Toast', () => ({
  showToast: (c: { action?: { onAction: () => unknown } }) => {
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

function Watch({ check }: { check: () => unknown }) {
  usePendingToast({ kind: 'pending' } satisfies OutcomeLike, check);
  return null;
}

function Host({ check }: { check: () => unknown }) {
  const [shown, setShown] = useState(true);
  return (
    <>
      {shown && <Watch check={check} />}
      <button type="button" onClick={() => setShown(false)}>
        leave
      </button>
    </>
  );
}

async function leaveWith(check: () => unknown) {
  const { getByText } = render(<Host check={check} />);
  await act(async () => getByText('leave').click());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  expect(toasts).toHaveLength(1);
  return toasts[0]?.action?.onAction;
}

describe('usePendingToast: Check again hands its read to the toast', () => {
  it.each([true, false, undefined])('returns the check\'s promise (resolving %s), so the toast can judge it', async (v) => {
    const run = await leaveWith(() => Promise.resolve(v));
    const r = run?.();
    expect(r).toBeInstanceOf(Promise);
    await expect(r).resolves.toBe(v);
  });
});

// The hand-off keeps the facts, and pending facts under another kind still hand off.
function WatchFacts({ facts }: { facts: ErrorInfo }) {
  usePendingToast({ kind: 'failed' } satisfies OutcomeLike, () => true, true, facts);
  return null;
}

describe('usePendingToast: facts', () => {
  it('hands pending facts under a failed kind to the toast, Details included', async () => {
    const facts = errorInfo({ pending: true, status: 502 });
    function H() {
      const [shown, setShown] = useState(true);
      return (
        <>
          {shown && <WatchFacts facts={facts} />}
          <button type="button" onClick={() => setShown(false)}>
            leave
          </button>
        </>
      );
    }
    const { getByText } = render(<H />);
    await act(async () => getByText('leave').click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(toasts).toHaveLength(1);
    expect((toasts[0] as { details?: ErrorInfo }).details).toBe(facts);
  });
});

describe('usePendingToast: facts follow the pending toast', () => {
  it('failed facts handed to a pending outcome read pending in the toast', async () => {
    const facts = errorInfo({ status: 502 });
    function W() {
      usePendingToast({ kind: 'pending' } satisfies OutcomeLike, () => true, true, facts);
      return null;
    }
    function H() {
      const [shown, setShown] = useState(true);
      return (
        <>
          {shown && <W />}
          <button type="button" onClick={() => setShown(false)}>
            leave
          </button>
        </>
      );
    }
    const { getByText } = render(<H />);
    await act(async () => getByText('leave').click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(toasts).toHaveLength(1);
    expect((toasts[0] as { details?: ErrorInfo }).details?.outcome).toBe('pending');
  });
});
