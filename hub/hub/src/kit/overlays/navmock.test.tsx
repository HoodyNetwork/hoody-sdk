// An ActionMenu renders and opens where a test replaces kit/nav with a partial mock (only useSearchParam, as the DataTable
// and layout tests do): the menu's close-on-leave reads the page hold from kit/navhold.ts, never from nav.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { ActionMenu } from './Overlays';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});
afterEach(cleanup);

it('opens its menu under a ../nav mock that has no useHiddenNow', async () => {
  render(<ActionMenu label="Row actions" items={[{ id: 'open', label: 'Open', onAction: () => undefined }]} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }));
  });
  expect(screen.getByRole('menuitem', { name: 'Open' })).toBeTruthy();
});
