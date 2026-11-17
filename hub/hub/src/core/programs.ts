// programs.ts: the computer daemon's program routes and the one way to build a program change, shared by the
// Programs page and the Computers Programs tab.
//
// Contract, in plain words:
//   - programRoutes is the one table of daemon program routes (kit 'daemon', program index 1). A route's body is an
//     allowlist: start accepts if_not_running for the pages that send it; nobody else has to.
//   - programOp(o) builds a start, stop, restart or boot the same way on every page: the shared lock name
//     (programLock), the lock identity and the body. So a change held on one page holds the same press on the
//     other, and one key never spans two bodies.
//   - A restart is idempotent (Idempotency-Key); its receipt (GET by key) is the one proof that a held restart
//     applied.
import { defineRoute } from './routes';

const DMN = '/api/v1/daemon';
/** The daemon's program overview answer: the page parses it (core keeps it opaque). */
export type ProgramOverviewWire = unknown;
/** The daemon's RestartAnswer, the fields a page reads. */
export interface ProgramRestartReceipt { success?: boolean; code?: string | null; state?: string | null; outcome?: string | null }

export const programRoutes = {
  overview: defineRoute<ProgramOverviewWire>({ method: 'GET', path: `${DMN}/programs/overview`, scope: 'kit', kit: 'daemon', index: 1 }),
  start: defineRoute({ method: 'POST', path: `${DMN}/programs/:id/start`, scope: 'kit', kit: 'daemon', index: 1, body: ['port', 'wait', 'timeout', 'if_not_running'], timeoutMs: 60000 }),
  stop: defineRoute({ method: 'POST', path: `${DMN}/programs/:id/stop`, scope: 'kit', kit: 'daemon', index: 1, body: ['port', 'all'] }),
  restart: defineRoute({ method: 'POST', path: `${DMN}/programs/:id/restart`, scope: 'kit', kit: 'daemon', index: 1, body: ['port', 'all', 'wait', 'timeout'], idem: true, timeoutMs: 60000 }),
  restartReceipt: defineRoute<ProgramRestartReceipt>({ method: 'GET', path: `${DMN}/programs/:id/restart`, scope: 'kit', kit: 'daemon', index: 1, query: ['key'] }),
  boot: defineRoute({ method: 'POST', path: `${DMN}/programs/:id/boot`, scope: 'kit', kit: 'daemon', index: 1, body: ['boot'] }),
  tempStop: defineRoute({ method: 'POST', path: `${DMN}/quick-start/:id/stop`, scope: 'kit', kit: 'daemon', index: 1 }),
} as const;

export type ProgramAct = 'start' | 'stop' | 'restart' | 'boot';

export interface ProgramOpInput {
  /** The daemon's program id (decimal string). */
  id: string;
  act: ProgramAct;
  /** One part of a range program, or null for the whole program. */
  port: number | null;
  /** A port-range program: a whole stop or restart covers every part (`all`). */
  range: boolean;
  /** The boot switch's new value (boot only). */
  boot?: boolean;
}

export interface ProgramOp {
  /** The shared change lock (core): the same name on both pages. */
  lock: string;
  /** The lock identity (lockKey): the same press on either page is the same change. */
  identity: Record<string, unknown>;
  /** The request body. */
  body: Record<string, unknown>;
}

/** The shared change lock of each program action (core): the same names on both pages. */
export const programLock: Readonly<Record<ProgramAct, string>> = {
  start: 'daemon.program.start',
  stop: 'daemon.program.stop',
  restart: 'daemon.program.restart',
  boot: 'daemon.program.boot',
};

/** One program change (start, stop, restart, boot), built the same way by every page that sends it: so a change
 * held on one page holds the same press on the other, and a key never spans two bodies. */
export function programOp(o: ProgramOpInput): ProgramOp {
  const port = o.port ?? null;
  const all = o.range && port === null && (o.act === 'stop' || o.act === 'restart');
  const at = port === null ? {} : { port };
  switch (o.act) {
    case 'start':
      return { lock: programLock.start, identity: { id: o.id, port }, body: { ...at, wait: true } };
    case 'stop':
      return { lock: programLock.stop, identity: { id: o.id, port, all }, body: { ...at, ...(all ? { all: true } : {}) } };
    case 'restart':
      return { lock: programLock.restart, identity: { id: o.id, port, all }, body: { ...at, ...(all ? { all: true } : {}), wait: true } };
    case 'boot':
      return { lock: programLock.boot, identity: { id: o.id, boot: !!o.boot }, body: { boot: !!o.boot } };
  }
}
