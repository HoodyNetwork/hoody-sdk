// Every request the Notes page may send, declared once (a closed table). They go to
// the Notes program of a computer (kit 'notes', index 1); nothing carries credentials. A change is sent once and
// never resent; a lost answer is read back. `remove` deletes one note for good (Notes keeps no bin): sent once from the
// page's confirm (remove.ts), never with a body.
import { defineRoute } from '@core';
import { createGuard } from './logic';

const KIB = 1024;
const notes = { scope: 'kit', kit: 'notes', index: 1 } as const;
const P = '/api/v1/notes';

export const routes = {
  caps: defineRoute({ method: 'GET', path: `${P}/capabilities`, ...notes, maxBytes: 16 * KIB, timeoutMs: 15000 }),
  me: defineRoute({ method: 'GET', path: `${P}/me`, ...notes, maxBytes: 16 * KIB, timeoutMs: 15000 }),
  recent: defineRoute({
    method: 'GET',
    path: `${P}/notebooks/:nb/recent`,
    ...notes,
    query: ['limit'],
    maxBytes: 128 * KIB,
    timeoutMs: 15000,
    guard: (c) => /^(?:[1-9]|1[0-9]|20)$/.test(c.query.limit ?? ''),
  }),
  node: defineRoute({ method: 'GET', path: `${P}/notebooks/:nb/nodes/:id`, ...notes, maxBytes: 64 * KIB, timeoutMs: 15000 }),
  document: defineRoute({
    method: 'GET',
    path: `${P}/notebooks/:nb/nodes/:id/document`,
    ...notes,
    query: ['output'],
    maxBytes: 5 * KIB * KIB,
    timeoutMs: 15000,
    guard: (c) => c.query.output === 'md',
  }),
  create: defineRoute({
    method: 'POST',
    path: `${P}/notebooks/:nb/nodes`,
    ...notes,
    body: ['id', 'type', 'parentId', 'attributes'],
    maxBytes: 16 * KIB,
    timeoutMs: 15000,
    guard: (c) => createGuard(c.body),
  }),
  remove: defineRoute({ method: 'DELETE', path: `${P}/notebooks/:nb/nodes/:id`, ...notes, maxBytes: 16 * KIB, timeoutMs: 15000 }),
} as const;
