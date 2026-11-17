// The error codes the agent documents for each journaled POST: the agent's openapi.json
// (its published API description) → src/ask/accept/agent-codes.json. `scanCodes` is pure; src/ask/accept/openapi-codes.gen.test.ts
// fails when the committed file no longer matches a fresh run on the pinned input, and `bun hub/scripts/openapi-codes-gen.ts
// <agent openapi.json>` writes the file.
//
// The scan: for each of the five journaled operations (operationId by route), every lowercase snake_case token
// (`[a-z][a-z0-9]*(_[a-z0-9]+)+`) in the operation object's JSON text (summary, description, parameters, request body,
// responses), sorted and de-duplicated. A word with no underscore is never listed. The output keeps the shape
// `{ _about, ops: { <route>: { operationId, codes } } }`; `_about` names this script and the input's sha256.
// Fails closed: a missing operation, or one operationId under two paths, throws and nothing is written.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The journaled routes and the agent operation each one posts. */
export const JOURNALED_OPS = {
  create: 'createSession',
  turn: 'createSessionTurn',
  command: 'postSessionCommand',
  confirm: 'confirmGate',
  answer: 'answerQuestion',
} as const;
const TOKEN = /[a-z][a-z0-9]*(?:_[a-z0-9]+)+/g;

export type CodesFile = { _about: string; ops: Record<string, { operationId: string; codes: string[] }> };

/** The snake_case tokens of one operation object, sorted. */
export function codesOf(op: unknown): string[] {
  return [...new Set(JSON.stringify(op).match(TOKEN) ?? [])].sort();
}

/** The committed file's content for an agent openapi (parsed) whose bytes hash to `inputSha`. */
export function scanCodes(spec: unknown, inputSha: string): CodesFile {
  const paths = (spec as { paths?: Record<string, Record<string, unknown>> } | null)?.paths;
  if (!paths || typeof paths !== 'object') throw new Error('openapi-codes-gen: the openapi has no paths object');
  const byId = new Map<string, unknown[]>();
  for (const item of Object.values(paths)) {
    for (const op of Object.values(item ?? {})) {
      const id = (op as { operationId?: unknown } | null)?.operationId;
      if (typeof id === 'string') byId.set(id, [...(byId.get(id) ?? []), op]);
    }
  }
  const ops: CodesFile['ops'] = {};
  for (const [route, operationId] of Object.entries(JOURNALED_OPS)) {
    const found = byId.get(operationId);
    if (!found || found.length !== 1) throw new Error(`openapi-codes-gen: operationId ${operationId} (${route}) is ${found ? 'on several paths' : 'missing'}`);
    ops[route] = { operationId, codes: codesOf(found[0]) };
  }
  return {
    _about: `The error codes the agent documents for each journaled POST, scanned by hub/scripts/openapi-codes-gen.ts from the agent's openapi.json (sha256 ${inputSha}): every snake_case token of the operation. Regenerate with that script when the spec is bumped.`,
    ops,
  };
}

/** The committed file's exact text. */
export const render = (f: CodesFile): string => JSON.stringify(f, null, 1);
export const sha256 = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CODES_FILE = path.join(HERE, '..', 'src', 'ask', 'accept', 'agent-codes.json');

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2];
  if (!input) throw new Error('usage: bun hub/scripts/openapi-codes-gen.ts <agent openapi.json>');
  const bytes = fs.readFileSync(input);
  fs.writeFileSync(CODES_FILE, render(scanCodes(JSON.parse(bytes.toString('utf8')), sha256(bytes))));
  console.log(`openapi-codes-gen: wrote ${path.relative(process.cwd(), CODES_FILE)}`);
}
