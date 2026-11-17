// SignedFrame: an agent frame waits for core's boot token with the signing-in line, mounts with
// it, mounts without it plus the band on any refusal but STALE, and mounts nothing on STALE. Other programs never ask.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SignedFrame } from './SignedFrame';

const ask = vi.fn<() => Promise<string>>();
vi.mock('@core', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  capture: () => ({}),
  agentBootToken: () => ask(),
}));

const SRC = 'https://p-c-agent-1.n12.fixture.invalid/?parent_keys=true';
const props = { src: SRC, title: 'agent-1 on atlas', inTabOrder: true, onState: () => {}, register: () => {}, name: 'agent-1' };
const frame = () => document.querySelector('iframe');

beforeEach(() => { ask.mockReset(); });

describe('SignedFrame', () => {
  it('shows "Signing in to agent-1…" while asking, then mounts with the token', async () => {
    let done!: (t: string) => void;
    ask.mockReturnValue(new Promise((r) => { done = r; }));
    render(<SignedFrame {...props} agent />);
    expect(screen.getByText('Signing in to agent-1…')).toBeInTheDocument();
    expect(frame()).toBeNull();
    done('tok-1');
    await waitFor(() => expect(frame()?.getAttribute('src')).toContain('hdy_token=tok-1'));
    expect(screen.queryByText(/Sign in to agent-1 inside/)).toBeNull();
  });

  it('a refusal (2FA, token session, producer missing) mounts without a token and says to sign in inside', async () => {
    ask.mockRejectedValue({ code: 'BOOT_TOKEN_FAILED' });
    render(<SignedFrame {...props} agent />);
    await waitFor(() => expect(frame()?.getAttribute('src')).toBe(SRC));
    expect(screen.getByText('Sign in to agent-1 inside this tile.')).toBeInTheDocument();
    // The kit band lays itself over the frame's top edge; no page wrapper around it.
    const band = screen.getByRole('status');
    expect(band).toHaveAttribute('data-band-over', '');
    expect(band.parentElement?.querySelector(':scope > iframe')).not.toBeNull();
  });

  it('STALE mounts nothing', async () => {
    ask.mockRejectedValue({ code: 'STALE', stale: true });
    render(<SignedFrame {...props} agent />);
    await waitFor(() => expect(screen.queryByText('Signing in to agent-1…')).toBeNull());
    expect(frame()).toBeNull();
  });

  it('a terminal frame never asks', () => {
    render(<SignedFrame {...props} name="terminal-1" agent={false} />);
    expect(frame()?.getAttribute('src')).toBe(SRC);
    expect(ask).not.toHaveBeenCalled();
  });
});
