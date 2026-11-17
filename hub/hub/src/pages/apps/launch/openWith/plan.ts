// The one launch plan of every Files launch: only planFor() builds a plan, and only toLaunch()
// turns one into a request. No other code produces an Open-with or folder launch: the dispatch guard (live.ts
// sealLaunch) sends a marked launch only as toLaunch built it. Plans live in memory only (live.ts registerRecovery,
// by row key) and are dropped on an account or realm switch; a path, command text or cwd is never stored.
//
// Execution policy lives here only: Run in a terminal needs a regular file with an x bit and is never a default
// or a remembered choice (rememberable); a template suits its target (folder templates take folders, the rest files);
// Other command text is at most 1,024 bytes; every path passes launchablePath and the collision rule.
import type { Item, Opens } from '../../logic';
import { owCandidate, sealLaunch, type OpenOpts, type Recovery } from '../../parts/live';
import {
  ARG0, CMD_MAX_BYTES, DIR_VAR, FILE_VAR, PRE_CMD_DIR, PRE_CMD_FILE, SCRIPT_DIR, SCRIPT_FILE, SCRIPT_HERE, SCRIPT_RUN,
  collides, dirValue, launchablePath, utf8Bytes, type PathReason,
} from './argv';
import { forFolders, templateById, type TemplateId } from './templates';

export type LaunchPlan =
  | { p: 'tpl'; tpl: TemplateId; target: 'file' | 'dir'; path: string; opens: 'terminal' | 'screen'; exe: string }
  | { p: 'cmd'; text: string; target: 'file' | 'dir'; path: string; opens: 'terminal' | 'screen' }
  | { p: 'run'; path: string }
  | { p: 'here'; dir: string }
  | { p: 'apphere'; item: Item; o: OpenOpts; cwd: string };
export type ScriptPlan = Exclude<LaunchPlan, { p: 'apphere' }>;

/** A listing entry as Files knows it: `exec` is the x bit of a regular file (null: not known). */
export interface Entry {
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'other';
  exec?: boolean | null;
}
export type PlanInput =
  | { p: 'tpl'; tpl: string; entry: Entry; exe: string }
  | { p: 'cmd'; text: string; entry: Entry; opens: 'terminal' | 'screen' }
  | { p: 'run'; entry: Entry }
  | { p: 'here'; entry: Entry }
  | { p: 'apphere'; item: Item; o: OpenOpts; cwd: string };

export type PlanReason =
  | PathReason | 'no_template' | 'wrong_target' | 'name_refused' | 'bad_program' | 'cmd_empty' | 'cmd_too_long'
  | 'not_executable' | 'not_folder' | 'collision';
export type Planned = { ok: true; plan: LaunchPlan } | { ok: false; reason: PlanReason };

const targetOf = (e: Entry): 'file' | 'dir' | null => (e.type === 'file' ? 'file' : e.type === 'dir' ? 'dir' : null);
const no = (reason: PlanReason): Planned => ({ ok: false, reason });

/** The only builder of a plan: every rule is checked here. `exe` is the template path the probe found. */
export function planFor(i: PlanInput): Planned {
  if (i.p === 'apphere') {
    const why = launchablePath(i.cwd);
    return why ? no(why) : { ok: true, plan: { p: 'apphere', item: i.item, o: i.o, cwd: i.cwd } };
  }
  const why = launchablePath(i.entry.path);
  if (why) return no(why);
  const target = targetOf(i.entry);
  switch (i.p) {
    case 'tpl': {
      const t = templateById(i.tpl);
      if (!t) return no('no_template');
      if (!target || (target === 'dir') !== forFolders(t)) return no('wrong_target');
      // What was probed is what runs: one of the row's own absolute paths.
      if (!t.probe.includes(i.exe)) return no('bad_program');
      if (t.refuses?.(i.entry.path)) return no('name_refused');
      return checked({ p: 'tpl', tpl: t.id, target, path: i.entry.path, opens: t.opens, exe: i.exe });
    }
    case 'cmd': {
      if (!target) return no('wrong_target');
      if (!i.text.trim()) return no('cmd_empty');
      if (utf8Bytes(i.text) > CMD_MAX_BYTES) return no('cmd_too_long');
      return checked({ p: 'cmd', text: i.text, target, path: i.entry.path, opens: i.opens === 'screen' ? 'screen' : 'terminal' });
    }
    case 'run':
      // Run needs a regular file with an x bit (a symlink gets no Run in v1); the exec still decides.
      if (i.entry.type !== 'file' || i.entry.exec !== true) return no('not_executable');
      return checked({ p: 'run', path: i.entry.path });
    case 'here':
      if (target !== 'dir') return no('not_folder');
      return checked({ p: 'here', dir: i.entry.path });
  }
}

/** The collision rule: a staged value the core would refuse (part of the launch's own command) is refused here. */
function checked(plan: ScriptPlan): Planned {
  const s = scriptOf(plan);
  return collides(s.value, s.args) ? no('collision') : { ok: true, plan };
}

/** A plan's script words, staged variable and value. */
export function scriptOf(plan: ScriptPlan): { args: string[]; name: string; value: string } {
  switch (plan.p) {
    case 'tpl': {
      const t = templateById(plan.tpl)!;
      const dir = plan.target === 'dir';
      return { args: ['-c', dir ? SCRIPT_DIR : SCRIPT_FILE, ARG0, plan.exe, ...t.flags], name: dir ? DIR_VAR : FILE_VAR, value: dir ? dirValue(plan.path) : plan.path };
    }
    case 'cmd': {
      const dir = plan.target === 'dir';
      return { args: ['-c', (dir ? PRE_CMD_DIR : PRE_CMD_FILE) + plan.text, ARG0], name: dir ? DIR_VAR : FILE_VAR, value: dir ? dirValue(plan.path) : plan.path };
    }
    case 'run':
      return { args: ['-c', SCRIPT_RUN, ARG0], name: FILE_VAR, value: plan.path };
    case 'here':
      return { args: ['-c', SCRIPT_HERE, ARG0], name: DIR_VAR, value: dirValue(plan.dir) };
  }
}

/** The bash launcher row (the run kit's system `bash` candidate) every script purpose resolves. */
export interface Launcher {
  candidateId: string;
  setId?: string;
  /** Its path on the computer, part of the command text (the collision rule). */
  path: string;
}

/** Where a plan's program shows. */
export const opensOf = (plan: LaunchPlan): Opens => {
  if (plan.p === 'apphere') return plan.o.opensIn ?? (plan.item.opensIn === 'unknown' ? 'terminal' : plan.item.opensIn);
  if (plan.p === 'tpl' || plan.p === 'cmd') return plan.opens;
  return 'terminal';
};
/** The ledger's program key: the template, run, the command's hash or here; never a path. */
export const programWord = (plan: ScriptPlan): string => (plan.p === 'tpl' ? plan.tpl : plan.p);

/**
 * The only producer of a Files launch request. Script purposes: the launcher with `-c SCRIPT open-with …words`, the
 * path as the staged value, opensIn, and the session shell pinned to bash. `apphere`: the chosen app with its cwd.
 * `label` is the row's name ("Nano · a b.txt"), already made safe by the caller (safeLabel); `subject` the ledger
 * identity, `beforeExecute` the ledger's barrier and `recovery` the plan the row keeps for Restart. The item
 * is sealed with all of it: live.ts sends a marked launch only as built here.
 */
export function toLaunch(
  plan: LaunchPlan,
  o: { launcher?: Launcher; label: string; subject?: string; beforeExecute?: OpenOpts['beforeExecute']; recovery?: Recovery },
): { item: Item; o: OpenOpts } | null {
  const extra = o.recovery ? { recovery: o.recovery } : {};
  if (plan.p === 'apphere') {
    const item: Item = { ...plan.item, p: 'apphere' };
    const opts: OpenOpts = { ...plan.o, cwd: plan.cwd };
    return { item: sealLaunch(item, opts, extra), o: opts };
  }
  if (!o.launcher || !o.subject) return null;
  const s = scriptOf(plan);
  // The launcher's own path joins the command words: a path inside it is refused (it would be refused unsent).
  if (collides(s.value, [o.launcher.path, ...s.args])) return null;
  const opens = opensOf(plan);
  const item: Item = {
    type: 'row', name: o.label, id: o.launcher.candidateId, description: '', opensIn: opens, by: 'server', provider: 'system', version: '', attr: '', path: '',
    sourceId: '', setId: o.launcher.setId ?? '', app: 'bash', shares: false, runnable: true, unsure: false, installed: true, also: [], ready: true, tier: 0, ord: 0, group: 0,
    detail: '', p: plan.p, subject: o.subject,
  };
  const opts: OpenOpts = { args: s.args, env: { [s.name]: s.value }, opensIn: opens, shell: 'bash', ...(o.beforeExecute ? { beforeExecute: o.beforeExecute } : {}) };
  return { item: sealLaunch(item, opts, { ...extra, candidate: owCandidate(programWord(plan), o.subject) }), o: opts };
}

/** Whether a choice may be remembered or be a default: never Run in a terminal, never a folder action. */
export function rememberable(c: { p: string; target?: 'file' | 'dir' }): boolean {
  return (c.p === 'tpl' || c.p === 'cmd') && c.target === 'file';
}
