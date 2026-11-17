// Which message task is open (split out of MessageTask.tsx so the terminal build shares it; MessageTask.tsx re-exports it).
import type { Delegate } from '../data';

/**
 * Owns the change of one task's message and is keyed by the task, so a message left unresolved about one task is that task's state only:
 * another task's form mounts fresh.
 */
/** The task the form is open on: the address names it and it is still a running task of the Bot; any other value opens no form. */
export function openTaskOf(param: string | undefined, tasks: readonly Delegate[]): Delegate | undefined {
  return param ? tasks.find((d) => d.sessionId === param && d.state !== 'closed') : undefined;
}
