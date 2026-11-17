// AI → Knowledge → Instructions: the realm's instructions on the top bar's computer,
// the text and its on/off read and saved together. The words say only what the agent does:
// the block is added when on and not blank, a chat's or agent's prompt settings can leave it out, a chat re-reads it
// per turn, a running helper keeps its snapshot.
//   - A save is checked against the revision read. Changed since: nothing written; Compare shows how saving would change them, Keep
//     mine bases the draft on theirs (press Save again), Load theirs drops the draft. A realm settings.local.json that sets a field:
//     nothing written, the band names the field.
//   - A lost answer MAY have been saved: no second send, "Check what is saved" reads back (edit.ts).
//   - A failed read, an answer of the wrong shape and an agent without the route each say so; none reads as "no instructions" (C9).
//   - An edit holding work outlives the page (held.ts): reselecting the computer, another computer, realm or page and back shows it.
//   - A failed Read again keeps what is shown and says it is from the last read.
// Kit layout primitives only: DetailPage notice for the bands, a Form with a SettingSwitch, a TextField and
// the FormFooter, a Section for Compare.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Band, Button, CodeBlock, ComputerRequired, ConfirmDialog, DetailPage, ErrorState, Facts, Form, FormFooter, LeaveGuard, Section,
  IconButton, SettingSwitch, Skeleton, StatusPill, TextButton, TextField, diffRows, useStrings,
} from '@kit';
import { useCurrentComputer } from '@core';
import { useAiRealm } from '../../aiRealm';
import { instructionsApi } from './api';
import { type InstructionsAt, useInstructionsAt } from './data';
import { createEditStore, type EditStore, type EditView } from './edit';
import { editFor, editKey, gone, setLossWords, showing } from './held';
import { effectOf, routeMissing } from './logic';
import strings from './strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;

export default function InstructionsView() {
  const t = useStrings(strings);
  const computer = useCurrentComputer();
  const at = useInstructionsAt();
  const { deciding } = useAiRealm();
  const header = { title: t('title'), subtitle: t('subtitle') };
  if (!computer) return <ComputerRequired state="none" header={header} />;
  // Under All realms, while the computer's realms are read (aiRealm.ts): loading, not the realm question.
  if (!at && deciding) return <DetailPage header={header} state={{ kind: 'loading' }}>{null}</DetailPage>;
  if (!at) return <DetailPage header={header} state={{ kind: 'notHere', icon: 'realm', title: t('allRealms.title'), body: t('allRealms.body') }}>{null}</DetailPage>;
  // Keyed by what the edit is about (account, project, computer, realm), never by an object's identity: nothing read for one place
  // is ever shown for, or saved to, another, and the same place picked again keeps its edit.
  const key = editKey(at.target, at.realm);
  return <Edit key={key || `${at.target.container.id}\u0000${at.realm}`} id={key} at={at} />;
}

function Edit({ id, at }: { id: string; at: InstructionsAt }) {
  const t = useStrings(strings);
  const [store] = useState(() => editFor(id, () => createEditStore(instructionsApi(at.target, at.realm))));
  const v = useSyncExternalStore(store.subscribe, store.view, store.view);
  useEffect(() => setLossWords((n) => t('held.loss', { count: n })), [t]);
  useEffect(() => {
    showing(id, store);
    // A kept edit is shown as it is; only one that never read (or failed to) reads now.
    if (store.view().load !== 'ready') void store.load();
    return () => gone(id, store);
  }, [id, store]);
  const header = { title: t('title'), subtitle: t('subtitle') };
  if (v.load === 'failed') {
    const e = v.loadError;
    if (routeMissing(e)) return <DetailPage header={header} state={{ kind: 'notHere', icon: 'warn', title: t('old.title'), body: t('old.body') }}>{null}</DetailPage>;
    return <DetailPage header={header}><ErrorState title={t('failed')} error={e} onRetry={() => void store.load()} /></DetailPage>;
  }
  if (v.load === 'loading' || !v.base) {
    return (
      <DetailPage header={header}>
        <div aria-busy="true" aria-label={t('loading')}><Skeleton rows={6} /></div>
      </DetailPage>
    );
  }
  return <Shown t={t} v={v} store={store} />;
}

function Shown({ t, v, store }: { t: T; v: EditView; store: EditStore }) {
  const base = v.base!;
  const [reloadAsk, setReloadAsk] = useState(false);
  const [abandonAsk, setAbandonAsk] = useState(false);
  const [leave, setLeave] = useState<{ proceed: () => void; reset: () => void } | null>(null);
  const locked = v.save === 'saving' || v.save === 'unsure' || v.save === 'conflict' || v.reading;
  const dropAsk = () => (v.dirty ? setReloadAsk(true) : void store.reload());
  return (
    <DetailPage
      header={{
        title: t('title'),
        subtitle: t('subtitle'),
        // What is saved, never the draft: the pill says what agents get now.
        meta: <StatusPill tone={base.enabled ? 'ok' : 'neutral'} dot>{t(base.enabled ? 'state.on' : 'state.off')}</StatusPill>,
        actions: <IconButton icon="reload" label={t('refresh')} onPress={dropAsk} isDisabled={locked} />,
      }}
      notice={<Notice t={t} v={v} store={store} onDrop={dropAsk} onAbandon={() => setAbandonAsk(true)} />}
    >
      <LeaveGuard active={v.dirty || v.save === 'unsure'} onBlock={(proceed, reset) => setLeave({ proceed, reset })} />
      {v.save === 'conflict' && v.theirs && <Compare t={t} v={v} />}
      <Form onSubmit={() => void store.save()} busy={v.save === 'saving'} locked={locked}>
        <SettingSwitch
          label={t('switch.label')}
          help={t(`effect.${effectOf(v.draft)}`)}
          isSelected={v.draft.enabled}
          onChange={(on) => store.setEnabled(on)}
          isDisabled={locked}
        />
        <TextField
          label={t('text.label')}
          description={t('effect.running')}
          multiline
          rows={10}
          value={v.draft.text}
          onChange={(text) => store.setText(text)}
          isDisabled={locked}
        />
        <FormFooter
          /* noDetails: every refusal and unknown outcome is a band above the form, in fixed words */
          dirty={v.dirty}
          outcome={v.save === 'saved' ? 'done' : undefined}
          submitLabel={t('save')}
          busyLabel={t('saving')}
          onDiscard={() => store.discard()}
        />
      </Form>
      <ConfirmDialog
        overlayId="ai-instructions-reload"
        isOpen={reloadAsk}
        onOpenChange={setReloadAsk}
        title={t('reload.title')}
        body={t('reload.body')}
        confirmLabel={t('reload.confirm')}
        tone="danger"
        onConfirm={() => { setReloadAsk(false); void store.reload(); }}
      />
      <ConfirmDialog
        overlayId="ai-instructions-abandon"
        isOpen={abandonAsk}
        onOpenChange={setAbandonAsk}
        title={t('abandon.title')}
        body={t('abandon.body')}
        confirmLabel={t('abandon.confirm')}
        tone="danger"
        onConfirm={() => { setAbandonAsk(false); store.abandon(); }}
      />
      <ConfirmDialog
        overlayId="ai-instructions-leave"
        isOpen={leave !== null}
        onOpenChange={(o) => { if (!o && leave) { leave.reset(); setLeave(null); } }}
        title={t('leave.title')}
        body={v.save === 'unsure' ? t('leave.body.unsure') : t('leave.body')}
        confirmLabel={t('leave.leave')}
        cancelLabel={t('leave.stay')}
        tone="danger"
        onConfirm={() => { const l = leave; setLeave(null); l?.proceed(); }}
      />
    </DetailPage>
  );
}

function overriddenText(t: T, f: EditView['refusal']): string {
  const fields = f?.fields;
  if (!fields) return t('overridden.unknown');
  if (fields.length === 2) return t('overridden.both');
  return t(fields[0] === 'text' ? 'overridden.text' : 'overridden.enabled');
}

function refusedText(t: T, r: NonNullable<EditView['refusal']>): string {
  const code = r.code || String(r.status);
  if (r.kind === 'not_sent') return t('refused.unsent', { code });
  return t('refused', { code });
}

function Notice(p: { t: T; v: EditView; store: EditStore; onDrop: () => void; onAbandon: () => void }) {
  const { t, v, onDrop } = p;
  const main = SaveNotice(p);
  if (!v.refreshFailed) return main;
  const f = v.refreshFailed;
  const stale = (
    <Band
      tone="danger"
      size="table"
      /* noDetails: the read failed, said in fixed words with its code; what is shown is the last read */
      actions={<TextButton onPress={onDrop} isDisabled={v.reading || v.save === 'saving' || v.save === 'unsure'}>{t('refreshFailed.retry')}</TextButton>}
    >
      {t('refreshFailed', { code: f.code || String(f.status) })}
    </Band>
  );
  // The bands go straight into the page's notices area, which stacks its notices itself (no wrapper of our own).
  return main ? <>{main}{stale}</> : stale;
}

function SaveNotice({ t, v, store, onDrop, onAbandon }: { t: T; v: EditView; store: EditStore; onDrop: () => void; onAbandon: () => void }) {
  const r = v.refusal;
  if (v.save === 'conflict') {
    return (
      <Band
        tone="warn"
        size="table"
        /* noDetails: the agent refused before writing (revision_conflict); Compare shows the difference */
        actions={(
          <>
            {/* Two actions: Compare until theirs is read (again after a failed read), then Keep mine. */}
            {v.theirs?.phase === 'read'
              ? <TextButton onPress={() => store.keepMine()} isDisabled={v.reading}>{t('conflict.keep')}</TextButton>
              : <TextButton onPress={() => void store.compare()} isDisabled={v.reading}>{t('conflict.compare')}</TextButton>}
            <TextButton onPress={onDrop} isDisabled={v.reading}>{t('conflict.reload')}</TextButton>
          </>
        )}
      >
        {t('conflict')}
      </Band>
    );
  }
  if (v.save === 'overridden') return <Band tone="warn" size="table" /* noDetails: a refusal that wrote nothing, said in fixed words */>{overriddenText(t, r)}</Band>;
  if (v.save === 'refused' && r) return <Band tone="danger" size="table" /* noDetails: a refusal that wrote nothing, said in fixed words with its code */>{refusedText(t, r)}</Band>;
  if (v.save === 'unsure') {
    const seen = v.checked === 'failed' ? t('unsure.failed') : v.checked === 'same' ? t('unsure.same') : v.checked === 'changed' ? t('unsure.changed') : null;
    return (
      <>
        <Band
          tone="warn"
          size="table"
          /* noDetails: an unknown outcome has no error to show; Check what is saved reads them back */
          actions={(
            <>
              <Button size="sm" variant="secondary" onPress={() => void store.check()} isDisabled={v.reading}>{t('unsure.check')}</Button>
              <TextButton onPress={onAbandon} isDisabled={v.reading}>{t('unsure.abandon')}</TextButton>
            </>
          )}
        >
          {t('unsure')}
        </Band>
        {seen !== null ? <Band tone={v.checked === 'failed' ? 'danger' : 'neutral'} size="table" /* noDetails: what the check read, in fixed words */>{seen}</Band> : null}
      </>
    );
  }
  return null;
}

function Compare({ t, v }: { t: T; v: EditView }) {
  const theirs = v.theirs!;
  const diff = useMemo(() => (theirs.phase === 'read' ? diffRows(theirs.i.text, v.draft.text) : null), [theirs, v.draft.text]);
  if (theirs.phase === 'reading') return <Band tone="neutral" size="table" /* noDetails: a read in progress */>{t('conflict.reading')}</Band>;
  if (theirs.phase === 'failed') return <Band tone="danger" size="table" /* noDetails: the read for Compare failed, in fixed words with its code */>{t('conflict.theirsFailed', { code: theirs.code || String(theirs.status) })}</Band>;
  const i = theirs.i;
  const onOff = (b: boolean) => t(b ? 'state.on' : 'state.off');
  const changed = diff !== null && (diff.added > 0 || diff.removed > 0);
  // The whole difference: Keep mine replaces exactly what is compared, so nothing of it is ever left out.
  const rows = diff ? diff.rows : [];
  return (
    <Section title={t('diff.title')}>
      <Facts
        columns={1}
        items={[
          { label: t('diff.switch'), value: i.enabled === v.draft.enabled ? t('diff.switch.same', { state: onOff(i.enabled) }) : t('diff.switch.changed', { theirs: onOff(i.enabled), mine: onOff(v.draft.enabled) }) },
          { label: t('diff.text'), value: changed ? t('diff.text.changed', { added: String(diff!.added), removed: String(diff!.removed) }) : t('diff.text.same') },
        ]}
      />
      {changed && <CodeBlock label={t('diff.rows')} wrap lang="diff" code={rows.map((r) => `${r.t === '=' ? ' ' : r.t} ${r.s}`).join('\n')} />}
    </Section>
  );
}
