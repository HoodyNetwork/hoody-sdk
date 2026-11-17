// Settings → Models & keys (/ai/models, the AI tab's tab.tsx): one settings page. A summary ("Now using") only while a
// problem needs its fix, then Default model, Accounts,
// Claude Code, Spending and Advanced on one scroll. Connecting an account is one drawer; every change is
// read back before it is called saved (C9).
import { computerHandle, handoff, providers, useCurrentComputer, type HandoffResult } from '@core';
import { Button, ComputerRequired, ErrorState, SettingsPage, Skeleton, scrollSettingsSection, useGo, useLiveRoute, usePageLink, usePathname, useSearch, useSearchParam, useStrings } from '@kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { links as computersLinks } from '../computers/links';
import { links } from './links';
import { useAiApi, waitScale } from './data';
import { pageFaq } from './faq';
import { browserEnv } from './env';
import strings from './strings.en.json';
import { AllowanceSection } from './Allowance';
import { AdvancedSection } from './parts/Advanced';
import { AccountsSection } from './parts/Accounts';
import { ClaudeSection } from './parts/Claude';
import { ConnectDrawer, DisconnectDialog, EditDrawer, TripBand, type ConnectTarget, type Trip } from './parts/Connect';
import { AiProvider } from './parts/ctx';
import { DefaultSection } from './parts/Default';
import { useAiModel } from './parts/model';
import { useReloadOnReturn } from './parts/useReloadOnReturn';
import { useTrip } from './parts/useTrip';
import { sectionEl } from './parts/sectionEl';
import { SpendingSection } from './parts/Spending';
import { Summary } from './parts/Summary';
import { presentOnly, type Account } from './logic';

export default function AiPage() {
  const t = useStrings(strings);
  const { items } = pageFaq(t);
  const computersLink = usePageLink('computers');
  const api = useAiApi();
  const m = useAiModel();
  const [, setSection] = useSearchParam('section');
  const [connectParam] = useSearchParam('connect');
  const [sectionParam] = useSearchParam('section');
  const [handoffParam] = useSearchParam('handoff');
  const [stepParam] = useSearchParam('step');
  const search = useSearch();
  const go = useGo();
  const [connect, setConnect] = useState<ConnectTarget | null>(null);
  const [edit, setEdit] = useState<Account | null>(null);
  const [disc, setDisc] = useState<Account | null>(null);

  // The context a flow began in: a flow ends quietly once the computer or realm changes or the page leaves.
  const ctxKey = `${m.computer?.id ?? ''}|${m.realm ?? ''}`;
  const alive = useRef({ key: ctxKey, on: true });
  alive.current.key = ctxKey;
  const env = useMemo(() => {
    const born = ctxKey;
    // BRIDGE: fixtures at instant latency shorten the read-back waits; core's transport keeps real time. A sign-in
    // job's poll keeps its real 3 s step: a fixture job never ends, and a 3 ms poll re-armed for ever kept the page
    // from ever settling (connect-settles.term.test.tsx).
    const scale = waitScale();
    const e = browserEnv(() => alive.current.on && alive.current.key === born);
    return scale === 1 ? e : { ...e, sleep: (ms: number) => e.sleep(ms === providers.POLL_STEP ? ms : ms * scale) };
  }, [ctxKey]);
  useEffect(() => {
    const flag = alive.current;
    flag.on = true;
    return () => {
      flag.on = false;
    };
  }, []);
  // Back on this tab: read again, so a sign-out done in another tab shows here; a drawer for an account that is gone closes.
  useReloadOnReturn(m.reload);
  useEffect(() => {
    setEdit((e) => presentOnly(e, m.accounts));
    setDisc((x) => presentOnly(x, m.accounts));
  }, [m.accounts]);
  // Nothing typed in a drawer survives a computer or realm change.
  useEffect(() => {
    setConnect(null);
    setEdit(null);
    setDisc(null);
  }, [ctxKey]);

  // Drops search params with one replace. The ref takes the new search at once, so a second drop in the same commit
  // starts from the first one's result (two plain sets could each start from the same old search). Only while the
  // browser still shows this page (as the tab's redirect, tab.tsx): the shell can draw it once more with its last
  // location as the person leaves (browser Back from a model chooser's trip), and a drop then would replace the page
  // before's history entry with this one.
  const searchRef = useRef(search);
  searchRef.current = search;
  const path = usePathname();
  const live = useLiveRoute();
  const dropParams = useCallback(
    (names: string[]) => {
      if (live() !== path) return;
      const q = new URLSearchParams(), kept: Record<string, string> = {};
      for (const [k, v] of Object.entries(searchRef.current)) {
        if (names.includes(k) || typeof v !== 'string') continue;
        q.set(k, v);
        kept[k] = v;
      }
      searchRef.current = kept;
      const rest = q.toString();
      // Models & keys' own path: '/ai' would leave the view (the tab's redirect) and close what it just opened.
      go(rest ? `${links.list}?${rest}` : links.list, { replace: true, keepScroll: true });
    },
    [go, live, path],
  );

  // ⌘K "Connect OpenAI" lands here with ?connect=openai: open the drawer at that provider, once loaded. A model
  // chooser's "Your own endpoint" lands with ?connect=new&step=endpoint: the drawer opens at the endpoint form.
  // The target comes from this render's search, never the ref the drop rewrites, so StrictMode's second run of the
  // effect opens the same step; both params go through dropParams, so a later drop in the same commit keeps that.
  useEffect(() => {
    if (!connectParam || m.firstLoad) return;
    setConnect(connectParam === 'new' ? (stepParam === 'endpoint' ? { endpoint: true } : {}) : { providerId: connectParam });
    dropParams(['connect', 'step']);
  }, [connectParam, stepParam, m.firstLoad, dropParams]);

  // A trip from a model chooser (?handoff=<id>): parts/useTrip.ts. The shell's computer (core's)
  // is the one the trip names: the page's own read of it may lag a switch.
  const shown = useCurrentComputer()?.container.id ?? null;
  const trip = useTrip({ param: handoffParam, firstLoad: m.firstLoad, ctx: ctxKey, shown, drop: dropParams });
  const tripView = useMemo((): Trip | null => {
    // Only for the computer shown now: another one chosen here ends the trip on this page at once.
    if (!trip || trip.target.computer !== shown) return null;
    const computer = trip.target.computer;
    return {
      origin: trip.origin.label,
      computer: trip.target.name || m.computer?.name || '',
      // Go back records "left" when nothing happened on this page, then returns with the trip id.
      back: () => {
        if (!handoff.readHandoff(computer, trip.id)?.result) handoff.setHandoffResult(computer, trip.id, { status: 'left' });
        go(handoff.handoffReturnHref(trip));
      },
      result: (r: HandoffResult) => void handoff.setHandoffResult(computer, trip.id, r),
    };
  }, [trip, shown, m.computer?.name, go]);

  // A deep link to a section lands on it again once the content has its final height, and on each other section the
  // param names later (the palette's section commands); goto() scrolls to its own section itself.
  const handled = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (m.firstLoad) return;
    if (!sectionParam || handled.current === sectionParam) {
      if (!sectionParam) handled.current = undefined;
      return;
    }
    handled.current = sectionParam;
    scrollSettingsSection(sectionEl(sectionParam), false);
  }, [m.firstLoad, sectionParam]);

  const goto = useCallback(
    (id: string) => {
      scrollSettingsSection(sectionEl(id), true);
      setSection(id === 'default' ? undefined : id, { replace: true, keepScroll: true });
    },
    [setSection],
  );
  const ctx = useMemo(() => ({ m, api, env, reload: m.reload, connect: (providerId?: string, o?: { endpoint?: boolean }) => setConnect(providerId ? { providerId } : o?.endpoint ? { endpoint: true } : {}), goto }), [m, api, env, goto]);

  if (!m.firstLoad && !m.computer) {
    // No computer shown (All computers): the shared none state, with the pick in place.
    return <ComputerRequired state="none" header={{ title: t('models.title') }} title={t('page.noComputer')} body={t('page.noComputerBody')} />;
  }
  const allFailed = !m.firstLoad && m.loads.catalogue === 'error' && m.loads.defaults === 'error';
  return (
    <AiProvider value={ctx}>
      <SettingsPage
        header={{
          title: t('models.title'),
          subtitle: m.summary ?? (m.firstLoad ? undefined : t('subtitle')),
          // The computer crumb goes to that computer on the Computers page (plain text when the Hub does not serve that page).
          breadcrumbs: m.computer ? [computersLink?.kind === 'hub' ? { label: m.computer.name, href: computersLinks.item(computerHandle(m.computer)) } : { label: m.computer.name }, { label: t('models.title') }] : undefined,
          // One accent per screen: while a problem shows, its fix in the summary is the primary; while nothing could be
          // read the page error's retry is the only action.
          ...(allFailed
            ? {}
            : m.problem
            ? { actions: <Button variant="secondary" icon="plus" onPress={() => setConnect({})}>{t('connect.open')}</Button> }
            : { primary: { label: t('connect.open'), icon: 'plus' as const, onPress: () => setConnect({}) } }),
        }}
        notice={
          allFailed || tripView ? (
            <>
              {tripView && <TripBand trip={tripView} />}
              {allFailed && <ErrorState size="sm" title={t('page.loadFailed')} body={t('page.loadFailedBody')} onRetry={m.reload} /* noDetails: two reads failed (catalogue and defaults); no one rejection stands for both, and Try again re-reads them */ />}
            </>
          ) : undefined
        }
        // The summary is there only for a problem and its fix: otherwise the subtitle and Default model say what it would.
        summary={!m.firstLoad && !allFailed && m.problem ? <Summary /> : undefined}
        // Nothing read: the page error above stands alone, no section repeats it.
        sections={allFailed ? [] : [
          { id: 'default', title: t('sec.default'), description: t('sec.defaultDesc'), content: m.firstLoad ? <Skeleton variant="rows" rows={2} /> : <DefaultSection key={ctxKey} /> },
          { id: 'accounts', title: t('sec.accounts'), description: t('sec.accountsDesc'), content: <AccountsSection onEdit={setEdit} onDisconnect={setDisc} onReplace={(a) => setConnect({ replace: a })} /> },
          { id: 'claude', title: t('sec.claude'), description: t('sec.claudeDesc'), content: <ClaudeSection /> },
          { id: 'allowance', title: t('sec.allowance'), description: t('sec.allowanceDesc'), content: <AllowanceSection /> },
          { id: 'spending', title: t('sec.spending'), description: t('sec.spendingDesc'), content: <SpendingSection /> },
          { id: 'advanced', title: t('sec.advanced'), content: <AdvancedSection key={ctxKey} /> },
        ]}
        faq={{ items }}
      />
      <ConnectDrawer target={connect} onClose={() => setConnect(null)} trip={tripView} />
      <EditDrawer account={edit} onClose={() => setEdit(null)} />
      <DisconnectDialog account={disc} onClose={() => setDisc(null)} />
    </AiProvider>
  );
}
