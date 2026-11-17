// The Support page's routes: the member ops of the API's
// support routes only, never a /staff or /admin route. Every path is the account's own: base host in
// every realm view, refused unsent in a token session (core/api.ts BASE_ONLY). Each route lists every code its schema
// publishes; a 429 is read by its status. Create and reply carry the attempt's
// `client_key` in the body (one key per attempt, never reused as a check). Close sends no body.
import { defineRoute } from '@core';

const ANY403 = ['SUPPORT_NOT_FOR_ACCOUNT', 'INSUFFICIENT_PERMISSIONS'] as const;
const RATE = ['RATE_LIMIT_EXCEEDED'] as const;
const WRITE503 = ['SUPPORT_BUSY', 'SUPPORT_STORAGE_FULL', 'SUPPORT_UNAVAILABLE'] as const;

export const routes = {
  list: defineRoute({
    method: 'GET',
    path: '/support/tickets',
    scope: 'base',
    query: ['status', 'cursor', 'limit'],
    codes: ['SUPPORT_FIELD_INVALID', ...ANY403, 'INVALID_CURSOR', ...RATE, 'SUPPORT_UNAVAILABLE'],
  }),
  /** The ticket and one page of its messages, newest first. Without before_seq it is the latest page, which marks the
   *  ticket read on the server. */
  get: defineRoute({
    method: 'GET',
    path: '/support/tickets/:id',
    scope: 'base',
    query: ['before_seq', 'limit'],
    codes: ['SUPPORT_FIELD_INVALID', ...ANY403, 'SUPPORT_TICKET_NOT_FOUND', ...RATE, 'SUPPORT_UNAVAILABLE'],
  }),
  create: defineRoute({
    method: 'POST',
    path: '/support/tickets',
    scope: 'base',
    body: ['subject', 'category', 'body', 'client_key'],
    codes: ['SUPPORT_FIELD_INVALID', 'SUPPORT_TEXT_INVALID', ...ANY403, 'SUPPORT_QUOTA_REACHED', 'SUPPORT_IDEMPOTENCY_CONFLICT', 'SUPPORT_DUPLICATE', ...RATE, ...WRITE503],
  }),
  reply: defineRoute({
    method: 'POST',
    path: '/support/tickets/:id/messages',
    scope: 'base',
    body: ['body', 'client_key'],
    codes: [
      'SUPPORT_FIELD_INVALID', 'SUPPORT_TEXT_INVALID', ...ANY403, 'SUPPORT_TICKET_NOT_FOUND', 'SUPPORT_QUOTA_REACHED', 'SUPPORT_TICKET_LIMIT',
      'SUPPORT_TICKET_FULL', 'SUPPORT_TICKET_EXPIRED', 'SUPPORT_IDEMPOTENCY_CONFLICT', 'SUPPORT_DUPLICATE', ...RATE, ...WRITE503,
    ],
  }),
  /** Answers 200 with the ticket itself. A repeat changes nothing on the server. */
  close: defineRoute({
    method: 'POST',
    path: '/support/tickets/:id/close',
    scope: 'base',
    codes: ['SUPPORT_FIELD_INVALID', ...ANY403, 'SUPPORT_TICKET_NOT_FOUND', ...RATE, ...WRITE503],
  }),
  limits: defineRoute({ method: 'GET', path: '/support/limits', scope: 'base', codes: ['SUPPORT_FIELD_INVALID', ...ANY403, ...RATE, 'SUPPORT_UNAVAILABLE'] }),
} as const;
