// Vitest: the Referrals writes under C9, through the real core over a recorded
// fetch (no mocked hook, no stubbed selector): a write whose answer is lost is held until a fresh `me` proves it, a
// press meanwhile sends nothing, and the hold outlives a reload, a realm switch and another tab. The fake API keeps
// one account: a "late commit" is the test changing it after the answer was lost.
// eslint-disable-next-line no-restricted-imports -- a test harness for the page's hooks and parts, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router for FaqLink (a memory history), not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, userEvent, waitFor, within } from '@app/testing';
import { useStrings } from '@kit';
import { CHANGE_STORE_KEY } from '@core/change-store';
import { reloadChangesForTests } from '@core/changes';
import { bump, setRealm } from '@core/ctx';
import { queryClient } from '@core/query';
import { boot, calls, onFetch, R1, R2, settle, type Call, type Reply } from '@core/test/env';
import { invalidateMe, useCreateCode, useJoin, useMe, useNote, useReleaseCode } from './data';
import { pageFaq } from './faq';
import { selectMe } from './logic';
import { CodeForm } from './parts/CodeForm';
import { CreditCard } from './parts/CreditCard';
import { HeldBanners, NoteBanner } from './parts/Held';
import { JoinAction } from './parts/JoinCard';
import { ReleaseButton } from './parts/ReleaseConfirm';
import strings from './strings.en.json';

type Mode = 'ok' | 'lost' | 'lostApplied' | readonly [number, string | null];
const LINK = 'https://api.hoody.com/auth/signup?ref=';
const srv = {
  enrolled: true,
  codes: ['k7m2q9xa', 'maya-builds'],
  me: 'ok' as 'ok' | 'malformed' | 'error',
  join: 'ok' as Mode,
  create: 'ok' as Mode,
  release: 'ok' as Mode,
  check: 'ok' as Mode,
};
const meBody = () => ({
  statusCode: 200,
  data: {
    eligible: true,
    enrolled: srv.enrolled,
    state: srv.enrolled ? 'active' : null,
    enrolment_open: true,
    level: 'referrer',
    rate_percent: '5',
    codes: srv.enrolled ? srv.codes.map((c, i) => ({ code: c, kind: i === 0 ? 'random' : 'vanity', state: 'active', link: LINK + c })) : [],
    vanity_codes_left: 2,
    counts: {},
    credit: {},
    monthly: [],
  },
});
const refuse = (status: number, code: string | null): Reply =>
  status === 429 ? { status, body: { statusCode: 429, error: 'Too Many Requests', message: 'slow down' }, ...(code ? { headers: { 'retry-after': code } } : {}) } : { status, body: { statusCode: status, error: code ?? 'Bad Request', message: 'refused' } };
/** One write: apply it and answer, lose it (with or without applying), or refuse it. */
function write(mode: Mode, apply: () => void, ok: () => Reply): Reply {
  if (mode === 'lost') return { status: 0, network: true };
  if (mode === 'lostApplied') {
    apply();
    return { status: 502, body: { error: 'BAD_GATEWAY' } };
  }
  if (mode !== 'ok') return refuse(mode[0], mode[1]);
  apply();
  return ok();
}
/** Base calls are relative to the page; agent and realm calls are absolute. */
const url = (c: Call) => new URL(c.url, 'https://base.invalid');
const path = (c: Call) => url(c).pathname.replace(/^\/api\/v1/, '');
function api(c: Call): Reply {
  const p = path(c);
  if (c.method === 'GET' && p === '/referrals/me') return srv.me === 'error' ? { status: 500, body: {} } : srv.me === 'malformed' ? { status: 200, body: { data: { enrolled: true, codes: meBody().data.codes } } } : { status: 200, body: meBody() };
  if (c.method === 'GET' && p === '/referrals/me/codes/check') {
    if (srv.check !== 'ok' && srv.check !== 'lost' && srv.check !== 'lostApplied') return refuse(srv.check[0], srv.check[1]);
    const code = url(c).searchParams.get('code') ?? '';
    if (code === 'taken-one') return { status: 200, body: { data: { code, valid: true, available: false, reason: 'REFERRAL_CODE_TAKEN' } } };
    return { status: 200, body: { data: { code, valid: true, available: true, reason: null } } };
  }
  if (c.method === 'POST' && p === '/referrals/me') return write(srv.join, () => { srv.enrolled = true; srv.codes = ['k7m2q9xa']; }, () => ({ status: 201, body: meBody() }));
  if (c.method === 'POST' && p === '/referrals/me/codes') {
    const code = String(c.body?.code);
    return write(srv.create, () => void srv.codes.push(code), () => ({ status: 201, body: { data: { code, kind: 'vanity', state: 'active', link: LINK + code } } }));
  }
  const rel = /^\/referrals\/me\/codes\/([^/]+)$/.exec(p);
  if (c.method === 'DELETE' && rel) {
    const code = decodeURIComponent(rel[1] ?? '');
    return write(srv.release, () => { srv.codes = srv.codes.filter((x) => x !== code); }, () => ({ status: 200, body: { data: { code, released: true } } }));
  }
  return { status: 200, body: { data: {} } };
}
const sent = (method: string, re: RegExp) => calls.filter((c) => c.method === method && re.test(path(c)));
const joins = () => sent('POST', /^\/referrals\/me$/);
const creates = () => sent('POST', /^\/referrals\/me\/codes$/);
const releases = () => sent('DELETE', /^\/referrals\/me\/codes\//);
const meReads = () => sent('GET', /^\/referrals\/me$/).length;

// The page's writes as the view wires them: held banners and the note on top, Join…, Release… on maya-builds, the form.
const hooks: { join?: ReturnType<typeof useJoin>; create?: ReturnType<typeof useCreateCode>; release?: ReturnType<typeof useReleaseCode> } = {};
function Writes() {
  const t = useStrings(strings);
  const read = useMe();
  const join = useJoin();
  const create = useCreateCode();
  const release = useReleaseCode();
  const [note, say] = useNote();
  useEffect(() => {
    hooks.join = join;
    hooks.create = create;
    hooks.release = release;
  });
  return (
    <div>
      <HeldBanners t={t} join={join} create={create} release={release} />
      <NoteBanner t={t} said={note} onClose={() => say(null)} />
      <span data-testid="me">{read.me ? (read.me.enrolled ? 'enrolled' : 'not-enrolled') : 'none'}</span>
      <JoinAction t={t} rate="5" rateAnswer={pageFaq(t).byId.rate} join={join} onNote={say} />
      <ReleaseButton t={t} code="maya-builds" release={release} onNote={say} />
      <CodeForm t={t} create={create} onNote={say} onGone={invalidateMe} />
    </div>
  );
}
// Join's confirm links to the share's answer (a FaqLink), which reads the location: the parts render under a router.
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => children }), history: createMemoryHistory({ initialEntries: ['/referrals'] }) }));
  return <RouterProvider router={router} />;
}
const wrap = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <Routed>{children}</Routed>
  </QueryClientProvider>
);
async function mount() {
  queryClient.clear();
  render(<Writes />, { wrapper: wrap });
  await act(() => settle());
}
const user = () => userEvent.setup();
async function pressJoin() {
  await user().click(screen.getByRole('button', { name: strings['join.action'] }));
  await user().click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['join.confirm'] }));
  await act(() => settle());
}
async function pressRelease(confirm = true) {
  await user().click(screen.getByRole('button', { name: 'Retire maya-builds' }));
  const d = within(await screen.findByRole('alertdialog'));
  await user().click(d.getByRole('button', { name: confirm ? strings['release.confirm'] : strings['release.keep'] }));
  await act(() => settle());
}
async function pressCreate(field: string) {
  const box = screen.getByRole('textbox', { name: strings['create.label'] });
  await user().clear(box);
  await user().type(box, field);
  await user().click(screen.getByRole('button', { name: strings['create.action'] }));
  await act(() => settle());
}
async function checkAgain(title: string) {
  const banner = screen.getByText(title).closest('[data-outcome]') as HTMLElement;
  await user().click(within(banner).getByRole('button', { name: 'Check again' }));
  await act(() => settle());
}
const banners = () => document.querySelectorAll('[data-outcome="pending"]').length;
const heldJoin = strings['held.join'];
const heldCreate = (c: string) => strings['held.create'].replace('{{code}}', c);
const heldRelease = (c: string) => strings['held.release'].replace('{{code}}', c);

beforeEach(() => {
  Object.assign(srv, { enrolled: true, codes: ['k7m2q9xa', 'maya-builds'], me: 'ok', join: 'ok', create: 'ok', release: 'ok', check: 'ok' });
  boot({ realm: R1 });
  onFetch(api);
});
afterEach(() => cleanup());

describe('join', () => {
  it('join_pending_never_resends: a lost answer is held; a second press sends nothing (READ_BACK_FIRST); 1 POST', async () => {
    Object.assign(srv, { enrolled: false, join: 'lost' });
    await mount();
    await pressJoin();
    expect(screen.getByText(heldJoin)).toBeInTheDocument();
    // The held banner stands in for the action: no second Join… to press.
    expect(screen.queryByRole('button', { name: strings['join.action'] })).toBeNull();
    let again!: Awaited<ReturnType<NonNullable<typeof hooks.join>['run']>>;
    await act(async () => {
      again = await hooks.join!.run({});
    });
    expect(again).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(joins()).toHaveLength(1);
  });

  it('pending_never_worded_failed: the held join says it may have gone through, never that it failed', async () => {
    Object.assign(srv, { enrolled: false, join: 'lost' });
    await mount();
    await pressJoin();
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/didn't go through|failed|Nothing was sent/i);
    expect(screen.getByText(heldJoin).closest('[data-outcome]')).toHaveAttribute('data-outcome', 'pending');
  });

  it('join_proof_only_applied_on_enrolled: not enrolled keeps it held; a late commit read as enrolled frees it', async () => {
    Object.assign(srv, { enrolled: false, join: 'lost' });
    await mount();
    await pressJoin();
    await checkAgain(heldJoin);
    expect(screen.getByText(heldJoin)).toBeInTheDocument();
    srv.enrolled = true;
    await checkAgain(heldJoin);
    await waitFor(() => expect(screen.queryByText(heldJoin)).toBeNull());
    expect(joins()).toHaveLength(1);
  });

  it('a lost answer that did apply is proven by the read-back right after it: nothing stays held', async () => {
    Object.assign(srv, { enrolled: false, join: 'lostApplied' });
    await mount();
    await pressJoin();
    await waitFor(() => expect(screen.queryByText(heldJoin)).toBeNull());
    expect(screen.getByTestId('me')).toHaveTextContent('enrolled');
    expect(joins()).toHaveLength(1);
  });

  it('already_enrolled_rereads: "You\'re already in." and `me` is read again', async () => {
    Object.assign(srv, { enrolled: false, join: [409, 'AFFILIATE_ALREADY_ENROLLED'] });
    await mount();
    const before = meReads();
    await pressJoin();
    expect(screen.getByText(strings['change.already'])).toBeInTheDocument();
    await waitFor(() => expect(meReads()).toBeGreaterThan(before));
    expect(banners()).toBe(0);
  });
});

describe('release', () => {
  it('release_needs_confirm: Cancel sends nothing', async () => {
    await mount();
    await pressRelease(false);
    expect(releases()).toHaveLength(0);
  });

  it('release_lost_then_double_press: held, the second Release… sends nothing; 1 DELETE of the listed code', async () => {
    srv.release = 'lost';
    await mount();
    await pressRelease();
    expect(screen.getByText(heldRelease('maya-builds'))).toBeInTheDocument();
    await pressRelease();
    expect(releases()).toHaveLength(1);
    expect(path(releases()[0]!)).toBe('/referrals/me/codes/maya-builds');
    expect(banners()).toBe(1);
  });

  it('release_proof_on_absence_only: still listed keeps it held; gone from the listing frees it', async () => {
    srv.release = 'lost';
    await mount();
    await pressRelease();
    await checkAgain(heldRelease('maya-builds'));
    expect(screen.getByText(heldRelease('maya-builds'))).toBeInTheDocument();
    srv.codes = ['k7m2q9xa'];
    await checkAgain(heldRelease('maya-builds'));
    await waitFor(() => expect(screen.queryByText(heldRelease('maya-builds'))).toBeNull());
  });

  it('a release refusal shows its words and reads `me` again', async () => {
    srv.release = [409, 'REFERRAL_CODE_NOT_REMOVABLE'];
    await mount();
    const before = meReads();
    await pressRelease();
    expect(await screen.findByText(strings['change.notRemovable'])).toBeInTheDocument();
    await waitFor(() => expect(meReads()).toBeGreaterThan(before));
  });
});

describe('create', () => {
  it('create_code_normalized_once: " New-Code " is sent as new-code, held as new-code, and "new-code" again sends nothing', async () => {
    srv.create = 'lost';
    await mount();
    await pressCreate(' New-Code ');
    expect(creates()).toHaveLength(1);
    expect(creates()[0]!.body).toEqual({ code: 'new-code' });
    expect(screen.getByText(heldCreate('new-code'))).toBeInTheDocument();
    expect(hooks.create!.held.map((h) => h.identity)).toEqual([{ code: 'new-code' }]);
    await pressCreate('new-code');
    expect(creates()).toHaveLength(1);
    expect(banners()).toBe(1);
  });

  it('create_proof_on_presence_only: absent keeps it held; the late commit listed frees it', async () => {
    srv.create = 'lost';
    await mount();
    await pressCreate('new-code');
    await checkAgain(heldCreate('new-code'));
    expect(screen.getByText(heldCreate('new-code'))).toBeInTheDocument();
    srv.codes.push('new-code');
    await checkAgain(heldCreate('new-code'));
    await waitFor(() => expect(screen.queryByText(heldCreate('new-code'))).toBeNull());
  });

  it('another code is its own change: it is sent while the first is held', async () => {
    srv.create = 'lost';
    await mount();
    await pressCreate('new-code');
    srv.create = 'ok';
    await pressCreate('other-code');
    expect(creates().map((c) => c.body.code)).toEqual(['new-code', 'other-code']);
  });

  // The malformed answer lists the new code but lacks the fields every answer has: a selector that filled them in
  // would read it as proof. It must stay held.
  it('malformed_readback_keeps_hold and failed_readback_keeps_hold', async () => {
    srv.create = 'lost';
    await mount();
    await pressCreate('new-code');
    srv.codes.push('new-code');
    srv.me = 'malformed';
    await checkAgain(heldCreate('new-code'));
    expect(screen.getByText(heldCreate('new-code'))).toBeInTheDocument();
    srv.me = 'error';
    await checkAgain(heldCreate('new-code'));
    expect(screen.getByText(heldCreate('new-code'))).toBeInTheDocument();
    srv.me = 'ok';
    await checkAgain(heldCreate('new-code'));
    await waitFor(() => expect(screen.queryByText(heldCreate('new-code'))).toBeNull());
  });

  it('hold_survives_reload: after a reload the hold shows, a press sends nothing, and only a proof frees it', async () => {
    srv.create = 'lost';
    await mount();
    await pressCreate('new-code');
    const sentBefore = creates().length;
    // A reload: the page and core's memory go, the stored records stay (core's own reload seam).
    cleanup();
    reloadChangesForTests();
    await mount();
    expect(screen.getByText(heldCreate('new-code'))).toBeInTheDocument();
    await pressCreate('new-code');
    expect(creates()).toHaveLength(sentBefore);
    await checkAgain(heldCreate('new-code'));
    expect(screen.getByText(heldCreate('new-code'))).toBeInTheDocument();
    srv.codes.push('new-code');
    await checkAgain(heldCreate('new-code'));
    await waitFor(() => expect(screen.queryByText(heldCreate('new-code'))).toBeNull());
  });

  it('hold_survives_realm_switch: the same hold in another realm view, and a press there sends nothing', async () => {
    srv.create = 'lost';
    await mount();
    await pressCreate('new-code');
    await act(async () => {
      setRealm(R2);
      bump('switch');
      await settle();
    });
    expect(screen.getByText(heldCreate('new-code'))).toBeInTheDocument();
    await pressCreate('new-code');
    expect(creates()).toHaveLength(1);
  });

  it('two_tabs_one_hold: a hold another tab stores shows here at once, and a press here sends nothing', async () => {
    srv.create = 'lost';
    await mount();
    await pressCreate('new-code');
    // eslint-disable-next-line no-restricted-globals -- the other tab's store, as it wrote it
    const stored = localStorage.getItem(CHANGE_STORE_KEY);
    expect(stored).toBeTruthy();
    cleanup();
    boot({ realm: R1 });
    onFetch(api);
    await mount();
    expect(screen.queryByText(heldCreate('new-code'))).toBeNull();
    await act(async () => {
      // eslint-disable-next-line no-restricted-globals -- the other tab writes the shared store
      localStorage.setItem(CHANGE_STORE_KEY, stored!);
      window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
      await settle();
    });
    await waitFor(() => expect(screen.getByText(heldCreate('new-code'))).toBeInTheDocument());
    await pressCreate('new-code');
    expect(creates()).toHaveLength(0);
  });

  it('another tab resolving one of two holds takes only that banner away, at once', async () => {
    srv.create = 'lost';
    await mount();
    await pressCreate('first-code');
    // eslint-disable-next-line no-restricted-globals -- the store as another tab will write it: the first hold only
    const onlyFirst = localStorage.getItem(CHANGE_STORE_KEY);
    await pressCreate('second-code');
    expect(screen.getByText(heldCreate('first-code'))).toBeInTheDocument();
    expect(screen.getByText(heldCreate('second-code'))).toBeInTheDocument();
    await act(async () => {
      // eslint-disable-next-line no-restricted-globals -- the other tab proved second-code and wrote the shared store
      localStorage.setItem(CHANGE_STORE_KEY, onlyFirst!);
      window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
      await settle();
    });
    await waitFor(() => expect(screen.queryByText(heldCreate('second-code'))).toBeNull());
    expect(screen.getByText(heldCreate('first-code'))).toBeInTheDocument();
  });

  it('a create refusal shows its words; "can\'t make codes now" hides the form and reads `me` again', async () => {
    srv.create = [409, 'REFERRAL_CODE_TAKEN'];
    await mount();
    await pressCreate('new-code');
    expect(screen.getByText(strings['check.taken'])).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: strings['create.label'] })).toBeInTheDocument();
    srv.create = [403, 'REFERRAL_CODE_ISSUANCE_BLOCKED'];
    const before = meReads();
    await pressCreate('new-code');
    expect(screen.queryByRole('textbox', { name: strings['create.label'] })).toBeNull();
    expect(screen.getAllByText(strings['codes.unavailable']).length).toBeGreaterThanOrEqual(1);
    await waitFor(() => expect(meReads()).toBeGreaterThan(before));
  });

  it('a bare 400 on create shows the INVALID words, holds nothing, and keeps the form', async () => {
    srv.create = [400, null];
    await mount();
    await pressCreate('new-code');
    expect(screen.getByText(strings['check.invalid'])).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: strings['create.label'] })).toBeInTheDocument();
    expect(banners()).toBe(0);
  });

  it('retry_after_shown_on_429: the wait the answer gave, in seconds', async () => {
    srv.create = [429, '42'];
    await mount();
    await pressCreate('new-code');
    expect(await screen.findByText('Too many changes. Try again in 42 s.')).toBeInTheDocument();
    expect(banners()).toBe(0);
  });
});

describe('the code check in the form', () => {
  it('check_words_follow_api_reason: the API answer decides the words, for the code as stored', async () => {
    await mount();
    await user().type(screen.getByRole('textbox', { name: strings['create.label'] }), ' Taken-One');
    await waitFor(() => expect(screen.getByText(strings['check.taken'])).toBeInTheDocument());
    expect(sent('GET', /\/codes\/check$/).map((c) => url(c).searchParams.get('code'))).toContain('taken-one');
    await user().clear(screen.getByRole('textbox', { name: strings['create.label'] }));
    await user().type(screen.getByRole('textbox', { name: strings['create.label'] }), 'fresh-one');
    await waitFor(() => expect(screen.getByText(strings['check.available'])).toBeInTheDocument());
  });

  it('nothing is checked under 4 characters', async () => {
    await mount();
    await user().type(screen.getByRole('textbox', { name: strings['create.label'] }), 'abc');
    await act(() => new Promise((r) => setTimeout(r, 600)));
    expect(sent('GET', /\/codes\/check$/)).toHaveLength(0);
  });

  it('a refusal saying the account can\'t make codes hides the form and reads `me` again', async () => {
    srv.check = [403, 'REFERRAL_CODE_ISSUANCE_BLOCKED'];
    await mount();
    const before = meReads();
    await user().type(screen.getByRole('textbox', { name: strings['create.label'] }), 'fresh-one');
    await waitFor(() => expect(screen.queryByRole('textbox', { name: strings['create.label'] })).toBeNull());
    expect(screen.getByText(strings['codes.unavailable'])).toBeInTheDocument();
    await waitFor(() => expect(meReads()).toBeGreaterThan(before));
  });

  it('a refused re-check of a code that read available before wins over the old answer: the form hides and `me` is read again', async () => {
    await mount();
    const box = () => screen.getByRole('textbox', { name: strings['create.label'] });
    await user().type(box(), 'fresh-one');
    await waitFor(() => expect(screen.getByText(strings['check.available'])).toBeInTheDocument());
    await user().clear(box());
    await user().type(box(), 'other-one');
    await waitFor(() => expect(sent('GET', /\/codes\/check$/).map((c) => url(c).searchParams.get('code'))).toContain('other-one'));
    // The cached "fresh-one" answer goes stale (15 s in the app); the account can no longer make codes.
    await act(() => queryClient.invalidateQueries({ refetchType: 'none' }));
    srv.check = [403, 'REFERRAL_CODE_ISSUANCE_BLOCKED'];
    const before = meReads();
    await user().clear(box());
    await user().type(box(), 'fresh-one');
    await waitFor(() => expect(screen.queryByRole('textbox', { name: strings['create.label'] })).toBeNull());
    expect(screen.queryByText(strings['check.available'])).toBeNull();
    await waitFor(() => expect(meReads()).toBeGreaterThan(before));
  });

  it('a create refused as taken takes the older "Available" away; a new code is checked again', async () => {
    srv.create = [409, 'REFERRAL_CODE_TAKEN'];
    await mount();
    const box = () => screen.getByRole('textbox', { name: strings['create.label'] });
    await user().type(box(), 'fresh-one');
    await waitFor(() => expect(screen.getByText(strings['check.available'])).toBeInTheDocument());
    await user().click(screen.getByRole('button', { name: strings['create.action'] }));
    await act(() => settle());
    expect(screen.getByText(strings['check.taken'])).toBeInTheDocument();
    expect(screen.queryByText(strings['check.available'])).toBeNull();
    await user().clear(box());
    await user().type(box(), 'fresh-two');
    await waitFor(() => expect(screen.getByText(strings['check.available'])).toBeInTheDocument());
  });

  it('a 429 on the check asks to slow down and Create stays allowed', async () => {
    srv.check = [429, null];
    await mount();
    await user().type(screen.getByRole('textbox', { name: strings['create.label'] }), 'fresh-one');
    await waitFor(() => expect(screen.getByText(strings['check.tooFast'])).toBeInTheDocument());
    expect(screen.getByRole('button', { name: strings['create.action'] })).toBeEnabled();
  });
});

describe('Withdraw… sends nothing', () => {
  function Card({ level }: { level: string }) {
    const t = useStrings(strings);
    return <CreditCard t={t} me={selectMe({ data: { ...meBody().data, level } })} />;
  }
  it('a referrer: no Withdraw… button, the inline Creators-only line, and opening its FAQ answer makes no request at all', async () => {
    queryClient.clear();
    render(<Card level="referrer" />, { wrapper: wrap });
    await act(() => settle());
    const before = calls.length;
    expect(screen.queryByRole('button', { name: strings['withdraw.action'] })).toBeNull();
    expect(screen.getByText(strings['withdraw.line'], { exact: false })).toBeInTheDocument();
    await user().click(screen.getByText(strings['withdraw.more']));
    expect(await screen.findByText(strings['faq.withdraw.a'])).toBeInTheDocument();
    await act(() => settle());
    expect(calls.slice(before)).toEqual([]);
  });
  for (const level of ['creator']) {
    it(`a ${level}: opening and closing the explainer, then opening its FAQ answer, makes no request at all`, async () => {
      queryClient.clear();
      render(<Card level={level} />, { wrapper: wrap });
      await act(() => settle());
      const before = calls.length;
      const dialog = async () => within(await screen.findByRole('dialog', { name: strings['withdraw.title'] }));
      await user().click(screen.getByRole('button', { name: strings['withdraw.action'] }));
      await user().click((await dialog()).getByRole('button', { name: strings['withdraw.close'] }));
      await act(() => settle());
      expect(screen.queryByRole('dialog', { name: strings['withdraw.title'] })).toBeNull();
      await user().click(screen.getByRole('button', { name: strings['withdraw.action'] }));
      await user().click((await dialog()).getByText(strings['withdraw.more']));
      expect(await screen.findByText(strings['faq.withdraw.a'])).toBeInTheDocument();
      await act(() => settle());
      expect(calls.slice(before)).toEqual([]);
    });
  }
});
