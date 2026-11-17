// Guide: how to use Hoody. A sticky section index, a reading column, and a rail of the facts that
// fill the commands and addresses. Sections are anchor links (#connect), Connect remembers its door
// in the URL, and J / K move between sections. Nothing here changes data.
import { PageFrame, PageHeader, useAskDock, useGo, useLocationHash, usePageShortcuts, useSearchParam, useStrings } from '@kit';
import { useMemo, useRef } from 'react';
import { useGuideFacts, useGuideTopics } from './data';
import { BOT_DOORS, CONNECT_DOORS, isDoor, isSection, SECTIONS, stepSection, type DoorId, type SectionId } from './logic';
import { FactsRail } from './parts/FactsRail';
import {
  AskSection,
  BotsSection,
  ConnectSection,
  KeysSection,
  LinksSection,
  LookSection,
  RealmsSection,
  ToolsSection,
  TopicsSection,
  TrySection,
} from './parts/Sections';
import { BuildSection, SkillsSection } from './parts/BuildSections';
import { useFollowSection, useScrollSpy } from './parts/useScrollSpy';
import { SectionNav } from './parts/SectionNav';
import s from './parts/guide.module.css';
import strings from './strings.en.json';

export default function GuidePage() {
  const t = useStrings(strings);
  const go = useGo();
  const dock = useAskDock();
  const facts = useGuideFacts();
  const topics = useGuideTopics();
  const hash = useLocationHash();
  const [doorParam, setDoor] = useSearchParam('door');
  const [botDoorParam, setBotDoor] = useSearchParam('bdoor');

  const door: DoorId = isDoor(doorParam) && CONNECT_DOORS.includes(doorParam) ? doorParam : 'ai';
  const botDoor: DoorId = isDoor(botDoorParam) && BOT_DOORS.includes(botDoorParam) ? botDoorParam : 'boturl';

  const visible = useMemo(() => SECTIONS.filter((id) => id !== 'topics' || (topics.data?.length ?? 0) > 0), [topics.data]);
  const [current, jump] = useScrollSpy(visible);

  // The section this page last jumped to for the URL, or a pick's (null: none, or the URL has moved on since).
  const followed = useRef<SectionId | null>(null);

  const pick = (id: SectionId) => {
    followed.current = id;
    jump(id);
    const q = new URLSearchParams();
    if (doorParam) q.set('door', doorParam);
    if (botDoorParam) q.set('bdoor', botDoorParam);
    const qs = q.toString();
    // keepScroll: the router's scroll restore would otherwise undo the jump just started.
    go(`/guide${qs ? `?${qs}` : ''}#${id}`, { replace: true, keepScroll: true });
  };

  // Go to the section the URL names: on arrival, once it exists (Topics appears once loaded), and again on every later
  // change while the page stays open ("Ways to connect" in the account menu navigates here without a remount). A pick
  // has jumped already, so the hash it writes moves nothing more.
  useFollowSection(isSection(hash) ? hash : undefined, !facts.isPending && !topics.isPending, followed, jump, visible);

  // J and K move between sections; the shell skips them while typing or with a dialog or menu open.
  const step = (dir: 1 | -1) => {
    const next = stepSection(visible, current, dir);
    if (next) jump(next);
  };
  usePageShortcuts([
    { key: 'j', label: t('keys.next'), run: () => step(1) },
    { key: 'k', label: t('keys.prev'), run: () => step(-1) },
  ]);

  const f = facts.data;
  return (
    <PageFrame className={s.layout}>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className={s.grid}>
        <SectionNav sections={visible} current={current} onPick={pick} />
        <div className={s.content}>
          <AskSection onOpenAsk={() => dock.open({ text: '', source: 'guide' })} />
          <ConnectSection facts={f} door={door} onDoor={(id) => setDoor(id === 'ai' ? undefined : id, { replace: true })} />
          <SkillsSection />
          <BuildSection />
          <LinksSection facts={f} failed={Boolean(facts.error)} onRetry={() => void facts.refetch()} />
          <BotsSection facts={f} door={botDoor} onDoor={(id) => setBotDoor(id === 'boturl' ? undefined : id, { replace: true })} />
          <ToolsSection facts={f} />
          <TrySection />
          <RealmsSection facts={f} />
          {visible.includes('topics') && <TopicsSection topics={topics.data} />}
          <KeysSection />
          <LookSection />
        </div>
        <FactsRail facts={f} failed={Boolean(facts.error)} onRetry={() => void facts.refetch()} />
      </div>
    </PageFrame>
  );
}
