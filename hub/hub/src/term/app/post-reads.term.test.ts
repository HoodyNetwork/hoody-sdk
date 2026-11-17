// post-reads.ts: the POSTs that only read, pinned to the page routes that send them.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Each listed entry is exactly one page route, and each of those routes is a POST read | 'every entry is a page route' |
// | 2 | Anything else (another POST, a GET marked a change, a lookalike object, a non-object) is not one | 'nothing else is a read' |
import { expect, test } from 'bun:test';
import { defineRoute } from '../../core/routes';
import { routes as scripts } from '../../pages/scripts/routes';
import { routes as logs } from '../../pages/logs/routes';
import { memoryRoutes } from '../../pages/ai/knowledge/memory/data';
import { mcpRoutes } from '../../pages/ai/settings/connections/mcp.routes';
import { isPostRead, POST_READ_KEYS } from './post-reads';

test('every entry is a page route', () => {
  const pinned = [scripts.resolve, scripts.validate, scripts.commentsParse, scripts.commentsPrint, logs.runOutput, memoryRoutes.search, mcpRoutes.parse];
  for (const r of pinned) expect(isPostRead(r), r.path).toBe(true);
  expect(POST_READ_KEYS.length).toBe(pinned.length);
});

test('nothing else is a read', () => {
  expect(isPostRead(scripts.commentsDry)).toBe(false);
  expect(isPostRead(mcpRoutes.enable)).toBe(false);
  expect(isPostRead(memoryRoutes.search.path)).toBe(false);
  expect(isPostRead(null)).toBe(false);
  // Same path on another leg, or another method: a change.
  expect(isPostRead(defineRoute({ method: 'POST', path: '/memory/search', scope: 'base' }))).toBe(false);
  expect(isPostRead(defineRoute({ method: 'PUT', path: '/memory/search', scope: 'agent', realm: 'realm' }))).toBe(false);
  // The same route taking another body key (validate's opt-in typecheck may install a package), fewer keys, or none: a change.
  expect(isPostRead(defineRoute({ method: 'POST', path: '/api/v1/exec/validate/script', scope: 'kit', kit: 'exec', index: 1, body: ['code', 'language', 'typecheck'] }))).toBe(false);
  expect(isPostRead(defineRoute({ method: 'POST', path: '/api/v1/exec/validate/script', scope: 'kit', kit: 'exec', index: 1, body: ['code'] }))).toBe(false);
  expect(isPostRead(defineRoute({ method: 'POST', path: '/api/v1/exec/validate/script', scope: 'kit', kit: 'exec', index: 1 }))).toBe(false);
});
