// Fake agent answers for Knowledge → Skills, for the preview and the tests: one store, so a toggle changes what the next list
// shows. `lost` applies a toggle and answers with a gateway error (its outcome unknown); `notApplied` answers it the same way
// and changes nothing; `refuse` answers 404 not_found (the skill went meanwhile: refused, nothing written), `busy` 503
// service_unavailable (refused before any write). Each computer has its own store, seeded alike (the same folders on each).
// The skills use the fixture world's names (atlas, Ada).
import { answers, reply, type FixtureRequest, type FixtureRule } from '@core';
import { skillRoutes } from './routes';

export interface SkillFixture {
  name: string;
  description?: string;
  root_id: string;
  root_dir: string;
  rel_dir: string;
  dir: string;
  disabled?: boolean;
  shadowed?: boolean;
  parse_err?: string;
  model?: string;
  allowed_tools?: string[];
  bundled_files?: string[];
  dynamic_cmds?: number;
  dynamic_cmd_list?: string[];
  trust?: Record<string, unknown>;
  realm: string;
}

const USER = '/home/ada/.hoody/skills';
const PROJECT = '/home/ada/projects/shop/.hoody/skills';
const at = (root: string, rel: string) => ({ root_dir: root, rel_dir: rel, dir: `${root}/${rel}` });

// What each fixture skill's own SKILL.md says (the agent's text, shown as it is).
const WORDS = {
  notes: 'Write release notes from the merged changes.',
  shopNotes: 'The shop’s own release notes.',
  pdf: 'Fill and read PDF forms.',
  deploy: 'Check a deploy before it goes out.',
  sql: 'Review SQL migrations.',
  review: 'Review a change before it lands.',
  pdfForms: 'Fill PDF forms.',
  plan: 'Plan a task.',
  changelog: 'Write a changelog entry.',
};

/** The default world: one of each kind the page shows. The project copy of release-notes wins over yours (project overrides user). */
export function skillSeed(realm = 'global'): SkillFixture[] {
  return [
    { name: 'release-notes', description: WORDS.notes, root_id: 'user', ...at(USER, 'release-notes'), shadowed: true, bundled_files: ['template.md'], realm },
    { name: 'release-notes', description: WORDS.shopNotes, root_id: 'project', ...at(PROJECT, 'release-notes'), realm },
    { name: 'pdf-tools', description: WORDS.pdf, root_id: 'user', ...at(USER, 'pdf-tools'), disabled: true, allowed_tools: ['bash', 'read'], realm },
    {
      name: 'deploy-check', description: WORDS.deploy, root_id: 'user', ...at(USER, 'deploy-check'), dynamic_cmds: 1, dynamic_cmd_list: ['git status --short'],
      trust: { level: 'untrusted', provider: 'skill hub', ref_source: 'hoody/deploy-check' }, realm,
    },
    { name: 'sql-review', description: WORDS.sql, root_id: 'user', ...at(USER, 'sql-review'), trust: { level: 'trusted', provider: 'skill hub', ref_source: 'hoody/sql-review' }, model: 'hoody-ai/hoody-free', bundled_files: ['scripts/check.sh', 'rules.md'], realm },
    { name: 'broken', root_id: 'user', ...at(USER, 'broken'), parse_err: 'missing frontmatter', realm },
  ];
}

export interface SkillOpts {
  seed?: SkillFixture[];
  lost?: boolean;
  notApplied?: boolean;
  refuse?: boolean;
  busy?: boolean;
  /** The list read fails (a function: checked at each read). */
  listFails?: boolean | (() => boolean);
  /** The list answers only part of what it says there is (a function: checked at each read). */
  listPartial?: boolean | (() => boolean);
  /** The list answers in a malformed shape: without meta.total, or with one row missing its rel_dir; or else:
   *  a total that is negative (no rows), fractional, or less than the rows it came with. */
  listShape?: () => 'noTotal' | 'noRelDir' | 'negTotal' | 'fracTotal' | 'lowTotal' | undefined;
  /** The list leaves out the user-root row of this folder, counting without it (its SKILL.md was removed). */
  listDrop?: () => string | undefined;
  /** The preview's package digest carries this tag (a newer package of the same skill). */
  digestTag?: () => string;
  /** The hub's search answer is an older cached one. */
  hubOld?: boolean;
  /** The preview's origin, commit and body (default: placeholders, not web addresses). */
  hubOrigin?: string;
  /** A SKILL.md read answers a 500. */
  sourceFails?: boolean;
  /** A SKILL.md read answers ok without any text. */
  sourceEmpty?: boolean;
  /** Tests only: a SKILL.md read's own description line (per computer or realm), and a promise it answers after. */
  sourceFor?: (r: FixtureRequest) => { words?: string; wait?: Promise<void> } | undefined;
  hubCommit?: string;
  hubBody?: string;
  /** The preview answers without a digest (unusable). */
  previewBad?: boolean;
  /** A hub install / an import: `lost` installs and answers a gateway error; `notApplied` answers it and installs nothing;
   *  `refuse` answers 400 bad_request (refused before any write); `store` answers 500 (unknown). For an import,
   *  `itemFails` answers 200 with the item failed (`itemDup`: failed as a same-name collision in the batch, `itemExists`: the folder already holds a skill), `noResult` imports it and answers 200 with no result for it, `noResultNone`
   *  answers that without importing. */
  install?: 'lost' | 'notApplied' | 'refuse' | 'store';
  imports?: 'lost' | 'notApplied' | 'refuse' | 'itemFails' | 'itemDup' | 'itemExists' | 'noResult' | 'noResultNone' | 'badItem';
  /** Tests only: the install / import answers once this settles. */
  installGate?: Promise<void>;
  /** Tests only: sees each request as it arrives. */
  onSend?: (r: FixtureRequest) => void;
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

// The hub's skills and the other tools' skill folders (the same on every computer). Placeholder packages: no real
// source, digest or file is named.
const HUB = 'skills.sh';
const HUB_SKILLS = [
  { source: 'atlas/skills', skillId: 'changelog', name: 'changelog', installs: 1200 },
  { source: 'atlas/skills', skillId: 'pdf-tools', name: 'pdf-tools', installs: 1 },
];
const HUB_CMD = 'ls -1 notes';
const HUB_BODY = `# Changelog\n\nWrite a changelog entry from the merged changes.\n\n!\`${HUB_CMD}\`\n`;
const DIGEST = 'sha256:0000fixture0000';
const SCANS: Record<string, Record<string, unknown>[]> = {
  claude: [
    { source: 'claude', name: 'review', rel_dir: 'review', dest_rel_dir: 'review', description: WORDS.review, dynamic_cmds: ['wc -l CHANGELOG.md'], bundled_files: ['checklist.md', '.env.local'], sensitive: ['.env.local'], parse_err: '', system: false, collision: '' },
    { source: 'claude', name: 'pdf-tools', rel_dir: 'pdf', dest_rel_dir: 'pdf-tools', description: WORDS.pdfForms, dynamic_cmds: [], bundled_files: [], sensitive: [], parse_err: '', system: false, collision: 'user' },
    { source: 'claude', name: 'half', rel_dir: 'half', dest_rel_dir: '', description: '', dynamic_cmds: [], bundled_files: [], sensitive: [], parse_err: 'missing frontmatter', system: false, collision: '' },
  ],
  codex: [
    { source: 'codex', name: 'plan', rel_dir: '.system/plan', dest_rel_dir: 'plan', description: WORDS.plan, dynamic_cmds: [], bundled_files: [], sensitive: [], parse_err: '', system: true, collision: '' },
  ],
};
let stamp = 0;
/** A fresh install time per install (the agent's are whole seconds; these never repeat). */
const nextTime = () => new Date(Date.UTC(2026, 9, 27, 12, 0, ++stamp)).toISOString().replace('.000', '');

export function skillRules(o: SkillOpts = {}): FixtureRule[] {
  const stores = new Map<string, SkillFixture[]>();
  const storeOf = (r: FixtureRequest): SkillFixture[] => {
    const id = r.target?.container.id ?? '';
    let st = stores.get(id);
    if (!st) stores.set(id, (st = (o.seed ?? skillSeed()).map((s) => ({ ...s }))));
    return st;
  };
  // The list, as Knowledge reads it and as a chat's folder does (the composer's "/" menu): one store, one answer.
  const list = (r: FixtureRequest) => {
    o.onSend?.(r);
    if (typeof o.listFails === 'function' ? o.listFails() : o.listFails) return answers.refused(500, 'internal_error');
    const store = storeOf(r);
    if (typeof o.listPartial === 'function' ? o.listPartial() : o.listPartial) return answers.ok({ items: store.slice(1).map((s) => ({ ...s })), meta: { total: store.length } });
    const drop = o.listDrop?.();
    const rows = store.filter((s) => !(drop && s.root_id === 'user' && s.rel_dir === drop)).map((s) => ({ ...s }));
    const shape = o.listShape?.();
    if (shape === 'noTotal') return answers.ok({ items: rows });
    if (shape === 'negTotal') return answers.ok({ items: [], meta: { total: -1 } });
    if (shape === 'fracTotal') return answers.ok({ items: rows, meta: { total: rows.length - 0.5 } });
    if (shape === 'lowTotal') return answers.ok({ items: rows, meta: { total: rows.length - 1 } });
    if (shape === 'noRelDir') return answers.ok({ items: rows.map((s, i) => (i === 0 ? { ...s, rel_dir: undefined } : s)), meta: { total: rows.length } });
    return answers.ok({ items: rows, meta: { total: rows.length } });
  };
  return [
    reply(skillRoutes.list, list),
    reply(skillRoutes.listIn, list),
    // A skill's SKILL.md as installed (a header and its description; the same on every computer).
    reply(skillRoutes.source, async (r) => {
      o.onSend?.(r);
      const own = o.sourceFor?.(r);
      if (own?.wait) await own.wait;
      if (o.sourceFails) return answers.refused(500, 'internal_error');
      if (o.sourceEmpty) return answers.ok({ status: 'ok', gen: 1 });
      const s = storeOf(r).find((x) => x.root_dir === r.query.root_dir && x.rel_dir === r.query.rel_dir);
      if (!s) return answers.refused(404, 'not_found');
      const words = own?.words ?? s.description ?? '';
      const content = `---\nname: ${s.name}\ndescription: ${words}\n---\n\n# ${s.name}\n\n${words}\n\n![chart](https://img.example.com/chart.png)\n`;
      return answers.ok({ status: 'ok', content, gen: 1, path: `${s.dir}/SKILL.md` });
    }),
    reply(skillRoutes.toggle, (r) => {
      o.onSend?.(r);
      if (o.refuse) return answers.refused(404, 'not_found');
      if (o.busy) return answers.refused(503, 'service_unavailable');
      const store = storeOf(r);
      if (o.notApplied) return answers.pending5xx();
      const b = rec(r.body);
      const name = typeof b.name === 'string' ? b.name : '';
      const off = b.disabled === true;
      if (off && !store.some((s) => s.name === name)) return answers.refused(404, 'not_found');
      for (const s of store) if (s.name === name && !s.parse_err) s.disabled = off;
      return o.lost ? answers.pending5xx() : answers.ok({ status: 'ok' });
    }),
    reply(skillRoutes.hubSearch, (r) => {
      o.onSend?.(r);
      const q = String(r.query.query ?? '').toLowerCase();
      const results = HUB_SKILLS.filter((h) => h.name.includes(q)).map((h) => ({ ref: { provider: HUB, source: h.source, skill_id: h.skillId }, name: h.name, source: h.source, installs: h.installs }));
      return answers.ok({ status: 'ok', results, envelope: { cached: !!o.hubOld, stale: !!o.hubOld, provider: HUB } });
    }),
    reply(skillRoutes.hubPreview, (r) => {
      o.onSend?.(r);
      const h = HUB_SKILLS.find((x) => x.skillId === r.query.skill_id && x.source === r.query.source);
      if (!h) return answers.refused(400, 'bad_request');
      return answers.ok({
        status: 'ok', ...(o.previewBad ? {} : { package_digest: `${DIGEST}${o.digestTag?.() ?? ''}${h.skillId}` }), name: h.skillId, source: h.source, provider: HUB, origin: o.hubOrigin ?? `${h.source}@fixture`, commit_sha: o.hubCommit ?? 'fixture0commit',
        body: o.hubBody ?? HUB_BODY, frontmatter: { name: h.name, description: WORDS.changelog }, files: [{ path: 'SKILL.md', size: 120 }, { path: 'template.md', size: 2048 }],
        dynamic_cmds: 1, dynamic_cmd_list: [HUB_CMD], bundled_files: ['template.md'], total_bytes: 2168, stars: 42,
        envelope: { cached: !!o.hubOld, stale: !!o.hubOld, provider: HUB },
      });
    }),
    reply(skillRoutes.hubInstall, async (r) => {
      o.onSend?.(r);
      if (o.installGate) await o.installGate;
      if (o.install === 'refuse') return answers.refused(400, 'bad_request');
      if (o.install === 'store') return answers.refused(500, 'internal_error');
      if (o.install === 'notApplied') return answers.pending5xx();
      const b = rec(r.body);
      const d = String(b.package_digest ?? '');
      const h = HUB_SKILLS.find((x) => d.startsWith(DIGEST) && d.endsWith(x.skillId));
      if (!h) return answers.refused(400, 'bad_request');
      const store = storeOf(r);
      const i = store.findIndex((x) => x.root_id === 'user' && x.rel_dir === h.skillId);
      if (i >= 0 && b.overwrite !== true) return answers.refused(400, 'bad_request');
      if (i >= 0) store.splice(i, 1);
      store.push({
        name: h.name, description: WORDS.changelog, root_id: 'user', ...at(USER, h.skillId), disabled: true, dynamic_cmds: 1, dynamic_cmd_list: [HUB_CMD],
        trust: { level: 'untrusted', provider: HUB, ref_source: h.source, ref_skill_id: h.skillId, installed_at: nextTime() }, realm: String(r.query.realm ?? 'global'),
      });
      return o.install === 'lost' ? answers.pending5xx() : answers.ok({ status: 'ok', root_dir: USER, rel_dir: h.skillId, name: h.name });
    }),
    reply(skillRoutes.importScan, (r) => {
      o.onSend?.(r);
      return answers.ok({ status: 'ok', skills: SCANS[String(r.query.source)] ?? [] });
    }),
    reply(skillRoutes.importApply, async (r) => {
      o.onSend?.(r);
      if (o.installGate) await o.installGate;
      if (o.imports === 'refuse') return answers.refused(400, 'bad_request');
      if (o.imports === 'notApplied') return answers.pending5xx();
      if (o.imports === 'noResultNone') return answers.ok({ status: 'ok', results: [] });
      if (o.imports === 'badItem') return answers.ok({ status: 'ok', results: (Array.isArray(rec(r.body).items) ? (rec(r.body).items as unknown[]) : []).map((it) => ({ rel_dir: rec(it).rel_dir })) });
      const b = rec(r.body);
      const src = String(b.source);
      const results = (Array.isArray(b.items) ? b.items : []).map((it) => {
        const item = rec(it);
        const e = (SCANS[src] ?? []).find((x) => x.rel_dir === item.rel_dir);
        if (!e || e.parse_err) return { source: src, rel_dir: item.rel_dir, ok: false, err: 'not importable' };
        if (o.imports === 'itemFails') return { source: src, rel_dir: item.rel_dir, ok: false, err: 'copy failed' };
        if (o.imports === 'itemExists') return { source: src, rel_dir: item.rel_dir, ok: false, kind: 'exists', err: 'skill "review" already installed — enable overwrite to replace' };
        if (o.imports === 'itemDup') return { source: src, rel_dir: item.rel_dir, ok: false, kind: 'dup_in_batch', err: 'another selected skill maps to the same name "review"' };
        const store = storeOf(r);
        const dest = String(e.dest_rel_dir);
        const i = store.findIndex((x) => x.root_id === 'user' && x.rel_dir === dest);
        if (i >= 0 && b.overwrite !== true) return { source: src, rel_dir: item.rel_dir, ok: false, kind: 'exists', err: 'already installed' };
        if (i >= 0) store.splice(i, 1);
        store.push({
          name: String(e.name), description: String(e.description), root_id: 'user', ...at(USER, dest), disabled: true,
          trust: { level: 'untrusted', provider: src, ref_source: item.rel_dir, installed_at: nextTime() }, realm: String(r.query.realm ?? 'global'),
        });
        return { source: src, rel_dir: item.rel_dir, name: e.name, ok: true };
      });
      if (o.imports === 'lost') return answers.pending5xx();
      return answers.ok({ status: 'ok', results: o.imports === 'noResult' ? [] : results });
    }),
  ];
}
