// The computer a kit change or read is for, and the core target it is sent to. Moved here from the computers page
// (pages/computers/data.ts) so a page that is not the computers page (Files, with Storage) names a computer the same
// way: one copy, the same refusal when the server is unknown.
import { routingNode } from '../hosts';

/** The computer a change or kit read is for, with the server its agent lives on. */
export interface Subject { id: string; project: string; server: string }

/** A computer row (the API's shape) → its Subject. */
export const subjectOf = (c: { id: string; project_id: string; server_name?: string }): Subject => ({ id: c.id, project: c.project_id, server: routingNode(c) });

/** Refuses (throws: the change is not sent) when the computer's server is unknown: never falls back to the top bar's computer. */
export function targetOf(c: Subject) {
  if (!c.id || !c.project || !c.server) throw new Error('NO_TARGET');
  return { project: { id: c.project }, container: { id: c.id, server_name: c.server } };
}
