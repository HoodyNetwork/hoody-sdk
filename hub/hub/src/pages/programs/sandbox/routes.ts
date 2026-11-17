// The daemon routes the sandbox panel and New program use (the daemon's openapi: getProgramSandbox, getProgram, editProgram,
// health, addProgram, quickStart), on the computer's daemon (program index 1), like core's programRoutes.
import { defineRoute } from '@core';

const DMN = '/api/v1/daemon';

export const sandboxRoutes = {
  /** Diagnostic status of one program's sandbox. Holds no secret (paths, ports, rules). */
  status: defineRoute({ method: 'GET', path: `${DMN}/programs/:id/sandbox`, scope: 'kit', kit: 'daemon', index: 1 }),
  /** The host's sandbox parts are under `sandbox`; nothing secret in the answer. */
  health: defineRoute({ method: 'GET', path: `${DMN}/health`, scope: 'kit', kit: 'daemon', index: 1 }),
  /** One program, environment values and webhook headers included: secret, read only through a scrub that keeps
   *  facts (form.ts factsOf), never through a cached query. */
  program: defineRoute({ method: 'GET', path: `${DMN}/programs/:id`, scope: 'kit', kit: 'daemon', index: 1, secret: true }),
  /** The edit. Two senders, each with its own keys: the sandbox save sends only `sandbox` (the whole block or null,
   *  data.ts), Edit sends only the changed ones of `name` and `command` (parts/edit.ts); a key left out keeps its
   *  stored value. Not secret, so the daemon's refusal text survives (it names fields, paths and variable NAMES,
   *  never values); its 2xx answer carries the whole program, which neither sender reads. The apply can run the
   *  process manager synchronously: 60 s like start and restart. */
  edit: defineRoute({ method: 'POST', path: `${DMN}/programs/edit/:id`, scope: 'kit', kit: 'daemon', index: 1, body: ['sandbox', 'name', 'command'], timeoutMs: 60000 }),
  /** New program (addProgram), the New program drawer's keep. No idempotency key: the program name is unique on
   *  the computer, so sending it again can never make a second one. Not secret, so the daemon's refusal text
   *  survives (add.ts passes no core scrub, which would make the call secret); its 2xx answer, the whole program, is read
   *  for its id and name only and emptied in place (add.ts).
   *  An enabled program that starts with the computer is applied during the call: 60 s like start. Advanced and the
   *  sandbox add their fields; the environment's values ride the body only: a refusal text that holds one is
   *  withheld by add.ts (advanced.ts shownText), and core logs no request or rejection. */
  add: defineRoute({ method: 'POST', path: `${DMN}/programs/add`, scope: 'kit', kit: 'daemon', index: 1, body: ['name', 'command', 'user', 'autorestart', 'boot', 'ready_port', 'port_range', 'port_param', 'description', 'directory', 'environment', 'delay_seconds', 'logs_enabled', 'log_max_bytes', 'log_backups', 'sandbox'], timeoutMs: 60000 }),
  /** Run once (quickStart): a temporary program, started at once. No idempotency key and never retried (a lost
   *  start answers 502); every answer after it was created carries its temporary_id. */
  quickStart: defineRoute({ method: 'POST', path: `${DMN}/quick-start`, scope: 'kit', kit: 'daemon', index: 1, body: ['name', 'command', 'user', 'autorestart'], timeoutMs: 60000 }),
} as const;
