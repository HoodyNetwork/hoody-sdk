// Knowledge → Skills reads and its one change, on core. The list follows the top bar's computer and realm:
// with All realms nothing is read (a skill lives in one realm). On/off is sent once and never resent (C9): a lost answer
// is held under its lock until a fresh list of the same computer and realm shows the value sent, or the person dismisses it.
// The source id 'ai-skills' is the held change's sender name: it stays when the view moves under the /ai routes.
import { coreSource, isRealmOrGlobal, useCurrentComputer, useRunner, type HeldChange, type SourceTable, type Target } from '@core';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useAiRealm } from '../../aiRealm';
import {
  hubPreviewOf, hubSearchOf, importProved, importResultOf, importScanOf, installProved, skillsOf, toggleProved,
  type HubPreview, type HubRef, type HubSearch, type ImportEntry, type ImportIdentity, type ImportResult, type ImportSource, type InstallIdentity,
  type SkillList, type SkillRow, type ToggleIdentity,
} from './logic';
import { skillRoutes } from './routes';

export const SKILL_TOGGLE_LOCK = 'agent.skill_toggle';
export const SKILL_INSTALL_LOCK = 'agent.skill_install';
export const SKILL_IMPORT_LOCK = 'agent.skill_import';
const SOURCE = 'ai-skills';

/** Where a read goes: the computer and the realm. */
export interface SkillsAt { target: Target; realm: string }
/** Where a chat's list is read: the computer, the realm and the chat's folder (absolute; '' or null = none, no folder sent). */
export interface SkillsIn extends SkillsAt { cwd: string | null }
/** One on/off change: the value it sets, where it goes. */
export interface ToggleVars extends SkillsAt { name: string; disabled: boolean }
/** One hub install: the previewed package (by digest), whether it replaces the folder, and the install times at the press. */
export interface InstallVars extends SkillsAt { digest: string; ref: HubRef; overwrite: boolean; before: string[] }
/** One import (one skill per request): the tool, its folder, the folder here, and the install times at the press. */
export interface ImportVars extends SkillsAt { source: ImportSource; relDir: string; dest: string; overwrite: boolean; before: string[] }
interface HubAt { target: Target; query: string }
interface SourceAt extends SkillsAt { rootDir: string; relDir: string }
interface PreviewAt { target: Target; ref: HubRef }
interface ScanAt { target: Target; source: ImportSource }

export const skillsTable: SourceTable = {
  reads: {
    skills: {
      route: skillRoutes.list,
      input: (p: SkillsAt) => ({ target: p.target, realm: p.realm, query: { limit: 0 } }),
      select: (raw, p: SkillsAt): SkillList => skillsOf(raw, { computer: p.target.container.id, realm: p.realm }),
    },
    // The list a chat's folder sees (its project's skills too): the composer's "/" menu.
    skillsIn: {
      route: skillRoutes.listIn,
      // Disabled (no params) it is never sent; its key is still built, so the input reads nothing then.
      input: (p?: SkillsIn) => (p ? { target: p.target, realm: p.realm, ...(p.cwd ? { cwd: p.cwd } : {}), query: { limit: 0 } } : {}),
      select: (raw, p?: SkillsIn): SkillList => skillsOf(raw, { computer: p?.target.container.id ?? '', realm: p?.realm ?? '' }),
    },
    // One skill's SKILL.md as installed: its folder by root and name under it, in the list's realm.
    skillSource: {
      route: skillRoutes.source,
      input: (p: SourceAt) => ({ target: p.target, realm: p.realm, query: { root_dir: p.rootDir, rel_dir: p.relDir } }),
      select: (raw): string | null => {
        const c = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).content : undefined;
        return typeof c === 'string' ? c : null;
      },
    },
    // The hub and the scan read no realm (the agent refuses one there): only the computer.
    hubSearch: {
      route: skillRoutes.hubSearch,
      input: (p: HubAt) => ({ target: p.target, query: { query: p.query } }),
      select: (raw): HubSearch => hubSearchOf(raw),
    },
    hubPreview: {
      route: skillRoutes.hubPreview,
      input: (p: PreviewAt) => ({ target: p.target, query: { provider: p.ref.provider, source: p.ref.source, skill_id: p.ref.skillId } }),
      select: (raw, p: PreviewAt): HubPreview | null => hubPreviewOf(raw, p.ref),
    },
    importScan: {
      route: skillRoutes.importScan,
      input: (p: ScanAt) => ({ target: p.target, query: { source: p.source } }),
      select: (raw, p: ScanAt): ImportEntry[] | null => importScanOf(raw, p.source),
    },
  },
  changes: {
    toggle: {
      route: skillRoutes.toggle,
      input: (v: ToggleVars) => ({ target: v.target, realm: v.realm, body: { name: v.name, disabled: v.disabled } }),
      reads: ['skills'],
      lock: SKILL_TOGGLE_LOCK,
      // One held change per name on a computer (the realm is in core's scope): a second press waits for the first.
      lockKey: (v: ToggleVars) => ({ computer: v.target.container.id, name: v.name }),
      identity: (v: ToggleVars): ToggleIdentity => ({ computer: v.target.container.id, realm: v.realm, name: v.name, disabled: v.disabled }),
      select: () => undefined,
      proves: toggleProved,
    },
    // A hub install: one per folder on a computer. Proved only by the list (installProved).
    install: {
      route: skillRoutes.hubInstall,
      input: (v: InstallVars) => ({ target: v.target, realm: v.realm, body: { package_digest: v.digest, overwrite: v.overwrite } }),
      reads: ['skills'],
      lock: SKILL_INSTALL_LOCK,
      lockKey: (v: InstallVars) => ({ computer: v.target.container.id, rel: v.ref.skillId }),
      identity: (v: InstallVars): InstallIdentity => ({
        computer: v.target.container.id, realm: v.realm, rel: v.ref.skillId, provider: v.ref.provider, source: v.ref.source, skillId: v.ref.skillId, before: [...v.before],
      }),
      select: (raw) => {
        const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
        return { name: typeof r.name === 'string' ? r.name : '' };
      },
      proves: installProved,
    },
    // An import of one skill: one per folder here on a computer. Proved only by the list (importProved).
    import: {
      route: skillRoutes.importApply,
      input: (v: ImportVars) => ({
        target: v.target, realm: v.realm, body: { source: v.source, items: [{ source: v.source, rel_dir: v.relDir }], overwrite: v.overwrite },
      }),
      reads: ['skills'],
      lock: SKILL_IMPORT_LOCK,
      lockKey: (v: ImportVars) => ({ computer: v.target.container.id, dest: v.dest }),
      identity: (v: ImportVars): ImportIdentity => ({ computer: v.target.container.id, realm: v.realm, dest: v.dest, source: v.source, relDir: v.relDir, before: [...v.before] }),
      select: (raw, v: ImportVars): ImportResult | null => importResultOf(raw, v.relDir),
      proves: importProved,
    },
  },
};

const source = coreSource(SOURCE, skillsTable);

/** Where the list reads now: the top bar's computer and the page's one realm (aiRealm.ts: under All realms the computer's
 *  own); null when there is none to read (no computer, or no one realm to tell). */
export function useSkillsAt(): SkillsAt | null {
  const target = useCurrentComputer();
  const { realm } = useAiRealm();
  return useMemo(() => (target && isRealmOrGlobal(realm) ? { target, realm } : null), [target, realm]);
}

/** The installed skills where `at` says (off while `at` is null). */
export function useSkills(at: SkillsAt | null) {
  return source.useQuery<SkillList, SkillsAt | undefined>('skills', at ?? undefined, { enabled: at !== null });
}

/** The skills a chat in `at.cwd` sees (off while `at` is null). */
export function useSkillsIn(at: SkillsIn | null) {
  return source.useQuery<SkillList, SkillsIn | undefined>('skillsIn', at ?? undefined, { enabled: at !== null });
}

/** The on/off change of one skill name: sent once, its unknown outcome held (only this name's, on this computer). */
export function useToggle(at: SkillsAt | null, name: string) {
  const m = source.useMutation<unknown, ToggleVars>('toggle');
  const computer = at?.target.container.id ?? '';
  const pick = useCallback((i: Record<string, unknown>) => i.computer === computer && i.name === name, [computer, name]);
  const heldBy = useCallback((h: HeldChange) => source.heldBy('toggle', h), []);
  const vars = useCallback(
    (i: Record<string, unknown>): ToggleVars => ({ target: at?.target as Target, realm: String(i.realm ?? ''), name: String(i.name ?? ''), disabled: i.disabled === true }),
    [at],
  );
  return useRunner<ToggleVars>(m, { lock: SKILL_TOGGLE_LOCK, pick, vars, heldBy });
}

/** One skill's SKILL.md (null: the answer had no text). Mount it only while it is to be read. */
export function useSkillSource(at: SkillsAt, row: Pick<SkillRow, 'rootDir' | 'relDir'>) {
  return source.useQuery<string | null, SourceAt>('skillSource', { target: at.target, realm: at.realm, rootDir: row.rootDir, relDir: row.relDir });
}

/** Hub search results for a query on `at`'s computer (nothing is read for an empty query). */
export function useHubSearch(at: SkillsAt, query: string) {
  const q = query.trim();
  return source.useQuery<HubSearch, HubAt | undefined>('hubSearch', q ? { target: at.target, query: q } : undefined, { enabled: q !== '' });
}

/** One hub skill's preview on `at`'s computer (nothing is read until one is picked). */
export function useHubPreview(at: SkillsAt, ref: HubRef | null) {
  return source.useQuery<HubPreview | null, PreviewAt | undefined>('hubPreview', ref ? { target: at.target, ref } : undefined, { enabled: ref !== null });
}

/** The skills another tool has on `at`'s computer (nothing is read until a tool is picked). */
export function useImportScan(at: SkillsAt, tool: ImportSource | null) {
  return source.useQuery<ImportEntry[] | null, ScanAt | undefined>('importScan', tool ? { target: at.target, source: tool } : undefined, { enabled: tool !== null });
}

const s_ = (v: unknown) => String(v ?? '');
const list_ = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

/** A hub install into one folder: sent once, its unknown outcome held (that folder's, on this computer). */
export function useInstall(at: SkillsAt, rel: string) {
  const m = source.useMutation<{ name: string }, InstallVars>('install');
  const computer = at.target.container.id;
  const pick = useCallback((i: Record<string, unknown>) => i.computer === computer && i.rel === rel, [computer, rel]);
  const heldBy = useCallback((h: HeldChange) => source.heldBy('install', h), []);
  const vars = useCallback(
    (i: Record<string, unknown>): InstallVars => ({
      target: at.target, realm: s_(i.realm), digest: '', overwrite: false, before: list_(i.before),
      ref: { provider: s_(i.provider), source: s_(i.source), skillId: s_(i.skillId) },
    }),
    [at],
  );
  return useRunner<InstallVars>(m, { lock: SKILL_INSTALL_LOCK, pick, vars, heldBy });
}

/** An import into one folder here: sent once, its unknown outcome held (that folder's, on this computer). */
export function useImport(at: SkillsAt, dest: string) {
  const m = source.useMutation<ImportResult | null, ImportVars>('import');
  const computer = at.target.container.id;
  const pick = useCallback((i: Record<string, unknown>) => i.computer === computer && i.dest === dest, [computer, dest]);
  const heldBy = useCallback((h: HeldChange) => source.heldBy('import', h), []);
  const vars = useCallback(
    (i: Record<string, unknown>): ImportVars => ({
      target: at.target, realm: s_(i.realm), source: i.source === 'codex' ? 'codex' : 'claude', relDir: s_(i.relDir), dest: s_(i.dest), overwrite: false, before: list_(i.before),
    }),
    [at],
  );
  return useRunner<ImportVars>(m, { lock: SKILL_IMPORT_LOCK, pick, vars, heldBy });
}

/** What this page last sent for one folder (an install or an import), kept while the page's tab lives so leaving the preview or
 *  the tool and coming back still knows it: the folder's install times read at that press (a later list proves the change only
 *  with a time not among them), for an install the package digest it sent (a proof shows done only for that package), and for an
 *  import whether its answer came without this skill's result (unknown until the list proves it or the person stops waiting;
 *  recorded where the answer arrives, so also when the entry was left before it came). Never anything secret. */
export interface Press { before: readonly string[]; unknown: boolean; digest?: string }
const presses = new Map<string, Press>();
const pressSubs = new Set<() => void>();
const pressKey = (at: SkillsAt, kind: 'install' | 'import', folder: string) => JSON.stringify([at.target.container.id, at.realm, kind, folder]);
const subscribePress = (f: () => void) => { pressSubs.add(f); return () => { pressSubs.delete(f); }; };
/** Tests only: forget every press (a fresh page). */
export function forgetPresses() { presses.clear(); for (const f of pressSubs) f(); }
export function usePress(at: SkillsAt, kind: 'install' | 'import', folder: string): [Press | undefined, (p: Press | undefined) => void] {
  const key = pressKey(at, kind, folder);
  const press = useSyncExternalStore(subscribePress, () => presses.get(key));
  const set = useCallback((p: Press | undefined) => {
    if (p) presses.set(key, p); else presses.delete(key);
    for (const f of pressSubs) f();
  }, [key]);
  return [press, set];
}

