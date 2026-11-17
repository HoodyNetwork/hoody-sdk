// Shared readings of a computer's agent refusals, for every page that reads the agent (Schedules, Bots).
//
// agentSignedOut(e): the agent answered restriction_unknown. It can't tell which realms its platform login may use,
// which in practice means that login is gone (a sign-out everywhere revokes it too), so it refuses realm reads
// rather than guess. Pages say "the agent on this computer is signed out" and offer to sign it in again; never
// "can't be read right now", which reads like an outage.
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export function agentSignedOut(e: unknown): boolean {
  return rec(e).code === 'restriction_unknown';
}
