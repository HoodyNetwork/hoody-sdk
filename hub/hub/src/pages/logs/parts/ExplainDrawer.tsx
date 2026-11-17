// Explain: the drawer that shows exactly what the AI helper will read, the model and its cost, and
// the answer. One Ask sends one request; an outcome of "no answer came back" stays until the
// person asks again (C9: never resent for them).
//
// The model choice is the kit ModelChooser over this drawer's own useModelCatalogue read
// of the computer: purpose explain (an output cap, no ensembles, no Claude Code), the flow's rules (its rows as
// fallback specs), the price line as facts, no endpoint and no trip to the AI page; setup happens inline. The
// evidence goes to the flow on every change; Ask carries the snapshot this render shows and is judged on exactly that,
// so the final action never judges an older snapshot than the one the chooser shows (Use it anyway syncs it first too).
import { Button, Disclosure, Drawer, ModelChooser, OutcomeBanner, Prose, SettingGroup, SettingRow, Spinner, TextButton, Verdict, useModelCatalogue, type CatalogueReads, type ModelChooserProps } from '@kit';
import type { ComputerRow, Ctx, Target } from '@core';
import { modelOptions } from '../pickers';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ExplainFlow, ExplainOut } from '../explain-flow';
import s from './Logs.module.css';
import type { T } from './words';

const OUT_KEY: Record<string, string> = {
  busy: 'explain.out.busy', declined: 'explain.out.declined', empty: 'explain.out.empty', lost: 'explain.out.lost', notSent: 'explain.out.notSent',
  old: 'explain.out.old', refused: 'explain.out.refused',
};

const READY_KEY: Record<string, string> = { unknown: 'explain.model.unknown', needs_key: 'explain.model.needsKey', gone: 'explain.model.gone' };
const OFFER = { endpoint: false, claude: false } as const;
/** The refusals at Ask that open the chooser: focus moves into it, to the way out. */
const OPENS_PICKER = new Set(['ineligible', 'gone', 'needs_setup', 'scope']);
const FOCUSABLE = 'input:not([disabled]), button:not([disabled]), [tabindex="0"]';

export interface ExplainDrawerProps {
  t: T;
  flow: ExplainFlow | null;
  onClose: () => void;
  /** The computer Explain reads from (the chooser's reads and setup go there); null = none. */
  target?: Target | null;
  computer?: { id: string; name: string; row: ComputerRow } | null;
  /** Test and fixture seams: the catalogue reads, the setup step's provider calls, navigation. */
  seams?: { reads?: (target: Target, ctx: Ctx) => CatalogueReads; api?: ModelChooserProps['api']; go?: ModelChooserProps['go'] };
}

export function ExplainDrawer({ t, flow, onClose, target = null, computer = null, seams }: ExplainDrawerProps) {
  const v = useSyncExternalStore((fn) => (flow ? flow.subscribe(fn) : () => {}), () => (flow ? flow.get() : null), () => null);
  const open = !!flow && !!v && !v.closed;
  const wanted = useMemo(() => [v?.pick, v?.defaultSpec].filter((x): x is string => !!x), [v?.pick, v?.defaultSpec]);
  // One read per open drawer: no computer read while it is closed.
  const cat = useModelCatalogue(open ? target : null, { wanted, ...(seams?.reads ? { reads: seams.reads } : {}) });
  useEffect(() => {
    if (flow) flow.setEvidence(cat.evidence, cat.scope);
  }, [flow, cat.evidence, cat.scope]);
  const pickerRef = useRef<HTMLDivElement>(null);
  const refusal = v?.out?.kind === 'judge' && v.picker && OPENS_PICKER.has(v.out.why) ? v.out : null;
  useEffect(() => {
    if (refusal) pickerRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [refusal]);
  if (!flow || !v) return null;
  const modelName = v.label || modelOptions(v.rows, (n) => t('explain.model.unnamed', { n })).find((o) => o.value === v.pick)?.label || t('explain.model.noName');
  const where = computer?.name || v.name || t('explain.judge.thisComputer');
  const facts = (spec: string): string | null => {
    const c = flow.costOf(spec);
    return t(('explain.' + c[0]) as never, c[1]);
  };
  const out = v.out;
  const footer = (
    <>
      {v.asked && <span className={s.footNote}>{t('explain.againNote')}</span>}
      <Button variant="secondary" onPress={onClose}>{t('explain.close')}</Button>
      <Button variant={v.asked ? 'secondary' : 'primary'} busy={v.busy} isDisabled={!v.pick || v.loading || v.busy} disabledReason={v.loading ? t('explain.model.loading') : t('explain.model.none')} onPress={() => flow.ask({ ev: cat.evidence, scope: cat.scope })}>{v.asked ? t('explain.again') : t('explain.ask')}</Button>
    </>
  );
  const cost = v.cost ? t(('explain.' + v.cost[0]) as never, v.cost[1]) : '';
  const answer = out?.kind === 'answer' ? out : null;
  // What the AI helper reads, exactly, and the instructions sent with it.
  const payload = (
    <>
      <div>
        <label className={s.sectionTitle} htmlFor="logs-explain-text">{t('explain.exactly')}</label>
        <textarea id="logs-explain-text" className={s.exact} readOnly spellCheck={false} rows={10} value={v.text} />
        <p className={s.one}>{t('explain.scrubbed')}{v.fewer ? ' ' + t(v.fewer.output ? 'explain.fewer.output' : 'explain.fewer.entries', { n: String(v.fewer.shown), total: String(v.fewer.total) }) : ''}</p>
      </div>
      <Disclosure title={t('explain.instructions')}>
        <textarea className={s.exact} readOnly spellCheck={false} rows={4} value={v.system} aria-label={t('explain.instructions')} />
      </Disclosure>
    </>
  );
  return (
    <Drawer resizeKey="logs-explain-drawer" isOpen={!v.closed} onOpenChange={(o) => { if (!o) onClose(); }} title={t('explain.title')} subtitle={v.name ? t('explain.on', { name: v.name }) : undefined} size="md" footer={footer}>
      <div className={s.drawer}>
        {/* Once an answer is in, it is the verdict at the top, and what was read folds away
            under it; before that, what will be read stays open: it is the consent view. */}
        {/* One polite region, mounted from the start, so the answer and its cut note are announced when they arrive. */}
        <div aria-live="polite" data-explain-answer="">{answer && <AnswerVerdict t={t} out={answer} />}</div>
        {answer ? (
          <Disclosure title={t('explain.read')}>
            {payload}
          </Disclosure>
        ) : (
          payload
        )}
        <SettingGroup>
          <SettingRow
            label={t('explain.model')}
            {...(cost ? { help: cost } : {})}
            actions={<TextButton onPress={() => flow.togglePicker()} aria-expanded={v.picker}>{t('explain.model.change')}</TextButton>}
          >
            <span data-explain-model="">
              {v.loading ? t('explain.model.loading') : v.pick ? <b>{modelName}</b> : t('explain.model.none')}
              {v.pick && v.ready && v.ready !== 'ready' ? <span className={s.muted}>{' · ' + t((READY_KEY[v.ready] || 'explain.model.unknown') as never)}</span> : null}
            </span>
          </SettingRow>
        </SettingGroup>
        <div>
          {v.picker && (
            <div ref={pickerRef}>
            <ModelChooser
              id="logs-explain-mc"
              label={t('explain.pick.label')}
              catalogue={target ? cat : null}
              computer={computer}
              value={v.pick ?? ''}
              choice={v.choice}
              onChoose={(c) => flow.choose(c)}
              rules={v.rules}
              purpose="explain"
              {...(v.defaultSpec ? { defaultSpec: v.defaultSpec } : {})}
              fallback={v.rows}
              facts={facts}
              offer={OFFER}
              leave={null}
              isDisabled={v.busy}
              {...(seams?.api ? { api: seams.api } : {})}
              {...(seams?.go ? { go: seams.go } : {})}
            />
            </div>
          )}
          {v.note && <OutcomeBanner kind="stale" title={t(v.note === 'unlisted' ? 'explain.unlisted' : 'explain.model.failed')} body={null} />}
        </div>
        <Result t={t} out={out} model={modelName} where={where} onConsent={() => { flow.setEvidence(cat.evidence, cat.scope); flow.consent(); }} />
      </div>
    </Drawer>
  );
}

/** Why Ask sent nothing (the judgement at Ask), in the drawer's words. */
function judged(t: T, why: Extract<ExplainOut, { kind: 'judge' }>['why'], model: string, where: string): string {
  if (why === 'ineligible') return t('explain.choose');
  if (why === 'needs_consent') return t('explain.judge.consent', { model, computer: where });
  if (why === 'needs_setup') return t('explain.judge.setup', { model });
  if (why === 'gone') return t('explain.judge.gone', { model, computer: where });
  return t(why === 'scope' ? 'explain.judge.scope' : 'explain.judge.unread');
}

function Result({ t, out, model, where, onConsent }: { t: T; out: ExplainOut | null; model: string; where: string; onConsent: () => void }) {
  if (!out) return null;
  if (out.kind === 'judge') {
    return (
      <div>
        <OutcomeBanner kind="not_sent" body={judged(t, out.why, model, where)} /* noDetails: the Hub judged the pick and sent nothing, so no request failed */ />
        {out.why === 'needs_consent' && <Button variant="secondary" onPress={onConsent}>{t('explain.judge.useAnyway')}</Button>}
      </div>
    );
  }
  if (out.kind === 'asking') return <Spinner label={t('explain.asking')} />;
  // The answer is the drawer's verdict, drawn at the top (AnswerVerdict).
  if (out.kind === 'answer') return null;
  if (out.kind === 'choose') return <OutcomeBanner kind="failed" body={t('explain.choose')} />;
  const text = t((OUT_KEY[out.kind] || 'explain.out.lost') as never);
  return <OutcomeBanner kind={out.kind === 'lost' ? 'pending' : out.kind === 'notSent' ? 'not_sent' : 'failed'} title={out.kind === 'lost' ? text : undefined} body={out.kind === 'lost' ? null : text} />;
}

/** The answer at the top of the drawer: the verdict plate, then the answer and a cut note. It names no model: the
 *  pick can change after the answer is in (a deferred list refresh), and the answer is not re-labelled by it. */
function AnswerVerdict({ t, out }: { t: T; out: Extract<ExplainOut, { kind: 'answer' }> }) {
  return (
    <div className={s.answer}>
      <Verdict label={t('explain.answer.label')}>{t('explain.answer.done')}</Verdict>
      {/* The model's text is Markdown, drawn by the kit renderer the Agent's replies use (bold, lists, code, web links only;
          never markup). It arrives whole, so nothing is drawn half-written. */}
      <Prose text={out.text} />
      {out.cut && <p className={s.one}>{t('explain.cut')}</p>}
    </div>
  );
}
