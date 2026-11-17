// Overview > Environment variables: change a computer's variables after it was made. A row with one button
// opens the form; the button is off, with its reason, on an expired computer, for an access key that may not change
// computers, and in a Hub shown inside another page (the routes are framed-sensitive too).
// Saved values are never read into the page (Env.pure.ts): the form lists the names, takes a new value for one
// (masked, SecretInput), removes one, and adds new ones (the kit's EnvRows). Typed values are wiped when the form
// closes, when the place ends (useWipeOn: route, computer, realm, session, page hide), and once they were sent.
// Save sends one change per variable, new values first, removals last, each once (C9). It stops at the first send
// that is refused or whose answer is lost, and then says exactly which names were saved, which were removed, which
// one was refused or is not known, and which were not sent. A lost send is never sent again by the page.
import { alive, capture, isFramed, refusal, useRunner, type Ctx } from '@core';
import {
  AnatomySection, Band, Button, Drawer, EnvRows, ErrorState, FormFooter, HeldBand, IconButton, Notice, SecretInput, SettingGroup, SettingRow, Skeleton, Stack,
  useStrings, useWipeOn, type EnvRow, type SectionState,
} from '@kit';
import { useRef, useState } from 'react';
import { useCaps } from '../data';
import { expiredOf, toggleBlock } from '../features-logic';
import pageStrings from '../strings.en.json';
import type { Computer } from '../types';
import strings from './Env.strings.en.json';
import { ENV_LOCK, envHeldBy, planOf, runSteps, useEnv, useEnvRemove, useEnvSet, type EnvEdit, type EnvReport, type EnvStepVars } from './Env.pure';

const READY: SectionState = { kind: 'ready' };
const noEdits = (): Record<string, EnvEdit> => Object.create(null) as Record<string, EnvEdit>;

export function Environment({ c }: { c: Computer }) {
  const t = useStrings(strings);
  const tp = useStrings(pageStrings);
  const caps = useCaps();
  const [open, setOpen] = useState(false);
  const block = toggleBlock({ expired: expiredOf(c), canWrite: caps === 'all' || caps.has('computers.update'), framed: isFramed() });
  return (
    <AnatomySection id="environment" title={t('env.title')} state={READY}>
      <SettingGroup label={t('env.title')}>
        <SettingRow label={t('env.row')} help={t('env.rowHelp')}>
          <Button size="sm" {...(block ? { isDisabled: true, disabledReason: tp(`feat.why.${block}`) } : {})} onPress={() => setOpen(true)}>
            {t('env.edit')}
          </Button>
        </SettingRow>
      </SettingGroup>
      <EnvDrawer c={c} open={open && block === null} onClose={() => setOpen(false)} />
    </AnatomySection>
  );
}

function EnvDrawer({ c, open, onClose }: { c: Computer; open: boolean; onClose: () => void }) {
  const t = useStrings(strings);
  const tp = useStrings(pageStrings);
  const env = useEnv(c.id, open);
  const varsOf = (i: Record<string, unknown>): EnvStepVars => ({ id: c.id, act: i.act === 'remove' ? 'remove' : 'set', name: String(i.name ?? ''), fresh: i.fresh === true });
  const setM = useEnvSet();
  const set = useRunner(setM, { lock: ENV_LOCK, pick: (i) => i.computer === c.id && i.act === 'set', vars: varsOf, heldBy: (h) => envHeldBy('envSet', h) });
  const del = useRunner(useEnvRemove(), { lock: ENV_LOCK, pick: (i) => i.computer === c.id && i.act === 'remove', vars: varsOf, heldBy: (h) => envHeldBy('envRemove', h) });

  // Keyed by variable name, which may be constructor, toString or __proto__: a map with no prototype, read by own key.
  const [edits, setEdits] = useState<Record<string, EnvEdit>>(noEdits);
  const [rows, setRows] = useState<EnvRow[]>([]);
  const [report, setReport] = useState<EnvReport | null>(null);
  const [running, setRunning] = useState(false);
  const nextRow = useRef(1);
  // Every typed value leaves the page: the form's own state, and the copy core keeps with a send until it is reset.
  const wipe = () => {
    setEdits(noEdits());
    setRows([]);
    setM.reset();
  };
  useWipeOn(wipe, c.id);
  const close = () => {
    wipe();
    setReport(null);
    set.reset();
    del.reset();
    onClose();
  };

  const names = env.data?.names ?? [];
  const plan = planOf(names, edits, rows);
  const waiting = set.held ?? del.held;
  const waitingRunner = set.held ? set : del;
  const edit = (name: string, e: EnvEdit | null) =>
    setEdits((all) => {
      const next = Object.assign(noEdits(), all);
      if (e) next[name] = e;
      else delete next[name];
      return next;
    });
  const problem = plan.problem
    ? plan.problem.code === 'listed'
      ? t('env.err.listed', { name: plan.problem.name })
      : plan.problem.name
        ? t('env.err.at', { name: plan.problem.name, why: tp(`create.error.${plan.problem.code}` as 'create.error.envKeyShape') })
        : tp(`create.error.${plan.problem.code}` as 'create.error.envTooMany')
    : undefined;

  async function save() {
    const steps = plan.steps;
    if (!steps.length || plan.problem || waiting || running || !env.data) return;
    // The place this Save starts in: every send goes out only while it is still the same session and realm.
    let ctx: Ctx;
    try {
      ctx = capture();
    } catch {
      return;
    }
    setRunning(true);
    setReport(null);
    const { saved, removed, stop, notSent } = await runSteps(steps, (st) => (st.act === 'set' ? set.run({ id: c.id, ...st }) : del.run({ id: c.id, ...st })), () => alive(ctx));
    // What was sent leaves the form (a value is never kept after its send, a lost one included); what was refused or
    // not sent stays, so the person can change it and save again.
    const gone = new Set([...saved, ...removed, ...(stop?.kind === 'unknown' ? [stop.name] : [])]);
    setEdits((all) => {
      const next = noEdits();
      for (const [k, v] of Object.entries(all)) if (!gone.has(k)) next[k] = v;
      return next;
    });
    setRows((all) => all.filter((x) => !gone.has(x.key)));
    setM.reset();
    setReport({ saved, removed, stop, notSent });
    setRunning(false);
  }

  const last = report?.stop ? (report.stop.act === 'set' ? set : del) : report ? (report.removed.length ? del : set) : null;
  const failed = last ? refusal(last.outcome) : undefined;
  const ownWords = report?.stop?.kind === 'refused' ? (report.stop.code === 'COMPUTER_EXPIRED' ? t('env.why.expired') : last?.outcome?.facts?.status === 403 ? t('env.why.lostServer') : undefined) : undefined;
  const waitName = typeof waiting?.name === 'string' ? waiting.name : '';
  return (
    <Drawer overlayId="computers-env" resizeKey="computers-env"
      isOpen={open}
      onOpenChange={(o) => !o && close()}
      title={t('env.drawer', { name: c.name })}
      subtitle={t('env.lede')}
      size="md"
      dirty={(plan.steps.length > 0 || rows.length > 0 || Object.keys(edits).length > 0) && !waiting}
      busy={running}
      footer={
        <FormFooter
          dirty={plan.steps.length > 0 && !waiting}
          submitDisabled={waiting !== null || plan.problem !== null || !env.data}
          busy={running}
          outcome={waiting || !last ? undefined : last.outcome}
          {...(ownWords ? { failedDetail: ownWords } : {})}
          error={failed}
          onCheck={async () => { await waitingRunner.check(); }}
          submitLabel={t('env.save')}
          onSubmit={() => void save()}
        />
      }
    >
      <Stack gap={3}>
        {report && (report.saved.length > 0 || report.removed.length > 0 || report.stop?.kind === 'refused' || report.notSent.length > 0) ? (
          <Band tone={report.stop ? 'warn' : 'neutral'} /* noDetails: what the last Save did, name by name; a refusal's details are in the footer */>
            {report.saved.length > 0 ? t('env.rep.saved', { names: report.saved.join(', ') }) : null}{' '}
            {report.removed.length > 0 ? t('env.rep.removed', { names: report.removed.join(', ') }) : null}{' '}
            {report.stop?.kind === 'refused' ? t('env.rep.refused', { name: report.stop.name }) : null}{' '}
            {report.notSent.length > 0 ? t('env.rep.notSent', { names: report.notSent.join(', ') }) : null}
          </Band>
        ) : null}
        {waiting ? (
          <HeldBand
            overlayId="computers-env-held-stop"
            text={t(waiting.act === 'remove' ? 'env.wait.remove' : waiting.fresh === true ? 'env.wait.new' : 'env.wait.set', { name: waitName })}
            readOnly={waitingRunner.elsewhere !== null}
            onCheck={waitingRunner.check}
            /* The runner's own dismiss (core useRunner with a lock and vars): frees only the send this band shows. */
            onDismiss={waitingRunner.dismiss}
          />
        ) : env.isPending ? (
          <Skeleton rows={3} variant="text" />
        ) : env.isError || !env.data ? (
          <ErrorState size="compact" title={t('env.readFailed', { name: c.name })} error={env.error} onRetry={() => void env.refetch()} retrying={env.isFetching} />
        ) : (
          <>
            {env.data.syncing ? <Notice>{t('env.syncing')}</Notice> : null}
            {names.length === 0 ? (
              <Notice>{t('env.none')}</Notice>
            ) : (
              <SettingGroup label={t('env.listed')}>
                {names.map((name) => {
                  const e = Object.hasOwn(edits, name) ? edits[name] : undefined;
                  return (
                    <SettingRow key={name} label={name} {...(e?.kind === 'remove' ? { help: t('env.willRemove') } : {})}>
                      {e?.kind === 'replace' ? (
                        <SecretInput aria-label={t('env.newValue', { name })} value={e.value} onChange={(v) => edit(name, { kind: 'replace', value: v })} placeholder={t('env.newValueHint')} isDisabled={running} />
                      ) : null}
                      {e ? (
                        <Button size="sm" variant="ghost" isDisabled={running} onPress={() => edit(name, null)}>
                          {t('env.keep')}
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" isDisabled={running} onPress={() => edit(name, { kind: 'replace', value: '' })}>
                            {t('env.replace')}
                          </Button>
                          <IconButton icon="trash" size="sm" variant="ghost" label={t('env.remove', { name })} isDisabled={running} onPress={() => edit(name, { kind: 'remove' })} />
                        </>
                      )}
                    </SettingRow>
                  );
                })}
              </SettingGroup>
            )}
            <EnvRows
              rows={rows}
              onEdit={(id, p) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...p } : r)))}
              onRemove={(id) => setRows((all) => all.filter((r) => r.id !== id))}
              onAdd={() => setRows((all) => [...all, { id: nextRow.current++, key: '', value: '' }])}
              isDisabled={running}
              label={t('env.add.title')}
              description={t('env.add.help')}
              labels={{
                key: (n) => t('env.add.key', { n }),
                value: (n) => t('env.add.value', { n }),
                remove: (n) => t('env.add.remove', { n }),
                keyHint: t('env.add.keyHint'),
                valueHint: t('env.add.valueHint'),
                add: t('env.add.more'),
              }}
              errorMessage={problem}
            />
          </>
        )}
      </Stack>
    </Drawer>
  );
}
