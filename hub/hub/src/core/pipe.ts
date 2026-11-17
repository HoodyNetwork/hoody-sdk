// pipe.ts: the declared routes of a computer's Hoody Pipe program, for the Board's live broadcast.
//
// Contract, in plain words:
//   - One pipe name per route call (`:name`, one path segment: never '/', '%', '.' or '..', see routes.ts).
//   - status: GET `?status=1` (with `transfer=<id>` for one transfer) → the pipe's status JSON.
//   - progress: GET `?progress=1` as an SSE stream (kit-io stream()); its events (`state`, `progress`, `done`) carry
//     `activeReceivers`, and `live: true` on a live stream. The budget ends a long stream; the caller opens it again.
//   - live: POST `?live=1&transfer=<id>` through kit-io upload(): the broadcast itself, one streaming body that
//     ends when the sender ends, keyed (senderKey: every send carries the Start's own sender key, which holds the
//     name for that sender; a send without it is refused before it leaves). Never retried: a new Start is a new POST.
//   - Every route is kit-scoped (credentials omit) and goes to the computer's own pipe host; the viewer link is never
//     this host (it holds the computer's ids): pages hand out a pinned proxy alias instead.
import { defineRoute } from './routes';

const PATH = '/api/v1/pipe/:name';

export const pipeRoutes = Object.freeze({
  status: defineRoute({ method: 'GET', path: PATH, scope: 'kit', kit: 'pipe', index: 1, query: ['status', 'transfer'], maxBytes: 16384, timeoutMs: 15000 }),
  progress: defineRoute({ method: 'GET', path: PATH, scope: 'kit', kit: 'pipe', index: 1, query: ['progress'], stream: { id: 4096, noId: 4096 }, maxBytes: 4 << 20, timeoutMs: 15000 }),
  live: defineRoute({ method: 'POST', path: PATH, scope: 'kit', kit: 'pipe', index: 1, query: ['live', 'transfer'], upload: true, senderKey: true, maxBytes: 65536 }),
});
