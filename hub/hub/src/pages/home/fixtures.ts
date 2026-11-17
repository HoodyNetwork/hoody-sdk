// Fake-API states of the home page for hub:dev, hub:shots, tests and specs, in core's format: the
// answers of the routes the page reads, built from the one fixture world (Ada, her realms, atlas).
import { answers, botsListRoute, defineFixtures, fixtureWorld, freeTierRoute, redeemRoute, reply, retrySetupRoute, serversRoute, setupFixtures, type FixtureRule } from '@core';
import { containersRoute, tokensRoute } from './data';

/** Redeem POSTs the fixture world received (tests assert a held change sends nothing again). */
export const sent = { redeem: 0, retry: 0 };
const W = fixtureWorld;
const personal = W.realms[0]!.id;
const raw = (c: (typeof W.computers)[number], createdAt = c.created_at) => ({
  id: c.id,
  name: c.name,
  status: c.status,
  project_id: c.project_id,
  server_name: c.server_name,
  realm_ids: c.realm_ids,
  created_at: createdAt,
  server: { country: c.server.country },
});
const here = W.computers.filter((c) => c.realm_ids.includes(personal));
const list = (rows: Array<Record<string, unknown>>) => reply(containersRoute, answers.ok({ data: { computers: rows } }));
const keys = (n: number) => reply(tokensRoute, answers.ok({ data: W.keys.slice(0, n).map((k) => ({ id: k.id })) }));

let firstReadAt = 0;
const firstReads = () => Date.now() - (firstReadAt ||= Date.now());

const many: FixtureRule[] = [list(here.map((c) => raw(c))), keys(2)];
// The setup read asks the same route with include_expired: core's setup rule answers that one, the empty list the rest.
const plainList = (rows: Array<Record<string, unknown>>) => reply(containersRoute, answers.ok({ data: { computers: rows } }), { when: (r) => !r.query.include_expired });
const setup = (kind: Parameters<typeof setupFixtures>[0], failed?: boolean): FixtureRule[] => [plainList([]), ...setupFixtures(kind, { signupCodeFailed: failed }), keys(0)];

export default defineFixtures({
  default: 'many',
  states: {
    many,
    // Two stopped computers in the realm and none chosen (the shell picks a running one by itself, so only a stopped
    // realm or the person's "All computers" choice leaves it unchosen): the dashboard asks which one to show.
    pickOne: [list([{ ...raw(here[0]!), status: 'stopped' }, { ...raw(here[0]!), id: 'b'.repeat(24), name: 'orion', status: 'stopped' }]), keys(2)],
    // Pick-one with a computer that needs a look (tests: the chooser stays above Needs you).
    pickOneAttention: [list([{ ...raw(here[0]!), status: 'stopped' }, { ...raw(here[0]!), id: 'b'.repeat(24), name: 'orion', status: 'failed' }]), keys(2)],
    provisioning: setup('provisioning'),
    loading: [reply(containersRoute, answers.slow({ data: { computers: [] } }, 600000)), keys(0)],
    failed: [reply(containersRoute, answers.refused(500, 'SERVER_ERROR')), keys(0)],
    emptyRealm: [list([]), keys(0)],
    invite: setup('invite'),
    // Setup never finishes (the polls run out and it stalls) and a retry is answered "blocked".
    stalledBlocked: [reply(retrySetupRoute, () => { sent.retry += 1; return answers.ok({ data: { blocked_reason: 'support_required' } }); }), ...setup('provisioning')],
    // The redeem is answered 200 with a reason the setup state does not show.
    inviteBlocked200: [reply(redeemRoute, answers.ok({ data: { claim_blocked_reason: 'account_flagged' } })), ...setup('invite')],
    // The redeem is refused by a busy server (429), not as a wrong code.
    inviteTrouble: [reply(redeemRoute, answers.refused(429, 'RATE_LIMITED')), ...setup('invite')],
    inviteFailed: setup('invite', true),
    // The redeem answer is lost and the read-back fails: the action stays locked.
    inviteRedeemLost: [reply(redeemRoute, () => { sent.redeem += 1; return answers.pending5xx(502); }), reply(containersRoute, answers.ok({ data: { computers: [] } }), { times: 1, when: (r) => !r.query.include_expired }), reply(containersRoute, answers.refused(500, 'SERVER_ERROR'), { when: (r) => !r.query.include_expired }), ...setupFixtures('invite'), keys(0)],
    // The redeem answer is lost, the first read-back fails and the next one answers: Check again opens the hold.
    inviteRedeemRecover: [reply(redeemRoute, () => { sent.redeem += 1; return answers.pending5xx(502); }), reply(containersRoute, answers.ok({ data: { computers: [] } }), { times: 1, when: (r) => !r.query.include_expired }), reply(containersRoute, answers.refused(500, 'SERVER_ERROR'), { times: 1, when: (r) => !r.query.include_expired }), reply(containersRoute, answers.ok({ data: { computers: [] } })), ...setupFixtures('invite'), keys(0)],
    // The sign-up code was refused, and a redeem's answer is lost with the read-back failing.
    inviteFailedThenLost: [reply(redeemRoute, () => { sent.redeem += 1; return answers.pending5xx(502); }), reply(containersRoute, answers.ok({ data: { computers: [] } }), { times: 1, when: (r) => !r.query.include_expired }), reply(containersRoute, answers.refused(500, 'SERVER_ERROR'), { when: (r) => !r.query.include_expired }), ...setupFixtures('invite', { signupCodeFailed: true }), keys(0)],
    capacity: setup('capacity'),
    mailbox: setup('mailbox'),
    expired: setup('expired'),
    // host_reinstalled: the server of the account's expired computers was reinstalled (delete them in Projects).
    // The account has no server left (its rental ended too): Rent a server beside Projects.
    reinstalled: setup('reinstalled'),
    // It still has a server or slice with room: Get a computer beside Projects.
    reinstalledServer: [plainList([]), ...setupFixtures('reinstalled', { servers: true }), keys(0)],
    // Only a free slice whose room the answer does not say: Get a computer and Rent a server.
    reinstalledSlice: [plainList([]), ...setupFixtures('reinstalled', { servers: 'slice' }), keys(0)],
    // The server list could not be read: room unknown, so Rent (never Get a computer on a guess).
    reinstalledServersDown: [reply(serversRoute, answers.refused(500, 'SERVER_ERROR')), ...setup('reinstalled')],
    // A brand-new account's first visit: the computer is being made (setup is read), then the next poll finds it, so
    // Home shows the first-run view (its title and Open) that only an observed setup earns.
    // The list is empty for the first 3 s of reads (the shell reads it too), so the first poll (5 s) finds the computer.
    firstVisit: [reply(containersRoute, answers.ok({ data: { computers: [] } }), { when: (r) => !r.query.include_expired && firstReads() < 3000 }), ...setupFixtures('provisioning'), list([raw(here[0]!, new Date().toISOString())]), keys(0)],
    // One computer and no API key yet: first steps are half done.
    newAccount: [list([raw(here[0]!, new Date().toISOString())]), keys(0)],
    // A new account whose one computer is still being made: Home opens the tour once (pages/onboarding).
    firstMaking: [list([{ ...raw(here[0]!, new Date().toISOString()), status: 'claiming' }]), keys(0)],
    factsUnknown: [list(here.map((c) => raw(c))), reply(tokensRoute, answers.refused(500, 'SERVER_ERROR'))],
    allKeys: [list(here.map((c) => raw(c))), keys(3)],
    // The realm holds a computer in a state that needs a look (ember failed) and a running computer's Bot waits at a
    // gate: Needs you names both.
    attention: [
      list([...here.map((c) => raw(c)), { ...raw(W.computers.find((c) => c.name === 'ember')!), realm_ids: [personal] }]),
      reply(botsListRoute, answers.ok({ items: [{ id: 'bot1', pending_gate: { gate_id: 'g1' } }, { id: 'bot2' }] })),
      keys(2),
    ],
    // Rows of another realm in the answer (realm host scoping off): Home shows only the realm's own.
    otherRealmRows: [list([...here.map((c) => raw(c)), { ...raw(W.computers.find((c) => c.name === 'ember')!), realm_ids: ['f'.repeat(24)] }]), keys(2)],
    // A 200 whose body holds no list (a read error, never "no computers").
    badBody: [reply(containersRoute, answers.ok({ data: {} })), keys(0)],
    // A full first page (100 rows, none in this realm) with no pagination: not known to be the whole list.
    fullPageNoPaging: [list(Array.from({ length: 100 }, (_, i) => ({ ...raw(here[0]!), id: i.toString(16).padStart(24, 'c'), name: `far-${i}`, realm_ids: ['f'.repeat(24)] }))), keys(0)],
    // An empty realm read once, then every list read fails (a refetch keeps the empty rows with the error). The setup read answers,
    // so only the list read can fail the page.
    emptyThenFail: [
      reply(containersRoute, answers.ok({ data: { computers: [] } }), { times: 1, when: (r) => !r.query.include_expired }),
      reply(containersRoute, answers.refused(500, 'SERVER_ERROR'), { when: (r) => !r.query.include_expired }),
      ...setupFixtures('provisioning'),
      keys(0),
    ],
    // The realm's computers read once, then every list read fails: the rows stay, with the stale band.
    manyThenFail: [
      reply(containersRoute, answers.ok({ data: { computers: here.map((c) => raw(c)) } }), { times: 1, when: (r) => !r.query.include_expired }),
      reply(containersRoute, answers.refused(500, 'SERVER_ERROR'), { when: (r) => !r.query.include_expired }),
      keys(2),
    ],
    // The realm's computers read once, then a 200 whose body holds no list: the rows stay, with the stale band.
    manyThenBad: [
      reply(containersRoute, answers.ok({ data: { computers: here.map((c) => raw(c)) } }), { times: 1, when: (r) => !r.query.include_expired }),
      reply(containersRoute, answers.ok({ data: {} }), { when: (r) => !r.query.include_expired }),
      keys(2),
    ],
    // A redeem answer is lost; the read-back lists only rows with no usable id. Those prove no computer: the hold stays.
    inviteRedeemJunk: [
      reply(redeemRoute, () => { sent.redeem += 1; return answers.pending5xx(502); }),
      reply(containersRoute, answers.ok({ data: { computers: [] } }), { times: 1, when: (r) => !r.query.include_expired }),
      reply(containersRoute, answers.ok({ data: { computers: [{}, null, { id: '' }, { id: 123 }] } }), { when: (r) => !r.query.include_expired }),
      ...setupFixtures('invite'),
      keys(0),
    ],
    // The account has no computer and its setup state is still being read: the skeleton, never "being prepared".
    setupUnread: [
      reply(containersRoute, answers.ok({ data: { computers: [] } }), { when: (r) => !r.query.include_expired }),
      reply(containersRoute, answers.ok({ data: { computers: [] } }), { when: (r) => r.query.include_expired === 'true' }),
      reply(freeTierRoute, answers.slow({ data: { gate_enabled: false } }, 600000)),
      keys(0),
    ],
    // The account has no computer and its setup state cannot be read: the read error with Try again, never "being prepared".
    setupFailed: [
      reply(containersRoute, answers.ok({ data: { computers: [] } }), { when: (r) => !r.query.include_expired }),
      reply(containersRoute, answers.ok({ data: { computers: [] } }), { when: (r) => r.query.include_expired === 'true' }),
      reply(freeTierRoute, answers.refused(500, 'SERVER_ERROR')),
      keys(0),
    ],
    // A computer whose name is long enough to wrap or cut anywhere it shows.
    longName: [list([{ ...raw(here[0]!, new Date().toISOString()), name: 'production-build-runner-singapore-01' }]), keys(0)],
  },
});

/** A new terminal session starts (term/app/boot.ts, through app/fixtures.ts resetFixtureServers): this fake server
 *  forgets the last one. Every fixture module with memory exports this name (pages/fixture-memory.term.test.ts). */
export function resetFixtureServer(): void {
  sent.redeem = 0;
  sent.retry = 0;
  firstReadAt = 0;
}
