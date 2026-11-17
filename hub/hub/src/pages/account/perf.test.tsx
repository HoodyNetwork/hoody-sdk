// This browser on the account page has the Performance mode switch, the same per-browser choice as the
// account menu: it names what it turns off, flips the root attribute (kit/perf.test.tsx covers storage) and says so in a toast.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Toaster } from '@kit';
import perfStrings from '@kit/perf.strings.en.json';
import { PerfRow } from './parts/PerfRow';

beforeEach(() => {
  document.documentElement.removeAttribute('data-hx-perf');
});
afterEach(() => document.documentElement.removeAttribute('data-hx-perf'));

describe('account: Performance mode', () => {
  it('a switch named by its row and described by its help; on and off each say so', async () => {
    render(
      <>
        <PerfRow />
        <Toaster />
      </>,
    );
    const sw = screen.getByRole('switch', { name: perfStrings['perf.label'] });
    expect(sw).not.toBeChecked();
    expect(sw).toHaveAccessibleDescription(perfStrings['perf.help']);
    await userEvent.click(sw);
    expect(sw).toBeChecked();
    expect(document.documentElement.getAttribute('data-hx-perf')).toBe('on');
    expect(await screen.findByText(perfStrings['perf.on'])).toBeInTheDocument();
    await userEvent.click(sw);
    expect(sw).not.toBeChecked();
    expect(document.documentElement.hasAttribute('data-hx-perf')).toBe(false);
    expect(await screen.findByText(perfStrings['perf.off'])).toBeInTheDocument();
  });
});
