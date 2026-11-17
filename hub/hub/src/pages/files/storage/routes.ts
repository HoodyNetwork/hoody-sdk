// The remote-storage requests of the computers page, declared once: the computer's files program
// (kit 'files', port 1, the same address as programUrl(c, 'files')) keeps remote storage connections ("backends")
// and mounts them as folders. One read goes to the API instead: the computer's stats (`stats`, the same read as the
// computer page's usage), for the computer's own disk in Files' glance. Nothing else leaves this folder. None of these routes takes an idempotency key, so a
// lost answer is read back through the lists, never sent again. Keys, passwords and tokens ride only the connect body, which
// core treats as secret (scrubbed answers, never stored, never logged).
import { defineRoute } from '@core';
import { BODY_KEYS, SECRET_KEYS } from './providers';

const kit = { scope: 'kit', kit: 'files', index: 1 } as const;

export const storageRoutes = {
  backends: defineRoute({ method: 'GET', path: '/api/v1/backends', ...kit }),
  connect: defineRoute({ method: 'POST', path: '/api/v1/backends/:type', ...kit, body: [...BODY_KEYS], secret: [...SECRET_KEYS], timeoutMs: 60_000 }),
  test: defineRoute({ method: 'GET', path: '/api/v1/backends/:id/test', ...kit, timeoutMs: 40_000 }),
  // Removing closes the storage's folders one by one; a folder opened elsewhere meanwhile can refuse after others were
  // closed (the files program's removal: the closed ones stay closed, the storage stays): a definite refusal of the
  // removal, which the page words as such (StorageTab REMOVE_PARTIAL) and follows with fresh lists.
  remove: defineRoute({ method: 'DELETE', path: '/api/v1/backends/:id', ...kit, query: ['uploads'] }),
  mounts: defineRoute({ method: 'GET', path: '/api/v1/mounts', ...kit }),
  mount: defineRoute({ method: 'POST', path: '/api/v1/mounts', ...kit, body: ['backend_id', 'mount_path', 'label'], timeoutMs: 60_000 }),
  unmount: defineRoute({ method: 'DELETE', path: '/api/v1/mounts/:id', ...kit, query: ['uploads'], timeoutMs: 60_000 }),
  // Files not yet in the storage ("pending uploads"): listed, their files paged and downloaded (reads), and
  // delivered, stopped or discarded (changes, each sent once and read back through the list).
  held: defineRoute({ method: 'GET', path: '/api/v1/pending-uploads', ...kit }),
  heldFiles: defineRoute({ method: 'GET', path: '/api/v1/pending-uploads/:id/files', ...kit, query: ['cursor', 'limit'] }),
  // Bounded like the page's own download (data.ts HELD_FILE_MAX): the browser holds the file whole before saving it.
  heldFile: defineRoute({ method: 'GET', path: '/api/v1/pending-uploads/:id/file', ...kit, query: ['path_b64'], timeoutMs: 120_000, maxBytes: 256 * 1024 * 1024 }),
  // No body: every complete file of the item, with its saved connection settings.
  deliver: defineRoute({ method: 'POST', path: '/api/v1/pending-uploads/:id/deliver', ...kit }),
  // A busy answer to a stop may come after its cancel began (the files program's stop: the upload process has
  // not confirmed its exit), and a not-found one after the stop itself, when the upload ended meanwhile and left nothing
  // held (its stop reads the item back after stopping): both unknown, held until a fresh list shows the
  // item pending, or gone (the band says so). Deliver and discard refuse with these codes before any effect, so only
  // this route lists them (core: a listed code is under way on a 404 or a 409).
  stopHeld: defineRoute({ method: 'POST', path: '/api/v1/pending-uploads/:id/stop', ...kit, unknownCodes: ['PENDING_UPLOAD_BUSY', 'PENDING_UPLOAD_NOT_FOUND'] }),
  discard: defineRoute({ method: 'DELETE', path: '/api/v1/pending-uploads/:id', ...kit }),
  // The computer's stats from the API (a read): Files reads only its root disk's use and size from it.
  stats: defineRoute({ method: 'GET', path: '/computers/:id/stats', scope: 'realm' }),
} as const;
