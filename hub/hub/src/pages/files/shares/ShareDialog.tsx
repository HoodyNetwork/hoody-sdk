// Share a folder: one folder of one computer, another of the person's computers, and the access it gets.
// Nothing is sent until Share folder is pressed, and that send goes out once: a lost answer is held by core and read
// back through the share lists (changes.ts), shown here and in the section as "may have gone through" with Check
// again, which only reads. Share folder first reads, fresh and whole, what the computer already shares: a folder
// already shared with that computer is not sent, an unreadable list sends nothing, and the shares of that folder to
// that computer go with the send (`before`), so its read-back is proved only by a share that was not there. The
// section's write gate (`wait`) is checked on the button and again right before the send. The server stays the judge of the path; the Hub only says early what it would refuse
// (pathProblem.ts): under the folder field, and as the reason on Share folder while it cannot be sent. The folder field
// is the kit's path field over the source computer's own folders (folderReads.ts), rooted at its top folder. Read and
// write is offered with its warning: the other computer can change and delete the files.
import { refusal, type useRunner } from '@core';
import { Band, Button, ComputerPicker, Drawer, HeldBand, Outcome, PathField, ReasonButton, SegmentedControl, SettingGroup, SettingRow, useComputerChoice, useStrings, type ComputerChoice } from '@kit';
import { useEffect, useRef, useState } from 'react';
import type { FilesComputer } from '../data';
import { beforeOf, refusalOf, type CreateVars } from './changes';
import { useFolderReads } from './folderReads';
import { sharePathOf, sharePathProblem } from './pathProblem';
import type { ShareComputer } from './section';
import strings from './strings.en.json';
import type { ShareList, ShareMode, ShareRow } from './wire';

export interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The computer whose folder is shared. */
  source: FilesComputer;
  /** The folder the dialog opens with ('' for none). */
  path: string;
  /** The person's computers in this realm view. */
  computers: readonly ShareComputer[];
  /** What the source already shares, so a second share of the same folder to the same computer is not offered. */
  given: readonly ShareRow[];
  /** Reads what the source gives again, now: the list (its own, or every computer's), or the read's error. Share
   *  folder sends only after it. */
  readGiven: () => Promise<{ list?: ShareList; error?: unknown }>;
  create: ReturnType<typeof useRunner<CreateVars>>;
  /** The section's write gate: why no sharing change can start now (another one is out or held), or null. */
  wait: string | null;
  /** The held create is this page's own (another page's is only checked, never dismissed here). */
  own: boolean;
  /** A proved or answered create: read the lists again. */
  onShared: () => void;
}

export function ShareDialog({ isOpen, onClose, source, path: given0, computers, given, readGiven, create, wait, own, onShared }: ShareDialogProps) {
  const t = useStrings(strings);
  // The field's value: the path below the top folder, without its leading "/".
  const rel = (p: string) => p.replace(/^\/+/, '');
  const [path, setPath] = useState(rel(given0));
  const reads = useFolderReads(source);
  const [target, setTarget] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<ShareMode>('readonly');
  const [touched, setTouched] = useState(false);
  // The read just before the send is out; and its last answer could not be read (nothing was sent).
  const [reading, setReading] = useState(false);
  const [unread, setUnread] = useState<{ error: unknown } | null>(null);
  // The gate as it is now, for the check after the read (the press's render may be older).
  const gateNow = useRef(wait);
  gateNow.current = wait;
  // Each opening starts from the folder it was opened for; nothing typed for another folder is kept.
  useEffect(() => {
    if (!isOpen) return;
    setPath(rel(given0));
    setTarget(undefined);
    setMode('readonly');
    setTouched(false);
    setUnread(null);
  }, [isOpen, given0]);

  const others = computers.filter((c) => c.id !== source.id);
  // The kit's one mapping of a computer to a picker row (its state in words, its place). A stopped computer can be
  // chosen: the folder appears on it when it starts. Built in a loop, not a map: the rows hold computer names and the
  // kit's own state words, no text of this page, and the anatomy check cannot read a mapped list of picker rows.
  const choice = useComputerChoice();
  const choices: ComputerChoice[] = [];
  for (const c of computers) if (c.id !== source.id) choices.push(choice(c));
  const to = others.find((c) => c.id === target);
  const typed = path.trim();
  const clean = sharePathOf(typed);
  const problem = typed === '' ? 'empty' : sharePathProblem(clean);
  const exists = !problem && !!to && given.some((r) => r.sourcePath === clean && r.targetComputerId === to.id);
  const held = create.held;
  const working = create.busy || reading;
  // Another sharing change out or held stops this one (the dialog's own send is its busy state, its hold the band).
  const gate = held || working ? null : wait;
  // The first thing in the way: the gate, then the form's order.
  const reason = gate ?? (problem ? t(`why.${problem}`) : !to ? t('why.target') : exists ? t('why.exists', { to: to.name }) : null);
  const mine = refusalOf(create.outcome);

  const send = async () => {
    if (reason !== null || !to || held || working || gateNow.current !== null) return;
    const v = { source: source.id, path: clean, target: to.id, mode };
    setUnread(null);
    setReading(true);
    let fresh: { list?: ShareList; error?: unknown };
    try { fresh = await readGiven().catch((error: unknown) => ({ error })); } finally { setReading(false); }
    const before = beforeOf(fresh.list, v);
    // Unread: nothing is sent. Already shared: the fresh list now says so (`exists`), nothing is sent.
    if (before === null) { setUnread({ error: fresh.error }); return; }
    if (before.length > 0 || gateNow.current !== null) return;
    const r = await create.run({ ...v, before });
    if (r.outcome !== 'done') return;
    onShared();
    onClose();
  };
  const check = async () => { if (await create.check()) { onShared(); return true; } return false; };

  const access = (
    <SegmentedControl<ShareMode>
      label={t('new.access')}
      value={mode}
      onChange={(m) => { setTouched(true); setMode(m); }}
      // Held still while the read before the send is out: the access sent is the one captured at the press.
      isDisabled={working}
      items={[{ id: 'readonly', label: t('access.readonly') }, { id: 'readwrite', label: t('access.readwrite') }]}
    />
  );

  return (
    <Drawer
      overlayId="files-shares-new"
      resizeKey="files-shares-new"
      isOpen={isOpen}
      onOpenChange={(o) => { if (!o && !working) onClose(); }}
      title={t('new.title')}
      subtitle={t('new.subtitle', { name: source.name })}
      size="sm"
      dirty={touched && !held && !working}
      busy={working}
      outcome={held || !create.outcome ? undefined : (
        <Outcome
          outcome={create.outcome}
          doneText={t('new.done')}
          onCheck={check}
          wrap
          {...(mine ? { detail: t(`err.${mine}`) } : create.outcome.kind === 'pending' ? { detail: t('new.pendingDetail') } : {})}
          error={refusal(create.outcome)}
        />
      )}
      primary={held ? undefined : reason !== null
        ? <ReasonButton variant="primary" reason={reason}>{t('new.go')}</ReasonButton>
        : <Button variant="primary" busy={working} onPress={() => void send()}>{working ? t('new.busy') : t('new.go')}</Button>}
    >
      {held ? (
        <HeldBand
          overlayId="files-shares-held-dismiss-create-form"
          text={t('held.create', { path: String(held.path ?? ''), to: computers.find((c) => c.id === held.target)?.name ?? t('computer.unknown') })}
          readOnly={!own}
          onCheck={check}
          onDismiss={create.dismiss}
        />
      ) : (
        <>
          {unread ? (
            <Band tone="danger" error={unread.error} /* noDetails: when the answer was a list it could not use, there is no rejection to show */>
              {t('new.unread', { name: source.name })}
            </Band>
          ) : null}
          <SettingGroup variant="field" label={t('new.group')}>
            <SettingRow label={t('new.folder')} help={t('new.folderHelp', { name: source.name })}>
              <PathField
                aria-label={t('new.folder')}
                value={path}
                onChange={(v) => { setTouched(true); setPath(v); }}
                read={reads}
                mode="folder"
                rootLabel="/"
                computerName={source.name}
                isDisabled={working}
                {...(touched && problem ? { errorMessage: t(`why.${problem}`) } : {})}
              />
            </SettingRow>
            <SettingRow label={t('new.with')} help={exists && to ? t('why.exists', { to: to.name }) : t('new.at')}>
              <ComputerPicker label={t('new.with')} placeholder={t('new.withPick')} computers={choices} value={target} onChange={(id) => { setTouched(true); setTarget(id); }} isDisabled={working} />
            </SettingRow>
            <SettingRow label={t('new.access')}>
              {/* The band stays mounted and says its sentence only for read and write, so the choice never remounts (and
                  keeps the focus) when it is made. */}
              <Band tone="warn" attach={access} /* noDetails: a warning about what read and write allows, not a rejection */>
                {mode !== 'readwrite' ? null : to ? t('new.rwWarn', { to: to.name, from: source.name }) : t('new.rwWarnNoTarget', { from: source.name })}
              </Band>
            </SettingRow>
          </SettingGroup>
        </>
      )}
    </Drawer>
  );
}
