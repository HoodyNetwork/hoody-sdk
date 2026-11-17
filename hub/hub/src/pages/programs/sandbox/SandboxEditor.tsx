// The sandbox editor: a drawer with presets and every field of the block. A save sends the WHOLE block (the daemon
// replaces it as a unit), or null to remove it. The Hub's checks mirror the daemon's published rules only; the
// daemon's own 400 text is shown as it said it. Refusals stay in the drawer, where the person fixes them; a save
// that reached the computer (saved, saved but not applied, may have gone through) closes it and the panel shows it.
import type { Target } from '@core';
import {
  Band,
  Button,
  ConfirmDialog,
  Drawer,
  Outcome,
  SettingGroup,
  SettingRow,
  Spinner,
  Stack,
  Verdict,
  useStrings,
  type StringKey,
} from '@kit';
import { useEffect, useMemo, useState } from 'react';
import { canonical, fingerprint, owesInbound, type HostSupport, type SandboxBlock } from './block';
import { save, readFacts, readStatusFresh, type SaveOutcome } from './data';
import {
  applyPreset,
  check,
  formRestricts,
  fromBlock,
  toBlock,
  type Field,
  type Form,
  type Preset,
  type ProgramFacts,
  type Problem,
} from './form';
import { Line } from './Line';
import strings from './strings.en.json';
import { SandboxFields } from './SandboxFields';
import { blockLines } from './words';

type Key = StringKey<typeof strings>;

export interface SentOutcome {
  outcome: SaveOutcome;
  /** Fingerprint of the block this send carried (a status read proves an unclear save by it). */
  sentFp: string;
  /** The block this send carried (Re-apply sends it again, never a cached read). */
  sentBlock: SandboxBlock | null;
  /** Fingerprint of the stored block it replaced: equal to sentFp for a re-apply, whose proof needs more than the
   *  stored block (a status that shows it applied). */
  beforeFp: string;
}

export interface SandboxEditorProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  id: string;
  target: Target;
  /** The stored block the editor starts from (the status read's `configured`). */
  stored: SandboxBlock | null;
  enabled: boolean;
  host: HostSupport | null;
  /** A save is held somewhere (any sender) or unclear: nothing may be sent. */
  blocked: boolean;
  /** The same, read live: checked again after the fresh read, just before the send. */
  blockedNow?: () => boolean;
  /** A save that reached the computer, or may have: the panel takes it over and the drawer closes. */
  onSent: (s: SentOutcome) => void;
}

/** Mount it only while open (the panel does): each opening starts from the block shown at that moment. */
export function SandboxEditor({ isOpen, onOpenChange, name, id, target, stored, enabled, host, blocked, blockedNow, onSent }: SandboxEditorProps) {
  const t = useStrings(strings);
  // The block this opening replaces: the one shown when it opened, moved only by the fresh read before a send
  // (when another change replaced it meanwhile, the person sees the new one and presses Save again).
  const [base, setBase] = useState<SandboxBlock | null>(stored);
  const start = useMemo(() => fromBlock(base), [base]);
  const [form, setForm] = useState<Form>(start.form);
  const [pre, setPre] = useState<{ kind: 'changed'; lines: string } | { kind: 'readFailed' } | null>(null);
  const [facts, setFacts] = useState<ProgramFacts | null | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<SaveOutcome | null>(null);
  const [askRemove, setAskRemove] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // The preset last used, answered beside its Use: on a phone the fields it changed are below the fold. Any field
  // edit afterwards clears it (the form no longer just holds the preset).
  const [used, setUsed] = useState<Preset | null>(null);

  useEffect(() => {
    let live = true;
    void readFacts(id, target).then((f) => live && setFacts(f));
    return () => {
      live = false;
    };
  }, [id, target]);

  const known = facts === 'loading' ? null : facts;
  const problems = useMemo(() => check(form, known), [form, known]);
  const block = toBlock(form);
  const restrictsNow = formRestricts(form);
  // Against the form's own reading of the base (a stored empty list or default value is not a change).
  const dirty = canonical(block) !== canonical(toBlock(start.form));
  const unsupported = start.unsupported;
  const programProblems = problems.filter((x) => x.field === 'program');
  const errOf = (f: Field) => {
    const hit = problems.find((x) => x.field === f);
    return hit && showErrors ? text(t, hit) : undefined;
  };
  const set =
    <K extends keyof Form>(k: K) =>
    (v: Form[K]) => {
      setForm((f) => ({ ...f, [k]: v }));
      setRefusal(null);
      setPre(null);
      setUsed(null);
    };

  const send = async (b: SandboxBlock | null) => {
    if (busy || blocked) return;
    setBusy(true);
    setRefusal(null);
    setPre(null);
    // The daemon replaces the block as a unit and has no compare-and-swap: read the stored block first, and when
    // another change replaced the one this opening started from, show it and send nothing (the next Save goes).
    const got = await readStatusFresh(id, target);
    if (!got || !got.status) {
      setBusy(false);
      setPre({ kind: 'readFailed' });
      return;
    }
    const now = got.status.configured;
    if (fingerprint(now) !== fingerprint(base)) {
      setBusy(false);
      setBase(now);
      setPre({ kind: 'changed', lines: now ? blockLines(t, now).join('; ') : t('sb.configured.none') });
      return;
    }
    // A hold (this program's start, stop, restart or boot, or another sandbox save) that began during the read.
    if (blockedNow?.()) {
      setBusy(false);
      setRefusal({ kind: 'notSent', code: 'BUSY' });
      return;
    }
    const sentFp = fingerprint(b);
    const beforeFp = fingerprint(base);
    const out = await save({ id, block: b, beforeFp, target });
    setBusy(false);
    if (out.kind === 'refused' || out.kind === 'notSent' || out.kind === 'stale') setRefusal(out);
    else onSent({ outcome: out, sentFp, sentBlock: b, beforeFp });
  };
  const onSave = () => {
    setShowErrors(true);
    if (problems.length || unsupported.length) return;
    // A form that restricts nothing would be stored as absent: that is the Remove button's job (its own confirm).
    if (!restrictsNow) return;
    void send(block);
  };

  const canSend = !busy && !blocked && unsupported.length === 0;

  return (
    <Drawer overlayId="programs-sandbox-editor" resizeKey="programs-sandbox-editor"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t('sb.ed.title', { name })}
      subtitle={t('sb.ed.sub')}
      size="lg"
      dirty={dirty}
      busy={busy}
      outcome={refusal ? <RefusalBanner t={t} out={refusal} /> : pre ? <Outcome outcome={pre.kind === 'changed' ? 'stale' : 'not_sent'} title={pre.kind === 'changed' ? t('sb.ed.changed', { lines: pre.lines }) : t('sb.ed.readFailed')} wrap /> : showErrors && problems.length > 0 ? <Outcome outcome="not_sent" title={t('sb.ed.fixFirst')} wrap /> : undefined}
      primary={
        <Button variant="primary" onPress={onSave} isDisabled={!canSend || !dirty || !restrictsNow}>
          {busy ? t('sb.ed.saving') : t('sb.ed.save')}
        </Button>
      }
    >
      <Stack gap={4}>
        {/* What a save does here: the drawer's one plate. */}
        <Verdict label={t('sb.ed.verdict')}>{!restrictsNow ? (base ? t('sb.ed.noopRemove') : t('sb.ed.noop')) : enabled ? t('sb.ed.restart') : t('sb.ed.restartOff')}</Verdict>
        {facts === 'loading' && <Spinner label={t('sb.ed.loading')} />}
        {/* One Band: what stops a save, or what the Hub could not read; its tone is the worst of them. */}
        {(unsupported.length > 0 || programProblems.length > 0 || facts === null) && (
          <Band tone={programProblems.length > 0 ? 'danger' : unsupported.length > 0 ? 'warn' : 'neutral'}>
            <Stack gap={1}>
              {unsupported.length > 0 && <Line>{t('sb.ed.unsupported', { fields: unsupported.join(', ') })}</Line>}
              {programProblems.length > 0 && <Line>{t('sb.ed.programProblems')}</Line>}
              {programProblems.map((x) => (
                <span key={x.code + (x.vars?.name ?? '')} data-sb-program-problem>
                  {text(t, x)}
                </span>
              ))}
              {facts === null && <Line>{t('sb.ed.factsFailed')}</Line>}
            </Stack>
          </Band>
        )}

        <SandboxFields
          form={form}
          known={known}
          used={used}
          busy={busy}
          set={set}
          errOf={errOf}
          onPreset={(pr) => {
            setForm(applyPreset(form, pr, known));
            setRefusal(null);
            setUsed(pr);
          }}
          inboundNote={host?.firewall === 'degraded' && owesInbound(block) ? <Band tone="warn">{t('sb.ed.hostFirewall')}</Band> : undefined}
        />

        {/* Removal is never the accent: it is the last row, in the danger tone, and keeps its confirm. Fields this Hub
            cannot carry never block it (the whole block goes). */}
        {base && (
          <SettingGroup label={t('sb.ed.removeGroup')}>
            <SettingRow
              tone="danger"
              label={t('sb.ed.removeRow')}
              help={t('sb.ed.removeRow.d')}
              actions={
                <Button tone="danger" onPress={() => setAskRemove(true)} isDisabled={busy || blocked}>
                  {t('sb.ed.remove')}
                </Button>
              }
            />
          </SettingGroup>
        )}
        <ConfirmDialog overlayId="programs-sandbox-remove"
          isOpen={askRemove}
          onOpenChange={setAskRemove}
          title={t('sb.ed.removeT', { name })}
          body={<p>{t('sb.ed.removeBody')}</p>}
          confirmLabel={t('sb.ed.removeGo')}
          tone="danger"
          onConfirm={() => {
            setAskRemove(false);
            void send(null);
          }}
        />
      </Stack>
    </Drawer>
  );
}

type T = ReturnType<typeof useStrings<typeof strings>>;

/** A check's words ('sb.err.<code>' with its variables). */
export function text(t: T, p: Problem): string {
  return t(`sb.err.${p.code}` as Key, p.vars);
}

/** A refusal in the drawer footer's Outcome line, the daemon's own words kept. */
function RefusalBanner({ t, out }: { t: T; out: SaveOutcome }) {
  if (out.kind === 'refused') {
    const body = out.tooLarge ? t('sb.out.tooLarge') : out.text ? t('sb.out.refused', { text: out.text }) : t('sb.out.refusedPlain');
    return <Outcome outcome="failed" title={body} wrap />;
  }
  if (out.kind === 'stale') return <Outcome outcome="stale" title={t('sb.out.stale')} wrap />;
  if (out.kind === 'notSent') {
    const held = out.code === 'BUSY' || out.code === 'HELD_BY_OTHER' || out.code === 'READ_BACK_FIRST';
    return <Outcome outcome="not_sent" title={held ? t('sb.out.notSent') : t('sb.out.notSentGeneric')} wrap />;
  }
  return null;
}
