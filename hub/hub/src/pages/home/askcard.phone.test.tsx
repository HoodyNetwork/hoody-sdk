// Vitest (askcard): on a phone the open dock covers the page, so the handoff line says only that Agent is open, never
// where it sits.
import { act, render, renderHook, screen } from '@app/testing';
import { setAskForFixtures, useAskDock } from '@kit/ask';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AskStrip } from './parts/AskStrip';

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), useIsPhone: () => true }));

const dock = () => renderHook(() => useAskDock()).result.current;

beforeEach(() => { setAskForFixtures(true); });
afterEach(() => {
  const d = dock();
  act(() => d.close());
  setAskForFixtures(false);
});

it('phone, dock open: "Agent is open." with Go to Agent, no direction', () => {
  const d = dock();
  act(() => d.open());
  render(<AskStrip name="atlas" />);
  expect(screen.getByText('Agent is open.')).toBeInTheDocument();
  expect(screen.queryByText(/beside|on the right/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Go to Agent' })).toBeInTheDocument();
});
