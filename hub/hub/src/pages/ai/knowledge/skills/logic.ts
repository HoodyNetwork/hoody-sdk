// The installed skills as the page shows them. Pure: the agent's list → rows, and the proof of an on/off change.
//
// What the agent says:
//   - a skill is one SKILL.md, identified by its folder (root_dir + rel_dir; `dir` is that folder, absolute);
//   - two roots may hold the same name: the higher root's copy is used, the other is `shadowed`;
//   - `disabled` is only filled for a skill that parsed; a broken one (`parse_err`) has no known state;
//   - on/off is per NAME: turning a name off turns off every copy of it, so only the copy in use has a switch;
//   - `trust` absent: a skill you made yourself (local: implicitly trusted). Present: installed from elsewhere, trusted or
//     not; `tampered` (its files changed since install) is never trusted.
// On and trust are apart: an untrusted skill that is on is listed to agents by name only: its
// description and instructions are withheld and its commands do not run until it is trusted. Turning it on never trusts it.

import { stringOrEmpty as str } from '@core';

export type Root = 'project' | 'user' | 'config' | 'bundled' | 'other';
export type SkillState = 'on' | 'off' | 'shadowed' | 'broken';
export type TrustState = 'local' | 'trusted' | 'untrusted' | 'changed';

export interface SkillRow {
  /** The skill's folder (absolute): its identity and the row id. */
  id: string;
  name: string;
  description: string;
  root: Root;
  rootDir: string;
  state: SkillState;
  /** The agent's own on/off for this name; null when it is not known (a broken skill). */
  disabled: boolean | null;
  trust: TrustState;
  /** Where an installed skill came from (provider and source as the agent recorded them); '' for none. */
  from: string;
  /** The folder's name under its root (what an install or import writes into). */
  relDir: string;
  /** The agent's install record of a skill from elsewhere (hub or import), as recorded; null for one made here. */
  origin: Origin | null;
  model: string;
  allowedTools: readonly string[];
  files: readonly string[];
  /** The commands its body runs when it loads (only once it is trusted), as written. */
  commands: readonly string[];
  parseErr: string;
}

export interface SkillList {
  items: readonly SkillRow[];
  /** The agent said how many there are and the page holds them all. */
  complete: boolean;
  /** The computer and realm the list was read for (a change's proof only reads its own). */
  computer: string;
  realm: string;
}

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
// 'bundled': in a realm, the agent's reserved root of Hoody's own skills, read-only.
const ROOTS: readonly Root[] = ['project', 'user', 'config', 'bundled'];
/** The agent's root id as one of the roots the page names ('other' for any it does not). */
export const rootOf = (rootId: string): Root => ((ROOTS as readonly string[]).includes(rootId) ? (rootId as Root) : 'other');

/** An installed skill's record: the hub's provider + source + skill id, or an import's tool (provider) + its folder (refSource);
 *  installedAt moves on every install or import into that folder. */
export interface Origin { provider: string; refSource: string; refSkillId: string; installedAt: string; tampered: boolean }

/** The root the agent installs and imports into (config SkillsWriteRoot: its "user" root; the page sends neither a cwd nor a
 *  config dir, so that root is always there). Replace, proofs and "Open it" read only rows of this root: a copy of the same
 *  folder name in another root is another folder. */
export const WRITE_ROOT: Root = 'user';

function originOf(t: unknown): Origin | null {
  if (t === undefined || t === null) return null;
  const r = rec(t);
  return { provider: str(r.provider), refSource: str(r.ref_source), refSkillId: str(r.ref_skill_id), installedAt: str(r.installed_at), tampered: r.tampered === true };
}

function trustOf(t: unknown): { trust: TrustState; from: string } {
  if (t === undefined || t === null) return { trust: 'local', from: '' };
  const r = rec(t);
  const from = [str(r.provider), str(r.ref_source)].filter(Boolean).join(' · ');
  if (r.tampered === true) return { trust: 'changed', from };
  return { trust: r.level === 'trusted' ? 'trusted' : 'untrusted', from };
}

/** One row of the agent's list, or null for a row without the fields that identify it, or with a field of the wrong type: the
 *  agent sends `disabled`, `shadowed` and `trust.tampered` as booleans (absent = false) and `trust.level` as trusted or
 *  untrusted. A row read past such a field could show a state it does not have, and a proof reads it: no row, no proof. */
export function rowOf(raw: unknown): SkillRow | null {
  const r = rec(raw);
  const name = str(r.name);
  const dir = str(r.dir);
  if (!name || !dir) return null;
  for (const k of ['disabled', 'shadowed']) if (r[k] !== undefined && typeof r[k] !== 'boolean') return null;
  if (r.trust !== undefined && r.trust !== null) {
    const t = rec(r.trust);
    if ((t.tampered !== undefined && typeof t.tampered !== 'boolean') || (t.level !== 'trusted' && t.level !== 'untrusted')) return null;
  }
  const parseErr = str(r.parse_err);
  const disabled = parseErr ? null : r.disabled === true;
  const state: SkillState = parseErr ? 'broken' : r.shadowed === true ? 'shadowed' : disabled ? 'off' : 'on';
  const rootId = str(r.root_id);
  return {
    id: dir,
    name,
    description: str(r.description),
    root: rootOf(rootId),
    rootDir: str(r.root_dir),
    state,
    disabled,
    ...trustOf(r.trust),
    relDir: str(r.rel_dir),
    origin: originOf(r.trust),
    model: str(r.model),
    allowedTools: strs(r.allowed_tools),
    files: strs(r.bundled_files),
    commands: strs(r.dynamic_cmd_list),
    parseErr,
  };
}

/** A row a proof can read: identified, with its root and folder (the agent always sends both), and a record whose install time,
 *  when it has one, is a time (an older record without one can never prove a change: newSince needs a time). */
function provable(raw: unknown): boolean {
  const r = rec(raw);
  if (!rowOf(raw) || !str(r.root_id) || !str(r.rel_dir)) return false;
  if (r.trust === undefined || r.trust === null) return true;
  const at = rec(r.trust).installed_at;
  return at === undefined || typeof at === 'string';
}

/** The agent's answer → the page's list, for the computer and realm it was read for. */
export function skillsOf(raw: unknown, at: { computer: string; realm: string }): SkillList {
  const body = rec(raw);
  const rows = Array.isArray(body.items) ? body.items : null;
  const items = (rows ?? []).map(rowOf).filter((x): x is SkillRow => x !== null);
  const total = rec(body.meta).total;
  // Whole: the agent said how many there are (the gateway's list always does), exactly the rows it sent (so never missing,
  // negative or a fraction), and every row carries what a proof reads (provable). A press reads install times only from a
  // whole list: a row left out, or one without its folder, could make an old install look new later.
  const whole = rows !== null && total === rows.length && rows.every(provable);
  return { items, complete: whole, computer: at.computer, realm: at.realm };
}

/** Only the copy in use, parsed, has a switch: a shadowed copy follows its name, a broken one has no known state. */
export const canSwitch = (r: SkillRow): boolean => r.state === 'on' || r.state === 'off';

/** For the list's default order: the ones that need a look first (broken, then not trusted), then by name. */
export function attentionRank(r: SkillRow): number {
  if (r.state === 'broken') return 0;
  if (r.trust === 'changed' || r.trust === 'untrusted') return 1;
  return 2;
}

/** An on/off change: the name, the value sent, and the computer and realm it went to. */
export interface ToggleIdentity {
  computer: string;
  realm: string;
  name: string;
  disabled: boolean;
}

/**
 * What a fresh list proves about a lost on/off answer: 'applied' when a list of the change's own computer and realm shows the
 * name's copy in use with the value sent. Anything else proves nothing (the change stays held: the request may still land,
 * and a name another person changed meanwhile is not this change's proof). Never 'not_applied': nothing here is sent again
 * on its own.
 */
export function toggleProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const i = rec(identity) as Partial<ToggleIdentity>;
  if (typeof i.name !== 'string' || typeof i.disabled !== 'boolean') return undefined;
  for (const group of answers) {
    for (const a of group) {
      const l = a as Partial<SkillList> | null;
      if (!l || !Array.isArray(l.items) || l.computer !== i.computer || l.realm !== i.realm) continue;
      const used = l.items.find((r) => r.name === i.name && canSwitch(r));
      if (used && used.disabled === i.disabled) return 'applied';
    }
  }
  return undefined;
}

// ── The Skill Hub and import ─────────────────────────────────────────────────────────────────────────────────────────────
// What the agent says: a hub install takes the exact package its preview cached (by
// digest), into the folder named by the hub's skill id; an import copies another tool's skill folder into one named from it
// (dest_rel_dir). Both land OFF and NOT TRUSTED (an untrusted record + a third-party marker), and record where they came from.
// All text from the hub or a skill file is someone else's. A hub skill's Markdown body shows in the kit MarkdownViewer (it
// fetches no images); the only links are the web pages derived below from the source and commit, and the origin as ExtLink
// shows it (a web address links, anything else stays text).

export interface HubRef { provider: string; source: string; skillId: string }
export interface HubHit { ref: HubRef; name: string; source: string; installs: number }
export interface HubSearch {
  hits: HubHit[];
  /** An older cached answer (the live search failed, or the cache is stale): it may be out of date. */
  old: boolean;
}
/** One file of a package: its path in the skill folder and its size in bytes (the agent sends no other file's bytes). */
export interface HubFile { path: string; size: number }
export interface HubPreview {
  /** The package's content address: install sends it, and the agent installs exactly the package it names. */
  digest: string;
  ref: HubRef;
  name: string;
  /** Where the package was read from (its content address on the source) and the commit it is pinned to, when there is one. */
  origin: string;
  commit: string;
  stars: number;
  /** SKILL.md's frontmatter as the agent parsed it. The agent sends a JSON object built from a map, so this order is not the
   *  file's: show it through sortedFrontmatter. */
  frontmatter: [string, string][];
  /** SKILL.md's Markdown body as the agent read it (without its header). */
  body: string;
  files: HubFile[];
  /** The commands its body runs when it loads, once trusted, as written. */
  commands: string[];
  totalBytes: number;
  old: boolean;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
function refOf(v: unknown): HubRef | null {
  const r = rec(v);
  const ref = { provider: str(r.provider), source: str(r.source), skillId: str(r.skill_id) };
  return ref.provider && ref.source && ref.skillId ? ref : null;
}
const isOld = (r: Record<string, unknown>): boolean => rec(r.envelope).stale === true || typeof r.degraded === 'string';

export function hubSearchOf(raw: unknown): HubSearch {
  const r = rec(raw);
  const hits: HubHit[] = [];
  for (const h of Array.isArray(r.results) ? r.results : []) {
    const x = rec(h);
    const ref = refOf(x.ref);
    if (!ref) continue;
    hits.push({ ref, name: str(x.name) || ref.skillId, source: str(x.source) || ref.source, installs: num(x.installs) });
  }
  return { hits, old: isOld(r) };
}

const DIGEST = /^[A-Za-z0-9:_-]{8,160}$/;
/** The preview of the package `asked` names; null when the answer has no digest, is for another skill, or has no body. */
export function hubPreviewOf(raw: unknown, asked: HubRef): HubPreview | null {
  const r = rec(raw);
  const digest = str(r.package_digest);
  if (!DIGEST.test(digest) || typeof r.body !== 'string') return null;
  if ((r.provider !== undefined && r.provider !== asked.provider) || (r.source !== undefined && r.source !== asked.source)) return null;
  if (r.name !== undefined && r.name !== asked.skillId) return null;
  const fm = rec(r.frontmatter);
  const files: HubFile[] = (Array.isArray(r.files) ? r.files : [])
    .map((f) => ({ path: str(rec(f).path), size: num(rec(f).size) }))
    .filter((f) => f.path !== '');
  return {
    digest,
    ref: asked,
    name: asked.skillId,
    origin: str(r.origin),
    commit: str(r.commit_sha),
    stars: num(r.stars),
    frontmatter: Object.keys(fm).map((k): [string, string] => [k, typeof fm[k] === 'string' ? (fm[k] as string) : JSON.stringify(fm[k])]),
    body: r.body,
    files,
    commands: strs(r.dynamic_cmd_list),
    totalBytes: num(r.total_bytes) || files.reduce((n, f) => n + f.size, 0),
    old: isOld(r),
  };
}

export type ImportSource = 'claude' | 'codex';
export interface ImportEntry {
  source: ImportSource;
  name: string;
  /** Its folder in the other tool's skills (what the agent finds it by again). */
  relDir: string;
  /** The folder it lands in here. */
  destRelDir: string;
  description: string;
  commands: string[];
  files: string[];
  /** Files it would copy whose names look like secrets (advice only). */
  sensitive: string[];
  parseErr: string;
  /** One of Codex's own built-in skills. */
  system: boolean;
  /** A skill of that name, or that folder, is already here: the root it is in ('' none). */
  collision: string;
}

/** The scan's skills of `source`; null when the answer carries no list (nothing to choose from, never "none found"). */
export function importScanOf(raw: unknown, source: ImportSource): ImportEntry[] | null {
  const r = rec(raw);
  if (!Array.isArray(r.skills)) return null;
  const out: ImportEntry[] = [];
  for (const e of r.skills) {
    const x = rec(e);
    const relDir = str(x.rel_dir);
    if (!relDir || (x.source !== undefined && x.source !== source)) continue;
    out.push({
      source, relDir, name: str(x.name) || relDir, destRelDir: str(x.dest_rel_dir), description: str(x.description),
      commands: strs(x.dynamic_cmds), files: strs(x.bundled_files), sensitive: strs(x.sensitive), parseErr: str(x.parse_err),
      system: x.system === true, collision: str(x.collision),
    });
  }
  return out;
}
/** Only a skill that parsed, with a folder to land in, can be imported. */
export const importable = (e: ImportEntry): boolean => !e.parseErr && e.destRelDir !== '';

/** One import's own answer (the agent answers 200 with each item's result). */
export interface ImportResult { ok: boolean; name: string; kind: 'exists' | 'dup_in_batch' | '' }
export function importResultOf(raw: unknown, relDir: string): ImportResult | null {
  const results = rec(raw).results;
  if (!Array.isArray(results)) return null;
  const x = results.map(rec).find((i) => i.rel_dir === relDir);
  // Its own result only when it says ok true or false; anything else is no result (it may have been imported).
  if (!x || typeof x.ok !== 'boolean') return null;
  // The agent's `err` is its own free text (formatted causes, paths): it is read by no one, only the kind picks the words.
  return { ok: x.ok, name: str(x.name), kind: x.kind === 'exists' || x.kind === 'dup_in_batch' ? x.kind : '' };
}

// ── Where a hub skill comes from, as web pages ────────────────────────────────────────────────────────────────────────
// The agent's hub source is "owner/repo" (a GitHub repository) or a bare domain (skillhub.Ref). Only those two shapes get a
// page; any other text links nowhere. The parts are checked whole, never cleaned up, so the link is that source's own page.
const GH_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GH_REPO = /^(?!\.{1,2}$)[A-Za-z0-9_.-]{1,100}$/;
const DOMAIN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const HEX_COMMIT = /^[0-9a-fA-F]{7,64}$/;

function ghRepo(source: string): [string, string] | null {
  const parts = source.split('/');
  if (parts.length !== 2) return null;
  const [owner = '', repo = ''] = parts;
  return GH_OWNER.test(owner) && GH_REPO.test(repo) ? [owner, repo] : null;
}

/** The source's web page: `https://github.com/{owner}/{repo}` for owner/repo, `https://{domain}` for a domain, else ''. */
export function sourceUrl(source: string): string {
  const gh = ghRepo(source);
  if (gh) return `https://github.com/${gh[0]}/${gh[1]}`;
  const host = source.toLowerCase();
  return DOMAIN.test(host) ? `https://${host}` : '';
}

/** The commit's page on GitHub, for a hex commit of an owner/repo source; '' for any other. */
export function commitUrl(source: string, sha: string): string {
  const gh = ghRepo(source);
  return gh && HEX_COMMIT.test(sha) ? `https://github.com/${gh[0]}/${gh[1]}/commit/${sha}` : '';
}

/** A hex commit's first 7 characters (the usual short form); any other text as given. */
export const shortCommit = (sha: string): string => (HEX_COMMIT.test(sha) ? sha.slice(0, 7) : sha);

/** Who published it: the owner of owner/repo, else the source itself (a domain). */
export const publisherOf = (source: string): string => ghRepo(source)?.[0] ?? source;

/** The frontmatter by key: the agent's order is a map's, not the file's, so no order is presented as the file's own. */
export const sortedFrontmatter = (fm: readonly [string, string][]): [string, string][] =>
  [...fm].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/** A hub install's held identity: where it went, the folder, the hub skill, and the install times that folder showed at the press. */
export interface InstallIdentity { computer: string; realm: string; rel: string; provider: string; source: string; skillId: string; before: string[] }
/** An import's held identity: where it went, the folder it lands in, the tool and its folder, and the times at the press. */
export interface ImportIdentity { computer: string; realm: string; dest: string; source: string; relDir: string; before: string[] }

/** The install times the list shows for a folder now (the `before` of a press). */
export const installTimes = (list: SkillList | undefined, rel: string): string[] =>
  (list?.items ?? []).filter((r) => r.root === WRITE_ROOT && r.relDir === rel && r.origin).map((r) => r.origin!.installedAt);

/** A skill in the folder an install or import lands in (only that replaces it; overwrite needs a warning). */
export const takenIn = (list: SkillList | undefined, rel: string): boolean =>
  (list?.items ?? []).some((r) => r.root === WRITE_ROOT && r.relDir === rel);

/** The folder's row carrying a matching, untampered record (a tampered one is files that are not what was recorded). */
export const recordedRow = (list: SkillList | undefined, rel: string, from: (o: Origin) => boolean): SkillRow | undefined =>
  (list?.items ?? []).find((r) => r.root === WRITE_ROOT && r.relDir === rel && r.origin !== null && !r.origin.tampered && from(r.origin));
/** The hub skill's record. */
export const fromHub = (ref: { provider: string; source: string; skillId: string }) => (o: Origin): boolean =>
  o.provider === ref.provider && o.refSource === ref.source && o.refSkillId === ref.skillId;
/** An import's record: the tool and its folder. */
export const fromImport = (source: string, relDir: string) => (o: Origin): boolean => o.provider === source && o.refSource === relDir;
/** Installed after a press: its install time was not among the folder's times read at the press. */
export const newSince = (row: SkillRow | undefined, before: readonly string[]): boolean =>
  !!row?.origin && row.origin.installedAt !== '' && !before.includes(row.origin.installedAt);

function landed(answers: readonly (readonly unknown[])[], computer: unknown, realm: unknown, rel: string, before: unknown, from: (o: Origin) => boolean): boolean {
  const was = Array.isArray(before) ? before.map(String) : null;
  if (!was || !rel) return false;
  for (const group of answers) {
    for (const a of group) {
      const l = a as Partial<SkillList> | null;
      if (!l || !Array.isArray(l.items) || l.computer !== computer || l.realm !== realm) continue;
      if (newSince(recordedRow(l as SkillList, rel, from), was)) return true;
    }
  }
  return false;
}

/** A lost install is proved only by a list of its computer and realm showing that folder with this hub skill's record and an
 *  install time it did not have at the press. Nothing else proves anything (never "not applied": it may still land). */
export function installProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const i = rec(identity) as Partial<InstallIdentity>;
  const ok = landed(answers, i.computer, i.realm, str(i.rel), i.before, fromHub({ provider: str(i.provider), source: str(i.source), skillId: str(i.skillId) }));
  return ok ? 'applied' : undefined;
}
/** A lost import, the same way: that folder with a record from that tool's folder and a new install time. */
export function importProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const i = rec(identity) as Partial<ImportIdentity>;
  const ok = landed(answers, i.computer, i.realm, str(i.dest), i.before, fromImport(str(i.source), str(i.relDir)));
  return ok ? 'applied' : undefined;
}
