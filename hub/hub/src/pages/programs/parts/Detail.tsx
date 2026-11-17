// The inspector, as Computer > Backups: the program's Start, Restart and Stop in the header
// (Logs in its ⋯ menu), its notes, an At a glance block of facts, one Ports table (every port's state, address and
// aliases, with Start a port as its primary) and the Sandbox.
import type { AliasRow } from '@core';
import {
  AnatomySection, Band, Button, ConfirmDialog, DetailPage, Facts, Stack, StatusPill, Switch, TextButton, When, Why, useStrings, type FaqItem, type MenuEntry,
} from '@kit';
import { useId } from 'react';
import { type Action, type Row as ProgramRow, ask, duration, tone } from '../logic';
import strings from '../strings.en.json';
import { Ports, type AliasesFailedProps } from './Addresses';
import { OpNote } from './OpNote';
import { type Op, isHeld } from './ops';
import { EditDrawer, EditNote, type EditApi } from './EditProgram';
import { RemoveDialog, RemoveNote, type RemoveApi } from './RemoveProgram';
import { useSandboxBusy } from '../sandbox/busy';
import { SandboxPanel } from '../sandbox/SandboxPanel';
import sbStrings from '../sandbox/strings.en.json';
import { endsValue, problemText, stateLabel, stopText } from './words';

export interface Confirm {
  /** The account/realm/computer partition the confirmation was asked in. */
  part: string;
  key: string;
  act: Action;
  /** A per-port action of a range program: the confirmed part (null: the whole program). */
  port: number | null;
  /** A port-range program (links.ts programOp makes a whole stop or restart cover every part). */
  range: boolean;
}

export interface DetailProps {
  row: ProgramRow;
  /** The page's answer about system programs: linked under the system-program note when given. */
  systemFaq?: FaqItem;
  op: Op | undefined;
  confirm: Confirm | null;
  /** The page's press path; a press it sent answers with its outcome ('done' = known success), nothing otherwise. */
  onAct: (row: ProgramRow, action: Action, opts: { port: number | null; range: boolean; boot?: boolean }) => void | Promise<string | undefined>;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  /** The op the control showed travels with the row (OpNote): the action names exactly that send. */
  onCheck: (row: ProgramRow, shown: Op) => void;
  onDismiss: (row: ProgramRow, shown: Op) => Promise<boolean>;
  /** Absent: no Logs page on this load (Logs controls are hidden). */
  onLogs?: (row: ProgramRow, port: number | null) => void;
  /** The list's own refresh (a program whose state the computer did not report offers it). */
  onRefresh?: () => void;
  /** Where inside a sending page its held change is checked or dismissed (OpNote senderPath). */
  senderPath?: (page: string) => string | undefined;
  /** A port's web address on this computer ('' while the computer's server is not known). */
  addressOf?: (port: number) => string;
  /** Create an alias for exactly one port (Computers' alias drawer); absent while it cannot be offered. */
  onAlias?: (port: number) => void;
  /** The program's aliases by port (logic programAliases): listed beside each port's address. */
  aliases?: ReadonlyMap<number, readonly AliasRow[]>;
  /** The alias read failed: one failed line with Try again in the Ports section's notices, for the whole table. */
  aliasesFailed?: AliasesFailedProps;
  /** The first alias read is out: one line in the Ports section's notices says the aliases are being read. */
  aliasesLoading?: boolean;
  /** Remove (view.tsx's hook): the menu's Remove for a program the person added, its confirm and its note. Absent:
   *  no Remove here. */
  remove?: RemoveApi;
  /** The computer's name, for the Remove confirm. */
  computer?: string;
  /** Edit (view.tsx's hook): the menu's Edit for a program the person added, its drawer and its note. Absent: no
   *  Edit here. */
  edit?: EditApi;
}

export function Detail({ row, systemFaq, op, confirm, onAct, onConfirm, onCancelConfirm, onCheck, onDismiss, onLogs, onRefresh, senderPath, addressOf, onAlias, aliases, aliasesFailed, aliasesLoading = false, remove, computer = '', edit }: DetailProps) {
  const t = useStrings(strings);
  // A removal of the program that is being sent or is not known yet holds its other actions, as a held change does.
  const rmAttempt = remove?.attempt(row.key);
  const edAttempt = edit?.attempt(row.key);
  const held = isHeld(op) || !!remove?.busy(row.key) || !!edit?.busy(row.key);
  const ts = useStrings(sbStrings);
  // A sandbox save of this program that is sending, pending or unknown (core's hold) or unclear (this tab's note)
  // holds its Start, Stop and Restart (view.tsx run() refuses them too): shown off, with the reason, until the hold
  // settles or is dismissed.
  const sandboxBusy = useSandboxBusy();
  const sbHeld = sandboxBusy(row.key, row.id);
  // The reason is written once under the header (its actions and the boot switch point at it); the Ports table says it
  // once more in its own notices, and each port action carries it as its disabled reason.
  const waitId = useId();
  const asked = confirm && confirm.key === row.key ? confirm : null;
  const question = asked ? ask(row, asked.act) : null;
  const nameText = row.name || t('unnamed');
  // A program that needs a look says what went wrong in one line under the header, pointing at its log (and, for a
  // state the computer did not report, offering the list's refresh), unless an action's own note is speaking for it.
  const problem = op ? null : problemText(t, nameText, row.state, row.exitCode);
  const unknown = row.state === 'unknown';
  const off = held || sbHeld;
  const all = !!row.range;
  const v = { name: nameText };

  // The whole program's actions, in the header: Start, Restart, Stop (a range's Restart and Stop cover every part).
  const act = (a: 'start' | 'restart' | 'stop', icon: 'play' | 'reload' | 'stop') => (
    <Button
      key={a}
      size="sm"
      icon={icon}
      aria-label={a !== 'start' && all ? t(`action.${a}AllName` as 'action.stopAllName', v) : t(`action.${a}Name` as 'action.startName', v)}
      isDisabled={off}
      // A sandbox change's wait is the line under the header; a held action of the program says its own reason here.
      {...(sbHeld ? { 'aria-describedby': waitId } : held ? { disabledReason: t('ports.held') } : {})}
      onPress={() => onAct(row, a, { port: null, range: all })}
    >
      {t(`action.${a}`)}
    </Button>
  );
  // The ⋯ menu: Logs, then (a program the person added only) Remove, which asks first. While another change of the
  // program is held or out the menu leaves Remove out (the row's own menu shows it off with the reason; the note here
  // says what is held): a second reason line here takes the panel past its explanation budget.
  const canRemove = !!remove?.offers(row);
  // Edit (name and command), under the same rule, before Remove.
  const canEdit = !!edit?.offers(row);
  const menu: MenuEntry[] = [
    ...(onLogs ? [{ id: 'logs', label: t('action.logsName', v), onAction: () => onLogs(row, null) }] : []),
    ...((canRemove || canEdit) && !off && onLogs ? ['-' as const] : []),
    ...(canEdit && !off ? [{ id: 'edit', label: t('action.editName', v), icon: 'pen' as const, opens: true, onAction: () => edit?.ask(row) }] : []),
    ...(canRemove && !off ? [{ id: 'remove', label: t('action.removeName', v), icon: 'trash' as const, tone: 'danger' as const, opens: true, onAction: () => remove?.ask(row) }] : []),
  ];
  const headerActions =
    row.can.start || row.can.restart || row.can.stop ? (
      <>
        {row.can.start && act('start', 'play')}
        {row.can.restart && act('restart', 'reload')}
        {row.can.stop && act('stop', 'stop')}
      </>
    ) : undefined;

  // At a glance: Kind, State, Up, Restarts, Starts with the computer (the switch is the value), Ends, Last stop.
  // Times are relative, the full date in the tooltip. The ports and their addresses are the Ports table's.
  const lastStop = row.state !== 'running' && row.state !== 'starting' ? stopText(t, row.stop) : null;
  const startup = row.can.boot ? (
    <Switch
      label={t('bootSwitch')}
      isSelected={row.boot}
      isDisabled={off}
      // As the header's actions: a sandbox change's wait is the line under the header, a held change says its own reason.
      {...(sbHeld ? { 'aria-describedby': waitId } : held ? { disabledReason: t('ports.held') } : {})}
      onChange={(on) => onAct(row, 'boot', { port: null, range: all, boot: on })}
    />
  ) : row.lazy ? t('lazy') : row.boot ? t('boot') : t('boot.off');
  const facts = [
    { label: t('fact.kind'), value: t(`kind.${row.scope}`) },
    { label: t('fact.state'), value: row.known ? stateLabel(t, row.state, row.exitCode) : t('unreadable') },
    ...(row.up !== null ? [{ label: t('fact.up'), value: duration(row.up) }] : []),
    ...(row.policy ? [{ label: t('fact.restarts'), value: t(row.policy === 'always' ? 'pol.always' : row.policy === 'unexpected' ? 'pol.crash' : 'pol.once') }] : []),
    ...(row.scope !== 'temporary' ? [{ label: t('fact.startup'), value: startup }] : []),
    ...(row.ends !== null ? [{ label: t('fact.ends'), value: <When at={row.ends} text={endsValue(t, row.ends)} /> }] : []),
    ...(lastStop !== null && row.stop?.at != null ? [{ label: t('fact.lastStop'), value: <When at={row.stop.at} text={lastStop} /> }] : []),
  ];

  return (
    // The kit detail: in the list pane it draws the DetailHeader with its × (Close details), as every page's
    // inspector does.
    <DetailPage
      header={{
        title: nameText,
        meta: (
          <StatusPill tone={tone(row.state)} dot>
            {stateLabel(t, row.state, row.exitCode)}
          </StatusPill>
        ),
        ...(headerActions ? { actions: headerActions } : {}),
      }}
      {...(menu.length ? { menu } : {})}
    >
      <Stack gap={4}>
        {sbHeld && <p id={waitId}>{ts('sb.actionsWait')}</p>}
        {problem && (
          <Band
            tone={unknown ? 'warn' : 'danger'}
            size="table"
            /* noDetails: the program's state from the overview, not a rejection; no error to show */
            // Logs is the header menu's: the note points at it and adds no second button.
            actions={unknown && onRefresh ? <TextButton onPress={onRefresh}>{t('problem.refresh')}</TextButton> : undefined}
          >
            {onLogs && !unknown ? `${problem} ${t('problem.why')}` : problem}
          </Band>
        )}
        {/* The system-program confirm is a Dialog; the "these keep the computer working" note stays
            once, above the facts. */}
        <ConfirmDialog overlayId="programs-confirm"
          isOpen={!!(asked && question)}
          onOpenChange={(open) => !open && onCancelConfirm()}
          title={asked ? t(`ask.${asked.act}T` as 'ask.stopT', { name: nameText }) : ''}
          body={
            asked && question ? (
              <>
                <p>{t('ask.body', { name: nameText })}</p>
                {question.dep && <p>{t(`dep.${question.dep}` as 'dep.agent')}</p>}
                <p>{t(asked?.act === 'restart' ? 'ask.restartFoot' : 'ask.foot')}</p>
              </>
            ) : null
          }
          confirmLabel={asked ? t(`ask.${asked.act}Go` as 'ask.stopGo') : ''}
          // Stop and restart are plain confirms with the accent action: nothing is deleted.
          onConfirm={onConfirm}
        />
        {remove && <RemoveDialog api={remove} computer={computer} />}
        {edit && <EditDrawer api={edit} />}
        {/* One note of the two. Only one of them can be working or not known (each waits for the other), and that one
            comes first: its Check again must not sit behind the other's settled refusal. An edit's refusal is the open
            drawer's own line, so it is not said here a second time. */}
        {edAttempt && edit && (edit.busy(row.key) || (!rmAttempt && edit.asked?.key !== row.key)) ? (
          <EditNote attempt={edAttempt} onCheck={(a) => edit.check(row.key, a)} onDismiss={(a) => edit.dismiss(row.key, a)} />
        ) : rmAttempt && remove ? (
          <RemoveNote attempt={rmAttempt} onCheck={(a) => remove.check(row.key, a)} onDismiss={(a) => remove.dismiss(row.key, a)} />
        ) : null}
        {op && <OpNote op={op} name={nameText} onCheck={(o) => onCheck(row, o)} onDismiss={(o) => onDismiss(row, o)} {...(senderPath ? { senderPath } : {})} />}
        {/* Why a system program needs care, closed; its question opens the page's answer. The confirm says it
            again before a stop or restart. Without the page FAQ (a host without one) the line stays as it was. */}
        {row.scope === 'system' && (systemFaq ? <Why question={t('sys.why')} faq={{ item: systemFaq, label: t('sys.more') }}>{t('sysHint')}</Why> : <p>{t('sysHint')}</p>)}
        <AnatomySection id="glance" title={t('detail.glance')}>
          <Facts columns={1} items={facts} label={t('detail.facts')} />
        </AnatomySection>
        <Ports
          key={row.key}
          row={row}
          nameText={nameText}
          held={held}
          sbHeld={sbHeld}
          onAct={(a, o) => onAct(row, a, o)}
          {...(onLogs ? { onLogs: (port: number) => onLogs(row, port) } : {})}
          {...(addressOf ? { addressOf } : {})}
          {...(onAlias ? { onAlias } : {})}
          {...(aliases ? { aliases } : {})}
          {...(aliasesFailed ? { aliasesFailed } : {})}
          aliasesLoading={aliasesLoading}
        />
        <SandboxPanel key={`sandbox|${row.key}`} row={row} onRestart={() => onAct(row, 'restart', { port: null, range: all })} restartHeld={off} />
      </Stack>
    </DetailPage>
  );
}
