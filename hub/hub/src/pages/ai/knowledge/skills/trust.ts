// Skill trust: trusting or no longer trusting one installed skill, apart from its on/off.
//
// What the agent does (hoody-agent POST /skills/trust, daemon skills.set_trust):
//   - the skill is named by its root folder and its folder under it (root_dir + rel_dir);
//   - only an installed skill has trust to set: one made here (no record) is refused 404 not_found, nothing written;
//   - a grant records the digests of the skill's files as they are on disk when the agent applies it. With
//     verify_unchanged it is refused (400, nothing written) when those files differ from the bytes recorded at install,
//     so the grant covers exactly what the list showed for a skill that had not changed;
//   - a lost answer, or a 5xx (a store write that may have landed), is unknown: never sent again on its own (C9). It stays
//     held until a fresh list of the same computer and realm shows the skill at the trust sent, or the person dismisses it.
// The change shares the list's read (source 'ai-skills', read 'skills'), so its read-back re-reads the list the page shows.
import { coreSource, defineRoute, useRunner, type HeldChange, type SourceTable, type Target } from '@core';
import { useCallback } from 'react';
import { skillsTable, type SkillsAt } from './data';
import type { SkillList, SkillRow } from './logic';

export const SKILL_TRUST_LOCK = 'agent.skill_trust';

export const trustRoute = defineRoute<unknown, { root_dir: string; rel_dir: string; trusted: boolean; verify_unchanged?: boolean }>({
  method: 'POST',
  path: '/skills/trust',
  scope: 'agent',
  realm: 'realm',
  body: ['root_dir', 'rel_dir', 'trusted', 'verify_unchanged'],
  // Refused before any write: not_found (no such skill, a skill made here, a realm this login does not serve) and
  // service_unavailable (the agent too busy to take it). A 400 is a refusal too (every 4xx is).
  refuses: ['not_found', 'service_unavailable'],
});

/** One trust change: the skill (its folder, and the two parts the agent names it by), the value, where it goes. */
export interface TrustVars extends SkillsAt {
  dir: string;
  rootDir: string;
  relDir: string;
  trusted: boolean;
  /** Grant only: refuse when the files differ from the installed bytes. */
  verify: boolean;
}

/** What a held trust change shows and its proof reads. */
export interface TrustIdentity {
  computer: string;
  realm: string;
  dir: string;
  trusted: boolean;
}

/**
 * The folder under its root, as the agent names it (rel_dir): the skill's folder with the root folder and one '/' taken
 * off. Null when the folder is not under the root as written (never a guess: the agent would act on another skill).
 */
export function relDirOf(row: Pick<SkillRow, 'id' | 'rootDir'>): string | null {
  const root = row.rootDir.replace(/\/+$/, '');
  if (!root || !row.id.startsWith(root + '/')) return null;
  const rel = row.id.slice(root.length + 1);
  return rel && !rel.split('/').some((p) => p === '' || p === '.' || p === '..') ? rel : null;
}

/** Trust can be set only on an installed skill that parsed (one made here has no trust of its own to set). */
export const canTrust = (r: SkillRow): boolean => r.trust !== 'local' && r.state !== 'broken' && relDirOf(r) !== null;

/**
 * What a fresh list proves about a lost trust answer: 'applied' when a list of the change's own computer and realm shows
 * that folder trusted (a grant) or not trusted (a revoke). "Changed since install" proves neither: the agent shows it
 * whatever the record says. Never 'not_applied': nothing here is sent again on its own.
 */
export function trustProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const i = (identity && typeof identity === 'object' ? identity : {}) as Partial<TrustIdentity>;
  if (typeof i.dir !== 'string' || typeof i.trusted !== 'boolean') return undefined;
  for (const group of answers) {
    for (const a of group) {
      const l = a as Partial<SkillList> | null;
      if (!l || !Array.isArray(l.items) || l.computer !== i.computer || l.realm !== i.realm) continue;
      const row = l.items.find((r) => r.id === i.dir);
      if (row && row.trust === (i.trusted ? 'trusted' : 'untrusted')) return 'applied';
    }
  }
  return undefined;
}

const table: SourceTable = {
  reads: skillsTable.reads,
  changes: {
    trust: {
      route: trustRoute,
      input: (v: TrustVars) => ({
        target: v.target,
        realm: v.realm,
        body: { root_dir: v.rootDir, rel_dir: v.relDir, trusted: v.trusted, ...(v.trusted && v.verify ? { verify_unchanged: true } : {}) },
      }),
      reads: ['skills'],
      lock: SKILL_TRUST_LOCK,
      // One held trust change per skill folder on a computer (the realm is in core's scope).
      lockKey: (v: TrustVars) => ({ computer: v.target.container.id, dir: v.dir }),
      identity: (v: TrustVars): TrustIdentity => ({ computer: v.target.container.id, realm: v.realm, dir: v.dir, trusted: v.trusted }),
      select: () => undefined,
      proves: trustProved,
    },
  },
};

// The list's source id: the trust change re-reads the same list queries the page shows.
const source = coreSource('ai-skills', table);

/** The trust change of one skill folder: sent once, its unknown outcome held (only this folder's, on this computer). */
export function useTrust(at: SkillsAt, dir: string) {
  const m = source.useMutation<unknown, TrustVars>('trust');
  const computer = at.target.container.id;
  const pick = useCallback((i: Record<string, unknown>) => i.computer === computer && i.dir === dir, [computer, dir]);
  const heldBy = useCallback((h: HeldChange) => source.heldBy('trust', h), []);
  const vars = useCallback(
    (i: Record<string, unknown>): TrustVars => ({ target: at.target as Target, realm: String(i.realm ?? ''), dir: String(i.dir ?? ''), rootDir: '', relDir: '', trusted: i.trusted === true, verify: false }),
    [at],
  );
  return useRunner<TrustVars>(m, { lock: SKILL_TRUST_LOCK, pick, vars, heldBy });
}
