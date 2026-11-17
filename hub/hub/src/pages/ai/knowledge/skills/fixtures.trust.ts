// Fake agent answers for skill trust, as the agent does them: one store per computer for the list and the trust
// change, so a grant shows in the next list. Each skill has the files as installed (`installed`, the record's digests) and as
// on disk (`disk`): a recorded skill whose two differ lists as changed (level untrusted, tampered). A grant re-reads the disk
// (installed := disk); with verify_unchanged it is refused 400 (no code, nothing written) when they differ. A skill with no
// record (made here) is refused 404 not_found. `lost` applies and answers with a gateway error (unknown); `notApplied` answers
// that way and writes nothing; `failStore` answers 500 store_failed without writing (unknown to the Hub).
import { answers, reply, type FixtureRequest, type FixtureRule } from '@core';
import { skillSeed, type SkillFixture } from './fixtures';
import { skillRoutes } from './routes';
import { trustRoute } from './trust';

export interface TrustSkill extends SkillFixture {
  /** The files as recorded at install, and as on disk now (any string: equal means unchanged). */
  installed?: string;
  disk?: string;
}

// What the added fixture skill's own SKILL.md says (the agent's text, shown as it is).
const LINT_WORDS = 'Fix lint errors.';

/** The default world plus a skill whose files changed since install. */
export function trustSeed(realm = 'global'): TrustSkill[] {
  const base: TrustSkill[] = skillSeed(realm).map((s) => (s.trust ? { ...s, installed: 'v1', disk: 'v1' } : { ...s }));
  base.push({
    name: 'lint-fix', description: LINT_WORDS, root_id: 'user', root_dir: '/home/ada/.hoody/skills', rel_dir: 'lint-fix',
    dir: '/home/ada/.hoody/skills/lint-fix', dynamic_cmds: 1, dynamic_cmd_list: ['npm run lint -- --fix'],
    trust: { level: 'trusted', provider: 'skill hub', ref_source: 'hoody/lint-fix' }, installed: 'v1', disk: 'v2', realm,
  });
  return base;
}

export interface TrustOpts {
  /** The store the rules use (a test keeps it to change files on disk); default: trustSeed() per computer. */
  store?: TrustSkill[];
  lost?: boolean;
  notApplied?: boolean;
  failStore?: boolean;
  busy?: boolean;
  onSend?: (r: FixtureRequest) => void;
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The list entry as the agent shows it: a changed recorded skill reads untrusted and tampered. */
function listed(s: TrustSkill): Record<string, unknown> {
  const { installed, disk, ...out } = s;
  if (s.trust && installed !== disk) out.trust = { ...s.trust, level: 'untrusted', tampered: true };
  return { ...out };
}

export function trustRules(o: TrustOpts = {}): FixtureRule[] {
  const stores = new Map<string, TrustSkill[]>();
  const storeOf = (r: FixtureRequest): TrustSkill[] => {
    if (o.store) return o.store;
    const id = r.target?.container.id ?? '';
    let st = stores.get(id);
    if (!st) stores.set(id, (st = trustSeed()));
    return st;
  };
  return [
    reply(skillRoutes.list, (r) => {
      o.onSend?.(r);
      const store = storeOf(r);
      return answers.ok({ items: store.map(listed), meta: { total: store.length } });
    }),
    reply(trustRoute, (r) => {
      o.onSend?.(r);
      if (o.busy) return answers.refused(503, 'service_unavailable');
      if (o.notApplied) return answers.pending5xx();
      if (o.failStore) return answers.refused(500, 'store_failed');
      const b = rec(r.body);
      const s = storeOf(r).find((x) => x.root_dir === b.root_dir && x.rel_dir === b.rel_dir);
      if (!s || !s.trust) return answers.refused(404, 'not_found');
      if (b.trusted === true) {
        if (b.verify_unchanged === true && s.installed !== s.disk) return answers.refused(400, 'bad_request');
        s.installed = s.disk;
        s.trust = { ...s.trust, level: 'trusted' };
      } else {
        s.trust = { ...s.trust, level: 'untrusted' };
      }
      return o.lost ? answers.pending5xx() : answers.ok({ status: 'ok' });
    }),
  ];
}
