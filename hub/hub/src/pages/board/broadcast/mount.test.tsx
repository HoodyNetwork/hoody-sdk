// The exported Broadcast over core's fixture session: it mounts (and shows the capability note) in a browser with no
// MediaRecorder, instead of throwing while it builds its controller.
import { bootFixtureCore, CoreQueryProvider } from '@core';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Broadcast } from './Broadcast';

const g = globalThis as unknown as Record<string, unknown>;
const saved = g.MediaRecorder;
afterEach(() => { g.MediaRecorder = saved; });

describe('Broadcast mounted', () => {
  it('a browser without MediaRecorder gets the note, no crash', async () => {
    delete g.MediaRecorder;
    bootFixtureCore({ rules: [] });
    const user = userEvent.setup();
    await act(async () => { render(<Broadcast computers={[]} />, { wrapper: CoreQueryProvider }); });
    await user.click(screen.getByRole('button', { name: 'Broadcast' }));
    expect(await screen.findByRole('dialog', { name: 'Broadcast this Board' })).toBeInTheDocument();
  });

  // The Board's list is null until its first answer; Broadcast passes that on as unknown, never as none.
  const capable = () => {
    const keys = ['isSecureContext', 'MediaRecorder', 'Request', 'ReadableStream'] as const;
    const had = Object.fromEntries(keys.map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
    const nav = globalThis.navigator as unknown as Record<string, unknown>;
    const hadMedia = Object.getOwnPropertyDescriptor(nav, 'mediaDevices');
    Object.defineProperty(g, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(nav, 'mediaDevices', { value: { getDisplayMedia: () => Promise.reject(new Error('no')) }, configurable: true });
    g.MediaRecorder = Object.assign(function MediaRecorder() {}, { isTypeSupported: () => true });
    g.ReadableStream = class {};
    g.Request = class { headers = { has: () => false }; constructor(_u: string, init: { duplex?: string }) { void init.duplex; } };
    return () => {
      for (const k of keys) { const d = had[k]; if (d) Object.defineProperty(g, k, d); else delete g[k]; }
      if (hadMedia) Object.defineProperty(nav, 'mediaDevices', hadMedia); else delete nav.mediaDevices;
    };
  };
  it('computers not read yet: the mounted panel shows the reading state, never "no computers"', async () => {
    const restore = capable();
    try {
      bootFixtureCore({ rules: [] });
      const user = userEvent.setup();
      await act(async () => { render(<Broadcast computers={null} read={{ failed: false, retry: () => {} }} />, { wrapper: CoreQueryProvider }); });
      await user.click(screen.getByRole('button', { name: 'Broadcast' }));
      const panel = await screen.findByRole('dialog', { name: 'Broadcast this Board' });
      expect(within(panel).getByRole('status')).toHaveTextContent(/Loading/);
      expect(within(panel).queryByText('Broadcasting needs a computer. Get one or move one here on the Computers page.')).toBeNull();
    } finally { restore(); }
  });
  it('computers read failed: the mounted panel shows the read error, and Try again reads again', async () => {
    const restore = capable();
    try {
      bootFixtureCore({ rules: [] });
      const user = userEvent.setup();
      const retry = vi.fn();
      await act(async () => { render(<Broadcast computers={null} read={{ failed: true, retry }} />, { wrapper: CoreQueryProvider }); });
      await user.click(screen.getByRole('button', { name: 'Broadcast' }));
      const panel = await screen.findByRole('dialog', { name: 'Broadcast this Board' });
      expect(within(panel).queryByText('Broadcasting needs a computer. Get one or move one here on the Computers page.')).toBeNull();
      await user.click(within(panel).getByRole('button', { name: 'Try again' }));
      expect(retry).toHaveBeenCalledTimes(1);
    } finally { restore(); }
  });
});
