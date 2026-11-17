// Vitest: a test that mocks @kit/states/Toast over its real module (the factory awaits
// orig()) and reaches the kit through the @kit barrel gets the kit's sticky notice in its mock. The barrel's export order
// decides when states/Toast loads. Toast sits on an import cycle (Toast -> ErrorDetails -> overlays/Dialog ->
// forms/Outcome -> Toast). An export listed before the states/States line whose imports reach Toast loads Toast first;
// for example, data/Ledger once reached it through Display -> InfoTip -> Faq -> perf. Outcome then binds the real
// showToast while the mock's factory is still running orig(), so a dialog's "may have gone through" notice never reached
// the test. The cure is to break the cycle itself, not to reorder the barrel.
import { act, render } from '@testing-library/react';
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

describe('the @kit barrel with states/Toast mocked over its real module', () => {
  it("the sticky notice of an unknown outcome whose place goes reaches the test's mock, not the real toast", async () => {
    const v = render(<Place />);
    v.unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(log.shown, 'the mocked showToast got the notice').toHaveLength(1);
  });
});
