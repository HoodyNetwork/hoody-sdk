// retryWords.ts: how the one-file sign-in card says a wait, in one place for sign-in, forgot password, sign-up,
// "Send the email again" and the pasted access key: under two minutes in seconds; then whole minutes, rounded up; no wait named, or one beyond
// two hours (nobody counts 1440 minutes), is the one sentence that promises no time.
export type RetryWords =
  | { key: 'pw.err.retryLater' }
  | { key: 'pw.err.retryOne' }
  | { key: 'pw.err.retry'; vars: { s: number } }
  | { key: 'pw.err.retryMinutes'; vars: { m: number } };

export function retryWords(retryAfter: number | undefined): RetryWords {
  // Safe on its own: anything that is not a positive, finite number of seconds names no wait.
  if (typeof retryAfter !== 'number' || !Number.isFinite(retryAfter) || retryAfter <= 0 || retryAfter > 7200) return { key: 'pw.err.retryLater' };
  if (retryAfter >= 120) return { key: 'pw.err.retryMinutes', vars: { m: Math.ceil(retryAfter / 60) } };
  const s = Math.ceil(retryAfter);
  // One second is said in the singular.
  return s === 1 ? { key: 'pw.err.retryOne' } : { key: 'pw.err.retry', vars: { s } };
}
