// Every request the Tunnels page may send, declared once. They go to the tunnel program of the computer (kit
// 'tunnel', index 1: `<project>-<computer>-tunnel-1`, the same address the CLI uses); kit calls carry no
// credentials. Only what hoody-tunnel serves today: its `/metrics` repeats
// these counts as Prometheus text, so the page does not read it. The one change is Disconnect (DELETE a session).
import { defineRoute } from '@core';

const KIB = 1024;
const MIB = 1024 * KIB;
const tunnel = { scope: 'kit', kit: 'tunnel', index: 1 } as const;
const P = '/api/v1/tunnel';

export const routes = {
  /** Sessions with their EXPOSE and PULL bindings, stream counts and the orphan count. */
  tunnels: defineRoute({ method: 'GET', path: `${P}/tunnels`, ...tunnel, maxBytes: MIB, timeoutMs: 15000 }),
  /** Adds each session's most streams at once. */
  sessions: defineRoute({ method: 'GET', path: `${P}/sessions`, ...tunnel, maxBytes: MIB, timeoutMs: 15000 }),
  /** Every listener with its owning session, also those held while a laptop reconnects. */
  bindings: defineRoute({ method: 'GET', path: `${P}/bindings`, ...tunnel, maxBytes: MIB, timeoutMs: 15000 }),
  /** The program is up, and since when. */
  health: defineRoute({ method: 'GET', path: `${P}/health`, ...tunnel, maxBytes: 64 * KIB, timeoutMs: 15000 }),
  /** Ends one session and everything it shares: 202 = closing started, 404 SESSION_NOT_FOUND = no
   *  such session. The kit answers after its orphan sweep (about a second), so the bound is generous. */
  disconnect: defineRoute({ method: 'DELETE', path: `${P}/sessions/:id`, ...tunnel, codes: ['SESSION_NOT_FOUND'], maxBytes: 64 * KIB, timeoutMs: 15000 }),
} as const;
