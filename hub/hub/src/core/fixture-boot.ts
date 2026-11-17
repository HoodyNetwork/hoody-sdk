// fixture-boot.ts: boots core on fixtureWorld for page tests, hub:dev and hub:shots, without shared.js.
//
// Contract, in plain words:
//   - bootFixtureCore(o) installs the fixture session (Ada, always held; registry-aware storage rules copied from
//     shared.js, so useAccountPref, localSetting and the purge behave as live) and the fixture transport with the
//     page's rules first and core's own after them (account, realm list, aliases, setup reads). The realm list,
//     names and tints are known at once (nothing to wait for), the selected realm is Personal and the current
//     computer is atlas unless o says otherwise.
//   - Every call starts a fresh world: the generation moves (old queries drop), page-only values and module state
//     of core reset, and the registered hub keys in this browser's storage are removed unless o.keepStorage (the
//     dev server keeps a reload's choices). o.storage seeds values after that.
//   - It refuses (throws FIXTURES_REFUSED, nothing cleared) on a live page: a production build or a page where the
//     real shared.js is loaded.
import { aliasesReply, coreFixtures, fixtureRealmCap, worldAliases, worldUsage } from './fixtures';
import { parseRealmCap, REALM_CAP_FIELD } from './realmLimit';
import { hostEnv, localStore } from './host-env';
import { bump, setIdentity } from './ctx';
import { resetComputer } from './computer';
import { resetNotifications } from './notifications';
import { resetOtp } from './otp';
import { resetPrefs } from './prefs';
import { hookPurge, PALETTE, realmsRoute, resetRealm, seedForFixtures, type RealmColor } from './realm';
import { registryEntry } from './registry';
import { resetSetup } from './setup';
import { resetToken, seedCapsForFixtures } from './token';
import { answers, FIXTURE_REALM, fixturesAllowed, reply, startFixtureMode, type FixtureOptions, type FixtureRule, type FixtureTransport } from './transport';
import { defineRoute } from './routes';
import { fixtureWorld } from './world';
import type { Target } from './ctx';
import { installFixtureSeam } from './fixture-seam';

// Live code reads the world's computers through the seam (fixtureComputer), never by importing the world.
installFixtureSeam({ computer: (id) => fixtureWorld.computers.find((c) => c.id === id) });

export interface FixtureBootOptions extends FixtureOptions {
  /** The page's rules; they win over core's. */
  rules?: readonly FixtureRule[];
  /** Which of core's states fills in behind the page's rules (default 'default'). */
  coreState?: keyof typeof coreFixtures.states;
  /** 'all' or a realm id of the world (default Personal). */
  realm?: string;
  /** The current computer (default atlas); null for none. */
  target?: Target | null;
  framed?: boolean;
  /** Values put in localStorage after the reset. */
  storage?: Readonly<Record<string, string>>;
  /** Keep this browser's registered hub keys (the dev server). */
  keepStorage?: boolean;
}

function clearRegistered(): void {
  for (const [area, box] of [['local', hostEnv().local], ['session', hostEnv().session]] as const) {
    if (!box) continue;
    try {
      const doomed: string[] = [];
      for (let i = 0; i < box.length; i++) { const k = box.key(i); if (k !== null && registryEntry(area, k)) doomed.push(k); }
      for (const k of doomed) box.removeItem(k);
    } catch { /* storage unavailable: nothing to clear */ }
  }
}

/** Boots core on fixtureWorld (see the contract). Returns the fixture transport's controls. */
/** A page's fixture world with these realms (a long realm list, a realm picker's cap): the realm list core is booted
 *  with, its names (the world's, then `aliases`), and the list and alias reads for a later refresh. Put the rules in a
 *  page fixture state's rule list; the route stays core's own. */
interface RealmsSpec { readonly ids: readonly string[]; readonly aliases: Readonly<Record<string, string>> }
const realmsMarker = defineRoute<unknown>({ method: 'GET', path: '/__fixture/realms', scope: 'base' });
const realmSpecs = new WeakMap<FixtureRule, RealmsSpec>();
export function realmsFixture(ids: readonly string[], aliases: Readonly<Record<string, string>> = {}): FixtureRule[] {
  const spec: RealmsSpec = Object.freeze({ ids: Object.freeze([...ids]), aliases: Object.freeze({ ...worldAliases(), ...aliases }) });
  const marker = reply(realmsMarker, { status: 404, body: {} }, { when: () => false });
  realmSpecs.set(marker, spec);
  return [
    marker,
    reply(realmsRoute, answers.ok({ data: { realm_ids: [...spec.ids], usage: usageOf(spec.ids) } })),
    aliasesReply(spec.aliases),
  ];
}
function usageOf(ids: readonly string[]): Record<string, { computers: number }> {
  const used = worldUsage();
  return Object.fromEntries(ids.map((id) => [id, { computers: used[id]?.computers ?? 0 }]));
}

/** A fixture session other than the default account session: a shared-access (token) link with these
 *  capabilities (dotted leaves as useCan names them, e.g. 'computers.actions.start'; 'events' and 'vault' for
 *  the flag pairs), pinned to `realm` (default: the booted realm). */
export interface FixtureSessionSpec { readonly kind: 'token'; readonly caps: readonly string[]; readonly realm?: string }
// The marker rule never answers a request (a route no page sends, `when` false): bootFixtureCore reads it.
const sessionMarker = defineRoute<unknown>({ method: 'GET', path: '/__fixture/session', scope: 'base' });
const sessions = new WeakMap<FixtureRule, FixtureSessionSpec>();
/** A fixture rule that boots the state as this session (put it in a page fixture state's rule list):
 *  useCan/can then answer from `caps`, and account-only reads and actions are refused as on a live token link. */
export function fixtureSession(spec: FixtureSessionSpec): FixtureRule {
  const rule = reply(sessionMarker, { status: 404, body: {} }, { when: () => false });
  sessions.set(rule, Object.freeze({ kind: spec.kind, caps: Object.freeze([...spec.caps]), ...(spec.realm !== undefined ? { realm: spec.realm } : {}) }));
  return rule;
}

export function bootFixtureCore(o: FixtureBootOptions = {}): FixtureTransport {
  // Before anything is cleared: on a live page this refuses and touches nothing.
  if (!fixturesAllowed()) throw new Error('FIXTURES_REFUSED: fixture mode on a live page');
  bump('fixture-boot');
  resetRealm(); resetPrefs(); resetToken(); resetSetup(); resetOtp(); resetComputer(); resetNotifications();
  if (!o.keepStorage) clearRegistered();
  for (const [k, v] of Object.entries(o.storage ?? {})) { try { localStore().setItem(k, v); } catch { /* storage unavailable */ } }
  const { rules, coreState, storage: _s, keepStorage: _k, ...rest } = o;
  const session = (rules ?? []).map((r) => sessions.get(r)).find((x) => x !== undefined);
  const token = session ? { realm: session.realm ?? rest.realm ?? FIXTURE_REALM } : undefined;
  const t = startFixtureMode([...(rules ?? []), ...coreFixtures.states[coreState ?? 'default']], { ...rest, ...(token ? { token } : {}) });
  if (session) seedCapsForFixtures(session.caps);
  hookPurge();
  const W = fixtureWorld;
  // A page state's realmsFixture names the realm list; else the world's.
  const realms = (rules ?? []).map((r) => realmSpecs.get(r)).find((x) => x !== undefined);
  seedForFixtures({
    list: realms ? [...realms.ids] : W.realms.map((r) => r.id),
    usage: realms ? usageOf(realms.ids) : Object.fromEntries(W.realms.map((r) => [r.id, { computers: W.computers.filter((c) => c.realm_ids.includes(r.id)).length }])),
    aliases: realms ? { ...realms.aliases } : Object.fromEntries(W.realms.map((r) => [r.id, r.name])),
    // The world's tints; a realmsFixture's other realms take the palette in turn (a long list reads as many realms).
    colors: {
      ...(realms ? Object.fromEntries(realms.ids.map((id, i) => [id, PALETTE[i % PALETTE.length]!])) : {}),
      ...Object.fromEntries(W.realms.map((r) => [r.id, r.tint as RealmColor])),
    },
    // Dev and shots: the Realm limit `?realmcap=` names (none without it).
    cap: realms ? null : parseRealmCap({ [REALM_CAP_FIELD]: fixtureRealmCap() }),
  });
  setIdentity({ id: W.account.id, username: W.account.username, email: W.account.email, banned: false });
  return t;
}
