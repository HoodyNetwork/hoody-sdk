// fixtures.ts: core's own fake answers, so the shell boots and its realm switcher works in fixture mode.
// A page's fixtures go first in the rule list; these fill in the account and realm reads.
//   default      fixtureWorld: Ada signed in, its realms named by their aliases, every switch succeeds
//   suspended    the account is suspended (bootLive answers 'banned')
//   switchFails  the target realm does not answer: the switch is refused and says so
//   slowSwitch   the probe takes 2.5 s (the switcher's busy state)
//   every state also answers GET /computers (containersRoute, realm-filtered world computers) and the bell (summary and list) from fixtureWorld's notifications
//   lifecycleFixtures (not a state: rules a page spreads into its own states, first) answer the shared computer
//                Start/Resume/Stop: ok, refused (409), or unknown (a 5xx: "may have gone through"; the world's
//                computers keep their status, so a read-back proves nothing and the change stays held)
//   setupInvite / setupInviteFailed / setupCapacity / setupMailbox / setupExpired / setupEmpty
//                the account setup state (useSetupState) when the account has no computer; default is
//                the free server claimed (setupFixtures 'provisioning', read as 'empty'). Redeem answers 'refresh', retry answers 'queued'.
import { containersRoute } from './computer';
import { hostEnv } from './host-env';
import { PLAN_REALMS, REALM_CAP_FIELD, REALM_CAP_MAX, REALM_CAP_REACHED, REALM_CAP_USED } from './realmLimit';
import { realm as selectedRealm } from './ctx';
import { meRoute } from './lifecycle';
import { computerLifecycleRoute } from './power';
import { notificationListRoute, notificationSummaryRoute } from './notifications';
import { probeRoute, realmsRoute, vaultKeyPutRoute, vaultKeyRoute } from './realm';
import { redeemRoute, retrySetupRoute, setupFixtures, type SetupKind } from './setup';
import { answers, defineFixtures, reply, type FixtureRule } from './transport';
import { fixtureWorld } from './world';

/** fixtureWorld's second realm (Acme client). */
export const FIXTURE_REALM_2 = fixtureWorld.realms[1]!.id;

const W = fixtureWorld;
const me = (banned: boolean) => reply(meRoute, answers.ok({ data: { id: W.account.id, username: W.account.username, email: W.account.email, is_banned: banned } }));
/** Computers per realm in the world. */
export const worldUsage = (): Record<string, { computers: number }> =>
  Object.fromEntries(W.realms.map((r) => [r.id, { computers: W.computers.filter((c) => c.realm_ids.includes(r.id)).length }]));
export const worldAliases = (): Record<string, string> => Object.fromEntries(W.realms.map((r) => [r.id, r.name]));
/** The Realm limit the sample world's realm list reports, by the page's `?realmcap=` (dev and shots): `under`, `at`,
 *  `over` (more realms than the limit, kept from before), `top` (the top plan at its limit), `limit` (an answer without
 *  the use). Without the parameter the answer carries no cap, as an API that reports none. */
export function fixtureRealmCap(): Record<string, unknown> | null {
  const which = new URLSearchParams(hostEnv().pageAddress?.search ?? '').get('realmcap') ?? '';
  const cap = (max: number, used: number | null): Record<string, unknown> => ({ [REALM_CAP_MAX]: max, ...(used === null ? {} : { [REALM_CAP_USED]: used }), [REALM_CAP_REACHED]: used !== null && used >= max });
  const n = W.realms.length;
  if (which === 'under') return cap(PLAN_REALMS.free, n);
  if (which === 'at') return cap(PLAN_REALMS.free, PLAN_REALMS.free);
  if (which === 'over') return cap(PLAN_REALMS.free, PLAN_REALMS.free + 3);
  if (which === 'top') return cap(PLAN_REALMS.bareMetal, PLAN_REALMS.bareMetal);
  if (which === 'limit') return cap(PLAN_REALMS.paid, null);
  return null;
}
const realms = reply(realmsRoute, () => {
  const cap = fixtureRealmCap();
  return answers.ok({ data: { realm_ids: W.realms.map((r) => r.id), usage: worldUsage(), ...(cap ? { [REALM_CAP_FIELD]: cap } : {}) } });
});
// The alias map's read carries an ETag, as the API's does, so a rename can send If-Match.
/** The fake answer of the alias map's read with these names. It lives here because this table is the one core file
 *  that may name a vault value route without sending it (realm.vault.guard.test.ts). */
export const aliasesReply = (aliases: Readonly<Record<string, string>>): FixtureRule =>
  reply(vaultKeyRoute, { ...answers.ok({ data: { value: JSON.stringify(aliases) } }), headers: { etag: '"aliases-1"' } });
const vault = [aliasesReply(worldAliases()), reply(vaultKeyPutRoute, answers.ok({}))];

// The bell: fixtureWorld's notifications, newest first; the list answers either box, one page.
const unread = W.notifications.filter((n) => !n.read);
const wireNotice = (n: (typeof W.notifications)[number]) => ({ id: n.id, title: n.title, message: n.body, severity: n.kind.toUpperCase(), created_at: n.at, is_read: n.read });
const notices = [
  reply(notificationSummaryRoute, answers.ok({ data: { unread_count: unread.length, is_capped: false, latest_id: unread[0]?.id ?? null, latest_created_at: unread[0]?.at ?? null, poll_interval_seconds: 300 } })),
  reply(notificationListRoute, (req) => {
    const rows = W.notifications.filter((n) => (req.query.unread_only === 'true' ? !n.read : req.query.read_only === 'true' ? n.read : true));
    return { status: 200, body: { data: rows.map(wireNotice), pagination: { total: rows.length, totalPages: 1 } } };
  }),
];

// The computer list: fixtureWorld's computers in the selected realm ('all': every one).
const computers = reply(containersRoute, () => {
  const r = selectedRealm();
  return { status: 200, body: { data: { computers: W.computers.filter((c) => r === 'all' || c.realm_ids.includes(r)) } } };
});

const setupActs = [reply(redeemRoute, answers.ok({ data: {} })), reply(retrySetupRoute, answers.ok({ data: {} }))];
const base = [me(false), realms, reply(probeRoute, answers.ok({ data: [] })), ...vault, ...setupActs, ...notices, computers];
const setup = (k: SetupKind, signupCodeFailed?: boolean) => [...setupFixtures(k, { signupCodeFailed }), ...base];

/** The shared computer lifecycle change's answers, for a page's own fixture states (spread them first). */
export const lifecycleFixtures = Object.freeze({
  ok: [reply(computerLifecycleRoute, answers.ok({ data: {} }))],
  refused: [reply(computerLifecycleRoute, answers.refused(409, 'INVALID_STATE'))],
  unknown: [reply(computerLifecycleRoute, answers.pending5xx())],
});

export const coreFixtures = defineFixtures({
  default: 'default',
  states: {
    default: setup('provisioning'),
    setupInvite: setup('invite'),
    setupInviteFailed: setup('invite', true),
    setupCapacity: setup('capacity'),
    setupMailbox: setup('mailbox'),
    setupExpired: setup('expired'),
    setupEmpty: setup('empty'),
    suspended: [me(true), realms, reply(probeRoute, answers.ok({ data: [] })), ...vault, ...setupActs, ...setupFixtures('provisioning'), ...notices],
    switchFails: [me(false), realms, reply(probeRoute, answers.pending5xx(503)), ...vault, ...notices],
    slowSwitch: [me(false), realms, reply(probeRoute, answers.slow({ data: [] })), ...vault, ...notices],
  },
});
