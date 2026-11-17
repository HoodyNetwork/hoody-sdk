// One script: header (the primary is "Ask the AI to fix it" when it is failing, else "Change with AI"), tabs
// (Overview, Code, Test, Settings; the open tab is in the URL) and, on Code, Save in the save bar. The kit's DetailPage draws them.
import { Band, Button, ComputerLink, DetailPage, EmptyState, Stack, usePageShortcuts, useSearchParam, useStrings } from '@kit';
import { useEffect, useState } from 'react';
import { useFailures, useScriptsTarget } from '../data';
import { pageFaq } from '../faq';
import { itemKey, writable } from '../logic';
import strings from '../strings.en.json';
import type { CompScripts, ScriptItem } from '../types';
import { AiDrawer } from './AiDrawer';
import { InlineOutcome } from './Bits';
import { CodeTab } from './CodeTab';
import { StatusChip } from './List';
import { OverviewTab } from './OverviewTab';
import { OwnerHeld } from './OwnerHeld';
import { RunIt } from './RunIt';
import { useRunScript } from './runScript';
import { SettingsTab } from './SettingsTab';
import { TestTab } from './TestTab';
import { useEditor } from './useEditor';
import s from './parts.module.css';

const TABS = ['overview', 'code', 'test', 'settings'] as const;

export interface DetailProps {
  item: ScriptItem;
  comp: CompScripts;
  onChanged: () => unknown;
  onDeleted: () => void;
}

export function Detail({ item, comp, onChanged, onDeleted }: DetailProps) {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  const [tabParam, setTab] = useSearchParam('tab');
  const tab = (TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as (typeof TABS)[number]) : 'overview';
  const [aiParam, setAi] = useSearchParam('ai');
  const [aiOpen, setAiOpen] = useState(aiParam === '1');
  // Try it: opens Test and asks it to move focus to its Send. The ask is pending until Test has tried once (0 = none), so
  // a later visit to Test by its tab never moves focus again; a count, so a second press asks again even before that.
  const [tryIt, setTryIt] = useState(0);
  const openTry = () => {
    setTab('test', { replace: true });
    setTryIt((n) => n + 1);
  };
  // Delete from the header menu (or a list row's, which arrives as `delete=1`): the Settings tab opens its own confirmation, the one
  // implementation. A count, so a second ask opens it again; pending until Settings has seen it.
  const [delParam, setDelParam] = useSearchParam('delete');
  const [deleteAsk, setDeleteAsk] = useState(0);
  const askDelete = () => {
    setTab('settings', { replace: true });
    setDeleteAsk((n) => n + 1);
  };
  // Set or change the schedule (Overview's Schedule card): Settings opens and moves focus to the schedule
  // field, the one place it is written. A count, like Try it, so a second press asks again; pending until Settings has seen it.
  const [schedAsk, setSchedAsk] = useState(0);
  // Run now on the Schedule card: the list's own run, so the lock and its answers are one.
  const runScript = useRunScript();
  const runShown = useScriptsTarget()?.container.id === item.compId;
  const openSchedule = () => {
    setTab('settings', { replace: true });
    setSchedAsk((n) => n + 1);
  };
  useEffect(() => {
    if (delParam === '1') {
      setTab('settings', { replace: true });
      setDeleteAsk((n) => n + 1);
      setDelParam(undefined, { replace: true });
    }
  }, [delParam, setDelParam, setTab]);
  const ed = useEditor(item, comp, onChanged, t as never);
  const failures = useFailures(item.id, !!comp.caps?.executions && item.status === 'failing');
  const w = writable(item, comp.caps);
  const failing = item.status === 'failing';
  const canAi = w === 'ok' && comp.agent.writer;

  useEffect(() => {
    if (aiParam === '1') {
      setAiOpen(true);
      setAi(undefined, { replace: true });
    }
  }, [aiParam, setAi]);

  usePageShortcuts([
    ...TABS.map((id, i) => ({ key: String(i + 1), label: t(`tab.${id}` as never), run: () => setTab(i === 0 ? undefined : id, { replace: true }) })),
    { key: 'f', label: t('ai.primary'), run: () => setAiOpen(true), enabled: canAi },
  ]);

  const address = comp.origin ? `${comp.origin}${item.pattern}` : item.pattern;
  const saveBar =
    tab === 'code' && ed.canWrite ? (
      <>
        <InlineOutcome out={ed.out} what="save" onCheck={() => ed.check()} checking={ed.checking} onDismiss={ed.dismiss} onForce={ed.force} />
        {ed.out?.kind !== 'pending' ? (
          <>
            <Button variant="ghost" size="sm" onPress={ed.discard} isDisabled={!ed.dirty}>
              {t('code.discard')}
            </Button>
            {/* Mod+S saves from the editor (CodeTab onSave), not from this button: the badge shows it, nothing announces it here. */}
            <Button variant="primary" size="sm" icon="check" shortcut="Mod+S" aria-keyshortcuts="" busy={ed.busy} isDisabled={!ed.dirty || ed.locked} onPress={() => void ed.save()}>
              {t('code.save')}
            </Button>
          </>
        ) : null}
      </>
    ) : null;

  return (
    <>
      <DetailPage
        header={{
          title: item.name,
          meta: <StatusChip status={item.status} />,
          subtitle: <span className={s.mono} title={item.routeTip}>{item.served ? item.pattern : t('route.notServed')} · <ComputerLink handle={item.compHandle} name={item.compName} /></span>,
          actions: (
            <>
              <Button size="sm" icon="play" onPress={openTry}>
                {t('try.primary')}
              </Button>
              {canAi ? (
                <Button size="sm" icon="sparkle" onPress={() => setAiOpen(true)}>
                  {t(failing ? 'ai.fixPrimary' : 'ai.primary')}
                </Button>
              ) : null}
            </>
          ),
        }}
        menu={[
          { id: 'try', label: t('try.primary'), icon: 'play', onAction: openTry },
          ...(item.served ? [{ id: 'copy', label: t(item.dynamic ? 'menu.copyPattern' : 'menu.copy'), icon: 'copy' as const, copy: address, onAction: () => undefined }] : []),
          { id: 'delete', label: t('menu.delete'), icon: 'trash' as const, tone: 'danger' as const, onAction: askDelete },
        ]}
        notice={w === 'managed' ? <Band size="table">{t('notice.managed', { template: item.managed?.template ?? '' })}</Band> : w === 'old' && comp.instances !== null ? <Band size="table">{t('notice.old')}</Band> : w === 'old' || w === 'unknown' ? <OwnerHeld comp={comp} onChanged={onChanged} old={w === 'old'} /> : undefined}
        tabs={[
          { id: 'overview', label: t('tab.overview'), content: <Stack gap={4}><OverviewTab item={item} comp={comp} onChanged={onChanged} linkFaq={byId.publicLink} onSetSchedule={openSchedule} onRunNow={() => runScript(item)} runShown={runShown} /><RunIt item={item} comp={comp} /></Stack> },
          { id: 'code', label: t('tab.code'), content: <CodeTab item={item} comp={comp} ed={ed} /> },
          { id: 'test', label: t('tab.test'), content: <TestTab key={itemKey(item)} item={item} comp={comp} focusSend={tryIt} onSendFocused={() => setTryIt(0)} /> },
          { id: 'settings', label: t('tab.settings'), content: <SettingsTab key={itemKey(item)} item={item} comp={comp} onChanged={onChanged} onDeleted={onDeleted} askDelete={deleteAsk} onAsked={() => setDeleteAsk(0)} secretsFaq={byId.secrets} settingsFaq={byId.settingsAtTop} focusSchedule={schedAsk} onScheduleFocused={() => setSchedAsk(0)} /> },
        ]}
        footer={saveBar ?? undefined}
      />
      <AiDrawer isOpen={aiOpen} onClose={() => setAiOpen(false)} item={item} comp={comp} current={ed.text} readFailed={ed.file.isError} failure={failures.data?.[0]} onUse={(code) => { ed.setText(code); setTab('code', { replace: true }); }} />
    </>
  );
}

export function Gone({ onBack }: { onBack: () => void }) {
  const t = useStrings(strings);
  return <EmptyState icon="warn" title={t('detail.gone')} body={t('detail.goneBody')} action={<Button onPress={onBack}>{t('detail.backList')}</Button>} />;
}
