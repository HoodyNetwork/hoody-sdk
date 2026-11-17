// Rules & safety in fixture mode (dev and shots). The agent features: one set of values per computer (the features are
// process-wide); a PATCH sets the names it sends and answers the features after the write. Folder path rules (when
// mounted): one folder's places, the same for every folder, with two paths inside the agent's own folder not listed. The checked rules and the hooks
// are what getHookRules and listHooks answer, read only, so both lists show rows in a browser.
import { answers, reply, type FixtureRequest, type FixtureRule } from '@core';
import type { SettingsSessions } from '../connections/fixtures';
import { featureRoutes } from './features.routes';
import { rulesRoutes } from './routes';

const SEED = { read_agents_md: true, read_claude_md: true, account_rotation: true, session_titles: true, hooks_agent_self_trust: false } as const;
const DEFAULTS: Record<string, boolean> = { ...SEED };
const WRITABLE = new Set(['read_agents_md', 'read_claude_md', 'account_rotation', 'session_titles']);

export function featureRules(): FixtureRule[] {
  const values = new Map<string, Record<string, boolean>>();
  const of = (r: FixtureRequest) => {
    const id = r.target?.container.id ?? '';
    if (!values.has(id)) values.set(id, { ...SEED });
    return values.get(id)!;
  };
  const body = (v: Record<string, boolean>) => ({
    features: Object.keys(SEED).map((name) => ({ name, value: v[name], default: DEFAULTS[name], set: v[name] !== DEFAULTS[name], writable: WRITABLE.has(name) })),
  });
  return [
    reply(featureRoutes.features, (r) => answers.ok(body(of(r)))),
    reply(featureRoutes.where, () => answers.ok({ allowed_directories: ['/srv/shared'], deny_paths: ['/home/ada/.ssh', '/home/ada/.aws'], deny_paths_hidden: 2 })),
    reply(featureRoutes.setFeatures, (r) => {
      const v = of(r);
      const sent = ((r.body ?? {}) as { features?: Record<string, unknown> }).features ?? {};
      for (const [k, x] of Object.entries(sent)) {
        if (!WRITABLE.has(k)) return answers.refused(403, 'settings_key_protected');
        if (typeof x !== 'boolean') return answers.refused(400, 'bad_request');
      }
      Object.assign(v, sent);
      return answers.ok(body(v));
    }),
  ];
}

const USER_FILE = '/home/ada/.hoody/settings.json';

/** The rules block of both reads: the user scope only (a read for no folder), complete, one revision. A rule text runs long so a
 *  narrow list wraps it. */
export const RULES_BLOCK = {
  live: [
    { id: 'rule-push', text: 'Never push to main; open a pull request instead.', kind: 'limit', tools: ['bash'], agents: [], scope: 'user' },
    {
      id: 'rule-migrations',
      text: 'Ask before changing a database migration, a deployment manifest or anything under infrastructure/, and say which environment the change reaches.',
      kind: 'check_in', tools: ['write_file', 'edit_file'], agents: [], scope: 'user',
    },
    { id: 'rule-english', text: 'Answer in British English.', kind: 'guidance', tools: [], agents: [], scope: 'user' },
  ],
  scopes: [{ scope: 'user', revision: 'rev-user-1' }],
  rules_complete: true,
  rule_warnings: [],
  warnings: [],
  timeout_ms: 20000,
  exec_trust: [],
} as const;

/** The user layer's hooks: a long command behind a five-tool matcher, one switched off, one with a label. */
const USER_HOOKS = [
  {
    event: 'PreToolUse', matcher: 'Bash|Write|Edit|MultiEdit|NotebookEdit',
    command: '/home/ada/.hoody/hooks/check-dangerous-commands-before-they-run.sh --strict --log /home/ada/.hoody/logs/hooks/pre-tool-use.log',
    timeout: 30, source: USER_FILE,
  },
  { event: 'PostToolUse', matcher: 'Write', command: 'prettier --write "$HOODY_TOOL_FILE"', source: USER_FILE, disabled: true },
  {
    event: 'Stop', matcher: '', command: '/home/ada/bin/notify-the-team-channel-that-the-agent-finished-its-turn --channel engineering-agents-and-automation',
    source: USER_FILE, label: 'Tell the team the agent finished',
  },
] as const;

/** listHooks of a settings session: the user layer's hooks, and on a session opened for a folder that folder's project hook
 *  (saved in `<folder>/.hoody/settings.json`). Trust is acknowledged (`ok`), so no Trust band shows. */
export function hooksListFor(cwd: string | undefined) {
  const project = cwd === undefined ? null : `${cwd.replace(/\/+$/, '')}/.hoody/settings.json`;
  return {
    status: 'ok',
    live: {
      hooks: [...USER_HOOKS, ...(project ? [{ event: 'PreToolUse', matcher: 'Bash', command: 'npm run lint -- --quiet', source: project }] : [])],
      disabled: false,
      warnings: [],
    },
    files: [{ scope: 'user', path: USER_FILE, exists: true }, ...(project ? [{ scope: 'project', path: project, exists: true }] : [])],
    stale: false,
    trust: { state: 'ok', hash: 'hooks-hash-1' },
    rules: RULES_BLOCK,
  };
}

/** listHooks answers on a settings session the session fixture (connections/fixtures.ts, mcpRules) has open, for the folder it
 *  was opened for, and refuses any other session as gone, as the agent does. */
export function ruleHookRules(sessions: SettingsSessions): FixtureRule[] {
  return [
    reply(rulesRoutes.get, answers.ok({ rules: RULES_BLOCK })),
    reply(rulesRoutes.list, (r) => {
      const sid = r.query.session_id ?? '';
      return sessions.has(sid) ? answers.ok(hooksListFor(sessions.get(sid))) : answers.refused(404, 'not_found');
    }),
  ];
}
