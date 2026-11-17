// Home: the first screen of the Hub. For an account Home saw being onboarded it teaches what Hoody is (one value
// line, the first useful action, how it fits together, first steps); for everyone it shows what needs them (only
// what it has seen), one click to the usual actions, and the cards other pages contribute through their manifests
// (it never imports a page). Home owns the grid, its own cards, the realm/computer-level states (setup, empty, pick
// one) and the setup changes.
import {
  ActionMenu,
  Button,
  ContextLine,
  DashboardPage,
  EmptyState,
  ErrorState,
  Link,
  LinkButton,
  Skeleton,
  TextButton,
  Widget,
  useContributions,
  useGo,
  usePageLink,
  useShellData,
  usePageShortcuts,
  useSearchParam,
  SR_ONLY,
  useStrings,
} from '@kit';
import { hostEnv, useRealms } from '@core';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { links as computers } from '../computers/links';
import { links as guide } from '../guide/links';
import { links as tour } from '../onboarding/links';
import { links as homeLinks } from './links';
import { useHideChecklist, useOverview, useUnresolved, type HomeComputer, type Overview } from './data';
import {
  arrange,
  contextState,
  tileTarget,
  CUSTOMIZE_KEY,
  effectiveSetup,
  fitsTitleKey,
  greetingKey,
  homeMode,
  latchFacts,
  needsItems,
  observesOnboarding,
  offersTour,
  opensTour,
  shouldPoll,
  POLL_MS,
  stepFocus,
  stepsFrom,
  titleOf,
  trySteps,
  welcomeVisible,
  type Facts,
  type HomeMode,
} from './logic';
import { AskStrip } from './parts/AskStrip';
import { Bands } from './parts/Bands';
import { homeCards, isHomeCard, toContributions, withoutRepeats, type Card, type HomeCard } from './parts/contributions';
import { Customize } from './parts/Customize';
import { EmptyRealm } from './parts/EmptyRealm';
import { FirstStepsCard } from './parts/FirstSteps';
import { FitsTogether } from './parts/FitsTogether';
import { NeedsYou } from './parts/NeedsYou';
import { QuickActions } from './parts/QuickActions';
import { RealmsCard } from './parts/RealmsCard';
import { SetupPanel } from './parts/SetupPanel';
import { ShortcutsCard } from './parts/ShortcutsCard';
import { useWidgetPrefs } from './parts/useWidgetPrefs';
import { Welcome } from './parts/Welcome';
import { WidgetFrame } from './parts/WidgetFrame';
import { usePageTarget } from './parts/usePageTarget';
import { AddWidget, isUrlCard, UrlWidgetCard, useUrlWidgets, type UrlCard } from './widgets';
import { visibleHeaderControl } from './parts/focus';
import h from './parts/home.module.css';
import s from './parts/parts.module.css';
import strings from './strings.en.json';

/** Home opened the tour in this page load (tests reset it). */
export const tourOpened = { now: false };

export default function HomePage() {
  const t = useStrings(strings);
  const overview = useOverview();
  const ov = overview.data;
  const { setFlag } = useWidgetPrefs();
  const hour = ov?.hour ?? new Date().getHours();
  const computer = ov?.computers.find((c) => c.id === ov.pickedId);
  const greeting = t(greetingKey(hour));
  const [customizeParam, setCustomize] = useSearchParam('customize');
  const [introParam, setIntro] = useSearchParam('intro');
  const customizing = customizeParam === '1';
  const mode: HomeMode | undefined = ov ? homeMode(ov) : undefined;
  const account = !!ov && !ov.shared;

  // Onboarding is what Home saw (the account's initial setup): stored once, so it outlives the visit that saw it,
  // until the person hides the Welcome.
  const observed = !!ov && !!mode && observesOnboarding({ mode, setup: ov.setupRead, shared: ov.shared });
  useEffect(() => {
    if (observed) setFlag('onboarding');
  }, [observed, setFlag]);
  const onboarding = !!ov && (ov.onboarding || observed);

  // A new account's first computer is still being made: open the tour once (it shows the setup as it is read and what
  // Hoody does, and leads back here). Stored before leaving, so Home never does it twice for the account; and at most
  // once per page load whatever the browser stores (a refused or unreadable store must not send Home there again).
  // The terminal Hub never opens or offers the tour by itself: there the tour is a hand-off to the web Hub, so Home
  // stays put and stores nothing for it. The explicit ways in (the Welcome's tour line, the header link, the command) lead to the hand-off.
  const tourLink = usePageLink('onboarding');
  const tourTarget = usePageTarget('onboarding', tour.page);
  const goTour = useGo();
  const autoTour = hostEnv().browserPage === true;
  const startTour = autoTour && !!ov && !!tourLink && opensTour({ prefsRead: ov.prefsRead === true, shared: ov.shared, toured: ov.toured === true, firstMaking: ov.firstMaking === true });
  useEffect(() => {
    if (!startTour || tourOpened.now) return;
    tourOpened.now = true;
    setFlag('onboarding');
    setFlag('toured');
    goTour(tour.page, { replace: true });
  }, [startTour, setFlag, goTour]);
  // The first computer already runs and Home never opened the tour: no redirect; the Welcome shows for this page load
  // (a short entry: Open and the tour). Stored when shown, so it happens once; Hide closes it even if the store did not hold.
  const offerTour = autoTour && !!ov && !!tourLink && mode === 'ready' && offersTour({ prefsRead: ov.prefsRead === true, shared: ov.shared, toured: ov.toured === true, introHidden: ov.introHidden, firstRunning: ov.firstRunning === true });
  const [tourOffer, setTourOffer] = useState<'none' | 'shown' | 'closed'>('none');
  useEffect(() => {
    if (!offerTour || tourOffer !== 'none') return;
    setTourOffer('shown');
    setFlag('toured');
  }, [offerTour, tourOffer, setFlag]);
  const tourFirst = tourOffer === 'shown';
  const welcome = !!ov && !!mode && welcomeVisible({ account, mode, onboarding, introHidden: ov.introHidden, asked: introParam === '1' || tourFirst });

  // Hide closes the Welcome whatever opened it (the stored onboarding, ?intro=1, or both); focus moves to the
  // header button that opens it again.
  const [refocus, setRefocus] = useState(false);
  const hideWelcome = useCallback(() => {
    setFlag('introHidden');
    setIntro(undefined, { replace: true });
    setTourOffer('closed');
    setRefocus(true);
  }, [setFlag, setIntro]);
  useEffect(() => {
    if (!refocus || welcome) return;
    setRefocus(false);
    // A terminal has no document to search (reading it there is a TERM_GLOBAL trap): its focus engine owns
    // where the keyboard goes once the welcome's Hide button is gone.
    if (hostEnv().browserPage !== true) return;
    // The visible way back: "What is Hoody?", in the header actions on wide screens and under the title on phones.
    visibleHeaderControl('[data-home-reopen] button')?.focus();
  }, [refocus, welcome]);

  const ready = mode === 'ready' || mode === 'pick-one';
  const head = titleOf({ mode, setup: ov?.setup, firstRun: welcome && onboarding && !!computer && mode === 'ready', userName: ov?.userName, computerName: computer?.name, computerRunning: computer?.running, hour });
  const title = t(head.key, { greeting, ...head.params });
  const reread = () => overview.refetch();
  const toggleCustomize = () => setCustomize(customizing ? undefined : '1', { replace: true });
  const reopen = account && mode !== 'setup' && mode !== 'shared-empty' && !welcome;
  // A session without the Welcome (an access key) still gets a way back to the tour: the header links it.
  const tourEntry = !account && !!tourTarget && !!mode && mode !== 'setup' && mode !== 'shared-empty';

  // On phones "What is Hoody?" stays a labelled control of its own (under the title); only Customize folds into the menu.
  const menu = ready ? [{ id: 'customize', label: t('action.customize'), icon: 'sliders' as const, onAction: toggleCustomize }] : [];

  return (
    <DashboardPage
      // The person orders the cards (Customize): what they see is that order, and so is Tab.
      flow="ordered"
      header={{
        title,
        context: ov ? (
          <>
            <HomeContext ov={ov} computer={computer} />
            {/* On phones "What is Hoody?" sits under the title, labelled, so the title keeps the header's width. */}
            {(reopen || tourEntry) && (
              <span className={s.reopenPhone} data-home-reopen="" data-home-header="">
                {reopen ? (
                  <TextButton icon="info" className={h.touchLink} onPress={() => setIntro('1')}>
                    {t('intro.reopen')}
                  </TextButton>
                ) : tourTarget ? (
                  <LinkButton variant="ghost" size="sm" icon="guide" href={tourTarget.href}>
                    {t('intro.tour')}
                  </LinkButton>
                ) : null}
              </span>
            )}
          </>
        ) : undefined,
        actions: (reopen || ready || tourEntry) && (
          <>
            <span className={s.customizeFull} data-home-header="">
              {(reopen || tourEntry) && (
                <span data-home-reopen="">
                  {reopen ? (
                    <Button variant="ghost" icon="info" onPress={() => setIntro('1')}>
                      {t('intro.reopen')}
                    </Button>
                  ) : tourTarget ? (
                    <LinkButton variant="ghost" icon="guide" href={tourTarget.href}>
                      {t('intro.tour')}
                    </LinkButton>
                  ) : null}
                </span>
              )}
              {ready && (
                <Button variant="ghost" icon="sliders" onPress={toggleCustomize}>
                  {t('action.customize')}
                </Button>
              )}
            </span>
            <span className={s.customizeMenu} data-home-header="">
              {menu.length > 0 && <ActionMenu label={t('action.more')} items={menu} />}
            </span>
          </>
        ),
      }}
      notice={ov ? <Bands bands={ov.bands} onRetry={() => void reread()} /> : undefined}
    >
      {overview.isPending ? (
        <Loading />
      ) : overview.error || !ov || !mode ? (
        <section className={s.canvas}>
          {/* With the list read (ov), the read that failed is the account's setup state: the words say that, never "your computers". */}
          <ErrorState title={t(ov ? 'setupFailed.title' : 'failed.title')} body={t(ov ? 'setupFailed.body' : 'failed.body')} onRetry={() => void reread()} retrying={overview.isFetching} />
        </section>
      ) : (
        <Body ov={ov} mode={mode} welcome={welcome} onHideWelcome={hideWelcome} customizing={customizing} onCustomize={toggleCustomize} onDoneCustomizing={() => setCustomize(undefined, { replace: true })} onReread={reread} />
      )}
    </DashboardPage>
  );
}

function HomeContext({ ov, computer }: { ov: Overview; computer?: HomeComputer }) {
  const t = useStrings(strings);
  const link = usePageLink('computers');
  // The realm's own colour, as the top bar and Your realms show it.
  const realms = useRealms();
  const color = ov.realm.all ? undefined : realms.rows?.find((r) => r.id === ov.realm.id)?.tint || undefined;
  // A page this load serves links inside the Hub; no link (a hidden page) hides the part. (The non-hub branch is a
  // classic link no load gives.)
  const to = (hubHref: string) => (!link ? undefined : link.kind === 'hub' ? hubHref : link.href);
  const state = computer && contextState(computer.state);
  return (
    <ContextLine
      realm={{ name: ov.realm.all ? t('context.allRealms') : ov.realm.name, color, href: to(computers.list) }}
      computer={computer && state && { name: computer.name, tone: state.tone, state: t(state.key), href: to(computers.item(computer.handle)) }}
      server={computer?.server ? { name: computer.server, flag: computer.flag, href: to(`${computers.servers}`) } : undefined}
    />
  );
}

function Loading() {
  const t = useStrings(strings);
  return (
    <>
      <span className={SR_ONLY} role="status"> {/* one polite announcement for the whole skeleton; the placeholders say nothing */}
        {t('loading')}
      </span>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Widget key={i} size={i === 0 ? 'm' : 's'} title="" className={i > 2 ? s.loadMore : undefined}>
          <Skeleton variant="widget" />
        </Widget>
      ))}
    </>
  );
}

interface BodyProps {
  ov: Overview;
  mode: HomeMode;
  welcome: boolean;
  onHideWelcome: () => void;
  customizing: boolean;
  onCustomize: () => void;
  onDoneCustomizing: () => void;
  onReread: () => Promise<boolean>;
}

/** Needs you, from reads already made: account sessions only. */
function Needs({ ov, mode }: { ov: Overview; mode: HomeMode }) {
  const waiting = useShellData().botsWaiting;
  const { held, sending } = useUnresolved(mode === 'setup', ov.realm, ov.computers);
  const items = useMemo(
    () => needsItems({ botsWaiting: mode === 'setup' ? undefined : waiting, computers: ov.computers, held, sending }),
    [waiting, ov.computers, held, sending, mode],
  );
  return <NeedsYou items={items} realm={ov.realm} />;
}

function Body({ ov, mode, welcome, onHideWelcome, customizing, onCustomize, onDoneCustomizing, onReread }: BodyProps) {
  const acct = useShellData().account;
  const accountKey = `${acct?.name ?? ''}|${acct?.detail ?? ''}`;
  const account = !ov.shared;
  if (mode === 'shared-empty') return <EmptyShared ov={ov} />;
  const needs = account ? <Needs ov={ov} mode={mode} /> : null;
  // The state's own control comes first (SetupPanel, the chooser), Needs you right after it.
  if (mode === 'setup')
    return <Setup key={accountKey} ov={ov} onReread={onReread} needs={needs} />;
  return (
    <>
      {mode === 'pick-one' && <PickOne ov={ov} />}
      {needs}
      {mode === 'empty-realm' && <EmptyRealm realm={ov.realm} />}
      <Dashboard key={`${ov.userName ?? ''}|${ov.realm.id}`} ov={ov} mode={mode} welcome={welcome} onHideWelcome={onHideWelcome} customizing={customizing} onCustomize={onCustomize} onDoneCustomizing={onDoneCustomizing} />
    </>
  );
}

function EmptyShared({ ov }: { ov: Overview }) {
  const t = useStrings(strings);
  return (
    <section className={s.canvas}>
      <EmptyState icon="computer" title={ov.realm.all ? t('shared.emptyAll') : t('shared.empty')} body={t('shared.emptyBody')} />
    </section>
  );
}

/** The all-realms account with no computer: provisioning polls until the first computer shows up; how Hoody fits
 *  together sits right under the setup panel (whose own control stays first). */
function Setup({ ov, onReread, needs }: { ov: Overview; onReread: () => Promise<boolean>; needs: ReactNode }) {
  const t = useStrings(strings);
  const [polls, setPolls] = useState(0);
  // No read setup state is never "being prepared": the page shows the skeleton or the read error before this, and
  // anything else lands on the read error with Try again.
  const kind = ov.setup;
  const guideLink = usePageTarget('guide', guide.guide);
  useEffect(() => {
    if (!kind || !shouldPoll(kind, polls)) return;
    const timer = setTimeout(() => {
      setPolls((n) => n + 1);
      void onReread();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [kind, polls, onReread]);
  if (!kind)
    return (
      <section className={s.canvas}>
        <ErrorState /* noDetails: no setup state was read, not a rejection; no error to show */ title={t('setupFailed.title')} body={t('setupFailed.body')} onRetry={() => void onReread()} />
      </section>
    );
  const shown = effectiveSetup(kind, polls);
  return (
    <>
      <SetupPanel kind={shown} room={ov.setupRoom ?? null} ageSec={ov.setupAgeSec ?? 0} polls={polls} onReread={onReread} onRestart={() => setPolls(0)} />
      {needs}
      <Widget size="l" className={h.fitsCard}>
        <div className={h.fitsBody}>
          <FitsTogether titleKey={fitsTitleKey(shown)} headingId="home-fits-setup" />
          {guideLink && (
            <div>
              <Link variant="nav" className={h.touchLink} href={guideLink.href} iconEnd="arrow-right">
                {t('intro.guide')}
              </Link>
            </div>
          )}
        </div>
      </Widget>
    </>
  );
}

/** Pick-one's chooser: each computer opens its own place; with no Computers page in this load there is nothing to
 *  choose with here. */
function PickOne({ ov }: { ov: Overview }) {
  const t = useStrings(strings);
  const link = usePageLink('computers');
  const list = tileTarget(link, computers.list);
  return (
    <Widget size="l" title={t('pick.title')} description={t('pick.body')}>
      {list && (
        <div className={s.pickRow}>
          {!list.asPage &&
            ov.computers.slice(0, 6).map((c) => (
              <LinkButton key={c.id} icon="computer" href={tileTarget(link, computers.item(c.handle))?.href ?? list.href}>
                {c.name}
              </LinkButton>
            ))}
          <LinkButton variant={list.asPage ? 'primary' : 'ghost'} iconEnd="arrow-right" href={list.href}>
            {list.asPage ? t('intro.openPage') : t('pick.all')}
          </LinkButton>
        </div>
      )}
    </Widget>
  );
}

interface DashboardProps {
  ov: Overview;
  mode: HomeMode;
  welcome: boolean;
  onHideWelcome: () => void;
  customizing: boolean;
  onCustomize: () => void;
  onDoneCustomizing: () => void;
}

function Dashboard({ ov, mode, welcome, onHideWelcome, customizing, onCustomize, onDoneCustomizing }: DashboardProps) {
  const t = useStrings(strings);
  const go = useGo();
  const hide = useHideChecklist();
  const realms = useRealms();
  const setRealm = useShellData().setRealm;
  const { prefs, hide: hideWidget, show, move, moveTo, reset } = useWidgetPrefs();
  const web = useUrlWidgets();
  const [hiddenChecklist, setHiddenChecklist] = useState(ov.checklistHidden);
  const latched = useRef<Facts>(ov.facts);
  latched.current = latchFacts(latched.current, ov.facts);
  const steps = stepsFrom(latched.current, ov.factsFailed);
  const computer = ov.computers.find((c) => c.id === ov.pickedId);
  const account = !ov.shared;
  const hasComputer = ov.computers.length > 0;
  const tries = trySteps({ hasComputer: !!computer });

  // Home's own cards join the page cards: one order, one Customize list, one DOM (= keyboard) order.
  const { widgets } = useContributions();
  const cards = useMemo<(Card | UrlCard)[]>(
    () => [
      ...toContributions(withoutRepeats(widgets, mode)),
      ...web.cards,
      ...homeCards(
        {
          actions: account,
          // Only a milestone known to be open earns the card; an empty realm's own card already offers a computer.
          steps: account && mode !== 'empty-realm' && !welcome && !hiddenChecklist && steps.some((x) => !x.done && !x.unknown),
          realms: account && !!setRealm && (realms.rows?.length ?? 0) >= 2,
          keys: true,
        },
        t,
      ),
    ],
    // `steps` is rebuilt every render; its done flags are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [widgets, web.cards, account, mode, welcome, hiddenChecklist, steps.map((x) => `${x.id}${x.done}${x.unknown}`).join(), setRealm, realms.rows?.length, t],
  );
  const { all, shown } = arrange(cards, prefs);
  const hiddenKeys = new Set(prefs.hidden);
  const gridRef = useRef<HTMLDivElement>(null);

  // C opens Customize; the shell skips it while typing or with a dialog or menu open.
  usePageShortcuts([{ key: CUSTOMIZE_KEY, label: t('customize.key'), run: () => go(homeLinks.customize) }]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, [contenteditable="true"]')) return;
    const links = Array.from(gridRef.current?.querySelectorAll<HTMLElement>('header a[href]') ?? []);
    const current = links.indexOf(target);
    if (current < 0 && !['ArrowRight', 'ArrowDown'].includes(e.key)) return;
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    // Only a key pressed on a card's header link moves between cards; arrows elsewhere keep their own meaning.
    if (current < 0 && !target.closest('header')) return;
    const next = stepFocus(current, links.length, e.key);
    if (next >= 0) {
      e.preventDefault();
      links[next]?.focus();
    }
  };

  const own = (card: HomeCard): ReactNode => {
    switch (card.id) {
      case 'actions':
        return <QuickActions key={card.key} hasComputer={hasComputer} title={card.title} />;
      case 'steps':
        return (
          <FirstStepsCard
            key={card.key}
            steps={steps}
            tries={tries}
            computer={computer}
            onHide={() => {
              setHiddenChecklist(true);
              hide.mutate();
            }}
          />
        );
      case 'realms':
        return <RealmsCard key={card.key} title={card.title} />;
      case 'keys':
        return <ShortcutsCard key={card.key} title={card.title} />;
      default:
        return null;
    }
  };

  return (
    <div className={s.keys} ref={gridRef} onKeyDown={onKeyDown} role="presentation">
      {welcome && (
        <Welcome
          primary={mode === 'ready' && computer ? 'open' : 'none'}
          computer={mode === 'ready' ? computer : undefined}
          onHide={onHideWelcome}
        />
      )}
      {!welcome && computer && account && <AskStrip name={computer.name} />}
      {customizing && (
        <Customize
          all={all}
          hiddenKeys={hiddenKeys}
          onToggle={(key, on) => (on ? show(key) : hideWidget(key))}
          onMove={(key, delta) => move(all, key, delta)}
          onMoveTo={(key, to) => moveTo(all, key, to)}
          add={<AddWidget onAdd={web.add} full={web.full} realmKnown={web.realmKnown} />}
          onReset={reset}
          onDone={onDoneCustomizing}
        />
      )}
      {shown.map((item) => (isUrlCard(item) ? <UrlWidgetCard key={item.key} card={item} web={web} onHide={hideWidget} /> : isHomeCard(item) ? own(item) : <WidgetFrame key={item.key} item={item} />))}
      {shown.length === 0 && !customizing && (
        <section className={s.canvas}>
          {/* No card at all is every card hidden (Shortcuts is always offered): say so, with the way back. */}
          <EmptyState
            icon="home"
            title={t('widget.empty')}
            body={t('widget.emptyBody')}
            action={
              <Button variant="primary" icon="sliders" onPress={onCustomize}>
                {t('action.customize')}
              </Button>
            }
          />
        </section>
      )}
    </div>
  );
}
