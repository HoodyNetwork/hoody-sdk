// A page test that takes its helpers from @app/testing before anything of the kit, and mocks @kit/states/Toast over its
// real module, gets the kit's sticky notice in its mock. @app/testing loads app/pageRouter.tsx, whose kit imports decide
// which module of the Toast import cycle loads first (kit/barrel.toastmock.test.tsx tells the cycle): with
// layouts/Layouts first (Tabs -> perf -> Toast), forms/Outcome bound the real showToast and the leave notice of an
// unknown save never reached the test (pages/ai/keystep.leave.test.tsx, keystep.scope.test.tsx). Runtime was unaffected.
import { act, render } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { usePendingToast, type OutcomeLike } from '@kit';

const log = vi.hoisted(() => ({ shown: [] as string[] }));
vi.mock('@kit/states/Toast', async (orig) => {
  const m = await orig<Record<string, unknown>>();
  return {
    ...m,
    showToast: (c: { title: string }) => {
      log.shown.push(c.title);
      return 'toast-1';
    },
    closeToast: () => undefined,
  };
});

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  log.shown.length = 0;
});

const PENDING: OutcomeLike = { kind: 'pending' };
function Place() {
  usePendingToast(PENDING, () => undefined);
  return <p>pending</p>;
}

describe('@app/testing with states/Toast mocked over its real module', () => {
  it("the sticky notice of an unknown outcome whose place goes reaches the test's mock, not the real toast", async () => {
    const v = render(<Place />);
    v.unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(log.shown, 'the mocked showToast got the notice').toHaveLength(1);
  });
});
