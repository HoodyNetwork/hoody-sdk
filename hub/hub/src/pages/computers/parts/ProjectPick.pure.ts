// Which project a new computer goes into, the pure rules (split out of ProjectPick.tsx so the terminal build shares
// them; ProjectPick.tsx re-exports every name here).
import type { OutcomeLike } from '@kit';
import type { Project } from '../types';

export type ProjectState = 'unread' | 'loading' | 'none' | 'ok' | 'pick';
/** own: in All realms, the source's own project when the read does not list it (offered beside the listed ones).
 *  outside: the pick is owed because the source's own project is not in the shown realm (not because a picked project
 *  dropped off the list). */
export interface RealmProject { listed: Project[]; dest: string; state: ProjectState; own?: string; outside?: boolean }

/** wanted: the project picked (the source's own until another is picked); source: the source computer's project. */
export function realmProject(projects: Project[] | undefined, error: unknown, busy: boolean | undefined, wanted: string, shownRealm: string, source: string): RealmProject {
  const listed = projects ?? [];
  const isListed = (id: string) => listed.some((p) => p.id === id);
  if (shownRealm === 'all') {
    const own = source !== '' && !isListed(source) ? source : undefined;
    // The source's own project needs no listing; a picked one that the list no longer holds owes a pick again.
    if (wanted !== '' && (wanted === source || (projects !== undefined && !busy && error == null && isListed(wanted)))) return { listed, dest: wanted, state: 'ok', own };
    const state: ProjectState = error != null ? 'unread' : projects === undefined || busy ? 'loading' : listed.length === 0 && !own ? 'none' : 'pick';
    return { listed, dest: '', state, own };
  }
  const dest = isListed(wanted) ? wanted : '';
  const state: ProjectState = error != null ? 'unread' : projects === undefined || busy ? 'loading' : listed.length === 0 ? 'none' : dest ? 'ok' : 'pick';
  return { listed, dest, state, outside: state === 'pick' && source !== '' && wanted === source };
}

/** A copy's 403 INSUFFICIENT_PERMISSIONS while one realm is shown. The code does not say which rule refused it (the
 *  project or the source computer outside the realm, or this login's permissions), so the page adds a note naming
 *  them beside the kit's own refusal line; in All realms the kit's line alone. */
export const realmRefused = (o: OutcomeLike | undefined, shownRealm: string): boolean =>
  !!o && o.kind === 'failed' && o.code === 'INSUFFICIENT_PERMISSIONS' && shownRealm !== 'all';
