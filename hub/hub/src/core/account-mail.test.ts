// @vitest-environment node
// The two mails an account asks for its own address: each goes to its own route with the trimmed address alone, and
// every answer is a typed outcome (taken, too many asks with the wait, no answer, a fault, a framed page, no API).
import { describe, expect, it, vi } from 'vitest';
import { requestPasswordReset, resendVerification, type AccountMailCall } from './account-mail';

const served = (): string | null => '';
const rejects = (e: unknown): AccountMailCall => vi.fn(() => Promise.reject(e));

describe('account mails', () => {
  it('each ask goes to its own route with the trimmed address and nothing else', async () => {
    const call = vi.fn<AccountMailCall>(() => Promise.resolve({}));
    expect(await requestPasswordReset('  ada@example.com ', call, served)).toEqual({ kind: 'sent' });
    expect(await resendVerification('ada@example.com', call, served)).toEqual({ kind: 'sent' });
    expect(call.mock.calls).toEqual([
      ['/auth/forgot-password', { email: 'ada@example.com' }],
      ['/auth/resend-verification', { email: 'ada@example.com' }],
    ]);
  });

  it('a page with no API to send to sends nothing', async () => {
    const call = vi.fn<AccountMailCall>(() => Promise.resolve({}));
    expect(await requestPasswordReset('ada@example.com', call, () => null)).toEqual({ kind: 'refused', why: 'no-api' });
    expect(call).not.toHaveBeenCalled();
  });

  it('too many asks carries the wait when the answer names one', async () => {
    expect(await requestPasswordReset('a@b.co', rejects({ status: 429, retryAfter: 1800 }), served)).toEqual({ kind: 'refused', why: 'retry', retryAfter: 1800 });
    expect(await resendVerification('a@b.co', rejects({ status: 429, retryAfter: null }), served)).toEqual({ kind: 'refused', why: 'retry' });
  });

  it('no answer and a fault are told apart from a refusal of the address', async () => {
    expect(await requestPasswordReset('a@b.co', rejects({ status: 0 }), served)).toEqual({ kind: 'refused', why: 'network' });
    // A Hub that sends no change where it runs refused it unsent: that is said, never "no answer".
    expect(await requestPasswordReset('a@b.co', rejects({ status: 0, notSent: true, code: 'TERM_READ_ONLY' }), served)).toEqual({ kind: 'refused', why: 'read-only' });
    expect(await resendVerification('a@b.co', rejects({ status: 0, notSent: true, code: 'TERM_READ_ONLY' }), served)).toEqual({ kind: 'refused', why: 'read-only' });
    expect(await requestPasswordReset('a@b.co', rejects({ status: 0, notSent: true, code: 'NOT_DURABLE' }), served)).toEqual({ kind: 'refused', why: 'read-only' });
    expect(await requestPasswordReset('a@b.co', rejects(new Error('lost')), served)).toEqual({ kind: 'refused', why: 'network' });
    expect(await requestPasswordReset('a@b.co', rejects({ status: 503 }), served)).toEqual({ kind: 'refused', why: 'unavailable' });
    expect(await requestPasswordReset('a@b.co', rejects({ status: 403 }), served)).toEqual({ kind: 'refused', why: 'unavailable' });
    expect(await requestPasswordReset('a@b.co', rejects({ status: 400, code: 'VALIDATION_ERROR' }), served)).toEqual({ kind: 'refused', why: 'address' });
  });

  it('a framed page and a refused API base are named, and no message leaves the outcome', async () => {
    const framed = await requestPasswordReset('a@b.co', rejects({ status: 403, code: 'FRAMED_ACTION_REFUSED', message: 'secret words' }), served);
    expect(framed).toEqual({ kind: 'refused', why: 'framed' });
    expect(await requestPasswordReset('a@b.co', rejects({ status: 0, code: 'BAD_API_BASE' }), served)).toEqual({ kind: 'refused', why: 'no-api' });
    expect(JSON.stringify(framed)).not.toContain('secret');
  });
});
