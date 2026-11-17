// What a Files launch's words may say: four facts kept apart, and observations only.
//   - Admitted: "accepted … waiting for it to start". Process: "is running", "ended with code N", "didn't start".
//     Window (screen only): "has a window on the display". File opened: no route can prove it, so it is never claimed;
//     a running row says "started with ‹file›".
//   - A file-opening verb appears only hedged ("may have passed … to"), and only in the hand-off words.
//   - 126 and 127 can come from the program, bash's exec or the tracking helper: always "usually", never a cause.
// One table (wordsFor) for the drawer, the Board tile and the Programs > Apps row, so they say the same sentence.
import type { RunResult } from '@core';
import { makeT } from '@kit';
import type { OpenApp } from '../../logic';
import strings from './strings.en.json';

/** The words keys that may hedge a hand-off ("may have passed ‹file› to"): the only ones a lint lets say it. */
export const HANDOFF_KEYS: readonly string[] = ['w.handoff', 'r.handoffAgain'];

const PROOF: ReadonlySet<string> = new Set(['running', 'ready', 'exited', 'stopped', 'not_started']);
/** Evidence that names this launch: a record carrying the expected tag that shows it running, ready, ended or
 *  never started, or its terminal replaced. A record of another launch (foreign_record), a transient answer or a
 *  result whose handle names another tag proves nothing. */
export function proves(r: RunResult, tag: string): boolean {
  if (r.transient || r.reason === 'foreign_record') return false;
  if (r.handle?.launch_tag !== tag) return false;
  return (!!r.state && PROOF.has(r.state)) || r.code === 'terminal_replaced';
}

/** A row name "‹Program› · ‹file›" in its two parts. */
export function namesOf(name: string): { p: string; file: string } {
  const i = name.indexOf(' · ');
  return i < 0 ? { p: name, file: '' } : { p: name.slice(0, i), file: name.slice(i + 3) };
}

export interface Words {
  key: string;
  vars: Record<string, string | number>;
}
type Row = Pick<OpenApp, 'name' | 'state' | 'opensIn'> & Partial<Pick<OpenApp, 'code' | 'exitCode' | 'signal'>>;

/**
 * The sentence for a Files launch's row. `ready`: a window was read this session (an ended screen program
 * that never showed one may have handed the file to a copy already running). `exec`: this key may still start
 * programs (an unconfirmed start after it lost that says so).
 */
export function wordsFor(r: Row, o: { ready?: boolean; exec?: boolean } = {}): Words {
  const { p, file } = namesOf(r.name);
  const w = (key: string, more: Record<string, string | number> = {}): Words => ({ key, vars: { p, file, ...more } });
  const screen = r.opensIn === 'screen';
  switch (r.state) {
    case 'starting':
      return w('w.opening');
    case 'started':
      return w('w.started');
    case 'running':
      return w(screen ? 'w.runningScreen' : 'w.running');
    case 'ready':
      return w('w.ready');
    case 'stopped':
      return w('w.stopped');
    case 'exited': {
      if (r.signal === 'SIGINT' || r.signal === 'SIGTERM') return w('w.stopped');
      if (r.signal) return w('w.signal', { sig: r.signal });
      if (r.exitCode === 0) return w(!screen ? 'w.finished' : o.ready ? 'w.closed' : 'w.handoff');
      if (r.exitCode === 127) return w('w.code127');
      if (r.exitCode === 126) return w('w.code126');
      if (r.exitCode === 125) return w('w.code125');
      return typeof r.exitCode === 'number' ? w('w.code', { n: r.exitCode }) : w('w.endedNoCode');
    }
    case 'not_started':
      switch (r.code) {
        case 'exec_off':
        case 'access_refused':
          return w('w.execOff');
        case 'not_durable':
          return w('w.notDurable');
        case 'shell_unavailable':
          return w('w.noBash');
        case 'warming_manual':
          return w('w.warming');
        default:
          return w('w.notStarted');
      }
    default:
      if (r.code === 'checking') return w('w.checking');
      if (r.code === 'foreign_record') return w('w.foreign');
      if (o.exec === false && (r.code === 'start_unconfirmed' || r.code === 'access_refused')) return w('w.execLost');
      return w('w.unknown');
  }
}

const t = makeT(strings);
/** The sentence of a words key. */
export const owText = (w: Words): string => t(w.key as keyof typeof strings, w.vars);
