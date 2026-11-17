// The Bot's Auto-approve state, always on its page: a pill that is also the switch. A new Bot starts On, so
// the state has to be plain and one press away. On to Off is one press; Off to On names the effect first. Both are the Settings
// save (same route, same expect_uid and expect_revision), so the proof that reads a change back is the same one. The pill says On
// only because the Bot says so, counts the helpers the change has not reached (a delegate whose approval policy refuses YOLO keeps
// asking), and an answer that was lost is neither On nor Off: it checks, it never sends again (C9).
import { ConfirmDialog, OutcomeBanner, StatusToggle, useStrings } from '@kit';
import { useEffect, useState } from 'react';
import type { BotView, Change, SavedSettings, SettingsPatch } from '../data';
import strings from '../strings.en.json';

type Save = Change<SavedSettings, { patch: SettingsPatch; uid?: string; revision?: number }>;

/**
 * What the pill may say. On or Off only when the Bot's flag AND every open helper agree (`yolo_unapplied` read and empty); a helper that
 * has not confirmed, or a read that does not carry the helpers, is Mixed or Unknown, never Off (a helper may still approve alone).
 */
export type AutoState = 'on' | 'off' | 'mixed-on' | 'mixed-off' | 'refused' | 'unknown';
export function autoStateOf(bot: Pick<BotView, 'yolo' | 'yoloUnapplied'>): AutoState {
  const un = bot.yoloUnapplied;
  if (!un) return 'unknown';
  if (un.pending + un.refused === 0) return bot.yolo ? 'on' : 'off';
  if (!bot.yolo) return 'mixed-off';
  return un.pending === 0 ? 'refused' : 'mixed-on';
}

export function AutoApprove({ bot, save }: { bot: BotView; save: Save }) {
  const t = useStrings(strings);
  // The press that asked, with the Bot it was asked for: a refresh that brings another Bot (or a newer revision) under an open dialog
  // neither re-targets the press nor sends the newer fence; a different Bot closes it.
  const [asking, setAsking] = useState<{ key: string; uid: string; revision: number } | null>(null);
  useEffect(() => {
    if (asking && (asking.key !== bot.key || asking.uid !== bot.uid)) setAsking(null);
  }, [asking, bot.key, bot.uid]);
  const unknownOutcome = save.outcome === 'pending';
  const state = autoStateOf(bot);
  const un = bot.yoloUnapplied;
  const label = unknownOutcome
    ? t('bot.autoApproveMaybe')
    : state === 'on'
      ? t('bot.autoApprove')
      : state === 'off'
        ? t('bot.autoApproveOff')
        : state === 'refused'
          ? t('bot.autoApproveRefused', { count: un?.refused ?? 0 })
          : state === 'mixed-on'
            ? t('bot.autoApproveMixedOn', { count: (un?.pending ?? 0) + (un?.refused ?? 0) })
            : state === 'mixed-off'
              ? t('bot.autoApproveMixedOff', { count: (un?.pending ?? 0) + (un?.refused ?? 0) })
              : t('bot.autoApproveUnknown');
  const warn = unknownOutcome || (state !== 'on' && state !== 'off');
  const send = (yolo: boolean, fence: { uid: string; revision: number }) => save.run({ patch: { yolo }, uid: fence.uid, revision: fence.revision });
  const press = () => {
    if (unknownOutcome) return void save.readBack();
    if (bot.yolo) void send(false, { uid: bot.uid, revision: bot.guardrailRevision });
    else setAsking({ key: bot.key, uid: bot.uid, revision: bot.guardrailRevision });
  };
  return (
    <>
      <StatusToggle tone={warn ? 'danger' : bot.yolo ? 'warn' : 'neutral'} isPressed={warn ? 'mixed' : bot.yolo} isDisabled={save.running} onPress={press}>
        {label}
      </StatusToggle>
      <ConfirmDialog
        overlayId="bots-autoapprove-confirm"
        isOpen={asking !== null}
        onOpenChange={(o) => {
          if (!o) {
            setAsking(null);
            // The dialog already said a refused press was not made; it does not say it again under the header.
            if (save.outcome === 'failed') save.dismiss();
          }
        }}
        title={t('autoapprove.confirmTitle')}
        body={t('autoapprove.confirmBody')}
        confirmLabel={t('autoapprove.confirmGo')}
        busy={save.running}
        outcome={save.outcome === 'failed' || save.outcome === 'pending' ? { kind: save.outcome } : undefined}
        onCheck={() => save.readBack()}
        onConfirm={() => asking && void send(true, asking).then((r) => r.outcome === 'done' && setAsking(null))}
      />
    </>
  );
}

/** What a press that did not end in "done" says, where the pane keeps its other notices. The dialog of an On press says it itself. */
export function AutoApproveNote({ save }: { save: Save }) {
  const t = useStrings(strings);
  if (save.outcome === 'pending') return <OutcomeBanner kind="pending" /* noDetails: an unknown outcome has no rejection to pass */ title={t('autoapprove.unknown')} onCheck={() => save.readBack()} onDismiss={() => save.dismiss()} />;
  if (save.outcome === 'failed') return <OutcomeBanner kind="failed" /* noDetails: the save was refused or not sent; the words say nothing changed, and the agent's own text is not shown */ title={t('autoapprove.failed')} onDismiss={() => save.dismiss()} />;
  return null;
}
