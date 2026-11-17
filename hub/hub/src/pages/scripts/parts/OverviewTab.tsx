// The Overview tab: how the script did in the last 24 hours, what failed, and the public links that open it.
import { useEffect, useState } from 'react';
import { AnatomySection, Band, Button, ComputerLink, ConfirmDialog, CopyButton, Dialog, EmptyState, Notice, SubSection, Why,  Facts, PageLinkTo, Panel, PropagatingNote, Skeleton, Sparkline, Stack, StatTile, Switch, IconButton, TextButton, formatDateTime, useStrings, type FaqItem } from '@kit';
import { HeldElsewhere } from './Bits';
import { ScriptAddress } from './ScriptAddress';
import { LinkNameField, useLinkName } from './LinkName';
import { useAliasHeldElsewhere, useFailures, useUsage, useAliasState, useAliasRemove, useAliasCreate } from '../data';
import { aliasesFor, folderOf, logsHref, schedulesHref, writable } from '../logic';
import { shareWhy, shareWhyKey, shareWhyRechecks } from './share';
import strings from '../strings.en.json';
import type { CompScripts, ScriptItem } from '../types';
import { ChangeBanner } from './Bits';
import { cronNextRuns as nextRuns } from '@kit/pure';
import { cronOf, schedText } from './schedWords';
import { utcText } from './SchedulePicker';
import { HELD_BY_OTHER, forScript, heldByOther, ofIdentity, readBackOf, useChange } from './ops';
import s from './parts.module.css';

const hourCalls = (h: number | { calls?: number }): number => (typeof h === 'number' ? h : (h.calls ?? 0));

/** Why the schedule can't be changed from here now, or null: the same gates as Settings' fields. */
export function schedWhy(item: Pick<ScriptItem, 'managed' | 'ownershipUnknown'>, comp: Pick<CompScripts, 'state' | 'caps' | 'instances'>): 'off' | 'old' | 'unknown' | 'managed' | null {
  if (comp.state !== 'on') return 'off';
  const w = writable(item, comp.caps);
  if (w === 'old') return 'old';
  if (w === 'unknown' || comp.instances === null) return 'unknown';
  return w === 'managed' ? 'managed' : null;
}

/** Why Run now can't be pressed now, or null. A run from here sends no caller key and no force, the
 *  same as the list's Run: the computer refuses a script with a key, so it is off with the reason, never sent to be refused. */
export function runWhy(item: Pick<ScriptItem, 'keyed'>, comp: Pick<CompScripts, 'state'>, shown = true): 'off' | 'elsewhere' | 'keyed' | null {
  if (comp.state !== 'on') return 'off';
  // The run goes to the computer the shell shows (parts/runScript.ts): a script of another computer is not run from here.
  if (!shown) return 'elsewhere';
  return item.keyed ? 'keyed' : null;
}

/** `linkFaq`: the page's answer about public links; the link shows only when it is given (the page gives it). `onSetSchedule`:
 *  opens Settings > How it runs at the schedule field, the one place a schedule is written. `onRunNow`:
 *  runs the script once, now, through the page's one run (parts/runScript.ts), after the confirm here;
 *  `runShown`: the script's computer is the one the shell shows, where that run goes. */
export function OverviewTab({ item, comp, onChanged, linkFaq, onSetSchedule, onRunNow, runShown = true, now = Date.now() }: { item: ScriptItem; comp: CompScripts; onChanged: () => unknown; linkFaq?: FaqItem; onSetSchedule?: () => void; onRunNow?: () => void; runShown?: boolean; now?: number }) {
  const t = useStrings(strings);
  const can = !!comp.caps?.executions;
  const usage = useUsage(item.id, can);
  const failures = useFailures(item.id, can);
  const create = useAliasCreate();
  const state = useAliasState();
  const remove = useAliasRemove();
  const links = aliasesFor(comp.aliases, item.path);
  // Only the alias holds of this script (the address it makes, the aliases it lists) show here and are freed by a Dismiss.
  const ids = links.map((a) => a.id);
  const field = (id: unknown, k: string): unknown => (id && typeof id === 'object' ? (id as Record<string, unknown>)[k] : undefined);
  const createH = forScript(create, ofIdentity((id) => field(id, 'compId') === comp.id && field(id, 'target') === item.route && (field(id, 'exec') ?? 1) === folderOf(item.path)));
  const stateH = forScript(state, ofIdentity((id) => ids.includes(String(field(id, 'alias')))));
  const removeH = forScript(remove, ofIdentity((id) => ids.includes(String(field(id, 'alias')))));
  const link = useChange(`${comp.id}\u0000${item.route}`, createH, stateH, removeH);
  // A change Computers sent: read-only here, with a link; its sender frees it. Hide clears only this notice.
  const elsewhere = useAliasHeldElsewhere({ ids, compId: comp.id, target: item.route, exec: folderOf(item.path) });
  const [hidden, setHidden] = useState(false);
  // The dialog that names the link, and whether one was just made here (its note says it may take a minute to open).
  const [naming, setNaming] = useState(false);
  // Each link made here: a new note (keyed by its count) names it, so a second link in one visit is announced too.
  const [made, setMade] = useState<{ n: number; name: string } | null>(null);
  const linkName = useLinkName();
  const otherHold = !!elsewhere && !hidden;
  // One eligibility for the opener, the dialog's button and its send: what is true now, not what was true when the dialog opened.
  // Every block but the two that draw their own note (a change held elsewhere, this view's held outcome) shows its reason below.
  const why = shareWhy(item, comp, link.locked);
  const linksWhy = shareWhy(item, comp, link.locked, true);
  const held = heldByOther(link.out) || otherHold;
  const canMake = !why && !held;
  const linksOff = !!linksWhy || held;
  // Each reason shown once: Make a link's (a dynamic address with no link already says so in the empty state), and, when the
  // existing links are off for another reason (an address reason comes first for Make a link), theirs too.
  const shownWhy = [why && !(why.k === 'dynamic' && links.length === 0) ? why : null, linksWhy && links.length > 0 && linksWhy.k !== why?.k ? linksWhy : null].filter((w): w is NonNullable<typeof w> => !!w);
  const logs = logsHref({ computerHandle: item.compHandle, rootRel: item.path, status: 'failed' });
  // A preset schedule in words, as the list names it; any other expression stays as written (monospace).
  const cron = cronOf(item.schedule);
  const schedWords = schedText(t, cron);
  const schedBlock = schedWhy(item, comp);
  // The next runs as the Hub calculates them (UTC, the exec kit's zone): a calculation, never what the computer registered.
  const pv = cron ? nextRuns(cron, now, 0, 3) : null;
  const schedules = cron ? schedulesHref({ computerHandle: item.compHandle, rootRel: item.path }) : null;
  // Run now: only while a schedule is written (the computer runs only a scheduled script this way), after a confirm that says
  // it really runs.
  const [runAsk, setRunAsk] = useState(false);
  // Remove asks first, bound to the one link it names: the dialog shows that link while the list still holds it, and
  // closes if the link leaves the list (removed elsewhere) before the press.
  const [removeId, setRemoveId] = useState<string | null>(null);
  const removeAsk = removeId === null ? undefined : links.find((a) => a.id === removeId);
  useEffect(() => { if (removeId !== null && !removeAsk) setRemoveId(null); }, [removeId, removeAsk]);
  // Checked again while the confirm is open: links that went off since it opened (a change still going or held, the
  // ownership read) leave it open with Remove off, saying why; it never closes without a word.
  const removeWhy = !linksOff ? null : linksWhy && linksWhy.k !== 'waiting' ? t(shareWhyKey(linksWhy) as never, { computer: comp.name, template: linksWhy.k === 'managed' ? linksWhy.template : '' }) : t('share.removeWait');
  const runBlock = runWhy(item, comp, runShown);
  // Checked again while the confirm is open: a schedule removed, a computer turned off or switched, a key added since
  // it opened leaves the confirm off, saying why.
  const confirmBlock = !cron ? 'gone' : runBlock;
  const runAction = cron && onRunNow
    ? { id: 'script-schedule-run', label: t('menu.run'), icon: 'play' as const, opens: 'dialog' as const, ...(runBlock ? { disabledReason: t(`overview.runWhy.${runBlock}`, { computer: comp.name }) } : {}), onPress: () => setRunAsk(true) }
    : null;
  const setAction = onSetSchedule
    ? {
        id: 'script-schedule-set',
        label: t(cron ? 'overview.schedChange' : 'overview.schedSet'),
        icon: 'clock' as const,
        ...(schedBlock ? { disabledReason: t(`overview.schedWhy.${schedBlock}`, { computer: comp.name, template: item.managed?.template ?? '' }) } : {}),
        onPress: onSetSchedule,
      }
    : null;

  return (
    <Stack gap={4}>
      <Panel title={t('overview.about')}>
        <div className={s.about}>
          {item.served ? (
            <SubSection title={t(item.dynamic ? 'fact.addressPattern' : 'fact.address')}>
              <ScriptAddress origin={comp.origin} path={item.pattern} label={t(item.dynamic ? 'fact.addressPattern' : 'fact.address')} />
            </SubSection>
          ) : null}
          <Facts
            columns={2}
            items={[
              { label: t('fact.computer'), value: <ComputerLink handle={item.compHandle} name={item.compName} variant="nav" /> },
              { label: t('fact.file'), value: item.path.replace(/^default\/1\//, ''), mono: true },
              { label: t('fact.schedule'), value: schedWords ?? item.schedule ?? t('fact.none'), mono: !schedWords && !!item.schedule },
              { label: t('fact.key'), value: item.keyed ? t('key.on') : t('key.off') },
            ]}
          />
        </div>
      </Panel>
      <Panel title={t('overview.last24')} actions={logs ? <PageLinkTo href={logs}>{t('overview.openLogs')}</PageLinkTo> : undefined}>
        {!can ? (
          <EmptyState size="sm" icon="info" title={t('overview.noUsage')} body={t('overview.noUsageBody')} />
        ) : usage.isPending ? (
          <Skeleton rows={3} />
        ) : usage.data === null || usage.data === undefined ? (
          <EmptyState size="sm" icon="clock" title={t('overview.noCalls')} body={t('overview.noCallsBody')} />
        ) : (
          <>
            <div className={s.stats}>
              <StatTile label={t('overview.calls')} value={(usage.data.totals.calls ?? 0).toLocaleString('en')} />
              <StatTile label={t('overview.failed')} value={(usage.data.totals.failed ?? 0).toLocaleString('en')} tone={(usage.data.totals.failed ?? 0) > 0 ? 'danger' : 'neutral'} />
              <StatTile label={t('overview.median')} value={usage.data.totals.p50Ms != null ? `${usage.data.totals.p50Ms} ms` : '—'} />
            </div>
            <Sparkline points={usage.data.hours.map(hourCalls)} label={t('overview.hours')} />
            {usage.data.coverage?.complete === false ? <Band size="table">{t('overview.partial')}</Band> : null}
          </>
        )}
      </Panel>

      {can && failures.data && failures.data.length > 0 ? (
        <Panel title={t('overview.failures')} flush>
          <ul className={s.versionList}>
            {failures.data.map((f) => {
              const href = logsHref({ computerHandle: item.compHandle, rootRel: item.path, status: 'failed', executionId: f.executionId });
              return (
                <li key={f.executionId}>
                  <span>
                    <strong>{f.status}</strong> <span className={s.faint}>{formatDateTime(f.receivedAt)}</span>
                    {f.error ? <span className={s.errLine}>{f.error}</span> : null}
                  </span>
                  {href ? <PageLinkTo href={href}>{t('overview.seeCall')}</PageLinkTo> : null}
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      {/* Always shown: the schedule in words and as written (UTC), its next runs as calculated here, and
          the one way to change it, which opens Settings > How it runs at the schedule field (off, with the reason, when it can't). */}
      <AnatomySection
        id="script-schedule"
        title={t('overview.schedule')}
        // No primary here: the page's one accent is its header action, so the schedule's actions are plain buttons
        // here. Schedules is a link row of the facts below, which leaves at most two buttons.
        actions={setAction && runAction ? { secondary: [setAction, runAction] as const } : setAction ? { secondary: [setAction] as const } : runAction ? { secondary: [runAction] as const } : {}}
        state={{ kind: 'ready' }}
      >
        {cron ? (
          <Facts
            columns={1}
            label={t('overview.schedule')}
            items={[
              { label: t('overview.schedWhen'), value: schedWords ?? cron, mono: !schedWords },
              { label: t('overview.schedExpr'), value: t('overview.schedExprValue', { cron }), mono: true },
              { label: t('overview.schedNext'), value: !pv || !pv.ok ? t('pick.noCalc') : pv.never ? t('pick.never') : t('overview.schedNextValue', { runs: pv.runs.map(utcText).join(' · ') }) },
              // Schedules opens folder 1's scripts only: a script of another folder shows its schedule without the link.
              ...(schedules ? [{ label: t('overview.schedAll'), value: t('overview.openSchedules'), href: schedules }] : []),
            ]}
          />
        ) : (
          // No schedule: the same "Runs" fact says so, so the card is never an empty box under its buttons.
          <Facts columns={1} label={t('overview.schedule')} items={[{ label: t('overview.schedWhen'), value: t('overview.schedNone') }]} />
        )}
      </AnatomySection>
      <ConfirmDialog
        overlayId="script-link-remove"
        isOpen={!!removeAsk}
        onOpenChange={(o) => { if (!o) setRemoveId(null); }}
        title={t('share.removeTitle')}
        body={t('share.removeBody', { url: removeAsk ? removeAsk.url.replace(/^https:\/\//, '') : '' })}
        tone="danger"
        confirmLabel={t('share.remove')}
        {...(removeWhy ? { confirmDisabled: true, confirmDisabledReason: removeWhy } : {})}
        onConfirm={() => {
          const a = removeAsk;
          if (a && linksOff) return;
          setRemoveId(null);
          if (!a) return;
          void link.run(() => remove.mutateAsync({ id: a.id })).then((r) => { if (r?.outcome === 'done') onChanged(); });
        }}
      />
      <ConfirmDialog
        overlayId="script-run-now"
        isOpen={runAsk}
        onOpenChange={setRunAsk}
        title={t('run.ask.title', { name: item.name })}
        body={confirmBlock ? t(`overview.runWhy.${confirmBlock}`, { computer: comp.name }) : t('run.ask.body')}
        {...(confirmBlock ? {} : { consequences: [t('run.ask.once'), t('run.ask.lost')] })}
        confirmLabel={t('menu.run')}
        confirmDisabled={!!confirmBlock || !onRunNow}
        onConfirm={() => {
          if (confirmBlock) return;
          setRunAsk(false);
          onRunNow?.();
        }}
      />

      <Panel
        title={t('share.title')}
        description={t('share.body')}
        actions={
          <Button
            size="sm"
            icon="plus"
            busy={link.busy}
            isDisabled={!canMake}
            onPress={() => setNaming(true)}
          >
            {t('share.make')}
          </Button>
        }
      >
        {shownWhy.map((w) => {
          const line = t(shareWhyKey(w) as never, { computer: comp.name, template: w.k === 'managed' ? w.template : '' });
          const check = shareWhyRechecks(w) ? <TextButton onPress={() => void onChanged()}>{t('share.check')}</TextButton> : undefined;
          // A failed ownership read is a warning with the rejection's Details (conformance.errors E1); the others are notes.
          return w.k === 'ownerFailed' ? (
            <Band key={w.k} size="table" tone="warn" error={w.error} actions={check}>{line}</Band>
          ) : (
            <Band key={w.k} size="table" tone="neutral" actions={check}>{line}</Band>
          );
        })}
        {linkFaq ? (
          <Why question={t('share.who.q')} faq={{ item: linkFaq, label: t('share.more') }}>
            {t('share.who.a')}
          </Why>
        ) : null}
        <div role="status" /* reason: the one-line "link made" note, announced in place of the old toast (inline first) */>{made ? <div key={made.n}><Notice>{t('share.made', { name: made.name })}</Notice><PropagatingNote variant="created" /></div> : null}</div>
        {otherHold ? <HeldElsewhere out={{ kind: 'not_sent', code: HELD_BY_OTHER, from: elsewhere.from }} onHide={() => setHidden(true)} /> : null}
        <ChangeBanner out={link.out} what="settings" onDismiss={link.settle} onCheck={() => readBackOf(link.settle, createH, stateH, removeH)} onForce={link.force} />
        {links.length === 0 ? (
          <EmptyState size="sm" icon="link" title={t('share.none')} body={item.route.includes('[') ? t('share.dynamic') : t('share.noneBody')} />
        ) : (
          <ul className={s.linkList}>
            {links.map((a) => (
              <li key={a.id}>
                <span className={s.linkUrl}>
                  <span className={s.mono}>{a.url.replace(/^https:\/\//, '')}</span>
                  <span className={s.faint}>{a.target_path}</span>
                </span>
                <Switch label={t('share.on')} isSelected={a.enabled !== false} isDisabled={linksOff} onChange={(v) => void link.run(() => state.mutateAsync({ id: a.id, enabled: v })).then((r) => { if (r?.outcome === 'done') onChanged(); })} />
                <CopyButton text={a.url} label={t('share.copy')} />
                <PropagatingNote createdAt={a.created_at} />
                <IconButton icon="trash" size="sm" label={t('share.remove')} isDisabled={linksOff} onPress={() => setRemoveId(a.id)} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Dialog
        isOpen={naming}
        onOpenChange={setNaming}
        title={t('link.dialogTitle')}
        body={t('link.dialogBody')}
        size="lg"
        primaryLabel={t('link.go')}
        primaryDisabled={!linkName.valid || !canMake}
        onPrimary={() => {
          setNaming(false);
          if (!canMake || !linkName.valid) return;
          const name = linkName.name;
          void link.run(() => create.mutateAsync({ compId: comp.id, target: item.route, alias: name, exec: folderOf(item.path) })).then((r) => {
            if (r?.outcome === 'done') {
              // Inline first: the made note names the link here (and is announced) and its row appears, so no toast.
              setMade((m) => ({ n: (m?.n ?? 0) + 1, name }));
              onChanged();
            }
          });
        }}
      >
        <LinkNameField link={linkName} />
      </Dialog>
    </Stack>
  );
}
